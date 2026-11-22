/**
 * REALSTREAM: the real map's buildings, streamed by 128 m chunk around the player (dynamic-import path only).
 *
 *   const bs = new RealBuildingStreamer({ lots, materials, rng, layout, tier, colliders: { add, remove } });
 *   scene.add(bs.root);
 *   each frame: bs.update(playerX, playerZ, cameraY);      // <= ~3 ms of work, never a stall
 *
 * Why. `buildRealBuildings` on the first ring is 2,205 buildings, 1.58 M triangles, 4,336 meshes and about a minute of build,
 * which can be neither built up front nor drawn whole. Three levels per chunk, by distance d from the player to the chunk square:
 *
 *   near   d <= near      full detail, built lot by lot (one `buildRealBuildings` call per lot, `budgetMs` of calls per
 *                         update), then merged into ONE mesh per material for the whole chunk (<= ~26 draws, was 74)
 *          d <= detail    ... including the small-detail classes (fire escapes, tanks, fences: PHONE_HIDDEN_MESH names);
 *                         between `detail` and `near` those meshes are hidden (phone never builds them)
 *          d <= trim      ... including the facade trim (windows, awnings, cornice, stoop, roll gates, shop glass: TRIM_MESH names,
 *                         a draw each per chunk); between `trim` and `near` those meshes are hidden (low and phone only)
 *   far    d <= far       one merged box-and-roof mesh per chunk in the facade colour, 1 draw, ~10 triangles per building
 *   none   beyond         nothing is held
 * Chunks that leave `near + STREAM_MARGIN` are disposed (geometry and colliders), far meshes beyond `far + STREAM_MARGIN`.
 * Colliders are handed to the host with `colliders.add` once a near chunk is complete and taken back with `colliders.remove(ids)`
 * (every collider gets the id `rs:<chunk>:<n>`).
 *
 * Determinism: a chunk is always built from the same lots, one at a time in the same order, so the buildings of a chunk are
 * identical whenever it is rebuilt. (A joint build of a whole chunk would pick different material variants than lot-by-lot, so
 * the slicing is fixed, not adaptive.)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, StaticCollider } from '@/world/types';
import type { LotSpec } from '@/world/buildings/facade';
import type { Quality } from '@/render/Shadows';
import { CHUNK_RANGE_PER_M_HEIGHT, chunkKeyOf, type ChunkLayout } from '@/render/Culling';
import { PHONE_HIDDEN_MESH, TRIM_MESH } from '@/render/TierGeometry';
import type { RealLot } from './lotsReal';
import { BUILDING_BASE_Y, buildRealBuildings, fitFootprint, specForBuild } from './buildingsReal';
import { lotColourway } from '@/world/buildings/colourway';
import { FAR_KIND, FAR_PARLOUR_H, FAR_UPPER_H, makeFarMaterial } from './farFacade';

export interface StreamRanges {
  /** small-detail meshes (fire escapes, tanks, fences, wires) are drawn inside this distance; 0 = never built */
  detail: number;
  /** facade trim meshes (TRIM_MESH) are drawn inside this distance; Infinity = with the whole near chunk */
  trim: number;
  /** full-detail buildings inside this distance (m, to the chunk square) */
  near: number;
  /** box-and-roof silhouettes inside this distance */
  far: number;
}

/**
 * Per tier. phone: the fog ends at 100 m, so nothing is built farther and the far boxes only cover the fog edge. low and medium:
 * the tier's chunk range (Culling.chunkRangeFor: 420 / 520 m) is the far range. See the REALSTREAM report for the numbers.
 */
export const STREAM_RANGES: Record<Quality, StreamRanges> = {
  phone: { detail: 0, trim: 40, near: 80, far: 120 },
  low: { detail: 80, trim: 100, near: 160, far: 380 },
  medium: { detail: 140, trim: Infinity, near: 260, far: 520 },
  high: { detail: 260, trim: Infinity, near: 330, far: 520 },
};

