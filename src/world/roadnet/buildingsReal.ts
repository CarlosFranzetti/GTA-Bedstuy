/**
 * BLDGREAL: buildings on the real-map lots (dynamic-import path only; nothing in the default build imports this).
 *
 *   buildRealBuildings(lots, materials, rng, { layout, fine?, looks? }) -> { group, colliders, chunkMeshes, stats }
 *
 * `lots` is the output of `placeLots` (RealLot: rotated to their face, `poly` set, PLUTO facts in `pluto`). The existing
 * generator (`buildBuildings`: brownstone, mixed-use, church, apartment, vacant) does the modelling unchanged: it works in a
 * lot-local frame (x along frontA -> frontB, z outward), so any yaw is fine. What this module adds:
 *   - a LotSpec per lot from the PLUTO facts (floors, era, use, stoop, cornice; the same rules as scripts/import-pluto.mjs),
 *     optionally overridden by `opts.looks(bbl)` (the per-BBL look hook, e.g. observed facades);
 *   - the footprint: PLUTO building depth (clamped), then the largest rectangle inside `lot.poly` (corner lots cut by a bisector,
 *     wedge-adjacent lots), shifted along the front so it never leaves the polygon; lots with no usable rectangle are skipped
 *     and counted; wedge vacants (`lot.wedge`) stay empty;
 *   - corner lots whose street corner is at the frontB end are given swapped fronts so the generator's left/right corner logic
 *     puts the exposed side wall on the right side;
 *   - the merged geometry is split into 64 m cells (32 m when `fine`) of the real chunk layout and tagged `userData.cell` /
 *     `userData.chunk` exactly as WorldBuilder does, so a ChunkCuller can hide it.
 * Colliders are the generator's own: one polygon per building body and stoop, segments for fences (StaticCollider).
 * The group sits at the sidewalk height (0.15 m, same as WorldBuilder).
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { IMaterialLibrary, StaticCollider } from '@/world/types';
import type { LotSpec, MaterialFamily } from '@/world/buildings/facade';
import { buildBuildings, type SpecLot } from '@/world/BuildingGen';
import { chunkKeyOfCell, splitMeshesIntoCells, type ChunkLayout } from '@/render/Culling';
import type { RealLot } from './lotsReal';

/** WorldBuilder.SIDEWALK_HEIGHT (not imported: that module pulls in the whole default world) */
export const BUILDING_BASE_Y = 0.15;
export const STOREY_M = 3.1;
/** meshes under this many triangles are not split per cell */
export const MIN_SPLIT_TRIANGLES = 6000;

export interface RealBuildingsOptions {
  /** chunkLayoutFromBounds(net.bounds, fine) */
  layout: ChunkLayout;
  /** fine tiers cull per 32 m cell: userData.chunk is then the cell key itself */
  fine?: boolean;
  /** per-BBL look: merged over the spec derived from PLUTO */
  looks?: (bbl: string) => Partial<LotSpec> | undefined;
}

export interface RealBuildingsStats {
  lots: number;
  built: number;
  skipped: Record<string, number>;
  triangles: number;
  meshes: number;
  /** distinct chunks / cells that hold a mesh */
  chunks: number;
  cells: number;
  /** triangles and draw calls (meshes) per chunk key */
  perChunk: Record<string, { triangles: number; draws: number }>;
  colliders: number;
}

export interface RealBuildings {
  group: THREE.Group;
  colliders: StaticCollider[];
  /** cell meshes with userData.cell / userData.chunk, for the ChunkCuller */
  chunkMeshes: THREE.Mesh[];
  stats: RealBuildingsStats;
}

// ---------------------------------------------------------------- spec from PLUTO

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const KINDS_AVENUE: Array<[string, number]> = [['bodega', 22], ['deli', 9], ['barber', 10], ['restaurant', 12], ['cellphone', 9], ['liquor', 7], ['laundromat', 6], ['pharmacy', 4], ['daycare', 4], ['generic', 17]];
const KINDS_STREET: Array<[string, number]> = [['bodega', 40], ['deli', 15], ['generic', 30], ['barber', 15]];
function pickKind(list: Array<[string, number]>, u: number): string {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let t = u * total;
  for (const [k, w] of list) { t -= w; if (t < 0) return k; }
  return list[0][0];
}

