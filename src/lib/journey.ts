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
 * Result type for findMilestoneForDate - can be a milestone, or a special marker
 */
export type MilestoneResult = 
  | { type: "milestone"; milestone: Milestone }
  | { type: "before_journey" }
  | { type: "after_journey" };

/**
 * Find which milestone a post belongs to based on its date
 * Posts are assigned to the milestone whose date range they fall within
 * Returns special markers for posts before/after the journey
 */
export function findMilestoneForDate(
  date: Date | string,
  milestones: Milestone[]
): MilestoneResult | null {
  const d = typeof date === "string" ? new Date(date) : date;
  
  // Sort milestones by display_order (chronological order)
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.display_order - b.display_order
  );
  
  if (sortedMilestones.length === 0) {
    return null;
  }
  
  // Check if date is before the journey started
  const firstMilestone = sortedMilestones[0];
  if (firstMilestone.arrival_date) {
    const firstArrival = new Date(firstMilestone.arrival_date);
    firstArrival.setHours(0, 0, 0, 0);
    if (d < firstArrival) {
      return { type: "before_journey" };
    }
  }
  
  // Check if date is after the journey ended (last milestone has departure_date and date is after it)
  const lastMilestone = sortedMilestones[sortedMilestones.length - 1];
  if (lastMilestone.departure_date) {
    const lastDeparture = new Date(lastMilestone.departure_date);
    lastDeparture.setHours(23, 59, 59, 999);
    if (d > lastDeparture) {
      return { type: "after_journey" };
    }
  }
  
  // Find which milestone the date belongs to
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
        return { type: "milestone", milestone };
      }
    } else if (nextMilestone?.arrival_date) {
      // Otherwise, milestone extends until next milestone arrives
      const nextArrival = new Date(nextMilestone.arrival_date);
      nextArrival.setHours(0, 0, 0, 0);
      
      if (d >= arrivalDate && d < nextArrival) {
        return { type: "milestone", milestone };
      }
    } else {
      // Last milestone without departure - extends indefinitely (journey ongoing)
      if (d >= arrivalDate) {
        return { type: "milestone", milestone };
      }
    }
  }
  
  // Fallback to first milestone if no match found (shouldn't happen with proper data)
  return { type: "milestone", milestone: firstMilestone };
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
    thumbnail_path: string | null;
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
 * Helper to create day groups from a list of posts
 */
function createDayGroups(posts: PostWithDayInfo[]): DayGroup[] {
  const dayMap = new Map<number, PostWithDayInfo[]>();
  for (const post of posts) {
    if (!dayMap.has(post.dayNumber)) {
      dayMap.set(post.dayNumber, []);
    }
    dayMap.get(post.dayNumber)!.push(post);
  }
  
  // Sort days (newest first)
  const sortedDays = Array.from(dayMap.entries()).sort((a, b) => b[0] - a[0]);
  
  return sortedDays.map(([dayNumber, dayPosts]) => ({
    dayNumber,
    label: formatDayWithDate(dayNumber),
    // Sort posts within day by time (newest first)
    posts: dayPosts.sort(
      (a, b) =>
        new Date(b.captured_at || b.created_at).getTime() -
        new Date(a.captured_at || a.created_at).getTime()
    ),
  }));
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
    thumbnail_path: string | null;
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
  // Create maps for different post categories
  const milestoneMap = new Map<string, Map<number, PostWithDayInfo[]>>();
  const beforeJourneyPosts: PostWithDayInfo[] = [];
  const afterJourneyPosts: PostWithDayInfo[] = [];
  const unknownPosts: PostWithDayInfo[] = [];
  
  for (const post of posts) {
    const postDate = post.captured_at || post.created_at;
    const dayNumber = getDayNumber(postDate);
    const result = findMilestoneForDate(postDate, milestones);
    
    // Sort media by display_order to ensure correct order
    const sortedMedia = [...post.media].sort(
      (a, b) => a.display_order - b.display_order
    );
    
    const postWithDay: PostWithDayInfo = {
      ...post,
      media: sortedMedia,
      dayNumber,
    };
    
    if (!result) {
      // No milestones defined
      unknownPosts.push(postWithDay);
    } else if (result.type === "before_journey") {
      beforeJourneyPosts.push(postWithDay);
    } else if (result.type === "after_journey") {
      afterJourneyPosts.push(postWithDay);
    } else {
      // result.type === "milestone"
      const milestone = result.milestone;
      if (!milestoneMap.has(milestone.id)) {
        milestoneMap.set(milestone.id, new Map());
      }
      const dayMap = milestoneMap.get(milestone.id)!;
      if (!dayMap.has(dayNumber)) {
        dayMap.set(dayNumber, []);
      }
      dayMap.get(dayNumber)!.push(postWithDay);
    }
  }
  
  // Sort milestones by display_order (descending - newest/most recent first)
  const sortedMilestones = [...milestones].sort(
    (a, b) => b.display_order - a.display_order
  );
  
  // Build the result, only including milestones that have posts
  const result: MilestoneGroup[] = [];
  
  // Add "Efter rejsen" first (newest - at the top)
  if (afterJourneyPosts.length > 0) {
    result.push({
      milestone: null,
      milestoneName: "Efter rejsen",
      days: createDayGroups(afterJourneyPosts),
    });
  }
  
  // Add milestone groups (newest first based on display_order)
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
  
  // Add "Før afrejse" last (oldest - at the bottom)
  if (beforeJourneyPosts.length > 0) {
    result.push({
      milestone: null,
      milestoneName: "Før afrejse",
      days: createDayGroups(beforeJourneyPosts),
    });
  }
  
  // Add unknown posts (when no milestones exist) at the end
  if (unknownPosts.length > 0) {
    result.push({
      milestone: null,
      milestoneName: "Opslag",
      days: createDayGroups(unknownPosts),
    });
  }
  
  return result;
}
