/**
 * Culling helpers.
 *  - splitMeshesIntoCells: the world generators merge one geometry per material for the whole city; frustum culling
 *    then can never reject anything. This re-bins those triangles into a coarse XZ grid of cells (by triangle
 *    centroid) so each cell has a tight bounding sphere.
 *  - DistanceCuller: hides registered objects (prop cells, parked cars, peds) beyond a range.
 */
import * as THREE from 'three';
import type { Quality } from './Shadows';
import { TIER_CONFIG, tierConfig } from './QualityTier';
import { carPaintConfigured, carPaintTier } from './CarPaintFx';
import { clusterGeometry } from './FarGeometry';
import { PHONE_HIDDEN_MESH, TRIM_MESH } from './TierGeometry';
import './TriBreakdown'; // debug: window.__gtaTriBreakdown

/** Beyond this distance (m) from the player props, parked cars and peds are hidden. */
export const DEFAULT_CULL_DISTANCE = 220;

/** Cull range (m) for a quality tier: 220 everywhere except `phone` (110, hidden by its fog). */
export const cullDistanceFor = (q: Quality): number => TIER_CONFIG[q].cullDistance;

/**
 * True when a sphere (centre cx,cz on the ground plane, radius r) lies entirely farther than `maxDist` from (px,pz).
 * Pure; uses squared distances (no sqrt, no allocation).
 */
export function beyondRange(cx: number, cz: number, r: number, px: number, pz: number, maxDist: number): boolean {
  const dx = cx - px, dz = cz - pz;
  const limit = maxDist + Math.max(0, r);
  return dx * dx + dz * dz > limit * limit;
}

/** Hysteresis variant: an object that is currently hidden only reappears once it is `margin` m inside the range. */
export function shouldHide(wasHidden: boolean, cx: number, cz: number, r: number, px: number, pz: number, maxDist: number, margin = 6): boolean {
  return beyondRange(cx, cz, r, px, pz, wasHidden ? maxDist - margin : maxDist);
}

export interface CellKey { ix: number; iz: number; }

/** Cell index of a point for a grid of `cellX` x `cellZ` metres anchored at (`originX`, `originZ`) (default: the world origin). */
export function cellOf(x: number, z: number, cellX: number, cellZ: number, out: CellKey, originX = 0, originZ = 0): CellKey {
  out.ix = Math.floor((x - originX) / cellX);
  out.iz = Math.floor((z - originZ) / cellZ);
  return out;
}

type AnyArray = Float32Array | Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Uint8ClampedArray;

/** Splits one (merged) geometry into per-cell geometries by triangle centroid. Returns null if it cannot be split. */
export function splitGeometryByCell(geo: THREE.BufferGeometry, cellX: number, cellZ: number, originX = 0, originZ = 0): Map<string, THREE.BufferGeometry> | null {
  const pos = geo.getAttribute('position');
  if (!pos || (pos as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
  if (geo.groups.length > 1) return null;
  const attrs: Array<[string, THREE.BufferAttribute]> = [];
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
    attrs.push([name, a as THREE.BufferAttribute]);
  }
  if (Object.keys(geo.morphAttributes).length > 0) return null;

  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  if (!Number.isInteger(triCount)) return null;
  const vi = (t: number, k: number): number => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const px = pos.array as AnyArray, ps = pos.itemSize;

  // bin triangles
  const bins = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
    const cx = (px[a * ps] + px[b * ps] + px[c * ps]) / 3;
    const cz = (px[a * ps + 2] + px[b * ps + 2] + px[c * ps + 2]) / 3;
    const key = `${Math.floor((cx - originX) / cellX)}_${Math.floor((cz - originZ) / cellZ)}`;
    let list = bins.get(key);
    if (!list) { list = []; bins.set(key, list); }
    list.push(t);
  }

  const out = new Map<string, THREE.BufferGeometry>();
  const remap = new Int32Array(pos.count);
  for (const [key, tris] of bins) {
    remap.fill(-1);
    let vcount = 0;
    const idx = new Uint32Array(tris.length * 3);
    let w = 0;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = vi(t, k);
        let m = remap[v];
        if (m < 0) { m = vcount++; remap[v] = m; }
        idx[w++] = m;
      }
    }
    const g = new THREE.BufferGeometry();
    for (const [name, a] of attrs) {
      const arr = a.array as AnyArray;
      const size = a.itemSize;
      const Ctor = arr.constructor as new (n: number) => AnyArray;
      const dst = new Ctor(vcount * size);
      for (let v = 0; v < pos.count; v++) {
        const m = remap[v];
        if (m < 0) continue;
        for (let k = 0; k < size; k++) dst[m * size + k] = arr[v * size + k];
      }
      g.setAttribute(name, new THREE.BufferAttribute(dst as unknown as Float32Array, size, a.normalized));
    }
    g.setIndex(vcount > 65535 ? new THREE.BufferAttribute(idx, 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out.set(key, g);
  }
  return out;
}

