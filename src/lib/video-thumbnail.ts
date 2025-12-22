"use client";

export interface ThumbnailResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Extract the first frame of a video as a JPEG thumbnail
 * Uses canvas to capture the frame once video metadata is loaded
 */
export async function generateVideoThumbnail(
  videoFile: File | Blob,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<ThumbnailResult> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(videoFile);

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video thumbnail generation timed out"));
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("error", handleError);
      video.removeEventListener("seeked", handleSeeked);
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Failed to load video for thumbnail generation"));
    };

    const handleSeeked = () => {
      try {
        // Calculate dimensions while maintaining aspect ratio
        let width = video.videoWidth;
        let height = video.videoHeight;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw the frame
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Could not get canvas context"));
          return;
        }

        // Draw the video frame
        ctx.drawImage(video, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) {
              resolve({ blob, width, height });
            } else {
              reject(new Error("Failed to create thumbnail blob"));
            }
          },
          "image/jpeg",
          quality
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const handleLoaded = () => {
      // Seek to 0.1 seconds to get a proper frame (not just black)
      // Some videos have black frames at exactly 0
      video.currentTime = 0.1;
    };

    video.addEventListener("loadeddata", handleLoaded);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);

    // Required for thumbnail generation
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    // Start loading
    video.src = url;
    video.load();
  });
}
