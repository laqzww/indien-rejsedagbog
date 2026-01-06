"use client";

import { useEffect } from "react";

/**
 * Marks in localStorage that the user has visited admin pages.
 * This is used by the home page to redirect standalone PWA users
 * back to /admin when the PWA incorrectly opens at / due to
 * cached manifest issues.
 */
export function AdminPwaMarker() {
  useEffect(() => {
    localStorage.setItem("admin-pwa-user", "true");
  }, []);
  
  return null;
}
