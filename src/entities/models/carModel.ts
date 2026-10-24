/**
 * Procedural low-poly car models built from a side-profile silhouette.
 *
 * Local frame: forward is -z, +x is the car's right, y up (see core/Math2.ts). Profiles are authored in
 * (u, y) where u is the distance along the car (+u = front) and extruded across the width, so
 * world z = -u. All dimensions derive from spec.length / width / height so the physics OBB still matches.
 *
 * Geometry is built once per (type, length, width, height) and cached: every car of a type shares the same
 * BufferGeometry instances (small details are merged per material). Only light/lightbar materials are
 * created per car, since they are driven individually (brake lights, siren).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { IMaterialLibrary, VehicleSpec, VehicleType } from '@/world/types';

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

type P = [number, number];

// ---------------------------------------------------------------- geometry helpers

class Acc {
  private readonly geos: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry): this {
    this.geos.push(g.index ? g.toNonIndexed() : g);
    return this;
  }
  merge(): THREE.BufferGeometry {
    const m = mergeGeometries(this.geos, false);
    if (!m) throw new Error('carModel: merge failed');
    for (const g of this.geos) g.dispose();
    return m;
  }
}

function bx(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

/** Cylinder along the x axis. */
function cylX(r: number, len: number, x: number, y: number, z: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Cylinder along the z axis. */
function cylZ(r: number, len: number, x: number, y: number, z: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Extrude a (u, y) profile across `width` (centred on x = 0), with soft bevelled edges. */
function extrudeProfile(pts: P[], width: number, bs = 0.06, bt = 0.05, segs = 2): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
  const depth = Math.max(0.01, width - 2 * bt);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: bs, bevelThickness: bt, bevelSegments: segs, steps: 1, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2); // shape x -> world -z... (u -> z = -u), extrude z -> world x
  return g;
}

/** Thin tilted box lying in the (u, y) plane from (u0,y0) to (u1,y1). */
function slab(u0: number, y0: number, u1: number, y1: number, thick: number, width: number, x = 0): THREE.BufferGeometry {
  const du = u1 - u0;
  const dy = y1 - y0;
  const g = new THREE.BoxGeometry(width, Math.hypot(du, dy), thick);
  g.rotateX(Math.atan2(-du, dy));
  g.translate(x, (y0 + y1) / 2, -(u0 + u1) / 2);
  return g;
}

/** Plan-view rounded bumper (extruded vertically). Front edge faces -z. Centred in x, back edge at z = 0. */
function bumperGeo(width: number, depth: number, height: number, y: number, z: number, rear: boolean): THREE.BufferGeometry {
  const r = Math.min(0.14, depth * 0.8);
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, depth - r);
  s.quadraticCurveTo(width / 2, depth, width / 2 - r, depth);
  s.lineTo(-width / 2 + r, depth);
  s.quadraticCurveTo(-width / 2, depth, -width / 2, depth - r);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: height - 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 4,
  });
  g.translate(0, 0, 0.02);
  g.rotateX(-Math.PI / 2); // shape y -> world -z (forward), extrude z -> world y
  if (rear) g.rotateY(Math.PI);
  g.translate(0, y - height / 2, z);
  return g;
}

/** Arch (wheel-well cut-out) points on the bottom edge, left to right (increasing u). */
function archPoints(uc: number, R: number, ra: number, sill: number): P[] {
  const phiS = Math.asin(Math.max(-1, Math.min(1, (sill - R) / ra)));
  const a0 = Math.PI - phiS;
  const n = 8;
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const phi = a0 + (phiS - a0) * (i / n);
    pts.push([uc + ra * Math.cos(phi), R + ra * Math.sin(phi)]);
  }
  return pts;
}

// ---------------------------------------------------------------- wheels

interface WheelGeos { tyre: THREE.BufferGeometry; rim: THREE.BufferGeometry; }
const wheelCache = new Map<string, WheelGeos>();

