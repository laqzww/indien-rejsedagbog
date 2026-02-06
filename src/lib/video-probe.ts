"use client";

/**
 * Video probe utility - extracts metadata from video files using the browser's
 * built-in HTMLVideoElement capabilities.
 *
 * Provides duration, resolution, estimated bitrate, and rotation info
 * without needing ffmpeg or any external libraries.
 */

export interface VideoMetadata {
  /** Duration in seconds */
  duration: number;
  /** Original width in pixels */
  width: number;
  /** Original height in pixels */
  height: number;
  /** File size in bytes */
  fileSize: number;
  /** Estimated bitrate in bits per second */
  estimatedBitrate: number;
  /** Whether the video is vertical (height > width) */
  isVertical: boolean;
  /** MIME type */
  mimeType: string;
  /** Whether this video should be compressed (heuristic based on size/resolution) */
  shouldCompress: boolean;
  /** Recommended max resolution for compression */
  recommendedMaxResolution: number;
}

/**
 * Size thresholds for deciding whether to compress
 * Videos above these sizes for their resolution tier will be compressed
 */
const COMPRESSION_THRESHOLDS = {
  /** Videos larger than 10MB should generally be compressed for web */
  MIN_SIZE_FOR_COMPRESSION: 10 * 1024 * 1024, // 10MB
  /** Max file size we'll attempt to compress in the browser (2GB WASM limit) */
  MAX_SIZE_FOR_BROWSER_COMPRESSION: 1.8 * 1024 * 1024 * 1024, // 1.8GB (safety margin)
  /** Bitrate threshold: videos with bitrate above this are good compression candidates */
  HIGH_BITRATE_THRESHOLD: 8_000_000, // 8 Mbps
};

/**
 * Resolution tier recommendations based on content type
 * Travel diary videos are primarily phone-shot, so 1080p is the target max
 */
const RESOLUTION_TIERS = {
  /** 4K+ → compress to 1080p */
  UHD: { minDimension: 2160, targetMax: 1080 },
  /** 1440p → compress to 1080p */
  QHD: { minDimension: 1440, targetMax: 1080 },
  /** 1080p → keep at 1080p but re-encode for efficiency */
  FHD: { minDimension: 1080, targetMax: 1080 },
  /** 720p → keep as-is */
  HD: { minDimension: 720, targetMax: 720 },
};

/**
 * Probe a video file to extract its metadata using the browser's video element.
 * This is fast and doesn't require ffmpeg.
 */
export async function probeVideo(file: File | Blob): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video probe timed out after 15 seconds"));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("error", handleError);
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Failed to load video for probing"));
    };

    const handleMetadata = () => {
      try {
        const duration = video.duration;
        const width = video.videoWidth;
        const height = video.videoHeight;
        const fileSize = file.size;
        const mimeType = file instanceof File ? file.type : "video/mp4";

        // Estimate bitrate from file size and duration
        const estimatedBitrate =
          duration > 0 ? Math.round((fileSize * 8) / duration) : 0;

        const isVertical = height > width;
        const longestSide = Math.max(width, height);

        // Determine recommended max resolution
        let recommendedMaxResolution = longestSide; // default: keep as-is
        if (longestSide >= RESOLUTION_TIERS.UHD.minDimension) {
          recommendedMaxResolution = RESOLUTION_TIERS.UHD.targetMax;
        } else if (longestSide >= RESOLUTION_TIERS.QHD.minDimension) {
          recommendedMaxResolution = RESOLUTION_TIERS.QHD.targetMax;
        } else if (longestSide >= RESOLUTION_TIERS.FHD.minDimension) {
          recommendedMaxResolution = RESOLUTION_TIERS.FHD.targetMax;
        }

        // Determine if compression is worthwhile
        const shouldCompress =
          fileSize > COMPRESSION_THRESHOLDS.MIN_SIZE_FOR_COMPRESSION &&
          fileSize < COMPRESSION_THRESHOLDS.MAX_SIZE_FOR_BROWSER_COMPRESSION &&
          (estimatedBitrate > COMPRESSION_THRESHOLDS.HIGH_BITRATE_THRESHOLD ||
            longestSide > 1080);

        cleanup();
        resolve({
          duration,
          width,
          height,
          fileSize,
          estimatedBitrate,
          isVertical,
          mimeType,
          shouldCompress,
          recommendedMaxResolution,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.addEventListener("loadedmetadata", handleMetadata);
    video.addEventListener("error", handleError);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.load();
  });
}

/**
 * Format a bitrate number into a human-readable string
 */
export function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
  }
  if (bitsPerSecond >= 1_000) {
    return `${(bitsPerSecond / 1_000).toFixed(0)} Kbps`;
  }
  return `${bitsPerSecond} bps`;
}

/**
 * Format a duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Check if the browser can handle in-browser video compression
 * (requires either WebCodecs or SharedArrayBuffer for ffmpeg.wasm multi-threaded)
 */
export function checkCompressionSupport(): {
  webCodecs: boolean;
  sharedArrayBuffer: boolean;
  recommended: "webcodecs" | "ffmpeg-wasm-mt" | "ffmpeg-wasm-st";
} {
  const webCodecs =
    typeof globalThis !== "undefined" &&
    "VideoEncoder" in globalThis &&
    "VideoDecoder" in globalThis;

  const sharedArrayBuffer =
    typeof globalThis !== "undefined" &&
    "SharedArrayBuffer" in globalThis;

  let recommended: "webcodecs" | "ffmpeg-wasm-mt" | "ffmpeg-wasm-st";
  if (webCodecs) {
    recommended = "webcodecs";
  } else if (sharedArrayBuffer) {
    recommended = "ffmpeg-wasm-mt";
  } else {
    recommended = "ffmpeg-wasm-st";
  }

  return { webCodecs, sharedArrayBuffer, recommended };
}
