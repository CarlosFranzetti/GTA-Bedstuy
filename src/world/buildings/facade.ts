/**
 * Shared building toolkit: a geometry batch that collects boxes/quads per material in a lot-local frame
 * (x along the front, y up, z toward the street; the facade is at z <= 0) with tiling UVs
 * (1 texture repeat per TILE metres), plus helpers for recessed windows, bracketed cornices, parapets,
 * roof clutter, fire escapes, tanks and drain pipes.
 *
 * Facade walls are built with `wallWithHoles`: windows/doors register a cut-out and the wall is emitted as
 * quads around them, so every opening is a real recess with reveal faces, a set-back glass pane and a dark
 * backing panel.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { IMaterialLibrary, Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';
import { lotLook, partyWallDetail, roofDetails } from './partyWall';
import { toneFor, ROOF_SCALE, type Colourway } from './colourway';
import { ENV14_ON } from '@/world/data/env14';

/** Parlour (or ground) storey height and the storeys above it (real Bed-Stuy rows: tall parlour, shorter upper floors). */
export const PARLOUR_H = 3.3;
export const UPPER_H = 2.9;
/** Legacy single storey height (S4's mixed-use code and the condo curtain wall still use it). */
export const FLOOR_H = PARLOUR_H;
/** Default raised-basement height (stoop rise) when a lot has no data. */
export const BASEMENT_H = 1.5;
/** Metres per repeat of the chain-link fence texture (2 in mesh, 256 px tile). */
export const CHAIN_TILE = 0.45;
/** castIronFence strip: one texture repeat spans 0.91 m along the fence and the full 0..1 v covers IRON_H of height */
export const IRON_TILE = 0.91;
export const IRON_H = 0.91;
/** corrugatedSteel tile edge (m) */
export const CORRUGATED_TILE = 1.2;
/** metres per texture repeat */
export const TILE = 3;

export type V3 = [number, number, number];

// ---------------------------------------------------------------------------------------------- lot spec (data-driven)

/** Masonry family of the street front: maps onto the existing MaterialKeys (no new textures). */
export type MaterialFamily = 'brownstone' | 'brick' | 'tanBrick' | 'paintedBrick' | 'limestone';
export type CorniceKind = 'none' | 'plain' | 'dentil' | 'bracket';
export type LotUse = 'residential' | 'apartment' | 'mixed' | 'church' | 'vacant' | 'institutional';

/**
 * Everything the facade generators need to know about one lot. Produced from the schema-v2 data by
 * `LotSubdivider.specFromData`; when a lot has no spec every builder falls back to its rng-driven defaults.
 * `floors` counts storeys above the raised basement, parlour included (a "3 storey" brownstone = parlour + 2).
 */
export interface LotSpec {
  floors: number;
  widthM: number;
  family: MaterialFamily;
  stoop: { present: boolean; heightM: number };
  cornice: CorniceKind;
  /** window bays across the front (default: 3 on lots >= 6 m, else 2) */
  bays?: number;
  use: LotUse;
  /** storefront archetype for mixed-use lots (consumed by mixeduse.ts) */
  storefront?: string;
  /** street trees in front of the lot (consumed by the furniture lane) */
  trees?: number;
  /** lot is under renovation scaffolding */
  scaffold?: boolean;
  /** arched parlour windows (brownstone rows) */
  arched?: boolean;
  /** file stem of a facade-photo atlas (facade-<lotId>) mapped once across the front; see facadeTexture.ts */
  facadeTexture?: string;
  /** wood-frame house (siding) or new-build condo (panel cladding / glazed brick): picks the wall kind in colourway.ts */
  look?: 'frame' | 'newBuild';
  /** NYC tax lot id; keys the observed-facade override (src/world/data/facadeObserved.ts) */
  bbl?: string;
}

/** Y levels of a building's storeys. floorY[0] is the parlour/ground floor, floorY[k] the k-th floor above it. */
export interface Storeys { bh: number; floorY: number[]; H: number; }

export function storeyLevels(bh: number, floors: number): Storeys {
  const n = Math.max(1, Math.round(floors));
  const floorY: number[] = [bh];
  for (let k = 1; k < n; k++) floorY.push(bh + PARLOUR_H + (k - 1) * UPPER_H);
  return { bh, floorY, H: bh + PARLOUR_H + (n - 1) * UPPER_H };
}

export interface BuildingMats {
  lib: IMaterialLibrary;
  brownstone: THREE.Material;
  brownstoneAlt: THREE.Material;
  brickRed: THREE.Material;
  brickAlt: THREE.Material;
  brickPainted: THREE.Material;
  limestone: THREE.Material;
  cornice: THREE.Material;
  stoop: THREE.Material;
  window: THREE.Material;
  /** window variants 0..3 (lit / blinds / curtains / dim): picked per window for variety at night */
  windows: THREE.Material[];
  glass: THREE.Material;
  rollGate: THREE.Material;
  roof: THREE.Material;
  /** tarRoof variants 0..2 (dark, light grey, brown-grey): one per lot */
  roofs?: THREE.Material[];
  /** brickRed variants 0..3 (red, brown, cream painted, blue-grey painted): party-wall colour per lot */
  partyBricks?: THREE.Material[];
  tank: THREE.Material;
  metal: THREE.Material;
  scaffold: THREE.Material;
  chain: THREE.Material;
  /** chain-link top rail strip (chainlinkRail, tiles 0.45 m) */
  chainRail: THREE.Material;
  /** cast-iron fence strips (alpha-tested, u per IRON_TILE, v 0..1 over IRON_H): spear areaway fence and stoop railing */
  ironAreaway: THREE.Material;
  ironStoop: THREE.Material;
  /** corrugated steel panels (vacant-lot hoarding, sheds), tiles 1.2 m */
  corrugated: THREE.Material;
  plainAwnings: THREE.Material[];
  darkAwning: THREE.Material;
  /** weeds on vacant lots (the plain dark-green awning fabric: no extra material, so no extra draw call) */
  leaves: THREE.Material;
}

export function loadMats(lib: IMaterialLibrary): BuildingMats {
  const windows = [0, 1, 2, 3].map((v) => lib.get('window', v));
  // the two plain awnings are recoloured per lot (colourway.ts); the weeds keep their own green fabric
  const plainAwnings = [lib.awning('#8a3b2e', ''), lib.awning('#27303a', '')];
  return {
    lib,
    brownstone: lib.get('brownstone', 0),
    brownstoneAlt: lib.get('brownstone', 1),
    brickRed: lib.get('brickRed', 0),
    brickAlt: lib.get('brickRed', 1),
    brickPainted: lib.get('brickPainted', 0),
    limestone: lib.get('limestone', 0),
    cornice: lib.get('cornice', 0),
    stoop: lib.get('stoop', 0),
    window: windows[0],
    windows,
    glass: lib.get('storefrontGlass', 0),
    rollGate: lib.get('rollGate', 0),
    roof: lib.get('tarRoof', 0),
    roofs: [0, 1, 2].map((v) => lib.get('tarRoof', v)),
    partyBricks: [0, 1, 2, 3].map((v) => lib.get('brickRed', v)),
    tank: lib.get('waterTank', 0),
    metal: lib.get('metalDark', 0),
    scaffold: lib.get('scaffold', 0),
    chain: lib.get('chainlinkFence', 0),
    chainRail: lib.get('chainlinkRail', 0),
    ironAreaway: lib.get('castIronFence', 0),
    ironStoop: lib.get('castIronFence', 1),
    corrugated: lib.get('corrugatedSteel', 0),
    plainAwnings,
    darkAwning: lib.awning('#27303a', ''),
    leaves: lib.awning('#2f6f4f', ''),
  };
}

/** Pick a window material variant: mostly lit, some blinds / curtains / dim. */
export function pickWindow(m: BuildingMats, rng: Rng): THREE.Material {
  const r = rng.next();
  return m.windows[r < 0.4 ? 0 : r < 0.62 ? 1 : r < 0.84 ? 2 : 3];
}

/** Axis-aligned rectangle in the lot-local frame (z0 < z1). */
export interface LocalRect { x0: number; x1: number; z0: number; z1: number; }

