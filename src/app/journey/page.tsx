import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { JourneyClient } from "./JourneyClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rejserute | Indien Rejsedagbog",
  description: "Se hele rejseruten gennem Indien på kortet",
};

export default async function JourneyPage() {
  const supabase = await createClient();

  // Check if current user is author
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

  // Fetch milestones
  const { data: milestones } = await supabase
    .from("milestones")
    .select("*")
    .order("display_order", { ascending: true });

  // Fetch posts with location
  const { data: posts } = await supabase
    .from("posts")
    .select(`
      id,
      body,
      lat,
      lng,
      location_name,
      created_at,
      captured_at,
      media (storage_path)
    `)
    .not("lat", "is", null)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header isAuthor={isAuthor} />
      <JourneyClient
        milestones={milestones || []}
        posts={posts || []}
      />
    </div>
  );
}

