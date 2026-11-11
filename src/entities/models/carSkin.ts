/**
 * Baked skins for the procedural car bodies (albedo only; GFX2 owns reflections and the clear coat).
 *
 *  - `skinLayoutFor` turns a body style (carBodies STYLES) and the measured paint bounding box into the fractions the painter needs.
 *  - `assignSkinUV` writes a second UV set (`uv1`) on the body paint triangles, picking per triangle the flank / top / front / rear /
 *    underside region of the skin atlas from its face normal, so the regular `uv` (the dirt-map fallback texel, the cop and cab
 *    liveries, the far-car proxies) stay exactly as before.
 *  - `SkinCarPaint` is the library's car paint (MeshPhysicalMaterial: clear coat, flake normal, roughness) with one change in the
 *    fragment shader: the skin atlas carries a paint mask in alpha, so paint pixels become `paint colour x shading` and fixed pixels
 *    (chrome, lamp housings, plate, decals) keep their own colour. One material per (style, colour); the paint colour stays the
 *    material colour, so the wreck darkening in Vehicle (clone + color.multiplyScalar) works unchanged.
 */
import { installCarPaintCoat } from '@/render/CarPaintFx';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { createCanvas } from '@/textures/canvas';
import type { IMaterialLibrary } from '@/world/types';
import {
  CAR_COLORWAYS, SKIN_H, SKIN_PAINT_BASE, SKIN_RECTS, SKIN_W, paintCarSkin, type SkinLayout, type SkinRegion, type SkinStyle,
} from '@/textures/painters/vehicleSkin';
import { carPaintConfigured, carPaintTier } from '@/render/CarPaintFx';
import { STYLES, BUS_AXLES, BUS_BELT, BUS_SEAMS, type StyleKey } from './carBodies';
import { paletteEntry } from './carLook';
import type { VehicleType } from '@/world/types';

export interface PaintBox { L: number; W: number; H: number; yMin: number; zMin: number; xMin: number }

export function paintBox(geo: THREE.BufferGeometry, offset: THREE.Vector3 = new THREE.Vector3()): PaintBox {
  geo.computeBoundingBox();
  const b = geo.boundingBox!.clone().translate(offset);
  return { L: b.max.z - b.min.z, W: b.max.x - b.min.x, H: b.max.y - b.min.y, yMin: b.min.y, zMin: b.min.z, xMin: b.min.x };
}

const BADGE: Record<SkinStyle, string> = { sedan: 'AVENUE', coupe: 'MARCY', suv: 'KOSCI', van: 'HALSEY', cargo: 'TRANSOM', hatch: 'PACER', beater: 'MARLOW', bus: 'CITY', pickup: 'FORGE', crossover: 'TREKKER', minivan: 'VOYAGER', luxury: 'BAVARO', towncar: 'SOVEREIGN', pony: 'BRONCO', dollar: 'JITNEY' };
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Layout of the skin for a body (pure numbers: unit-testable without a DOM). */
export function skinLayoutFor(style: SkinStyle, box: PaintBox, pack = 0): SkinLayout {
  if (style === 'van') {
    // the box truck's cab: nose at z min; the glass spans most of the cab
    return {
      style, L: box.L, W: box.W, H: box.H, pack,
      seams: [0.52], handles: [0.5], doorGlass: [[0.3, 0.78]], windshield: [0.02, 0.3], rearGlass: [0.9, 0.98],
      belt: 0.56, axles: [0.2, 0.9], archV: 0.12, archRV: 0.2, archRN: 0.16,
      hoodEnd: 0.1, bootStart: 0.9, bumper: [0.02, 0.2],
      headLamp: { x: 0.34, v: 0.2 }, tailLamp: { x: 0.34, v: 0.2 }, badge: BADGE.van,
    };
  }
  if (style === 'bus') {
    // the bus: n along the length from the nose; doors (curb side) and axles from the roster layout (buildBusParts: BUS_DOORS, axles)
    const hh = box.H;
    const un = (u: number): number => clamp01((box.L / 2 - u) / box.L);
    return {
      style, L: box.L, W: box.W, H: box.H, pack,
      seams: BUS_SEAMS.map(un), handles: [], doorGlass: [], windshield: [0.02, 0.05], rearGlass: [0.95, 0.98],
      belt: clamp01((BUS_BELT - box.yMin) / hh), axles: [un(BUS_AXLES[0]), un(BUS_AXLES[1])],
      archV: clamp01((0.5 - box.yMin) / hh), archRV: (0.5 * 1.12) / hh, archRN: (0.5 * 1.12) / box.L,
      hoodEnd: 0.03, bootStart: 0.97, bumper: [clamp01(0.04), clamp01(0.2)],
      headLamp: { x: 0.35, v: 0.2 }, tailLamp: { x: 0.35, v: 0.2 }, badge: BADGE.bus,
    };
  }
  const st = STYLES[style as StyleKey];
  const uMax = Math.abs(st.secs[0][0]);
  const n = (u: number): number => clamp01((uMax - u) / (2 * uMax));
  const v = (y: number): number => clamp01((y - box.yMin) / box.H);
  const belt = st.secs[Math.floor(st.secs.length / 2)][2];
  const R = st.wheelR;
  return {
    style, L: box.L, W: box.W, H: box.H, pack,
    seams: st.seams.map(n), handles: st.handles.map(n),
    doorGlass: st.doorGlass.map(([a, b]) => [n(a), n(b)] as [number, number]),
    windshield: [n(st.windshield[0]), n(st.windshield[1])], rearGlass: st.rearGlass ? [n(st.rearGlass[0]), n(st.rearGlass[1])] : [0.97, 0.99],
    belt: v(belt),
    axles: [n(st.axle), n(-st.axle)], archV: (R - box.yMin) / box.H, archRV: (R * 1.12) / box.H, archRN: (R * 1.12) / box.L,
    hoodEnd: n(st.hoodBack), bootStart: n(st.rearGlass ? st.rearGlass[1] : -uMax + 0.2),
    bumper: [v(st.bumperY - st.bumperH / 2), v(st.bumperY + st.bumperH / 2)],
    headLamp: { x: (box.W / 2 - 0.2) / box.W, v: v(st.bumperY + st.bumperH / 2 + 0.1) },
    tailLamp: { x: (box.W / 2 - 0.22) / box.W, v: v(st.bumperY + st.bumperH / 2 + 0.12) },
    badge: BADGE[style],
  };
}

