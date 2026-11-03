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
 * Styles: sedan, coupe, SUV, van (box truck), cab (a sedan in taxi yellow: livery paint, roof light) and cop (livery, light
 * bar). The style is picked from the vehicle type, its colour and the plate `variant` (see `styleFor`).
 */
import * as THREE from 'three';
import type { IMaterialLibrary, VehicleSpec, VehicleType } from '@/world/types';
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
  sedan: ['#7f8c8d', '#c0392b', '#1f6f8b', '#ecf0f1'],
  suv: ['#2c3e50', '#27ae60', '#111111', '#95a5a6'],
  boxtruck: ['#e8e8e8', '#d35400', '#2c3e50'],
  cop: ['#f2f2f2', '#f2f2f2'],
};

// ---------------------------------------------------------------- materials owned by the model

let trimMat: THREE.MeshStandardMaterial | null = null;
/** Black plastic and chrome share one material; the colour comes from the geometry's vertex colours. */
const trimMaterial = (): THREE.MeshStandardMaterial =>
  (trimMat ??= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.55, name: 'carTrim' }));

// ---------------------------------------------------------------- wheels

/** Tyre sides: a 10-gon reads round at the 1.6 cm sagitta it leaves on a 0.34 m radius. */
const WHEEL_SEG = 10;
/** Tyre profile, outer half, from the tread centre outwards: [radius / R, axial / w, texture v]. v follows tireSidewallPainter. */
const TYRE_PROFILE: [number, number, number][] = [[1, 0, 0.5], [1, 0.32, 0.44], [0.84, 0.5, 0.2], [0.6, 0.4, 0.05]];

/**
 * One wheel (axle along x, hubcap on the +x face): tyre with sidewall UVs for the 'tireSidewall' texture, plus a dished hubcap
 * whose UVs land on the hubcap band of that same texture, so tyre and wheel are one mesh with one material.
 */
function buildWheel(R: number, w: number): THREE.BufferGeometry {
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
    for (let i = 0; i <= WHEEL_SEG; i++) {
      const th = (i / WHEEL_SEG) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      pos.push(a, r * c, r * s);
      nor.push(na, nr * c, nr * s);
      uv.push(i / WHEEL_SEG, v);
    }
  };
  const stitch = (k0: number): void => {
    const n = WHEEL_SEG + 1;
    for (let i = 0; i < WHEEL_SEG; i++) {
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

function partsFor(style: CarStyle, spec: VehicleSpec): CarParts {
  const key = `${style}|${spec.length}|${spec.width}|${spec.height}`;
  let p = partsCache.get(key);
  if (!p) {
    p = style === 'van' ? buildTruckParts(spec) : buildPassengerParts(style, spec);
    partsCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- public

/**
 * `variant` (0..3) picks the licence plate text so not every car wears BK-STUY, and turns plain sedans into coupes at 3.
 * `style` overrides the automatic choice (the far-car proxies use it to rebuild the exact style).
 */
export function buildCarModel(type: VehicleType, spec: VehicleSpec, materials: IMaterialLibrary, variant = 0, style?: CarStyle): CarModel {
  const st = style ?? styleFor(type, spec.color, variant);
  const parts = partsFor(st, spec);
  const group = new THREE.Group();
  group.name = `car:${type}`;
  group.userData.carStyle = st;
  group.userData.buildLodModel = (): CarModel => buildCarModel(type, spec, materials, 0, st);
  const own: THREE.Material[] = [];
  const paintMeshes: THREE.Mesh[] = [];

  const paintMat = st === 'cop' ? materials.get('copLivery') : st === 'cab' ? materials.get('taxiLivery') : materials.carPaint(spec.color);
  const glassMat = materials.get('carGlass');
  const tyreMat = materials.get('tireSidewall');

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    parent.add(m);
    return m;
  };

  paintMeshes.push(mesh(parts.paint, paintMat, 'body'));
  if (parts.paint2) paintMeshes.push(mesh(parts.paint2, materials.carPaint('#f4f4f4'), 'cargo'));
  mesh(parts.glass, glassMat, 'glass');
  mesh(parts.trim, trimMaterial(), 'trim');

  let hood: THREE.Object3D | undefined;
  if (parts.hood) {
    const pivot = new THREE.Group();
    pivot.name = 'hoodPivot';
    pivot.position.copy(parts.hood.pivot);
    group.add(pivot);
    paintMeshes.push(mesh(parts.hood.geo, paintMat, 'hood', pivot));
    hood = pivot;
  }

  // lights: per-car materials so brake lights / headlights toggle independently; each colour is ONE mesh
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0, roughness: 0.2, metalness: 0.1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.35, metalness: 0.1 });
  own.push(headMat, tailMat);
  const headlights = [mesh(parts.lampHead, headMat, 'headlight')];
  const taillights = [mesh(parts.lampTail, tailMat, 'taillight')];

  // licence plates (both in one mesh)
  mesh(parts.plate, materials.get('plate', variant), 'plate');

  // wheels: steer pivot (front only) -> roll pivot -> tyre + hubcap. The rear pair is one mesh under the left roll pivot.
  const wg = wheelGeos(parts.wheelR, parts.wheelW);
  const wheels: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  for (const w of parts.wheels) {
    const steer = new THREE.Group();
    steer.name = w.front ? 'steerPivot' : 'wheelMount';
    steer.position.set(w.x, parts.wheelR, w.z);
    const roll = new THREE.Group();
    roll.name = 'wheel';
    if (w.front) mesh(w.x < 0 ? wg.left : wg.right, tyreMat, 'tyre', roll);
    else if (w.x < 0) mesh(rearPair(parts.wheelR, parts.wheelW, -2 * w.x), tyreMat, 'tyre', roll);
    steer.add(roll);
    group.add(steer);
    wheels.push(roll);
    if (w.front) steerPivots.push(steer);
  }

  let lightbar: CarModel['lightbar'];
  if (parts.lightbar) {
    const mk = () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.3 });
      own.push(m);
      return m;
    };
    const a = mesh(parts.lightbar.lens, mk(), 'lightbarA');
    a.position.copy(parts.lightbar.a);
    const b = mesh(parts.lightbar.lens, mk(), 'lightbarB');
    b.position.copy(parts.lightbar.b);
    lightbar = { red: a, blue: b };
  }

  return { group, wheels, steerPivots, lightbar, headlights, taillights, hood, paintMeshes, wheelRadius: parts.wheelR, ownMaterials: own, style: st };
}
