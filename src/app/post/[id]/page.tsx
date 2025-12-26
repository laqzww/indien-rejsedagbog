import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { MediaGallery } from "@/components/post/MediaGallery";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Calendar, Share2, Pencil } from "lucide-react";
import { DeletePostButton } from "@/components/post/DeletePostButton";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";
import { getIsAuthor } from "@/lib/author";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data: post } = await supabase
    .from("posts")
    .select("body, location_name")
    .eq("id", id)
    .single();

  if (!post) {
    return { title: "Opslag ikke fundet" };
  }

  return {
    title: `${post.body.slice(0, 50)}...`,
    description: post.body.slice(0, 160),
  };
}

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Check if current user is author
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = await getIsAuthor(supabase, user);
  
  // We'll check if the user is the post author after fetching the post

  // Fetch post with relations
  const { data: post } = await supabase
    .from("posts")
    .select(`
      *,
      media (*),
      links (*),
      profile:profiles (*)
    `)
    .eq("id", id)
    .single();

  if (!post) {
    notFound();
  }

  // Check if current user is the author of this specific post
  const isPostAuthor = user && post.author_id === user.id;

  // Sort media by display_order
  const sortedMedia = [...(post.media || [])].sort(
    (a, b) => a.display_order - b.display_order
  );

  return (
    <div className="min-h-screen bg-white">
      <Header isAuthor={isAuthor} showNavigation={false} />

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Back button */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              Tilbage til feed
            </Button>
          </Link>
        </div>

        {/* Media gallery */}
        {sortedMedia.length > 0 && (
          <div className="mb-8">
            <MediaGallery media={sortedMedia} />
          </div>
        )}

        {/* Post content */}
        <article className="space-y-6">
          {/* Author and date */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {post.profile?.avatar_url && (
                  <AvatarImage src={post.profile.avatar_url} alt="" />
                )}
                <AvatarFallback className="text-lg">
                  {post.profile?.display_name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {post.profile?.display_name || "Anonym"}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(post.captured_at || post.created_at)}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {/* Edit button - only for post author */}
              {isPostAuthor && (
                <Link href={`/admin/edit/${post.id}`}>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-saffron">
                    <Pencil className="h-5 w-5" />
                  </Button>
                </Link>
              )}
              
              {/* Delete button - only for post author */}
              {isPostAuthor && (
                <DeletePostButton
                  postId={post.id}
                  mediaPaths={sortedMedia.map((m: { storage_path: string }) => m.storage_path)}
                />
              )}
              
              {/* Share button */}
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Share2 className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Location */}
          {post.location_name && (
            <div className="flex items-center gap-2 text-india-green">
              <MapPin className="h-5 w-5" />
              <span className="font-medium">{post.location_name}</span>
            </div>
          )}

          {/* Body text */}
          <div className="prose prose-lg max-w-none">
            <p className="whitespace-pre-wrap text-foreground leading-relaxed">
              {post.body}
            </p>
          </div>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {post.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-sm">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Links (hotel/restaurant cards) */}
          {post.links && post.links.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Links</h3>
              {post.links.map((link: { id: string; url: string; title: string | null; description: string | null; image_url: string | null; site_name: string | null }) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 border border-border rounded-lg hover:border-saffron transition-colors"
                >
                  <div className="flex gap-4">
                    {link.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={link.image_url}
                        alt=""
                        className="w-20 h-20 object-cover rounded flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {link.title || link.url}
                      </p>
                      {link.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {link.description}
                        </p>
                      )}
                      {link.site_name && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {link.site_name}
                        </p>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Mini map with location */}
          {post.lat && post.lng && (
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Lokation</h3>
              <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                {/* Static map image from Mapbox */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l-marker+FF9933(${post.lng},${post.lat})/${post.lng},${post.lat},12,0/600x300@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`}
                  alt={`Kort over ${post.location_name || "lokation"}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <Link href={`/?view=map&lat=${post.lat}&lng=${post.lng}&focusPost=${post.id}`}>
                <Button variant="link" className="px-0 mt-2">
                  Se på rejsekortet →
                </Button>
              </Link>
            </div>
          )}
        </article>
      </main>
    </div>
  );
}

