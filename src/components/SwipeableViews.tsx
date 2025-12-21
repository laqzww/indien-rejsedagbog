"use client";

import { useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SwipeableViewsProps {
  children: ReactNode[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  className?: string;
}

export function SwipeableViews({
  children,
  activeIndex,
  onIndexChange,
  className,
}: SwipeableViewsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const minSwipeDistance = 50;
  const swipeThreshold = 0.3; // 30% of container width

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setIsSwiping(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return;

      const currentTouch = e.targetTouches[0].clientX;
      const delta = currentTouch - touchStart;
      
      // Limit delta based on current position
      // Don't allow swiping left on last slide or right on first slide
      if (activeIndex === 0 && delta > 0) {
        setTouchDelta(delta * 0.3); // Resistance effect
      } else if (activeIndex === children.length - 1 && delta < 0) {
        setTouchDelta(delta * 0.3); // Resistance effect
      } else {
        setTouchDelta(delta);
      }
    },
    [touchStart, activeIndex, children.length]
  );

  const handleTouchEnd = useCallback(() => {
    if (!containerRef.current || touchStart === null) {
      setTouchStart(null);
      setTouchDelta(0);
      setIsSwiping(false);
      return;
    }

    const containerWidth = containerRef.current.offsetWidth;
    const swipeDistance = Math.abs(touchDelta);
    const threshold = containerWidth * swipeThreshold;

    if (swipeDistance >= minSwipeDistance && swipeDistance >= threshold) {
      if (touchDelta > 0 && activeIndex > 0) {
        // Swiped right, go to previous
        onIndexChange(activeIndex - 1);
      } else if (touchDelta < 0 && activeIndex < children.length - 1) {
        // Swiped left, go to next
        onIndexChange(activeIndex + 1);
      }
    }

    setTouchStart(null);
    setTouchDelta(0);
    setIsSwiping(false);
  }, [touchStart, touchDelta, activeIndex, children.length, onIndexChange]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && activeIndex > 0) {
        onIndexChange(activeIndex - 1);
      } else if (e.key === "ArrowRight" && activeIndex < children.length - 1) {
        onIndexChange(activeIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, children.length, onIndexChange]);

  const translateX = isSwiping
    ? `calc(-${activeIndex * 100}% + ${touchDelta}px)`
    : `-${activeIndex * 100}%`;

  return (
    <div
      ref={containerRef}
      className={cn("overflow-hidden", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={cn(
          "flex h-full",
          !isSwiping && "transition-transform duration-300 ease-out"
        )}
        style={{ transform: `translateX(${translateX})` }}
      >
        {children.map((child, index) => (
          <div
            key={index}
            className="w-full h-full flex-shrink-0"
            aria-hidden={index !== activeIndex}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
