"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "./Header";
import { PostFeed } from "./post/PostFeed";
import { EmptyFeed } from "./post/EmptyFeed";
import { Timeline } from "./map/Timeline";
import { JourneyCarousel, type CarouselPost, type CarouselViewMode } from "./map/PostCarousel";
import { Button } from "./ui/button";
import { List, Map as MapIcon, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/database";
import type { MilestoneGroup, MilestoneResult } from "@/lib/journey";
import { findMilestoneForDate } from "@/lib/journey";

// Pseudo-milestone IDs for special groups
const BEFORE_JOURNEY_ID = "__before_journey__";
const AFTER_JOURNEY_ID = "__after_journey__";

// Create pseudo-milestone for "Før afrejse"
function createBeforeJourneyMilestone(displayOrder: number): Milestone {
  return {
    id: BEFORE_JOURNEY_ID,
    name: "Før afrejse",
    description: "Opslag fra før rejsen startede",
    lat: 55.6761, // Copenhagen
    lng: 12.5683,
    display_order: displayOrder,
    arrival_date: null,
    departure_date: null,
    created_at: "",
  };
}

// Create pseudo-milestone for "Efter rejsen"
function createAfterJourneyMilestone(displayOrder: number): Milestone {
  return {
    id: AFTER_JOURNEY_ID,
    name: "Efter rejsen",
    description: "Opslag fra efter rejsen sluttede",
    lat: 55.6761, // Copenhagen
    lng: 12.5683,
    display_order: displayOrder,
    arrival_date: null,
    departure_date: null,
    created_at: "",
  };
}

// Dynamic import for map to avoid SSR issues
const JourneyMap = dynamic(
  () => import("@/components/map/JourneyMap").then((mod) => mod.JourneyMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
        <MapIcon className="h-12 w-12 text-muted-foreground/20" />
      </div>
    ),
  }
);

