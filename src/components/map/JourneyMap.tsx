"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Milestone, Post } from "@/types/database";

// Set access token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!;

interface JourneyMapProps {
  milestones: Milestone[];
  posts: (Post & { media: { storage_path: string }[] })[];
  onMilestoneClick?: (milestone: Milestone) => void;
  onPostClick?: (post: Post) => void;
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

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Calculate center from milestones if not provided
    const center = initialCenter || calculateCenter(milestones);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        name: "India Journey",
        sources: {
          "carto-light": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
          },
        },
        layers: [
          {
            id: "carto-light-layer",
            type: "raster",
            source: "carto-light",
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: center as [number, number],
      zoom: initialZoom,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.current.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    map.current.on("load", () => {
      setIsLoaded(true);
    });

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

    // Add milestone markers
    milestones.forEach((milestone, index) => {
      const el = document.createElement("div");
      el.className = "milestone-marker";
      el.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-saffron text-white flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform">
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
        <div class="w-6 h-6 rounded-full bg-india-green text-white flex items-center justify-center shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform">
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

  return (
    <div ref={mapContainer} className="w-full h-full rounded-xl overflow-hidden" />
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

