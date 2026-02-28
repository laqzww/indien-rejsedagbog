/**
 * Migrate ALL media from Supabase Storage to Cloudflare R2.
 *
 * Lists ALL objects in the Supabase "media" bucket (not just DB-tracked ones),
 * downloads each, and uploads to R2 with identical path structure.
 *
 * Usage:
 *   npx tsx scripts/migrate-media.ts
 *
 * Required environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *
 * Optional:
 *   DRY_RUN=1   — list files without uploading
 */

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const r2AccountId = process.env.R2_ACCOUNT_ID!;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID!;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const r2BucketName = process.env.R2_BUCKET_NAME!;
const dryRun = process.env.DRY_RUN === "1";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}
if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
  console.error("Missing R2 credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
});

function getMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    heic: "image/heic",
  };
  return mimeMap[ext || ""] || "application/octet-stream";
}

/**
 * List ALL objects in a Supabase Storage bucket by walking through folders recursively.
 */
async function listAllObjects(bucket: string, prefix: string = ""): Promise<string[]> {
  const allPaths: string[] = [];

  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    console.error(`Error listing ${prefix}:`, error.message);
    return allPaths;
  }

  for (const item of data || []) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.id === null) {
      // It's a folder — recurse
      const subItems = await listAllObjects(bucket, fullPath);
      allPaths.push(...subItems);
    } else {
      // It's a file
      allPaths.push(fullPath);
    }
  }

  return allPaths;
}

async function existsInR2(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: r2BucketName, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateMedia() {
  console.log("Listing all objects in Supabase media bucket...\n");
  const allPaths = await listAllObjects("media");
  console.log(`Found ${allPaths.length} files in bucket.\n`);

  if (dryRun) {
    console.log("DRY RUN — listing files only:\n");
    for (const path of allPaths) {
      console.log(`  ${path}`);
    }
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < allPaths.length; i++) {
    const path = allPaths[i];
    const progress = `[${i + 1}/${allPaths.length}]`;

    // Check if already in R2
    const exists = await existsInR2(path);
    if (exists) {
      console.log(`${progress} SKIP (exists): ${path}`);
      skipped++;
      continue;
    }

    // Download from Supabase
    const { data: blob, error } = await supabase.storage
      .from("media")
      .download(path);

    if (error || !blob) {
      console.error(`${progress} FAIL (download): ${path} — ${error?.message}`);
      failed++;
      continue;
    }

    // Upload to R2
    const buffer = Buffer.from(await blob.arrayBuffer());
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: r2BucketName,
          Key: path,
          Body: buffer,
          ContentType: getMimeType(path),
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      console.log(`${progress} OK: ${path} (${(buffer.length / 1024).toFixed(1)} KB)`);
      uploaded++;
    } catch (err) {
      console.error(`${progress} FAIL (upload): ${path} — ${err}`);
      failed++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total files:  ${allPaths.length}`);
  console.log(`Uploaded:     ${uploaded}`);
  console.log(`Skipped:      ${skipped}`);
  console.log(`Failed:       ${failed}`);
}

migrateMedia().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
