import * as THREE from 'three';

/**
 * GTA-ish colour grade, expressed as a pure function and baked into a 3D LUT.
 *
 * Domain: display-referred, gamma-encoded values in [0, 1]. The grading shader maps the linear HDR
 * buffer into this domain with `pow(c, 1/2.2)` (values above 1 bypass the LUT and are added back
 * afterwards, so highlights keep their HDR energy for bloom/tone mapping).
 */
export type GradePreset = 'day' | 'dusk' | 'night';
export type RGB = [number, number, number];

export const LUT_SIZE = 32;
/** Order used for blending / indexing: day = 0, dusk = 1, night = 2. */
export const GRADE_PRESETS: readonly GradePreset[] = ['day', 'dusk', 'night'];

export interface PresetParams {
  saturation: number;
  /** S-curve blend amount (0 = identity). */
  curve: number;
  /** Additive zero-luma shadow tint (teal in daylight, deep blue at night). */
  shadowTint: RGB;
  /** Multiplicative highlight tint (warm). Components <= 1 so highlights never clip. */
  highlightMul: RGB;
  /** Multiplicative mid-tone tint (peaks at mid luminance); omitted = neutral. Components ~1 so exposure is kept. */
  midMul?: RGB;
  /** Black lift; omitted = BLACK_LIFT. */
  lift?: number;
}

const BLACK_LIFT = 0.02;

export const PRESETS: Record<GradePreset, PresetParams> = {
  day: { saturation: 1.1, curve: 0.3, shadowTint: [-0.018, 0.004, 0.014], highlightMul: [1.0, 0.985, 0.94] },
  dusk: { saturation: 1.05, curve: 0.34, shadowTint: [-0.014, 0.0, 0.016], highlightMul: [1.0, 0.95, 0.84] },
  night: { saturation: 0.95, curve: 0.3, shadowTint: [-0.016, 0.002, 0.02], highlightMul: [0.97, 0.985, 1.0] },
};

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Removes the luminance component of an offset so adding it tints without changing brightness. */
function zeroLuma(v: RGB): RGB {
  const l = v[0] * LR + v[1] * LG + v[2] * LB;
  return [v[0] - l, v[1] - l, v[2] - l];
}

/**
 * Maps an sRGB-ish colour through a parameter set. Order: S-curve -> saturation -> black lift ->
 * teal shadows / mid tint / warm highlights. Output stays in [0, 1]; greys stay monotonic in luminance.
 */
export function gradeWith(rgb: [number, number, number], p: PresetParams): [number, number, number] {
  let r = clamp01(rgb[0]);
  let g = clamp01(rgb[1]);
  let b = clamp01(rgb[2]);

  // Mild S-curve (mix of identity and smoothstep, slope >= 1 - curve > 0 everywhere).
  const sc = (x: number): number => x + p.curve * (x * x * (3 - 2 * x) - x);
  r = sc(r);
  g = sc(g);
  b = sc(b);

  // Saturation around luma.
  const l0 = r * LR + g * LG + b * LB;
  r = l0 + (r - l0) * p.saturation;
  g = l0 + (g - l0) * p.saturation;
  b = l0 + (b - l0) * p.saturation;
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);

  // Lifted blacks.
  const lift = p.lift ?? BLACK_LIFT;
  r = lift + r * (1 - lift);
  g = lift + g * (1 - lift);
  b = lift + b * (1 - lift);

  // Teal shadows (additive, zero luma), mid-tone tint and warm highlights (multiplicative).
  const l1 = r * LR + g * LG + b * LB;
  const ws = 1 - smoothstep(0.0, 0.5, l1);
  const wh = smoothstep(0.45, 1.0, l1);
  const wm = 4 * l1 * (1 - l1); // bell, peak at 0.5
  const so = zeroLuma(p.shadowTint);
  r += so[0] * ws;
  g += so[1] * ws;
  b += so[2] * ws;
  const mm = p.midMul;
  if (mm) {
    r *= 1 + (mm[0] - 1) * wm;
    g *= 1 + (mm[1] - 1) * wm;
    b *= 1 + (mm[2] - 1) * wm;
  }
  r *= 1 + (p.highlightMul[0] - 1) * wh;
  g *= 1 + (p.highlightMul[1] - 1) * wh;
  b *= 1 + (p.highlightMul[2] - 1) * wh;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

