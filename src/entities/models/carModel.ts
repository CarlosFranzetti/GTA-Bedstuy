/**
 * Procedural car models (the default; the CC0 Kenney glTF cars are opt-in with VITE_GLTF_CARS=1, see gltf/VehicleSource.ts).
 *
 * The bodies are lofted in carBodies.ts (side profile + plan profile + rounded cross-sections, per style); this file turns the
 * cached geometry into a Three.js model. A near car is ~9 draw calls and about 2.5 k triangles:
 *   body paint, hood (a separate pivot so it can lift when the car is wrecked), glass, trim (dark plastic + chrome in one
 *   vertex-coloured mesh), head lamps, tail lamps, plates, and one tyre+hubcap mesh per wheel (the two rear wheels share
 *   a mesh, since they roll together).
 *
 * Geometry is built once per (style, length, width, height) and cached: every car of a style shares the same BufferGeometry
 * instances. Only the lamp and light-bar materials are per car, since they are driven individually (brake lights, siren).
 *
 * NEAR CARS ARE MERGED (CARHI step 1): body paint (+cargo box), glass, 'trim' (dark plastic, chrome, head/tail lamps and the
 * light-bar lenses in ONE vertex-coloured mesh, the lamps lit by a per-car emissive mask), plate, hood pivot and ONE instanced
 * mesh for all four wheels = 6 draws (the van has no hood but a cargo box: also 6). `headlights`, `taillights` and
 * `lightbar` stay in the API as invisible handle meshes whose materials Vehicle drives; the trim mesh reads them every frame.
 * `buildCarModel(..., split = true)` rebuilds the old one-mesh-per-material structure, which CarLod merges into far proxies.
 *
 * Styles: sedan, coupe, SUV, van (box truck), cab (a sedan in taxi yellow: livery paint, roof light) and cop (livery, light
 * bar). The style is picked from the vehicle type, its colour and the plate `variant` (see `styleFor`).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IMaterialLibrary, VehicleSpec, VehicleType } from '@/world/types';
import { Rng } from '@/core/Rng';
import { createCanvas } from '@/textures/canvas';
import { CARGO_LIVERY_H, CARGO_LIVERY_VARIANTS, CARGO_LIVERY_W, cargoLiveryPainter } from '@/textures/painters/vehicle';
import { assignSkinUV, carSkinMaterial, paintBox, skinLayoutFor } from './carSkin';
import { CAR_COLORWAYS, type SkinLayout, type SkinStyle } from '@/textures/painters/vehicleSkin';
import {
  Acc, isTaxiYellow, mirrorX, buildPassengerParts, buildTruckParts, wheelRadiusFor, hullSectionCount,
  type CarParts,
} from './carBodies';
export { wheelRadiusFor, hullSectionCount };

export type CarStyle = 'sedan' | 'coupe' | 'suv' | 'van' | 'cab' | 'cop';

export interface CarModel {
  group: THREE.Group;
  /** every wheel's roll pivot (rotate .x to spin). Front ones sit inside `steerPivots`. */
  wheels: THREE.Object3D[];
  /** front wheel steer pivots (rotate .y to steer) */
  steerPivots: THREE.Object3D[];
  lightbar?: { red: THREE.Mesh; blue: THREE.Mesh };
  headlights: THREE.Mesh[];
  taillights: THREE.Mesh[];
  /** pivot at the cowl, rotate .x > 0 to lift the nose (damage). Absent on trucks. */
  hood?: THREE.Object3D;
  /** meshes that use the body paint (swap material to darken on damage) */
  paintMeshes: THREE.Mesh[];
  wheelRadius: number;
  /** per-car materials the owner must dispose */
  ownMaterials: THREE.Material[];
  style?: CarStyle;
  /** merged near models only: rebuilds the split (one mesh per material) structure that CarLod merges into far proxies */
  farSource?: () => CarModel;
}

/** Body style of a car: type first, then taxi-yellow paint makes a cab, and plate variant 3 of the plain sedans is the coupe. */
export function styleFor(type: VehicleType, color: string, variant = 0): CarStyle {
  if (type === 'cop') return 'cop';
  if (type === 'suv') return 'suv';
  if (type === 'boxtruck') return 'van';
  if (isTaxiYellow(color)) return 'cab';
  return variant === 3 ? 'coupe' : 'sedan';
}

/** Paint variants offered per type (2 to 4 each); the traffic palette may pick from these. The cop and cab have a livery. */
export const PAINT_VARIANTS: Record<VehicleType, readonly string[]> = {
  sedan: CAR_COLORWAYS.sedan.map((c) => c.color),
  suv: CAR_COLORWAYS.suv.map((c) => c.color),
  boxtruck: CAR_COLORWAYS.van.map((c) => c.color),
  cop: ['#f2f2f2', '#f2f2f2'],
};

