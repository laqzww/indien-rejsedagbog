"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { MapPin, ImageIcon, Film, Play, ChevronLeft, ChevronRight, ChevronUp, X, MapPinIcon, Calendar, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";
import { getDayNumber } from "@/lib/journey";
import type { Milestone } from "@/types/database";

// Helper to get cover image URL for milestone
function getMilestoneCoverUrl(milestone: Milestone): string | null {
  if (!milestone.cover_image_path) return null;
  return getMediaUrl(milestone.cover_image_path);
}

// Helper to format date range for milestone
function formatDateRange(arrival: string | null, departure: string | null): string | null {
  if (!arrival) return null;
  
  const arrDate = new Date(arrival);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

  if (!departure) {
    return arrDate.toLocaleDateString("da-DK", options);
  }

  const depDate = new Date(departure);
  return `${arrDate.toLocaleDateString("da-DK", options)} – ${depDate.toLocaleDateString("da-DK", options)}`;
}

// Helper to get milestone status
type MilestoneStatus = "completed" | "current" | "upcoming";

function getMilestoneStatus(milestone: Milestone): MilestoneStatus {
  const today = new Date();
  
  if (!milestone.arrival_date) return "upcoming";
  const arrivalDate = new Date(milestone.arrival_date);
  const departureDate = milestone.departure_date
    ? new Date(milestone.departure_date)
    : null;

  if (arrivalDate > today) return "upcoming";
  if (departureDate && departureDate < today) return "completed";
  return "current";
}

// Media type with location data for individual media markers
export interface CarouselMedia {
  id: string;
  type: string;
  storage_path: string;
  thumbnail_path: string | null;
  display_order: number;
  lat: number | null;
  lng: number | null;
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
  media: CarouselMedia[];
}

// View mode for the carousel - includes new "media" level
export type CarouselViewMode = "milestones" | "posts" | "media";

interface JourneyCarouselProps {
  milestones: Milestone[];
  activeMilestone: Milestone;
  activeMilestoneIndex: number;
  posts: CarouselPost[];
  activePostIndex: number;
  // Active post for media view (the post whose media we're browsing)
  activePost?: CarouselPost | null;
  // Media items for the active post (sorted by display_order)
  mediaItems: CarouselMedia[];
  activeMediaIndex: number;
  viewMode: CarouselViewMode;
  onViewModeChange: (mode: CarouselViewMode) => void;
  onMilestoneChange: (index: number, milestone: Milestone) => void;
  onPostChange: (index: number, post: CarouselPost) => void;
  onMediaChange: (index: number, media: CarouselMedia) => void;
  onPostClick: (post: CarouselPost) => void;
  onMediaClick: (media: CarouselMedia) => void;
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
  activePost,
  mediaItems,
  activeMediaIndex,
  viewMode,
  onViewModeChange,
  onMilestoneChange,
  onPostChange,
  onMediaChange,
  onPostClick,
  onMediaClick,
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

