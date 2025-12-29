"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import type { Milestone } from "@/types/database";
import { findMilestoneForDate } from "@/lib/journey";
import { declutterMilestoneMarkers } from "@/lib/map-declutter";
import {
  createPostMarkerHTML,
  injectPostMarkerStyles,
  type MapPost,
} from "./PostMarker";

// Available map styles
export type MapStyle = "streets" | "satellite";

const MAP_STYLES: Record<MapStyle, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

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
  // Bottom offset for extent calculations (e.g., carousel height)
  // This ensures the "useful" visible area is above overlaying UI elements
  extentBottomOffset?: number;
  // Map style (streets or satellite)
  mapStyle?: MapStyle;
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
  extentBottomOffset = 0,
  mapStyle = "streets",
}: JourneyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const milestoneMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const postMarkersRef = useRef<mapboxgl.Marker[]>([]);
  // Track milestone IDs and original coordinates for decluttering
  const milestoneIdsRef = useRef<string[]>([]);
  const milestoneOriginalLngLatsRef = useRef<[number, number][]>([]);
  const declutterCleanupRef = useRef<(() => void) | null>(null);
  const declutterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // Track which milestone is currently active and whether we're zoomed in or out
  const activeMilestoneRef = useRef<string | null>(null);
  const isZoomedInRef = useRef(false);

  // Cleanup function to remove all markers
  const cleanupMarkers = useCallback(() => {
    // Clean up declutter timeout
    if (declutterTimeoutRef.current) {
      clearTimeout(declutterTimeoutRef.current);
      declutterTimeoutRef.current = null;
    }
    // Clean up declutter state
    if (declutterCleanupRef.current) {
      declutterCleanupRef.current();
      declutterCleanupRef.current = null;
    }
    milestoneMarkersRef.current.forEach((marker) => marker.remove());
    milestoneMarkersRef.current = [];
    milestoneIdsRef.current = [];
    milestoneOriginalLngLatsRef.current = [];
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

  // Run decluttering on milestone markers to prevent overlap
  // Uses pixel-based overlap detection - only applies offsets when markers actually overlap
  const updateMilestoneDecluttering = useCallback((immediate = false) => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    
    // Clear any pending declutter
    if (declutterTimeoutRef.current) {
      clearTimeout(declutterTimeoutRef.current);
      declutterTimeoutRef.current = null;
    }
    
    const runDeclutter = () => {
      const currentMap = map.current;
      if (!currentMap) return;
      
      const markers = milestoneMarkersRef.current;
      const milestoneIds = milestoneIdsRef.current;
      const originalLngLats = milestoneOriginalLngLatsRef.current;
      
      // Ensure we have matching data
      if (markers.length === 0 || markers.length !== milestoneIds.length || markers.length !== originalLngLats.length) {
        return;
      }
      
      // Clean up previous declutter state
      if (declutterCleanupRef.current) {
        declutterCleanupRef.current();
      }
      
      // Run decluttering - the algorithm will check for actual pixel overlaps
      // and only apply offsets when markers are within minDistance of each other
      // If no overlaps are detected, all offsets are reset to [0, 0]
      declutterCleanupRef.current = declutterMilestoneMarkers(
        currentMap,
        markers,
        milestoneIds,
        originalLngLats,
        {
          minDistance: 45, // Minimum 45px between marker centers
          maxOffset: 50,   // Max 50px offset from original position
          iterations: 20,  // More iterations for better settling
          forceStrength: 0.4,
        }
      );
    };
    
    if (immediate) {
      runDeclutter();
    } else {
      // Debounce to avoid running during fly animations
      // Wait 150ms after movement settles
      declutterTimeoutRef.current = setTimeout(runDeclutter, 150);
    }
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
      // Bottom padding includes any overlaying UI (e.g., carousel) to ensure
      // the useful visible area is above these elements
      const container = mapInstance.getContainer();
      const paddingPercent = 0.15;
      const horizontalPadding = Math.round(container.clientWidth * paddingPercent);
      const baseVerticalPadding = Math.round(container.clientHeight * paddingPercent);
      // Top padding stays the same, bottom padding adds the offset for overlaying UI
      const topPadding = baseVerticalPadding;
      const bottomPadding = baseVerticalPadding + extentBottomOffset;

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
              top: topPadding,
              bottom: bottomPadding,
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
              top: topPadding,
              bottom: bottomPadding,
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
    [posts, milestones, updatePostVisibility, extentBottomOffset]
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

  // Initialize map - runs once on mount
  useEffect(() => {
    // Already initialized
    if (map.current) return;

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

    // Track if component is still mounted
    let isMounted = true;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const initMap = () => {
      // Don't initialize if unmounted or already initialized
      if (!isMounted || map.current) return true;

      const rect = container.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
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
          style: MAP_STYLES[mapStyle],
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
          if (isMounted) {
            setMapError(errorMsg);
            onError?.();
          }
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
          if (!isMounted) return;
          
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
        if (isMounted) {
          setMapError(error instanceof Error ? error.message : "Failed to initialize map");
          onError?.();
        }
        return true; // Don't retry on exception
      }
    };

    // Use requestAnimationFrame to ensure container has dimensions
    const startInit = () => {
      if (!isMounted) return;
      
      if (!initMap()) {
        // If container has no dimensions, retry with requestAnimationFrame
        const retryWithRAF = (attempts: number) => {
          if (!isMounted || map.current || attempts <= 0) return;
          
          retryTimeoutId = setTimeout(() => {
            if (!isMounted || map.current) return;
            
            if (!initMap()) {
              requestAnimationFrame(() => retryWithRAF(attempts - 1));
            }
          }, 50);
        };
        
        requestAnimationFrame(() => retryWithRAF(10));
      }
    };

    // Start initialization on next frame to ensure DOM is ready
    requestAnimationFrame(startInit);

    return () => {
      isMounted = false;
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
      cleanupMarkers();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setIsLoaded(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  // Handle map style changes
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !isLoaded) return;

    const newStyle = MAP_STYLES[mapStyle];
    const currentStyle = mapInstance.getStyle();
    
    // Only change if style is different (compare by checking if current matches expected)
    if (currentStyle?.sprite?.toString().includes(mapStyle)) return;
    
    // Store current center and zoom to restore after style change
    const center = mapInstance.getCenter();
    const zoom = mapInstance.getZoom();
    
    mapInstance.setStyle(newStyle);
    
    // Restore view after style loads
    mapInstance.once("style.load", () => {
      mapInstance.setCenter(center);
      mapInstance.setZoom(zoom);
    });
  }, [mapStyle, isLoaded]);

  // Handle container resize
  useEffect(() => {
    const mapInstance = map.current;
    const container = mapContainer.current;
    if (!mapInstance || !container) return;

    // Use ResizeObserver for reliable container size detection
    const resizeObserver = new ResizeObserver(() => {
      if (map.current) {
        map.current.resize();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isLoaded]);

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
    // Using traditional pin markers with deep red color
    posts.forEach((post) => {
      if (!post.lat || !post.lng) return;

      const el = document.createElement("div");
      el.className = "post-marker";
      // Initially hide posts if zoom is below threshold (unless we're focusing on a POI)
      el.style.display = shouldShowPosts ? "block" : "none";
      
      // Use the traditional pin marker HTML
      el.innerHTML = createPostMarkerHTML(post, isMobileDevice);

      // IMPORTANT: Set anchor to "bottom" so the pin tip points exactly at the location
      // This prevents the marker from shifting position during interactions
      const marker = new mapboxgl.Marker({ 
        element: el,
        anchor: "bottom"  // Pin tip anchored to coordinates
      })
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
    // Sort milestones by display_order for consistent numbering
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.display_order - b.display_order
    );
    
    // Reset tracking arrays for decluttering
    milestoneIdsRef.current = [];
    milestoneOriginalLngLatsRef.current = [];
    
    sortedMilestones.forEach((milestone) => {
      // Milestone number is display_order + 1 (display_order is 0-indexed in DB)
      const milestoneNumber = milestone.display_order + 1;
      const el = document.createElement("div");
      el.className = "milestone-marker";
      el.style.cursor = "pointer";
      el.innerHTML = `
        <div class="${markerSize} rounded-full bg-saffron text-white flex items-center justify-center font-bold shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform" style="background-color: #FF9933;">
          ${milestoneNumber}
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
      // Track ID and original coordinates for decluttering
      milestoneIdsRef.current.push(milestone.id);
      milestoneOriginalLngLatsRef.current.push([milestone.lng, milestone.lat]);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        // Zoom to stage extent with posts
        zoomToMilestoneStage(milestone);
        // Get posts for this milestone and trigger callback
        const milestonePosts = getPostsForMilestone(milestone, posts, milestones);
        onMilestoneClick?.(milestone, milestonePosts);
      });
    });

    // Add zoom listener to toggle post visibility and update decluttering
    const handleZoom = () => {
      const zoom = mapInstance.getZoom();
      updatePostVisibility(zoom);
    };
    mapInstance.on("zoom", handleZoom);
    
    // Add zoomend/moveend listener for decluttering (update after zoom/pan settles)
    // Uses debouncing internally to avoid running during fly animations
    const handleMoveEnd = () => {
      updateMilestoneDecluttering(false); // debounced
    };
    mapInstance.on("zoomend", handleMoveEnd);
    mapInstance.on("moveend", handleMoveEnd);
    
    // Initial decluttering after markers are added (immediate, no debounce)
    // Use requestAnimationFrame to ensure markers are rendered
    requestAnimationFrame(() => {
      updateMilestoneDecluttering(true); // immediate
    });

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

      // Calculate 5% padding based on container size for consistent margin
      // Reduced from 20% since carousel is now the primary navigation method
      // Bottom padding includes any overlaying UI (e.g., carousel) to ensure
      // the useful visible area is above these elements
      const container = mapInstance.getContainer();
      const paddingPercent = 0.05;
      const horizontalPadding = Math.round(container.clientWidth * paddingPercent);
      const baseVerticalPadding = Math.round(container.clientHeight * paddingPercent);
      const topPadding = baseVerticalPadding;
      const bottomPadding = baseVerticalPadding + extentBottomOffset;

      mapInstance.fitBounds(bounds, {
        padding: {
          top: topPadding,
          bottom: bottomPadding,
          left: horizontalPadding,
          right: horizontalPadding,
        },
        maxZoom: 10,
        duration: 0,
      });
    }

    // Cleanup event listeners on unmount
    return () => {
      mapInstance.off("zoom", handleZoom);
      mapInstance.off("zoomend", handleMoveEnd);
      mapInstance.off("moveend", handleMoveEnd);
    };
  }, [isLoaded, milestones, posts, onMilestoneClick, onPostClick, cleanupMarkers, updatePostVisibility, updateMilestoneDecluttering, zoomToMilestoneStage, focusLat, focusLng, focusZoom, extentBottomOffset]);

  // Fly to active milestone when carousel is first opened (e.g., "Se rejserute" button)
  // This handles the case where activeMilestone is set from HomeClient when opening the carousel
  // It does NOT trigger when swiping between milestones in an already-open carousel
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !isLoaded) return;
    
    // Reset ref when carousel is closed (activeMilestone becomes null)
    // This ensures "Se rejserute" can fly to the first milestone again
    if (!activeMilestone) {
      activeMilestoneRef.current = null;
      isZoomedInRef.current = false;
      return;
    }
    
    // Skip if we already handled this milestone via map click
    // (zoomToMilestoneStage sets activeMilestoneRef.current when clicking on map)
    if (activeMilestoneRef.current === activeMilestone.id) return;
    
    // Only trigger flyTo if carousel was just opened (previous activeMilestone was null)
    // If user is swiping between milestones in carousel, let the URL-based mechanism handle it
    const carouselJustOpened = activeMilestoneRef.current === null;
    
    // Update ref to current milestone
    activeMilestoneRef.current = activeMilestone.id;
    isZoomedInRef.current = false; // Start in zoomed-out state
    
    // Only fly to milestone if carousel was just opened via "Se rejserute"
    if (!carouselJustOpened) return;
    
    // Calculate padding based on container size
    const container = mapInstance.getContainer();
    const paddingPercent = 0.15;
    const horizontalPadding = Math.round(container.clientWidth * paddingPercent);
    const baseVerticalPadding = Math.round(container.clientHeight * paddingPercent);
    const topPadding = baseVerticalPadding;
    const bottomPadding = baseVerticalPadding + extentBottomOffset;
    
    // Find neighbor milestones for context
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.display_order - b.display_order
    );
    const milestoneIndex = sortedMilestones.findIndex((m) => m.id === activeMilestone.id);
    
    // Collect neighbor points for bounds
    const neighborPoints: [number, number][] = [];
    if (milestoneIndex > 0) {
      const prevMilestone = sortedMilestones[milestoneIndex - 1];
      neighborPoints.push([prevMilestone.lng, prevMilestone.lat]);
    }
    if (milestoneIndex < sortedMilestones.length - 1) {
      const nextMilestone = sortedMilestones[milestoneIndex + 1];
      neighborPoints.push([nextMilestone.lng, nextMilestone.lat]);
    }
    
    if (neighborPoints.length === 0) {
      // Only one milestone - fly directly to it
      mapInstance.flyTo({
        center: [activeMilestone.lng, activeMilestone.lat],
        zoom: 8,
        duration: 800,
      });
    } else {
      // Create bounds centered on milestone that includes neighbors
      let maxLngDiff = 0;
      let maxLatDiff = 0;
      const center: [number, number] = [activeMilestone.lng, activeMilestone.lat];
      
      neighborPoints.forEach(([lng, lat]) => {
        maxLngDiff = Math.max(maxLngDiff, Math.abs(lng - center[0]));
        maxLatDiff = Math.max(maxLatDiff, Math.abs(lat - center[1]));
      });
      
      const buffer = 1.1;
      const bounds = new mapboxgl.LngLatBounds(
        [center[0] - maxLngDiff * buffer, center[1] - maxLatDiff * buffer],
        [center[0] + maxLngDiff * buffer, center[1] + maxLatDiff * buffer]
      );
      
      mapInstance.fitBounds(bounds, {
        padding: {
          top: topPadding,
          bottom: bottomPadding,
          left: horizontalPadding,
          right: horizontalPadding,
        },
        maxZoom: 10,
        duration: 800,
      });
    }
    
    // Update post visibility after move
    mapInstance.once("moveend", () => {
      updatePostVisibility(mapInstance.getZoom());
    });
  }, [activeMilestone, isLoaded, milestones, extentBottomOffset, updatePostVisibility]);

  // Handle highlighting of active post in carousel
  // IMPORTANT: We only use CSS classes for highlighting, never inline transforms
  // Mapbox manages marker positioning via transforms internally, so modifying
  // transform directly causes the marker to jump to incorrect positions
  useEffect(() => {
    if (!isLoaded) return;

    // Reset all markers to normal state - only modify class and zIndex
    postMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.zIndex = "";
      el.classList.remove("post-marker-highlighted");
    });

    // Highlight the active post using CSS class only
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

