"use client";

import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Calendar, ImageIcon, Film, Play } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import { getMediaUrl, getAvatarUrl } from "@/lib/upload";

// Simplified type for serializable post data
interface PostCardData {
  id: string;
  body: string;
  location_name: string | null;
  captured_at: string | null;
  created_at: string;
  tags: string[] | null;
  media: Array<{
    id: string;
    type: string;
    storage_path: string;
    thumbnail_path: string | null;
    width: number | null;
    height: number | null;
    display_order: number;
  }>;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

// Helper to determine aspect ratio class based on image dimensions
function getAspectRatioStyle(width: number | null, height: number | null) {
  if (!width || !height) {
    // Fallback to 4:3 if dimensions unknown
    return { aspectRatio: "4/3" };
  }
  
  const ratio = width / height;
  
  // Portrait (taller than wide) - e.g. iPhone portrait is roughly 3:4
  // Landscape (wider than tall) - e.g. iPhone landscape is roughly 4:3 or 16:9
  return { aspectRatio: `${width}/${height}` };
}

interface PostCardProps {
  post: PostCardData;
  index?: number;
}

export function PostCard({ post, index = 0 }: PostCardProps) {
  // Sort media by display_order to ensure correct order
  const sortedMedia = [...post.media].sort(
    (a, b) => a.display_order - b.display_order
  );
  const firstMedia = sortedMedia[0];
  const mediaCount = sortedMedia.length;
  const imageCount = sortedMedia.filter((m) => m.type === "image").length;
  const videoCount = sortedMedia.filter((m) => m.type === "video").length;

  return (
    <Link href={`/post/${post.id}`}>
      <Card 
        className="overflow-hidden hover:shadow-lg hover:border-saffron/30 transition-all group animate-fade-in"
        style={{ animationDelay: `${index * 100}ms` }}
      >
        {/* Media preview */}
        {firstMedia && (
          <div 
            className="relative bg-muted overflow-hidden"
            style={getAspectRatioStyle(firstMedia.width, firstMedia.height)}
          >
            {firstMedia.type === "image" ? (
              <Image
                src={getMediaUrl(firstMedia.storage_path)}
                alt=""
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            ) : (
              <>
                {/* Video thumbnail - use stored thumbnail or fallback to video frame */}
                {firstMedia.thumbnail_path ? (
                  <Image
                    src={getMediaUrl(firstMedia.thumbnail_path)}
                    alt=""
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <video
                    src={`${getMediaUrl(firstMedia.storage_path)}#t=0.001`}
                    preload="metadata"
                    muted
                    playsInline
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
                {/* Play button overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="p-3 bg-black/50 rounded-full group-hover:bg-black/70 group-hover:scale-110 transition-all">
                    <Play className="h-8 w-8 text-white fill-white" />
                  </div>
                </div>
              </>
            )}

            {/* Media count badge */}
            {mediaCount > 1 && (
              <div className="absolute top-3 right-3 flex gap-1">
                {imageCount > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-black/60 rounded-full text-white text-xs">
                    <ImageIcon className="h-3 w-3" />
                    {imageCount}
                  </div>
                )}
                {videoCount > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-black/60 rounded-full text-white text-xs">
                    <Film className="h-3 w-3" />
                    {videoCount}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <CardContent className="p-4">
          {/* Author and date */}
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-8 w-8">
              {post.profile?.avatar_url && (
                <AvatarImage src={getAvatarUrl(post.profile.avatar_url)} alt="" />
              )}
              <AvatarFallback>
                {post.profile?.display_name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {post.profile?.display_name || "Anonym"}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatRelativeDate(post.captured_at || post.created_at)}
              </p>
            </div>
          </div>

          {/* Body text */}
          <p className="text-sm text-foreground line-clamp-3 mb-3">
            {post.body}
          </p>

          {/* Location */}
          {post.location_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
              <MapPin className="h-3 w-3 text-india-green" />
              <span className="truncate">{post.location_name}</span>
            </p>
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="muted" className="text-xs">
                  #{tag}
                </Badge>
              ))}
              {post.tags.length > 3 && (
                <Badge variant="muted" className="text-xs">
                  +{post.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

