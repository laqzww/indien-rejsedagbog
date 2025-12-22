"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import { PostFeedCard } from "./PostFeedCard";
import { cn } from "@/lib/utils";
import { ChevronDown, Calendar } from "lucide-react";
import type { MilestoneGroup, DayGroup } from "@/lib/journey";

// Context to share scroll state between components
const ScrollContext = createContext<{ showHeaders: boolean }>({ showHeaders: true });

interface PostFeedProps {
  groups: MilestoneGroup[];
}

export function PostFeed({ groups }: PostFeedProps) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  // Show headers when at top OR when actively scrolling
  const showHeaders = isAtTop || isScrolling;

  return (
    <ScrollContext.Provider value={{ showHeaders }}>
      <div ref={containerRef} className="space-y-0">
        {groups.map((group, index) => (
          <MilestoneSection key={group.milestone?.id || "unknown"} group={group} index={index} />
        ))}
      </div>
    </ScrollContext.Provider>
  );
}

interface MilestoneSectionProps {
  group: MilestoneGroup;
  index: number;
}

function MilestoneSection({ group, index }: MilestoneSectionProps) {
  const [isExpanded, setIsExpanded] = useState(index === 0); // First milestone expanded by default
  const { showHeaders } = useContext(ScrollContext);

  const totalPosts = group.days.reduce((sum, day) => sum + day.posts.length, 0);

  return (
    <section className="border-b border-border last:border-b-0">
      {/* Milestone header - sticky, solid background, auto-hide when not scrolling (but visible at top) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full sticky top-0 z-20",
          "bg-gradient-to-r from-[#fff5eb] to-[#f0f9ee]", // Solid pastel gradient (saffron-tinted to green-tinted)
          "flex items-center justify-between px-4 py-3",
          "hover:from-[#ffead6] hover:to-[#e5f5e1] transition-all duration-300",
          "border-b border-border",
          // Auto-hide when not scrolling (but always visible at top)
          showHeaders 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 -translate-y-full pointer-events-none"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Milestone number badge */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron to-saffron-dark text-white flex items-center justify-center text-sm font-bold shadow-sm">
            {group.milestoneNumber}
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
  const { showHeaders } = useContext(ScrollContext);
  
  return (
    <div>
      {/* Day header - solid background, auto-hide when not scrolling (but visible at top) */}
      <div 
        className={cn(
          "sticky top-[57px] z-10 bg-white px-4 py-2 border-b border-border/50",
          "transition-all duration-300",
          // Auto-hide when not scrolling (but always visible at top)
          showHeaders 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 -translate-y-full pointer-events-none"
        )}
      >
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
