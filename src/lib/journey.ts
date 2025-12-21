import type { Milestone } from "@/types/database";

// Journey start date - Dag 0
const JOURNEY_START_DATE = new Date("2025-12-18T00:00:00");

/**
 * Calculate which day of the journey a date falls on
 * Day 0 = December 18, 2025
 */
export function getDayNumber(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - JOURNEY_START_DATE.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Format day number as "Dag X"
 */
export function formatDayLabel(dayNumber: number): string {
  return `Dag ${dayNumber}`;
}

/**
 * Get the date for a specific day number
 */
export function getDateFromDayNumber(dayNumber: number): Date {
  const date = new Date(JOURNEY_START_DATE);
  date.setDate(date.getDate() + dayNumber);
  return date;
}

/**
 * Format a day number with the actual date
 */
export function formatDayWithDate(dayNumber: number): string {
  const date = getDateFromDayNumber(dayNumber);
  const dateStr = date.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
  });
  return `Dag ${dayNumber} · ${dateStr}`;
}

/**
 * Find which milestone a post belongs to based on its date
 * Posts are assigned to the milestone whose date range they fall within
 */
export function findMilestoneForDate(
  date: Date | string,
  milestones: Milestone[]
): Milestone | null {
  const d = typeof date === "string" ? new Date(date) : date;
  
  // Sort milestones by display_order
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.display_order - b.display_order
  );
  
  for (let i = 0; i < sortedMilestones.length; i++) {
    const milestone = sortedMilestones[i];
    const nextMilestone = sortedMilestones[i + 1];
    
    if (!milestone.arrival_date) continue;
    
    const arrivalDate = new Date(milestone.arrival_date);
    arrivalDate.setHours(0, 0, 0, 0);
    
    // If milestone has departure date, use it
    if (milestone.departure_date) {
      const departureDate = new Date(milestone.departure_date);
      departureDate.setHours(23, 59, 59, 999);
      
      if (d >= arrivalDate && d <= departureDate) {
        return milestone;
      }
    } else if (nextMilestone?.arrival_date) {
      // Otherwise, milestone extends until next milestone arrives
      const nextArrival = new Date(nextMilestone.arrival_date);
      nextArrival.setHours(0, 0, 0, 0);
      
      if (d >= arrivalDate && d < nextArrival) {
        return milestone;
      }
    } else {
      // Last milestone - extends indefinitely
      if (d >= arrivalDate) {
        return milestone;
      }
    }
  }
  
  // If date is before first milestone, assign to first milestone
  if (sortedMilestones.length > 0) {
    return sortedMilestones[0];
  }
  
  return null;
}

// Types for grouped posts
export interface PostWithDayInfo {
  id: string;
  body: string;
  location_name: string | null;
  captured_at: string | null;
  created_at: string;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  dayNumber: number;
  media: Array<{
    id: string;
    type: string;
    storage_path: string;
    width: number | null;
    height: number | null;
    display_order: number;
  }>;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface DayGroup {
  dayNumber: number;
  label: string;
  posts: PostWithDayInfo[];
}

export interface MilestoneGroup {
  milestone: Milestone | null;
  milestoneName: string;
  days: DayGroup[];
}

/**
 * Group posts by milestone and then by day
 */
export function groupPostsByMilestoneAndDay<T extends {
  id: string;
  body: string;
  location_name: string | null;
  captured_at: string | null;
  created_at: string;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  media: Array<{
    id: string;
    type: string;
    storage_path: string;
    width: number | null;
    height: number | null;
    display_order: number;
  }>;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}>(
  posts: T[],
  milestones: Milestone[]
): MilestoneGroup[] {
  // Create a map of milestone -> day -> posts
  const milestoneMap = new Map<string, Map<number, PostWithDayInfo[]>>();
  const unknownPosts: PostWithDayInfo[] = [];
  
  for (const post of posts) {
    const postDate = post.captured_at || post.created_at;
    const dayNumber = getDayNumber(postDate);
    const milestone = findMilestoneForDate(postDate, milestones);
    
    // Sort media by display_order to ensure correct order
    const sortedMedia = [...post.media].sort(
      (a, b) => a.display_order - b.display_order
    );
    
    const postWithDay: PostWithDayInfo = {
      ...post,
      media: sortedMedia,
      dayNumber,
    };
    
    if (milestone) {
      if (!milestoneMap.has(milestone.id)) {
        milestoneMap.set(milestone.id, new Map());
      }
      const dayMap = milestoneMap.get(milestone.id)!;
      if (!dayMap.has(dayNumber)) {
        dayMap.set(dayNumber, []);
      }
      dayMap.get(dayNumber)!.push(postWithDay);
    } else {
      unknownPosts.push(postWithDay);
    }
  }
  
  // Sort milestones by display_order
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.display_order - b.display_order
  );
  
  // Build the result, only including milestones that have posts
  const result: MilestoneGroup[] = [];
  
  for (const milestone of sortedMilestones) {
    const dayMap = milestoneMap.get(milestone.id);
    if (!dayMap || dayMap.size === 0) continue;
    
    // Sort days (newest first)
    const sortedDays = Array.from(dayMap.entries()).sort((a, b) => b[0] - a[0]);
    
    const days: DayGroup[] = sortedDays.map(([dayNumber, dayPosts]) => ({
      dayNumber,
      label: formatDayWithDate(dayNumber),
      // Sort posts within day by time (newest first)
      posts: dayPosts.sort(
        (a, b) =>
          new Date(b.captured_at || b.created_at).getTime() -
          new Date(a.captured_at || a.created_at).getTime()
      ),
    }));
    
    result.push({
      milestone,
      milestoneName: milestone.name,
      days,
    });
  }
  
  // Add unknown posts if any
  if (unknownPosts.length > 0) {
    const dayMap = new Map<number, PostWithDayInfo[]>();
    for (const post of unknownPosts) {
      if (!dayMap.has(post.dayNumber)) {
        dayMap.set(post.dayNumber, []);
      }
      dayMap.get(post.dayNumber)!.push(post);
    }
    
    const sortedDays = Array.from(dayMap.entries()).sort((a, b) => b[0] - a[0]);
    
    result.unshift({
      milestone: null,
      milestoneName: "Før afrejse",
      days: sortedDays.map(([dayNumber, dayPosts]) => ({
        dayNumber,
        label: formatDayWithDate(dayNumber),
        posts: dayPosts.sort(
          (a, b) =>
            new Date(b.captured_at || b.created_at).getTime() -
            new Date(a.captured_at || a.created_at).getTime()
        ),
      })),
    });
  }
  
  return result;
}
