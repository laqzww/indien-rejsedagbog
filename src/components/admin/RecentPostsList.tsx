"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DeletePostButton } from "@/components/post/DeletePostButton";
import { FileText, MapPin, Pencil, Loader2, ChevronDown } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";

interface Post {
  id: string;
  body: string;
  location_name: string | null;
  created_at: string;
}

interface PostsListProps {
  initialPosts: Post[];
  initialTotal: number;
  initialHasMore: boolean;
}

export function RecentPostsList({ 
  initialPosts, 
  initialTotal = 0, 
  initialHasMore = false 
}: PostsListProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);

  const loadMorePosts = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const nextPage = page + 1;
      const response = await fetch(`/api/posts?page=${nextPage}&limit=20`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch posts");
      }

      const data = await response.json();
      
      setPosts((current) => [...current, ...data.posts]);
      setHasMore(data.hasMore);
      setPage(nextPage);
      setTotal(data.total);
    } catch (error) {
      console.error("Error loading more posts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, hasMore, isLoading]);

  const handlePostDeleted = (deletedPostId: string) => {
    setPosts((current) => current.filter((p) => p.id !== deletedPostId));
    setTotal((current) => Math.max(0, current - 1));
  };

  if (posts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p>Du har ikke skrevet nogen opslag endnu.</p>
        <Link href="/admin/new">
          <Button variant="link" className="mt-2">
            Skriv dit første opslag →
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Posts count */}
      <p className="text-sm text-muted-foreground pb-2 border-b">
        Viser {posts.length} af {total} opslag
      </p>

      {/* Posts list */}
      {posts.map((post) => (
        <div
          key={post.id}
          className="flex items-start gap-2 p-3 rounded-lg hover:bg-muted transition-colors group"
        >
          <Link href={`/post/${post.id}`} className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {post.body.length > 80 ? `${post.body.slice(0, 80)}...` : post.body}
                </p>
                {post.location_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />
                    {post.location_name}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatRelativeDate(post.created_at)}
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link href={`/admin/edit/${post.id}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-saffron"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
            <DeletePostButton
              postId={post.id}
              size="sm"
              onDeleted={() => handlePostDeleted(post.id)}
            />
          </div>
        </div>
      ))}

      {/* Load more button */}
      {hasMore && (
        <div className="pt-4 border-t">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={loadMorePosts}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Indlæser...
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Vis flere opslag
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
