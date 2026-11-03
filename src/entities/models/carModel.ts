/**
 * Procedural car models built from lofted hulls.
 *
 * Local frame: forward is -z, +x is the car's right, y up (see core/Math2.ts). Shapes are authored in
 * (u, y) with u the distance along the car (+u = front), so world z = -u.
 *
 * Body: a hull is a stack of closed cross-sections (rings) along the length - tapered nose, hood, A-pillar,
 * roof, C-pillar, trunk - joined into quads with smooth vertex normals. A creased belt line separates the
 * lower body from the greenhouse (which tumbles inward toward the roof), wheel arches are real cut-outs in
 * the lower edge of the rings, and window quads are carved out of the paint hull and re-emitted as glass
 * offset 0.02 m inward. Trim (door seams, window surrounds, grille, mirrors, handles...) is merged per
 * material, so a car is ~35 meshes.
 *
 * Geometry is built once per (type, length, width, height) and cached: every car of a type shares the same
 * BufferGeometry instances. Only light/lightbar materials are created per car, since they are driven
 * individually (brake lights, siren).
 */
import * as THREE from 'three';
import type { IMaterialLibrary, VehicleSpec, VehicleType } from '@/world/types';
import {
  Acc, bx, cylX, inverted, lensGeo, bezelGeo, plateGeo, buildPassengerParts, buildTruckParts, wheelRadiusFor, hullSectionCount,
  type CarParts, type LampDef, type V2,
} from './carBodies';
export { wheelRadiusFor, hullSectionCount };

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
}

// ---------------------------------------------------------------- materials owned by the model

let chromeMat: THREE.MeshStandardMaterial | null = null;
/** Bright polished metal (window surrounds, grille slats, handles, exhaust tip). One shared instance. */
const chromeMaterial = (): THREE.MeshStandardMaterial =>
  (chromeMat ??= new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.2, metalness: 1 }));

let rimMat: THREE.MeshStandardMaterial | null = null;
const rimMaterial = (): THREE.MeshStandardMaterial =>
  (rimMat ??= new THREE.MeshStandardMaterial({ color: 0xaeb4bb, roughness: 0.3, metalness: 0.7 }));

// ---------------------------------------------------------------- wheels

interface WheelGeos { tyre: THREE.BufferGeometry; rim: THREE.BufferGeometry; }
const wheelCache = new Map<string, WheelGeos>();

/** Wheel with the axle along x. `w` is the tread width; the sidewall bulges to ~1.04 w. */
function wheelGeos(R: number, w: number): WheelGeos {
  const key = `${R.toFixed(3)}|${w.toFixed(3)}`;
  let g = wheelCache.get(key);
  if (g) return g;

  // tyre: lathe with a bulging sidewall, rounded shoulders and a flat tread
  const half: V2[] = [[0.6, 0.4], [0.66, 0.46], [0.76, 0.505], [0.87, 0.52], [0.945, 0.46], [0.985, 0.36], [1, 0.22], [1, 0]];
  const prof: THREE.Vector2[] = [];
  for (const [r, a] of half) prof.push(new THREE.Vector2(r * R, -a * w));
  for (let i = half.length - 2; i >= 0; i--) prof.push(new THREE.Vector2(half[i][0] * R, half[i][1] * w));
  const lathe = new THREE.LatheGeometry(prof, 28);
  lathe.rotateZ(Math.PI / 2);
  // the lathe keeps its UVs (u around the ring, v over the profile, tread at v = 0.5) for the 'tireSidewall' texture
  const tyre = new Acc().add(lathe);

  // rim: outer lip rings, five tapered spokes per side and a centre cap
  const rim = new Acc();
  // dark brake discs just behind the spokes, with a small caliper (metal, not tyre rubber)
  rim.add(cylX(R * 0.5, w * 0.06, -w * 0.3, 0, 0, 20));
  rim.add(cylX(R * 0.5, w * 0.06, w * 0.3, 0, 0, 20));
  rim.add(bx(w * 0.2, R * 0.16, R * 0.22, w * 0.3, 0, R * 0.46));
  for (const s of [-1, 1]) {
    const ring = new THREE.RingGeometry(R * 0.56, R * 0.66, 28);
    ring.rotateY(s * (Math.PI / 2));
    ring.translate(s * w * 0.46, 0, 0);
    rim.add(ring);
    const lip = new THREE.CylinderGeometry(R * 0.56, R * 0.585, w * 0.12, 28, 1, true);
    lip.rotateZ(Math.PI / 2);
    lip.translate(s * w * 0.4, 0, 0);
    rim.add(s < 0 ? inverted(lip.clone()) : lip);
    for (let i = 0; i < 5; i++) {
      const sh = new THREE.Shape();
      sh.moveTo(-R * 0.085, R * 0.1);
      sh.lineTo(R * 0.085, R * 0.1);
      sh.lineTo(R * 0.045, R * 0.57);
      sh.lineTo(-R * 0.045, R * 0.57);
      sh.closePath();
      const sp = new THREE.ExtrudeGeometry(sh, { depth: w * 0.1, bevelEnabled: false });
      sp.rotateY(Math.PI / 2); // extrude z -> x
      sp.translate(s * w * 0.3 - (s > 0 ? 0 : w * 0.1), 0, 0);
      sp.rotateX((i / 5) * Math.PI * 2);
      rim.add(sp);
    }
    // centre cap
    const cap = new THREE.CylinderGeometry(R * 0.13, R * 0.15, w * 0.1, 16);
    cap.rotateZ(-s * Math.PI / 2);
    cap.translate(s * w * 0.36, 0, 0);
    rim.add(cap);
  }
  g = { tyre: tyre.merge(), rim: rim.merge() };
  wheelCache.set(key, g);
  return g;
}


