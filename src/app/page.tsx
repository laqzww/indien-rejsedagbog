import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getIsAuthor } from "@/lib/author";
import { groupPostsByMilestoneAndDay } from "@/lib/journey";
import { HomeClient } from "@/components/HomeClient";
import { Map as MapIcon } from "lucide-react";

export const revalidate = 60; // Revalidate every minute

interface PageProps {
  searchParams: Promise<{ 
    view?: string;
    lat?: string;
    lng?: string;
    zoom?: string;
  }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialView = params.view === "map" ? "map" : "feed";
  
  // Parse POI focus coordinates (for "Se på kort" feature)
  const focusLat = params.lat ? parseFloat(params.lat) : undefined;
  const focusLng = params.lng ? parseFloat(params.lng) : undefined;
  const focusZoom = params.zoom ? parseFloat(params.zoom) : undefined;
  
  const supabase = await createClient();

  // Get current user to check if author
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = await getIsAuthor(supabase, user);

  // Fetch posts with media and profile (using captured_at for ordering)
  const { data: postsRaw } = await supabase
    .from("posts")
    .select(`
      id,
      body,
      location_name,
      captured_at,
      created_at,
      tags,
      lat,
      lng,
      media (id, type, storage_path, thumbnail_path, width, height, display_order),
      profile:profiles (display_name, avatar_url)
    `)
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  // Serialize to clean JSON (removes Supabase metadata)
  const posts = postsRaw ? JSON.parse(JSON.stringify(postsRaw)) : [];

  // Fetch milestones for grouping and map
  const { data: milestones } = await supabase
    .from("milestones")
    .select("*")
    .order("display_order", { ascending: true });

  // Group posts by milestone and day
  const groupedPosts = groupPostsByMilestoneAndDay(posts, milestones || []);

  // Fetch posts with location for map (including media details for thumbnail markers)
  const { data: mapPostsRaw } = await supabase
    .from("posts")
    .select(`
      id,
      body,
      lat,
      lng,
      location_name,
      created_at,
      captured_at,
      media (id, type, storage_path, thumbnail_path, display_order)
    `)
    .not("lat", "is", null)
    .order("created_at", { ascending: false });

  const mapPosts = mapPostsRaw ? JSON.parse(JSON.stringify(mapPostsRaw)) : [];

  const hasPosts = posts && posts.length > 0;

  return (
    <Suspense fallback={
      <div className="h-screen bg-white flex flex-col items-center justify-center">
        <MapIcon className="h-12 w-12 text-muted-foreground/20 animate-pulse" />
        <p className="text-muted-foreground mt-4">Indlæser...</p>
      </div>
    }>
      <HomeClient
        isAuthor={isAuthor}
        groupedPosts={groupedPosts}
        hasPosts={hasPosts}
        milestones={milestones || []}
        mapPosts={mapPosts}
        initialView={initialView}
        focusLat={focusLat}
        focusLng={focusLng}
        focusZoom={focusZoom}
      />
    </Suspense>
  );
}
