"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export interface VideoCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  videoBitrate?: string; // e.g., "1M" for 1 Mbps
  audioBitrate?: string; // e.g., "128k"
  fps?: number;
  crf?: number; // Constant Rate Factor (0-51, lower = better quality, 23 is default)
}

export interface VideoCompressionResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  originalSize: number;
  compressedSize: number;
}

export interface CompressionProgress {
  stage: "loading" | "analyzing" | "compressing" | "finalizing";
  progress: number; // 0-100
  message: string;
}

const DEFAULT_OPTIONS: Required<VideoCompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  videoBitrate: "2M",
  audioBitrate: "128k",
  fps: 30,
  crf: 28, // Good balance between quality and size
};

// Singleton FFmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let ffmpegLoading: Promise<void> | null = null;

/**
 * Get or create the FFmpeg instance
 * Loads the WASM files from CDN on first use
 */
async function getFFmpeg(
  onProgress?: (progress: CompressionProgress) => void
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  if (ffmpegLoading) {
    await ffmpegLoading;
    return ffmpegInstance!;
  }

  ffmpegInstance = new FFmpeg();

  ffmpegLoading = (async () => {
    onProgress?.({
      stage: "loading",
      progress: 0,
      message: "Indlæser video-processor...",
    });

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

    // Load FFmpeg with progress tracking
    ffmpegInstance!.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });

    await ffmpegInstance!.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegLoaded = true;

    onProgress?.({
      stage: "loading",
      progress: 100,
      message: "Video-processor klar",
    });
  })();

  await ffmpegLoading;
  return ffmpegInstance!;
}

/**
 * Get video metadata (dimensions, duration) using a video element
 */
async function getVideoMetadata(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Calculate target dimensions while maintaining aspect ratio
 */
function calculateTargetDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    // Ensure dimensions are even (required by most codecs)
    return {
      width: Math.floor(width / 2) * 2,
      height: Math.floor(height / 2) * 2,
    };
  }

  const ratio = Math.min(maxWidth / width, maxHeight / height);
  // Ensure dimensions are even (required by most codecs)
  return {
    width: Math.floor((width * ratio) / 2) * 2,
    height: Math.floor((height * ratio) / 2) * 2,
  };
}

/**
 * Compress a video file using FFmpeg.wasm
 * Returns the compressed blob along with metadata
 */
export async function compressVideo(
  file: File,
  options: VideoCompressionOptions = {},
  onProgress?: (progress: CompressionProgress) => void
): Promise<VideoCompressionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ffmpeg = await getFFmpeg(onProgress);

  // Get original video metadata
  onProgress?.({
    stage: "analyzing",
    progress: 0,
    message: "Analyserer video...",
  });

  const metadata = await getVideoMetadata(file);
  const targetDimensions = calculateTargetDimensions(
    metadata.width,
    metadata.height,
    opts.maxWidth,
    opts.maxHeight
  );

  onProgress?.({
    stage: "analyzing",
    progress: 100,
    message: `Original: ${metadata.width}x${metadata.height}, Mål: ${targetDimensions.width}x${targetDimensions.height}`,
  });

  // Write input file to FFmpeg virtual filesystem
  const inputName = "input" + getFileExtension(file.name);
  const outputName = "output.mp4";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Set up progress tracking
  let lastProgress = 0;
  ffmpeg.on("progress", ({ progress, time }) => {
    const percent = Math.min(Math.round(progress * 100), 99);
    if (percent > lastProgress) {
      lastProgress = percent;
      onProgress?.({
        stage: "compressing",
        progress: percent,
        message: `Komprimerer video... ${percent}%`,
      });
    }
  });

  onProgress?.({
    stage: "compressing",
    progress: 0,
    message: "Starter komprimering...",
  });

  // Build FFmpeg command
  // Using H.264 codec with good compression settings
  // Use scale filter that preserves aspect ratio and ensures even dimensions
  // The -2 means "calculate this dimension to maintain aspect ratio, rounded to even"
  const needsResize = metadata.width > opts.maxWidth || metadata.height > opts.maxHeight;
  
  // Build video filter: always ensure even dimensions, optionally scale down
  let videoFilter: string;
  if (needsResize) {
    // Scale to fit within max dimensions while preserving aspect ratio
    // force_original_aspect_ratio=decrease ensures we don't exceed limits
    // The pad filter isn't needed since we use decrease, and the final scale ensures even dims
    videoFilter = `scale='min(${opts.maxWidth},iw)':'min(${opts.maxHeight},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  } else {
    // Just ensure even dimensions without resizing
    videoFilter = `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  }
  
  const ffmpegArgs = [
    "-i", inputName,
    // Video settings
    "-c:v", "libx264",
    "-preset", "fast", // Balance between speed and compression
    "-crf", opts.crf.toString(),
    "-maxrate", opts.videoBitrate,
    "-bufsize", `${parseInt(opts.videoBitrate) * 2}M`,
    // Scale filter that preserves aspect ratio
    "-vf", videoFilter,
    // Frame rate
    "-r", opts.fps.toString(),
    // Audio settings
    "-c:a", "aac",
    "-b:a", opts.audioBitrate,
    // Output format
    "-movflags", "+faststart", // Enable streaming
    "-y", // Overwrite output
    outputName,
  ];

  await ffmpeg.exec(ffmpegArgs);

  onProgress?.({
    stage: "finalizing",
    progress: 50,
    message: "Færdiggør video...",
  });

  // Read the output file
  const data = await ffmpeg.readFile(outputName);
  // FFmpeg readFile returns Uint8Array for binary files
  // Create a new Uint8Array to ensure proper ArrayBuffer type
  const uint8Data = new Uint8Array(data as Uint8Array);
  const blob = new Blob([uint8Data], { type: "video/mp4" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  onProgress?.({
    stage: "finalizing",
    progress: 100,
    message: "Komprimering færdig!",
  });

  return {
    blob,
    width: targetDimensions.width,
    height: targetDimensions.height,
    duration: metadata.duration,
    originalSize: file.size,
    compressedSize: blob.size,
  };
}

/**
 * Check if a video should be compressed based on file size and dimensions
 */
export async function shouldCompressVideo(file: File): Promise<boolean> {
  // Compress if file is larger than 10MB
  if (file.size > 10 * 1024 * 1024) {
    return true;
  }

  // Check video dimensions
  try {
    const metadata = await getVideoMetadata(file);
    // Compress if resolution is higher than 1080p
    if (metadata.width > 1920 || metadata.height > 1080) {
      return true;
    }
  } catch {
    // If we can't get metadata, compress to be safe
    return true;
  }

  return false;
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? `.${ext}` : ".mp4";
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Estimate compression time based on video duration and size
 */
export function estimateCompressionTime(file: File, durationSeconds: number): string {
  // Rough estimate: ~1-2 seconds per second of video on modern devices
  // Larger files take longer
  const sizeFactor = file.size / (50 * 1024 * 1024); // Normalized to 50MB
  const estimatedSeconds = Math.ceil(durationSeconds * 1.5 * Math.max(1, sizeFactor));

  if (estimatedSeconds < 60) {
    return `~${estimatedSeconds} sekunder`;
  } else {
    const minutes = Math.ceil(estimatedSeconds / 60);
    return `~${minutes} minut${minutes > 1 ? "ter" : ""}`;
  }
}
