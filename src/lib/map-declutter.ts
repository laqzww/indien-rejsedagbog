/**
 * Map Marker Decluttering Utilities
 * 
 * Provides functions to detect and resolve overlapping markers on a map.
 * Uses a force-directed approach to push overlapping markers apart.
 */

import mapboxgl from "mapbox-gl";

interface MarkerWithMilestone {
  marker: mapboxgl.Marker;
  milestoneId: string;
  originalLngLat: [number, number];
}

interface Point {
  x: number;
  y: number;
}

/**
 * Configuration for decluttering behavior
 */
interface DeclutterConfig {
  /** Minimum distance between marker centers in pixels */
  minDistance: number;
  /** Number of iterations for the force-directed algorithm */
  iterations: number;
  /** Force strength - higher values push markers apart more aggressively */
  forceStrength: number;
  /** Maximum offset allowed in pixels (to prevent markers from moving too far) */
  maxOffset: number;
}

const DEFAULT_CONFIG: DeclutterConfig = {
  minDistance: 40, // Markers should be at least 40px apart
  iterations: 15,  // Run 15 iterations to settle
  forceStrength: 0.5,
  maxOffset: 60,   // Don't push markers more than 60px from original position
};

/**
 * Calculate the pixel position of a marker on the map
 */
function getMarkerPixelPosition(
  map: mapboxgl.Map,
  lngLat: [number, number]
): Point {
  const projected = map.project(lngLat);
  return { x: projected.x, y: projected.y };
}

/**
 * Calculate distance between two points
 */
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize a vector to unit length
 */
function normalize(dx: number, dy: number): { dx: number; dy: number } {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) {
    // If points are exactly the same, push in a random direction
    const angle = Math.random() * Math.PI * 2;
    return { dx: Math.cos(angle), dy: Math.sin(angle) };
  }
  return { dx: dx / len, dy: dy / len };
}

/**
 * Calculate offsets for markers using a force-directed approach
 * This pushes overlapping markers apart while trying to minimize movement
 */
function calculateDeclutterOffsets(
  markers: MarkerWithMilestone[],
  map: mapboxgl.Map,
  config: DeclutterConfig = DEFAULT_CONFIG
): Map<string, { x: number; y: number }> {
  if (markers.length <= 1) {
    return new Map();
  }

  // Initialize positions at original locations
  const positions: Map<string, Point> = new Map();
  const originalPositions: Map<string, Point> = new Map();
  
  markers.forEach((m) => {
    const pixelPos = getMarkerPixelPosition(map, m.originalLngLat);
    positions.set(m.milestoneId, { ...pixelPos });
    originalPositions.set(m.milestoneId, { ...pixelPos });
  });

  // Run force-directed iterations
  for (let iter = 0; iter < config.iterations; iter++) {
    // Calculate forces for each marker
    const forces: Map<string, Point> = new Map();
    markers.forEach((m) => forces.set(m.milestoneId, { x: 0, y: 0 }));

    // Repulsion between overlapping markers
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const m1 = markers[i];
        const m2 = markers[j];
        const p1 = positions.get(m1.milestoneId)!;
        const p2 = positions.get(m2.milestoneId)!;
        
        const dist = distance(p1, p2);
        
        if (dist < config.minDistance && dist > 0) {
          // Calculate repulsion force
          const overlap = config.minDistance - dist;
          const { dx, dy } = normalize(p2.x - p1.x, p2.y - p1.y);
          const force = overlap * config.forceStrength;
          
          // Apply force in opposite directions
          const f1 = forces.get(m1.milestoneId)!;
          const f2 = forces.get(m2.milestoneId)!;
          
          f1.x -= dx * force / 2;
          f1.y -= dy * force / 2;
          f2.x += dx * force / 2;
          f2.y += dy * force / 2;
        }
      }
    }

    // Apply forces with maxOffset constraint
    markers.forEach((m) => {
      const pos = positions.get(m.milestoneId)!;
      const force = forces.get(m.milestoneId)!;
      const original = originalPositions.get(m.milestoneId)!;
      
      // Apply force
      let newX = pos.x + force.x;
      let newY = pos.y + force.y;
      
      // Constrain to maxOffset from original position
      const offsetX = newX - original.x;
      const offsetY = newY - original.y;
      const offsetDist = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
      
      if (offsetDist > config.maxOffset) {
        const scale = config.maxOffset / offsetDist;
        newX = original.x + offsetX * scale;
        newY = original.y + offsetY * scale;
      }
      
      positions.set(m.milestoneId, { x: newX, y: newY });
    });
  }

  // Calculate final offsets (difference from original position)
  const offsets: Map<string, { x: number; y: number }> = new Map();
  
  markers.forEach((m) => {
    const original = originalPositions.get(m.milestoneId)!;
    const final = positions.get(m.milestoneId)!;
    
    const offsetX = final.x - original.x;
    const offsetY = final.y - original.y;
    
    // Only apply offset if it's significant (more than 1 pixel)
    if (Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) {
      offsets.set(m.milestoneId, { x: offsetX, y: offsetY });
    }
  });

  return offsets;
}

/**
 * Apply calculated offsets to markers using Mapbox's setOffset method
 * Only updates markers whose offsets have actually changed to avoid unnecessary repaints
 */