function wheelGeos(R: number, w: number): WheelGeos {
  const key = `${R.toFixed(3)}|${w.toFixed(3)}`;
  let g = wheelCache.get(key);
  if (g) return g;

  // tyre: lathe profile with a rounded shoulder, plus a dark brake disc visible between the spokes
  const prof: THREE.Vector2[] = [
    new THREE.Vector2(R * 0.6, -w / 2),
    new THREE.Vector2(R * 0.9, -w / 2),
    new THREE.Vector2(R * 0.985, -w * 0.36),
    new THREE.Vector2(R, -w * 0.16),
    new THREE.Vector2(R, w * 0.16),
    new THREE.Vector2(R * 0.985, w * 0.36),
    new THREE.Vector2(R * 0.9, w / 2),
    new THREE.Vector2(R * 0.6, w / 2),
  ];
  const lathe = new THREE.LatheGeometry(prof, 16);
  lathe.rotateZ(Math.PI / 2);
  const disc = cylX(R * 0.5, w * 0.5, 0, 0, 0, 12);
  const tyre = new Acc().add(lathe).add(disc).merge();

  // rim: two annular faces, a hub and five spokes
  const rim = new Acc();
  for (const s of [-1, 1]) {
    const ring = new THREE.RingGeometry(R * 0.42, R * 0.62, 16);
    ring.rotateY(s * (Math.PI / 2));
    ring.translate(s * w * 0.495, 0, 0);
    rim.add(ring);
  }
  rim.add(cylX(R * 0.16, w * 0.92, 0, 0, 0, 10));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(w * 0.86, R * 0.12, R * 0.5);
    spoke.translate(0, 0, -R * 0.33);
    spoke.rotateX(a);
    rim.add(spoke);
  }
  g = { tyre, rim: rim.merge() };
  wheelCache.set(key, g);
  return g;
}

let rimMat: THREE.MeshStandardMaterial | null = null;
const rimMaterial = (): THREE.MeshStandardMaterial =>
  (rimMat ??= new THREE.MeshStandardMaterial({ color: 0xaeb4bb, roughness: 0.35, metalness: 0.5 }));

// ---------------------------------------------------------------- per-type parts (cached)

interface CarParts {
  paint: THREE.BufferGeometry;
  /** truck cargo box (white paint) */
  paint2?: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  hood?: { geo: THREE.BufferGeometry; pivot: THREE.Vector3 };
  lampHead: THREE.BufferGeometry;
  lampTail: THREE.BufferGeometry;
  headPos: THREE.Vector3[];
  tailPos: THREE.Vector3[];
  plate: THREE.BufferGeometry;
  platePos: THREE.Vector3[];
  wheels: { x: number; z: number; front: boolean }[];
  wheelR: number;
  wheelW: number;
  lightbar?: { lens: THREE.BufferGeometry; a: THREE.Vector3; b: THREE.Vector3 };
}

const partsCache = new Map<string, CarParts>();

interface Style {
  sill: number; wheelR: number; wheelW: number;
  hoodF: number; cowl: number; belt: number; deck: number; tail: number; // fractions of H
  uCowl: number; wsTop: number; roofRear: number; rearBase: number;     // fractions of L
  axleF: number; axleR: number;
  seams: number[]; pillars: number[];
  rails: boolean;
}

const STYLES: Record<'sedan' | 'suv', Style> = {
  sedan: {
    sill: 0.2, wheelR: 0.34, wheelW: 0.25,
    hoodF: 0.6, cowl: 0.67, belt: 0.69, deck: 0.7, tail: 0.64,
    uCowl: 0.19, wsTop: 0.03, roofRear: -0.17, rearBase: -0.31,
    axleF: 0.31, axleR: -0.31,
    seams: [0.17, -0.04, -0.22], pillars: [-0.04],
    rails: false,
  },
  suv: {
    sill: 0.3, wheelR: 0.38, wheelW: 0.28,
    hoodF: 0.56, cowl: 0.62, belt: 0.64, deck: 0.66, tail: 0.66,
    uCowl: 0.2, wsTop: 0.1, roofRear: -0.4, rearBase: -0.44,
    axleF: 0.31, axleR: -0.31,
    seams: [0.2, -0.02, -0.24], pillars: [-0.02, -0.3],
    rails: true,
  },
};

export function wheelRadiusFor(type: VehicleType): number {
  return type === 'boxtruck' ? 0.5 : type === 'suv' ? STYLES.suv.wheelR : STYLES.sedan.wheelR;
}

function v3(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(x, y, z); }

