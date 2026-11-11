/**
 * Procedural car bodies: a small lofting toolkit and the per-style side / plan profiles.
 *
 * Local frame: forward is -z, +x is the car's right, y up (core/Math2.ts). Shapes are authored in (u, y) with u the distance
 * along the car (+u = front), so world z = -u.
 *
 * Toolkit: a hull is a stack of closed cross-sections (rings) along the length, joined into quads with smooth vertex normals.
 * Each style table gives the SIDE profile (roof / belt height per station: hood line, windshield rake, roof, rear glass, deck),
 * the PLAN profile (half-width per station: nose taper, rear taper) and the cross-section rounding (tumblehome, shoulder
 * crease). Wheel arches are real cut-outs in the lower edge of the rings, window quads are carved out of the paint hull and
 * re-emitted as glass inset into the body. Everything is merged per material (paint / glass / trim / chrome), so a car body
 * is 4 meshes (+ hood, lamps, plate, wheels, see carModel.ts).
 *
 * Geometry is built once per (style, length, width, height) and cached by carModel.ts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleSpec, VehicleType } from '@/world/types';

export type V2 = [number, number];
const { lerp, clamp } = THREE.MathUtils;

// ---------------------------------------------------------------- geometry helpers

/** Collects geometries (converted to non-indexed position/normal/uv) and merges them into one. */
export class Acc {
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
  /** Merges everything; with `color` the result also carries a uniform per-vertex `color` attribute (trim + chrome share one mesh). */
  merge(color?: number): THREE.BufferGeometry {
    const m = mergeGeometries(this.geos, false);
    if (!m) throw new Error('carModel: merge failed');
    for (const g of this.geos) g.dispose();
    if (color !== undefined) {
      const c = new THREE.Color(color);
      const n = m.attributes.position.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      m.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    return m;
  }
}

/** Dark plastic and bright chrome merged into ONE vertex-coloured geometry (one draw call instead of two). */
export const TRIM_DARK = 0x16181b;
export const TRIM_CHROME = 0xd2d7dd;
export function mergeTrim(dark: Acc, chrome: Acc): THREE.BufferGeometry {
  const parts = [dark.merge(TRIM_DARK)];
  if (chrome.size > 0) parts.push(chrome.merge(TRIM_CHROME));
  const m = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!m) throw new Error('carBodies: trim merge failed');
  if (parts.length > 1) for (const g of parts) g.dispose();
  return m;
}

/** Mirror across x = 0 (new geometry, winding fixed). */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
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

