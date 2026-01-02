"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Milestone } from "@/types/database";
import type { CarouselPost, CarouselViewMode } from "@/components/map/PostCarousel";
import { findMilestoneForDate } from "@/lib/journey";

export interface JourneyCarouselState {
  /** Currently active milestone */
  activeMilestone: Milestone | null;
  /** Index of active milestone in milestones array */
  activeMilestoneIndex: number;
  /** Posts for the current milestone */
  carouselPosts: CarouselPost[];
  /** Index of active post in carousel */
  activePostIndex: number;
  /** ID of post to highlight on map */
  highlightPostId: string | null;
  /** Current view mode (milestones or posts) */
  viewMode: CarouselViewMode;
  /** Whether carousel is visible */
  isOpen: boolean;
}

export interface JourneyCarouselActions {
  /** Open carousel at a specific milestone */
  openAtMilestone: (milestone: Milestone, startInPostsView?: boolean) => void;
  /** Open carousel at a specific post */
  openAtPost: (post: CarouselPost) => void;
  /** Close the carousel */
  close: () => void;
  /** Handle milestone click from map */
  handleMilestoneClick: (milestone: Milestone, posts?: CarouselPost[]) => void;
  /** Handle post click from map */
  handleMapPostClick: (post: CarouselPost) => void;
  /** Handle post change in carousel (swiping) */
  handlePostChange: (index: number, post: CarouselPost) => void;
  /** Handle milestone change in carousel (swiping) */
  handleMilestoneChange: (index: number, milestone: Milestone) => void;
  /** Handle view mode change */
  handleViewModeChange: (mode: CarouselViewMode) => void;
  /** Get posts for a specific milestone */
  getPostsForMilestone: (milestone: Milestone) => CarouselPost[];
}

export interface UseJourneyCarouselOptions {
  /** All milestones */
  milestones: Milestone[];
  /** All posts with location data */
  mapPosts: CarouselPost[];
  /** Current view (feed or map) */
  activeView: "feed" | "map";
  /** Post ID to auto-focus from URL */
  focusPostId?: string;
  /** Callback when map focus should change */
  onMapFocusChange?: (lat: number, lng: number, zoom: number) => void;
  /** Callback when navigating to post in feed */
  onNavigateToPost?: (postId: string) => void;
  /** Callback when carousel closes */
  onClose?: () => void;
}

/**
 * Hook for managing journey carousel state and interactions.
 * Handles milestone/post navigation, view mode switching, and map synchronization.
 */
