"use client";

import { createClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/url-utils";

// Re-export URL utilities for convenience (these work on both server and client)
export { getMediaUrl, getAvatarUrl, isStoragePath } from "@/lib/url-utils";

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

/**
 * Get the carousel thumbnail URL for an image.
 * Carousel thumbnails are stored with a _carousel suffix before the extension.
 * Example: "user/post/image.jpg" → "user/post/image_carousel.jpg"
 * 
 * @param storagePath - The original storage path of the image
 * @returns URL for the carousel thumbnail
 */
export function getCarouselThumbnailUrl(storagePath: string): string {
  // Insert _carousel before the file extension
  const lastDotIndex = storagePath.lastIndexOf(".");
  if (lastDotIndex === -1) {
    // No extension found, just append _carousel
    return getMediaUrl(`${storagePath}_carousel`);
  }
  
  const pathWithoutExt = storagePath.slice(0, lastDotIndex);
  const ext = storagePath.slice(lastDotIndex);
  return getMediaUrl(`${pathWithoutExt}_carousel${ext}`);
}

/**
 * Get the carousel thumbnail storage path from the original image path.
 * Used during upload to determine the path for the carousel thumbnail.
 * 
 * @param originalPath - The original storage path
 * @returns Storage path for the carousel thumbnail
 */
export function getCarouselThumbnailPath(originalPath: string): string {
  const lastDotIndex = originalPath.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return `${originalPath}_carousel`;
  }
  
  const pathWithoutExt = originalPath.slice(0, lastDotIndex);
  const ext = originalPath.slice(lastDotIndex);
  return `${pathWithoutExt}_carousel${ext}`;
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

/**
 * Upload a profile avatar image
 * Stores in: {userId}/profile/avatar.{ext}
 * Note: Path must start with userId to satisfy Supabase Storage RLS policies
 */
export async function uploadAvatar(
  file: File | Blob,
  userId: string,
  originalFilename?: string
): Promise<UploadResult> {
  const supabase = createClient();
  
  // Get file extension from original filename or default to jpg
  const ext = originalFilename?.split(".").pop()?.toLowerCase() || "jpg";
  // Path must start with userId to satisfy storage RLS policies
  const path = `${userId}/profile/avatar.${ext}`;
  
  // Delete existing avatar if any (to allow replacement)
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
 * Delete a profile avatar
 */
export async function deleteAvatar(path: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase.storage
    .from("media")
    .remove([path]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

