/**
 * Browser persistence for the in-progress job: IndexedDB (not localStorage
 * — jobs embed multi-MB base64 STLs, far past localStorage's quota). All
 * operations are best-effort: failures are swallowed so a broken/unavailable
 * database never blocks the app, only session restore.
 */

import type { JobFile } from './jobFile';

const DB_NAME = 'simple.cam';
const DB_VERSION = 1;
const STORE = 'jobs';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Persist the current job (overwrites the single record). */
export async function saveAutosave(file: JobFile): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.put(file, KEY));
  } catch {
    // best-effort: session persistence is a convenience
  }
}

/** The autosaved job, or null when none was stored (or storage failed). */
export async function loadAutosave(): Promise<JobFile | null> {
  try {
    const job = await withStore<JobFile | undefined>('readonly', (s) => s.get(KEY));
    return job ?? null;
  } catch {
    return null;
  }
}