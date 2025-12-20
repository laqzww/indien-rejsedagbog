"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Milestone } from "@/types/database";

// Simplified post type for map
interface MapPost {
  id: string;
  body: string;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  media: { storage_path: string }[];
}

interface JourneyMapProps {
  milestones: Milestone[];
  posts: MapPost[];
  onMilestoneClick?: (milestone: Milestone) => void;
  onPostClick?: (post: MapPost) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
}

export function JourneyMap({
  milestones,
  posts,
  onMilestoneClick,
  onPostClick,
  initialCenter,
  initialZoom = 5,
}: JourneyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const didFitBoundsRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [useStaticFallback, setUseStaticFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setMapError(
        "Mapbox token mangler. Sæt NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN på Render og redeploy."
      );
      return;
    }

    // Set access token at runtime (so we can show a friendly error if missing)
    mapboxgl.accessToken = token;

    // Mapbox GL JS (v3) kræver WebGL2. Hvis browseren ikke understøtter det,
    // viser vi et statisk kort i stedet for et “tomt”/sort kort.
    if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: true })) {
      setUseStaticFallback(true);
      setFallbackReason(
        "Din browser understøtter ikke interaktive kort (WebGL). Vi viser en statisk forhåndsvisning i stedet."
      );
      return;
    }

    // Debug: Check container dimensions (give layout a few frames to settle)
    const container = mapContainer.current;
    const tryInit = (attempt: number) => {
      const rect = container.getBoundingClientRect();
      const debugMessage = `Container: ${Math.round(rect.width)}x${Math.round(rect.height)}, Token: ${mapboxgl.accessToken ? "present" : "missing"}`;
      setDebugInfo(debugMessage);

      // If container has no dimensions yet, wait a bit (common during initial mobile layout)
      if (rect.width === 0 || rect.height === 0) {
        if (attempt >= 20) {
          setMapError(`Container har ingen størrelse: ${rect.width}x${rect.height}`);
          return;
        }
        requestAnimationFrame(() => tryInit(attempt + 1));
        return;
      }
      initMap();
    };

    // Calculate center from milestones if not provided
    const center = initialCenter || calculateCenter(milestones);

    // Detect mobile device
    const isMobile = window.innerWidth < 768;

    const initMap = () => {
      try {
        map.current = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          center: center as [number, number],
          zoom: isMobile ? Math.max(initialZoom - 1, 3) : initialZoom,
          attributionControl: false,
          // Mobile optimizations
          dragRotate: false,
          touchZoomRotate: true,
          touchPitch: false,
          antialias: false,
          fadeDuration: 0,
        });

        // Handle map errors (if we get a WebGL/worker failure, fall back)
        map.current.on("error", (e) => {
          const msg = e.error?.message || "Unknown error";
          // Some devices will “support” WebGL, but still fail to create a context.
          if (/webgl|context|worker/i.test(msg)) {
            setUseStaticFallback(true);
            setFallbackReason(
              "Det interaktive kort kunne ikke starte på denne enhed. Vi viser en statisk forhåndsvisning i stedet."
            );
          } else {
            setMapError(`Map error: ${msg}`);
          }
        });

        // Add navigation controls - compact on mobile
        map.current.addControl(
          new mapboxgl.NavigationControl({ showCompass: !isMobile }),
          "top-right"
        );
        map.current.addControl(
          new mapboxgl.AttributionControl({ compact: true }),
          "bottom-right"
        );

        if (isMobile) {
          map.current.touchZoomRotate.disableRotation();
        }

        // Keep map sized correctly when mobile viewport changes (address bar / rotation)
        resizeObserverRef.current = new ResizeObserver(() => {
          map.current?.resize();
        });
        resizeObserverRef.current.observe(container);

        map.current.on("load", () => {
          setIsLoaded(true);
          setMapError(null);
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (/webgl|context|worker/i.test(msg)) {
          setUseStaticFallback(true);
          setFallbackReason(
            "Det interaktive kort kunne ikke starte på denne enhed. Vi viser en statisk forhåndsvisning i stedet."
          );
          return;
        }
        setMapError(`Failed to initialize: ${msg}`);
      }
    };

    tryInit(0);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      map.current?.remove();
      map.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [initialCenter, initialZoom, milestones]);

  // Add route line and markers when loaded
  useEffect(() => {
    if (!isLoaded || !map.current) return;

    const mapInstance = map.current;

    // Add route line source
    if (milestones.length > 1) {
      const routeCoords = milestones.map((m) => [m.lng, m.lat]);

      const existing = mapInstance.getSource("route") as mapboxgl.GeoJSONSource | undefined;
      if (!existing) {
        mapInstance.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: routeCoords,
            },
          },
        });

        mapInstance.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#FF9933",
            "line-width": 3,
            "line-dasharray": [2, 2],
          },
        });
      } else {
        existing.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: routeCoords,
          },
        });
      }
    }

    // Detect mobile for larger touch targets
    const isMobileDevice = window.innerWidth < 768;
    const markerSize = isMobileDevice ? 'w-10 h-10 text-base' : 'w-8 h-8 text-sm';
    const postMarkerSize = isMobileDevice ? 'w-8 h-8 text-base' : 'w-6 h-6 text-sm';

    // Clear previous markers (prevents duplicates when data changes)
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Add milestone markers
    milestones.forEach((milestone, index) => {
      const el = document.createElement("div");
      el.className = "milestone-marker";
      el.innerHTML = `
        <div class="${markerSize} rounded-full bg-saffron text-white flex items-center justify-center font-bold shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform">
          ${index + 1}
        </div>
      `;

      const popup = new mapboxgl.Popup({
        offset: 25,
        closeButton: false,
      }).setHTML(`
        <div class="p-2">
          <p class="font-bold text-navy">${milestone.name}</p>
          ${milestone.description ? `<p class="text-sm text-gray-600 mt-1">${milestone.description}</p>` : ""}
          ${milestone.arrival_date ? `<p class="text-xs text-gray-500 mt-1">📅 ${formatDateShort(milestone.arrival_date)}</p>` : ""}
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([milestone.lng, milestone.lat])
        .setPopup(popup)
        .addTo(mapInstance);
      markersRef.current.push(marker);

      el.addEventListener("click", () => {
        onMilestoneClick?.(milestone);
      });
    });

    // Add post markers
    posts.forEach((post) => {
      if (!post.lat || !post.lng) return;

      const el = document.createElement("div");
      el.className = "post-marker";
      el.innerHTML = `
        <div class="${postMarkerSize} rounded-full bg-india-green text-white flex items-center justify-center shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform">
          📍
        </div>
      `;

      const popup = new mapboxgl.Popup({
        offset: 20,
        closeButton: false,
      }).setHTML(`
        <div class="p-2 max-w-[200px]">
          <p class="text-sm line-clamp-2">${post.body.slice(0, 80)}...</p>
          ${post.location_name ? `<p class="text-xs text-gray-500 mt-1">📍 ${post.location_name}</p>` : ""}
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([post.lng, post.lat])
        .setPopup(popup)
        .addTo(mapInstance);
      markersRef.current.push(marker);

      el.addEventListener("click", () => {
        onPostClick?.(post);
      });
    });

    // Fit bounds once (when not explicitly centered via query param)
    if (!didFitBoundsRef.current && !initialCenter) {
      const bounds = new mapboxgl.LngLatBounds();
      milestones.forEach((m) => bounds.extend([m.lng, m.lat]));
      posts.forEach((p) => {
        if (p.lat && p.lng) bounds.extend([p.lng, p.lat]);
      });

      if (!bounds.isEmpty()) {
        didFitBoundsRef.current = true;
        mapInstance.fitBounds(bounds, {
          padding: isMobileDevice
            ? { top: 80, right: 24, bottom: 120, left: 24 }
            : { top: 60, right: 60, bottom: 60, left: 60 },
          maxZoom: 10,
          duration: 0,
        });
      }
    }
  }, [isLoaded, milestones, posts, onMilestoneClick, onPostClick]);

  // Static fallback for devices/browsers where Mapbox GL can't run (common on older phones)
  if (useStaticFallback) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    const url = token ? buildStaticJourneyMapUrl({ milestones, posts, token }) : null;
    const center = initialCenter || calculateCenter(milestones);
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${center[1]},${center[0]}`
    )}`;

    return (
      <div className="absolute inset-0 rounded-xl overflow-hidden bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Kort over rejseruten"
            className="w-full h-full object-cover"
            loading="eager"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">
              Kortet kan ikke indlæses (mangler Mapbox token).
            </p>
          </div>
        )}

        <div className="absolute top-3 left-3 right-3 bg-white/95 backdrop-blur rounded-lg shadow p-3">
          <p className="text-sm font-medium text-navy">Kortet vises som forhåndsvisning</p>
          {fallbackReason && (
            <p className="text-xs text-muted-foreground mt-1">{fallbackReason}</p>
          )}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex mt-2 text-sm font-medium text-saffron hover:underline"
          >
            Åbn i Google Maps
          </a>
        </div>
      </div>
    );
  }

  // Show error state if map failed to initialize
  if (mapError) {
    return (
      <div className="absolute inset-0 rounded-xl overflow-hidden bg-red-50 flex flex-col items-center justify-center p-4">
        <p className="text-red-600 text-sm font-medium mb-2">Kortet kunne ikke indlæses</p>
        <p className="text-red-500 text-xs text-center">{mapError}</p>
        <p className="text-gray-500 text-xs mt-2">{debugInfo}</p>
      </div>
    );
  }

  return (
    <div ref={mapContainer} className="absolute inset-0 rounded-xl overflow-hidden" />
  );
}

function calculateCenter(milestones: Milestone[]): [number, number] {
  if (milestones.length === 0) {
    return [78.9629, 20.5937]; // Center of India
  }

  const sumLat = milestones.reduce((sum, m) => sum + m.lat, 0);
  const sumLng = milestones.reduce((sum, m) => sum + m.lng, 0);

  return [sumLng / milestones.length, sumLat / milestones.length];
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
  });
}

function buildStaticJourneyMapUrl({
  milestones,
  posts,
  token,
}: {
  milestones: Milestone[];
  posts: MapPost[];
  token: string;
}): string {
  // Keep URL length reasonable (static maps have practical limits).
  const maxMilestones = 18;
  const maxPosts = 12;

  const milestonePins = milestones.slice(0, maxMilestones).map((m) => {
    return `pin-s+FF9933(${m.lng},${m.lat})`;
  });

  const postPins = posts
    .filter((p) => p.lat && p.lng)
    .slice(0, maxPosts)
    .map((p) => `pin-s+138808(${p.lng},${p.lat})`);

  const overlays = [...milestonePins, ...postPins].join(",");
  // Use "auto" to fit overlays.
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlays}/auto/900x900@2x?access_token=${token}`;
}

