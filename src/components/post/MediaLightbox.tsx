"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
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
const SWIPE_CLOSE_THRESHOLD = 100;
// Threshold for horizontal swipe to change slide
const SWIPE_SLIDE_THRESHOLD = 50;
// Animation duration
const ANIMATION_DURATION = 200;

export function MediaLightbox({ media, initialIndex, onClose }: MediaLightboxProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isClosing, setIsClosing] = useState(false);
  
  // Vertical drag state for swipe-to-close
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // Horizontal swipe state
  const [dragX, setDragX] = useState(0);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState(false);
  
  // Track loaded full-resolution images
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  
  // Video state
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  
  // Touch tracking refs
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const gestureDirectionRef = useRef<"horizontal" | "vertical" | null>(null);
  const isZoomedRef = useRef(false);
  
  // Container ref for touch events
  const containerRef = useRef<HTMLDivElement>(null);
  
  const activeMedia = media[activeIndex];
  const mediaCount = media.length;
  
  // Calculate opacity based on drag distance (Instagram-like fade)
  const backgroundOpacity = Math.max(0, 1 - Math.abs(dragY) / 300);
  
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
      isZoomedRef.current = false;
    }
  }, [activeIndex, mediaCount]);
  
  const goToPrev = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex(i => i - 1);
      setPlayingVideo(null);
      isZoomedRef.current = false;
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
  
  // Touch handlers for swipe-to-close and horizontal swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't handle if zoomed in
    if (isZoomedRef.current) return;
    
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    gestureDirectionRef.current = null;
    setIsDragging(true);
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isZoomedRef.current) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;
    
    // Determine gesture direction on first significant movement
    if (!gestureDirectionRef.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      gestureDirectionRef.current = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
    }
    
    if (gestureDirectionRef.current === "vertical") {
      // Vertical swipe - for closing
      setDragY(deltaY);
      setIsHorizontalSwipe(false);
    } else if (gestureDirectionRef.current === "horizontal") {
      // Horizontal swipe - for changing slides
      // Apply edge resistance
      let adjustedDeltaX = deltaX;
      if ((activeIndex === 0 && deltaX > 0) || (activeIndex === mediaCount - 1 && deltaX < 0)) {
        adjustedDeltaX = deltaX * 0.3; // Resistance at edges
      }
      setDragX(adjustedDeltaX);
      setIsHorizontalSwipe(true);
    }
  }, [activeIndex, mediaCount]);
  
  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    
    // Handle vertical swipe-to-close
    if (gestureDirectionRef.current === "vertical" && Math.abs(dragY) > SWIPE_CLOSE_THRESHOLD) {
      handleClose();
    } else if (gestureDirectionRef.current === "horizontal") {
      // Handle horizontal swipe for navigation
      if (dragX < -SWIPE_SLIDE_THRESHOLD && activeIndex < mediaCount - 1) {
        goToNext();
      } else if (dragX > SWIPE_SLIDE_THRESHOLD && activeIndex > 0) {
        goToPrev();
      }
    }
    
    // Reset state
    setDragY(0);
    setDragX(0);
    setIsDragging(false);
    setIsHorizontalSwipe(false);
    touchStartRef.current = null;
    gestureDirectionRef.current = null;
  }, [dragY, dragX, activeIndex, mediaCount, handleClose, goToNext, goToPrev]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      } else if (e.key === "ArrowLeft") {
        goToPrev();
      } else if (e.key === "ArrowRight") {
        goToNext();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, goToPrev, goToNext]);
  
  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  
  // Track zoom state from TransformWrapper
  const handleZoomChange = useCallback((ref: { state: { scale: number } }) => {
    isZoomedRef.current = ref.state.scale > 1.1;
  }, []);
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "transition-opacity duration-200",
        isClosing ? "opacity-0" : "opacity-100"
      )}
      style={{ backgroundColor: `rgba(0, 0, 0, ${backgroundOpacity})` }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
      
      {/* Main content area with drag transform */}
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `translateY(${dragY}px) translateX(${isHorizontalSwipe ? dragX : 0}px)`,
          transition: isDragging ? "none" : `transform ${ANIMATION_DURATION}ms ease-out`,
        }}
      >
        {/* Media slides */}
        <div className="relative w-full h-full flex items-center justify-center">
          {activeMedia.type === "image" ? (
            <ImageSlide
              media={activeMedia}
              isLoaded={loadedImages.has(activeMedia.id)}
              onLoad={() => handleImageLoad(activeMedia.id)}
              onZoomChange={handleZoomChange}
            />
          ) : (
            <VideoSlide
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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex gap-1.5 md:hidden">
          {media.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setActiveIndex(index);
                setPlayingVideo(null);
                isZoomedRef.current = false;
              }}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === activeIndex
                  ? "bg-white w-4"
                  : "bg-white/40"
              )}
              aria-label={`Gå til medie ${index + 1}`}
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
  onZoomChange: (ref: { state: { scale: number } }) => void;
}

function ImageSlide({ media, isLoaded, onLoad, onZoomChange }: ImageSlideProps) {
  const thumbnailUrl = getCarouselThumbnailUrl(media.storage_path);
  const fullUrl = getMediaUrl(media.storage_path);
  
  return (
    <TransformWrapper
      initialScale={1}
      minScale={1}
      maxScale={4}
      centerOnInit
      doubleClick={{ mode: "toggle", step: 2 }}
      panning={{ velocityDisabled: true }}
      onTransformed={onZoomChange}
    >
      <TransformComponent
        wrapperClass="!w-full !h-full"
        contentClass="!w-full !h-full flex items-center justify-center"
      >
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Thumbnail layer (always visible until full loads) */}
          {!isLoaded && (
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              className="object-contain blur-sm"
              sizes="100vw"
              priority
            />
          )}
          
          {/* Full resolution layer */}
          <Image
            src={fullUrl}
            alt=""
            fill
            className={cn(
              "object-contain transition-opacity duration-300",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
            sizes="100vw"
            priority
            onLoad={onLoad}
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
          priority
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
