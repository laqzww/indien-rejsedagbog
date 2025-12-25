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
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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

  // Swipe handlers for touch devices
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance && activeIndex < mediaCount - 1) {
      setActiveIndex((i) => i + 1);
    } else if (distance < -minSwipeDistance && activeIndex > 0) {
      setActiveIndex((i) => i - 1);
    }
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

  // Always use tall 4:5 aspect ratio for consistent media window height
  const getAspectRatio = () => {
    return "4/5";
  };

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
            {post.location_name && (
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
          className="relative bg-black"
          style={{ aspectRatio: getAspectRatio() }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
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
                  className="object-cover"
                  sizes="100vw"
                  priority={index === 0}
                />
              ) : playingVideos.has(media.id) ? (
                // Video is playing - show actual video (object-cover to match thumbnail)
                <div className="relative w-full h-full">
                  <video
                    src={getMediaUrl(media.storage_path)}
                    controls
                    playsInline
                    autoPlay
                    preload="auto"
                    onCanPlay={() => handleVideoCanPlay(media.id)}
                    className="w-full h-full object-cover bg-black"
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
                      className="object-cover"
                      sizes="100vw"
                      priority={index === 0}
                    />
                  ) : (
                    <video
                      src={`${getMediaUrl(media.storage_path)}#t=0.001`}
                      preload="metadata"
                      muted
                      playsInline
                      className="w-full h-full object-cover pointer-events-none"
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

        {/* Location map preview */}
        {post.lat && post.lng && (
          <Link
            href={`/?view=map&lat=${post.lat}&lng=${post.lng}`}
            className="block mt-2 rounded-lg overflow-hidden border border-border hover:border-saffron transition-colors"
          >
            <div className="relative h-24 bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s-marker+FF9933(${post.lng},${post.lat})/${post.lng},${post.lat},11,0/400x150@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 bg-white/90 rounded text-[10px] font-medium text-foreground flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                Se på kort
              </div>
            </div>
          </Link>
        )}
      </div>
    </article>
  );
}