// ---------------------------------------------------------------- chunks

/**
 * World chunks: the static city is binned into render cells of one block column by two block rows (250 x 200 m on this grid,
 * anchored at the grid's north-west street centre so every cell edge is a street centreline), and the cells are grouped
 * into chunks of 2 x 2 blocks (500 x 200 m). A chunk is hidden as a unit (`ChunkCuller`) beyond a per-tier range: the
 * tier's visible distance (fog far on phone, the prop cull range elsewhere) plus slack of none on phone (the fog edge), two on low
 * and three on medium and high, so the chunk edge never pops inside the visible range.
 */
export const CHUNK_BLOCKS = 2;
/** Metres per block used for the slack (the east-west street pitch of the game's grid). */
export const CHUNK_BLOCK_M = 100;
export const CHUNK_SLACK_BLOCKS: Record<Quality, number> = { phone: 0, low: 2, medium: 3, high: 3 };

/** Extra chunk range (m) per metre of camera height above 3 m (aerial views must not show holes). */
export const CHUNK_RANGE_PER_M_HEIGHT = 25;

/** Chunk hide distance (m) for a tier. */
export function chunkRangeFor(q: Quality): number {
  const t = TIER_CONFIG[q];
  const visible = t.fog ? t.fog.far : t.cullDistance;
  return visible + CHUNK_SLACK_BLOCKS[q] * CHUNK_BLOCK_M;
}

/**
 * Tiers whose static city is split into half-width, half-depth render cells (125 x 100 m instead of 250 x 200). A cell mesh is
 * drawn whole when any of it is in view or in range, so on a street the coarse cells draw ~4x the triangles that can be seen
 * (measured at the review viewpoints: phone 410 k -> 94 k building triangles at 96 draws; low 416 k -> 252 k at 264 draws).
 * Phone is draw-light (fog-short chunk range, simple geometry); low and medium trade draws for triangles (medium's 1.2 M budget
 * needs it); high keeps the coarse cells.
 */
/** Cell size (m) of the shadow / AO proxy meshes (AoProxy.ts): small cells keep the shadow box and the AO reach (AO_REACH) from drawing a whole 100 m cell for its nearest corner. */
export const SHADOW_PROXY_CELL: Record<Quality, number> = { phone: 100, low: 50, medium: 50, high: 50 };
export const FINE_CELLS: Record<Quality, boolean> = { phone: true, low: true, medium: true, high: false };

/**
 * Small-detail mesh classes of TierGeometry (fire escapes, tanks, fences, wires...) are dropped per chunk / cell beyond this
 * share of the chunk range: they are 15 to 25 % of the building triangles and a few pixels wide out there (low 210 m, medium
 * and high 260 m). Phone hides them everywhere through TierGeometry anyway.
 */
export const CHUNK_DETAIL_FRACTION = 0.5;
export const chunkDetailRangeFor = (q: Quality): number => chunkRangeFor(q) * CHUNK_DETAIL_FRACTION;

