"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateFilename, getFileType, deleteMedia, getMediaUrl } from "@/lib/upload";
import { uploadFilesInParallel, calculateOverallProgress, type UploadProgress, type UploadItem, type ParallelUploadResult } from "@/lib/parallel-upload";
import { MediaUpload, type MediaFile } from "@/components/post/MediaUpload";
import { MediaSortable, type SortableMediaItem } from "@/components/post/MediaSortable";
import { LocationPicker } from "@/components/post/LocationPicker";
import { TagInput } from "@/components/post/TagInput";
import { UploadProgressDisplay, type UploadStage } from "@/components/post/UploadProgress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, MapPin, Tag, MessageSquare, AlertTriangle, X, Calendar } from "lucide-react";
import Link from "next/link";
import type { ExifData } from "@/lib/exif";

// Helper to format date as Danish readable string
function formatDateDanish(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.round((today.getTime() - compareDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "I dag";
  if (diffDays === 1) return "I går";
  if (diffDays === 2) return "For 2 dage siden";
  
  return date.toLocaleDateString("da-DK", { 
    day: "numeric", 
    month: "short",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined
  });
}

// Helper to get date string for input (YYYY-MM-DD)
function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Type for existing media from the database
interface ExistingMediaItem {
  id: string;
  storage_path: string;
  type: string;
  width: number | null;
  height: number | null;
  display_order: number;
}

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  
  // Date picker state for retrospective posts
  const [postDate, setPostDate] = useState<Date>(() => new Date());
  const [originalPostDate, setOriginalPostDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  
  // Existing media from the database
  const [existingMedia, setExistingMedia] = useState<ExistingMediaItem[]>([]);
  const [mediaToDelete, setMediaToDelete] = useState<ExistingMediaItem[]>([]);
  
  // Ref to always have access to the latest existingMedia value
  // This avoids stale closure issues in handleSubmit
  const existingMediaRef = useRef<ExistingMediaItem[]>([]);

  // Same idea for delete list: avoid missing "last click before save"
  const mediaToDeleteRef = useRef<ExistingMediaItem[]>([]);
  
  // Keep the ref in sync with the state
  useEffect(() => {
    existingMediaRef.current = existingMedia;
  }, [existingMedia]);

  useEffect(() => {
    mediaToDeleteRef.current = mediaToDelete;
  }, [mediaToDelete]);
  
  // Close date picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    }
    
    if (showDatePicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDatePicker]);
  
  // Check if using a custom date (different from original)
  const isCustomDate = useMemo(() => {
    if (!originalPostDate) return false;
    const original = new Date(originalPostDate);
    original.setHours(0, 0, 0, 0);
    const selected = new Date(postDate);
    selected.setHours(0, 0, 0, 0);
    return original.getTime() !== selected.getTime();
  }, [postDate, originalPostDate]);
  
  // New files to upload
  const [newFiles, setNewFiles] = useState<MediaFile[]>([]);
  
  // Convert existing media to sortable items format
  const existingSortableItems: SortableMediaItem[] = useMemo(() => {
    return existingMedia.map((media) => ({
      id: media.id,
      type: media.type as "image" | "video",
      preview: getMediaUrl(media.storage_path),
    }));
  }, [existingMedia]);

  // Handle reordering of existing media
  const handleExistingMediaReorder = useCallback(
    (reorderedItems: SortableMediaItem[]) => {
      /**
       * IMPORTANT:
       * We must update the ref synchronously (outside setState), otherwise a fast
       * "reorder → click save" can submit the *previous* order because React
       * hasn't flushed the state update yet.
       */
      const currentMedia = existingMediaRef.current;
      const reorderedMedia = reorderedItems
        .map((item) => currentMedia.find((m) => m.id === item.id))
        .filter((m): m is ExistingMediaItem => m !== undefined);

      existingMediaRef.current = reorderedMedia;
      setExistingMedia(reorderedMedia);
    },
    []
  );
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notAuthorized, setNotAuthorized] = useState(false);
  
  // Upload progress state
  const [uploadStage, setUploadStage] = useState<UploadStage>({
    stage: "preparing",
    message: "Forbereder...",
  });
  const [fileProgress, setFileProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [overallProgress, setOverallProgress] = useState<{
    completed: number;
    total: number;
    percentage: number;
  } | undefined>();
  
  // Create a map of file types for the progress display
  const fileTypes = useMemo(() => {
    const map = new Map<string, "image" | "video">();
    newFiles.forEach((f) => map.set(f.id, f.type));
    return map;
  }, [newFiles]);

  // Load existing post data
  useEffect(() => {
    async function loadPost() {
      try {
        const supabase = createClient();
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setNotAuthorized(true);
          setIsLoading(false);
          return;
        }

        // Fetch post with media
        const { data: post, error: postError } = await supabase
          .from("posts")
          .select(`
            *,
            media (*)
          `)
          .eq("id", postId)
          .single();

        if (postError || !post) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }

        // Check if user is the author
        if (post.author_id !== user.id) {
          setNotAuthorized(true);
          setIsLoading(false);
          return;
        }

        // Populate form with existing data
        setBody(post.body);
        setTags(post.tags || []);
        if (post.lat && post.lng) {
          setLocation({
            lat: post.lat,
            lng: post.lng,
            name: post.location_name || "",
          });
        }
        
        // Set post date from created_at
        if (post.created_at) {
          const createdDate = new Date(post.created_at);
          setPostDate(createdDate);
          setOriginalPostDate(createdDate);
        }
        
        // Sort media by display_order (handle null/undefined for legacy data)
        const sortedMedia = [...(post.media || [])].sort(
          (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
        );
        // Ensure all media have a display_order value for later comparison
        const mediaWithOrder = sortedMedia.map((m, idx) => ({
          ...m,
          display_order: m.display_order ?? idx,
        }));
        setExistingMedia(mediaWithOrder);
        existingMediaRef.current = mediaWithOrder; // Also update ref immediately
        
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load post:", err);
        setError("Kunne ikke indlæse opslaget");
        setIsLoading(false);
      }
    }

    loadPost();
  }, [postId]);

  // Check if any uploaded images are missing GPS data
  const hasImagesWithoutGps = useMemo(() => {
    return newFiles.some(f => f.type === "image" && !f.hasGps);
  }, [newFiles]);

  // Show location reminder if images without GPS and no manual location
  const showLocationReminder = hasImagesWithoutGps && !location && newFiles.length > 0;

  // Handle EXIF data from uploaded files
  const handleExifExtracted = useCallback((exif: ExifData) => {
    // Auto-fill location if we have GPS and no location set
    if (exif.lat && exif.lng && !location) {
      setLocation({
        lat: exif.lat,
        lng: exif.lng,
        name: "", // Will be reverse geocoded
      });
    }
  }, [location]);

  // Remove existing media
  const handleRemoveExisting = (media: ExistingMediaItem) => {
    // Update refs synchronously to avoid "remove → save" races.
    const filtered = existingMediaRef.current.filter((m) => m.id !== media.id);
    existingMediaRef.current = filtered;
    setExistingMedia(filtered);

    const nextDelete = [...mediaToDeleteRef.current, media];
    mediaToDeleteRef.current = nextDelete;
    setMediaToDelete(nextDelete);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double-submit
    if (isSubmitting) return;
    
    if (!body.trim()) {
      setError("Skriv venligst noget tekst");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFileProgress(new Map());
    setOverallProgress(undefined);

    try {
      const supabase = createClient();
      
      // STAGE 1: Preparing
      setUploadStage({
        stage: "preparing",
        message: "Forbereder ændringer...",
        detail: "Henter brugeroplysninger",
      });
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Du er ikke logget ind");
      }

      // Update the post
      setUploadStage({
        stage: "preparing",
        message: "Opdaterer opslag...",
      });

      // Calculate created_at if date was changed
      // If user changed the date, use selected date with original time-of-day
      // Otherwise keep the original created_at
      let newCreatedAt: string | undefined;
      if (isCustomDate && originalPostDate) {
        const originalTime = originalPostDate;
        const newDate = new Date(postDate);
        newDate.setHours(
          originalTime.getHours(),
          originalTime.getMinutes(),
          originalTime.getSeconds(),
          originalTime.getMilliseconds()
        );
        newCreatedAt = newDate.toISOString();
      }

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          body: body.trim(),
          tags: tags.length > 0 ? tags : null,
          lat: location?.lat || null,
          lng: location?.lng || null,
          location_name: location?.name || null,
          updated_at: new Date().toISOString(),
          // Only update created_at if date was changed
          ...(newCreatedAt && { created_at: newCreatedAt }),
        })
        .eq("id", postId)
        .eq("author_id", user.id); // Extra safety check

      if (updateError) throw updateError;

      // Delete removed media from storage and database
      const currentMediaToDelete = mediaToDeleteRef.current;
      if (currentMediaToDelete.length > 0) {
        setUploadStage({
          stage: "preparing",
          message: "Sletter fjernede billeder...",
          detail: `${currentMediaToDelete.length} ${currentMediaToDelete.length === 1 ? "fil" : "filer"}`,
        });

        for (const media of currentMediaToDelete) {
          try {
            await deleteMedia(media.storage_path);
          } catch (err) {
            console.error("Failed to delete media from storage:", err);
            // Continue anyway - the file might already be deleted
          }
          await supabase.from("media").delete().eq("id", media.id);
        }
      }

      // Update display_order for existing media (if needed).
      // Use ref to ensure we have the latest order.
      const currentExistingMedia = existingMediaRef.current;
      const needsOrderUpdate =
        currentExistingMedia.length > 0 &&
        currentExistingMedia.some((m, idx) => m.display_order !== idx);

      if (needsOrderUpdate) {
        setUploadStage({
          stage: "preparing",
          message: "Opdaterer medie-rækkefølge...",
          detail: `${currentExistingMedia.length} ${currentExistingMedia.length === 1 ? "fil" : "filer"}`,
        });

        // Update each media item's display_order sequentially.
        // We verify each update by selecting the updated row.
        let updateCount = 0;
        for (let i = 0; i < currentExistingMedia.length; i++) {
          const media = currentExistingMedia[i];
          const newOrder = i;

          // Skip if order is already correct
          if (media.display_order === newOrder) {
            updateCount++; // Count as success - no change needed
            continue;
          }

          // Update the display_order
          const { data: updated, error: updateError } = await supabase
            .from("media")
            .update({ display_order: newOrder })
            .eq("id", media.id)
            .select("id, display_order");

          if (updateError) {
            console.error(`Failed to update media ${media.id} order:`, updateError);
            throw new Error(
              `Kunne ikke opdatere medie-rækkefølge: ${updateError.message}`
            );
          }

          // Check if update affected any rows (empty array means RLS blocked it)
          if (!updated || updated.length === 0) {
            console.error(
              `Media order update returned no rows for ${media.id}. RLS policy likely blocking UPDATE.`
            );
            throw new Error(
              "Kunne ikke opdatere medie-rækkefølge. Databasen tillader ikke opdatering af medie. Kontakt administrator."
            );
          }

          // Verify the update actually set the correct value
          if (updated[0].display_order !== newOrder) {
            console.error(
              `Media order update verification failed for ${media.id}:`,
              { expected: newOrder, got: updated[0].display_order }
            );
            throw new Error(
              "Medie-rækkefølgen blev ikke gemt korrekt. Uventet database-adfærd."
            );
          }

          updateCount++;
        }

        console.log(`Successfully updated display_order for ${updateCount}/${currentExistingMedia.length} media items`);
      }

      // Get current highest display_order
      const startOrder = currentExistingMedia.length;

      // Track upload result for partial failure reporting
      let uploadResult: ParallelUploadResult | null = null;

      // STAGE 2: Upload new media files in parallel
      if (newFiles.length > 0) {
        setUploadStage({
          stage: "uploading",
          message: `Uploader ${newFiles.length} ${newFiles.length === 1 ? "fil" : "filer"}...`,
          detail: "Bruger parallel upload for hurtigere overførsel",
        });

        // Prepare upload items - use uploadBlob (compressed) when available
        // Also include thumbnail uploads for videos
        const uploadItems: UploadItem[] = [];
        const thumbnailMap = new Map<string, string>(); // mediaFile.id -> thumbnail upload id
        
        newFiles.forEach((mediaFile, i) => {
          const filename = generateFilename(mediaFile.file.name, startOrder + i);
          const type = getFileType(mediaFile.file);
          
          // Use .jpg extension for compressed images (not videos)
          // Use .mp4 extension for compressed videos
          let finalFilename = filename;
          if (type === "image" && mediaFile.uploadBlob !== mediaFile.file) {
            finalFilename = filename.replace(/\.[^.]+$/, ".jpg");
          } else if (type === "video" && mediaFile.compressedSize) {
            finalFilename = filename.replace(/\.[^.]+$/, ".mp4");
          }
          const path = `${user.id}/${postId}/${finalFilename}`;
          
          uploadItems.push({
            id: mediaFile.id,
            file: mediaFile.uploadBlob || mediaFile.file,
            path,
            isVideo: type === "video", // Enable resumable upload for videos
          });
          
          // Add thumbnail upload for videos
          if (type === "video" && mediaFile.thumbnailBlob) {
            const thumbId = `${mediaFile.id}-thumb`;
            const thumbFilename = finalFilename.replace(/\.[^.]+$/, "-thumb.jpg");
            const thumbPath = `${user.id}/${postId}/${thumbFilename}`;
            
            uploadItems.push({
              id: thumbId,
              file: mediaFile.thumbnailBlob,
              path: thumbPath,
              isVideo: false,
            });
            
            thumbnailMap.set(mediaFile.id, thumbId);
          }
        });

        // Upload all files in parallel with progress tracking
        uploadResult = await uploadFilesInParallel(uploadItems, {
          onProgress: (progress) => {
            setFileProgress(progress);
            setOverallProgress(calculateOverallProgress(progress));
          },
        });

        // Check for failed uploads
        if (uploadResult.hasFailures) {
          const failedCount = uploadResult.failed.size;
          const successCount = uploadResult.results.size;
          
          // If ALL uploads failed, throw an error
          if (successCount === 0) {
            const firstError = Array.from(uploadResult.failed.values())[0];
            throw new Error(`Alle uploads fejlede: ${firstError}`);
          }
          
          // Log which files failed
          console.warn(`[Upload] ${failedCount} file(s) failed to upload:`, 
            Array.from(uploadResult.failed.entries())
          );
        }

        // STAGE 3: Save media records (batch insert)
        // Only save records for files that were successfully uploaded
        const successfulFiles = newFiles.filter(f => uploadResult!.results.has(f.id));
        
        if (successfulFiles.length === 0 && newFiles.length > 0) {
          throw new Error("Ingen filer blev uploadet succesfuldt");
        }
        
        if (successfulFiles.length > 0) {
          setUploadStage({
            stage: "saving",
            message: "Gemmer medieoplysninger...",
            detail: `Registrerer ${successfulFiles.length} filer i databasen`,
          });

          // Prepare all media records for batch insert
          const mediaRecords = successfulFiles.map((mediaFile, i) => {
            const storagePath = uploadResult!.results.get(mediaFile.id);
            if (!storagePath) {
              throw new Error(`Upload failed for file ${i + 1}`);
            }

            const type = getFileType(mediaFile.file);
            
            // Use compressed dimensions if available, otherwise fall back to EXIF
            const width = mediaFile.compressedWidth ?? mediaFile.exif?.width ?? null;
            const height = mediaFile.compressedHeight ?? mediaFile.exif?.height ?? null;

            // Determine mime_type: JPEG for compressed images, original for videos
            const mimeType = type === "video" 
              ? mediaFile.file.type 
              : "image/jpeg";

            // Get thumbnail path for videos
            let thumbnailPath: string | null = null;
            if (type === "video") {
              const thumbId = thumbnailMap.get(mediaFile.id);
              if (thumbId) {
                thumbnailPath = uploadResult!.results.get(thumbId) ?? null;
              }
            }

            return {
              post_id: postId,
              storage_path: storagePath,
              thumbnail_path: thumbnailPath,
              type,
              mime_type: mimeType,
              width,
              height,
              exif_data: mediaFile.exif?.raw ?? null,
              lat: mediaFile.exif?.lat ?? null,
              lng: mediaFile.exif?.lng ?? null,
              captured_at: mediaFile.exif?.capturedAt?.toISOString() ?? null,
              display_order: startOrder + i,
            };
          });

          // Batch insert all media records at once
          const { error: mediaError } = await supabase
            .from("media")
            .insert(mediaRecords);

          if (mediaError) throw mediaError;
        }
      }

      // STAGE 4: Complete
      const hasPartialFailure = newFiles.length > 0 && uploadResult?.hasFailures;
      setUploadStage({
        stage: "complete",
        message: hasPartialFailure ? "Ændringer gemt (med nogle fejl) ⚠️" : "Ændringer gemt! 🎉",
        detail: hasPartialFailure 
          ? `${uploadResult?.failed.size ?? 0} filer kunne ikke uploades` 
          : "Sender dig til opslaget...",
      });

      // Small delay so user can see the success message
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Success! Navigate back to the post
      router.push(`/post/${postId}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to update post:", err);
      setUploadStage({
        stage: "error",
        message: "Noget gik galt",
        detail: err instanceof Error ? err.message : "Ukendt fejl",
      });
      setError(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-saffron" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-navy mb-2">Opslag ikke fundet</h1>
          <p className="text-muted-foreground mb-4">Dette opslag findes ikke eller er blevet slettet.</p>
          <Link href="/admin">
            <Button>Tilbage til admin</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (notAuthorized) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-navy mb-2">Ikke autoriseret</h1>
          <p className="text-muted-foreground mb-4">Du har ikke tilladelse til at redigere dette opslag.</p>
          <Link href="/">
            <Button>Tilbage til forsiden</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/post/${postId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-navy">Rediger opslag</h1>
        
        {/* Date picker badge */}
        <div className="relative ml-auto" ref={datePickerRef}>
          <button
            type="button"
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
              transition-all duration-200 hover:scale-105
              ${isCustomDate 
                ? "bg-saffron/20 text-saffron-dark border border-saffron/30" 
                : "bg-muted text-muted-foreground hover:bg-muted/80"
              }
            `}
            disabled={isSubmitting}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDateDanish(postDate)}</span>
          </button>
          
          {/* Date picker popover */}
          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-lg shadow-lg border p-3 min-w-[200px]">
              <p className="text-xs text-muted-foreground mb-2">Vælg dato for opslaget</p>
              <input
                type="date"
                value={toDateInputValue(postDate)}
                max={toDateInputValue(new Date())}
                onChange={(e) => {
                  if (e.target.value) {
                    // Parse date and set to noon to avoid timezone issues
                    const [year, month, day] = e.target.value.split("-").map(Number);
                    const newDate = new Date(year, month - 1, day, 12, 0, 0);
                    setPostDate(newDate);
                  }
                }}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-saffron"
              />
              {isCustomDate && originalPostDate && (
                <button
                  type="button"
                  onClick={() => {
                    setPostDate(originalPostDate);
                    setShowDatePicker(false);
                  }}
                  className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Nulstil til original dato
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Existing media with sortable */}
        {existingMedia.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                📸 Eksisterende billeder & video
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MediaSortable
                items={existingSortableItems}
                onReorder={handleExistingMediaReorder}
                disabled={isSubmitting}
                renderExtraOverlay={(item) => {
                  const media = existingMedia.find((m) => m.id === item.id);
                  if (!media) return null;
                  
                  return (
                    <button
                      onClick={() => handleRemoveExisting(media)}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-600 transition-all z-20"
                      type="button"
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  );
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* New media upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              ➕ Tilføj flere billeder & video
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MediaUpload
              files={newFiles}
              onFilesChange={setNewFiles}
              onExifExtracted={handleExifExtracted}
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>

        {/* Text */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-saffron" />
              Hvad sker der?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Fortæl om jeres oplevelse... Hvad ser I? Hvad smager I? Hvordan føles det?"
              className="min-h-[150px] text-base"
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>

        {/* Location */}
        <Card className={showLocationReminder ? "ring-2 ring-amber-400 ring-offset-2" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-india-green" />
              Sted
              {location && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  (udfyldt)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Warning when images lack GPS */}
            {showLocationReminder && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Ingen GPS-data i billedet</p>
                  <p className="text-amber-700 mt-0.5">
                    Vælg venligst en lokation manuelt, så andre kan se hvor I er! 📍
                  </p>
                </div>
              </div>
            )}
            <LocationPicker
              value={location}
              onChange={setLocation}
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Tag className="h-5 w-5 text-navy" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TagInput
              value={tags}
              onChange={setTags}
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>

        {/* Upload progress */}
        {isSubmitting && (
          <UploadProgressDisplay
            stage={uploadStage}
            fileProgress={fileProgress}
            overallProgress={overallProgress}
            fileTypes={fileTypes}
          />
        )}

        {/* Error message */}
        {error && !isSubmitting && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          size="xl"
          className="w-full gap-2"
          disabled={isSubmitting || !body.trim()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {uploadStage.stage === "uploading" && overallProgress
                ? `Uploader... ${overallProgress.percentage}%`
                : uploadStage.message}
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              Gem ændringer
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
