"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Milestone } from "@/types/database";

// Set access token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!;

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
  const [mapError, setMapError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Debug: Check container dimensions
    const container = mapContainer.current;
    const rect = container.getBoundingClientRect();
    const debugMessage = `Container: ${rect.width}x${rect.height}, Token: ${mapboxgl.accessToken ? 'present' : 'missing'}`;
    setDebugInfo(debugMessage);
    console.log('[JourneyMap] Init:', debugMessage);

    // If container has no dimensions, this is likely the issue
    if (rect.width === 0 || rect.height === 0) {
      setMapError(`Container has no dimensions: ${rect.width}x${rect.height}`);
      console.error('[JourneyMap] Container has no dimensions!');
      return;
    }

    // Calculate center from milestones if not provided
    const center = initialCenter || calculateCenter(milestones);

    // Detect mobile device
    const isMobile = window.innerWidth < 768;
    console.log('[JourneyMap] isMobile:', isMobile);

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        // Use standard Mapbox style instead of custom CARTO tiles
        // This is more reliable on mobile devices
        style: "mapbox://styles/mapbox/light-v11",
        center: center as [number, number],
        zoom: isMobile ? Math.max(initialZoom - 1, 3) : initialZoom,
        attributionControl: false,
        // Mobile optimizations
        dragRotate: false, // Disable rotation on mobile for simpler UX
        touchZoomRotate: true, // Enable pinch-to-zoom
        touchPitch: false, // Disable pitch changes on mobile
        // Prevent WebGL context loss on mobile
        preserveDrawingBuffer: true,
        antialias: false, // Disable antialiasing for better performance on mobile
        fadeDuration: 0, // Disable fade animations for better performance
      });

      // Handle map errors
      map.current.on("error", (e) => {
        console.error("[JourneyMap] Map error:", e.error);
        setMapError(`Map error: ${e.error?.message || 'Unknown error'}`);
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

      // Enable cooperative gestures on mobile to prevent accidental panning
      if (isMobile) {
        map.current.touchZoomRotate.disableRotation();
      }

      map.current.on("load", () => {
        console.log('[JourneyMap] Map loaded successfully');
        setIsLoaded(true);
        setMapError(null);
      });

    } catch (error) {
      console.error('[JourneyMap] Failed to initialize map:', error);
      setMapError(`Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [initialCenter, initialZoom, milestones]);

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

      new mapboxgl.Marker(el)
        .setLngLat([post.lng, post.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      el.addEventListener("click", () => {
        onPostClick?.(post);
      });
    });
  }, [isLoaded, milestones, posts, onMilestoneClick, onPostClick]);

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