export interface ChunkLayout {
  /** render cell size (m): one block column wide, two block rows deep */
  cellX: number; cellZ: number;
  /** chunk size (m): 2 x 2 blocks */
  chunkX: number; chunkZ: number;
  /** north-west street centre: cells and chunks are anchored here */
  originX: number; originZ: number;
}

/** Cell and chunk grid of a street grid, anchored at the north-west street centre. */
export function chunkLayout(streets: ReadonlyArray<{ axis: 'ns' | 'ew'; offset: number }>, fine = false): ChunkLayout {
  const along = (axis: 'ns' | 'ew', fallback: number): { pitch: number; origin: number } => {
    const o = streets.filter((st) => st.axis === axis).map((st) => st.offset).sort((a, b) => a - b);
    let best = Infinity;
    for (let i = 1; i < o.length; i++) best = Math.min(best, o[i] - o[i - 1]);
    return { pitch: isFinite(best) && best > 20 ? best : fallback, origin: o.length ? o[0] : 0 };
  };
  const x = along('ns', 250), z = along('ew', 100);
  const k = fine ? 0.5 : 1;
  return { cellX: x.pitch * k, cellZ: z.pitch * CHUNK_BLOCKS * k, chunkX: x.pitch * CHUNK_BLOCKS, chunkZ: z.pitch * CHUNK_BLOCKS, originX: x.origin, originZ: z.origin };
}

/** `ix_iz` key of the chunk holding (x, z). */
export function chunkKeyOf(l: ChunkLayout, x: number, z: number): string {
  return `${Math.floor((x - l.originX) / l.chunkX)}_${Math.floor((z - l.originZ) / l.chunkZ)}`;
}

/** Chunk key of a render cell key (`ix_iz`, as `splitMeshesIntoCells` stores in `userData.cell`). */
export function chunkKeyOfCell(l: ChunkLayout, cellKey: string): string {
  const [ix, iz] = cellKey.split('_').map(Number);
  return chunkKeyOf(l, l.originX + (ix + 0.5) * l.cellX, l.originZ + (iz + 0.5) * l.cellZ);
}

/**
 * Only buildings and furniture cells are chunked: ground, roads, sidewalks, markings and the skyline ring are never hidden.
 * Hides whole chunks (all the cell meshes sharing `userData.chunk`) when the chunk's ground footprint (the union of its
 * meshes' world bounding boxes on the XZ plane) lies entirely beyond a range from a reference point, with the same
 * hysteresis as DistanceCuller: a hidden chunk reappears only once its nearest edge is `margin` m inside the range.
 */
