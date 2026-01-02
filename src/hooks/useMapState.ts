"use client";

import { useState, useCallback, useEffect } from "react";

export type MapStyle = "streets" | "satellite";

export interface MapState {
  /** Current map style */
  mapStyle: MapStyle;
  /** Whether map has encountered an error */
  hasError: boolean;
  /** Key for forcing map remount */
  mapKey: number;
}

export interface MapStateActions {
  /** Toggle between streets and satellite styles */
  toggleStyle: () => void;
  /** Set map error state */
  setError: () => void;
  /** Clear error and retry loading map */
  retry: () => void;
  /** Reset error state (e.g., when focus changes) */
  clearError: () => void;
}

export interface UseMapStateOptions {
  /** Initial map style */
  initialStyle?: MapStyle;
  /** Focus coordinates - used to auto-clear errors on navigation */
  focusLat?: number;
  focusLng?: number;
}

/**
 * Hook for managing map display state (style, errors, retries).
 */
export function useMapState(
  options: UseMapStateOptions = {}
): MapState & MapStateActions {
  const { initialStyle = "satellite", focusLat, focusLng } = options;

  const [mapStyle, setMapStyle] = useState<MapStyle>(initialStyle);
  const [hasError, setHasError] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  // Auto-clear error when focus coordinates change (new navigation)
  useEffect(() => {
    if (focusLat !== undefined && focusLng !== undefined) {
      setHasError(false);
    }
  }, [focusLat, focusLng]);

  const toggleStyle = useCallback(() => {
    setMapStyle((prev) => (prev === "streets" ? "satellite" : "streets"));
  }, []);

  const setError = useCallback(() => {
    setHasError(true);
  }, []);

  const retry = useCallback(() => {
    setHasError(false);
    setMapKey((k) => k + 1);
  }, []);

  const clearError = useCallback(() => {
    setHasError(false);
  }, []);

  return {
    mapStyle,
    hasError,
    mapKey,
    toggleStyle,
    setError,
    retry,
    clearError,
  };
}
