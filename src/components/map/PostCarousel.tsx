"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { MapPin, ImageIcon, Film, Play, ChevronLeft, ChevronRight, X } from "lucide-react";
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
  // Milestone carousel - always start at current milestone index
  const [milestoneEmblaRef, milestoneEmblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    loop: false,
    skipSnaps: false,
    dragFree: false,
  });

  // Post carousel
  const [postEmblaRef, postEmblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    loop: false,
    skipSnaps: false,
    dragFree: false,
  });

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [selectedMilestoneIndex, setSelectedMilestoneIndex] = useState(activeMilestoneIndex);
  const [selectedPostIndex, setSelectedPostIndex] = useState(activePostIndex);
  
  // Track if we're programmatically scrolling to avoid feedback loops
  const isProgrammaticScrollRef = useRef(false);
  // Track the previous view mode to detect changes
  const prevViewModeRef = useRef(viewMode);

  // Get the active API based on view mode
  const activeApi = viewMode === "milestones" ? milestoneEmblaApi : postEmblaApi;

  // Initialize milestone carousel position when API is ready
  useEffect(() => {
    if (!milestoneEmblaApi) return;
    
    // On mount, scroll to the active milestone
    isProgrammaticScrollRef.current = true;
    milestoneEmblaApi.scrollTo(activeMilestoneIndex, false); // instant scroll (no animation)
    setSelectedMilestoneIndex(activeMilestoneIndex);
    
    // Use requestAnimationFrame to reset the flag after embla has processed
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [milestoneEmblaApi]); // Only on API init - activeMilestoneIndex is handled separately

  // Sync milestone carousel when external index changes
  useEffect(() => {
    if (!milestoneEmblaApi) return;
    if (activeMilestoneIndex === selectedMilestoneIndex) return;
    
    isProgrammaticScrollRef.current = true;
    milestoneEmblaApi.scrollTo(activeMilestoneIndex);
    setSelectedMilestoneIndex(activeMilestoneIndex);
    
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [milestoneEmblaApi, activeMilestoneIndex, selectedMilestoneIndex]);

  // Initialize post carousel position when API is ready
  useEffect(() => {
    if (!postEmblaApi) return;
    
    // On mount, scroll to the active post
    isProgrammaticScrollRef.current = true;
    postEmblaApi.scrollTo(activePostIndex, false); // instant scroll
    setSelectedPostIndex(activePostIndex);
    
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [postEmblaApi]); // Only on API init

  // Sync post carousel when external index changes OR when posts array changes
  useEffect(() => {
    if (!postEmblaApi) return;
    if (activePostIndex === selectedPostIndex && posts.length > 0) return;
    
    isProgrammaticScrollRef.current = true;
    // Reposition to the new active post index (clamped to valid range)
    const validIndex = Math.min(activePostIndex, Math.max(0, posts.length - 1));
    postEmblaApi.scrollTo(validIndex, false);
    setSelectedPostIndex(validIndex);
    
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [postEmblaApi, activePostIndex, selectedPostIndex, posts.length]);

  // Handle view mode changes - reset carousel position appropriately
  useEffect(() => {
    const prevMode = prevViewModeRef.current;
    prevViewModeRef.current = viewMode;
    
    if (prevMode === viewMode) return;
    
    // When switching to posts view, scroll to first post
    if (viewMode === "posts" && postEmblaApi) {
      isProgrammaticScrollRef.current = true;
      postEmblaApi.scrollTo(0, false);
      setSelectedPostIndex(0);
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
    
    // When switching to milestones view, scroll to current milestone
    if (viewMode === "milestones" && milestoneEmblaApi) {
      isProgrammaticScrollRef.current = true;
      milestoneEmblaApi.scrollTo(activeMilestoneIndex, false);
      setSelectedMilestoneIndex(activeMilestoneIndex);
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
    
    // Update scroll buttons for new view
    requestAnimationFrame(() => {
      updateScrollState();
    });
  }, [viewMode, postEmblaApi, milestoneEmblaApi, activeMilestoneIndex]);

  // Handle milestone carousel scroll
  const onMilestoneSelect = useCallback(() => {
    if (!milestoneEmblaApi || isProgrammaticScrollRef.current) return;

    const index = milestoneEmblaApi.selectedScrollSnap();
    if (index === selectedMilestoneIndex) return;
    
    setSelectedMilestoneIndex(index);

    if (milestones[index]) {
      onMilestoneChange(index, milestones[index]);
    }
  }, [milestoneEmblaApi, milestones, onMilestoneChange, selectedMilestoneIndex]);

  // Handle post carousel scroll
  const onPostSelect = useCallback(() => {
    if (!postEmblaApi || isProgrammaticScrollRef.current) return;

    const index = postEmblaApi.selectedScrollSnap();
    if (index === selectedPostIndex) return;
    
    setSelectedPostIndex(index);

    if (posts[index]) {
      onPostChange(index, posts[index]);
    }
  }, [postEmblaApi, posts, onPostChange, selectedPostIndex]);

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

  // Toggle view mode by clicking on milestone badge
  const handleBadgeClick = useCallback(() => {
    const newMode = viewMode === "milestones" ? "posts" : "milestones";
    onViewModeChange(newMode);
  }, [viewMode, onViewModeChange]);

  // Handle milestone card click - switch to posts view
  const handleMilestoneCardClick = useCallback(() => {
    onViewModeChange("posts");
  }, [onViewModeChange]);

  // Handle post card click
  const handlePostCardClick = useCallback((post: CarouselPost) => {
    onPostClick(post);
  }, [onPostClick]);

  const itemCount = viewMode === "milestones" ? milestones.length : posts.length;
  const selectedIndex = viewMode === "milestones" ? selectedMilestoneIndex : selectedPostIndex;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pb-3 pt-2">
      {/* Minimal header - just milestone badge and close */}
      <div className="flex items-center justify-between px-3 mb-2">
        <button
          onClick={handleBadgeClick}
          className="flex items-center gap-2 group px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/50 transition-colors"
          title={viewMode === "milestones" ? "Vis opslag" : "Vis destinationer"}
        >
          <div className="w-5 h-5 rounded-full bg-saffron text-white text-xs flex items-center justify-center font-bold">
            {activeMilestone.display_order + 1}
          </div>
          <span className="text-white text-sm font-medium">
            {viewMode === "milestones" 
              ? `${selectedMilestoneIndex + 1}/${milestones.length}`
              : activeMilestone.name
            }
          </span>
          {viewMode === "posts" && posts.length > 0 && (
            <span className="text-white/60 text-xs">
              {selectedPostIndex + 1}/{posts.length}
            </span>
          )}
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
          aria-label="Luk"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Carousel container */}
      <div className="relative">
        {/* Desktop navigation buttons */}
        <button
          onClick={scrollPrev}
          className={cn(
            "hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-10",
            "w-8 h-8 items-center justify-center rounded-full",
            "bg-white/90 shadow-md hover:bg-white transition-colors",
            !canScrollPrev && "opacity-40 cursor-not-allowed"
          )}
          disabled={!canScrollPrev}
          aria-label="Forrige"
        >
          <ChevronLeft className="h-4 w-4 text-gray-700" />
        </button>

        <button
          onClick={scrollNext}
          className={cn(
            "hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-10",
            "w-8 h-8 items-center justify-center rounded-full",
            "bg-white/90 shadow-md hover:bg-white transition-colors",
            !canScrollNext && "opacity-40 cursor-not-allowed"
          )}
          disabled={!canScrollNext}
          aria-label="Næste"
        >
          <ChevronRight className="h-4 w-4 text-gray-700" />
        </button>

        {/* Milestones carousel */}
        <div 
          className={cn(
            "overflow-hidden",
            viewMode === "milestones" ? "block" : "hidden"
          )} 
          ref={milestoneEmblaRef}
        >
          <div className="flex gap-3 px-4 lg:px-16">
            {milestones.map((milestone, index) => (
              <CompactMilestoneCard
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
            "overflow-hidden",
            viewMode === "posts" ? "block" : "hidden"
          )} 
          ref={postEmblaRef}
        >
          <div className="flex gap-3 px-4 lg:px-16">
            {posts.length > 0 ? (
              posts.map((post, index) => (
                <CompactPostCard
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

      {/* Compact dot indicators for mobile - only when many items */}
      {itemCount > 1 && itemCount <= 8 && (
        <div className="flex justify-center gap-1 mt-2 lg:hidden">
          {Array.from({ length: itemCount }).map((_, index) => (
            <button
              key={index}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                index === selectedIndex
                  ? "bg-white w-3"
                  : "bg-white/40"
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

// Milestone card component - larger and more prominent
interface CompactMilestoneCardProps {
  milestone: Milestone;
  postCount: number;
  isActive: boolean;
  onClick: () => void;
}

function CompactMilestoneCard({ milestone, postCount, isActive, onClick }: CompactMilestoneCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // Match post card sizes for consistent layout
        "flex-shrink-0 w-[260px] sm:w-[300px] lg:w-[340px]",
        "bg-white/95 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg",
        "text-left transition-all duration-150",
        "hover:bg-white hover:shadow-xl hover:scale-[1.02]",
        "focus:outline-none focus:ring-2 focus:ring-saffron",
        isActive && "ring-2 ring-saffron shadow-xl"
      )}
    >
      <div className="flex items-center gap-4 p-4 h-[100px] sm:h-[110px]">
        {/* Large milestone number badge */}
        <div 
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center flex-shrink-0 shadow-md"
          style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
        >
          <span className="text-white font-bold text-xl sm:text-2xl">{milestone.display_order + 1}</span>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate mb-1">
            {milestone.name}
          </h3>
          <p className="text-sm text-gray-500 flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4" />
            {postCount} opslag
            <span className="text-saffron font-medium ml-1">Tryk for at se →</span>
          </p>
        </div>
      </div>
    </button>
  );
}

// Post card component with larger, more prominent image
interface CompactPostCardProps {
  post: CarouselPost;
  isActive: boolean;
  onClick: () => void;
}

function CompactPostCard({ post, isActive, onClick }: CompactPostCardProps) {
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

  const truncatedBody = post.body.length > 60 
    ? post.body.slice(0, 60) + "..." 
    : post.body;

  return (
    <button
      onClick={onClick}
      className={cn(
        // Larger card sizes for better visibility
        "flex-shrink-0 w-[260px] sm:w-[300px] lg:w-[340px]",
        "bg-white/95 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg",
        "text-left transition-all duration-150",
        "hover:bg-white hover:shadow-xl hover:scale-[1.02]",
        "focus:outline-none focus:ring-2 focus:ring-saffron",
        isActive && "ring-2 ring-saffron shadow-xl"
      )}
    >
      {/* Horizontal layout with large image on left */}
      <div className="flex h-[100px] sm:h-[110px]">
        {/* Large thumbnail - takes significant portion of card */}
        <div className="relative w-[100px] sm:w-[120px] h-full flex-shrink-0 bg-muted">
          {thumbnailUrl ? (
            <>
              <Image
                src={thumbnailUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100px, 120px"
              />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-8 w-8 text-white fill-white drop-shadow-lg" />
                </div>
              )}
              {mediaCount > 1 && (
                <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                  {imageCount > 1 && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-black/70 rounded text-white text-xs">
                      <ImageIcon className="h-3 w-3" />
                      {imageCount}
                    </div>
                  )}
                  {videoCount > 0 && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-black/70 rounded text-white text-xs">
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
              <span className="text-white text-2xl">📝</span>
            </div>
          )}
        </div>
        
        {/* Content section */}
        <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
          <p className="text-sm text-gray-800 line-clamp-2 leading-snug mb-1.5">
            {truncatedBody}
          </p>
          {post.location_name && (
            <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 text-india-green flex-shrink-0" />
              <span className="truncate">{post.location_name}</span>
            </p>
          )}
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
        // Match other card sizes
        "flex-shrink-0 w-[260px] sm:w-[300px] lg:w-[340px]",
        "bg-white/90 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg",
        "flex items-center justify-center p-4 text-center h-[100px] sm:h-[110px]"
      )}
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
        >
          <ImageIcon className="h-5 w-5 text-white" />
        </div>
        <p className="text-gray-500 text-sm">
          Ingen opslag for <span className="font-semibold">{milestoneName}</span> endnu
        </p>
      </div>
    </div>
  );
}

// Keep the old export for backwards compatibility
export { JourneyCarousel as PostCarousel };
