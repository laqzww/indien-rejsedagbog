"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { PostFeedCard } from "./PostFeedCard";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import type { MilestoneGroup, DayGroup } from "@/lib/journey";
import { useProgressiveRender } from "@/hooks";

interface PostFeedProps {
  groups: MilestoneGroup[];
  focusPostId?: string; // Post ID to scroll to and highlight
}

export function PostFeed({ groups, focusPostId }: PostFeedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledToFocusRef = useRef(false);

  // Calculate total posts for progressive rendering
  const totalPosts = useMemo(() => {
    return groups.reduce((sum, group) =>
      sum + group.days.reduce((daySum, day) => daySum + day.posts.length, 0), 0
    );
  }, [groups]);

  // Calculate minimum posts needed to include the focus post
  const minRenderCount = useMemo(() => {
    if (!focusPostId) return 5;
    let index = 0;
    for (const group of groups) {
      for (const day of group.days) {
        for (const post of day.posts) {
          index++;
          if (post.id === focusPostId) {
            // Render enough to include the focus post plus a few extra
            return Math.max(5, index + 2);
          }
        }
      }
    }
    return 5;
  }, [groups, focusPostId]);

  // Progressive rendering - start with enough posts to include focus post
  const { renderedCount, sentinelRef, isComplete } = useProgressiveRender({
    totalItems: totalPosts,
    initialBatch: minRenderCount,
    batchSize: 3,
    loadMoreThreshold: 600, // Start loading when 600px from bottom
  });

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

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15;

    // Retry until the element exists in the DOM (handles view transitions on iOS)
    function tryScroll() {
      if (cancelled || hasScrolledToFocusRef.current) return;
      attempts++;

      const postElement = document.getElementById(`post-${focusPostId}`);
      if (postElement) {
        // Use requestAnimationFrame to ensure layout is complete before scrolling
        requestAnimationFrame(() => {
          if (cancelled) return;
          postElement.scrollIntoView({ behavior: "instant", block: "center" });

          // Add highlight effect using inline styles for reliability
          postElement.style.boxShadow = "0 0 0 3px #FF9933";
          postElement.style.borderRadius = "8px";
          postElement.style.transition = "box-shadow 0.3s ease";

          setTimeout(() => {
            postElement.style.boxShadow = "";
            postElement.style.borderRadius = "";
          }, 2500);

          hasScrolledToFocusRef.current = true;
        });
      } else if (attempts < maxAttempts) {
        // Element not in DOM yet - retry with increasing delay
        setTimeout(tryScroll, attempts < 3 ? 100 : 200);
      }
    }

    // Initial delay to allow view transition
    setTimeout(tryScroll, 50);

    return () => { cancelled = true; };
  }, [focusPostId]);

  // Reset scroll ref when focusPostId changes
  useEffect(() => {
    hasScrolledToFocusRef.current = false;
  }, [focusPostId]);

  // Track current post index across all groups/days for progressive rendering
  let globalPostIndex = 0;

  return (
    <div ref={containerRef} className="space-y-0">
      {groups.map((group, index) => {
        // Calculate how many posts this group can render
        const groupPostCount = group.days.reduce((sum, day) => sum + day.posts.length, 0);
        const groupStartIndex = globalPostIndex;
        const postsToRenderInGroup = Math.max(0, Math.min(groupPostCount, renderedCount - groupStartIndex));

        // Skip this group entirely if no posts should render
        if (postsToRenderInGroup <= 0) {
          globalPostIndex += groupPostCount;
          return null;
        }

        globalPostIndex += groupPostCount;

        return (
          <MilestoneSection
            key={group.milestone?.id || "unknown"}
            group={group}
            index={index}
            forceExpanded={focusMilestoneId === group.milestone?.id}
            renderLimit={postsToRenderInGroup}
            startIndex={groupStartIndex}
          />
        );
      })}

      {/* Sentinel element for loading more posts */}
      {!isComplete && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center py-8"
        >
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      )}
    </div>
  );
}

interface MilestoneSectionProps {
  group: MilestoneGroup;
  index: number;
  forceExpanded?: boolean;
  renderLimit: number;
  startIndex: number;
}

function MilestoneSection({ group, index, forceExpanded, renderLimit, startIndex }: MilestoneSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true); // All milestones expanded by default

  // Expand when forceExpanded becomes true
  useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  // Track posts rendered across days for this milestone
  let postsRenderedInMilestone = 0;

  return (
    <section className="border-b border-border last:border-b-0">
      {/* Days and posts - each day has combined milestone+day header */}
      {isExpanded && (
        <div>
          {group.days.map((day) => {
            // Calculate how many posts this day can render
            const dayPostCount = day.posts.length;
            const postsToRenderInDay = Math.max(0, Math.min(dayPostCount, renderLimit - postsRenderedInMilestone));

            // Skip this day if no posts should render
            if (postsToRenderInDay <= 0) {
              postsRenderedInMilestone += dayPostCount;
              return null;
            }

            postsRenderedInMilestone += dayPostCount;

            return (
              <DaySection
                key={day.dayNumber}
                day={day}
                milestoneNumber={group.milestoneNumber}
                milestoneName={group.milestoneName}
                onToggleExpanded={() => setIsExpanded(!isExpanded)}
                renderLimit={postsToRenderInDay}
              />
            );
          })}
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
  renderLimit: number;
}

function DaySection({ day, milestoneNumber, milestoneName, onToggleExpanded, renderLimit }: DaySectionProps) {
  // Only render posts up to the limit
  const postsToRender = day.posts.slice(0, renderLimit);

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

      {/* Posts for this day - only render up to limit */}
      <div>
        {postsToRender.map((post) => (
          <div key={post.id} id={`post-${post.id}`}>
            <PostFeedCard post={post} showDayBadge={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