/** a chunk keeps its level this much farther out than it was granted (no flapping at the border) */
export const STREAM_MARGIN = 30;
/** chunks in front of the camera are built this much sooner (m of distance) */
export const FRONT_BONUS_M = 45;
/** while a chunk this close is still missing the streamer spends more of each frame (arrival after a teleport or a fast drive) */
export const HURRY_NEAR_M = 45;
export const HURRY_NEAR_MS = 12;
export const HURRY_MID_M = 90;
export const HURRY_MID_MS = 6;
export const DEFAULT_BUDGET_MS = 3;

export interface ColliderHost {
  add(colliders: StaticCollider[]): void;
  remove(ids: string[]): void;
}

export interface StreamerOptions {
  lots: ReadonlyArray<RealLot>;
  materials: IMaterialLibrary;
  rng: Rng;
  /** chunkLayoutFromBounds(net.bounds): only originX/originZ and chunkX/chunkZ are used (128 m) */
  layout: ChunkLayout;
  tier: Quality;
  looks?: (bbl: string) => Partial<LotSpec> | undefined;
  colliders?: ColliderHost;
  ranges?: Partial<StreamRanges>;
  /** work per update() call (ms); a single lot may overshoot it */
  budgetMs?: number;
  now?: () => number;
}

export interface StreamStats {
  chunks: number;
  near: number;
  far: number;
  building: number;
  /** chunks wanting full detail that are not built yet */
  queued: number;
  /** BufferGeometry objects this streamer holds right now */
  geometries: number;
  colliders: number;
  /** triangles of everything held (visible or not) */
  triangles: number;
  builtChunks: number;
  disposedChunks: number;
  buildMs: number;
}

interface Job {
  next: number;
  parts: THREE.Group[];
  colliders: StaticCollider[];
  names: string[] | null;
  mergeIdx: number;
  buckets: Map<string, THREE.Mesh[]> | null;
  merged: THREE.Mesh[];
}

interface Chunk {
  key: string;
  minX: number; maxX: number; minZ: number; maxZ: number;
  lots: RealLot[];
  far: THREE.Mesh | null;
  near: THREE.Group | null;
  job: Job | null;
  colliderIds: string[];
  dist: number;
  nearWanted: boolean;
  farWanted: boolean;
  farTried: boolean;
}

// ---------------------------------------------------------------- far boxes

/** the detailed wall renders a little darker than its colourway target (soot, damp base, window reveals, ambient occlusion): measured in the running game */
export const FAR_WALL_GAIN = 0.92;
const ROOF_EXTRA_H = 0.6;
const GROUND_SHOP_H = 3.6;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const lin = (c: number): number => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
const q8 = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));

/** Wall height (m above the sidewalk) of the detailed building the lot would build: the generators' own storey rules. */
export function farHeight(spec: LotSpec, lot: RealLot): { H: number; floors: number; bh: number } {
  const fl = Number.isFinite(spec.floors) ? spec.floors : 3; // a per-BBL look can carry undefined fields
  const n = Math.max(1, Math.round(fl));
  if (spec.use === 'mixed') { const up = n >= 2 ? Math.min(5, n - 1) : 2; return { H: GROUND_SHOP_H + up * FAR_UPPER_H + ROOF_EXTRA_H, floors: up + 1, bh: 0 }; }
  if (spec.use === 'apartment') {
    if (lot.poi?.archetype === 'condo') return { H: 3.6 + 6 * 3.3 + ROOF_EXTRA_H, floors: 7, bh: 0 };
    const f = Math.max(3, Math.min(7, n));
    return { H: FAR_PARLOUR_H + (f - 1) * FAR_UPPER_H + ROOF_EXTRA_H, floors: f, bh: 0 };
  }
  if (spec.use === 'church') return { H: Math.max(8.5, Math.min(11, fl * 3.1)) + 1, floors: Math.max(2, Math.round(Math.max(8.5, Math.min(11, fl * 3.1)) / 3.4)), bh: 0 };
  const f = Math.max(2, Math.min(6, n));
  const sh = spec.stoop?.heightM;
  const bh = spec.stoop?.present && Number.isFinite(sh) ? Math.max(0.6, Math.min(2.2, sh as number)) : 0;
  return { H: bh + FAR_PARLOUR_H + (f - 1) * FAR_UPPER_H + ROOF_EXTRA_H, floors: f, bh };
}

