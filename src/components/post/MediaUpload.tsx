"use client";

import { useCallback, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Camera, X, Loader2, MapPinOff, Film } from "lucide-react";
import { isHeicFile, convertHeicToJpeg } from "@/lib/heic";
import { extractExifData, type ExifData } from "@/lib/exif";
import { compressImage, shouldCompress, formatFileSize } from "@/lib/image-compression";
import { MediaSortable, type SortableMediaItem } from "./MediaSortable";

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

  // Convert files to sortable items format
  const sortableItems: SortableMediaItem[] = useMemo(() => {
    return files.map((file) => ({
      id: file.id,
      type: file.type,
      preview: file.preview,
      isProcessing: file.isConverting,
    }));
  }, [files]);

  // Handle reordering from drag-and-drop
  const handleReorder = useCallback(
    (reorderedItems: SortableMediaItem[]) => {
      // Map back to MediaFile objects in the new order
      const reorderedFiles = reorderedItems
        .map((item) => files.find((f) => f.id === item.id))
        .filter((f): f is MediaFile => f !== undefined);
      onFilesChange(reorderedFiles);
    },
    [files, onFilesChange]
  );

  const processFile = useCallback(
    async (file: File): Promise<MediaFile> => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const type = file.type.startsWith("video/") ? "video" : "image";
      const isHeic = isHeicFile(file);

      // Create initial entry
      const mediaFile: MediaFile = {
        id,
        file,
        preview: "",
        type,
        isConverting: isHeic || (type === "image" && shouldCompress(file)),
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
        // Video - no compression, use original file as-is
        mediaFile.preview = URL.createObjectURL(file);
        mediaFile.uploadBlob = file;
      }

      mediaFile.isConverting = false;
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

      // Process all files in parallel (now that videos don't need heavy processing)
      const processedFiles = await Promise.all(
        filesToProcess.map((f) => processFile(f))
      );

      // Update with processed files
      const newFileList = [...files, ...processedFiles];
      onFilesChange(newFileList);

      // Notify about first file's EXIF data (for auto-filling location)
      const firstImageWithExif = processedFiles.find(f => f.exif);
      if (firstImageWithExif?.exif && onExifExtracted) {
        onExifExtracted(firstImageWithExif.exif);
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

      {/* Sortable preview grid */}
      {files.length > 0 && (
        <MediaSortable
          items={sortableItems}
          onReorder={handleReorder}
          disabled={disabled}
          renderExtraOverlay={(item, index) => {
            const file = files.find((f) => f.id === item.id);
            if (!file) return null;
            
            return (
              <>
                {/* Processing overlay */}
                {file.isConverting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/90 rounded-lg z-10">
                    <Loader2 className="h-6 w-6 text-saffron animate-spin" />
                    <div className="mt-2 text-xs text-muted-foreground">
                      Forbereder...
                    </div>
                  </div>
                )}

                {/* Video icon overlay */}
                {file.type === "video" && !file.isConverting && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Film className="h-8 w-8 text-white/80 drop-shadow-lg" />
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={() => removeFile(file.id)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-600 transition-all z-20"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* EXIF GPS indicator */}
                {file.type === "image" && !file.isConverting && (
                  file.hasGps ? (
                    <div className="absolute top-10 right-2 px-1.5 py-0.5 rounded bg-india-green text-white text-xs z-10">
                      GPS
                    </div>
                  ) : (
                    <div className="absolute top-10 right-2 p-1 rounded bg-amber-500 text-white z-10" title="Ingen GPS-data fundet">
                      <MapPinOff className="h-3 w-3" />
                    </div>
                  )
                )}

                {/* Compression indicator (only for images, not on cover) */}
                {file.type === "image" && file.compressedSize && file.originalSize && file.compressedSize < file.originalSize && index !== 0 && (
                  <div 
                    className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-india-green/90 text-white text-xs z-10"
                    title={`Komprimeret: ${formatFileSize(file.originalSize)} → ${formatFileSize(file.compressedSize)}`}
                  >
                    -{Math.round((1 - file.compressedSize / file.originalSize) * 100)}%
                  </div>
                )}
              </>
            );
          }}
        />
      )}
    </div>
  );
}
