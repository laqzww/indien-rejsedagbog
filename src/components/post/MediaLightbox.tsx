"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { cn } from "@/lib/utils";
import { getMediaUrl, getCarouselThumbnailUrl } from "@/lib/upload";
import { X, ChevronLeft, ChevronRight, Play, Loader2 } from "lucide-react";

interface MediaItem {
  id: string;
  type: "image" | "video";
  storage_path: string;
  thumbnail_path: string | null;
}

interface MediaLightboxProps {
  media: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

// Threshold for swipe-to-close (in pixels)
const SWIPE_CLOSE_THRESHOLD = 80;
// Threshold for horizontal swipe to change slide
const SWIPE_SLIDE_THRESHOLD = 40;
// Animation duration
const ANIMATION_DURATION = 200;

export function MediaLightbox({ media, initialIndex, onClose }: MediaLightboxProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isClosing, setIsClosing] = useState(false);
  
  // Track loaded full-resolution images (only load when in lightbox)
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  
  // Video state
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  
  // Zoom state - when zoomed, disable swipe navigation
  const [isZoomed, setIsZoomed] = useState(false);
  
  // Drag state for swipe gestures (only used when NOT zoomed)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  // Touch tracking
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const gestureDirectionRef = useRef<"horizontal" | "vertical" | null>(null);
  
  // Ref to TransformWrapper for resetting zoom
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  
  const activeMedia = media[activeIndex];
  const mediaCount = media.length;
  
  // Calculate background opacity based on vertical drag (Instagram-like fade)
  const backgroundOpacity = Math.max(0.3, 1 - Math.abs(dragOffset.y) / 250);
  
  // Handle image load
  const handleImageLoad = useCallback((mediaId: string) => {
    setLoadedImages(prev => new Set(prev).add(mediaId));
  }, []);
  
