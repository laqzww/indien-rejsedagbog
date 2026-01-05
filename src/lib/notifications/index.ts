/**
 * Notifications module
 * Exports all notification-related utilities
 */

export { isBadgeSupported, setAppBadge, clearAppBadge, sendBadgeUpdateToSW } from "./badge";
export { getLastVisit, setLastVisitToNow, isFirstVisit } from "./last-visit";
export { registerServiceWorker, registerPeriodicSync } from "./service-worker";