export function useJourneyCarousel(
  options: UseJourneyCarouselOptions
): JourneyCarouselState & JourneyCarouselActions {
  const {
    milestones,
    mapPosts,
    activeView,
    focusPostId,
    onMapFocusChange,
    onNavigateToPost,
    onClose,
  } = options;

  // State
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(0);
  const [carouselPosts, setCarouselPosts] = useState<CarouselPost[]>([]);
  const [activePostIndex, setActivePostIndex] = useState(0);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CarouselViewMode>("posts");
  const [isOpen, setIsOpen] = useState(false);

  // Track initialization to prevent duplicate opens
  const initializedFocusPostRef = useRef<string | null>(null);

  // Helper: Get posts for a milestone
  const getPostsForMilestone = useCallback(
    (milestone: Milestone): CarouselPost[] => {
      return mapPosts.filter((post) => {
        if (!post.lat || !post.lng) return false;
        const postDate = post.captured_at || post.created_at;
        const result = findMilestoneForDate(postDate, milestones);
        return result?.type === "milestone" && result.milestone.id === milestone.id;
      });
    },
    [mapPosts, milestones]
  );

  // Reset carousel when leaving map view
  useEffect(() => {
    if (activeView !== "map") {
      initializedFocusPostRef.current = null;
      setIsOpen(false);
      setActiveMilestone(null);
      setCarouselPosts([]);
      setHighlightPostId(null);
    }
  }, [activeView]);

  // Auto-open carousel when focusPostId is set
  useEffect(() => {
    if (activeView !== "map" || !focusPostId) return;
    if (initializedFocusPostRef.current === focusPostId) return;

    const post = mapPosts.find((p) => p.id === focusPostId);
    if (!post) return;

    initializedFocusPostRef.current = focusPostId;

    const postDate = post.captured_at || post.created_at;
    const result = findMilestoneForDate(postDate, milestones);

    if (!result || result.type !== "milestone") return;

    const milestone = result.milestone;
    const milestoneIndex = milestones.findIndex((m) => m.id === milestone.id);
    const posts = getPostsForMilestone(milestone);
    const postIndex = posts.findIndex((p) => p.id === post.id);

    setActiveMilestone(milestone);
    setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
    setCarouselPosts(posts);
    setActivePostIndex(postIndex >= 0 ? postIndex : 0);
    setHighlightPostId(post.id);
    setIsOpen(true);
    setViewMode("posts");
  }, [activeView, focusPostId, mapPosts, milestones, getPostsForMilestone]);

  // Action: Open at milestone
  const openAtMilestone = useCallback(
    (milestone: Milestone, startInPostsView = false) => {
      const milestoneIndex = milestones.findIndex((m) => m.id === milestone.id);
      const posts = getPostsForMilestone(milestone);

      setActiveMilestone(milestone);
      setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
      setCarouselPosts(posts);
      setActivePostIndex(0);
      setHighlightPostId(posts.length > 0 ? posts[0].id : null);
      setIsOpen(true);
      setViewMode(startInPostsView ? "posts" : "milestones");

      // Zoom to milestone
      onMapFocusChange?.(milestone.lat, milestone.lng, startInPostsView ? 16 : 8);
    },
    [milestones, getPostsForMilestone, onMapFocusChange]
  );

  // Action: Open at post
  const openAtPost = useCallback(
    (post: CarouselPost) => {
      const postDate = post.captured_at || post.created_at;
      const result = findMilestoneForDate(postDate, milestones);

      if (!result || result.type !== "milestone") {
        // For before/after journey posts, navigate to feed
        onNavigateToPost?.(post.id);
        return;
      }

      const milestone = result.milestone;
      const milestoneIndex = milestones.findIndex((m) => m.id === milestone.id);
      const posts = getPostsForMilestone(milestone);
      const postIndex = posts.findIndex((p) => p.id === post.id);

      setActiveMilestone(milestone);
      setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
      setCarouselPosts(posts);
      setActivePostIndex(postIndex >= 0 ? postIndex : 0);
      setHighlightPostId(post.id);
      setIsOpen(true);
      setViewMode("posts");
    },
    [milestones, getPostsForMilestone, onNavigateToPost]
  );

  // Action: Close carousel
  const close = useCallback(() => {
    setIsOpen(false);
    setActiveMilestone(null);
    setCarouselPosts([]);
    setHighlightPostId(null);
    setActivePostIndex(0);
    setActiveMilestoneIndex(0);
    setViewMode("posts");
    onClose?.();
  }, [onClose]);

  // Handler: Milestone click from map
  const handleMilestoneClick = useCallback(
    (milestone: Milestone, posts?: CarouselPost[]) => {
      const milestoneIndex = milestones.findIndex((m) => m.id === milestone.id);
      const milestonePosts = posts ?? getPostsForMilestone(milestone);

      setActiveMilestone(milestone);
      setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
      setIsOpen(true);
      setViewMode("milestones");
      setCarouselPosts(milestonePosts);
      setActivePostIndex(0);
      setHighlightPostId(milestonePosts.length > 0 ? milestonePosts[0].id : null);
    },
    [milestones, getPostsForMilestone]
  );

  // Handler: Post click from map
  const handleMapPostClick = useCallback(
    (post: CarouselPost) => {
      const postDate = post.captured_at || post.created_at;
      const result = findMilestoneForDate(postDate, milestones);

      if (result?.type === "before_journey" || result?.type === "after_journey") {
        onNavigateToPost?.(post.id);
        return;
      }

      if (result?.type === "milestone") {
        openAtPost(post);
      }
    },
    [milestones, openAtPost, onNavigateToPost]
  );

  // Handler: Post change (swiping in carousel)
  const handlePostChange = useCallback(
    (index: number, post: CarouselPost) => {
      setActivePostIndex(index);
      setHighlightPostId(post.id);

      if (post.lat && post.lng) {
        onMapFocusChange?.(post.lat, post.lng, 16);
      }
    },
    [onMapFocusChange]
  );

  // Handler: Milestone change (swiping in carousel)
  const handleMilestoneChange = useCallback(
    (index: number, milestone: Milestone) => {
      setActiveMilestoneIndex(index);
      setActiveMilestone(milestone);

      const posts = getPostsForMilestone(milestone);
      setCarouselPosts(posts);
      setActivePostIndex(0);
      setHighlightPostId(posts.length > 0 ? posts[0].id : null);

      onMapFocusChange?.(milestone.lat, milestone.lng, 10);
    },
    [getPostsForMilestone, onMapFocusChange]
  );

  // Handler: View mode change
  const handleViewModeChange = useCallback(
    (mode: CarouselViewMode) => {
      setViewMode(mode);

      if (mode === "posts" && carouselPosts.length > 0) {
        const firstPost = carouselPosts[0];
        if (firstPost.lat && firstPost.lng) {
          onMapFocusChange?.(firstPost.lat, firstPost.lng, 16);
        }
      } else if (mode === "milestones" && activeMilestone) {
        onMapFocusChange?.(activeMilestone.lat, activeMilestone.lng, 8);
      }
    },
    [carouselPosts, activeMilestone, onMapFocusChange]
  );

  return {
    // State
    activeMilestone,
    activeMilestoneIndex,
    carouselPosts,
    activePostIndex,
    highlightPostId,
    viewMode,
    isOpen,
    // Actions
    openAtMilestone,
    openAtPost,
    close,
    handleMilestoneClick,
    handleMapPostClick,
    handlePostChange,
    handleMilestoneChange,
    handleViewModeChange,
    getPostsForMilestone,
  };
}
