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
import type { Rng } from '@/core/Rng';
import type { IMaterialLibrary, StaticCollider } from '@/world/types';
import type { LotSpec } from '@/world/buildings/facade';
import type { Quality } from '@/render/Shadows';
import { CHUNK_RANGE_PER_M_HEIGHT, chunkKeyOf, type ChunkLayout } from '@/render/Culling';
import { PHONE_HIDDEN_MESH } from '@/render/TierGeometry';
import type { RealLot } from './lotsReal';
import { BUILDING_BASE_Y, STOREY_M, buildRealBuildings, fitFootprint, specForRealLot } from './buildingsReal';

export interface StreamRanges {
  /** small-detail meshes (fire escapes, tanks, fences, wires) are drawn inside this distance; 0 = never built */
  detail: number;
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
  phone: { detail: 0, near: 100, far: 140 },
  low: { detail: 90, near: 190, far: 420 },
  medium: { detail: 140, near: 260, far: 520 },
  high: { detail: 260, near: 330, far: 520 },
};

/** a chunk keeps its level this much farther out than it was granted (no flapping at the border) */
export const STREAM_MARGIN = 30;
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

const FAMILY_COLOUR: Record<string, [number, number, number]> = {
  brownstone: [0.42, 0.25, 0.19],
  brick: [0.55, 0.29, 0.23],
  tanBrick: [0.66, 0.54, 0.38],
  paintedBrick: [0.64, 0.62, 0.58],
  limestone: [0.72, 0.70, 0.62],
};
const ROOF_COLOUR: [number, number, number] = [0.2, 0.2, 0.21];
const FAR_EXTRA_H = 1.2;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/** one merged box-and-roof geometry for the lots of a chunk (null when none has a footprint). Built at BUILDING_BASE_Y local 0. */
export function buildFarGeometry(lots: ReadonlyArray<RealLot>): THREE.BufferGeometry | null {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], k: [number, number, number]): void => {
    for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); col.push(k[0], k[1], k[2]); }
  };
  let boxes = 0;
  for (const lot of lots) {
    if (lot.wedge || lot.type === 'vacant') continue;
    const fp = fitFootprint(lot);
    if (!fp) continue;
    const spec = specForRealLot(lot);
    const dx = lot.frontB.x - lot.frontA.x, dz = lot.frontB.z - lot.frontA.z;
    const W = Math.hypot(dx, dz) || 1;
    const ux = dx / W, uz = dz / W;
    // the generator builds toward -outward from the front line
    const ox = lot.outward.x, oz = lot.outward.z;
    const P = (s: number, depth: number): [number, number] => [lot.frontA.x + ux * s - ox * depth, lot.frontA.z + uz * s - oz * depth];
    const [ax, az] = P(fp.xl, 0), [bx, bz] = P(fp.xr, 0), [cx, cz] = P(fp.xr, fp.depth), [ex, ez] = P(fp.xl, fp.depth);
    const H = Math.max(1, spec.floors) * STOREY_M + FAR_EXTRA_H;
    const base = FAMILY_COLOUR[spec.family] ?? FAMILY_COLOUR.brick;
    const v = 0.9 + hash01(lot.bbl) * 0.2;
    const k: [number, number, number] = [base[0] * v, base[1] * v, base[2] * v];
    const A0 = [ax, 0, az], B0 = [bx, 0, bz], C0 = [cx, 0, cz], D0 = [ex, 0, ez];
    const A1 = [ax, H, az], B1 = [bx, H, bz], C1 = [cx, H, cz], D1 = [ex, H, ez];
    // orientation-agnostic: the sides are wound by the sign of the footprint's area so faces point outward
    const area = (bx - ax) * (ez - az) - (bz - az) * (ex - ax);
    const s = area >= 0 ? 1 : -1;
    const side = (p0: number[], p1: number[], q1: number[], q0: number[], nx: number, nz: number): void => {
      if (s > 0) quad(p0, p1, q1, q0, [nx, 0, nz], k); else quad(p1, p0, q0, q1, [nx, 0, nz], k);
    };
    // outward normals of the four sides in the A,B,C,D loop
    const nrm4 = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
      const lx = x1 - x0, lz = z1 - z0, l = Math.hypot(lx, lz) || 1;
      return [(s * lz) / l, (-s * lx) / l];
    };
    // normals are computed so that they point away from the footprint centre
    const mx = (ax + cx) / 2, mz = (az + cz) / 2;
    const fix = (n: [number, number], x0: number, z0: number, x1: number, z1: number): [number, number] => {
      const toward = (x0 + x1) / 2 - mx, toz = (z0 + z1) / 2 - mz;
      return n[0] * toward + n[1] * toz >= 0 ? n : [-n[0], -n[1]];
    };
    side(A0, B0, B1, A1, ...fix(nrm4(ax, az, bx, bz), ax, az, bx, bz));
    side(B0, C0, C1, B1, ...fix(nrm4(bx, bz, cx, cz), bx, bz, cx, cz));
    side(C0, D0, D1, C1, ...fix(nrm4(cx, cz, ex, ez), cx, cz, ex, ez));
    side(D0, A0, A1, D1, ...fix(nrm4(ex, ez, ax, az), ex, ez, ax, az));
    if (s > 0) quad(A1, B1, C1, D1, [0, 1, 0], ROOF_COLOUR); else quad(B1, A1, D1, C1, [0, 1, 0], ROOF_COLOUR);
    boxes++;
  }
  if (!boxes) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const triOf = (g: THREE.BufferGeometry): number => (g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3);

// ---------------------------------------------------------------- the streamer

export class RealBuildingStreamer {
  readonly root = new THREE.Group();
  readonly ranges: StreamRanges;
  readonly chunks: ReadonlyMap<string, Chunk>;
  private readonly all: Chunk[] = [];
  private readonly farMaterial: THREE.MeshStandardMaterial;
  private readonly geoms = new Set<THREE.BufferGeometry>();
  private readonly bigLayout: ChunkLayout;
  private readonly now: () => number;
  private readonly budgetMs: number;
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
    this.root.name = 'buildings-stream';
    this.farMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const map = new Map<string, Chunk>();
    for (const lot of o.lots) {
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
    }
    this.chunks = map;
  }

  // ------------------------------------------------------------ per frame

  /** Streams around (px, pz). `py` is the camera height: the far range grows with it (aerials see the skyline). Returns ms spent. */
  update(px: number, pz: number, py = 0, budgetMs = this.budgetMs): number {
    const t0 = this.now();
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
    queue.sort((a, b) => a.dist - b.dist);
    if (this.active && !queue.includes(this.active)) this.active = null;
    let first = true;
    while (queue.length && (first || this.now() - t0 < budgetMs)) {
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
    const g = buildFarGeometry(c.lots);
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
      const res = buildRealBuildings([lot], this.o.materials, this.o.rng, { layout: this.bigLayout, looks: this.o.looks });
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
    for (const m of job.merged) {
      g.add(m);
      if (this.ranges.detail > 0 && PHONE_HIDDEN_MESH.test(m.name) && c.dist > this.ranges.detail) m.visible = false;
    }
    if (c.dist > this.ranges.detail) g.userData.detailOn = false;
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