export class ChunkCuller {
  private readonly chunks = new Map<string, { meshes: THREE.Mesh[]; detail: THREE.Mesh[]; trim: THREE.Mesh[]; far: THREE.Mesh[]; minX: number; maxX: number; minZ: number; maxZ: number; hidden: boolean; detailHidden: boolean; trimHidden: boolean; isFar: boolean }>();
  /** Far representation range (m) for building cells; null = the tier's `buildingFarDist` (read from CarPaintFx's tier). */
  farOverride: number | null = null;
  /** far geometries built per update call at most (each is a one-off clustering of one cell mesh, ~2 ms); review scripts raise it through window.__gtaChunkCuller */
  static buildsPerUpdate = 5;
  private detailDist: number;
  private readonly box = new THREE.Box3();
  constructor(public maxDist: number, private readonly margin = 6) { this.detailDist = maxDist * CHUNK_DETAIL_FRACTION; }
  setMaxDist(d: number): void { if (Number.isFinite(d) && d > 0) { this.maxDist = d; this.detailDist = d * CHUNK_DETAIL_FRACTION; } }
  /** Range (m) for the small-detail mesh classes; follows `setMaxDist` (CHUNK_DETAIL_FRACTION) unless set here afterwards. Infinity = they follow the chunk. */
  setDetailRange(d: number): void { if (d > 0) this.detailDist = d; }
  /** Registers a cell mesh under its `userData.chunk` key (static: its bounding box is taken once). */
  add(mesh: THREE.Mesh): void {
    const key = mesh.userData.chunk as string | undefined;
    if (key === undefined) return;
    mesh.updateWorldMatrix(true, false);
    this.box.setFromObject(mesh);
    let c = this.chunks.get(key);
    if (!c) { c = { meshes: [], detail: [], trim: [], far: [], minX: this.box.min.x, maxX: this.box.max.x, minZ: this.box.min.z, maxZ: this.box.max.z, hidden: false, detailHidden: false, trimHidden: false, isFar: false }; this.chunks.set(key, c); }
    else { c.minX = Math.min(c.minX, this.box.min.x); c.maxX = Math.max(c.maxX, this.box.max.x); c.minZ = Math.min(c.minZ, this.box.min.z); c.maxZ = Math.max(c.maxZ, this.box.max.z); }
    c.meshes.push(mesh);
    if (TRIM_MESH.test(mesh.name)) c.trim.push(mesh);
    if (PHONE_HIDDEN_MESH.test(mesh.name)) c.detail.push(mesh);
    else if (mesh.name.startsWith('buildings:') && !mesh.userData.sparse && mesh.geometry.getAttribute('normal')) c.far.push(mesh);
  }
  /** Facade-trim range (m): null = the tier's `buildingTrimDist` (read from CarPaintFx's tier). */
  trimOverride: number | null = null;
  private trimDist(): number {
    if (this.trimOverride !== null) return this.trimOverride;
    return carPaintConfigured() ? tierConfig(carPaintTier()).buildingTrimDist : Infinity;
  }
  private farDist(): number {
    if (this.farOverride !== null) return this.farOverride;
    return carPaintConfigured() ? tierConfig(carPaintTier()).buildingFarDist : Infinity;
  }
  get count(): number { return this.chunks.size; }
  get hiddenCount(): number { let n = 0; for (const c of this.chunks.values()) if (c.hidden) n++; return n; }
  /** Chunk keys currently hidden (tests). */
  hiddenKeys(): string[] { return [...this.chunks].filter(([, c]) => c.hidden).map(([k]) => k); }
  /** `py` = camera height: the range grows by `CHUNK_RANGE_PER_M_HEIGHT` m per metre of height, so aerials see the whole grid and street level saves the draws. */
  update(px: number, pz: number, py = 0): void {
    const base = this.maxDist + Math.max(0, py - 3) * CHUNK_RANGE_PER_M_HEIGHT;
    const farDist = this.farDist();
    const detailDist = Math.min(this.detailDist, farDist);
    const trimDist = this.trimDist();
    let builds = ChunkCuller.buildsPerUpdate;
    for (const c of this.chunks.values()) {
      const dx = Math.max(c.minX - px, 0, px - c.maxX), dz = Math.max(c.minZ - pz, 0, pz - c.maxZ);
      const d2 = dx * dx + dz * dz;
      const limit = c.hidden ? base - this.margin : base;
      const hide = d2 > limit * limit;
      const dlimit = Math.min(base, detailDist) - (c.detailHidden ? this.margin : 0);
      const dHide = hide || d2 > dlimit * dlimit;
      const tlimit = Math.min(base, trimDist) - (c.trimHidden ? this.margin : 0);
      const tHide = hide || d2 > tlimit * tlimit;
      if (hide !== c.hidden || dHide !== c.detailHidden || tHide !== c.trimHidden) {
        c.hidden = hide; c.detailHidden = dHide; c.trimHidden = tHide;
        for (const m of c.meshes) m.visible = !hide;
        for (const m of c.detail) m.visible = !dHide; // dHide includes hide
        for (const m of c.trim) m.visible = !tHide && !(c.detail.includes(m) && dHide);
      }
      // far representation: the cell's building meshes swap to their clustered geometry beyond farDist (3D distance, so aerials stay sharp)
      const flimit = farDist - (c.isFar ? this.margin : 0);
      const wantFar = !hide && d2 + py * py > flimit * flimit;
      if (wantFar !== c.isFar) {
        if (wantFar) { // the chunk flips once every one of its far geometries exists; until then it keeps the full ones
          for (const m of c.far) if (builds > 0 && !m.userData.farGeo) { prepareFarGeometry(m); builds--; }
          if (c.far.some((m) => !m.userData.farGeo)) continue;
        }
        c.isFar = wantFar;
        for (const m of c.far) swapFarGeometry(m, wantFar);
      }
    }
  }
  /** Shows everything again and forgets all chunks. */
  clear(): void { for (const c of this.chunks.values()) { for (const m of c.meshes) m.visible = true; if (c.isFar) for (const m of c.far) swapFarGeometry(m, false); } this.chunks.clear(); }
}

