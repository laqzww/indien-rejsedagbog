"use client";

import { useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Header } from "./Header";
import { InstallBanner } from "./InstallBanner";
import { AdminPwaRedirect } from "./AdminPwaRedirect";
import { PostFeed } from "./post/PostFeed";
import { EmptyFeed } from "./post/EmptyFeed";
import { JourneyCarousel } from "./map/PostCarousel";
import { Button } from "./ui/button";
import { Route, Map as MapIcon, RefreshCw, Layers } from "lucide-react";
import type { Milestone } from "@/types/database";
import type { MilestoneGroup } from "@/lib/journey";
import { useViewNavigation } from "@/hooks/useViewNavigation";
import { useJourneyCarousel } from "@/hooks/useJourneyCarousel";
import { useMapState } from "@/hooks/useMapState";

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
const CAROUSEL_HEIGHT = 280;
const BUTTON_HEIGHT = 80;

// Post type for map display
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
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // URL-based navigation state
  const navigation = useViewNavigation({
    initialView,
    initialFocusLat,
    initialFocusLng,
    initialFocusZoom,
  });

  // Map display state (style, errors)
  const mapState = useMapState({
    initialStyle: "satellite",
    focusLat: navigation.focusLat,
    focusLng: navigation.focusLng,
  });

  // Carousel state and handlers
  const carousel = useJourneyCarousel({
    milestones,
    mapPosts,
    activeView: navigation.activeView,
    focusPostId: navigation.focusPostForCarousel,
    onMapFocusChange: navigation.updateMapFocus,
    onNavigateToPost: navigation.navigateToPost,
    onClose: navigation.clearMapFocus,
  });

  // Handler for "Se rejserute" button
  const handleShowJourney = useCallback(() => {
    if (milestones.length === 0) return;
    carousel.openAtMilestone(milestones[0], false);
  }, [milestones, carousel]);

  // Handler for post click in carousel (navigate to feed)
  const handleCarouselPostClick = useCallback(
    (post: { id: string }) => {
      navigation.navigateToPost(post.id);
    },
    [navigation]
  );

  return (
    <div className="h-dvh h-[100svh] bg-white flex flex-col overflow-hidden">
      {/* Redirect admin PWA users if opened at wrong URL */}
      <AdminPwaRedirect />
      
      <Header
        isAuthor={isAuthor}
        activeView={navigation.activeView}
        onViewChange={navigation.changeView}
        showNavigation={true}
      />

      {/* Install App Banner - only visible on mobile, not when installed */}
      <InstallBanner />

      {/* Feed View */}
      {navigation.activeView === "feed" && (
        <FeedView
          hasPosts={hasPosts}
          groupedPosts={groupedPosts}
          focusPostId={navigation.focusPostId}
        />
      )}

      {/* Map View */}
      {navigation.activeView === "map" && (
        <div ref={mapContainerRef} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative bg-muted overflow-hidden">
            {mapState.hasError ? (
              <MapErrorState onRetry={mapState.retry} />
            ) : (
              <>
                <JourneyMap
                  key={mapState.mapKey}
                  milestones={milestones}
                  posts={mapPosts}
                  onMilestoneClick={carousel.handleMilestoneClick}
                  onPostClick={carousel.handleMapPostClick}
                  onError={mapState.setError}
                  focusLat={navigation.focusLat}
                  focusLng={navigation.focusLng}
                  focusZoom={navigation.focusZoom}
                  activeMilestone={carousel.activeMilestone}
                  highlightPostId={carousel.highlightPostId}
                  extentBottomOffset={carousel.isOpen ? CAROUSEL_HEIGHT : BUTTON_HEIGHT}
                  mapStyle={mapState.mapStyle}
                />

                {/* Journey Carousel */}
                {carousel.isOpen && carousel.activeMilestone && (
                  <JourneyCarousel
                    milestones={milestones}
                    activeMilestone={carousel.activeMilestone}
                    activeMilestoneIndex={carousel.activeMilestoneIndex}
                    posts={carousel.carouselPosts}
                    activePostIndex={carousel.activePostIndex}
                    viewMode={carousel.viewMode}
                    onViewModeChange={carousel.handleViewModeChange}
                    onMilestoneChange={carousel.handleMilestoneChange}
                    onPostChange={carousel.handlePostChange}
                    onPostClick={handleCarouselPostClick}
                    onClose={carousel.close}
                    getPostsForMilestone={carousel.getPostsForMilestone}
                  />
                )}
              </>
            )}

            {/* "Se rejserute" button */}
            {!carousel.isOpen && milestones.length > 0 && (
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

            {/* Map style toggle */}
            <MapStyleToggle
              mapStyle={mapState.mapStyle}
              onToggle={mapState.toggleStyle}
            />

            {/* Legend (desktop only) */}
            <MapLegend />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface FeedViewProps {
  hasPosts: boolean;
  groupedPosts: MilestoneGroup[];
  focusPostId?: string;
}

function FeedView({ hasPosts, groupedPosts, focusPostId }: FeedViewProps) {
  return (
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

      <footer className="border-t border-border bg-white py-4">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Tommy & Amalie</span>
          <span className="text-muted-foreground/30">·</span>
          <Link 
            href="/admin" 
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}

interface MapErrorStateProps {
  onRetry: () => void;
}

function MapErrorState({ onRetry }: MapErrorStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-muted">
      <MapIcon className="h-16 w-16 text-muted-foreground/30 mb-4" />
      <p className="text-muted-foreground text-center mb-4">
        Kortet kunne ikke indlæses
      </p>
      <Button onClick={onRetry} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Prøv igen
      </Button>
    </div>
  );
}

interface MapStyleToggleProps {
  mapStyle: "streets" | "satellite";
  onToggle: () => void;
}

function MapStyleToggle({ mapStyle, onToggle }: MapStyleToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="absolute top-[88px] md:top-[78px] right-[10px] z-20 bg-white rounded-md shadow-lg p-1.5 hover:bg-gray-50 transition-colors border border-gray-200"
      title={mapStyle === "streets" ? "Skift til satellit" : "Skift til gadekort"}
    >
      <Layers className="h-4 w-4 text-gray-700" />
    </button>
  );
}

function MapLegend() {
  return (
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
  );
}