// ---------------------------------------------------------------- UV set 1

/** Region of the atlas for a face normal. */
export function regionFor(nx: number, ny: number, nz: number): SkinRegion {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return ny >= 0 ? 'top' : 'under';
  if (ax >= az) return nx >= 0 ? 'right' : 'left';
  return nz < 0 ? 'front' : 'rear';
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/**
 * Adds the `uv1` attribute (atlas coordinates) to a non-indexed body geometry. `offset` moves the geometry into car space first
 * (the hood is built around its own pivot). Triangles pick their region by face normal, so a region boundary is a hard edge, never a smear.
 */
export function assignSkinUV(geo: THREE.BufferGeometry, box: PaintBox, offset: THREE.Vector3 = new THREE.Vector3()): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const put = (i: number, region: SkinRegion, x: number, y: number, z: number): void => {
    const r = SKIN_RECTS[region];
    let fu: number, t: number;
    const fz = (z - box.zMin) / box.L; // 0 at the nose
    const fx = (x - box.xMin) / box.W; // 0 at -x
    const fy = (y - box.yMin) / box.H;
    switch (region) {
      case 'right': fu = 1 - fz; t = fy; break;
      case 'left': fu = fz; t = fy; break;
      case 'top': fu = fz; t = fx; break;
      case 'under': fu = fz; t = fx; break;
      case 'front': fu = 1 - fx; t = fy; break;
      default: fu = fx; t = fy; break;
    }
    fu = clamp01(fu); t = clamp01(t);
    const inset = 0.6;
    const px = r.x + inset + fu * (r.w - 2 * inset);
    const py = r.y + inset + (1 - t) * (r.h - 2 * inset);
    uv[i * 2] = px / SKIN_W;
    uv[i * 2 + 1] = 1 - py / SKIN_H;
  };
  for (let i = 0; i + 2 < n; i += 3) {
    _a.fromBufferAttribute(pos, i).add(offset); _b.fromBufferAttribute(pos, i + 1).add(offset); _c.fromBufferAttribute(pos, i + 2).add(offset);
    const e1x = _b.x - _a.x, e1y = _b.y - _a.y, e1z = _b.z - _a.z;
    const e2x = _c.x - _a.x, e2y = _c.y - _a.y, e2z = _c.z - _a.z;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const region = regionFor(nx, ny, nz);
    put(i, region, _a.x, _a.y, _a.z); put(i + 1, region, _b.x, _b.y, _b.z); put(i + 2, region, _c.x, _c.y, _c.z);
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
}

// ---------------------------------------------------------------- material

/** Per-car condition of the paint (CARS12): dirt, rust 0..3, primer panel and up to three dents, drawn procedurally in the shader (no textures, no triangles). */
export interface PaintCond {
  dirt: number; rust: number;
  /** primer panel in car space: z range, y range and side (+1 right, -1 left, 0 both), or null */
  primer: { z0: number; z1: number; y0: number; y1: number; side: number } | null;
  /** dent centres in car space (x, y, z, radius m) */
  dents: Array<[number, number, number, number]>;
  /** paint bounding box: yMin and height */
  yMin: number; H: number;
}
export const NO_COND: PaintCond = { dirt: 0, rust: 0, primer: null, dents: [], yMin: 0, H: 1 };
const hasCond = (c: PaintCond): boolean => c.dirt > 0 || c.rust > 0 || !!c.primer || c.dents.length > 0;

const COND_FUNCS = /* glsl */ `
varying vec3 vOPos;
uniform vec4 uCond; uniform vec4 uPrimer; uniform vec4 uBox; uniform vec4 uDent[3];
float h31(vec3 p){ p = fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;
const COND_FRAG = /* glsl */ `
if (uCond.w > 0.5) {
  vec3 q = vOPos;
  float n1 = vnoise(q * 3.3), n2 = vnoise(q * 12.0);
  float yN = clamp((q.y - uBox.x) / uBox.y, 0.0, 1.0);
  float dl = uCond.x / 3.0;
  float dirtAmt = dl * smoothstep(0.12 + 0.5 * dl, 0.0, yN) * (0.55 + 0.7 * n1);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.12), clamp(dirtAmt * 0.85, 0.0, 0.8));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.46, 0.38), dl * 0.2 * (0.4 + n2));
  if (uCond.y > 0.5) {
    float rl = uCond.y / 3.0;
    float lowEdge = 1.0 - smoothstep(0.0, 0.32, yN);
    float m = smoothstep(0.7 - 0.28 * rl, 0.86 - 0.2 * rl, n1 * 0.55 + n2 * 0.45 + lowEdge * 0.5 * rl);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.4, 0.19, 0.07), vec3(0.64, 0.35, 0.14), n2), m);
  }
  if (uCond.z > 0.5 && q.z > uPrimer.x && q.z < uPrimer.y && q.y > uPrimer.z && q.y < uPrimer.w && (uBox.z == 0.0 || q.x * uBox.z > 0.0)) {
    float edge = smoothstep(0.0, 0.015, min(min(q.z - uPrimer.x, uPrimer.y - q.z), min(q.y - uPrimer.z, uPrimer.w - q.y)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.43, 0.46, 0.42) * (0.85 + 0.3 * n2), edge);
  }
  for (int i = 0; i < 3; i++) {
    if (uDent[i].w > 0.0) {
      float d = length(q - uDent[i].xyz) / uDent[i].w;
      if (d < 1.0) {
        float ring = smoothstep(0.5, 0.82, d) * (1.0 - smoothstep(0.82, 1.0, d));
        diffuseColor.rgb *= 1.0 - 0.4 * ring + 0.14 * (1.0 - smoothstep(0.0, 0.5, d));
      }
    }
  }
}
`;

const PAINT_FRAG = /* glsl */ `
float cpMask = 0.0;
#ifdef USE_MAP
  vec4 skinS = texture2D( map, vMapUv );
  // paint pixels: paint colour x shading (the clean-paint shading is divided out); fixed pixels: their own colour
  vec3 skinPaint = diffuse * min( skinS.rgb * ${(1 / SKIN_PAINT_BASE).toFixed(4)}, vec3( 1.25 ) );
  diffuseColor.rgb = mix( skinS.rgb, skinPaint, skinS.a );
  cpMask = skinS.a; // clear coat (render/CarPaintFx) only on paint pixels
  if (skinS.a > 0.5) {
  ${COND_FRAG}
  }
