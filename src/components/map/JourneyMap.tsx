"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import type { Milestone } from "@/types/database";
import { findMilestoneForDate } from "@/lib/journey";
import {
  createPostMarkerHTML,
  injectPostMarkerStyles,
  type MapPost,
} from "./PostMarker";

interface JourneyMapProps {
  milestones: Milestone[];
  posts: MapPost[];
  onMilestoneClick?: (milestone: Milestone, milestonePosts: MapPost[]) => void;
  onPostClick?: (post: MapPost) => void;
  onError?: () => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  // POI focus props - when provided, map will zoom to this location
  focusLat?: number;
  focusLng?: number;
  focusZoom?: number; // defaults to 14 (neighborhood level)
  // Active milestone for carousel integration
  activeMilestone?: Milestone | null;
  // Highlight a specific post on the map
  highlightPostId?: string | null;
}

// Re-export MapPost type for consumers
export type { MapPost };

// Zoom level at which post markers become visible
const POST_VISIBILITY_ZOOM = 9;

/**
 * Find all posts that belong to a specific milestone based on their date
 * Posts marked as "before_journey" or "after_journey" are NOT included
 */
function getPostsForMilestone(
  milestone: Milestone,
  posts: MapPost[],
  milestones: Milestone[]
): MapPost[] {
  return posts.filter((post) => {
    // Must have coordinates
    if (!post.lat || !post.lng) return false;

    // Use captured_at if available, otherwise created_at (same logic as journey.ts)
    const postDate = post.captured_at || post.created_at;
    const result = findMilestoneForDate(postDate, milestones);
    
    // Only include posts that are assigned to THIS milestone
    // Posts that are "before_journey" or "after_journey" are excluded
    if (!result || result.type !== "milestone" || result.milestone.id !== milestone.id) {
      return false;
    }

    return true;
  });
}

