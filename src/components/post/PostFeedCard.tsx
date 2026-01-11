"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getMediaUrl, getCarouselThumbnailUrl } from "@/lib/upload";
import { MapPin, ChevronLeft, ChevronRight, Play, Loader2, Maximize2 } from "lucide-react";
import { formatDayLabel } from "@/lib/journey";
import { useInViewport } from "@/hooks";
import { MediaLightbox } from "./MediaLightbox";
import type { PostWithDayInfo } from "@/lib/journey";

interface PostFeedCardProps {
  post: PostWithDayInfo;
  showDayBadge?: boolean;
}

// Resistance factor for edge swipe (lower = more resistance)
const EDGE_RESISTANCE = 0.3;
// Minimum swipe distance to trigger slide change
const SWIPE_THRESHOLD = 50;
// Animation duration in ms
const ANIMATION_DURATION = 300;

export function PostFeedCard({ post, showDayBadge = true }: PostFeedCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Drag offset in pixels (for real-time finger tracking)
  const [dragOffset, setDragOffset] = useState(0);
  // Whether we're currently dragging (controls transition)
  const [isDragging, setIsDragging] = useState(false);
  
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const isHorizontalGesture = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Viewport tracking for smart loading
  const { ref: viewportRef, isInViewport, hasBeenInViewport } = useInViewport<HTMLElement>({
    rootMargin: "200px", // Preload 200px before entering viewport
    threshold: 0.1,
  });
  
  // Track which images have been fully loaded
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  
  // Track which media indices should load full resolution
  // This persists even when scrolling away - once triggered, stays triggered
  const [fullResIndices, setFullResIndices] = useState<Set<number>>(() => new Set([0])); // Start with first image
  
  // Track which videos are playing (by media id)
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
  const [loadingVideos, setLoadingVideos] = useState<Set<string>>(new Set());
  
  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxInitialIndex, setLightboxInitialIndex] = useState(0);
  
  // When activeIndex changes or viewport is entered, mark current + adjacent for full res loading
  useEffect(() => {
    if (hasBeenInViewport) {
      setFullResIndices(prev => {
        const next = new Set(prev);
        // Add current, previous, and next indices
        next.add(activeIndex);
        if (activeIndex > 0) next.add(activeIndex - 1);
        if (activeIndex < post.media.length - 1) next.add(activeIndex + 1);
        return next;
      });
    }
  }, [activeIndex, hasBeenInViewport, post.media.length]);
  
  const handleImageLoad = useCallback((mediaId: string) => {
    setLoadedImages(prev => new Set(prev).add(mediaId));
  }, []);
  
  const handlePlayVideo = (mediaId: string, e?: React.MouseEvent) => {
    // Stop propagation to prevent lightbox from opening
    if (e) {
      e.stopPropagation();
    }
    setLoadingVideos(prev => new Set(prev).add(mediaId));
    setPlayingVideos(prev => new Set(prev).add(mediaId));
  };
  
  const handleVideoCanPlay = (mediaId: string) => {
    setLoadingVideos(prev => {
      const next = new Set(prev);
      next.delete(mediaId);
      return next;
    });
  };
  
  // Open lightbox at specific index
  const openLightbox = useCallback((index: number) => {
    setLightboxInitialIndex(index);
    setLightboxOpen(true);
    // Pause any playing videos when opening lightbox
    setPlayingVideos(new Set());
  }, []);
  
  // Close lightbox
  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);
  
  // Handle expand button on playing video
  const handleExpandVideo = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPlayingVideos(new Set()); // Stop inline playback
    openLightbox(index);
  };

  // Sort media by display_order to ensure correct order
  const sortedMedia = [...post.media].sort(
    (a, b) => a.display_order - b.display_order
  );
  const mediaCount = sortedMedia.length;
  const hasMedia = mediaCount > 0;

  // Swipe handlers with real-time finger tracking
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentX.current = e.touches[0].clientX;
    isHorizontalGesture.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;
    
    // Determine direction on first significant movement
    if (isHorizontalGesture.current === null && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      isHorizontalGesture.current = Math.abs(deltaX) > Math.abs(deltaY);
    }
    
    // If horizontal gesture, prevent vertical scroll and update drag offset
    if (isHorizontalGesture.current) {
      e.preventDefault();
      touchCurrentX.current = currentX;
      
      // Apply edge resistance when at boundaries
      let offset = deltaX;
      const isAtStart = activeIndex === 0 && deltaX > 0;
      const isAtEnd = activeIndex === mediaCount - 1 && deltaX < 0;
      
      if (isAtStart || isAtEnd) {
        // Apply resistance - the further you drag, the more resistance
        offset = deltaX * EDGE_RESISTANCE;
      }
      
      setDragOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchCurrentX.current === null) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    
    // Only change slide if it was a horizontal gesture
    if (isHorizontalGesture.current) {
      const deltaX = touchStartX.current - touchCurrentX.current;
      
      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        if (deltaX > 0 && activeIndex < mediaCount - 1) {
          setActiveIndex((i) => i + 1);
        } else if (deltaX < 0 && activeIndex > 0) {
          setActiveIndex((i) => i - 1);
        }
      }
    }
    
    // Reset drag state - animation will handle the transition
    setIsDragging(false);
    setDragOffset(0);
    
    touchStartX.current = null;
    touchStartY.current = null;
    touchCurrentX.current = null;
    isHorizontalGesture.current = null;
  };

  const goToNext = () => {
    if (activeIndex < mediaCount - 1) {
      setActiveIndex((i) => i + 1);
    }
  };

  const goToPrev = () => {
    if (activeIndex > 0) {
      setActiveIndex((i) => i - 1);
    }
  };

  // Fixed 3:4 aspect ratio - matches iPhone portrait photos perfectly
  // All images use object-contain to show full image without cropping
  const MEDIA_ASPECT_RATIO = "3/4";  // Taller portrait - minimizes whitespace for iPhone photos

  const postDate = new Date(post.captured_at || post.created_at);
  const formattedTime = postDate.toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Truncate body for display if very long
  const MAX_BODY_LENGTH = 300;
  const shouldTruncate = post.body.length > MAX_BODY_LENGTH;
  const [isExpanded, setIsExpanded] = useState(false);
  const displayBody = isExpanded || !shouldTruncate 
    ? post.body 
    : post.body.slice(0, MAX_BODY_LENGTH) + "...";

  return (
    <article ref={viewportRef} className="bg-white border-b border-border">
      {/* Header with author and time */}
      <header className="flex items-center justify-between px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron to-india-green flex items-center justify-center text-white text-sm font-semibold">
            {post.profile?.display_name?.charAt(0) || "T"}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground leading-tight">
              {post.profile?.display_name || "Tommy & Amalie"}
            </span>
            {post.location_name && post.lat && post.lng && (
              <Link
                href={`/?view=map&lat=${post.lat}&lng=${post.lng}&focusPost=${post.id}`}
                className="text-xs text-muted-foreground flex items-center gap-0.5 leading-tight hover:text-india-green hover:underline transition-colors group"
              >
                <MapPin className="h-3 w-3" />
                <span>{post.location_name}</span>
                <ChevronRight className="h-3 w-3 opacity-0 -ml-0.5 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {post.location_name && (!post.lat || !post.lng) && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5 leading-tight">
                <MapPin className="h-3 w-3" />
                {post.location_name}
              </span>
            )}
          </div>
        </div>

        {/* Day badge */}
        {showDayBadge && (
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-saffron">
              {formatDayLabel(post.dayNumber)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formattedTime}
            </span>
          </div>
        )}
      </header>

      {/* Media carousel */}
      {hasMedia && (
        <div
          ref={containerRef}
          className="relative bg-black select-none overflow-hidden touch-pan-y"
          style={{ aspectRatio: MEDIA_ASPECT_RATIO }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Sliding container - moves all items together */}
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(-${activeIndex * 100}% + ${dragOffset}px))`,
              transition: isDragging ? 'none' : `transform ${ANIMATION_DURATION}ms ease-out`,
            }}
          >
            {sortedMedia.map((media, index) => {
              // Smart loading logic (3-tier):
              // 1. Far from viewport: Show placeholder only (no network requests)
              // 2. Near viewport (hasBeenInViewport): Load thumbnails for ALL media
              // 3. Full resolution: Load when index is in fullResIndices (persists after viewing)
              const shouldLoadThumbnail = hasBeenInViewport; // Load thumbnail when near viewport
              const shouldLoadFull = fullResIndices.has(index); // Full res once visited/adjacent
              const isFullLoaded = loadedImages.has(media.id);
              
              // Get carousel thumbnail URL (for images)
              const thumbnailUrl = media.type === "image" 
                ? getCarouselThumbnailUrl(media.storage_path)
                : null;
              const fullUrl = getMediaUrl(media.storage_path);
              
              return (
                <div
                  key={media.id}
                  className="relative flex-shrink-0 w-full h-full"
                >
                  {media.type === "image" ? (
                    // IMAGE: Tap opens lightbox
                    <div 
                      className="relative w-full h-full cursor-pointer"
                      onClick={() => openLightbox(index)}
                    >
                      {/* Placeholder layer - shown when far from viewport (no network request) */}
                      {!shouldLoadThumbnail && (
                        <div className="absolute inset-0 bg-muted animate-pulse" />
                      )}
                      {/* Thumbnail layer - loads when near viewport, hidden when full loads */}
                      {shouldLoadThumbnail && thumbnailUrl && !isFullLoaded && (
                        <Image
                          src={thumbnailUrl}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="100vw"
                          priority={index === 0 && isInViewport}
                        />
                      )}
                      {/* Full resolution layer - loads when index has been visited/adjacent */}
                      {shouldLoadFull && (
                        <Image
                          src={fullUrl}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="100vw"
                          priority={index === 0 && isInViewport}
                          onLoad={() => handleImageLoad(media.id)}
                        />
                      )}
                    </div>
                  ) : !shouldLoadThumbnail ? (
                    // Placeholder for video when far from viewport
                    <div className="relative w-full h-full bg-muted animate-pulse">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="p-4 bg-black/30 rounded-full">
                          <Play className="h-10 w-10 text-white/50 fill-white/50" />
                        </div>
                      </div>
                    </div>
                  ) : playingVideos.has(media.id) ? (
                    // VIDEO PLAYING: Show video with expand button
                    <div className="relative w-full h-full">
                      <video
                        src={getMediaUrl(media.storage_path)}
                        controls
                        playsInline
                        autoPlay
                        preload="auto"
                        onCanPlay={() => handleVideoCanPlay(media.id)}
                        className="w-full h-full bg-black object-contain"
                      />
                      {/* Loading overlay */}
                      {loadingVideos.has(media.id) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
                          <Loader2 className="h-10 w-10 text-white animate-spin" />
                        </div>
                      )}
                      {/* Expand button to open in lightbox */}
                      <button
                        onClick={(e) => handleExpandVideo(index, e)}
                        className="absolute top-3 right-3 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors z-10"
                        aria-label="Åbn i fuldskærm"
                      >
                        <Maximize2 className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    // VIDEO THUMBNAIL: Tap on thumbnail opens lightbox, tap on play button starts inline
                    <div 
                      className="relative w-full h-full cursor-pointer group"
                      onClick={() => openLightbox(index)}
                    >
                      {/* Thumbnail image or video fallback */}
                      {media.thumbnail_path ? (
                        <Image
                          src={getMediaUrl(media.thumbnail_path)}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="100vw"
                          priority={index === 0 && isInViewport}
                        />
                      ) : (
                        <video
                          src={`${getMediaUrl(media.storage_path)}#t=0.001`}
                          preload="metadata"
                          muted
                          playsInline
                          className="w-full h-full pointer-events-none object-contain"
                        />
                      )}
                      {/* Play button overlay - starts inline playback */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <button
                          onClick={(e) => handlePlayVideo(media.id, e)}
                          className="p-4 bg-black/60 rounded-full group-hover:bg-black/80 group-hover:scale-110 transition-all"
                          aria-label="Afspil video"
                        >
                          <Play className="h-10 w-10 text-white fill-white" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Navigation arrows (desktop only) */}
          {mediaCount > 1 && (
            <>
              {activeIndex > 0 && (
                <button
                  onClick={goToPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md transition-all opacity-0 sm:opacity-100 sm:hover:scale-110"
                >
                  <ChevronLeft className="h-4 w-4 text-foreground" />
                </button>
              )}
              {activeIndex < mediaCount - 1 && (
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md transition-all opacity-0 sm:opacity-100 sm:hover:scale-110"
                >
                  <ChevronRight className="h-4 w-4 text-foreground" />
                </button>
              )}
            </>
          )}


          {/* Dots indicator */}
          {mediaCount > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
              {sortedMedia.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    index === activeIndex
                      ? "bg-white w-3"
                      : "bg-white/50"
                  )}
                />
              ))}
            </div>
          )}

          {/* Media counter */}
          {mediaCount > 1 && (
            <div className="absolute top-3 right-3 px-2 py-0.5 bg-black/60 rounded-full text-white text-xs font-medium">
              {activeIndex + 1}/{mediaCount}
            </div>
          )}
        </div>
      )}
      
      {/* Fullscreen Lightbox */}
      {lightboxOpen && hasMedia && (
        <MediaLightbox
          media={sortedMedia.map(m => ({
            id: m.id,
            type: m.type as "image" | "video",
            storage_path: m.storage_path,
            thumbnail_path: m.thumbnail_path,
          }))}
          initialIndex={lightboxInitialIndex}
          onClose={closeLightbox}
        />
      )}

      {/* Content section */}
      <div className="px-3 py-2.5 sm:px-4 space-y-2">
        {/* Body text */}
        <div className="text-sm text-foreground leading-relaxed">
          <p className="whitespace-pre-wrap">
            {displayBody}
          </p>
          {shouldTruncate && !isExpanded && (
            <button
              onClick={() => setIsExpanded(true)}
              className="text-muted-foreground font-medium hover:text-saffron transition-colors"
            >
              mere
            </button>
          )}
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-saffron font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

      </div>
    </article>
  );
}
