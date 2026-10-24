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

type V2 = [number, number];
const { lerp, clamp } = THREE.MathUtils;

// ---------------------------------------------------------------- geometry helpers

/** Collects geometries (converted to non-indexed position/normal/uv) and merges them into one. */
class Acc {
  private readonly geos: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry): this {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    this.geos.push(n);
    return this;
  }
  /** add the geometry and its mirror image across x = 0 */
  addBoth(g: THREE.BufferGeometry): this {
    const m = mirrorX(g);
    return this.add(g).add(m);
  }
  get size(): number { return this.geos.length; }
  merge(): THREE.BufferGeometry {
    const m = mergeGeometries(this.geos, false);
    if (!m) throw new Error('carModel: merge failed');
    for (const g of this.geos) g.dispose();
    return m;
  }
}

/** Mirror across x = 0 (new geometry, winding fixed). */
function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(n.attributes)) {
    const a = n.attributes[name] as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const s = a.itemSize;
    if (name === 'position' || name === 'normal') for (let i = 0; i < a.count; i++) arr[i * s] = -arr[i * s];
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const tmp = arr[(t + 1) * s + k];
        arr[(t + 1) * s + k] = arr[(t + 2) * s + k];
        arr[(t + 2) * s + k] = tmp;
      }
    }
    a.needsUpdate = true;
  }
  return n;
}

function bx(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Cylinder along the x axis. */
function cylX(r: number, len: number, x: number, y: number, z: number, seg = 10, r2 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
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

function v3(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(x, y, z); }

/** Flat strip along a polyline lying on a surface: `nrm` are surface normals, `off` lifts it off the surface. */
function ribbon(pts: THREE.Vector3[], nrm: THREE.Vector3[], w: number, off: number): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const s = new THREE.Vector3().crossVectors(nrm[i], t).normalize().multiplyScalar(w / 2);
    const b = pts[i].clone().addScaledVector(nrm[i], off);
    pos.push(b.x - s.x, b.y - s.y, b.z - s.z, b.x + s.x, b.y + s.y, b.z + s.z);
    nor.push(nrm[i].x, nrm[i].y, nrm[i].z, nrm[i].x, nrm[i].y, nrm[i].z);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  // orient so the first face looks along the surface normal
  const pa = new THREE.Vector3(pos[0], pos[1], pos[2]);
  const pb = new THREE.Vector3(pos[6], pos[7], pos[8]);
  const pc = new THREE.Vector3(pos[3], pos[4], pos[5]);
  const fn = pb.sub(pa).cross(pc.sub(pa));
  if (fn.dot(nrm[0]) < 0) {
    const ix = g.index!.array as Uint16Array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  return g;
}

/** Slab (thin box) lying in the (u, y) plane from (u0,y0) to (u1,y1), across `width`. */
function slab(u0: number, y0: number, u1: number, y1: number, thick: number, width: number, x = 0): THREE.BufferGeometry {
  const du = u1 - u0;
  const dy = y1 - y0;
  const g = new THREE.BoxGeometry(width, Math.hypot(du, dy), thick);
  g.rotateX(Math.atan2(-du, dy));
  g.translate(x, (y0 + y1) / 2, -(u0 + u1) / 2);
  return g;
}

/** Flip a geometry inside-out (reverse winding and normals), keeping it non-indexed. */
function inverted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) {
    const a = n.attributes[name] as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const s = a.itemSize;
    if (name === 'normal') for (let i = 0; i < arr.length; i++) arr[i] = -arr[i];
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const tmp = arr[(t + 1) * s + k];
        arr[(t + 1) * s + k] = arr[(t + 2) * s + k];
        arr[(t + 2) * s + k] = tmp;
      }
    }
  }
  return n;
}

/** Plan-view rounded bumper (extruded vertically). Front edge faces -z. Centred in x, back edge at z = 0. */
function bumperGeo(width: number, depth: number, height: number, y: number, z: number, rear: boolean): THREE.BufferGeometry {
  const r = Math.min(0.16, depth * 0.8);
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, depth - r);
  s.quadraticCurveTo(width / 2, depth, width / 2 - r, depth);
  s.lineTo(-width / 2 + r, depth);
  s.quadraticCurveTo(-width / 2, depth, -width / 2, depth - r);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: height - 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 6,
  });
  g.translate(0, 0, 0.02);
  g.rotateX(-Math.PI / 2); // shape y -> world -z (forward), extrude z -> world y
  if (rear) g.rotateY(Math.PI);
  g.translate(0, y - height / 2, z);
  return g;
}