// ---------------------------------------------------------------- materials owned by the model

let trimMat: THREE.MeshStandardMaterial | null = null;
/** Black plastic and chrome share one material; the colour comes from the geometry's vertex colours. */
const trimMaterial = (): THREE.MeshStandardMaterial =>
  (trimMat ??= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.55, name: 'carTrim' }));

// ---------------------------------------------------------------- cargo box liveries

const liveryMats = new WeakMap<IMaterialLibrary, Map<number, THREE.Material>>();

/**
 * Material of the van's cargo box for a plate variant (0..3): the shared white car paint with the livery canvas as its colour
 * map (variant 0 plain white, 1 produce wholesaler, 2 laundry service, 3 movers). Flat panels: no flake normal or roughness map
 * (they would stretch over the box). Without a DOM (unit tests) it is the plain shared white paint. Cached per library.
 */
export function cargoLiveryMaterial(materials: IMaterialLibrary, variant: number): THREE.Material {
  const base = materials.carPaint('#f4f4f4');
  if (typeof document === 'undefined') return base;
  const v = ((Math.floor(variant) % CARGO_LIVERY_VARIANTS) + CARGO_LIVERY_VARIANTS) % CARGO_LIVERY_VARIANTS;
  let byV = liveryMats.get(materials);
  if (!byV) { byV = new Map(); liveryMats.set(materials, byV); }
  let m = byV.get(v);
  if (!m) {
    const c = createCanvas(CARGO_LIVERY_W, CARGO_LIVERY_H);
    const ctx = c.getContext('2d');
    if (!ctx) return base;
    cargoLiveryPainter(ctx, CARGO_LIVERY_W, CARGO_LIVERY_H, new Rng(`cargoLivery:${v}`), v);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mm = (base as THREE.MeshPhysicalMaterial).clone();
    mm.map = tex; mm.normalMap = null; mm.roughnessMap = null; mm.roughness = 0.5;
    mm.name = `cargoLivery:${v}`;
    mm.needsUpdate = true;
    m = mm;
    byV.set(v, m);
  }
  return m;
}

// ---------------------------------------------------------------- wheels

/** Tyre sides: a 10-gon reads round at the 1.6 cm sagitta it leaves on a 0.34 m radius. */
const WHEEL_SEG = 10;
/** the van's 0.5 m tyres get 12 sides */
const segFor = (R: number): number => (R > 0.45 ? 12 : WHEEL_SEG);
/** Tyre profile, outer half, from the tread centre outwards: [radius / R, axial / w, texture v]. v follows tireSidewallPainter. */
const TYRE_PROFILE: [number, number, number][] = [[1, 0, 0.5], [1, 0.32, 0.44], [0.84, 0.5, 0.2], [0.6, 0.4, 0.05]];

/**
 * One wheel (axle along x, hubcap on the +x face): tyre with sidewall UVs for the 'tireSidewall' texture, plus a dished hubcap
 * whose UVs land on the hubcap band of that same texture, so tyre and wheel are one mesh with one material.
 */
