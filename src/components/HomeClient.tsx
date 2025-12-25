"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "./Header";
import { PostFeed } from "./post/PostFeed";
import { EmptyFeed } from "./post/EmptyFeed";
import { Timeline } from "./map/Timeline";
import { PostCarousel, type CarouselPost } from "./map/PostCarousel";
import { Button } from "./ui/button";
import { List, Map as MapIcon, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/database";
import type { MilestoneGroup } from "@/lib/journey";
import { findMilestoneForDate } from "@/lib/journey";

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
  
  // Track if map has ever been shown - once shown, keep it mounted
  const [mapHasBeenShown, setMapHasBeenShown] = useState(initialView === "map");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Update mapHasBeenShown when switching to map view
  useEffect(() => {
    if (activeView === "map" && !mapHasBeenShown) {
      setMapHasBeenShown(true);
    }
  }, [activeView, mapHasBeenShown]);
  
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

  // Helper to get posts for a milestone
  const getPostsForMilestone = useCallback((milestone: Milestone): CarouselPost[] => {
    return mapPosts.filter((post) => {
      if (!post.lat || !post.lng) return false;
      const postDate = post.captured_at || post.created_at;
      const result = findMilestoneForDate(postDate, milestones);
      return result?.type === "milestone" && result.milestone.id === milestone.id;
    });
  }, [mapPosts, milestones]);

  const handleMilestoneClick = useCallback((milestone: Milestone, milestonePosts?: CarouselPost[]) => {
    setActiveMilestone(milestone);
    // Use provided posts or find them
    const posts = milestonePosts ?? getPostsForMilestone(milestone);
    if (posts.length > 0) {
      setCarouselPosts(posts);
      setActivePostIndex(0);
      setHighlightPostId(posts[0].id);
    } else {
      // Close carousel if no posts
      setCarouselPosts([]);
      setHighlightPostId(null);
    }
  }, [getPostsForMilestone]);

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
    setActiveMilestone(null);
    setCarouselPosts([]);
    setHighlightPostId(null);
    setActivePostIndex(0);
    
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
    
    if (result?.type === "milestone") {
      const milestone = result.milestone;
      const milestonePosts = getPostsForMilestone(milestone);
      
      // Find the index of the clicked post
      const postIndex = milestonePosts.findIndex(p => p.id === post.id);
      
      if (milestonePosts.length > 0) {
        setActiveMilestone(milestone);
        setCarouselPosts(milestonePosts);
        setActivePostIndex(postIndex >= 0 ? postIndex : 0);
        setHighlightPostId(post.id);
      }
    }
  }, [milestones, getPostsForMilestone]);

  const handleMapError = useCallback(() => {
    setMapError(true);
  }, []);

  const handleRetryMap = useCallback(() => {
    setMapError(false);
    setMapKey((k) => k + 1);
  }, []);

  // Should we render the map? Only if it's active or has been shown before
  const shouldRenderMap = activeView === "map" || mapHasBeenShown;

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

      {/* Map View - Render if active OR if it has been shown before (for faster switching back) */}
      {shouldRenderMap && (
        <div 
          ref={mapContainerRef}
          className="flex-1 flex flex-col lg:flex-row overflow-hidden"
          style={{
            // When not active, move off-screen but keep dimensions (for Mapbox)
            position: activeView !== "map" ? "absolute" : undefined,
            left: activeView !== "map" ? "-9999px" : undefined,
            top: activeView !== "map" ? "0" : undefined,
            width: activeView !== "map" ? "100%" : undefined,
            height: activeView !== "map" ? "100%" : undefined,
          }}
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
                  isVisible={activeView === "map"}
                  activeMilestone={activeMilestone}
                  highlightPostId={highlightPostId}
                />

                {/* Post Carousel */}
                {activeMilestone && carouselPosts.length > 0 && (
                  <PostCarousel
                    posts={carouselPosts}
                    milestone={activeMilestone}
                    activePostIndex={activePostIndex}
                    onPostChange={handleCarouselPostChange}
                    onPostClick={handlePostClick}
                    onClose={handleCarouselClose}
                  />
                )}
              </>
            )}

            {/* Mobile Timeline Toggle - hidden when carousel is open */}
            {!(activeMilestone && carouselPosts.length > 0) && (
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