export interface LotOutput {
  /** footprint rectangles (each becomes one Polygon collider; keep them inside the lot) */
  body: LocalRect[];
  /** stoop / steps rectangles (one Polygon collider each) */
  stoops: LocalRect[];
  /** vacant lots: fence line in local space -> Segment collider */
  fence?: { x0: number; x1: number; z: number };
  /** areaway iron-fence runs in local space (gaps at the stoop foot and basement entry stay open) -> thin Segment colliders */
  fences?: { x0: number; x1: number; z: number }[];
}

export interface LotCtx {
  b: LotBatch;
  m: BuildingMats;
  rng: Rng;
  W: number;
  D: number;
  lot: Lot;
  /** which side wall (local x=0 'left' / x=W 'right') meets the cross street, for corner lots */
  cornerSide: 'left' | 'right' | null;
  /** data-driven description of the lot; undefined = procedural fallback */
  spec?: LotSpec;
}

/** Front and trim materials for a masonry family. */
export function familyMats(m: BuildingMats, family: MaterialFamily, variant = 0): { front: THREE.Material; trim: THREE.Material } {
  switch (family) {
    case 'brownstone': return { front: variant ? m.brownstoneAlt : m.brownstone, trim: m.limestone };
    case 'brick': return { front: m.brickRed, trim: m.limestone };
    case 'tanBrick': return { front: m.brickAlt, trim: m.limestone };
    case 'paintedBrick': return { front: m.brickPainted, trim: m.limestone };
    case 'limestone': return { front: m.limestone, trim: m.stoop };
  }
}

interface Raw { p: number[]; n: number[]; uv: number[]; }

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export interface RectOpt {
  /** UV repeats across u / v (default: edge length / TILE) */
  ru?: number;
  rv?: number;
  /** flip so the front face points toward this direction */
  hint?: V3;
  /** UV origin offset, so neighbouring quads of one wall continue the same texture */
  u0?: number;
  v0?: number;
  /** explicit UV rectangle [uMin, vMin, uMax, vMax] (overrides ru/rv/u0/v0) */
  uvRect?: [number, number, number, number];
}


// ---------------------------------------------------------------------------------------------- baked vertex AO

/** Lowest vertex-AO weight: keeps the darkest corner readable instead of black (also the test bound). */
export const AO_MIN = 0.55;
/** Strength of each AO term (fraction of the albedo removed at the darkest point of that term). */
export const AO_REVEAL = 0.42;
export const AO_HALO = 0.22;
export const AO_BASE = 0.3;
export const AO_OVERHANG = 0.3;
export const AO_UNDERSIDE = 0.24;

export interface AoOpening { lo: V3; hi: V3; ax: 0 | 2; sign: 1 | -1; plane: number; depth: number; }
export interface AoOverhang { x0: number; x1: number; y: number; z0: number; z1: number; }

const aoSmooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Downward-facing quads (cornice, sill and lintel undersides, stoop soffits) of one lot; walls just below them get darkened. */
function collectOverhangs(raw: Map<THREE.Material, Raw>): AoOverhang[] {
  const out: AoOverhang[] = [];
  for (const r of raw.values()) {
    const n = r.p.length / 9;
    for (let t = 0; t < n; t++) {
      const i = t * 9;
      if (r.n[i + 1] > -0.8) continue;
      const xs = [r.p[i], r.p[i + 3], r.p[i + 6]], zs = [r.p[i + 2], r.p[i + 5], r.p[i + 8]];
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      if (x1 - x0 < 0.25 || z1 - z0 < 0.08) continue;
      out.push({ x0, x1, z0, z1, y: r.p[i + 1] });
    }
  }
  return out;
}

/**
 * Per-vertex ambient-occlusion weight in [AO_MIN, 1] for a vertex at (x,y,z) with normal (nx,ny,nz) in the lot-local frame:
 * the inside of a window reveal darkens with depth, the wall plane right at an opening gets a soft halo, wall faces below a
 * cornice / sill / lintel darken, the underside of any overhang is dim, and walls darken toward the ground. Pure and
 * deterministic.
 */
export function vertexAo(x: number, y: number, z: number, nx: number, ny: number, nz: number, openings: readonly AoOpening[], overhangs: readonly AoOverhang[]): number {
  let ao = 1;
  const vertical = Math.abs(ny) < 0.35;
  if (vertical) ao *= 1 - AO_BASE * (1 - aoSmooth(0, 0.9, y));
  if (ny < -0.8) ao *= 1 - AO_UNDERSIDE;
  const p = [x, y, z];
  for (const o of openings) {
    const lat0 = o.ax === 0 ? 2 : 0; // the in-plane horizontal axis
    const t = o.sign * (o.plane - p[o.ax]); // depth into the cavity (>0 inside)
    if (t < -0.06 || t > o.depth + 0.06) continue;
    const dx = Math.max(o.lo[lat0] - p[lat0], 0, p[lat0] - o.hi[lat0]);
    const dy = Math.max(o.lo[1] - y, 0, y - o.hi[1]);
    const dist = Math.hypot(dx, dy);
    if (dist > 0.36) continue;
    if (dist < 0.02) ao *= 1 - AO_REVEAL * aoSmooth(0, o.depth, Math.max(0, t));
    if (t < 0.03 && (o.ax === 0 ? Math.abs(nx) : Math.abs(nz)) > 0.5) ao *= 1 - AO_HALO * (1 - dist / 0.36) ** 1.5;
  }
  if (vertical) {
    for (const h of overhangs) {
      const d = h.y - y;
      if (d < -0.01 || d > 0.9) continue;
      if (x < h.x0 - 0.1 || x > h.x1 + 0.1 || z < h.z0 - 0.1 || z > h.z1 + 0.1) continue;
      ao *= 1 - AO_OVERHANG * (1 - Math.max(0, d) / 0.9) ** 2;
    }
  }
  return ao < AO_MIN ? AO_MIN : ao > 1 ? 1 : ao;
}

function bakeVertexAo(p: number[], n: number[], openings: readonly AoOpening[], overhangs: readonly AoOverhang[]): Uint8Array {
  const count = p.length / 3;
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const v = Math.round(vertexAo(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], n[i * 3], n[i * 3 + 1], n[i * 3 + 2], openings, overhangs) * 255);
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

/** Building materials read the baked AO from the `color` attribute; geometry without one (shared materials) reads white. */
function enableVertexAo(m: THREE.Material): void {
  if (m.vertexColors) return;
  m.vertexColors = true;
  // aTone / aStyle (lotTone.ts): zero alpha = "no recolour" for geometry that does not carry them
  (m as THREE.Material & { defaultAttributeValues?: Record<string, number[]> }).defaultAttributeValues = { color: [1, 1, 1, 1], aTone: [0, 0, 0, 0], aStyle: [0, 0, 0, 0] };
  m.needsUpdate = true;
}

export class LotBatch {
  private raw = new Map<THREE.Material, Raw>();
  private out = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private cur = new THREE.Matrix4();
  private uvMaps = new Map<THREE.Material, (x: number, y: number) => [number, number]>();
  private nest = 0;
  private cw: { cw: Colourway; front: ReadonlySet<THREE.Material> | null; corner: boolean; limestoneFront: boolean } | null = null;
  /** wall openings of the lot being built (lot-local boxes), used by the baked vertex AO in `flush` */
  private openings: AoOpening[] = [];

