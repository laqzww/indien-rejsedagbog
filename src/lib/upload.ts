"use client";

import { createClient } from "@/lib/supabase/client";

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export async function uploadMedia(
  file: File | Blob,
  userId: string,
  postId: string,
  filename: string
): Promise<UploadResult> {
  const supabase = createClient();
  
  // Create path: userId/postId/filename
  const path = `${userId}/${postId}/${filename}`;
  
  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from("media")
    .getPublicUrl(path);

  return { path, publicUrl };
}

export async function deleteMedia(path: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase.storage
    .from("media")
    .remove([path]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export function getMediaUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/media/${path}`;
}

export function generateFilename(originalName: string, index: number): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const timestamp = Date.now();
  return `${timestamp}-${index}.${ext}`;
}

export function getFileType(file: File): "image" | "video" {
  if (file.type.startsWith("video/")) {
    return "video";
  }
  return "image";
}

/**
 * Upload a cover image for a milestone
 * Stores in: {userId}/milestones/{milestoneId}/cover.{ext}
 * Note: Path must start with userId to satisfy Supabase Storage RLS policies
 */
export async function uploadMilestoneCover(
  file: File,
  milestoneId: string,
  userId: string
): Promise<UploadResult> {
  const supabase = createClient();
  
  // Get file extension
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  // Path must start with userId to satisfy storage RLS policies (same as post uploads)
  const path = `${userId}/milestones/${milestoneId}/cover.${ext}`;
  
  // Delete existing cover if any (to allow replacement)
  await supabase.storage.from("media").remove([path]);
  
  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from("media")
    .getPublicUrl(path);

  return { path, publicUrl };
}

/**
 * Delete a milestone cover image
 */
export async function deleteMilestoneCover(path: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase.storage
    .from("media")
    .remove([path]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