  // Media carousel (for individual media items within a post)
  const [mediaEmblaRef, mediaEmblaApi] = useEmblaCarousel({
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
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(activeMediaIndex);
  
  // Track if we're programmatically scrolling to avoid feedback loops
  const isProgrammaticScrollRef = useRef(false);
  // Track the previous view mode to detect changes
  const prevViewModeRef = useRef(viewMode);
  // Track the last externally set milestone index to detect external changes
  const lastExternalMilestoneIndexRef = useRef(activeMilestoneIndex);
  
  // Generate a stable key for the posts array based on post IDs
  // This changes when posts actually change (not just when length changes)
  const postsKey = posts.map(p => p.id).join(",");
  const prevPostsKeyRef = useRef(postsKey);

  // Generate a stable key for media items
  const mediaKey = mediaItems.map(m => m.id).join(",");
  const prevMediaKeyRef = useRef(mediaKey);

  // Get the active API based on view mode
  const activeApi = viewMode === "milestones" 
    ? milestoneEmblaApi 
    : viewMode === "posts" 
    ? postEmblaApi 
    : mediaEmblaApi;

  // Sync milestone carousel when external index changes OR on initial mount
  // IMPORTANT: We track the last external index to detect genuine parent-driven changes
  // This prevents feedback loops where internal carousel events trigger re-syncs
  useEffect(() => {
    if (!milestoneEmblaApi) return;
    
    // Check if this is a genuine external change (prop changed from parent)
    const isExternalChange = activeMilestoneIndex !== lastExternalMilestoneIndexRef.current;
    
    // Always update the ref to track current external value
    lastExternalMilestoneIndexRef.current = activeMilestoneIndex;
    
    // Only sync if the external index actually changed AND differs from current carousel position
    if (!isExternalChange) return;
    
    // Get the actual current position of the carousel
    const currentEmblaIndex = milestoneEmblaApi.selectedScrollSnap();
    if (activeMilestoneIndex === currentEmblaIndex) {
      // Carousel is already at the right position, just sync state
      setSelectedMilestoneIndex(activeMilestoneIndex);
      return;
    }
    
    isProgrammaticScrollRef.current = true;
    milestoneEmblaApi.scrollTo(activeMilestoneIndex);
    setSelectedMilestoneIndex(activeMilestoneIndex);
    
    // Use a longer delay to ensure Embla has finished processing before allowing user events
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
  }, [milestoneEmblaApi, activeMilestoneIndex]);

  // Initialize post carousel position when API is ready
  useEffect(() => {
    if (!postEmblaApi) return;
    
    // On mount, scroll to the active post
    isProgrammaticScrollRef.current = true;
    postEmblaApi.scrollTo(activePostIndex, false); // instant scroll
    setSelectedPostIndex(activePostIndex);
    
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
  }, [postEmblaApi]); // Only on API init - activePostIndex handled by sync effect

  // Sync post carousel when external index changes
  useEffect(() => {
    if (!postEmblaApi) return;
    if (activePostIndex === selectedPostIndex && posts.length > 0) return;
    
    isProgrammaticScrollRef.current = true;
    // Reposition to the new active post index (clamped to valid range)
    const validIndex = Math.min(activePostIndex, Math.max(0, posts.length - 1));
    postEmblaApi.scrollTo(validIndex, false);
    setSelectedPostIndex(validIndex);
    
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
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
    
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
  }, [postEmblaApi, postsKey]);

  // Initialize media carousel position when API is ready
  useEffect(() => {
    if (!mediaEmblaApi) return;
    
    // On mount, scroll to the active media
    isProgrammaticScrollRef.current = true;
    mediaEmblaApi.scrollTo(activeMediaIndex, false);
    setSelectedMediaIndex(activeMediaIndex);
    
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
  }, [mediaEmblaApi]); // Only on API init

  // Sync media carousel when external index changes
  useEffect(() => {
    if (!mediaEmblaApi) return;
    if (activeMediaIndex === selectedMediaIndex && mediaItems.length > 0) return;
    
    isProgrammaticScrollRef.current = true;
    const validIndex = Math.min(activeMediaIndex, Math.max(0, mediaItems.length - 1));
    mediaEmblaApi.scrollTo(validIndex, false);
    setSelectedMediaIndex(validIndex);
    
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
  }, [mediaEmblaApi, activeMediaIndex, selectedMediaIndex, mediaItems.length]);

  // Reinitialize media carousel when media items change
  useEffect(() => {
    if (!mediaEmblaApi) return;
    
    if (prevMediaKeyRef.current === mediaKey) return;
    prevMediaKeyRef.current = mediaKey;
    
    mediaEmblaApi.reInit();
    
    isProgrammaticScrollRef.current = true;
    mediaEmblaApi.scrollTo(0, false);
    setSelectedMediaIndex(0);
    
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
  }, [mediaEmblaApi, mediaKey]);

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

  // Handle media carousel scroll
  const onMediaSelect = useCallback(() => {
    if (!mediaEmblaApi || isProgrammaticScrollRef.current) return;

    const index = mediaEmblaApi.selectedScrollSnap();
    if (index === selectedMediaIndex) return;
    
    setSelectedMediaIndex(index);

    if (mediaItems[index]) {
      onMediaChange(index, mediaItems[index]);
    }
  }, [mediaEmblaApi, mediaItems, onMediaChange, selectedMediaIndex]);

  // Update scroll state for active carousel
  const updateScrollState = useCallback(() => {
    if (!activeApi) return;
    setCanScrollPrev(activeApi.canScrollPrev());
    setCanScrollNext(activeApi.canScrollNext());
  }, [activeApi]);

  // Handle view mode changes - reinit and position carousels appropriately
  // CRITICAL: When carousels are hidden (display: none), Embla loses track of slides.
  // We must call reInit() when switching views to recalculate slide positions.
  useEffect(() => {
    const prevMode = prevViewModeRef.current;
    prevViewModeRef.current = viewMode;
    
    if (prevMode === viewMode) return;
    
    // When switching to posts view, reinit and scroll to first post
    if (viewMode === "posts" && postEmblaApi) {
      // CRITICAL: Set flag BEFORE reInit to prevent event handlers from resetting state
      // reInit() fires a 'reInit' event that triggers onPostSelect, which would otherwise
      // detect position 0 and update state incorrectly
      isProgrammaticScrollRef.current = true;
      
      // Reinitialize to recalculate slides after being hidden
      postEmblaApi.reInit();
      
      postEmblaApi.scrollTo(0, false);
      setSelectedPostIndex(0);
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 150);
    }
    
    // When switching to milestones view, reinit and scroll to CURRENT milestone (not first!)
    if (viewMode === "milestones" && milestoneEmblaApi) {
      // CRITICAL: Set flag BEFORE reInit to prevent event handlers from resetting state
      // reInit() fires a 'reInit' event that triggers onMilestoneSelect, which would otherwise
      // detect position 0 (carousel resets on reInit) and call onMilestoneChange with milestone 0,
      // causing the carousel to jump back to the first milestone instead of staying on the current one
      isProgrammaticScrollRef.current = true;
      
      // Use the internal selectedMilestoneIndex which tracks where we actually are
      // This preserves position when navigating back from posts view
      const targetIndex = selectedMilestoneIndex;
      
      // Reinitialize to recalculate slides after being hidden
      milestoneEmblaApi.reInit();
      
      milestoneEmblaApi.scrollTo(targetIndex, false);
      // Don't update selectedMilestoneIndex - we're using it as the source of truth
      lastExternalMilestoneIndexRef.current = targetIndex;
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 150);
    }

    // When switching to media view, reinit and scroll to first media
    if (viewMode === "media" && mediaEmblaApi) {
      isProgrammaticScrollRef.current = true;
      
      mediaEmblaApi.reInit();
      
      mediaEmblaApi.scrollTo(0, false);
      setSelectedMediaIndex(0);
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 150);
    }
    
    // Update scroll buttons for new view
    requestAnimationFrame(() => {
      updateScrollState();
    });
  }, [viewMode, postEmblaApi, milestoneEmblaApi, mediaEmblaApi, selectedMilestoneIndex, updateScrollState]);

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

  // Setup media carousel listeners
  useEffect(() => {
    if (!mediaEmblaApi) return;

    mediaEmblaApi.on("select", onMediaSelect);
    mediaEmblaApi.on("reInit", onMediaSelect);

    return () => {
      mediaEmblaApi.off("select", onMediaSelect);
      mediaEmblaApi.off("reInit", onMediaSelect);
    };
  }, [mediaEmblaApi, onMediaSelect]);

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

  // Navigate up in hierarchy by clicking on badge
  // media → posts → milestones → route overview (close)
  const handleBadgeClick = useCallback(() => {
    if (viewMode === "media") {
      // Go up to posts view (stay on current post)
      onViewModeChange("posts");
    } else if (viewMode === "posts") {
      // Go up to milestones view (stay on current milestone)
      onViewModeChange("milestones");
    } else {
      // In milestones view - go up to route overview (close carousel)
      onClose();
    }
  }, [viewMode, onViewModeChange, onClose]);

  // Handle milestone card click - switch to posts view
  const handleMilestoneCardClick = useCallback(() => {
    onViewModeChange("posts");
  }, [onViewModeChange]);

  // Handle post card click - switch to media view if post has geotagged media
  const handlePostCardClick = useCallback((post: CarouselPost) => {
    // Check if post has any media (for media view navigation)
    if (post.media.length > 0) {
      onViewModeChange("media");
    } else {
      // No media - navigate to full post view
      onPostClick(post);
    }
  }, [onViewModeChange, onPostClick]);

  // Handle media card click - navigate to full post view
  const handleMediaCardClick = useCallback((media: CarouselMedia) => {
    onMediaClick(media);
  }, [onMediaClick]);

  const itemCount = viewMode === "milestones" 
    ? milestones.length 
    : viewMode === "posts" 
    ? posts.length 
    : mediaItems.length;
  const selectedIndex = viewMode === "milestones" 
    ? selectedMilestoneIndex 
    : viewMode === "posts" 
    ? selectedPostIndex 
    : selectedMediaIndex;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pb-3 pt-2">
      {/* Navigation header with clear hierarchy indicator */}
      <div className="flex items-center justify-between px-3 mb-2">
        {/* Back/up navigation button - always shows where you'll go */}
        <button
          onClick={handleBadgeClick}
          className="flex items-center gap-1.5 group px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/50 transition-colors"
          title={viewMode === "milestones" ? "Se hele ruten" : viewMode === "posts" ? "Se alle destinationer" : "Tilbage til opslag"}
        >
          <ChevronUp className="h-4 w-4 text-white/80 group-hover:text-white transition-colors" />
          {viewMode === "milestones" ? (
            // In milestones view - show "Ruteoversigt" to indicate going to route level
            <>
              <Route className="h-4 w-4 text-white/80" />
              <span className="text-white text-sm font-medium">Ruteoversigt</span>
              <span className="text-white/60 text-xs ml-1">
                {selectedMilestoneIndex + 1}/{milestones.length}
              </span>
            </>
          ) : viewMode === "posts" ? (
            // In posts view - show current milestone name to indicate going back to it
            <>
              <div className="w-5 h-5 rounded-full bg-saffron text-white text-xs flex items-center justify-center font-bold">
                {activeMilestone.display_order + 1}
              </div>
              <span className="text-white text-sm font-medium">
                {activeMilestone.name}
              </span>
              {posts.length > 0 && (
                <span className="text-white/60 text-xs ml-1">
                  {selectedPostIndex + 1}/{posts.length}
                </span>
              )}
            </>
          ) : (
            // In media view - show post info to indicate going back to posts
            <>
              <MapPin className="h-4 w-4 text-india-green" />
              <span className="text-white text-sm font-medium truncate max-w-[120px]">
                {activePost?.location_name || "Opslag"}
              </span>
              {mediaItems.length > 0 && (
                <span className="text-white/60 text-xs ml-1">
                  {selectedMediaIndex + 1}/{mediaItems.length}
                </span>
              )}
            </>
          )}
        </button>
        
        {/* Close button */}
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

        {/* Media carousel - individual media items within a post */}
        <div 
          className={cn(
            "overflow-hidden",
            viewMode === "media" ? "block" : "hidden"
          )} 
          ref={mediaEmblaRef}
        >
          <div className="flex gap-3 px-4 lg:px-16">
            {mediaItems.length > 0 ? (
              mediaItems.map((media, index) => (
                <CompactMediaCard
                  key={media.id}
                  media={media}
                  postLocation={activePost}
                  isActive={index === selectedMediaIndex}
                  mediaNumber={index + 1}
                  totalMedia={mediaItems.length}
                  onClick={() => handleMediaCardClick(media)}
                />
              ))
            ) : (
              <EmptyMediaCard />
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
              aria-label={`Gå til ${viewMode === "milestones" ? "destination" : viewMode === "posts" ? "opslag" : "billede"} ${index + 1}`}
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
  const dateRange = formatDateRange(milestone.arrival_date, milestone.departure_date);
  const status = getMilestoneStatus(milestone);
  
  // Status indicator colors
  const statusBgColor = status === "completed" 
    ? "bg-india-green" 
    : status === "current" 
    ? "bg-saffron animate-pulse" 
    : "bg-gray-400";
  
  return (
    <button
      onClick={onClick}
      className={cn(
        // Same width and height as post cards for consistent layout
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px] h-[200px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200 flex flex-col",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-saffron focus:ring-offset-2",
        isActive && "ring-2 ring-saffron"
      )}
    >
      {/* Header area - cover image or gradient fallback */}
      <div 
        className={cn(
          "relative w-full h-[120px] flex-shrink-0 overflow-hidden",
          !coverUrl && "flex items-center justify-center"
        )}
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
            {/* Milestone number badge with status indicator */}
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
              <div className={cn(
                "w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-lg border-2 border-white",
                statusBgColor
              )}>
                {milestone.display_order + 1}
              </div>
            </div>
            {/* Location name overlay at bottom */}
            <div className="absolute bottom-3 left-3 right-3 z-10">
              <div className="flex items-center gap-1.5 text-white/90 text-sm">
                <MapPinIcon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate font-medium drop-shadow-lg">{milestone.name}</span>
              </div>
            </div>
          </>
        ) : (
          /* Fallback: Large milestone number on gradient with status */
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center border-4 border-white/40",
            status === "completed" 
              ? "bg-india-green/80" 
              : status === "current" 
              ? "bg-white/20 backdrop-blur-sm animate-pulse" 
              : "bg-white/20 backdrop-blur-sm"
          )}>
            <span className="text-white font-bold text-4xl drop-shadow-lg">{milestone.display_order + 1}</span>
          </div>
        )}
      </div>
      
      {/* Content below - compact to match post card height */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        {!coverUrl && (
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {milestone.name}
          </h3>
        )}
        {coverUrl && dateRange && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            <span>{dateRange}</span>
          </div>
        )}
        {!coverUrl && dateRange && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            <span>{dateRange}</span>
          </div>
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
  
  // Calculate day number from post date
  const postDate = post.captured_at || post.created_at;
  const dayNumber = getDayNumber(postDate);

  const truncatedBody = post.body.length > 80 
    ? post.body.slice(0, 80) + "..." 
    : post.body;

  return (
    <button
      onClick={onClick}
      className={cn(
        // Card sizes - fixed height to match milestone cards
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px] h-[200px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200 flex flex-col",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-saffron focus:ring-offset-2",
        isActive && "ring-2 ring-saffron"
      )}
    >
      {/* Large image/video thumbnail on top */}
      <div className="relative w-full h-[120px] flex-shrink-0 overflow-hidden bg-muted">
        {firstMedia ? (
          <>
            {/* Image or video thumbnail - same approach as PostCard */}
            {firstMedia.type === "image" ? (
              <Image
                src={getMediaUrl(firstMedia.storage_path)}
                alt=""
                fill
                className="object-cover"
                sizes="320px"
              />
            ) : (
              <>
                {/* Video thumbnail - use stored thumbnail or fallback to video frame */}
                {firstMedia.thumbnail_path ? (
                  <Image
                    src={getMediaUrl(firstMedia.thumbnail_path)}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="320px"
                  />
                ) : (
                  <video
                    src={`${getMediaUrl(firstMedia.storage_path)}#t=0.001`}
                    preload="metadata"
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                {/* Video play overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="p-2.5 bg-black/50 rounded-full">
                    <Play className="h-5 w-5 text-white fill-white" />
                  </div>
                </div>
              </>
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
          /* No media - show gradient with text icon */
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
          >
            <span className="text-white text-3xl">📝</span>
          </div>
        )}
        
        {/* Day badge - always visible on top */}
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 backdrop-blur-sm rounded-full text-white text-xs font-medium z-10">
          Dag {dayNumber}
        </div>
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
        // Same width and height as other cards
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px] h-[200px]",
        "bg-white rounded-xl overflow-hidden shadow-xl flex flex-col"
      )}
    >
      {/* Gradient header - same as milestone card */}
      <div 
        className="relative w-full h-[120px] flex-shrink-0 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)" }}
      >
        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-white" />
        </div>
      </div>
      
      {/* Content */}
      <div className="p-3 flex-1 flex items-center justify-center text-center">
        <p className="text-sm text-gray-500">
          Ingen opslag for <span className="font-semibold text-gray-700">{milestoneName}</span> endnu
        </p>
      </div>
    </div>
  );
}

