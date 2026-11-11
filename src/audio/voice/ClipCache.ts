/**
 * Rendered-sentence cache: an in-memory LRU (byte-capped) in front of an optional persistent store (IndexedDB,
 * size-capped). Keys come from `clipKey()` in script.ts, so they are stable across sessions. Clips are stored as
 * 16-bit PCM to keep the footprint small.
 */
import type { Clip } from './types';

export interface PersistentStore {
  get(key: string): Promise<{ pcm: Int16Array; sampleRate: number } | undefined>;
  put(key: string, value: { pcm: Int16Array; sampleRate: number }): Promise<void>;
  /** Removes oldest entries until total bytes <= maxBytes. */
  trim(maxBytes: number): Promise<void>;
}

export const MEMORY_CAP_BYTES = 24 * 1024 * 1024;
export const PERSIST_CAP_BYTES = 48 * 1024 * 1024;

export function toPcm(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
  return out;
}
export function fromPcm(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32767;
  return out;
}

export class ClipCache {
  private readonly mem = new Map<string, { pcm: Int16Array; sampleRate: number }>();
  private bytes = 0;
  private writes = 0;
  hits = 0;
  misses = 0;

  constructor(private readonly store: PersistentStore | null = null, private readonly memCap = MEMORY_CAP_BYTES, private readonly persistCap = PERSIST_CAP_BYTES) {}

  get size(): number { return this.mem.size; }
  get memoryBytes(): number { return this.bytes; }

  has(key: string): boolean { return this.mem.has(key); }

  async get(key: string): Promise<Clip | null> {
    const hit = this.mem.get(key);
    if (hit) {
      this.mem.delete(key); this.mem.set(key, hit); // LRU touch
      this.hits++;
      return { samples: fromPcm(hit.pcm), sampleRate: hit.sampleRate };
    }
    if (this.store) {
      try {
        const v = await this.store.get(key);
        if (v) { this.remember(key, v); this.hits++; return { samples: fromPcm(v.pcm), sampleRate: v.sampleRate }; }
      } catch { /* storage unavailable: behave as a miss */ }
    }
    this.misses++;
    return null;
  }

  put(key: string, clip: Clip): void {
    const v = { pcm: toPcm(clip.samples), sampleRate: clip.sampleRate };
    this.remember(key, v);
    if (this.store) {
      void this.store.put(key, v).then(() => (++this.writes % 25 === 0 ? this.store!.trim(this.persistCap) : undefined)).catch(() => undefined);
    }
  }

  clear(): void { this.mem.clear(); this.bytes = 0; }

  private remember(key: string, v: { pcm: Int16Array; sampleRate: number }): void {
    const old = this.mem.get(key);
    if (old) { this.bytes -= old.pcm.byteLength; this.mem.delete(key); }
    this.mem.set(key, v);
    this.bytes += v.pcm.byteLength;
    for (const k of this.mem.keys()) {
      if (this.bytes <= this.memCap || k === key) break;
      const e = this.mem.get(k)!;
      this.bytes -= e.pcm.byteLength;
      this.mem.delete(k);
    }
  }
}

/** IndexedDB-backed store; every call is best effort. Returns null where IndexedDB does not exist. */
export function idbStore(name = 'wbsy-voice-v1'): PersistentStore | null {
  if (typeof indexedDB === 'undefined') return null;
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((res, rej) => {
      const r = f(db.transaction('clips', mode).objectStore('clips'));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  };
  return {
    get: async (k) => (await run<{ pcm: Int16Array; sampleRate: number; at: number } | undefined>('readonly', (s) => s.get(k))) ?? undefined,
    put: async (k, v) => { await run('readwrite', (s) => s.put({ ...v, at: Date.now() }, k)); },
    trim: async (max) => {
      const db = await open();
      await new Promise<void>((res) => {
        const tx = db.transaction('clips', 'readwrite');
        const st = tx.objectStore('clips');
        const rows: Array<{ k: IDBValidKey; at: number; bytes: number }> = [];
        const c = st.openCursor();
        c.onsuccess = () => {
          const cur = c.result;
          if (cur) { const v = cur.value as { pcm: Int16Array; at: number }; rows.push({ k: cur.key, at: v.at ?? 0, bytes: v.pcm.byteLength }); cur.continue(); return; }
          let total = rows.reduce((n, r) => n + r.bytes, 0);
          rows.sort((a, b) => a.at - b.at);
          for (const r of rows) { if (total <= max) break; st.delete(r.k); total -= r.bytes; }
        };
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      });
    },
  };
}
