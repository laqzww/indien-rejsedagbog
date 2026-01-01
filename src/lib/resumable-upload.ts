"use client";

import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

export interface ResumableUploadOptions {
  bucket?: string;
  onProgress?: (progress: ResumableUploadProgress) => void;
  onError?: (error: Error) => void;
  chunkSize?: number; // in bytes, default 5MB
  retryDelays?: number[]; // delays between retries in ms
}

export interface ResumableUploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
  status: "uploading" | "paused" | "completed" | "error";
}

export interface ResumableUploadResult {
  path: string;
  publicUrl: string;
}

// Supabase Storage limits - adjust based on your plan:
// Free tier: 50MB max file size
// Pro tier: 5GB max file size
// Configure via NEXT_PUBLIC_MAX_FILE_SIZE_MB environment variable
const DEFAULT_MAX_FILE_SIZE_MB = 500;

function getMaxFileSizeMB(): number {
  const envValue = process.env.NEXT_PUBLIC_MAX_FILE_SIZE_MB;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_FILE_SIZE_MB;
}

export const MAX_FILE_SIZE_MB = getMaxFileSizeMB();
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Use 5MB chunks for better compatibility with Supabase's limits
// Smaller chunks are more reliable for slower connections
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

// Longer retry delays for better recovery from network issues
// TUS will automatically retry with these delays when a chunk fails
const DEFAULT_RETRY_DELAYS = [0, 2000, 5000, 10000, 20000, 30000]; // Up to 30s final delay

// Token refresh threshold - refresh if expiring within 5 minutes
const TOKEN_REFRESH_THRESHOLD_SECONDS = 5 * 60;

/**
 * Get a fresh access token, refreshing if needed
 */
async function getFreshAccessToken(): Promise<string> {
  const supabase = createClient();
  
  // First try to get current session
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    throw new Error("Bruger skal være logget ind for at uploade filer");
  }
  
  // Check if token is about to expire (within threshold)
  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const isExpiringSoon = expiresAt - now < TOKEN_REFRESH_THRESHOLD_SECONDS;
  
  if (isExpiringSoon) {
    console.log("[Resumable Upload] Token expiring soon, refreshing...");
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError || !refreshData.session) {
      console.error("[Resumable Upload] Failed to refresh token:", refreshError);
      // Return existing token as fallback
      return session.access_token;
    }
    
    console.log("[Resumable Upload] Token refreshed successfully");
    return refreshData.session.access_token;
  }
  
  return session.access_token;
}

/**
 * Validate file size before upload
 * Returns an error message if validation fails, null if OK
 */
export function validateFileSize(file: Blob): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `Filen er for stor (${formatBytes(file.size)}). Maksimal størrelse er ${MAX_FILE_SIZE_MB}MB. Prøv at komprimere videoen først.`;
  }
  return null;
}

/**
 * Error types for better handling
 */
type TusErrorType = "file_too_large" | "auth" | "network" | "timeout" | "server" | "unknown";

interface ParsedTusError {
  type: TusErrorType;
  isRetryable: boolean;
  message: string;
}

/**
 * Parse TUS error to get a user-friendly message and determine if retryable
 */
function parseTusError(error: Error | unknown): ParsedTusError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();
  
  // Check for 413 errors (file too large)
  if (errorMessage.includes("413") || lowerMessage.includes("maximum size exceeded") || lowerMessage.includes("payload too large")) {
    return {
      type: "file_too_large",
      isRetryable: false,
      message: "Filen overstiger Supabase's filstørrelsesbegrænsning. Kontrollér dine Supabase Storage indstillinger eller komprimer videoen."
    };
  }
  
  // Check for auth errors
  if (errorMessage.includes("401") || errorMessage.includes("403") || lowerMessage.includes("unauthorized") || lowerMessage.includes("forbidden")) {
    return {
      type: "auth",
      isRetryable: true, // Can retry with fresh token
      message: "Autentificeringsfejl. Prøver at genopfriske login..."
    };
  }
  
  // Check for timeout errors
  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out") || lowerMessage.includes("aborted")) {
    return {
      type: "timeout",
      isRetryable: true,
      message: "Forbindelsen fik timeout. Prøver igen..."
    };
  }
  
  // Check for network/connection errors
  if (
    errorMessage.includes("XMLHttpRequestProgressEvent") || 
    lowerMessage.includes("network") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("load failed") ||
    lowerMessage.includes("net::") ||
    lowerMessage.includes("err_")
  ) {
    return {
      type: "network",
      isRetryable: true,
      message: "Netværksfejl under upload. Prøver igen..."
    };
  }
  
  // Check for server errors (5xx)
  if (errorMessage.includes("500") || errorMessage.includes("502") || errorMessage.includes("503") || errorMessage.includes("504")) {
    return {
      type: "server",
      isRetryable: true,
      message: "Serverfejl. Prøver igen om lidt..."
    };
  }
  
  return {
    type: "unknown",
    isRetryable: true, // Assume unknown errors are retryable
    message: errorMessage || "Ukendt fejl under upload"
  };
}

