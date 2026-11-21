/**
 * Phone tier: building geometry on demand (IPHONE lane).
 *
 * The whole city's walls, windows and stoops were built at boot and kept as JS arrays (about 300 MB of vertex data in a few thousand
 * meshes) although a phone draws about 110 m around the player. Here the heavy material classes (`STREAM_MESH`) are built per render
 * cell instead: at boot every cell is built once to learn its colliders, shape and bounds and then thrown away, leaving empty "shell"
 * meshes (same name, material and attribute layout, bounds set, draw count 0). `ChunkCuller` asks a cell to be built
 * (`request`) when the player comes within range plus a prefetch margin, a few lots per frame, and to be freed (`evict`, GPU buffers
 * included) when he is far away. Building a cell again gives the same triangles: the per-lot random seeds are kept (`lotSeeds`).
 *
 * A lot belongs to the cell of its centre, so its whole facade is in one cell (the desktop split cuts by triangle and can spread a
 * lot over two). Small material classes (signs, fences, decals) keep the old eager path in WorldBuilder.
 */
import * as THREE from 'three';
import type { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { buildBuildingsSteps, type SpecLot } from '@/world/BuildingGen';
import { setBatchSkip } from '@/world/buildings/facade';

/** Building mesh names built per cell on demand: the classes that make up almost all building vertices (limestone, brick and brownstone walls, stoops, windows, cornices, awnings). */
export const STREAM_MESH = /^buildings:(limestone|brick|brownstone|stoop|window|cornice|awning)/;

/** How far past the chunk range (m) a cell is already built, and how much farther again before it is freed. */
export const STREAM_PREFETCH_M = 90;
export const STREAM_EVICT_M = 70;
/** Time (ms) one `ChunkCuller.update` may spend building cells. */
export const STREAM_BUDGET_MS = 6;

interface StreamCell {
  ids: Set<string>;
  shells: Map<string, THREE.Mesh>;
  gen: Generator<void, { group: THREE.Group }, void> | null;
  resident: boolean;
}

export interface StreamStats { cells: number; resident: number; builds: number; evictions: number; residentBytes: number }

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** A geometry with the same attribute layout as `like` and nothing in it (drawn as nothing; carries the bounds of the real one). */
export function emptyLike(like: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(like.attributes)) {
    const src = a as THREE.BufferAttribute;
    g.setAttribute(name, new THREE.BufferAttribute(new (src.array.constructor as new (n: number) => THREE.TypedArray)(0), src.itemSize, src.normalized));
  }
  g.setDrawRange(0, 0);
  if (!like.boundingBox) like.computeBoundingBox();
  if (!like.boundingSphere) like.computeBoundingSphere();
  g.boundingBox = like.boundingBox!.clone();
  g.boundingSphere = like.boundingSphere!.clone();
  return g;
}

export class BuildingStream {
  private readonly cells = new Map<string, StreamCell>();
  private builds = 0;
  private evictions = 0;
  /** called after a cell's geometry replaced its shells' empty ones, and after it was freed */
  onChange: ((cell: string, resident: boolean) => void) | null = null;

  constructor(
    private readonly lots: SpecLot[],
    private readonly materials: IMaterialLibrary,
    private readonly rng: Rng,
    private readonly seeds: ReadonlyMap<string, number>,
    /** material classes the tier never draws, dropped while building (see facade.setBatchSkip) */
    private readonly skip: ((materialName: string) => boolean) | null = null,
  ) {}

  /** Registers a cell: the lots (ids) it is built from and its shell meshes (empty geometry, one per streamed material). */
  register(key: string, ids: Set<string>, shells: THREE.Mesh[]): void {
    const map = new Map<string, THREE.Mesh>();
    for (const s of shells) map.set(s.name, s);
    this.cells.set(key, { ids, shells: map, gen: null, resident: false });
  }

  isResident(key: string): boolean { return this.cells.get(key)?.resident === true; }

  /**
   * Builds (more of) a cell for at most `budgetMs`. Returns true once the cell is resident. Safe to call every frame: a cell is
   * built in lot-sized steps and only swapped in when complete, so half a facade never shows.
   */
  request(key: string, budgetMs = Infinity): boolean {
    const c = this.cells.get(key);
    if (!c) return true;
    if (c.resident) return true;
    if (!c.gen) c.gen = buildBuildingsSteps(this.lots, this.materials, this.rng, c.ids, this.seeds) as Generator<void, { group: THREE.Group }, void>;
    const t0 = nowMs();
    setBatchSkip(this.skip);
    let done = false;
    let result: { group: THREE.Group } | null = null;
    try {
      for (;;) {
        const r = c.gen.next();
        if (r.done) { done = true; result = r.value; break; }
        if (nowMs() - t0 >= budgetMs) break;
      }
    } finally { setBatchSkip(null); }
    if (!done || !result) return false;
    c.gen = null;
    for (const m of [...result.group.children] as THREE.Mesh[]) {
      const shell = c.shells.get(m.name);
      if (shell && STREAM_MESH.test(m.name)) {
        shell.userData.emptyGeo ??= shell.geometry;
        shell.geometry = m.geometry;
        shell.userData.nearGeo = undefined; shell.userData.farGeo = undefined;
      } else m.geometry.dispose(); // not a streamed class (cannot happen: the shell list comes from the same build)
    }
    c.resident = true;
    this.builds++;
    this.onChange?.(key, true);
    return true;
  }

  /** Frees a cell's geometry (CPU arrays and GPU buffers, full and far versions) and puts its shells back to empty. */
  evict(key: string): void {
    const c = this.cells.get(key);
    if (!c) return;
    c.gen = null;
    if (!c.resident) return;
    for (const s of c.shells.values()) {
      const u = s.userData as { emptyGeo?: THREE.BufferGeometry; nearGeo?: THREE.BufferGeometry; farGeo?: THREE.BufferGeometry };
      const live = s.geometry;
      if (u.nearGeo && u.nearGeo !== live) u.nearGeo.dispose();
      if (u.farGeo && u.farGeo !== live) u.farGeo.dispose();
      if (live !== u.emptyGeo) live.dispose();
      u.nearGeo = undefined; u.farGeo = undefined;
      if (u.emptyGeo) s.geometry = u.emptyGeo;
    }
    c.resident = false;
    this.evictions++;
    this.onChange?.(key, false);
  }

  stats(): StreamStats {
    let resident = 0, bytes = 0;
    for (const c of this.cells.values()) {
      if (!c.resident) continue;
      resident++;
      for (const s of c.shells.values()) {
        for (const a of Object.values(s.geometry.attributes)) bytes += (a as THREE.BufferAttribute).array.byteLength;
        bytes += s.geometry.index?.array.byteLength ?? 0;
      }
    }
    return { cells: this.cells.size, resident, builds: this.builds, evictions: this.evictions, residentBytes: bytes };
  }
}
