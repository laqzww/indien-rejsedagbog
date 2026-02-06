"use client";

/**
 * Video Compression Engine
 *
 * SOTA client-side video compression using ffmpeg.wasm.
 * Compresses videos before upload to reduce storage and improve playback.
 *
 * Strategy:
 * - H.264 (libx264) for maximum compatibility across all browsers/devices
 * - CRF-based quality control for optimal quality-to-size ratio
 * - Smart resolution scaling (4K/1440p → 1080p, maintains aspect ratio)
 * - faststart flag for progressive web playback
 * - AAC audio at 128kbps
 * - Handles iPhone video rotation correctly
 *
 * Architecture:
 * - Uses ffmpeg.wasm (WebAssembly port of FFmpeg) for full transcoding
 * - Single-threaded mode by default (no COOP/COEP headers required)
 * - Multi-threaded mode available when SharedArrayBuffer is accessible
 * - Progress tracking via callbacks
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { VideoMetadata } from "@/lib/video-probe";

// CDN base URL for ffmpeg.wasm core files (avoids bundling 32MB WASM binary)
const FFMPEG_CORE_VERSION = "0.12.10";
const FFMPEG_CDN_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;
const FFMPEG_MT_CDN_BASE = `https://unpkg.com/@ffmpeg/core-mt@${FFMPEG_CORE_VERSION}/dist/esm`;

// ─── Types ──────────────────────────────────────────────────────────────

export interface CompressionPreset {
  /** Human-readable name */
  name: string;
  /** CRF value (lower = higher quality, larger file; 18-32 typical range) */
  crf: number;
  /** FFmpeg preset (ultrafast..veryslow). Controls speed/compression tradeoff */
  preset: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium";
  /** Max resolution (longest side). null = keep original */
  maxResolution: number | null;
  /** Audio bitrate in kbps */
  audioBitrate: number;
  /** Max framerate. null = keep original */
  maxFramerate: number | null;
}

export interface CompressionOptions {
  /** Which preset to use */
  preset?: CompressionPreset;
  /** Progress callback (0-100) */
  onProgress?: (progress: CompressionProgress) => void;
  /** Log callback for FFmpeg output */
  onLog?: (message: string) => void;
}

export interface CompressionProgress {
  /** 0-100 percentage */
  percentage: number;
  /** Current phase */
  phase: "loading" | "compressing" | "finalizing";
  /** Human-readable status message */
  message: string;
  /** Current processing time in seconds (from FFmpeg) */
  currentTime?: number;
  /** Total duration in seconds */
  totalDuration?: number;
  /** Processing speed (e.g., "1.5x") */
  speed?: string;
}

export interface CompressionResult {
  /** Compressed video as a Blob */
  blob: Blob;
  /** Compressed file size in bytes */
  compressedSize: number;
  /** Original file size in bytes */
  originalSize: number;
  /** Compression ratio (e.g., 0.25 means 75% size reduction) */
  compressionRatio: number;
  /** Codec used */
  codec: string;
  /** Settings used for compression */
  settings: CompressionPreset;
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Duration in seconds */
  duration: number;
}

// ─── Presets ────────────────────────────────────────────────────────────

/**
 * Compression presets optimized for different use cases.
 * CRF scale: 0 = lossless, 23 = high quality, 28 = good quality, 32+ = low quality
 * For WASM we use faster presets since encoding is CPU-only.
 */
export const COMPRESSION_PRESETS = {
  /**
   * High quality - minimal visual loss, moderate compression
   * Best for: important memories, high-motion content
   * Expected: ~40-60% size reduction
   */
  high: {
    name: "Høj kvalitet",
    crf: 23,
    preset: "fast" as const,
    maxResolution: 1080,
    audioBitrate: 128,
    maxFramerate: 30,
  },

  /**
   * Balanced - good quality with significant compression
   * Best for: general travel diary videos
   * Expected: ~60-80% size reduction
   */
  balanced: {
    name: "Balanceret",
    crf: 26,
    preset: "fast" as const,
    maxResolution: 1080,
    audioBitrate: 128,
    maxFramerate: 30,
  },

  /**
   * Compact - smaller files, acceptable quality
   * Best for: quick clips, secondary content
   * Expected: ~75-90% size reduction
   */
  compact: {
    name: "Kompakt",
    crf: 30,
    preset: "veryfast" as const,
    maxResolution: 720,
    audioBitrate: 96,
    maxFramerate: 30,
  },
} as const satisfies Record<string, CompressionPreset>;

export type PresetName = keyof typeof COMPRESSION_PRESETS;