  /** Registers a wall opening (called by `revealFaces`) so `flush` can darken its reveals and the wall around it. */
  addOpening(h: Hole, z: number, d: number): void {
    const a = this.tp([h.x0, h.y0, z - d]), c = this.tp([h.x1, archTop(h), z]);
    const o0 = this.tp([0, 0, 0]), o1 = this.tp([0, 0, 1]);
    const nx = o1[0] - o0[0], nz = o1[2] - o0[2];
    if (Math.abs(nx) < 0.5 && Math.abs(nz) < 0.5) return;
    const ax = Math.abs(nx) > Math.abs(nz) ? 0 : 2;
    const sign = (ax === 0 ? nx : nz) > 0 ? 1 : -1;
    const lo: V3 = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2])];
    const hi: V3 = [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])];
    const plane = sign > 0 ? hi[ax] : lo[ax];
    this.openings.push({ lo, hi, ax, sign, plane, depth: Math.max(0.05, d) });
  }

  /** Planar front-wall quads/triangles (constant z, outside any `with` frame) of `mat` take their UVs from `fn(x, y)` instead of tiling. */
  mapUV(mat: THREE.Material, fn: (x: number, y: number) => [number, number]): void { this.uvMaps.set(mat, fn); }
  clearUV(): void { this.uvMaps.clear(); }

  /** Colourway of the lot being built: `flush` bakes it into the `aTone` / `aStyle` attributes (and jitters wall UVs). `front` = the front-family materials (null = every wall material). */
  setColourway(cw: Colourway | null, front: ReadonlySet<THREE.Material> | null = null, corner = false, limestoneFront = false): void {
    this.cw = cw ? { cw, front, corner, limestoneFront } : null;
  }

  private buf(mat: THREE.Material): Raw {
    let r = this.raw.get(mat);
    if (!r) { r = { p: [], n: [], uv: [] }; this.raw.set(mat, r); }
    return r;
  }

  private tp(p: V3): V3 {
    _v.set(p[0], p[1], p[2]).applyMatrix4(this.cur);
    return [_v.x, _v.y, _v.z];
  }

  /** Run `fn` with all geometry transformed by `m` (e.g. to decorate a side wall). */
  with(m: THREE.Matrix4, fn: () => void): void {
    const prev = this.cur;
    this.cur = prev.clone().multiply(m);
    this.nest++;
    fn();
    this.nest--;
    this.cur = prev;
  }

  /**
   * Quad o, o+u, o+u+v, o+v. Front face is the side u x v points to (flipped to match `hint` if given).
   * UV repeats: ru across u, rv across v (default: edge length / TILE).
   */
  rect(mat: THREE.Material, o: V3, u: V3, v: V3, opt?: RectOpt): void {
    let [ox, oy, oz] = o;
    let [ux, uy, uz] = u;
    const [vx, vy, vz] = v;
    const ru = opt?.ru ?? Math.hypot(ux, uy, uz) / TILE;
    const rv = opt?.rv ?? Math.hypot(vx, vy, vz) / TILE;
    let flipped = false;
    if (opt?.hint) {
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * opt.hint[0] + ny * opt.hint[1] + nz * opt.hint[2] < 0) {
        ox += ux; oy += uy; oz += uz; ux = -ux; uy = -uy; uz = -uz;
        flipped = true;
      }
    }
    let [ua, va, ub, vb] = opt?.uvRect ?? [opt?.u0 ?? 0, opt?.v0 ?? 0, (opt?.u0 ?? 0) + ru, (opt?.v0 ?? 0) + rv];
    if (flipped) [ua, ub] = [ub, ua];
    const p0 = this.tp([ox, oy, oz]);
    const p1 = this.tp([ox + ux, oy + uy, oz + uz]);
    const p2 = this.tp([ox + ux + vx, oy + uy + vy, oz + uz + vz]);
    const p3 = this.tp([ox + vx, oy + vy, oz + vz]);
    _n.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).cross(_v.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2])).normalize();
    const r = this.buf(mat);
    const mapped = this.nest === 0 ? this.uvMaps.get(mat) : undefined;
    if (mapped && uz === 0 && vz === 0) {
      const q0 = mapped(ox, oy), q1 = mapped(ox + ux, oy + uy), q2 = mapped(ox + ux + vx, oy + uy + vy), q3 = mapped(ox + vx, oy + vy);
      const pushq = (p: V3, q: [number, number]) => { r.p.push(p[0], p[1], p[2]); r.n.push(_n.x, _n.y, _n.z); r.uv.push(q[0], q[1]); };
      pushq(p0, q0); pushq(p1, q1); pushq(p2, q2);
      pushq(p0, q0); pushq(p2, q2); pushq(p3, q3);
      return;
    }
    const push = (p: V3, uu: number, vv: number) => { r.p.push(p[0], p[1], p[2]); r.n.push(_n.x, _n.y, _n.z); r.uv.push(uu, vv); };
    push(p0, ua, va); push(p1, ub, va); push(p2, ub, vb);
    push(p0, ua, va); push(p2, ub, vb); push(p3, ua, vb);
  }

  /**
   * Triangle (front face by winding a,b,c). Default UVs are planar world-size / TILE so textures tile
   * consistently; pass `uv` (three [u,v] pairs) to map a specific texture region instead.
   */
  tri(mat: THREE.Material, a: V3, b: V3, c: V3, uv?: [[number, number], [number, number], [number, number]]): void {
    const pa = new THREE.Vector3(...this.tp(a)), pb = new THREE.Vector3(...this.tp(b)), pc = new THREE.Vector3(...this.tp(c));
    const e1 = pb.clone().sub(pa);
    const n = e1.clone().cross(pc.clone().sub(pa)).normalize();
    e1.normalize();
    const e2 = n.clone().cross(e1);
    const r = this.buf(mat);
    const mapped = this.nest === 0 && !uv ? this.uvMaps.get(mat) : undefined;
    const planar = mapped !== undefined && a[2] === b[2] && b[2] === c[2];
    [pa, pb, pc].forEach((p, i) => {
      const d = p.clone().sub(pa);
      r.p.push(p.x, p.y, p.z); r.n.push(n.x, n.y, n.z);
      if (uv) r.uv.push(uv[i][0], uv[i][1]);
      else if (planar) { const q = mapped!(([a, b, c] as V3[])[i][0], ([a, b, c] as V3[])[i][1]); r.uv.push(q[0], q[1]); }
      else r.uv.push(d.dot(e1) / TILE, d.dot(e2) / TILE);
    });
  }

  /** Convex polygon (counter-clockwise seen from the front), fanned from its first vertex. */
  poly(mat: THREE.Material, pts: V3[]): void {
    for (let i = 1; i < pts.length - 1; i++) this.tri(mat, pts[0], pts[i], pts[i + 1]);
  }

  /** Convex polygon whose front face points toward `hint` (winding is reversed if needed). */
  polyFacing(mat: THREE.Material, pts: V3[], hint: V3): void {
    const a = pts[0], b = pts[1], c = pts[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    this.poly(mat, nx * hint[0] + ny * hint[1] + nz * hint[2] < 0 ? pts.slice().reverse() : pts);
  }

  /**
   * Axis-aligned box. `faces` picks which faces to emit: r(+x) l(-x) u(+y) d(-y) f(+z, toward street) b(-z).
   * `unit` maps each face to the full 0..1 texture (signs, awnings); otherwise tiling UVs.
   */
  box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, faces = 'rlufb', unit = false): void {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    if (dx <= 0 || dy <= 0 || dz <= 0) return;
    const o = unit ? { ru: 1, rv: 1 } : undefined;
    if (faces.includes('f')) this.rect(mat, [x0, y0, z1], [dx, 0, 0], [0, dy, 0], o);
    if (faces.includes('b')) this.rect(mat, [x1, y0, z0], [-dx, 0, 0], [0, dy, 0], o);
    if (faces.includes('r')) this.rect(mat, [x1, y0, z1], [0, 0, -dz], [0, dy, 0], o);
    if (faces.includes('l')) this.rect(mat, [x0, y0, z0], [0, 0, dz], [0, dy, 0], o);
    if (faces.includes('u')) this.rect(mat, [x0, y1, z1], [dx, 0, 0], [0, 0, -dz], o);
    if (faces.includes('d')) this.rect(mat, [x0, y0, z0], [dx, 0, 0], [0, 0, dz], o);
  }

  /** Thin bar from a to b: a triangular prism (3 long faces, end caps omitted) of apparent thickness t. */
  bar(mat: THREE.Material, a: V3, b: V3, t = 0.05): void {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = d.length();
    if (L < 1e-6) return;
    d.divideScalar(L);
    const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const p1 = d.clone().cross(ref).normalize();
    const p2 = d.clone().cross(p1).normalize();
    const r = t * 0.62;
    const corner = (k: number): THREE.Vector3 => {
      const th = Math.PI / 2 + (k * 2 * Math.PI) / 3;
      return p1.clone().multiplyScalar(Math.cos(th) * r).addScaledVector(p2, Math.sin(th) * r);
    };
    const U: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    for (let k = 0; k < 3; k++) {
      const c0 = corner(k), c1 = corner((k + 1) % 3);
      const mid = c0.clone().add(c1);
      const v = c1.clone().sub(c0);
      this.rect(mat, [a[0] + c0.x, a[1] + c0.y, a[2] + c0.z], U, [v.x, v.y, v.z], { hint: [mid.x, mid.y, mid.z] });
    }
  }

  /** Vertical open prism with `seg` sides (drain pipes, columns). */
  cyl(mat: THREE.Material, cx: number, y0: number, y1: number, cz: number, r: number, seg = 5): void {
    for (let k = 0; k < seg; k++) {
      const a0 = (k * 2 * Math.PI) / seg, a1 = ((k + 1) * 2 * Math.PI) / seg;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      const am = (a0 + a1) / 2;
      this.rect(mat, [x0, y0, z0], [x1 - x0, 0, z1 - z0], [0, y1 - y0, 0], { hint: [Math.cos(am), 0, Math.sin(am)] });
    }
  }

  /** Add an existing three geometry (transformed by the current matrix). Only for untextured/untiled materials. */
  geom(mat: THREE.Material, g: THREE.BufferGeometry): void {
    const ng = g.index ? g.toNonIndexed() : g;
    const pos = ng.getAttribute('position'), nor = ng.getAttribute('normal'), uv = ng.getAttribute('uv');
    const r = this.buf(mat);
    const nm = new THREE.Matrix3().getNormalMatrix(this.cur);
    for (let i = 0; i < pos.count; i++) {
      _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(this.cur);
      r.p.push(_v.x, _v.y, _v.z);
      _n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(nm).normalize();
      r.n.push(_n.x, _n.y, _n.z);
      r.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (ng !== g) ng.dispose();
    g.dispose();
  }

  /** Close the current lot: bake the collected geometry into per-material BufferGeometries moved by `m`. */
  flush(m: THREE.Matrix4): void {
    const overhangs = collectOverhangs(this.raw);
    const info = this.lotInfo();
    for (const [mat, r] of this.raw) {
      if (!r.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('color', new THREE.BufferAttribute(bakeVertexAo(r.p, r.n, this.openings, overhangs), 4, true));
      g.setAttribute('position', new THREE.Float32BufferAttribute(r.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(r.n, 3));
      this.bakeTone(g, mat, r, info);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(r.uv, 2));
      g.applyMatrix4(m);
      let list = this.out.get(mat);
      if (!list) { list = []; this.out.set(mat, list); }
      list.push(g);
      r.p = []; r.n = []; r.uv = [];
    }
    this.openings = [];
  }

  /** `aTone` (target sRGB + paint amount) and `aStyle` (kind, mortar, seed, weather) for the shared wall materials; jitters wall UVs per lot. */
  /**
   * Stain placement for the wall shader (lotTone.ts): the roof-line height of the lot's masonry and the phase of its upper-storey
   * sill line (sill height mod the storey height, 0..22; 23 = no upper window found). Windows sit on the same line on every floor.
   */
  private lotInfo(): { roofH: number; q: number } {
    let roofH = 0;
    for (const [mat, r] of this.raw) {
      if (!/^(brickRed|brickPainted|brownstone|limestone):/.test(mat.name)) continue;
      for (let i = 1; i < r.p.length; i += 3) if (r.p[i] > roofH) roofH = r.p[i];
    }
    const sills = this.openings.map((o) => o.lo[1]).filter((y) => y > 2.4).sort((a, b) => a - b);
    const q = sills.length ? Math.max(0, Math.min(22, Math.round(((sills[sills.length >> 1] % UPPER_H) / UPPER_H) * 22))) : 23;
    return { roofH, q };
  }

  private bakeTone(g: THREE.BufferGeometry, mat: THREE.Material, r: Raw, info: { roofH: number; q: number }): void {
    const count = r.p.length / 3;
    const tone = new Uint8Array(count * 4), style = new Uint8Array(count * 4);
    const c = this.cw;
    if (c && mat.name) {
      const isFront = c.front === null || c.front.has(mat);
      const sideT = toneFor(mat.name, c.cw, false, c.limestoneFront);
      const frontT = isFront || mat.name.startsWith('limestone:') ? toneFor(mat.name, c.cw, true, c.limestoneFront) : sideT;
      if (sideT || frontT) {
        for (let i = 0; i < count; i++) {
          const t = (isFront || c.limestoneFront) && (r.n[i * 3 + 2] > 0.7 || c.corner) ? frontT : sideT;
          if (!t) continue;
          tone.set(t.tone, i * 4); style.set(t.style, i * 4);
          style[i * 4] = Math.min(255, style[i * 4] + info.q);
        }
        if (/^(brickRed|brickPainted|brownstone|limestone):/.test(mat.name)) {
          const col = g.getAttribute('color') as THREE.BufferAttribute;
          const a = Math.max(0, Math.min(255, Math.round((info.roofH / ROOF_SCALE) * 255)));
          for (let i = 0; i < count; i++) col.array[i * 4 + 3] = a;
        }
        if (/^(brickRed|brickPainted|brownstone|limestone|stoop):/.test(mat.name)) {
          const { scale, ou, ov, flip } = c.cw.uv;
          for (let i = 0; i < count; i++) {
            const u = r.uv[i * 2], v = r.uv[i * 2 + 1];
            r.uv[i * 2] = (flip ? -u : u) * scale + ou;
            r.uv[i * 2 + 1] = v * scale + ov;
          }
        }
      }
    }
    if (mat.name.startsWith('window:') || mat.name.startsWith('storefrontGlass:')) this.bakeWindowSeeds(r, count, style);
    g.setAttribute('aTone', new THREE.BufferAttribute(tone, 4, true));
    g.setAttribute('aStyle', new THREE.BufferAttribute(style, 4, true));
  }

  /**
   * Per-window seed for the window glass shader (windowShader.ts): `aStyle.xyz` = a hash of the window's lowest corner and the lot
   * seed, the same on all of one window's vertices. A glass pane is a quad (6 vertices, 4 distinct points); arch fans (3-vertex
   * triangles) take the seed of the quad before them.
   */
  private bakeWindowSeeds(r: Raw, count: number, style: Uint8Array): void {
    const lotSeed = this.cw ? Math.floor(this.cw.cw.seed * 65535) : 0;
    const hashAt = (x: number, y: number, z: number): [number, number, number] => {
      let h = Math.imul(Math.round(x * 50) + 7919, 2654435761) ^ Math.imul(Math.round(y * 50) + 104729, 40503) ^ Math.imul(Math.round(z * 50) + 1299709, 2246822519) ^ Math.imul(lotSeed + 17, 668265263);
      h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
      return [h & 255, (h >>> 8) & 255, Math.max(1, (h >>> 16) & 255)];
    };
    let last: [number, number, number] = [1, 1, 1];
    let i = 0;
    while (i < count) {
      let n = 3;
      if (i + 6 <= count) {
        const uniq = new Set<string>();
        for (let k = i; k < i + 6; k++) uniq.add(`${r.p[k * 3].toFixed(3)},${r.p[k * 3 + 1].toFixed(3)},${r.p[k * 3 + 2].toFixed(3)}`);
        if (uniq.size === 4) {
          n = 6;
          let mx = Infinity, my = Infinity, mz = Infinity;
          for (let k = i; k < i + 6; k++) { mx = Math.min(mx, r.p[k * 3]); my = Math.min(my, r.p[k * 3 + 1]); mz = Math.min(mz, r.p[k * 3 + 2]); }
          last = hashAt(mx, my, mz);
        }
      }
      for (let k = i; k < Math.min(count, i + n); k++) { style[k * 4] = last[0]; style[k * 4 + 1] = last[1]; style[k * 4 + 2] = last[2]; }
      i += n;
    }
  }

  /** One merged geometry per material. */
  merged(): { material: THREE.Material; geometry: THREE.BufferGeometry }[] {
    const res: { material: THREE.Material; geometry: THREE.BufferGeometry }[] = [];
    for (const [material, list] of this.out) {
      enableVertexAo(material);
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geometry) continue;
      if (list.length > 1) for (const g of list) g.dispose();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      res.push({ material, geometry });
    }
    this.out.clear();
    return res;
  }
}

