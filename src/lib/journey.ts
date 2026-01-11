import type { Milestone } from "@/types/database";

// Journey start date - Dag 0
// Can be overridden via NEXT_PUBLIC_JOURNEY_START_DATE environment variable
const DEFAULT_JOURNEY_START_DATE = "2025-12-18";

function getJourneyStartDate(): Date {
  const envDate = process.env.NEXT_PUBLIC_JOURNEY_START_DATE;
  const dateStr = envDate && /^\d{4}-\d{2}-\d{2}$/.test(envDate) 
    ? envDate 
    : DEFAULT_JOURNEY_START_DATE;
  return new Date(`${dateStr}T00:00:00`);
}

// Memoize the journey start date to avoid repeated parsing
let _journeyStartDate: Date | null = null;
function getJourneyStartDateCached(): Date {
  if (!_journeyStartDate) {
    _journeyStartDate = getJourneyStartDate();
  }
  return _journeyStartDate;
}

/**
 * Calculate which day of the journey a date falls on
 * Day 0 = December 18, 2025
 */
export function getDayNumber(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const journeyStart = getJourneyStartDateCached();
  const diffMs = d.getTime() - journeyStart.getTime();
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
  const journeyStart = getJourneyStartDateCached();
  const date = new Date(journeyStart);
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
 * Normalize a date to YYYY-MM-DD integer for consistent comparison
 * This avoids timezone issues when comparing dates
 */
function toDateInt(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  // Use UTC to avoid timezone shifts
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return year * 10000 + month * 100 + day;
}

/**
 * Parse a date-only string (YYYY-MM-DD) to an integer
 */
function parseDateOnlyInt(dateStr: string): number {
  // arrival_date/departure_date are typically "YYYY-MM-DD" format
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length >= 3) {
    return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
  }
  // Fallback: parse as Date and use UTC
  return toDateInt(new Date(dateStr));
}

/**
 * Get today's date as an integer (YYYYMMDD format)
 * Uses local time for comparison with journey dates
 */
function getTodayDateInt(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return year * 10000 + month * 100 + day;
}

/**
 * Check if the journey has ended based on milestones
 * Returns true if today's date is after the last milestone's departure_date
 * 
 * Note: The journey is considered "ended" the day AFTER the last departure_date,
 * so posts are shown newest-first until the journey is truly over.
 */
export function isJourneyEnded(milestones: Milestone[]): boolean {
  if (milestones.length === 0) return false;
  
  // Sort milestones by display_order to find the last one
  const sortedMilestones = [...milestones].sort(
    (a, b) => b.display_order - a.display_order
  );
  
  const lastMilestone = sortedMilestones[0];
  
  // If last milestone has no departure_date, journey is still ongoing
  if (!lastMilestone.departure_date) return false;
  
  const lastDepartureInt = parseDateOnlyInt(lastMilestone.departure_date);
  const todayInt = getTodayDateInt();
  
  // Journey is ended if today is AFTER the departure date
  // (the day after departure_date)
  return todayInt > lastDepartureInt;
}

/**
 * Find which milestone a post belongs to based on its date
 * Posts are assigned to the milestone whose date range they fall within
 * Returns special markers for posts before/after the journey
 */
export function findMilestoneForDate(
  date: Date | string,
  milestones: Milestone[]
): MilestoneResult | null {
  const postDateInt = toDateInt(date);
  
  // Sort milestones by display_order (chronological order)
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.display_order - b.display_order
  );
  
  if (sortedMilestones.length === 0) {
    return null;
  }
  
  // Check if date is before the journey started
  // Find the first milestone with an arrival_date
  const firstMilestoneWithDate = sortedMilestones.find(m => m.arrival_date);
  if (firstMilestoneWithDate?.arrival_date) {
    const firstArrivalInt = parseDateOnlyInt(firstMilestoneWithDate.arrival_date);
    if (postDateInt < firstArrivalInt) {
      return { type: "before_journey" };
    }
  }
  
  // Check if date is after the journey ended (last milestone has departure_date and date is after it)
  const lastMilestone = sortedMilestones[sortedMilestones.length - 1];
  if (lastMilestone.departure_date) {
    const lastDepartureInt = parseDateOnlyInt(lastMilestone.departure_date);
    if (postDateInt > lastDepartureInt) {
      return { type: "after_journey" };
    }
  }
  
  // Find which milestone the date belongs to
  for (let i = 0; i < sortedMilestones.length; i++) {
    const milestone = sortedMilestones[i];
    const nextMilestone = sortedMilestones[i + 1];
    
    if (!milestone.arrival_date) continue;
    
    const arrivalInt = parseDateOnlyInt(milestone.arrival_date);
    
    // If milestone has departure date, use it
    if (milestone.departure_date) {
      const departureInt = parseDateOnlyInt(milestone.departure_date);
      
      if (postDateInt >= arrivalInt && postDateInt <= departureInt) {
        return { type: "milestone", milestone };
      }
    } else if (nextMilestone?.arrival_date) {
      // Otherwise, milestone extends until next milestone arrives
      const nextArrivalInt = parseDateOnlyInt(nextMilestone.arrival_date);
      
      if (postDateInt >= arrivalInt && postDateInt < nextArrivalInt) {
        return { type: "milestone", milestone };
      }
    } else {
      // Last milestone without departure - extends indefinitely (journey ongoing)
      if (postDateInt >= arrivalInt) {
        return { type: "milestone", milestone };
      }
    }
  }
  
  // No milestone matched - this means the date falls in a gap or data is incomplete
  // Return before_journey as a safe default rather than incorrectly assigning to a milestone
  return { type: "before_journey" };
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
  /** The display number for this group - matches timeline position, or "A"/"B" for før/efter rejsen */
  milestoneNumber: string;
  days: DayGroup[];
}

