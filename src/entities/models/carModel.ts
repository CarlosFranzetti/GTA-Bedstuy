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
import { carPaintConfigured, carPaintTier } from '@/render/CarPaintFx';
import { CARGO_LIVERY_H, CARGO_LIVERY_VARIANTS, CARGO_LIVERY_W, cargoLiveryPainter } from '@/textures/painters/vehicle';
import { assignSkinUV, buildSkinNormal, carSkinMaterial, paintBox, skinLayoutFor, SkinCarPaint, type PaintBox, type PaintCond } from './carSkin';
import { PALETTES, type CarLook, type WheelDesign } from './carLook';
import { buildExtras } from './carExtras';
import { CAR_COLORWAYS, type SkinLayout, type SkinStyle } from '@/textures/painters/vehicleSkin';
import {
  Acc, STYLES, isTaxiYellow, mirrorX, buildPassengerParts, buildTruckParts, buildBusParts, wheelRadiusFor, hullSectionCount, isCars14,
  type CarParts, type PassengerStyle,
} from './carBodies';
export { wheelRadiusFor, hullSectionCount };

/** `van` is the box truck (Isuzu NPR type); `cargo` is the Transit-type cargo van */
export type CarStyle = 'sedan' | 'coupe' | 'suv' | 'van' | 'cab' | 'cop' | 'cargo' | 'hatch' | 'beater' | 'bus'
  | 'pickup' | 'crossover' | 'minivan' | 'luxury' | 'towncar' | 'pony' | 'garbage' | 'ambulance' | 'dollar' | 'unmarked'
  | 'coupe911' | 'exotic' | 'jdmcoupe' | 'hothatch' | 'muscle' | 'wedgetruck' | 'evsedan';

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
export function styleFor(type: VehicleType, color: string, variant = 0, unmarked = false): CarStyle {
  if (type === 'cop') return unmarked ? 'unmarked' : 'cop';
  if (type === 'pickup' || type === 'crossover' || type === 'minivan' || type === 'luxury' || type === 'towncar' || type === 'pony' || isCars14(type)) return type;
  if (type === 'garbage' || type === 'ambulance') return type;
  if (type === 'dollarvan') return 'dollar';
  if (type === 'cab') return 'cab';
  if (type === 'suv') return 'suv';
  if (type === 'boxtruck') return 'van';
  if (type === 'cargovan') return 'cargo';
  if (type === 'hatch' || type === 'beater' || type === 'bus') return type;
  if (isTaxiYellow(color)) return 'cab';
  return variant === 3 ? 'coupe' : 'sedan';
}

/** Paint variants offered per type (2 to 4 each); the traffic palette may pick from these. The cop and cab have a livery. */
export const PAINT_VARIANTS: Record<VehicleType, readonly string[]> = {
  sedan: CAR_COLORWAYS.sedan.map((c) => c.color),
  suv: CAR_COLORWAYS.suv.map((c) => c.color),
  boxtruck: CAR_COLORWAYS.van.map((c) => c.color),
  cargovan: CAR_COLORWAYS.cargo.map((c) => c.color),
  hatch: CAR_COLORWAYS.hatch.map((c) => c.color),
  beater: CAR_COLORWAYS.beater.map((c) => c.color),
  bus: CAR_COLORWAYS.bus.map((c) => c.color),
  cop: ['#f2f2f2', '#f2f2f2'],
  cab: ['#e0b01e', '#e0b01e'],
  pickup: PALETTES.pickup.slice(0, 4).map((e) => e.color),
  crossover: PALETTES.crossover.slice(0, 4).map((e) => e.color),
  minivan: PALETTES.minivan.slice(0, 4).map((e) => e.color),
  luxury: PALETTES.luxury.slice(0, 4).map((e) => e.color),
  towncar: PALETTES.towncar.slice(0, 4).map((e) => e.color),
  pony: PALETTES.pony.slice(0, 4).map((e) => e.color),
  coupe911: PALETTES.coupe911.slice(0, 4).map((e) => e.color),
  exotic: PALETTES.exotic.slice(0, 4).map((e) => e.color),
  jdmcoupe: PALETTES.jdmcoupe.slice(0, 4).map((e) => e.color),
  hothatch: PALETTES.hothatch.slice(0, 4).map((e) => e.color),
  muscle: PALETTES.muscle.slice(0, 4).map((e) => e.color),
  wedgetruck: PALETTES.wedgetruck.slice(0, 4).map((e) => e.color),
  evsedan: PALETTES.evsedan.slice(0, 4).map((e) => e.color),
  garbage: ['#eef1ec', '#eef1ec'],
  ambulance: ['#f4f4f4', '#f4f4f4'],
  dollarvan: PALETTES.dollarvan.slice(0, 4).map((e) => e.color),
};

