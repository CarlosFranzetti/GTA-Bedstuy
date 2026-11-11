/**
 * WBURG: an original R160-style subway car (stainless body, hand-built, no scanned or licensed model).
 * Car frame: +x is the front, y = 0 at the rail head, z across (doors on both sides, z = +-1.52). 18.4 m x 3.05 m x 3.7 m.
 * Near mesh set (all shared geometry): body (shell, floor, seats, trucks, wheels, roof gear), glass (windows, lit at night),
 * two door sets that slide in opposite directions, front lamps and rear lamps. Far LOD: one box mesh.
 * Budgets (tests/unit/transit): near <= 2500 triangles per car, far <= 300.
 */
import * as THREE from 'three';
import { GeoBuilder, rgb } from './GeoBuilder';
import { CAR_LENGTH } from './ElLine';

export const CAR_WIDTH = 3.05;
export const CAR_HEIGHT = 3.7;
const HALF_W = CAR_WIDTH / 2;
const L2 = CAR_LENGTH / 2;
/** door centres along the car */
export const DOOR_X = [-6.9, -2.3, 2.3, 6.9] as const;
export const DOOR_W = 1.5;
const FLOOR = 1.0;
const ROOF = 3.55;

const STEEL = rgb(0xb9bec4), STEEL_DARK = rgb(0x8d939a), STRIPE = rgb(0x6b3a1e), BLACK = rgb(0x1b1c1f), FLOOR_C = rgb(0x6c6a62), SEAT = rgb(0xc9581f), WHEEL = rgb(0x2a2b2e), ROOF_C = rgb(0x9aa0a6);

function doorEdges(): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  let x = -L2;
  for (const d of DOOR_X) { segs.push([x, d - DOOR_W / 2]); x = d + DOOR_W / 2; }
  segs.push([x, L2]);
  return segs;
}

export interface CarGeometries { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; doorsA: THREE.BufferGeometry; doorsB: THREE.BufferGeometry; lampsFront: THREE.BufferGeometry; lampsRear: THREE.BufferGeometry; far: THREE.BufferGeometry; }

