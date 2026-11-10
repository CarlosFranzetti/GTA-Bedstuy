/**
 * Cheap stand-ins for the two extra scene renders each frame:
 *
 *  - the shadow pass (sun shadow map), which draws every shadow caster inside the shadow box, and
 *  - GTAOPass's G-buffer, which re-renders the WHOLE scene with a normal override material (so one draw per
 *    material per cell, again).
 *
 * Neither needs materials, uvs or textures. The static world is re-binned into per-cell meshes that hold position +
 * normal only and mix every material (one draw per cell, per side class), plus instanced hulls for cars and
 * capsules for pedestrians. `RenderProxies` owns:
 *   - `ao`:         a Scene to hand to GTAOPass (`attachToPipeline`);
 *   - `shadowGroup`: a Group that sits in the main scene but is only visible while the shadow map renders
 *                    (`wrapShadowRender`), so the colour pass never draws it.
 * The real world meshes stop casting shadows (castShadow = false) once their triangles are covered by a proxy.
 *
 * Pure helpers (`isProxyable`, `concatIndexed`, `transformInto`) are exported for tests.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { writeYawMatrix } from '@/render/CarLod';
import { browserTier } from '@/render/StartTier';
import { clusterGeometry } from '@/render/FarGeometry';
import { SHADOW_PROXY_CELL } from '@/render/Culling';

/**
 * Shadow stand-in for a car: two boxes (lower body, cabin) from the hull's bounding box, 24 triangles. The shadow map of the
 * low / medium tiers has 8 to 12 cm texels, so the full far-LOD hull (5 k triangles per sedan) buys nothing there.
 */
export function coarseCarHull(hull: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!hull.boundingBox) hull.computeBoundingBox();
  const b = hull.boundingBox!;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
  const lengthIsZ = sz >= sx;
  const lower = new THREE.BoxGeometry(sx, sy * 0.55, sz).translate(cx, b.min.y + sy * 0.275, cz);
  const cabin = new THREE.BoxGeometry(lengthIsZ ? sx * 0.85 : sx * 0.55, sy * 0.45, lengthIsZ ? sz * 0.55 : sz * 0.85).translate(cx, b.min.y + sy * 0.775, cz);
  const g = mergeGeometries([lower, cabin], false)!;
  lower.dispose(); cabin.dispose();
  g.deleteAttribute('uv');
  return g;
}

/** A material whose surface is fully described by its depth (no alpha cut-out, no decal blending). */
export function isProxyable(mat: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(mat)) return false;
  return mat.alphaTest === 0 && mat.depthWrite !== false;
}

/** Applies the affine matrix `e` (column-major 16) to xyz triples in `src`, writing to `dst`. `normal` = rotate + renormalise. */
export function transformInto(src: ArrayLike<number>, dst: Float32Array, dstOffset: number, count: number, e: ArrayLike<number>, normal: boolean): void {
  for (let i = 0; i < count; i++) {
    const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    let ox = e[0] * x + e[4] * y + e[8] * z;
    let oy = e[1] * x + e[5] * y + e[9] * z;
    let oz = e[2] * x + e[6] * y + e[10] * z;
    if (normal) {
      const l = Math.hypot(ox, oy, oz) || 1;
      ox /= l; oy /= l; oz /= l;
    } else {
      ox += e[12]; oy += e[13]; oz += e[14];
    }
    const o = dstOffset + i * 3;
    dst[o] = ox; dst[o + 1] = oy; dst[o + 2] = oz;
  }
}

/** Concatenates indexed position+normal geometries into one (Uint16 indices when they fit, else Uint32). */
export function concatIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let verts = 0, idx = 0;
  for (const g of list) { verts += g.getAttribute('position').count; idx += g.index ? g.index.count : g.getAttribute('position').count; }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let v = 0, w = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    pos.set(p.array as Float32Array, v * 3);
    nor.set(n.array as Float32Array, v * 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) index[w++] = a[i] + v; }
    else for (let i = 0; i < p.count; i++) index[w++] = v + i;
    v += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** A piece of indexed position+normal geometry in world space (one mesh's share of one cell). */
interface Chunk { pos: Float32Array; nor: Float32Array; idx: Uint32Array; }

function packXYZ(a: THREE.BufferAttribute): Float32Array {
  const o = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) { o[i * 3] = a.getX(i); o[i * 3 + 1] = a.getY(i); o[i * 3 + 2] = a.getZ(i); }
  return o;
}

