"use client";

import { createClient } from "@/lib/supabase/client";
import { uploadResumable, shouldUseResumableUpload } from "@/lib/resumable-upload";

export interface UploadItem {
  id: string;
  file: Blob;
  path: string;
  isVideo?: boolean; // Hint for using resumable upload
}

export interface UploadProgress {
  id: string;
  status: "pending" | "uploading" | "completed" | "error";
  progress: number; // 0-100
  error?: string;
  bytesUploaded?: number;
  bytesTotal?: number;
}

export interface ParallelUploadOptions {
  concurrency?: number;
  onProgress?: (progress: Map<string, UploadProgress>) => void;
}

const DEFAULT_CONCURRENCY = 3;

/**
 * Upload multiple files in parallel with concurrency limit
 * Automatically uses resumable upload for large files (videos)
 * Returns a map of item id -> upload result path
 */
export async function uploadFilesInParallel(
  items: UploadItem[],
  options: ParallelUploadOptions = {}
): Promise<Map<string, string>> {
  const { concurrency = DEFAULT_CONCURRENCY, onProgress } = options;
  const supabase = createClient();

  // Initialize progress tracking
  const progressMap = new Map<string, UploadProgress>();
  for (const item of items) {
    progressMap.set(item.id, {
      id: item.id,
      status: "pending",
      progress: 0,
      bytesTotal: item.file.size,
      bytesUploaded: 0,
    });
  }

  // Notify initial progress
  onProgress?.(new Map(progressMap));

  // Results map
  const results = new Map<string, string>();

  // Process items with concurrency limit
  const queue = [...items];
  const inFlight = new Set<Promise<void>>();

  const processItem = async (item: UploadItem) => {
    // Determine if we should use resumable upload
    const useResumable = item.isVideo || shouldUseResumableUpload(item.file);

    // Update status to uploading
    progressMap.set(item.id, {
      id: item.id,
      status: "uploading",
      progress: useResumable ? 0 : 10, // Resumable starts at 0, regular at 10
      bytesTotal: item.file.size,
      bytesUploaded: 0,
    });
    onProgress?.(new Map(progressMap));

    try {
      if (useResumable) {
        // Use resumable upload for large files (videos)
        console.log(`[Upload] Using resumable upload for ${item.path} (${(item.file.size / 1024 / 1024).toFixed(1)} MB)`);
        
        await uploadResumable(item.file, item.path, {
          onProgress: (progress) => {
            progressMap.set(item.id, {
              id: item.id,
              status: progress.status === "completed" ? "completed" : "uploading",
              progress: progress.percentage,
              bytesUploaded: progress.bytesUploaded,
              bytesTotal: progress.bytesTotal,
            });
            onProgress?.(new Map(progressMap));
          },
          onError: (error) => {
            console.error(`[Upload] Resumable upload error for ${item.path}:`, error);
          },
        });

        // Mark as completed
        progressMap.set(item.id, {
          id: item.id,
          status: "completed",
          progress: 100,
          bytesUploaded: item.file.size,
          bytesTotal: item.file.size,
        });
        onProgress?.(new Map(progressMap));
        results.set(item.id, item.path);
      } else {
        // Use regular upload for smaller files (images)
        // Simulate progress updates during upload
        // (Supabase JS doesn't expose upload progress, so we simulate it)
        const progressInterval = setInterval(() => {
          const current = progressMap.get(item.id);
          if (current && current.status === "uploading" && current.progress < 90) {
            const newProgress = Math.min(current.progress + 15, 90);
            progressMap.set(item.id, {
              ...current,
              progress: newProgress,
              bytesUploaded: Math.floor((newProgress / 100) * item.file.size),
            });
            onProgress?.(new Map(progressMap));
          }
        }, 200);

        const { error } = await supabase.storage
          .from("media")
          .upload(item.path, item.file, {
            cacheControl: "3600",
            upsert: false,
          });

        clearInterval(progressInterval);

        if (error) {
          throw error;
        }

        // Mark as completed
        progressMap.set(item.id, {
          id: item.id,
          status: "completed",
          progress: 100,
          bytesUploaded: item.file.size,
          bytesTotal: item.file.size,
        });
        onProgress?.(new Map(progressMap));

        results.set(item.id, item.path);
      }
    } catch (err) {
      // Mark as error
      progressMap.set(item.id, {
        id: item.id,
        status: "error",
        progress: 0,
        error: err instanceof Error ? err.message : "Upload failed",
        bytesTotal: item.file.size,
        bytesUploaded: 0,
      });
      onProgress?.(new Map(progressMap));
      throw err;
    }
  };

  // Process queue with concurrency
  while (queue.length > 0 || inFlight.size > 0) {
    // Start new uploads up to concurrency limit
    while (queue.length > 0 && inFlight.size < concurrency) {
      const item = queue.shift()!;
      const promise = processItem(item).finally(() => {
        inFlight.delete(promise);
      });
      inFlight.add(promise);
    }

    // Wait for at least one to complete
    if (inFlight.size > 0) {
      await Promise.race(inFlight);
    }
  }

  return results;
}

/**
 * Calculate overall progress from individual progress items
 */
export function calculateOverallProgress(
  progressMap: Map<string, UploadProgress>
): { completed: number; total: number; percentage: number } {
  const entries = Array.from(progressMap.values());
  const total = entries.length;
  const completed = entries.filter((p) => p.status === "completed").length;
  const inProgress = entries
    .filter((p) => p.status === "uploading")
    .reduce((sum, p) => sum + p.progress, 0);
  
  // Each completed = 100 points, in-progress = their progress
  const totalProgress = completed * 100 + inProgress;
  const percentage = total > 0 ? Math.round(totalProgress / total) : 0;

  return { completed, total, percentage };
}
