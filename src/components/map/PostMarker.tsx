"use client";

import { getMediaUrl } from "@/lib/upload";

// Post type for map markers
export interface MapPost {
  id: string;
  body: string;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  created_at: string;
  captured_at: string | null;
  media: {
    id: string;
    type: string;
    storage_path: string;
    thumbnail_path: string | null;
    display_order: number;
  }[];
}

/**
 * Creates the HTML content for a post marker
 * - Image posts: Circular thumbnail
 * - Video posts: Circular thumbnail with play icon overlay
 * - Text-only posts: Gradient marker with text icon
 */
export function createPostMarkerHTML(post: MapPost, isMobile: boolean): string {
  // Sort media by display_order
  const sortedMedia = [...post.media].sort(
    (a, b) => a.display_order - b.display_order
  );
  const firstMedia = sortedMedia[0];
  const mediaCount = sortedMedia.length;

  // Sizes based on device - large thumbnails for better visibility
  const size = isMobile ? 72 : 60;
  const badgeSize = isMobile ? 22 : 20;
  const iconSize = isMobile ? 20 : 18;

  // Get thumbnail URL
  const getThumbnailUrl = () => {
    if (!firstMedia) return null;
    // For videos, prefer thumbnail_path
    if (firstMedia.type === "video" && firstMedia.thumbnail_path) {
      return getMediaUrl(firstMedia.thumbnail_path);
    }
    // For images, use storage_path directly
    if (firstMedia.type === "image") {
      return getMediaUrl(firstMedia.storage_path);
    }
    // Fallback to storage_path for video without thumbnail
    return getMediaUrl(firstMedia.storage_path);
  };

  const thumbnailUrl = getThumbnailUrl();
  const isVideo = firstMedia?.type === "video";
  const hasMedia = !!firstMedia;

  // Common styles for the marker container
  const containerStyles = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    border: 4px solid white;
    box-shadow: 0 6px 16px rgba(0,0,0,0.35), 0 3px 6px rgba(0,0,0,0.25);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #FF9933 0%, #138808 100%);
  `.replace(/\s+/g, " ");

  // Hover effect via CSS class
  const hoverClass = "post-marker-thumbnail";

  if (hasMedia && thumbnailUrl) {
    // Image/Video thumbnail marker
    return `
      <div class="${hoverClass}" style="${containerStyles}">
        <img 
          src="${thumbnailUrl}" 
          alt=""
          style="
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
          "
          loading="lazy"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <div style="
          display: none;
          width: 100%;
          height: 100%;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #FF9933 0%, #138808 100%);
          position: absolute;
          top: 0;
          left: 0;
        ">
          <svg width="${iconSize + 4}" height="${iconSize + 4}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
        ${
          isVideo
            ? `
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.6);
            border-radius: 50%;
            width: ${iconSize + 12}px;
            height: ${iconSize + 12}px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="white">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        `
            : ""
        }
        ${
          mediaCount > 1
            ? `
          <div style="
            position: absolute;
            top: -4px;
            right: -4px;
            background: #FF9933;
            color: white;
            font-size: ${badgeSize - 4}px;
            font-weight: 600;
            min-width: ${badgeSize}px;
            height: ${badgeSize}px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          ">${mediaCount}</div>
        `
            : ""
        }
      </div>
    `;
  } else {
    // Text-only post marker
    return `
      <div class="${hoverClass}" style="${containerStyles}">
        <div style="
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #FF9933 0%, #138808 100%);
        ">
          <svg width="${iconSize + 6}" height="${iconSize + 6}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
      </div>
    `;
  }
}

/**
 * Creates the HTML content for a rich post preview popup
 */
export function createPostPreviewHTML(post: MapPost): string {
  const sortedMedia = [...post.media].sort(
    (a, b) => a.display_order - b.display_order
  );
  const firstMedia = sortedMedia[0];
  const mediaCount = sortedMedia.length;

  // Get thumbnail URL for preview
  const getThumbnailUrl = () => {
    if (!firstMedia) return null;
    if (firstMedia.type === "video" && firstMedia.thumbnail_path) {
      return getMediaUrl(firstMedia.thumbnail_path);
    }
    if (firstMedia.type === "image") {
      return getMediaUrl(firstMedia.storage_path);
    }
    return null;
  };

  const thumbnailUrl = getThumbnailUrl();
  const isVideo = firstMedia?.type === "video";
  const truncatedBody =
    post.body.length > 100 ? post.body.slice(0, 100) + "..." : post.body;

  // Format date
  const date = new Date(post.captured_at || post.created_at);
  const formattedDate = date.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
  });

  return `
    <div style="
      width: 240px;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    ">
      ${
        thumbnailUrl
          ? `
        <div style="
          position: relative;
          width: 100%;
          height: 140px;
          background: #f3f4f6;
        ">
          <img 
            src="${thumbnailUrl}" 
            alt=""
            style="
              width: 100%;
              height: 100%;
              object-fit: cover;
            "
          />
          ${
            isVideo
              ? `
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              background: rgba(0,0,0,0.6);
              border-radius: 50%;
              width: 40px;
              height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          `
              : ""
          }
          ${
            mediaCount > 1
              ? `
            <div style="
              position: absolute;
              top: 8px;
              right: 8px;
              background: rgba(0,0,0,0.6);
              color: white;
              font-size: 11px;
              font-weight: 500;
              padding: 2px 8px;
              border-radius: 12px;
            ">1/${mediaCount}</div>
          `
              : ""
          }
        </div>
      `
          : ""
      }
      <div style="padding: 12px;">
        <p style="
          font-size: 13px;
          line-height: 1.4;
          color: #1f2937;
          margin: 0 0 8px 0;
        ">${truncatedBody}</p>
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        ">
          <div style="display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0;">
            ${
              post.location_name
                ? `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#138808" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span style="
                font-size: 11px;
                color: #6b7280;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              ">${post.location_name}</span>
            `
                : `
              <span style="font-size: 11px; color: #6b7280;">${formattedDate}</span>
            `
            }
          </div>
          <a 
            href="/?view=feed&post=${post.id}" 
            style="
              font-size: 12px;
              font-weight: 500;
              color: #FF9933;
              text-decoration: none;
              white-space: nowrap;
            "
          >Læs mere →</a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Injects global CSS for post marker hover effects
 * Call this once when the map is initialized
 */
export function injectPostMarkerStyles(): void {
  const styleId = "post-marker-styles";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .post-marker-thumbnail:hover {
      transform: scale(1.15) !important;
      box-shadow: 0 6px 20px rgba(0,0,0,0.4), 0 3px 6px rgba(0,0,0,0.3) !important;
    }
    .post-marker-thumbnail {
      transition: transform 0.2s ease, box-shadow 0.2s ease !important;
    }
    .post-marker-highlighted .post-marker-thumbnail {
      transform: scale(1.25) !important;
      box-shadow: 0 0 0 3px #FF9933, 0 6px 20px rgba(0,0,0,0.4) !important;
    }
    .mapboxgl-popup-content {
      padding: 0 !important;
      border-radius: 12px !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
    }
    .mapboxgl-popup-close-button {
      font-size: 18px !important;
      color: #6b7280 !important;
      right: 8px !important;
      top: 8px !important;
      background: white !important;
      border-radius: 50% !important;
      width: 24px !important;
      height: 24px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
      z-index: 10 !important;
    }
    .mapboxgl-popup-close-button:hover {
      background: #f3f4f6 !important;
      color: #1f2937 !important;
    }
  `;
  document.head.appendChild(style);
}