/** Monotone cubic interpolant through (xs ascending, ys). */
function monotone(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

// ---------------------------------------------------------------- lofted hull

type Kind = 'paint' | 'glass' | 'dark';

interface LoftSpec {
  /** station positions along the car, ascending (rear -> front) */
  us: number[];
  /** right half of the ring at u: from top centre down to bottom centre (x >= 0). Same length every call. */
  half: (u: number) => V2[];
  /** half-ring indices whose vertex is duplicated so the surface has a hard crease there */
  creases: number[];
  /** what a quad (station interval midpoint, half-ring segment j = idx j -> j+1) is made of */
  cls: (um: number, j: number) => Kind;
  /** rings at both ends are closed with a flat cap */
  caps?: boolean;
}

interface Hull {
  us: number[];
  /** number of ring slots around the full ring */
  M: number;
  n: number;
  /** position of ring slot s at station i */
  P(i: number, s: number): THREE.Vector3;
  /** smooth normal of ring slot s at station i */
  N(i: number, s: number): THREE.Vector3;
  /** nearest station index for u */
  at(u: number): number;
  paint: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
  /** dark inner shell behind the glass (faces inwards) */
  inner: THREE.BufferGeometry;
  /** the raw half rings per station */
  halves: V2[][];
}

const GLASS_INSET = 0.02;
const INNER_INSET = 0.16;

function buildLoft(spec: LoftSpec): Hull {
  const { us } = spec;
  const S = us.length;
  const halves = us.map((u) => spec.half(u));
  const n = halves[0].length;
  const M = 2 * n - 2;
  // columns: one per ring slot, creased slots get an upper (cu) and a lower (cl) column
  const creaseSet = new Set<number>();
  for (const c of spec.creases) { creaseSet.add(c); creaseSet.add(M - c); }
  const slotOfHalf = (j: number, left: boolean): number => (left ? M - j : j);
  const cu = new Array<number>(M);
  const cl = new Array<number>(M);
  const slotCol: number[] = []; // column -> slot
  for (let s = 0; s < M; s++) {
    cu[s] = slotCol.length;
    slotCol.push(s);
    if (creaseSet.has(s)) { cl[s] = slotCol.length; slotCol.push(s); } else cl[s] = cu[s];
  }
  const C = slotCol.length;
  const halfIdx = (s: number): number => (s < n ? s : M - s);
  void slotOfHalf;

  const pos = new Float32Array(S * C * 3);
  for (let i = 0; i < S; i++) {
    for (let c = 0; c < C; c++) {
      const s = slotCol[c];
      const j = halfIdx(s);
      const [x, y] = halves[i][j];
      const o = (i * C + c) * 3;
      pos[o] = s < n ? x : -x;
      pos[o + 1] = y;
      pos[o + 2] = -us[i];
    }
  }

  // segment k joins slot k -> k+1; j is the half-ring segment index it mirrors
  const segJ = (k: number): number => (k < n - 1 ? k : M - 1 - k);
  const colFor = (s: number, j: number, crease: number): number => (creaseSet.has(s) ? (j < crease ? cu[s] : cl[s]) : cu[s]);
  const crease = spec.creases[0] ?? 99;

  const all: number[] = [];
  const byKind: Record<Kind, number[]> = { paint: [], glass: [], dark: [] };
  for (let i = 0; i < S - 1; i++) {
    const um = (us[i] + us[i + 1]) / 2;
    for (let k = 0; k < M; k++) {
      const j = segJ(k);
      const s0 = k;
      const s1 = (k + 1) % M;
      const c0 = colFor(s0, j, crease);
      const c1 = colFor(s1, j, crease);
      const v00 = i * C + c0;
      const v01 = i * C + c1;
      const v10 = (i + 1) * C + c0;
      const v11 = (i + 1) * C + c1;
      const kind = spec.cls(um, j);
      byKind[kind].push(v00, v01, v11, v00, v11, v10);
      all.push(v00, v01, v11, v00, v11, v10);
    }
  }
  const full = new THREE.BufferGeometry();
  full.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  full.setIndex(all);
  full.computeVertexNormals();
  const nor = full.attributes.normal.array as Float32Array;
  full.dispose();

  const uvs = new Float32Array(S * C * 2);
  const sub = (index: number[], offset = 0): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    let p = pos;
    if (offset !== 0) {
      p = new Float32Array(pos.length);
      for (let k = 0; k < pos.length; k++) p[k] = pos[k] - nor[k] * offset;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(index);
    return g;
  };

  const paintGeo = new Acc().add(sub(byKind.paint));
  const darkGeo = new Acc().add(sub(byKind.dark));
  const glassGeo = new Acc().add(sub(byKind.glass, GLASS_INSET));

  // flat end caps (own vertices so the cap stays flat)
  if (spec.caps !== false) {
    for (const [i, outward] of [[0, 1], [S - 1, -1]] as const) {
      const ring: THREE.Vector3[] = [];
      const centre = new THREE.Vector3();
      for (let s = 0; s < M; s++) {
        const o = (i * C + cu[s]) * 3;
        ring.push(v3(pos[o], pos[o + 1], pos[o + 2]));
        centre.add(ring[s]);
      }
      centre.multiplyScalar(1 / M);
      const p: number[] = [];
      for (let s = 0; s < M; s++) {
        const a = ring[s];
        const b = ring[(s + 1) % M];
        const tri = [centre, a, b];
        const nz = new THREE.Vector3().subVectors(a, centre).cross(new THREE.Vector3().subVectors(b, centre)).z;
        if (nz * outward < 0) { tri[1] = b; tri[2] = a; }
        for (const q of tri) p.push(q.x, q.y, q.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      const nn: number[] = [];
      for (let k = 0; k < p.length / 3; k++) nn.push(0, 0, outward);
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((p.length / 3) * 2).fill(0), 2));
      paintGeo.add(g);
    }
  }

  const inner = byKind.glass.length ? inverted(sub(byKind.glass, INNER_INSET)) : new THREE.BufferGeometry();

  return {
    us, M, n, halves,
    P: (i, s) => { const o = (i * C + cu[s]) * 3; return v3(pos[o], pos[o + 1], pos[o + 2]); },
    N: (i, s) => { const o = (i * C + cu[s]) * 3; return v3(nor[o], nor[o + 1], nor[o + 2]).normalize(); },
    at: (u) => {
      let best = 0;
      for (let i = 1; i < S; i++) if (Math.abs(us[i] - u) < Math.abs(us[best] - u)) best = i;
      return best;
    },
    paint: paintGeo.merge(),
    glass: glassGeo.merge(),
    dark: darkGeo.merge(),
    inner,
  };
}

/** Sorted, de-duplicated station list: `must` entries always survive, `want` ones only if they do not crowd a kept one. */
function stationList(must: number[], want: number[], maxGap: number): number[] {
  const out: number[] = [];
  const tooClose = (u: number, tol: number): boolean => out.some((v) => Math.abs(v - u) < tol);
  for (const u of must) if (!tooClose(u, 0.004)) out.push(u);
  for (const u of want) if (!tooClose(u, 0.012)) out.push(u);
  out.sort((a, b) => a - b);
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i + 1] - out[i] > maxGap) { out.splice(i + 1, 0, (out[i] + out[i + 1]) / 2); i--; }
  }
  return out;
}

const END_T = [0, 0.06, 0.16, 0.32, 0.55, 0.8, 1];

/** Smooth rounding of a body end: 0 at the tip -> 1 at distance `dr` (quarter-circle profile). */
function endG(d: number, dr: number): number {
  const t = clamp(d / dr, 0, 1);
  return Math.sqrt(1 - (1 - t) * (1 - t));
}

/** Passenger-car half ring: roof centre -> belt -> sill (13 points, crease between idx 6 and 7). */
interface CarRing {
  yT: number; yBelt: number; yBot: number; wMax: number; wR: number;
}
const CAR_CREASE = 6;
function carHalf(r: CarRing): V2[] {
  const wG0 = r.wMax - 0.08;
  const yG0 = r.yBelt + 0.012;
  const crown = clamp((r.yT - r.yBelt - 0.012) * 0.5, 0.01, 0.032);
  const yR = r.yT - crown;
  const wR = Math.min(r.wR, wG0 - 0.015);
  const bulge = 0.018;
  const wl = (t: number): number => lerp(wG0, wR, t) + bulge * Math.sin(Math.PI * t);
  const yl = (t: number): number => lerp(yG0, yR, t);
  const h = r.yBelt - r.yBot;
  const yB4 = r.yBelt - 0.05;
  const yB3 = Math.min(r.yBot + 0.58 * h, yB4 - 0.03);
  const yB2 = Math.min(r.yBot + 0.2 * h, yB3 - 0.03);
  return [
    [0, r.yT],
    [wR * 0.5, r.yT - crown * 0.25],
    [wR * 0.88, r.yT - crown * 0.77],
    [wR, yR],
    [wl(0.86), yl(0.86)],
    [wl(0.4), yl(0.4)],
    [wG0, yG0],
    [r.wMax - 0.035, r.yBelt],
    [r.wMax - 0.01, yB4],
    [r.wMax, yB3],
    [r.wMax - 0.04, yB2],
    [r.wMax - 0.1, r.yBot + 0.012],
    [0, r.yBot],
  ];
}

