/**
 * The player's radio library: a pool of known tracks plus fixed-size playlists (slots) per music station.
 * Only metadata is ever persisted (name, size, date, duration, slot assignment). The audio itself stays on
 * the player's device and is reached through a blob URL created at runtime from a File.
 */
import { LIBRARY_STATIONS, classifyGenre, isStationId, naturalCompare, stationDef, trackTitle, type LibraryStationId } from './genres';

export interface TrackMeta {
  id: string;
  /** File name without extension: what the HUD shows. */
  name: string;
  /** Relative path (folder/file) used for genre keywords and for re-matching after a reload. */
  path: string;
  size: number;
  lastModified: number;
  /** Seconds; 0 when unknown. */
  duration: number;
}

export interface Track extends TrackMeta {
  /** Blob URL of the file, present only while the file is loaded this session. */
  url?: string;
}

export interface PersistedLibrary {
  v: 1;
  pool: TrackMeta[];
  slots: Record<string, Array<string | null>>;
  folderName?: string;
}

/** What an importer hands over for one audio file. */
export interface ImportedTrack {
  name?: string;
  path: string;
  size: number;
  lastModified: number;
  duration: number;
  url: string;
}

export interface LibraryStorage {
  load(): PersistedLibrary | null;
  save(data: PersistedLibrary): void;
  clear(): void;
}

export interface ImportResult { added: number; assigned: number; unassigned: number; }

export function trackId(path: string, size: number, lastModified: number): string {
  const file = (path.split(/[\\/]+/).filter(Boolean).pop() ?? path).toLowerCase();
  return `${file}|${size}|${Math.floor(lastModified)}`;
}

/** localStorage-backed storage, tolerant of blocked or missing storage. */
export function localLibraryStorage(key = 'gta-bedstuy.radio.v1'): LibraryStorage {
  const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
  return {
    load() {
      try {
        const raw = store()?.getItem(key);
        if (!raw) return null;
        const o = JSON.parse(raw) as PersistedLibrary;
        return o && o.v === 1 && Array.isArray(o.pool) && o.slots && typeof o.slots === 'object' ? o : null;
      } catch { return null; }
    },
    save(data) { try { store()?.setItem(key, JSON.stringify(data)); } catch { /* quota / blocked */ } },
    clear() { try { store()?.removeItem(key); } catch { /* ignore */ } },
  };
}

const finiteNum = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d);

export class Library {
  private readonly tracks = new Map<string, Track>();
  private readonly slots = new Map<LibraryStationId, Array<string | null>>();
  private readonly listeners = new Set<() => void>();
  /** Name of the folder last imported (display only). */
  folderName = '';
  private batch = 0;
  private dirty = false;

  constructor(private readonly storage: LibraryStorage | null = null) {
    for (const s of LIBRARY_STATIONS) this.slots.set(s.id, new Array<string | null>(s.slots).fill(null));
    if (storage) this.restore(storage.load());
  }

  /* ---------- reading ---------- */

  capacity(id: LibraryStationId): number { return stationDef(id).slots; }

  /** Filled slots (assigned, whether or not the file is loaded this session). */
  count(id: LibraryStationId): number { return this.slots.get(id)!.filter((t) => t !== null).length; }

  /** Filled slots whose file is loaded and can play now. */
  playableCount(id: LibraryStationId): number { return this.slots.get(id)!.filter((t) => t !== null && !!this.tracks.get(t)?.url).length; }

  /** "7/15" */
  countLabel(id: LibraryStationId): string { return `${this.count(id)}/${this.capacity(id)}`; }

  slotIds(id: LibraryStationId): ReadonlyArray<string | null> { return this.slots.get(id)!; }

  /** Track in a slot, or null when empty. */
  slotTrack(id: LibraryStationId, index: number): Track | null {
    const t = this.slots.get(id)?.[index];
    return t ? this.tracks.get(t) ?? null : null;
  }

  getTrack(trackIdValue: string): Track | undefined { return this.tracks.get(trackIdValue); }

  /** Where a track currently sits, if anywhere. */
  locate(trackIdValue: string): { station: LibraryStationId; index: number } | null {
    for (const [station, arr] of this.slots) {
      const index = arr.indexOf(trackIdValue);
      if (index >= 0) return { station, index };
    }
    return null;
  }

  /** Tracks not in any slot, in path order. */
  unassigned(): Track[] {
    const used = new Set<string>();
    for (const arr of this.slots.values()) for (const t of arr) if (t) used.add(t);
    return [...this.tracks.values()].filter((t) => !used.has(t.id)).sort((a, b) => naturalCompare(a.path, b.path));
  }