// ─── FFmpeg Instance Management ─────────────────────────────────────────

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let ffmpegLoading: Promise<void> | null = null;

/**
 * Get or create the FFmpeg instance.
 * Loads the WASM binary on first call. Subsequent calls return the cached instance.
 * Uses single-threaded mode by default for maximum compatibility.
 */
async function getFFmpeg(
  onProgress?: (progress: CompressionProgress) => void
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  // Prevent multiple concurrent loads
  if (ffmpegLoading) {
    await ffmpegLoading;
    return ffmpegInstance!;
  }

  ffmpegInstance = new FFmpeg();

  ffmpegLoading = (async () => {
    onProgress?.({
      percentage: 0,
      phase: "loading",
      message: "Indlæser komprimeringssoftware...",
    });

    const useMultiThread =
      typeof globalThis !== "undefined" &&
      "SharedArrayBuffer" in globalThis;

    if (useMultiThread) {
      console.log("[VideoCompression] Loading ffmpeg.wasm (multi-threaded) from CDN");
      // Multi-threaded: requires COOP/COEP headers (set on /admin/compress route)
      // Load from CDN using toBlobURL to avoid CORS and bundling issues
      const [coreURL, wasmURL, workerURL] = await Promise.all([
        toBlobURL(`${FFMPEG_MT_CDN_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${FFMPEG_MT_CDN_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        toBlobURL(`${FFMPEG_MT_CDN_BASE}/ffmpeg-core.worker.js`, "text/javascript"),
      ]);
      await ffmpegInstance!.load({ coreURL, wasmURL, workerURL });
    } else {
      console.log("[VideoCompression] Loading ffmpeg.wasm (single-threaded) from CDN");
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      await ffmpegInstance!.load({ coreURL, wasmURL });
    }

    ffmpegLoaded = true;
    console.log("[VideoCompression] ffmpeg.wasm loaded successfully");
  })();

  try {
    await ffmpegLoading;
  } catch (err) {
    ffmpegInstance = null;
    ffmpegLoading = null;
    throw err;
  }

  return ffmpegInstance!;
}

// ─── Core Compression ───────────────────────────────────────────────────

/**
 * Build the FFmpeg command arguments for video compression.
 *
 * Produces an H.264/AAC MP4 with:
 * - CRF-based quality (constant quality, variable bitrate)
 * - Resolution scaling with aspect ratio preservation
 * - Even dimensions (required by H.264)
 * - faststart for progressive web playback
 * - Proper rotation handling
 */
function buildFFmpegArgs(
  inputFile: string,
  outputFile: string,
  preset: CompressionPreset,
  metadata?: VideoMetadata
): string[] {
  const args: string[] = ["-i", inputFile];

  // ─── Video Codec ─────────────────────────────────────────
  args.push("-c:v", "libx264");
  args.push("-crf", String(preset.crf));
  args.push("-preset", preset.preset);

  // H.264 High profile for best compression at this quality level
  args.push("-profile:v", "high");
  args.push("-level", "4.1");

  // YUV 4:2:0 pixel format for maximum compatibility
  args.push("-pix_fmt", "yuv420p");

  // ─── Resolution Scaling ──────────────────────────────────
  // Scale down to max resolution while preserving aspect ratio.
  // Uses the "fit within box" approach: scale the longest side,
  // then ensure even dimensions (H.264 requirement).
  if (preset.maxResolution) {
    const maxRes = preset.maxResolution;

    // Smart scaling filter:
    // - If video is larger than maxRes, scale down
    // - Preserve aspect ratio
    // - Ensure even dimensions with ceil(x/2)*2
    // - Handle both landscape and portrait orientations
    const scaleFilter = [
      `scale=if(gte(iw\\,ih)\\,min(${maxRes * (16 / 9)}\\,iw)\\,-2):if(gte(iw\\,ih)\\,-2\\,min(${maxRes * (16 / 9)}\\,ih))`,
      `scale=ceil(iw/2)*2:ceil(ih/2)*2`,
    ].join(",");

    // Simpler approach: scale based on the longest side
    const simpleScale =
      `scale='if(gt(max(iw\\,ih)\\,${maxRes})\\,if(gte(iw\\,ih)\\,${maxRes}\\,-2)\\,iw)':'if(gt(max(iw\\,ih)\\,${maxRes})\\,if(gte(iw\\,ih)\\,-2\\,${maxRes})\\,ih)'`;

    // Ensure even dimensions
    const evenDimensions = "pad=ceil(iw/2)*2:ceil(ih/2)*2";

    args.push("-vf", `${simpleScale},${evenDimensions}`);
  }

  // ─── Framerate Cap ───────────────────────────────────────
  if (preset.maxFramerate) {
    args.push("-r", String(preset.maxFramerate));
  }

  // ─── Audio ───────────────────────────────────────────────
  args.push("-c:a", "aac");
  args.push("-b:a", `${preset.audioBitrate}k`);
  // Stereo audio (most phone recordings are stereo or mono)
  args.push("-ac", "2");

  // ─── MP4 Container Options ───────────────────────────────
  // faststart: move moov atom to beginning for progressive web playback
  args.push("-movflags", "+faststart");

  // Prevent muxing queue overflow for complex videos
  args.push("-max_muxing_queue_size", "1024");

  // ─── Output ──────────────────────────────────────────────
  // Overwrite output if exists
  args.push("-y");
  args.push(outputFile);

  return args;
}

/**
 * Parse FFmpeg progress output to extract time and speed.
 * FFmpeg outputs progress to stderr in lines like:
 *   frame=  120 fps=25.4 q=28.0 size=    1280kB time=00:00:04.80 bitrate=2183.9kbits/s speed=1.02x
 */
function parseFFmpegProgress(
  message: string,
  totalDuration: number
): Partial<CompressionProgress> | null {
  // Match time= pattern
  const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (!timeMatch) return null;

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = parseInt(timeMatch[3], 10);
  const centiseconds = parseInt(timeMatch[4], 10);
  const currentTime = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;

  // Match speed= pattern
  const speedMatch = message.match(/speed=\s*([\d.]+)x/);
  const speed = speedMatch ? `${speedMatch[1]}x` : undefined;

  const percentage =
    totalDuration > 0
      ? Math.min(Math.round((currentTime / totalDuration) * 100), 99)
      : 0;

  return {
    percentage,
    currentTime,
    totalDuration,
    speed,
  };
}

/**
 * Compress a video file using ffmpeg.wasm.
 *
 * This is the main entry point for video compression. It:
 * 1. Loads the FFmpeg WASM binary (cached after first load)
 * 2. Writes the input file to the virtual filesystem
 * 3. Runs the compression with H.264/AAC encoding
 * 4. Reads the output and returns it as a Blob
 *
 * @param file - The video file to compress
 * @param options - Compression options (preset, callbacks)
 * @param metadata - Optional pre-probed video metadata (avoids re-probing)
 * @returns Compression result with the compressed blob and metadata
 */
export async function compressVideo(
  file: File | Blob,
  options: CompressionOptions = {},
  metadata?: VideoMetadata
): Promise<CompressionResult> {
  const {
    preset = COMPRESSION_PRESETS.balanced,
    onProgress,
    onLog,
  } = options;

  const originalSize = file.size;
  const inputFilename = "input.mp4";
  const outputFilename = "output.mp4";

  console.log(
    `[VideoCompression] Starting compression: ${(originalSize / 1024 / 1024).toFixed(1)} MB, preset: ${preset.name}`
  );

  // ─── Step 1: Load FFmpeg ────────────────────────────────
  const ffmpeg = await getFFmpeg(onProgress);

  // Set up log handler for progress tracking
  const duration = metadata?.duration ?? 0;

  ffmpeg.on("log", ({ message }) => {
    onLog?.(message);

    // Parse progress from FFmpeg output
    if (duration > 0) {
      const progress = parseFFmpegProgress(message, duration);
      if (progress) {
        onProgress?.({
          percentage: progress.percentage ?? 0,
          phase: "compressing",
          message: `Komprimerer video... ${progress.percentage}%${progress.speed ? ` (${progress.speed})` : ""}`,
          currentTime: progress.currentTime,
          totalDuration: progress.totalDuration,
          speed: progress.speed,
        });
      }
    }
  });

  ffmpeg.on("progress", ({ progress: pct }) => {
    // ffmpeg.wasm also emits its own progress events
    const percentage = Math.min(Math.round(pct * 100), 99);
    onProgress?.({
      percentage,
      phase: "compressing",
      message: `Komprimerer video... ${percentage}%`,
    });
  });

  // ─── Step 2: Write input to virtual filesystem ──────────
  onProgress?.({
    percentage: 0,
    phase: "compressing",
    message: "Forbereder video til komprimering...",
  });

  const inputData = await fetchFile(file);
  await ffmpeg.writeFile(inputFilename, inputData);

  // ─── Step 3: Run compression ────────────────────────────
  const args = buildFFmpegArgs(inputFilename, outputFilename, preset, metadata);
  console.log(`[VideoCompression] FFmpeg args: ${args.join(" ")}`);

  const startTime = performance.now();
  await ffmpeg.exec(args);
  const encodingTime = (performance.now() - startTime) / 1000;

  console.log(
    `[VideoCompression] Encoding completed in ${encodingTime.toFixed(1)}s`
  );

  // ─── Step 4: Read output ────────────────────────────────
  onProgress?.({
    percentage: 99,
    phase: "finalizing",
    message: "Færdiggør komprimering...",
  });

  const outputData = await ffmpeg.readFile(outputFilename);

  // Convert to Blob. ffmpeg.wasm readFile returns FileData (Uint8Array | string).
  // Extract the raw buffer for Blob construction to satisfy TypeScript's BlobPart constraint.
  let outputBlob: Blob;
  if (outputData instanceof Uint8Array) {
    const buffer = new ArrayBuffer(outputData.byteLength);
    new Uint8Array(buffer).set(outputData);
    outputBlob = new Blob([buffer], { type: "video/mp4" });
  } else {
    outputBlob = new Blob([outputData as BlobPart], { type: "video/mp4" });
  }
  const compressedSize = outputBlob.size;

  // ─── Step 5: Cleanup virtual filesystem ─────────────────
  try {
    await ffmpeg.deleteFile(inputFilename);
    await ffmpeg.deleteFile(outputFilename);
  } catch {
    // Ignore cleanup errors
  }

  // ─── Step 6: Determine output dimensions ────────────────
  // We need to probe the output to get actual dimensions
  let outputWidth = metadata?.width ?? 0;
  let outputHeight = metadata?.height ?? 0;

  if (preset.maxResolution && metadata) {
    const longestSide = Math.max(metadata.width, metadata.height);
    if (longestSide > preset.maxResolution) {
      const scale = preset.maxResolution / longestSide;
      outputWidth = Math.round(metadata.width * scale);
      outputHeight = Math.round(metadata.height * scale);
      // Ensure even dimensions
      outputWidth = Math.ceil(outputWidth / 2) * 2;
      outputHeight = Math.ceil(outputHeight / 2) * 2;
    }
  }

  const compressionRatio = compressedSize / originalSize;

  const result: CompressionResult = {
    blob: outputBlob,
    compressedSize,
    originalSize,
    compressionRatio,
    codec: "h264",
    settings: preset,
    width: outputWidth,
    height: outputHeight,
    duration: metadata?.duration ?? 0,
  };

  console.log(
    `[VideoCompression] Result: ${(originalSize / 1024 / 1024).toFixed(1)} MB → ${(compressedSize / 1024 / 1024).toFixed(1)} MB (${Math.round((1 - compressionRatio) * 100)}% reduction)`
  );

  onProgress?.({
    percentage: 100,
    phase: "finalizing",
    message: `Komprimeret: ${(originalSize / 1024 / 1024).toFixed(1)} MB → ${(compressedSize / 1024 / 1024).toFixed(1)} MB`,
  });

  return result;
}

/**
 * Compress a video from a URL (for batch processing existing videos in storage).
 * Downloads the video, compresses it, and returns the compressed blob.
 */
export async function compressVideoFromUrl(
  url: string,
  options: CompressionOptions = {},
  metadata?: VideoMetadata
): Promise<CompressionResult> {
  const {
    onProgress,
    ...restOptions
  } = options;

  onProgress?.({
    percentage: 0,
    phase: "loading",
    message: "Downloader video fra storage...",
  });

  // Download the video
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  onProgress?.({
    percentage: 0,
    phase: "loading",
    message: "Video downloadet, starter komprimering...",
  });

  return compressVideo(blob, { ...restOptions, onProgress }, metadata);
}

/**
 * Check if a video file would benefit from compression.
 * Quick heuristic check without full probing.
 */
export function shouldCompressVideo(file: File | Blob): boolean {
  // Don't compress files under 10MB - not worth the processing time
  if (file.size < 10 * 1024 * 1024) {
    return false;
  }

  // Don't compress files over 1.8GB - WASM memory limit
  if (file.size > 1.8 * 1024 * 1024 * 1024) {
    return false;
  }

  return true;
}

/**
 * Release the FFmpeg instance to free memory.
 * Call this after batch processing is complete.
 */
export async function releaseFFmpeg(): Promise<void> {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // Ignore termination errors
    }
    ffmpegInstance = null;
    ffmpegLoaded = false;
    ffmpegLoading = null;
    console.log("[VideoCompression] FFmpeg instance released");
  }
}
