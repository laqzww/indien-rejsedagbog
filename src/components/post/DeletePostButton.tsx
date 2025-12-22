"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteMedia } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface DeletePostButtonProps {
  postId: string;
  mediaPaths?: string[]; // Optional - will be fetched if not provided
  size?: "default" | "sm";
  onDeleted?: () => void; // Callback after successful deletion
}

export function DeletePostButton({ 
  postId, 
  mediaPaths, 
  size = "default",
  onDeleted 
}: DeletePostButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    // Confirm with user
    const confirmed = confirm(
      "Er du sikker på, at du vil slette dette opslag?\n\nDette kan ikke fortrydes."
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const supabase = createClient();

      // Verify user is authenticated and is the author
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Du er ikke logget ind");
      }

      // If mediaPaths not provided, fetch them from the database
      let pathsToDelete = mediaPaths || [];
      if (!mediaPaths) {
        const { data: mediaRecords } = await supabase
          .from("media")
          .select("storage_path")
          .eq("post_id", postId);
        
        pathsToDelete = mediaRecords?.map(m => m.storage_path) || [];
      }

      // Delete media files from storage first
      for (const path of pathsToDelete) {
        try {
          await deleteMedia(path);
        } catch (err) {
          console.error("Failed to delete media file:", path, err);
          // Continue anyway - file might already be deleted
        }
      }

      // Delete media records from database
      // (This will be handled by cascade delete if set up, but we do it explicitly)
      const { error: mediaDeleteError } = await supabase
        .from("media")
        .delete()
        .eq("post_id", postId);

      if (mediaDeleteError) {
        console.error("Failed to delete media records:", mediaDeleteError);
        // Continue to try deleting the post anyway
      }

      // Delete links associated with the post
      const { error: linksDeleteError } = await supabase
        .from("links")
        .delete()
        .eq("post_id", postId);

      if (linksDeleteError) {
        console.error("Failed to delete links:", linksDeleteError);
        // Continue to try deleting the post anyway
      }

      // Delete the post itself
      // RLS policy should ensure only the author can delete
      const { error: postDeleteError } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("author_id", user.id); // Extra safety check

      if (postDeleteError) {
        throw new Error(`Kunne ikke slette opslaget: ${postDeleteError.message}`);
      }

      // Success! Call callback or navigate
      if (onDeleted) {
        onDeleted();
      } else {
        router.push("/admin");
      }
      router.refresh();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(err instanceof Error ? err.message : "Kunne ikke slette opslaget");
      setIsDeleting(false);
    }
  };

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const buttonSize = size === "sm" ? "h-8 w-8" : undefined;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      disabled={isDeleting}
      className={`text-muted-foreground hover:text-destructive hover:bg-destructive/10 ${buttonSize ? buttonSize : ""}`}
      title="Slet opslag"
    >
      {isDeleting ? (
        <Loader2 className={`${iconSize} animate-spin`} />
      ) : (
        <Trash2 className={iconSize} />
      )}
    </Button>
  );
}
