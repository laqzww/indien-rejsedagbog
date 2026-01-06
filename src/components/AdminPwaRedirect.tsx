"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Redirects to /admin if:
 * 1. Running as installed PWA (standalone mode)
 * 2. User has previously visited admin (localStorage flag)
 * 3. User is at the root URL without any view parameters (not intentional navigation)
 * 
 * This handles the case where the admin PWA bookmark incorrectly
 * opens at / due to cached manifest issues. The middleware will
 * then redirect to /login if not authenticated.
 * 
 * If the user has intentionally navigated to /?view=feed or /?view=map,
 * we should NOT redirect them back to /admin.
 */
export function AdminPwaRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if user has ever visited admin
    const isAdminUser = localStorage.getItem("admin-pwa-user") === "true";
    if (!isAdminUser) return;

    // Check if this is intentional navigation (has view parameter or other params)
    // If user clicked on "Opslag" or "Kort" from admin, they will have ?view=feed or ?view=map
    const hasViewParam = searchParams.has("view");
    const hasPostParam = searchParams.has("post");
    const hasFocusParams = searchParams.has("lat") || searchParams.has("lng");
    
    // If user has intentionally navigated with parameters, don't redirect
    if (hasViewParam || hasPostParam || hasFocusParams) {
      return;
    }

    // Check if running as installed PWA (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      // Admin PWA opened at wrong URL without any view params - redirect to /admin
      // Middleware will handle redirect to /login if not authenticated
      router.replace("/admin");
    }
  }, [router, searchParams]);

  return null;
}
