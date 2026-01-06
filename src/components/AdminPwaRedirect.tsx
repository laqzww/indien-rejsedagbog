"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirects to /admin if:
 * 1. Running as installed PWA (standalone mode)
 * 2. User has previously visited admin (localStorage flag)
 * 
 * This handles the case where the admin PWA bookmark incorrectly
 * opens at / due to cached manifest issues. The middleware will
 * then redirect to /login if not authenticated.
 */
export function AdminPwaRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Check if user has ever visited admin
    const isAdminUser = localStorage.getItem("admin-pwa-user") === "true";
    if (!isAdminUser) return;

    // Check if running as installed PWA (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      // Admin PWA opened at wrong URL - redirect to /admin
      // Middleware will handle redirect to /login if not authenticated
      router.replace("/admin");
    }
  }, [router]);

  return null;
}