// ---------------------------------------------------------------- materials owned by the model

let trimMat: THREE.MeshStandardMaterial | null = null;
/** Black plastic and chrome share one material; the colour comes from the geometry's vertex colours. */
const trimMaterial = (): THREE.MeshStandardMaterial =>
  (trimMat ??= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.55, name: 'carTrim' }));

// ---------------------------------------------------------------- glass tint (CARS12)

const tintMats = new WeakMap<IMaterialLibrary, Map<number, THREE.Material>>();
/** The shared car glass, or a darker clone for privacy-tinted (1) and limo-dark (2) cars. Cached per library. */
function glassFor(materials: IMaterialLibrary, tint: number): THREE.Material {
  const base = materials.get('carGlass');
  if (!tint) return base;
  let by = tintMats.get(materials);
  if (!by) { by = new Map(); tintMats.set(materials, by); }
  let m = by.get(tint);
  if (!m) {
    m = base.clone();
    const c = (m as THREE.MeshStandardMaterial).color;
    if (c) c.multiplyScalar(tint === 1 ? 0.45 : 0.18);
    if ('opacity' in m) { m.transparent = true; m.opacity = tint === 1 ? 0.93 : 0.98; }
    m.name = `carGlass:tint${tint}`;
    by.set(tint, m);
  }
  return m;
}

/** Paint overlay of one car: dirt, rust, one primer panel and dents, positioned on the body's paint box. */
function condFor(box: PaintBox, lay: SkinLayout, look: CarLook, seed: number): PaintCond {
  const r = new Rng(`cond:${seed}`);
  const sm = lay.seams;
  const belt = box.yMin + box.H * lay.belt;
  const nz = (n: number): number => box.zMin + n * box.L;
  let primer: PaintCond['primer'] = null;
  if (look.primer === 1) primer = { z0: nz(0), z1: nz(sm[0] ?? 0.2), y0: box.yMin + box.H * 0.2, y1: belt + 0.05, side: -1 };
  else if (look.primer === 2) primer = { z0: nz(sm[1] ?? 0.4), z1: nz(sm[2] ?? 0.6), y0: box.yMin + box.H * 0.2, y1: belt + 0.05, side: 1 };
  else if (look.primer === 3) primer = { z0: nz(0.01), z1: nz(lay.hoodEnd), y0: belt - 0.2, y1: box.yMin + box.H, side: 0 };
  else if (look.primer === 4) primer = { z0: nz(lay.bootStart), z1: nz(0.995), y0: belt - 0.2, y1: box.yMin + box.H, side: 0 };
  const dents: PaintCond['dents'] = [];
  for (let i = 0; i < look.dents; i++) {
    const sd = r.chance(0.5) ? 1 : -1;
    dents.push([sd * box.W * 0.5, box.yMin + box.H * r.range(0.3, 0.5), nz(r.range(0.1, 0.9)), r.range(0.16, 0.3)]);
  }
  return { dirt: look.dirt, rust: look.rust, primer, dents, yMin: box.yMin, H: box.H };
}

const hoodMats = new WeakMap<THREE.Material, THREE.Material>();
/** The hood is built around its own pivot: a clone of a condition-painted skin whose overlay is offset back into car space. */
function hoodMaterial(mat: THREE.Material, pivot: THREE.Vector3): THREE.Material {
  const sm = mat as SkinCarPaint;
  if (!sm.isSkinCarPaint || sm.u.uCond.value.w < 0.5) return mat;
  let h = hoodMats.get(mat);
  if (!h) { h = mat.clone(); (h as SkinCarPaint).u.uOff.value.copy(pivot); hoodMats.set(mat, h); }
  return h;
}

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

// ---------------------------------------------------------------- livery bodies: door gaps + derived normal map

const gapMats = new WeakMap<IMaterialLibrary, Map<string, THREE.Material>>();

/**
 * The cab and the cruiser keep their livery colour maps (regular uv, text along the flank). This gives them what the baked skins
 * have: ~8 mm dark door gaps at the style's seams (drawn into a copy of the livery canvas) and a normal map derived from that
 * canvas (gaps, lettering edges and stripe steps get relief). Cached per library; without a DOM (unit tests) it is the plain livery.
 */
