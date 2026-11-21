/**
 * LANDMARKS layer: builds the landmark sites by distance. REAL PATH ONLY (imported dynamically by realWorld.ts).
 *
 *   const lm = new LandmarkLayer({ materials, rng, tier, colliders });
 *   scene.add(lm.root);
 *   each frame: lm.update(playerX, playerZ, cameraY);        // a few ms of work at most, never a stall
 *   lm.areaAt(p)  -> the invented name when p is on or just outside a site (the HUD place label)
 *   lm.mapPlaces  -> labelled map blips
 *
 * Three levels per site, by the distance d from the player to the site's edge:
 *   near  d <= near   the full build: one merged mesh per material (about 6 to 14 draws), colliders handed to the host,
 *                     built as a generator a few milliseconds per frame, disposed again beyond near + margin
 *   far   d <= far    one vertex-coloured silhouette of the same layout (ONE draw, a few hundred triangles), built at once
 *   none              nothing held, so a landmark far from the player costs no triangles and no draws
 * Nothing is built for a site until the player comes near it, so the budgets of the phone and low tiers do not move when no
 * landmark is in range.
 */
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import type { IMaterialLibrary, StaticCollider } from '@/world/types';
import type { Quality } from '@/render/Shadows';
import { CHUNK_RANGE_PER_M_HEIGHT } from '@/render/Culling';
import { Kit, type Frame } from './kit';
import { applyTone, landmarkColourway } from './tone';
import { LANDMARKS, OWNED_BBLS } from './landmarks';
import type { Entrance, LandmarkRow } from './types';
import { buildGarden, buildPark, buildPlayground, buildPool, type BuildCtx } from './buildPark';
import { buildHousing } from './buildHousing';
import { buildSubway } from './buildStreet';
import { buildArmory, buildChurch, buildDepot, buildFirehouse, buildHospital, buildLibrary, buildSchool, buildStationHouse } from './buildCivic';

/** the builder of a kind of site */
const BUILDERS: Partial<Record<LandmarkRow['kind'], (c: BuildCtx) => Generator<void>>> = {
  park: buildPark, pool: buildPool, playground: buildPlayground, garden: buildGarden, housing: buildHousing, church: buildChurch,
  armory: buildArmory, school: buildSchool, hospital: buildHospital, library: buildLibrary, stationhouse: buildStationHouse,
  firehouse: buildFirehouse, depot: buildDepot, subway: buildSubway,
};

export interface ColliderHost { add(colliders: StaticCollider[]): void; remove(ids: string[]): void }

export interface LandmarkRanges { near: number; far: number }
/** distance (m, to the site's edge) per tier; the far range grows with camera height like the building streamer's */
export const LANDMARK_RANGES: Record<Quality, LandmarkRanges> = {
  phone: { near: 90, far: 150 },
  low: { near: 170, far: 400 },
  medium: { near: 260, far: 520 },
  high: { near: 330, far: 520 },
};
export const LANDMARK_MARGIN = 30;
const BASE_Y = 0.15; // the sidewalk height, like the buildings

export interface LandmarkLayerOptions {
  materials: IMaterialLibrary;
  /** optional: without it the seed is a fixed hash, so the landmarks never consume the world's generator */
  rng?: Rng;
  tier: Quality;
  colliders?: ColliderHost;
  rows?: readonly LandmarkRow[];
  ranges?: Partial<LandmarkRanges>;
  budgetMs?: number;
  now?: () => number;
}

interface Entry {
  row: LandmarkRow;
  frame: Frame;
  cx: number; cz: number; radius: number;
  dist: number;
  near: THREE.Group | null;
  far: THREE.Mesh | null;
  job: { gen: Generator<void>; kit: Kit } | null;
  colliderIds: string[];
  farTried: boolean;
  nearTriangles: number;
}

/** a stair entrance as a small site of its own: the frame is kept right-handed (local z points away from the kerb) */
function entranceRow(row: LandmarkRow, en: Entrance, i: number): LandmarkRow {
  let fx = en.fx, fz = en.fz;
  const nx = en.nx, nz = en.nz;
  // the site is 6 m along the street and 2.4 m deep: centre it on (x, z)
  let ax = en.x - fx * 3 - nx * 1.2, az = en.z - fz * 3 - nz * 1.2;
  if (fx * nz - fz * nx < 0) { ax += fx * 6; az += fz * 6; fx = -fx; fz = -fz; }
  return {
    ...row, id: `${row.id}-${i}`, name: en.station, district: en.station, entrances: undefined,
    site: { ax, az, fx, fz, nx, nz, w: 6, d: 2.4, block: -1 },
    look: { station: en.station, colour: en.colour },
  };
}