const partsCache = new Map<string, CarParts>();

function partsFor(type: VehicleType, spec: VehicleSpec): CarParts {
  const key = `${type}|${spec.length}|${spec.width}|${spec.height}`;
  let p = partsCache.get(key);
  if (!p) {
    p = type === 'boxtruck' ? buildTruckParts(spec) : buildPassengerParts(type, spec);
    partsCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- public

/** `variant` picks the licence plate text (0..3) so not every car wears BK-STUY. */
export function buildCarModel(type: VehicleType, spec: VehicleSpec, materials: IMaterialLibrary, variant = 0): CarModel {
  const parts = partsFor(type, spec);
  const group = new THREE.Group();
  group.name = `car:${type}`;
  const own: THREE.Material[] = [];
  const paintMeshes: THREE.Mesh[] = [];

  const paintMat = type === 'cop' ? materials.get('copLivery') : materials.carPaint(spec.color);
  const glassMat = materials.get('carGlass');
  const trimMat = materials.get('metalDark');
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
  mesh(parts.trim, trimMat, 'trim');
  mesh(parts.chrome, chromeMaterial(), 'chrome');

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
  const lamp = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, d: LampDef): THREE.Mesh => {
    const m = mesh(geo, mat, name);
    m.position.copy(d.pos);
    m.rotation.y = d.yaw;
    return m;
  };
  const headlights = parts.headPos.map((d) => lamp(parts.lampHead, headMat, 'headlight', d));
  const taillights = parts.tailPos.map((d) => lamp(parts.lampTail, tailMat, 'taillight', d));

  // licence plates
  const plateMat = materials.get('plate', variant);
  parts.platePos.forEach((p, i) => {
    const m = mesh(parts.plate, plateMat, i === 0 ? 'plateFront' : 'plateRear');
    m.position.copy(p);
    if (i === 0) m.rotation.y = Math.PI;
  });

  // wheels: steer pivot (front only) -> roll pivot -> tyre + rim
  const wg = wheelGeos(parts.wheelR, parts.wheelW);
  const wheels: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  for (const w of parts.wheels) {
    const steer = new THREE.Group();
    steer.name = w.front ? 'steerPivot' : 'wheelMount';
    steer.position.set(w.x, parts.wheelR, w.z);
    const roll = new THREE.Group();
    roll.name = 'wheel';
    mesh(wg.tyre, tyreMat, 'tyre', roll);
    mesh(wg.rim, rimMaterial(), 'rim', roll);
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

  return { group, wheels, steerPivots, lightbar, headlights, taillights, hood, paintMeshes, wheelRadius: parts.wheelR, ownMaterials: own };
}
