"use client";

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface CompressionResult {
  blob: Blob;
  width: number;
  height: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 2000,
  maxHeight: 2000,
  quality: 0.85,
};

// Carousel thumbnail options - optimized for small card display (320x120px cards)
// We use 640px max to allow for 2x retina displays while keeping file size small
const CAROUSEL_THUMBNAIL_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 640,
  maxHeight: 640,
  quality: 0.70, // Lower quality is fine for small thumbnails
};

/**
 * Compress an image using browser canvas
 * This should be called AFTER extracting EXIF data from the original file
 * Returns the compressed blob along with the new dimensions
 */
export async function compressImage(
  file: Blob,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;

      if (width > opts.maxWidth || height > opts.maxHeight) {
        const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, width, height });
          } else {
            reject(new Error("Failed to compress image"));
          }
        },
        "image/jpeg",
        opts.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = url;
  });
}

/**
 * Generate a small thumbnail optimized for carousel display
 * Uses lower resolution and quality since carousel cards are small (320x120px)
 * Returns a small JPEG thumbnail suitable for fast loading
 */
export async function generateCarouselThumbnail(
  file: Blob
): Promise<CompressionResult> {
  return compressImage(file, CAROUSEL_THUMBNAIL_OPTIONS);
}

/**
 * Check if an image needs compression based on file size and dimensions
 */
export function shouldCompress(file: File): boolean {
  // Compress if file is larger than 500KB
  if (file.size > 500 * 1024) {
    return true;
  }
  return false;
}

/**
 * Get the file size in a human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
