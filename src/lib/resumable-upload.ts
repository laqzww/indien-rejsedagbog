"use client";

import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

export interface ResumableUploadOptions {
  bucket?: string;
  onProgress?: (progress: ResumableUploadProgress) => void;
  onError?: (error: Error) => void;
  chunkSize?: number; // in bytes, default 6MB
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

const DEFAULT_CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks (Supabase recommended)
const DEFAULT_RETRY_DELAYS = [0, 1000, 3000, 5000]; // Retry delays

/**
 * Get a fresh access token, refreshing if needed
 */
async function getFreshAccessToken(): Promise<string> {
  const supabase = createClient();
  
  // First try to get current session
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    throw new Error("User must be authenticated to upload files");
  }
  
  // Check if token is about to expire (within 60 seconds)
  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const isExpiringSoon = expiresAt - now < 60;
  
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

  // Get a fresh access token
  const accessToken = await getFreshAccessToken();
  
  // Ensure we have a valid content type for the file
  const contentType = file.type || getMimeTypeFromPath(path) || "application/octet-stream";
  
  console.log(`[Resumable Upload] Starting upload for ${path} (${formatBytes(file.size)}, type: ${contentType})`);

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
        
        // Check if this is a token/auth error and retry once with fresh token
        if (!hasStarted && (
          errorMessage.includes("XMLHttpRequestProgressEvent") ||
          errorMessage.includes("n/a") ||
          errorMessage.includes("401") ||
          errorMessage.includes("unauthorized")
        )) {
          console.log("[Resumable Upload] Retrying with fresh token...");
          
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
            upload.start();
            return;
          } catch (retryError) {
            console.error("[Resumable Upload] Retry failed:", retryError);
          }
        }
        
        onProgress?.({
          bytesUploaded: 0,
          bytesTotal: file.size,
          percentage: 0,
          status: "error",
        });
        onError?.(error);
        reject(error);
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
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: bucket,
            objectName: path,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          onError: (error) => {
            console.error("[Resumable Upload] Error:", error);
            onProgress?.({
              bytesUploaded: 0,
              bytesTotal: file.size,
              percentage: 0,
              status: "error",
            });
            onError?.(error);
            rejectPromise?.(error);
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
