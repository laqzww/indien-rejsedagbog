/**
 * Service Worker registration and management
 */

/**
 * Register the service worker
 * @returns The service worker registration, or null if not supported
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    console.log("[SW] Service workers not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    console.log("[SW] Registered successfully:", registration.scope);

    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    console.log("[SW] Ready");

    return registration;
  } catch (error) {
    console.error("[SW] Registration failed:", error);
    return null;
  }
}

/**
 * Register periodic background sync for checking new posts
 * Note: Only supported on Chromium-based browsers (not iOS Safari)
 *
 * @param registration - The service worker registration
 */
export async function registerPeriodicSync(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  // Check if periodic sync is supported
  if (!("periodicSync" in registration)) {
    console.log("[SW] Periodic sync not supported");
    return false;
  }

  try {
    // Check permission status
    const status = await navigator.permissions.query({
      name: "periodic-background-sync" as PermissionName,
    });

    if (status.state !== "granted") {
      console.log("[SW] Periodic sync permission not granted:", status.state);
      return false;
    }

    // Register periodic sync - browser will determine actual frequency
    // based on site engagement score (typically ranges from hours to daily)
    await (registration as ServiceWorkerRegistration & {
      periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> };
    }).periodicSync.register("check-new-posts", {
      minInterval: 60 * 60 * 1000, // Request minimum 1 hour (browser may increase this)
    });

    console.log("[SW] Periodic sync registered");
    return true;
  } catch (error) {
    console.error("[SW] Failed to register periodic sync:", error);
    return false;
  }
}