export function bx(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Cylinder along the x axis. */
export function cylX(r: number, len: number, x: number, y: number, z: number, seg = 10, r2 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Cylinder along the z axis. */
export function cylZ(r: number, len: number, x: number, y: number, z: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Flat dark decal facing the rear (+z), `w` wide and `h` tall, 2 triangles. */
export function decalZ(w: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h).translate(x, y, z);
}

/** Flat dark decal on a flank facing outward (`side` +1 right / -1 left), `d` long (along z) and `h` tall. */
export function decalX(d: number, h: number, side: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(d, h).rotateY(side * Math.PI / 2).translate(x, y, z);
}

export function v3(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(x, y, z); }

/** Flat strip along a polyline lying on a surface: `nrm` are surface normals, `off` lifts it off the surface. */
export function ribbon(pts: THREE.Vector3[], nrm: THREE.Vector3[], w: number, off: number): THREE.BufferGeometry {
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
export function slab(u0: number, y0: number, u1: number, y1: number, thick: number, width: number, x = 0): THREE.BufferGeometry {
  const du = u1 - u0;
  const dy = y1 - y0;
  const g = new THREE.BoxGeometry(width, Math.hypot(du, dy), thick);
  g.rotateX(Math.atan2(-du, dy));
  g.translate(x, (y0 + y1) / 2, -(u0 + u1) / 2);
  return g;
}

/** Flip a geometry inside-out (reverse winding and normals), keeping it non-indexed. */
export function inverted(g: THREE.BufferGeometry): THREE.BufferGeometry {
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
export function bumperGeo(width: number, depth: number, height: number, y: number, z: number, rear: boolean): THREE.BufferGeometry {
  // a bevelled wrap: bowed face, rounded corners, rolled top and bottom edges (was a flat extruded block)
  const r = Math.min(0.16, depth * 0.8);
  const bow = 0.05;
  width -= 0.044; // the bevel adds 2.2 cm per side
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, depth - r);
  s.quadraticCurveTo(width / 2, depth, width / 2 - r, depth);
  s.quadraticCurveTo(0, depth + bow * 2, -width / 2 + r, depth);
  s.quadraticCurveTo(-width / 2, depth, -width / 2, depth - r);
  s.closePath();
  const bev = 0.022;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: height - 2 * bev - 0.02, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 5,
  });
  g.translate(0, -(bow + bev), bev + 0.01); // keep the front-most point where the old block ended
  g.rotateX(-Math.PI / 2); // shape y -> world -z (forward), extrude z -> world y
  if (rear) g.rotateY(Math.PI);
  g.translate(0, y - height / 2, z);
  return g;
}

/** Monotone cubic interpolant through (xs ascending, ys). */
export function monotone(xs: number[], ys: number[]): (x: number) => number {
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

/** what a hull quad becomes: 'none' leaves it out of every mesh (hidden under the hood panel / underside) */
export type Kind = 'paint' | 'glass' | 'dark' | 'none';

export interface LoftSpec {
  /** station positions along the car, ascending (rear -> front) */
  us: number[];
  /** right half of the ring at u: from top centre down to bottom centre (x >= 0). Same length every call. */
  half: (u: number) => V2[];
  /** half-ring indices whose vertex is duplicated so the surface has a hard crease there */
  creases: number[];
  /** what a quad (station interval midpoint, half-ring segment j = idx j -> j+1) is made of */
  cls: (um: number, j: number, left: boolean) => Kind;
  /** rings at both ends are closed with a flat cap */
  caps?: boolean;
  /** 2 = every ring segment is split in two with a smooth 4-point scheme (crease corners stay sharp); P/N/cls keep the original slot numbering */
  refine?: 1 | 2;
}

export interface Hull {
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

export function buildLoft(spec: LoftSpec): Hull {
  const { us } = spec;
  const S = us.length;
  const rf = spec.refine ?? 1;
  const crease0 = spec.creases[0] ?? 99;
  const refineHalf = (h: V2[]): V2[] => {
    const out: V2[] = [];
    const at = (j: number, a: number): V2 => {
      // ghost points: mirrored across x = 0 at the ends, straight continuation across the crease corner
      if (j < 0) return [-h[-j][0], h[-j][1]];
      if (j > h.length - 1) { const e = 2 * (h.length - 1) - j; return [-h[e][0], h[e][1]]; }
      void a;
      return h[j];
    };
    for (let j = 0; j < h.length - 1; j++) {
      out.push(h[j]);
      let p0 = at(j - 1, 0), p3 = at(j + 2, 0);
      if (j + 1 === crease0) p3 = [2 * h[j + 1][0] - h[j][0], 2 * h[j + 1][1] - h[j][1]];
      if (j === crease0) p0 = [2 * h[j][0] - h[j + 1][0], 2 * h[j][1] - h[j + 1][1]];
      const p1 = h[j], p2 = h[j + 1];
      out.push([(-p0[0] + 9 * p1[0] + 9 * p2[0] - p3[0]) / 16, (-p0[1] + 9 * p1[1] + 9 * p2[1] - p3[1]) / 16]);
    }
    out.push(h[h.length - 1]);
    return out;
  };
  const halves = us.map((u) => (rf === 2 ? refineHalf(spec.half(u)) : spec.half(u)));
  const n = halves[0].length;
  const M = 2 * n - 2;
  const creases = spec.creases.map((c) => c * rf);
  // columns: one per ring slot, creased slots get an upper (cu) and a lower (cl) column
  const creaseSet = new Set<number>();
  for (const c of creases) { creaseSet.add(c); creaseSet.add(M - c); }
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
  const crease = creases[0] ?? 99;

  const all: number[] = [];
  const byKind: Record<Kind, number[]> = { paint: [], glass: [], dark: [], none: [] };
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
      const kind = spec.cls(um, Math.floor(j / rf), k >= n - 1);
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
    P: (i, s0) => { const s = Math.round(s0 * rf) % M; const o = (i * C + cu[s]) * 3; return v3(pos[o], pos[o + 1], pos[o + 2]); },
    N: (i, s0) => { const s = Math.round(s0 * rf) % M; const o = (i * C + cu[s]) * 3; return v3(nor[o], nor[o + 1], nor[o + 2]).normalize(); },
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
export function stationList(must: number[], want: number[], maxGap: number): number[] {
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

const END_T = [0, 0.3, 1];

/** Smooth rounding of a body end: 0 at the tip -> 1 at distance `dr` (quarter-circle profile). */
export function endG(d: number, dr: number): number {
  const t = clamp(d / dr, 0, 1);
  return Math.sqrt(1 - (1 - t) * (1 - t));
}

/** Passenger-car half ring: roof centre -> belt -> sill (13 points, crease between idx 6 and 7). */
export interface CarRing {
  yT: number; yBelt: number; yBot: number; wMax: number; wR: number;
  /** vans: top of the side glass (the band between it and the belt is the only glass); the wall above is paint */
  yGl?: number;
}
const CAR_CREASE = 6;
export function carHalf(r: CarRing): V2[] {
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
  let p4: V2 = [wl(0.86), yl(0.86)];
  let p5: V2 = [wl(0.4), yl(0.4)];
  if (r.yGl !== undefined && r.yGl < yR - 0.05) {
    const at = (y: number): V2 => { const t = clamp((y - yG0) / (yR - yG0), 0, 1); return [lerp(wG0, wR, t) + bulge * Math.sin(Math.PI * t), y]; };
    p4 = at(r.yGl);
    p5 = at((r.yGl + yG0) / 2);
  }
  return [
    [0, r.yT],
    [wR * 0.5, r.yT - crown * 0.25],
    [wR * 0.88, r.yT - crown * 0.77],
    [wR, yR],
    p4,
    p5,
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
export function boxHalf(wMax: number, yBot: number, yTop: number, rad: number): V2[] {
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

// ---------------------------------------------------------------- per-type parts (cached)


export interface CarParts {
  paint: THREE.BufferGeometry;
  /** truck cargo box (white paint) */
  paint2?: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  /** dark plastic + chrome in one vertex-coloured geometry */
  trim: THREE.BufferGeometry;
  hood?: { geo: THREE.BufferGeometry; pivot: THREE.Vector3 };
  /** all head lamps (+ the cab's roof light) / all tail lamps, car space */
  lampHead: THREE.BufferGeometry;
  lampTail: THREE.BufferGeometry;
  /** every licence plate (front first) in one geometry */
  plate: THREE.BufferGeometry;
  wheels: { x: number; z: number; front: boolean }[];
  wheelR: number;
  wheelW: number;
  /** rear axle runs dual tyres (an inner tyre per side, same mesh instances) */
  dualRear?: boolean;
  lightbar?: { lens: THREE.BufferGeometry; a: THREE.Vector3; b: THREE.Vector3 };
  /** number of cross-sections of the main hull */
  sections: number;
  /** where per-car extras (roof gear, stickers, decals) attach, car space (carExtras.ts) */
  anchors?: CarAnchors;
}

export interface CarAnchors {
  /** flat roof: height, front / rear u (car space: +u forward, z = -u) and half width at the roof edge */
  roof: { y: number; u0: number; u1: number; hw: number };
  /** rear bumper: z (+ = back), y and half width */
  rear: { z: number; y: number; hw: number };
  /** quads on the windshield / rear glass (4 corners each, 0.006 off the surface) */
  wsQuad: THREE.Vector3[] | null; rgQuad: THREE.Vector3[] | null;
  /** hood front centre (medallion), bumper top y */
  hoodFront: THREE.Vector3;
  /** bus: destination sign centre; trucks: unused */
  sign?: THREE.Vector3;
  /** exhaust tip x */
  exX: number;
}


/** Half-ellipsoid lens facing -z (front) or +z (rear): 10 x 2 segments, 30 triangles. */
export function lensGeo(rx: number, ry: number, rz: number, front: boolean): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 10, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(front ? -Math.PI / 2 : Math.PI / 2);
  g.scale(rx, ry, rz);
  return g;
}

/** Moves a lamp geometry to `pos`, turned by `yaw` about y (car space). */
export function placeLamp(g: THREE.BufferGeometry, pos: THREE.Vector3, yaw: number): THREE.BufferGeometry {
  return g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(pos));
}

export const PLATE_W = 0.34;
export const PLATE_H = 0.17;
/** Licence plates in one geometry (they share the plate texture): the first faces front (-z), the others rear (+z). */
export function platesGeo(at: THREE.Vector3[]): THREE.BufferGeometry {
  const acc = new Acc();
  at.forEach((p, i) => {
    const g = new THREE.PlaneGeometry(PLATE_W, PLATE_H);
    if (i === 0) g.rotateY(Math.PI);
    acc.add(g.translate(p.x, p.y, p.z));
  });
  return acc.merge();
}

/** Re-map UVs so the cop livery lays out once along the car's length (text reads correctly on both flanks). */
export function liveryUV(g: THREE.BufferGeometry, L: number): void {
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

/** Plain strip at the top of the cargo livery canvas (mirrors CARGO_PLAIN_STRIP in painters/vehicle.ts; a test pins them together). */
export const CARGO_STRIP = 0.03;

/**
 * Re-map the cargo box UVs onto the livery canvas: both flanks lay the livery out once along the box (nose to the viewer's right
 * on each side, so the text reads correctly), v runs sill to roof inside the art area. Roof and underside sample the plain strip.
 * The ends reuse the nearest column of the livery (base colour and grime).
 */
export function boxLiveryUV(g: THREE.BufferGeometry, strip = CARGO_STRIP): void {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const L = Math.max(1e-6, bb.max.z - bb.min.z), Hh = Math.max(1e-6, bb.max.y - bb.min.y);
  const pos = g.attributes.position, nor = g.attributes.normal;
  let uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2); g.setAttribute('uv', uv); }
  const vMax = 1 - 2 * strip;
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i);
    if (Math.abs(nx) < 0.3 && Math.abs(ny) > 0.7) { uv.setXY(i, 0.5, 1 - strip / 2); continue; }
    const z = pos.getZ(i);
    const uu = nx < 0 ? (z - bb.min.z) / L : (bb.max.z - z) / L;
    const vv = Math.min(vMax, Math.max(0, ((pos.getY(i) - bb.min.y) / Hh) * vMax));
    uv.setXY(i, Math.min(1, Math.max(0, uu)), vv);
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------- passenger cars

export interface Style {
  Lref: number; Href: number;
  sill: number; wheelR: number; wheelW: number;
  /** |u| of the axles (ref m) */
  axle: number;
  /** [u, roof/deck height centre, belt height, roof half-width as a fraction of body half-width] (ref m) */
  secs: [number, number, number, number][];
  windshield: V2; doorGlass: V2[]; bPillar: V2; rearGlass: V2 | null;
  seams: number[]; handles: number[];
  hoodBack: number;
  /** lowest half-ring segment index that is black plastic cladding (SUV skirts) */
  clad: number;
  rails: boolean; spoiler: boolean;
  /** longest gap (ref m) between hull stations; boxy styles (SUV) tolerate more, which is where their triangle budget comes from */
  maxGap?: number;
  /** hull stations across each wheel arch (default 4) */
  archN?: number;
  /** end-rounding stations as fractions of the rounded end length (default END_T) */
  endT?: number[];
  bumperY: number; bumperH: number;
  /** PLAN profile: [u, half-width factor] along the car (nose / tail taper, fenders), ref metres; linear between entries */
  plan: [number, number][];
  /** real overall size (m) of a roster body; without it the vehicle spec's size is used */
  dims?: { L: number; W: number; H: number };
  /** lamp and grille character of the real type */
  headLamp?: 'quad' | 'slit' | 'wedge' | 'c' | 'swept' | 'box' | 'angular' | 'blade' | 'round2';
  tailLamp?: 'bar' | 'loop' | 'tall' | 'box2' | 'camryT' | 'tri' | 'lshape';
  grille?: 'bars' | 'mesh' | 'wedge' | 'slats' | 'kidney' | 'bigbar';
  /** tailgate body (hatch, van, SUV): no boot lid, no rear bench, a tailgate cut line instead */
  hatchback?: boolean;
  /** vans: height of the top of the side glass (m); the wall above it is paint */
  glassTop?: number;
  /** absolute lamp centre heights (m) when the default (fascia top minus a constant) does not fit */
  headY?: number; tailY?: number;
  /** lamp distance back from the nose / tail tip (m): the lamp is set on the rounded corner, turned to follow the plan curve (swept back) */
  lampD?: number; tailD?: number; lampInset?: number;
  /** end rounding lengths (m) of the nose / tail (default 0.5 / 0.4) and grille half-width as a fraction of the nose width (default 0.8) */
  endF?: number; endR?: number; grilleW?: number;
  /** big upright van mirrors on the A pillar */
  mirror?: 'van';
  /** open pickup bed (ref m): front wall u0, tailgate u1 (u1 < u0), floor height; the loft's top slots are left open there */
  bed?: { u0: number; u1: number; floor: number };
  /** passenger vans: more side windows (the dollar van) */
  windowed?: boolean;
}

export type PassengerStyle = 'sedan' | 'coupe' | 'suv' | 'cop' | 'cab' | 'cargo' | 'hatch' | 'beater' | 'pickup' | 'crossover' | 'minivan' | 'luxury' | 'towncar' | 'pony' | 'ambulance' | 'dollar'
  | 'coupe911' | 'exotic' | 'jdmcoupe' | 'hothatch' | 'muscle' | 'wedgetruck' | 'evsedan';
export type StyleKey = 'sedan' | 'coupe' | 'suv' | 'crown' | 'charger' | 'cargo' | 'hatch' | 'beater' | 'pickup' | 'crossover' | 'minivan' | 'luxury' | 'towncar' | 'pony' | 'dollar'
  | 'coupe911' | 'exotic' | 'jdmcoupe' | 'hothatch' | 'muscle' | 'wedgetruck' | 'evsedan';
export const STYLES: Record<StyleKey, Style> = {
  // "Kamari": a mid-size front-drive sedan of the Toyota Camry type (XV70, 2018-): length 4,879-4,885 mm (192.1 in), wheelbase 2,825 mm
  // (111.2 in), width 1,840 mm (72.4 in), height 1,445-1,455 mm. VEHICLE_SPECS.sedan carries the same size.
  // Sources: https://www.vehiclesizes.com/cars/toyota/camry/camry-viii-xv70-sedan-2018/combined-view , https://auto-data.net/en/toyota-camry-viii-xv70-2.5-181hp-automatic-39090
  sedan: {
    Lref: 4.6, Href: 1.4,
    sill: 0.2, wheelR: 0.34, wheelW: 0.225,
    axle: 1.33,
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
    doorGlass: [[0.68, -0.045], [-0.075, -1.05]],
    bPillar: [-0.045, -0.075],
    rearGlass: [-1.05, -1.62],
    seams: [0.6, -0.08, -0.9],
    handles: [0.02, -0.8],
    hoodBack: 0.92,
    clad: 11,
    rails: false, spoiler: true, maxGap: 0.22, archN: 8,
    headLamp: 'swept', tailLamp: 'camryT', grille: 'wedge', lampD: 0.2, tailD: 0.1, grilleW: 0.5,
    bumperY: 0.34, bumperH: 0.22,
    plan: [[-2.3, 0.9], [-1.7, 0.97], [-0.9, 1], [0.9, 1], [1.7, 0.98], [2.3, 0.92]],
  },
  // ROSTER (CARHI step 2). Proportions checked against public spec listings (WebSearch, 9 Nov 2026):
  // "Crown Regent": a full-size body-on-frame 3-box sedan of the Ford Crown Victoria type (2003-2011): length 212.0 in (5.39 m),
  // wheelbase 114.7 in (2.91 m), width 78.2 in (1.99 m, no mirrors), height 56.8 in (1.44 m). Upright greenhouse, long trunk, tall belt.
  // Sources: https://www.edmunds.com/ford/crown-victoria/2003/features-specs/?sub=sedan , https://www.autopadre.com/vehicle-dimensions/ford-crown-victoria/2011-s-22335
  crown: {
    Lref: 5.39, Href: 1.44,
    sill: 0.2, wheelR: 0.34, wheelW: 0.235,
    axle: 1.455,
    secs: [
      [-2.69, 1.0, 0.92, 0.93],
      [-2.35, 1.05, 0.98, 0.93],
      [-1.9, 1.08, 1.0, 0.92],
      [-1.5, 1.12, 1.0, 0.88],
      [-1.25, 1.3, 1.0, 0.8],
      [-0.95, 1.42, 1.0, 0.74],
      [-0.35, 1.44, 1.0, 0.73],
      [0.2, 1.43, 1.0, 0.74],
      [0.5, 1.33, 1.0, 0.78],
      [0.9, 1.1, 0.99, 0.88],
      [1.4, 1.02, 0.96, 0.93],
      [2.0, 0.98, 0.92, 0.93],
      [2.45, 0.93, 0.86, 0.92],
      [2.69, 0.88, 0.8, 0.92],
    ],
    windshield: [0.92, 0.2],
    doorGlass: [[0.8, 0.0], [-0.035, -0.97]],
    bPillar: [0.0, -0.035],
    rearGlass: [-1.02, -1.5],
    seams: [0.86, -0.08, -1.05],
    handles: [0.08, -0.82],
    hoodBack: 0.96,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.2, archN: 8,
    bumperY: 0.36, bumperH: 0.24,
    plan: [[-2.7, 0.9], [-2.1, 0.97], [-1, 1], [1, 1], [2.1, 0.98], [2.7, 0.92]],
    dims: { L: 5.39, W: 1.99, H: 1.44 },
    headLamp: 'quad', tailLamp: 'bar', grille: 'bars',
  },
  // "Charge-R": a current-generation large rear-drive sedan of the Dodge Charger type (2015-): length 198.4 in (5.04 m), wheelbase
  // 120.2 in (3.05 m), width 75.0 in (1.91 m), height 58.2 in (1.48 m). Long hood, high belt line, short deck, fast C pillar.
  // Sources: https://www.autopadre.com/vehicle-dimensions/dodge-charger/2015-police-18449 , https://www.autoblog.com/buy/2015-Dodge-Charger-R_T__4dr_Rear_wheel_Drive_Sedan/specs/
  charger: {
    Lref: 5.04, Href: 1.48,
    sill: 0.2, wheelR: 0.35, wheelW: 0.245,
    axle: 1.525,
    secs: [
      [-2.52, 1.02, 0.96, 0.9],
      [-2.2, 1.08, 1.0, 0.9],
      [-1.8, 1.12, 1.02, 0.86],
      [-1.4, 1.28, 1.02, 0.78],
      [-1.0, 1.41, 1.02, 0.72],
      [-0.4, 1.48, 1.02, 0.7],
      [0.15, 1.45, 1.02, 0.71],
      [0.55, 1.3, 1.02, 0.76],
      [0.95, 1.13, 1.0, 0.86],
      [1.5, 1.08, 0.98, 0.93],
      [2.0, 1.04, 0.95, 0.93],
      [2.35, 0.97, 0.9, 0.93],
      [2.52, 0.92, 0.85, 0.93],
    ],
    windshield: [0.95, 0.25],
    doorGlass: [[0.82, -0.04], [-0.075, -1.05]],
    bPillar: [-0.04, -0.075],
    rearGlass: [-1.1, -1.7],
    seams: [0.88, -0.07, -1.12],
    handles: [0.1, -0.85],
    hoodBack: 1.0,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.2, archN: 8,
    bumperY: 0.36, bumperH: 0.24,
    plan: [[-2.55, 0.9], [-2, 0.98], [-1, 1], [1, 1], [2, 0.98], [2.55, 0.92]],
    dims: { L: 5.04, W: 1.91, H: 1.48 },
    headLamp: 'slit', tailLamp: 'loop', grille: 'mesh',
  },
  // two-door fastback: cabin pushed back, long hood, steep windshield, sloping rear glass
  coupe: {
    Lref: 4.6, Href: 1.4,
    sill: 0.19, wheelR: 0.34, wheelW: 0.235,
    axle: 1.4,
    secs: [
      [-2.26, 0.95, 0.92, 0.93],
      [-1.95, 0.99, 0.96, 0.93],
      [-1.6, 1.05, 0.98, 0.9],
      [-1.2, 1.2, 0.98, 0.82],
      [-0.7, 1.34, 0.98, 0.75],
      [-0.2, 1.4, 0.98, 0.72],
      [0.3, 1.37, 0.98, 0.74],
      [0.65, 1.2, 0.975, 0.82],
      [0.95, 1.02, 0.96, 0.9],
      [1.4, 0.99, 0.93, 0.93],
      [1.85, 0.93, 0.87, 0.93],
      [2.1, 0.88, 0.82, 0.93],
      [2.26, 0.84, 0.78, 0.93],
    ],
    windshield: [0.95, 0.3],
    doorGlass: [[0.9, -0.5], [-0.66, -1.0]],
    bPillar: [-0.5, -0.66],
    rearGlass: [-1.0, -1.5],
    seams: [0.86, -0.6, -1.02],
    handles: [-0.3],
    hoodBack: 0.98,
    clad: 11,
    rails: false, spoiler: true, headLamp: 'wedge', tailLamp: 'bar',
    bumperY: 0.33, bumperH: 0.21,
    plan: [[-2.3, 0.9], [-1.7, 0.98], [-0.9, 1], [0.9, 1], [1.8, 0.97], [2.3, 0.9]],
  },
  // "Expedio": a mid-size three-row SUV of the Ford Explorer type (2020-): length 5,049 mm (198.8 in), wheelbase 3,025 mm (119.1 in),
  // width 2,004 mm (78.9 in, without mirrors), height 1,778 mm (70 in). VEHICLE_SPECS.suv carries the same size.
  // Sources: https://cars-data.com/en/ford/explorer/dimensions , https://www.autopadre.com/vehicle-dimensions/ford-explorer/2020-base-19934
  suv: {
    Lref: 4.9, Href: 1.8,
    sill: 0.26, wheelR: 0.38, wheelW: 0.25,
    axle: 1.468,
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
    doorGlass: [[0.95, 0.03], [-0.005, -1.05], [-1.05, -1.85]],
    bPillar: [0.03, -0.005],
    rearGlass: [-1.95, -2.38],
    seams: [0.92, -0.06, -0.98],
    handles: [0.0, -0.86],
    hoodBack: 1.22,
    clad: 10,
    rails: true, spoiler: false, maxGap: 0.4, archN: 6, headLamp: 'c', tailLamp: 'tall', tailD: 0.05, grille: 'slats', endT: [0, 1],
    bumperY: 0.45, bumperH: 0.28,
    plan: [[-2.45, 0.94], [-2.0, 0.99], [-1.0, 1], [1.0, 1], [2.0, 0.99], [2.45, 0.95]],
  },
  // ROSTER. "Pacer Hop": a subcompact five-door hatchback of the Honda Fit type (GK, 2015-2020): length 4,064 mm (160 in), wheelbase
  // 2,530 mm (99.6 in), width 1,702 mm (67 in), height 1,524 mm (60 in). Cab-forward: short hood, long raked windshield, near-vertical tailgate.
  // Source: https://www.truedelta.com/Honda-Fit/specs-99-2015&r=4 (4dr hatch)
  hatch: {
    Lref: 4.06, Href: 1.52,
    sill: 0.2, wheelR: 0.3, wheelW: 0.195,
    axle: 1.265,
    secs: [
      [-2.03, 0.98, 0.9, 0.9],
      [-1.98, 1.12, 0.95, 0.9],
      [-1.88, 1.3, 0.98, 0.85],
      [-1.65, 1.43, 0.99, 0.8],
      [-1.25, 1.5, 0.99, 0.76],
      [-0.6, 1.52, 0.99, 0.74],
      [0.0, 1.5, 0.99, 0.74],
      [0.45, 1.42, 0.99, 0.78],
      [0.85, 1.22, 0.99, 0.85],
      [1.15, 1.07, 0.97, 0.9],
      [1.4, 1.02, 0.94, 0.93],
      [1.75, 0.97, 0.9, 0.93],
      [1.95, 0.93, 0.86, 0.92],
      [2.03, 0.88, 0.8, 0.92],
    ],
    windshield: [1.05, 0.25],
    doorGlass: [[0.9, 0.0], [-0.08, -1.2]],
    bPillar: [0.0, -0.08],
    rearGlass: [-1.25, -1.93],
    seams: [0.84, -0.04, -1.2],
    handles: [0.06, -0.95],
    hoodBack: 1.1,
    clad: 11,
    rails: false, spoiler: false, hatchback: true, maxGap: 0.24, archN: 6,
    bumperY: 0.3, bumperH: 0.2,
    plan: [[-2.05, 0.9], [-1.6, 0.97], [-0.9, 1], [0.9, 1], [1.6, 0.98], [2.05, 0.9]],
    headLamp: 'swept', tailLamp: 'tall', grille: 'wedge', lampD: 0.2, tailD: 0.1, endR: 0.2, grilleW: 0.45,
    dims: { L: 4.06, W: 1.7, H: 1.52 },
  },
  // ROSTER. "Marlow Sixty": a 1990s mid-size front-drive notchback of the Oldsmobile Cutlass Ciera type (1982-1996): length 190.3 in (4.83 m),
  // wheelbase 104.9 in (2.66 m), width 69.5 in (1.77 m), height 54.1 in (1.37 m). Boxy: flat hood, upright pillars, flat deck.
  // Source: https://en.wikipedia.org/wiki/Oldsmobile_Cutlass_Ciera (1994 sedan figures, also Edmunds / Consumer Guide)
  beater: {
    Lref: 4.83, Href: 1.37,
    sill: 0.2, wheelR: 0.3, wheelW: 0.185,
    axle: 1.332,
    secs: [
      [-2.415, 0.98, 0.93, 0.92],
      [-2.2, 1.0, 0.95, 0.92],
      [-1.9, 1.02, 0.95, 0.9],
      [-1.45, 1.06, 0.96, 0.88],
      [-1.2, 1.3, 0.96, 0.8],
      [-0.95, 1.36, 0.96, 0.76],
      [-0.4, 1.37, 0.96, 0.75],
      [0.35, 1.37, 0.96, 0.75],
      [0.62, 1.3, 0.96, 0.8],
      [0.95, 1.05, 0.95, 0.9],
      [1.4, 1.0, 0.93, 0.93],
      [1.95, 0.97, 0.9, 0.93],
      [2.3, 0.93, 0.86, 0.92],
      [2.415, 0.9, 0.82, 0.92],
    ],
    windshield: [0.95, 0.33],
    doorGlass: [[0.82, -0.02], [-0.07, -0.92]],
    bPillar: [-0.02, -0.07],
    rearGlass: [-0.98, -1.5],
    seams: [0.85, -0.05, -0.97],
    handles: [0.05, -0.72],
    hoodBack: 1.0,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.24, archN: 6,
    bumperY: 0.34, bumperH: 0.22,
    plan: [[-2.42, 0.92], [-1.9, 0.98], [-0.9, 1], [0.9, 1], [1.9, 0.99], [2.42, 0.94]],
    headLamp: 'box', tailLamp: 'box2', grille: 'slats', lampD: 0.1, tailD: 0.06, endF: 0.3, endR: 0.25, grilleW: 0.6,
    dims: { L: 4.83, W: 1.77, H: 1.37 },
  },
  // ROSTER. "Transom 350": a full-size high-roof long-wheelbase cargo van of the Ford Transit type (US 2020-): length 235.5 in (5.98 m),
  // wheelbase 148 in (3.75 m), width 81.3 in (2.06 m, no mirrors), height 109.6 in (2.78 m). Short nose, steep raked screen, slab sides.
  // Sources: https://vandimensions.com/database/ford/transit-2014 , https://www.vanguide.co.uk/?p=1480 (L3 H3: 5,931 x 2,059 x 2,780, WB 3,750)
  cargo: {
    Lref: 5.98, Href: 2.78,
    sill: 0.36, wheelR: 0.37, wheelW: 0.235,
    axle: 1.875,
    secs: [
      [-2.95, 2.55, 1.28, 0.93],
      [-2.8, 2.72, 1.3, 0.95],
      [-2.3, 2.78, 1.3, 0.95],
      [-0.5, 2.78, 1.3, 0.95],
      [0.4, 2.76, 1.3, 0.95],
      [0.7, 2.62, 1.3, 0.94],
      [1.0, 2.1, 1.3, 0.92],
      [1.8, 1.4, 1.3, 0.93],
      [1.98, 1.22, 1.17, 0.93],
      [2.4, 1.12, 1.05, 0.93],
      [2.8, 1.0, 0.9, 0.93],
      [2.95, 0.92, 0.82, 0.92],
    ],
    windshield: [1.8, 1.0],
    doorGlass: [[1.6, 0.55]],
    bPillar: [0.55, 0.48],
    rearGlass: null,
    seams: [1.62, 0.48, -0.9],
    handles: [1.2, -0.6],
    hoodBack: 1.98,
    clad: 11,
    rails: false, spoiler: false, hatchback: true, maxGap: 0.9, archN: 5, endT: [0, 1],
    glassTop: 2.0, headY: 0.86, tailY: 1.2, mirror: 'van',
    bumperY: 0.5, bumperH: 0.3,
    plan: [[-2.95, 0.96], [-2.2, 0.99], [-1, 1], [1, 1], [2.3, 0.97], [2.95, 0.88]],
    headLamp: 'angular', tailLamp: 'tall', grille: 'wedge', lampD: 0.12, tailD: 0.05, endF: 0.3, endR: 0.12, grilleW: 0.55, lampInset: 0.17,
    dims: { L: 5.98, W: 2.06, H: 2.78 },
  },
  // ---- CARS12 new types (WebSearch, 11 Nov 2026; sources in each comment)
  // "Forge 150": a full-size crew-cab pickup of the Ford F-150 SuperCrew type (2021-), 5.5 ft bed: wheelbase 145 in (3.68 m, https://epicvin.com/questions/what-are-the-dimensions-of-the-truck-bed-on-the-ford-f-150-supercrew-with-a-145-inch-wheelbase),
  // bed 67.1 in x 50.6 in x 21.4 in (https://www.truckranch.com/2021-ford-f-150-bed-size/); overall 231.7 x 79.9 x 77.2 in (5.885 x 2.03 x 1.96 m) are from Ford's spec sheet as remembered, the search did not return them.
  pickup: {
    Lref: 5.885, Href: 1.96,
    sill: 0.3, wheelR: 0.39, wheelW: 0.275,
    axle: 1.84,
    secs: [
      [-2.94, 1.43, 1.4, 0.95],
      [-2.5, 1.44, 1.42, 0.95],
      [-1.8, 1.44, 1.42, 0.95],
      [-1.12, 1.44, 1.42, 0.95],
      [-0.96, 1.94, 1.5, 0.8],
      [-0.4, 1.96, 1.5, 0.74],
      [0.35, 1.95, 1.5, 0.74],
      [0.62, 1.88, 1.5, 0.78],
      [0.95, 1.68, 1.5, 0.88],
      [1.15, 1.54, 1.49, 0.92],
      [1.6, 1.5, 1.46, 0.93],
      [2.2, 1.47, 1.42, 0.93],
      [2.7, 1.42, 1.35, 0.93],
      [2.94, 1.38, 1.28, 0.92],
    ],
    windshield: [1.1, 0.55],
    doorGlass: [[0.95, 0.04], [-0.04, -0.93]],
    bPillar: [0.04, -0.04],
    rearGlass: [-0.94, -1.1],
    seams: [0.98, 0.02, -0.96],
    handles: [0.1, -0.78],
    hoodBack: 1.2,
    clad: 10,
    rails: false, spoiler: false, hatchback: true, maxGap: 0.5, archN: 6, endT: [0, 1],
    bumperY: 0.5, bumperH: 0.28,
    plan: [[-2.95, 0.95], [-2.5, 0.99], [-1, 1], [1, 1], [2.3, 0.99], [2.95, 0.95]],
    headLamp: 'quad', tailLamp: 'tall', grille: 'bigbar', lampD: 0.1, tailD: 0.05, endF: 0.3, endR: 0.2, grilleW: 0.78,
    dims: { L: 5.885, W: 2.03, H: 1.96 },
    bed: { u0: -1.12, u1: -2.94, floor: 0.95 },
  },
  // "Trekker V": a compact crossover of the Honda CR-V type (2023-): length 184.8 in (4.694 m), width 73.5 in (1.867 m), height 66.2 in (1.68 m), wheelbase 106.3 in (2.70 m).
  // Sources: https://hondanews.com/en-US/honda-automobiles/releases/release-1503019bd8a757ea08267d7944234840-2023-honda-cr-v-specs-features , https://www.motor1.com/news/702711/honda-crv-2023-dimensions-boot-space/
  crossover: {
    Lref: 4.694, Href: 1.68,
    sill: 0.24, wheelR: 0.36, wheelW: 0.235,
    axle: 1.35,
    secs: [
      [-2.35, 1.05, 0.98, 0.9],
      [-2.28, 1.2, 1.05, 0.9],
      [-2.1, 1.5, 1.1, 0.84],
      [-1.85, 1.65, 1.12, 0.78],
      [-1.4, 1.68, 1.12, 0.75],
      [-0.4, 1.68, 1.12, 0.74],
      [0.2, 1.66, 1.12, 0.75],
      [0.6, 1.56, 1.12, 0.8],
      [1.0, 1.22, 1.1, 0.9],
      [1.35, 1.12, 1.07, 0.93],
      [1.9, 1.07, 1.02, 0.93],
      [2.2, 1.0, 0.96, 0.93],
      [2.35, 0.95, 0.88, 0.92],
    ],
    windshield: [1.0, 0.25],
    doorGlass: [[0.9, 0.02], [-0.06, -1.1], [-1.14, -1.85]],
    bPillar: [0.02, -0.06],
    rearGlass: [-1.9, -2.28],
    seams: [0.86, -0.03, -1.12],
    handles: [0.08, -0.9],
    hoodBack: 1.04,
    clad: 10,
    rails: false, spoiler: false, hatchback: true, maxGap: 0.3, archN: 6,
    bumperY: 0.4, bumperH: 0.24,
    plan: [[-2.37, 0.9], [-1.9, 0.97], [-0.9, 1], [0.9, 1], [1.9, 0.99], [2.37, 0.93]],
    headLamp: 'swept', tailLamp: 'tall', grille: 'bars', lampD: 0.18, tailD: 0.06, endF: 0.4, endR: 0.2, grilleW: 0.55,
    dims: { L: 4.694, W: 1.867, H: 1.68 },
  },
  // "Voyager Eight": a minivan of the Toyota Sienna type (2021-): wheelbase 120.5 in (3.06 m), length 203.7 in (5.175 m), width 78.5 in (1.994 m), height 68.5 in without rails (1.74 m) / 69.7 in with (1.77 m).
  // Source: https://pressroom.toyota.com/toyota-sienna-2021/ (via search summary), https://www.kbb.com/toyota/sienna/2021/specs
  minivan: {
    Lref: 5.175, Href: 1.77,
    sill: 0.22, wheelR: 0.345, wheelW: 0.235,
    axle: 1.53,
    secs: [
      [-2.59, 1.15, 1.1, 0.9],
      [-2.52, 1.4, 1.16, 0.9],
      [-2.35, 1.72, 1.18, 0.84],
      [-2.1, 1.77, 1.18, 0.8],
      [-1.0, 1.78, 1.18, 0.76],
      [0.5, 1.76, 1.18, 0.76],
      [0.98, 1.62, 1.17, 0.82],
      [1.4, 1.3, 1.15, 0.9],
      [1.75, 1.18, 1.12, 0.93],
      [2.25, 1.1, 1.05, 0.93],
      [2.59, 1.0, 0.95, 0.92],
    ],
    windshield: [1.38, 0.5],
    doorGlass: [[1.1, 0.12], [0.06, -1.0], [-1.04, -2.22]],
    bPillar: [0.12, 0.06],
    rearGlass: [-2.25, -2.5],
    seams: [1.14, 0.1, -1.02],
    handles: [0.55, -0.4],
    hoodBack: 1.42,
    clad: 10,
    rails: false, spoiler: false, hatchback: true, maxGap: 0.5, archN: 6,
    bumperY: 0.42, bumperH: 0.26,
    plan: [[-2.6, 0.9], [-2.1, 0.97], [-1, 1], [1, 1], [2.1, 0.99], [2.6, 0.92]],
    headLamp: 'swept', tailLamp: 'tall', grille: 'wedge', lampD: 0.2, tailD: 0.06, endF: 0.45, endR: 0.2, grilleW: 0.5,
    dims: { L: 5.175, W: 1.994, H: 1.77 },
  },
  // "Bavaro 540": an executive sedan of the BMW 5 Series (G30) type: length 4,963 mm, width 1,868 mm, height ~1,480-1,498 mm, wheelbase 2,975 mm.
  // Sources: https://cararac.com/spec/bmw/5-series/sedan-2017/ , https://Www.Wikipedia.org/wiki/BMW_5_Series_(G30)
  luxury: {
    Lref: 4.963, Href: 1.48,
    sill: 0.17, wheelR: 0.35, wheelW: 0.245,
    axle: 1.49,
    secs: [
      [-2.48, 0.98, 0.93, 0.9],
      [-2.2, 1.04, 0.99, 0.9],
      [-1.8, 1.1, 1.02, 0.86],
      [-1.35, 1.28, 1.02, 0.78],
      [-0.95, 1.44, 1.02, 0.73],
      [-0.3, 1.48, 1.02, 0.72],
      [0.25, 1.44, 1.02, 0.73],
      [0.65, 1.28, 1.02, 0.78],
      [1.0, 1.1, 1.0, 0.87],
      [1.5, 1.05, 0.98, 0.93],
      [2.1, 1.0, 0.95, 0.93],
      [2.4, 0.93, 0.88, 0.93],
      [2.48, 0.88, 0.84, 0.92],
    ],
    windshield: [1.0, 0.3],
    doorGlass: [[0.86, -0.04], [-0.1, -1.05]],
    bPillar: [-0.04, -0.1],
    rearGlass: [-1.1, -1.65],
    seams: [0.9, -0.07, -1.08],
    handles: [0.06, -0.85],
    hoodBack: 1.0,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.3, archN: 6,
    bumperY: 0.33, bumperH: 0.22,
    plan: [[-2.5, 0.9], [-2, 0.98], [-1, 1], [1, 1], [2, 0.98], [2.5, 0.92]],
    headLamp: 'blade', tailLamp: 'lshape', grille: 'kidney', lampD: 0.12, endF: 0.45, endR: 0.35, grilleW: 0.45,
    dims: { L: 4.963, W: 1.868, H: 1.48 },
  },
  // "Sovereign Livery": a full-size rear-drive livery sedan of the Lincoln Town Car type (2003-2011): length 215.4 in (5.47 m), width 78.2 in (1.99 m), height 59 in (1.50 m), wheelbase 117.7 in (2.99 m).
  // Sources: https://www.iseecars.com/car/2003-lincoln-town_car-dimensions , https://www.truedelta.com/Lincoln-Town-Car/specs-169-2011&r=2
  towncar: {
    Lref: 5.39, Href: 1.44,
    sill: 0.2, wheelR: 0.34, wheelW: 0.235,
    axle: 1.455,
    secs: [
      [-2.69, 1.02, 0.94, 0.93],
      [-2.35, 1.07, 1.0, 0.93],
      [-1.9, 1.1, 1.02, 0.92],
      [-1.5, 1.14, 1.02, 0.88],
      [-1.25, 1.3, 1.02, 0.8],
      [-0.95, 1.42, 1.02, 0.75],
      [-0.35, 1.44, 1.02, 0.74],
      [0.2, 1.43, 1.02, 0.75],
      [0.5, 1.33, 1.02, 0.78],
      [0.9, 1.1, 1.0, 0.88],
      [1.4, 1.03, 0.97, 0.93],
      [2.0, 0.99, 0.93, 0.93],
      [2.45, 0.94, 0.87, 0.92],
      [2.69, 0.89, 0.82, 0.92],
    ],
    windshield: [0.92, 0.2],
    doorGlass: [[0.8, 0.0], [-0.035, -0.97]],
    bPillar: [0.0, -0.035],
    rearGlass: [-1.02, -1.5],
    seams: [0.86, -0.08, -1.05],
    handles: [0.08, -0.82],
    hoodBack: 0.96,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.3, archN: 6,
    bumperY: 0.36, bumperH: 0.24,
    plan: [[-2.7, 0.9], [-2.1, 0.97], [-1, 1], [1, 1], [2.1, 0.98], [2.7, 0.92]],
    dims: { L: 5.47, W: 1.99, H: 1.5 },
    headLamp: 'quad', tailLamp: 'box2', grille: 'bars', lampD: 0.1, tailD: 0.08, endF: 0.4, endR: 0.3, grilleW: 0.6,
  },
  // "Bronco Pony": a two-door pony car of the Ford Mustang GT type (2015-): length 188.3 in (4.783 m), width 75.4 in (1.915 m), height 54.4 in (1.382 m), wheelbase 107.1 in (2.72 m).
  // Sources: https://www.carspecs.us/cars/2015/ford/mustang/37991 , https://dimensions.com/element/ford-mustang-gt-2015
  pony: {
    Lref: 4.783, Href: 1.382,
    sill: 0.17, wheelR: 0.35, wheelW: 0.255,
    axle: 1.36,
    secs: [
      [-2.39, 1.0, 0.96, 0.9],
      [-2.2, 1.05, 1.0, 0.9],
      [-1.9, 1.1, 1.02, 0.87],
      [-1.5, 1.24, 1.02, 0.8],
      [-1.0, 1.35, 1.02, 0.75],
      [-0.4, 1.38, 1.02, 0.72],
      [0.1, 1.36, 1.02, 0.73],
      [0.55, 1.24, 1.02, 0.8],
      [0.95, 1.07, 1.0, 0.88],
      [1.4, 1.03, 0.98, 0.93],
      [1.9, 0.98, 0.93, 0.93],
      [2.2, 0.92, 0.87, 0.93],
      [2.39, 0.86, 0.8, 0.92],
    ],
    windshield: [0.95, 0.3],
    doorGlass: [[0.86, -0.5], [-0.58, -1.05]],
    bPillar: [-0.5, -0.58],
    rearGlass: [-1.08, -1.55],
    seams: [0.88, -0.56, -1.1],
    handles: [-0.25],
    hoodBack: 0.98,
    clad: 11,
    rails: false, spoiler: true, maxGap: 0.3, archN: 6,
    bumperY: 0.32, bumperH: 0.21,
    plan: [[-2.4, 0.9], [-1.8, 0.98], [-0.9, 1], [0.9, 1], [1.8, 0.98], [2.4, 0.92]],
    headLamp: 'slit', tailLamp: 'tri', grille: 'mesh', lampD: 0.0, endF: 0.5, endR: 0.3, grilleW: 0.5,
    dims: { L: 4.783, W: 1.915, H: 1.382 },
  },
  // "Jitney 15": a passenger van of the dollar-van type (Transit-class 15-seat high roof): the cargo van body with side windows down its length.
  dollar: {
    Lref: 5.98, Href: 2.78,
    sill: 0.36, wheelR: 0.37, wheelW: 0.235,
    axle: 1.875,
    secs: [
      [-2.95, 2.55, 1.28, 0.93],
      [-2.8, 2.72, 1.3, 0.95],
      [-2.3, 2.78, 1.3, 0.95],
      [-0.5, 2.78, 1.3, 0.95],
      [0.4, 2.76, 1.3, 0.95],
      [0.7, 2.62, 1.3, 0.94],
      [1.0, 2.1, 1.3, 0.92],
      [1.8, 1.4, 1.3, 0.93],
      [1.98, 1.22, 1.17, 0.93],
      [2.4, 1.12, 1.05, 0.93],
      [2.8, 1.0, 0.9, 0.93],
      [2.95, 0.92, 0.82, 0.92],
    ],
    windshield: [1.8, 1.0],
    doorGlass: [[1.6, 0.55], [0.4, -0.5], [-0.62, -1.6], [-1.72, -2.6]],
    bPillar: [0.55, 0.4],
    rearGlass: [-2.6, -2.75],
    seams: [1.62, 0.48, -0.56, -1.66],
    handles: [1.2, -0.1],
    hoodBack: 1.98,
    clad: 11,
    rails: false, spoiler: false, hatchback: true, maxGap: 0.9, archN: 5, endT: [0, 1],
    glassTop: 2.1, headY: 0.86, tailY: 1.2, mirror: 'van',
    bumperY: 0.5, bumperH: 0.3,
    plan: [[-2.95, 0.96], [-2.2, 0.99], [-1, 1], [1, 1], [2.3, 0.97], [2.95, 0.88]],
    headLamp: 'angular', tailLamp: 'tall', grille: 'wedge', lampD: 0.12, tailD: 0.05, endF: 0.3, endR: 0.12, grilleW: 0.55, lampInset: 0.17,
    dims: { L: 5.98, W: 2.06, H: 2.78 },
    windowed: true,
  },
  // ---- CARS14 (WebSearch, 11 Nov 2026). Parody names and shapes are our own; the real class is the size reference only.
  // Sim feel (VEHICLE_SPECS in entities/Vehicle.ts) comes from the same numbers. Sim top speed is about half the real one.
  // "Stuttgard 6": a rear-engine 2+2 sports coupe of the Porsche 911 Carrera (992) class. Facelift 2024 Carrera: length 4,542 mm, width 1,852 mm (without mirrors),
  // wheelbase 2,450 mm, height about 1,300 mm, kerb weight 1,520 kg; 3.0 flat-six biturbo 283 kW (385 hp); 0-100 km/h 4.1-4.2 s; top speed 293-294 km/h; wheels 20/21 in.
  // Sources: https://www.auto-data.net/en/porsche-911-992-facelift-2024-carrera-3.0-394hp-pdk-51872 , https://www.autohints.com/porsche-911-992-facelift-2024-carrera-3.0-394-hp-pdk-version-32194 , https://fastestlaps.com/models/porsche-911-carrera-s-992-facelift , https://www.ultimatecarpage.com/spec/7689/Porsche-911-Carrera.html
  coupe911: {
    Lref: 4.542, Href: 1.3,
    sill: 0.13, wheelR: 0.345, wheelW: 0.27,
    axle: 1.225,
    secs: [
      [-2.27, 0.84, 0.8, 0.9],
      [-2.1, 0.96, 0.9, 0.9],
      [-1.8, 1.06, 0.97, 0.88],
      [-1.4, 1.14, 0.99, 0.8],
      [-1.0, 1.22, 1.0, 0.74],
      [-0.6, 1.28, 1.0, 0.72],
      [-0.1, 1.3, 1.0, 0.72],
      [0.35, 1.24, 1.0, 0.76],
      [0.75, 1.08, 0.98, 0.88],
      [1.1, 0.98, 0.94, 0.93],
      [1.6, 0.9, 0.86, 0.93],
      [2.0, 0.82, 0.78, 0.93],
      [2.27, 0.74, 0.7, 0.91],
    ],
    windshield: [1.02, 0.3],
    doorGlass: [[0.8, -0.5], [-0.58, -1.0]],
    bPillar: [-0.5, -0.58],
    rearGlass: [-1.02, -1.4],
    seams: [0.84, -0.54, -1.0],
    handles: [-0.15],
    hoodBack: 1.02,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.3, archN: 6,
    bumperY: 0.3, bumperH: 0.2,
    plan: [[-2.27, 0.9], [-1.6, 0.99], [-0.9, 1], [0.9, 1], [1.7, 0.98], [2.27, 0.9]],
    headLamp: 'round2', tailLamp: 'bar', grille: 'mesh', lampD: 0.0, tailD: 0.02, endF: 0.55, endR: 0.35, grilleW: 0.3,
    dims: { L: 4.542, W: 1.852, H: 1.3 },
  },
  // "Veleno V10": a mid-engine V10 wedge exotic of the Lamborghini Huracan EVO class. Huracan EVO: length 4,520 mm, width 1,933 mm, height 1,165 mm, wheelbase 2,620 mm
  // (published figures; the search returned the STO's 4,459 x 1,924 mm and the weights), dry weight 1,422 kg, 5.2 V10 470 kW (640 hp), 0-100 km/h 2.9 s (AWD) / 3.3 s (RWD), top speed 325 km/h.
  // Sources: https://lamborghini.com/en-en/history/huracan-evo-rwd , https://lambocars.com/huracan-evo-rwd-specs-performance/ , https://www.ultimatecarpage.com/spec/7516/Lamborghini-Huracan-EVO.html , https://cars-data.com/en/lamborghini/huracan/2014/evo-5-2-v10--105298/specs
  exotic: {
    Lref: 4.52, Href: 1.165,
    sill: 0.1, wheelR: 0.35, wheelW: 0.3,
    axle: 1.31,
    secs: [
      [-2.26, 0.74, 0.7, 0.9],
      [-2.1, 0.86, 0.8, 0.9],
      [-1.7, 0.98, 0.9, 0.88],
      [-1.2, 1.04, 0.92, 0.8],
      [-0.8, 1.12, 0.94, 0.72],
      [-0.3, 1.165, 0.96, 0.66],
      [0.2, 1.14, 0.96, 0.66],
      [0.65, 1.0, 0.95, 0.8],
      [1.0, 0.88, 0.86, 0.9],
      [1.5, 0.8, 0.78, 0.93],
      [2.0, 0.72, 0.7, 0.93],
      [2.26, 0.64, 0.58, 0.92],
    ],
    windshield: [1.0, 0.25],
    doorGlass: [[0.8, -0.1], [-0.18, -0.62]],
    bPillar: [-0.1, -0.18],
    rearGlass: [-0.66, -0.95],
    seams: [0.86, -0.12, -0.7],
    handles: [0.3],
    hoodBack: 1.0,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.3, archN: 6,
    bumperY: 0.26, bumperH: 0.18,
    plan: [[-2.26, 0.86], [-1.7, 0.98], [-0.9, 1], [0.9, 1], [1.7, 0.97], [2.26, 0.86]],
    headLamp: 'angular', tailLamp: 'lshape', grille: 'wedge', lampD: 0.1, tailD: 0.05, endF: 0.45, endR: 0.2, grilleW: 0.55,
    dims: { L: 4.52, W: 1.933, H: 1.165 },
  },
  // "Kaze RB": a JDM tuner coupe of the Toyota GR Supra (A90) class: length 4,380 mm, width 1,853-1,865 mm, height about 1,290-1,300 mm, wheelbase 2,470 mm,
  // kerb weight 1,395-1,528 kg (3.0 about 1,495 kg), 3.0 turbo inline-six 250-320 kW, 0-100 km/h about 4.3-4.4 s (0-60 mph 4.1 s), top speed 250 km/h (limited; 270 on the Final Edition), 19 in wheels.
  // Sources: https://auto-data.net/en/toyota-supra-v-a90-gr-3.0-382hp-automatic-46688 , https://parkers.co.uk/toyota/gr-supra/coupe-2019/specs , https://dimensions.com/element/toyota-gr-supra-a90-a91 , https://autotijd.be/en/dimensions/toyota/supra/a90-final-edition-manual-5038
  jdmcoupe: {
    Lref: 4.38, Href: 1.29,
    sill: 0.14, wheelR: 0.345, wheelW: 0.275,
    axle: 1.235,
    secs: [
      [-2.19, 0.9, 0.86, 0.9],
      [-2.05, 0.98, 0.92, 0.9],
      [-1.7, 1.06, 0.98, 0.86],
      [-1.2, 1.16, 1.0, 0.78],
      [-0.8, 1.24, 1.0, 0.74],
      [-0.3, 1.29, 1.0, 0.7],
      [0.15, 1.25, 1.0, 0.72],
      [0.55, 1.12, 1.0, 0.82],
      [0.95, 0.98, 0.96, 0.9],
      [1.4, 0.92, 0.88, 0.93],
      [1.85, 0.86, 0.82, 0.93],
      [2.19, 0.78, 0.72, 0.9],
    ],
    windshield: [0.98, 0.3],
    doorGlass: [[0.82, -0.2], [-0.28, -0.8]],
    bPillar: [-0.2, -0.28],
    rearGlass: [-0.82, -1.3],
    seams: [0.84, -0.24, -0.84],
    handles: [0.2],
    hoodBack: 1.0,
    clad: 11,
    rails: false, spoiler: true, maxGap: 0.3, archN: 6,
    bumperY: 0.3, bumperH: 0.2,
    plan: [[-2.19, 0.9], [-1.6, 0.99], [-0.9, 1], [0.9, 1], [1.7, 0.98], [2.19, 0.9]],
    headLamp: 'slit', tailLamp: 'bar', grille: 'mesh', lampD: 0.0, tailD: 0.03, endF: 0.5, endR: 0.3, grilleW: 0.5,
    dims: { L: 4.38, W: 1.865, H: 1.29 },
  },
  // "Rallye GT": a hot hatch of the Honda Civic Type R (FL5) class, front-wheel drive: length 4,594 mm, width 1,890 mm, height 1,401 mm, wheelbase 2,734 mm,
  // kerb weight 1,405-1,446 kg, 2.0 turbo four 243 kW (329 hp), 0-100 km/h 5.4 s, top speed 275 km/h, 265/30 R19 tyres.
  // Sources: https://www.vehiclesizes.com/cars/honda/civic-type-r/civic-type-r-fl5-hatchback-2023 , https://www.dimensions.com/element/honda-civic-type-r-fl5-6th-gen , https://www.auto-data.net/en/honda-civic-type-r-fl5-2.0-329hp-48467 , https://www.honda.co.uk/cars/new/civic-type-r/specifications.html
  hothatch: {
    Lref: 4.594, Href: 1.401,
    sill: 0.15, wheelR: 0.345, wheelW: 0.265,
    axle: 1.367,
    secs: [
      [-2.3, 1.1, 1.02, 0.9],
      [-2.2, 1.28, 1.08, 0.9],
      [-2.0, 1.38, 1.1, 0.84],
      [-1.5, 1.4, 1.1, 0.78],
      [-0.8, 1.401, 1.1, 0.74],
      [-0.1, 1.39, 1.1, 0.73],
      [0.35, 1.3, 1.1, 0.78],
      [0.75, 1.15, 1.08, 0.88],
      [1.1, 1.05, 1.04, 0.93],
      [1.6, 1.0, 0.98, 0.93],
      [2.0, 0.94, 0.9, 0.93],
      [2.3, 0.84, 0.8, 0.91],
    ],
    windshield: [1.05, 0.3],
    doorGlass: [[0.9, -0.05], [-0.12, -0.9], [-0.98, -1.75]],
    bPillar: [-0.05, -0.12],
    rearGlass: [-1.8, -2.18],
    seams: [0.9, -0.08, -0.95],
    handles: [0.2, -0.6],
    hoodBack: 1.05,
    clad: 11,
    rails: false, spoiler: true, hatchback: true, maxGap: 0.3, archN: 6, endT: [0, 1],
    bumperY: 0.32, bumperH: 0.22,
    plan: [[-2.3, 0.92], [-1.8, 0.99], [-0.9, 1], [0.9, 1], [1.8, 0.99], [2.3, 0.92]],
    headLamp: 'blade', tailLamp: 'loop', grille: 'mesh', lampD: 0.08, tailD: 0.05, endF: 0.4, endR: 0.2, grilleW: 0.6,
    dims: { L: 4.594, W: 1.89, H: 1.401 },
  },
  // "Brawler SRT": a modern muscle coupe of the Dodge Challenger SRT Hellcat class: length 197.5 in (5.016 m), width 75.7 in (1.923 m), height 57.2 in (1.453 m), wheelbase 116.2 in (2.952 m),
  // curb weight about 4,415-4,430 lb (2,000 kg), supercharged 6.2 V8 527 kW (717 hp), 0-60 mph about 3.6-4.5 s (we use 3.8 s to 100 km/h), top speed 191-200 mph, 20 in wheels.
  // Sources: https://specs2.auto123.com/en/specs/dodge/challenger/dodge-challenger-2022-srt-hellcat-pa-425272 , https://www.motormatchup.com/catalog/Dodge/Challenger/2021/SRT-Hellcat-RWD , https://news.dupontregistry.com/dodge/challenger-hellcat-specs-price-photos-review
  muscle: {
    Lref: 5.016, Href: 1.453,
    sill: 0.17, wheelR: 0.36, wheelW: 0.295,
    axle: 1.476,
    secs: [
      [-2.51, 1.0, 0.98, 0.92],
      [-2.4, 1.12, 1.05, 0.92],
      [-2.0, 1.2, 1.1, 0.88],
      [-1.6, 1.28, 1.12, 0.82],
      [-1.1, 1.4, 1.12, 0.76],
      [-0.5, 1.453, 1.12, 0.72],
      [0.1, 1.44, 1.12, 0.73],
      [0.6, 1.3, 1.12, 0.8],
      [1.0, 1.16, 1.1, 0.9],
      [1.5, 1.12, 1.06, 0.94],
      [2.0, 1.08, 1.02, 0.94],
      [2.35, 1.0, 0.94, 0.93],
      [2.51, 0.92, 0.86, 0.92],
    ],
    windshield: [1.0, 0.3],
    doorGlass: [[0.9, -0.55], [-0.62, -1.15]],
    bPillar: [-0.55, -0.62],
    rearGlass: [-1.18, -1.7],
    seams: [0.92, -0.6, -1.18],
    handles: [-0.3],
    hoodBack: 1.04,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.3, archN: 6,
    bumperY: 0.36, bumperH: 0.24,
    plan: [[-2.51, 0.93], [-1.9, 0.99], [-0.9, 1], [0.9, 1], [1.9, 0.99], [2.51, 0.94]],
    headLamp: 'round2', tailLamp: 'bar', grille: 'bigbar', lampD: 0.0, tailD: 0.03, endF: 0.5, endR: 0.3, grilleW: 0.7,
    dims: { L: 5.016, W: 1.923, H: 1.453 },
  },
  // "Slab 1": satire of an electric stainless wedge pickup (Tesla Cybertruck class, a deliberately blunt parody): length 223.7 in (5.683 m), width 80 in (2.03 m, without mirrors),
  // height 70.5 in (1.79 m), wheelbase 143.1 in (3.635 m), curb weight 6,634 lb (3,010 kg), dual-motor AWD 4.1 s 0-60 mph (0-100 km/h about 4.5 s), 180 km/h (112 mph) limited.
  // Sources: https://www.kbb.com/tesla/cybertruck/2026/specs/ , https://www.arenaev.com/tesla_cybertruck_all_wheel_drive-specs-55.php , https://www.evspecifications.com/en/model/f02c2d3 , https://www.basenor.com/pages/cybertruck-dimensions
  wedgetruck: {
    Lref: 5.683, Href: 1.79,
    sill: 0.3, wheelR: 0.4, wheelW: 0.285,
    axle: 1.8175,
    secs: [
      [-2.84, 1.2, 1.15, 0.95],
      [-2.4, 1.24, 1.16, 0.95],
      [-1.6, 1.3, 1.17, 0.94],
      [-0.8, 1.5, 1.2, 0.88],
      [-0.1, 1.76, 1.25, 0.76],
      [0.5, 1.79, 1.25, 0.72],
      [1.1, 1.58, 1.2, 0.8],
      [1.7, 1.28, 1.15, 0.9],
      [2.2, 1.06, 1.0, 0.94],
      [2.6, 0.94, 0.9, 0.94],
      [2.84, 0.88, 0.84, 0.92],
    ],
    windshield: [2.0, 0.45],
    doorGlass: [[0.35, -0.4], [-0.46, -1.1]],
    bPillar: [-0.4, -0.46],
    rearGlass: null,
    seams: [0.4, -0.43, -1.15],
    handles: [-0.1],
    hoodBack: 2.0,
    clad: 11,
    rails: false, spoiler: false, hatchback: true, maxGap: 0.9, archN: 5, endT: [0, 1],
    bumperY: 0.46, bumperH: 0.26,
    plan: [[-2.84, 0.97], [-2.0, 1], [2.0, 1], [2.84, 0.82]],
    headLamp: 'blade', tailLamp: 'bar', grille: 'wedge', lampD: 0.02, tailD: 0.02, endF: 0.1, endR: 0.05, grilleW: 0.2,
    dims: { L: 5.683, W: 2.03, H: 1.79 },
  },
  // "Volta E": an electric sedan of the Tesla Model 3 class (2025 Performance), dual-motor AWD: length 185.8 in (4.72 m), width 72.8 in (1.85 m, without mirrors), height 56.3 in (1.43 m),
  // wheelbase 113.2 in (2.875 m), curb weight 4,054 lb (1,840 kg), 0-60 mph 2.9 s (0-100 km/h about 3.1 s), top speed 163 mph (260 km/h; sim figure 225 km/h class), 18-20 in wheels.
  // Sources: https://www.tesla.com/model3 , https://www.evspecifications.com/en/model/fa873dc , https://greencarscompare.com/compare/cars/tesla-model-3-performance/ , https://www.evspecs.org/tech-specs/tesla/model-3-2017-2023/performance
  evsedan: {
    Lref: 4.72, Href: 1.43,
    sill: 0.16, wheelR: 0.34, wheelW: 0.235,
    axle: 1.4375,
    secs: [
      [-2.36, 0.96, 0.92, 0.92],
      [-2.2, 1.1, 1.0, 0.92],
      [-1.9, 1.2, 1.04, 0.88],
      [-1.5, 1.3, 1.06, 0.82],
      [-1.0, 1.4, 1.06, 0.76],
      [-0.4, 1.43, 1.06, 0.74],
      [0.2, 1.4, 1.06, 0.75],
      [0.7, 1.28, 1.06, 0.82],
      [1.1, 1.1, 1.04, 0.9],
      [1.6, 0.98, 0.94, 0.93],
      [2.1, 0.9, 0.86, 0.93],
      [2.36, 0.82, 0.76, 0.91],
    ],
    windshield: [1.1, 0.45],
    doorGlass: [[0.95, 0.2], [0.1, -0.95]],
    bPillar: [0.2, 0.1],
    rearGlass: [-1.0, -1.85],
    seams: [0.96, 0.15, -0.98],
    handles: [0.5, -0.5],
    hoodBack: 1.1,
    clad: 11,
    rails: false, spoiler: false, maxGap: 0.3, archN: 6,
    bumperY: 0.34, bumperH: 0.22,
    plan: [[-2.36, 0.93], [-1.8, 0.99], [-0.9, 1], [0.9, 1], [1.8, 0.99], [2.36, 0.92]],
    headLamp: 'blade', tailLamp: 'bar', grille: 'wedge', lampD: 0.1, tailD: 0.04, endF: 0.55, endR: 0.3, grilleW: 0.25,
    dims: { L: 4.72, W: 1.85, H: 1.43 },
  },
};

/** The CARS14 types: sports cars, the electric wedge pickup and the electric sedan (each has its own style of the same name). */
export const CARS14_TYPES = ['coupe911', 'exotic', 'jdmcoupe', 'hothatch', 'muscle', 'wedgetruck', 'evsedan'] as const;
export function isCars14(type: string): type is (typeof CARS14_TYPES)[number] { return (CARS14_TYPES as readonly string[]).includes(type); }

export function wheelRadiusFor(type: VehicleType): number {
  if (type === 'boxtruck' || type === 'bus') return 0.5;
  if (type === 'garbage') return GARBAGE_R;
  if (type === 'cargovan' || type === 'ambulance') return STYLES.cargo.wheelR;
  if (type === 'dollarvan') return STYLES.dollar.wheelR;
  if (type === 'hatch' || type === 'beater' || type === 'pickup' || type === 'crossover' || type === 'minivan' || type === 'luxury' || type === 'towncar' || type === 'pony' || isCars14(type)) return STYLES[type].wheelR;
  return type === 'suv' ? STYLES.suv.wheelR : type === 'cop' ? STYLES.charger.wheelR : STYLES.sedan.wheelR;
}

/** Number of cross-sections that define a type's hull (before smoothing). */
export function hullSectionCount(type: VehicleType): number {
  if (type === 'boxtruck' || type === 'garbage') return TRUCK_CAB_SECS.length;
  if (type === 'bus') return 12;
  return STYLES[type === 'suv' ? 'suv' : type === 'cop' ? 'charger' : type === 'cargovan' || type === 'ambulance' ? 'cargo' : type === 'dollarvan' ? 'dollar' : type === 'cab' ? 'crown' : type === 'hatch' || type === 'beater' || type === 'pickup' || type === 'crossover' || type === 'minivan' || type === 'luxury' || type === 'towncar' || type === 'pony' || isCars14(type) ? type : 'sedan'].secs.length;
}

const inI = (u: number, r: V2): boolean => u <= r[0] + 1e-6 && u >= r[1] - 1e-6;

/** Wheel arch geometry shared by the hull and the wheel liners. */
export interface Arch { R: number; ra: number; sill: number; halfChord: number; phiS: number; }
export function archOf(R: number, sill: number): Arch {
  const ra = R + 0.065;
  const phiS = Math.asin(clamp((sill - R) / ra, -1, 1));
  return { R, ra, sill, halfChord: ra * Math.cos(phiS), phiS };
}
export function archY(a: Arch, du: number): number {
  return Math.abs(du) < a.halfChord ? a.R + Math.sqrt(a.ra * a.ra - du * du) : 0;
}
export function archStations(a: Arch, axle: number, n = 6): number[] {
  const out: number[] = [];
  const a0 = Math.PI - a.phiS;
  for (let k = 0; k <= n; k++) {
    const phi = a0 + (a.phiS - a0) * (k / n);
    out.push(axle + a.ra * Math.cos(phi));
  }
  return out;
}

/** Half-cylinder liner around a wheel well (dark, faces the wheel). */
export function wheelLiner(a: Arch, x0: number, x1: number, z: number): THREE.BufferGeometry {
  const rr = a.ra - 0.02;
  const g = new THREE.CylinderGeometry(rr, rr, x1 - x0, 14, 1, true, a.phiS, Math.PI - 2 * a.phiS); // 14 segments: a round well, not a box
  g.rotateZ(Math.PI / 2);
  g.translate((x0 + x1) / 2, a.R, z);
  return inverted(g);
}

interface CabinLayout { ws: V2; doors: V2[]; rg: V2 | null; seams: number[]; topSlot?: number; }

/** Chrome window surrounds + belt moulding and dark door seams, all riding on the hull's own vertices. */
export function cabinTrim(hull: Hull, chrome: Acc, trim: Acc, lay: CabinLayout): void {
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
    const top = (i: number): number => (lay.topSlot ?? (hull.us[i] > ws[1] + 0.001 && hull.us[i] <= ws[0] ? 4 : 3));
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

/** Taxi yellow (the traffic palette's '#e0b01e' and anything near it): a sedan in this colour is built as the yellow cab. */
export function isTaxiYellow(hex: string): boolean {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.h >= 0.1 && hsl.h <= 0.16 && hsl.s >= 0.6 && hsl.l >= 0.35 && hsl.l <= 0.65;
}


// ---------------------------------------------------------------- real-type lamp shapes

/** Flat polygon (x across, y up, centred on the lamp) extruded `depth` along +z; optional holes. */
function shapeGeo(pts: [number, number][], depth: number, holes: [number, number][][] = []): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
}
const rect = (cx: number, cy: number, w: number, h: number): [number, number][] => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];

/**
 * One lamp of a pair, right-hand side, ready to `addBoth`: lens shapes (emissive mesh) and the dark housing behind (trim).
 * Faces forward (front = true, -z) or back (+z) at `pos` on the fascia, turned by `yaw`. Local shapes are centred on the lamp.
 */
function lampPieces(kind: string, front: boolean, pos: THREE.Vector3, yaw: number, k = 1): { lens: THREE.BufferGeometry[]; housing: THREE.BufferGeometry[] } {
  const D = 0.03;
  let lens: [number, number][][] = [];
  let lensHoles: [number, number][][][] = [];
  let hous: [number, number][] = rect(0, 0, 0.3, 0.14);
  switch (kind) {
    case 'quad': lens = [rect(0, 0.026, 0.25, 0.05), rect(0, -0.03, 0.25, 0.022)]; hous = rect(0, 0, 0.28, 0.11); break; // Crown-type rectangular composite lamp (slim: a clear lens over a dark reflector, no thick frame)
    case 'blade': lens = [[[-0.18, -0.02], [0.18, 0.012], [0.18, 0.03], [-0.18, 0.0]], [[-0.18, -0.045], [0.16, -0.015], [0.16, -0.003], [-0.18, -0.033]]]; hous = [[-0.2, -0.06], [0.2, -0.02], [0.2, 0.05], [-0.2, 0.02]]; break; // narrow executive-sedan blade with an LED line
    case 'round2': lens = [rect(-0.1, 0, 0.12, 0.12), rect(0.1, 0, 0.12, 0.12)]; hous = rect(0, 0, 0.34, 0.16); break;
    case 'tri': lens = [rect(-0.15, 0, 0.07, 0.15), rect(-0.05, 0, 0.07, 0.15), rect(0.05, 0, 0.07, 0.15)]; hous = rect(-0.05, 0, 0.36, 0.19); break; // three-bar pony tail lamp
    case 'lshape': { const o: [number, number][] = [[-0.2, -0.05], [0.2, -0.05], [0.2, -0.02], [-0.17, -0.02], [-0.17, 0.12], [-0.2, 0.12]]; lens = [o]; hous = rect(0, 0.03, 0.44, 0.2); break; } // L-shaped lamp
    case 'slit': lens = [[[-0.17, -0.012], [0.17, 0.016], [0.17, 0.046], [-0.17, 0.014]], [[-0.17, -0.03], [0.17, -0.003], [0.17, 0.004], [-0.17, -0.023]]]; hous = [[-0.19, -0.04], [0.19, -0.006], [0.19, 0.06], [-0.19, 0.03]]; break; // narrow scowl + DRL
    case 'wedge': lens = [[[-0.19, -0.04], [0.19, 0.035], [0.19, 0.075], [-0.19, 0.0]], [[-0.17, -0.07], [0.17, 0.0], [0.17, 0.012], [-0.17, -0.058]]]; hous = [[-0.2, -0.08], [0.2, 0.0], [0.2, 0.09], [-0.2, 0.015]]; break; // swept-back
    case 'c': lens = [rect(0, 0.06, 0.26, 0.026), rect(0, -0.06, 0.26, 0.026), rect(0.118, 0, 0.026, 0.146)]; hous = rect(0, 0, 0.3, 0.19); break; // C-shape DRL signature
    // Camry-type swept-back lamp: tall at the inner end, a long tapered tail that rises and runs back along the fender, DRL strip below
    case 'swept': lens = [[[-0.2, -0.04], [-0.1, -0.055], [0.12, -0.005], [0.27, 0.07], [0.28, 0.1], [0.1, 0.082], [-0.2, 0.045]], [[-0.17, -0.075], [0.08, -0.05], [0.2, -0.01], [0.2, 0.002], [0.08, -0.038], [-0.17, -0.063]]]; hous = [[-0.22, -0.07], [0.1, -0.08], [0.3, 0.045], [0.31, 0.13], [-0.22, 0.08]]; break;
    case 'box': lens = [rect(-0.02, 0.0, 0.25, 0.1), rect(0.16, -0.02, 0.07, 0.06)]; hous = rect(0.02, 0, 0.36, 0.14); break; // sealed composite rectangle + side marker
    case 'angular': lens = [[[-0.15, -0.09], [0.17, -0.07], [0.19, 0.08], [-0.15, 0.1]], [[-0.15, -0.115], [0.16, -0.095], [0.16, -0.085], [-0.15, -0.105]]]; hous = [[-0.17, -0.12], [0.21, -0.09], [0.22, 0.1], [-0.17, 0.12]]; break; // tall slanted van lamp
    case 'tall': lens = [rect(0, 0, 0.075, 0.3 * k)]; hous = rect(0, 0, 0.115, 0.34 * k); break; // upright rear-corner lamp (hatch, van)
    case 'box2': lens = [rect(0, 0.005, 0.34, 0.085), rect(0, -0.055, 0.34, 0.02)]; hous = rect(0, -0.01, 0.4, 0.16); break;
    case 'bar': lens = [rect(0, 0, 0.46, 0.07)]; hous = rect(0, 0, 0.5, 0.1); break; // wide red bar
    case 'loop': { const o = rect(0, 0, 0.5, 0.075), i = rect(0, 0, 0.44, 0.035); lens = [o]; lensHoles = [[i]]; hous = rect(0, 0, 0.54, 0.105); break; } // racetrack
    default: lens = [rect(0, 0, 0.3, 0.07)];
  }
  const place = (g: THREE.BufferGeometry, proud: number): THREE.BufferGeometry => {
    if (front) { g.rotateY(Math.PI); g.translate(0, 0, proud); } else g.translate(0, 0, -proud);
    g.rotateY(yaw);
    return g.translate(pos.x, pos.y, pos.z);
  };
  return {
    lens: lens.map((pts, k) => place(shapeGeo(pts, D, lensHoles[k] ?? []), 0.01)),
    housing: [place(shapeGeo(hous, 0.012), 0.002)],
  };
}

/** A lamp part as two edge curves over the same arc-length knots: y_lo(s), y_hi(s), s from the lamp's inner end. */
interface LampStrip { s: number[]; lo: number[]; hi: number[] }
const rectStrip = (s0: number, s1: number, y0: number, y1: number): LampStrip => ({ s: [s0, s0 + (s1 - s0) / 3, s0 + (2 * (s1 - s0)) / 3, s1], lo: [y0, y0, y0, y0], hi: [y1, y1, y1, y1] });
/** Wrapped lamps (lens strips + a dark housing) that follow the body's plan curve round the corner; lengths in metres along the curve. */
const WRAP_LAMPS: Record<string, { lens: LampStrip[]; housing: LampStrip }> = {
  // Camry-type swept-back lamp: tall at the inner end, a long tapered tail that rises along the fender, a DRL strip below
  swept: {
    lens: [
      { s: [0, 0.12, 0.26, 0.4, 0.55], lo: [-0.055, -0.06, -0.05, -0.012, 0.035], hi: [0.065, 0.075, 0.085, 0.092, 0.095] },
      { s: [0.02, 0.16, 0.3, 0.46], lo: [-0.105, -0.105, -0.08, -0.04], hi: [-0.062, -0.062, -0.04, -0.006] },
    ],
    housing: { s: [-0.02, 0.16, 0.34, 0.54], lo: [-0.1, -0.1, -0.075, 0.02], hi: [0.075, 0.08, 0.09, 0.105] },
  },
  // Camry-type rear lamp: a wide swept wedge along the deck edge that turns the corner and runs up the quarter, amber / reverse strip below
  camryT: {
    lens: [
      { s: [0, 0.2, 0.4, 0.58, 0.72], lo: [-0.04, -0.05, -0.05, -0.035, -0.01], hi: [0.055, 0.075, 0.09, 0.1, 0.1] },
      { s: [0.04, 0.3, 0.56], lo: [-0.085, -0.085, -0.07], hi: [-0.055, -0.055, -0.04] },
    ],
    housing: { s: [-0.02, 0.2, 0.4, 0.58, 0.76], lo: [-0.1, -0.1, -0.1, -0.08, -0.04], hi: [0.075, 0.095, 0.11, 0.12, 0.12] },
  },
  box: { lens: [rectStrip(0, 0.27, -0.05, 0.05), rectStrip(0.31, 0.39, -0.04, 0.03)], housing: rectStrip(-0.02, 0.41, -0.07, 0.07) },
  angular: {
    lens: [{ s: [0, 0.11, 0.22, 0.34], lo: [-0.09, -0.085, -0.075, -0.07], hi: [0.1, 0.095, 0.09, 0.08] }, rectStrip(0, 0.34, -0.118, -0.1)],
    housing: rectStrip(-0.02, 0.36, -0.13, 0.12),
  },
  tall: { lens: [rectStrip(0, 0.1, -0.15, 0.15)], housing: rectStrip(-0.015, 0.115, -0.17, 0.17) },
  box2: { lens: [rectStrip(0, 0.4, -0.04, 0.05), rectStrip(0, 0.4, -0.075, -0.055)], housing: rectStrip(-0.02, 0.42, -0.09, 0.075) },
};

/**
 * Builds a wrapped lamp. `plan(d)` is the body half-width d metres from the tip; the lamp starts at half-width `xIn` on the end face, runs
 * out to the corner and back along the side. `yc` is the lamp centre height, `k` stretches it vertically (tall lamps).
 */
function wrapLamp(kind: string, front: boolean, tipU: number, plan: (d: number) => number, xIn: number, yc: number, k = 1): { lens: THREE.BufferGeometry[]; housing: THREE.BufferGeometry[] } {
  const spec = WRAP_LAMPS[kind];
  // plan polyline in (x, d): along the end face to the corner, then the curve
  const pl: [number, number][] = [[xIn, 0]];
  if (plan(0) > xIn) pl.push([plan(0), 0]);
  for (let d = 0.02; d <= 1.2; d += 0.02) if (plan(d) > pl[pl.length - 1][0] - 1e-6) pl.push([plan(d), d]);
  const cum = [0];
  for (let i = 1; i < pl.length; i++) cum.push(cum[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
  const build = (st: LampStrip, off: number): THREE.BufferGeometry => {
    const pos: number[] = [];
    const pt = (sKnot: number, y: number): [number, number, number] => {
      const sa = clamp(sKnot, 0, cum[cum.length - 1]);
      let i = 1;
      while (i < pl.length - 1 && cum[i] < sa) i++;
      const t = (sa - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      const x = lerp(pl[i - 1][0], pl[i][0], t), d = lerp(pl[i - 1][1], pl[i][1], t);
      const tx = pl[i][0] - pl[i - 1][0], td = pl[i][1] - pl[i - 1][1];
      const tl = Math.hypot(tx, td) || 1;
      const nx = td / tl, nd = -tx / tl; // outward normal in (x, d): out and toward the tip
      const u = front ? tipU - d - nd * off : tipU + d + nd * off;
      return [x + nx * off, yc + y * k, -u];
    };
    for (let i = 0; i < st.s.length - 1; i++) {
      const a = pt(st.s[i], st.lo[i]), b = pt(st.s[i], st.hi[i]), c = pt(st.s[i + 1], st.lo[i + 1]), d = pt(st.s[i + 1], st.hi[i + 1]);
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // faces must look outward: the first triangle (on the end face) should face away from the car
    const n0 = new THREE.Vector3(g.attributes.normal.getX(0), g.attributes.normal.getY(0), g.attributes.normal.getZ(0));
    const outward = new THREE.Vector3(0.3, 0, front ? -1 : 1).normalize();
    if (n0.dot(outward) < 0) {
      const a = g.attributes.position as THREE.BufferAttribute;
      for (let t = 0; t < a.count; t += 3) { const x = a.getX(t + 1), y = a.getY(t + 1), z = a.getZ(t + 1); a.setXYZ(t + 1, a.getX(t + 2), a.getY(t + 2), a.getZ(t + 2)); a.setXYZ(t + 2, x, y, z); }
      g.computeVertexNormals();
    }
    return g;
  };
  return { lens: spec.lens.map((l) => build(l, 0.02)), housing: [build(spec.housing, 0.01)] };
}

export function buildPassengerParts(typeIn: PassengerStyle | 'unmarked', spec: VehicleSpec, refine: 1 | 2 = 2): CarParts {
  const unmarked = typeIn === 'unmarked';
  const type: PassengerStyle = typeIn === 'unmarked' ? 'cop' : typeIn;
  const st = STYLES[type === 'cab' ? 'crown' : type === 'cop' ? 'charger' : type === 'ambulance' ? 'cargo' : type];
  const hatchy = st.rails || !!st.hatchback; // tailgate bodies: no boot lid, no rear bench
  const planAt = monotone(st.plan.map((p) => p[0]), st.plan.map((p) => p[1]));
  const { length: L, width: W, height: H } = st.dims ? { length: st.dims.L, width: st.dims.W, height: st.dims.H } : spec;
  const kx = L / st.Lref;
  const ky = H / st.Href;
  const R = st.wheelR;
  const arch = archOf(R, st.sill);
  const Wb2 = W / 2 - 0.05;                // body half-width (mirrors reach W / 2 + 0.02)
  const tipF = L / 2 - 0.04;
  const tipR = -(L / 2 - 0.04);
  const drF = st.endF ?? 0.5;
  const drR = st.endR ?? 0.4;
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
    const wMax = Wb2 * (0.6 + 0.4 * g) * planAt(u / kx);
    return { yT, yBelt, yBot, wMax, wR: fwR(u) * wMax, yGl: st.glassTop === undefined ? undefined : st.glassTop * ky };
  };

  // ---- window layout in real metres
  const sx = (r: V2): V2 => [r[0] * kx, r[1] * kx];
  const ws = sx(st.windshield);
  const doors = st.doorGlass.map(sx);
  const bp = sx(st.bPillar);
  const rg = st.rearGlass ? sx(st.rearGlass) : null;
  const seams = st.seams.map((v) => v * kx);
  const handles = st.handles.map((v) => v * kx);
  const hoodBackU = st.hoodBack * kx;
  const hoodFrontU = tipF - 0.16 * drF;
  const quarter = axleF - arch.halfChord - 0.03; // cladding between the arches
  const bed = st.bed ? { u0: st.bed.u0 * kx, u1: st.bed.u1 * kx, floor: st.bed.floor * ky } : null;

  const cls = (um: number, j: number): Kind => {
    if (um <= hoodFrontU && um >= hoodBackU && j <= 5) return 'none'; // under the hood panel (a flat dark box fills the bay)
    if (bed && um <= bed.u0 && j <= 5) return 'none'; // pickup: the open bed
    const inW = inI(um, ws);
    if ((inW || (rg && inI(um, rg))) && j <= 1) return 'glass';
    if (inI(um, bp) && j >= 3 && j <= 5) return 'dark';
    if (j >= 3 && j <= 5) {
      if (doors.some((d) => inI(um, d))) {
        if (st.glassTop !== undefined) { if (j >= 4) return 'glass'; } // van: only the band under the glass top
        else if (!inW || j >= 4) return 'glass';
      }
    }
    if (j === 11) return 'none'; // underside, covered by the pan
    if (j === 10) {
      if (Math.abs(um - axleF) < arch.halfChord + 0.05 || Math.abs(um - axleR) < arch.halfChord + 0.05) return 'dark';
      if (Math.abs(um) < axleF) return 'dark';
    }
    if (j >= st.clad && j >= 9 && Math.abs(um) < quarter + arch.halfChord) return 'dark';
    return 'paint';
  };

  const must: number[] = [tipF, tipR, ...ws, ...doors.flat(), ...bp, ...(rg ?? []), hoodBackU, hoodFrontU, ...(bed ? [bed.u0] : [])]; // seams snap to the nearest station
  const want: number[] = [];
  for (const t of st.endT ?? END_T) { want.push(tipF - t * drF, tipR + t * drR); }
  for (const ax of [axleF, axleR]) want.push(...archStations(arch, ax, st.archN ?? 4));
  const us = stationList(must, want, (st.maxGap ?? 0.7) * kx);

  const hull = buildLoft({ us, half: (u) => carHalf(ring(u)), creases: [CAR_CREASE], cls, refine });
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
  // skinned bodies (sedan, coupe, SUV) carry their door gaps in the baked skin + normal map; ribbons would double the lines
  cabinTrim(hull, chrome, trim, { ws, doors, rg, seams: type === 'cab' || type === 'cop' ? seams : [], topSlot: st.glassTop !== undefined ? 4 : undefined });
  for (const hu of handles) {
    const yH = fyBelt(hu) - 0.075;
    chrome.addBoth(bx(0.012, 0.022, 0.13, sideX(hu, yH) + 0.008, yH, -hu));
  }
  // fuel filler flap on the right rear quarter: a thin dark outline (the flap itself stays body colour)
  if (!hatchy) {
    const uF = tipR + 0.62 * kx;
    const yF = fyBelt(uF) - 0.14;
    const sxF = sideX(uF, yF) + 0.004;
    const fw = 0.16, fh = 0.12, lw = 0.006;
    for (const [dz, dy, w2, h2] of [[0, fh / 2, fw, lw], [0, -fh / 2, fw, lw], [fw / 2, 0, lw, fh], [-fw / 2, 0, lw, fh]] as const) {
      trim.add(decalX(w2, h2, 1, sxF, yF + dy, -uF + dz));
    }
  }

  // ---- hood and trunk-lid cut lines: constant-width dark ribbons that follow the hull (the hood panel itself sits 6 mm proud)
  {
    const iB = hull.at(hoodBackU), iF = hull.at(hoodFrontU);
    const edge = (slot: number): [number, number][] => seq(iB, iF).map((i) => [i, slot] as [number, number]);
    for (const sl of [18, 6]) trim.add(rib(edge(sl), 0.009, 0.011));
    const across = (i: number): [number, number][] => [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6].map((sl) => [i, sl] as [number, number]);
    trim.add(rib(across(iB), 0.009, 0.011));
    trim.add(rib(across(iF), 0.009, 0.011));
    if (!hatchy && rg) {
      const iT0 = hull.at(rg[1] - 0.04 * kx), iT1 = hull.at(tipR + 0.3 * kx);
      for (const sl of [18, 6]) trim.add(rib(seq(iT0, iT1).map((i) => [i, sl] as [number, number]), 0.009, 0.011));
      trim.add(rib(across(iT0), 0.009, 0.011));
      trim.add(rib(across(iT1), 0.009, 0.011));
    } else if (rg && !bed) {
      const iT0 = hull.at(rg[1] + 0.02 * kx);
      trim.add(rib(across(iT0), 0.009, 0.011)); // tailgate cut line
    }
  }

  // ---- wheel liners
  const wTyre = st.wheelW;
  const wx = Wb2 - 0.03 - 0.52 * wTyre;
  for (const ax of [axleF, axleR]) {
    trim.addBoth(wheelLiner(arch, wx - 0.52 * wTyre - 0.03, Wb2 - 0.01, -ax));
  }

  // ---- pickup bed: liner floor, inner walls, cab back wall, wheel-well humps, rim caps, tailgate handle
  if (bed) {
    const len = bed.u0 - bed.u1 - 0.1, mid = -(bed.u0 + bed.u1) / 2;
    const yRail = fyBelt(bed.u0 - 0.2) - 0.01;
    const hw = Wb2 - 0.07;
    trim.add(bx(2 * hw, 0.05, len, 0, bed.floor, mid)); // liner floor
    for (const s2 of [-1, 1]) {
      trim.add(bx(0.05, yRail - bed.floor, len, s2 * hw, (yRail + bed.floor) / 2, mid)); // inner wall
      trim.add(bx(0.2, 0.26, 0.64, s2 * (hw - 0.1), bed.floor + 0.15, -axleR)); // wheel-well hump
      chrome.add(bx(0.06, 0.016, len, s2 * (hw + 0.01), yRail + 0.004, mid)); // rail cap
    }
    trim.add(bx(2 * hw, yRail - bed.floor, 0.06, 0, (yRail + bed.floor) / 2, -(bed.u0 - 0.03))); // cab back wall (bed side)
    trim.add(bx(2 * hw, 0.05, 0.04, 0, bed.floor + 0.2, -(bed.u1 + 0.08))); // tailgate inner lip
    trim.add(bx(0.32, 0.04, 0.025, 0, yRail - 0.12, -(bed.u1 - 0.003))); // tailgate handle
    for (let k = 0; k < 5; k++) trim.add(bx(2 * hw - 0.1, 0.012, 0.05, 0, bed.floor + 0.03, mid + (k - 2) * 0.32)); // liner ribs
  }

  // ---- mirrors (paint housing + dark face), tips stay within W / 2 + 0.02
  const uMir = doors[0][0] - 0.02;
  if (st.mirror === 'van') {
    // tall upright van mirror on a short arm: dark housing and a glass-black face, still inside the +0.02 m width allowance
    const yM = 1.62 * ky;
    trim.addBoth(bx(0.07, 0.3, 0.17, Wb2 + 0.03, yM, -uMir - 0.04));
    trim.addBoth(bx(0.1, 0.03, 0.04, Wb2 - 0.04, yM - 0.05, -uMir - 0.02));
    chrome.addBoth(bx(0.012, 0.26, 0.15, Wb2 + 0.062, yM, -uMir - 0.04));
  } else {
    const yMir = fyBelt(uMir) + 0.075;
    const mx = Wb2 + 0.01;
    const housing = new THREE.SphereGeometry(1, 5, 3).scale(0.045, 0.045, 0.08);
    housing.translate(mx, yMir, -uMir);
    paint.addBoth(housing);
    trim.addBoth(bx(0.1, 0.02, 0.04, Wb2 - 0.01, yMir - 0.03, -uMir - 0.02));
  }

  // ---- wipers (two dark blades at the windshield base) and a cowl strip
  {
    const rw = ring(ws[0] - 0.04);
    for (const sx2 of [-1, 1]) {
      const wp = bx(0.5, 0.01, 0.014, sx2 * 0.3 + 0.12, rw.yT + 0.015, -(ws[0] - 0.05));
      wp.rotateY(0); trim.add(wp);
    }
    trim.add(bx(2 * rw.wMax * 0.8, 0.012, 0.05, 0, rw.yT + 0.008, -(ws[0] + 0.02)));
  }

  // ---- front / rear fascia
  const trF = ring(tipF);
  const trR = ring(tipR);
  const bumperZ = L / 2;
  trim.add(bumperGeo(2 * Wb2 * 0.88, 0.2, st.bumperH, st.bumperY, -(bumperZ - 0.2), false));
  trim.add(bumperGeo(2 * Wb2 * 0.88, 0.2, st.bumperH, st.bumperY, bumperZ - 0.2, true));
  // lower intake slot + fog lamps (front)
  const intakeW = st.grille === 'mesh' ? 0.74 : st.grille === 'wedge' ? 0.66 : st.grille === 'bars' ? 0.34 : 0.5;
  trim.add(bx(2 * Wb2 * intakeW, st.grille === 'mesh' ? 0.09 : 0.07, 0.02, 0, st.bumperY - 0.03, -(bumperZ + 0.004)));
  if (st.grille === 'mesh') chrome.add(bx(2 * Wb2 * intakeW + 0.04, 0.012, 0.016, 0, st.bumperY + 0.03, -(bumperZ + 0.012))); // splitter lip line
  if (st.grille === 'wedge') trim.add(bx(2 * Wb2 * 0.4, 0.05, 0.02, 0, st.bumperY + 0.07, -(bumperZ + 0.004))); // stepped trapezoid intake
  for (const s of st.rails || st.mirror ? [] : [-1, 1]) { // the SUV's tall bumper carries no fog lamps (triangle budget)
    chrome.add(new THREE.CircleGeometry(0.045, 8).rotateY(Math.PI).translate(s * (Wb2 * 0.78), st.bumperY - 0.02, -(bumperZ + 0.004)));
  }
  // grille: dark panel, two chrome slats, chrome surround, badge
  const gW = trF.wMax * (st.grilleW ?? 0.8);
  const gH = 0.17;
  const gY = trF.yT - 0.13;
  const gZ = -(tipF + 0.006);
  trim.add(bx(2 * gW, gH, 0.016, 0, gY, gZ));
  if (st.grille === 'bars') {
    for (let k = -4; k <= 4; k++) chrome.add(bx(0.012, gH - 0.02, 0.014, k * (gW * 0.22), gY, gZ - 0.01)); // upright chrome bars
  } else if (st.grille === 'mesh') {
    chrome.add(bx(2 * gW - 0.04, 0.02, 0.014, 0, gY, gZ - 0.01)); // one bar across a black mesh
  } else if (st.grille === 'kidney') {
    for (const sx2 of [-1, 1]) { // twin kidney grilles: a chrome frame with vertical dark slats
      const cx2 = sx2 * gW * 0.5;
      chrome.add(bx(gW * 0.9, 0.014, 0.016, cx2, gY + gH / 2 - 0.01, gZ - 0.01));
      chrome.add(bx(gW * 0.9, 0.014, 0.016, cx2, gY - gH / 2 + 0.01, gZ - 0.01));
      chrome.add(bx(0.014, gH - 0.02, 0.016, cx2 + sx2 * gW * 0.45, gY, gZ - 0.01));
      chrome.add(bx(0.014, gH - 0.02, 0.016, cx2 - sx2 * gW * 0.45, gY, gZ - 0.01));
      for (let k = -1; k <= 1; k++) chrome.add(bx(0.01, gH - 0.05, 0.012, cx2 + k * gW * 0.24, gY, gZ - 0.008));
    }
  } else if (st.grille === 'bigbar') {
    for (let k = -1; k <= 1; k += 2) chrome.add(bx(2 * gW, 0.05, 0.02, 0, gY + k * 0.06, gZ - 0.012)); // two fat chrome bars on a black grid
    chrome.add(bx(2 * gW + 0.06, 0.03, 0.02, 0, gY - 0.17, gZ - 0.008));
  } else if (st.grille === 'slats') {
    for (let k = -1; k <= 1; k++) chrome.add(bx(2 * gW - 0.04, 0.02, 0.014, 0, gY + k * (gH / 3), gZ - 0.01)); // three thick slats
  } else {
    for (let k = 0; k < 2; k++) chrome.add(bx(2 * gW - 0.04, 0.014, 0.014, 0, gY - gH / 4 + k * (gH / 2), gZ - 0.01));
  }
  chrome.add(bx(2 * gW + 0.03, 0.014, 0.018, 0, gY + gH / 2 + 0.005, gZ - 0.004));
  chrome.add(bx(2 * gW + 0.03, 0.014, 0.018, 0, gY - gH / 2 - 0.005, gZ - 0.004));
  chrome.add(cylZ(0.028, 0.012, 0, gY, gZ - 0.012, 8));
  // rear: chrome strip over the bumper, exhaust tip
  const exX = Wb2 - 0.34;
  // exhaust tips tucked under the valance (a tip hanging behind the bumper reads as a detached pipe)
  if (!st.mirror) chrome.add(cylZ(0.04, 0.12, exX, st.bumperY - st.bumperH / 2 + 0.01, bumperZ - 0.24, 8));
  if (type === 'pony' || type === 'luxury') chrome.add(cylZ(0.04, 0.12, -exX, st.bumperY - st.bumperH / 2 + 0.01, bumperZ - 0.24, 8)); // dual exhaust
  // underbody pan so the sky never shows under the car, and a dark box filling the engine bay under the hood panel
  trim.add(bx(2 * (Wb2 - 0.14), 0.04, L - 0.5, 0, st.sill + 0.04, 0));
  trim.add(bx(2 * (Wb2 - 0.2), 0.04, hoodFrontU - hoodBackU, 0, fyBelt((hoodBackU + hoodFrontU) / 2) - 0.1, -(hoodBackU + hoodFrontU) / 2));

  // ---- interior (seen through the glass): dash with a cluster hood, steering wheel, console, two front seats with
  // headrests, a rear bench, door cards and parcel shelf. All dark/chrome trim, so the extra detail costs no draw call.
  const yBeltC = fyBelt(0);
  const seatY = st.sill + 0.5 * ky;
  const iw = Wb2 * 0.78;
  if (!st.rails) {
    trim.add(bx(2 * iw, 0.2, 0.3, 0, yBeltC - 0.13, -(ws[0] - 0.22)));
    trim.add(bx(0.4, 0.07, 0.16, -0.38, yBeltC - 0.02, -(ws[0] - 0.12))); // cluster hood
  }
  const seatU = doors[0][1] + 0.3 * kx;
  const wheelU = ws[0] - 0.34;
  trim.add(new THREE.TorusGeometry(0.17, 0.017, 4, 10).rotateX(-0.9).translate(-0.37, yBeltC - 0.06, -wheelU)); // steering wheel
  trim.add(cylZ(0.02, 0.22, -0.37, yBeltC - 0.12, -(wheelU + 0.1), 5));
  for (const s of [-1, 1]) {
    trim.add(bx(0.46, 0.5, 0.12, s * 0.35, seatY + 0.28, -(seatU - 0.22))); // seat back
    trim.add(bx(0.46, 0.1, 0.5, s * 0.35, seatY + 0.03, -(seatU + 0.02))); // cushion
    trim.add(bx(0.2, 0.13, 0.08, s * 0.35, seatY + 0.6, -(seatU - 0.22))); // headrest
    trim.add(bx(0.06, 0.34, 0.9 * kx, s * (Wb2 - 0.07), yBeltC - 0.22, -(doors[0][0] + doors[0][1]) / 2)); // door card
  }
  trim.add(bx(0.16, 0.14, 0.6, 0, seatY + 0.05, -(seatU + 0.12))); // centre console
  if (!hatchy && rg) {
    trim.add(bx(2 * Wb2 * 0.72, 0.5, 0.12, 0, seatY + 0.26, -(rg[0] + 0.2)));
    trim.add(bx(2 * Wb2 * 0.72, 0.1, 0.5, 0, seatY + 0.0, -(rg[0] + 0.45))); // rear cushion
    for (const s of [-1, 0, 1]) trim.add(bx(0.16, 0.1, 0.07, s * 0.4, seatY + 0.58, -(rg[0] + 0.2))); // rear headrests
    trim.add(bx(2 * Wb2 * 0.8, 0.03, 0.34, 0, fyBelt(rg[1]) + 0.03, -(rg[1] + 0.2))); // parcel shelf
  }
  if (hatchy && st.glassTop === undefined) {
    // tailgate bodies: a bench or captain's chairs under every rear side window
    for (let d = 1; d < doors.length; d++) {
      const uc = (doors[d][0] + doors[d][1]) / 2;
      for (const s2 of st.rails || st.windowed ? [] : st.doorGlass.length >= 3 && d === 1 ? [-1, 1] : [-1, 0, 1]) {
        const w2 = st.doorGlass.length >= 3 && d === 1 ? 0.46 : 0.34;
        trim.add(bx(w2, 0.5, 0.12, s2 * (w2 + 0.04), seatY + 0.26, -(uc + 0.24)));
        trim.add(bx(w2, 0.1, 0.46, s2 * (w2 + 0.04), seatY, -uc));
      }
    }
  }

  // ---- roof rails (SUV)
  const iRoofA = hull.at(secs[st.rails ? 3 : 4][0]);
  void iRoofA;
  if (st.rails) {
    const iR0 = hull.at(secs[2][0] + 0.12);
    const iR1 = hull.at(secs[4][0] - 0.05);
    const pts: THREE.Vector3[] = [];
    for (const i of seq(iR0, iR1)) pts.push(hull.P(i, 3).addScaledVector(hull.N(i, 3), 0.028));
    const pA = pts[0], pB = pts[pts.length - 1];
    chrome.addBoth(bx(0.03, 0.03, Math.abs(pB.z - pA.z), (pA.x + pB.x) / 2, (pA.y + pB.y) / 2 + 0.01, (pA.z + pB.z) / 2));
    for (const f of [0.25, 0.75]) {
      const i = Math.round(lerp(iR0, iR1, f));
      const p = hull.P(i, 3);
      chrome.add(bx(2 * p.x, 0.022, 0.035, 0, p.y + 0.03, p.z));
    }
  }
  if (st.spoiler && type !== 'cop' && type !== 'cab') {
    const uS = tipR + 0.2;
    const rr = ring(uS);
    const sp = new THREE.BoxGeometry(2 * (rr.wMax - 0.17), 0.022, 0.13);
    sp.rotateX(-0.22);
    sp.translate(0, rr.yT + 0.012, -uS);
    paint.add(sp);
  }

  // ---- cop gear / cab roof light
  const copBarU = secs[st.rails ? 3 : 5][0];
  const roofY = hull.P(hull.at(copBarU), 0).y;
  const ambU = secs[3][0], ambY = hull.P(hull.at(ambU), 0).y; // the ambulance bar sits on the flat roof, not over the sloping windshield header
  const roofLamp = new Acc();
  if (type === 'cop' && !unmarked) {
    for (const s of [-1, 1]) trim.add(bx(0.05, 0.42, 0.05, s * 0.5, 0.52, -(L / 2 - 0.01)));
    trim.add(bx(1.05, 0.05, 0.05, 0, 0.7, -(L / 2 - 0.01)));
    trim.add(bx(1.1, 0.05, 0.34, 0, roofY + 0.03, -copBarU));
  } else if (type === 'cop') {
    // unmarked: a push bar only (no roof bar); the strobes sit in the grille and behind the windshield (lightbar lenses below)
    trim.add(bx(1.0, 0.05, 0.05, 0, 0.6, -(L / 2 - 0.01)));
  } else if (type === 'ambulance') {
    trim.add(bx(1.5, 0.05, 0.34, 0, ambY + 0.03, -ambU)); // roof light bar base, on the flat of the roof
    for (const s2 of [-1, 1]) trim.add(bx(0.06, 0.06, 0.06, s2 * (st.dims!.W / 2 - 0.2), 1.9 * ky, -(doors[0][0] + 0.1))); // side warning lamps
  } else if (type === 'cab') {
    trim.add(bx(0.4, 0.03, 0.2, 0, roofY + 0.015, -copBarU));
    roofLamp.add(bx(0.38, 0.1, 0.17, 0, roofY + 0.08, -copBarU));
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
  const yc = hull.P(iHB, 0).y + 0.006;
  const hoodGeo = new Acc().add(hoodSurface(0.006)).merge();
  hoodGeo.translate(0, -yc, hoodBackU);

  // ---- lights: one merged mesh per lamp colour (head / tail), in car space
  const lampHeadY = trF.yT - 0.09;
  const lampTailY = trR.yT - 0.12;
  const lx = trF.wMax - 0.15;
  const ltx = trR.wMax - 0.17;
  const head = new Acc();
  const tail = new Acc();
  if (st.headLamp && st.lampD !== undefined && WRAP_LAMPS[st.headLamp]) {
    const hp = wrapLamp(st.headLamp, true, tipF, (d) => ring(tipF - d).wMax - 0.012, trF.wMax * (st.grilleW ?? 0.8) + 0.04, st.headY ?? ring(tipF - 0.15).yBelt - 0.14);
    for (const g of hp.lens) head.addBoth(g);
    for (const g of hp.housing) trim.addBoth(g);
  } else if (st.headLamp) {
    const hp = lampPieces(st.headLamp, true, v3(lx, st.headY ?? lampHeadY, -tipF), -0.22);
    for (const g of hp.lens) head.addBoth(g);
    for (const g of hp.housing) trim.addBoth(g);
  } else {
    for (const [sx2, yaw] of [[-1, 0.25], [1, -0.25]] as const) head.add(placeLamp(lensGeo(0.14, 0.05, 0.045, true), v3(sx2 * lx, lampHeadY, -tipF), yaw));
  }
  if (st.tailLamp && st.tailD !== undefined && WRAP_LAMPS[st.tailLamp]) {
    const wide = st.tailLamp !== 'tall';
    const tp = wrapLamp(st.tailLamp, false, tipR, (d) => ring(tipR + d).wMax - 0.012, ring(tipR).wMax - (wide ? 0.36 : 0.03), st.tailY ?? (wide ? ring(tipR + 0.1).yT - 0.17 : ring(tipR + 0.1).yT - 0.2), st.glassTop !== undefined ? 2 : 1);
    for (const g of tp.lens) tail.addBoth(g);
    for (const g of tp.housing) trim.addBoth(g);
  } else if (st.tailLamp) {
    const tp = lampPieces(st.tailLamp, false, v3(ltx - 0.1, st.tailY ?? lampTailY, -tipR), 0.2);
    for (const g of tp.lens) tail.addBoth(g);
    for (const g of tp.housing) trim.addBoth(g);
  } else {
    for (const [sx2, yaw] of [[-1, -0.2], [1, 0.2]] as const) tail.add(placeLamp(lensGeo(0.16, 0.045, 0.04, false), v3(sx2 * ltx, lampTailY, -tipR), yaw));
  }
  if (roofLamp.size) head.add(roofLamp.merge());

  const parts: CarParts = {
    paint: paint.merge(),
    glass: glass.merge(),
    trim: mergeTrim(trim, chrome),
    hood: { geo: hoodGeo, pivot: v3(0, yc, -hoodBackU) },
    lampHead: head.merge(),
    lampTail: tail.merge(),
    plate: platesGeo([v3(0, st.bumperY, -(bumperZ + 0.003)), v3(0, st.bumperY, bumperZ + 0.003)]),
    wheels: [],
    wheelR: R,
    wheelW: wTyre,
    sections: st.secs.length,
  };
  for (const s of [-1, 1]) {
    parts.wheels.push({ x: s * wx, z: -axleF, front: true });
    parts.wheels.push({ x: s * wx, z: -axleR, front: false });
  }

  if (type === 'cop' || type === 'cab') {
    liveryUV(parts.paint, L);
    liveryUV(parts.hood!.geo, L);
  }
  if (type === 'cop' && !unmarked) {
    parts.lightbar = {
      lens: new THREE.BoxGeometry(0.52, 0.1, 0.28),
      a: v3(-0.29, roofY + 0.085, -copBarU),
      b: v3(0.29, roofY + 0.085, -copBarU),
    };
  } else if (type === 'cop') {
    const yD = fyBelt(ws[0] - 0.4) + 0.03;
    parts.lightbar = { lens: new THREE.BoxGeometry(0.22, 0.045, 0.07), a: v3(-0.3, yD, -(ws[0] - 0.3)), b: v3(0.3, yD, -(ws[0] - 0.3)) };
  } else if (type === 'ambulance') {
    const yB = ambY + 0.085;
    parts.lightbar = { lens: new THREE.BoxGeometry(0.7, 0.1, 0.28), a: v3(-0.38, yB, -ambU), b: v3(0.38, yB, -ambU) };
  }
  // ---- anchors for per-car extras (carExtras.ts)
  {
    const top = Math.max(...secs.map((q) => q[1]));
    const flat = secs.filter((q) => q[1] >= top - 0.05).map((q) => q[0]);
    const uA = Math.max(...flat), uB = Math.min(...flat);
    const iMid = hull.at((uA + uB) / 2);
    const quad = (u0: number, u1: number, s0: number, s1: number): THREE.Vector3[] => {
      const i0 = hull.at(u0), i1 = hull.at(u1);
      return [[i0, s0], [i0, s1], [i1, s1], [i1, s0]].map(([i, sl]) => hull.P(i, sl).addScaledVector(hull.N(i, sl), 0.008));
    };
    parts.anchors = {
      roof: { y: hull.P(iMid, 0).y, u0: uA, u1: uB, hw: Math.abs(hull.P(iMid, 3).x) },
      rear: { z: L / 2, y: st.bumperY, hw: Wb2 * 0.88 },
      wsQuad: st.glassTop === undefined ? quad(ws[0] - 0.05, ws[0] - 0.2, 1, 2) : null,
      rgQuad: rg && st.glassTop === undefined && !bed && !hatchy ? quad(rg[1] + 0.2, rg[1] + 0.06, 1, 2) : null,
      hoodFront: v3(0, ring(hoodFrontU - 0.05).yT + 0.012, -(hoodFrontU - 0.05)),
      exX,
    };
  }
  return parts;
}

// ---------------------------------------------------------------- box truck

// ROSTER. "Hauler 150": a light-duty cab-over box truck of the Isuzu NPR type with a 16 ft box body. Sources (WebSearch, 10 Nov 2026):
// wheelbase 150 in (3.81 m) on the 16-18 ft chassis (https://isuzucv.com/pdfs/diesel_measurements.pdf), cab width 81.3 in (2.06 m),
// cab height ~90 in (2.3 m), body width 96 in (2.44 m), overall height with the box ~3.3 m, overall length of a 16 ft box truck ~7.0 m
// (https://xr793.com/wp-content/uploads/2020/02/2020-Isuzu-N-Series.pdf, https://www.lynchtruckcenter.com/p/2025-isuzu-npr-npr-hd).
// 19.5 in wheels (225/70R19.5, R 0.405 m), dual rear tyres, roll-up rear door.
const TRUCK_R = 0.405;
/** garbage truck: 22.5 in tyres */
export const GARBAGE_R = 0.5;
const TRUCK_AXLES: [number, number] = [2.45, -1.36];

/** [u, roof height, belt height, roof half-width fraction] for the cab, metres. */
const TRUCK_CAB_SECS: [number, number, number, number][] = [
  [1.5, 2.28, 1.45, 0.95],
  [2.1, 2.3, 1.45, 0.95],
  [2.85, 2.28, 1.45, 0.95],
  [3.0, 2.22, 1.45, 0.94],
  [3.2, 1.9, 1.45, 0.93],
  [3.34, 1.62, 1.45, 0.92],
  [3.4, 1.58, 1.45, 0.92],
];

/**
 * `kind = 'garbage'` ("Boro Sanitation"): a low cab-forward refuse truck of the Mack LR type with a rear-loader packer body on a tandem rear axle.
 * Wheelbase 186-221 in (4.7-5.6 m) per https://www.truckinginfo.com/301074/driving-macks-low-ride-refuse-hauler and https://www.truckpaper.com/listing/for-sale/257093773/2026-mack-lr64-packer-garbage-trucks ;
 * overall 9.2 x 2.5 x 3.6 m is an estimate (the searches returned no overall dimensions).
 */
export function buildTruckParts(spec: VehicleSpec, kind: 'box' | 'garbage' = 'box'): CarParts {
  const { length: L, width: W, height: H } = spec;
  const G = kind === 'garbage';
  const R = G ? GARBAGE_R : TRUCK_R;
  const ww = G ? 0.3 : 0.23;
  const sill = G ? 0.7 : 0.62;
  const arch = archOf(R, sill);
  const dU = G ? (L - 7) / 2 : 0;
  const CAB = TRUCK_CAB_SECS.map(([u, yT, yB, wr]) => [u + dU, G ? yT * 1.08 : yT, yB, wr] as [number, number, number, number]);
  const Wc2 = G ? 1.12 : 1.03;     // cab half-width (2.06 m cab; the refuse cab is 2.24)
  const Wg2 = W / 2 - 0.025;       // box half-width
  const uF = L / 2 - 0.1;          // cab nominal front
  const uB = CAB[0][0]; // cab back
  const axleF = G ? uF - 0.95 : TRUCK_AXLES[0];
  const axleR = G ? axleF - 4.9 : TRUCK_AXLES[1];
  const axleR2 = axleR - 1.32; // garbage: tandem rear

  // ---- cab hull
  const secs = CAB.map(([u, yT, yB, wr], i, a) => [i === 0 ? uB : i === a.length - 1 ? uF : u, yT, yB, wr] as const);
  const su = secs.map((s) => s[0]);
  const fyT = monotone(su, secs.map((s) => s[1]));
  const fyBelt = monotone(su, secs.map((s) => s[2]));
  const fwR = monotone(su, secs.map((s) => s[3]));
  const drF = 0.22;
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
    yBot = Math.max(yBot, sill + (front ? 0.2 : 0) * (1 - t) * (1 - t));
    const yBelt = fyBelt(u) - drop;
    yBot = Math.min(yBot, yBelt - 0.2);
    const wMax = Wc2 * (0.88 + 0.12 * g);
    return { yT: fyT(u) - drop, yBelt, yBot, wMax, wR: fwR(u) * wMax };
  };
  const ws: V2 = [3.33 + dU, 2.88 + dU];
  const doors: V2[] = [[3.08 + dU, 2.15 + dU]];
  const bp: V2 = [2.15 + dU, 2.03 + dU];
  const seams = [3.12 + dU, 2.0 + dU];
  const cabCls = (um: number, j: number): Kind => {
    if (inI(um, ws) && j <= 1) return 'glass';
    if (inI(um, bp) && j >= 3 && j <= 5) return 'dark';
    if (j >= 3 && j <= 5 && doors.some((d) => inI(um, d)) && (!inI(um, ws) || j >= 4)) return 'glass';
    if (j === 11) return 'none';
    if (j === 10) return 'dark';
    return 'paint';
  };
  const want: number[] = [];
  for (const t of END_T) want.push(uF - t * drF, uB + t * drB);
  want.push(...archStations(arch, axleF));
  const us = stationList([uF, uB, ...ws, ...doors.flat(), ...bp], want, 0.8);
  const cab = buildLoft({ us, half: (u) => carHalf(ring(u)), creases: [CAR_CREASE], cls: cabCls });
  const trF = ring(uF);

  // ---- cargo box hull: 16 ft box (4.9 m), floor 1.05 m, roof at the spec height; it overhangs the cab by 0.4 m each side
  const cargoBack = -L / 2 + 0.04;
  const cargoFront = uB - 0.05;
  const boxRing = (u: number): V2[] => {
    const d = Math.min(cargoFront - u, u - cargoBack);
    const g = endG(d, 0.1);
    const s = 1 - 0.06 * (1 - g);
    if (G) {
      // packer body: a rounded barrel, full height forward of the hopper, a lower loading lip over the last 1.5 m
      const top = u < cargoBack + 1.5 ? H - 0.9 - 0.05 * (1 - g) + 0.9 * Math.max(0, (u - cargoBack - 0.9) / 0.6) : H - 0.02 - 0.05 * (1 - g);
      return boxHalf(Wg2 * s, 1.2 + 0.05 * (1 - g), Math.min(H - 0.02, top), 0.42);
    }
    return boxHalf(Wg2 * s, 1.05 + 0.05 * (1 - g), H - 0.02 - 0.05 * (1 - g), 0.07);
  };
  const boxUs = stationList([cargoBack, cargoFront, ...(G ? [cargoBack + 0.9, cargoBack + 1.5] : [])], END_T.flatMap((t) => [cargoBack + t * 0.1, cargoFront - t * 0.1]), G ? 1.4 : 8);
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
  for (const hu of [2.3 + dU]) {
    const yH = 1.5;
    chrome.addBoth(bx(0.016, 0.03, 0.16, sideX(hu, yH) + 0.012, yH, -hu));
  }

  // ---- wheel liners and interior
  const wx = G ? 0.98 : 0.86;
  trim.addBoth(wheelLiner(arch, wx - 0.52 * ww - 0.03, Wc2 - 0.01, -axleF));
  trim.add(bx(2 * Wc2 * 0.8, 0.3, 0.4, 0, 1.28, -(ws[0] - 0.3)));
  for (const s of [-1, 1]) {
    trim.add(bx(0.5, 0.8, 0.18, s * 0.4, 1.5, -(uB + 0.6)));
    trim.add(bx(0.5, 0.12, 0.5, s * 0.4, 1.12, -(uB + 0.85)));
  }
  trim.add(new THREE.TorusGeometry(0.19, 0.017, 4, 10).rotateX(-0.6).translate(-0.4, 1.5, -(ws[0] - 0.55)));

  // ---- mirrors on stalks (dark housings, chrome rim), a step under each door
  const yMc = 1.85;
  for (const s of [-1, 1]) {
    trim.add(bx(0.08, 0.34, 0.15, s * (Wc2 + 0.03), yMc, -(doors[0][0] - 0.02)));
    chrome.add(bx(0.09, 0.022, 0.16, s * (Wc2 + 0.03), yMc + 0.18, -(doors[0][0] - 0.02)));
    trim.add(bx(0.12, 0.03, 0.03, s * (Wc2 + 0.0), yMc + 0.1, -(doors[0][0] - 0.02)));
    trim.add(bx(0.12, 0.03, 0.03, s * (Wc2 + 0.0), yMc - 0.1, -(doors[0][0] - 0.02)));
    trim.add(bx(0.14, 0.04, 0.45, s * (Wc2 - 0.01), sill - 0.04, -(2.62 + dU))); // door step
  }

  // ---- fascia: bumper, grille, lamps
  trim.add(bumperGeo(2 * Wc2, 0.26, 0.28, G ? 0.55 : 0.48, -(L / 2 - 0.26), false));
  trim.add(bx(2 * Wc2 * 0.62, 0.36, 0.02, 0, trF.yBot + 0.32, -(uF + 0.006)));
  for (let k = 0; k < 3; k++) chrome.add(bx(2 * Wc2 * 0.6, 0.014, 0.016, 0, trF.yBot + 0.2 + k * 0.1, -(uF + 0.018)));
  chrome.add(cylZ(0.045, 0.014, 0, trF.yBot + 0.5, -(uF + 0.022), 8));
  const head = new Acc();
  const tail = new Acc();
  {
    const fx = trF.wMax - 0.2;
    const hp = lampPieces('box', true, v3(fx, 0.95, -(uF + 0.002)), -0.1);
    for (const g of hp.lens) head.addBoth(g);
    for (const g of hp.housing) trim.addBoth(g);
    const tp = lampPieces('tall', false, v3(Wg2 - 0.1, 1.55, L / 2 - 0.035), 0, 2.4);
    for (const g of tp.lens) tail.addBoth(g);
    for (const g of tp.housing) trim.addBoth(g);
  }

  // ---- chassis rails, fuel tank, rear bar, mudflaps, axles
  trim.add(bx(1.0, 0.22, L - 1.2, 0, 0.9, 0.0)); // frame rails under the box
  trim.add(bx(2 * Wg2 - 0.3, 0.14, 0.2, 0, 0.8, L / 2 - 0.1)); // rear underride bar
  trim.add(cylX(0.2, 0.7, G ? Wc2 - 0.3 : Wc2 - 0.1, 0.85, 0.3, 8));
  trim.add(cylX(0.07, 2 * wx, 0, R, -axleF, 6));
  trim.add(cylX(0.09, 2 * wx, 0, R, -axleR, 6));
  if (G) trim.add(cylX(0.09, 2 * wx, 0, R, -axleR2, 6));
  for (const s of [-1, 1]) trim.add(bx(0.02, 0.36, 0.34, s * (wx + 0.2), 0.32, -axleR + 0.6));
  chrome.add(cylZ(0.045, 0.1, Wc2 - 0.3, 0.7, L / 2 - 0.02, 8));

  // ---- cargo box details: roll-up door lines (rear), side ribs, lock bar
  const rz = -cargoBack + 0.006;
  if (G) {
    // rear loader: hopper mouth (dark), loading lip, packer blade slot, lift arms and comb, bumper step, side hatches, roof beacon
    // clean hopper: a dark opening panel just proud of the rear face, a loading sill, hinge pins and hydraulic rams on each side
    trim.add(bx(2 * Wg2 - 0.7, 0.85, 0.05, 0, 1.78, rz + 0.012)); // hopper opening
    trim.add(bx(2 * Wg2 - 0.4, 0.1, 0.2, 0, 1.3, rz - 0.07)); // loading sill
    trim.add(bx(2 * Wg2 - 0.4, 0.06, 0.06, 0, 2.24, rz - 0.01)); // top lip of the opening
    for (const s2 of [-1, 1]) {
      trim.add(bx(0.1, 0.9, 0.1, s2 * (Wg2 - 0.28), 1.78, rz - 0.03)); // lift-arm post
      trim.add(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6).translate(s2 * (Wg2 - 0.14), 1.95, rz - 0.02)); // hydraulic ram
      trim.add(bx(0.08, 0.08, 0.7, s2 * (Wg2 - 0.03), 2.5, -(cargoBack + 0.9))); // side hatch hinge
    }
    trim.add(bx(2 * Wg2 - 0.2, 0.18, 0.3, 0, 0.82, L / 2 - 0.17)); // rear step platform
    for (let k = -3; k <= 3; k++) chrome.add(bx(0.02, 0.4, 0.03, k * 0.3, 1.5, rz)); // comb teeth
  } else {
  for (let y = 1.4; y <= 3.12; y += 0.14) trim.add(decalZ(2 * Wg2 - 0.4, 0.016, 0, y, rz));
  trim.add(bx(2 * Wg2 - 0.36, 0.04, 0.03, 0, 1.3, rz + 0.01)); // bottom bar of the roll-up door
  for (const s of [-1, 1]) {
    trim.add(decalZ(0.03, 1.8, s * (Wg2 - 0.2), 2.22, rz));
    for (const u of [-2.9, -1.8, -0.7, 0.4]) trim.add(decalX(0.03, 1.95, s, Wg2 + 0.004, 2.18, -u));
    trim.add(decalX(4.5, 0.03, s, Wg2 + 0.004, 1.25, -1.0));
  }
  trim.add(decalZ(0.34, 0.07, 0, 1.55, rz));
  }

  const parts: CarParts = {
    paint: paint.merge(),
    paint2: ((g) => { boxLiveryUV(g); return g; })(paint2.merge()),
    glass: glass.merge(),
    trim: mergeTrim(trim, chrome),
    lampHead: head.merge(),
    lampTail: tail.merge(),
    plate: platesGeo([v3(0, G ? 0.55 : 0.48, -(L / 2 + 0.003)), v3(0, 0.8, L / 2 + 0.003)]),
    wheels: [],
    wheelR: R,
    wheelW: ww,
    dualRear: !G,
    sections: TRUCK_CAB_SECS.length,
  };
  for (const s of [-1, 1]) {
    parts.wheels.push({ x: s * wx, z: -axleF, front: true });
    parts.wheels.push({ x: s * wx, z: -axleR, front: false });
  }
  if (G) for (const s of [-1, 1]) parts.wheels.push({ x: s * wx, z: -axleR2, front: false }); // the tandem's second axle comes after the usual four
  return parts;
}

// ---------------------------------------------------------------- city bus

// ROSTER. "Metro 40": a 40 ft low-floor city transit bus of the New Flyer Xcelsior type: length 40-41 ft (12.2-12.5 m), width 102 in (2.59 m),
// height 10 ft 6 in (3.2 m), wheelbase 283.8 in (7.21 m), 22.5 in wheels (275/70R22.5, R ~0.5 m) with dual rears. Front door ahead of the
// front axle, middle door ahead of the rear axle, both on the curb (right) side; continuous window band; destination sign over the screen.
// Sources: https://en.wikipedia.org/wiki/New_Flyer_Xcelsior , https://nfiportal.nfigroup.com/site-content/uploads/2017/10/Xcelsior-CHARGE-Competetive-Comparison.pdf
export const BUS_AXLES: [number, number] = [3.65, -3.56];
export const BUS_BELT = 1.2;
/** door leaf edges (u, m): front door, middle door */
export const BUS_SEAMS = [5.5, 4.5, -1.1, -2.1];
const BUS_WIN_TOP = 2.5;

export function buildBusParts(spec: VehicleSpec): CarParts {
  const { length: L, width: W, height: H } = spec;
  const R = 0.5, ww = 0.3, sill = 0.32;
  const arch = archOf(R, sill);
  const [axF, axR] = BUS_AXLES;
  const tipF = L / 2, tipR = -L / 2;
  const wM0 = W / 2 - 0.03;
  const uScr = tipF - 0.2;           // windscreen starts here
  const scrDrop = 0.75;              // the screen's rake: the roof line falls this far over the last 0.2 m
  const panes: V2[] = [];
  for (let k = 0; k < 11; k++) { const hi = 5.5 - 1.1 * k; panes.push([hi, Math.max(hi - 1, tipR + 0.25)]); }
  const doorPanes: V2[] = [panes[0], panes[6]];
  const yTop = (u: number): number => {
    if (u > uScr) return H - scrDrop * ((u - uScr) / 0.2);
    if (u < tipR + 0.25) return H - 0.15 * ((tipR + 0.25 - u) / 0.25);
    return H;
  };
  const ring = (u: number): { yT: number; wM: number; yB: number } => {
    const d = Math.min(tipF - u, u - tipR);
    const g = endG(d, 0.3);
    const t = clamp(d / 0.3, 0, 1);
    let yB = Math.max(sill, archY(arch, u - axF), archY(arch, u - axR));
    yB = Math.max(yB, sill + 0.12 * (1 - t) * (1 - t));
    return { yT: yTop(u), wM: wM0 * (0.9 + 0.1 * g), yB };
  };
  const half = (u: number): V2[] => {
    const { yT, wM, yB } = ring(u);
    const y4 = Math.min(BUS_WIN_TOP, yT - 0.22);
    const y6 = BUS_BELT;
    const y5 = (y4 + y6) / 2;
    const y7 = yB + (y6 - yB) * 0.45;
    const y8 = yB + (y6 - yB) * 0.1;
    return [
      [0, yT],
      [wM * 0.45, yT - 0.015],
      [wM * 0.86, yT - 0.05],
      [wM - 0.04, yT - 0.17],
      [wM, y4],
      [wM, y5],
      [wM, y6],
      [wM, y7],
      [wM - 0.03, y8],
      [wM - 0.12, yB],
      [wM * 0.5, yB],
      [0, yB],
    ];
  };
  const cls = (um: number, j: number, left: boolean): Kind => {
    if (um >= uScr && j <= 1) return 'glass';
    if (j === 10) return 'none';
    if (j === 9) return 'dark';
    if (j === 4 || j === 5) {
      if (!left && doorPanes.some((d) => inI(um, d))) return 'glass';
      if (panes.some((d) => inI(um, d))) return 'glass';
    }
    if (j === 6 && !left && doorPanes.some((d) => inI(um, d))) return 'glass'; // the doors reach down to the kick panel
    return 'paint';
  };
  const must: number[] = [tipF, tipR, uScr, tipF - 0.1, tipR + 0.25, ...panes.flat(), ...BUS_SEAMS];
  const want: number[] = [tipF - 0.05, tipF - 0.15, tipR + 0.05, tipR + 0.15, tipR + 0.4];
  for (const ax of [axF, axR]) want.push(...archStations(arch, ax, 6));
  const us = stationList(must, want, 1.4);
  const hull = buildLoft({ us, half, creases: [], cls });

  const paint = new Acc().add(hull.paint);
  const trim = new Acc().add(hull.dark);
  const chrome = new Acc();
  const glass = new Acc().add(hull.glass);
  if (hull.inner.attributes.position) trim.add(hull.inner);

  // ---- window band: dark rubber frame lines at the belt and header, door leaf gaps and glazing bars
  const rib = (pairs: [number, number][], w = 0.02, off = 0.004): THREE.BufferGeometry =>
    ribbon(pairs.map(([i, s]) => hull.P(i, s)), pairs.map(([i, s]) => hull.N(i, s)), w, off);
  const seq = (a: number, b: number): number[] => { const o: number[] = []; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) o.push(i); return o; };
  {
    const iA = hull.at(5.5), iB = hull.at(tipR + 0.25);
    for (const slot of [4, 6]) {
      trim.add(rib(seq(iB, iA).map((i) => [i, slot] as [number, number]), 0.03, 0.006));
      trim.add(rib(seq(iB, iA).map((i) => [i, M_MIRROR(hull, slot)] as [number, number]), 0.03, 0.006));
    }
    // door leaves: a vertical split line down the middle of each door (right side only)
    for (const d of doorPanes) {
      const i = hull.at((d[0] + d[1]) / 2);
      trim.add(rib([[i, 4], [i, 5], [i, 6], [i, 7]], 0.016, 0.006));
      const iE = [hull.at(d[0]), hull.at(d[1])];
      for (const e of iE) trim.add(rib([[e, 4], [e, 5], [e, 6], [e, 7]], 0.02, 0.006));
    }
    // sliding window glazing bars (left side too): thin vertical posts at each pane's centre
    for (const p of panes) {
      const i = hull.at((p[0] + p[1]) / 2);
      if (Math.abs(p[0] - p[1]) < 0.9) continue;
      chrome.addBoth(rib([[i, 4], [i, 5]], 0.012, 0.012));
    }
  }
  // wheel liners
  const wx = 1.0;
  for (const ax of [axF, axR]) trim.addBoth(wheelLiner(arch, wx - 0.52 * ww - 0.03, wM0 - 0.01, -ax));

  // ---- roof gear: air-conditioning pod, two hatches, a destination sign over the screen
  trim.add(bx(1.7, 0.2, 2.6, 0, H + 0.08, 3.4)); // pod, rear third
  trim.add(bx(1.2, 0.05, 0.9, 0, H + 0.02, -1.0));
  trim.add(bx(1.2, 0.05, 0.9, 0, H + 0.02, 0.5));
  trim.add(bx(1.9, 0.26, 0.04, 0, H - 0.2, -(uScr - 0.02))); // destination sign (dark when off)
  chrome.add(bx(1.96, 0.02, 0.05, 0, H - 0.06, -(uScr - 0.02)));
  // ---- front: bumper, small intake, lamps, wiper; rear: bumper, engine door lines, rear window
  trim.add(bumperGeo(2 * wM0 * 0.96, 0.24, 0.3, 0.46, -(tipF - 0.28), false));
  trim.add(bumperGeo(2 * wM0 * 0.96, 0.24, 0.3, 0.46, tipF - 0.28, true));
  trim.add(bx(1.0, 0.3, 0.02, 0, 0.9, -(tipF - 0.004)));
  for (let k = 0; k < 3; k++) chrome.add(bx(0.96, 0.012, 0.014, 0, 0.8 + k * 0.1, -(tipF + 0.004)));
  chrome.add(cylZ(0.05, 0.014, 0, 1.25, -(tipF + 0.004), 8));
  trim.add(decalZ(1.5, 0.5, 0, 2.45, tipF + 0.003)); // rear window (dark)
  for (const y of [1.2, 1.5, 1.8]) trim.add(decalZ(1.3, 0.012, 0, y, tipF + 0.004)); // engine louvres
  trim.add(bx(2 * wM0 * 0.8, 0.5, 0.05, 0, 0.62, -(tipF - 0.02))); // front skirt panel
  const head = new Acc();
  const tail = new Acc();
  {
    const hp = lampPieces('box', true, v3(wM0 - 0.3, 0.85, -(tipF - 0.012)), -0.05);
    for (const g of hp.lens) head.addBoth(g);
    for (const g of hp.housing) trim.addBoth(g);
    const tp = lampPieces('tall', false, v3(wM0 - 0.1, 1.0, tipF - 0.012), 0, 2.0);
    for (const g of tp.lens) tail.addBoth(g);
    for (const g of tp.housing) trim.addBoth(g);
  }
  // mirrors: tall flat housings on arms at the screen corners (within the +0.02 m width allowance)
  for (const s of [-1, 1]) {
    trim.add(bx(0.07, 0.55, 0.16, s * (wM0 + 0.0), 2.2, -(tipF - 0.5)));
    trim.add(bx(0.12, 0.03, 0.03, s * (wM0 - 0.02), 2.45, -(tipF - 0.5)));
    trim.add(bx(0.12, 0.03, 0.03, s * (wM0 - 0.02), 1.95, -(tipF - 0.5)));
  }
  // ---- under body, axles, interior (seen through the glass): floor, rows of seats, poles, driver
  trim.add(bx(2 * (wM0 - 0.1), 0.06, L - 0.9, 0, sill + 0.05, 0));
  trim.add(cylX(0.09, 2 * wx, 0, R, -axF, 6));
  trim.add(cylX(0.11, 2 * wx, 0, R, -axR, 6));
  trim.add(bx(2 * (wM0 - 0.1), 0.05, L - 1.2, 0, 0.98, 0));
  for (let k = 0; k < 7; k++) {
    const u = 3.0 - k * 1.1 - (k > 1 ? 0.6 : 0);
    for (const s of [-1, 1]) {
      trim.add(bx(0.8, 0.14, 0.45, s * (wM0 - 0.5), 1.1, -u)); // seat cushion row (the bench along the wall)
      trim.add(bx(0.8, 0.5, 0.1, s * (wM0 - 0.5), 1.45, -(u + 0.2)));
    }
    chrome.add(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 5).translate(s0(k) * 0.55, 1.95, -(u + 0.3)));
  }
  trim.add(bx(0.6, 0.55, 0.5, 0.0 + 0.55, 1.35, -(tipF - 0.9))); // driver's seat
  trim.add(new THREE.TorusGeometry(0.22, 0.02, 4, 10).rotateX(-0.5).translate(0.55, 1.65, -(tipF - 0.45)));

  const parts: CarParts = {
    paint: paint.merge(),
    glass: glass.merge(),
    trim: mergeTrim(trim, chrome),
    lampHead: head.merge(),
    lampTail: tail.merge(),
    plate: platesGeo([v3(0, 0.46, -(tipF + 0.003)), v3(0, 0.46, tipF + 0.003)]),
    wheels: [],
    wheelR: R,
    wheelW: ww,
    dualRear: true,
    sections: 12,
    anchors: { roof: { y: H, u0: -1, u1: -1.5, hw: 1 }, rear: { z: tipF, y: 0.46, hw: 1 }, wsQuad: null, rgQuad: null, hoodFront: v3(0, 0, 0), exX: 0, sign: v3(0, H - 0.2, -(uScr - 0.02)) },
  };
  for (const s of [-1, 1]) {
    parts.wheels.push({ x: s * wx, z: -axF, front: true });
    parts.wheels.push({ x: s * wx, z: -axR, front: false });
  }
  return parts;
}
const s0 = (k: number): number => (k % 2 === 0 ? 1 : -1);
/** the left-hand twin of a right-hand half-ring slot */
const M_MIRROR = (hull: Hull, slot: number): number => hull.M - slot;