/** LotSpec for a real lot (floors, era, use, stoop, cornice from PLUTO; mirrors import-pluto.mjs and LotSubdivider.specFromData). */
export function specForRealLot(lot: RealLot): LotSpec {
  const p = lot.pluto;
  const bbl = lot.bbl;
  const cls = (p?.cls ?? '').toUpperCase();
  const c0 = cls[0] ?? '';
  const yr = p?.yr ?? 0;
  let floors = Math.round(p?.fl ?? 0);
  if (!floors && p?.rf) floors = Math.max(1, Math.round(p.rf / STOREY_M));
  const type = lot.type;
  let use: LotSpec['use'];
  let storefront: string | undefined;
  if (type === 'vacant') { use = 'vacant'; floors = 0; }
  else if (type === 'church') { use = 'church'; floors = Math.min(Math.max(floors || 3, 2), 3); }
  else if (type === 'mixeduse') {
    use = 'mixed';
    floors = Math.max(floors || 2, 1);
    storefront = c0 === 'G' || p?.lu === '10' ? 'autorepair' : pickKind(lot.avenue ? KINDS_AVENUE : KINDS_STREET, hash01(bbl));
  } else if (type === 'apartment') { use = c0 === 'W' ? 'institutional' : 'apartment'; floors = floors || (c0 === 'D' ? 6 : 4); }
  else { use = 'residential'; floors = floors || (c0 === 'C' ? 4 : 3); }
  if (use !== 'vacant') floors = Math.min(8, Math.max(1, floors));
  const h = hash01(bbl + 'f');
  let family: MaterialFamily = 'brick';
  let look: LotSpec['look'];
  if (use === 'residential' || use === 'mixed' || use === 'apartment') {
    if (yr >= 1990 && use !== 'mixed') { family = 'paintedBrick'; look = 'newBuild'; }
    else if (yr && yr < 1900) family = h < 0.55 ? 'brownstone' : h < 0.9 ? 'brick' : 'limestone';
    else if (yr && yr < 1940) family = h < 0.25 ? 'brownstone' : h < 0.7 ? 'brick' : h < 0.9 ? 'tanBrick' : 'limestone';
    else family = h < 0.5 ? 'tanBrick' : h < 0.9 ? 'brick' : 'paintedBrick';
    if (type === 'brownstone' && family !== 'limestone') family = 'brownstone';
  } else if (use === 'church') family = 'limestone';
  const rowClass = 'ABCS'.includes(c0) || cls === 'R3';
  const stoop = use === 'residential' && rowClass && floors >= 2 && lot.width <= 12 && (!yr || yr < 1940) && look !== 'newBuild';
  return {
    floors,
    widthM: lot.width,
    family,
    stoop: { present: stoop, heightM: stoop ? 1.4 : 0 },
    cornice: use === 'residential' || use === 'mixed' ? (yr && yr < 1880 ? 'bracket' : yr && yr < 1925 ? 'plain' : 'none') : 'none',
    use,
    storefront,
    bbl,
    look,
  };
}

// ---------------------------------------------------------------- footprint inside the lot polygon

/** distance inside the convex polygon (>= 0 inside) */
function insideBy(poly: ReadonlyArray<Vec2>, p: Vec2, orient: number): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const d = (orient * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x))) / l;
    if (d < m) m = d;
  }
  return m;
}

export interface Footprint { xl: number; xr: number; depth: number }

/** target building depth (m) for a lot */
export function targetDepth(lot: RealLot): number {
  const bd = lot.pluto?.bd;
  if (lot.type === 'vacant') return Math.min(lot.depth, 18);
  const d = bd && bd >= 6 ? Math.min(Math.max(bd, 9), 34) : Math.min(lot.depth * 0.7, 16);
  return Math.min(d, lot.depth);
}