export interface MapPlaceOut { id: string; kind: 'venue'; label: string; x: number; z: number; color: string }

export class LandmarkLayer {
  readonly root = new THREE.Group();
  readonly ranges: LandmarkRanges;
  private readonly entries: Entry[] = [];
  private readonly seed: number;
  private readonly now: () => number;
  private readonly budgetMs: number;
  private readonly detail: number;
  private builtCount = 0;

  constructor(private readonly o: LandmarkLayerOptions) {
    this.ranges = { ...LANDMARK_RANGES[o.tier], ...(o.ranges ?? {}) };
    this.now = o.now ?? ((): number => performance.now());
    this.budgetMs = o.budgetMs ?? 3;
    this.detail = o.tier === 'phone' ? 0 : o.tier === 'low' ? 1 : 2;
    this.seed = o.rng ? Math.floor(o.rng.next() * 0xffffffff) >>> 0 : Rng.hash('landmarks');
    this.root.name = 'landmarks';
    this.root.position.y = BASE_Y;
    const rows: LandmarkRow[] = [];
    for (const row of o.rows ?? LANDMARKS) {
      if (row.kind === 'subway' && row.entrances) row.entrances.forEach((en, i) => rows.push(entranceRow(row, en, i)));
      else rows.push(row);
    }
    for (const row of rows) {
      const s = row.site;
      const frame: Frame = { ox: s.ax, oz: s.az, fx: s.fx, fz: s.fz, nx: s.nx, nz: s.nz };
      const cx = s.ax + s.fx * s.w / 2 + s.nx * s.d / 2, cz = s.az + s.fz * s.w / 2 + s.nz * s.d / 2;
      this.entries.push({ row, frame, cx, cz, radius: Math.hypot(s.w, s.d) / 2, dist: Infinity, near: null, far: null, job: null, colliderIds: [], farTried: false, nearTriangles: 0 });
    }
  }

  get rows(): readonly LandmarkRow[] { return this.entries.map((e) => e.row); }

  /** labelled map blips (kind 'venue': the map draws it gold with the name) */
  get mapPlaces(): MapPlaceOut[] {
    const seen = new Set<string>();
    const out: MapPlaceOut[] = [];
    for (const e of this.entries) {
      if (e.row.kind === 'subway') { if (seen.has(e.row.name)) continue; seen.add(e.row.name); }
      out.push({ id: `lm:${e.row.id}`, kind: 'venue', label: e.row.name, x: e.cx, z: e.cz, color: e.row.kind === 'subway' ? '#7fb2e8' : '#8fd18a' });
    }
    return out;
  }

  /** the invented name of the site that p stands on or just outside of, else null (HUD place label) */
  areaAt(p: Vec2): string | null {
    for (const e of this.entries) {
      const s = e.row.site;
      const X = p.x - s.ax, Z = p.z - s.az;
      const lx = X * s.fx + Z * s.fz, lz = X * s.nx + Z * s.nz;
      const m = s.poly ? 3 : 10;
      if (lx >= -m && lx <= s.w + m && lz >= -m && lz <= s.d + m) return e.row.district;
    }
    return null;
  }

  private ctx(e: Entry, far: boolean): { c: BuildCtx; kit: Kit } {
    const kit = new Kit(this.o.materials, e.frame, e.row.id, far);
    const rng = new Rng((Rng.hash(e.row.id) ^ this.seed) >>> 0);
    return { c: { k: kit, row: e.row, rng, detail: far ? 0 : this.detail }, kit };
  }

  private buildFar(e: Entry): void {
    e.farTried = true;
    const b = BUILDERS[e.row.kind];
    if (!b) return;
    const { c, kit } = this.ctx(e, true);
    const gen = b(c);
    for (let i = 0; i < 400; i++) if (gen.next().done) break;
    const meshes = kit.finish();
    if (!meshes.length) return;
    const m = meshes[0];
    m.name = `landmark-far:${e.row.id}`;
    m.castShadow = false;
    m.userData.far = true;
    e.far = m;
    this.root.add(m);
  }

