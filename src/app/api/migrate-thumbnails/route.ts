import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getIsAuthor } from "@/lib/author";
import sharp from "sharp";

// Carousel thumbnail settings - same as client-side but for server
const CAROUSEL_MAX_WIDTH = 640;
const CAROUSEL_MAX_HEIGHT = 640;
const CAROUSEL_QUALITY = 70;

/**
 * API endpoint to generate carousel thumbnails for existing images
 * This is a migration tool that can be run once to backfill thumbnails
 * 
 * POST /api/migrate-thumbnails
 * - Requires authentication as an author
 * - Processes images in batches to avoid timeouts
 * - Returns progress information
 * 
 * Query params:
 * - limit: Number of images to process per request (default: 10)
 * - offset: Skip this many images (for pagination)
 * - dryRun: If "true", just check what needs to be done without making changes
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    }
    
    // Check if user is an author (admin)
    const isAuthor = await getIsAuthor(supabase, user);
    if (!isAuthor) {
      return NextResponse.json({ error: "Ikke autoriseret" }, { status: 403 });
    }
    
    // Parse query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const dryRun = url.searchParams.get("dryRun") === "true";
    
    // Get total count of images
    const { count: totalImages } = await supabase
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("type", "image");
    
    // Fetch images that need processing
    const { data: images, error: fetchError } = await supabase
      .from("media")
      .select("id, storage_path, post_id")
      .eq("type", "image")
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);
    
    if (fetchError) {
      console.error("Failed to fetch images:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    
    if (!images || images.length === 0) {
      return NextResponse.json({
        message: "Ingen billeder at behandle",
        total: totalImages || 0,
        processed: 0,
        offset,
        hasMore: false,
      });
    }
    
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      details: [] as { id: string; status: string; path?: string; error?: string }[],
    };
    
    for (const image of images) {
      // Generate carousel thumbnail path
      const storagePath = image.storage_path;
      const lastDotIndex = storagePath.lastIndexOf(".");
      const carouselPath = lastDotIndex === -1
        ? `${storagePath}_carousel`
        : `${storagePath.slice(0, lastDotIndex)}_carousel${storagePath.slice(lastDotIndex)}`;
      
      // Check if carousel thumbnail already exists
      const { data: existingThumb } = await supabase.storage
        .from("media")
        .list(carouselPath.split("/").slice(0, -1).join("/"), {
          search: carouselPath.split("/").pop(),
        });
      
      if (existingThumb && existingThumb.length > 0) {
        results.skipped++;
        results.details.push({
          id: image.id,
          status: "skipped",
          path: carouselPath,
        });
        continue;
      }
      
      if (dryRun) {
        results.processed++;
        results.details.push({
          id: image.id,
          status: "needs_processing",
          path: carouselPath,
        });
        continue;
      }
      
      try {
        // Download the original image
        const { data: imageData, error: downloadError } = await supabase.storage
          .from("media")
          .download(storagePath);
        
        if (downloadError || !imageData) {
          throw new Error(`Download failed: ${downloadError?.message || "No data"}`);
        }
        
        // Convert Blob to Buffer for sharp processing
        const arrayBuffer = await imageData.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        // Use sharp to create an optimized thumbnail
        const thumbnailBuffer = await sharp(inputBuffer)
          .resize(CAROUSEL_MAX_WIDTH, CAROUSEL_MAX_HEIGHT, {
            fit: "inside", // Maintain aspect ratio, fit within bounds
            withoutEnlargement: true, // Don't upscale small images
          })
          .jpeg({
            quality: CAROUSEL_QUALITY,
            progressive: true,
          })
          .toBuffer();
        
        // Upload the thumbnail
        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(carouselPath, thumbnailBuffer, {
            cacheControl: "3600",
            upsert: true,
            contentType: "image/jpeg",
          });
        
        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
        
        // Log compression stats
        const originalSize = inputBuffer.length;
        const compressedSize = thumbnailBuffer.length;
        const savings = Math.round((1 - compressedSize / originalSize) * 100);
        console.log(`[Migration] ${storagePath}: ${originalSize} → ${compressedSize} bytes (${savings}% smaller)`);
        
        results.processed++;
        results.details.push({
          id: image.id,
          status: "processed",
          path: carouselPath,
        });
        
      } catch (err) {
        results.errors++;
        results.details.push({
          id: image.id,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    
    const hasMore = offset + limit < (totalImages || 0);
    
    return NextResponse.json({
      message: dryRun ? "Dry run afsluttet" : "Batch behandlet",
      total: totalImages || 0,
      offset,
      limit,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      results,
    });
    
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check migration status
 */
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    }
    
    // Check if user is an author (admin)
    const isAuthor = await getIsAuthor(supabase, user);
    if (!isAuthor) {
      return NextResponse.json({ error: "Ikke autoriseret" }, { status: 403 });
    }
    
    // Get total count of images
    const { count: totalImages } = await supabase
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("type", "image");
    
    // We can't easily count carousel thumbnails without listing all storage files
    // So we just return the total image count
    
    return NextResponse.json({
      totalImages: totalImages || 0,
      message: "Brug POST med dryRun=true for at se hvad der mangler",
    });
    
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}