/** Rounded-rectangle half ring (cargo box): top centre -> bottom centre. */
function boxHalf(wMax: number, yBot: number, yTop: number, rad: number): V2[] {
  const k = 1 - Math.SQRT1_2;
  const pts: V2[] = [
    [0, yTop],
    [wMax * 0.5, yTop],
    [wMax - rad, yTop],
    [wMax - rad * k, yTop - rad * k],
    [wMax, yTop - rad],
    [wMax, lerp(yBot, yTop, 0.7)],
    [wMax, lerp(yBot, yTop, 0.35)],
    [wMax, yBot + rad],
    [wMax - rad * k, yBot + rad * k],
    [wMax - rad, yBot],
    [wMax * 0.5, yBot],
    [0, yBot],
  ];
  return pts;
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
  const tyre = new Acc().add(lathe);
  // dark brake discs just behind the spokes, with a small caliper
  tyre.add(cylX(R * 0.5, w * 0.06, -w * 0.3, 0, 0, 20));
  tyre.add(cylX(R * 0.5, w * 0.06, w * 0.3, 0, 0, 20));
  tyre.add(bx(w * 0.2, R * 0.16, R * 0.22, w * 0.3, 0, R * 0.46));

  // rim: outer lip rings, five tapered spokes per side and a centre cap
  const rim = new Acc();
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

// ---------------------------------------------------------------- per-type parts (cached)

interface LampDef { pos: THREE.Vector3; yaw: number; }

interface CarParts {
  paint: THREE.BufferGeometry;
  /** truck cargo box (white paint) */
  paint2?: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  chrome: THREE.BufferGeometry;
  hood?: { geo: THREE.BufferGeometry; pivot: THREE.Vector3 };
  lampHead: THREE.BufferGeometry;
  lampTail: THREE.BufferGeometry;
  headPos: LampDef[];
  tailPos: LampDef[];
  plate: THREE.BufferGeometry;
  platePos: THREE.Vector3[];
  wheels: { x: number; z: number; front: boolean }[];
  wheelR: number;
  wheelW: number;
  lightbar?: { lens: THREE.BufferGeometry; a: THREE.Vector3; b: THREE.Vector3 };
  /** number of cross-sections of the main hull */
  sections: number;
}

const partsCache = new Map<string, CarParts>();

/** Half-ellipsoid lens facing -z (front) or +z (rear). */
function lensGeo(rx: number, ry: number, rz: number, front: boolean): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(front ? -Math.PI / 2 : Math.PI / 2);
  g.scale(rx, ry, rz);
  return g;
}

/** Elliptical bezel ring facing -z or +z, sitting around a lens. */
function bezelGeo(rx: number, ry: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(1, 0.1, 6, 24);
  g.scale(rx, ry, 0.12);
  return g;
}

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
    const vv = clamp(0.34 + (pos.getY(i) - 0.42) * 0.88, 0.03, 0.97);
    uv.setXY(i, uu, vv);
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------- passenger cars

interface Style {
  Lref: number; Href: number;
  sill: number; wheelR: number; wheelW: number;
  /** |u| of the axles (ref m) */
  axle: number;
  /** [u, roof/deck height centre, belt height, roof half-width as a fraction of body half-width] (ref m) */
  secs: [number, number, number, number][];
  windshield: V2; doorGlass: V2[]; bPillar: V2; rearGlass: V2;
  seams: number[]; handles: number[];
  hoodBack: number;
  /** lowest half-ring segment index that is black plastic cladding (SUV skirts) */
  clad: number;
  rails: boolean; spoiler: boolean;
  bumperY: number; bumperH: number;
}

const STYLES: Record<'sedan' | 'suv', Style> = {
  sedan: {
    Lref: 4.6, Href: 1.4,
    sill: 0.2, wheelR: 0.34, wheelW: 0.225,
    axle: 1.38,
    secs: [
      [-2.26, 0.97, 0.94, 0.93],
      [-1.95, 1.0, 0.97, 0.93],
      [-1.62, 1.03, 0.98, 0.9],
      [-1.3, 1.2, 0.98, 0.8],
      [-1.0, 1.385, 0.98, 0.74],
      [-0.45, 1.4, 0.98, 0.73],
      [0.1, 1.385, 0.98, 0.745],
      [0.45, 1.2, 0.98, 0.8],
      [0.8, 1.03, 0.975, 0.9],
      [1.2, 1.0, 0.94, 0.93],
      [1.75, 0.93, 0.87, 0.93],
      [2.05, 0.88, 0.82, 0.93],
      [2.26, 0.84, 0.78, 0.93],
    ],
    windshield: [0.8, 0.1],
    doorGlass: [[0.68, -0.03], [-0.13, -1.05]],
    bPillar: [-0.03, -0.13],
    rearGlass: [-1.05, -1.62],
    seams: [0.6, -0.08, -0.9],
    handles: [0.02, -0.8],
    hoodBack: 0.92,
    clad: 11,
    rails: false, spoiler: true,
    bumperY: 0.34, bumperH: 0.22,
  },
  suv: {
    Lref: 4.9, Href: 1.8,
    sill: 0.26, wheelR: 0.38, wheelW: 0.25,
    axle: 1.45,
    secs: [
      [-2.41, 1.45, 1.17, 0.8],
      [-2.2, 1.62, 1.17, 0.78],
      [-1.95, 1.775, 1.17, 0.75],
      [-1.0, 1.8, 1.17, 0.74],
      [0.15, 1.78, 1.17, 0.745],
      [0.5, 1.62, 1.16, 0.78],
      [0.8, 1.43, 1.16, 0.84],
      [1.1, 1.25, 1.15, 0.9],
      [1.5, 1.2, 1.12, 0.92],
      [2.0, 1.14, 1.07, 0.92],
      [2.3, 1.06, 1.0, 0.92],
      [2.41, 1.02, 0.96, 0.92],
    ],
    windshield: [1.1, 0.15],
    doorGlass: [[0.95, 0.03], [-0.12, -1.0], [-1.12, -1.85]],
    bPillar: [0.03, -0.12],
    rearGlass: [-1.95, -2.38],
    seams: [0.92, -0.06, -0.98],
    handles: [0.0, -0.86],
    hoodBack: 1.22,
    clad: 9,
    rails: true, spoiler: false,
    bumperY: 0.45, bumperH: 0.28,
  },
};

