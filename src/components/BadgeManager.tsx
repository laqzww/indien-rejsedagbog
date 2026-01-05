"use client";

import { useEffect, useRef } from "react";
import {
  registerServiceWorker,
  registerPeriodicSync,
  getLastVisit,
  setLastVisitToNow,
  isFirstVisit,
  setAppBadge,
  clearAppBadge,
  isBadgeSupported,
} from "@/lib/notifications";

/**
 * BadgeManager Component
 *
 * This invisible component handles:
 * 1. Service worker registration
 * 2. Checking for new posts on app open
 * 3. Updating the app badge with new post count
 * 4. Clearing the badge when the user has seen the app
 *
 * Flow:
 * - On first load: Check for new posts since last visit, show badge count
 * - After checking: Update "last visit" timestamp
 * - Badge is cleared after a short delay (user has "seen" the app)
 *
 * The badge shows the count of posts created since the last time
 * the user opened the app.
 */
export function BadgeManager() {
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Prevent double initialization in React 18 strict mode
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    initializeBadgeSystem();
  }, []);

  return null; // This component renders nothing
}

async function initializeBadgeSystem() {
  // Register service worker
  const registration = await registerServiceWorker();

  if (registration) {
    // Try to register periodic sync (only works on Chromium)
    await registerPeriodicSync(registration);
  }

  // Check for new posts and update badge
  await checkAndUpdateBadge();

  // Update last visit timestamp after checking
  // We do this after a small delay to ensure the badge was shown
  setTimeout(() => {
    setLastVisitToNow();
  }, 1000);

  // Clear badge after user has been on the app for a moment
  // This gives them time to notice the badge count
  setTimeout(async () => {
    await clearAppBadge();
  }, 3000);
}

/**
 * Check for new posts since last visit and update badge
 */
async function checkAndUpdateBadge() {
  // Skip if badge API not supported
  if (!isBadgeSupported()) {
    console.log("[BadgeManager] Badge API not supported, skipping");
    return;
  }

  // If first visit, don't show badge (nothing is "new" yet)
  if (isFirstVisit()) {
    console.log("[BadgeManager] First visit, setting initial timestamp");
    setLastVisitToNow();
    return;
  }

  const lastVisit = getLastVisit();
  if (!lastVisit) return;

  try {
    // Fetch new post count from API
    const response = await fetch(`/api/posts/new-count?since=${encodeURIComponent(lastVisit)}`);

    if (!response.ok) {
      console.error("[BadgeManager] Failed to fetch new post count:", response.status);
      return;
    }

    const { count } = await response.json();

    console.log(`[BadgeManager] ${count} new posts since ${lastVisit}`);

    // Update badge with count
    if (count > 0) {
      await setAppBadge(count);
    }
  } catch (error) {
    console.error("[BadgeManager] Error checking for new posts:", error);
  }
}
