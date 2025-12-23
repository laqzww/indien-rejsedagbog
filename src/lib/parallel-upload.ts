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
  status: "pending" | "uploading" | "completed" | "error" | "retrying" | "waiting";
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
  maxRetries?: number; // Number of retries per file (default: 3)
  failSoft?: boolean; // Continue uploading other files even if one fails (default: true)
}

// Default settings - more conservative for stability
const DEFAULT_CONCURRENCY = 3;
const MIN_CONCURRENCY = 1;
const DEFAULT_MAX_RETRIES = 3; // Increased from 2

// Retry delays with exponential backoff (longer delays for stability)
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000]; // 2s, 5s, 10s, 20s

// Pause between file groups to prevent connection saturation
const GROUP_SIZE = 5; // Upload in groups of 5 files
const GROUP_PAUSE_MS = 1500; // 1.5 second pause between groups

// Token refresh interval (refresh if token expires within this time)
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Consecutive failure threshold for reducing concurrency
const FAILURE_THRESHOLD_FOR_CONCURRENCY_REDUCTION = 2;

/**
 * Get a fresh access token, refreshing if needed
 */
async function ensureFreshToken(): Promise<string> {
  const supabase = createClient();
  
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    throw new Error("Bruger skal være logget ind for at uploade filer");
  }
  
  // Check if token is about to expire
  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const expiresInMs = (expiresAt - now) * 1000;
  
  if (expiresInMs < TOKEN_REFRESH_THRESHOLD_MS) {
    console.log("[Upload] Token expiring soon, refreshing...");
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError || !refreshData.session) {
      console.warn("[Upload] Failed to refresh token, using existing:", refreshError);
      return session.access_token;
    }
    
    console.log("[Upload] Token refreshed successfully");
    return refreshData.session.access_token;
  }
  
  return session.access_token;
}

/**
 * Calculate optimal concurrency based on file count and sizes
 */
function calculateOptimalConcurrency(items: UploadItem[]): number {
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const avgSize = totalSize / items.length;
  const hasLargeFiles = items.some(item => item.file.size > 50 * 1024 * 1024); // 50MB+
  const hasVideos = items.some(item => item.isVideo);
  const hasManyFiles = items.length > 15;
  
  // For very many files, use minimal concurrency
  if (items.length > 20) {
    return 1;
  }
  
  // For many files or large files, reduce concurrency to avoid overwhelming the connection
  if (hasManyFiles || hasLargeFiles) {
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
 * Check if an error is likely due to network/connection issues
 */
function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("abort") ||
    message.includes("xmlhttprequest") ||
    message.includes("failed to fetch") ||
    message.includes("load failed")
  );
}

/**
 * Check if an error is likely due to auth issues
 */
function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("jwt") ||
    message.includes("token")
  );
}

/**
 * Upload multiple files in parallel with concurrency limit
 * Automatically uses resumable upload for large files (videos)
 * Returns a result object with successful uploads and any failures
 * 
 * Features:
 * - Automatic token refresh to prevent auth expiration
 * - Adaptive concurrency that reduces on failures
 * - Exponential backoff with longer delays
 * - Chunked uploads with pauses between groups
 * - Automatic retry on failure (configurable)
 * - Fail-soft mode: continues with other files even if one fails
 */
