/**
 * Script to optimize existing media files in Supabase Storage
 * 
 * This script:
 * 1. Fetches all image media records from the database
 * 2. Downloads each image from Supabase Storage
 * 3. Optimizes it using sharp (resize + WebP conversion)
 * 4. Uploads the optimized version with a new path
 * 5. Updates the database record with the new path
 * 6. Optionally deletes the original file
 * 
 * Usage:
 *   npx tsx scripts/optimize-existing-media.ts
 * 
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (not anon key!)
 * 
 * Options:
 *   --dry-run    Preview what would be optimized without making changes
 *   --keep-original   Keep original files after optimization
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

// Configuration
const CONFIG = {
  maxDimension: 2048,
  quality: 85,
  format: "webp" as const,
  minSavingsPercent: 10, // Only replace if at least 10% smaller
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const KEEP_ORIGINAL = args.includes("--keep-original");

// Validate environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "✗");
  console.error("\nMake sure to set these in your .env.local file or environment.");
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface MediaRecord {
  id: string;
  post_id: string;
  storage_path: string;
  type: string;
  mime_type: string | null;
}

interface OptimizationResult {
  id: string;
  originalPath: string;
  newPath: string | null;
  originalSize: number;
  newSize: number | null;
  savings: number;
  status: "optimized" | "skipped" | "error";
  reason?: string;
}

async function fetchMediaRecords(): Promise<MediaRecord[]> {
  console.log("📋 Fetching media records from database...");
  
  const { data, error } = await supabase
    .from("media")
    .select("id, post_id, storage_path, type, mime_type")
    .eq("type", "image");

  if (error) {
    throw new Error(`Failed to fetch media records: ${error.message}`);
  }

  console.log(`   Found ${data.length} image records`);
  return data;
}

async function downloadImage(path: string): Promise<{ buffer: Buffer; size: number } | null> {
  const { data, error } = await supabase.storage
    .from("media")
    .download(path);

  if (error) {
    console.error(`   ❌ Failed to download ${path}: ${error.message}`);
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return { buffer, size: buffer.length };
}

async function optimizeImage(buffer: Buffer): Promise<{ buffer: Buffer; format: string }> {
  const optimized = await sharp(buffer)
    .resize(CONFIG.maxDimension, CONFIG.maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: CONFIG.quality })
    .toBuffer();

  return { buffer: optimized, format: "webp" };
}

async function uploadOptimized(
  buffer: Buffer,
  originalPath: string
): Promise<string> {
  // Generate new path with .webp extension
  const pathParts = originalPath.split("/");
  const filename = pathParts.pop()!;
  const baseName = filename.replace(/\.[^.]+$/, "");
  const newFilename = `${baseName}.webp`;
  const newPath = [...pathParts, newFilename].join("/");

  const { error } = await supabase.storage
    .from("media")
    .upload(newPath, buffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload optimized image: ${error.message}`);
  }

  return newPath;
}

async function updateMediaRecord(id: string, newPath: string): Promise<void> {
  const { error } = await supabase
    .from("media")
    .update({
      storage_path: newPath,
      mime_type: "image/webp",
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update media record: ${error.message}`);
  }
}

async function deleteOriginal(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from("media")
    .remove([path]);

  if (error) {
    console.warn(`   ⚠️  Failed to delete original: ${error.message}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function processMedia(record: MediaRecord): Promise<OptimizationResult> {
  const result: OptimizationResult = {
    id: record.id,
    originalPath: record.storage_path,
    newPath: null,
    originalSize: 0,
    newSize: null,
    savings: 0,
    status: "skipped",
  };

  // Skip if already WebP
  if (record.storage_path.endsWith(".webp")) {
    result.reason = "Already WebP";
    return result;
  }

  // Download original
  const downloaded = await downloadImage(record.storage_path);
  if (!downloaded) {
    result.status = "error";
    result.reason = "Download failed";
    return result;
  }

  result.originalSize = downloaded.size;

  // Optimize
  try {
    const optimized = await optimizeImage(downloaded.buffer);
    result.newSize = optimized.buffer.length;
    result.savings = ((downloaded.size - optimized.buffer.length) / downloaded.size) * 100;

    // Check if savings are worth it
    if (result.savings < CONFIG.minSavingsPercent) {
      result.reason = `Only ${result.savings.toFixed(1)}% savings (min ${CONFIG.minSavingsPercent}%)`;
      return result;
    }

    if (DRY_RUN) {
      result.status = "optimized";
      result.reason = "Dry run - no changes made";
      result.newPath = record.storage_path.replace(/\.[^.]+$/, ".webp");
      return result;
    }

    // Upload optimized version
    const newPath = await uploadOptimized(optimized.buffer, record.storage_path);
    result.newPath = newPath;

    // Update database
    await updateMediaRecord(record.id, newPath);

    // Delete original if not keeping
    if (!KEEP_ORIGINAL && newPath !== record.storage_path) {
      await deleteOriginal(record.storage_path);
    }

    result.status = "optimized";
  } catch (error) {
    result.status = "error";
    result.reason = error instanceof Error ? error.message : "Unknown error";
  }

  return result;
}

async function main() {
  console.log("🖼️  Media Optimization Script");
  console.log("═══════════════════════════════════════");
  console.log(`   Max dimension: ${CONFIG.maxDimension}px`);
  console.log(`   Quality: ${CONFIG.quality}%`);
  console.log(`   Format: ${CONFIG.format.toUpperCase()}`);
  console.log(`   Min savings: ${CONFIG.minSavingsPercent}%`);
  console.log(`   Dry run: ${DRY_RUN ? "Yes" : "No"}`);
  console.log(`   Keep originals: ${KEEP_ORIGINAL ? "Yes" : "No"}`);
  console.log("═══════════════════════════════════════\n");

  try {
    const records = await fetchMediaRecords();
    
    if (records.length === 0) {
      console.log("✅ No images to optimize!");
      return;
    }

    const results: OptimizationResult[] = [];
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      console.log(`\n[${i + 1}/${records.length}] Processing: ${record.storage_path}`);
      
      const result = await processMedia(record);
      results.push(result);

      if (result.status === "optimized") {
        console.log(`   ✅ Optimized: ${formatBytes(result.originalSize)} → ${formatBytes(result.newSize!)} (${result.savings.toFixed(1)}% smaller)`);
      } else if (result.status === "skipped") {
        console.log(`   ⏭️  Skipped: ${result.reason}`);
      } else {
        console.log(`   ❌ Error: ${result.reason}`);
      }
    }

    // Summary
    console.log("\n═══════════════════════════════════════");
    console.log("📊 Summary");
    console.log("═══════════════════════════════════════");

    const optimized = results.filter((r) => r.status === "optimized");
    const skipped = results.filter((r) => r.status === "skipped");
    const errors = results.filter((r) => r.status === "error");

    const totalOriginalSize = optimized.reduce((sum, r) => sum + r.originalSize, 0);
    const totalNewSize = optimized.reduce((sum, r) => sum + (r.newSize || 0), 0);
    const totalSaved = totalOriginalSize - totalNewSize;

    console.log(`   Optimized: ${optimized.length}`);
    console.log(`   Skipped: ${skipped.length}`);
    console.log(`   Errors: ${errors.length}`);
    
    if (optimized.length > 0) {
      console.log(`\n   Storage saved: ${formatBytes(totalSaved)}`);
      console.log(`   Before: ${formatBytes(totalOriginalSize)}`);
      console.log(`   After: ${formatBytes(totalNewSize)}`);
    }

    if (DRY_RUN && optimized.length > 0) {
      console.log("\n💡 Run without --dry-run to apply changes");
    }

  } catch (error) {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  }
}

main();