/**
 * one merged box-and-roof geometry for the lots of a chunk (null when none has a footprint). Built at BUILDING_BASE_Y local 0.
 * Per lot it carries the data `farFacade.ts` draws a facade from (colourway colour, floors, shop, cornice). `looks` is the same
 * per-BBL hook the detailed build uses, so the box has the colour the building will have when its detail arrives.
 */
export function buildFarGeometry(lots: ReadonlyArray<RealLot>, looks?: (bbl: string) => Partial<LotSpec> | undefined): THREE.BufferGeometry | null {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], win: number[] = [], lotA: number[] = [], trimA: number[] = [], awnA: number[] = [];
  let boxes = 0;
  for (const lot of lots) {
    if (lot.wedge || lot.type === 'vacant') continue;
    const fp = fitFootprint(lot);
    if (!fp) continue;
    const spec = specForBuild(lot, looks);
    const cw = lotColourway({ id: lot.id, type: lot.type, spec });
    const { H, floors, bh } = farHeight(spec, lot);
    const shop = spec.use === 'mixed' || !!lot.poi && lot.poi.archetype !== 'church' && lot.poi.archetype !== 'condo';
    const dx = lot.frontB.x - lot.frontA.x, dz = lot.frontB.z - lot.frontA.z;
    const W = Math.hypot(dx, dz) || 1;
    const ux = dx / W, uz = dz / W;
    // the generator builds toward -outward from the front line
    const ox = lot.outward.x, oz = lot.outward.z;
    const P = (s: number, depth: number): [number, number] => [lot.frontA.x + ux * s - ox * depth, lot.frontA.z + uz * s - oz * depth];
    const c0 = [P(fp.xl, 0), P(fp.xr, 0), P(fp.xr, fp.depth), P(fp.xl, fp.depth)];
    if (![H, floors, bh, ...c0[0], ...c0[1], ...c0[2], ...c0[3]].every(Number.isFinite)) continue; // never hand the GPU a NaN (it also kills the bounding sphere, so the whole chunk would be culled)
    const bw = fp.xr - fp.xl;
    const seed = hash01(lot.bbl);
    const wall: [number, number, number] = [lin(cw.front[0]) * FAR_WALL_GAIN, lin(cw.front[1]) * FAR_WALL_GAIN, lin(cw.front[2]) * FAR_WALL_GAIN];
    const party = cw.party[0];
    const partyC: [number, number, number] = [lin(party[0]) * FAR_WALL_GAIN, lin(party[1]) * FAR_WALL_GAIN, lin(party[2]) * FAR_WALL_GAIN];
    // roof: the colourway's roof surface (tar, silver coat, gravel, membrane, mineral cap), as the detailed roof will be
    const roof: [number, number, number] = [lin(cw.roof[0]) * 0.95, lin(cw.roof[1]) * 0.95, lin(cw.roof[2]) * 0.95];
    const corn = cw.cornice, awn = cw.awning[0];
    const cx = (c0[0][0] + c0[2][0]) / 2, cz = (c0[0][1] + c0[2][1]) / 2;
    const exposedEdge = lot.corner ? (lot.cornerEnd === 'a' ? 3 : 1) : -1;
    const push = (n: number, k: [number, number, number], u: number[], kind: number): void => {
      for (let i = 0; i < n; i++) {
        col.push(q8(k[0]), q8(k[1]), q8(k[2]), 255);
        win.push(u[i * 2], u[i * 2 + 1], bw, kind);
        lotA.push(Math.round(floors / 32 * 255), Math.round(seed * 255), Math.round(Math.min(4, bh) / 4 * 255), shop ? 255 : 0);
        trimA.push(q8(lin(corn[0])), q8(lin(corn[1])), q8(lin(corn[2])), Math.round(hash01(lot.bbl + 't') * 255));
        awnA.push(q8(lin(awn[0])), q8(lin(awn[1])), q8(lin(awn[2])), 255);
      }
    };
    /** quad a-b-c-d (a loop), wound so that its normal points along `out`; `uv` holds the wall coordinates (m) of the four corners */
    const quad = (a: number[], b: number[], c: number[], dd: number[], out: [number, number, number], k: [number, number, number], uv: number[], kind: number): void => {
      const ux2 = b[0] - a[0], uy = b[1] - a[1], uz2 = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz2 * vy, ny = uz2 * vx - ux2 * vz, nz = ux2 * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
      if (flip) { nx = -nx; ny = -ny; nz = -nz; }
      const pts = [a, b, c, dd];
      const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      const uvs: number[] = [];
      for (const i of order) { const p = pts[i]; pos.push(p[0], p[1], p[2]); nrm.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127), 0); uvs.push(uv[i * 2], uv[i * 2 + 1]); }
      push(6, k, uvs, kind);
    };
    for (let i = 0; i < 4; i++) {
      const p = c0[i], q = c0[(i + 1) % 4];
      let nx = q[1] - p[1], nz = -(q[0] - p[0]);
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      if (nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[1] + q[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      // the wall coordinate runs along the lot frame (front: 0 at the left end as seen from the street)
      const facade = i === 0 || i === exposedEdge;
      const kind = facade ? FAR_KIND.facade : FAR_KIND.plain;
      const u0 = 0, u1 = len;
      quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], H, q[1]], [p[0], H, p[1]], [nx, 0, nz], facade ? wall : partyC, [u0, 0, u1, 0, u1, H, u0, H], kind);
    }
    quad([c0[0][0], H, c0[0][1]], [c0[1][0], H, c0[1][1]], [c0[2][0], H, c0[2][1]], [c0[3][0], H, c0[3][1]], [0, 1, 0], roof, [0, 0, bw, 0, bw, fp.depth, 0, fp.depth], FAR_KIND.roof);
    boxes++;
  }
  if (!boxes) return null;
  const g = new THREE.BufferGeometry();
  const u8 = (a: number[], n: number, norm = true): THREE.BufferAttribute => new THREE.BufferAttribute(new Uint8Array(a), n, norm);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nrm), 4, true));
  g.setAttribute('color', u8(col, 4));
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(win, 4));
  g.setAttribute('aLot', u8(lotA, 4));
  g.setAttribute('aTrim', u8(trimA, 4));
  g.setAttribute('aAwn', u8(awnA, 4));
  g.computeBoundingSphere();
  return g;
}