/** Matrix mapping a side wall's local frame (x along the wall, z out of the wall) into lot-local space. */
export function sideWallFrame(side: 'left' | 'right', W: number, D: number): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (side === 'right') {
    m.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    m.setPosition(W, 0, 0);
  } else {
    m.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
    m.setPosition(0, 0, -D);
  }
  return m;
}

/** Matrix mapping the rear wall's local frame (x along the wall, z out of the wall = toward -z) into lot-local space. */
export function rearWallFrame(W: number, D: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(Math.PI);
  m.setPosition(W, 0, -D);
  return m;
}

/** Evenly spaced bay centres across a width. */
export function bayCentres(width: number, bays: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < bays; i++) xs.push(((i + 0.5) * width) / bays);
  return xs;
}

// ---------------------------------------------------------------------------------------------- openings

/** A rectangular cut-out in a wall. With `arch`, a semicircle of radius (x1-x0)/2 sits on top of y1. */
export interface Hole { x0: number; x1: number; y0: number; y1: number; arch?: boolean; }

const ARCH_SEG = 6;

function archTop(h: Hole): number { return h.arch ? h.y1 + (h.x1 - h.x0) / 2 : h.y1; }

/** Points along the arch from the left springing (angle PI) over the crown to the right springing (0). */
function archPoints(h: Hole, z: number, seg = ARCH_SEG): V3[] {
  const r = (h.x1 - h.x0) / 2, cx = (h.x0 + h.x1) / 2;
  const pts: V3[] = [];
  for (let k = 0; k <= seg; k++) {
    const th = Math.PI - (k * Math.PI) / seg;
    pts.push([cx + Math.cos(th) * r, h.y1 + Math.sin(th) * r, z]);
  }
  return pts;
}

