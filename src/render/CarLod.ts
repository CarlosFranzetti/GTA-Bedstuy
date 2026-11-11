/**
 * Car level of detail. A full car model is ~17 meshes (body, glass, trim, chrome, 4 tyres, 4 rims, 2 plates, lamps), and
 * the same again for every shadow / G-buffer pass, which made parked traffic ~60 % of all draw calls.
 *
 * Beyond `nearDist` metres from the camera a car is hidden and drawn as an instance of a per-type LOD model instead:
 *   paint (instanceColor = body colour, the shared white car-paint material so the flake/dirt maps still show),
 *   glass, one merged dark mesh (trim, chrome, tyres, plates), and lit head / tail lamps (only cars whose lamps are on).
 * That is 3 to 5 draw calls per car TYPE for all far cars together. Near cars keep their full model.
 *
 * glTF cars (src/entities/models/gltf/VehicleSource.ts) have their own far model: body + wheels merged into one geometry drawn
 * with the palette paint material (instanceColor = body colour) plus lit lamps, 1 to 3 draw calls per type. Models that cannot
 * be instanced that way (no palette paint) simply keep the full model.
 *
 * Pure helpers (`writeYawMatrix`, `hysteresisFar`, `lampColor`) are exported for tests.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CarModel } from '@/entities/models/carModel';
import type { IMaterialLibrary } from '@/world/types';
import { CAR_CLOSE_DIST, tierConfig } from '@/render/QualityTier';
import { carPaintConfigured, carPaintTier } from '@/render/CarPaintFx';
import { shrinkTo } from '@/render/FarGeometry';
import { gltfLodFor, setGltfMaterials, type GltfLodParts } from '@/entities/models/gltf/VehicleSource';

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

/** Triangle budget of each far-proxy part (sums to ~1.1 k with the 4 wheel discs of 32 triangles). */
export const FAR_TRIS = { paint: 520, cargo: 160, glass: 140, dark: 240 } as const;

/** Mesh names that make up each LOD part (see carModel.ts). Hubcaps are part of the 'tyre' meshes, which become 10-gons here. */
const PART_NAMES = {
  paint: ['body', 'hood'],
  cargo: ['cargo'],
  glass: ['glass'],
  dark: ['trim', 'chrome', 'tyre', 'plate', 'plateFront', 'plateRear'],
  head: ['headlight'],
  tail: ['taillight'],
} as const;
type PartKey = keyof typeof PART_NAMES;

/** Names of the car meshes that should cast shadows (big, readable shapes; wheels/glass/lamps/plates are not worth a draw). */
const SHADOW_CASTERS = new Set(['body', 'hood', 'cargo', 'trim']);

/**
 * Shadow flags for a full-detail car; nothing receives (as before). With `proxied` the car's shadow comes from the
 * instanced hull (AoProxy) so none of its own meshes cast; otherwise only the big shapes do.
 */
export function applyCarShadowFlags(root: THREE.Object3D, proxied = false): void {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    o.castShadow = !proxied && SHADOW_CASTERS.has(o.name);
    o.receiveShadow = false;
  });
}

const CAPACITY = 384;
const _c = new THREE.Vector3();

interface TypeLod {
  paint: THREE.InstancedMesh;
  cargo: THREE.InstancedMesh | null;
  glass: THREE.InstancedMesh | null;
  dark: THREE.InstancedMesh | null;
  head: THREE.InstancedMesh | null;
  tail: THREE.InstancedMesh | null;
  /** matrices shared by paint / glass / dark / cargo (every far car of the type) */
  matrices: THREE.InstancedBufferAttribute;
  headMatrices: THREE.InstancedBufferAttribute | null;
  tailMatrices: THREE.InstancedBufferAttribute | null;
  /** position + normal only, all parts together: stand-in for the shadow pass and the AO G-buffer */
  hull: THREE.BufferGeometry;
  n: number; nHead: number; nTail: number;
}

