import { getActiveWorkspaceId, type CollectionItem, type ValuationHistoryEntry } from "./api";

export interface CachedItemSnapshot {
  item: CollectionItem;
  valuations: ValuationHistoryEntry[];
  cachedAt: string;
}

const DB_NAME = "stackerstash-offline";
const STORE_NAME = "item-snapshots";
const memoryFallback = new Map<string, CachedItemSnapshot>();

function buildCacheKey(itemId: string): string {
  return `${getActiveWorkspaceId() || "default"}:${itemId}`;
}

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
  const key = buildCacheKey(item.id);
  const snapshot: CachedItemSnapshot = {
    item,
    valuations,
    cachedAt: new Date().toISOString(),
  };
  memoryFallback.set(key, snapshot);

  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(snapshot, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getCachedItemSnapshot(itemId: string): Promise<CachedItemSnapshot | null> {
  const key = buildCacheKey(itemId);
  const db = await openDb();
  if (!db) {
    return memoryFallback.get(key) || null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as CachedItemSnapshot) || memoryFallback.get(key) || null);
      req.onerror = () => resolve(memoryFallback.get(key) || null);
    } catch {
      resolve(memoryFallback.get(key) || null);
    }
  });
}

export async function clearOfflineCache(): Promise<void> {
  memoryFallback.clear();
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