  // Close handler with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, ANIMATION_DURATION);
  }, [onClose]);
  
  // Navigate to next/previous
  const goToNext = useCallback(() => {
    if (activeIndex < mediaCount - 1) {
      setActiveIndex(i => i + 1);
      setPlayingVideo(null);
      setIsZoomed(false);
      transformRef.current?.resetTransform();
    }
  }, [activeIndex, mediaCount]);
  
  const goToPrev = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex(i => i - 1);
      setPlayingVideo(null);
      setIsZoomed(false);
      transformRef.current?.resetTransform();
    }
  }, [activeIndex]);
  
  // Handle video play
  const handlePlayVideo = useCallback(() => {
    setLoadingVideo(true);
    setPlayingVideo(activeMedia.id);
  }, [activeMedia.id]);
  
  const handleVideoCanPlay = useCallback(() => {
    setLoadingVideo(false);
  }, []);
  
  // Track zoom state
  const handleZoomChange = useCallback((ref: ReactZoomPanPinchRef) => {
    const scale = ref.state.scale;
    setIsZoomed(scale > 1.05);
  }, []);
  
  // Touch handlers - only active when NOT zoomed
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't handle swipes when zoomed - let TransformWrapper handle panning
    if (isZoomed) return;
    
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    gestureDirectionRef.current = null;
    setIsDragging(true);
  }, [isZoomed]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isZoomed) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;
    
    // Determine gesture direction on first significant movement
    if (!gestureDirectionRef.current && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      gestureDirectionRef.current = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
    }
    
    if (gestureDirectionRef.current === "vertical") {
      // Vertical swipe - for closing (allow both up and down)
      setDragOffset({ x: 0, y: deltaY });
    } else if (gestureDirectionRef.current === "horizontal") {
      // Horizontal swipe - for changing slides
      // Apply edge resistance at boundaries
      let adjustedX = deltaX;
      if ((activeIndex === 0 && deltaX > 0) || (activeIndex === mediaCount - 1 && deltaX < 0)) {
        adjustedX = deltaX * 0.25;
      }
      setDragOffset({ x: adjustedX, y: 0 });
    }
  }, [isZoomed, activeIndex, mediaCount]);
  
  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || isZoomed) {
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
      return;
    }
    
    const velocity = Date.now() - touchStartRef.current.time < 300;
    
    // Handle vertical swipe-to-close
    if (gestureDirectionRef.current === "vertical") {
      if (Math.abs(dragOffset.y) > SWIPE_CLOSE_THRESHOLD || (velocity && Math.abs(dragOffset.y) > 40)) {
        handleClose();
        return;
      }
    }
    
    // Handle horizontal swipe for navigation
    if (gestureDirectionRef.current === "horizontal") {
      if (dragOffset.x < -SWIPE_SLIDE_THRESHOLD || (velocity && dragOffset.x < -20)) {
        if (activeIndex < mediaCount - 1) goToNext();
      } else if (dragOffset.x > SWIPE_SLIDE_THRESHOLD || (velocity && dragOffset.x > 20)) {
        if (activeIndex > 0) goToPrev();
      }
    }
    
    // Reset
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(false);
    touchStartRef.current = null;
    gestureDirectionRef.current = null;
  }, [isZoomed, dragOffset, activeIndex, mediaCount, handleClose, goToNext, goToPrev]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      else if (e.key === "ArrowLeft") goToPrev();
      else if (e.key === "ArrowRight") goToNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, goToPrev, goToNext]);
  
  // Prevent body scroll when lightbox is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);
  
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "transition-opacity duration-200",
        isClosing ? "opacity-0" : "opacity-100"
      )}
      style={{ backgroundColor: `rgba(0, 0, 0, ${backgroundOpacity})` }}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-50 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        aria-label="Luk"
      >
        <X className="h-6 w-6" />
      </button>
      
      {/* Counter */}
      {mediaCount > 1 && (
        <div className="absolute top-4 left-4 z-50 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-full text-white text-sm font-medium">
          {activeIndex + 1} / {mediaCount}
        </div>
      )}
      
      {/* Navigation buttons (desktop) */}
      {mediaCount > 1 && (
        <>
          <button
            onClick={goToPrev}
            disabled={activeIndex === 0}
            className={cn(
              "hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-40",
              "p-3 rounded-full bg-black/40 backdrop-blur-sm text-white",
              "hover:bg-black/60 transition-colors",
              activeIndex === 0 && "opacity-30 cursor-not-allowed"
            )}
            aria-label="Forrige"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={goToNext}
            disabled={activeIndex === mediaCount - 1}
            className={cn(
              "hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-40",
              "p-3 rounded-full bg-black/40 backdrop-blur-sm text-white",
              "hover:bg-black/60 transition-colors",
              activeIndex === mediaCount - 1 && "opacity-30 cursor-not-allowed"
            )}
            aria-label="Næste"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
      
      {/* Main content area - touch handler wrapper */}
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `translateY(${dragOffset.y}px) translateX(${dragOffset.x}px)`,
          transition: isDragging ? "none" : `transform ${ANIMATION_DURATION}ms ease-out`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Media content */}
        <div className="relative w-full h-full flex items-center justify-center">
          {activeMedia.type === "image" ? (
            <ImageSlide
              key={activeMedia.id}
              media={activeMedia}
              isLoaded={loadedImages.has(activeMedia.id)}
              onLoad={() => handleImageLoad(activeMedia.id)}
              onZoomChange={handleZoomChange}
              transformRef={transformRef}
              isZoomed={isZoomed}
            />
          ) : (
            <VideoSlide
              key={activeMedia.id}
              media={activeMedia}
              isPlaying={playingVideo === activeMedia.id}
              isLoading={loadingVideo && playingVideo === activeMedia.id}
              onPlay={handlePlayVideo}
              onCanPlay={handleVideoCanPlay}
            />
          )}
        </div>
      </div>
      
      {/* Dot indicators (mobile) */}
      {mediaCount > 1 && mediaCount <= 10 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex gap-1.5 md:hidden pointer-events-none">
          {media.map((_, index) => (
            <div
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === activeIndex ? "bg-white w-4" : "bg-white/40"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Image Slide with Pinch-to-Zoom
// =============================================================================

interface ImageSlideProps {
  media: MediaItem;
  isLoaded: boolean;
  onLoad: () => void;
  onZoomChange: (ref: ReactZoomPanPinchRef) => void;
  transformRef: React.MutableRefObject<ReactZoomPanPinchRef | null>;
  isZoomed: boolean;
}

function ImageSlide({ media, isLoaded, onLoad, onZoomChange, transformRef, isZoomed }: ImageSlideProps) {
  // Use carousel thumbnail as placeholder (already cached from feed)
  const thumbnailUrl = getCarouselThumbnailUrl(media.storage_path);
  const fullUrl = getMediaUrl(media.storage_path);
  
  return (
    <TransformWrapper
      ref={transformRef}
      initialScale={1}
      minScale={1}
      maxScale={4}
      centerOnInit
      doubleClick={{ mode: "toggle", step: 2 }}
      panning={{ 
        disabled: !isZoomed, // Only allow panning when zoomed
        velocityDisabled: true,
      }}
      onTransformed={onZoomChange}
      // Disable wheel zoom on mobile to prevent conflicts
      wheel={{ disabled: true }}
    >
      <TransformComponent
        wrapperClass="!w-full !h-full"
        contentClass="!w-full !h-full flex items-center justify-center"
      >
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Thumbnail layer - uses cached image from feed, shown while full loads */}
          {!isLoaded && (
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              className="object-contain"
              sizes="100vw"
              // Don't use priority - thumbnail should already be in cache
            />
          )}
          
          {/* Full resolution layer - loads on demand */}
          <Image
            src={fullUrl}
            alt=""
            fill
            className={cn(
              "object-contain transition-opacity duration-300",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
            sizes="100vw"
            onLoad={onLoad}
            // No priority - load normally, don't block other resources
          />
          
          {/* Loading indicator */}
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="p-3 bg-black/40 backdrop-blur-sm rounded-full">
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              </div>
            </div>
          )}
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}

// =============================================================================
// Video Slide
// =============================================================================

interface VideoSlideProps {
  media: MediaItem;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: () => void;
  onCanPlay: () => void;
}

function VideoSlide({ media, isPlaying, isLoading, onPlay, onCanPlay }: VideoSlideProps) {
  const videoUrl = getMediaUrl(media.storage_path);
  const thumbnailUrl = media.thumbnail_path 
    ? getMediaUrl(media.thumbnail_path) 
    : null;
  
  if (isPlaying) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          src={videoUrl}
          controls
          playsInline
          autoPlay
          preload="auto"
          onCanPlay={onCanPlay}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="p-4 bg-black/50 backdrop-blur-sm rounded-full">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Video thumbnail with play button
  return (
    <div 
      className="relative w-full h-full flex items-center justify-center cursor-pointer group"
      onClick={onPlay}
    >
      {thumbnailUrl ? (
        <Image
          src={thumbnailUrl}
          alt=""
          fill
          className="object-contain"
          sizes="100vw"
          // No priority - use cached thumbnail
        />
      ) : (
        <video
          src={`${videoUrl}#t=0.001`}
          preload="metadata"
          muted
          playsInline
          className="max-w-full max-h-full object-contain pointer-events-none"
        />
      )}
      
      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="p-5 bg-black/60 rounded-full group-hover:bg-black/80 group-hover:scale-110 transition-all">
          <Play className="h-12 w-12 text-white fill-white" />
        </div>
      </div>
    </div>
  );
}