function lampBox(w: number, h: number, d: number): THREE.BufferGeometry { return new THREE.BoxGeometry(w, h, d); }

function plateGeo(): THREE.BufferGeometry { return new THREE.PlaneGeometry(0.34, 0.17); }

/** Re-map UVs so the cop livery lays out once along the car's length (text reads correctly on both flanks). */
function liveryUV(g: THREE.BufferGeometry, L: number): void {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const left = nor.getX(i) < 0;
    const uu = left ? (z + L / 2) / L : (-z + L / 2) / L;
    const vv = THREE.MathUtils.clamp(0.34 + (pos.getY(i) - 0.42) * 0.88, 0.03, 0.97);
    uv.setXY(i, uu, vv);
  }
  uv.needsUpdate = true;
}

function buildPassengerParts(type: 'sedan' | 'suv' | 'cop', spec: VehicleSpec): CarParts {
  const st = STYLES[type === 'suv' ? 'suv' : 'sedan'];
  const { length: L, width: W, height: H } = spec;
  const R = st.wheelR;
  const Wb = W - 0.08;           // body flank width
  const Wg = Wb - 0.3;           // greenhouse width (tumblehome)
  const uN = L / 2 - 0.14;       // nominal nose / tail (bevel + bumper bring it to L/2)
  const ra = R + 0.11;           // arch radius (bevel eats 0.06)
  const belt = st.belt * H;
  const roofY = H - 0.07;

  // ---- lower body profile (counter-clockwise: bottom going forward, then back along the top)
  const prof: P[] = [[-uN, st.sill]];
  prof.push(...archPoints(st.axleR * L, R, ra, st.sill));
  prof.push(...archPoints(st.axleF * L, R, ra, st.sill));
  prof.push(
    [uN, st.sill],
    [uN, st.hoodF * H - 0.1],
    [uN - 0.1, st.hoodF * H],
    [st.uCowl * L, st.cowl * H],
    [st.uCowl * L - 0.25, belt],
    [st.rearBase * L, st.deck * H],
    [-uN + 0.2, st.deck * H],
    [-uN, st.tail * H],
  );
  const body = extrudeProfile(prof, Wb);

  const paint = new Acc().add(body);
  const glass = new Acc();
  const trim = new Acc();

  // ---- greenhouse (dark glass) + roof panel + pillars
  const gh: P[] = [
    [st.uCowl * L + 0.05, belt - 0.08],
    [st.wsTop * L, roofY],
    [st.roofRear * L, roofY],
    [st.rearBase * L, st.deck * H - 0.04],
  ];
  glass.add(extrudeProfile(gh, Wg, 0.03, 0.03, 1));
  const roofF = st.wsTop * L + 0.04;
  const roofR = st.roofRear * L - 0.03;
  paint.add(extrudeProfile([[roofR, H - 0.06], [roofF, H - 0.06], [roofF, H - 0.025], [roofR, H - 0.025]], Wg + 0.04, 0.02, 0.02, 1));
  for (const pu of st.pillars) {
    paint.add(bx(Wg + 0.03, H - 0.05 - belt, 0.09, 0, (belt + H - 0.05) / 2, -(pu * L)));
  }

  // ---- mirrors
  for (const s of [-1, 1]) {
    paint.add(bx(0.12, 0.09, 0.14, s * (Wb / 2 + 0.03), belt + 0.12, -(st.uCowl * L - 0.06)));
  }

  // ---- bumpers (dark plastic), grille, underbody, exhaust
  const bumperH = 0.3;
  const bumperY = st.sill + 0.13;
  trim.add(bumperGeo(Wb - 0.02, 0.22, bumperH, bumperY, -(L / 2 - 0.22), false));
  trim.add(bumperGeo(Wb - 0.02, 0.22, bumperH, bumperY, L / 2 - 0.22, true));
  const noseY = st.hoodF * H;
  trim.add(bx(Wb * 0.5, 0.13, 0.05, 0, noseY - 0.17, -(L / 2 - 0.07)));
  trim.add(bx(Wb * 0.5, 0.03, 0.05, 0, noseY - 0.3, -(L / 2 - 0.07)));
  trim.add(bx(Wb - 0.2, 0.16, L - 0.7, 0, st.sill + 0.02, 0));
  trim.add(cylZ(0.04, 0.16, Wb / 2 - 0.4, st.sill + 0.04, L / 2 - 0.12));
  // dark wheel wells so the arches never show through to the sky / far side
  const wellHalf = W / 2 - 0.02 - st.wheelW - 0.01;
  for (const axle of [st.axleF * L, st.axleR * L]) {
    trim.add(bx(wellHalf * 2, ra - 0.1, 2 * ra - 0.06, 0, (R + R + ra - 0.1) / 2, -axle));
  }

  // ---- door seams and handles
  for (const s of [-1, 1]) {
    for (const su of st.seams) {
      const u = su * L;
      let bottom = st.sill + 0.22;
      for (const axle of [st.axleF * L, st.axleR * L]) {
        const du = Math.abs(u - axle);
        if (du < ra + 0.04) bottom = Math.max(bottom, R + Math.sqrt(Math.max(0, ra * ra - du * du)) + 0.04);
      }
      const top = belt + 0.04;
      trim.add(bx(0.014, top - bottom, 0.014, s * (Wb / 2 + 0.004), (top + bottom) / 2, -u));
    }
    for (const su of [st.seams[1], st.seams[2]]) {
      trim.add(bx(0.03, 0.03, 0.15, s * (Wb / 2 + 0.012), belt - 0.07, -(su * L + 0.16)));
    }
    // rocker line
    trim.add(bx(0.016, 0.02, (st.axleF - st.axleR) * L - 2 * ra - 0.1, s * (Wb / 2 + 0.004), st.sill + 0.22, 0));
  }

  // ---- roof rails (SUV) / antenna (others)
  if (st.rails) {
    const railLen = (st.wsTop - st.roofRear) * L - 0.1;
    const cz = -((st.wsTop + st.roofRear) / 2) * L;
    for (const s of [-1, 1]) {
      const x = s * (Wg / 2 - 0.05);
      trim.add(bx(0.045, 0.04, railLen, x, H + 0.02, cz));
      for (const f of [-0.42, 0.42]) trim.add(bx(0.04, 0.05, 0.05, x, H - 0.005, cz + f * railLen));
    }
    for (const f of [-0.25, 0.25]) trim.add(bx(Wg - 0.08, 0.035, 0.04, 0, H + 0.04, cz + f * railLen));
  } else if (type !== 'cop') {
    trim.add(new THREE.CylinderGeometry(0.01, 0.014, 0.18, 5).translate(0.55, H + 0.06, -(st.rearBase * L + 0.2)));
  }

  const copBarZ = -((st.wsTop + st.roofRear) / 2) * L;
  if (type === 'cop') {
    // push bar on the nose, lightbar base on the roof
    for (const s of [-1, 1]) trim.add(bx(0.05, 0.42, 0.05, s * 0.5, 0.52, -(L / 2 + 0.035)));
    trim.add(bx(1.05, 0.05, 0.05, 0, 0.7, -(L / 2 + 0.035)));
    trim.add(bx(1.05, 0.05, 0.05, 0, 0.36, -(L / 2 + 0.035)));
    trim.add(bx(1.1, 0.05, 0.34, 0, H + 0.01, copBarZ));
    trim.add(bx(1.14, 0.015, 0.02, 0, H + 0.165, copBarZ));
  }

  // ---- hood panel (separate so it can lift when damaged)
  const uc = st.uCowl * L;
  const un = uN - 0.1;
  const yc = st.cowl * H + 0.06;
  const yf = st.hoodF * H + 0.06;
  const hoodGeo = extrudeProfile([[uc, yc], [un, yf], [un, yf + 0.03], [uc, yc + 0.03]], Wb - 0.25, 0.012, 0.012, 1);
  hoodGeo.translate(0, -yc, uc);

  // ---- lights
  const lampY = noseY - 0.1;
  const lx = Wb / 2 - 0.3;
  const headPos = [v3(-lx, lampY, -(L / 2 - 0.07)), v3(lx, lampY, -(L / 2 - 0.07))];
  const tailY = st.tail * H - 0.12;
  const tailPos = [v3(-lx, tailY, L / 2 - 0.07), v3(lx, tailY, L / 2 - 0.07)];

  const parts: CarParts = {
    paint: paint.merge(),
    glass: glass.merge(),
    trim: trim.merge(),
    hood: { geo: hoodGeo, pivot: v3(0, yc, -uc) },
    lampHead: lampBox(0.3, 0.11, 0.06),
    lampTail: lampBox(0.34, 0.1, 0.06),
    headPos,
    tailPos,
    plate: plateGeo(),
    platePos: [v3(0, st.sill + 0.34, -(L / 2 + 0.002)), v3(0, st.sill + 0.34, L / 2 + 0.002)],
    wheels: [],
    wheelR: R,
    wheelW: st.wheelW,
  };
  const wx = W / 2 - 0.02 - st.wheelW / 2;
  for (const s of [-1, 1]) {
    parts.wheels.push({ x: s * wx, z: -(st.axleF * L), front: true });
    parts.wheels.push({ x: s * wx, z: -(st.axleR * L), front: false });
  }

  if (type === 'cop') {
    parts.lightbar = { lens: new THREE.BoxGeometry(0.52, 0.1, 0.28), a: v3(-0.29, H + 0.075, copBarZ), b: v3(0.29, H + 0.075, copBarZ) };
    liveryUV(parts.paint, L);
    liveryUV(parts.hood!.geo, L);
  }
  return parts;
}

