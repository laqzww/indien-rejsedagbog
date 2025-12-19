import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { PostFeed } from "@/components/post/PostFeed";
import { EmptyFeed } from "@/components/post/EmptyFeed";
import { Button } from "@/components/ui/button";
import { Map, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getIsAuthor } from "@/lib/author";
import { groupPostsByMilestoneAndDay } from "@/lib/journey";

export const revalidate = 60; // Revalidate every minute

export default async function HomePage() {
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
      media (id, type, storage_path, width, height),
      profile:profiles (display_name, avatar_url)
    `)
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  // Serialize to clean JSON (removes Supabase metadata)
  const posts = postsRaw ? JSON.parse(JSON.stringify(postsRaw)) : [];

  // Fetch milestones for grouping
  const { data: milestones } = await supabase
    .from("milestones")
    .select("*")
    .order("display_order", { ascending: true });

  // Group posts by milestone and day
  const groupedPosts = groupPostsByMilestoneAndDay(posts, milestones || []);

  // Find the next milestone (the one AFTER the current location)
  // First find the current milestone (where today falls within its date range)
  const today = new Date().toISOString().split("T")[0];
  
  // Get all milestones sorted by arrival date to find current and next
  const { data: allMilestones } = await supabase
    .from("milestones")
    .select("name, arrival_date, departure_date, display_order")
    .order("display_order", { ascending: true });
  
  // Find the next milestone (first one where arrival_date > today)
  // This will skip the current location and show the upcoming one
  const nextMilestone = allMilestones?.find(m => {
    if (!m.arrival_date) return false;
    return m.arrival_date > today;
  }) || null;

  const hasPosts = posts && posts.length > 0;

  return (
    <div className="min-h-screen bg-white">
      <Header isAuthor={isAuthor} />

      {/* Mobile-first hero - compact on mobile */}
      <section className="bg-gradient-to-b from-saffron/5 to-white px-4 py-6 sm:py-10 text-center border-b border-border">
        <h1 className="text-2xl sm:text-4xl font-bold text-navy mb-2 sm:mb-4">
          Tommy & Amalies Indien 🇮🇳
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-4">
          Følg med på vores eventyr gennem det utrolige Indien
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {/* Next destination teaser */}
          {nextMilestone && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-saffron/10 rounded-full text-saffron text-xs sm:text-sm font-medium">
              <span className="animate-pulse">📍</span>
              Næste: {nextMilestone.name}
            </div>
          )}

          {/* Journey link */}
          <Link href="/journey">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm h-8">
              <Map className="h-3.5 w-3.5" />
              Se kort
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Posts feed - full width on mobile */}
      <main className="max-w-2xl mx-auto">
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
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} T&A</span>
          <Link href="/journey" className="hover:text-saffron transition-colors">
            Rejserute
          </Link>
          {isAuthor && (
            <Link href="/admin" className="hover:text-saffron transition-colors">
              Admin
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