// Media card component - individual media item within a post
interface CompactMediaCardProps {
  media: CarouselMedia;
  postLocation: CarouselPost | null | undefined;
  isActive: boolean;
  mediaNumber: number;
  totalMedia: number;
  onClick: () => void;
}

function CompactMediaCard({ media, postLocation, isActive, mediaNumber, totalMedia, onClick }: CompactMediaCardProps) {
  const hasOwnLocation = media.lat !== null && media.lng !== null;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        // Same width and height as other cards for consistent layout
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px] h-[200px]",
        "bg-white rounded-xl overflow-hidden shadow-xl",
        "text-left transition-all duration-200 flex flex-col",
        "hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
        isActive && "ring-2 ring-indigo-500"
      )}
    >
      {/* Large image/video on top - fills most of card */}
      <div className="relative w-full h-[150px] flex-shrink-0 overflow-hidden bg-muted">
        {media.type === "image" ? (
          <Image
            src={getMediaUrl(media.storage_path)}
            alt=""
            fill
            className="object-cover"
            sizes="320px"
          />
        ) : (
          <>
            {/* Video thumbnail */}
            {media.thumbnail_path ? (
              <Image
                src={getMediaUrl(media.thumbnail_path)}
                alt=""
                fill
                className="object-cover"
                sizes="320px"
              />
            ) : (
              <video
                src={`${getMediaUrl(media.storage_path)}#t=0.001`}
                preload="metadata"
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {/* Video play overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="p-2.5 bg-black/50 rounded-full">
                <Play className="h-5 w-5 text-white fill-white" />
              </div>
            </div>
          </>
        )}

        {/* Media number badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600/90 backdrop-blur-sm rounded-full text-white text-xs font-medium z-10">
          {mediaNumber}/{totalMedia}
        </div>

        {/* Location status indicator - subtle indicator for GPS status */}
        <div className={cn(
          "absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium z-10 flex items-center gap-1",
          hasOwnLocation 
            ? "bg-india-green/90 text-white" 
            : "bg-white/80 text-gray-600 backdrop-blur-sm border border-dashed border-gray-300"
        )}>
          <MapPin className="h-3 w-3" />
          {hasOwnLocation ? "GPS" : "~"}
        </div>
      </div>

      {/* Compact content below - just location info and action */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-1 min-w-0">
          {hasOwnLocation ? (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="truncate">Egen placering</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-gray-400">
              <span className="w-2 h-2 rounded-full border border-dashed border-gray-400" />
              <span className="truncate">{postLocation?.location_name || "Opslagets placering"}</span>
            </span>
          )}
        </div>
        <span className="text-indigo-600 font-medium whitespace-nowrap text-xs">
          Se opslag →
        </span>
      </div>
    </button>
  );
}

// Empty state when no media items
function EmptyMediaCard() {
  return (
    <div
      className={cn(
        "flex-shrink-0 w-[280px] sm:w-[300px] lg:w-[320px] h-[200px]",
        "bg-white rounded-xl overflow-hidden shadow-xl flex flex-col"
      )}
    >
      <div 
        className="relative w-full h-[150px] flex-shrink-0 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" }}
      >
        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-white" />
        </div>
      </div>
      
      <div className="p-3 flex-1 flex items-center justify-center text-center">
        <p className="text-sm text-gray-500">Ingen medier i dette opslag</p>
      </div>
    </div>
  );
}

// Keep the old export for backwards compatibility
export { JourneyCarousel as PostCarousel };
