/**
 * Car level of detail. A full car model is ~17 meshes (body, glass, trim, chrome, 4 tyres, 4 rims, 2 plates, lamps), and
 * the same again for every shadow / G-buffer pass, which made parked traffic ~60 % of all draw calls.
 *
 * Beyond `nearDist` metres from the camera a car is hidden and drawn as an instance of a per-type LOD model instead:
 *   paint (instanceColor = body colour, the shared white car-paint material so the flake/dirt maps still show),
 *   glass, one merged dark mesh (trim, chrome, tyres, plates), and lit head / tail lamps (only cars whose lamps are on).
 * That is 3 to 5 draw calls per car TYPE for all far cars together. Near cars keep their full model.
 *
 * Pure helpers (`writeYawMatrix`, `hysteresisFar`, `lampColor`) are exported for tests.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CarModel } from '@/entities/models/carModel';
import type { IMaterialLibrary } from '@/world/types';

/** Writes the column-major matrix of translate(x, 0, z) * rotateY(yaw) into `out` at element offset `o`. */
export function writeYawMatrix(out: Float32Array | number[], o: number, x: number, z: number, yaw: number, y = 0): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[o] = c; out[o + 1] = 0; out[o + 2] = -s; out[o + 3] = 0;
  out[o + 4] = 0; out[o + 5] = 1; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = s; out[o + 9] = 0; out[o + 10] = c; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}

/** Far/near decision with hysteresis: becomes far beyond `near`, returns to near only inside `near - margin`. */
export function hysteresisFar(wasFar: boolean, dist: number, near: number, margin: number): boolean {
  return wasFar ? dist > near - margin : dist > near;
}

/** Instance colour of a lamp: emissive colour times intensity (HDR, so bloom still picks lit lamps up). */
export function lampColor(emissive: THREE.Color, intensity: number, out: THREE.Color): THREE.Color {
  return out.setRGB(emissive.r * intensity, emissive.g * intensity, emissive.b * intensity);
}

/** Mesh names that make up each LOD part (see carModel.ts). Rims are dropped (hidden inside the tyre at LOD distance). */
const PART_NAMES = {
  paint: ['body', 'hood'],
  cargo: ['cargo'],
  glass: ['glass'],
  dark: ['trim', 'chrome', 'tyre', 'plateFront', 'plateRear'],
  head: ['headlight'],
  tail: ['taillight'],
} as const;
type PartKey = keyof typeof PART_NAMES;

/** Names of the car meshes that should cast shadows (big, readable shapes; wheels/glass/lamps/plates are not worth a draw). */
const SHADOW_CASTERS = new Set(['body', 'hood', 'cargo', 'trim']);

/** Shadow flags for a full-detail car: only the big shapes cast; nothing receives (as before). */
export function applyCarShadowFlags(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    o.castShadow = SHADOW_CASTERS.has(o.name);
    o.receiveShadow = false;
  });
}

const CAPACITY = 384;

interface TypeLod {
  paint: THREE.InstancedMesh;
  cargo: THREE.InstancedMesh | null;
  glass: THREE.InstancedMesh;
  dark: THREE.InstancedMesh;
  head: THREE.InstancedMesh | null;
  tail: THREE.InstancedMesh | null;
  /** matrices shared by paint / glass / dark / cargo (every far car of the type) */
  matrices: THREE.InstancedBufferAttribute;
  headMatrices: THREE.InstancedBufferAttribute | null;
  tailMatrices: THREE.InstancedBufferAttribute | null;
  n: number; nHead: number; nTail: number;
}

interface CarInfo {
  far: boolean;
  color: THREE.Color;
  head: THREE.MeshStandardMaterial | null;
  tail: THREE.MeshStandardMaterial | null;
}

export interface LodCar {
  object3D: THREE.Object3D;
  spec: { type: string; color: string };
  damage: number;
}

export interface CarLodOptions {
  /** metres: cars farther than this from the camera use the instanced model */
  nearDist?: number;
  /** metres of hysteresis when returning to the full model */
  margin?: number;
  /** Builds a pristine car model for the LOD geometry; return null to disable LOD for that type (e.g. GLB models). */
  buildModel: (type: string) => CarModel | null;
  /** types that never get LOD (cop cars have a livery material and a light bar) */
  exclude?: readonly string[];
  /** damage above which the full model is kept (dents / darkened paint are per car) */
  maxDamage?: number;
}

