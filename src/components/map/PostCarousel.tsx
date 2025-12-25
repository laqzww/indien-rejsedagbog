"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { MapPin, Calendar, ImageIcon, Film, Play, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";
import type { Milestone } from "@/types/database";

// Post type for carousel
export interface CarouselPost {
  id: string;
  body: string;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  created_at: string;
  captured_at: string | null;
  media: {
    id: string;
    type: string;
    storage_path: string;
    thumbnail_path: string | null;
    display_order: number;
  }[];
}

interface PostCarouselProps {
  posts: CarouselPost[];
  milestone: Milestone;
  activePostIndex: number;
  onPostChange: (index: number, post: CarouselPost) => void;
  onPostClick: (post: CarouselPost) => void;
  onClose: () => void;
}

export function PostCarousel({
  posts,
  milestone,
  activePostIndex,
  onPostChange,
  onPostClick,
  onClose,
}: PostCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    loop: false,
    skipSnaps: false,
    dragFree: false,
  });

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(activePostIndex);

  // Sync carousel with external activePostIndex
  useEffect(() => {
    if (emblaApi && activePostIndex !== selectedIndex) {
      emblaApi.scrollTo(activePostIndex);
    }
  }, [emblaApi, activePostIndex, selectedIndex]);

  // Handle scroll state updates
  const onSelect = useCallback(() => {
    if (!emblaApi) return;

    const index = emblaApi.selectedScrollSnap();
    setSelectedIndex(index);
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());

    // Notify parent of post change
    if (posts[index]) {
      onPostChange(index, posts[index]);
    }
  }, [emblaApi, posts, onPostChange]);

  useEffect(() => {
    if (!emblaApi) return;

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  if (posts.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/60 via-black/30 to-transparent pb-4 pt-8">
      {/* Header with milestone name and close button */}
      <div className="flex items-center justify-between px-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-saffron text-white text-xs flex items-center justify-center font-bold">
            {milestone.display_order}
          </div>
          <span className="text-white font-medium text-sm drop-shadow-lg">
            {milestone.name}
          </span>
          <span className="text-white/70 text-xs">
            ({selectedIndex + 1}/{posts.length})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          aria-label="Luk"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Carousel */}
      <div className="relative">
        {/* Desktop navigation buttons */}
        <button
          onClick={scrollPrev}
          className={cn(
            "hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-10",
            "w-10 h-10 items-center justify-center rounded-full",
            "bg-white/90 shadow-lg hover:bg-white transition-colors",
            !canScrollPrev && "opacity-50 cursor-not-allowed"
          )}
          disabled={!canScrollPrev}
          aria-label="Forrige"
        >
          <ChevronLeft className="h-5 w-5 text-gray-700" />
        </button>

        <button
          onClick={scrollNext}
          className={cn(
            "hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-10",
            "w-10 h-10 items-center justify-center rounded-full",
            "bg-white/90 shadow-lg hover:bg-white transition-colors",
            !canScrollNext && "opacity-50 cursor-not-allowed"
          )}
          disabled={!canScrollNext}
          aria-label="Næste"
        >
          <ChevronRight className="h-5 w-5 text-gray-700" />
        </button>

        {/* Embla viewport */}
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-3 px-4 lg:px-16">
            {posts.map((post, index) => (
              <CarouselCard
                key={post.id}
                post={post}
                isActive={index === selectedIndex}
                onClick={() => onPostClick(post)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Dot indicators for mobile */}
      {posts.length > 1 && posts.length <= 10 && (
        <div className="flex justify-center gap-1.5 mt-3 lg:hidden">
          {posts.map((_, index) => (
            <button
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === selectedIndex
                  ? "bg-white w-4"
                  : "bg-white/50"
              )}
              onClick={() => emblaApi?.scrollTo(index)}
              aria-label={`Gå til opslag ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Individual carousel card
interface CarouselCardProps {
  post: CarouselPost;
  isActive: boolean;
  onClick: () => void;
}

function CarouselCard({ post, isActive, onClick }: CarouselCardProps) {
  const sortedMedia = [...post.media].sort(
    (a, b) => a.display_order - b.display_order
  );
  const firstMedia = sortedMedia[0];
  const mediaCount = sortedMedia.length;
  const imageCount = sortedMedia.filter((m) => m.type === "image").length;
  const videoCount = sortedMedia.filter((m) => m.type === "video").length;

  // Get thumbnail URL
  const getThumbnailUrl = () => {
    if (!firstMedia) return null;
    if (firstMedia.type === "video" && firstMedia.thumbnail_path) {
      return getMediaUrl(firstMedia.thumbnail_path);
    }
    if (firstMedia.type === "image") {
      return getMediaUrl(firstMedia.storage_path);
    }
    return null;
  };

  const thumbnailUrl = getThumbnailUrl();
  const isVideo = firstMedia?.type === "video";

  // Format date
  const date = new Date(post.captured_at || post.created_at);
  const formattedDate = date.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
  });

  // Truncate body text
  const truncatedBody = post.body.length > 80 
    ? post.body.slice(0, 80) + "..." 
    : post.body;

  return (
    <button
      onClick={onClick}
      className={cn(
        // Base styles - sized for carousel
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-saffron focus:ring-offset-2",
        // Active state
        isActive && "ring-2 ring-saffron"
      )}
    >
      {/* Image/Video thumbnail */}
      <div className="relative h-[120px] bg-muted">
        {thumbnailUrl ? (
          <>
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              className="object-cover"
              sizes="320px"
            />
            {/* Video play overlay */}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-2.5 bg-black/50 rounded-full">
                  <Play className="h-5 w-5 text-white fill-white" />
                </div>
              </div>
            )}
            {/* Media count badge */}
            {mediaCount > 1 && (
              <div className="absolute top-2 right-2 flex gap-1">
                {imageCount > 0 && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-black/60 rounded-full text-white text-xs">
                    <ImageIcon className="h-3 w-3" />
                    {imageCount}
                  </div>
                )}
                {videoCount > 0 && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-black/60 rounded-full text-white text-xs">
                    <Film className="h-3 w-3" />
                    {videoCount}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          // No media - show gradient placeholder
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
          >
            <span className="text-white text-3xl">📝</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Body text */}
        <p className="text-sm text-gray-800 line-clamp-2 mb-2 leading-snug">
          {truncatedBody}
        </p>

        {/* Meta info */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {post.location_name ? (
            <span className="flex items-center gap-1 truncate flex-1">
              <MapPin className="h-3 w-3 text-india-green flex-shrink-0" />
              <span className="truncate">{post.location_name}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formattedDate}
            </span>
          )}
          <span className="text-saffron font-medium whitespace-nowrap">
            Læs mere →
          </span>
        </div>
      </div>
    </button>
  );
}
