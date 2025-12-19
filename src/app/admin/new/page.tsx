"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia, getFileType } from "@/lib/upload";
import { isHeicFile, convertHeicToJpeg } from "@/lib/heic";
import { MediaUpload, type MediaFile } from "@/components/post/MediaUpload";
import { LocationPicker } from "@/components/post/LocationPicker";
import { TagInput } from "@/components/post/TagInput";
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
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    
    if (!body.trim()) {
      setError("Skriv venligst noget tekst");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      
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

      // Create the post
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
        })
        .select("id")
        .single();

      if (postError) throw postError;
      if (!post) throw new Error("Kunne ikke oprette opslaget");

      // Upload media files (using optimized versions when available)
      const totalFiles = files.length;
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: totalFiles });
        const mediaFile = files[i];
        const type = getFileType(mediaFile.file);
        
        // Determine the file to upload and its extension
        let fileToUpload: File | Blob;
        let extension: string;
        
        if (type === "video") {
          // Videos are not optimized
          fileToUpload = mediaFile.file;
          extension = mediaFile.file.name.split(".").pop()?.toLowerCase() || "mp4";
        } else if (mediaFile.optimizedBlob) {
          // Use optimized version (WebP or JPEG)
          fileToUpload = mediaFile.optimizedBlob;
          extension = mediaFile.optimizedBlob.type === "image/webp" ? "webp" : "jpg";
        } else if (isHeicFile(mediaFile.file) && mediaFile.displayBlob) {
          // Fallback: HEIC converted to JPEG
          fileToUpload = mediaFile.displayBlob;
          extension = "jpg";
        } else if (isHeicFile(mediaFile.file)) {
          // Fallback: Convert HEIC now
          fileToUpload = await convertHeicToJpeg(mediaFile.file);
          extension = "jpg";
        } else {
          // Fallback: Original file
          fileToUpload = mediaFile.file;
          extension = mediaFile.file.name.split(".").pop()?.toLowerCase() || "jpg";
        }

        const filename = `${Date.now()}-${i}.${extension}`;
        const result = await uploadMedia(fileToUpload, user.id, post.id, filename);

        // Insert media record (EXIF data from original file is preserved)
        await supabase.from("media").insert({
          post_id: post.id,
          storage_path: result.path,
          type,
          mime_type: fileToUpload instanceof Blob ? fileToUpload.type : mediaFile.file.type || null,
          width: mediaFile.exif?.width ?? null,
          height: mediaFile.exif?.height ?? null,
          exif_data: mediaFile.exif?.raw ?? null,
          lat: mediaFile.exif?.lat ?? null,
          lng: mediaFile.exif?.lng ?? null,
          captured_at: mediaFile.exif?.capturedAt?.toISOString() ?? null,
          display_order: i,
        });
      }

      // Success! Navigate to the new post
      router.push(`/post/${post.id}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to create post:", err);
      setError(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
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

        {/* Error message */}
        {error && (
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
              {uploadProgress 
                ? `Uploader ${uploadProgress.current}/${uploadProgress.total}...` 
                : "Sender..."}
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