/**
 * Emit a wall plane (facing +z at depth `z`) from (x0,y0) to (x1,y1) as quads around the holes. UVs continue
 * across pieces (origin at wall x=0,y=0) so brick courses line up. Holes must not overlap each other.
 */
export function wallWithHoles(b: LotBatch, mat: THREE.Material, x0: number, y0: number, x1: number, y1: number, z: number, holes: Hole[]): void {
  const eps = 1e-4;
  const hs = holes.filter((h) => h.x1 > x0 && h.x0 < x1 && archTop(h) > y0 && h.y0 < y1);
  const ys = [y0, y1];
  for (const h of hs) { ys.push(Math.min(y1, Math.max(y0, h.y0)), Math.min(y1, Math.max(y0, archTop(h)))); }
  ys.sort((a, c) => a - c);
  const bands: number[] = [];
  for (const y of ys) if (!bands.length || y - bands[bands.length - 1] > eps) bands.push(y);
  for (let i = 0; i + 1 < bands.length; i++) {
    const ya = bands[i], yb = bands[i + 1];
    const row = hs.filter((h) => h.y0 <= ya + eps && archTop(h) >= yb - eps).sort((p, q) => p.x0 - q.x0);
    let x = x0;
    const piece = (xa: number, xb: number) => {
      if (xb - xa > eps) b.rect(mat, [xa, ya, z], [xb - xa, 0, 0], [0, yb - ya, 0], { u0: xa / TILE, v0: ya / TILE });
    };
    for (const h of row) { piece(x, Math.max(x, h.x0)); x = Math.max(x, h.x1); }
    piece(x, x1);
  }
  // arch spandrels: the two corner pieces between the rectangular cut-out and the semicircle
  for (const h of hs) {
    if (!h.arch) continue;
    const pts = archPoints(h, z);
    const top = archTop(h);
    const half = ARCH_SEG / 2;
    for (let k = 0; k < half; k++) b.tri(mat, [h.x0, top, z], pts[k], pts[k + 1]);
    for (let k = half; k < ARCH_SEG; k++) b.tri(mat, [h.x1, top, z], pts[k], pts[k + 1]);
  }
}

/** Inner faces of an opening cut in a wall at plane `z`, running `d` metres back. */
export function revealFaces(b: LotBatch, mat: THREE.Material, h: Hole, z: number, d: number, bottom = true): void {
  b.addOpening(h, z, d);
  const w = h.x1 - h.x0, ht = h.y1 - h.y0;
  b.rect(mat, [h.x0, h.y0, z - d], [0, 0, d], [0, ht, 0], { hint: [1, 0, 0] });
  b.rect(mat, [h.x1, h.y0, z - d], [0, 0, d], [0, ht, 0], { hint: [-1, 0, 0] });
  if (bottom) b.rect(mat, [h.x0, h.y0, z - d], [w, 0, 0], [0, 0, d], { hint: [0, 1, 0] });
  if (h.arch) {
    const pts = archPoints(h, z);
    const cx = (h.x0 + h.x1) / 2;
    for (let k = 0; k < ARCH_SEG; k++) {
      const p = pts[k], q = pts[k + 1];
      b.rect(mat, [p[0], p[1], z - d], [q[0] - p[0], q[1] - p[1], 0], [0, 0, d], { hint: [cx - p[0], h.y1 - p[1], 0] });
    }
  } else {
    b.rect(mat, [h.x0, h.y1, z - d], [w, 0, 0], [0, 0, d], { hint: [0, -1, 0] });
  }
}

/** Window pane (and half-disc for arches) at plane gz. */
function glassPane(b: LotBatch, mat: THREE.Material, h: Hole, gz: number): void {
  b.rect(mat, [h.x0, h.y0, gz], [h.x1 - h.x0, 0, 0], [0, h.y1 - h.y0, 0], { ru: 1, rv: 1, uvRect: [0.05, 0.05, 0.95, 0.92] });
  if (h.arch) {
    const pts = archPoints(h, gz);
    const cx = (h.x0 + h.x1) / 2;
    const uv = (p: V3): [number, number] => [0.5 + ((p[0] - cx) / (h.x1 - h.x0)) * 0.9, 0.55 + ((p[1] - h.y1) / (h.x1 - h.x0)) * 0.7];
    for (let k = 0; k < ARCH_SEG; k++) {
      const a = pts[k + 1], c = pts[k];
      b.tri(mat, [cx, h.y1, gz], a, c, [[0.5, 0.55], uv(a), uv(c)]);
    }
  }
}

export interface WindowRow {
  xs: number[];
  /** window bottom y */
  y: number;
  w: number;
  h: number;
  /** facade plane z */
  z: number;
  /** collects wall cut-outs; the caller then builds the wall with `wallWithHoles`. Omit for a flat pane. */
  holes?: Hole[];
  /** material of the reveal faces (the facade material); required with `holes` */
  wall?: THREE.Material;
  /** reveal depth (default 0.18) */
  depth?: number;
  /** stone sill, 0.1 proud */
  sill?: boolean;
  /** 'flat' = slab 0.08 proud, 'hood' = stepped hood 0.2 proud */
  lintel?: boolean | 'flat' | 'hood';
  /** pale frame boxes around the glass */
  frame?: boolean;
  /** semicircular head (church) */
  arch?: boolean;
  /** trim material for sills/lintels/frames (default limestone) */
  trim?: THREE.Material;
  /** random source for the window-variant pick (otherwise variant 0) */
  rng?: Rng;
  /** also skip the reveal's bottom ledge (high windows nobody looks down into) */
  noLedge?: boolean;
}

