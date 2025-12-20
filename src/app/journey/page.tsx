import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { JourneyClient } from "./JourneyClient";
import type { Metadata } from "next";
import { getIsAuthor } from "@/lib/author";

export const metadata: Metadata = {
  title: "Rejserute",
  description: "Se hele rejseruten gennem Indien på kortet",
};

export default async function JourneyPage({
  searchParams,
}: {
  searchParams?: { lat?: string; lng?: string };
}) {
  const supabase = await createClient();

  // Check if current user is author
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = await getIsAuthor(supabase, user);

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

  const initialCenter = (() => {
    const lat = Number(searchParams?.lat);
    const lng = Number(searchParams?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat] as [number, number];
    }
    return undefined;
  })();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header isAuthor={isAuthor} />
      <JourneyClient
        milestones={milestones || []}
        posts={posts || []}
        initialCenter={initialCenter}
      />
    </div>
  );
}