/**
 * Upload a file using the tus resumable upload protocol
 * Supports pause/resume and automatic retries on network failures
 */
export async function uploadResumable(
  file: Blob,
  path: string,
  options: ResumableUploadOptions = {}
): Promise<ResumableUploadResult> {
  const {
    bucket = "media",
    onProgress,
    onError,
    chunkSize = DEFAULT_CHUNK_SIZE,
    retryDelays = DEFAULT_RETRY_DELAYS,
  } = options;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // Validate file size before starting
  const sizeError = validateFileSize(file);
  if (sizeError) {
    const error = new Error(sizeError);
    onError?.(error);
    throw error;
  }

  // Get a fresh access token
  const accessToken = await getFreshAccessToken();
  
  // Ensure we have a valid content type for the file
  const contentType = file.type || getMimeTypeFromPath(path) || "application/octet-stream";
  
  console.log(`[Resumable Upload] Starting upload for ${path} (${formatBytes(file.size)}, type: ${contentType}, chunk size: ${formatBytes(chunkSize)})`);

  return new Promise((resolve, reject) => {
    let hasStarted = false;
    
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays,
      chunkSize,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false", // Don't overwrite existing files
      },
      // Disable uploadDataDuringCreation to prevent issues with initial request
      // This makes the creation request smaller and more reliable
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true, // Remove from localStorage on success
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType,
        cacheControl: "3600",
      },
      onError: async (error) => {
        const errorMessage = error?.message || String(error);
        console.error("[Resumable Upload] Error:", errorMessage);
        
        // Parse the error for better handling
        const parsedError = parseTusError(error);
        console.log(`[Resumable Upload] Error type: ${parsedError.type}, retryable: ${parsedError.isRetryable}`);
        
        // If error is not retryable (e.g., file too large), fail immediately
        if (!parsedError.isRetryable) {
          console.error("[Resumable Upload] Non-retryable error, failing immediately");
          onProgress?.({
            bytesUploaded: 0,
            bytesTotal: file.size,
            percentage: 0,
            status: "error",
          });
          const friendlyError = new Error(parsedError.message);
          onError?.(friendlyError);
          reject(friendlyError);
          return;
        }
        
        // For auth errors or initial connection failures, try with fresh token
        if (!hasStarted && (parsedError.type === "auth" || parsedError.type === "network")) {
          console.log("[Resumable Upload] Attempting recovery with fresh token...");
          
          try {
            const freshToken = await getFreshAccessToken();
            
            // Update the headers with fresh token and retry
            upload.options.headers = {
              ...upload.options.headers,
              authorization: `Bearer ${freshToken}`,
            };
            
            // Clear any previous upload state that might be corrupted
            const previousUploads = await upload.findPreviousUploads();
            for (const prev of previousUploads) {
              // Remove corrupted previous upload entries
              if (typeof window !== 'undefined' && window.localStorage) {
                try {
                  const key = `tus::${prev.urlStorageKey}`;
                  window.localStorage.removeItem(key);
                } catch {
                  // Ignore localStorage errors
                }
              }
            }
            
            hasStarted = true;
            
            // Add a small delay before retrying for network issues
            if (parsedError.type === "network") {
              console.log("[Resumable Upload] Waiting 2s before retry...");
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            upload.start();
            return;
          } catch (retryError) {
            console.error("[Resumable Upload] Recovery failed:", retryError);
          }
        }
        
        onProgress?.({
          bytesUploaded: 0,
          bytesTotal: file.size,
          percentage: 0,
          status: "error",
        });
        const friendlyError = new Error(parsedError.message);
        onError?.(friendlyError);
        reject(friendlyError);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        hasStarted = true;
        const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress?.({
          bytesUploaded,
          bytesTotal,
          percentage,
          status: "uploading",
        });
      },
      onSuccess: () => {
        console.log(`[Resumable Upload] Completed: ${path}`);
        onProgress?.({
          bytesUploaded: file.size,
          bytesTotal: file.size,
          percentage: 100,
          status: "completed",
        });

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
        resolve({ path, publicUrl });
      },
    });

    // Check for previous uploads to resume
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        console.log("[Resumable Upload] Resuming previous upload");
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch((err) => {
      console.error("[Resumable Upload] Error finding previous uploads:", err);
      // Start fresh upload anyway
      upload.start();
    });
  });
}