/** Deterministic yes/no from a window's lot-local position (a hash, so the Rng streams are untouched). */
export function windowHasAc(x: number, y: number, z: number, brick: boolean): boolean {
  let h = Math.imul(Math.round(x * 100) + 7919, 2654435761) ^ Math.imul(Math.round(y * 100) + 104729, 40503) ^ Math.imul(Math.round(z * 100) + 1299709, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000 < (brick ? 0.3 : 0.17);
}

export function windows(b: LotBatch, m: BuildingMats, o: WindowRow): void {
  const trim = o.trim ?? m.limestone;
  const recess = !!o.holes && !!o.wall;
  const d = o.depth ?? 0.18;
  for (const x of o.xs) {
    const glassMat = o.rng ? pickWindow(m, o.rng) : m.window;
    const hole: Hole = { x0: x - o.w / 2, x1: x + o.w / 2, y0: o.y, y1: o.y + o.h };
    if (o.arch) hole.arch = true;
    const gz = recess ? o.z - 0.15 : o.z + 0.02;
    if (recess) {
      o.holes!.push(hole);
      revealFaces(b, o.wall!, hole, o.z, d, !o.noLedge);
      // dark backing so the open shell never shows the sky through the glass
      b.rect(m.metal, [hole.x0, hole.y0, o.z - d], [o.w, 0, 0], [0, o.h, 0], { ru: 1, rv: 1 });
      if (o.arch) {
        const pts = archPoints(hole, o.z - d);
        const cx = x;
        for (let k = 0; k < ARCH_SEG; k++) b.tri(m.metal, [cx, hole.y1, o.z - d], pts[k + 1], pts[k]);
      }
    }
    glassPane(b, glassMat, hole, gz);
    if (!o.arch && o.y >= 2 && o.w >= 0.8 && o.w <= 1.6 && windowHasAc(x, o.y, o.z, o.wall === m.brickRed || o.wall === m.brickAlt || o.wall === m.brickPainted)) {
      // window air conditioner (about one window in five, one in three on brick): chosen by a position hash, so no rng stream shifts
      b.box(m.limestone, x - 0.36, hole.y0 + 0.02, o.z - 0.12, x + 0.36, hole.y0 + 0.5, o.z + 0.4, 'frlu');
      b.box(m.metal, x - 0.3, hole.y0 + 0.1, o.z + 0.4, x + 0.3, hole.y0 + 0.42, o.z + 0.42, 'f');
    }
    if (o.frame) {
      // pale frame standing proud of the glass: side jambs, head and meeting rail (flat strips)
      const fz = gz + 0.05, ft = 0.06;
      b.rect(trim, [hole.x0, hole.y0, fz], [ft, 0, 0], [0, hole.y1 - hole.y0, 0], { ru: 0.1, rv: 0.4 });
      b.rect(trim, [hole.x1 - ft, hole.y0, fz], [ft, 0, 0], [0, hole.y1 - hole.y0, 0], { ru: 0.1, rv: 0.4 });
      if (!o.arch) b.rect(trim, [hole.x0 + ft, hole.y1 - ft, fz], [o.w - 2 * ft, 0, 0], [0, ft, 0], { ru: 0.4, rv: 0.1 });
      b.rect(trim, [hole.x0 + ft, hole.y0 + o.h * 0.5 - 0.03, fz], [o.w - 2 * ft, 0, 0], [0, 0.06, 0], { ru: 0.4, rv: 0.1 });
    }
    if (o.sill) b.box(trim, hole.x0 - 0.1, hole.y0 - 0.1, o.z, hole.x1 + 0.1, hole.y0, o.z + 0.1, o.y < 6 ? 'fud' : 'fu');
    if (o.lintel && !o.arch) {
      if (o.lintel === 'hood') {
        b.box(trim, hole.x0 - 0.12, hole.y1, o.z, hole.x1 + 0.12, hole.y1 + 0.16, o.z + 0.16, 'frld');
        b.box(trim, hole.x0 - 0.2, hole.y1 + 0.16, o.z, hole.x1 + 0.2, hole.y1 + 0.26, o.z + 0.24, 'frlud');
      } else {
        b.box(trim, hole.x0 - 0.08, hole.y1, o.z, hole.x1 + 0.08, hole.y1 + 0.16, o.z + 0.08, 'fd');
      }
    } else if (o.arch && o.sill !== false) {
      // stone hood-mould following the arch: a few chunky facets on the face of the wall
      const pts = archPoints(hole, o.z);
      for (let k = 0; k < ARCH_SEG; k++) {
        const p = pts[k], q = pts[k + 1];
        const cx = x;
        const push = (a: V3): V3 => {
          const dx = a[0] - cx, dy = a[1] - hole.y1, L = Math.hypot(dx, dy) || 1;
          return [a[0] + (dx / L) * 0.12, a[1] + (dy / L) * 0.12, a[2] + 0.06];
        };
        const pp = push(p), qq = push(q);
        b.poly(trim, [[p[0], p[1], o.z + 0.06], [q[0], q[1], o.z + 0.06], qq, pp]);
      }
    }
  }
}

/** Straight run of cast-iron fence (castIronFence quad) along x at depth z, standing on y0; double-sided material. */
export function ironFenceRun(b: LotBatch, mat: THREE.Material, x0: number, x1: number, z: number, y0 = 0): void {
  if (x1 - x0 < 0.05) return;
  b.rect(mat, [x0, y0, z], [x1 - x0, 0, 0], [0, IRON_H, 0], { ru: (x1 - x0) / IRON_TILE, rv: 1 });
}

/** Slim wrought-iron bars across a basement window (3 pickets + top/bottom rail), in front of the opening. */
export function windowBars(b: LotBatch, m: BuildingMats, x: number, y: number, w: number, h: number, z: number): void {
  b.bar(m.metal, [x - w / 2 - 0.03, y + h + 0.03, z + 0.06], [x + w / 2 + 0.03, y + h + 0.03, z + 0.06], 0.04);
  for (const f of [-0.3, 0, 0.3]) b.bar(m.metal, [x + f * w, y - 0.02, z + 0.06], [x + f * w, y + h + 0.03, z + 0.06], 0.03);
}

/** Dark fabric awning over a window (sloped top, valance, side triangles). */
export function windowAwning(b: LotBatch, mat: THREE.Material, x: number, yTop: number, w: number, z: number): void {
  const x0 = x - w / 2 - 0.08, x1 = x + w / 2 + 0.08, ww = x1 - x0;
  const drop = 0.4, out = 0.7, val = 0.2;
  b.rect(mat, [x0, yTop, z], [ww, 0, 0], [0, -drop, out], { uvRect: [0, 0.3, 1, 1], hint: [0, 1, 0.4] });
  b.rect(mat, [x0, yTop - drop, z + out], [ww, 0, 0], [0, -val, 0], { uvRect: [0, 0.02, 1, 0.26], hint: [0, 0, 1] });
  b.tri(mat, [x0, yTop, z], [x0, yTop - drop, z + out], [x0, yTop, z + out], [[0.1, 0.5], [0.2, 0.6], [0.1, 0.6]]);
  b.tri(mat, [x1, yTop, z], [x1, yTop, z + out], [x1, yTop - drop, z + out], [[0.1, 0.5], [0.1, 0.6], [0.2, 0.6]]);
}

// ---------------------------------------------------------------------------------------------- cornice & roof

/**
 * Projecting cornice (dark material): main slab, frieze band, and either a dentil row or big brackets underneath.
 */
export function cornice(b: LotBatch, m: BuildingMats, x0: number, x1: number, y: number, z: number, proud = 0.6, style: 'dentil' | 'bracket' | 'both' | 'plain' = 'dentil'): void {
  const w = x1 - x0;
  b.box(m.cornice, x0 - 0.06, y - 0.05, z, x1 + 0.06, y + 0.18, z + proud, 'frlud');
  b.box(m.cornice, x0 - 0.02, y - 0.5, z, x1 + 0.02, y - 0.05, z + proud * 0.28, 'frl');
  if (style === 'plain') return;
  if (style === 'dentil') {
    const n = Math.max(3, Math.floor(w / 0.36));
    const step = w / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * step;
      b.box(m.cornice, cx - 0.07, y - 0.22, z + proud * 0.28, cx + 0.07, y - 0.05, z + proud * 0.85, 'fd');
    }
  } else {
    const n = Math.max(2, Math.round(w / 1.3));
    for (let i = 0; i <= n; i++) {
      const cx = x0 + 0.12 + ((w - 0.24) * i) / n;
      // scroll bracket: front block + a slanted underside
      b.box(m.cornice, cx - 0.09, y - 0.5, z + proud * 0.28, cx + 0.09, y - 0.05, z + proud * 0.9, 'fl');
    }
    if (style === 'both') {
      // small dentils in the gaps between the brackets (Italianate bracketed cornice)
      const nd = Math.max(2, Math.floor(w / 0.3));
      const sd = w / nd;
      for (let i = 0; i < nd; i++) {
        const cx = x0 + (i + 0.5) * sd;
        const nearBracket = Array.from({ length: n + 1 }, (_, j) => x0 + 0.12 + ((w - 0.24) * j) / n).some((bx) => Math.abs(bx - cx) < 0.16);
        if (nearBracket) continue;
        b.box(m.cornice, cx - 0.05, y - 0.2, z + proud * 0.28, cx + 0.05, y - 0.05, z + proud * 0.7, 'f');
      }
    }
  }
}