function liveryWithGaps(materials: IMaterialLibrary, base: THREE.Material, st: 'cab' | 'cop'): THREE.Material {
  const src = (base as THREE.MeshStandardMaterial).map?.image as unknown;
  if (typeof document === 'undefined' || !(typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement)) return base;
  let byKey = gapMats.get(materials);
  if (!byKey) { byKey = new Map(); gapMats.set(materials, byKey); }
  const hit = byKey.get(st);
  if (hit) return hit;
  try {
    const w = src.width, h = src.height;
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    if (!ctx) return base;
    ctx.drawImage(src, 0, 0);
    const style = STYLES[st === 'cab' ? 'crown' : 'charger'];
    const L = style.dims!.L;
    const lw = Math.max(1, Math.round(w * 0.0016 * 1.3)); // ~8 mm of the car's length
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    for (const u of style.seams) {
      for (const n of [(L / 2 - u) / L, (L / 2 + u) / L]) { // left and right flank (liveryUV runs u the other way on the right)
        ctx.fillRect(Math.round(n * w) - (lw >> 1), Math.round((1 - 0.82) * h), lw, Math.round(0.44 * h));
      }
    }
    const px = ctx.getImageData(0, 0, w, h).data;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4;
        rgba[o] = Math.round(0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]); rgba[o + 3] = 255;
      }
    }
    const nm = buildSkinNormal(rgba, w, h, 1.1);
    nm.channel = 0;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = SRGB;
    tex.anisotropy = 8;
    const m = base.clone() as THREE.MeshStandardMaterial;
    m.map = tex; m.normalMap = nm; m.normalScale = new THREE.Vector2(0.6, 0.6);
    m.name = `${base.name}+gaps`;
    m.needsUpdate = true;
    byKey.set(st, m);
    return m;
  } catch { return base; }
}
const SRGB = THREE.SRGBColorSpace;

// ---------------------------------------------------------------- wheels

/** Tyre sides: 16 reads round at the 6 mm sagitta it leaves on a 0.34 m radius with the bulged sidewall (CARS2: was 20). */
const WHEEL_SEG = 16;
/** Model detail: 'full' (medium / high tiers), 'lite' (phone / low: refine level 1, 12-sided wheels), 'far' (the instanced far proxies: coarsest). */
export type CarLevel = 'full' | 'lite' | 'far';
/** The near-model level of the current tier (CarPaintFx's tier; before it is configured, full detail). */
export function carNearLevel(): CarLevel { return carPaintConfigured() && (carPaintTier() === 'phone' || carPaintTier() === 'low') ? 'lite' : 'full'; }
/** the van's 0.5 m tyres get 24 sides (full), 12 / 16 (lite) */
const segFor = (R: number, lv: CarLevel = 'full'): number => (lv === 'full' ? (R > 0.45 ? 24 : WHEEL_SEG) : lv === 'lite' ? (R > 0.45 ? 16 : 12) : 8);
/** Tyre profile, outer half, from the tread edge outwards: [radius / R, axial / w, texture v]: tread shoulder, bulging sidewall, lower sidewall, bead. The tread is one band between the two shoulders. */
const TYRE_PROFILE: [number, number, number][] = [[1, 0.32, 0.44], [0.93, 0.48, 0.3], [0.78, 0.49, 0.12], [0.68, 0.43, 0.06]];

export type WheelKind = WheelDesign;
/** Texture spots on the tireSidewall map (see tireSidewallPainter's hubcap band): silver rim lip, gunmetal spokes, dark barrel / recess, brake rotor grey. */
const UV_METAL: [number, number] = [0.07, 0.025]; // inside a spoke wedge of the band (gunmetal / aluminium)
const UV_CAP: [number, number] = [0.5, 0.005]; // the band's centre-cap row (silver)
const UV_DARK: [number, number] = [0.02, 0.03];
const UV_ROTOR: [number, number] = [0.07, 0.016]; // the spokes' lit edge strip: mid grey

/**
 * One wheel (axle along x, face on the +x side): a bulged-sidewall tyre with a tread shoulder, a dished rim with a silver lip, a dark
 * barrel, a brake rotor and (alloy) flat spokes standing proud of the dish, or (steel) a domed hubcap. Tyre, rim and brake are ONE
 * mesh with the tyre material (the texture's bands supply the colours), so a wheel costs no extra draw. About 370 triangles on full detail.
 */
