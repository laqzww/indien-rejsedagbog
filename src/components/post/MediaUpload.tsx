"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Camera, X, Film, Loader2, ImageIcon, MapPinOff, Zap } from "lucide-react";
import { isHeicFile, convertHeicToJpeg } from "@/lib/heic";
import { extractExifData, type ExifData } from "@/lib/exif";
import { optimizeImage, formatFileSize, type OptimizationResult } from "@/lib/image-optimization";

export interface MediaFile {
  id: string;
  file: File;
  preview: string;
  type: "image" | "video";
  exif?: ExifData;
  isConverting?: boolean;
  isOptimizing?: boolean;
  displayBlob?: Blob; // JPEG version for display if HEIC
  optimizedBlob?: Blob; // Optimized version for upload
  optimizationInfo?: OptimizationResult; // Stats about compression
  hasGps?: boolean; // Explicit GPS status
}

interface MediaUploadProps {
  files: MediaFile[];
  onFilesChange: (files: MediaFile[]) => void;
  onExifExtracted?: (exif: ExifData) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export function MediaUpload({
  files,
  onFilesChange,
  onExifExtracted,
  disabled = false,
  maxFiles = 10,
}: MediaUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback(
    async (file: File): Promise<MediaFile> => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const type = file.type.startsWith("video/") ? "video" : "image";

      // Create initial entry
      const mediaFile: MediaFile = {
        id,
        file,
        preview: "",
        type,
        isConverting: isHeicFile(file),
        isOptimizing: type === "image",
      };

      // For images: Extract EXIF FIRST (before any conversion/optimization)
      // This is critical because compression strips EXIF data
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

      // Handle HEIC files - convert to JPEG first
      let imageToOptimize: File | Blob = file;
      if (isHeicFile(file)) {
        try {
          const jpegBlob = await convertHeicToJpeg(file);
          mediaFile.displayBlob = jpegBlob;
          mediaFile.preview = URL.createObjectURL(jpegBlob);
          mediaFile.isConverting = false;
          imageToOptimize = jpegBlob;
        } catch (error) {
          console.error("HEIC conversion failed:", error);
          mediaFile.preview = URL.createObjectURL(file);
          mediaFile.isConverting = false;
        }
      } else if (type === "image") {
        mediaFile.preview = URL.createObjectURL(file);
      } else {
        // Video - just use preview, no optimization
        mediaFile.preview = URL.createObjectURL(file);
        mediaFile.isOptimizing = false;
      }

      // Optimize images for web upload
      if (type === "image") {
        try {
          // Convert Blob to File if needed (for HEIC converted files)
          const fileToOptimize = imageToOptimize instanceof File 
            ? imageToOptimize 
            : new File([imageToOptimize], file.name, { type: imageToOptimize.type });

          const optimizationResult = await optimizeImage(fileToOptimize, {
            maxDimension: 2048,
            maxSizeMB: 1,
            quality: 0.85,
            useWebP: true,
          });

          mediaFile.optimizedBlob = optimizationResult.blob;
          mediaFile.optimizationInfo = optimizationResult;
          mediaFile.isOptimizing = false;

          // Use optimized version for preview if significantly smaller
          if (optimizationResult.compressionRatio > 1.5) {
            URL.revokeObjectURL(mediaFile.preview);
            mediaFile.preview = URL.createObjectURL(optimizationResult.blob);
          }
        } catch (error) {
          console.error("Image optimization failed:", error);
          mediaFile.isOptimizing = false;
          // Fall back to original/converted file for upload
        }
      }

      return mediaFile;
    },
    []
  );

  const handleFiles = useCallback(
    async (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const remainingSlots = maxFiles - files.length;
      const filesToProcess = fileArray.slice(0, remainingSlots);

      if (filesToProcess.length === 0) return;

      // Process files in parallel
      const processedFiles = await Promise.all(
        filesToProcess.map((f) => processFile(f))
      );

      const updatedFiles = [...files, ...processedFiles];
      onFilesChange(updatedFiles);

      // Notify about first file's EXIF data (for auto-filling location)
      if (processedFiles.length > 0 && processedFiles[0].exif && onExifExtracted) {
        onExifExtracted(processedFiles[0].exif);
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
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <Loader2 className="h-6 w-6 text-saffron animate-spin" />
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

              {/* Optimization indicator */}
              {file.type === "image" && file.isOptimizing && (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-saffron/90 text-white text-xs flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Optimerer...
                </div>
              )}
              {file.type === "image" && file.optimizationInfo && file.optimizationInfo.compressionRatio > 1.2 && (
                <div 
                  className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-india-green/90 text-white text-xs flex items-center gap-1"
                  title={`${formatFileSize(file.optimizationInfo.originalSize)} → ${formatFileSize(file.optimizationInfo.optimizedSize)}`}
                >
                  <Zap className="h-3 w-3" />
                  {Math.round((1 - 1/file.optimizationInfo.compressionRatio) * 100)}% mindre
                </div>
              )}

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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