/**
 * World-space position+normal of a mesh (instances expanded), re-binned by triangle centroid into `cellX` x `cellZ` cells.
 * Calls `emit(cellKey, chunk)` per non-empty cell. Returns false when the geometry is unsuitable.
 * Linear in the number of triangle corners (no per-cell pass over all vertices).
 */
function binMesh(mesh: THREE.Mesh, cellX: number, cellZ: number, emit: (cell: string, c: Chunk) => void): boolean {
  const g = mesh.geometry;
  const p = g.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!p || p.itemSize < 3 || (p as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return false;
  let n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n) { const c = g.clone(); c.computeVertexNormals(); n = c.getAttribute('normal') as THREE.BufferAttribute; }
  const vcount = p.count;
  const index = g.index ? g.index.array : null;
  const tris = (index ? index.length : vcount) / 3;
  if (!Number.isInteger(tris)) return false;
  const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
  const copies = inst ? inst.count : 1;
  if (copies === 0) return false;
  const psrc = p.array instanceof Float32Array && p.itemSize === 3 ? p.array : packXYZ(p);
  const nsrc = n.array instanceof Float32Array && n.itemSize === 3 ? n.array : packXYZ(n);
  const P = new Float32Array(vcount * 3), N = new Float32Array(vcount * 3);
  const m = new THREE.Matrix4();
  const triCell = new Int32Array(tris);
  const ids = new Map<number, number>();
  const keys: number[] = [];
  const stamp = new Int32Array(vcount), slot = new Int32Array(vcount);
  let generation = 0;
  for (let c = 0; c < copies; c++) {
    if (inst) { inst.getMatrixAt(c, m); m.premultiply(mesh.matrixWorld); } else m.copy(mesh.matrixWorld);
    transformInto(psrc, P, 0, vcount, m.elements, false);
    transformInto(nsrc, N, 0, vcount, m.elements, true);
    // bin triangles by centroid
    const counts: number[] = [];
    for (let t = 0; t < tris; t++) {
      const a = index ? index[t * 3] : t * 3, b = index ? index[t * 3 + 1] : t * 3 + 1, d = index ? index[t * 3 + 2] : t * 3 + 2;
      const cx = (P[a * 3] + P[b * 3] + P[d * 3]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[d * 3 + 2]) / 3;
      const key = (Math.floor(cx / cellX) + 4096) * 8192 + (Math.floor(cz / cellZ) + 4096);
      let id = ids.get(key);
      if (id === undefined) { id = keys.length; keys.push(key); ids.set(key, id); }
      triCell[t] = id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    // counting sort of triangles by cell, then one pass per cell over its own triangles only
    const nCells = keys.length;
    const start = new Int32Array(nCells + 1);
    for (let id = 0; id < nCells; id++) start[id + 1] = start[id] + (counts[id] ?? 0);
    const fill = start.slice(0, nCells);
    const order = new Int32Array(tris);
    for (let t = 0; t < tris; t++) order[fill[triCell[t]]++] = t;
    for (let id = 0; id < nCells; id++) {
      const cnt = counts[id] ?? 0;
      if (cnt === 0) continue;
      const idx = new Uint32Array(cnt * 3);
      const src: number[] = [];
      let w = 0;
      const gen = ++generation;
      for (let q = start[id]; q < start[id + 1]; q++) {
        const t = order[q];
        for (let k = 0; k < 3; k++) {
          const v = index ? index[t * 3 + k] : t * 3 + k;
          if (stamp[v] !== gen) { stamp[v] = gen; slot[v] = src.length; src.push(v); }
          idx[w++] = slot[v];
        }
      }
      const verts = src.length;
      const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
      for (let j = 0; j < verts; j++) {
        const v = src[j], o = j * 3;
        pos[o] = P[v * 3]; pos[o + 1] = P[v * 3 + 1]; pos[o + 2] = P[v * 3 + 2];
        nor[o] = N[v * 3]; nor[o + 1] = N[v * 3 + 1]; nor[o + 2] = N[v * 3 + 2];
      }
      const key = keys[id];
      emit(`${Math.floor(key / 8192) - 4096}_${(key % 8192) - 4096}`, { pos, nor, idx });
    }
  }
  return true;
}

function concatChunks(list: Chunk[]): THREE.BufferGeometry {
  let verts = 0, idx = 0;
  for (const c of list) { verts += c.pos.length / 3; idx += c.idx.length; }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let v = 0, w = 0;
  for (const c of list) {
    pos.set(c.pos, v * 3); nor.set(c.nor, v * 3);
    for (let i = 0; i < c.idx.length; i++) index[w++] = c.idx[i] + v;
    v += c.pos.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

export interface StaticProxy { geometry: THREE.BufferGeometry; side: THREE.Side; cell: string; }
export interface ProxyBuild { proxies: StaticProxy[]; covered: THREE.Mesh[]; skipped: THREE.Mesh[]; vertices: number; triangles: number; }

/**
 * Collects every mesh under `roots` (matrixWorld must be current), keeps the proxyable ones and re-bins their triangles
 * into per-cell, per-side-class position+normal meshes.
 */
export function buildStaticProxies(roots: THREE.Object3D[], cellX: number, cellZ: number): ProxyBuild {
  const covered: THREE.Mesh[] = [], skipped: THREE.Mesh[] = [];
  const lists = new Map<string, { side: THREE.Side; cell: string; chunks: Chunk[] }>();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!isProxyable(mesh.material)) { skipped.push(mesh); return; }
      const side = (mesh.material as THREE.Material).side;
      const ok = binMesh(mesh, cellX, cellZ, (cell, chunk) => {
        const key = `${cell}|${side}`;
        let l = lists.get(key);
        if (!l) { l = { side, cell, chunks: [] }; lists.set(key, l); }
        l.chunks.push(chunk);
      });
      if (ok) covered.push(mesh); else skipped.push(mesh);
    });
  }
  const proxies: StaticProxy[] = [];
  let vertices = 0, triangles = 0;
  for (const l of lists.values()) {
    const geometry = concatChunks(l.chunks);
    vertices += geometry.getAttribute('position').count;
    triangles += geometry.index!.count / 3;
    proxies.push({ geometry, side: l.side, cell: l.cell });
  }
  return { proxies, covered, skipped, vertices, triangles };
}

