import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cn, formatDate, formatRelativeDate, slugify } from "@/lib/utils";

describe("utils.ts", () => {
  describe("cn (className merge)", () => {
    it("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("handles conditional classes", () => {
      const isActive = true;
      const isDisabled = false;
      expect(cn("base", isActive && "active", isDisabled && "disabled")).toBe(
        "base active"
      );
    });

    it("merges Tailwind classes correctly (last wins)", () => {
      expect(cn("p-4", "p-2")).toBe("p-2");
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });

    it("handles arrays and objects", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
      expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
    });

    it("handles undefined and null", () => {
      expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
    });
  });

  describe("formatDate", () => {
    it("formats date string in Danish locale", () => {
      const result = formatDate("2025-12-25");
      expect(result).toContain("25");
      expect(result).toContain("december");
      expect(result).toContain("2025");
    });

    it("formats Date object", () => {
      const date = new Date("2025-01-01T12:00:00Z");
      const result = formatDate(date);
      expect(result).toContain("2025");
    });

    it("handles different months", () => {
      expect(formatDate("2025-06-15")).toContain("juni");
      expect(formatDate("2025-03-20")).toContain("marts");
    });
  });

  describe("formatRelativeDate", () => {
    beforeEach(() => {
      // Mock current date to 2025-12-25 noon UTC
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-25T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "I dag" for today', () => {
      expect(formatRelativeDate("2025-12-25T08:00:00Z")).toBe("I dag");
    });

    it('returns "I går" for yesterday', () => {
      // Use a time far enough in the past (over 24 hours ago)
      expect(formatRelativeDate("2025-12-24T06:00:00Z")).toBe("I går");
    });

    it("returns days ago for 2-6 days", () => {
      expect(formatRelativeDate("2025-12-23T06:00:00Z")).toBe("2 dage siden");
      expect(formatRelativeDate("2025-12-20T06:00:00Z")).toBe("5 dage siden");
    });

    it("returns weeks ago for 7-29 days", () => {
      expect(formatRelativeDate("2025-12-18T06:00:00Z")).toBe("1 uger siden");
      expect(formatRelativeDate("2025-12-11T06:00:00Z")).toBe("2 uger siden");
    });

    it("returns formatted date for 30+ days", () => {
      const result = formatRelativeDate("2025-11-01T12:00:00Z");
      expect(result).toContain("november");
      expect(result).toContain("2025");
    });
  });

  describe("slugify", () => {
    it("converts to lowercase", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("replaces spaces with hyphens", () => {
      expect(slugify("foo bar baz")).toBe("foo-bar-baz");
    });

    it("handles Danish characters", () => {
      expect(slugify("Æble")).toBe("aeble");
      expect(slugify("Ørsted")).toBe("oersted");
      expect(slugify("Århus")).toBe("aarhus");
    });

    it("removes special characters", () => {
      expect(slugify("Hello! World?")).toBe("hello-world");
      expect(slugify("foo@bar#baz")).toBe("foo-bar-baz");
    });

    it("removes leading and trailing hyphens", () => {
      expect(slugify("  Hello World  ")).toBe("hello-world");
      expect(slugify("---foo---")).toBe("foo");
    });

    it("handles numbers", () => {
      expect(slugify("Day 1 Adventure")).toBe("day-1-adventure");
    });

    it("collapses multiple hyphens", () => {
      expect(slugify("foo   bar")).toBe("foo-bar");
      expect(slugify("foo---bar")).toBe("foo-bar");
    });

    it("handles empty string", () => {
      expect(slugify("")).toBe("");
    });
  });
});