/** Cornice from a data kind: 'bracket' = brackets with dentils between them, 'none' leaves a bare parapet. */
export function corniceOfKind(b: LotBatch, m: BuildingMats, x0: number, x1: number, y: number, z: number, kind: CorniceKind, proud = 0.6): void {
  if (kind === 'none') return;
  cornice(b, m, x0, x1, y, z, proud, kind === 'bracket' ? 'both' : kind);
}

/** Number of window bays: data value, else 3 on lots >= 6 m and 2 below; never tighter than 1.7 m. */
export function bayCount(W: number, spec?: LotSpec): number {
  const want = spec?.bays ?? (W >= 6 ? 3 : 2);
  return Math.max(1, Math.min(Math.floor(W / 1.7), Math.round(want)));
}

export interface RoofSpec {
  x0: number; x1: number;
  /** back (more negative) and front z of the roof plate */
  zBack: number; zFront: number;
  y: number;
  /** parapet height (0 = none) */
  ph?: number;
  frontMat: THREE.Material;
  sideMat: THREE.Material;
  /** capped with a coping slab */
  coping?: THREE.Material;
  /** also emit the outward face of the left / right parapet (exposed corner side walls) */
  exposeL?: boolean;
  exposeR?: boolean;
  /** tar roof material of this lot (default m.roof) */
  roof?: THREE.Material;
}

/** Flat tar roof plus a brick parapet ring with a stone coping on the street side. */
export function roofWithParapet(b: LotBatch, m: BuildingMats, r: RoofSpec): void {
  const { x0, x1, zBack, zFront, y } = r;
  const ph = r.ph ?? 0.7, t = 0.25;
  b.rect(r.roof ?? m.roof, [x0, y + 0.01, zFront], [x1 - x0, 0, 0], [0, 0, -(zFront - zBack)]);
  if (ph <= 0) return;
  const cap = r.coping ?? m.limestone;
  b.box(r.frontMat, x0, y, zFront - t, x1, y + ph, zFront, 'fb');
  b.box(cap, x0 - 0.04, y + ph, zFront - t - 0.04, x1 + 0.04, y + ph + 0.09, zFront + 0.05, 'frlu');
  b.box(r.sideMat, x0, y, zBack, x1, y + ph, zBack + t, 'fub');
  b.box(r.sideMat, x0, y, zBack + t, x0 + t, y + ph, zFront - t, r.exposeL ? 'rul' : 'ru');
  b.box(r.sideMat, x1 - t, y, zBack + t, x1, y + ph, zFront - t, r.exposeR ? 'lur' : 'lu');
  // stone cap on the side and back parapets too (the front one is capped above)
  b.box(cap, x0 - 0.04, y + ph, zBack - 0.04, x1 + 0.04, y + ph + 0.07, zBack + t + 0.04, 'u');
  b.box(cap, x0 - 0.04, y + ph, zBack + t + 0.04, x0 + t + 0.04, y + ph + 0.07, zFront - t - 0.04, 'u');
  b.box(cap, x1 - t - 0.04, y + ph, zBack + t + 0.04, x1 + 0.04, y + ph + 0.07, zFront - t - 0.04, 'u');
}

/** Rooftop water tank on legs (cylinder + cone lid). */
export function waterTank(b: LotBatch, m: BuildingMats, cx: number, y: number, cz: number): void {
  const r = 0.95, legH = 0.9, h = 1.7;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    b.bar(m.metal, [cx + sx * 0.7, y, cz + sz * 0.7], [cx + sx * 0.7, y + legH, cz + sz * 0.7], 0.1);
  }
  b.box(m.metal, cx - 0.9, y + legH - 0.08, cz - 0.9, cx + 0.9, y + legH, cz + 0.9, 'ufrlb');
  const cyl = new THREE.CylinderGeometry(r, r, h, 10, 1, true);
  cyl.translate(cx, y + legH + h / 2, cz);
  b.geom(m.tank, cyl);
  const lid = new THREE.ConeGeometry(r + 0.08, 0.55, 10);
  lid.translate(cx, y + legH + h + 0.27, cz);
  b.geom(m.tank, lid);
}

/** Satellite dish: a six-sided bowl on a pole, facing roughly south-sky (toward the street, up). */
export function satelliteDish(b: LotBatch, m: BuildingMats, x: number, y: number, z: number, scale = 1): void {
  b.bar(m.metal, [x, y, z], [x, y + 0.75 * scale, z], 0.06);
  const c = new THREE.Vector3(x, y + 0.9 * scale, z);
  const axis = new THREE.Vector3(0.15, 0.55, 0.82).normalize();
  const e1 = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
  const e2 = axis.clone().cross(e1).normalize();
  const rim = (k: number): V3 => {
    const a = (k * 2 * Math.PI) / 6;
    const p = c.clone().addScaledVector(e1, Math.cos(a) * 0.36 * scale).addScaledVector(e2, Math.sin(a) * 0.36 * scale).addScaledVector(axis, 0.08 * scale);
    return [p.x, p.y, p.z];
  };
  const ctr = c.clone().addScaledVector(axis, -0.03 * scale);
  for (let k = 0; k < 6; k++) b.tri(m.cornice, [ctr.x, ctr.y, ctr.z], rim(k), rim(k + 1));
  const tip = c.clone().addScaledVector(axis, 0.4 * scale);
  b.bar(m.metal, [c.x, c.y, c.z], [tip.x, tip.y, tip.z], 0.03);
}

export interface RoofClutter {
  x0: number; x1: number; zBack: number; zFront: number; y: number;
  brick: THREE.Material;
  /** probabilities (0..1) */
  chimney?: number; skylight?: number; bulkhead?: number; dishes?: number;
  /** parapet height (so dishes sit on it) */
  ph?: number;
}

/** Chimney, skylight, access bulkhead and a couple of dishes on the roof plate. */
export function roofClutter(b: LotBatch, m: BuildingMats, rng: Rng, o: RoofClutter): void {
  const w = o.x1 - o.x0, y = o.y;
  if (rng.chance(o.chimney ?? 0.4)) {
    const cx = o.x0 + w * rng.range(0.2, 0.8), cz = o.zBack + rng.range(0.9, 2.4);
    b.box(o.brick, cx - 0.3, y, cz - 0.3, cx + 0.3, y + 1.5, cz + 0.3, 'frlb');
    b.box(m.limestone, cx - 0.38, y + 1.5, cz - 0.38, cx + 0.38, y + 1.62, cz + 0.38, 'frlub');
  }
  if (rng.chance(o.skylight ?? 0.3)) {
    const cx = o.x0 + w * rng.range(0.3, 0.7), cz = o.zBack + rng.range(3, 5);
    b.box(m.metal, cx - 0.7, y, cz - 0.5, cx + 0.7, y + 0.35, cz + 0.5, 'frlb');
    b.rect(m.window, [cx - 0.7, y + 0.35, cz + 0.5], [1.4, 0, 0], [0, 0.35, -1.0], { ru: 1, rv: 1, uvRect: [0.1, 0.55, 0.9, 0.9] });
  }
  if (rng.chance(o.bulkhead ?? 0.3)) {
    const cx = o.x0 + w * rng.range(0.25, 0.75), zf = o.zBack + rng.range(3.6, 5.2);
    b.box(o.brick, cx - 0.9, y, zf - 1.8, cx + 0.9, y + 2.3, zf, 'frlub');
    b.rect(m.metal, [cx - 0.4, y, zf + 0.01], [0.8, 0, 0], [0, 1.9, 0], { ru: 0.3, rv: 0.6 });
    b.box(m.limestone, cx - 1.0, y + 2.3, zf - 1.9, cx + 1.0, y + 2.4, zf + 0.1, 'fu');
  }
  if (rng.chance(o.dishes ?? 0.3)) {
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) satelliteDish(b, m, o.x0 + w * rng.range(0.1, 0.9), y + (o.ph ?? 0.7), o.zFront - 0.4 - rng.range(0, 0.3), rng.range(0.8, 1.2));
  }
}

/** Vertical drain pipe (five-sided tube) with two bracket collars. */
export function drainPipe(b: LotBatch, m: BuildingMats, x: number, y0: number, y1: number, z: number): void {
  b.cyl(m.metal, x, y0, y1, z + 0.05, 0.045, 5);
}

