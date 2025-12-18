"use client";

import { useState } from "react";
import { PostFeedCard } from "./PostFeedCard";
import { cn } from "@/lib/utils";
import { ChevronDown, Calendar } from "lucide-react";
import type { MilestoneGroup, DayGroup } from "@/lib/journey";

interface PostFeedProps {
  groups: MilestoneGroup[];
}

export function PostFeed({ groups }: PostFeedProps) {
  return (
    <div className="space-y-0">
      {groups.map((group, index) => (
        <MilestoneSection key={group.milestone?.id || "unknown"} group={group} index={index} />
      ))}
    </div>
  );
}

interface MilestoneSectionProps {
  group: MilestoneGroup;
  index: number;
}

function MilestoneSection({ group, index }: MilestoneSectionProps) {
  const [isExpanded, setIsExpanded] = useState(index === 0); // First milestone expanded by default

  const totalPosts = group.days.reduce((sum, day) => sum + day.posts.length, 0);

  return (
    <section className="border-b border-border last:border-b-0">
      {/* Milestone header - sticky on mobile */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full sticky top-0 z-20 bg-gradient-to-r from-saffron/5 to-india-green/5 backdrop-blur-sm",
          "flex items-center justify-between px-4 py-3",
          "hover:from-saffron/10 hover:to-india-green/10 transition-colors",
          "border-b border-border/50"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Milestone number badge */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron to-saffron-dark text-white flex items-center justify-center text-sm font-bold shadow-sm">
            {index + 1}
          </div>
          <div className="text-left">
            <h2 className="font-bold text-foreground text-base leading-tight">
              {group.milestoneName}
            </h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Calendar className="h-3 w-3" />
              {group.days.length} {group.days.length === 1 ? "dag" : "dage"} · {totalPosts} {totalPosts === 1 ? "opslag" : "opslag"}
            </p>
          </div>
        </div>

        <div className={cn(
          "transition-transform duration-200",
          isExpanded ? "rotate-180" : ""
        )}>
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </button>

      {/* Days and posts */}
      {isExpanded && (
        <div className="animate-fade-in">
          {group.days.map((day) => (
            <DaySection key={day.dayNumber} day={day} />
          ))}
        </div>
      )}
    </section>
  );
}

interface DaySectionProps {
  day: DayGroup;
}

function DaySection({ day }: DaySectionProps) {
  return (
    <div>
      {/* Day header */}
      <div className="sticky top-[57px] z-10 bg-white/95 backdrop-blur-sm px-4 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-saffron" />
          <h3 className="text-sm font-semibold text-foreground">
            {day.label}
          </h3>
          <span className="text-xs text-muted-foreground">
            ({day.posts.length} {day.posts.length === 1 ? "opslag" : "opslag"})
          </span>
        </div>
      </div>

      {/* Posts for this day */}
      <div>
        {day.posts.map((post) => (
          <PostFeedCard key={post.id} post={post} showDayBadge={false} />
        ))}
      </div>
    </div>
  );
}
