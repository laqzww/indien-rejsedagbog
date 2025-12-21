"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "./Header";
import { PostFeed } from "./post/PostFeed";
import { EmptyFeed } from "./post/EmptyFeed";
import { Timeline } from "./map/Timeline";
import { Button } from "./ui/button";
import { List, Map as MapIcon, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/database";
import type { MilestoneGroup } from "@/lib/journey";

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
  media: { storage_path: string }[];
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
  
  // Compute active view from URL - URL is the single source of truth
  // This ensures "Se på kort" links always switch the view correctly
  const activeView: "feed" | "map" = urlView === "map" ? "map" : (urlView === "feed" ? "feed" : initialView);
  
  // Parse focus coordinates
  const focusLat = urlLat ? parseFloat(urlLat) : initialFocusLat;
  const focusLng = urlLng ? parseFloat(urlLng) : initialFocusLng;
  const focusZoom = urlZoom ? parseFloat(urlZoom) : initialFocusZoom;
  
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [mapError, setMapError] = useState(false);
  
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

  const handleMilestoneClick = useCallback((milestone: Milestone) => {
    setActiveMilestone(milestone);
  }, []);

  const handlePostClick = useCallback((post: { id: string }) => {
    window.location.href = `/post/${post.id}`;
  }, []);

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
              <PostFeed groups={groupedPosts} />
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

      {/* Map View */}
      {activeView === "map" && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
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
              <JourneyMap
                key={`${mapKey}-${focusLat ?? "default"}-${focusLng ?? "default"}`}
                milestones={milestones}
                posts={mapPosts}
                onMilestoneClick={handleMilestoneClick}
                onPostClick={handlePostClick}
                onError={handleMapError}
                focusLat={focusLat}
                focusLng={focusLng}
                focusZoom={focusZoom}
              />
            )}

            {/* Mobile Timeline Toggle */}
            <div className="lg:hidden absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none">
              <Button
                onClick={() => setShowTimeline(true)}
                className="gap-2 shadow-lg pointer-events-auto"
                size="lg"
              >
                <List className="h-5 w-5" />
                Se rejserute ({milestones.length} stops)
              </Button>
            </div>

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
                  <div className="w-5 h-5 rounded-full bg-india-green text-white text-xs flex items-center justify-center">
                    📍
                  </div>
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