function buildWheel(R: number, w: number, kind: WheelKind, lv: CarLevel = 'full'): THREE.BufferGeometry {
  const SEG = segFor(R, lv);
  const alloy = kind !== 'steel' && kind !== 'steelBare';
  const deep = kind === 'deep';
  // spoke count / width per design (lite and far models draw fewer spokes)
  const spokes = ({ alloy6: [6, 0.24], alloy5: [5, 0.3], mesh: [lv === 'full' ? 12 : 8, 0.1], turbine: [lv === 'full' ? 8 : 6, 0.16], deep: [5, 0.26] } as Record<string, [number, number]>)[kind] ?? [6, 0.24];
  const rings: { a: number; r: number; v: number; nr: number; na: number }[] = [];
  let profile = lv === 'full' ? TYRE_PROFILE : TYRE_PROFILE.filter((_, i) => i !== 1); // lite / far: no separate bulge ring
  // aftermarket 'deep' rims: a bigger rim inside a low-profile tyre (the inner rings climb toward the tread)
  if (deep) profile = profile.map(([r, a, v]) => [r >= 0.9 ? r : 0.8 + (r - 0.68) * (0.1 / 0.22), a, v] as [number, number, number]);
  const prof = [...profile.slice().reverse().map(([r, a, v]) => ({ r, a: -a, v: 1 - v })), ...profile.map(([r, a, v]) => ({ r, a, v }))];
  for (let k = 0; k < prof.length; k++) {
    const p = prof[k];
    const p0 = prof[Math.max(0, k - 1)];
    const p1 = prof[Math.min(prof.length - 1, k + 1)];
    const ta = (p1.a - p0.a) * w;
    const tr = (p1.r - p0.r) * R;
    const len = Math.hypot(ta, tr) || 1;
    rings.push({ a: p.a * w, r: p.r * R, v: p.v, na: -tr / len, nr: ta / len });
  }
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const addRing = (a: number, r: number, u: number | null, v: number, na: number, nr: number): void => {
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      pos.push(a, r * c, r * s);
      nor.push(na, nr * c, nr * s);
      uv.push(u ?? i / SEG, v);
    }
  };
  const stitch = (k0: number): void => {
    const n = SEG + 1;
    for (let i = 0; i < SEG; i++) {
      const A = k0 * n + i, B = A + 1, C = (k0 + 1) * n + i, D = C + 1;
      idx.push(A, B, C, B, D, C);
    }
  };
  let ringCount = 0;
  rings.forEach((rg, k) => { addRing(rg.a, rg.r, null, rg.v, rg.na, rg.nr); ringCount++; if (k > 0) stitch(k - 1); });
  // rim face, rings in order; uv [u, v] constant per ring (flat colour from the texture's wheel band)
  const fs = deep ? 1.17 : 1;
  const face: { a: number; r: number; uvc: [number, number]; na: number; nr: number }[] = kind === 'steelBare'
    ? [ // plain pressed steel wheel: flat disc, dark centre with lug ring, no cap
      { a: 0.42 * w, r: 0.68 * R, uvc: UV_METAL, na: 1, nr: 0 },
      { a: 0.42 * w, r: 0.3 * R, uvc: UV_DARK, na: 1, nr: 0 },
      { a: 0.44 * w, r: 0, uvc: UV_DARK, na: 1, nr: 0 },
    ]
    : alloy
    ? [ // silver lip, a dark barrel dropping into the dish, the dish floor (spokes stand in front of it, the rotor sits behind them)
      { a: 0.43 * w, r: Math.min(0.9, 0.69 * fs) * R, uvc: UV_CAP, na: 0.6, nr: 0.8 },
      { a: 0.43 * w, r: 0.6 * fs * R, uvc: UV_DARK, na: 0.2, nr: -0.98 },
      { a: 0.22 * w, r: 0.56 * fs * R, uvc: UV_DARK, na: 1, nr: 0 },
      { a: 0.22 * w, r: 0, uvc: UV_DARK, na: 1, nr: 0 },
    ]
    : [
      { a: 0.43 * w, r: 0.68 * R, uvc: UV_CAP, na: 0.6, nr: 0.8 },
      { a: 0.46 * w, r: 0.5 * R, uvc: UV_METAL, na: 0.85, nr: 0.5 },
      { a: 0.5 * w, r: 0.26 * R, uvc: UV_METAL, na: 1, nr: 0.15 },
      { a: 0.52 * w, r: 0, uvc: UV_CAP, na: 1, nr: 0 },
    ];
  const base = ringCount;
  face.forEach((f, k) => { addRing(f.a, f.r, f.uvc[0], f.uvc[1], f.na, f.nr); if (k > 0) stitch(base + k - 1); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const acc = new Acc().add(g);
  const flatUV = (geo: THREE.BufferGeometry, [u, v]: [number, number]): THREE.BufferGeometry => {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { arr[i * 2] = u; arr[i * 2 + 1] = v; }
    geo.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
    return geo;
  };
  if (alloy) {
    const [N, sw] = spokes;
    const aS = 0.4 * w; // the spokes stand 1.8 cm in front of the dish floor, a little behind the lip
    const r0 = 0.12 * R, r1 = (deep ? 0.66 * fs : 0.64) * R;
    const w0 = sw * R * 0.28, w1 = sw * R * 0.42;
    const sp: number[] = [];
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * Math.PI * 2 + (kind === 'turbine' ? 0.5 : 0.26);
      const c = Math.cos(phi), s = Math.sin(phi);
      const pt = (r: number, lat: number): [number, number, number] => [aS, r * c - lat * s, r * s + lat * c];
      const A = pt(r0, -w0), B = pt(r0, w0), C = pt(r1, w1), D = pt(r1, -w1);
      // lit side faces +x; wind so the normal's x is positive
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      if (nx > 0) sp.push(...A, ...B, ...C, ...A, ...C, ...D); else sp.push(...A, ...C, ...B, ...A, ...D, ...C);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(sp.length).fill(0).map((_, i) => (i % 3 === 0 ? 1 : 0)), 3));
    acc.add(flatUV(sg, UV_METAL));
    // centre cap, and (full detail) the brake rotor behind the spokes: a grey annulus on the dish floor
    acc.add(flatUV(new THREE.CircleGeometry(0.15 * R, lv === 'full' ? 10 : 6).rotateY(Math.PI / 2).translate(aS + 0.01 * w, 0, 0), UV_CAP));
    if (lv === 'full') {
      const rot = new THREE.RingGeometry(0.3 * R, 0.52 * R, SEG, 1).rotateY(Math.PI / 2).translate(0.23 * w, 0, 0);
      acc.add(flatUV(rot, UV_ROTOR));
    }
  }
  return acc.merge();
}

