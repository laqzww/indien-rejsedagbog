"use client";

import { useState, useEffect, useRef } from "react";
import { PostFeedCard } from "./PostFeedCard";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { MilestoneGroup, DayGroup } from "@/lib/journey";

interface PostFeedProps {
  groups: MilestoneGroup[];
  focusPostId?: string; // Post ID to scroll to and highlight
}

export function PostFeed({ groups, focusPostId }: PostFeedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledToFocusRef = useRef(false);

  // Find which milestone contains the focus post
  const focusMilestoneId = focusPostId ? (() => {
    for (const group of groups) {
      for (const day of group.days) {
        if (day.posts.some(p => p.id === focusPostId)) {
          return group.milestone?.id;
        }
      }
    }
    return null;
  })() : null;

  // Scroll to focus post when it changes
  useEffect(() => {
    if (!focusPostId || hasScrolledToFocusRef.current) return;

    // Small delay to allow DOM to render and milestones to expand
    const scrollTimeout = setTimeout(() => {
      const postElement = document.getElementById(`post-${focusPostId}`);
      if (postElement) {
        // Scroll the post into view with some offset for the header
        postElement.scrollIntoView({ behavior: "smooth", block: "center" });
        
        // Add highlight effect using inline styles for reliability
        postElement.style.boxShadow = "0 0 0 3px #FF9933";
        postElement.style.borderRadius = "8px";
        postElement.style.transition = "box-shadow 0.3s ease";
        
        setTimeout(() => {
          postElement.style.boxShadow = "";
          postElement.style.borderRadius = "";
        }, 2500);
        
        hasScrolledToFocusRef.current = true;
      }
    }, 150);

    return () => clearTimeout(scrollTimeout);
  }, [focusPostId]);

  // Reset scroll ref when focusPostId changes
  useEffect(() => {
    hasScrolledToFocusRef.current = false;
  }, [focusPostId]);

  return (
    <div ref={containerRef} className="space-y-0">
      {groups.map((group, index) => (
        <MilestoneSection 
          key={group.milestone?.id || "unknown"} 
          group={group} 
          index={index}
          forceExpanded={focusMilestoneId === group.milestone?.id}
        />
      ))}
    </div>
  );
}

interface MilestoneSectionProps {
  group: MilestoneGroup;
  index: number;
  forceExpanded?: boolean;
}

function MilestoneSection({ group, index, forceExpanded }: MilestoneSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true); // All milestones expanded by default

  // Expand when forceExpanded becomes true
  useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  return (
    <section className="border-b border-border last:border-b-0">
      {/* Days and posts - each day has combined milestone+day header */}
      {isExpanded && (
        <div>
          {group.days.map((day) => (
            <DaySection 
              key={day.dayNumber} 
              day={day} 
              milestoneNumber={group.milestoneNumber}
              milestoneName={group.milestoneName}
              onToggleExpanded={() => setIsExpanded(!isExpanded)}
            />
          ))}
        </div>
      )}
      
      {/* Collapsed state - show compact milestone header */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-1.5",
            "bg-gradient-to-r from-[#fff5eb] to-[#f0f9ee]",
            "hover:from-[#ffead6] hover:to-[#e5f5e1] transition-all"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-saffron to-saffron-dark text-white flex items-center justify-center text-xs font-bold">
              {group.milestoneNumber}
            </div>
            <span className="text-sm font-medium text-foreground">{group.milestoneName}</span>
            <span className="text-xs text-muted-foreground">
              ({group.days.reduce((sum, day) => sum + day.posts.length, 0)} opslag)
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </section>
  );
}

interface DaySectionProps {
  day: DayGroup;
  milestoneNumber: string;
  milestoneName: string;
  onToggleExpanded: () => void;
}

function DaySection({ day, milestoneNumber, milestoneName, onToggleExpanded }: DaySectionProps) {
  return (
    <div>
      {/* Combined milestone + day header - compact, non-sticky */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-[#fff5eb] to-[#f0f9ee] border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          {/* Compact milestone badge */}
          <button
            onClick={onToggleExpanded}
            className="w-5 h-5 rounded-full bg-gradient-to-br from-saffron to-saffron-dark text-white flex items-center justify-center text-xs font-bold flex-shrink-0 hover:scale-110 transition-transform"
          >
            {milestoneNumber}
          </button>
          {/* Milestone name + day info */}
          <div className="flex items-center gap-1.5 min-w-0 text-sm">
            <span className="font-semibold text-foreground truncate">{milestoneName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground whitespace-nowrap">{day.label}</span>
          </div>
        </div>
        {/* Post count */}
        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
          {day.posts.length} {day.posts.length === 1 ? "opslag" : "opslag"}
        </span>
      </div>

      {/* Posts for this day */}
      <div>
        {day.posts.map((post) => (
          <div key={post.id} id={`post-${post.id}`}>
            <PostFeedCard post={post} showDayBadge={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