const triOf = (g: THREE.BufferGeometry): number => (g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3);

// ---------------------------------------------------------------- the streamer

export class RealBuildingStreamer {
  readonly root = new THREE.Group();
  readonly ranges: StreamRanges;
  readonly chunks: ReadonlyMap<string, Chunk>;
  private readonly map = new Map<string, Chunk>();
  private readonly all: Chunk[] = [];
  private readonly farMaterial: THREE.MeshStandardMaterial;
  private readonly geoms = new Set<THREE.BufferGeometry>();
  private readonly bigLayout: ChunkLayout;
  private readonly now: () => number;
  private readonly budgetMs: number;
  private readonly seed: number;
  private colliderCount = 0;
  private builtChunks = 0;
  private disposedChunks = 0;
  private buildMs = 0;
  private active: Chunk | null = null;

  constructor(private readonly o: StreamerOptions) {
    this.ranges = { ...STREAM_RANGES[o.tier], ...(o.ranges ?? {}) };
    this.budgetMs = o.budgetMs ?? DEFAULT_BUDGET_MS;
    this.now = o.now ?? ((): number => performance.now());
    this.bigLayout = { ...o.layout, cellX: 1e6, cellZ: 1e6, chunkX: 1e6, chunkZ: 1e6 };
    // Rng.fork consumes its parent: draw the seed once, then give every lot a fresh generator so a rebuilt chunk is identical
    this.seed = Math.floor(o.rng.next() * 0xffffffff) >>> 0;
    this.root.name = 'buildings-stream';
    this.root.userData.streamer = this; // review hook: scene.getObjectByName('buildings-stream').userData.streamer.stats()
    this.farMaterial = makeFarMaterial();
    this.chunks = this.map;
    this.addLots(o.lots);
  }