interface CarInfo {
  far: boolean;
  /** frame number (CarLod.frame) in which this car last held one of the capped full-detail slots */
  heldFrame: number;
  /** LOD key: the type, or `type:style` for the non-default body styles (coupe, cab) so the far proxy keeps the silhouette */
  key: string;
  /** builds the pristine full model of this car's body style (set by carModel.ts on the model group), if it has one */
  buildStyled: (() => CarModel) | null;
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
  private near: number;
  private readonly margin: number;
  private readonly maxDamage: number;
  private readonly paintMat: THREE.Material;
  private readonly cargoMat: THREE.Material;
  private readonly glassMat: THREE.Material;
  private readonly darkMat: THREE.Material;
  private readonly lampMat: THREE.MeshBasicMaterial;
  /** number of cars drawn as instances in the last frame (for stats) */
  farCount = 0;
  /** full-detail cars (beyond CAR_CLOSE_DIST) placed so far this frame, and the cap of the current tier */
  private nearCount = 0;
  private nearMax = Infinity;
  /** frame counter, and how many cars held a capped slot last frame that have not been placed yet this frame (their slots stay reserved) */
  private frame = 0;
  private pendingHolders = 0;
  /** Overrides the tier's cap on full-detail cars (tests). */
  setNearMax(n: number): void { this.nearMax = n; this.fixedNearMax = true; }
  private fixedNearMax = false;
  /** Changes the near/far switch distance (quality tier). */
  setNearDist(d: number): void { if (d > 0) this.near = d; }
  private readonly frustum = new THREE.Frustum();
  private readonly viewMatrix = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private viewSet = false;

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
    setGltfMaterials(materials); // licence plates of glTF cars use the game's plate material
    for (const t of opts.exclude ?? []) this.types.set(t, null);
  }

  /**
   * Camera used to skip far cars that are off screen (instances are not frustum culled one by one by the GPU path).
   * Pass the camera of the previous render: the matrices are one frame old, which the 8 m margin in `place` covers.
   */
  setView(camera: THREE.Camera): void {
    this.viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewMatrix);
    this.viewSet = true;
  }

  /** Call once per frame before any `place`. */
  beginFrame(): void {
    for (const t of this.types.values()) if (t) { t.n = 0; t.nHead = 0; t.nTail = 0; }
    this.farCount = 0;
    this.pendingHolders = this.nearCount; // last frame's holders keep their slots; newcomers only fill what is left (no re-sort, no reshuffle)
    this.nearCount = 0;
    this.frame++;
    if (!this.fixedNearMax) this.nearMax = carPaintConfigured() ? tierConfig(carPaintTier()).carNearMax : Infinity;
  }

  /**
   * Decides the level for one car and, when it is far, records its instance. Returns true when the car is drawn as an
   * instance (its object3D is then hidden). `dist` is the distance from the camera in metres.
   */
  place(car: LodCar, x: number, z: number, heading: number, dist: number): boolean {
    let info = this.info.get(car.object3D);
    if (!info) {
      info = { far: false, heldFrame: -2, key: car.spec.type, buildStyled: null, color: this.colorOf(car.spec.color), head: null, tail: null };
      this.bindLamps(car.object3D, info);
      this.bindStyle(car.object3D, car.spec.type, info);
      this.info.set(car.object3D, info);
    }
    const lod = this.typeFor(info.key, car.spec.type, info.buildStyled);
    if (!lod || car.damage > this.maxDamage || lod.n >= CAPACITY) { info.far = false; car.object3D.visible = true; return false; }
    info.far = hysteresisFar(info.far, dist, this.near, this.margin);
    const held = info.heldFrame === this.frame - 1;
    if (held && this.pendingHolders > 0) this.pendingHolders--;
    if (!info.far && dist > CAR_CLOSE_DIST) {
      // tier cap on full-detail cars: a car that held a slot last frame keeps it; a newcomer only takes a slot nobody holds
      // (placement order alone must not decide, or one car crossing a threshold swaps two others every frame)
      const room = held ? this.nearCount < this.nearMax : this.nearCount + this.pendingHolders < this.nearMax;
      if (!room) info.far = true;
    }
    if (!info.far) { if (dist > CAR_CLOSE_DIST) { this.nearCount++; info.heldFrame = this.frame; } car.object3D.visible = true; return false; }
    car.object3D.visible = false;
    if (this.viewSet && !this.frustum.intersectsSphere(this.sphere.set(_c.set(x, 0.9, z), 8))) return true;
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
      if (t.glass) this.commit(t.glass, t.n, t.matrices, false);
      if (t.dark) this.commit(t.dark, t.n, t.matrices, false);
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

  /** Non-default procedural styles (coupe, cab) get their own far proxy, built from the style builder the model carries. */
  private bindStyle(root: THREE.Object3D, type: string, info: CarInfo): void {
    root.traverse((o) => {
      const style = o.userData?.carStyle as string | undefined;
      const build = o.userData?.buildLodModel as (() => CarModel) | undefined;
      if (!style || !build || info.buildStyled) return;
      if (style === 'coupe' || style === 'cab') { info.key = `${type}:${style}`; info.buildStyled = build; }
    });
  }

  private typeFor(key: string, type: string = key, buildStyled: (() => CarModel) | null = null): TypeLod | null {
    if (this.types.has(key)) return this.types.get(key)!;
    if (this.types.has(type) && this.types.get(type) === null) { this.types.set(key, null); return null; } // excluded type
    const gltf = gltfLodFor(type);
    const model = gltf ? null : buildStyled ? buildStyled() : this.opts.buildModel(type);
    const lod = gltf ? this.buildGltf(gltf) : model ? this.build(model) : null;
    this.types.set(key, lod);
    return lod;
  }

  /** Merges a pristine model's meshes into the LOD parts (in model space, rest pose). */
  private build(near: CarModel): TypeLod | null {
    // merged near cars (carModel.ts) rebuild the split one-mesh-per-material structure the far proxies are cut from
    let model = near;
    if (near.farSource) { model = near.farSource(); disposeModel(near); }
    model.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.group.matrixWorld).invert();
    const parts: Record<PartKey, THREE.BufferGeometry[]> = { paint: [], cargo: [], glass: [], dark: [], head: [], tail: [] };
    const tyres: THREE.BufferGeometry[] = [];
    const rel = new THREE.Matrix4();
    model.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const key of Object.keys(PART_NAMES) as PartKey[]) {
        if (!(PART_NAMES[key] as readonly string[]).includes(o.name)) continue;
        rel.multiplyMatrices(inv, mesh.matrixWorld);
        if (o.name === 'tyre') tyres.push(lowPolyTyre(mesh.geometry, rel));
        else parts[key].push(slimGeometry(mesh.geometry, rel));
      }
    });
    if (parts.paint.length === 0) { disposeModel(model); return null; }
    const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
      if (list.length === 0) return null;
      const g = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      return g;
    };
    // far proxy budget (about 1.1 k triangles per car): each part is vertex-clustered down to its share, the wheels are 8-gon discs
    const paintG = shrinkTo(merge(parts.paint), FAR_TRIS.paint)!, cargoG = shrinkTo(merge(parts.cargo), FAR_TRIS.cargo), glassG = shrinkTo(merge(parts.glass), FAR_TRIS.glass);
    const darkG = merge([...(parts.dark.length ? [shrinkTo(merge(parts.dark), FAR_TRIS.dark)!] : []), ...tyres]);
    const headG = merge(parts.head), tailG = merge(parts.tail);
    const hullSrc = [paintG, cargoG, glassG, darkG].filter((g): g is THREE.BufferGeometry => !!g).map((g) => {
      const h = new THREE.BufferGeometry();
      h.setAttribute('position', g.getAttribute('position'));
      h.setAttribute('normal', g.getAttribute('normal'));
      return h;
    });
    const hull = hullSrc.length ? mergeGeometries(hullSrc, false) : null;
    disposeModel(model);
    if (!glassG || !darkG || !hull) return null;

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
      paint: make(paintG, this.paintMat, matrices, false, true),
      cargo: cargoG ? make(cargoG, this.cargoMat, matrices, false, false) : null,
      glass: make(glassG, this.glassMat, matrices, false, false),
      dark: make(darkG, this.darkMat, matrices, false, false),
      head: headG && headMatrices ? make(headG, this.lampMat, headMatrices, false, true) : null,
      tail: tailG && tailMatrices ? make(tailG, this.lampMat, tailMatrices, false, true) : null,
      hull, matrices, headMatrices, tailMatrices, n: 0, nHead: 0, nTail: 0,
    };
  }

  /** The far model of a glTF car: one merged, instance-coloured paint mesh (body + wheels) and lamp meshes. */
  private buildGltf(parts: GltfLodParts): TypeLod {
    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 16), 16);
    matrices.setUsage(THREE.DynamicDrawUsage);
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, attr: THREE.InstancedBufferAttribute, color: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, CAPACITY);
      m.instanceMatrix = attr;
      if (color) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      m.count = 0; m.visible = false; m.frustumCulled = false;
      m.castShadow = false; m.receiveShadow = false;
      m.name = `car-lod:${mat.name || mat.type}`;
      this.group.add(m);
      return m;
    };
    const lampAttr = (): THREE.InstancedBufferAttribute => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 16), 16); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const headMatrices = parts.head ? lampAttr() : null, tailMatrices = parts.tail ? lampAttr() : null;
    return {
      paint: make(parts.body, parts.material, matrices, true),
      cargo: null, glass: null, dark: null,
      head: parts.head && headMatrices ? make(parts.head, this.lampMat, headMatrices, true) : null,
      tail: parts.tail && tailMatrices ? make(parts.tail, this.lampMat, tailMatrices, true) : null,
      hull: parts.hull, matrices, headMatrices, tailMatrices, n: 0, nHead: 0, nTail: 0,
    };
  }

  /** Hull geometry of a car type (built on first use), or null when the type has no LOD model. */
  hullFor(type: string): THREE.BufferGeometry | null {
    return this.typeFor(type)?.hull ?? null;
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

/**
 * A 10-sided cylinder with the bounding box of a tyre geometry (axis = its thinnest dimension). The detailed tyre
 * (tread, sidewall lettering geometry) is several hundred triangles; at LOD distance a ten-gon reads the same.
 */
export function lowPolyTyre(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  if (!src.boundingBox) src.computeBoundingBox();
  const bb = src.boundingBox!;
  const size = bb.getSize(new THREE.Vector3()), centre = bb.getCenter(new THREE.Vector3());
  const dims = [size.x, size.y, size.z];
  const axis = dims.indexOf(Math.min(...dims));
  const others = dims.filter((_, i) => i !== axis);
  const radius = (others[0] + others[1]) / 4;
  const g = new THREE.CylinderGeometry(radius, radius, dims[axis], 8, 1).toNonIndexed(); // axis along y
  if (axis === 0) g.rotateZ(Math.PI / 2);
  else if (axis === 2) g.rotateX(Math.PI / 2);
  g.translate(centre.x, centre.y, centre.z);
  g.applyMatrix4(m);
  return g;
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
