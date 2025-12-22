"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateVideoThumbnail } from "@/lib/video-thumbnail";
import { getMediaUrl } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Play, Loader2, Check, AlertTriangle, Film, RefreshCw } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface VideoMedia {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  post_id: string;
}

interface ProcessingState {
  status: "pending" | "processing" | "success" | "error";
  message?: string;
}

export default function VideoThumbnailsPage() {
  const [videos, setVideos] = useState<VideoMedia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingStates, setProcessingStates] = useState<Map<string, ProcessingState>>(new Map());
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  // Load videos without thumbnails
  const loadVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from("media")
        .select("id, storage_path, thumbnail_path, post_id")
        .eq("type", "video")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      setVideos(data || []);
    } catch (error) {
      console.error("Failed to load videos:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Generate thumbnail for a single video
  const generateThumbnailForVideo = async (video: VideoMedia): Promise<boolean> => {
    setProcessingStates(prev => new Map(prev).set(video.id, { status: "processing" }));
    
    try {
      const supabase = createClient();
      
      // Get current user for the upload path
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      // Fetch the video file
      const videoUrl = getMediaUrl(video.storage_path);
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error("Failed to fetch video");
      
      const videoBlob = await response.blob();
      const videoFile = new File([videoBlob], "video.mp4", { type: videoBlob.type });
      
      // Generate thumbnail
      const thumbnail = await generateVideoThumbnail(videoFile);
      
      // Upload thumbnail
      const thumbFilename = video.storage_path.replace(/\.[^.]+$/, "-thumb.jpg");
      
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(thumbFilename, thumbnail.blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      
      if (uploadError) throw uploadError;
      
      // Update database
      const { error: updateError } = await supabase
        .from("media")
        .update({ thumbnail_path: thumbFilename })
        .eq("id", video.id);
      
      if (updateError) throw updateError;
      
      setProcessingStates(prev => new Map(prev).set(video.id, { 
        status: "success", 
        message: "Thumbnail genereret!" 
      }));
      
      // Update local state
      setVideos(prev => prev.map(v => 
        v.id === video.id ? { ...v, thumbnail_path: thumbFilename } : v
      ));
      
      return true;
    } catch (error) {
      console.error(`Failed to generate thumbnail for ${video.id}:`, error);
      setProcessingStates(prev => new Map(prev).set(video.id, { 
        status: "error", 
        message: error instanceof Error ? error.message : "Ukendt fejl" 
      }));
      return false;
    }
  };

  // Generate thumbnails for all videos without them
  const generateAllThumbnails = async () => {
    const videosWithoutThumbs = videos.filter(v => !v.thumbnail_path);
    if (videosWithoutThumbs.length === 0) return;
    
    setIsProcessingAll(true);
    
    for (const video of videosWithoutThumbs) {
      await generateThumbnailForVideo(video);
      // Small delay between videos to avoid overwhelming the browser
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsProcessingAll(false);
  };

  const videosWithoutThumbs = videos.filter(v => !v.thumbnail_path);
  const videosWithThumbs = videos.filter(v => v.thumbnail_path);

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-navy">Video Thumbnails</h1>
          <p className="text-sm text-muted-foreground">
            Generer thumbnails for videoer, så de vises hurtigt i feed
          </p>
        </div>
        <Button 
          onClick={loadVideos} 
          variant="outline" 
          size="icon"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-saffron" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-navy">{videos.length}</div>
                  <div className="text-sm text-muted-foreground">Videoer i alt</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-india-green">{videosWithThumbs.length}</div>
                  <div className="text-sm text-muted-foreground">Med thumbnail</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-saffron">{videosWithoutThumbs.length}</div>
                  <div className="text-sm text-muted-foreground">Mangler thumbnail</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generate all button */}
          {videosWithoutThumbs.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Generer alle manglende thumbnails</h3>
                    <p className="text-sm text-muted-foreground">
                      Dette kan tage et stykke tid afhængigt af antallet af videoer
                    </p>
                  </div>
                  <Button 
                    onClick={generateAllThumbnails}
                    disabled={isProcessingAll}
                    className="gap-2"
                  >
                    {isProcessingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Genererer...
                      </>
                    ) : (
                      <>
                        <Film className="h-4 w-4" />
                        Generer alle ({videosWithoutThumbs.length})
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Videos without thumbnails */}
          {videosWithoutThumbs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-saffron" />
                  Videoer uden thumbnail ({videosWithoutThumbs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {videosWithoutThumbs.map((video) => {
                    const state = processingStates.get(video.id);
                    return (
                      <div 
                        key={video.id} 
                        className="relative aspect-video bg-muted rounded-lg overflow-hidden group"
                      >
                        <video
                          src={`${getMediaUrl(video.storage_path)}#t=0.001`}
                          preload="metadata"
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Overlay based on state */}
                        {state?.status === "processing" ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                            <Loader2 className="h-6 w-6 text-white animate-spin" />
                          </div>
                        ) : state?.status === "success" ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-india-green/80">
                            <Check className="h-8 w-8 text-white" />
                          </div>
                        ) : state?.status === "error" ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-600/80 p-2">
                            <AlertTriangle className="h-6 w-6 text-white mb-1" />
                            <span className="text-xs text-white text-center line-clamp-2">
                              {state.message}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => generateThumbnailForVideo(video)}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                            disabled={isProcessingAll}
                          >
                            <div className="p-2 bg-saffron rounded-full">
                              <Play className="h-4 w-4 text-white fill-white" />
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Videos with thumbnails */}
          {videosWithThumbs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Check className="h-5 w-5 text-india-green" />
                  Videoer med thumbnail ({videosWithThumbs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {videosWithThumbs.map((video) => (
                    <div 
                      key={video.id} 
                      className="relative aspect-video bg-muted rounded-lg overflow-hidden"
                    >
                      <Image
                        src={getMediaUrl(video.thumbnail_path!)}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                      <div className="absolute bottom-1 right-1 p-1 bg-india-green rounded-full">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* No videos */}
          {videos.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Film className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">Ingen videoer fundet</h3>
                <p className="text-muted-foreground">
                  Der er endnu ingen videoer i systemet
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
