"use client";

import { createClient } from "@/lib/supabase/client";
import { uploadResumable, shouldUseResumableUpload, validateFileSize } from "@/lib/resumable-upload";

export interface UploadItem {
  id: string;
  file: Blob;
  path: string;
  isVideo?: boolean; // Hint for using resumable upload
}

export interface UploadProgress {
  id: string;
  status: "pending" | "uploading" | "completed" | "error" | "retrying";
  progress: number; // 0-100
  error?: string;
  bytesUploaded?: number;
  bytesTotal?: number;
  retryCount?: number;
}

export interface ParallelUploadResult {
  results: Map<string, string>;
  failed: Map<string, string>; // id -> error message
  hasFailures: boolean;
}

export interface ParallelUploadOptions {
  concurrency?: number;
  onProgress?: (progress: Map<string, UploadProgress>) => void;
  maxRetries?: number; // Number of retries per file (default: 2)
  failSoft?: boolean; // Continue uploading other files even if one fails (default: true)
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000; // Wait 1 second before retrying

/**
 * Calculate optimal concurrency based on file count and sizes
 */
function calculateOptimalConcurrency(items: UploadItem[]): number {
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const avgSize = totalSize / items.length;
  const hasLargeFiles = items.some(item => item.file.size > 50 * 1024 * 1024); // 50MB+
  const hasVideos = items.some(item => item.isVideo);
  
  // For many files or large files, reduce concurrency to avoid overwhelming the connection
  if (items.length > 10 || hasLargeFiles) {
    return 2;
  }
  
  // For video-heavy uploads, use lower concurrency
  if (hasVideos && avgSize > 20 * 1024 * 1024) {
    return 2;
  }
  
  // Standard concurrency for smaller batches
  return DEFAULT_CONCURRENCY;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload multiple files in parallel with concurrency limit
 * Automatically uses resumable upload for large files (videos)
 * Returns a result object with successful uploads and any failures
 * 
 * Features:
 * - Automatic retry on failure (configurable)
 * - Fail-soft mode: continues with other files even if one fails
 * - Dynamic concurrency based on file sizes
 */
export async function uploadFilesInParallel(
  items: UploadItem[],
  options: ParallelUploadOptions = {}
): Promise<ParallelUploadResult> {
  const { 
    concurrency = calculateOptimalConcurrency(items), 
    onProgress,
    maxRetries = DEFAULT_MAX_RETRIES,
    failSoft = true,
  } = options;
  
  const supabase = createClient();

  console.log(`[Upload] Starting parallel upload of ${items.length} files with concurrency ${concurrency}`);

  // Initialize progress tracking
  const progressMap = new Map<string, UploadProgress>();
  for (const item of items) {
    progressMap.set(item.id, {
      id: item.id,
      status: "pending",
      progress: 0,
      bytesTotal: item.file.size,
      bytesUploaded: 0,
      retryCount: 0,
    });
  }

  // Notify initial progress
  onProgress?.(new Map(progressMap));

  // Results and failures maps
  const results = new Map<string, string>();
  const failed = new Map<string, string>();

  // Process items with concurrency limit
  const queue = [...items];
  const inFlight = new Set<Promise<void>>();

  const processItem = async (item: UploadItem, retryCount: number = 0): Promise<void> => {
    // Determine if we should use resumable upload
    const useResumable = item.isVideo || shouldUseResumableUpload(item.file);

    // Validate file size before attempting upload
    const sizeError = validateFileSize(item.file);
    if (sizeError) {
      progressMap.set(item.id, {
        id: item.id,
        status: "error",
        progress: 0,
        error: sizeError,
        bytesTotal: item.file.size,
        bytesUploaded: 0,
        retryCount,
      });
      onProgress?.(new Map(progressMap));
      failed.set(item.id, sizeError);
      return; // Don't throw - just mark as failed and continue
    }

    // Update status to uploading (or retrying)
    progressMap.set(item.id, {
      id: item.id,
      status: retryCount > 0 ? "retrying" : "uploading",
      progress: useResumable ? 0 : 10,
      bytesTotal: item.file.size,
      bytesUploaded: 0,
      retryCount,
    });
    onProgress?.(new Map(progressMap));

    try {
      if (useResumable) {
        // Use resumable upload for large files (videos)
        console.log(`[Upload] Using resumable upload for ${item.path} (${(item.file.size / 1024 / 1024).toFixed(1)} MB)${retryCount > 0 ? ` [Retry ${retryCount}]` : ''}`);
        
        try {
          await uploadResumable(item.file, item.path, {
            onProgress: (progress) => {
              progressMap.set(item.id, {
                id: item.id,
                status: progress.status === "completed" ? "completed" : "uploading",
                progress: progress.percentage,
                bytesUploaded: progress.bytesUploaded,
                bytesTotal: progress.bytesTotal,
                retryCount,
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
            retryCount,
          });
          onProgress?.(new Map(progressMap));
          results.set(item.id, item.path);
        } catch (resumableError) {
          // If resumable upload fails, try fallback to regular upload for files under 50MB
          const fileSizeMB = item.file.size / (1024 * 1024);
          console.error(`[Upload] Resumable upload failed for ${item.path}:`, resumableError);
          
          if (fileSizeMB <= 50) {
            console.log(`[Upload] Falling back to regular upload for ${item.path} (${fileSizeMB.toFixed(1)} MB)`);
            
            // Reset progress for fallback
            progressMap.set(item.id, {
              id: item.id,
              status: "uploading",
              progress: 5,
              bytesTotal: item.file.size,
              bytesUploaded: 0,
              retryCount,
            });
            onProgress?.(new Map(progressMap));
            
            // Use regular upload as fallback
            const { error } = await supabase.storage
              .from("media")
              .upload(item.path, item.file, {
                cacheControl: "3600",
                upsert: false,
              });
            
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
              retryCount,
            });
            onProgress?.(new Map(progressMap));
            results.set(item.id, item.path);
          } else {
            // File too large for regular upload, throw the original error
            throw resumableError;
          }
        }
      } else {
        // Use regular upload for smaller files (images)
        console.log(`[Upload] Using regular upload for ${item.path} (${(item.file.size / 1024 / 1024).toFixed(1)} MB)${retryCount > 0 ? ` [Retry ${retryCount}]` : ''}`);
        
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
          retryCount,
        });
        onProgress?.(new Map(progressMap));

        results.set(item.id, item.path);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      console.error(`[Upload] Error uploading ${item.path}:`, errorMessage);
      
      // Check if we should retry
      if (retryCount < maxRetries) {
        console.log(`[Upload] Scheduling retry ${retryCount + 1}/${maxRetries} for ${item.path}`);
        
        progressMap.set(item.id, {
          id: item.id,
          status: "retrying",
          progress: 0,
          error: `Prøver igen (${retryCount + 1}/${maxRetries})...`,
          bytesTotal: item.file.size,
          bytesUploaded: 0,
          retryCount: retryCount + 1,
        });
        onProgress?.(new Map(progressMap));
        
        // Wait before retrying (exponential backoff)
        await sleep(RETRY_DELAY_MS * (retryCount + 1));
        
        // Retry the upload
        return processItem(item, retryCount + 1);
      }
      
      // Max retries exceeded - mark as permanently failed
      progressMap.set(item.id, {
        id: item.id,
        status: "error",
        progress: 0,
        error: errorMessage,
        bytesTotal: item.file.size,
        bytesUploaded: 0,
        retryCount,
      });
      onProgress?.(new Map(progressMap));
      
      failed.set(item.id, errorMessage);
      
      // In fail-soft mode, don't throw - just continue with other files
      if (!failSoft) {
        throw err;
      }
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

  console.log(`[Upload] Completed: ${results.size} successful, ${failed.size} failed`);

  return {
    results,
    failed,
    hasFailures: failed.size > 0,
  };
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
