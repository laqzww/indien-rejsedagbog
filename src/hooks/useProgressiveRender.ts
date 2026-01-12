"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface UseProgressiveRenderOptions {
  /** Initial number of items to render */
  initialBatch?: number;
  /** Number of items to add when loading more */
  batchSize?: number;
  /** Distance from bottom (in px) at which to trigger loading more */
  loadMoreThreshold?: number;
  /** Total number of items */
  totalItems: number;
}

export interface UseProgressiveRenderResult {
  /** Number of items to render */
  renderedCount: number;
  /** Ref to attach to a sentinel element at the end of the list */
  sentinelRef: (node: HTMLDivElement | null) => void;
  /** Whether all items have been rendered */
  isComplete: boolean;
  /** Manually trigger rendering more items */
  loadMore: () => void;
}

/**
 * Hook for progressive rendering of large lists.
 * Starts with a small batch and loads more as user scrolls.
 * This prevents DOM thrashing and reduces initial network requests.
 */
export function useProgressiveRender({
  initialBatch = 5,
  batchSize = 3,
  loadMoreThreshold = 400,
  totalItems,
}: UseProgressiveRenderOptions): UseProgressiveRenderResult {
  const [renderedCount, setRenderedCount] = useState(() =>
    Math.min(initialBatch, totalItems)
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLDivElement | null>(null);

  // Check if we've rendered everything
  const isComplete = renderedCount >= totalItems;

  // Load more items
  const loadMore = useCallback(() => {
    if (isComplete) return;

    setRenderedCount(prev => Math.min(prev + batchSize, totalItems));
  }, [batchSize, totalItems, isComplete]);

  // Set up IntersectionObserver for sentinel
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    sentinelNodeRef.current = node;

    if (!node || isComplete) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          loadMore();
        }
      },
      {
        rootMargin: `${loadMoreThreshold}px`,
        threshold: 0,
      }
    );

    observerRef.current.observe(node);
  }, [loadMore, loadMoreThreshold, isComplete]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Reset when totalItems changes (e.g., filter applied)
  useEffect(() => {
    setRenderedCount(Math.min(initialBatch, totalItems));
  }, [totalItems, initialBatch]);

  return {
    renderedCount,
    sentinelRef,
    isComplete,
    loadMore,
  };
}
