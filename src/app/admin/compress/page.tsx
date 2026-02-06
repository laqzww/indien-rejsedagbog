"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/url-utils";
import { formatFileSize } from "@/lib/image-compression";
import {
  compressVideoFromUrl,
  shouldCompressVideo,
  releaseFFmpeg,
  COMPRESSION_PRESETS,
  type CompressionProgress,
  type PresetName,
} from "@/lib/video-compression";
import { probeVideo } from "@/lib/video-probe";
import { uploadResumable } from "@/lib/resumable-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Film,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  Zap,
  HardDrive,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import type { Media } from "@/types/database";

// ─── Types ──────────────────────────────────────────────────────────────

interface VideoItem extends Media {
  publicUrl: string;
  status: "pending" | "probing" | "compressing" | "uploading" | "completed" | "error" | "skipped";
  progress?: CompressionProgress;
  error?: string;
  newSize?: number;
  savings?: number; // percentage
}

// ─── Component ──────────────────────────────────────────────────────────

export default function CompressPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [preset, setPreset] = useState<PresetName>("balanced");
  const [stats, setStats] = useState({
    totalOriginal: 0,
    totalCompressed: 0,
    completed: 0,
    errors: 0,
    skipped: 0,
  });

  // Fetch uncompressed videos from the database
  useEffect(() => {
    async function fetchVideos() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("media")
        .select("*")
        .eq("type", "video")
        .eq("is_compressed", false)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch videos:", error);
        setLoading(false);
        return;
      }

      const items: VideoItem[] = (data || []).map((media: Media) => ({
        ...media,
        publicUrl: getMediaUrl(media.storage_path),
        status: "pending" as const,
      }));

      setVideos(items);
      setLoading(false);
    }

    fetchVideos();
  }, []);

  // Update a single video item in the list
  const updateVideo = useCallback(
    (id: string, update: Partial<VideoItem>) => {
      setVideos((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...update } : v))
      );
    },
    []
  );

  // Process a single video: download → compress → re-upload → update DB
  const processVideo = useCallback(
    async (video: VideoItem) => {
      const supabase = createClient();
      const selectedPreset = COMPRESSION_PRESETS[preset];

      try {
        // Step 1: Probe the video to get metadata
        updateVideo(video.id, { status: "probing" });

        // Download video to probe it
        const response = await fetch(video.publicUrl);
        if (!response.ok) {
          throw new Error(`Download fejlede: ${response.status}`);
        }
        const videoBlob = await response.blob();

        // Quick size check
        if (!shouldCompressVideo(videoBlob)) {
          updateVideo(video.id, {
            status: "skipped",
            error: "Video er for lille til komprimering (<10MB)",
          });
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          return;
        }

        // Probe metadata
        let metadata;
        try {
          metadata = await probeVideo(videoBlob as unknown as File);
        } catch {
          // If probe fails, continue with minimal info
          metadata = undefined;
        }

        // Step 2: Compress
        updateVideo(video.id, { status: "compressing" });

        const result = await compressVideoFromUrl(video.publicUrl, {
          preset: selectedPreset,
          onProgress: (progress) => {
            updateVideo(video.id, {
              status: "compressing",
              progress,
            });
          },
        }, metadata);

        // Check if compression actually helped (at least 10% savings)
        const savings = Math.round((1 - result.compressionRatio) * 100);
        if (savings < 10) {
          updateVideo(video.id, {
            status: "skipped",
            error: `Ikke nok besparelse (${savings}%). Beholder original.`,
          });
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          return;
        }

        // Step 3: Upload compressed video
        updateVideo(video.id, { status: "uploading" });

        // Create compressed path (add _compressed suffix)
        const originalPath = video.storage_path;
        const lastDot = originalPath.lastIndexOf(".");
        const compressedPath =
          lastDot >= 0
            ? `${originalPath.slice(0, lastDot)}_compressed.mp4`
            : `${originalPath}_compressed.mp4`;

        await uploadResumable(result.blob, compressedPath, {
          onProgress: (progress) => {
            updateVideo(video.id, {
              status: "uploading",
              progress: {
                percentage: progress.percentage,
                phase: "finalizing",
                message: `Uploader komprimeret video... ${progress.percentage}%`,
              },
            });
          },
        });

        // Step 4: Update database record
        const { error: updateError } = await supabase
          .from("media")
          .update({
            is_compressed: true,
            original_size: videoBlob.size,
            compressed_size: result.compressedSize,
            compression_codec: result.codec,
            compression_settings: {
              crf: result.settings.crf,
              preset: result.settings.preset,
              maxResolution: result.settings.maxResolution,
              audioBitrate: result.settings.audioBitrate,
              name: result.settings.name,
            },
            compressed_storage_path: compressedPath,
            original_width: metadata?.width ?? video.width,
            original_height: metadata?.height ?? video.height,
            // Update dimensions to compressed dimensions
            width: result.width || video.width,
            height: result.height || video.height,
            // Update storage path to compressed version
            storage_path: compressedPath,
          })
          .eq("id", video.id);

        if (updateError) {
          throw new Error(`Database opdatering fejlede: ${updateError.message}`);
        }

        updateVideo(video.id, {
          status: "completed",
          newSize: result.compressedSize,
          savings,
        });

        setStats((s) => ({
          ...s,
          totalOriginal: s.totalOriginal + videoBlob.size,
          totalCompressed: s.totalCompressed + result.compressedSize,
          completed: s.completed + 1,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ukendt fejl";
        console.error(`Compression failed for ${video.id}:`, err);
        updateVideo(video.id, { status: "error", error: message });
        setStats((s) => ({ ...s, errors: s.errors + 1 }));
      }
    },
    [preset, updateVideo]
  );

  // Start batch processing
  const startBatchCompression = useCallback(async () => {
    setProcessing(true);
    setStats({ totalOriginal: 0, totalCompressed: 0, completed: 0, errors: 0, skipped: 0 });

    const pendingVideos = videos.filter((v) => v.status === "pending" || v.status === "error");

    for (let i = 0; i < pendingVideos.length; i++) {
      setCurrentIndex(i);
      await processVideo(pendingVideos[i]);
    }

    // Release FFmpeg to free memory
    await releaseFFmpeg();

    setProcessing(false);
    setCurrentIndex(-1);
  }, [videos, processVideo]);

  // Total stats
  const totalVideos = videos.length;
  const pendingCount = videos.filter((v) => v.status === "pending" || v.status === "error").length;
  const completedCount = videos.filter((v) => v.status === "completed").length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-navy">Videokomprimering</h1>
          <p className="text-sm text-muted-foreground">
            Komprimer eksisterende videoer i databasen for at spare plads
          </p>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalVideos}</p>
                <p className="text-xs text-muted-foreground">Videoer i alt</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-saffron" />
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Venter</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-india-green" />
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-xs text-muted-foreground">Komprimeret</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Savings summary (shown during/after processing) */}
      {stats.totalOriginal > 0 && (
        <Card className="mb-6 border-india-green/30 bg-india-green/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <TrendingDown className="h-5 w-5 text-india-green" />
              <div>
                <p className="font-medium text-india-green">
                  Besparelse: {formatFileSize(stats.totalOriginal - stats.totalCompressed)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(stats.totalOriginal)} &rarr; {formatFileSize(stats.totalCompressed)}
                  {" "}({Math.round((1 - stats.totalCompressed / stats.totalOriginal) * 100)}% reduktion)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preset selector */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Komprimeringsindstillinger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(COMPRESSION_PRESETS) as [PresetName, typeof COMPRESSION_PRESETS[PresetName]][]).map(
              ([key, p]) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  disabled={processing}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    preset === key
                      ? "border-saffron bg-saffron/5"
                      : "border-border hover:border-saffron/30"
                  } ${processing ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    CRF {p.crf} &bull; {p.maxResolution}p &bull; {p.preset}
                  </p>
                </button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3 mb-6">
        <Button
          onClick={startBatchCompression}
          disabled={processing || pendingCount === 0}
          className="gap-2"
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Komprimerer {currentIndex + 1}/{pendingCount}...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start komprimering ({pendingCount} videoer)
            </>
          )}
        </Button>
      </div>

      {/* Video list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-saffron" />
          <span className="ml-2 text-muted-foreground">Henter videoer...</span>
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-india-green mx-auto mb-3" />
            <p className="font-medium">Alle videoer er komprimeret!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Der er ingen ukomprimerede videoer i databasen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <Card
              key={video.id}
              className={`transition-all ${
                video.status === "completed"
                  ? "border-india-green/30"
                  : video.status === "error"
                    ? "border-destructive/30"
                    : video.status === "compressing" || video.status === "uploading"
                      ? "border-saffron/30"
                      : ""
              }`}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {video.status === "pending" && (
                      <HardDrive className="h-5 w-5 text-muted-foreground" />
                    )}
                    {video.status === "probing" && (
                      <Loader2 className="h-5 w-5 text-saffron animate-spin" />
                    )}
                    {video.status === "compressing" && (
                      <Loader2 className="h-5 w-5 text-saffron animate-spin" />
                    )}
                    {video.status === "uploading" && (
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    )}
                    {video.status === "completed" && (
                      <CheckCircle2 className="h-5 w-5 text-india-green" />
                    )}
                    {video.status === "error" && (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    {video.status === "skipped" && (
                      <Pause className="h-5 w-5 text-amber-500" />
                    )}
                  </div>

                  {/* Video info */}
                  <div className="flex-grow min-w-0">
                    <p className="text-sm font-mono truncate">
                      {video.storage_path.split("/").pop()}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {video.width && video.height && (
                        <span>
                          {video.width}x{video.height}
                        </span>
                      )}
                      {video.original_size && (
                        <span>{formatFileSize(video.original_size)}</span>
                      )}
                      {video.status === "compressing" && video.progress && (
                        <span className="text-saffron font-medium">
                          {video.progress.message}
                        </span>
                      )}
                      {video.status === "uploading" && video.progress && (
                        <span className="text-blue-500 font-medium">
                          {video.progress.message}
                        </span>
                      )}
                      {video.status === "completed" && video.savings && (
                        <span className="text-india-green font-medium">
                          -{video.savings}%
                          {video.newSize && ` (${formatFileSize(video.newSize)})`}
                        </span>
                      )}
                      {video.status === "error" && (
                        <span className="text-destructive">{video.error}</span>
                      )}
                      {video.status === "skipped" && (
                        <span className="text-amber-500">{video.error}</span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(video.status === "compressing" || video.status === "uploading") &&
                    video.progress && (
                      <div className="w-24 flex-shrink-0">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              video.status === "uploading"
                                ? "bg-blue-500"
                                : "bg-saffron"
                            }`}
                            style={{ width: `${video.progress.percentage}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-center mt-0.5">
                          {video.progress.percentage}%
                        </p>
                      </div>
                    )}

                  {/* Retry button for failed videos */}
                  {video.status === "error" && !processing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        updateVideo(video.id, { status: "pending", error: undefined });
                      }}
                      title="Prøv igen"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
