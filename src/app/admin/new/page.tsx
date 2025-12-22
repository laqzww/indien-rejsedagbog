"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateFilename, getFileType } from "@/lib/upload";
import { uploadFilesInParallel, calculateOverallProgress, type UploadProgress, type UploadItem } from "@/lib/parallel-upload";
import { MediaUpload, type MediaFile } from "@/components/post/MediaUpload";
import { LocationPicker } from "@/components/post/LocationPicker";
import { TagInput } from "@/components/post/TagInput";
import { UploadProgressDisplay, type UploadStage } from "@/components/post/UploadProgress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Send, Loader2, MapPin, Tag, MessageSquare, AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { ExifData } from "@/lib/exif";

export default function NewPostPage() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
    files.forEach((f) => map.set(f.id, f.type));
    return map;
  }, [files]);

  // Check if any uploaded images are missing GPS data
  const hasImagesWithoutGps = useMemo(() => {
    return files.some(f => f.type === "image" && !f.hasGps);
  }, [files]);

  // Show location reminder if images without GPS and no manual location
  const showLocationReminder = hasImagesWithoutGps && !location && files.length > 0;

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
        message: "Forbereder opslag...",
        detail: "Henter brugeroplysninger",
      });
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Du er ikke logget ind");
      }

      // Find the earliest capture date from media
      const capturedAt = files
        .map((f) => f.exif?.capturedAt)
        .filter(Boolean)
        .sort((a, b) => a!.getTime() - b!.getTime())[0];

      // Create the post first
      setUploadStage({
        stage: "preparing",
        message: "Opretter opslag...",
      });

      const { data: post, error: postError } = await supabase
        .from("posts")
        .insert({
          author_id: user.id,
          body: body.trim(),
          tags: tags.length > 0 ? tags : null,
          lat: location?.lat || null,
          lng: location?.lng || null,
          location_name: location?.name || null,
          captured_at: capturedAt?.toISOString() || null,
          // Use client's local time to ensure correct timezone for travel blog
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (postError) throw postError;
      if (!post) throw new Error("Kunne ikke oprette opslaget");

      // STAGE 2: Upload media files in parallel
      if (files.length > 0) {
        setUploadStage({
          stage: "uploading",
          message: `Uploader ${files.length} ${files.length === 1 ? "fil" : "filer"}...`,
          detail: "Bruger parallel upload for hurtigere overførsel",
        });

        // Prepare upload items - use uploadBlob (compressed) when available
        const uploadItems: UploadItem[] = files.map((mediaFile, i) => {
          const filename = generateFilename(mediaFile.file.name, i);
          const type = getFileType(mediaFile.file);
          
          // Use .jpg extension for compressed images (not videos)
          // Use .mp4 extension for compressed videos
          let finalFilename = filename;
          if (type === "image" && mediaFile.uploadBlob !== mediaFile.file) {
            finalFilename = filename.replace(/\.[^.]+$/, ".jpg");
          } else if (type === "video" && mediaFile.compressedSize) {
            finalFilename = filename.replace(/\.[^.]+$/, ".mp4");
          }
          const path = `${user.id}/${post.id}/${finalFilename}`;
          
          return {
            id: mediaFile.id,
            file: mediaFile.uploadBlob || mediaFile.file,
            path,
            isVideo: type === "video", // Enable resumable upload for videos
          };
        });

        // Upload all files in parallel with progress tracking
        const uploadResults = await uploadFilesInParallel(uploadItems, {
          concurrency: 3,
          onProgress: (progress) => {
            setFileProgress(progress);
            setOverallProgress(calculateOverallProgress(progress));
          },
        });

        // STAGE 3: Save media records (batch insert)
        setUploadStage({
          stage: "saving",
          message: "Gemmer medieoplysninger...",
          detail: `Registrerer ${files.length} filer i databasen`,
        });

        // Prepare all media records for batch insert
        const mediaRecords = files.map((mediaFile, i) => {
          const storagePath = uploadResults.get(mediaFile.id);
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

          return {
            post_id: post.id,
            storage_path: storagePath,
            type,
            mime_type: mimeType,
            width,
            height,
            exif_data: mediaFile.exif?.raw ?? null,
            lat: mediaFile.exif?.lat ?? null,
            lng: mediaFile.exif?.lng ?? null,
            captured_at: mediaFile.exif?.capturedAt?.toISOString() ?? null,
            display_order: i,
          };
        });

        // Batch insert all media records at once
        const { error: mediaError } = await supabase
          .from("media")
          .insert(mediaRecords);

        if (mediaError) throw mediaError;
      }

      // STAGE 4: Complete
      setUploadStage({
        stage: "complete",
        message: "Opslag delt! 🎉",
        detail: "Sender dig til opslaget...",
      });

      // Small delay so user can see the success message
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Success! Navigate to the new post
      router.push(`/post/${post.id}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to create post:", err);
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

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-navy">Nyt opslag</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Media upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              📸 Billeder & Video
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MediaUpload
              files={files}
              onFilesChange={setFiles}
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
                  (udfyldt fra billede)
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
              <Send className="h-5 w-5" />
              Del opslag
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

