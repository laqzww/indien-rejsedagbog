"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import { PostFeedCard } from "./PostFeedCard";
import { cn } from "@/lib/utils";
import { ChevronDown, Calendar } from "lucide-react";
import type { MilestoneGroup, DayGroup } from "@/lib/journey";

// Context to share scroll state and focus post between components
const ScrollContext = createContext<{ showHeaders: boolean; focusPostId?: string }>({ showHeaders: true });

interface PostFeedProps {
  groups: MilestoneGroup[];
  focusPostId?: string; // Post ID to scroll to and highlight
}

export function PostFeed({ groups, focusPostId }: PostFeedProps) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  useEffect(() => {
    // Find the scrollable container (the parent with overflow-y-auto)
    const findScrollContainer = (): HTMLElement | null => {
      let el = containerRef.current?.parentElement;
      while (el) {
        const style = getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    const scrollContainer = findScrollContainer();

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      
      // Check if we're at the top of the scroll container
      const scrollTop = target.scrollTop ?? 0;
      setIsAtTop(scrollTop < 10); // Consider "at top" if within 10px

      // Show headers when scrolling starts
      setIsScrolling(true);

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Hide headers after scroll stops (1.5 second delay)
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 1500);
    };

    // Listen to scroll on the main scrollable container
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll);
    }
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll, true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

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

  // Show headers when at top OR when actively scrolling
  const showHeaders = isAtTop || isScrolling;

  return (
    <ScrollContext.Provider value={{ showHeaders, focusPostId }}>
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
    </ScrollContext.Provider>
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
  const { showHeaders } = useContext(ScrollContext);
  
  return (
    <div>
      {/* Combined milestone + day header - compact single bar */}
      <div 
        className={cn(
          "sticky top-0 z-10 bg-gradient-to-r from-[#fff5eb] to-[#f0f9ee] border-b border-border/50",
          "transition-all duration-300",
          showHeaders 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 -translate-y-full pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between px-3 py-1.5">
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
