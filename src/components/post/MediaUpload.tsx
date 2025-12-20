"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Camera, X, Film, Loader2, ImageIcon, MapPinOff } from "lucide-react";
import { isHeicFile, convertHeicToJpeg } from "@/lib/heic";
import { extractExifData, type ExifData } from "@/lib/exif";
import { compressImage, shouldCompress, formatFileSize } from "@/lib/image-compression";
import { 
  compressVideo, 
  shouldCompressVideo, 
  type CompressionProgress as VideoCompressionProgress 
} from "@/lib/video-compression";

export interface MediaFile {
  id: string;
  file: File;
  preview: string;
  type: "image" | "video";
  exif?: ExifData;
  isConverting?: boolean;
  displayBlob?: Blob; // JPEG version for display if HEIC
  uploadBlob?: Blob; // Compressed/converted version for upload
  compressedWidth?: number; // Dimensions after compression
  compressedHeight?: number;
  hasGps?: boolean; // Explicit GPS status
  originalSize?: number; // Original file size
  compressedSize?: number; // Compressed file size
  videoDuration?: number; // Video duration in seconds
  videoCompressionProgress?: VideoCompressionProgress; // Video compression progress
}

interface MediaUploadProps {
  files: MediaFile[];
  onFilesChange: (files: MediaFile[]) => void;
  onExifExtracted?: (exif: ExifData) => void;
  onVideoCompressionProgress?: (fileId: string, progress: VideoCompressionProgress) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export function MediaUpload({
  files,
  onFilesChange,
  onExifExtracted,
  onVideoCompressionProgress,
  disabled = false,
  maxFiles = 10,
}: MediaUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [processingVideos, setProcessingVideos] = useState<Set<string>>(new Set());

  const processFile = useCallback(
    async (file: File, updateProgress?: (mediaFile: MediaFile) => void): Promise<MediaFile> => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const type = file.type.startsWith("video/") ? "video" : "image";
      const isHeic = isHeicFile(file);

      // Check if video needs compression (async check)
      const needsVideoCompression = type === "video" ? await shouldCompressVideo(file) : false;

      // Create initial entry
      const mediaFile: MediaFile = {
        id,
        file,
        preview: "",
        type,
        isConverting: isHeic || (type === "image" && shouldCompress(file)) || needsVideoCompression,
        originalSize: file.size,
      };

      // STEP 1: Extract EXIF data from ORIGINAL file BEFORE any processing
      // This ensures we preserve GPS, capture date, and other metadata
      if (type === "image") {
        try {
          const exif = await extractExifData(file);
          mediaFile.exif = exif;
          mediaFile.hasGps = !!(exif.lat && exif.lng);
        } catch (error) {
          console.error("EXIF extraction failed:", error);
          mediaFile.hasGps = false;
        }
      }

      // STEP 2: Handle HEIC files - convert to JPEG first
      let blobToCompress: Blob = file;
      if (isHeic) {
        try {
          const jpegBlob = await convertHeicToJpeg(file);
          blobToCompress = jpegBlob;
          mediaFile.displayBlob = jpegBlob;
        } catch (error) {
          console.error("HEIC conversion failed:", error);
          // Fallback to original
          blobToCompress = file;
        }
      }

      // STEP 3: Compress images (including converted HEIC)
      if (type === "image") {
        try {
          // Compress if needed (large files or already a blob from HEIC conversion)
          if (shouldCompress(file) || isHeic) {
            const compressed = await compressImage(blobToCompress);
            mediaFile.uploadBlob = compressed.blob;
            mediaFile.compressedWidth = compressed.width;
            mediaFile.compressedHeight = compressed.height;
            mediaFile.compressedSize = compressed.blob.size;
            mediaFile.preview = URL.createObjectURL(compressed.blob);
            
            // Log compression stats for debugging
            const savings = Math.round((1 - compressed.blob.size / file.size) * 100);
            console.log(
              `Compressed ${file.name}: ${formatFileSize(file.size)} → ${formatFileSize(compressed.blob.size)} (${savings}% savings)`
            );
          } else {
            // Small file, no compression needed
            mediaFile.uploadBlob = file;
            mediaFile.preview = URL.createObjectURL(file);
          }
        } catch (error) {
          console.error("Compression failed:", error);
          // Fallback to original/converted blob
          mediaFile.uploadBlob = blobToCompress;
          mediaFile.preview = URL.createObjectURL(blobToCompress);
        }
      } else {
        // Video handling with compression
        // Set initial preview from original file
        mediaFile.preview = URL.createObjectURL(file);
        
        if (needsVideoCompression) {
          try {
            console.log(`[Video] Starting compression for ${file.name} (${formatFileSize(file.size)})`);
            
            const compressed = await compressVideo(
              file,
              {
                maxWidth: 1920,
                maxHeight: 1080,
                crf: 28, // Good quality/size balance
              },
              (progress) => {
                mediaFile.videoCompressionProgress = progress;
                onVideoCompressionProgress?.(id, progress);
                updateProgress?.(mediaFile);
              }
            );
            
            mediaFile.uploadBlob = compressed.blob;
            mediaFile.compressedWidth = compressed.width;
            mediaFile.compressedHeight = compressed.height;
            mediaFile.compressedSize = compressed.compressedSize;
            mediaFile.videoDuration = compressed.duration;
            
            // Update preview with compressed video
            URL.revokeObjectURL(mediaFile.preview);
            mediaFile.preview = URL.createObjectURL(compressed.blob);
            
            // Log compression stats
            const savings = Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100);
            console.log(
              `[Video] Compressed ${file.name}: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)} (${savings}% savings)`
            );
          } catch (error) {
            console.error("[Video] Compression failed:", error);
            // Fallback to original file
            mediaFile.uploadBlob = file;
          }
        } else {
          // Small video, no compression needed
          console.log(`[Video] ${file.name} is small enough (${formatFileSize(file.size)}), skipping compression`);
          mediaFile.uploadBlob = file;
        }
      }

      mediaFile.isConverting = false;
      mediaFile.videoCompressionProgress = undefined;
      return mediaFile;
    },
    [onVideoCompressionProgress]
  );

  const handleFiles = useCallback(
    async (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const remainingSlots = maxFiles - files.length;
      const filesToProcess = fileArray.slice(0, remainingSlots);

      if (filesToProcess.length === 0) return;

      // Process files - videos may take longer due to compression
      // Process images in parallel, videos sequentially to avoid memory issues
      const imageFiles = filesToProcess.filter((f) => !f.type.startsWith("video/"));
      const videoFiles = filesToProcess.filter((f) => f.type.startsWith("video/"));

      // Process images in parallel first (fast)
      const processedImages = await Promise.all(
        imageFiles.map((f) => processFile(f))
      );

      // Update with processed images immediately
      let currentFiles = [...files, ...processedImages];
      if (processedImages.length > 0) {
        onFilesChange(currentFiles);
      }

      // Process videos sequentially to avoid memory issues with FFmpeg
      for (const videoFile of videoFiles) {
        // Create a placeholder for this video
        const placeholderId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const placeholder: MediaFile = {
          id: placeholderId,
          file: videoFile,
          preview: URL.createObjectURL(videoFile),
          type: "video",
          isConverting: true,
          originalSize: videoFile.size,
        };
        
        // Add placeholder
        currentFiles = [...currentFiles, placeholder];
        onFilesChange(currentFiles);
        setProcessingVideos((prev) => new Set([...prev, placeholderId]));

        // Process the video
        const processed = await processFile(videoFile);
        
        // Replace placeholder with processed video
        currentFiles = currentFiles.map((f) => 
          f.id === placeholderId ? processed : f
        );
        onFilesChange(currentFiles);
        setProcessingVideos((prev) => {
          const next = new Set(prev);
          next.delete(placeholderId);
          return next;
        });
      }

      // Notify about first file's EXIF data (for auto-filling location)
      const allProcessed = [...processedImages];
      if (allProcessed.length > 0 && allProcessed[0].exif && onExifExtracted) {
        onExifExtracted(allProcessed[0].exif);
      }
    },
    [files, maxFiles, onFilesChange, onExifExtracted, processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      onFilesChange(files.filter((f) => f.id !== id));
    },
    [files, onFilesChange]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center transition-all",
          isDragging
            ? "border-saffron bg-saffron/5"
            : "border-border hover:border-saffron/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          type="file"
          accept="image/*,video/*,.heic,.heif"
          multiple
          onChange={handleInputChange}
          disabled={disabled || files.length >= maxFiles}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <div className="flex flex-col items-center gap-3">
          <div className="p-4 rounded-full bg-saffron/10 text-saffron">
            <Camera className="h-8 w-8" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              Træk billeder/video hertil
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              eller klik for at vælge (maks {maxFiles} filer)
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, HEIC, MP4, MOV • Maks 50MB per fil
          </p>
        </div>
      </div>

      {/* Preview grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((file, index) => (
            <div
              key={file.id}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted group animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {file.isConverting ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
                  <Loader2 className="h-6 w-6 text-saffron animate-spin" />
                  {file.type === "video" && file.videoCompressionProgress && (
                    <div className="mt-2 text-xs text-center px-2">
                      <div className="text-saffron font-medium">
                        {file.videoCompressionProgress.stage === "loading" && "Indlæser..."}
                        {file.videoCompressionProgress.stage === "analyzing" && "Analyserer..."}
                        {file.videoCompressionProgress.stage === "compressing" && `${file.videoCompressionProgress.progress}%`}
                        {file.videoCompressionProgress.stage === "finalizing" && "Færdiggør..."}
                      </div>
                      {file.videoCompressionProgress.stage === "compressing" && (
                        <div className="w-full bg-muted-foreground/20 rounded-full h-1 mt-1">
                          <div 
                            className="bg-saffron h-1 rounded-full transition-all duration-300"
                            style={{ width: `${file.videoCompressionProgress.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {file.type === "video" && !file.videoCompressionProgress && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Forbereder video...
                    </div>
                  )}
                </div>
              ) : file.type === "video" ? (
                <div className="relative w-full h-full bg-navy/10 flex items-center justify-center">
                  <Film className="h-12 w-12 text-navy/40" />
                  <video
                    src={file.preview}
                    className="absolute inset-0 w-full h-full object-cover opacity-80"
                  />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.preview}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              )}

              {/* Remove button */}
              <button
                onClick={() => removeFile(file.id)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-opacity"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Type indicator */}
              <div className="absolute bottom-2 left-2 p-1 rounded bg-black/50">
                {file.type === "video" ? (
                  <Film className="h-3 w-3 text-white" />
                ) : (
                  <ImageIcon className="h-3 w-3 text-white" />
                )}
              </div>

              {/* EXIF GPS indicator */}
              {file.type === "image" && (
                file.hasGps ? (
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-india-green text-white text-xs">
                    GPS
                  </div>
                ) : (
                  <div className="absolute bottom-2 right-2 p-1 rounded bg-amber-500 text-white" title="Ingen GPS-data fundet">
                    <MapPinOff className="h-3 w-3" />
                  </div>
                )
              )}

              {/* Compression indicator */}
              {file.compressedSize && file.originalSize && file.compressedSize < file.originalSize && (
                <div 
                  className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-india-green/90 text-white text-xs"
                  title={`Komprimeret: ${formatFileSize(file.originalSize)} → ${formatFileSize(file.compressedSize)}`}
                >
                  -{Math.round((1 - file.compressedSize / file.originalSize) * 100)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

