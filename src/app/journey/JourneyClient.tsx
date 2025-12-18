"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Timeline } from "@/components/map/Timeline";
import { Button } from "@/components/ui/button";
import { List, Map as MapIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/database";

// Simplified post type for journey view
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

interface JourneyClientProps {
  milestones: Milestone[];
  posts: JourneyPost[];
}

export function JourneyClient({ milestones, posts }: JourneyClientProps) {
  const router = useRouter();
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  const handleMilestoneClick = (milestone: Milestone) => {
    setActiveMilestone(milestone);
  };

  const handlePostClick = (post: { id: string }) => {
    router.push(`/post/${post.id}`);
  };

  return (
    <main className="flex-1 flex flex-col lg:flex-row">
      {/* Desktop Timeline Sidebar */}
      <aside className="hidden lg:block w-80 border-r border-border overflow-y-auto bg-white">
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

      {/* Map - explicit height for mobile */}
      <div className="flex-1 relative min-h-[calc(100vh-4rem)] lg:min-h-0">
        <JourneyMap
          milestones={milestones}
          posts={posts}
          onMilestoneClick={handleMilestoneClick}
          onPostClick={handlePostClick}
        />

        {/* Mobile Timeline Toggle */}
        <div className="lg:hidden absolute bottom-4 left-4 right-4 flex justify-center">
          <Button
            onClick={() => setShowTimeline(true)}
            className="gap-2 shadow-lg"
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
    </main>
  );
}