  private startNear(e: Entry): void {
    const b = BUILDERS[e.row.kind];
    if (!b) { e.job = null; return; }
    const { c, kit } = this.ctx(e, false);
    e.job = { gen: b(c), kit };
  }

  private finishNear(e: Entry): void {
    const job = e.job!;
    e.job = null;
    const g = new THREE.Group();
    g.name = `landmark:${e.row.id}`;
    let tris = 0;
    const meshes = job.kit.finish();
    try { applyTone(meshes, landmarkColourway(e.row)); } catch { /* the wall tone is a nicety: plain materials still draw */ }
    for (const m of meshes) {
      g.add(m);
      const geo = m.geometry;
      tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
    }
    e.nearTriangles = tris;
    const cs = job.kit.colliders;
    e.colliderIds = cs.map((c) => c.id as string);
    this.o.colliders?.add(cs);
    e.near = g;
    this.root.add(g);
    this.builtCount++;
  }

  private disposeNear(e: Entry): void {
    if (e.job) { e.job = null; }
    if (e.near) {
      e.near.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      this.root.remove(e.near);
      e.near = null;
    }
    if (e.colliderIds.length) { this.o.colliders?.remove(e.colliderIds); e.colliderIds = []; }
  }

  private disposeFar(e: Entry): void {
    if (!e.far) return;
    e.far.geometry.dispose();
    this.root.remove(e.far);
    e.far = null;
    e.farTried = false;
  }

  /** streams around (px, pz); `py` is the camera height. Returns ms spent. */
  update(px: number, pz: number, py = 0, budgetMs = this.budgetMs): number {
    const t0 = this.now();
    const boost = Math.max(0, py - 3) * CHUNK_RANGE_PER_M_HEIGHT;
    const r = this.ranges;
    const queue: Entry[] = [];
    for (const e of this.entries) {
      e.dist = Math.max(0, Math.hypot(px - e.cx, pz - e.cz) - e.radius);
      const nearWanted = e.dist <= r.near + (e.near || e.job ? LANDMARK_MARGIN : 0);
      const farWanted = r.far > 0 && e.dist <= r.far + boost + (e.far ? LANDMARK_MARGIN : 0);
      if (!nearWanted && (e.near || e.job)) this.disposeNear(e);
      if (!farWanted && e.far) this.disposeFar(e);
      if (nearWanted && !e.near && e.dist <= r.near) queue.push(e);
    }
    for (const e of this.entries) if (!e.far && !e.farTried && e.dist <= r.far + boost) this.buildFar(e);
    queue.sort((a, b) => a.dist - b.dist);
    let first = true;
    for (const e of queue) {
      while ((first || this.now() - t0 < budgetMs) && !e.near) {
        first = false;
        if (!e.job) this.startNear(e);
        if (!e.job) break;
        const res = e.job.gen.next();
        if (res.done) this.finishNear(e);
      }
      if (this.now() - t0 >= budgetMs) break;
    }
    for (const e of this.entries) {
      const nearShown = !!e.near && e.dist <= r.near + LANDMARK_MARGIN;
      if (e.near) e.near.visible = nearShown;
      if (e.far) e.far.visible = !nearShown;
    }
    return this.now() - t0;
  }

  /** build everything wanted around (px, pz) now (tests, renders) */
  settle(px: number, pz: number, py = 0): void {
    for (let i = 0; i < 200; i++) {
      this.update(px, pz, py, Infinity);
      if (!this.entries.some((e) => e.dist <= this.ranges.near && !e.near)) return;
    }
  }

  stats(): { sites: number; near: number; far: number; built: number; triangles: number; colliders: number } {
    let near = 0, far = 0, tris = 0, cols = 0;
    for (const e of this.entries) {
      if (e.near) { near++; tris += e.nearTriangles; cols += e.colliderIds.length; }
      if (e.far) { far++; const g = e.far.geometry; tris += g.getAttribute('position').count / 3; }
    }
    return { sites: this.entries.length, near, far, built: this.builtCount, triangles: tris, colliders: cols };
  }

  /** the near group of a site, for tests and captures */
  nearOf(id: string): THREE.Group | null { return this.entries.find((e) => e.row.id === id)?.near ?? null; }

  dispose(): void {
    for (const e of this.entries) { this.disposeNear(e); this.disposeFar(e); }
    this.root.removeFromParent();
  }
}

export { LANDMARKS, OWNED_BBLS };
