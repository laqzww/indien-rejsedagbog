/**
 * Shared URL utility functions for both server and client components.
 * These functions only do string manipulation and don't require client-side APIs.
 */

/**
 * Get the public URL for a media file
 */
export function getMediaUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_MEDIA_URL}/${path}`;
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

/**
 * Get the carousel thumbnail URL for an image.
 * Carousel thumbnails are stored with a _carousel suffix before the extension.
 * Example: "user/post/image.jpg" → "user/post/image_carousel.jpg"
 */
export function getCarouselThumbnailUrl(storagePath: string): string {
  const lastDotIndex = storagePath.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return getMediaUrl(`${storagePath}_carousel`);
  }

  const pathWithoutExt = storagePath.slice(0, lastDotIndex);
  const ext = storagePath.slice(lastDotIndex);
  return getMediaUrl(`${pathWithoutExt}_carousel${ext}`);
}
