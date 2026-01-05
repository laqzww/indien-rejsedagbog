/**
 * Last visit tracking for badge notifications
 *
 * Stores the timestamp of when the user last opened the app,
 * used to calculate how many new posts there are.
 */

const STORAGE_KEY = "rejsedagbog-last-visit";
const DB_NAME = "rejsedagbog-sw";
const STORE_NAME = "state";

/**
 * Get the last visit timestamp from localStorage
 * Falls back to null if never visited
 */
export function getLastVisit(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Set the last visit timestamp to now
 * Also syncs to IndexedDB for service worker access
 */
export function setLastVisitToNow(): string {
  const now = new Date().toISOString();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, now);
  }
  // Also sync to IndexedDB for service worker access
  syncToIndexedDB(now);
  return now;
}

/**
 * Check if this is the first visit (no stored timestamp)
 */
export function isFirstVisit(): boolean {
  return getLastVisit() === null;
}

/**
 * Sync the last visit timestamp to IndexedDB
 * This allows the service worker to access it during background sync
 */
async function syncToIndexedDB(timestamp: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(timestamp, "lastVisit");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.error("[LastVisit] Failed to sync to IndexedDB:", error);
  }
}

/**
 * Open the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}
