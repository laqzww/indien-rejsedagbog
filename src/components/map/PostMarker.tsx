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

// Deep crimson red that complements the saffron/green palette
const PIN_COLOR = "#8B1538";
const PIN_COLOR_DARK = "#6B1030";

/**
 * Creates the HTML content for a traditional pin marker
 * Uses a teardrop/pin shape with deep red color
 * The pin is designed with the anchor point at the bottom tip
 */
export function createPostMarkerHTML(_post: MapPost, isMobile: boolean): string {
  // Sizes based on device - pin dimensions
  const pinWidth = isMobile ? 28 : 24;
  const pinHeight = isMobile ? 38 : 32;
  const dotSize = isMobile ? 10 : 8;

  // Simple clean pin with just a white dot in center
  // All other indicators are shown in the carousel
  return `
    <div class="post-marker-pin" style="
      position: relative;
      width: ${pinWidth}px;
      height: ${pinHeight}px;
      cursor: pointer;
    ">
      <svg 
        width="${pinWidth}" 
        height="${pinHeight}" 
        viewBox="0 0 ${pinWidth} ${pinHeight}"
        style="filter: drop-shadow(0 3px 4px rgba(0,0,0,0.3));"
      >
        <!-- Pin shape: teardrop pointing down -->
        <path 
          d="M${pinWidth / 2} ${pinHeight}
             C${pinWidth / 2} ${pinHeight} 
              ${pinWidth} ${pinHeight * 0.45} 
              ${pinWidth} ${pinHeight * 0.35}
             C${pinWidth} ${pinHeight * 0.15} 
              ${pinWidth * 0.78} 0 
              ${pinWidth / 2} 0
             C${pinWidth * 0.22} 0 
              0 ${pinHeight * 0.15} 
              0 ${pinHeight * 0.35}
             C0 ${pinHeight * 0.45} 
              ${pinWidth / 2} ${pinHeight} 
              ${pinWidth / 2} ${pinHeight}Z"
          fill="${PIN_COLOR}"
          stroke="${PIN_COLOR_DARK}"
          stroke-width="1"
        />
        <!-- Simple white dot in center -->
        <circle 
          cx="${pinWidth / 2}" 
          cy="${pinHeight * 0.35}" 
          r="${dotSize / 2}"
          fill="white"
        />
      </svg>
    </div>
  `;
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
 * 
 * IMPORTANT: We avoid transform on the marker container to prevent
 * Mapbox positioning conflicts. Instead, we use filter effects and
 * scale only the inner SVG/elements.
 */
export function injectPostMarkerStyles(): void {
  const styleId = "post-marker-styles";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* Pin marker styles - avoid transform on outer container */
    .post-marker-pin {
      transition: filter 0.2s ease !important;
    }
    .post-marker-pin:hover {
      filter: brightness(1.1) !important;
    }
    .post-marker-pin:hover svg {
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)) !important;
    }
    
    /* Highlighted state - uses outline glow instead of transform */
    .post-marker-highlighted .post-marker-pin svg path {
      stroke: #FF9933 !important;
      stroke-width: 3 !important;
    }
    .post-marker-highlighted .post-marker-pin {
      filter: brightness(1.15) drop-shadow(0 0 8px rgba(255,153,51,0.6)) !important;
    }
    
    /* Popup styles */
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