export function wheelRadiusFor(type: VehicleType): number {
  return type === 'boxtruck' ? 0.5 : type === 'suv' ? STYLES.suv.wheelR : STYLES.sedan.wheelR;
}

/** Number of cross-sections that define a type's hull (before smoothing). */
export function hullSectionCount(type: VehicleType): number {
  return type === 'boxtruck' ? TRUCK_CAB_SECS.length : STYLES[type === 'suv' ? 'suv' : 'sedan'].secs.length;
}

const inI = (u: number, r: V2): boolean => u <= r[0] + 1e-6 && u >= r[1] - 1e-6;

/** Wheel arch geometry shared by the hull and the wheel liners. */
interface Arch { R: number; ra: number; sill: number; halfChord: number; phiS: number; }
function archOf(R: number, sill: number): Arch {
  const ra = R + 0.065;
  const phiS = Math.asin(clamp((sill - R) / ra, -1, 1));
  return { R, ra, sill, halfChord: ra * Math.cos(phiS), phiS };
}
function archY(a: Arch, du: number): number {
  return Math.abs(du) < a.halfChord ? a.R + Math.sqrt(a.ra * a.ra - du * du) : 0;
}
function archStations(a: Arch, axle: number, n = 12): number[] {
  const out: number[] = [];
  const a0 = Math.PI - a.phiS;
  for (let k = 0; k <= n; k++) {
    const phi = a0 + (a.phiS - a0) * (k / n);
    out.push(axle + a.ra * Math.cos(phi));
  }
  return out;
}

/** Half-cylinder liner around a wheel well (dark, faces the wheel). */
function wheelLiner(a: Arch, x0: number, x1: number, z: number): THREE.BufferGeometry {
  const rr = a.ra - 0.02;
  const g = new THREE.CylinderGeometry(rr, rr, x1 - x0, 20, 1, true, a.phiS, Math.PI - 2 * a.phiS);
  g.rotateZ(Math.PI / 2);
  g.translate((x0 + x1) / 2, a.R, z);
  return inverted(g);
}

interface CabinLayout { ws: V2; doors: V2[]; rg: V2 | null; seams: number[]; }

/** Chrome window surrounds + belt moulding and dark door seams, all riding on the hull's own vertices. */
function cabinTrim(hull: Hull, chrome: Acc, trim: Acc, lay: CabinLayout): void {
  const rib = (pairs: [number, number][], w = 0.014, off = 0.004): THREE.BufferGeometry =>
    ribbon(pairs.map(([i, s]) => hull.P(i, s)), pairs.map(([i, s]) => hull.N(i, s)), w, off);
  const seq = (a: number, b: number): number[] => {
    const out: number[] = [];
    if (a <= b) for (let i = a; i <= b; i++) out.push(i);
    else for (let i = a; i >= b; i--) out.push(i);
    return out;
  };
  const { ws, doors, rg, seams } = lay;
  for (const d of doors) {
    const iA = hull.at(d[0]);
    const iB = hull.at(d[1]);
    const top = (i: number): number => (hull.us[i] > ws[1] + 0.001 && hull.us[i] <= ws[0] ? 4 : 3);
    chrome.addBoth(rib([[iA, 6], [iA, 5], [iA, top(iA)]]));
    chrome.addBoth(rib(seq(iA, iB).map((i) => [i, top(i)] as [number, number])));
    chrome.addBoth(rib([[iB, top(iB)], [iB, 5], [iB, 6]]));
    chrome.addBoth(rib(seq(iB, iA).map((i) => [i, 6] as [number, number]), 0.02, 0.003));
  }
  for (const gl of [ws, rg]) {
    if (!gl) continue;
    const iA = hull.at(gl[0]);
    const iB = hull.at(gl[1]);
    const path: [number, number][] = [[iA, 0], [iA, 1]];
    for (const i of seq(iA, iB)) path.push([i, 2]);
    path.push([iB, 1], [iB, 0]);
    chrome.addBoth(rib(path));
  }
  for (const su0 of seams) {
    const i = hull.at(su0);
    trim.addBoth(rib([[i, 7], [i, 8], [i, 9], [i, 10]], 0.012, 0.005));
  }
}

