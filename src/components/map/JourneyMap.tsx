"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Milestone } from "@/types/database";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

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
  const [isLoaded, setIsLoaded] = useState(false);
  const [mode, setMode] = useState<"interactive" | "static">(() => {
    // Mobile-first failsafe: default to static on small screens.
    // Users can opt into the interactive WebGL map.
    if (typeof window !== "undefined" && window.innerWidth < 768) return "static";
    return "interactive";
  });
  const [interactiveError, setInteractiveError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");

  const center = useMemo(() => {
    return initialCenter || calculateCenter(milestones);
  }, [initialCenter, milestones]);

  const googleMapsUrl = useMemo(() => {
    // If we have a route, open directions between first and last milestone.
    if (milestones.length >= 2) {
      const origin = `${milestones[0]!.lat},${milestones[0]!.lng}`;
      const destination = `${milestones[milestones.length - 1]!.lat},${milestones[milestones.length - 1]!.lng}`;
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    }
    // Otherwise, open the center point.
    const destination = `${center[1]},${center[0]}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
  }, [center, milestones]);

  const staticMapUrl = useMemo(() => {
    if (!MAPBOX_TOKEN) return null;

    // Keep overlays minimal (URL length + reliability).
    // Show start/end pins if possible; otherwise show center pin.
    const overlays: string[] = [];
    if (milestones.length >= 2) {
      const start = milestones[0]!;
      const end = milestones[milestones.length - 1]!;
      overlays.push(`pin-s-a+FF9933(${start.lng},${start.lat})`);
      overlays.push(`pin-s-b+138808(${end.lng},${end.lat})`);
    } else if (milestones.length === 1) {
      const only = milestones[0]!;
      overlays.push(`pin-s+FF9933(${only.lng},${only.lat})`);
    } else {
      overlays.push(`pin-s+FF9933(${center[0]},${center[1]})`);
    }

    const overlayPart = overlays.join(",");
    const [lng, lat] = center;

    // 640 is a safe default; @2x makes it crisp on mobile.
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlayPart}/${lng},${lat},${Math.max(
      initialZoom,
      3
    )},0/640x640@2x?access_token=${MAPBOX_TOKEN}`;
  }, [center, initialZoom, milestones]);

  useEffect(() => {
    if (mode !== "interactive") return;
    if (!mapContainer.current || map.current) return;

    // If token is missing, immediately fall back to the static map.
    if (!MAPBOX_TOKEN) {
      setInteractiveError("Mangler NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
      setMode("static");
      return;
    }

    // Debug: Check container dimensions
    const container = mapContainer.current;
    let ro: ResizeObserver | null = null;
    let cancelled = false;

    // Detect mobile device
    const isMobile = window.innerWidth < 768;
    console.log('[JourneyMap] isMobile:', isMobile);

    const initInteractiveMap = () => {
      if (cancelled || !mapContainer.current || map.current) return;

      const rect = mapContainer.current.getBoundingClientRect();
      const debugMessage = `Container: ${Math.round(rect.width)}x${Math.round(
        rect.height
      )}, Token: ${MAPBOX_TOKEN ? "present" : "missing"}`;
      setDebugInfo(debugMessage);
      console.log("[JourneyMap] Init:", debugMessage);

      // Failsafe: on mobile the layout can report 0 height briefly. Wait for a real size.
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          // Standard Mapbox style is generally most reliable on mobile.
          style: "mapbox://styles/mapbox/light-v11",
          center: center as [number, number],
          zoom: isMobile ? Math.max(initialZoom - 1, 3) : initialZoom,
          attributionControl: false,
          // Mobile optimizations
          dragRotate: false,
          touchZoomRotate: true,
          touchPitch: false,
          // Performance/reliability
          preserveDrawingBuffer: false,
          antialias: false,
          fadeDuration: 0,
        });

        // Handle map errors
        map.current.on("error", (e) => {
          console.error("[JourneyMap] Map error:", e.error);
          setInteractiveError(`Map error: ${e.error?.message || "Unknown error"}`);
          // If WebGL fails (common on some phones), fall back to static.
          setMode("static");
        });

        // Add controls - compact on mobile
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

        map.current.on("load", () => {
          console.log("[JourneyMap] Map loaded successfully");
          setIsLoaded(true);
          setInteractiveError(null);
        });
      } catch (error) {
        console.error("[JourneyMap] Failed to initialize map:", error);
        setInteractiveError(
          `Failed to initialize: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        setMode("static");
      }
    };

    // Try immediately, then observe size changes until we can initialize.
    initInteractiveMap();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        initInteractiveMap();
        // After init, keep resizing responsive.
        map.current?.resize();
      });
      ro.observe(container);
    } else {
      // Fallback for older browsers.
      const onResize = () => {
        initInteractiveMap();
        map.current?.resize();
      };
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      };
    }

    return () => {
      cancelled = true;
      ro?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, [center, initialZoom, mode]);

  // Add route line and markers when loaded
  useEffect(() => {
    if (!isLoaded || !map.current) return;

    const mapInstance = map.current;

    // Add route line source
    if (milestones.length > 1) {
      const routeCoords = milestones.map((m) => [m.lng, m.lat]);

      if (!mapInstance.getSource("route")) {
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
      }
    }

    // Detect mobile for larger touch targets
    const isMobileDevice = window.innerWidth < 768;
    const markerSize = isMobileDevice ? 'w-10 h-10 text-base' : 'w-8 h-8 text-sm';
    const postMarkerSize = isMobileDevice ? 'w-8 h-8 text-base' : 'w-6 h-6 text-sm';

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

      el.addEventListener("click", () => {
        onMilestoneClick?.(milestone);
      });
    });

    // Add post markers
    const postsToRender = isMobileDevice ? posts.slice(0, 100) : posts;
    postsToRender.forEach((post) => {
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

      new mapboxgl.Marker(el)
        .setLngLat([post.lng, post.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      el.addEventListener("click", () => {
        onPostClick?.(post);
      });
    });
  }, [isLoaded, milestones, posts, onMilestoneClick, onPostClick]);

  const StaticFallback = (
    <div className="absolute inset-0 rounded-xl overflow-hidden bg-muted">
      {staticMapUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={staticMapUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            Kortet kan ikke vises (mangler Mapbox token).
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-white/95 px-3 py-2 text-sm font-medium text-foreground shadow hover:bg-white"
          >
            Åbn i Google Maps
          </a>

          <button
            type="button"
            onClick={() => {
              setInteractiveError(null);
              setIsLoaded(false);
              setMode("interactive");
            }}
            className="inline-flex items-center justify-center rounded-md bg-white/20 px-3 py-2 text-sm font-medium text-white shadow hover:bg-white/30"
          >
            Prøv interaktivt kort
          </button>
        </div>

        {interactiveError && (
          <p className="mt-2 text-[11px] text-white/90">
            Interaktivt kort fejlede: {interactiveError}
          </p>
        )}
      </div>
    </div>
  );

  // Failsafe: always show a usable map on mobile (static + open in Maps).
  if (mode === "static") {
    return StaticFallback;
  }

  // If interactive errored, fall back to static but keep the retry affordance.
  if (interactiveError) {
    return StaticFallback;
  }

  // Still initializing (or waiting for non-zero size)
  if (mode === "interactive" && !mapContainer.current && !isLoaded) {
    return (
      <div className="absolute inset-0 rounded-xl overflow-hidden bg-muted flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground text-xs text-center">Indlæser kort…</p>
        {debugInfo && <p className="text-muted-foreground/70 text-[11px] mt-2">{debugInfo}</p>}
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

