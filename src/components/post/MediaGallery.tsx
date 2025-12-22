"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";
import { ChevronLeft, ChevronRight, X, Film, ZoomIn, Play, Loader2 } from "lucide-react";
import type { Media } from "@/types/database";

interface MediaGalleryProps {
  media: Media[];
}

export function MediaGallery({ media }: MediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Track which videos are playing (by media id)
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
  const [loadingVideos, setLoadingVideos] = useState<Set<string>>(new Set());
  
  const handlePlayVideo = (mediaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  if (media.length === 0) return null;

  const activeMedia = media[activeIndex];

  const goToNext = () => {
    setActiveIndex((i) => (i + 1) % media.length);
  };

  const goToPrev = () => {
    setActiveIndex((i) => (i - 1 + media.length) % media.length);
  };

  return (
    <>
      {/* Main gallery */}
      <div className="relative rounded-xl overflow-hidden bg-muted">
        {/* Active media */}
        <div
          className="relative aspect-[4/3] md:aspect-video cursor-pointer"
          onClick={() => activeMedia.type === "image" && setIsFullscreen(true)}
        >
          {activeMedia.type === "image" ? (
            <Image
              src={getMediaUrl(activeMedia.storage_path)}
              alt=""
              fill
              className="object-contain bg-black"
              sizes="(max-width: 768px) 100vw, 800px"
              priority
            />
          ) : playingVideos.has(activeMedia.id) ? (
            // Video is playing - show actual video (object-cover to match thumbnail)
            <div className="relative w-full h-full">
              <video
                src={getMediaUrl(activeMedia.storage_path)}
                controls
                playsInline
                autoPlay
                preload="auto"
                onCanPlay={() => handleVideoCanPlay(activeMedia.id)}
                className="w-full h-full object-cover bg-black"
                onClick={(e) => e.stopPropagation()}
              />
              {/* Loading overlay */}
              {loadingVideos.has(activeMedia.id) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
                  <Loader2 className="h-10 w-10 text-white animate-spin" />
                </div>
              )}
            </div>
          ) : (
            // Video thumbnail with play button
            <div 
              className="relative w-full h-full group"
              onClick={(e) => handlePlayVideo(activeMedia.id, e)}
            >
              {/* Thumbnail image or video fallback */}
              {activeMedia.thumbnail_path ? (
                <Image
                  src={getMediaUrl(activeMedia.thumbnail_path)}
                  alt=""
                  fill
                  className="object-contain bg-black"
                  sizes="(max-width: 768px) 100vw, 800px"
                  priority
                />
              ) : (
                <video
                  src={`${getMediaUrl(activeMedia.storage_path)}#t=0.001`}
                  preload="metadata"
                  muted
                  playsInline
                  className="w-full h-full object-contain bg-black pointer-events-none"
                />
              )}
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-5 bg-black/60 rounded-full group-hover:bg-black/80 group-hover:scale-110 transition-all">
                  <Play className="h-12 w-12 text-white fill-white" />
                </div>
              </div>
            </div>
          )}

          {/* Zoom hint for images */}
          {activeMedia.type === "image" && (
            <div className="absolute bottom-4 right-4 p-2 bg-black/50 rounded-full text-white opacity-0 hover:opacity-100 transition-opacity">
              <ZoomIn className="h-5 w-5" />
            </div>
          )}
        </div>

        {/* Navigation arrows */}
        {media.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrev();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {media.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {media.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(index);
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  index === activeIndex
                    ? "bg-white w-4"
                    : "bg-white/50 hover:bg-white/75"
                )}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto py-2 -mx-4 px-4 scrollbar-hide">
          {media.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all",
                index === activeIndex
                  ? "ring-2 ring-saffron ring-offset-2"
                  : "opacity-60 hover:opacity-100"
              )}
            >
              {item.type === "image" ? (
                <Image
                  src={getMediaUrl(item.storage_path)}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              ) : item.thumbnail_path ? (
                <div className="relative w-full h-full">
                  <Image
                    src={getMediaUrl(item.thumbnail_path)}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play className="h-4 w-4 text-white fill-white drop-shadow-md" />
                  </div>
                </div>
              ) : (
                <div className="w-full h-full bg-navy/10 flex items-center justify-center">
                  <Film className="h-6 w-6 text-navy/40" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen modal */}
      {isFullscreen && activeMedia.type === "image" && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
            onClick={() => setIsFullscreen(false)}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation in fullscreen */}
          {media.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}

          <Image
            src={getMediaUrl(activeMedia.storage_path)}
            alt=""
            fill
            className="object-contain"
            sizes="100vw"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 rounded-full text-white text-sm">
            {activeIndex + 1} / {media.length}
          </div>
        </div>
      )}
    </>
  );
}

