"use client";

import { useEffect } from "react";
import { ADMIN_CONTEXT_COOKIE } from "./AdminPwaRedirect";

/**
 * Sets a cookie with the given name and value.
 * The cookie expires in 1 year and is accessible from all paths.
 */
function setAdminContextCookie() {
  if (typeof document === "undefined") return;
  
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  
  // Set cookie with long expiration, accessible from all paths
  // SameSite=Lax allows the cookie to be sent on same-site requests
  document.cookie = `${ADMIN_CONTEXT_COOKIE}=1; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Marks that the user has visited admin pages using both:
 * 1. localStorage (for quick client-side checks)
 * 2. A cookie (more persistent, survives localStorage clearing)
 *
 * This is used by AdminPwaRedirect to redirect standalone PWA users
 * back to /admin when the PWA incorrectly opens at / due to
 * cached manifest issues.
 */
export function AdminPwaMarker() {
  useEffect(() => {
    // Set both localStorage and cookie for redundancy
    localStorage.setItem("admin-pwa-user", "true");
    setAdminContextCookie();
  }, []);
  
  return null;
}
