/// <reference lib="webworker" />

/**
 * Service Worker for T&A Indien Rejsedagbog
 * Handles app badge updates for new post notifications
 */

const SW_VERSION = "1.0.0";

// Install event - activate immediately
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing v${SW_VERSION}`);
  self.skipWaiting();
});

// Activate event - claim clients immediately
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating v${SW_VERSION}`);
  event.waitUntil(self.clients.claim());
});

// Message handler for badge updates from the app
self.addEventListener("message", async (event) => {
  const { type, count } = event.data || {};

  if (type === "UPDATE_BADGE") {
    await updateBadge(count);
  } else if (type === "CLEAR_BADGE") {
    await clearBadge();
  }
});

/**
 * Update the app badge with a count
 * @param {number} count - Number to display on badge
 */
async function updateBadge(count) {
  if (!("setAppBadge" in navigator)) {
    console.log("[SW] Badge API not supported");
    return;
  }

  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
      console.log(`[SW] Badge set to ${count}`);
    } else {
      await navigator.clearAppBadge();
      console.log("[SW] Badge cleared");
    }
  } catch (error) {
    console.error("[SW] Failed to update badge:", error);
  }
}

/**
 * Clear the app badge
 */
async function clearBadge() {
  if (!("clearAppBadge" in navigator)) {
    console.log("[SW] Badge API not supported");
    return;
  }

  try {
    await navigator.clearAppBadge();
    console.log("[SW] Badge cleared");
  } catch (error) {
    console.error("[SW] Failed to clear badge:", error);
  }
}

// Periodic Background Sync for checking new posts
// Note: Only supported on Chromium-based browsers, not iOS Safari
self.addEventListener("periodicsync", async (event) => {
  if (event.tag === "check-new-posts") {
    console.log("[SW] Periodic sync: checking for new posts");
    event.waitUntil(checkNewPosts());
  }
});

/**
 * Check for new posts and update badge
 * Called by periodic sync (where supported)
 */
async function checkNewPosts() {
  try {
    // Get last visit timestamp from IndexedDB
    const lastVisit = await getLastVisitFromDB();
    if (!lastVisit) return;

    // Fetch new post count from API
    const response = await fetch(`/api/posts/new-count?since=${lastVisit}`);
    if (!response.ok) return;

    const { count } = await response.json();
    await updateBadge(count);
  } catch (error) {
    console.error("[SW] Failed to check new posts:", error);
  }
}

// IndexedDB helpers for storing last visit timestamp
const DB_NAME = "rejsedagbog-sw";
const STORE_NAME = "state";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getLastVisitFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get("lastVisit");
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error("[SW] Failed to get lastVisit from DB:", error);
    return null;
  }
}
