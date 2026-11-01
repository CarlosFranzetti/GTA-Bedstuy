/**
 * Culling helpers.
 *  - splitMeshesIntoCells: the world generators merge one geometry per material for the whole city; frustum culling
 *    then can never reject anything. This re-bins those triangles into a coarse XZ grid of cells (by triangle
 *    centroid) so each cell has a tight bounding sphere.
 *  - DistanceCuller: hides registered objects (prop cells, parked cars, peds) beyond a range.
 */
import * as THREE from 'three';
import type { Quality } from './Shadows';
import { TIER_CONFIG } from './QualityTier';

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

/** Cell index of a point for a grid of `cellX` x `cellZ` metres anchored at the world origin. */
export function cellOf(x: number, z: number, cellX: number, cellZ: number, out: CellKey): CellKey {
  out.ix = Math.floor(x / cellX);
  out.iz = Math.floor(z / cellZ);
  return out;
}

type AnyArray = Float32Array | Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Uint8ClampedArray;

/** Splits one (merged) geometry into per-cell geometries by triangle centroid. Returns null if it cannot be split. */
export function splitGeometryByCell(geo: THREE.BufferGeometry, cellX: number, cellZ: number): Map<string, THREE.BufferGeometry> | null {
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
    const key = `${Math.floor(cx / cellX)}_${Math.floor(cz / cellZ)}`;
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

export function triangleCount(geo: THREE.BufferGeometry): number {
  return geo.index ? geo.index.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3;
}

export interface SplitStats { meshesBefore: number; meshesAfter: number; trianglesAfter: number; }

/**
 * Replaces every Mesh directly under `group` by one mesh per grid cell. Mesh names, materials, shadow flags and
 * userData are kept (names must stay identical: e.g. setLampsLit finds the lamp heads by name). `userData.cell`
 * holds the cell key. Returns the new cell meshes.
 */
export function splitMeshesIntoCells(group: THREE.Object3D, cellX: number, cellZ: number, stats?: SplitStats, minTris = 0): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  // InstancedMesh geometry is a local template shared by every instance: never re-bin it
  const originals = group.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true && !(o as THREE.InstancedMesh).isInstancedMesh);
  for (const mesh of originals) {
    if (stats) stats.meshesBefore++;
    const parts = Array.isArray(mesh.material) || triangleCount(mesh.geometry) < minTris ? null : splitGeometryByCell(mesh.geometry, cellX, cellZ);
    if (!parts || parts.size <= 1) { result.push(mesh); if (stats) { stats.meshesAfter++; } continue; }
    for (const [key, g] of parts) {
      const m = new THREE.Mesh(g, mesh.material);
      m.name = mesh.name;
      m.castShadow = mesh.castShadow;
      m.receiveShadow = mesh.receiveShadow;
      m.renderOrder = mesh.renderOrder;
      m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
      m.userData = { ...mesh.userData, cell: key };
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