function buildWheel(R: number, w: number): THREE.BufferGeometry {
  const SEG = segFor(R);
  const rings: { a: number; r: number; v: number; nr: number; na: number }[] = [];
  const prof = [...TYRE_PROFILE.slice(1).reverse().map(([r, a, v]) => ({ r, a: -a, v: 1 - v })), ...TYRE_PROFILE.map(([r, a, v]) => ({ r, a, v }))];
  // tread centre appears once: the reversed half stops before it, the forward half starts with it
  for (let k = 0; k < prof.length; k++) {
    const p = prof[k];
    const p0 = prof[Math.max(0, k - 1)];
    const p1 = prof[Math.min(prof.length - 1, k + 1)];
    const ta = (p1.a - p0.a) * w;
    const tr = (p1.r - p0.r) * R;
    const len = Math.hypot(ta, tr) || 1;
    rings.push({ a: p.a * w, r: p.r * R, v: p.v, na: -tr / len, nr: ta / len });
  }
  // hubcap: rim lip -> spoke band -> centre cap, normal +x
  const hub = [
    { a: 0.4 * w, r: 0.6 * R, v: 0.04 },
    { a: 0.36 * w, r: 0.34 * R, v: 0.012 },
    { a: 0.34 * w, r: 0, v: 0 },
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const addRing = (a: number, r: number, v: number, na: number, nr: number): void => {
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      pos.push(a, r * c, r * s);
      nor.push(na, nr * c, nr * s);
      uv.push(i / SEG, v);
    }
  };
  const stitch = (k0: number): void => {
    const n = SEG + 1;
    for (let i = 0; i < SEG; i++) {
      const A = k0 * n + i, B = A + 1, C = (k0 + 1) * n + i, D = C + 1;
      idx.push(A, B, C, B, D, C);
    }
  };
  rings.forEach((rg, k) => { addRing(rg.a, rg.r, rg.v, rg.na, rg.nr); if (k > 0) stitch(k - 1); });
  const base = rings.length;
  hub.forEach((h, k) => { addRing(h.a, h.r, h.v, 1, 0); if (k > 0) stitch(base + k - 1); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

interface WheelGeos {
  /** hubcap on +x (right wheels) */
  right: THREE.BufferGeometry;
  /** hubcap on -x (left wheels) */
  left: THREE.BufferGeometry;
}
const wheelCache = new Map<string, WheelGeos>();
function wheelGeos(R: number, w: number): WheelGeos {
  const key = `${R.toFixed(3)}|${w.toFixed(3)}`;
  let g = wheelCache.get(key);
  if (!g) {
    const right = new Acc().add(buildWheel(R, w)).merge();
    g = { right, left: mirrorX(right) };
    wheelCache.set(key, g);
  }
  return g;
}

/** Both rear wheels as one geometry, left wheel at the origin and the right one `span` along +x (they roll together). */
const rearPairCache = new Map<string, THREE.BufferGeometry>();
function rearPair(R: number, w: number, span: number): THREE.BufferGeometry {
  const key = `${R.toFixed(3)}|${w.toFixed(3)}|${span.toFixed(3)}`;
  let g = rearPairCache.get(key);
  if (!g) {
    const wg = wheelGeos(R, w);
    g = new Acc().add(wg.left.clone()).add(wg.right.clone().translate(span, 0, 0)).merge();
    rearPairCache.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------- per-style parts (cached)

const partsCache = new Map<string, CarParts>();
const layoutCache = new Map<string, SkinLayout>();

/** The body styles that wear a baked skin (the cab and the cop car have their own livery maps on the regular UV set). */
const SKINNED: ReadonlySet<CarStyle> = new Set<CarStyle>(['sedan', 'coupe', 'suv', 'van']);

function partsFor(style: CarStyle, spec: VehicleSpec): CarParts {
  const key = `${style}|${spec.length}|${spec.width}|${spec.height}`;
  let p = partsCache.get(key);
  if (!p) {
    p = style === 'van' ? buildTruckParts(spec) : buildPassengerParts(style, spec);
    if (SKINNED.has(style)) {
      // second UV set for the skin atlas (the regular uv stays untouched: dirt-map fallback, far-car proxies)
      const box = paintBox(p.paint);
      assignSkinUV(p.paint, box);
      if (p.hood) assignSkinUV(p.hood.geo, box, p.hood.pivot);
      layoutCache.set(key, skinLayoutFor(style as SkinStyle, box));
    }
    partsCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- merged near car: details mesh + wheel set

/** `carKind` vertex attribute of the details mesh. */
const KIND_TRIM = 0, KIND_HEAD = 1, KIND_TAIL = 2, KIND_BAR_A = 3, KIND_BAR_B = 4;

const detailsCache = new WeakMap<CarParts, THREE.BufferGeometry>();
/** Trim + head lamps + tail lamps + light-bar lenses as ONE geometry: position, normal, uv, colour and a `carKind` tag. */
function detailsGeo(parts: CarParts): THREE.BufferGeometry {
  let out = detailsCache.get(parts);
  if (out) return out;
  const list: THREE.BufferGeometry[] = [];
  const prep = (src: THREE.BufferGeometry, kind: number, color?: number, at?: THREE.Vector3): void => {
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    if (at) g.translate(at.x, at.y, at.z);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (color !== undefined || !g.attributes.color) {
      const c = new THREE.Color(color ?? 0xffffff);
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    g.setAttribute('carKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    list.push(g);
  };
  prep(parts.trim, KIND_TRIM);
  prep(parts.lampHead, KIND_HEAD, 0xffffff);
  prep(parts.lampTail, KIND_TAIL, 0x7a1010);
  if (parts.lightbar) {
    prep(parts.lightbar.lens, KIND_BAR_A, 0x202020, parts.lightbar.a);
    prep(parts.lightbar.lens, KIND_BAR_B, 0x202020, parts.lightbar.b);
  }
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!merged) throw new Error('carModel: details merge failed');
  detailsCache.set(parts, out = merged);
  return out;
}

/** Lamp state of one car, read by the details shader. Values are emissive colour x intensity (linear). */
interface LampUniforms { uHead: { value: THREE.Color }; uTail: { value: THREE.Color }; uBarA: { value: THREE.Color }; uBarB: { value: THREE.Color } }

/** Details material (one per car, since the lamp uniforms are per car; all share one compiled program). */
function detailsMaterial(u: LampUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.55, name: 'carDetails' });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float carKind;\nvarying float vKind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = carKind;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKind;\nuniform vec3 uHead;\nuniform vec3 uTail;\nuniform vec3 uBarA;\nuniform vec3 uBarB;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vKind > 0.5) roughnessFactor = vKind < 1.5 ? 0.2 : vKind < 2.5 ? 0.35 : 0.3;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (vKind > 0.5) metalnessFactor = vKind < 2.5 ? 0.1 : 0.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vKind < 0.5 ? vec3(0.0) : vKind < 1.5 ? uHead : vKind < 2.5 ? uTail : vKind < 3.5 ? uBarA : vKind < 4.5 ? uBarB : vec3(0.0);');
  };
  m.customProgramCacheKey = () => 'carDetails';
  return m;
}

/** 180 degrees about y: puts the +x hubcap of the shared wheel geometry on the -x face for the left wheels. */
const FLIP_Y = new THREE.Matrix4().makeRotationY(Math.PI);

/**
 * All four wheels as one InstancedMesh. The pivots (steer -> roll) stay as plain Object3Ds so Vehicle keeps rotating
 * `wheels[i].rotation.x` and `steerPivots[i].rotation.y`; the instance matrices are recomposed from them in updateMatrixWorld.
 */
class WheelSet extends THREE.InstancedMesh {
  private readonly last: number[];
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private readonly rigs: { steer: THREE.Object3D; roll: THREE.Object3D; left: boolean }[]) {
    super(geo, mat, rigs.length);
    this.name = 'tyre';
    this.last = rigs.map(() => NaN);
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sync(true);
    this.computeBoundingSphere();
  }
  private sync(force: boolean): void {
    const m = new THREE.Matrix4();
    let dirty = false;
    this.rigs.forEach((r, i) => {
      const key = r.roll.rotation.x * 7.3 + r.steer.rotation.y;
      if (!force && key === this.last[i]) return;
      this.last[i] = key;
      r.steer.updateMatrix(); r.roll.updateMatrix();
      m.multiplyMatrices(r.steer.matrix, r.roll.matrix);
      if (r.left) m.multiply(FLIP_Y);
      this.setMatrixAt(i, m);
      dirty = true;
    });
    if (dirty) this.instanceMatrix.needsUpdate = true;
  }
  override updateMatrixWorld(force?: boolean): void {
    this.sync(false);
    super.updateMatrixWorld(force);
  }
}

const NO_GEO = new THREE.BufferGeometry();

// ---------------------------------------------------------------- public

/**
 * `variant` (0..3) picks the licence plate text so not every car wears BK-STUY, and turns plain sedans into coupes at 3.
 * `style` overrides the automatic choice (the far-car proxies use it to rebuild the exact style).
 */
export function buildCarModel(type: VehicleType, spec: VehicleSpec, materials: IMaterialLibrary, variant = 0, style?: CarStyle, split = false): CarModel {
  const st = style ?? styleFor(type, spec.color, variant);
  const parts = partsFor(st, spec);
  const group = new THREE.Group();
  group.name = `car:${type}`;
  group.userData.carStyle = st;
  group.userData.carVariant = variant;
  group.userData.buildLodModel = (): CarModel => buildCarModel(type, spec, materials, variant, st, true);
  const own: THREE.Material[] = [];
  const paintMeshes: THREE.Mesh[] = [];

  const layout = layoutCache.get(`${st}|${spec.length}|${spec.width}|${spec.height}`);
  const paintMat = st === 'cop' ? materials.get('copLivery') : st === 'cab' ? materials.get('taxiLivery')
    : layout ? carSkinMaterial(materials, st as SkinStyle, spec.color, layout) : materials.carPaint(spec.color);
  const glassMat = materials.get('carGlass');
  const tyreMat = materials.get('tireSidewall');

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    parent.add(m);
    return m;
  };

  paintMeshes.push(mesh(parts.paint, paintMat, 'body'));
  if (parts.paint2) paintMeshes.push(mesh(parts.paint2, cargoLiveryMaterial(materials, variant), 'cargo'));
  mesh(parts.glass, glassMat, 'glass');
  if (split) mesh(parts.trim, trimMaterial(), 'trim');

  let hood: THREE.Object3D | undefined;
  if (parts.hood) {
    const pivot = new THREE.Group();
    pivot.name = 'hoodPivot';
    pivot.position.copy(parts.hood.pivot);
    group.add(pivot);
    paintMeshes.push(mesh(parts.hood.geo, paintMat, 'hood', pivot));
    hood = pivot;
  }

  // lights: per-car materials so brake lights / headlights toggle independently
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0, roughness: 0.2, metalness: 0.1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.35, metalness: 0.1 });
  own.push(headMat, tailMat);
  let headlights: THREE.Mesh[], taillights: THREE.Mesh[];
  const handle = (mat: THREE.Material, name: string): THREE.Mesh => {
    // merged cars: an invisible, empty mesh that carries the lamp material Vehicle and CarLod drive (it never draws)
    const h = new THREE.Mesh(NO_GEO, mat);
    h.name = name; h.visible = false; h.frustumCulled = false;
    group.add(h);
    return h;
  };
  if (split) {
    headlights = [mesh(parts.lampHead, headMat, 'headlight')];
    taillights = [mesh(parts.lampTail, tailMat, 'taillight')];
  } else {
    headlights = [handle(headMat, 'headlight')];
    taillights = [handle(tailMat, 'taillight')];
  }

  // licence plates (both in one mesh)
  mesh(parts.plate, materials.get('plate', variant), 'plate');

  // wheels: steer pivot (front only) -> roll pivot -> (split) tyre + hubcap; the rear pair is one mesh under the left roll pivot
  const wg = wheelGeos(parts.wheelR, parts.wheelW);
  const wheels: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  const rigs: { steer: THREE.Object3D; roll: THREE.Object3D; left: boolean }[] = [];
  for (const w of parts.wheels) {
    const steer = new THREE.Group();
    steer.name = w.front ? 'steerPivot' : 'wheelMount';
    steer.position.set(w.x, parts.wheelR, w.z);
    const roll = new THREE.Group();
    roll.name = 'wheel';
    if (split) {
      if (w.front) mesh(w.x < 0 ? wg.left : wg.right, tyreMat, 'tyre', roll);
      else if (w.x < 0) mesh(rearPair(parts.wheelR, parts.wheelW, -2 * w.x), tyreMat, 'tyre', roll);
    }
    steer.add(roll);
    group.add(steer);
    wheels.push(roll);
    rigs.push({ steer, roll, left: w.x < 0 });
    if (w.front) steerPivots.push(steer);
  }

  let lightbar: CarModel['lightbar'];
  if (parts.lightbar) {
    const mk = () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.3 });
      own.push(m);
      return m;
    };
    if (split) {
      const a = mesh(parts.lightbar.lens, mk(), 'lightbarA');
      a.position.copy(parts.lightbar.a);
      const b = mesh(parts.lightbar.lens, mk(), 'lightbarB');
      b.position.copy(parts.lightbar.b);
      lightbar = { red: a, blue: b };
    } else {
      lightbar = { red: handle(mk(), 'lightbarA'), blue: handle(mk(), 'lightbarB') };
    }
  }

  let farSource: (() => CarModel) | undefined;
  if (!split) {
    const u: LampUniforms = { uHead: { value: new THREE.Color(0, 0, 0) }, uTail: { value: new THREE.Color(0, 0, 0) }, uBarA: { value: new THREE.Color(0, 0, 0) }, uBarB: { value: new THREE.Color(0, 0, 0) } };
    const dm = detailsMaterial(u);
    own.push(dm);
    const details = mesh(detailsGeo(parts), dm, 'trim');
    const barA = lightbar ? (lightbar.red.material as THREE.MeshStandardMaterial) : null;
    const barB = lightbar ? (lightbar.blue.material as THREE.MeshStandardMaterial) : null;
    const lit = (m: THREE.MeshStandardMaterial, out: THREE.Color): void => {
      out.copy(m.emissive).multiplyScalar(m.emissiveIntensity);
    };
    details.onBeforeRender = () => {
      lit(headMat, u.uHead.value); lit(tailMat, u.uTail.value);
      if (barA && barB) { lit(barA, u.uBarA.value); lit(barB, u.uBarB.value); }
    };
    group.add(new WheelSet(wg.right, tyreMat, rigs));
    farSource = () => buildCarModel(type, spec, materials, variant, st, true);
  }

  return { group, wheels, steerPivots, lightbar, headlights, taillights, hood, paintMeshes, wheelRadius: parts.wheelR, ownMaterials: own, style: st, farSource };
}
