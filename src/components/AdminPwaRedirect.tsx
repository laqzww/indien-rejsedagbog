"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cookie name for admin context (also used by AdminPwaMarker)
export const ADMIN_CONTEXT_COOKIE = "admin-context";

/**
 * Checks if the admin-context cookie is set.
 * This cookie is set when user visits /admin and persists longer than localStorage.
 */
function hasAdminContextCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${ADMIN_CONTEXT_COOKIE}=`));
}

/**
 * Redirects to /admin if running as installed PWA (standalone mode) and:
 * 1. User has admin context (localStorage flag OR admin-context cookie), OR
 * 2. User has no valid session (fail-safe: if no session in standalone, redirect to /admin for login)
 *
 * This handles multiple scenarios:
 * - Admin PWA opens at "/" due to Safari caching issues
 * - User cleared localStorage but still has the admin cookie
 * - User has no signals but also no session (likely an admin PWA that lost context)
 *
 * The middleware will redirect to /login if not authenticated.
 */
export function AdminPwaRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if running as installed PWA (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    // Only apply this logic in standalone mode
    if (!isStandalone) return;

    // Check for admin context signals
    const hasLocalStorageFlag = localStorage.getItem("admin-pwa-user") === "true";
    const hasCookie = hasAdminContextCookie();
    const hasAdminContext = hasLocalStorageFlag || hasCookie;

    // Check if this is intentional navigation (has view parameter or other params)
    // If user clicked on "Opslag" or "Kort" from admin, they will have ?view=feed or ?view=map
    const hasViewParam = searchParams.has("view");
    const hasPostParam = searchParams.has("post");
    const hasFocusParams = searchParams.has("lat") || searchParams.has("lng");
    const hasIntentionalParams = hasViewParam || hasPostParam || hasFocusParams;

    // Helper function to check session and redirect if needed
    const ensureAdminOrLogin = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getSession();

        // If no valid session, redirect to /admin (middleware will send to /login)
        if (error || !data.session) {
          router.replace("/admin");
        }
      } catch {
        // On any error, fail safe to /admin
        router.replace("/admin");
      }
    };

    // Case 1: Known admin user with intentional navigation params
    // Still check session to ensure they get redirected to login if logged out
    if (hasAdminContext && hasIntentionalParams) {
      void ensureAdminOrLogin();
      return;
    }

    // Case 2: Known admin user without params - redirect to /admin
    if (hasAdminContext && !hasIntentionalParams) {
      router.replace("/admin");
      return;
    }

    // Case 3: No admin context and no intentional params
    // This could be:
    // - A regular user PWA (should stay on /)
    // - An admin PWA that lost all context (localStorage + cookies cleared)
    //
    // We CANNOT reliably distinguish between these two cases.
    // However, the admin context cookie is very persistent (1 year expiry).
    // If it's missing, the user most likely:
    // - Has never visited /admin before, OR
    // - Explicitly cleared all cookies
    //
    // In both cases, we should NOT automatically redirect to /admin because:
    // - Regular user PWAs should stay on /
    // - Admin users who cleared everything will simply need to navigate to /admin manually once
    //
    // The admin manifest has start_url="/admin" which should handle most cases.
    // This redirect logic is just a fallback for Safari caching issues.
    //
    // DO NOTHING - stay on /

    // Case 4: No admin context but has intentional params
    // This is intentional navigation - don't redirect
  }, [router, searchParams]);

  return null;
}