  /** Adds lots after construction (MAP7: lot tiles stream in as the player nears them). Chunks are keyed as at construction. */
  addLots(lots: ReadonlyArray<RealLot>): void {
    const o = this.o, map = this.map;
    for (const lot of lots) {
      const mx = (lot.frontA.x + lot.frontB.x) / 2, mz = (lot.frontA.z + lot.frontB.z) / 2;
      const key = chunkKeyOf(o.layout, mx, mz);
      let c = map.get(key);
      if (!c) {
        const [ix, iz] = key.split('_').map(Number);
        const minX = o.layout.originX + ix * o.layout.chunkX, minZ = o.layout.originZ + iz * o.layout.chunkZ;
        c = { key, minX, maxX: minX + o.layout.chunkX, minZ, maxZ: minZ + o.layout.chunkZ, lots: [], far: null, near: null, job: null, colliderIds: [], dist: Infinity, nearWanted: false, farWanted: false, farTried: false };
        map.set(key, c);
        this.all.push(c);
      }
      c.lots.push(lot);
      // the chunk gained a lot after it was built (a block's lots can straddle two tiles' chunks): drop what it holds, it rebuilds
      if (c.far) { this.disposeFar(c); c.farTried = false; }
      if (c.near || c.job) this.disposeNear(c);
    }
  }

  // ------------------------------------------------------------ per frame

  /** Streams around (px, pz). `py` is the camera height: the far range grows with it (aerials see the skyline). Returns ms spent. */
  update(px: number, pz: number, py = 0, budgetArg?: number, camX?: number, camZ?: number): number {
    const budgetMs = budgetArg ?? this.budgetMs;
    const t0 = this.now();
    // the far massing's windows light up with the detailed windows (same night intensity)
    try { const wm = this.o.materials.get('window', 0) as THREE.MeshStandardMaterial; this.farMaterial.emissiveIntensity = typeof wm.emissiveIntensity === 'number' ? wm.emissiveIntensity : 0; } catch { /* stub library */ }
    // heading: from the camera to the player (the camera sits behind), so what is in front of the lens builds first
    let fx = 0, fz = 0;
    if (camX !== undefined && camZ !== undefined) { const l = Math.hypot(px - camX, pz - camZ); if (l > 0.5) { fx = (px - camX) / l; fz = (pz - camZ) / l; } }
    const boost = Math.max(0, py - 3) * CHUNK_RANGE_PER_M_HEIGHT;
    const r = this.ranges;
    const queue: Chunk[] = [];
    for (const c of this.all) {
      const dx = Math.max(c.minX - px, 0, px - c.maxX), dz = Math.max(c.minZ - pz, 0, pz - c.maxZ);
      c.dist = Math.hypot(dx, dz);
      c.nearWanted = c.dist <= r.near + (c.near || c.job ? STREAM_MARGIN : 0);
      c.farWanted = r.far > 0 && c.dist <= r.far + boost + (c.far ? STREAM_MARGIN : 0);
      if (!c.nearWanted && (c.near || c.job)) this.disposeNear(c);
      if (!c.farWanted && c.far) this.disposeFar(c);
      if (c.nearWanted && !c.near && c.dist <= r.near) queue.push(c);
    }
    // work: far boxes are nearly free, near chunks are built nearest-first
    for (const c of this.all) if (c.farWanted && !c.far && !c.farTried) this.buildFar(c);
    const rank = (c: Chunk): number => {
      if (!fx && !fz) return c.dist;
      const mx = (c.minX + c.maxX) / 2 - px, mz = (c.minZ + c.maxZ) / 2 - pz;
      const l = Math.hypot(mx, mz) || 1;
      return c.dist - FRONT_BONUS_M * Math.max(0, (mx * fx + mz * fz) / l) * Math.min(1, c.dist / 40);
    };
    queue.sort((a, b) => rank(a) - rank(b));
    if (this.active && !queue.includes(this.active)) this.active = null;
    // arrival: when a block close to the player is still missing (after a teleport, a load or a fast drive) the plain massing shows
    // right in front of the lens, so spend more of the frame on it until the near ring is in
    let budget = budgetMs;
    if (queue.length && budgetArg === undefined) { // only the per-frame call (no explicit budget) hurries
      let d0 = Infinity;
      for (const c of queue) if (c.dist < d0) d0 = c.dist;
      budget = Math.max(budgetMs, d0 <= HURRY_NEAR_M ? HURRY_NEAR_MS : d0 <= HURRY_MID_M ? HURRY_MID_MS : 0);
    }
    let first = true;
    while (queue.length && (first || this.now() - t0 < budget)) {
      first = false;
      const c = this.active && queue.includes(this.active) ? this.active : queue[0];
      this.active = c;
      this.step(c);
      if (c.near) { queue.splice(queue.indexOf(c), 1); this.active = null; }
    }
    // visibility: the near group shows inside near (+margin), the far box fills in until it is there; detail meshes by distance
    for (const c of this.all) {
      const nearShown = !!c.near && c.dist <= r.near + STREAM_MARGIN;
      if (c.near) {
        c.near.visible = nearShown;
        if (nearShown) {
          const showDetail = r.detail > 0 && c.dist <= r.detail + (c.near.userData.detailOn ? STREAM_MARGIN : 0);
          if (c.near.userData.detailOn !== showDetail) {
            c.near.userData.detailOn = showDetail;
            for (const m of c.near.children) if (PHONE_HIDDEN_MESH.test(m.name)) m.visible = showDetail;
          }
          const showTrim = c.dist <= r.trim + (c.near.userData.trimOn ? STREAM_MARGIN : 0);
          if (c.near.userData.trimOn !== showTrim) {
            c.near.userData.trimOn = showTrim;
            for (const m of c.near.children) if (TRIM_MESH.test(m.name)) m.visible = showTrim;
          }
        }
      }
      if (c.far) c.far.visible = !nearShown;
    }
    const spent = this.now() - t0;
    this.buildMs += spent;
    return spent;
  }

