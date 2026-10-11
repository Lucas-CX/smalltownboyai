import { browserUuid } from '@/lib/browser-uuid';
import type { DanceResolution } from '@/lib/dance-settings';

type Draft = {
  castVersion?: 'v1';
  resolution?: DanceResolution;
  photos: (string | null)[];
  consent: boolean;
  requestKey: string;
  ownerId?: string;
  expiresAt?: number;
};
const key = 'dance-draft-tab';
const backupKey = 'dance-draft-backup';
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('dance-drafts', 1);
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Draft storage unavailable'));
    }, 2500);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
  });
}
async function access<T>(
  operation: (store: IDBObjectStore, id: string) => IDBRequest<T>
) {
  const db = await database();
  try {
    const id = sessionStorage.getItem(key) || browserUuid();
    sessionStorage.setItem(key, id);
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const timer = setTimeout(() => tx.abort(), 2500);
      const store = tx.objectStore('drafts');
      const cleanup = store.openCursor();
      cleanup.onsuccess = () => {
        const cursor = cleanup.result;
        if (!cursor) return;
        if ((cursor.value.expiresAt || 0) < Date.now()) cursor.delete();
        cursor.continue();
      };
      const request = operation(store, id);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(tx.error || new Error('Draft storage unavailable'));
      };
    });
  } finally {
    db.close();
  }
}
export async function saveDanceDraft(draft: Draft) {
  const value = {
    ...draft,
    castVersion: draft.castVersion || 'v1',
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
  try {
    await access((store, id) => store.put(value, id));
    try {
      sessionStorage.removeItem(backupKey);
    } catch {
      /* optional */
    }
  } catch {
    // Tab-only fallback; same ownership and 30-minute retention as IndexedDB.
    // A quota or disabled-storage error still surfaces instead of pretending
    // that photos will survive authentication or checkout.
    sessionStorage.setItem(backupKey, JSON.stringify(value));
  }
}
export async function clearDanceDraft() {
  // A tombstone prevents an old IndexedDB copy resurfacing after a failed delete.
  try {
    sessionStorage.setItem(backupKey, 'null');
  } catch {
    /* optional */
  }
  await access((store, id) => store.delete(id)).catch(() => {});
}
export async function loadDanceDraft(
  ownerId?: string
): Promise<Draft | undefined> {
  let draft: Draft | undefined;
  let backup: string | null = null;
  try {
    backup = sessionStorage.getItem(backupKey);
  } catch {
    /* try IndexedDB */
  }
  if (backup !== null) {
    try {
      draft = JSON.parse(backup) || undefined;
    } catch {
      await clearDanceDraft();
      return;
    }
  } else {
    draft = await access<Draft | undefined>((store, id) => store.get(id));
  }
  // An expired session must not destroy its owner's draft before re-login.
  // Do not expose account-owned photos to an anonymous session either.
  if (draft?.ownerId && !ownerId) return;
  if (
    draft &&
    (!Array.isArray(draft.photos) ||
      draft.photos.length !== 3 ||
      !draft.photos.every(
        (photo) => photo === null || typeof photo === 'string'
      ) ||
      (draft.castVersion !== undefined && draft.castVersion !== 'v1') ||
      (draft.expiresAt || 0) < Date.now() ||
      (draft.ownerId && draft.ownerId !== ownerId))
  ) {
    await clearDanceDraft();
    return;
  }
  return draft;
}
