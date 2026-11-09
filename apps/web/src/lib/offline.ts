export type OfflineMutation = {
  id: string;
  userId: number;
  path: string;
  method: 'POST';
  body: string;
  permission: string;
  createdAt: number;
  state: 'pending' | 'failed';
  error?: string;
};

export type OfflineSyncHistory = { id: string; path: string; createdAt: number; syncedAt: number };

const DB_NAME = 'mf-offline-v1';
const STORE = 'outbox';
const USER_KEY = 'mf_offline_user_v1';
const PENDING_LOGOUT_KEY = 'mf_pending_logout_v1';
const PERMISSIONS_KEY = 'mf_offline_permissions_v1_';
const HISTORY_KEY = 'mf_offline_history_v1_';
const LAST_SYNC_KEY = 'mf_last_server_sync_v1_';
const SESSION_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const PERMISSIONS_MAX_AGE = 12 * 60 * 60 * 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Stockage hors ligne indisponible.'));
  });
}

export function saveOfflineUser<T>(user: T): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify({ user, savedAt: Date.now() })); } catch { /* stockage indisponible */ }
}

export function getOfflineUser<T>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { user: T; savedAt: number };
    if (!entry.savedAt || Date.now() - entry.savedAt > SESSION_MAX_AGE) return null;
    return entry.user;
  } catch { return null; }
}

export function clearOfflineUser(): void {
  try { localStorage.removeItem(USER_KEY); } catch { /* stockage indisponible */ }
}

export function setOfflineLogoutPending(value: boolean): void {
  try {
    if (value) localStorage.setItem(PENDING_LOGOUT_KEY, '1');
    else localStorage.removeItem(PENDING_LOGOUT_KEY);
  } catch { /* stockage indisponible */ }
}

export function isOfflineLogoutPending(): boolean {
  try { return localStorage.getItem(PENDING_LOGOUT_KEY) === '1'; } catch { return false; }
}

export function clearOfflinePermissions(userId: number): void {
  try { localStorage.removeItem(PERMISSIONS_KEY + userId); } catch { /* stockage indisponible */ }
}

export function getOfflineSyncHistory(userId: number): OfflineSyncHistory[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY + userId) ?? '[]') as OfflineSyncHistory[]; } catch { return []; }
}

export function recordOfflineSync(userId: number, item: OfflineMutation): void {
  try {
    const history = getOfflineSyncHistory(userId);
    history.unshift({ id: item.id, path: item.path, createdAt: item.createdAt, syncedAt: Date.now() });
    localStorage.setItem(HISTORY_KEY + userId, JSON.stringify(history.slice(0, 30)));
  } catch { /* journal local facultatif */ }
}

export function markServerSync(userId: number | null): void {
  if (userId === null) return;
  try { localStorage.setItem(LAST_SYNC_KEY + userId, String(Date.now())); } catch { /* stockage indisponible */ }
}

export function getLastServerSync(userId: number): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_SYNC_KEY + userId));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

export function saveOfflinePermissions(userId: number, permissions: Record<string, boolean>): void {
  try { localStorage.setItem(PERMISSIONS_KEY + userId, JSON.stringify({ permissions, savedAt: Date.now() })); } catch { /* stockage indisponible */ }
}

export function getOfflinePermissions(userId: number): Record<string, boolean> | null {
  try {
    const value = localStorage.getItem(PERMISSIONS_KEY + userId);
    if (!value) return null;
    const entry = JSON.parse(value) as { permissions: Record<string, boolean>; savedAt: number };
    if (!entry.savedAt || Date.now() - entry.savedAt > PERMISSIONS_MAX_AGE) return null;
    return entry.permissions;
  } catch { return null; }
}

export async function enqueueOfflineMutation(item: OfflineMutation): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Impossible de garder cette saisie sur cet appareil.'));
  });
  db.close();
  window.dispatchEvent(new CustomEvent('offline:outbox-updated'));
}

export async function listOfflineMutations(userId?: number): Promise<OfflineMutation[]> {
  if (!('indexedDB' in window)) return [];
  const db = await openDb();
  const result = await new Promise<OfflineMutation[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = userId === undefined
      ? tx.objectStore(STORE).getAll()
      : tx.objectStore(STORE).index('userId').getAll(userId);
    request.onsuccess = () => resolve(request.result as OfflineMutation[]);
    request.onerror = () => reject(request.error ?? new Error('Lecture de la file hors ligne impossible.'));
  });
  db.close();
  return result.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOfflineMutation(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Suppression de la saisie synchronisée impossible.'));
  });
  db.close();
  window.dispatchEvent(new CustomEvent('offline:outbox-updated'));
}

export async function updateOfflineMutation(id: string, state: 'pending' | 'failed', error?: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, state, error });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Mise à jour de la file hors ligne impossible.'));
  });
  db.close();
  window.dispatchEvent(new CustomEvent('offline:outbox-updated'));
}

export async function clearOfflineUserData(userId: number): Promise<void> {
  try { localStorage.removeItem(PERMISSIONS_KEY + userId); } catch { /* stockage indisponible */ }
  const db = await openDb().catch(() => null);
  if (!db) return;
  const items = await listOfflineMutations(userId).catch(() => []);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const item of items) tx.objectStore(STORE).delete(item.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