/** Grid (m) the low tier's shadow cell proxies are clustered on. */
export const SHADOW_PROXY_CLUSTER_M = 0.3;
const CAP = 512;

interface HullSet { mesh: THREE.InstancedMesh; shadow: THREE.InstancedMesh; n: number; }

const _sphere = new THREE.Sphere();
/** Metres beyond the shadow box's half-size within which the detailed cell proxies still draw (see wrapShadowRender). */
export const SHADOW_DETAIL_MARGIN = 15;
/** ...but never farther than this from the player: a cornice or stoop 45 m away is a few shadow texels wide, the building prism carries the mass. */
export const SHADOW_DETAIL_MAX = 45;
/** Metres from the camera within which the AO G-buffer draws the static cell proxies. */
export const AO_REACH = 70;
/** Radius (m) of the sphere tested against the shadow frustum for a car hull / capsule. */
const HULL_RADIUS = 3.6;

export class RenderProxies {
  /** Scene for GTAOPass: static cells, car hulls, ped capsules. */
  readonly ao = new THREE.Scene();
  /** Added to the main scene; visible only while the shadow map renders. */
  readonly shadowGroup = new THREE.Group();
  /** Real meshes now covered by proxies (their castShadow is switched off). */
  covered: THREE.Mesh[] = [];
  triangles = 0;
  private readonly mats: Record<number, THREE.MeshBasicMaterial> = {};
  private readonly hulls = new Map<string, HullSet>();
  private capsule: HullSet | null = null;
  private readonly hullMatrices = new Map<string, THREE.InstancedBufferAttribute>();
  /** shadow-pass copy of the hull matrices: only the instances inside the sun's shadow box (wrapShadowRender) */
  private readonly shadowMatrices = new Map<string, THREE.InstancedBufferAttribute>();
  private readonly cellBoxes: Array<{ mesh: THREE.Mesh; ao: THREE.Mesh; box: THREE.Box3 }> = [];
  /** cell proxies the last AO G-buffer render drew (tests, stats) */
  aoCellsDrawn = 0;
  private readonly shadowFrustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  /** shadow-pass cell meshes / hull instances drawn by the last shadow render (tests, stats) */
  shadowCellsDrawn = 0;
  shadowHullsDrawn = 0;

