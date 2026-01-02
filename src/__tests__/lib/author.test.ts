import { describe, it, expect, vi, beforeEach } from "vitest";
import { isEmailAllowlisted, getIsAuthor } from "@/lib/author";

describe("author.ts", () => {
  describe("isEmailAllowlisted", () => {
    // Note: ADMIN_EMAILS is parsed at module load time from process.env
    // In tests, it's empty since it wasn't set before module import
    // These tests validate the function logic with the empty allowlist

    it("returns false for non-allowlisted email", () => {
      expect(isEmailAllowlisted("random@user.com")).toBe(false);
    });

    it("returns false for null or undefined email", () => {
      expect(isEmailAllowlisted(null)).toBe(false);
      expect(isEmailAllowlisted(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isEmailAllowlisted("")).toBe(false);
      expect(isEmailAllowlisted("   ")).toBe(false);
    });
  });

  describe("getIsAuthor", () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns false for null user", async () => {
      const result = await getIsAuthor(mockSupabase, null);
      expect(result).toBe(false);
    });

    it("checks profile.is_author for users", async () => {
      const user = { id: "456", email: "regular@user.com" };

      const mockSupabaseWithProfile = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { is_author: true },
                  error: null,
                })
              ),
            })),
          })),
        })),
      };

      const result = await getIsAuthor(mockSupabaseWithProfile, user);
      expect(result).toBe(true);
    });

    it("returns false if profile.is_author is false", async () => {
      const user = { id: "789", email: "regular@user.com" };

      const mockSupabaseNotAuthor = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { is_author: false },
                  error: null,
                })
              ),
            })),
          })),
        })),
      };

      const result = await getIsAuthor(mockSupabaseNotAuthor, user);
      expect(result).toBe(false);
    });

    it("returns false if no profile exists", async () => {
      const user = { id: "000", email: "noone@nowhere.com" };

      const mockSupabaseNoProfile = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: null,
                  error: null,
                })
              ),
            })),
          })),
        })),
      };

      const result = await getIsAuthor(mockSupabaseNoProfile, user);
      expect(result).toBe(false);
    });
  });
});