interface JourneyPost {
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

interface HomeClientProps {
  isAuthor: boolean;
  groupedPosts: MilestoneGroup[];
  hasPosts: boolean;
  milestones: Milestone[];
  mapPosts: JourneyPost[];
  initialView?: "feed" | "map";
  focusLat?: number;
  focusLng?: number;
  focusZoom?: number;
}

export function HomeClient({
  isAuthor,
  groupedPosts,
  hasPosts,
  milestones,
  mapPosts,
  initialView = "feed",
  focusLat: initialFocusLat,
  focusLng: initialFocusLng,
  focusZoom: initialFocusZoom,
}: HomeClientProps) {
  const router = useRouter();
  
  // Read search params dynamically to support client-side navigation
  const searchParams = useSearchParams();
  
  // Parse view and focus coordinates from URL (takes precedence over initial props)
  const urlView = searchParams.get("view");
  const urlLat = searchParams.get("lat");
  const urlLng = searchParams.get("lng");
  const urlZoom = searchParams.get("zoom");
  const urlPostId = searchParams.get("post"); // Post ID to scroll to in feed
  
  // Compute active view from URL - URL is the single source of truth
  // This ensures "Se på kort" links always switch the view correctly
  const activeView: "feed" | "map" = urlView === "map" ? "map" : (urlView === "feed" ? "feed" : initialView);
  
  // Parse focus coordinates
  const focusLat = urlLat ? parseFloat(urlLat) : initialFocusLat;
  const focusLng = urlLng ? parseFloat(urlLng) : initialFocusLng;
  const focusZoom = urlZoom ? parseFloat(urlZoom) : initialFocusZoom;
  
  // Focus post ID for scrolling to specific post in feed
  const focusPostId = urlPostId || undefined;
  
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [mapError, setMapError] = useState(false);
  
  // Carousel state
  const [carouselPosts, setCarouselPosts] = useState<CarouselPost[]>([]);
  const [activePostIndex, setActivePostIndex] = useState(0);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [carouselViewMode, setCarouselViewMode] = useState<CarouselViewMode>("posts");
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(0);
  const [showCarousel, setShowCarousel] = useState(false);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Handler for view changes - updates URL instead of local state
  // This ensures URL stays in sync and enables browser back/forward navigation
  const handleViewChange = useCallback((view: "feed" | "map") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    // Clear focus coordinates when manually switching views (not from "Se på kort")
    if (view === "feed") {
      params.delete("lat");
      params.delete("lng");
      params.delete("zoom");
    }
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  
  // Reset map error when focus coordinates change (new POI navigation)
  useEffect(() => {
    if (focusLat !== undefined && focusLng !== undefined) {
      setMapError(false);
    }
  }, [focusLat, focusLng]);

  // Build extended milestones list including pseudo-milestones for "Før afrejse" and "Efter rejsen"
  const extendedMilestones = React.useMemo(() => {
    // Check if we have any posts in before/after categories
    let hasBeforePosts = false;
    let hasAfterPosts = false;
    
    for (const post of mapPosts) {
      if (!post.lat || !post.lng) continue;
      const postDate = post.captured_at || post.created_at;
      const result = findMilestoneForDate(postDate, milestones);
      if (result?.type === "before_journey") hasBeforePosts = true;
      if (result?.type === "after_journey") hasAfterPosts = true;
    }
    
    const extended: Milestone[] = [];
    
    // Add "Før afrejse" first (display_order 0)
    if (hasBeforePosts) {
      extended.push(createBeforeJourneyMilestone(0));
    }
    
    // Add actual milestones with adjusted display_order
    milestones.forEach((m, idx) => {
      extended.push({
        ...m,
        display_order: hasBeforePosts ? idx + 1 : m.display_order,
      });
    });
    
    // Add "Efter rejsen" last
    if (hasAfterPosts) {
      extended.push(createAfterJourneyMilestone(extended.length));
    }
    
    return extended;
  }, [mapPosts, milestones]);

  // Helper to get posts for a milestone (including pseudo-milestones)
  const getPostsForMilestone = useCallback((milestone: Milestone): CarouselPost[] => {
    return mapPosts.filter((post) => {
      if (!post.lat || !post.lng) return false;
      const postDate = post.captured_at || post.created_at;
      const result = findMilestoneForDate(postDate, milestones);
      
      // Handle pseudo-milestones
      if (milestone.id === BEFORE_JOURNEY_ID) {
        return result?.type === "before_journey";
      }
      if (milestone.id === AFTER_JOURNEY_ID) {
        return result?.type === "after_journey";
      }
      
      // Regular milestone
      return result?.type === "milestone" && result.milestone.id === milestone.id;
    });
  }, [mapPosts, milestones]);

  const handleMilestoneClick = useCallback((milestone: Milestone, milestonePosts?: CarouselPost[]) => {
    // Find milestone index in extended list
    const milestoneIndex = extendedMilestones.findIndex(m => m.id === milestone.id);
    
    setActiveMilestone(milestone);
    setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
    setShowCarousel(true);
    setCarouselViewMode("posts"); // Start in posts view when clicking a milestone
    
    // Use provided posts or find them
    const posts = milestonePosts ?? getPostsForMilestone(milestone);
    setCarouselPosts(posts);
    if (posts.length > 0) {
      setActivePostIndex(0);
      setHighlightPostId(posts[0].id);
    } else {
      setHighlightPostId(null);
    }
  }, [getPostsForMilestone, extendedMilestones]);

  const handlePostClick = useCallback((post: { id: string }) => {
    // Navigate to feed view and scroll to the post
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "feed");
    params.set("post", post.id);
    params.delete("lat");
    params.delete("lng");
    params.delete("zoom");
    router.push(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // Handle carousel post change - zoom map to post location
  const handleCarouselPostChange = useCallback((index: number, post: CarouselPost) => {
    setActivePostIndex(index);
    setHighlightPostId(post.id);
    
    // Update URL to focus on this post's location for map sync
    if (post.lat && post.lng) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("lat", post.lat.toString());
      params.set("lng", post.lng.toString());
      params.set("zoom", "12"); // Good zoom for seeing the post in context
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
  }, [router, searchParams]);

  // Handle carousel close
  const handleCarouselClose = useCallback(() => {
    setShowCarousel(false);
    setActiveMilestone(null);
    setCarouselPosts([]);
    setHighlightPostId(null);
    setActivePostIndex(0);
    setActiveMilestoneIndex(0);
    setCarouselViewMode("posts");
    
    // Clear focus coordinates
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lat");
    params.delete("lng");
    params.delete("zoom");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // Handle direct post click on map - open carousel with the clicked post
  const handleMapPostClick = useCallback((post: CarouselPost) => {
    // Find which milestone this post belongs to
    const postDate = post.captured_at || post.created_at;
    const result = findMilestoneForDate(postDate, milestones);
    
    let targetMilestone: Milestone | null = null;
    
    if (result?.type === "milestone") {
      targetMilestone = result.milestone;
    } else if (result?.type === "before_journey") {
      // Find the pseudo-milestone for "Før afrejse"
      targetMilestone = extendedMilestones.find(m => m.id === BEFORE_JOURNEY_ID) || null;
    } else if (result?.type === "after_journey") {
      // Find the pseudo-milestone for "Efter rejsen"
      targetMilestone = extendedMilestones.find(m => m.id === AFTER_JOURNEY_ID) || null;
    }
    
    if (targetMilestone) {
      const milestoneIndex = extendedMilestones.findIndex(m => m.id === targetMilestone!.id);
      const milestonePosts = getPostsForMilestone(targetMilestone);
      
      // Find the index of the clicked post
      const postIndex = milestonePosts.findIndex(p => p.id === post.id);
      
      setActiveMilestone(targetMilestone);
      setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
      setCarouselPosts(milestonePosts);
      setActivePostIndex(postIndex >= 0 ? postIndex : 0);
      setHighlightPostId(post.id);
      setShowCarousel(true);
      setCarouselViewMode("posts");
    }
  }, [milestones, extendedMilestones, getPostsForMilestone]);

  // Handle milestone change from carousel (when swiping in milestone view)
  const handleCarouselMilestoneChange = useCallback((index: number, milestone: Milestone) => {
    setActiveMilestoneIndex(index);
    setActiveMilestone(milestone);
    
    // Update posts for this milestone
    const posts = getPostsForMilestone(milestone);
    setCarouselPosts(posts);
    setActivePostIndex(0);
    if (posts.length > 0) {
      setHighlightPostId(posts[0].id);
    } else {
      setHighlightPostId(null);
    }
    
    // Zoom map to milestone location
    const params = new URLSearchParams(searchParams.toString());
    params.set("lat", milestone.lat.toString());
    params.set("lng", milestone.lng.toString());
    params.set("zoom", "10"); // Zoomed out to see the area
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [getPostsForMilestone, router, searchParams]);

  // Handle view mode change in carousel
  const handleViewModeChange = useCallback((mode: CarouselViewMode) => {
    setCarouselViewMode(mode);
    
    // When switching to posts view, update map to first post location
    if (mode === "posts" && carouselPosts.length > 0) {
      const firstPost = carouselPosts[0];
      if (firstPost.lat && firstPost.lng) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", firstPost.lat.toString());
        params.set("lng", firstPost.lng.toString());
        params.set("zoom", "12");
        router.replace(`/?${params.toString()}`, { scroll: false });
      }
    }
    // When switching to milestones view, zoom out to show the milestone
    else if (mode === "milestones" && activeMilestone) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("lat", activeMilestone.lat.toString());
      params.set("lng", activeMilestone.lng.toString());
      params.set("zoom", "8"); // More zoomed out
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
  }, [carouselPosts, activeMilestone, router, searchParams]);

  const handleMapError = useCallback(() => {
    setMapError(true);
  }, []);

  const handleRetryMap = useCallback(() => {
    setMapError(false);
    setMapKey((k) => k + 1);
  }, []);

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <Header
        isAuthor={isAuthor}
        activeView={activeView}
        onViewChange={handleViewChange}
        showNavigation={true}
      />

      {/* Feed View */}
      {activeView === "feed" && (
        <div className="flex-1 overflow-y-auto">
          <main className="max-w-2xl mx-auto pb-8">
            {hasPosts ? (
              <PostFeed groups={groupedPosts} focusPostId={focusPostId} />
            ) : (
              <div className="px-4 py-8">
                <EmptyFeed />
              </div>
            )}
          </main>

          {/* Minimal footer */}
          <footer className="border-t border-border bg-white py-4">
            <div className="flex items-center justify-center text-xs text-muted-foreground">
              <span>© {new Date().getFullYear()} Tommy & Amalie</span>
            </div>
          </footer>
        </div>
      )}

      {/* Map View - Only render when active for reliable Mapbox initialization */}
      {activeView === "map" && (
        <div 
          ref={mapContainerRef}
          className="flex-1 flex flex-col lg:flex-row overflow-hidden"
        >
          {/* Desktop Timeline Sidebar */}
          <aside className="hidden lg:block w-80 border-r border-border overflow-y-auto bg-white flex-shrink-0">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">Rejserute</h2>
              <p className="text-sm text-muted-foreground">
                {milestones.length} destinationer
              </p>
            </div>
            <div className="p-2">
              <Timeline
                milestones={milestones}
                activeMilestone={activeMilestone}
                onMilestoneClick={handleMilestoneClick}
              />
            </div>
          </aside>

          {/* Map Container */}
          <div className="flex-1 relative bg-muted">
            {mapError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-muted">
                <MapIcon className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-center mb-4">
                  Kortet kunne ikke indlæses
                </p>
                <Button onClick={handleRetryMap} variant="outline" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Prøv igen
                </Button>
              </div>
            ) : (
              <>
                <JourneyMap
                  key={mapKey}
                  milestones={milestones}
                  posts={mapPosts}
                  onMilestoneClick={handleMilestoneClick}
                  onPostClick={handleMapPostClick}
                  onError={handleMapError}
                  focusLat={focusLat}
                  focusLng={focusLng}
                  focusZoom={focusZoom}
                  activeMilestone={activeMilestone}
                  highlightPostId={highlightPostId}
                />

                {/* Journey Carousel - shows milestones or posts */}
                {showCarousel && activeMilestone && (
                  <JourneyCarousel
                    milestones={extendedMilestones}
                    activeMilestone={activeMilestone}
                    activeMilestoneIndex={activeMilestoneIndex}
                    posts={carouselPosts}
                    activePostIndex={activePostIndex}
                    viewMode={carouselViewMode}
                    onViewModeChange={handleViewModeChange}
                    onMilestoneChange={handleCarouselMilestoneChange}
                    onPostChange={handleCarouselPostChange}
                    onPostClick={handlePostClick}
                    onClose={handleCarouselClose}
                    getPostsForMilestone={getPostsForMilestone}
                  />
                )}
              </>
            )}

            {/* Mobile Timeline Toggle - hidden when carousel is open */}
            {!showCarousel && (
              <div className="lg:hidden absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none z-30">
                <Button
                  onClick={() => setShowTimeline(true)}
                  className="gap-2 shadow-lg pointer-events-auto"
                  size="lg"
                >
                  <List className="h-5 w-5" />
                  Se rejserute ({milestones.length} stops)
                </Button>
              </div>
            )}

            {/* Legend */}
            <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 text-sm hidden lg:block">
              <h3 className="font-medium mb-2">Forklaring</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-saffron text-white text-xs flex items-center justify-center font-bold">
                    1
                  </div>
                  <span className="text-muted-foreground">Milepæl</span>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                    style={{ 
                      background: "linear-gradient(135deg, #FF9933 0%, #138808 100%)",
                    }}
                  />
                  <span className="text-muted-foreground">Opslag</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 border-t-2 border-dashed border-saffron" />
                  <span className="text-muted-foreground">Rute</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Timeline Drawer */}
          {showTimeline && (
            <div
              className="lg:hidden fixed inset-0 z-50 bg-black/50"
              onClick={() => setShowTimeline(false)}
            >
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[70vh] overflow-hidden",
                  "animate-slide-up"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Handle */}
                <div className="flex justify-center pt-3">
                  <div className="w-12 h-1.5 bg-muted rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div>
                    <h2 className="text-lg font-bold text-navy">Rejserute</h2>
                    <p className="text-sm text-muted-foreground">
                      {milestones.length} destinationer
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowTimeline(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Timeline */}
                <div className="overflow-y-auto max-h-[calc(70vh-100px)] p-2">
                  <Timeline
                    milestones={milestones}
                    activeMilestone={activeMilestone}
                    onMilestoneClick={(m) => {
                      handleMilestoneClick(m);
                      setShowTimeline(false);
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
