/**
 * Where mods are kept: the player's own browser (IndexedDB), on this device only. Nothing here ever goes over the network.
 * `MemoryModStore` is the same interface without a browser (tests, a blocked or private window).
 */
import type { ModManifest } from './manifest';

export interface StoredFile { path: string; data: ArrayBuffer }
export interface StoredMod {
  id: string;
  name: string;
  manifest: ModManifest;
  enabled: boolean;
  installedAt: number;
  bytes: number;
  files: StoredFile[];
}

export interface ModStore {
  readonly persistent: boolean;
  list(): Promise<StoredMod[]>;
  put(mod: StoredMod): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryModStore implements ModStore {
  readonly persistent = false;
  private readonly mods = new Map<string, StoredMod>();
  async list(): Promise<StoredMod[]> { return [...this.mods.values()]; }
  async put(mod: StoredMod): Promise<void> { this.mods.set(mod.id, mod); }
  async remove(id: string): Promise<void> { this.mods.delete(id); }
  async clear(): Promise<void> { this.mods.clear(); }
}

const DB_NAME = 'gta-bedstuy-mods';
const STORE = 'mods';

export class IdbModStore implements ModStore {
  readonly persistent = true;
  private db: Promise<IDBDatabase> | null = null;

  static available(): boolean {
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; }
  }

  private open(): Promise<IDBDatabase> {
    return (this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB is blocked'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    }));
  }

  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error ?? new Error('IndexedDB error'));
      t.onabort = () => reject(t.error ?? new Error('Not enough room to store this mod'));
    });
  }

  list(): Promise<StoredMod[]> { return this.tx('readonly', (s) => s.getAll() as IDBRequest<StoredMod[]>); }
  async put(mod: StoredMod): Promise<void> { await this.tx('readwrite', (s) => s.put(mod)); }
  async remove(id: string): Promise<void> { await this.tx('readwrite', (s) => s.delete(id)); }
  async clear(): Promise<void> { await this.tx('readwrite', (s) => s.clear()); }
}

/** An IndexedDB store where the browser has one, else memory. */
export function defaultStore(): ModStore { return IdbModStore.available() ? new IdbModStore() : new MemoryModStore(); }

/** Bytes the browser says this site may use, and has used. Null when the browser does not say. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && typeof e.quota === 'number' ? { usage: e.usage ?? 0, quota: e.quota } : null;
  } catch { return null; }
}
