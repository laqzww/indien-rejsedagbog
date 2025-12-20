"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  onError?: () => void;
  initialCenter?: [number, number];
  initialZoom?: number;
}

export function JourneyMap({
  milestones,
  posts,
  onMilestoneClick,
  onPostClick,
  onError,
  initialCenter,
  initialZoom = 5,
}: JourneyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const initAttempted = useRef(false);

  // Cleanup function to remove all markers
  const cleanupMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  }, []);

  // Initialize map
  useEffect(() => {
    // Prevent double initialization
    if (initAttempted.current) return;
    initAttempted.current = true;

    const container = mapContainer.current;
    if (!container) {
      console.error("[JourneyMap] No container ref");
      return;
    }

    // Check for Mapbox token
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.error("[JourneyMap] Missing Mapbox access token");
      setMapError("Mapbox access token mangler");
      onError?.();
      return;
    }

    // Set access token
    mapboxgl.accessToken = token;

    // Wait for container to have dimensions
    const initMap = () => {
      const rect = container.getBoundingClientRect();
      console.log("[JourneyMap] Container dimensions:", rect.width, "x", rect.height);

      if (rect.width === 0 || rect.height === 0) {
        console.warn("[JourneyMap] Container has no dimensions, retrying...");
        return false;
      }

      // Calculate center from milestones if not provided
      const center = initialCenter || calculateCenter(milestones);

      // Detect mobile device
      const isMobile = window.innerWidth < 768;

      try {
        const mapInstance = new mapboxgl.Map({
          container: container,
          style: "mapbox://styles/mapbox/streets-v12",
          center: center,
          zoom: isMobile ? Math.max(initialZoom - 1, 3) : initialZoom,
          attributionControl: false,
          // Mobile optimizations
          dragRotate: false,
          touchZoomRotate: true,
          touchPitch: false,
          // Performance settings
          antialias: false,
          fadeDuration: 0,
          // Don't fail silently
          failIfMajorPerformanceCaveat: false,
        });

        map.current = mapInstance;

        // Handle errors
        mapInstance.on("error", (e) => {
          console.error("[JourneyMap] Map error:", e);
          const errorMsg = e.error?.message || "Unknown error";
          setMapError(errorMsg);
          onError?.();
        });

        // Add controls
        mapInstance.addControl(
          new mapboxgl.NavigationControl({ showCompass: false }),
          "top-right"
        );
        mapInstance.addControl(
          new mapboxgl.AttributionControl({ compact: true }),
          "bottom-right"
        );

        // Disable rotation on mobile
        if (isMobile) {
          mapInstance.touchZoomRotate.disableRotation();
        }

        // Map loaded successfully
        mapInstance.on("load", () => {
          console.log("[JourneyMap] Map loaded successfully");
          setIsLoaded(true);
          setMapError(null);
        });

        return true;
      } catch (error) {
        console.error("[JourneyMap] Failed to initialize map:", error);
        setMapError(error instanceof Error ? error.message : "Failed to initialize map");
        onError?.();
        return true; // Don't retry on exception
      }
    };

    // Try to initialize immediately
    if (!initMap()) {
      // If container has no dimensions, wait and retry
      const retryTimeouts = [50, 100, 200, 500, 1000];
      let retryIndex = 0;

      const retry = () => {
        if (retryIndex >= retryTimeouts.length || map.current) return;
        
        setTimeout(() => {
          if (!map.current && initMap()) {
            return;
          }
          retryIndex++;
          retry();
        }, retryTimeouts[retryIndex]);
      };

      retry();
    }

    return () => {
      cleanupMarkers();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initialCenter, initialZoom, milestones, onError, cleanupMarkers]);

  // Add route line and markers when loaded
  useEffect(() => {
    if (!isLoaded || !map.current) return;

    const mapInstance = map.current;

    // Clean up existing markers first
    cleanupMarkers();

    // Add route line source
    if (milestones.length > 1) {
      const routeCoords = milestones.map((m) => [m.lng, m.lat]);

      // Remove existing source/layer if present
      if (mapInstance.getLayer("route-line")) {
        mapInstance.removeLayer("route-line");
      }
      if (mapInstance.getSource("route")) {
        mapInstance.removeSource("route");
      }

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

    // Detect mobile for larger touch targets
    const isMobileDevice = window.innerWidth < 768;
    const markerSize = isMobileDevice ? "w-10 h-10 text-base" : "w-8 h-8 text-sm";
    const postMarkerSize = isMobileDevice ? "w-8 h-8 text-base" : "w-6 h-6 text-sm";

    // Add milestone markers
    milestones.forEach((milestone, index) => {
      const el = document.createElement("div");
      el.className = "milestone-marker";
      el.style.cursor = "pointer";
      el.innerHTML = `
        <div class="${markerSize} rounded-full bg-saffron text-white flex items-center justify-center font-bold shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform" style="background-color: #FF9933;">
          ${index + 1}
        </div>
      `;

      const popup = new mapboxgl.Popup({
        offset: 25,
        closeButton: true,
        closeOnClick: true,
      }).setHTML(`
        <div class="p-2">
          <p class="font-bold" style="color: #000080;">${milestone.name}</p>
          ${milestone.description ? `<p class="text-sm text-gray-600 mt-1">${milestone.description}</p>` : ""}
          ${milestone.arrival_date ? `<p class="text-xs text-gray-500 mt-1">📅 ${formatDateShort(milestone.arrival_date)}</p>` : ""}
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([milestone.lng, milestone.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      markersRef.current.push(marker);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onMilestoneClick?.(milestone);
      });
    });

    // Add post markers
    posts.forEach((post) => {
      if (!post.lat || !post.lng) return;

      const el = document.createElement("div");
      el.className = "post-marker";
      el.style.cursor = "pointer";
      el.innerHTML = `
        <div class="${postMarkerSize} rounded-full bg-india-green text-white flex items-center justify-center shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform" style="background-color: #138808;">
          📍
        </div>
      `;

      const popup = new mapboxgl.Popup({
        offset: 20,
        closeButton: true,
        closeOnClick: true,
      }).setHTML(`
        <div class="p-2 max-w-[200px]">
          <p class="text-sm">${post.body.slice(0, 80)}${post.body.length > 80 ? "..." : ""}</p>
          ${post.location_name ? `<p class="text-xs text-gray-500 mt-1">📍 ${post.location_name}</p>` : ""}
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([post.lng, post.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      markersRef.current.push(marker);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onPostClick?.(post);
      });
    });

    // Fit bounds to show all markers if we have milestones
    if (milestones.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      milestones.forEach((m) => bounds.extend([m.lng, m.lat]));
      posts.forEach((p) => {
        if (p.lat && p.lng) bounds.extend([p.lng, p.lat]);
      });

      mapInstance.fitBounds(bounds, {
        padding: { top: 50, bottom: 100, left: 50, right: 50 },
        maxZoom: 10,
        duration: 0,
      });
    }
  }, [isLoaded, milestones, posts, onMilestoneClick, onPostClick, cleanupMarkers]);

  // Don't render error here - parent handles it via onError callback
  // This allows for a cleaner retry mechanism

  return (
    <div
      ref={mapContainer}
      className="w-full h-full"
      style={{ minHeight: "300px" }}
    />
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

