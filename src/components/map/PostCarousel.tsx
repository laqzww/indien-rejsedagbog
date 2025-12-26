"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { MapPin, Calendar, ImageIcon, Film, Play, ChevronLeft, ChevronRight, X, ChevronUp, ChevronDown } from "lucide-react";
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

// View mode for the carousel
export type CarouselViewMode = "milestones" | "posts";

interface JourneyCarouselProps {
  milestones: Milestone[];
  activeMilestone: Milestone;
  activeMilestoneIndex: number;
  posts: CarouselPost[];
  activePostIndex: number;
  viewMode: CarouselViewMode;
  onViewModeChange: (mode: CarouselViewMode) => void;
  onMilestoneChange: (index: number, milestone: Milestone) => void;
  onPostChange: (index: number, post: CarouselPost) => void;
  onPostClick: (post: CarouselPost) => void;
  onClose: () => void;
  // Function to get posts for a milestone (for showing post count)
  getPostsForMilestone: (milestone: Milestone) => CarouselPost[];
}

export function JourneyCarousel({
  milestones,
  activeMilestone,
  activeMilestoneIndex,
  posts,
  activePostIndex,
  viewMode,
  onViewModeChange,
  onMilestoneChange,
  onPostChange,
  onPostClick,
  onClose,
  getPostsForMilestone,
}: JourneyCarouselProps) {
  // Milestone carousel
  const [milestoneEmblaRef, milestoneEmblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    loop: false,
    skipSnaps: false,
    dragFree: false,
    startIndex: activeMilestoneIndex,
  });

  // Post carousel
  const [postEmblaRef, postEmblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    loop: false,
    skipSnaps: false,
    dragFree: false,
    startIndex: activePostIndex,
  });

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [selectedMilestoneIndex, setSelectedMilestoneIndex] = useState(activeMilestoneIndex);
  const [selectedPostIndex, setSelectedPostIndex] = useState(activePostIndex);
  
  // Track if we're programmatically scrolling to avoid feedback loops
  const isProgrammaticScroll = useRef(false);

  // Get the active API based on view mode
  const activeApi = viewMode === "milestones" ? milestoneEmblaApi : postEmblaApi;

  // Sync milestone carousel with external index
  useEffect(() => {
    if (milestoneEmblaApi && activeMilestoneIndex !== selectedMilestoneIndex) {
      isProgrammaticScroll.current = true;
      milestoneEmblaApi.scrollTo(activeMilestoneIndex);
      setTimeout(() => { isProgrammaticScroll.current = false; }, 100);
    }
  }, [milestoneEmblaApi, activeMilestoneIndex, selectedMilestoneIndex]);

  // Sync post carousel with external index
  useEffect(() => {
    if (postEmblaApi && activePostIndex !== selectedPostIndex) {
      isProgrammaticScroll.current = true;
      postEmblaApi.scrollTo(activePostIndex);
      setTimeout(() => { isProgrammaticScroll.current = false; }, 100);
    }
  }, [postEmblaApi, activePostIndex, selectedPostIndex]);

  // Handle milestone carousel scroll
  const onMilestoneSelect = useCallback(() => {
    if (!milestoneEmblaApi || isProgrammaticScroll.current) return;

    const index = milestoneEmblaApi.selectedScrollSnap();
    setSelectedMilestoneIndex(index);

    if (milestones[index]) {
      onMilestoneChange(index, milestones[index]);
    }
  }, [milestoneEmblaApi, milestones, onMilestoneChange]);

  // Handle post carousel scroll
  const onPostSelect = useCallback(() => {
    if (!postEmblaApi || isProgrammaticScroll.current) return;

    const index = postEmblaApi.selectedScrollSnap();
    setSelectedPostIndex(index);

    if (posts[index]) {
      onPostChange(index, posts[index]);
    }
  }, [postEmblaApi, posts, onPostChange]);

  // Update scroll state for active carousel
  const updateScrollState = useCallback(() => {
    if (!activeApi) return;
    setCanScrollPrev(activeApi.canScrollPrev());
    setCanScrollNext(activeApi.canScrollNext());
  }, [activeApi]);

  // Setup milestone carousel listeners
  useEffect(() => {
    if (!milestoneEmblaApi) return;

    milestoneEmblaApi.on("select", onMilestoneSelect);
    milestoneEmblaApi.on("reInit", onMilestoneSelect);

    return () => {
      milestoneEmblaApi.off("select", onMilestoneSelect);
      milestoneEmblaApi.off("reInit", onMilestoneSelect);
    };
  }, [milestoneEmblaApi, onMilestoneSelect]);

  // Setup post carousel listeners
  useEffect(() => {
    if (!postEmblaApi) return;

    postEmblaApi.on("select", onPostSelect);
    postEmblaApi.on("reInit", onPostSelect);

    return () => {
      postEmblaApi.off("select", onPostSelect);
      postEmblaApi.off("reInit", onPostSelect);
    };
  }, [postEmblaApi, onPostSelect]);

  // Update scroll state when view mode or API changes
  useEffect(() => {
    updateScrollState();
    if (activeApi) {
      activeApi.on("select", updateScrollState);
      activeApi.on("reInit", updateScrollState);
      return () => {
        activeApi.off("select", updateScrollState);
        activeApi.off("reInit", updateScrollState);
      };
    }
  }, [activeApi, updateScrollState]);

  const scrollPrev = useCallback(() => {
    activeApi?.scrollPrev();
  }, [activeApi]);

  const scrollNext = useCallback(() => {
    activeApi?.scrollNext();
  }, [activeApi]);

  // Toggle view mode
  const handleToggleViewMode = useCallback(() => {
    onViewModeChange(viewMode === "milestones" ? "posts" : "milestones");
  }, [viewMode, onViewModeChange]);

  // Handle milestone card click - switch to posts view
  const handleMilestoneCardClick = useCallback(() => {
    onViewModeChange("posts");
  }, [onViewModeChange]);

  // Handle post card click
  const handlePostCardClick = useCallback((post: CarouselPost) => {
    // In posts mode, clicking navigates to full post
    onPostClick(post);
  }, [onPostClick]);

  const itemCount = viewMode === "milestones" ? milestones.length : posts.length;
  const selectedIndex = viewMode === "milestones" ? selectedMilestoneIndex : selectedPostIndex;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/60 via-black/30 to-transparent pb-4 pt-8">
      {/* Header with view mode toggle */}
      <div className="flex items-center justify-between px-4 mb-3">
        <button
          onClick={handleToggleViewMode}
          className="flex items-center gap-2 group"
        >
          <div className="w-6 h-6 rounded-full bg-saffron text-white text-xs flex items-center justify-center font-bold">
            {viewMode === "milestones" ? selectedMilestoneIndex + 1 : activeMilestone.display_order}
          </div>
          <span className="text-white font-medium text-sm drop-shadow-lg">
            {viewMode === "milestones" 
              ? `${milestones.length} destinationer`
              : activeMilestone.name
            }
          </span>
          <span className="text-white/70 text-xs">
            ({selectedIndex + 1}/{itemCount})
          </span>
          {/* Toggle indicator */}
          <div className="ml-1 p-1 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors">
            {viewMode === "milestones" ? (
              <ChevronDown className="h-3 w-3 text-white" />
            ) : (
              <ChevronUp className="h-3 w-3 text-white" />
            )}
          </div>
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          aria-label="Luk"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* View mode indicator pills */}
      <div className="flex justify-center gap-2 mb-3">
        <button
          onClick={() => onViewModeChange("milestones")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-all",
            viewMode === "milestones"
              ? "bg-saffron text-white"
              : "bg-white/20 text-white/80 hover:bg-white/30"
          )}
        >
          Destinationer
        </button>
        <button
          onClick={() => onViewModeChange("posts")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-all",
            viewMode === "posts"
              ? "bg-saffron text-white"
              : "bg-white/20 text-white/80 hover:bg-white/30"
          )}
        >
          Opslag
        </button>
      </div>

      {/* Carousel container */}
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

        {/* Milestones carousel */}
        <div 
          className={cn(
            "overflow-hidden transition-opacity duration-200",
            viewMode === "milestones" ? "block" : "hidden"
          )} 
          ref={milestoneEmblaRef}
        >
          <div className="flex gap-3 px-4 lg:px-16">
            {milestones.map((milestone, index) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                postCount={getPostsForMilestone(milestone).length}
                isActive={index === selectedMilestoneIndex}
                onClick={handleMilestoneCardClick}
              />
            ))}
          </div>
        </div>

        {/* Posts carousel */}
        <div 
          className={cn(
            "overflow-hidden transition-opacity duration-200",
            viewMode === "posts" ? "block" : "hidden"
          )} 
          ref={postEmblaRef}
        >
          <div className="flex gap-3 px-4 lg:px-16">
            {posts.length > 0 ? (
              posts.map((post, index) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isActive={index === selectedPostIndex}
                  onClick={() => handlePostCardClick(post)}
                />
              ))
            ) : (
              <EmptyPostsCard milestoneName={activeMilestone.name} />
            )}
          </div>
        </div>
      </div>

      {/* Dot indicators for mobile */}
      {itemCount > 1 && itemCount <= 10 && (
        <div className="flex justify-center gap-1.5 mt-3 lg:hidden">
          {Array.from({ length: itemCount }).map((_, index) => (
            <button
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === selectedIndex
                  ? "bg-white w-4"
                  : "bg-white/50"
              )}
              onClick={() => activeApi?.scrollTo(index)}
              aria-label={`Gå til ${viewMode === "milestones" ? "destination" : "opslag"} ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Milestone card component
interface MilestoneCardProps {
  milestone: Milestone;
  postCount: number;
  isActive: boolean;
  onClick: () => void;
}

function MilestoneCard({ milestone, postCount, isActive, onClick }: MilestoneCardProps) {
  // Format date range
  const formatDateRange = () => {
    if (!milestone.arrival_date) return null;
    const arrival = new Date(milestone.arrival_date);
    const arrivalStr = arrival.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
    
    if (!milestone.departure_date) return arrivalStr;
    
    const departure = new Date(milestone.departure_date);
    const departureStr = departure.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
    return `${arrivalStr} – ${departureStr}`;
  };

  const dateRange = formatDateRange();

  return (
    <button
      onClick={onClick}
      className={cn(
        // Base styles
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-saffron focus:ring-offset-2",
        isActive && "ring-2 ring-saffron"
      )}
    >
      {/* Header with gradient */}
      <div 
        className="h-[100px] flex items-center justify-center relative"
        style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
      >
        <div className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <span className="text-white font-bold text-lg">{milestone.display_order}</span>
        </div>
        <h3 className="text-white text-xl font-bold text-center px-4 drop-shadow-lg">
          {milestone.name}
        </h3>
      </div>

      {/* Content */}
      <div className="p-3">
        {milestone.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {milestone.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            {dateRange && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {dateRange}
              </span>
            )}
            <span className="flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              {postCount} opslag
            </span>
          </div>
          <span className="text-saffron font-medium">
            Se opslag →
          </span>
        </div>
      </div>
    </button>
  );
}

// Post card component
interface PostCardProps {
  post: CarouselPost;
  isActive: boolean;
  onClick: () => void;
}

function PostCard({ post, isActive, onClick }: PostCardProps) {
  const sortedMedia = [...post.media].sort(
    (a, b) => a.display_order - b.display_order
  );
  const firstMedia = sortedMedia[0];
  const mediaCount = sortedMedia.length;
  const imageCount = sortedMedia.filter((m) => m.type === "image").length;
  const videoCount = sortedMedia.filter((m) => m.type === "video").length;

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

  const date = new Date(post.captured_at || post.created_at);
  const formattedDate = date.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
  });

  const truncatedBody = post.body.length > 80 
    ? post.body.slice(0, 80) + "..." 
    : post.body;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-saffron focus:ring-offset-2",
        isActive && "ring-2 ring-saffron"
      )}
    >
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
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-2.5 bg-black/50 rounded-full">
                  <Play className="h-5 w-5 text-white fill-white" />
                </div>
              </div>
            )}
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
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
          >
            <span className="text-white text-3xl">📝</span>
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="text-sm text-gray-800 line-clamp-2 mb-2 leading-snug">
          {truncatedBody}
        </p>

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

// Empty state when milestone has no posts
function EmptyPostsCard({ milestoneName }: { milestoneName: string }) {
  return (
    <div
      className={cn(
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px]",
        "bg-white/90 rounded-xl overflow-hidden shadow-xl",
        "flex flex-col items-center justify-center p-6 text-center"
      )}
    >
      <div 
        className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
        style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
      >
        <ImageIcon className="h-8 w-8 text-white" />
      </div>
      <p className="text-gray-600 text-sm">
        Ingen opslag for <span className="font-medium">{milestoneName}</span> endnu
      </p>
    </div>
  );
}

// Keep the old export for backwards compatibility
export { JourneyCarousel as PostCarousel };