  /** Builds everything wanted around (px, pz) now (tests, loading screens, renders). Returns the number of update calls used. */
  settle(px: number, pz: number, py = 0): number {
    let n = 0;
    for (;;) {
      n++;
      this.update(px, pz, py, Infinity);
      const pending = this.all.some((c) => c.dist <= this.ranges.near && !c.near) ;
      if (!pending || n > 10000) return n;
    }
  }

  // ------------------------------------------------------------ build

  private buildFar(c: Chunk): void {
    c.farTried = true;
    const g = buildFarGeometry(c.lots, this.o.looks);
    if (!g) return;
    this.geoms.add(g);
    const m = new THREE.Mesh(g, this.farMaterial);
    m.name = `buildings-far:${c.key}`;
    m.position.y = BUILDING_BASE_Y;
    m.castShadow = false;
    m.receiveShadow = true;
    m.userData.chunk = c.key;
    m.userData.far = true;
    c.far = m;
    this.root.add(m);
  }

  private step(c: Chunk): void {
    let job = c.job;
    if (!job) job = c.job = { next: 0, parts: [], colliders: [], names: null, mergeIdx: 0, buckets: null, merged: [] };
    if (job.next < c.lots.length) {
      const lot = c.lots[job.next++];
      const res = buildRealBuildings([lot], this.o.materials, new Rng((Rng.hash(lot.id) ^ this.seed) >>> 0), { layout: this.bigLayout, looks: this.o.looks });
      job.parts.push(res.group);
      job.colliders.push(...res.colliders);
      return;
    }
    // merge stage: one material bucket per step
    if (!job.buckets) {
      job.buckets = new Map();
      for (const part of job.parts) {
        for (const ch of [...part.children]) {
          const m = ch as THREE.Mesh;
          if (!m.isMesh) continue;
          if (this.ranges.detail <= 0 && PHONE_HIDDEN_MESH.test(m.name)) continue;
          const mat = m.material as THREE.Material;
          const k = `${m.name}|${mat.uuid}`;
          const l = job.buckets.get(k);
          if (l) l.push(m); else job.buckets.set(k, [m]);
        }
      }
      job.names = [...job.buckets.keys()];
      return;
    }
    if (job.mergeIdx < job.names!.length) {
      const list = job.buckets.get(job.names![job.mergeIdx++])!;
      const first = list[0];
      const geo = list.length === 1 ? first.geometry : mergeGeometries(list.map((m) => m.geometry), false);
      if (geo) {
        this.geoms.add(geo);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, first.material);
        mesh.name = first.name;
        mesh.castShadow = first.castShadow;
        mesh.receiveShadow = first.receiveShadow;
        mesh.renderOrder = first.renderOrder;
        mesh.userData = { ...first.userData, chunk: c.key };
        job.merged.push(mesh);
      }
      for (const m of list) if (m.geometry !== geo) m.geometry.dispose();
      return;
    }
    // finish: one group, colliders to the host
    for (const part of job.parts) for (const ch of part.children) { const m = ch as THREE.Mesh; if (m.isMesh && !job.merged.some((x) => x.geometry === m.geometry)) m.geometry.dispose(); }
    const g = new THREE.Group();
    g.name = `buildings:${c.key}`;
    g.position.y = BUILDING_BASE_Y;
    g.userData.chunk = c.key;
    g.userData.detailOn = true;
    g.userData.trimOn = true;
    for (const m of job.merged) {
      g.add(m);
      if (this.ranges.detail > 0 && PHONE_HIDDEN_MESH.test(m.name) && c.dist > this.ranges.detail) m.visible = false;
      if (TRIM_MESH.test(m.name) && c.dist > this.ranges.trim) m.visible = false;
    }
    if (c.dist > this.ranges.detail) g.userData.detailOn = false;
    if (c.dist > this.ranges.trim) g.userData.trimOn = false;
    const cs = job.colliders;
    c.colliderIds = cs.map((col, i) => (col.id = `rs:${c.key}:${i}`));
    this.colliderCount += cs.length;
    this.o.colliders?.add(cs);
    c.near = g;
    c.job = null;
    this.root.add(g);
    this.builtChunks++;
  }

  // ------------------------------------------------------------ dispose

  private forget(g: THREE.BufferGeometry): void { g.dispose(); this.geoms.delete(g); }

  private disposeNear(c: Chunk): void {
    if (c.job) {
      for (const part of c.job.parts) part.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      for (const m of c.job.merged) this.forget(m.geometry);
      c.job = null;
    }
    if (c.near) {
      c.near.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) this.forget(m.geometry); });
      this.root.remove(c.near);
      c.near = null;
      this.disposedChunks++;
    }
    if (c.colliderIds.length) {
      this.o.colliders?.remove(c.colliderIds);
      this.colliderCount -= c.colliderIds.length;
      c.colliderIds = [];
    }
    if (this.active === c) this.active = null;
  }

  private disposeFar(c: Chunk): void {
    if (!c.far) return;
    this.forget(c.far.geometry);
    this.root.remove(c.far);
    c.far = null;
    c.farTried = false;
  }

  dispose(): void {
    for (const c of this.all) { this.disposeNear(c); this.disposeFar(c); }
    this.farMaterial.dispose();
    this.root.removeFromParent();
  }

  // ------------------------------------------------------------ numbers

  stats(): StreamStats {
    let near = 0, far = 0, building = 0, queued = 0, tris = 0;
    for (const c of this.all) {
      if (c.near) near++;
      if (c.far) far++;
      if (c.job) building++;
      if (c.nearWanted && !c.near && c.dist <= this.ranges.near) queued++;
    }
    for (const g of this.geoms) tris += triOf(g);
    return {
      chunks: this.all.length, near, far, building, queued, geometries: this.geoms.size, colliders: this.colliderCount, triangles: tris,
      builtChunks: this.builtChunks, disposedChunks: this.disposedChunks, buildMs: this.buildMs,
    };
  }

  /** chunk keys currently holding a full-detail group / a far box (tests, debug) */
  held(): { near: string[]; far: string[] } {
    return { near: this.all.filter((c) => c.near).map((c) => c.key), far: this.all.filter((c) => c.far).map((c) => c.key) };
  }
}
