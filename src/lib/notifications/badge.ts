/**
 * Badge API utilities for showing new post count on app icon
 *
 * Browser Support:
 * - iOS Safari (PWA): ✅ iOS 16.4+
 * - Android Chrome (PWA): ✅
 * - Desktop Chrome/Edge: ✅
 * - Firefox: ❌ Not supported
 */

/**
 * Check if the Badge API is supported
 */
export function isBadgeSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return "setAppBadge" in navigator;
}

/**
 * Set the app badge to a specific count
 * @param count - Number to display on badge (0 clears the badge)
 */
export async function setAppBadge(count: number): Promise<boolean> {
  if (!isBadgeSupported()) {
    console.log("[Badge] API not supported in this browser");
    return false;
  }

  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
      console.log(`[Badge] Set to ${count}`);
    } else {
      await navigator.clearAppBadge();
      console.log("[Badge] Cleared");
    }
    return true;
  } catch (error) {
    // Badge API can fail if not running as installed PWA
    console.log("[Badge] Failed to set badge:", error);
    return false;
  }
}

/**
 * Clear the app badge
 */
export async function clearAppBadge(): Promise<boolean> {
  if (!isBadgeSupported()) {
    return false;
  }

  try {
    await navigator.clearAppBadge();
    console.log("[Badge] Cleared");
    return true;
  } catch (error) {
    console.log("[Badge] Failed to clear badge:", error);
    return false;
  }
}

/**
 * Send a message to the service worker to update the badge
 * This is useful when the SW needs to update the badge from background sync
 */
export async function sendBadgeUpdateToSW(count: number): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  if (registration.active) {
    registration.active.postMessage({
      type: count > 0 ? "UPDATE_BADGE" : "CLEAR_BADGE",
      count,
    });
  }
}
