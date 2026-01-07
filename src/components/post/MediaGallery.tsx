"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";
import { ChevronLeft, ChevronRight, X, Film, ZoomIn, Play, Loader2 } from "lucide-react";
import type { Media } from "@/types/database";
import useEmblaCarousel from "embla-carousel-react";

interface MediaGalleryProps {
  media: Media[];
}

export function MediaGallery({ media }: MediaGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Embla carousel for the main view
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true,
    duration: 30,
    align: "center",
    skipSnaps: false,
  });

  // Embla carousel for fullscreen view
  const [fullscreenEmblaRef, fullscreenEmblaApi] = useEmblaCarousel({
    loop: true,
    duration: 30,
    align: "center",
    skipSnaps: false,
  });

  // Track playing videos
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
  const [loadingVideos, setLoadingVideos] = useState<Set<string>>(new Set());

  // Sync internal state with Embla
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Sync fullscreen carousel when opening
  useEffect(() => {
    if (isFullscreen && fullscreenEmblaApi) {
      fullscreenEmblaApi.scrollTo(selectedIndex, true);
    }
  }, [isFullscreen, fullscreenEmblaApi, selectedIndex]);

  // Sync main carousel when fullscreen changes (if user swiped in fullscreen)
  useEffect(() => {
    if (!fullscreenEmblaApi) return;
    
    const onFullscreenSelect = () => {
      const index = fullscreenEmblaApi.selectedScrollSnap();
      setSelectedIndex(index);
      if (emblaApi) emblaApi.scrollTo(index, true);
    };

    fullscreenEmblaApi.on("select", onFullscreenSelect);
    return () => {
      fullscreenEmblaApi.off("select", onFullscreenSelect);
    };
  }, [fullscreenEmblaApi, emblaApi]);

  const scrollTo = useCallback((index: number) => {
    if (emblaApi) emblaApi.scrollTo(index);
  }, [emblaApi]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

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

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  if (media.length === 0) return null;

  return (
    <>
      {/* Main gallery */}
      <div className="relative rounded-xl overflow-hidden bg-muted group/gallery">
        <div className="overflow-hidden touch-pan-y" ref={emblaRef}>
          <div className="flex">
            {media.map((item) => (
              <div 
                key={item.id} 
                className="flex-[0_0_100%] min-w-0 relative aspect-[4/3] cursor-pointer"
                onClick={() => {
                   if (item.type === "image") setIsFullscreen(true);
                }}
              >
                {item.type === "image" ? (
                  <Image
                    src={getMediaUrl(item.storage_path)}
                    alt=""
                    fill
                    className="object-contain bg-black select-none"
                    sizes="(max-width: 768px) 100vw, 800px"
                    priority={selectedIndex === media.indexOf(item)}
                  />
                ) : playingVideos.has(item.id) ? (
                  <div className="relative w-full h-full">
                    <video
                      src={getMediaUrl(item.storage_path)}
                      controls
                      playsInline
                      autoPlay
                      preload="auto"
                      onCanPlay={() => handleVideoCanPlay(item.id)}
                      className="w-full h-full object-cover bg-black"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {loadingVideos.has(item.id) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
                        <Loader2 className="h-10 w-10 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div 
                    className="relative w-full h-full group"
                    onClick={(e) => handlePlayVideo(item.id, e)}
                  >
                    {item.thumbnail_path ? (
                      <Image
                        src={getMediaUrl(item.thumbnail_path)}
                        alt=""
                        fill
                        className="object-contain bg-black select-none"
                        sizes="(max-width: 768px) 100vw, 800px"
                        priority={selectedIndex === media.indexOf(item)}
                      />
                    ) : (
                      <video
                        src={`${getMediaUrl(item.storage_path)}#t=0.001`}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-contain bg-black pointer-events-none"
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="p-5 bg-black/60 rounded-full group-hover:bg-black/80 group-hover:scale-110 transition-all">
                        <Play className="h-12 w-12 text-white fill-white" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Zoom hint for images */}
                {item.type === "image" && (
                  <div className="absolute bottom-4 right-4 p-2 bg-black/50 rounded-full text-white opacity-0 group-hover/gallery:opacity-100 transition-opacity pointer-events-none">
                    <ZoomIn className="h-5 w-5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation arrows */}
        {media.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollPrev();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors opacity-0 group-hover/gallery:opacity-100"
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollNext();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors opacity-0 group-hover/gallery:opacity-100"
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {media.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
            {media.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-all shadow-sm",
                  index === selectedIndex
                    ? "bg-white w-4"
                    : "bg-white/50"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto py-2 scrollbar-hide touch-pan-x">
          {media.map((item, index) => (
            <button
              key={item.id}
              onClick={() => scrollTo(index)}
              className={cn(
                "relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all",
                index === selectedIndex
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
      {isFullscreen && (
        <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center animate-fade-in">
          <div className="absolute inset-0 flex items-center justify-center w-full h-full overflow-hidden touch-pan-y" ref={fullscreenEmblaRef}>
            <div className="flex h-full w-full">
              {media.map((item) => (
                <div key={item.id} className="flex-[0_0_100%] min-w-0 relative flex items-center justify-center h-full">
                  {item.type === "image" ? (
                    <Image
                      src={getMediaUrl(item.storage_path)}
                      alt=""
                      fill
                      className="object-contain"
                      sizes="100vw"
                      priority
                    />
                  ) : (
                    <video
                       src={getMediaUrl(item.storage_path)}
                       controls
                       className="max-h-full max-w-full"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors z-50"
            onClick={() => setIsFullscreen(false)}
          >
            <X className="h-8 w-8" />
          </button>

          {/* Navigation in fullscreen (visible on desktop) */}
          {media.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (fullscreenEmblaApi) fullscreenEmblaApi.scrollPrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50 hidden md:block"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (fullscreenEmblaApi) fullscreenEmblaApi.scrollNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50 hidden md:block"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}

          {/* Counter */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/50 rounded-full text-white text-sm backdrop-blur-sm z-50">
            {selectedIndex + 1} / {media.length}
          </div>
        </div>
      )}
    </>
  );
}
