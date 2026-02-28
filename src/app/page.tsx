import { Suspense } from "react";
import { groupPostsByMilestoneAndDay } from "@/lib/journey";
import { HomeClient } from "@/components/HomeClient";
import { Map as MapIcon } from "lucide-react";
import postsData from "@/data/posts.json";
import milestonesData from "@/data/milestones.json";
import type { Milestone } from "@/types/database";

const posts = postsData as Array<{
  id: string;
  body: string;
  location_name: string | null;
  captured_at: string | null;
  created_at: string;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  media: Array<{
    id: string;
    type: string;
    storage_path: string;
    thumbnail_path: string | null;
    width: number | null;
    height: number | null;
    display_order: number;
  }>;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}>;
const milestones = milestonesData as Milestone[];

export default function HomePage() {
  // Group posts by milestone and day
  const groupedPosts = groupPostsByMilestoneAndDay(posts, milestones);

  // Filter posts with location for map (ascending by captured_at for carousel order)
  const mapPosts = posts
    .filter((p) => p.lat != null && p.lng != null)
    .sort((a, b) => {
      const dateA = new Date(a.captured_at || a.created_at).getTime();
      const dateB = new Date(b.captured_at || b.created_at).getTime();
      return dateA - dateB;
    })
    .map((p) => ({
      id: p.id,
      body: p.body,
      lat: p.lat,
      lng: p.lng,
      location_name: p.location_name,
      created_at: p.created_at,
      captured_at: p.captured_at,
      media: (p.media || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((m) => ({
          id: m.id,
          type: m.type,
          storage_path: m.storage_path,
          thumbnail_path: m.thumbnail_path,
          display_order: m.display_order,
        })),
    }));

  const hasPosts = posts.length > 0;

  return (
    <Suspense fallback={
      <div className="h-screen bg-white flex flex-col items-center justify-center">
        <MapIcon className="h-12 w-12 text-muted-foreground/20 animate-pulse" />
        <p className="text-muted-foreground mt-4">Indlæser...</p>
      </div>
    }>
      <HomeClient
        isAuthor={false}
        groupedPosts={groupedPosts}
        hasPosts={hasPosts}
        milestones={milestones}
        mapPosts={mapPosts}
      />
    </Suspense>
  );
}