/** Grid size (m) of the far building geometry: window reveals, cornices and stoop steps collapse into the wall plane. */
export const FAR_CELL_M = 0.9;

/** Swaps a building cell mesh between its full geometry and a clustered far one (built once, kept in `userData`). */
export function swapFarGeometry(mesh: THREE.Mesh, far: boolean): void {
  const u = mesh.userData as { nearGeo?: THREE.BufferGeometry; farGeo?: THREE.BufferGeometry };
  if (far) {
    prepareFarGeometry(mesh);
    mesh.geometry = u.farGeo!;
  } else if (u.nearGeo) mesh.geometry = u.nearGeo;
}

/** Builds (once) the clustered far geometry of a building cell mesh. */
export function prepareFarGeometry(mesh: THREE.Mesh): void {
  const u = mesh.userData as { nearGeo?: THREE.BufferGeometry; farGeo?: THREE.BufferGeometry };
  if (u.farGeo) return;
  if (!u.nearGeo) u.nearGeo = mesh.geometry;
  u.farGeo = clusterGeometry(u.nearGeo, FAR_CELL_M, true);
  u.farGeo.computeBoundingSphere(); u.farGeo.computeBoundingBox();
}

if (typeof window !== 'undefined') (window as unknown as { __gtaChunkCuller: typeof ChunkCuller }).__gtaChunkCuller = ChunkCuller; // debug: review scripts raise buildsPerUpdate

export function triangleCount(geo: THREE.BufferGeometry): number {
  return geo.index ? geo.index.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3;
}

export interface SplitStats { meshesBefore: number; meshesAfter: number; trianglesAfter: number; }

/**
 * Replaces every Mesh directly under `group` by one mesh per grid cell. Mesh names, materials, shadow flags and
 * userData are kept (names must stay identical: e.g. setLampsLit finds the lamp heads by name). `userData.cell`
 * holds the cell key. Returns the new cell meshes.
 */
export function splitMeshesIntoCells(group: THREE.Object3D, cellX: number, cellZ: number, stats?: SplitStats, minTris = 0, originX = 0, originZ = 0, sparseMaxCells = 0): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  // InstancedMesh geometry is a local template shared by every instance: never re-bin it
  const originals = group.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true && !(o as THREE.InstancedMesh).isInstancedMesh);
  for (const mesh of originals) {
    if (stats) stats.meshesBefore++;
    // A mesh under `minTris` stays whole (one always-drawn city-wide draw) unless it is sparse: at most `sparseMaxCells` occupied cells
    // (the one-off shop signs, graffiti, roll gates). Split, only the cells in view are drawn instead of every such mesh of the city.
    const small = triangleCount(mesh.geometry) < minTris;
    let parts = Array.isArray(mesh.material) || (small && sparseMaxCells <= 0) ? null : splitGeometryByCell(mesh.geometry, cellX, cellZ, originX, originZ);
    if (parts && small && parts.size > sparseMaxCells) { for (const g of parts.values()) g.dispose(); parts = null; }
    if (!parts || parts.size <= 1) { result.push(mesh); if (stats) { stats.meshesAfter++; } continue; }
    for (const [key, g] of parts) {
      const m = new THREE.Mesh(g, mesh.material);
      m.name = mesh.name;
      m.castShadow = mesh.castShadow;
      m.receiveShadow = mesh.receiveShadow;
      m.renderOrder = mesh.renderOrder;
      m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
      m.userData = { ...mesh.userData, cell: key };
      if (small) m.userData.sparse = true; // too small to be worth a clustered far geometry
      group.add(m);
      result.push(m);
      if (stats) { stats.meshesAfter++; stats.trianglesAfter += g.index ? g.index.count / 3 : 0; }
    }
    group.remove(mesh);
    mesh.geometry.dispose();
  }
  return result;
}