interface WheelGeos {
  /** hubcap on +x (right wheels) */
  right: THREE.BufferGeometry;
  /** hubcap on -x (left wheels) */
  left: THREE.BufferGeometry;
}
const wheelCache = new Map<string, WheelGeos>();
function wheelGeos(R: number, w: number, kind: WheelKind, lv: CarLevel = 'full'): WheelGeos {
  const key = `${R.toFixed(3)}|${w.toFixed(3)}|${kind}|${lv}`;
  let g = wheelCache.get(key);
  if (!g) {
    const right = buildWheel(R, w, kind, lv);
    g = { right, left: mirrorX(right) };
    wheelCache.set(key, g);
  }
  return g;
}

/** Both rear wheels as one geometry, left wheel at the origin and the right one `span` along +x (they roll together). */
const rearPairCache = new Map<string, THREE.BufferGeometry>();
function rearPair(R: number, w: number, span: number, kind: WheelKind, lv: CarLevel = 'full'): THREE.BufferGeometry {
  const key = `${R.toFixed(3)}|${w.toFixed(3)}|${span.toFixed(3)}|${kind}|${lv}`;
  let g = rearPairCache.get(key);
  if (!g) {
    const wg = wheelGeos(R, w, kind, lv);
    g = new Acc().add(wg.left.clone()).add(wg.right.clone().translate(span, 0, 0)).merge();
    rearPairCache.set(key, g);
  }
  return g;
}

