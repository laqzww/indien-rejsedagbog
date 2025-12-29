"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "./Header";
import { PostFeed } from "./post/PostFeed";
import { EmptyFeed } from "./post/EmptyFeed";
// Timeline sidebar removed - now using carousel for all milestone browsing
import { JourneyCarousel, type CarouselPost, type CarouselMedia, type CarouselViewMode } from "./map/PostCarousel";
import type { MapStyle } from "./map/JourneyMap";
import { Button } from "./ui/button";
import { Route, Map as MapIcon, RefreshCw, Layers } from "lucide-react";
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

// Heights for bottom UI overlays in pixels
// Used to adjust map extent calculations so the visible area is above the overlay

// Carousel height: header (~40px) + card (120px image + 70px content) + padding (~20px) ≈ 250px + buffer
const CAROUSEL_HEIGHT = 280;

// "Se rejserute" button height: button (~44px) + padding (~32px)
const BUTTON_HEIGHT = 80;

// Media type with location data for individual media markers
export interface JourneyMedia {
  id: string;
  type: string;
  storage_path: string;
  thumbnail_path: string | null;
  display_order: number;
  lat: number | null;
  lng: number | null;
}

interface JourneyPost {
  id: string;
  body: string;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  created_at: string;
  captured_at: string | null;
  media: JourneyMedia[];
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
  const urlFocusPost = searchParams.get("focusPost"); // Post ID to focus on in map carousel
  
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
  const [mapKey, setMapKey] = useState(0);
  const [mapError, setMapError] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  
  // Carousel state
  const [carouselPosts, setCarouselPosts] = useState<CarouselPost[]>([]);
  const [activePostIndex, setActivePostIndex] = useState(0);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [carouselViewMode, setCarouselViewMode] = useState<CarouselViewMode>("posts");
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(0);
  const [showCarousel, setShowCarousel] = useState(false);
  
