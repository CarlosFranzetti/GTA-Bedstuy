/**
 * Getting the player's own audio files into the library: folder picker (File System Access API, handle kept in
 * IndexedDB), or a multi-file input as the fallback. Nothing is uploaded; files are read in place through
 * blob URLs. Browser APIs are injected so everything here is testable without a browser.
 */
import { isAudioFile, naturalCompare } from './genres';
import type { ImportedTrack } from './Library';

/* ---------- minimal File System Access typings (not in every TS lib) ---------- */

export interface FileHandleLike { kind: 'file'; name: string; getFile(): Promise<File>; }
export interface DirHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileHandleLike | DirHandleLike>;
  queryPermission?(d: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' }): Promise<PermissionState>;
}

export interface ImportDeps {
  /** Reads the duration (s) of a playable URL; 0 when unknown. */
  probe?: (url: string) => Promise<number>;
  createUrl?: (file: File) => string;
}

const MAX_DEPTH = 6;
const PROBE_PARALLEL = 4;
const PROBE_TIMEOUT_MS = 6000;

export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined') { resolve(0); return; }
    const a = new Audio();
    let done = false;
    const finish = (d: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      try { a.load(); } catch { /* ignore */ }
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    };
    const timer = setTimeout(() => finish(0), PROBE_TIMEOUT_MS);
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => finish(a.duration));
    a.addEventListener('error', () => finish(0));
    a.src = url;
  });
}

const defaultUrl = (f: File): string => URL.createObjectURL(f);

/** Path used for genre keywords: folder/file for picked folders, webkitRelativePath when the input provides it. */
function filePath(f: File, prefix = ''): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  return prefix ? `${prefix}/${f.name}` : rel || f.name;
}

async function toTracks(entries: Array<{ file: File; path: string }>, deps: ImportDeps): Promise<ImportedTrack[]> {
  const probe = deps.probe ?? probeDuration;
  const mk = deps.createUrl ?? defaultUrl;
  const out: ImportedTrack[] = new Array(entries.length);
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const i = next++;
      const { file, path } = entries[i];
      const url = mk(file);
      let duration = 0;
      try { duration = await probe(url); } catch { duration = 0; }
      out[i] = { path, size: file.size, lastModified: file.lastModified, duration, url };
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROBE_PARALLEL, entries.length) }, worker));
  return out;
}

/** Files from `<input type=file multiple>` (or a drop). Non-audio files are skipped. */
export async function importFiles(files: ArrayLike<File>, deps: ImportDeps = {}): Promise<ImportedTrack[]> {
  const list = Array.from(files).filter((f) => isAudioFile(f.name, f.type));
  list.sort((a, b) => naturalCompare(filePath(a), filePath(b)));
  return toTracks(list.map((file) => ({ file, path: filePath(file) })), deps);
}

/** Walks a picked folder (a few levels deep) and imports every audio file. */
export async function scanDirectory(root: DirHandleLike, deps: ImportDeps = {}): Promise<ImportedTrack[]> {
  const found: Array<{ file: File; path: string }> = [];
  const walk = async (dir: DirHandleLike, prefix: string, depth: number): Promise<void> => {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (depth < MAX_DEPTH) await walk(entry, `${prefix}/${entry.name}`, depth + 1);
      } else if (isAudioFile(entry.name)) {
        try { found.push({ file: await entry.getFile(), path: `${prefix}/${entry.name}` }); } catch { /* unreadable: skip */ }
      }
    }
  };
  await walk(root, root.name, 0);
  found.sort((a, b) => naturalCompare(a.path, b.path));
  return toTracks(found, deps);
}

export function folderPickerSupported(w: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  return !!w && typeof (w as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

/** Opens the folder picker. Null when cancelled or unsupported. Must run inside a user gesture. */
export async function pickFolder(w: unknown = window): Promise<DirHandleLike | null> {
  if (!folderPickerSupported(w)) return null;
  try {
    return await (w as { showDirectoryPicker(o?: object): Promise<DirHandleLike> }).showDirectoryPicker({ id: 'gta-bedstuy-radio', mode: 'read' });
  } catch {
    return null; // AbortError when cancelled
  }
}

export type PermissionResult = 'granted' | 'prompt' | 'denied';

/** Checks read permission on a stored handle; with `request`, asks again (needs a user gesture). */
export async function ensureReadPermission(h: DirHandleLike, request: boolean): Promise<PermissionResult> {
  try {
    const opts = { mode: 'read' as const };
    let state: PermissionState = h.queryPermission ? await h.queryPermission(opts) : 'granted';
    if (state !== 'granted' && request && h.requestPermission) state = await h.requestPermission(opts);
    return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'denied';
  }
}

/* ---------- persisted folder handle ---------- */

export interface HandleStore {
  get(): Promise<DirHandleLike | null>;
  put(h: DirHandleLike): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'gta-bedstuy-radio';
const STORE = 'handles';
const KEY = 'folder';

/** IndexedDB store for the directory handle (handles are structured-cloneable). Silent no-op where unavailable. */
export function idbHandleStore(idb: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): HandleStore {
  const open = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
    if (!idb) { resolve(null); return; }
    try {
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
    const db = await open();
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      } catch { resolve(null); }
    });
  };
  return {
    async get() { return ((await run('readonly', (s) => s.get(KEY))) as DirHandleLike | undefined) ?? null; },
    async put(h) { await run('readwrite', (s) => s.put(h, KEY)); },
    async clear() { await run('readwrite', (s) => s.delete(KEY)); },
  };
}

/** In-memory handle store (tests, and the fallback when IndexedDB is missing). */
export function memoryHandleStore(initial: DirHandleLike | null = null): HandleStore {
  let h = initial;
  return { get: async () => h, put: async (v) => { h = v; }, clear: async () => { h = null; } };
}
