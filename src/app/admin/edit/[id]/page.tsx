"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia, getFileType, deleteMedia, getMediaUrl } from "@/lib/upload";
import { isHeicFile, convertHeicToJpeg } from "@/lib/heic";
import { MediaUpload, type MediaFile } from "@/components/post/MediaUpload";
import { LocationPicker } from "@/components/post/LocationPicker";
import { TagInput } from "@/components/post/TagInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, MapPin, Tag, MessageSquare, AlertTriangle, X, ImageIcon, Film } from "lucide-react";
import Link from "next/link";
import type { ExifData } from "@/lib/exif";

// Type for existing media from the database
interface ExistingMediaItem {
  id: string;
  storage_path: string;
  type: string;
  width: number | null;
  height: number | null;
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
  
  // Existing media from the database
  const [existingMedia, setExistingMedia] = useState<ExistingMediaItem[]>([]);
  const [mediaToDelete, setMediaToDelete] = useState<ExistingMediaItem[]>([]);
  
  // New files to upload
  const [newFiles, setNewFiles] = useState<MediaFile[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notAuthorized, setNotAuthorized] = useState(false);

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
        
        // Sort media by display_order
        const sortedMedia = [...(post.media || [])].sort(
          (a, b) => a.display_order - b.display_order
        );
        setExistingMedia(sortedMedia);
        
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
    setExistingMedia(prev => prev.filter(m => m.id !== media.id));
    setMediaToDelete(prev => [...prev, media]);
  };

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

      // Update the post
      const { error: updateError } = await supabase
        .from("posts")
        .update({
          body: body.trim(),
          tags: tags.length > 0 ? tags : null,
          lat: location?.lat || null,
          lng: location?.lng || null,
          location_name: location?.name || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId)
        .eq("author_id", user.id); // Extra safety check

      if (updateError) throw updateError;

      // Delete removed media from storage and database
      for (const media of mediaToDelete) {
        try {
          await deleteMedia(media.storage_path);
        } catch (err) {
          console.error("Failed to delete media from storage:", err);
          // Continue anyway - the file might already be deleted
        }
        await supabase.from("media").delete().eq("id", media.id);
      }

      // Get current highest display_order
      const startOrder = existingMedia.length;

      // Upload new media files (using optimized versions when available)
      const totalFiles = newFiles.length;
      for (let i = 0; i < newFiles.length; i++) {
        if (totalFiles > 0) {
          setUploadProgress({ current: i + 1, total: totalFiles });
        }
        const mediaFile = newFiles[i];
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

        const filename = `${Date.now()}-${startOrder + i}.${extension}`;
        const result = await uploadMedia(fileToUpload, user.id, postId, filename);

        // Insert media record (EXIF data from original file is preserved)
        await supabase.from("media").insert({
          post_id: postId,
          storage_path: result.path,
          type,
          mime_type: fileToUpload instanceof Blob ? fileToUpload.type : mediaFile.file.type || null,
          width: mediaFile.exif?.width ?? null,
          height: mediaFile.exif?.height ?? null,
          exif_data: mediaFile.exif?.raw ?? null,
          lat: mediaFile.exif?.lat ?? null,
          lng: mediaFile.exif?.lng ?? null,
          captured_at: mediaFile.exif?.capturedAt?.toISOString() ?? null,
          display_order: startOrder + i,
        });
      }

      // Success! Navigate back to the post
      router.push(`/post/${postId}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to update post:", err);
      setError(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
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
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Existing media */}
        {existingMedia.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                📸 Eksisterende billeder & video
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {existingMedia.map((media) => (
                  <div
                    key={media.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
                  >
                    {media.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getMediaUrl(media.storage_path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="relative w-full h-full bg-navy/10 flex items-center justify-center">
                        <Film className="h-12 w-12 text-navy/40" />
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveExisting(media)}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                      type="button"
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </button>

                    {/* Type indicator */}
                    <div className="absolute bottom-2 left-2 p-1 rounded bg-black/50">
                      {media.type === "video" ? (
                        <Film className="h-3 w-3 text-white" />
                      ) : (
                        <ImageIcon className="h-3 w-3 text-white" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
                : "Gemmer..."}
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
