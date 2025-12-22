"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/upload";

interface VideoThumbnailProps {
  storagePath: string;
  thumbnailPath?: string | null;
  className?: string;
  sizes?: string;
  autoPlay?: boolean;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  // Called when user clicks play (for analytics etc)
  onPlay?: () => void;
}

/**
 * VideoThumbnail component with click-to-play functionality
 * 
 * Shows a thumbnail image with a play button overlay.
 * When clicked, loads and plays the video.
 * This saves bandwidth as videos only load when explicitly requested.
 */
export function VideoThumbnail({
  storagePath,
  thumbnailPath,
  className,
  sizes = "100vw",
  autoPlay = true,
  controls = true,
  muted = false,
  loop = false,
  onPlay,
}: VideoThumbnailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoUrl = getMediaUrl(storagePath);
  const thumbUrl = thumbnailPath ? getMediaUrl(thumbnailPath) : null;

  // Handle play button click
  const handlePlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsLoading(true);
    setIsPlaying(true);
    onPlay?.();
  };

  // Handle video loaded and ready to play
  const handleCanPlay = () => {
    setIsLoading(false);
    if (autoPlay && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay was prevented, that's ok
      });
    }
  };

  // Handle video error
  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // If video is being played, render the video element
  // Use object-cover to match thumbnail format and avoid black bars
  if (isPlaying) {
    return (
      <div className={cn("relative w-full h-full bg-black", className)}>
        <video
          ref={videoRef}
          src={videoUrl}
          controls={controls}
          muted={muted}
          loop={loop}
          playsInline
          preload="auto"
          onCanPlay={handleCanPlay}
          onError={handleError}
          className="w-full h-full object-cover"
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-10 w-10 text-white animate-spin" />
          </div>
        )}
        
        {/* Error overlay */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <p className="text-white text-sm">Kunne ikke indlæse video</p>
          </div>
        )}
      </div>
    );
  }

  // Show thumbnail with play button
  return (
    <div 
      className={cn("relative w-full h-full bg-muted cursor-pointer group", className)}
      onClick={handlePlayClick}
    >
      {/* Thumbnail image */}
      {thumbUrl ? (
        <Image
          src={thumbUrl}
          alt=""
          fill
          className="object-cover"
          sizes={sizes}
        />
      ) : (
        // Fallback: try to show first frame using video element with poster
        <video
          src={`${videoUrl}#t=0.001`}
          preload="metadata"
          muted
          playsInline
          className="w-full h-full object-cover pointer-events-none"
        />
      )}
      
      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="p-4 bg-black/60 rounded-full group-hover:bg-black/80 group-hover:scale-110 transition-all">
          <Play className="h-8 w-8 text-white fill-white" />
        </div>
      </div>
      
      {/* Gradient overlay for better button visibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
    </div>
  );
}

/**
 * Compact version for cards/thumbnails - just shows play icon overlay
 */
export function VideoThumbnailCompact({
  storagePath,
  thumbnailPath,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: Omit<VideoThumbnailProps, "autoPlay" | "controls" | "muted" | "loop" | "onPlay">) {
  const videoUrl = getMediaUrl(storagePath);
  const thumbUrl = thumbnailPath ? getMediaUrl(thumbnailPath) : null;

  return (
    <div className={cn("relative w-full h-full bg-muted", className)}>
      {/* Thumbnail image */}
      {thumbUrl ? (
        <Image
          src={thumbUrl}
          alt=""
          fill
          className="object-cover"
          sizes={sizes}
        />
      ) : (
        // Fallback: use video element to show first frame
        <video
          src={`${videoUrl}#t=0.001`}
          preload="metadata"
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      )}
      
      {/* Play icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="p-3 bg-black/50 rounded-full">
          <Play className="h-6 w-6 text-white fill-white" />
        </div>
      </div>
    </div>
  );
}