/**
 * Get MIME type from file path extension
 */
function getMimeTypeFromPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Video
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'm4v': 'video/x-m4v',
    '3gp': 'video/3gpp',
    // Image
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'heif': 'image/heif',
  };
  return ext ? mimeTypes[ext] || null : null;
}

/**
 * Create a pausable/resumable upload controller
 * Returns an object with start, pause, resume, and abort methods
 */
export function createResumableUpload(
  file: Blob,
  path: string,
  options: ResumableUploadOptions = {}
): ResumableUploadController {
  const {
    bucket = "media",
    onProgress,
    onError,
    chunkSize = DEFAULT_CHUNK_SIZE,
    retryDelays = DEFAULT_RETRY_DELAYS,
  } = options;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  
  // Validate file size
  const sizeError = validateFileSize(file);
  if (sizeError) {
    throw new Error(sizeError);
  }
  
  // Ensure we have a valid content type for the file
  const contentType = file.type || getMimeTypeFromPath(path) || "application/octet-stream";
  
  let upload: tus.Upload | null = null;
  let resolvePromise: ((result: ResumableUploadResult) => void) | null = null;
  let rejectPromise: ((error: Error) => void) | null = null;

  const controller: ResumableUploadController = {
    promise: null as unknown as Promise<ResumableUploadResult>,

    async start(session: { access_token: string }) {
      return new Promise<ResumableUploadResult>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;

        upload = new tus.Upload(file, {
          endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
          retryDelays,
          chunkSize,
          headers: {
            authorization: `Bearer ${session.access_token}`,
            "x-upsert": "false",
          },
          // Disable uploadDataDuringCreation to prevent 413 errors on initial request
          uploadDataDuringCreation: false,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: bucket,
            objectName: path,
            contentType: contentType,
            cacheControl: "3600",
          },
          onError: (error) => {
            console.error("[Resumable Upload] Error:", error);
            const parsedError = parseTusError(error);
            onProgress?.({
              bytesUploaded: 0,
              bytesTotal: file.size,
              percentage: 0,
              status: "error",
            });
            const friendlyError = new Error(parsedError.message);
            onError?.(friendlyError);
            rejectPromise?.(friendlyError);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            onProgress?.({
              bytesUploaded,
              bytesTotal,
              percentage,
              status: "uploading",
            });
          },
          onSuccess: () => {
            onProgress?.({
              bytesUploaded: file.size,
              bytesTotal: file.size,
              percentage: 100,
              status: "completed",
            });

            const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
            resolvePromise?.({ path, publicUrl });
          },
        });

        // Check for previous uploads and start
        upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length > 0 && upload) {
            console.log("[Resumable Upload] Resuming previous upload");
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          upload?.start();
        });
      });
    },

    pause() {
      if (upload) {
        upload.abort();
        onProgress?.({
          bytesUploaded: 0,
          bytesTotal: file.size,
          percentage: 0,
          status: "paused",
        });
      }
    },

    resume() {
      if (upload) {
        upload.start();
      }
    },

    abort() {
      if (upload) {
        upload.abort();
        rejectPromise?.(new Error("Upload aborted by user"));
      }
    },
  };

  return controller;
}

export interface ResumableUploadController {
  promise: Promise<ResumableUploadResult>;
  start: (session: { access_token: string }) => Promise<ResumableUploadResult>;
  pause: () => void;
  resume: () => void;
  abort: () => void;
}

/**
 * Determine if a file should use resumable upload based on size
 * Files larger than 50MB benefit most from resumable uploads
 */
export function shouldUseResumableUpload(file: Blob): boolean {
  // Use resumable upload for files larger than 20MB
  // Smaller files are faster with regular upload due to less overhead
  return file.size > 20 * 1024 * 1024;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
