"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export type ViewType = "feed" | "map";

export interface ViewNavigationState {
  /** Current active view (feed or map) */
  activeView: ViewType;
  /** Latitude to focus on (from URL or initial props) */
  focusLat: number | undefined;
  /** Longitude to focus on (from URL or initial props) */
  focusLng: number | undefined;
  /** Zoom level for map focus */
  focusZoom: number | undefined;
  /** Post ID to scroll to in feed */
  focusPostId: string | undefined;
  /** Post ID to focus on in map carousel */
  focusPostForCarousel: string | undefined;
}

export interface ViewNavigationActions {
  /** Change the active view (updates URL) */
  changeView: (view: ViewType) => void;
  /** Navigate to a post in feed view */
  navigateToPost: (postId: string) => void;
  /** Update map focus coordinates in URL */
  updateMapFocus: (lat: number, lng: number, zoom: number) => void;
  /** Clear map focus coordinates from URL */
  clearMapFocus: () => void;
}

export interface UseViewNavigationOptions {
  /** Default view if not specified in URL */
  initialView?: ViewType;
  /** Initial focus latitude (can be overridden by URL) */
  initialFocusLat?: number;
  /** Initial focus longitude (can be overridden by URL) */
  initialFocusLng?: number;
  /** Initial focus zoom (can be overridden by URL) */
  initialFocusZoom?: number;
}

/**
 * Hook for managing view navigation state synced with URL parameters.
 * URL is the single source of truth for view state, enabling browser back/forward navigation.
 */
export function useViewNavigation(
  options: UseViewNavigationOptions = {}
): ViewNavigationState & ViewNavigationActions {
  const {
    initialView = "feed",
    initialFocusLat,
    initialFocusLng,
    initialFocusZoom,
  } = options;

  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse URL parameters
  const urlView = searchParams.get("view");
  const urlLat = searchParams.get("lat");
  const urlLng = searchParams.get("lng");
  const urlZoom = searchParams.get("zoom");
  const urlPostId = searchParams.get("post");
  const urlFocusPost = searchParams.get("focusPost");

  // Compute state from URL (URL takes precedence over initial props)
  const state = useMemo<ViewNavigationState>(() => {
    const activeView: ViewType =
      urlView === "map" ? "map" : urlView === "feed" ? "feed" : initialView;

    return {
      activeView,
      focusLat: urlLat ? parseFloat(urlLat) : initialFocusLat,
      focusLng: urlLng ? parseFloat(urlLng) : initialFocusLng,
      focusZoom: urlZoom ? parseFloat(urlZoom) : initialFocusZoom,
      focusPostId: urlPostId || undefined,
      focusPostForCarousel: urlFocusPost || undefined,
    };
  }, [
    urlView,
    urlLat,
    urlLng,
    urlZoom,
    urlPostId,
    urlFocusPost,
    initialView,
    initialFocusLat,
    initialFocusLng,
    initialFocusZoom,
  ]);

  // Action: Change view
  const changeView = useCallback(
    (view: ViewType) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", view);

      // Clear focus coordinates when switching to feed
      if (view === "feed") {
        params.delete("lat");
        params.delete("lng");
        params.delete("zoom");
      }

      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Action: Navigate to a specific post in feed
  const navigateToPost = useCallback(
    (postId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "feed");
      params.set("post", postId);
      params.delete("lat");
      params.delete("lng");
      params.delete("zoom");
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Action: Update map focus coordinates
  const updateMapFocus = useCallback(
    (lat: number, lng: number, zoom: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("lat", lat.toString());
      params.set("lng", lng.toString());
      params.set("zoom", zoom.toString());
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Action: Clear map focus coordinates
  const clearMapFocus = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lat");
    params.delete("lng");
    params.delete("zoom");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return {
    ...state,
    changeView,
    navigateToPost,
    updateMapFocus,
    clearMapFocus,
  };
}
