import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { PostCard } from "@/components/post/PostCard";
import { EmptyFeed } from "@/components/post/EmptyFeed";
import { Button } from "@/components/ui/button";
import { Map, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { PostWithMedia } from "@/types/database";

export const revalidate = 60; // Revalidate every minute

export default async function HomePage() {
  const supabase = await createClient();

  // Get current user to check if author
  const { data: { user } } = await supabase.auth.getUser();
  let isAuthor = false;
  
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_author")
      .eq("id", user.id)
      .single();
    isAuthor = profile?.is_author || false;
  }

  // Fetch posts with media and profile
  const { data: posts } = await supabase
    .from("posts")
    .select(`
      *,
      media (*),
      profile:profiles (*)
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch next milestone (upcoming or current)
  const today = new Date().toISOString().split("T")[0];
  const { data: nextMilestone } = await supabase
    .from("milestones")
    .select("name, arrival_date")
    .gte("arrival_date", today)
    .order("arrival_date", { ascending: true })
    .limit(1)
    .single();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-orange-50/30">
      <Header isAuthor={isAuthor} />

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Hero section */}
        <section className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-navy mb-4">
            Indien Rejsedagbog
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Følg med på vores eventyr gennem det utrolige Indien. 
            Fra de majestætiske forter i Rajasthan til de fredelige backwaters i Kerala.
          </p>

          {/* Next destination teaser */}
          {nextMilestone && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-saffron/10 rounded-full text-saffron text-sm font-medium">
              <span className="animate-pulse">📍</span>
              Næste stop: {nextMilestone.name}
            </div>
          )}

          {/* Journey link */}
          <div className="mt-6">
            <Link href="/journey">
              <Button variant="outline" className="gap-2">
                <Map className="h-4 w-4" />
                Se hele rejseruten
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Posts feed */}
        {posts && posts.length > 0 ? (
          <section>
            <h2 className="text-2xl font-bold text-navy mb-6">
              Seneste opslag
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <PostCard 
                  key={post.id} 
                  post={post as unknown as PostWithMedia} 
                  index={index}
                />
              ))}
            </div>
          </section>
        ) : (
          <EmptyFeed />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Indien Rejsedagbog
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/journey" className="hover:text-saffron transition-colors">
                Rejserute
              </Link>
              {isAuthor && (
                <Link href="/admin" className="hover:text-saffron transition-colors">
                  Admin
                </Link>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
