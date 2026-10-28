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
import { splitGeometryByCell } from '@/render/Culling';
import { writeYawMatrix } from '@/render/CarLod';

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

/** World-space position+normal copy of a mesh (instances expanded), or null when the geometry is unsuitable. */
function worldSlim(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  const g = mesh.geometry;
  const p = g.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!p || p.itemSize < 3 || !(p.array instanceof Float32Array) || (p as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
  let n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n) { const c = g.clone(); c.computeVertexNormals(); n = c.getAttribute('normal') as THREE.BufferAttribute; }
  const vcount = p.count;
  const index = g.index ? g.index.array : null;
  const tris = index ? index.length : vcount;
  const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
  const copies = inst ? inst.count : 1;
  if (copies === 0) return null;
  const pos = new Float32Array(copies * vcount * 3), nor = new Float32Array(copies * vcount * 3);
  const out = (copies * vcount > 65535 ? new Uint32Array(copies * tris) : new Uint16Array(copies * tris));
  const m = new THREE.Matrix4(), world = mesh.matrixWorld;
  const psrc = p.itemSize === 3 ? p.array : packXYZ(p);
  const nsrc = n.itemSize === 3 ? n.array : packXYZ(n);
  for (let c = 0; c < copies; c++) {
    if (inst) { inst.getMatrixAt(c, m); m.premultiply(world); } else m.copy(world);
    transformInto(psrc, pos, c * vcount * 3, vcount, m.elements, false);
    transformInto(nsrc, nor, c * vcount * 3, vcount, m.elements, true);
    const base = c * vcount, o = c * tris;
    if (index) for (let i = 0; i < tris; i++) out[o + i] = index[i] + base;
    else for (let i = 0; i < tris; i++) out[o + i] = base + i;
  }
  const slim = new THREE.BufferGeometry();
  slim.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  slim.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  slim.setIndex(new THREE.BufferAttribute(out, 1));
  return slim;
}

function packXYZ(a: THREE.BufferAttribute): Float32Array {
  const o = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) { o[i * 3] = a.getX(i); o[i * 3 + 1] = a.getY(i); o[i * 3 + 2] = a.getZ(i); }
  return o;
}

export interface StaticProxy { geometry: THREE.BufferGeometry; side: THREE.Side; cell: string; }
export interface ProxyBuild { proxies: StaticProxy[]; covered: THREE.Mesh[]; skipped: THREE.Mesh[]; vertices: number; triangles: number; }

/**
 * Collects every mesh under `roots` (matrixWorld must be current), keeps the proxyable ones and re-bins their triangles
 * into per-cell, per-side-class position+normal meshes.
 */
export function buildStaticProxies(roots: THREE.Object3D[], cellX: number, cellZ: number): ProxyBuild {
  const covered: THREE.Mesh[] = [], skipped: THREE.Mesh[] = [];
  const lists = new Map<string, { side: THREE.Side; cell: string; geos: THREE.BufferGeometry[] }>();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!isProxyable(mesh.material)) { skipped.push(mesh); return; }
      const slim = worldSlim(mesh);
      if (!slim) { skipped.push(mesh); return; }
      covered.push(mesh);
      const side = (mesh.material as THREE.Material).side;
      const parts = splitGeometryByCell(slim, cellX, cellZ) ?? new Map([['0_0', slim]]);
      for (const [cell, g] of parts) {
        const key = `${cell}|${side}`;
        let l = lists.get(key);
        if (!l) { l = { side, cell, geos: [] }; lists.set(key, l); }
        l.geos.push(g);
      }
      if (parts.get('0_0') !== slim) slim.dispose();
    });
  }
  const proxies: StaticProxy[] = [];
  let vertices = 0, triangles = 0;
  for (const l of lists.values()) {
    const geometry = concatIndexed(l.geos);
    for (const g of l.geos) g.dispose();
    vertices += geometry.getAttribute('position').count;
    triangles += geometry.index!.count / 3;
    proxies.push({ geometry, side: l.side, cell: l.cell });
  }
  return { proxies, covered, skipped, vertices, triangles };
}

const CAP = 512;

interface HullSet { mesh: THREE.InstancedMesh; shadow: THREE.InstancedMesh; n: number; }

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

  constructor() {
    this.ao.name = 'ao-proxy';
    this.ao.matrixAutoUpdate = false;
    this.shadowGroup.name = 'shadow-proxy';
    this.shadowGroup.visible = false;
    for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
      this.mats[side] = new THREE.MeshBasicMaterial({ side, colorWrite: false, name: `proxy-${side}` });
    }
  }

  /** Builds the static cell proxies from the world and turns off the covered meshes' own shadow casting. */
  addStatic(roots: THREE.Object3D[], cellX: number, cellZ: number): ProxyBuild {
    const build = buildStaticProxies(roots, cellX, cellZ);
    for (const p of build.proxies) {
      const a = new THREE.Mesh(p.geometry, this.mats[p.side]);
      a.matrixAutoUpdate = false; a.name = `ao:${p.cell}`;
      this.ao.add(a);
      const s = new THREE.Mesh(p.geometry, this.mats[p.side]);
      s.matrixAutoUpdate = false; s.castShadow = true; s.receiveShadow = false; s.name = `shadow:${p.cell}`;
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
    const make = (shadow: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geometry, this.mats[THREE.FrontSide], CAP);
      m.instanceMatrix = matrices; m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = false;
      m.name = `hull:${key}`;
      return m;
    };
    const mesh = make(false), shadow = make(castShadow);
    this.ao.add(mesh);
    if (castShadow) this.shadowGroup.add(shadow);
    const set: HullSet = { mesh, shadow, n: 0 };
    if (key === 'capsule') this.capsule = set; else this.hulls.set(key, set);
    this.hullMatrices.set(key, matrices);
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

  /** Makes the shadow-only group visible exactly while the shadow map renders. Returns an undo function. */
  wrapShadowRender(renderer: { shadowMap: { render: (...a: never[]) => void } }): () => void {
    const orig = renderer.shadowMap.render;
    renderer.shadowMap.render = ((...a: never[]) => {
      this.shadowGroup.visible = true;
      try { orig.apply(renderer.shadowMap, a); } finally { this.shadowGroup.visible = false; }
    }) as never;
    return () => { renderer.shadowMap.render = orig; };
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