function buildTruckParts(spec: VehicleSpec): CarParts {
  const { length: L, width: W, height: H } = spec;
  const R = 0.5;
  const ww = 0.3;
  const Wc = W - 0.12;           // cab width
  const Wcg = W - 0.04;          // cargo width
  const uF = L / 2 - 0.12;       // cab nominal front
  const uB = L / 2 - 2.2;        // cab nominal back
  const axleF = L / 2 - 1.0;
  const axleR = -L / 2 + 1.35;
  const sill = 0.7;
  const ra = R + 0.11;

  const paint = new Acc();
  const paint2 = new Acc();
  const glass = new Acc();
  const trim = new Acc();

  // cab
  const cab: P[] = [[uB, sill]];
  cab.push(...archPoints(axleF, R, ra, sill));
  cab.push(
    [uF, sill],
    [uF, 1.55],
    [uF - 0.28, 2.62],
    [uF - 0.45, 2.74],
    [uB + 0.1, 2.74],
    [uB, 2.6],
  );
  paint.add(extrudeProfile(cab, Wc));

  // cargo box
  const cargoBack = -L / 2 + 0.06;
  const cargoFront = uB - 0.1;
  paint2.add(extrudeProfile([[cargoBack, 1.16], [cargoFront, 1.16], [cargoFront, H - 0.06], [cargoBack, H - 0.06]], W - 0.04));

  // mirrors on stalks
  for (const s of [-1, 1]) {
    paint.add(bx(0.1, 0.4, 0.16, s * (Wc / 2 + 0.05), 2.0, -(uF - 0.5)));
    trim.add(bx(0.1, 0.03, 0.03, s * (Wc / 2 - 0.01), 2.15, -(uF - 0.5)));
  }

  // windshield + side windows
  const out = (u0: number, y0: number, u1: number, y1: number, off: number): [number, number, number, number] => {
    const len = Math.hypot(u1 - u0, y1 - y0);
    const nu = (y1 - y0) / len;
    const ny = -(u1 - u0) / len;
    return [u0 + nu * off, y0 + ny * off, u1 + nu * off, y1 + ny * off];
  };
  const ws = out(uF, 1.62, uF - 0.27, 2.58, 0.07);
  glass.add(slab(ws[0], ws[1], ws[2], ws[3], 0.03, Wc - 0.2));
  for (const s of [-1, 1]) {
    glass.add(bx(0.03, 0.78, 0.95, s * (Wc / 2 + 0.065), 2.1, -(uF - 0.95)));
    glass.add(bx(0.03, 0.4, 0.36, s * (Wc / 2 + 0.065), 2.3, -(uB + 0.32)));
  }

  // bumpers, grille, underbody, chassis
  trim.add(bumperGeo(Wc, 0.24, 0.3, 0.58, -(L / 2 - 0.24), false));
  trim.add(bx(Wc - 0.5, 0.42, 0.06, 0, 1.2, -(uF + 0.04)));
  trim.add(bx(Wc - 0.5, 0.04, 0.07, 0, 1.0, -(uF + 0.04)));
  trim.add(bx(1.7, 0.5, L - 0.9, 0, 0.85, 0.05));
  const wellHalf = W / 2 - 0.02 - ww - 0.01;
  trim.add(bx(wellHalf * 2, ra - 0.1, 2 * ra - 0.06, 0, (R + R + ra - 0.1) / 2, -axleF));
  trim.add(bx(Wcg - 0.3, 0.14, 0.2, 0, 0.72, L / 2 - 0.1)); // rear underride bar
  trim.add(cylZ(0.05, 0.3, Wc / 2 - 0.3, 0.55, L / 2 - 1.6, 8));

  // cab door seams + handles
  for (const s of [-1, 1]) {
    for (const u of [uF - 0.5, uB + 0.25]) trim.add(bx(0.014, 1.5, 0.014, s * (Wc / 2 + 0.004), 1.75, -u));
    trim.add(bx(0.014, 0.014, (uF - 0.5) - (uB + 0.25), s * (Wc / 2 + 0.004), 1.0, -((uF - 0.5 + uB + 0.25) / 2)));
    trim.add(bx(0.03, 0.04, 0.2, s * (Wc / 2 + 0.012), 1.75, -(uB + 0.25 + 0.2)));
  }

  // cargo box roll-up door lines (rear face) and side ribs
  const rz = L / 2 + 0.004;
  for (let y = 1.45; y <= 3.05; y += 0.145) trim.add(bx(Wcg - 0.4, 0.016, 0.012, 0, y, rz));
  for (const s of [-1, 1]) {
    trim.add(bx(0.03, 1.7, 0.012, s * ((Wcg - 0.4) / 2), 2.25, rz));
    for (const u of [-2.8, -1.6, -0.4, 0.8]) trim.add(bx(0.014, 1.85, 0.03, s * (Wcg / 2 + 0.004), 2.2, -u));
  }
  trim.add(bx(0.34, 0.07, 0.04, 0, 1.55, rz));

  const lx = Wc / 2 - 0.35;
  const parts: CarParts = {
    paint: paint.merge(),
    paint2: paint2.merge(),
    glass: glass.merge(),
    trim: trim.merge(),
    lampHead: lampBox(0.34, 0.2, 0.06),
    lampTail: lampBox(0.3, 0.22, 0.06),
    headPos: [v3(-lx - 0.1, 1.0, -(uF + 0.06)), v3(lx + 0.1, 1.0, -(uF + 0.06))],
    tailPos: [v3(-(Wcg / 2 - 0.2), 1.3, L / 2 - 0.02), v3(Wcg / 2 - 0.2, 1.3, L / 2 - 0.02)],
    plate: plateGeo(),
    platePos: [v3(0, 0.95, -(L / 2 + 0.002)), v3(0, 0.95, L / 2 + 0.002)],
    wheels: [],
    wheelR: R,
    wheelW: ww,
  };
  const wx = W / 2 - 0.02 - ww / 2;
  for (const s of [-1, 1]) {
    parts.wheels.push({ x: s * wx, z: -axleF, front: true });
    parts.wheels.push({ x: s * wx, z: -axleR, front: false });
  }
  return parts;
}

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

export function buildCarModel(type: VehicleType, spec: VehicleSpec, materials: IMaterialLibrary): CarModel {
  const parts = partsFor(type, spec);
  const group = new THREE.Group();
  group.name = `car:${type}`;
  const own: THREE.Material[] = [];
  const paintMeshes: THREE.Mesh[] = [];

  const paintMat = type === 'cop' ? materials.get('copLivery') : materials.carPaint(spec.color);
  const glassMat = materials.get('carGlass');
  const trimMat = materials.get('metalDark');
  const tyreMat = materials.get('tire');

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
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.4, metalness: 0.1 });
  own.push(headMat, tailMat);
  const headlights = parts.headPos.map((p) => { const m = mesh(parts.lampHead, headMat, 'headlight'); m.position.copy(p); return m; });
  const taillights = parts.tailPos.map((p) => { const m = mesh(parts.lampTail, tailMat, 'taillight'); m.position.copy(p); return m; });

  // licence plates
  const plateMat = materials.sign('BK-STUY', '#f6f1dc', '#111');
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