export function JourneyMap({
  milestones,
  posts,
  onMilestoneClick,
  onPostClick,
  onError,
  initialCenter,
  initialZoom = 5,
  focusLat,
  focusLng,
  focusZoom = 14, // Default to neighborhood level
  activeMilestone,
  highlightPostId,
}: JourneyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const milestoneMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const postMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const initAttempted = useRef(false);
  // Track which milestone is currently active and whether we're zoomed in or out
  const activeMilestoneRef = useRef<string | null>(null);
  const isZoomedInRef = useRef(false);

  // Cleanup function to remove all markers
  const cleanupMarkers = useCallback(() => {
    milestoneMarkersRef.current.forEach((marker) => marker.remove());
    milestoneMarkersRef.current = [];
    postMarkersRef.current.forEach((marker) => marker.remove());
    postMarkersRef.current = [];
  }, []);

  // Update post marker visibility based on zoom level
  const updatePostVisibility = useCallback((zoom: number) => {
    const shouldShow = zoom >= POST_VISIBILITY_ZOOM;
    postMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = shouldShow ? "block" : "none";
    });
  }, []);

  // Zoom to stage extent when a milestone is clicked (with toggle behavior)
  const zoomToMilestoneStage = useCallback(
    (milestone: Milestone) => {
      const mapInstance = map.current;
      if (!mapInstance) return;

      // Find the index of this milestone in the sorted list
      const sortedMilestones = [...milestones].sort(
        (a, b) => a.display_order - b.display_order
      );
      const milestoneIndex = sortedMilestones.findIndex((m) => m.id === milestone.id);

      // Calculate padding based on container size
      const container = mapInstance.getContainer();
      const paddingPercent = 0.15;
      const horizontalPadding = Math.round(container.clientWidth * paddingPercent);
      const verticalPadding = Math.round(container.clientHeight * paddingPercent);

      // Helper: Create bounds centered on milestone that includes all points
      // This ensures milestone stays in the center of the view
      const createCenteredBounds = (
        center: [number, number],
        otherPoints: [number, number][]
      ): mapboxgl.LngLatBounds => {
        // Find the maximum distance from center to any point
        let maxLngDiff = 0;
        let maxLatDiff = 0;
        
        otherPoints.forEach(([lng, lat]) => {
          maxLngDiff = Math.max(maxLngDiff, Math.abs(lng - center[0]));
          maxLatDiff = Math.max(maxLatDiff, Math.abs(lat - center[1]));
        });
        
        // Create symmetric bounds around center
        // Add a small buffer (10%) to ensure points aren't at the edge
        const buffer = 1.1;
        const bounds = new mapboxgl.LngLatBounds(
          [center[0] - maxLngDiff * buffer, center[1] - maxLatDiff * buffer],
          [center[0] + maxLngDiff * buffer, center[1] + maxLatDiff * buffer]
        );
        
        return bounds;
      };

      // Check if we're clicking the same milestone - toggle between zoomed in/out
      const isSameMilestone = activeMilestoneRef.current === milestone.id;
      
      if (isSameMilestone && isZoomedInRef.current) {
        // Currently zoomed in on this milestone - zoom out to show neighbors (±1)
        // Collect neighbor points (not including current milestone)
        const neighborPoints: [number, number][] = [];
        
        // Add previous milestone if it exists
        if (milestoneIndex > 0) {
          const prevMilestone = sortedMilestones[milestoneIndex - 1];
          neighborPoints.push([prevMilestone.lng, prevMilestone.lat]);
        }
        
        // Add next milestone if it exists
        if (milestoneIndex < sortedMilestones.length - 1) {
          const nextMilestone = sortedMilestones[milestoneIndex + 1];
          neighborPoints.push([nextMilestone.lng, nextMilestone.lat]);
        }

        if (neighborPoints.length === 0) {
          // Only one milestone exists - just zoom out a bit
          mapInstance.flyTo({
            center: [milestone.lng, milestone.lat],
            zoom: 8,
            duration: 800,
          });
        } else {
          // Create bounds centered on current milestone that includes neighbors
          const bounds = createCenteredBounds(
            [milestone.lng, milestone.lat],
            neighborPoints
          );
          
          mapInstance.fitBounds(bounds, {
            padding: {
              top: verticalPadding,
              bottom: verticalPadding,
              left: horizontalPadding,
              right: horizontalPadding,
            },
            maxZoom: 10,
            duration: 800,
          });
        }

        // Mark as zoomed out (but still on this milestone)
        isZoomedInRef.current = false;
      } else {
        // Either clicking a new milestone, or clicking same milestone when zoomed out
        // In both cases: zoom in to this milestone's posts
        const stagePosts = getPostsForMilestone(milestone, posts, milestones);

        // Collect post coordinates (not including milestone itself)
        const postPoints: [number, number][] = [];
        stagePosts.forEach((post) => {
          if (post.lat && post.lng) {
            postPoints.push([post.lng, post.lat]);
          }
        });

        if (postPoints.length === 0) {
          // Only milestone, no posts with coordinates
          mapInstance.flyTo({
            center: [milestone.lng, milestone.lat],
            zoom: POST_VISIBILITY_ZOOM + 1, // Zoom to level where posts would be visible
            duration: 800,
          });
        } else {
          // Create bounds centered on milestone that includes all posts
          const bounds = createCenteredBounds(
            [milestone.lng, milestone.lat],
            postPoints
          );
          
          mapInstance.fitBounds(bounds, {
            padding: {
              top: verticalPadding,
              bottom: verticalPadding,
              left: horizontalPadding,
              right: horizontalPadding,
            },
            // Ensure we zoom in enough to see posts (minZoom)
            // but not too close (maxZoom)
            minZoom: POST_VISIBILITY_ZOOM,
            maxZoom: 14,
            duration: 800,
          });
        }

        // Mark this milestone as active and zoomed in
        activeMilestoneRef.current = milestone.id;
        isZoomedInRef.current = true;
      }

      // After zoom completes, ensure posts are visible
      mapInstance.once("moveend", () => {
        const zoom = mapInstance.getZoom();
        updatePostVisibility(zoom);
      });
    },
    [posts, milestones, updatePostVisibility]
  );

  // Track previous focus coordinates to detect changes
  const prevFocusRef = useRef<{ lat?: number; lng?: number; zoom?: number }>({});

  // Handle dynamic focus changes (fly to new location when focus changes)
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !isLoaded) return;

    const hasFocusPoint = focusLat !== undefined && focusLng !== undefined && !isNaN(focusLat) && !isNaN(focusLng);
    if (!hasFocusPoint) return;

    // Check if focus actually changed
    const focusChanged = 
      prevFocusRef.current.lat !== focusLat || 
      prevFocusRef.current.lng !== focusLng;

    if (focusChanged) {
      // Fly to new focus point
      mapInstance.flyTo({
        center: [focusLng, focusLat],
        zoom: focusZoom,
        duration: 800,
        essential: true,
      });

      // Update post visibility after move - carousel handles post display now
      mapInstance.once("moveend", () => {
        updatePostVisibility(mapInstance.getZoom());
      });

      // Update previous focus ref
      prevFocusRef.current = { lat: focusLat, lng: focusLng, zoom: focusZoom };
    }
  }, [focusLat, focusLng, focusZoom, isLoaded, updatePostVisibility]);

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

      // If we have focus coordinates, start directly at that location for instant display
      const hasFocusPoint = focusLat !== undefined && focusLng !== undefined && !isNaN(focusLat) && !isNaN(focusLng);
      
      // Calculate center - prioritize focus point for immediate display
      const center: [number, number] = hasFocusPoint 
        ? [focusLng, focusLat]
        : (initialCenter || calculateCenter(milestones));
      
      // Use focus zoom when available, otherwise default
      const zoom = hasFocusPoint ? focusZoom : initialZoom;

      // Detect mobile device
      const isMobile = window.innerWidth < 768;

      try {
        const mapInstance = new mapboxgl.Map({
          container: container,
          style: "mapbox://styles/mapbox/streets-v12",
          center: center,
          zoom: isMobile ? Math.max(zoom - 1, 3) : zoom,
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
          // Initialize prevFocusRef with initial focus to prevent duplicate fly on mount
          if (focusLat !== undefined && focusLng !== undefined) {
            prevFocusRef.current = { lat: focusLat, lng: focusLng, zoom: focusZoom };
          }
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
  }, [initialCenter, initialZoom, milestones, onError, cleanupMarkers, focusLat, focusLng, focusZoom]);

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

    // Check if we should focus on a specific POI (affects initial post visibility)
    const hasFocusPoint = focusLat !== undefined && focusLng !== undefined && !isNaN(focusLat) && !isNaN(focusLng);
    const currentZoom = mapInstance.getZoom();
    const shouldShowPosts = hasFocusPoint || currentZoom >= POST_VISIBILITY_ZOOM;

    // Inject global styles for post markers (hover effects, popup styling)
    injectPostMarkerStyles();

    // Add post markers FIRST (so they appear BELOW milestone markers in the layer order)
    // Now using thumbnail-based markers for a rich, visual experience
    posts.forEach((post) => {
      if (!post.lat || !post.lng) return;

      const el = document.createElement("div");
      el.className = "post-marker";
      el.style.cursor = "pointer";
      // Initially hide posts if zoom is below threshold (unless we're focusing on a POI)
      el.style.display = shouldShowPosts ? "block" : "none";
      
      // Use the new thumbnail-based marker HTML
      el.innerHTML = createPostMarkerHTML(post, isMobileDevice);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([post.lng, post.lat])
        .addTo(mapInstance);

      // Store post id on marker element for highlighting
      el.dataset.postId = post.id;
      postMarkersRef.current.push(marker);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        // Call onPostClick instead of showing popup - carousel handles display
        onPostClick?.(post);
      });
    });

    // Add milestone markers AFTER posts (so they appear ON TOP in the layer order)
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

      milestoneMarkersRef.current.push(marker);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        // Zoom to stage extent with posts
        zoomToMilestoneStage(milestone);
        // Get posts for this milestone and trigger callback
        const milestonePosts = getPostsForMilestone(milestone, posts, milestones);
        onMilestoneClick?.(milestone, milestonePosts);
      });
    });

    // Add zoom listener to toggle post visibility
    const handleZoom = () => {
      const zoom = mapInstance.getZoom();
      updatePostVisibility(zoom);
    };
    mapInstance.on("zoom", handleZoom);

    // Handle POI focus or fit bounds
    if (hasFocusPoint) {
      // Map already starts at focus point (set during initialization)
      // Carousel handles the post display now, no popup needed
    } else if (milestones.length > 0) {
      // Fit bounds to show all milestones (not posts, to avoid zooming out too far
      // when there are posts in distant locations like Denmark "dag 0" posts)
      const bounds = new mapboxgl.LngLatBounds();
      milestones.forEach((m) => bounds.extend([m.lng, m.lat]));
      // Note: Posts are intentionally excluded from bounds calculation
      // so the map focuses on the main journey route in India

      // Calculate 20% padding based on container size for consistent margin
      const container = mapInstance.getContainer();
      const paddingPercent = 0.20;
      const horizontalPadding = Math.round(container.clientWidth * paddingPercent);
      const verticalPadding = Math.round(container.clientHeight * paddingPercent);

      mapInstance.fitBounds(bounds, {
        padding: {
          top: verticalPadding,
          bottom: verticalPadding,
          left: horizontalPadding,
          right: horizontalPadding,
        },
        maxZoom: 10,
        duration: 0,
      });
    }

    // Cleanup zoom listener on unmount
    return () => {
      mapInstance.off("zoom", handleZoom);
    };
  }, [isLoaded, milestones, posts, onMilestoneClick, onPostClick, cleanupMarkers, updatePostVisibility, zoomToMilestoneStage, focusLat, focusLng, focusZoom]);

  // Handle highlighting of active post in carousel
  useEffect(() => {
    if (!isLoaded) return;

    // Reset all markers to normal state
    postMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.zIndex = "";
      el.style.transform = "";
      el.classList.remove("post-marker-highlighted");
    });

    // Highlight the active post
    if (highlightPostId) {
      const activeMarker = postMarkersRef.current.find((marker) => {
        const el = marker.getElement();
        return el.dataset.postId === highlightPostId;
      });

      if (activeMarker) {
        const el = activeMarker.getElement();
        el.style.zIndex = "100";
        el.classList.add("post-marker-highlighted");
      }
    }
  }, [highlightPostId, isLoaded]);

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

