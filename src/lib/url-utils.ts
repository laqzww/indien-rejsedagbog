/**
 * Shared URL utility functions for both server and client components.
 * These functions only do string manipulation and don't require client-side APIs.
 */

/**
 * Get the public URL for a media file in Supabase Storage
 */
export function getMediaUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/media/${path}`;
}

/**
 * Check if an avatar URL is a storage path (vs external URL)
 */
export function isStoragePath(avatarUrl: string): boolean {
  return !avatarUrl.startsWith("http://") && !avatarUrl.startsWith("https://");
}

/**
 * Get the full URL for an avatar (handles both storage paths and external URLs)
 */
export function getAvatarUrl(avatarUrl: string): string {
  if (isStoragePath(avatarUrl)) {
    return getMediaUrl(avatarUrl);
  }
  return avatarUrl;
}
