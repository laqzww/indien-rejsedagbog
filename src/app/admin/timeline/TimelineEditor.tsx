"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PlusCircle,
  MapPin,
  Calendar,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  ImageIcon,
} from "lucide-react";
import type { Milestone } from "@/types/database";
import { MilestoneForm } from "./MilestoneForm";
import { cn } from "@/lib/utils";
import { uploadMilestoneCover, deleteMilestoneCover } from "@/lib/upload";

interface TimelineEditorProps {
  initialMilestones: Milestone[];
}

export function TimelineEditor({ initialMilestones }: TimelineEditorProps) {
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (data: Omit<Milestone, "id" | "created_at">, coverImageFile?: File) => {
    setError(null);
    const supabase = createClient();

    // Set display_order to be after last milestone
    const maxOrder = milestones.length > 0 
      ? Math.max(...milestones.map(m => m.display_order)) 
      : -1;

    // First create the milestone without cover image path
    const { data: newMilestone, error: insertError } = await supabase
      .from("milestones")
      .insert({
        ...data,
        display_order: maxOrder + 1,
        cover_image_path: null, // Set initially, update after upload
      })
      .select()
      .single();

    if (insertError) {
      setError("Kunne ikke oprette destinationen: " + insertError.message);
      return false;
    }

    // If cover image file is provided, upload it and update the milestone
    if (coverImageFile && newMilestone) {
      try {
        const uploadResult = await uploadMilestoneCover(coverImageFile, newMilestone.id);
        
        // Update milestone with cover image path
        const { error: updateError } = await supabase
          .from("milestones")
          .update({ cover_image_path: uploadResult.path })
          .eq("id", newMilestone.id);

        if (updateError) {
          console.error("Failed to update cover image path:", updateError);
          // Don't fail the whole operation, just log the error
        } else {
          newMilestone.cover_image_path = uploadResult.path;
        }
      } catch (uploadError) {
        console.error("Failed to upload cover image:", uploadError);
        // Don't fail the whole operation, milestone was created successfully
      }
    }

    setMilestones([...milestones, newMilestone]);
    setIsCreating(false);
    return true;
  };

  const handleUpdate = async (data: Omit<Milestone, "id" | "created_at">, coverImageFile?: File) => {
    if (!editingMilestone) return false;
    setError(null);
    const supabase = createClient();

    let finalCoverPath = data.cover_image_path;

    // If a new cover image is provided, upload it
    if (coverImageFile) {
      try {
        // Delete old cover if it exists
        if (editingMilestone.cover_image_path) {
          await deleteMilestoneCover(editingMilestone.cover_image_path).catch(() => {});
        }
        
        const uploadResult = await uploadMilestoneCover(coverImageFile, editingMilestone.id);
        finalCoverPath = uploadResult.path;
      } catch (uploadError) {
        console.error("Failed to upload cover image:", uploadError);
        setError("Kunne ikke uploade cover-billedet");
        return false;
      }
    } else if (data.cover_image_path === null && editingMilestone.cover_image_path) {
      // Cover was removed, delete the old file
      try {
        await deleteMilestoneCover(editingMilestone.cover_image_path);
      } catch (deleteError) {
        console.error("Failed to delete old cover image:", deleteError);
        // Don't fail the operation
      }
    }

    const { error: updateError } = await supabase
      .from("milestones")
      .update({ ...data, cover_image_path: finalCoverPath })
      .eq("id", editingMilestone.id);

    if (updateError) {
      setError("Kunne ikke opdatere destinationen: " + updateError.message);
      return false;
    }

    setMilestones(
      milestones.map((m) =>
        m.id === editingMilestone.id ? { ...m, ...data, cover_image_path: finalCoverPath } : m
      )
    );
    setEditingMilestone(null);
    return true;
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Er du sikker på, at du vil slette denne destination?")) {
      return;
    }

    setIsDeleting(id);
    setError(null);
    const supabase = createClient();

    const { error: deleteError } = await supabase
      .from("milestones")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError("Kunne ikke slette destinationen: " + deleteError.message);
      setIsDeleting(null);
      return;
    }

    setMilestones(milestones.filter((m) => m.id !== id));
    setIsDeleting(null);
  };

  const handleMove = async (id: string, direction: "up" | "down") => {
    const index = milestones.findIndex((m) => m.id === id);
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === milestones.length - 1)
    ) {
      return;
    }

    setIsReordering(id);
    setError(null);

    const newIndex = direction === "up" ? index - 1 : index + 1;
    const newMilestones = [...milestones];
    const [moved] = newMilestones.splice(index, 1);
    newMilestones.splice(newIndex, 0, moved);

    // Update display_order for all milestones
    const supabase = createClient();
    const updates = newMilestones.map((m, i) => ({
      id: m.id,
      display_order: i,
    }));

    // Update in database
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("milestones")
        .update({ display_order: update.display_order })
        .eq("id", update.id);

      if (updateError) {
        setError("Kunne ikke ændre rækkefølgen: " + updateError.message);
        setIsReordering(null);
        return;
      }
    }

    setMilestones(newMilestones.map((m, i) => ({ ...m, display_order: i })));
    setIsReordering(null);
  };

  const formatDateRange = (arrival: string | null, departure: string | null) => {
    if (!arrival) return "Ingen dato";
    
    const arrDate = new Date(arrival);
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

    if (!departure) {
      return arrDate.toLocaleDateString("da-DK", options);
    }

    const depDate = new Date(departure);
    return `${arrDate.toLocaleDateString("da-DK", options)} – ${depDate.toLocaleDateString("da-DK", options)}`;
  };

  // Show form if creating or editing
  if (isCreating) {
    return (
      <MilestoneForm
        onSubmit={handleCreate}
        onCancel={() => setIsCreating(false)}
        title="Tilføj destination"
      />
    );
  }

  if (editingMilestone) {
    return (
      <MilestoneForm
        milestone={editingMilestone}
        onSubmit={handleUpdate}
        onCancel={() => setEditingMilestone(null)}
        title="Rediger destination"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Error message */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add new button */}
      <Button
        onClick={() => setIsCreating(true)}
        className="w-full gap-2"
        size="lg"
      >
        <PlusCircle className="h-5 w-5" />
        Tilføj ny destination
      </Button>

      {/* Milestones list */}
      {milestones.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              Ingen destinationer tilføjet endnu.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Klik på knappen ovenfor for at tilføje den første destination.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <Card
              key={milestone.id}
              className={cn(
                "transition-all",
                isReordering === milestone.id && "opacity-50",
                isDeleting === milestone.id && "opacity-50"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Order number and move controls */}
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMove(milestone.id, "up")}
                      disabled={index === 0 || isReordering !== null}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <div className="w-8 h-8 rounded-full bg-saffron text-white flex items-center justify-center font-bold text-sm">
                      {milestone.display_order + 1}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMove(milestone.id, "down")}
                      disabled={index === milestones.length - 1 || isReordering !== null}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-navy truncate">
                      {milestone.name}
                    </h3>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateRange(milestone.arrival_date, milestone.departure_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {milestone.lat.toFixed(4)}, {milestone.lng.toFixed(4)}
                      </span>
                      {milestone.cover_image_path && (
                        <span className="flex items-center gap-1 text-india-green">
                          <ImageIcon className="h-3.5 w-3.5" />
                          Cover
                        </span>
                      )}
                    </div>

                    {milestone.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {milestone.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-saffron"
                      onClick={() => setEditingMilestone(milestone)}
                      disabled={isDeleting !== null || isReordering !== null}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(milestone.id)}
                      disabled={isDeleting !== null || isReordering !== null}
                    >
                      {isDeleting === milestone.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info about journey start */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> Rejsens startdato (Dag 0) er sat til{" "}
            <span className="font-medium">18. december 2025</span>. Alle opslag
            grupperes automatisk under den destination, hvis datointerval de
            falder inden for.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
