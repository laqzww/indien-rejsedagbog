/**
 * Export data from Supabase to static JSON files.
 *
 * Usage:
 *   npx tsx scripts/export-data.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Set them in .env.local or pass directly:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx npx tsx scripts/export-data.ts
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportData() {
  const dataDir = join(__dirname, "..", "src", "data");
  mkdirSync(dataDir, { recursive: true });

  // Export posts with media, links, and profiles (same query as page.tsx)
  console.log("Fetching posts...");
  const { data: posts, error: postsError } = await supabase
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
      author_id,
      media (id, type, storage_path, thumbnail_path, width, height, display_order),
      links (id, url, title, description, image_url, site_name),
      profile:profiles (display_name, avatar_url)
    `)
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (postsError) {
    console.error("Error fetching posts:", postsError);
    process.exit(1);
  }

  console.log(`  Found ${posts.length} posts`);
  const postsPath = join(dataDir, "posts.json");
  writeFileSync(postsPath, JSON.stringify(posts, null, 2));
  console.log(`  Written to ${postsPath}`);

  // Export milestones
  console.log("Fetching milestones...");
  const { data: milestones, error: milestonesError } = await supabase
    .from("milestones")
    .select("*")
    .order("display_order", { ascending: true });

  if (milestonesError) {
    console.error("Error fetching milestones:", milestonesError);
    process.exit(1);
  }

  console.log(`  Found ${milestones.length} milestones`);
  const milestonesPath = join(dataDir, "milestones.json");
  writeFileSync(milestonesPath, JSON.stringify(milestones, null, 2));
  console.log(`  Written to ${milestonesPath}`);

  console.log("\nDone! Data exported to src/data/");
}

exportData().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
