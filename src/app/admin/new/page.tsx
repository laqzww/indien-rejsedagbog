"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia, generateFilename, getFileType } from "@/lib/upload";
import { isHeicFile, convertHeicToJpeg } from "@/lib/heic";
import { MediaUpload, type MediaFile } from "@/components/post/MediaUpload";
import { LocationPicker } from "@/components/post/LocationPicker";
import { TagInput } from "@/components/post/TagInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Send, Loader2, MapPin, Tag, MessageSquare } from "lucide-react";
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

      // Upload media files
      for (let i = 0; i < files.length; i++) {
        const mediaFile = files[i];
        const filename = generateFilename(mediaFile.file.name, i);
        const type = getFileType(mediaFile.file);

        // For HEIC files, also upload JPEG version
        let storagePath: string;
        
        if (isHeicFile(mediaFile.file)) {
          // Upload original HEIC
          await uploadMedia(mediaFile.file, user.id, post.id, filename);
          
          // Upload JPEG display version
          if (mediaFile.displayBlob) {
            const jpegFilename = filename.replace(/\.(heic|heif)$/i, ".jpg");
            const result = await uploadMedia(
              mediaFile.displayBlob,
              user.id,
              post.id,
              jpegFilename
            );
            storagePath = result.path;
          } else {
            // Convert now if we don't have it
            const jpegBlob = await convertHeicToJpeg(mediaFile.file);
            const jpegFilename = filename.replace(/\.(heic|heif)$/i, ".jpg");
            const result = await uploadMedia(jpegBlob, user.id, post.id, jpegFilename);
            storagePath = result.path;
          }
        } else {
          const result = await uploadMedia(mediaFile.file, user.id, post.id, filename);
          storagePath = result.path;
        }

        // Insert media record
        await supabase.from("media").insert({
          post_id: post.id,
          storage_path: storagePath,
          type,
          mime_type: mediaFile.file.type || null,
          width: mediaFile.exif?.width || null,
          height: mediaFile.exif?.height || null,
          exif_data: mediaFile.exif?.raw || null,
          lat: mediaFile.exif?.lat || null,
          lng: mediaFile.exif?.lng || null,
          captured_at: mediaFile.exif?.capturedAt?.toISOString() || null,
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
        <Card>
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
          <CardContent>
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
              Sender...
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