function buildPassengerParts(type: 'sedan' | 'suv' | 'cop', spec: VehicleSpec): CarParts {
  const st = STYLES[type === 'suv' ? 'suv' : 'sedan'];
  const { length: L, width: W, height: H } = spec;
  const kx = L / st.Lref;
  const ky = H / st.Href;
  const R = st.wheelR;
  const arch = archOf(R, st.sill);
  const Wb2 = W / 2 - 0.02;                // body half-width
  const tipF = L / 2 - 0.04;
  const tipR = -(L / 2 - 0.04);
  const drF = 0.5;
  const drR = 0.4;
  const axleF = st.axle * kx;
  const axleR = -st.axle * kx;

  const secs = st.secs.map(([u, yT, yB, wr], i, a) => [i === 0 ? tipR : i === a.length - 1 ? tipF : u * kx, yT * ky, yB * ky, wr] as const);
  const su = secs.map((s) => s[0]);
  const fyT = monotone(su, secs.map((s) => s[1]));
  const fyBelt = monotone(su, secs.map((s) => s[2]));
  const fwR = monotone(su, secs.map((s) => s[3]));

  const ring = (u: number): CarRing => {
    const dF = tipF - u;
    const dR = u - tipR;
    const front = dF < dR;
    const d = Math.min(dF, dR);
    const dr = front ? drF : drR;
    const g = endG(d, dr);
    const t = clamp(d / dr, 0, 1);
    const drop = 0.05 * (1 - g);
    let yBot = st.sill;
    for (const ax of [axleF, axleR]) yBot = Math.max(yBot, archY(arch, u - ax));
    yBot = Math.max(yBot, st.sill + (front ? 0.2 : 0.12) * (1 - t) * (1 - t));
    const yBelt = fyBelt(u) - drop;
    const yT = fyT(u) - drop;
    yBot = Math.min(yBot, yBelt - 0.13);
    const wMax = Wb2 * (0.6 + 0.4 * g);
    return { yT, yBelt, yBot, wMax, wR: fwR(u) * wMax };
  };

  // ---- window layout in real metres
  const sx = (r: V2): V2 => [r[0] * kx, r[1] * kx];
  const ws = sx(st.windshield);
  const doors = st.doorGlass.map(sx);
  const bp = sx(st.bPillar);
  const rg = sx(st.rearGlass);
  const seams = st.seams.map((v) => v * kx);
  const handles = st.handles.map((v) => v * kx);
  const hoodBackU = st.hoodBack * kx;
  const hoodFrontU = tipF - 0.16 * drF;
  const quarter = axleF - arch.halfChord - 0.03; // cladding between the arches

  const cls = (um: number, j: number): Kind => {
    if (um <= hoodFrontU && um >= hoodBackU && j <= 5) return 'dark'; // engine bay under the hood panel
    const inW = inI(um, ws);
    if ((inW || inI(um, rg)) && j <= 1) return 'glass';
    if (inI(um, bp) && j >= 3 && j <= 5) return 'dark';
    if (j >= 3 && j <= 5) {
      if (doors.some((d) => inI(um, d))) {
        if (!inW || j >= 4) return 'glass';
      }
    }
    if (j === 11) return 'dark';
    if (j === 10) {
      if (Math.abs(um - axleF) < arch.halfChord + 0.05 || Math.abs(um - axleR) < arch.halfChord + 0.05) return 'dark';
      if (Math.abs(um) < axleF) return 'dark';
    }
    if (j >= st.clad && j >= 9 && Math.abs(um) < quarter + arch.halfChord) return 'dark';
    return 'paint';
  };

  const must: number[] = [tipF, tipR, ...ws, ...doors.flat(), ...bp, ...rg, ...seams, hoodBackU, hoodFrontU];
  const want: number[] = [...su];
  for (const t of END_T) { want.push(tipF - t * drF, tipR + t * drR); }
  for (const ax of [axleF, axleR]) want.push(...archStations(arch, ax));
  const us = stationList(must, want, 0.4);

  const hull = buildLoft({ us, half: (u) => carHalf(ring(u)), creases: [CAR_CREASE], cls });
  const sideX = (u: number, y: number): number => {
    const h = carHalf(ring(u));
    for (let j = 7; j < 11; j++) {
      const [x0, y0] = h[j];
      const [x1, y1] = h[j + 1];
      if (y <= y0 && y >= y1) return lerp(x1, x0, (y - y1) / (y0 - y1));
    }
    return h[9][0];
  };

  const paint = new Acc().add(hull.paint);
  const trim = new Acc().add(hull.dark);
  const chrome = new Acc();
  const glass = new Acc().add(hull.glass);
  if (hull.inner.attributes.position) trim.add(hull.inner);

  const rib = (pairs: [number, number][], w = 0.014, off = 0.004): THREE.BufferGeometry =>
    ribbon(pairs.map(([i, s]) => hull.P(i, s)), pairs.map(([i, s]) => hull.N(i, s)), w, off);
  const seq = (a: number, b: number): number[] => {
    const out: number[] = [];
    if (a <= b) for (let i = a; i <= b; i++) out.push(i);
    else for (let i = a; i >= b; i--) out.push(i);
    return out;
  };

  // ---- chrome window surrounds + belt moulding, door seams
  cabinTrim(hull, chrome, trim, { ws, doors, rg, seams });
  for (const hu of handles) {
    const yH = fyBelt(hu) - 0.075;
    const hx = sideX(hu, yH) + 0.014;
    const cap = new THREE.CapsuleGeometry(0.012, 0.12, 3, 6);
    cap.rotateX(Math.PI / 2);
    cap.translate(hx, yH, -hu);
    chrome.addBoth(cap);
  }

  // ---- wheel liners
  const wTyre = st.wheelW;
  const wx = Wb2 - 0.03 - 0.52 * wTyre;
  for (const ax of [axleF, axleR]) {
    trim.addBoth(wheelLiner(arch, wx - 0.52 * wTyre - 0.03, Wb2 - 0.01, -ax));
  }

  // ---- mirrors (paint housing, dark face, dark stalk)
  const uMir = doors[0][0] - 0.02;
  const yMir = fyBelt(uMir) + 0.075;
  const mx = Wb2 + 0.04;
  const housing = new THREE.SphereGeometry(1, 12, 8).scale(0.05, 0.05, 0.085);
  housing.translate(mx, yMir, -uMir);
  paint.addBoth(housing);
  trim.addBoth(bx(0.012, 0.06, 0.1, mx + 0.044, yMir, -uMir - 0.006));
  trim.addBoth(bx(0.1, 0.022, 0.04, Wb2 - 0.01, yMir - 0.035, -uMir - 0.02));

  // ---- front / rear fascia
  const trF = ring(tipF);
  const trR = ring(tipR);
  const bumperZ = L / 2;
  trim.add(bumperGeo(2 * Wb2 * 0.88, 0.2, st.bumperH, st.bumperY, -(bumperZ - 0.2), false));
  trim.add(bumperGeo(2 * Wb2 * 0.88, 0.2, st.bumperH, st.bumperY, bumperZ - 0.2, true));
  // lower air dams
  trim.add(bx(2 * Wb2 * 0.72, 0.05, 0.1, 0, st.bumperY - st.bumperH / 2 - 0.015, -(bumperZ - 0.06)));
  trim.add(bx(2 * Wb2 * 0.6, 0.04, 0.08, 0, st.bumperY - st.bumperH / 2 - 0.01, bumperZ - 0.05));
  // lower intake slot + fog lamps (front)
  trim.add(bx(2 * Wb2 * 0.5, 0.07, 0.02, 0, st.bumperY - 0.03, -(bumperZ + 0.004)));
  chrome.add(bx(2 * Wb2 * 0.5, 0.008, 0.012, 0, st.bumperY - 0.065, -(bumperZ + 0.01)));
  for (const s of [-1, 1]) {
    const fog = new THREE.TorusGeometry(0.04, 0.008, 6, 14);
    fog.translate(s * (Wb2 * 0.78), st.bumperY - 0.02, -(bumperZ + 0.004));
    chrome.add(fog);
    trim.add(new THREE.CircleGeometry(0.04, 12).rotateY(Math.PI).translate(s * (Wb2 * 0.78), st.bumperY - 0.02, -(bumperZ + 0.003)));
  }
  // grille: dark panel, chrome slats and surround, badge
  const gW = trF.wMax * 0.8;
  const gH = 0.17;
  const gY = trF.yT - 0.13;
  const gZ = -(tipF + 0.006);
  trim.add(bx(2 * gW, gH, 0.016, 0, gY, gZ));
  for (let k = 0; k < 4; k++) chrome.add(bx(2 * gW - 0.04, 0.012, 0.014, 0, gY - gH / 2 + (k + 0.8) * (gH / 4.2), gZ - 0.01));
  chrome.add(bx(2 * gW + 0.03, 0.014, 0.018, 0, gY + gH / 2 + 0.005, gZ - 0.004));
  chrome.add(bx(2 * gW + 0.03, 0.014, 0.018, 0, gY - gH / 2 - 0.005, gZ - 0.004));
  for (const s of [-1, 1]) chrome.add(bx(0.014, gH + 0.02, 0.018, s * (gW + 0.008), gY, gZ - 0.004));
  chrome.add(cylZ(0.028, 0.012, 0, gY, gZ - 0.012, 14));
  // rear: chrome strip over the bumper, exhaust tip
  chrome.add(bx(2 * trR.wMax * 0.8, 0.012, 0.014, 0, trR.yBot + 0.02, tipF + 0.006));
  const exX = Wb2 - 0.34;
  chrome.add(cylZ(0.04, 0.16, exX, 0.16, bumperZ - 0.14, 14));
  trim.add(new THREE.CircleGeometry(0.032, 12).translate(exX, 0.16, bumperZ - 0.059));
  // underbody pan so the sky never shows under the car
  trim.add(bx(2 * (Wb2 - 0.14), 0.04, L - 0.5, 0, st.sill + 0.04, 0));

  // ---- interior (seen through the glass): dash, seats
  const yBeltC = fyBelt(0);
  const seatY = st.sill + 0.5 * ky;
  trim.add(bx(2 * Wb2 * 0.78, 0.2, 0.3, 0, yBeltC - 0.13, -(ws[0] - 0.22)));
  const seatU = [(ws[1] + bp[0]) / 2 - 0.1, (bp[1] + rg[0]) / 2 + 0.2];
  seatU[0] = doors[0][1] + 0.3 * kx;
  for (const s of [-1, 1]) {
    trim.add(bx(0.46, 0.5, 0.12, s * 0.35, seatY + 0.28, -(seatU[0] - 0.22)));
    trim.add(bx(0.46, 0.14, 0.5, s * 0.35, seatY, -seatU[0]));
    trim.add(bx(0.2, 0.14, 0.08, s * 0.35, seatY + 0.6, -(seatU[0] - 0.22)));
  }
  trim.add(bx(2 * Wb2 * 0.72, 0.5, 0.12, 0, seatY + 0.26, -(rg[0] + 0.2)));
  trim.add(bx(2 * Wb2 * 0.72, 0.14, 0.5, 0, seatY, -(rg[0] + 0.42)));

  // ---- roof rails (SUV), antenna / spoiler (sedan)
  const iRoofA = hull.at(secs[st.rails ? 3 : 4][0]);
  if (st.rails) {
    const iR0 = hull.at(secs[2][0] + 0.12);
    const iR1 = hull.at(secs[4][0] - 0.05);
    const pts: THREE.Vector3[] = [];
    for (const i of seq(iR0, iR1)) pts.push(hull.P(i, 3).addScaledVector(hull.N(i, 3), 0.028));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 24, 0.015, 6, false);
    chrome.addBoth(tube);
    for (const i of [iR0, hull.at((secs[2][0] + secs[4][0]) / 2), iR1]) {
      const p = hull.P(i, 3);
      trim.addBoth(bx(0.04, 0.035, 0.05, p.x, p.y + 0.008, p.z));
    }
    for (const f of [0.25, 0.75]) {
      const i = Math.round(lerp(iR0, iR1, f));
      const p = hull.P(i, 3);
      chrome.add(bx(2 * p.x, 0.022, 0.035, 0, p.y + 0.03, p.z));
    }
  } else if (type !== 'cop') {
    trim.add(new THREE.CylinderGeometry(0.008, 0.012, 0.2, 5).translate(0.5, hull.P(iRoofA, 0).y + 0.08, hull.P(iRoofA, 0).z + 0.55));
  }
  if (st.spoiler) {
    const uS = tipR + 0.2;
    const rr = ring(uS);
    const sp = new THREE.BoxGeometry(2 * (rr.wMax - 0.17), 0.022, 0.13);
    sp.rotateX(-0.22);
    sp.translate(0, rr.yT + 0.012, -uS);
    paint.add(sp);
    for (const s of [-1, 1]) paint.add(bx(0.016, 0.04, 0.12, s * (rr.wMax - 0.17), rr.yT + 0.022, -uS));
  }

  // ---- cop gear
  const copBarU = secs[st.rails ? 3 : 5][0];
  const roofY = hull.P(hull.at(copBarU), 0).y;
  if (type === 'cop') {
    for (const s of [-1, 1]) trim.add(bx(0.05, 0.42, 0.05, s * 0.5, 0.52, -(L / 2 + 0.035)));
    trim.add(bx(1.05, 0.05, 0.05, 0, 0.7, -(L / 2 + 0.035)));
    trim.add(bx(1.05, 0.05, 0.05, 0, 0.36, -(L / 2 + 0.035)));
    trim.add(bx(1.1, 0.05, 0.34, 0, roofY + 0.03, -copBarU));
    chrome.add(bx(1.14, 0.012, 0.02, 0, roofY + 0.175, -copBarU));
  }

  // ---- hood panel (separate so it can lift when damaged)
  const iHB = hull.at(hoodBackU);
  const iHF = hull.at(hoodFrontU);
  const hoodSlots = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];
  const hoodSurface = (lift: number): THREE.BufferGeometry => {
    const rows = iHF - iHB + 1;
    const cols = hoodSlots.length;
    const p: number[] = [];
    for (let r = iHB; r <= iHF; r++) {
      for (const s of hoodSlots) { const v = hull.P(r, s); p.push(v.x, v.y + lift, v.z); }
    }
    const ix: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        ix.push(a, a + 1, a + cols + 1, a, a + cols + 1, a + cols);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    return g;
  };
  const yc = hull.P(iHB, 0).y + 0.012;
  const hoodAcc = new Acc().add(hoodSurface(0.012)).add(inverted(hoodSurface(-0.004)));
  const hoodGeo = hoodAcc.merge();
  hoodGeo.translate(0, -yc, hoodBackU);

  // ---- lights
  const lampHeadY = trF.yT - 0.09;
  const lampTailY = trR.yT - 0.12;
  const lx = trF.wMax - 0.15;
  const ltx = trR.wMax - 0.17;
  const headPos: LampDef[] = [
    { pos: v3(-lx, lampHeadY, -tipF), yaw: 0.25 },
    { pos: v3(lx, lampHeadY, -tipF), yaw: -0.25 },
  ];
  const tailPos: LampDef[] = [
    { pos: v3(-ltx, lampTailY, -tipR), yaw: -0.2 },
    { pos: v3(ltx, lampTailY, -tipR), yaw: 0.2 },
  ];
  for (const l of headPos) {
    const bz = new THREE.Matrix4().makeRotationY(l.yaw).setPosition(l.pos);
    chrome.add(bezelGeo(0.15, 0.058).applyMatrix4(bz));
    trim.add(new THREE.CircleGeometry(1, 20).scale(0.15, 0.058, 1).rotateY(Math.PI).applyMatrix4(bz));
  }
  for (const l of tailPos) {
    const bz = new THREE.Matrix4().makeRotationY(l.yaw).setPosition(l.pos);
    chrome.add(bezelGeo(0.17, 0.05).applyMatrix4(bz));
    trim.add(new THREE.CircleGeometry(1, 20).scale(0.17, 0.05, 1).applyMatrix4(bz));
  }

  const parts: CarParts = {
    paint: paint.merge(),
    glass: glass.merge(),
    trim: trim.merge(),
    chrome: chrome.merge(),
    hood: { geo: hoodGeo, pivot: v3(0, yc, -hoodBackU) },
    lampHead: lensGeo(0.14, 0.05, 0.045, true),
    lampTail: lensGeo(0.16, 0.045, 0.04, false),
    headPos,
    tailPos,
    plate: plateGeo(),
    platePos: [v3(0, st.bumperY, -(bumperZ + 0.003)), v3(0, st.bumperY, bumperZ + 0.003)],
    wheels: [],
    wheelR: R,
    wheelW: wTyre,
    sections: st.secs.length,
  };
  for (const s of [-1, 1]) {
    parts.wheels.push({ x: s * wx, z: -axleF, front: true });
    parts.wheels.push({ x: s * wx, z: -axleR, front: false });
  }

  if (type === 'cop') {
    parts.lightbar = {
      lens: new THREE.BoxGeometry(0.52, 0.1, 0.28),
      a: v3(-0.29, roofY + 0.085, -copBarU),
      b: v3(0.29, roofY + 0.085, -copBarU),
    };
    liveryUV(parts.paint, L);
    liveryUV(parts.hood!.geo, L);
  }
  return parts;
}

