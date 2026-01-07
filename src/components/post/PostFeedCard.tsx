"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";
import { MapPin, ChevronLeft, ChevronRight, Play, Loader2 } from "lucide-react";
import { formatDayLabel } from "@/lib/journey";
import type { PostWithDayInfo } from "@/lib/journey";

interface PostFeedCardProps {
  post: PostWithDayInfo;
  showDayBadge?: boolean;
}

export function PostFeedCard({ post, showDayBadge = true }: PostFeedCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  
  // Track which videos are playing (by media id)
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
  const [loadingVideos, setLoadingVideos] = useState<Set<string>>(new Set());
  
  const handlePlayVideo = (mediaId: string) => {
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

  // Sort media by display_order to ensure correct order
  const sortedMedia = [...post.media].sort(
    (a, b) => a.display_order - b.display_order
  );
  const mediaCount = sortedMedia.length;
  const hasMedia = mediaCount > 0;

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchStartX.current - touchEndX;
    const deltaY = touchStartY.current - touchEndY;
    
    // Only trigger if horizontal swipe is greater than vertical (to not interfere with scroll)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0 && activeIndex < mediaCount - 1) {
        setActiveIndex((i) => i + 1);
      } else if (deltaX < 0 && activeIndex > 0) {
        setActiveIndex((i) => i - 1);
      }
    }
    
    touchStartX.current = null;
    touchStartY.current = null;
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
    <article className="bg-white border-b border-border">
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
          className="relative bg-black select-none"
          style={{ aspectRatio: MEDIA_ASPECT_RATIO }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {sortedMedia.map((media, index) => (
            <div
              key={media.id}
              className={cn(
                "absolute inset-0 transition-opacity duration-300",
                index === activeIndex ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
            >
              {media.type === "image" ? (
                <Image
                  src={getMediaUrl(media.storage_path)}
                  alt=""
                  fill
                  className="object-contain"
                  sizes="100vw"
                  priority={index === 0}
                />
              ) : playingVideos.has(media.id) ? (
                // Video is playing - show actual video
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
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-10 w-10 text-white animate-spin" />
                    </div>
                  )}
                </div>
              ) : (
                // Video thumbnail with play button
                <div 
                  className="relative w-full h-full cursor-pointer group"
                  onClick={() => handlePlayVideo(media.id)}
                >
                  {/* Thumbnail image or video fallback */}
                  {media.thumbnail_path ? (
                    <Image
                      src={getMediaUrl(media.thumbnail_path)}
                      alt=""
                      fill
                      className="object-contain"
                      sizes="100vw"
                      priority={index === 0}
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
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="p-4 bg-black/60 rounded-full group-hover:bg-black/80 group-hover:scale-110 transition-all">
                      <Play className="h-10 w-10 text-white fill-white" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Navigation arrows */}
          {mediaCount > 1 && (
            <>
              {activeIndex > 0 && (
                <button
                  onClick={goToPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {activeIndex < mediaCount - 1 && (
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
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