/** Iron fire escape: platforms with rails at each floor, diagonal stairs between, drop ladder. */
export function fireEscape(b: LotBatch, m: BuildingMats, xa: number, xb: number, z: number, platformYs: number[]): void {
  const depth = 1.0;
  platformYs.forEach((y, i) => {
    b.box(m.metal, xa, y - 0.06, z, xb, y, z + depth, 'ufd');
    b.bar(m.metal, [xa, y + 1.0, z + depth], [xb, y + 1.0, z + depth], 0.045);
    b.bar(m.metal, [xa, y + 0.5, z + depth], [xb, y + 0.5, z + depth], 0.04);
    b.bar(m.metal, [xa, y + 1.0, z], [xa, y + 1.0, z + depth], 0.045);
    b.bar(m.metal, [xb, y + 1.0, z], [xb, y + 1.0, z + depth], 0.045);
    if (i > 0) {
      const lower = platformYs[i - 1];
      b.bar(m.metal, [xb - 0.45, lower, z + depth - 0.1], [xb - 0.45, y, z + 0.3], 0.05);
      b.bar(m.metal, [xb - 0.1, lower + 0.9, z + depth - 0.1], [xb - 0.1, y + 0.9, z + 0.3], 0.04);
    }
  });
  const first = platformYs[0];
  if (first !== undefined) b.bar(m.metal, [xa + 0.4, 2.4, z + depth + 0.15], [xa + 0.4, first, z + depth - 0.05], 0.05);
}

/** A handful of window air-conditioners stuck on random upper-floor windows. */
export function acUnits(b: LotBatch, m: BuildingMats, rng: Rng, spots: { x: number; y: number }[], z: number): void {
  if (!spots.length) return;
  const n = Math.min(spots.length, rng.int(2, 4));
  const pool = spots.slice();
  for (let i = 0; i < n; i++) {
    const s = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    b.box(m.limestone, s.x - 0.38, s.y + 0.05, z - 0.1, s.x + 0.38, s.y + 0.55, z + 0.5, 'frlu');
    b.box(m.metal, s.x - 0.3, s.y + 0.12, z + 0.5, s.x + 0.3, s.y + 0.48, z + 0.52, 'f');
  }
}

/** A small louvred vent box on a wall (rear / side walls). */
export function airVent(b: LotBatch, m: BuildingMats, x: number, y: number, z: number): void {
  b.box(m.metal, x - 0.25, y, z, x + 0.25, y + 0.3, z + 0.12, 'fu');
}

// ---------------------------------------------------------------------------------------------- upper floors (shared)

export interface UpperFloorsOpts {
  /** top of the ground floor / shop slab, lot-local y: the first upper floor stands on it */
  y0: number;
  /** storeys above y0 (the shop is not counted), 2.9 m each */
  floors: number;
  /** front wall material (the masonry family's face) */
  wall: THREE.Material;
  /** sills / lintels / coping (default limestone) */
  trim?: THREE.Material;
  /** cornice kind (default: spec.cornice, else 'bracket') */
  cornice?: CorniceKind;
  /** window bays (default: spec.bays, else one per 2.4 m, min 2) */
  bays?: number;
  /** force or forbid a front fire escape (default: likely on 3-5 floor fronts) */
  fireEscape?: boolean;
  /** facade plane z (default 0 = building line) */
  z?: number;
}

export interface UpperFloorsResult {
  /** roof line, lot-local y */
  topY: number;
  /** y of each upper floor's window sill row (fire-escape platforms sit just below) */
  sillYs: number[];
}

/**
 * Everything above a ground floor: the party-wall shell from y0 up, the front wall with recessed double-hung
 * windows (sills, lintels), the cornice, parapet + roof with clutter, a fire escape or AC units, a drain pipe, and
 * -- on a corner lot -- the windowed side wall above y0. The ground floor itself (0..y0, including the front wall,
 * shop front or lobby and the side wall below y0) belongs to the caller. Used by apartments and by the mixed-use
 * lane, so both stack floors the same way.
 */
export function buildUpperFloors(c: LotCtx, o: UpperFloorsOpts): UpperFloorsResult {
  const { b, m, rng, W, D, spec } = c;
  const z = o.z ?? 0;
  const n = Math.max(1, Math.round(o.floors));
  const y0 = o.y0;
  const topY = y0 + n * UPPER_H;
  const trim = o.trim ?? m.limestone;
  const cs = c.cornerSide;

  // party walls + back (a corner side wall is built below with its own windows)
  const look = lotLook(m, c.lot);
  b.box(look.party, 0, y0, -D, W, topY, z, cs === 'left' ? 'rb' : cs === 'right' ? 'lb' : 'rlb');
  partyWallDetail(b, m, look, { W, D, y0, topY, zFront: z, cornerSide: cs });

  const bays = Math.max(1, Math.min(Math.floor(W / 1.7), o.bays ?? spec?.bays ?? Math.max(2, Math.round(W / 2.4))));
  const xs = bayCentres(W, bays);
  const ww = Math.min(1.1, W / bays - 0.6);
  const holes: Hole[] = [];
  const acSpots: { x: number; y: number }[] = [];
  const sillYs: number[] = [];
  for (let k = 0; k < n; k++) {
    const wy = y0 + k * UPPER_H + 0.6;
    windows(b, m, {
      xs, y: wy, w: ww, h: 1.75, z, holes, wall: o.wall, sill: true, lintel: k === 0 ? 'hood' : 'flat',
      frame: k === n - 1, noLedge: k >= 2, trim, rng,
    });
    for (const x of xs) acSpots.push({ x, y: wy });
    sillYs.push(wy);
  }
  wallWithHoles(b, o.wall, 0, y0, W, topY, z, holes);
  b.box(trim, 0, y0 - 0.1, z, W, y0 + 0.03, z + 0.05, 'fud');
  for (let k = 1; k < n; k++) b.box(trim, 0, y0 + k * UPPER_H - 0.1, z, W, y0 + k * UPPER_H + 0.03, z + 0.05, 'fud');

  corniceOfKind(b, m, 0, W, topY, z, o.cornice ?? spec?.cornice ?? 'bracket', 0.6);
  roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: z, y: topY, frontMat: o.wall, sideMat: look.party, coping: trim, exposeL: cs === 'left', exposeR: cs === 'right', roof: look.roof });
  roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: z, y: topY, brick: look.party, chimney: 0.1, skylight: 0.3, bulkhead: 0.6, dishes: 0.45 });
  roofDetails(b, m, look, { x0: 0, x1: W, zBack: -D, zFront: z, y: topY });
  if (n >= 3 && rng.chance(!ENV14_ON ? 0.5 : n >= 6 ? 0.9 : n >= 5 ? 0.45 : 0.06)) waterTank(b, m, W * 0.5, topY, -D + 2.8);

  const feWanted = o.fireEscape ?? rng.chance(n >= 3 && n <= 4 ? 0.85 : n === 2 ? 0.45 : 0.3);
  if (feWanted && xs.length >= 2) {
    const pair = xs.length >= 3 && rng.chance(0.5) ? [xs[xs.length - 2], xs[xs.length - 1]] : [xs[0], xs[1]];
    fireEscape(b, m, Math.max(0.2, pair[0] - 0.7), Math.min(W - 0.2, pair[1] + 0.7), z, sillYs.map((y) => y - 0.05));
  } else {
    acUnits(b, m, rng, acSpots, z);
  }
  if (rng.chance(0.4)) drainPipe(b, m, rng.chance(0.5) ? 0.14 : W - 0.14, 0.2, topY - 0.4, z);

  if (cs) {
    const nb = Math.max(2, Math.floor((D - 1) / 3));
    b.with(sideWallFrame(cs, W, D), () => {
      const sh: Hole[] = [];
      for (let k = 0; k < n; k++) windows(b, m, { xs: bayCentres(D, nb), y: y0 + k * UPPER_H + 0.6, w: 1.1, h: 1.75, z: 0, holes: sh, wall: o.wall, sill: true, noLedge: k >= 2, rng });
      wallWithHoles(b, o.wall, 0, y0, D, topY, 0, sh);
    });
  }
  return { topY, sillYs };
}
