"use client";

import { useState, useEffect, useRef, RefObject } from "react";

export interface UseInViewportOptions {
  /** Root margin for IntersectionObserver (default: "100px" for preloading) */
  rootMargin?: string;
  /** Threshold for visibility (default: 0.1 = 10% visible) */
  threshold?: number;
  /** Whether to keep tracking or stop after first intersection */
  once?: boolean;
}

export interface UseInViewportResult<T extends HTMLElement = HTMLElement> {
  /** Ref to attach to the element you want to observe */
  ref: RefObject<T>;
  /** Whether the element is currently in viewport */
  isInViewport: boolean;
  /** Whether the element has ever been in viewport */
  hasBeenInViewport: boolean;
}

/**
 * Hook to track whether an element is in the viewport using IntersectionObserver.
 * Useful for lazy loading, viewport-based prioritization, etc.
 */
export function useInViewport<T extends HTMLElement = HTMLElement>(
  options: UseInViewportOptions = {}
): UseInViewportResult<T> {
  const { rootMargin = "100px", threshold = 0.1, once = false } = options;
  
  const ref = useRef<T>(null);
  const [isInViewport, setIsInViewport] = useState(false);
  const [hasBeenInViewport, setHasBeenInViewport] = useState(false);
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    // If "once" mode and we've already been in viewport, don't observe
    if (once && hasBeenInViewport) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting;
        setIsInViewport(inView);
        
        if (inView) {
          setHasBeenInViewport(true);
          
          // If "once" mode, stop observing after first intersection
          if (once) {
            observer.disconnect();
          }
        }
      },
      {
        rootMargin,
        threshold,
      }
    );
    
    observer.observe(element);
    
    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold, once, hasBeenInViewport]);
  
  return { ref, isInViewport, hasBeenInViewport };
}
