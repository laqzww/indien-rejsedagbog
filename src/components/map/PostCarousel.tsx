"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { MapPin, ImageIcon, Film, Play, ChevronLeft, ChevronRight, X, MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";
import type { Milestone } from "@/types/database";

// Helper to get cover image URL for milestone
function getMilestoneCoverUrl(milestone: Milestone): string | null {
  if (!milestone.cover_image_path) return null;
  return getMediaUrl(milestone.cover_image_path);
}

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
  
  // Generate a stable key for the posts array based on post IDs
  // This changes when posts actually change (not just when length changes)
  const postsKey = posts.map(p => p.id).join(",");
  const prevPostsKeyRef = useRef(postsKey);

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

  // Sync post carousel when external index changes
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

  // CRITICAL: Reinitialize post carousel when posts array changes
  // This is necessary because the posts carousel is hidden (display: none) while
  // in milestone view, so Embla doesn't automatically detect DOM changes.
  // Without this, swiping between milestones causes stale posts to be displayed.
  useEffect(() => {
    if (!postEmblaApi) return;
    
    // Check if posts actually changed (not just on initial mount)
    if (prevPostsKeyRef.current === postsKey) return;
    prevPostsKeyRef.current = postsKey;
    
    // Reinitialize Embla to recalculate slides
    postEmblaApi.reInit();
    
    // Reset to first post when posts change
    isProgrammaticScrollRef.current = true;
    postEmblaApi.scrollTo(0, false);
    setSelectedPostIndex(0);
    
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [postEmblaApi, postsKey]);

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

// Milestone card component - matches post card dimensions
interface CompactMilestoneCardProps {
  milestone: Milestone;
  postCount: number;
  isActive: boolean;
  onClick: () => void;
}

function CompactMilestoneCard({ milestone, postCount, isActive, onClick }: CompactMilestoneCardProps) {
  const coverUrl = getMilestoneCoverUrl(milestone);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        // Same width as post cards for consistent layout
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-saffron focus:ring-offset-2",
        isActive && "ring-2 ring-saffron"
      )}
    >
      {/* Header area - cover image or gradient fallback */}
      <div 
        className="relative h-[120px] flex items-center justify-center"
        style={!coverUrl ? { background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" } : undefined}
      >
        {coverUrl ? (
          <>
            {/* Cover image */}
            <Image
              src={coverUrl}
              alt={milestone.name}
              fill
              className="object-cover"
              sizes="320px"
            />
            {/* Dark overlay for better text visibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            {/* Milestone number badge */}
            <div className="absolute top-3 left-3 w-10 h-10 rounded-full bg-saffron text-white flex items-center justify-center font-bold text-lg shadow-lg border-2 border-white">
              {milestone.display_order + 1}
            </div>
            {/* Location name overlay at bottom */}
            <div className="absolute bottom-3 left-3 right-3">
              <div className="flex items-center gap-1.5 text-white/90 text-sm">
                <MapPinIcon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate font-medium drop-shadow-lg">{milestone.name}</span>
              </div>
            </div>
          </>
        ) : (
          /* Fallback: Large milestone number on gradient */
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-4 border-white/40">
            <span className="text-white font-bold text-4xl drop-shadow-lg">{milestone.display_order + 1}</span>
          </div>
        )}
      </div>
      
      {/* Content below - same structure as post card */}
      <div className="p-3">
        {!coverUrl && (
          <h3 className="text-base font-semibold text-gray-900 truncate mb-2">
            {milestone.name}
          </h3>
        )}
        {coverUrl && milestone.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {milestone.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />
            {postCount} opslag
          </span>
          <span className="text-saffron font-medium whitespace-nowrap ml-auto">
            Se opslag →
          </span>
        </div>
      </div>
    </button>
  );
}

// Post card component - vertical layout with large image on top
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

  const truncatedBody = post.body.length > 80 
    ? post.body.slice(0, 80) + "..." 
    : post.body;

  return (
    <button
      onClick={onClick}
      className={cn(
        // Card sizes - original format
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-saffron focus:ring-offset-2",
        isActive && "ring-2 ring-saffron"
      )}
    >
      {/* Large image/video thumbnail on top */}
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
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
          >
            <span className="text-white text-3xl">📝</span>
          </div>
        )}
      </div>

      {/* Content below image */}
      <div className="p-3">
        <p className="text-sm text-gray-800 line-clamp-2 mb-2 leading-snug">
          {truncatedBody}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {post.location_name && (
            <span className="flex items-center gap-1 truncate flex-1">
              <MapPin className="h-3 w-3 text-india-green flex-shrink-0" />
              <span className="truncate">{post.location_name}</span>
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

// Empty state when milestone has no posts - matches card dimensions
function EmptyPostsCard({ milestoneName }: { milestoneName: string }) {
  return (
    <div
      className={cn(
        // Same width as other cards
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px]",
        "bg-white rounded-xl overflow-hidden shadow-xl"
      )}
    >
      {/* Gradient header - same as milestone card */}
      <div 
        className="relative h-[120px] flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
      >
        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-white" />
        </div>
      </div>
      
      {/* Content */}
      <div className="p-3 text-center">
        <p className="text-sm text-gray-500">
          Ingen opslag for <span className="font-semibold text-gray-700">{milestoneName}</span> endnu
        </p>
      </div>
    </div>
  );
}

// Keep the old export for backwards compatibility
export { JourneyCarousel as PostCarousel };
