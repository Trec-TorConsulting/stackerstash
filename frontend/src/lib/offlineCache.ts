import type { CollectionItem, ValuationHistoryEntry } from "./api";

export interface CachedItemSnapshot {
  item: CollectionItem;
  valuations: ValuationHistoryEntry[];
  cachedAt: string;
}

const DB_NAME = "stackerstash-offline";
const STORE_NAME = "item-snapshots";
const memoryFallback = new Map<string, CachedItemSnapshot>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheItemSnapshot(
  item: CollectionItem,
  valuations: ValuationHistoryEntry[] = []
): Promise<void> {
  const snapshot: CachedItemSnapshot = {
    item,
    valuations,
    cachedAt: new Date().toISOString(),
  };
  memoryFallback.set(item.id, snapshot);

  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(snapshot, item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getCachedItemSnapshot(itemId: string): Promise<CachedItemSnapshot | null> {
  const db = await openDb();
  if (!db) {
    return memoryFallback.get(itemId) || null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(itemId);
      req.onsuccess = () => resolve((req.result as CachedItemSnapshot) || memoryFallback.get(itemId) || null);
      req.onerror = () => resolve(memoryFallback.get(itemId) || null);
    } catch {
      resolve(memoryFallback.get(itemId) || null);
    }
  });
}

