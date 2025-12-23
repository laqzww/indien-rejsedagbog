"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Loader2, Upload, ImageIcon, Film, Zap } from "lucide-react";
import type { UploadProgress as UploadProgressType } from "@/lib/parallel-upload";

export interface UploadStage {
  stage: "preparing" | "compressing" | "compressing_video" | "uploading" | "saving" | "complete" | "error";
  message: string;
  detail?: string;
}

interface UploadProgressProps {
  stage: UploadStage;
  fileProgress?: Map<string, UploadProgressType>;
  overallProgress?: {
    completed: number;
    total: number;
    percentage: number;
  };
  fileTypes?: Map<string, "image" | "video">;
}

const stageLabels: Record<UploadStage["stage"], string> = {
  preparing: "Forbereder...",
  compressing: "Komprimerer billeder...",
  compressing_video: "Komprimerer video...",
  uploading: "Uploader filer...",
  saving: "Gemmer opslag...",
  complete: "Færdig!",
  error: "Fejl",
};

const stageIcons: Record<UploadStage["stage"], React.ReactNode> = {
  preparing: <Loader2 className="h-5 w-5 animate-spin" />,
  compressing: <Loader2 className="h-5 w-5 animate-spin" />,
  compressing_video: <Film className="h-5 w-5 animate-pulse" />,
  uploading: <Upload className="h-5 w-5 animate-pulse" />,
  saving: <Loader2 className="h-5 w-5 animate-spin" />,
  complete: <CheckCircle2 className="h-5 w-5 text-india-green" />,
  error: <AlertCircle className="h-5 w-5 text-destructive" />,
};

// Helper to get status display text
function getStatusText(status: UploadProgressType["status"], retryCount?: number): string {
  switch (status) {
    case "retrying":
      return retryCount ? `Prøver igen (${retryCount})...` : "Prøver igen...";
    case "uploading":
      return "Uploader...";
    case "completed":
      return "Færdig";
    case "error":
      return "Fejl";
    case "pending":
      return "Venter...";
    default:
      return "";
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function UploadProgressDisplay({
  stage,
  fileProgress,
  overallProgress,
  fileTypes,
}: UploadProgressProps) {
  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-xl border border-border">
      {/* Overall stage */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-saffron/10 text-saffron">
          {stageIcons[stage.stage]}
        </div>
        <div className="flex-1">
          <p className="font-medium text-foreground">{stage.message}</p>
          {stage.detail && (
            <p className="text-sm text-muted-foreground">{stage.detail}</p>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      {overallProgress && stage.stage === "uploading" && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {overallProgress.completed} af {overallProgress.total} filer
            </span>
            <span className="font-medium text-saffron">
              {overallProgress.percentage}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-saffron to-india-green transition-all duration-300 ease-out"
              style={{ width: `${overallProgress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Individual file progress (only show during upload) */}
      {fileProgress && fileProgress.size > 0 && stage.stage === "uploading" && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {Array.from(fileProgress.entries()).map(([id, progress]) => {
            const fileType = fileTypes?.get(id) || "image";
            const isRetrying = progress.status === "retrying";
            return (
              <div
                key={id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg text-sm transition-colors",
                  progress.status === "completed" && "bg-india-green/10",
                  progress.status === "error" && "bg-destructive/10",
                  progress.status === "uploading" && "bg-saffron/10",
                  progress.status === "retrying" && "bg-amber-500/10",
                  progress.status === "pending" && "bg-muted"
                )}
              >
                {/* File type icon */}
                <div className="text-muted-foreground">
                  {fileType === "video" ? (
                    <Film className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </div>

                {/* Progress indicator */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-200",
                          progress.status === "completed" && "bg-india-green",
                          progress.status === "error" && "bg-destructive",
                          progress.status === "uploading" && "bg-saffron",
                          progress.status === "retrying" && "bg-amber-500",
                          progress.status === "pending" && "bg-muted-foreground/30"
                        )}
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">
                      {progress.progress}%
                    </span>
                  </div>
                  {/* Show retry status */}
                  {isRetrying && (
                    <div className="text-xs text-amber-600 mt-0.5">
                      {getStatusText(progress.status, progress.retryCount)}
                    </div>
                  )}
                  {/* Show error message */}
                  {progress.status === "error" && progress.error && (
                    <div className="text-xs text-destructive mt-0.5 truncate" title={progress.error}>
                      {progress.error}
                    </div>
                  )}
                  {/* Show byte progress for videos */}
                  {fileType === "video" && progress.bytesTotal && progress.bytesTotal > 0 && !isRetrying && progress.status !== "error" && (
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      <span>
                        {formatBytes(progress.bytesUploaded || 0)} / {formatBytes(progress.bytesTotal)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status icon */}
                {progress.status === "completed" && (
                  <CheckCircle2 className="h-4 w-4 text-india-green flex-shrink-0" />
                )}
                {progress.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                )}
                {progress.status === "uploading" && (
                  <Loader2 className="h-4 w-4 text-saffron animate-spin flex-shrink-0" />
                )}
                {progress.status === "retrying" && (
                  <Loader2 className="h-4 w-4 text-amber-500 animate-spin flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