export class CarLod {
  readonly group = new THREE.Group();
  private readonly types = new Map<string, TypeLod | null>();
  private readonly info = new WeakMap<THREE.Object3D, CarInfo>();
  private readonly colors = new Map<string, THREE.Color>();
  private readonly scratch = new THREE.Color();
  private readonly near: number;
  private readonly margin: number;
  private readonly maxDamage: number;
  private readonly paintMat: THREE.Material;
  private readonly cargoMat: THREE.Material;
  private readonly glassMat: THREE.Material;
  private readonly darkMat: THREE.Material;
  private readonly lampMat: THREE.MeshBasicMaterial;
  /** number of cars drawn as instances in the last frame (for stats) */
  farCount = 0;

  constructor(private readonly materials: IMaterialLibrary, private readonly opts: CarLodOptions) {
    this.group.name = 'car-lod';
    this.near = opts.nearDist ?? 32;
    this.margin = opts.margin ?? 4;
    this.maxDamage = opts.maxDamage ?? 0.15;
    this.paintMat = materials.carPaint('#ffffff');
    this.cargoMat = materials.carPaint('#f4f4f4');
    this.glassMat = materials.get('carGlass');
    this.darkMat = materials.get('metalDark');
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, name: 'car-lod-lamp' });
    for (const t of opts.exclude ?? []) this.types.set(t, null);
  }

  /** Call once per frame before any `place`. */
  beginFrame(): void {
    for (const t of this.types.values()) if (t) { t.n = 0; t.nHead = 0; t.nTail = 0; }
    this.farCount = 0;
  }

  /**
   * Decides the level for one car and, when it is far, records its instance. Returns true when the car is drawn as an
   * instance (its object3D is then hidden). `dist` is the distance from the camera in metres.
   */
  place(car: LodCar, x: number, z: number, heading: number, dist: number): boolean {
    const lod = this.typeFor(car.spec.type);
    let info = this.info.get(car.object3D);
    if (!info) {
      info = { far: false, color: this.colorOf(car.spec.color), head: null, tail: null };
      this.bindLamps(car.object3D, info);
      this.info.set(car.object3D, info);
    }
    if (!lod || car.damage > this.maxDamage || lod.n >= CAPACITY) { info.far = false; car.object3D.visible = true; return false; }
    info.far = hysteresisFar(info.far, dist, this.near, this.margin);
    if (!info.far) { car.object3D.visible = true; return false; }
    car.object3D.visible = false;
    const i = lod.n++;
    const yaw = -heading;
    writeYawMatrix(lod.matrices.array as Float32Array, i * 16, x, z, yaw);
    lod.paint.setColorAt(i, info.color);
    if (lod.head && info.head && info.head.emissiveIntensity > 0.05 && lod.nHead < CAPACITY) {
      const k = lod.nHead++;
      writeYawMatrix(lod.headMatrices!.array as Float32Array, k * 16, x, z, yaw);
      lod.head.setColorAt(k, lampColor(info.head.emissive, info.head.emissiveIntensity, this.scratch));
    }
    if (lod.tail && info.tail && info.tail.emissiveIntensity > 0.05 && lod.nTail < CAPACITY) {
      const k = lod.nTail++;
      writeYawMatrix(lod.tailMatrices!.array as Float32Array, k * 16, x, z, yaw);
      lod.tail.setColorAt(k, lampColor(info.tail.emissive, info.tail.emissiveIntensity, this.scratch));
    }
    this.farCount++;
    return true;
  }

  /** Forget a car's LOD state and show its full model (the car the player just entered, a disposed car). */
  release(car: LodCar): void {
    const info = this.info.get(car.object3D);
    if (info) info.far = false;
  }

  /** Call once per frame after the last `place`: sets instance counts, upload ranges and visibility. */
  endFrame(): void {
    for (const t of this.types.values()) {
      if (!t) continue;
      this.commit(t.paint, t.n, t.matrices, true);
      if (t.cargo) this.commit(t.cargo, t.n, t.matrices, false);
      this.commit(t.glass, t.n, t.matrices, false);
      this.commit(t.dark, t.n, t.matrices, false);
      if (t.head && t.headMatrices) this.commit(t.head, t.nHead, t.headMatrices, true);
      if (t.tail && t.tailMatrices) this.commit(t.tail, t.nTail, t.tailMatrices, true);
    }
  }

  private commit(m: THREE.InstancedMesh, n: number, matrices: THREE.InstancedBufferAttribute, color: boolean): void {
    m.count = n;
    m.visible = n > 0;
    if (n === 0) return;
    matrices.clearUpdateRanges();
    matrices.addUpdateRange(0, n * 16);
    matrices.needsUpdate = true;
    if (color && m.instanceColor) {
      m.instanceColor.clearUpdateRanges();
      m.instanceColor.addUpdateRange(0, n * 3);
      m.instanceColor.needsUpdate = true;
    }
  }

  private colorOf(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) { c = new THREE.Color(hex); this.colors.set(hex, c); }
    return c;
  }

  private bindLamps(root: THREE.Object3D, info: CarInfo): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (o.name === 'headlight' && !info.head) info.head = mat;
      else if (o.name === 'taillight' && !info.tail) info.tail = mat;
    });
  }

  private typeFor(type: string): TypeLod | null {
    if (this.types.has(type)) return this.types.get(type)!;
    const model = this.opts.buildModel(type);
    const lod = model ? this.build(model) : null;
    this.types.set(type, lod);
    return lod;
  }

  /** Merges a pristine model's meshes into the LOD parts (in model space, rest pose). */
  private build(model: CarModel): TypeLod | null {
    model.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.group.matrixWorld).invert();
    const parts: Record<PartKey, THREE.BufferGeometry[]> = { paint: [], cargo: [], glass: [], dark: [], head: [], tail: [] };
    const rel = new THREE.Matrix4();
    model.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const key of Object.keys(PART_NAMES) as PartKey[]) {
        if (!(PART_NAMES[key] as readonly string[]).includes(o.name)) continue;
        rel.multiplyMatrices(inv, mesh.matrixWorld);
        parts[key].push(slimGeometry(mesh.geometry, rel));
      }
    });
    if (parts.paint.length === 0) { disposeModel(model); return null; }
    const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
      if (list.length === 0) return null;
      const g = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      return g;
    };
    const paintG = merge(parts.paint)!, cargoG = merge(parts.cargo), glassG = merge(parts.glass), darkG = merge(parts.dark);
    const headG = merge(parts.head), tailG = merge(parts.tail);
    disposeModel(model);
    if (!glassG || !darkG) return null;

    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 16), 16);
    matrices.setUsage(THREE.DynamicDrawUsage);
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, attr: THREE.InstancedBufferAttribute, shadow: boolean, color: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, CAPACITY);
      m.instanceMatrix = attr;
      if (color) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      m.count = 0; m.visible = false; m.frustumCulled = false;
      m.castShadow = shadow; m.receiveShadow = false;
      m.name = `car-lod:${mat.name || mat.type}`;
      this.group.add(m);
      return m;
    };
    const lampAttr = (): THREE.InstancedBufferAttribute => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 16), 16); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const headMatrices = headG ? lampAttr() : null, tailMatrices = tailG ? lampAttr() : null;
    return {
      paint: make(paintG, this.paintMat, matrices, true, true),
      cargo: cargoG ? make(cargoG, this.cargoMat, matrices, true, false) : null,
      glass: make(glassG, this.glassMat, matrices, false, false),
      dark: make(darkG, this.darkMat, matrices, true, false),
      head: headG && headMatrices ? make(headG, this.lampMat, headMatrices, false, true) : null,
      tail: tailG && tailMatrices ? make(tailG, this.lampMat, tailMatrices, false, true) : null,
      matrices, headMatrices, tailMatrices, n: 0, nHead: 0, nTail: 0,
    };
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const t of this.types.values()) {
      if (!t) continue;
      for (const m of [t.paint, t.cargo, t.glass, t.dark, t.head, t.tail]) { if (m) m.geometry.dispose(); }
    }
    this.lampMat.dispose();
    this.types.clear();
  }
}

/** Non-indexed copy with only position / normal / uv, transformed by `m` (so geometries of one part can merge). */
function slimGeometry(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  g.groups.length = 0;
  g.applyMatrix4(m);
  return g;
}

/** Geometries are cached and shared by carModel (never disposed here); only the per-car materials are. */
function disposeModel(model: CarModel): void {
  for (const mat of model.ownMaterials) mat.dispose();
}