// ---------------------------------------------------------------- box truck

/** [u, roof height, belt height, roof half-width fraction] for the cab, metres. */
const TRUCK_CAB_SECS: [number, number, number, number][] = [
  [1.25, 2.72, 1.85, 0.95],
  [1.8, 2.74, 1.85, 0.95],
  [2.8, 2.74, 1.85, 0.95],
  [2.95, 2.68, 1.85, 0.94],
  [3.1, 2.38, 1.85, 0.93],
  [3.3, 2.0, 1.85, 0.92],
  [3.38, 1.96, 1.85, 0.92],
];

function buildTruckParts(spec: VehicleSpec): CarParts {
  const { length: L, width: W, height: H } = spec;
  const R = 0.5;
  const ww = 0.3;
  const sill = 0.7;
  const arch = archOf(R, sill);
  const Wc2 = (W - 0.12) / 2;      // cab half-width
  const Wg2 = (W - 0.04) / 2;      // cargo half-width
  const uF = L / 2 - 0.12;         // cab nominal front
  const uB = TRUCK_CAB_SECS[0][0]; // cab back
  const axleF = L / 2 - 1.0;
  const axleR = -L / 2 + 1.35;

  // ---- cab hull
  const secs = TRUCK_CAB_SECS.map(([u, yT, yB, wr], i, a) => [i === 0 ? uB : i === a.length - 1 ? uF : u, yT, yB, wr] as const);
  const su = secs.map((s) => s[0]);
  const fyT = monotone(su, secs.map((s) => s[1]));
  const fyBelt = monotone(su, secs.map((s) => s[2]));
  const fwR = monotone(su, secs.map((s) => s[3]));
  const drF = 0.25;
  const drB = 0.1;
  const ring = (u: number): CarRing => {
    const dF = uF - u;
    const dB = u - uB;
    const front = dF < dB;
    const d = Math.min(dF, dB);
    const dr = front ? drF : drB;
    const g = endG(d, dr);
    const t = clamp(d / dr, 0, 1);
    const drop = 0.04 * (1 - g);
    let yBot = Math.max(sill, archY(arch, u - axleF));
    yBot = Math.max(yBot, sill + (front ? 0.18 : 0) * (1 - t) * (1 - t));
    const yBelt = fyBelt(u) - drop;
    yBot = Math.min(yBot, yBelt - 0.2);
    const wMax = Wc2 * (0.88 + 0.12 * g);
    return { yT: fyT(u) - drop, yBelt, yBot, wMax, wR: fwR(u) * wMax };
  };
  const ws: V2 = [3.3, 2.82];
  const doors: V2[] = [[3.05, 2.1], [1.95, 1.5]];
  const bp: V2 = [2.1, 1.95];
  const seams = [3.1, 2.02];
  const cabCls = (um: number, j: number): Kind => {
    if (inI(um, ws) && j <= 1) return 'glass';
    if (inI(um, bp) && j >= 3 && j <= 5) return 'dark';
    if (j >= 3 && j <= 5 && doors.some((d) => inI(um, d)) && (!inI(um, ws) || j >= 4)) return 'glass';
    if (j >= 10) return 'dark';
    return 'paint';
  };
  const want: number[] = [...su];
  for (const t of END_T) want.push(uF - t * drF, uB + t * drB);
  want.push(...archStations(arch, axleF));
  const us = stationList([uF, uB, ...ws, ...doors.flat(), ...bp, ...seams], want, 0.4);
  const cab = buildLoft({ us, half: (u) => carHalf(ring(u)), creases: [CAR_CREASE], cls: cabCls });
  const trF = ring(uF);

  // ---- cargo box hull
  const cargoBack = -L / 2 + 0.06;
  const cargoFront = uB - 0.05;
  const boxRing = (u: number): V2[] => {
    const d = Math.min(cargoFront - u, u - cargoBack);
    const g = endG(d, 0.1);
    const s = 1 - 0.06 * (1 - g);
    return boxHalf(Wg2 * s, 1.16 + 0.05 * (1 - g), H - 0.06 - 0.05 * (1 - g), 0.07);
  };
  const boxUs = stationList([cargoBack, cargoFront], END_T.flatMap((t) => [cargoBack + t * 0.1, cargoFront - t * 0.1]), 8);
  const box = buildLoft({ us: boxUs, half: boxRing, creases: [], cls: () => 'paint' });

  const paint = new Acc().add(cab.paint);
  const paint2 = new Acc().add(box.paint);
  const trim = new Acc().add(cab.dark).add(box.dark);
  const chrome = new Acc();
  const glass = new Acc().add(cab.glass);
  if (cab.inner.attributes.position) trim.add(cab.inner);

  cabinTrim(cab, chrome, trim, { ws, doors, rg: null, seams });
  const sideX = (u: number, y: number): number => {
    const h = carHalf(ring(u));
    for (let j = 7; j < 11; j++) {
      const [x0, y0] = h[j];
      const [x1, y1] = h[j + 1];
      if (y <= y0 && y >= y1) return lerp(x1, x0, (y - y1) / (y0 - y1));
    }
    return h[9][0];
  };
  for (const hu of [2.3]) {
    const yH = 1.72;
    const cap = new THREE.CapsuleGeometry(0.016, 0.16, 3, 6);
    cap.rotateX(Math.PI / 2);
    cap.translate(sideX(hu, yH) + 0.016, yH, -hu);
    chrome.addBoth(cap);
  }

  // ---- wheel liners and interior
  const wx = W / 2 - 0.04 - 0.52 * ww;
  trim.addBoth(wheelLiner(arch, wx - 0.52 * ww - 0.03, Wc2 - 0.01, -axleF));
  trim.add(bx(2 * Wc2 * 0.8, 0.3, 0.4, 0, 1.55, -(ws[0] - 0.3)));
  for (const s of [-1, 1]) {
    trim.add(bx(0.5, 0.8, 0.18, s * 0.4, 1.7, -(uB + 0.7)));
    trim.add(bx(0.5, 0.2, 0.55, s * 0.4, 1.3, -(uB + 1.0)));
  }

  // ---- mirrors on stalks (dark housings, chrome rim)
  for (const s of [-1, 1]) {
    trim.add(bx(0.1, 0.4, 0.17, s * (Wc2 + 0.07), 2.1, -(doors[0][0] - 0.02)));
    chrome.add(bx(0.11, 0.025, 0.18, s * (Wc2 + 0.07), 2.31, -(doors[0][0] - 0.02)));
    trim.add(bx(0.12, 0.03, 0.03, s * (Wc2 + 0.03), 2.22, -(doors[0][0] - 0.02)));
    trim.add(bx(0.12, 0.03, 0.03, s * (Wc2 + 0.03), 1.95, -(doors[0][0] - 0.02)));
    // door step
    trim.add(bx(0.18, 0.04, 0.5, s * (Wc2 + 0.02), 0.95, -2.7));
  }

  // ---- fascia: bumper, grille, lamps
  trim.add(bumperGeo(2 * Wc2, 0.28, 0.3, 0.62, -(L / 2 - 0.28), false));
  trim.add(bx(2 * Wc2 * 0.78, 0.5, 0.02, 0, trF.yBot + 0.34, -(uF + 0.006)));
  for (let k = 0; k < 5; k++) chrome.add(bx(2 * Wc2 * 0.78, 0.016, 0.016, 0, trF.yBot + 0.14 + k * 0.1, -(uF + 0.018)));
  chrome.add(bx(2 * Wc2 * 0.8, 0.03, 0.025, 0, trF.yBot + 0.6, -(uF + 0.01)));
  chrome.add(bx(2 * Wc2 * 0.8, 0.03, 0.025, 0, trF.yBot + 0.08, -(uF + 0.01)));
  chrome.add(cylZ(0.05, 0.014, 0, trF.yBot + 0.34, -(uF + 0.022), 16));
  const headY = 1.1;
  const hx = trF.wMax - 0.22;
  const headPos: LampDef[] = [
    { pos: v3(-hx, headY, -uF), yaw: 0.1 },
    { pos: v3(hx, headY, -uF), yaw: -0.1 },
  ];
  const tailPos: LampDef[] = [
    { pos: v3(-(Wg2 - 0.14), 1.0, L / 2 - 0.06), yaw: 0 },
    { pos: v3(Wg2 - 0.14, 1.0, L / 2 - 0.06), yaw: 0 },
  ];
  for (const l of headPos) {
    const m = new THREE.Matrix4().makeRotationY(l.yaw).setPosition(l.pos);
    chrome.add(bezelGeo(0.2, 0.12).applyMatrix4(m));
    trim.add(new THREE.CircleGeometry(1, 20).scale(0.2, 0.12, 1).rotateY(Math.PI).applyMatrix4(m));
  }
  for (const l of tailPos) {
    const m = new THREE.Matrix4().makeRotationY(l.yaw).setPosition(l.pos);
    chrome.add(bezelGeo(0.09, 0.17).applyMatrix4(m));
    trim.add(new THREE.CircleGeometry(1, 20).scale(0.09, 0.17, 1).applyMatrix4(m));
  }

  // ---- chassis, fuel tank, rear bar, mudflaps
  trim.add(bx(1.7, 0.5, L - 0.9, 0, 0.85, 0.05));
  trim.add(bx(2 * Wg2 - 0.3, 0.14, 0.2, 0, 0.72, L / 2 - 0.1)); // rear underride bar
  trim.add(cylX(0.22, 0.8, Wc2 - 0.4, 0.8, 0.8, 14));
  for (const s of [-1, 1]) trim.add(bx(0.02, 0.4, 0.36, s * (W / 2 - 0.08), 0.42, -axleR + 0.6));
  chrome.add(cylZ(0.05, 0.1, Wc2 - 0.3, 0.55, L / 2 - 0.02, 8));

  // ---- cargo box details: roll-up door lines (rear), side ribs
  const rz = -cargoBack + 0.006;
  for (let y = 1.45; y <= 3.05; y += 0.145) trim.add(bx(2 * Wg2 - 0.4, 0.016, 0.012, 0, y, rz));
  for (const s of [-1, 1]) {
    trim.add(bx(0.03, 1.7, 0.012, s * (Wg2 - 0.2), 2.25, rz));
    for (const u of [-2.8, -1.6, -0.4, 0.8]) trim.add(bx(0.014, 1.85, 0.03, s * (Wg2 + 0.004), 2.2, -u));
    trim.add(bx(0.016, 0.03, 4.4, s * (Wg2 + 0.004), 1.25, 0.6));
  }
  trim.add(bx(0.34, 0.07, 0.04, 0, 1.55, rz));

  const parts: CarParts = {
    paint: paint.merge(),
    paint2: paint2.merge(),
    glass: glass.merge(),
    trim: trim.merge(),
    chrome: chrome.merge(),
    lampHead: lensGeo(0.19, 0.11, 0.06, true),
    lampTail: lensGeo(0.08, 0.16, 0.05, false),
    headPos,
    tailPos,
    plate: plateGeo(),
    platePos: [v3(0, 0.62, -(L / 2 + 0.003)), v3(0, 0.95, L / 2 + 0.003)],
    wheels: [],
    wheelR: R,
    wheelW: ww,
    sections: TRUCK_CAB_SECS.length,
  };
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