/** largest rectangle [xl, xr] x [0, depth] (lot frame, depth inward from the front) inside lot.poly, or null */
export function fitFootprint(lot: RealLot, minWidth = 3.5, minDepth = 6): Footprint | null {
  const dx = lot.frontB.x - lot.frontA.x, dz = lot.frontB.z - lot.frontA.z;
  const W = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / W, z: dz / W };
  const inw = { x: -lot.outward.x, z: -lot.outward.z };
  const at = (x: number, y: number): Vec2 => ({ x: lot.frontA.x + dir.x * x + inw.x * y, z: lot.frontA.z + dir.z * x + inw.z * y });
  let area = 0;
  for (let i = 0; i < lot.poly.length; i++) { const p = lot.poly[i], q = lot.poly[(i + 1) % lot.poly.length]; area += p.x * q.z - q.x * p.z; }
  const orient = area >= 0 ? -1 : 1;
  const tol = -0.12;
  const ok = (x: number, y: number): boolean => insideBy(lot.poly, at(x, y), orient) >= tol;
  const dT = targetDepth(lot);
  if (ok(0, dT) && ok(W, dT)) return { xl: 0, xr: W, depth: dT };
  let best: Footprint | null = null, bestA = 0;
  for (let d = dT; d >= minDepth - 1e-9; d -= Math.max(1, dT * 0.1)) {
    // the polygon is convex, so for a given depth the feasible x range at depth d is an interval; scan its ends
    let xl = 0;
    while (xl < W && !ok(xl, d)) xl += 0.25;
    let xr = W;
    while (xr > xl && !ok(xr, d)) xr -= 0.25;
    if (xr - xl < minWidth) continue;
    const a = (xr - xl) * d;
    if (a > bestA) { bestA = a; best = { xl, xr, depth: d }; }
  }
  return best;
}

// ---------------------------------------------------------------- build

export function buildRealBuildings(lots: ReadonlyArray<RealLot>, materials: IMaterialLibrary, rng: Rng, opts: RealBuildingsOptions): RealBuildings {
  const skipped: Record<string, number> = {};
  const skip = (why: string): void => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const specLots: SpecLot[] = [];
  // a face with a single corner lot at the frontB end: swap its fronts so BuildingGen's left/right corner logic matches
  const cornersByFace = new Map<string, number>();
  for (const l of lots) if (!l.wedge && l.corner) cornersByFace.set(`${l.block}:${l.face}`, (cornersByFace.get(`${l.block}:${l.face}`) ?? 0) + 1);
  for (const lot of lots) {
    if (lot.wedge) { skip('wedge'); continue; }
    const fp = fitFootprint(lot);
    if (!fp) { skip('noRectangle'); continue; }
    const dx = lot.frontB.x - lot.frontA.x, dz = lot.frontB.z - lot.frontA.z;
    const W = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / W, z: dz / W };
    let fa: Vec2 = { x: lot.frontA.x + dir.x * fp.xl, z: lot.frontA.z + dir.z * fp.xl };
    let fb: Vec2 = { x: lot.frontA.x + dir.x * fp.xr, z: lot.frontA.z + dir.z * fp.xr };
    const corner = lot.corner && lot.type !== 'vacant';
    if (corner && cornersByFace.get(`${lot.block}:${lot.face}`) === 1 && lot.cornerEnd === 'b') { const t = fa; fa = fb; fb = t; }
    const spec = { ...specForRealLot(lot), ...(opts.looks?.(lot.bbl) ?? {}) };
    spec.widthM = fp.xr - fp.xl;
    specLots.push({
      id: lot.id, blockId: lot.blockId, side: lot.side, frontA: fa, frontB: fb, width: fp.xr - fp.xl, depth: fp.depth,
      outward: lot.outward, type: lot.type, corner, spec,
    });
  }
  const built = buildBuildings(specLots, materials, rng);
  built.group.position.y = BUILDING_BASE_Y;
  const layout = opts.layout;
  const cells = { meshesBefore: 0, meshesAfter: 0, trianglesAfter: 0 };
  const chunkMeshes = splitMeshesIntoCells(built.group, layout.cellX, layout.cellZ, cells, MIN_SPLIT_TRIANGLES, layout.originX, layout.originZ)
    .filter((m) => typeof m.userData.cell === 'string');
  for (const m of chunkMeshes) m.userData.chunk = opts.fine ? (m.userData.cell as string) : chunkKeyOfCell(layout, m.userData.cell as string);
  const perChunk: Record<string, { triangles: number; draws: number }> = {};
  let triangles = 0, meshes = 0;
  built.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const tris = m.geometry.index ? m.geometry.index.count / 3 : (m.geometry.attributes.position?.count ?? 0) / 3;
    triangles += tris; meshes++;
    const k = (m.userData.chunk as string | undefined) ?? 'city';
    const e = (perChunk[k] ??= { triangles: 0, draws: 0 });
    e.triangles += tris; e.draws++;
  });
  const cellKeys = new Set(chunkMeshes.map((m) => m.userData.cell as string));
  return {
    group: built.group, colliders: built.colliders, chunkMeshes,
    stats: { lots: lots.length, built: specLots.length, skipped, triangles, meshes, chunks: Object.keys(perChunk).length, cells: cellKeys.size, perChunk, colliders: built.colliders.length },
  };
}