function applyOffsetsToMarkers(
  markers: MarkerWithMilestone[],
  offsets: Map<string, { x: number; y: number }>
): void {
  markers.forEach((m) => {
    const newOffset = offsets.get(m.milestoneId);
    const currentOffset = m.marker.getOffset();
    
    if (newOffset) {
      // Only update if offset has changed significantly (> 0.5px difference)
      const dx = Math.abs(newOffset.x - currentOffset.x);
      const dy = Math.abs(newOffset.y - currentOffset.y);
      if (dx > 0.5 || dy > 0.5) {
        m.marker.setOffset([newOffset.x, newOffset.y]);
      }
    } else {
      // Reset to [0, 0] only if not already there
      if (currentOffset.x !== 0 || currentOffset.y !== 0) {
        m.marker.setOffset([0, 0]);
      }
    }
  });
}

/**
 * Check if any markers are currently overlapping
 */
function hasOverlappingMarkers(
  markers: MarkerWithMilestone[],
  map: mapboxgl.Map,
  minDistance: number
): boolean {
  for (let i = 0; i < markers.length; i++) {
    for (let j = i + 1; j < markers.length; j++) {
      const p1 = getMarkerPixelPosition(map, markers[i].originalLngLat);
      const p2 = getMarkerPixelPosition(map, markers[j].originalLngLat);
      
      if (distance(p1, p2) < minDistance) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Main declutter function - call this after zoom/pan changes
 * Returns a cleanup function to reset offsets
 */
export function declutterMilestoneMarkers(
  map: mapboxgl.Map,
  markers: mapboxgl.Marker[],
  milestoneIds: string[],
  originalLngLats: [number, number][],
  config: Partial<DeclutterConfig> = {}
): () => void {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Build the marker data structure
  const markerData: MarkerWithMilestone[] = markers.map((marker, index) => ({
    marker,
    milestoneId: milestoneIds[index],
    originalLngLat: originalLngLats[index],
  }));

  // Check if decluttering is needed
  if (!hasOverlappingMarkers(markerData, map, fullConfig.minDistance)) {
    // No overlaps - reset offsets only if they're not already at [0, 0]
    markers.forEach((marker) => {
      const currentOffset = marker.getOffset();
      if (currentOffset.x !== 0 || currentOffset.y !== 0) {
        marker.setOffset([0, 0]);
      }
    });
    return () => {
      markers.forEach((marker) => marker.setOffset([0, 0]));
    };
  }

  // Calculate and apply offsets
  const offsets = calculateDeclutterOffsets(markerData, map, fullConfig);
  applyOffsetsToMarkers(markerData, offsets);

  // Return cleanup function
  return () => {
    markers.forEach((marker) => marker.setOffset([0, 0]));
  };
}

/**
 * Create a declutter handler that can be attached to map zoom/move events
 */
export function createDeclutterHandler(
  map: mapboxgl.Map,
  getMarkers: () => mapboxgl.Marker[],
  getMilestoneIds: () => string[],
  getOriginalLngLats: () => [number, number][],
  config: Partial<DeclutterConfig> = {}
): () => void {
  const handler = () => {
    const markers = getMarkers();
    const milestoneIds = getMilestoneIds();
    const originalLngLats = getOriginalLngLats();
    
    if (markers.length === milestoneIds.length && markers.length === originalLngLats.length) {
      declutterMilestoneMarkers(map, markers, milestoneIds, originalLngLats, config);
    }
  };

  return handler;
}

/**
 * Add visual connection lines from offset markers to their original positions
 * This helps users understand where the marker actually is located
 */
export function createOffsetIndicatorLines(
  map: mapboxgl.Map,
  markers: mapboxgl.Marker[],
  milestoneIds: string[],
  originalLngLats: [number, number][],
  sourceId: string = "declutter-lines"
): () => void {
  // Remove existing source/layer if present
  if (map.getLayer(`${sourceId}-layer`)) {
    map.removeLayer(`${sourceId}-layer`);
  }
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }

  // Calculate lines for markers with offsets
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  
  markers.forEach((marker, index) => {
    const offset = marker.getOffset();
    if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) {
      const originalLngLat = originalLngLats[index];
      // Get current screen position and convert back to lngLat
      const originalPixel = map.project(originalLngLat);
      // Use array format [x, y] which is accepted as PointLike
      const offsetLngLat = map.unproject([
        originalPixel.x + offset.x, 
        originalPixel.y + offset.y
      ]);
      
      features.push({
        type: "Feature",
        properties: { milestoneId: milestoneIds[index] },
        geometry: {
          type: "LineString",
          coordinates: [
            originalLngLat,
            [offsetLngLat.lng, offsetLngLat.lat],
          ],
        },
      });
    }
  });

  if (features.length > 0) {
    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    map.addLayer({
      id: `${sourceId}-layer`,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": "#FF9933",
        "line-width": 1.5,
        "line-dasharray": [3, 3],
        "line-opacity": 0.6,
      },
    });
  }

  // Return cleanup function
  return () => {
    if (map.getLayer(`${sourceId}-layer`)) {
      map.removeLayer(`${sourceId}-layer`);
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  };
}