/** Three-preset grade (kept for the tier-level presets and the existing tests). */
export function gradeColor(rgb: [number, number, number], preset: GradePreset): [number, number, number] {
  return gradeWith(rgb, PRESETS[preset]);
}

// ---------------------------------------------------------------- per-hour filmic palette

/**
 * Hourly palette following docs/reference/BIBLE.md section 3: cold pre-dawn, cool-to-peach dawn, fresh contrasty
 * morning, flat saturated noon, warm afternoon, the golden-hour look (orange highlights over cool shadows), amber
 * dusk, blue hour and a high-contrast night with sodium highlights over blue shadows. Consecutive keys are blended
 * by `lutKeysForHour` (two baked LUTs crossfaded in the grading shader), the last key wraps to the first.
 */
export const HOUR_KEYS: readonly { name: string; hour: number; params: PresetParams }[] = [
  { name: 'deepNight', hour: 2, params: { saturation: 0.92, curve: 0.44, lift: 0.014, shadowTint: [-0.026, 0.003, 0.04], highlightMul: [1.0, 0.94, 0.8], midMul: [0.96, 0.99, 1.06] } },
  { name: 'preDawn', hour: 4.5, params: { saturation: 0.95, curve: 0.36, shadowTint: [-0.024, 0.004, 0.036], highlightMul: [0.98, 0.97, 0.94], midMul: [0.97, 0.99, 1.05] } },
  { name: 'dawn', hour: 6, params: { saturation: 1.06, curve: 0.34, shadowTint: [-0.02, 0.002, 0.03], highlightMul: [1.0, 0.94, 0.84], midMul: [1.0, 0.99, 1.02] } },
  { name: 'morning', hour: 8, params: { saturation: 1.2, curve: 0.34, shadowTint: [-0.016, 0.004, 0.02], highlightMul: [1.0, 0.96, 0.87], midMul: [1.03, 1.0, 0.96], lift: 0.024 } },
  { name: 'noon', hour: 12, params: { saturation: 1.27, curve: 0.32, shadowTint: [-0.012, 0.004, 0.014], highlightMul: [1.0, 0.972, 0.9], midMul: [1.035, 1.0, 0.95], lift: 0.025 } },
  { name: 'afternoon', hour: 15.5, params: { saturation: 1.26, curve: 0.34, shadowTint: [-0.016, 0.004, 0.018], highlightMul: [1.0, 0.958, 0.86], midMul: [1.04, 1.0, 0.94], lift: 0.024 } },
  { name: 'golden', hour: 17.5, params: { saturation: 1.26, curve: 0.4, shadowTint: [-0.026, -0.002, 0.032], highlightMul: [1.0, 0.89, 0.7], midMul: [1.05, 0.98, 0.9] } },
  { name: 'dusk', hour: 19, params: { saturation: 1.15, curve: 0.4, shadowTint: [-0.02, -0.004, 0.036], highlightMul: [1.0, 0.88, 0.7], midMul: [1.03, 0.97, 0.96] } },
  { name: 'blueHour', hour: 20.3, params: { saturation: 1.02, curve: 0.37, shadowTint: [-0.024, 0.0, 0.038], highlightMul: [1.0, 0.92, 0.8], midMul: [0.95, 0.97, 1.03], lift: 0.016 } },
  { name: 'night', hour: 22.5, params: { saturation: 0.95, curve: 0.44, lift: 0.014, shadowTint: [-0.026, 0.003, 0.04], highlightMul: [1.0, 0.93, 0.78], midMul: [0.96, 0.99, 1.06] } },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

const NEUTRAL: RGB = [1, 1, 1];

export function lerpParams(a: PresetParams, b: PresetParams, t: number): PresetParams {
  return {
    saturation: lerp(a.saturation, b.saturation, t),
    curve: lerp(a.curve, b.curve, t),
    shadowTint: lerpRgb(a.shadowTint, b.shadowTint, t),
    highlightMul: lerpRgb(a.highlightMul, b.highlightMul, t),
    midMul: lerpRgb(a.midMul ?? NEUTRAL, b.midMul ?? NEUTRAL, t),
    lift: lerp(a.lift ?? BLACK_LIFT, b.lift ?? BLACK_LIFT, t),
  };
}

/** Pair of adjacent hour keys around `hour` (wraps at 24) and the smoothed blend `mix` (0 = all `a`, 1 = all `b`). */
export function lutKeysForHour(hour: number): { a: number; b: number; mix: number } {
  const n = HOUR_KEYS.length;
  let h = Number.isFinite(hour) ? hour % 24 : 0;
  if (h < 0) h += 24;
  // Hours before the first key belong to the wrap segment (last key -> first key + 24).
  const first = HOUR_KEYS[0].hour;
  if (h < first) h += 24;
  let i = 0;
  while (i < n - 1 && h >= HOUR_KEYS[i + 1].hour) i++;
  const j = (i + 1) % n;
  const h0 = HOUR_KEYS[i].hour;
  const h1 = j === 0 ? HOUR_KEYS[0].hour + 24 : HOUR_KEYS[j].hour;
  const t = clamp01((h - h0) / (h1 - h0));
  return { a: i, b: j, mix: t * t * (3 - 2 * t) };
}

/** Parameter set the two-LUT crossfade approximates for an hour (the reference the tests and the LUT bake follow). */
export function gradeParamsAt(hour: number): PresetParams {
  const k = lutKeysForHour(hour);
  return lerpParams(HOUR_KEYS[k.a].params, HOUR_KEYS[k.b].params, k.mix);
}

/** Per-hour grade of a colour (analytic, no texture): what the blended LUT converges to. */
export function gradeColorAt(rgb: [number, number, number], hour: number): [number, number, number] {
  return gradeWith(rgb, gradeParamsAt(hour));
}

/**
 * Bakes a grade (a preset name, or an index into `HOUR_KEYS`) into a 32x32x32 RGBA8 3D texture. Texel (x, y, z) holds the grade of
 * (r, g, b) = (x, y, z) / 31, so the shader samples it with the colour as the texture coordinate.
 */
export function buildLut(preset: GradePreset | number): THREE.Data3DTexture {
  const params = typeof preset === 'number' ? HOUR_KEYS[preset].params : PRESETS[preset];
  const n = LUT_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  const inv = 1 / (n - 1);
  let i = 0;
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const o = gradeWith([x * inv, y * inv, z * inv], params);
        data[i++] = Math.round(o[0] * 255);
        data[i++] = Math.round(o[1] * 255);
        data[i++] = Math.round(o[2] * 255);
        data[i++] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, n, n, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Grade preset for an hour of day (0..24): dusk 17:00-19:30 and 05:30-07:00, day between, else night. */
export function presetForHour(hour: number): GradePreset {
  const h = ((hour % 24) + 24) % 24;
  if ((h >= 17 && h < 19.5) || (h >= 5.5 && h < 7)) return 'dusk';
  if (h >= 7 && h < 17) return 'day';
  return 'night';
}

/**
 * Nominal exposure (relative to the day reference) per preset. The pipeline now follows the continuous per-hour
 * time cycle (LightingConfig); these are only the preset-level reference (night used to be 1.35, which clipped
 * anything above scene-linear 0.8 and blew out lamps).
 */
export const EXPOSURE_BY_PRESET: Record<GradePreset, number> = { day: 1.0, dusk: 1.0, night: 0.95 };