interface Entry { obj: THREE.Object3D; cx: number; cz: number; r: number; hidden: boolean; }

/**
 * Hides objects beyond `maxDist` of a reference point. Static entries (prop cells) cache their bounding sphere;
 * dynamic objects (parked cars, peds) are tested through `applyTo`, which only restores visibility it removed itself
 * (so objects other systems hide on purpose stay hidden).
 */
export class DistanceCuller {
  private readonly entries: Entry[] = [];
  private readonly hiddenDyn = new Set<THREE.Object3D>();
  private readonly sphere = new THREE.Sphere();
  constructor(public maxDist = DEFAULT_CULL_DISTANCE) {}
  /** Changes the range (quality switch); the next `update` / `applyTo` shows or hides accordingly. */
  setMaxDist(d: number): void { if (Number.isFinite(d) && d > 0) this.maxDist = d; }
  /** Static mesh: bounding sphere taken once (the mesh is assumed not to move). */
  addStatic(mesh: THREE.Mesh): void {
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    mesh.updateWorldMatrix(true, false);
    this.sphere.copy(g.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    this.entries.push({ obj: mesh, cx: this.sphere.center.x, cz: this.sphere.center.z, r: this.sphere.radius, hidden: false });
  }
  get count(): number { return this.entries.length; }
  get hiddenCount(): number { let n = this.hiddenDyn.size; for (const e of this.entries) if (e.hidden) n++; return n; }
  /** Updates all static entries. (px, pz) = reference point, usually the player. */
  update(px: number, pz: number): void {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const hide = shouldHide(e.hidden, e.cx, e.cz, e.r, px, pz, this.maxDist);
      if (hide !== e.hidden) { e.hidden = hide; e.obj.visible = !hide; }
    }
  }
  /** Distance-cull one dynamic object located at (x, z). Returns true when it is hidden. `range` overrides `maxDist` for this call (peds on phone). */
  applyTo(obj: THREE.Object3D, x: number, z: number, px: number, pz: number, radius = 4, range = this.maxDist): boolean {
    const was = this.hiddenDyn.has(obj);
    const hide = shouldHide(was, x, z, radius, px, pz, Math.min(range, this.maxDist));
    if (hide && !was) { obj.visible = false; this.hiddenDyn.add(obj); }
    else if (!hide && was) { obj.visible = true; this.hiddenDyn.delete(obj); }
    return hide;
  }
  /** Make everything visible again and forget all entries. */
  clear(): void {
    for (const e of this.entries) e.obj.visible = true;
    for (const o of this.hiddenDyn) o.visible = true;
    this.entries.length = 0; this.hiddenDyn.clear();
  }
}

/**
 * Distance culling for InstancedMeshes (street trees, lamps, hydrants...). A frustum test on an InstancedMesh is all or
 * nothing, so every tree of the city was drawn every frame. This keeps a copy of each mesh's matrices (and colours) and
 * compacts the instances within range of the camera to the front of the live buffers, then sets `mesh.count`.
 *
 * The compaction only reruns after the camera moved `STEP` m (the range gets `margin` m of slack for that), so a still
 * camera costs nothing. `setRange(Infinity)` restores every instance. Not for meshes whose instance index means
 * something (signal lamps are recoloured by index).
 */