export function buildCarGeometries(): CarGeometries {
  const body = new GeoBuilder(), glass = new GeoBuilder(), dA = new GeoBuilder(), dB = new GeoBuilder(), lf = new GeoBuilder(), lr = new GeoBuilder();
  // floor and roof
  body.box(-L2, FLOOR - 0.12, -HALF_W + 0.06, L2, FLOOR, HALF_W - 0.06, FLOOR_C);
  body.box(-L2, ROOF, -HALF_W + 0.12, L2, ROOF + 0.12, HALF_W - 0.12, ROOF_C);
  body.box(-L2, ROOF - 0.05, -HALF_W + 0.02, L2, ROOF + 0.05, -HALF_W + 0.14, STEEL); // roof edge (rain gutter)
  body.box(-L2, ROOF - 0.05, HALF_W - 0.14, L2, ROOF + 0.05, HALF_W - 0.02, STEEL);
  // end walls with a cab window and a passage door
  for (const s of [-1, 1]) {
    const x = s * (L2 - 0.05);
    body.box(x - 0.05, FLOOR, -HALF_W + 0.06, x + 0.05, ROOF, HALF_W - 0.06, STEEL_DARK, s > 0 ? 'l' : 'r');
  }
  // side walls between the doors, header strips over the doors
  for (const sz of [-1, 1]) {
    const zo = sz * HALF_W, zi = sz * (HALF_W - 0.1);
    const z0 = Math.min(zo, zi), z1 = Math.max(zo, zi);
    for (const [a, b] of doorEdges()) {
      body.box(a, FLOOR - 0.35, z0, b, ROOF, z1, STEEL, sz > 0 ? 'b' : 'f');
      if (b - a > 1.2) {
        const wa = a + 0.35, wb = b - 0.35;
        const zz = sz * (HALF_W + 0.012);
        glass.quad(sz > 0 ? [wa, 1.65, zz] : [wb, 1.65, zz], sz > 0 ? [wb, 1.65, zz] : [wa, 1.65, zz], sz > 0 ? [wb, 2.85, zz] : [wa, 2.85, zz], sz > 0 ? [wa, 2.85, zz] : [wb, 2.85, zz], rgb(0x1d2a33));
      }
    }
    for (const d of DOOR_X) body.box(d - DOOR_W / 2, 2.55, z0, d + DOOR_W / 2, ROOF, z1, STEEL, sz > 0 ? 'b' : 'f'); // header over each door
    // coloured band along the skirt and the window line
    body.box(-L2, 2.9, sz > 0 ? HALF_W : -HALF_W - 0.02, L2, 3.12, sz > 0 ? HALF_W + 0.02 : -HALF_W, STRIPE, sz > 0 ? 'b' : 'f');
    body.box(-L2, 1.2, sz > 0 ? HALF_W : -HALF_W - 0.02, L2, 1.34, sz > 0 ? HALF_W + 0.02 : -HALF_W, STRIPE, sz > 0 ? 'b' : 'f');
    // door leaves: a pair per door, A slides +x, B slides -x (opening 0.75 m each)
    for (const d of DOOR_X) {
      const zl0 = sz * (HALF_W - 0.04), zl1 = sz * (HALF_W + 0.02);
      const lo = Math.min(zl0, zl1), hi = Math.max(zl0, zl1);
      dB.box(d - DOOR_W / 2, FLOOR - 0.3, lo, d - 0.01, 2.6, hi, STEEL_DARK, sz > 0 ? 'b' : 'f');
      dA.box(d + 0.01, FLOOR - 0.3, lo, d + DOOR_W / 2, 2.6, hi, STEEL_DARK, sz > 0 ? 'b' : 'f');
      const zg = sz * (HALF_W + 0.025);
      dB.quad(sz > 0 ? [d - 0.6, 1.7, zg] : [d - 0.1, 1.7, zg], sz > 0 ? [d - 0.1, 1.7, zg] : [d - 0.6, 1.7, zg], sz > 0 ? [d - 0.1, 2.4, zg] : [d - 0.6, 2.4, zg], sz > 0 ? [d - 0.6, 2.4, zg] : [d - 0.1, 2.4, zg], rgb(0x20303a));
      dA.quad(sz > 0 ? [d + 0.1, 1.7, zg] : [d + 0.6, 1.7, zg], sz > 0 ? [d + 0.6, 1.7, zg] : [d + 0.1, 1.7, zg], sz > 0 ? [d + 0.6, 2.4, zg] : [d + 0.1, 2.4, zg], sz > 0 ? [d + 0.1, 2.4, zg] : [d + 0.6, 2.4, zg], rgb(0x20303a));
    }
    // longitudinal benches under the windows (between the doors) with backrests
    for (const [a, b] of doorEdges()) {
      if (b - a < 2) continue;
      body.box(a + 0.15, FLOOR, sz * (HALF_W - 0.8), b - 0.15, FLOOR + 0.45, sz * (HALF_W - 0.12), SEAT);
      body.box(a + 0.15, FLOOR + 0.45, sz * (HALF_W - 0.18), b - 0.15, FLOOR + 0.95, sz * (HALF_W - 0.12), SEAT);
    }
  }
  // interior ceiling light strip
  glass.quad([-L2 + 0.4, ROOF - 0.02, -0.5], [L2 - 0.4, ROOF - 0.02, -0.5], [L2 - 0.4, ROOF - 0.02, 0.5], [-L2 + 0.4, ROOF - 0.02, 0.5], rgb(0xfff2d0));
  // underframe, trucks, wheels
  body.box(-L2 + 1.2, 0.55, -1.15, L2 - 1.2, FLOOR - 0.12, 1.15, BLACK);
  body.box(-3.0, 0.6, -1.3, 3.0, 0.9, 1.3, BLACK);
  for (const tx of [-6.4, 6.4]) {
    body.box(tx - 1.3, 0.38, -1.0, tx + 1.3, 0.62, 1.0, BLACK);
    for (const wx of [-0.9, 0.9]) for (const wz of [-0.72, 0.72]) body.wheel(tx + wx, 0.42, 0.42, wz - 0.06, wz + 0.06, 10, WHEEL);
  }
  // roof gear: four AC units and a vent
  for (const rx of [-6.5, -2.2, 2.2, 6.5]) body.box(rx - 0.8, ROOF + 0.12, -0.7, rx + 0.8, ROOF + 0.45, 0.7, ROOF_C);
  // lamps: white at the front (+x), red at the rear (-x)
  for (const z of [-0.95, 0.95]) {
    lf.box(L2 - 0.02, 1.35, z - 0.14, L2 + 0.06, 1.55, z + 0.14, rgb(0xfff4d8));
    lr.box(-L2 - 0.06, 1.35, z - 0.12, -L2 + 0.02, 1.5, z + 0.12, rgb(0xff3a2a));
  }
  lf.box(L2 - 0.02, 2.65, -0.7, L2 + 0.05, 2.95, 0.7, rgb(0xffb040)); // lit destination roll sign
  // far LOD: a plain box with the band
  const far = new GeoBuilder();
  far.box(-L2, 0.5, -HALF_W, L2, ROOF + 0.1, HALF_W, STEEL);
  far.box(-L2, 2.9, -HALF_W - 0.02, L2, 3.12, HALF_W + 0.02, STRIPE);
  far.box(-L2 + 0.5, 0.2, -1.1, L2 - 0.5, 0.55, 1.1, BLACK);
  return { body: body.build(), glass: glass.build(), doorsA: dA.build(), doorsB: dB.build(), lampsFront: lf.build(), lampsRear: lr.build(), far: far.build() };
}