  constructor() {
    this.ao.name = 'ao-proxy';
    this.ao.matrixAutoUpdate = false;
    this.shadowGroup.name = 'shadow-proxy';
    this.shadowGroup.visible = false;
    // the AO G-buffer re-renders the whole city otherwise: ambient occlusion fades out within ~100 m, so only cells near the camera are drawn
    this.ao.onBeforeRender = (_r, _s, camera) => {
      const e = camera.matrixWorld.elements, px = e[12], pz = e[14];
      let n = 0;
      for (const c of this.cellBoxes) {
        const dx = Math.max(c.box.min.x - px, 0, px - c.box.max.x), dz = Math.max(c.box.min.z - pz, 0, pz - c.box.max.z);
        const v = dx * dx + dz * dz <= AO_REACH * AO_REACH;
        c.ao.visible = v; if (v) n++;
      }
      this.aoCellsDrawn = n;
    };
    for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
      this.mats[side] = new THREE.MeshBasicMaterial({ side, colorWrite: false, name: `proxy-${side}` });
    }
  }

  /** Builds the static cell proxies from the world and turns off the covered meshes' own shadow casting. */
  addStatic(roots: THREE.Object3D[], cellX: number, cellZ: number): ProxyBuild {
    // low has no AO pass, so its proxies can be small cells: the shadow box then draws ~1/3 of the triangles (the cell AABB test is tighter)
    const t = browserTier();
    const cell = t ? Math.min(cellX, SHADOW_PROXY_CELL[t]) : cellX;
    const build = buildStaticProxies(roots, cell, Math.min(cellZ, cell));
    // low has no AO pass and a ~4 cm shadow texel: collapsing the sub-30 cm relief (stoop steps, cornice, window reveals) of the cell proxies saves a third of the shadow triangles
    if (t === 'low') for (const p of build.proxies) { const g = clusterGeometry(p.geometry, SHADOW_PROXY_CLUSTER_M, true); p.geometry.dispose(); p.geometry = g; }
    for (const p of build.proxies) {
      let aoMesh: THREE.Mesh;
      const a = new THREE.Mesh(p.geometry, this.mats[p.side]);
      a.matrixAutoUpdate = false; a.name = `ao:${p.cell}`;
      this.ao.add(a);
      aoMesh = a;
      const s = new THREE.Mesh(p.geometry, this.mats[p.side]);
      s.matrixAutoUpdate = false; s.castShadow = true; s.receiveShadow = false; s.name = `shadow:${p.cell}`;
      // a cell is 100 x 100 m: three's bounding-sphere test keeps ~4x more cells than the shadow box needs, so wrapShadowRender tests the box
      p.geometry.computeBoundingBox();
      s.frustumCulled = false;
      this.cellBoxes.push({ mesh: s, ao: aoMesh, box: p.geometry.boundingBox! });
      this.shadowGroup.add(s);
    }
    for (const m of build.covered) m.castShadow = false;
    this.covered = build.covered;
    this.triangles = build.triangles;
    return build;
  }

  /** Registers an instanced hull for a car type (or the ped capsule under key 'capsule'). */
  addHull(key: string, geometry: THREE.BufferGeometry, castShadow: boolean): void {
    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 16), 16);
    matrices.setUsage(THREE.DynamicDrawUsage);
    const smatrices = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 16), 16);
    smatrices.setUsage(THREE.DynamicDrawUsage);
    const coarse = key !== 'capsule' ? coarseCarHull(geometry) : geometry; // AO and shadow both: a 5 k triangle hull per far car buys nothing at those resolutions
    const make = (shadow: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(coarse, this.mats[THREE.FrontSide], CAP);
      m.instanceMatrix = shadow ? smatrices : matrices; m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = false;
      m.name = `hull:${key}`;
      return m;
    };
    const mesh = make(false), shadow = make(castShadow);
    this.ao.add(mesh);
    if (castShadow) this.shadowGroup.add(shadow);
    const set: HullSet = { mesh, shadow, n: 0 };
    if (key === 'capsule') this.capsule = set; else this.hulls.set(key, set);
    this.hullMatrices.set(key, matrices);
    this.shadowMatrices.set(key, smatrices);
  }

  hasHull(key: string): boolean { return this.hulls.has(key); }

  beginFrame(): void {
    for (const h of this.hulls.values()) h.n = 0;
    if (this.capsule) this.capsule.n = 0;
  }

  /** Adds a car (or any yaw-only body) to its hull set. */
  addCar(key: string, x: number, z: number, heading: number): void {
    const h = this.hulls.get(key);
    if (!h || h.n >= CAP) return;
    writeYawMatrix(h.mesh.instanceMatrix.array as Float32Array, h.n * 16, x, z, -heading);
    h.n++;
  }

  addPed(x: number, z: number): void {
    const h = this.capsule;
    if (!h || h.n >= CAP) return;
    writeYawMatrix(h.mesh.instanceMatrix.array as Float32Array, h.n * 16, x, z, 0);
    h.n++;
  }

  endFrame(): void {
    const commit = (h: HullSet, key: string): void => {
      h.mesh.count = h.n; h.shadow.count = h.n;
      const a = this.hullMatrices.get(key)!;
      h.mesh.visible = h.n > 0; h.shadow.visible = h.n > 0;
      if (h.n === 0) return;
      a.clearUpdateRanges(); a.addUpdateRange(0, h.n * 16); a.needsUpdate = true;
    };
    for (const [key, h] of this.hulls) commit(h, key);
    if (this.capsule) commit(this.capsule, 'capsule');
  }

  /**
   * Makes the shadow-only group visible exactly while the shadow map renders, and trims it to what the sun's shadow box can
   * see: cell proxies by box-vs-frustum (not bounding sphere), car hulls by distance to the box. Returns an undo function.
   */
  wrapShadowRender(renderer: { shadowMap: { render: (...a: never[]) => void } }): () => void {
    const orig = renderer.shadowMap.render;
    renderer.shadowMap.render = ((...a: never[]) => {
      this.trimForShadow((a[0] as unknown as THREE.Light[] | undefined) ?? []);
      this.shadowGroup.visible = true;
      try { orig.apply(renderer.shadowMap, a); } finally { this.shadowGroup.visible = false; }
    }) as never;
    return () => { renderer.shadowMap.render = orig; };
  }

  private trimForShadow(lights: THREE.Light[]): void {
    const sun = lights.find((l) => l.castShadow && (l as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined;
    if (!sun) return;
    sun.shadow.updateMatrices(sun);
    const sc = sun.shadow.camera;
    this.shadowFrustum.setFromProjectionMatrix(this.projScreen.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse));
    // detailed cell proxies only near the player (the shadow box half-size + 15 m, at most 45 m); farther buildings cast through BlobShadows' prisms
    const reach = Math.min(sc.right + SHADOW_DETAIL_MARGIN, SHADOW_DETAIL_MAX), tx = sun.target.position.x, tz = sun.target.position.z;
    let cells = 0;
    for (const c of this.cellBoxes) {
      const dx = Math.max(c.box.min.x - tx, 0, tx - c.box.max.x), dz = Math.max(c.box.min.z - tz, 0, tz - c.box.max.z);
      const v = dx * dx + dz * dz <= reach * reach && this.shadowFrustum.intersectsBox(c.box);
      c.mesh.visible = v; if (v) cells++;
    }
    this.shadowCellsDrawn = cells;
    let hulls = 0;
    for (const [key, h] of this.hulls) {
      const dst = this.shadowMatrices.get(key)!;
      if (h.shadow.instanceMatrix !== dst) continue; // no shadow set for this key
      const src = h.mesh.instanceMatrix.array as Float32Array, out = dst.array as Float32Array;
      let k = 0;
      for (let i = 0; i < h.n; i++) {
        _sphere.center.set(src[i * 16 + 12], 0.8, src[i * 16 + 14]); _sphere.radius = HULL_RADIUS;
        if (!this.shadowFrustum.intersectsSphere(_sphere)) continue;
        for (let j = 0; j < 16; j++) out[k * 16 + j] = src[i * 16 + j];
        k++;
      }
      h.shadow.count = k; h.shadow.visible = k > 0; hulls += k;
      if (k > 0) { dst.clearUpdateRanges(); dst.addUpdateRange(0, k * 16); dst.needsUpdate = true; }
    }
    this.shadowHullsDrawn = hulls;
  }

  /**
   * Points the pipeline's GTAOPass at the proxy scene. Reaches into the pipeline's private `gtao` field (no public
   * accessor yet); returns false when there is no GTAO pass (low quality) or the field moved.
   * Call again after every `pipeline.setQuality` (the pass is rebuilt).
   */
  attachToPipeline(pipeline: object): boolean {
    const gtao = (pipeline as { gtao?: { scene: THREE.Object3D } | null }).gtao;
    if (!gtao) return false;
    gtao.scene = this.ao;
    return true;
  }
}