export class InstanceCuller {
  static readonly STEP = 5;
  private readonly entries: Array<{ mesh: THREE.InstancedMesh; matrices: Float32Array; colors: Float32Array | null; xs: Float32Array; zs: Float32Array; n: number }> = [];
  private range = Infinity;
  private lastX = NaN;
  private lastZ = NaN;
  /** instances currently drawn / registered (stats) */
  shown = 0;
  total = 0;

  constructor(readonly margin = 10) {}

  /** Registers an InstancedMesh (its current matrices are the full set). */
  add(mesh: THREE.InstancedMesh): void {
    const n = mesh.count;
    const matrices = Float32Array.from((mesh.instanceMatrix.array as Float32Array).subarray(0, n * 16));
    const colors = mesh.instanceColor ? Float32Array.from((mesh.instanceColor.array as Float32Array).subarray(0, n * 3)) : null;
    const xs = new Float32Array(n), zs = new Float32Array(n);
    for (let i = 0; i < n; i++) { xs[i] = matrices[i * 16 + 12]; zs[i] = matrices[i * 16 + 14]; }
    this.entries.push({ mesh, matrices, colors, xs, zs, n });
    this.total += n;
    this.shown += n;
  }

  get count(): number { return this.entries.length; }

  /** Culling range in metres; Infinity restores every instance on the next `update`. */
  setRange(d: number): void {
    if (d === this.range) return;
    this.range = d;
    this.lastX = NaN;
    if (!Number.isFinite(d)) this.recompute(0, 0);
  }

  /** Call once per frame with the camera position. */
  update(px: number, pz: number): void {
    if (!Number.isFinite(this.range)) return;
    if (Number.isFinite(this.lastX) && Math.abs(px - this.lastX) < InstanceCuller.STEP && Math.abs(pz - this.lastZ) < InstanceCuller.STEP) return;
    this.recompute(px, pz);
  }

  private recompute(px: number, pz: number): void {
    const all = !Number.isFinite(this.range);
    const lim = this.range + this.margin;
    const lim2 = lim * lim;
    this.lastX = px; this.lastZ = pz;
    this.shown = 0;
    for (const e of this.entries) {
      const dst = e.mesh.instanceMatrix.array as Float32Array;
      const dstC = e.mesh.instanceColor ? (e.mesh.instanceColor.array as Float32Array) : null;
      let k = 0;
      for (let i = 0; i < e.n; i++) {
        if (!all) { const dx = e.xs[i] - px, dz = e.zs[i] - pz; if (dx * dx + dz * dz > lim2) continue; }
        dst.set(e.matrices.subarray(i * 16, i * 16 + 16), k * 16);
        if (dstC && e.colors) dstC.set(e.colors.subarray(i * 3, i * 3 + 3), k * 3);
        k++;
      }
      e.mesh.count = k;
      // three computes an InstancedMesh's bounding sphere once, over the instances present at the time; after a compaction it
      // would describe the old set (the first render happens after the first compaction, so: the spawn area), and the frustum
      // test would then drop the whole mesh whenever that stale sphere is off screen while its live instances are on screen.
      e.mesh.boundingSphere = null; e.mesh.boundingBox = null;
      this.shown += k;
      e.mesh.instanceMatrix.clearUpdateRanges(); e.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, k) * 16); e.mesh.instanceMatrix.needsUpdate = true;
      if (e.mesh.instanceColor) { e.mesh.instanceColor.clearUpdateRanges(); e.mesh.instanceColor.addUpdateRange(0, Math.max(1, k) * 3); e.mesh.instanceColor.needsUpdate = true; }
      e.mesh.visible = k > 0; // a zero-instance mesh would still cost a draw call
    }
  }
}