export interface CarMaterials { body: THREE.Material; glass: THREE.MeshStandardMaterial; door: THREE.Material; lampFront: THREE.MeshStandardMaterial; lampRear: THREE.MeshStandardMaterial; far: THREE.Material; }

/**
 * alphaTest > 0 (every fragment here is opaque, so nothing is cut) keeps the moving cars out of AoProxy's static shadow/AO proxies,
 * which bake the triangles of every depth-writing mesh under world.group once, at their position then.
 */
const MOVING = { alphaTest: 0.0001 } as const;

export function makeCarMaterials(): CarMaterials {
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, ...MOVING, metalness: 0.75, roughness: 0.38, name: 'train:body' });
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, ...MOVING, metalness: 0.1, roughness: 0.2, emissive: new THREE.Color(0xffe8b0), emissiveIntensity: 0.15, name: 'train:glass' });
  const door = new THREE.MeshStandardMaterial({ vertexColors: true, ...MOVING, metalness: 0.7, roughness: 0.4, name: 'train:door' });
  const lampFront = new THREE.MeshStandardMaterial({ vertexColors: true, ...MOVING, emissive: new THREE.Color(0xfff2c8), emissiveIntensity: 0.6, name: 'train:lamp-front' });
  const lampRear = new THREE.MeshStandardMaterial({ vertexColors: true, ...MOVING, emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 0.6, name: 'train:lamp-rear' });
  const far = new THREE.MeshStandardMaterial({ vertexColors: true, ...MOVING, metalness: 0.5, roughness: 0.5, name: 'train:far' });
  return { body, glass, door, lampFront, lampRear, far };
}

export interface TrainCar {
  group: THREE.Group;
  near: THREE.Group;
  far: THREE.Mesh;
  doorsA: THREE.Mesh;
  doorsB: THREE.Mesh;
  lampsFront: THREE.Mesh;
  lampsRear: THREE.Mesh;
}

export function makeCar(geo: CarGeometries, mat: CarMaterials): TrainCar {
  const group = new THREE.Group();
  group.name = 'train-car';
  const near = new THREE.Group();
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, name: string, shadow: boolean): THREE.Mesh => { const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = true; near.add(mesh); return mesh; };
  mk(geo.body, mat.body, 'train:body', true);
  mk(geo.glass, mat.glass, 'train:glass', false);
  const doorsA = mk(geo.doorsA, mat.door, 'train:doors-a', true);
  const doorsB = mk(geo.doorsB, mat.door, 'train:doors-b', true);
  const lampsFront = mk(geo.lampsFront, mat.lampFront, 'train:lamps-front', false);
  const lampsRear = mk(geo.lampsRear, mat.lampRear, 'train:lamps-rear', false);
  lampsFront.visible = false; lampsRear.visible = false;
  const far = new THREE.Mesh(geo.far, mat.far);
  far.name = 'train:far'; far.castShadow = true; far.visible = false;
  group.add(near, far);
  return { group, near, far, doorsA, doorsB, lampsFront, lampsRear };
}