  get size(): number { return this.tracks.size; }
  get totalFilled(): number { let n = 0; for (const id of this.slots.keys()) n += this.count(id); return n; }
  /** True when any assigned track still needs its file picked again this session. */
  get needsReconnect(): boolean {
    for (const arr of this.slots.values()) for (const t of arr) if (t && !this.tracks.get(t)?.url) return true;
    return false;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /* ---------- editing ---------- */

  /**
   * Adds (or re-attaches) tracks. Files already known by name+size+date keep their slot and just get a URL;
   * new files are assigned by genre keywords in their path while their station has room.
   */
  addTracks(items: ImportedTrack[], autoAssign = true): ImportResult {
    let added = 0;
    this.begin();
    const fresh: Track[] = [];
    for (const it of items) {
      const id = trackId(it.path, it.size, it.lastModified);
      const existing = this.tracks.get(id);
      if (existing) {
        if (existing.url && existing.url !== it.url) this.revoke(existing.url);
        existing.url = it.url;
        if (it.duration > 0) existing.duration = it.duration;
        existing.path = it.path.length >= existing.path.length ? it.path : existing.path;
        continue;
      }
      const t: Track = { id, name: it.name || trackTitle(it.path), path: it.path, size: it.size, lastModified: it.lastModified, duration: Math.max(0, it.duration), url: it.url };
      this.tracks.set(id, t);
      fresh.push(t);
      added++;
    }
    let assigned = 0;
    if (autoAssign) assigned = this.autoAssign(fresh);
    this.touch();
    this.end();
    return { added, assigned, unassigned: this.unassigned().length };
  }

  /** Assigns the given tracks (default: every unassigned one) by keyword. Returns how many found a slot. */
  autoAssign(list: Track[] = this.unassigned()): number {
    let n = 0;
    const sorted = [...list].sort((a, b) => naturalCompare(a.path, b.path));
    for (const t of sorted) {
      if (this.locate(t.id)) continue;
      const genre = classifyGenre(t.path);
      if (genre && this.assign(t.id, genre)) n++;
    }
    return n;
  }

  /** Puts a track in a station slot (first empty one by default), removing it from where it was. False when full. */
  assign(trackIdValue: string, station: LibraryStationId, index?: number): boolean {
    if (!this.tracks.has(trackIdValue) || !isStationId(station)) return false;
    const arr = this.slots.get(station)!;
    const prev = this.locate(trackIdValue);
    let target = index;
    if (target === undefined) target = arr.findIndex((t) => t === null || (prev && prev.station === station && t === trackIdValue));
    if (target === undefined || target < 0 || target >= arr.length) return false;
    if (prev && prev.station === station && prev.index === target) return true;
    this.begin();
    // Target occupied: the displaced track swaps into the old slot, or returns to the pool.
    const displaced = arr[target];
    if (prev) this.slots.get(prev.station)![prev.index] = displaced && prev ? displaced : null;
    arr[target] = trackIdValue;
    this.touch();
    this.end();
    return true;
  }

  clearSlot(station: LibraryStationId, index: number): void {
    const arr = this.slots.get(station);
    if (!arr || index < 0 || index >= arr.length || arr[index] === null) return;
    arr[index] = null;
    this.touch();
    this.notify();
  }

  /** Empties every slot but keeps the tracks in the pool. */
  clearAllSlots(): void {
    for (const arr of this.slots.values()) arr.fill(null);
    this.touch();
    this.notify();
  }

  updateDuration(trackIdValue: string, seconds: number): void {
    const t = this.tracks.get(trackIdValue);
    if (t && seconds > 0 && Math.abs(t.duration - seconds) > 0.5) { t.duration = seconds; this.touch(); }
  }

  /** Forgets everything: slots, pool, remembered folder, stored data. Revokes blob URLs. */
  reset(): void {
    for (const t of this.tracks.values()) this.revoke(t.url);
    this.tracks.clear();
    for (const [id, arr] of this.slots) arr.fill(null, 0, stationDef(id).slots);
    this.folderName = '';
    this.storage?.clear();
    this.dirty = false;
    this.notify();
  }

  /* ---------- persistence ---------- */

  serialize(): PersistedLibrary {
    const used = new Set<string>();
    const slots: Record<string, Array<string | null>> = {};
    for (const [id, arr] of this.slots) { slots[id] = [...arr]; for (const t of arr) if (t) used.add(t); }
    const pool: TrackMeta[] = [...this.tracks.values()].map((t) => ({ id: t.id, name: t.name, path: t.path, size: t.size, lastModified: t.lastModified, duration: t.duration }));
    return { v: 1, pool, slots, ...(this.folderName ? { folderName: this.folderName } : {}) };
  }

  /** Loads persisted metadata. Tracks have no URL until their files are imported again. */
  restore(data: PersistedLibrary | null): void {
    if (!data || data.v !== 1) return;
    this.tracks.clear();
    for (const m of data.pool ?? []) {
      if (!m || typeof m.id !== 'string' || typeof m.path !== 'string') continue;
      this.tracks.set(m.id, { id: m.id, name: typeof m.name === 'string' && m.name ? m.name : trackTitle(m.path), path: m.path, size: finiteNum(m.size), lastModified: finiteNum(m.lastModified), duration: finiteNum(m.duration) });
    }
    const seen = new Set<string>();
    for (const [id, arr] of this.slots) {
      arr.fill(null);
      const src = data.slots?.[id];
      if (!Array.isArray(src)) continue;
      for (let i = 0; i < arr.length && i < src.length; i++) {
        const t = src[i];
        if (typeof t === 'string' && this.tracks.has(t) && !seen.has(t)) { arr[i] = t; seen.add(t); }
      }
    }
    this.folderName = typeof data.folderName === 'string' ? data.folderName : '';
    this.notify();
  }

  /* ---------- internals ---------- */

  private revoke(url?: string): void {
    if (!url || !url.startsWith('blob:')) return;
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }

  private begin(): void { this.batch++; }
  private end(): void {
    if (--this.batch > 0) return;
    this.flush();
  }
  private touch(): void { this.dirty = true; }
  private flush(): void {
    if (this.dirty) { this.dirty = false; this.storage?.save(this.serialize()); }
    this.notify();
  }
  private notify(): void {
    if (this.dirty) { this.dirty = false; this.storage?.save(this.serialize()); }
    for (const fn of [...this.listeners]) fn();
  }
}