#endif
`;

/** Extra shader hooks (GFX2's CarPaintFx clear coat registers here): called after the skin's own map_fragment patch, so the baked albedo stays the base. No new draws or materials. */
const skinHooks: Array<(shader: { fragmentShader: string; vertexShader: string; uniforms: Record<string, { value: unknown }> }, material: THREE.Material) => void> = [];
export function registerSkinPaintHook(fn: (typeof skinHooks)[number]): void { if (!skinHooks.includes(fn)) skinHooks.push(fn); }

/** The library's physical car paint with a paint-masked skin atlas in `map` (UV set 1). Clones keep the hook and the link to the library paint. */
export class SkinCarPaint extends THREE.MeshPhysicalMaterial {
  readonly isSkinCarPaint = true;
  /** the library's plain paint of this colour: envMap and envMapIntensity follow it, so the sky reflections update as for every car */
  base: THREE.MeshStandardMaterial | null = null;
  /** condition overlay uniforms (values are per material; all materials share one program) */
  readonly u = {
    uCond: { value: new THREE.Vector4() }, uPrimer: { value: new THREE.Vector4() }, uBox: { value: new THREE.Vector4(0, 1, 0, 0) },
    uDent: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uOff: { value: new THREE.Vector3() },
  };

  constructor(base?: THREE.MeshStandardMaterial) {
    super();
    this.base = base ?? null;
    Object.defineProperty(this, 'envMap', { get: () => this.base?.envMap ?? null, set: () => { /* follows the base */ }, configurable: true });
    this.onBeforeCompile = (shader): void => {
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vOPos;\nuniform vec3 uOff;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOPos = position + uOff;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COND_FUNCS}`).replace('#include <map_fragment>', PAINT_FRAG);
      installCarPaintCoat(shader);
      for (const h of skinHooks) h(shader, this);
    };
    this.customProgramCacheKey = (): string => `skinCarPaint2:${skinHooks.length}`;
  }

  /** Sets the condition overlay (CARS12). */
  setCond(c: PaintCond): this {
    const on = hasCond(c);
    this.u.uCond.value.set(c.dirt, c.rust, c.primer ? 1 : 0, on ? 1 : 0);
    if (c.primer) this.u.uPrimer.value.set(c.primer.z0, c.primer.z1, c.primer.y0, c.primer.y1);
    this.u.uBox.value.set(c.yMin, c.H, c.primer ? c.primer.side : 0, 0);
    for (let i = 0; i < 3; i++) { const d = c.dents[i]; this.u.uDent.value[i].set(d ? d[0] : 0, d ? d[1] : 0, d ? d[2] : 0, d ? d[3] : 0); }
    return this;
  }

  copy(source: THREE.Material): this {
    super.copy(source as THREE.MeshPhysicalMaterial);
    const s = source as SkinCarPaint;
    if (s.isSkinCarPaint) {
      this.base = s.base;
      this.u.uCond.value.copy(s.u.uCond.value); this.u.uPrimer.value.copy(s.u.uPrimer.value); this.u.uBox.value.copy(s.u.uBox.value); this.u.uOff.value.copy(s.u.uOff.value);
      for (let i = 0; i < 3; i++) this.u.uDent.value[i].copy(s.u.uDent.value[i]);
    }
    return this;
  }
}