/**
 * Helper to create day groups from a list of posts
 * @param posts - Posts to group by day
 * @param newestFirst - If true, sort days and posts newest first. If false, oldest first.
 */
function createDayGroups(posts: PostWithDayInfo[], newestFirst: boolean = true): DayGroup[] {
  const dayMap = new Map<number, PostWithDayInfo[]>();
  for (const post of posts) {
    if (!dayMap.has(post.dayNumber)) {
      dayMap.set(post.dayNumber, []);
    }
    dayMap.get(post.dayNumber)!.push(post);
  }
  
  // Sort days based on direction
  const sortedDays = Array.from(dayMap.entries()).sort((a, b) => 
    newestFirst ? b[0] - a[0] : a[0] - b[0]
  );
  
  return sortedDays.map(([dayNumber, dayPosts]) => ({
    dayNumber,
    label: formatDayWithDate(dayNumber),
    // Sort posts within day by time based on direction
    posts: dayPosts.sort((a, b) => {
      const timeA = new Date(a.captured_at || a.created_at).getTime();
      const timeB = new Date(b.captured_at || b.created_at).getTime();
      return newestFirst ? timeB - timeA : timeA - timeB;
    }),
  }));
}

/**
 * Group posts by milestone and then by day
 * 
 * Sorting behavior:
 * - While journey is ongoing: newest posts/days/milestones first
 * - After journey ends (day after last milestone's departure_date): oldest first (chronological)
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
  // Determine sort direction based on whether journey has ended
  const journeyEnded = isJourneyEnded(milestones);
  const newestFirst = !journeyEnded; // When journey is ongoing, show newest first
  
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
  
  // Sort milestones by display_order based on direction
  // newestFirst=true: descending (newest/most recent first)
  // newestFirst=false: ascending (oldest/chronological first)
  const sortedMilestones = [...milestones].sort((a, b) => 
    newestFirst 
      ? b.display_order - a.display_order 
      : a.display_order - b.display_order
  );
  
  // Build the result, only including milestones that have posts
  const result: MilestoneGroup[] = [];
  
  // Create a map from milestone ID to its chronological position (1-indexed)
  const chronologicalMilestones = [...milestones].sort(
    (a, b) => a.display_order - b.display_order
  );
  const milestonePositionMap = new Map<string, number>();
  chronologicalMilestones.forEach((m, idx) => {
    milestonePositionMap.set(m.id, idx + 1);
  });
  
  // When journey is ongoing (newestFirst): "Efter rejsen" first, then milestones, then "Før afrejse"
  // When journey ended (!newestFirst): "Før afrejse" first, then milestones, then "Efter rejsen"
  
  if (newestFirst) {
    // Journey ongoing: newest first
    
    // Add "Efter rejsen" first (newest - at the top)
    if (afterJourneyPosts.length > 0) {
      result.push({
        milestone: null,
        milestoneName: "Efter rejsen",
        milestoneNumber: "B",
        days: createDayGroups(afterJourneyPosts, newestFirst),
      });
    }
    
    // Add milestone groups (newest first based on display_order)
    for (const milestone of sortedMilestones) {
      const dayMap = milestoneMap.get(milestone.id);
      if (!dayMap || dayMap.size === 0) continue;
      
      // Sort days based on direction
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
        milestoneNumber: String(milestonePositionMap.get(milestone.id) ?? "?"),
        days,
      });
    }
    
    // Add "Før afrejse" last (oldest - at the bottom)
    if (beforeJourneyPosts.length > 0) {
      result.push({
        milestone: null,
        milestoneName: "Før afrejse",
        milestoneNumber: "A",
        days: createDayGroups(beforeJourneyPosts, newestFirst),
      });
    }
  } else {
    // Journey ended: oldest first (chronological)
    
    // Add "Før afrejse" first (oldest - at the top)
    if (beforeJourneyPosts.length > 0) {
      result.push({
        milestone: null,
        milestoneName: "Før afrejse",
        milestoneNumber: "A",
        days: createDayGroups(beforeJourneyPosts, newestFirst),
      });
    }
    
    // Add milestone groups (oldest first based on display_order)
    for (const milestone of sortedMilestones) {
      const dayMap = milestoneMap.get(milestone.id);
      if (!dayMap || dayMap.size === 0) continue;
      
      // Sort days based on direction (oldest first)
      const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0] - b[0]);
      
      const days: DayGroup[] = sortedDays.map(([dayNumber, dayPosts]) => ({
        dayNumber,
        label: formatDayWithDate(dayNumber),
        // Sort posts within day by time (oldest first)
        posts: dayPosts.sort(
          (a, b) =>
            new Date(a.captured_at || a.created_at).getTime() -
            new Date(b.captured_at || b.created_at).getTime()
        ),
      }));
      
      result.push({
        milestone,
        milestoneName: milestone.name,
        milestoneNumber: String(milestonePositionMap.get(milestone.id) ?? "?"),
        days,
      });
    }
    
    // Add "Efter rejsen" last (newest - at the bottom)
    if (afterJourneyPosts.length > 0) {
      result.push({
        milestone: null,
        milestoneName: "Efter rejsen",
        milestoneNumber: "B",
        days: createDayGroups(afterJourneyPosts, newestFirst),
      });
    }
  }
  
  // Add unknown posts (when no milestones exist) at the end
  if (unknownPosts.length > 0) {
    result.push({
      milestone: null,
      milestoneName: "Opslag",
      milestoneNumber: "?",
      days: createDayGroups(unknownPosts, newestFirst),
    });
  }
  
  return result;
}
