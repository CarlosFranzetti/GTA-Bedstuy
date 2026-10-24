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

interface PresetParams {
  saturation: number;
  /** S-curve blend amount (0 = identity). */
  curve: number;
  /** Additive zero-luma shadow tint (teal in daylight, deep blue at night). */
  shadowTint: RGB;
  /** Multiplicative highlight tint (warm). Components <= 1 so highlights never clip. */
  highlightMul: RGB;
}

const BLACK_LIFT = 0.02;

const PRESETS: Record<GradePreset, PresetParams> = {
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

const SHADOW_OFFSETS: Record<GradePreset, RGB> = {
  day: zeroLuma(PRESETS.day.shadowTint),
  dusk: zeroLuma(PRESETS.dusk.shadowTint),
  night: zeroLuma(PRESETS.night.shadowTint),
};

/**
 * Maps an sRGB-ish colour to its graded colour. Order: S-curve -> saturation -> black lift ->
 * teal shadows / warm highlights. Output stays in [0, 1]; greys stay monotonic in luminance.
 */
export function gradeColor(rgb: [number, number, number], preset: GradePreset): [number, number, number] {
  const p = PRESETS[preset];
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
  r = BLACK_LIFT + r * (1 - BLACK_LIFT);
  g = BLACK_LIFT + g * (1 - BLACK_LIFT);
  b = BLACK_LIFT + b * (1 - BLACK_LIFT);

  // Teal shadows (additive, zero luma) and warm highlights (multiplicative).
  const l1 = r * LR + g * LG + b * LB;
  const ws = 1 - smoothstep(0.0, 0.5, l1);
  const wh = smoothstep(0.45, 1.0, l1);
  const so = SHADOW_OFFSETS[preset];
  r += so[0] * ws;
  g += so[1] * ws;
  b += so[2] * ws;
  r *= 1 + (p.highlightMul[0] - 1) * wh;
  g *= 1 + (p.highlightMul[1] - 1) * wh;
  b *= 1 + (p.highlightMul[2] - 1) * wh;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * Bakes `gradeColor` into a 32x32x32 RGBA8 3D texture. Texel (x, y, z) holds the grade of
 * (r, g, b) = (x, y, z) / 31, so the shader samples it with the colour as the texture coordinate.
 */
export function buildLut(preset: GradePreset): THREE.Data3DTexture {
  const n = LUT_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  const inv = 1 / (n - 1);
  let i = 0;
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const o = gradeColor([x * inv, y * inv, z * inv], preset);
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

/** Target exposure (relative to the day reference) per preset. */
export const EXPOSURE_BY_PRESET: Record<GradePreset, number> = { day: 1.0, dusk: 1.15, night: 1.35 };
