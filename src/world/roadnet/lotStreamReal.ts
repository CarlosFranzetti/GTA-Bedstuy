/**
 * MAP7: lots of the real map placed tile by tile (512 m, lotTiles.ts) as the player comes near. REAL PATH ONLY.
 *
 *   const tiles = new RealLotTiles({ net, derived, faces, bad, source });
 *   await tiles.init();
 *   const boot = await tiles.loadWhere((b) => overlapsFirstRings(b));   // RealLot[] placed now
 *   each frame: tiles.update(px, pz, radius)                            // starts loads (two at a time); finished ones arrive in onLots
 *
 * `source` is `fetchLotSource()` in the browser (public/data/real/lots-*.json) or a reader of the same files in tests.
 * Placement is `placeLotsDetailed(..., blocks)` with the blocks whose centre lies in the tile, so a tile never changes the
 * lots of another one.
 */
import type { Derived } from './derive';
import type { RealFace } from './faces';
import type { RoadNet } from './RoadNet';
import { placeLotsDetailed, type RealLot } from './lotsReal';
import { blockTiles, decodeLotTile, tileBounds, type LotTileIndex, type LotTileJson } from './lotTiles';

export interface LotSource {
  index(): Promise<LotTileIndex>;
  tile(key: string): Promise<LotTileJson>;
}

/** fetches `${base}data/real/...` (hosted and native builds; the single-file build never reaches this) */
export function fetchLotSource(base?: string, fetcher: typeof fetch = fetch): LotSource {
  const b = base ?? (() => { try { return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'; } catch { return '/'; } })();
  const get = async <T>(file: string): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetcher(`${b}data/real/${file}`);
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return (await r.json()) as T;
      } catch (e) { if (attempt >= 2) throw e; await new Promise((res) => setTimeout(res, 400 * (attempt + 1))); }
    }
  };
  return { index: () => get<LotTileIndex>('lots-index.json'), tile: (k) => get<LotTileJson>(`lots-${k}.json`) };
}

export interface LotTilesOptions {
  net: RoadNet;
  derived: Derived;
  faces: RealFace[][];
  /** blocks that get no lots (derive defect: building ring leaves the kerb ring) */
  bad: ReadonlySet<number>;
  source: LotSource;
  /** called with the lots of every tile placed after `init` (not for those returned by `loadWhere`) */
  onLots?: (lots: RealLot[], key: string) => void;
  /** tiles being fetched at once (default 2) */
  concurrency?: number;
}

export class RealLotTiles {
  private idx: LotTileIndex | null = null;
  private byTile = new Map<string, number[]>();
  private readonly state = new Map<string, 'loading' | 'done' | 'failed'>();
  private inflight = 0;
  placedLots = 0;
  placeMs = 0;
  readonly failures: string[] = [];

  constructor(private readonly o: LotTilesOptions) {}

  async init(): Promise<LotTileIndex> {
    this.idx = await this.o.source.index();
    this.byTile = blockTiles(this.o.net.blocks.map((_, i) => this.o.net.blockRing(i)));
    return this.idx;
  }

  get keys(): string[] { return this.idx ? Object.keys(this.idx.tiles) : []; }
  get total(): number { return this.keys.length; }
  get loaded(): number { let n = 0; for (const s of this.state.values()) if (s === 'done') n++; return n; }
  get pending(): number { let n = 0; for (const s of this.state.values()) if (s === 'loading') n++; return n; }

  /** distance (m) from a point to the lots of a tile (to the box of their centres) */
  distanceTo(key: string, px: number, pz: number): number {
    const b = this.idx?.tiles[key]?.b ?? tileBounds(key);
    const dx = Math.max(b[0] - px, 0, px - b[2]), dz = Math.max(b[1] - pz, 0, pz - b[3]);
    return Math.hypot(dx, dz);
  }

  /** fetch and place one tile (memoised); resolves with its lots ([] when it failed or does not exist) */
  async load(key: string): Promise<RealLot[]> {
    if (!this.idx?.tiles[key] || this.state.has(key)) return [];
    this.state.set(key, 'loading');
    this.inflight++;
    try {
      const j = await this.o.source.tile(key);
      const t0 = performance.now();
      const blocks = new Set((this.byTile.get(key) ?? []).filter((b) => !this.o.bad.has(b)));
      const lots = placeLotsDetailed(this.o.net, this.o.derived, this.o.faces, decodeLotTile(j), blocks).lots;
      this.placeMs += performance.now() - t0;
      this.placedLots += lots.length;
      this.state.set(key, 'done');
      return lots;
    } catch (e) {
      this.state.set(key, 'failed');
      this.failures.push(`${key}: ${(e as Error).message}`);
      return [];
    } finally { this.inflight--; }
  }

  /** load every tile whose lot box passes `pred`, all at once, and return their lots */
  async loadWhere(pred: (box: [number, number, number, number], key: string) => boolean): Promise<RealLot[]> {
    const keys = this.keys.filter((k) => pred(this.idx!.tiles[k].b, k));
    return (await Promise.all(keys.map((k) => this.load(k)))).flat();
  }

  /** start loading the tiles within `radius` of (px, pz), nearest first, while fewer than `concurrency` are in flight */
  update(px: number, pz: number, radius: number): void {
    if (!this.idx) return;
    const max = this.o.concurrency ?? 2;
    if (this.inflight >= max) return;
    const want = this.keys.filter((k) => !this.state.has(k) && this.distanceTo(k, px, pz) <= radius)
      .sort((a, b) => this.distanceTo(a, px, pz) - this.distanceTo(b, px, pz));
    for (const k of want) {
      if (this.inflight >= max) break;
      void this.deliver(k);
    }
  }

  private readonly delivered = new Map<string, Promise<void>>();
  /** load a tile and hand its lots to `onLots` (once); the promise resolves when that has happened */
  deliver(key: string): Promise<void> {
    let p = this.delivered.get(key);
    if (!p) { p = this.load(key).then((lots) => { if (lots.length) this.o.onLots?.(lots, key); }); this.delivered.set(key, p); }
    return p;
  }

  /** resolve when every tile within `radius` of (px, pz) has been placed and delivered (renders, teleports) */
  async ensure(px: number, pz: number, radius: number): Promise<void> {
    await Promise.all(this.keys.filter((k) => this.distanceTo(k, px, pz) <= radius).map((k) => this.state.has(k) && !this.delivered.has(k) ? Promise.resolve() : this.deliver(k)));
  }

  /** every tile (renders: the aerial of the whole map) */
  async loadAll(): Promise<void> { await Promise.all(this.keys.map((k) => this.deliver(k))); }
}