  // Media level state (for the third carousel level)
  const [activePost, setActivePost] = useState<CarouselPost | null>(null);
  const [mediaItems, setMediaItems] = useState<CarouselMedia[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [highlightMediaId, setHighlightMediaId] = useState<string | null>(null);
  
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

  // Track if we've already initialized the carousel from focusPost to prevent duplicate init
  const initializedFocusPostRef = useRef<string | null>(null);

  // Helper to get posts for a milestone
  const getPostsForMilestone = useCallback((milestone: Milestone): CarouselPost[] => {
    return mapPosts.filter((post) => {
      if (!post.lat || !post.lng) return false;
      const postDate = post.captured_at || post.created_at;
      const result = findMilestoneForDate(postDate, milestones);
      return result?.type === "milestone" && result.milestone.id === milestone.id;
    });
  }, [mapPosts, milestones]);

  // Reset carousel state when leaving map view
  // Map now starts at "route overview" level (carousel closed) - user clicks "Se rejserute" to open
  useEffect(() => {
    if (activeView !== "map") {
      // Reset the flag when leaving map view so focusPost can re-initialize on next visit
      initializedFocusPostRef.current = null;
      // Close carousel when leaving map view
      setShowCarousel(false);
      setActiveMilestone(null);
      setCarouselPosts([]);
      setHighlightPostId(null);
      // Reset media state
      setActivePost(null);
      setMediaItems([]);
      setActiveMediaIndex(0);
      setHighlightMediaId(null);
    }
  }, [activeView]);

  // Auto-initialize carousel when focusPost parameter is present and we're in map view
  useEffect(() => {
    // Only run in map view with focusPost parameter
    if (activeView !== "map" || !urlFocusPost) return;
    
    // Prevent duplicate initialization for the same post
    if (initializedFocusPostRef.current === urlFocusPost) return;
    
    // Find the post in mapPosts
    const focusPost = mapPosts.find(p => p.id === urlFocusPost);
    if (!focusPost) return;
    
    // Mark as initialized
    initializedFocusPostRef.current = urlFocusPost;
    
    // Find which milestone this post belongs to
    const postDate = focusPost.captured_at || focusPost.created_at;
    const result = findMilestoneForDate(postDate, milestones);
    
    // For posts before/after journey, we can't show carousel - just show map focus
    if (!result || result.type !== "milestone") return;
    
    // For regular milestone posts, open carousel
    const milestone = result.milestone;
    const milestoneIndex = milestones.findIndex(m => m.id === milestone.id);
    const milestonePosts = getPostsForMilestone(milestone);
    
    // Find the index of the focus post
    const postIndex = milestonePosts.findIndex(p => p.id === focusPost.id);
    
    setActiveMilestone(milestone);
    setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
    setCarouselPosts(milestonePosts);
    setActivePostIndex(postIndex >= 0 ? postIndex : 0);
    setHighlightPostId(focusPost.id);
    setShowCarousel(true);
    setCarouselViewMode("posts");
  }, [activeView, urlFocusPost, mapPosts, milestones, getPostsForMilestone]);

  const handleMilestoneClick = useCallback((milestone: Milestone, milestonePosts?: CarouselPost[]) => {
    // Find milestone index in regular milestones list
    const milestoneIndex = milestones.findIndex(m => m.id === milestone.id);
    
    setActiveMilestone(milestone);
    setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
    setShowCarousel(true);
    // Always start in milestones view when clicking a milestone - this allows 
    // browsing between areas first, then drilling into posts
    setCarouselViewMode("milestones");
    
    // Use provided posts or find them (for when user switches to posts view)
    const posts = milestonePosts ?? getPostsForMilestone(milestone);
    setCarouselPosts(posts);
    if (posts.length > 0) {
      setActivePostIndex(0);
      setHighlightPostId(posts[0].id);
    } else {
      setHighlightPostId(null);
    }
  }, [getPostsForMilestone, milestones]);

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
      params.set("zoom", "16"); // Very close zoom for seeing the local area around the post
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
    // Reset media state
    setActivePost(null);
    setMediaItems([]);
    setActiveMediaIndex(0);
    setHighlightMediaId(null);
    
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
    
    // For posts before/after journey, navigate directly to feed instead of carousel
    if (result?.type === "before_journey" || result?.type === "after_journey") {
      handlePostClick(post);
      return;
    }
    
    // For regular milestone posts, open carousel
    if (result?.type === "milestone") {
      const milestone = result.milestone;
      const milestoneIndex = milestones.findIndex(m => m.id === milestone.id);
      const milestonePosts = getPostsForMilestone(milestone);
      
      // Find the index of the clicked post
      const postIndex = milestonePosts.findIndex(p => p.id === post.id);
      
      setActiveMilestone(milestone);
      setActiveMilestoneIndex(milestoneIndex >= 0 ? milestoneIndex : 0);
      setCarouselPosts(milestonePosts);
      setActivePostIndex(postIndex >= 0 ? postIndex : 0);
      setHighlightPostId(post.id);
      setShowCarousel(true);
      setCarouselViewMode("posts");
    }
  }, [milestones, getPostsForMilestone, handlePostClick]);

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
    
    // When switching to posts view, update map to first post location and clear media state
    if (mode === "posts") {
      // Clear media state when going back to posts
      setActivePost(null);
      setMediaItems([]);
      setActiveMediaIndex(0);
      setHighlightMediaId(null);
      
      if (carouselPosts.length > 0) {
        const firstPost = carouselPosts[0];
        if (firstPost.lat && firstPost.lng) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("lat", firstPost.lat.toString());
          params.set("lng", firstPost.lng.toString());
          params.set("zoom", "16"); // Very close zoom for seeing the local area
          router.replace(`/?${params.toString()}`, { scroll: false });
        }
      }
    }
    // When switching to milestones view, zoom out to show the milestone
    else if (mode === "milestones" && activeMilestone) {
      // Clear media state when going to milestones
      setActivePost(null);
      setMediaItems([]);
      setActiveMediaIndex(0);
      setHighlightMediaId(null);
      
      const params = new URLSearchParams(searchParams.toString());
      params.set("lat", activeMilestone.lat.toString());
      params.set("lng", activeMilestone.lng.toString());
      params.set("zoom", "8"); // More zoomed out
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
    // When switching to media view, set up media state from current post
    else if (mode === "media") {
      const currentPost = carouselPosts[activePostIndex];
      if (currentPost) {
        // Sort media by display_order (same as in feed/gallery)
        const sortedMedia = [...currentPost.media].sort(
          (a, b) => a.display_order - b.display_order
        );
        
        setActivePost(currentPost);
        setMediaItems(sortedMedia);
        setActiveMediaIndex(0);
        
        // Highlight first media and zoom to its location
        if (sortedMedia.length > 0) {
          const firstMedia = sortedMedia[0];
          setHighlightMediaId(firstMedia.id);
          
          // Use media's location if available, otherwise post's location
          const lat = firstMedia.lat ?? currentPost.lat;
          const lng = firstMedia.lng ?? currentPost.lng;
          
          if (lat && lng) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("lat", lat.toString());
            params.set("lng", lng.toString());
            params.set("zoom", "17"); // Very close for media-level detail
            router.replace(`/?${params.toString()}`, { scroll: false });
          }
        }
      }
    }
  }, [carouselPosts, activePostIndex, activeMilestone, router, searchParams]);

  // Handle media change in carousel (when swiping between media items)
  const handleCarouselMediaChange = useCallback((index: number, media: CarouselMedia) => {
    setActiveMediaIndex(index);
    setHighlightMediaId(media.id);
    
    // Zoom map to media location (or post location if media doesn't have GPS)
    const lat = media.lat ?? activePost?.lat;
    const lng = media.lng ?? activePost?.lng;
    
    if (lat && lng) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("lat", lat.toString());
      params.set("lng", lng.toString());
      params.set("zoom", "17"); // Very close for media-level detail
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
  }, [activePost, router, searchParams]);

  // Handle media click in carousel - navigate to full post view
  const handleMediaClick = useCallback((media: CarouselMedia) => {
    // Navigate to feed view and scroll to the post containing this media
    if (activePost) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "feed");
      params.set("post", activePost.id);
      params.delete("lat");
      params.delete("lng");
      params.delete("zoom");
      router.push(`/?${params.toString()}`, { scroll: false });
    }
  }, [activePost, router, searchParams]);

  // Handle media marker click on map - switch to media in carousel
  const handleMapMediaClick = useCallback((media: CarouselMedia, post: CarouselPost) => {
    // Find the index of the media in the current media items
    const mediaIndex = mediaItems.findIndex(m => m.id === media.id);
    
    if (mediaIndex >= 0) {
      setActiveMediaIndex(mediaIndex);
      setHighlightMediaId(media.id);
      
      // Zoom to media location
      const lat = media.lat ?? post.lat;
      const lng = media.lng ?? post.lng;
      
      if (lat && lng) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", lat.toString());
        params.set("lng", lng.toString());
        params.set("zoom", "17");
        router.replace(`/?${params.toString()}`, { scroll: false });
      }
    }
  }, [mediaItems, router, searchParams]);

  // Handler for "Se rejserute" button - opens carousel at first milestone
  const handleShowJourney = useCallback(() => {
    if (milestones.length === 0) return;
    
    const firstMilestone = milestones[0];
    const milestonePosts = getPostsForMilestone(firstMilestone);
    
    setActiveMilestone(firstMilestone);
    setActiveMilestoneIndex(0);
    setCarouselPosts(milestonePosts);
    setActivePostIndex(0);
    if (milestonePosts.length > 0) {
      setHighlightPostId(milestonePosts[0].id);
    } else {
      setHighlightPostId(null);
    }
    setShowCarousel(true);
    setCarouselViewMode("milestones");
    
    // Zoom to first milestone
    const params = new URLSearchParams(searchParams.toString());
    params.set("lat", firstMilestone.lat.toString());
    params.set("lng", firstMilestone.lng.toString());
    params.set("zoom", "8");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [milestones, getPostsForMilestone, router, searchParams]);

  const handleMapError = useCallback(() => {
    setMapError(true);
  }, []);

  const handleRetryMap = useCallback(() => {
    setMapError(false);
    setMapKey((k) => k + 1);
  }, []);

  // Toggle between street and satellite map styles
  const handleToggleMapStyle = useCallback(() => {
    setMapStyle((prev) => prev === "streets" ? "satellite" : "streets");
  }, []);

  return (
    <div className="h-dvh h-[100svh] bg-white flex flex-col overflow-hidden">
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
          className="flex-1 flex flex-col overflow-hidden"
        >
          {/* Map Container - fills entire space */}
          <div className="flex-1 relative bg-muted overflow-hidden">
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
                  onMediaClick={handleMapMediaClick}
                  onError={handleMapError}
                  focusLat={focusLat}
                  focusLng={focusLng}
                  focusZoom={focusZoom}
                  activeMilestone={activeMilestone}
                  highlightPostId={highlightPostId}
                  highlightMediaId={highlightMediaId}
                  activePostForMedia={activePost}
                  showMediaMarkers={carouselViewMode === "media"}
                  extentBottomOffset={showCarousel ? CAROUSEL_HEIGHT : BUTTON_HEIGHT}
                  mapStyle={mapStyle}
                />

                {/* Journey Carousel - shows milestones, posts, or media (hierarchical) */}
                {showCarousel && activeMilestone && (
                  <JourneyCarousel
                    milestones={milestones}
                    activeMilestone={activeMilestone}
                    activeMilestoneIndex={activeMilestoneIndex}
                    posts={carouselPosts}
                    activePostIndex={activePostIndex}
                    activePost={activePost}
                    mediaItems={mediaItems}
                    activeMediaIndex={activeMediaIndex}
                    viewMode={carouselViewMode}
                    onViewModeChange={handleViewModeChange}
                    onMilestoneChange={handleCarouselMilestoneChange}
                    onPostChange={handleCarouselPostChange}
                    onMediaChange={handleCarouselMediaChange}
                    onPostClick={handlePostClick}
                    onMediaClick={handleMediaClick}
                    onClose={handleCarouselClose}
                    getPostsForMilestone={getPostsForMilestone}
                  />
                )}
              </>
            )}

            {/* "Se rejserute" button - opens carousel at first milestone */}
            {!showCarousel && milestones.length > 0 && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none z-30">
                <Button
                  onClick={handleShowJourney}
                  className="gap-2 shadow-lg pointer-events-auto"
                  size="lg"
                >
                  <Route className="h-5 w-5" />
                  Se rejserute ({milestones.length} stops)
                </Button>
              </div>
            )}

            {/* Map style toggle button - positioned below Mapbox zoom controls */}
            <button
              onClick={handleToggleMapStyle}
              className="absolute top-[88px] md:top-[78px] right-[10px] z-20 bg-white rounded-md shadow-lg p-1.5 hover:bg-gray-50 transition-colors border border-gray-200"
              title={mapStyle === "streets" ? "Skift til satellit" : "Skift til gadekort"}
            >
              <Layers className="h-4 w-4 text-gray-700" />
            </button>

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

        </div>
      )}
    </div>
  );
}
