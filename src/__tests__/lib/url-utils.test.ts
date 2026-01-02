import { describe, it, expect, vi } from "vitest";
import { getMediaUrl, isStoragePath, getAvatarUrl } from "@/lib/url-utils";

// Mock environment variable
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");

describe("url-utils.ts", () => {
  describe("getMediaUrl", () => {
    it("constructs correct Supabase storage URL", () => {
      const path = "posts/123/image.jpg";
      const url = getMediaUrl(path);
      expect(url).toBe(
        "https://test-project.supabase.co/storage/v1/object/public/media/posts/123/image.jpg"
      );
    });

    it("handles paths with special characters", () => {
      const path = "posts/abc-def_123/photo (1).jpg";
      const url = getMediaUrl(path);
      expect(url).toContain("photo (1).jpg");
    });

    it("handles nested paths", () => {
      const path = "avatars/user123/profile/avatar.png";
      const url = getMediaUrl(path);
      expect(url).toBe(
        "https://test-project.supabase.co/storage/v1/object/public/media/avatars/user123/profile/avatar.png"
      );
    });
  });

  describe("isStoragePath", () => {
    it("returns true for storage paths", () => {
      expect(isStoragePath("posts/123/image.jpg")).toBe(true);
      expect(isStoragePath("avatars/user.png")).toBe(true);
      expect(isStoragePath("media/video.mp4")).toBe(true);
    });

    it("returns false for http URLs", () => {
      expect(isStoragePath("http://example.com/image.jpg")).toBe(false);
    });

    it("returns false for https URLs", () => {
      expect(isStoragePath("https://example.com/image.jpg")).toBe(false);
      expect(isStoragePath("https://cdn.supabase.co/media/image.jpg")).toBe(
        false
      );
    });

    it("handles edge cases", () => {
      expect(isStoragePath("")).toBe(true); // Empty string is not a URL
      expect(isStoragePath("/absolute/path.jpg")).toBe(true);
    });
  });

  describe("getAvatarUrl", () => {
    it("returns full Supabase URL for storage paths", () => {
      const path = "avatars/user123.jpg";
      const url = getAvatarUrl(path);
      expect(url).toBe(
        "https://test-project.supabase.co/storage/v1/object/public/media/avatars/user123.jpg"
      );
    });

    it("returns original URL for external http URLs", () => {
      const externalUrl = "http://gravatar.com/avatar/abc123";
      expect(getAvatarUrl(externalUrl)).toBe(externalUrl);
    });

    it("returns original URL for external https URLs", () => {
      const externalUrl = "https://cdn.example.com/avatars/user.jpg";
      expect(getAvatarUrl(externalUrl)).toBe(externalUrl);
    });
  });
});
