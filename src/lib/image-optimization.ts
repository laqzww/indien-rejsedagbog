"use client";

import imageCompression from "browser-image-compression";

export interface OptimizationResult {
  blob: Blob;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
}

export interface OptimizationOptions {
  /** Maximum width/height in pixels (default: 2048) */
  maxDimension?: number;
  /** Maximum file size in MB (default: 1) */
  maxSizeMB?: number;
  /** JPEG/WebP quality 0-1 (default: 0.8) */
  quality?: number;
  /** Use WebP format if browser supports it (default: true) */
  useWebP?: boolean;
}

const DEFAULT_OPTIONS: Required<OptimizationOptions> = {
  maxDimension: 2048,
  maxSizeMB: 1,
  quality: 0.8,
  useWebP: true,
};

/**
 * Check if browser supports WebP encoding
 */
export function supportsWebP(): boolean {
  if (typeof document === "undefined") return false;
  
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

/**
 * Optimize an image for web upload
 * 
 * This function:
 * 1. Resizes the image to max dimensions
 * 2. Compresses to target file size
 * 3. Converts to WebP if supported (better compression)
 * 
 * IMPORTANT: Call extractExifData() BEFORE this function to preserve metadata!
 * Image compression strips EXIF data.
 */
export async function optimizeImage(
  file: File,
  options: OptimizationOptions = {}
): Promise<OptimizationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSize = file.size;

  // Determine output format
  const useWebP = opts.useWebP && supportsWebP();
  const fileType = useWebP ? "image/webp" : "image/jpeg";

  // Skip optimization for small files (under 500KB)
  if (originalSize < 500 * 1024) {
    // Still convert to webp/jpeg for consistency
    const optimized = await imageCompression(file, {
      maxWidthOrHeight: opts.maxDimension,
      useWebWorker: true,
      fileType,
      initialQuality: opts.quality,
    });

    return {
      blob: optimized,
      originalSize,
      optimizedSize: optimized.size,
      compressionRatio: originalSize / optimized.size,
    };
  }

  // Compress larger files
  const optimized = await imageCompression(file, {
    maxSizeMB: opts.maxSizeMB,
    maxWidthOrHeight: opts.maxDimension,
    useWebWorker: true,
    fileType,
    initialQuality: opts.quality,
    // Preserve some orientation info (rotation)
    preserveExif: false, // We extract EXIF separately before compression
  });

  return {
    blob: optimized,
    originalSize,
    optimizedSize: optimized.size,
    compressionRatio: originalSize / optimized.size,
  };
}

/**
 * Get a human-readable file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a file needs optimization (is larger than threshold)
 */
export function needsOptimization(file: File, thresholdMB: number = 0.5): boolean {
  return file.size > thresholdMB * 1024 * 1024;
}

/**
 * Get the appropriate file extension for an optimized image
 */
export function getOptimizedExtension(): string {
  return supportsWebP() ? "webp" : "jpg";
}
