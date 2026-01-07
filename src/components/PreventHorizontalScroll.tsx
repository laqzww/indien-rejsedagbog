"use client";

import { useEffect } from "react";

/**
 * This component prevents horizontal page displacement caused by touch gestures.
 * It listens to touchmove events and prevents them if they would cause horizontal scroll
 * on the document/body level.
 */
export function PreventHorizontalScroll() {
  useEffect(() => {
    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches.length) return;

      const deltaX = Math.abs(e.touches[0].clientX - startX);
      const deltaY = Math.abs(e.touches[0].clientY - startY);

      // If the gesture is more horizontal than vertical
      // and we're at the document/body level, prevent it
      if (deltaX > deltaY) {
        const target = e.target as HTMLElement;
        
        // Check if the touch is on an element that should allow horizontal scroll
        // (like a carousel container or horizontal scrollable element)
        const allowHorizontalScroll = target.closest(
          '[data-allow-horizontal-scroll], .embla, [class*="overflow-x-auto"], [class*="overflow-x-scroll"]'
        );

        // If not inside a horizontal scroll container, prevent the horizontal movement
        if (!allowHorizontalScroll) {
          // Check if the document/body would scroll horizontally
          const scrollableParent = getScrollableParent(target);
          if (!scrollableParent || scrollableParent === document.body || scrollableParent === document.documentElement) {
            e.preventDefault();
          }
        }
      }
    };

    // Find the first scrollable parent that allows horizontal scroll
    const getScrollableParent = (element: HTMLElement | null): HTMLElement | null => {
      while (element && element !== document.body) {
        const style = window.getComputedStyle(element);
        const overflowX = style.overflowX;
        
        if (overflowX === "auto" || overflowX === "scroll") {
          // Check if element actually has horizontal scroll
          if (element.scrollWidth > element.clientWidth) {
            return element;
          }
        }
        element = element.parentElement;
      }
      return null;
    };

    // Use passive: false to allow preventDefault
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  return null;
}
