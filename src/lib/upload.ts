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