export async function uploadFilesInParallel(
  items: UploadItem[],
  options: ParallelUploadOptions = {}
): Promise<ParallelUploadResult> {
  const { 
    concurrency: initialConcurrency = calculateOptimalConcurrency(items), 
    onProgress,
    maxRetries = DEFAULT_MAX_RETRIES,
    failSoft = true,
  } = options;
  
  // Adaptive concurrency - starts at initial and can be reduced on failures
  let currentConcurrency = initialConcurrency;
  let consecutiveFailures = 0;
  let totalFilesProcessed = 0;
  
  const supabase = createClient();

  console.log(`[Upload] Starting parallel upload of ${items.length} files with initial concurrency ${currentConcurrency}`);
  console.log(`[Upload] Using group size ${GROUP_SIZE} with ${GROUP_PAUSE_MS}ms pause between groups`);

  // Ensure we have a fresh token before starting
  try {
    await ensureFreshToken();
    console.log("[Upload] Token verified before upload");
  } catch (tokenError) {
    console.error("[Upload] Failed to verify token:", tokenError);
    throw tokenError;
  }

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

  // Track last token refresh time
  let lastTokenRefresh = Date.now();
  const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000; // Refresh every 10 minutes during upload

  /**
   * Refresh token if needed during long uploads
   */
  const maybeRefreshToken = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastTokenRefresh > TOKEN_REFRESH_INTERVAL) {
      console.log("[Upload] Periodic token refresh during long upload");
      try {
        await ensureFreshToken();
        lastTokenRefresh = now;
      } catch (error) {
        console.warn("[Upload] Periodic token refresh failed:", error);
      }
    }
  };

  /**
   * Process a single upload item with retry logic
   */
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
      // Maybe refresh token for long uploads
      await maybeRefreshToken();

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
          
          // Reset consecutive failures on success
          consecutiveFailures = 0;
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
            
            // Reset consecutive failures on success
            consecutiveFailures = 0;
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
        
        // Reset consecutive failures on success
        consecutiveFailures = 0;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      console.error(`[Upload] Error uploading ${item.path}:`, errorMessage);
      
      // Track consecutive failures for adaptive concurrency
      consecutiveFailures++;
      
      // Reduce concurrency if we're seeing too many failures
      if (consecutiveFailures >= FAILURE_THRESHOLD_FOR_CONCURRENCY_REDUCTION && currentConcurrency > MIN_CONCURRENCY) {
        currentConcurrency = Math.max(MIN_CONCURRENCY, currentConcurrency - 1);
        console.log(`[Upload] Reducing concurrency to ${currentConcurrency} due to ${consecutiveFailures} consecutive failures`);
      }
      
      // Check if we should retry
      if (retryCount < maxRetries) {
        const retryDelay = RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];
        console.log(`[Upload] Scheduling retry ${retryCount + 1}/${maxRetries} for ${item.path} after ${retryDelay}ms`);
        
        // If this looks like an auth error, try to refresh token before retry
        if (isAuthError(err)) {
          console.log("[Upload] Auth error detected, refreshing token before retry");
          try {
            await ensureFreshToken();
            lastTokenRefresh = Date.now();
          } catch (refreshError) {
            console.warn("[Upload] Token refresh failed:", refreshError);
          }
        }
        
        // If this is a network error, wait longer and add extra delay
        const actualDelay = isNetworkError(err) ? retryDelay * 1.5 : retryDelay;
        
        progressMap.set(item.id, {
          id: item.id,
          status: "retrying",
          progress: 0,
          error: `Venter ${Math.round(actualDelay / 1000)}s før forsøg ${retryCount + 1}/${maxRetries}...`,
          bytesTotal: item.file.size,
          bytesUploaded: 0,
          retryCount: retryCount + 1,
        });
        onProgress?.(new Map(progressMap));
        
        // Wait before retrying (exponential backoff)
        await sleep(actualDelay);
        
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

  // Process items in groups with pauses between groups
  const queue = [...items];
  let currentGroupStart = 0;

  while (queue.length > 0) {
    // Take a group of items
    const groupItems = queue.splice(0, GROUP_SIZE);
    const groupNumber = Math.floor(currentGroupStart / GROUP_SIZE) + 1;
    const totalGroups = Math.ceil(items.length / GROUP_SIZE);
    
    console.log(`[Upload] Processing group ${groupNumber}/${totalGroups} (${groupItems.length} files)`);
    
    // Mark remaining items as waiting
    for (const item of queue) {
      const current = progressMap.get(item.id);
      if (current && current.status === "pending") {
        progressMap.set(item.id, {
          ...current,
          status: "waiting",
        });
      }
    }
    onProgress?.(new Map(progressMap));
    
    // Process this group with concurrency limit
    const inFlight = new Set<Promise<void>>();
    const groupQueue = [...groupItems];
    
    while (groupQueue.length > 0 || inFlight.size > 0) {
      // Start new uploads up to concurrency limit
      while (groupQueue.length > 0 && inFlight.size < currentConcurrency) {
        const item = groupQueue.shift()!;
        const promise = processItem(item).finally(() => {
          inFlight.delete(promise);
          totalFilesProcessed++;
        });
        inFlight.add(promise);
      }

      // Wait for at least one to complete
      if (inFlight.size > 0) {
        await Promise.race(inFlight);
      }
    }
    
    currentGroupStart += GROUP_SIZE;
    
    // Pause between groups if there are more items to process
    if (queue.length > 0) {
      console.log(`[Upload] Group ${groupNumber} complete. Pausing ${GROUP_PAUSE_MS}ms before next group...`);
      
      // Maybe refresh token during pause
      await maybeRefreshToken();
      
      await sleep(GROUP_PAUSE_MS);
    }
  }

  console.log(`[Upload] Completed: ${results.size} successful, ${failed.size} failed (final concurrency: ${currentConcurrency})`);

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
    .filter((p) => p.status === "uploading" || p.status === "retrying")
    .reduce((sum, p) => sum + p.progress, 0);
  
  // Each completed = 100 points, in-progress = their progress
  const totalProgress = completed * 100 + inProgress;
  const percentage = total > 0 ? Math.round(totalProgress / total) : 0;

  return { completed, total, percentage };
}