/** Inner (dual) rear tyres of both sides as one geometry, for the far proxies: the same layout as `rearPair`, each tyre `d` inboard. */
const rearDualCache = new Map<string, THREE.BufferGeometry>();
function rearDualPair(R: number, w: number, span: number, kind: WheelKind, lv: CarLevel): THREE.BufferGeometry {
  const key = `${R.toFixed(3)}|${w.toFixed(3)}|${span.toFixed(3)}|${kind}|${lv}`;
  let g = rearDualCache.get(key);
  if (!g) {
    const wg = wheelGeos(R, w, kind, lv), d = 1.12 * w;
    g = new Acc().add(wg.left.clone()).add(wg.right.clone().translate(span, 0, 0)).add(wg.left.clone().translate(d, 0, 0)).add(wg.right.clone().translate(span - d, 0, 0)).merge();
    rearDualCache.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------- per-style parts (cached)

const partsCache = new Map<string, CarParts>();
const layoutCache = new Map<string, SkinLayout>();

/** The body styles that wear a baked skin (the cab and the cop car have their own livery maps on the regular UV set). */
const SKINNED: ReadonlySet<CarStyle> = new Set<CarStyle>(['sedan', 'coupe', 'suv', 'van', 'cargo', 'hatch', 'beater', 'bus', 'pickup', 'crossover', 'minivan', 'luxury', 'towncar', 'pony', 'garbage', 'ambulance', 'dollar', 'coupe911', 'exotic', 'jdmcoupe', 'hothatch', 'muscle', 'wedgetruck', 'evsedan']);
/** The skin layout family of a body: the garbage truck's cab is the box truck's cab, the ambulance is the cargo van. */
const skinStyleOf = (st: CarStyle): SkinStyle => (st === 'garbage' ? 'van' : st === 'ambulance' ? 'cargo' : (st as SkinStyle));
const boxCache = new Map<string, PaintBox>();

const layoutKey = (style: CarStyle, spec: VehicleSpec, lv: CarLevel): string => `${style}|${spec.length}|${spec.width}|${spec.height}|${lv}`;
function partsFor(style: CarStyle, spec: VehicleSpec, lv: CarLevel = 'full'): CarParts {
  const key = layoutKey(style, spec, lv);
  let p = partsCache.get(key);
  if (!p) {
    p = style === 'van' ? buildTruckParts(spec) : style === 'garbage' ? buildTruckParts(spec, 'garbage') : style === 'bus' ? buildBusParts(spec) : buildPassengerParts(style as PassengerStyle | 'unmarked', spec, lv === 'full' ? 2 : 1);
    if (SKINNED.has(style)) {
      // second UV set for the skin atlas (the regular uv stays untouched: dirt-map fallback, far-car proxies)
      const box = paintBox(p.paint);
      assignSkinUV(p.paint, box);
      if (p.hood) assignSkinUV(p.hood.geo, box, p.hood.pivot);
      layoutCache.set(key, skinLayoutFor(skinStyleOf(style), box));
      boxCache.set(key, box);
    }
    partsCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- merged near car: details mesh + wheel set

/** `carKind` vertex attribute of the details mesh. */
const KIND_TRIM = 0, KIND_HEAD = 1, KIND_TAIL = 2, KIND_BAR_A = 3, KIND_BAR_B = 4;

const detailsCache = new WeakMap<CarParts, Map<string, THREE.BufferGeometry>>();
/** Trim triangles kept on the lite near model (the smallest ones go first: handle slits, grille slats, badge relief). */
export const LITE_TRIM_TRIS = 1180;

/** Non-indexed `g` without its smallest triangles, keeping at most `max` (g itself when it already fits). */
export function pruneSmallTriangles(g: THREE.BufferGeometry, max: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const tris = pos.count / 3;
  if (tris <= max) return g;
  const area = new Float32Array(tris);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1).sub(a); c.fromBufferAttribute(pos, t * 3 + 2).sub(a);
    area[t] = b.cross(c).length();
  }
  const keep = Array.from({ length: tris }, (_, t) => t).sort((p, q) => area[q] - area[p] || p - q).slice(0, max).sort((p, q) => p - q);
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const src = g.getAttribute(name), size = src.itemSize;
    const arr = new (src.array.constructor as new (n: number) => Float32Array)(keep.length * 3 * size);
    keep.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let k = 0; k < size; k++) arr[(i * 3 + v) * size + k] = src.getComponent(t * 3 + v, k); });
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, src.normalized));
  }
  return out;
}
/** Trim + head lamps + tail lamps + light-bar lenses as ONE geometry: position, normal, uv, colour and a `carKind` tag. */
function detailsGeo(parts: CarParts, lv: CarLevel = 'full', look?: CarLook, style = ''): THREE.BufferGeometry {
  let byLook = detailsCache.get(parts);
  if (!byLook) { byLook = new Map(); detailsCache.set(parts, byLook); }
  const lk = look ? `${look.roof}|${look.stickers.join('.')}|${look.rideshare}` : '';
  let out = byLook.get(lk);
  if (out) return out;
  const list: THREE.BufferGeometry[] = [];
  const prep = (src: THREE.BufferGeometry, kind: number, color?: number, at?: THREE.Vector3, cap = LITE_TRIM_TRIS): void => {
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
    list.push(kind === KIND_TRIM && lv === 'lite' ? pruneSmallTriangles(g, cap) : g);
  };
  prep(parts.trim, KIND_TRIM);
  const ex = look ? buildExtras(parts, look, style, lv === 'full') : (style === 'bus' ? buildExtras(parts, NEUTRAL_LOOK, style, lv === 'full') : null);
  if (ex) prep(ex, KIND_TRIM, undefined, undefined, 150);
  prep(parts.lampHead, KIND_HEAD, 0xaab4be); // lens glass: grey-clear when dark, lit by the emissive mask at night
  prep(parts.lampTail, KIND_TAIL, 0x7a1010);
  if (parts.lightbar) {
    prep(parts.lightbar.lens, KIND_BAR_A, 0x202020, parts.lightbar.a);
    prep(parts.lightbar.lens, KIND_BAR_B, 0x202020, parts.lightbar.b);
  }
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!merged) throw new Error('carModel: details merge failed');
  byLook.set(lk, out = merged);
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
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private readonly rigs: { steer: THREE.Object3D; roll: THREE.Object3D; left: boolean; dx?: number }[]) {
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
      if (r.dx) m.multiply(new THREE.Matrix4().makeTranslation(r.dx, 0, 0)); // dual rear: the inner tyre sits inboard on the same axle
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
const NEUTRAL_LOOK: CarLook = { wheel: 'steel', lowered: 0, tint: 0, roof: 'none', stickers: [], rideshare: -1, dirt: 0, rust: 0, dents: 0, primer: 0, livery: 0, unmarked: false, key: 'n', condKey: 'n' };

// ---------------------------------------------------------------- public

/**
 * `variant` (0..3) picks the licence plate text so not every car wears BK-STUY, and turns plain sedans into coupes at 3.
 * `style` overrides the automatic choice (the far-car proxies use it to rebuild the exact style).
 */
export function buildCarModel(type: VehicleType, spec: VehicleSpec, materials: IMaterialLibrary, variant = 0, style?: CarStyle, split = false, look?: CarLook, seed = 0): CarModel {
  const st = style ?? styleFor(type, spec.color, variant, look?.unmarked);
  const lv: CarLevel = split ? 'far' : carNearLevel();
  const parts = partsFor(st, spec, lv);
  const group = new THREE.Group();
  group.name = `car:${type}`;
  group.userData.carStyle = st;
  group.userData.carVariant = variant;
  group.userData.buildLodModel = (): CarModel => buildCarModel(type, spec, materials, variant, st, true, look, seed);
  const own: THREE.Material[] = [];
  const paintMeshes: THREE.Mesh[] = [];

  const lkey = layoutKey(st, spec, lv);
  const layout = layoutCache.get(lkey);
  const box = boxCache.get(lkey);
  // livery pack (vans, ambulance, dollar van, bus ads) and the paint overlay of this car's wear
  let pack: number | undefined;
  if (look) {
    if (st === 'cargo' && look.livery > 0) pack = 9 + look.livery;
    else if (st === 'bus') pack = look.livery % 4;
  }
  if (st === 'ambulance') pack = 20; else if (st === 'dollar') pack = 21;
  const cond = layout && box && look ? condFor(box, layout, look, seed) : undefined;
  const paintMat = st === 'cop' ? liveryWithGaps(materials, materials.get('copLivery'), 'cop') : st === 'cab' ? liveryWithGaps(materials, materials.get('taxiLivery'), 'cab')
    : layout ? carSkinMaterial(materials, skinStyleOf(st), spec.color, layout, { pack, cond, condKey: look?.condKey, type }) : materials.carPaint(spec.color);
  if (st === 'wedgetruck' && (paintMat as SkinCarPaint).isSkinCarPaint) {
    // CARS14 satire: unpainted stainless slab: full metal, brushed (anisotropic) highlights, no clearcoat
    const m = paintMat as SkinCarPaint;
    m.metalness = 1; m.roughness = 0.35; m.roughnessMap = null; m.clearcoat = 0; m.anisotropy = 0.7; m.anisotropyRotation = Math.PI / 2;
    m.envMapIntensity = 1.6; m.needsUpdate = true;
  }
  const glassMat = glassFor(materials, look?.tint ?? 0);
  const tyreMat = materials.get('tireSidewall');

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    parent.add(m);
    return m;
  };

  paintMeshes.push(mesh(parts.paint, paintMat, 'body'));
  if (parts.paint2) paintMeshes.push(mesh(parts.paint2, cargoLiveryMaterial(materials, st === 'garbage' ? 11 : look ? look.livery : variant), 'cargo'));
  mesh(parts.glass, glassMat, 'glass');
  if (split) mesh(parts.trim, trimMaterial(), 'trim');

  let hood: THREE.Object3D | undefined;
  if (parts.hood) {
    const pivot = new THREE.Group();
    pivot.name = 'hoodPivot';
    pivot.position.copy(parts.hood.pivot);
    group.add(pivot);
    paintMeshes.push(mesh(parts.hood.geo, hoodMaterial(paintMat, parts.hood.pivot), 'hood', pivot));
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
  const wkind: WheelKind = look?.wheel ?? (st === 'cab' || st === 'cop' || st === 'unmarked' || st === 'beater' || st === 'cargo' || st === 'van' || st === 'bus' || st === 'garbage' || st === 'ambulance' || st === 'dollar' ? 'steel' : 'alloy6'); // hubcap steelies on the taxi, cruiser, beater and the work vehicles
  const wg = wheelGeos(parts.wheelR, parts.wheelW, wkind, lv);
  const wheels: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  const rigs: { steer: THREE.Object3D; roll: THREE.Object3D; left: boolean; dx?: number }[] = [];
  const duals: typeof rigs = []; // inner rear tyres of dual-rear axles: extra instances after the four wheels
  for (const w of parts.wheels) {
    const steer = new THREE.Group();
    steer.name = w.front ? 'steerPivot' : 'wheelMount';
    steer.position.set(w.x, parts.wheelR, w.z);
    const roll = new THREE.Group();
    roll.name = 'wheel';
    if (split) {
      if (w.front) mesh(w.x < 0 ? wg.left : wg.right, tyreMat, 'tyre', roll);
      else if (w.x < 0) {
        // dual rear axles: the inner tyres ride in the same mesh, so the far proxies keep them without a draw more
        mesh(parts.dualRear ? rearDualPair(parts.wheelR, parts.wheelW, -2 * w.x, wkind, lv) : rearPair(parts.wheelR, parts.wheelW, -2 * w.x, wkind, lv), tyreMat, 'tyre', roll);
      }
    }
    steer.add(roll);
    group.add(steer);
    wheels.push(roll);
    rigs.push({ steer, roll, left: w.x < 0 });
    if (parts.dualRear && !w.front) duals.push({ steer, roll, left: w.x < 0, dx: (w.x < 0 ? 1 : -1) * 1.12 * parts.wheelW }); // wheel-local +x is outboard on both sides
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
    const details = mesh(detailsGeo(parts, lv, look, st), dm, 'trim');
    const barA = lightbar ? (lightbar.red.material as THREE.MeshStandardMaterial) : null;
    const barB = lightbar ? (lightbar.blue.material as THREE.MeshStandardMaterial) : null;
    const lit = (m: THREE.MeshStandardMaterial, out: THREE.Color): void => {
      out.copy(m.emissive).multiplyScalar(m.emissiveIntensity);
    };
    details.onBeforeRender = () => {
      lit(headMat, u.uHead.value); lit(tailMat, u.uTail.value);
      if (barA && barB) { lit(barA, u.uBarA.value); lit(barB, u.uBarB.value); }
    };
    group.add(new WheelSet(wg.right, tyreMat, [...rigs, ...duals]));
    farSource = () => buildCarModel(type, spec, materials, variant, st, true, look, seed);
  }

  // aftermarket stance: the whole body (not the wheels) sits lower over the tyres
  if (look && look.lowered > 0 && !split) {
    for (const o of group.children) {
      if (o instanceof THREE.InstancedMesh || o.name === 'steerPivot' || o.name === 'wheelMount' || o.name === 'tyre') continue;
      o.position.y -= look.lowered;
    }
  }
  if (split && farSource === undefined && look) void look;
  return { group, wheels, steerPivots, lightbar, headlights, taillights, hood, paintMeshes, wheelRadius: parts.wheelR, ownMaterials: own, style: st, farSource };
}