/** Trim pack of a colour for a style: the colourway's own pack when the colour is one of its solids, else a stable hash. */
export function packFor(style: SkinStyle, color: string, type?: VehicleType): number {
  const pe = type ? paletteEntry(type, color) : undefined;
  if (pe) return pe.pack;
  const ways = CAR_COLORWAYS[style];
  const hit = ways.find((w) => w.color.toLowerCase() === color.toLowerCase());
  if (hit) return hit.pack;
  // plain is the default; the cream stripe and the two-tone lower body are deliberate minorities
  const h = Rng.hash(`${style}:${color.toLowerCase()}`) % 8;
  return h < 6 ? 0 : h === 6 ? 1 : 2;
}

interface SkinSet { tex: Map<string, THREE.DataTexture>; mats: Map<string, THREE.Material> }
const sets = new WeakMap<IMaterialLibrary, SkinSet>();

/**
 * Normal map of a skin, derived from its colour layer: on paint pixels the shading multiplier IS the relief (panel gaps, door
 * seams, window rubber, grime are darker = recessed), so a Sobel pass over its luminance gives sharp panel lines for free.
 * Fixed-colour pixels (chrome, lamps, decals) stay flat. Same layout and row order as the albedo (uv1).
 */
export function buildSkinNormal(rgba: Uint8Array, w: number, h: number, strength = 1.3): THREE.DataTexture {
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hgt[i] = rgba[i * 4 + 3] > 127 ? rgba[i * 4] / 255 : SKIN_PAINT_BASE; // fixed pixels: flat at clean-paint height
  const out = new Uint8Array(w * h * 4);
  const at = (x: number, y: number): number => hgt[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength; // texture row 0 is v = 0 (bottom), so +y of the image is +v
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l;
      const o = (y * w + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.channel = 1;
  t.needsUpdate = true;
  return t;
}

let canvasBroken = false;
/** The atlas of a (style, pack): both layers painted on canvases, packed into one RGBA DataTexture (alpha = paint mask). */
export function buildSkinTexture(layout: SkinLayout, size = SKIN_W, make: (w: number, h: number) => HTMLCanvasElement = createCanvas): THREE.DataTexture | null {
  if (canvasBroken) return null;
  const w = size, h = size / 2;
  const cc = make(w, h), mc = make(w, h);
  const cx = cc.getContext('2d'), mx = mc.getContext('2d');
  if (!cx || !mx) { canvasBroken = true; return null; } // no 2D canvas (jsdom): plain paint
  paintCarSkin(cx, mx, w, h, new Rng(`carSkin:${layout.style}:${layout.pack ?? 0}`), layout);
  const col = cx.getImageData(0, 0, w, h).data, msk = mx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const dst = (h - 1 - y) * w * 4; // DataTexture row 0 is v = 0 (the bottom of the canvas)
    const src = y * w * 4;
    for (let x = 0; x < w; x++) {
      data[dst + x * 4] = col[src + x * 4]; data[dst + x * 4 + 1] = col[src + x * 4 + 1]; data[dst + x * 4 + 2] = col[src + x * 4 + 2];
      data[dst + x * 4 + 3] = msk[src + x * 4]; // red channel of the (grey) mask
    }
  }
  const nrm = buildSkinNormal(data, w, h);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.userData.normal = nrm;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.channel = 1;
  tex.needsUpdate = true;
  tex.name = `carSkin:${layout.style}:${layout.pack ?? 0}`;
  return tex;
}

/** Texture width by tier: the phone tier paints half-size skins (decided when a skin is first needed). */
export function skinSizeNow(style?: SkinStyle): number {
  const phone = carPaintConfigured() && carPaintTier() === 'phone';
  // the CARS12 bodies get half-size atlases (512 x 256, 256 x 128 on the phone): 12 more atlases at full size would cost ~65 MB of texture memory
  if (style && NEW_SKIN_STYLES.has(style)) return phone ? SKIN_W / 2 : SKIN_W;
  return phone ? SKIN_W / 2 : SKIN_W * 2; // 1024 x 512 off the phone tier
}
const NEW_SKIN_STYLES: ReadonlySet<SkinStyle> = new Set<SkinStyle>(['pickup', 'crossover', 'minivan', 'luxury', 'towncar', 'pony', 'dollar']);

/**
 * The skinned paint for a body style and colour (cached per library), or the library's plain paint when there is no DOM (unit tests)
 * or the canvases cannot be read. `layout` must be the body's own (it decides the pack's geometry cues).
 */
export interface SkinOpts { pack?: number; cond?: PaintCond; condKey?: string; type?: VehicleType }
export function carSkinMaterial(materials: IMaterialLibrary, style: SkinStyle, color: string, layout: SkinLayout, opts: SkinOpts = {}): THREE.Material {
  const base = materials.carPaint(color);
  if (typeof document === 'undefined') return base;
  let set = sets.get(materials);
  if (!set) { set = { tex: new Map(), mats: new Map() }; sets.set(materials, set); }
  const pack = opts.pack ?? packFor(style, color, opts.type);
  const mk = `${style}|${color.toLowerCase()}|${pack}|${opts.cond && hasCond(opts.cond) ? opts.condKey ?? '' : ''}`;
  const cached = set.mats.get(mk);
  if (cached) return cached;
  const size = skinSizeNow(style);
  const tk = `${style}|${pack}|${size}`;
  let tex = set.tex.get(tk);
  if (!tex) {
    try { tex = buildSkinTexture({ ...layout, pack }, size) ?? undefined; } catch { tex = undefined; }
    if (!tex) return base;
    set.tex.set(tk, tex);
  }
  const bm = base as THREE.MeshPhysicalMaterial;
  const m = new SkinCarPaint(bm);
  m.copy(bm);
  m.base = bm;
  m.map = tex;
  const nm = tex.userData.normal as THREE.DataTexture | undefined;
  if (nm) { m.normalMap = nm; m.normalScale.set(0.7, 0.7); m.roughnessMap = null; } // panel lines (uv1); the paint's flake maps sat on the unused uv0
  m.name = `carSkin:${style}:${color}`;
  m.setCond(opts.cond ?? NO_COND);
  m.needsUpdate = true;
  set.mats.set(mk, m);
  return m;
}
