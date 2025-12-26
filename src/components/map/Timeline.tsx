"use client";

import { cn } from "@/lib/utils";
import { MapPin, Calendar, ChevronRight } from "lucide-react";
import type { Milestone } from "@/types/database";

interface TimelineProps {
  milestones: Milestone[];
  activeMilestone?: Milestone | null;
  onMilestoneClick?: (milestone: Milestone) => void;
}

export function Timeline({
  milestones,
  activeMilestone,
  onMilestoneClick,
}: TimelineProps) {
  const today = new Date();

  const getMilestoneStatus = (milestone: Milestone) => {
    if (!milestone.arrival_date) return "upcoming";
    const arrivalDate = new Date(milestone.arrival_date);
    const departureDate = milestone.departure_date
      ? new Date(milestone.departure_date)
      : null;

    if (arrivalDate > today) return "upcoming";
    if (departureDate && departureDate < today) return "completed";
    return "current";
  };

  // Sort milestones by display_order for consistent numbering
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.display_order - b.display_order
  );

  return (
    <div className="space-y-1">
      {sortedMilestones.map((milestone, index) => {
        const status = getMilestoneStatus(milestone);
        const isActive = activeMilestone?.id === milestone.id;
        // Milestone number is display_order + 1 (display_order is 0-indexed in DB)
        const milestoneNumber = milestone.display_order + 1;

        return (
          <button
            key={milestone.id}
            onClick={() => onMilestoneClick?.(milestone)}
            className={cn(
              "w-full text-left p-3 rounded-lg transition-all",
              "flex items-start gap-3 group",
              isActive
                ? "bg-saffron/10 border-l-4 border-saffron"
                : "hover:bg-muted"
            )}
          >
            {/* Timeline indicator */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                  status === "completed"
                    ? "bg-india-green text-white"
                    : status === "current"
                    ? "bg-saffron text-white animate-pulse"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {milestoneNumber}
              </div>
              {index < sortedMilestones.length - 1 && (
                <div
                  className={cn(
                    "w-0.5 h-8 mt-1",
                    status === "completed" ? "bg-india-green" : "bg-border"
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={cn(
                    "font-medium truncate",
                    status === "upcoming"
                      ? "text-muted-foreground"
                      : "text-foreground"
                  )}
                >
                  {milestone.name}
                </h3>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 flex-shrink-0 transition-transform",
                    "text-muted-foreground group-hover:text-saffron",
                    isActive && "rotate-90 text-saffron"
                  )}
                />
              </div>

              {milestone.arrival_date && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateRange(milestone.arrival_date, milestone.departure_date)}
                </p>
              )}

              {milestone.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {milestone.description}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatDateRange(arrival: string, departure: string | null): string {
  const arrDate = new Date(arrival);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

  if (!departure) {
    return arrDate.toLocaleDateString("da-DK", options);
  }

  const depDate = new Date(departure);
  return `${arrDate.toLocaleDateString("da-DK", options)} – ${depDate.toLocaleDateString(
    "da-DK",
    options
  )}`;
}

