import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDayNumber,
  formatDayLabel,
  getDateFromDayNumber,
  formatDayWithDate,
  findMilestoneForDate,
  groupPostsByMilestoneAndDay,
  isJourneyEnded,
  type MilestoneResult,
} from "@/lib/journey";
import type { Milestone } from "@/types/database";

// Mock environment variable for journey start date
vi.stubEnv("NEXT_PUBLIC_JOURNEY_START_DATE", "2025-12-18");

// Helper to create test milestones
function createMilestone(
  overrides: Partial<Milestone> & { id: string; name: string; lat: number; lng: number }
): Milestone {
  return {
    created_at: "2025-12-01T00:00:00Z",
    arrival_date: null,
    departure_date: null,
    description: null,
    display_order: 0,
    cover_image_path: null,
    ...overrides,
  };
}

describe("journey.ts", () => {
  describe("getDayNumber", () => {
    it("returns 0 for journey start date", () => {
      expect(getDayNumber("2025-12-18")).toBe(0);
      expect(getDayNumber(new Date("2025-12-18T12:00:00"))).toBe(0);
    });

    it("returns correct day number for dates after start", () => {
      expect(getDayNumber("2025-12-19")).toBe(1);
      expect(getDayNumber("2025-12-25")).toBe(7);
      expect(getDayNumber("2026-01-01")).toBe(14);
    });

    it("returns 0 for dates before journey start (clamped)", () => {
      expect(getDayNumber("2025-12-17")).toBe(0);
      expect(getDayNumber("2025-01-01")).toBe(0);
    });

    it("handles Date objects correctly", () => {
      const date = new Date("2025-12-20T15:30:00Z");
      expect(getDayNumber(date)).toBe(2);
    });
  });

  describe("formatDayLabel", () => {
    it("formats day number correctly", () => {
      expect(formatDayLabel(0)).toBe("Dag 0");
      expect(formatDayLabel(1)).toBe("Dag 1");
      expect(formatDayLabel(42)).toBe("Dag 42");
    });
  });

  describe("getDateFromDayNumber", () => {
    it("returns journey start date for day 0", () => {
      const date = getDateFromDayNumber(0);
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(11); // December is month 11
      expect(date.getDate()).toBe(18);
    });

    it("returns correct date for subsequent days", () => {
      const day7 = getDateFromDayNumber(7);
      expect(day7.getFullYear()).toBe(2025);
      expect(day7.getMonth()).toBe(11);
      expect(day7.getDate()).toBe(25); // Christmas!
    });

    it("handles year boundary correctly", () => {
      const day14 = getDateFromDayNumber(14);
      expect(day14.getFullYear()).toBe(2026);
      expect(day14.getMonth()).toBe(0); // January is month 0
      expect(day14.getDate()).toBe(1);
    });
  });

  describe("formatDayWithDate", () => {
    it("includes both day number and formatted date", () => {
      const result = formatDayWithDate(0);
      expect(result).toContain("Dag 0");
      expect(result).toContain("18");
      expect(result).toContain("dec");
    });
  });

  describe("findMilestoneForDate", () => {
    const milestones: Milestone[] = [
      createMilestone({
        id: "1",
        name: "Kochi",
        lat: 9.9312,
        lng: 76.2673,
        display_order: 0,
        arrival_date: "2025-12-18",
        departure_date: "2025-12-22",
      }),
      createMilestone({
        id: "2",
        name: "Munnar",
        lat: 10.0889,
        lng: 77.0595,
        display_order: 1,
        arrival_date: "2025-12-22",
        departure_date: "2025-12-26",
      }),
      createMilestone({
        id: "3",
        name: "Alleppey",
        lat: 9.4981,
        lng: 76.3388,
        display_order: 2,
        arrival_date: "2025-12-26",
        departure_date: null, // Journey ongoing
      }),
    ];

    it("returns before_journey for dates before first milestone", () => {
      const result = findMilestoneForDate("2025-12-17", milestones);
      expect(result).toEqual({ type: "before_journey" });
    });

    it("matches post to correct milestone based on date", () => {
      // During Kochi stay
      const kochi = findMilestoneForDate("2025-12-20", milestones);
      expect(kochi?.type).toBe("milestone");
      if (kochi?.type === "milestone") {
        expect(kochi.milestone.name).toBe("Kochi");
      }

      // During Munnar stay
      const munnar = findMilestoneForDate("2025-12-24", milestones);
      expect(munnar?.type).toBe("milestone");
      if (munnar?.type === "milestone") {
        expect(munnar.milestone.name).toBe("Munnar");
      }
    });

    it("assigns departure date to the departing milestone", () => {
      // On departure day from Kochi (arrival day at Munnar)
      // The logic uses departure_date <= postDate, so departure day belongs to departing milestone
      const result = findMilestoneForDate("2025-12-22", milestones);
      expect(result?.type).toBe("milestone");
      if (result?.type === "milestone") {
        // 22nd is still within Kochi's date range (arrival 18th, departure 22nd)
        expect(result.milestone.name).toBe("Kochi");
      }
    });

    it("handles ongoing journey (no departure date on last milestone)", () => {
      // After arriving at Alleppey
      const result = findMilestoneForDate("2025-12-30", milestones);
      expect(result?.type).toBe("milestone");
      if (result?.type === "milestone") {
        expect(result.milestone.name).toBe("Alleppey");
      }
    });

    it("returns null for empty milestones array", () => {
      const result = findMilestoneForDate("2025-12-20", []);
      expect(result).toBeNull();
    });

    it("handles milestones without arrival dates gracefully", () => {
      const incompleteMilestones: Milestone[] = [
        createMilestone({
          id: "1",
          name: "No dates",
          lat: 10,
          lng: 76,
          display_order: 0,
          arrival_date: null,
        }),
      ];
      // Should return before_journey as fallback
      const result = findMilestoneForDate("2025-12-20", incompleteMilestones);
      expect(result?.type).toBe("before_journey");
    });
  });

  describe("findMilestoneForDate with after_journey", () => {
    const milestonesWithEnd: Milestone[] = [
      createMilestone({
        id: "1",
        name: "First",
        lat: 10,
        lng: 76,
        display_order: 0,
        arrival_date: "2025-12-18",
        departure_date: "2025-12-25",
      }),
    ];

    it("returns after_journey for dates after last departure", () => {
      const result = findMilestoneForDate("2025-12-30", milestonesWithEnd);
      expect(result).toEqual({ type: "after_journey" });
    });
  });

  describe("isJourneyEnded", () => {
    it("returns false for empty milestones array", () => {
      expect(isJourneyEnded([])).toBe(false);
    });

    it("returns false when last milestone has no departure_date", () => {
      const milestones: Milestone[] = [
        createMilestone({
          id: "1",
          name: "Kochi",
          lat: 10,
          lng: 76,
          display_order: 0,
          arrival_date: "2025-12-18",
          departure_date: "2025-12-20",
        }),
        createMilestone({
          id: "2",
          name: "Munnar",
          lat: 10,
          lng: 77,
          display_order: 1,
          arrival_date: "2025-12-20",
          departure_date: null, // Journey ongoing
        }),
      ];
      expect(isJourneyEnded(milestones)).toBe(false);
    });

    it("returns true when today is after last departure_date", () => {
      // Mock today to be January 10, 2026
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));

      const milestones: Milestone[] = [
        createMilestone({
          id: "1",
          name: "Kochi",
          lat: 10,
          lng: 76,
          display_order: 0,
          arrival_date: "2025-12-18",
          departure_date: "2025-12-25",
        }),
      ];
      expect(isJourneyEnded(milestones)).toBe(true);

      vi.useRealTimers();
    });

    it("returns false when today is on or before last departure_date", () => {
      // Mock today to be December 25, 2025 (on departure date)
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-25T12:00:00Z"));

      const milestones: Milestone[] = [
        createMilestone({
          id: "1",
          name: "Kochi",
          lat: 10,
          lng: 76,
          display_order: 0,
          arrival_date: "2025-12-18",
          departure_date: "2025-12-25",
        }),
      ];
      expect(isJourneyEnded(milestones)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("groupPostsByMilestoneAndDay", () => {
    const milestones: Milestone[] = [
      createMilestone({
        id: "1",
        name: "Kochi",
        lat: 9.93,
        lng: 76.26,
        display_order: 0,
        arrival_date: "2025-12-18",
        departure_date: "2025-12-20",
      }),
      createMilestone({
        id: "2",
        name: "Munnar",
        lat: 10.08,
        lng: 77.05,
        display_order: 1,
        arrival_date: "2025-12-20",
        departure_date: "2025-12-23",
      }),
    ];

    const createPost = (id: string, captured_at: string) => ({
      id,
      body: `Post ${id}`,
      location_name: null,
      captured_at,
      created_at: captured_at,
      tags: null,
      lat: null,
      lng: null,
      media: [],
      profile: null,
    });

    describe("when journey is ongoing (newest first)", () => {
      beforeEach(() => {
        // Mock today to be during the journey
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-12-21T12:00:00Z"));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("groups posts by milestone and day with newest first", () => {
        const posts = [
          createPost("1", "2025-12-18T10:00:00Z"),
          createPost("2", "2025-12-18T14:00:00Z"),
          createPost("3", "2025-12-21T10:00:00Z"),
        ];

        const groups = groupPostsByMilestoneAndDay(posts, milestones);

        // Should have 2 milestone groups (Munnar first as it's newest, then Kochi)
        expect(groups.length).toBe(2);

        // First group should be Munnar (newest)
        expect(groups[0].milestoneName).toBe("Munnar");
        expect(groups[0].milestoneNumber).toBe("2");

        // Second group should be Kochi
        expect(groups[1].milestoneName).toBe("Kochi");
        expect(groups[1].milestoneNumber).toBe("1");
      });

      it("places before_journey posts at end", () => {
        const posts = [
          createPost("1", "2025-12-15T10:00:00Z"), // Before journey
          createPost("2", "2025-12-18T10:00:00Z"), // During journey
        ];

        const groups = groupPostsByMilestoneAndDay(posts, milestones);

        // "Før afrejse" should be at the end
        const beforeGroup = groups.find((g) => g.milestoneName === "Før afrejse");
        expect(beforeGroup).toBeDefined();
        expect(beforeGroup?.milestoneNumber).toBe("A");
        expect(beforeGroup?.days[0].posts.length).toBe(1);
        expect(groups[groups.length - 1].milestoneName).toBe("Før afrejse");
      });

      it("sorts posts within day by time (newest first)", () => {
        const posts = [
          createPost("1", "2025-12-18T08:00:00Z"),
          createPost("2", "2025-12-18T16:00:00Z"),
          createPost("3", "2025-12-18T12:00:00Z"),
        ];

        const groups = groupPostsByMilestoneAndDay(posts, milestones);
        const kochiGroup = groups.find((g) => g.milestoneName === "Kochi");
        const day0Posts = kochiGroup?.days[0].posts;

        expect(day0Posts?.[0].id).toBe("2"); // 16:00 first
        expect(day0Posts?.[1].id).toBe("3"); // 12:00 second
        expect(day0Posts?.[2].id).toBe("1"); // 08:00 last
      });
    });

    describe("when journey has ended (oldest first / chronological)", () => {
      beforeEach(() => {
        // Mock today to be after the journey
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("groups posts by milestone and day with oldest first", () => {
        const posts = [
          createPost("1", "2025-12-18T10:00:00Z"),
          createPost("2", "2025-12-18T14:00:00Z"),
          createPost("3", "2025-12-21T10:00:00Z"),
        ];

        const groups = groupPostsByMilestoneAndDay(posts, milestones);

        // Should have 2 milestone groups (Kochi first as it's oldest, then Munnar)
        expect(groups.length).toBe(2);

        // First group should be Kochi (oldest)
        expect(groups[0].milestoneName).toBe("Kochi");
        expect(groups[0].milestoneNumber).toBe("1");

        // Second group should be Munnar
        expect(groups[1].milestoneName).toBe("Munnar");
        expect(groups[1].milestoneNumber).toBe("2");
      });

      it("places before_journey posts at start", () => {
        const posts = [
          createPost("1", "2025-12-15T10:00:00Z"), // Before journey
          createPost("2", "2025-12-18T10:00:00Z"), // During journey
        ];

        const groups = groupPostsByMilestoneAndDay(posts, milestones);

        // "Før afrejse" should be at the start
        expect(groups[0].milestoneName).toBe("Før afrejse");
        expect(groups[0].milestoneNumber).toBe("A");
      });

      it("sorts posts within day by time (oldest first)", () => {
        const posts = [
          createPost("1", "2025-12-18T08:00:00Z"),
          createPost("2", "2025-12-18T16:00:00Z"),
          createPost("3", "2025-12-18T12:00:00Z"),
        ];

        const groups = groupPostsByMilestoneAndDay(posts, milestones);
        const kochiGroup = groups.find((g) => g.milestoneName === "Kochi");
        const day0Posts = kochiGroup?.days[0].posts;

        expect(day0Posts?.[0].id).toBe("1"); // 08:00 first
        expect(day0Posts?.[1].id).toBe("3"); // 12:00 second
        expect(day0Posts?.[2].id).toBe("2"); // 16:00 last
      });
    });

    it("handles empty posts array", () => {
      const groups = groupPostsByMilestoneAndDay([], milestones);
      expect(groups).toEqual([]);
    });

    it("handles empty milestones array", () => {
      const posts = [createPost("1", "2025-12-18T10:00:00Z")];
      const groups = groupPostsByMilestoneAndDay(posts, []);

      // Should fall back to "Opslag" group
      expect(groups.length).toBe(1);
      expect(groups[0].milestoneName).toBe("Opslag");
      expect(groups[0].milestoneNumber).toBe("?");
    });
  });
});
