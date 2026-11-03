/**
 * World-space albedo variation for the ground (ART): the 3 m tiling textures repeat, so on their own every road and
 * sidewalk cell looks the same. This adds a non-repeating layer on top: a periodic 256 px field (R = tone, G = grime /
 * stain, B = wear) sampled by world position at two scales (about 80 m and 14 m), applied to the albedo of asphalt,
 * concrete, bluestone, lane lines and the crosswalk. Result: lighter and darker patches from cell to cell, brown-grey
 * stains, oil-dark blotches on the road, and lane paint that fades unevenly. It is a pure function of world position
 * (no per-frame state), so every tier shows the same streets.
 */
import * as THREE from 'three';
import { Rng } from '@/core/Rng';

export const VARIATION_SIZE = 256;
/** world metres covered by one repeat of the field at the large / small scale */
export const VARIATION_LARGE_M = 84;
export const VARIATION_SMALL_M = 14;

function periodicNoise(size: number, cells: number, rng: Rng): Float32Array {
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  const out = new Float32Array(size * size);
  const at = (ix: number, iy: number): number => lat[(((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** RGBA8 field, tileable, deterministic for a seed. R tone, G grime, B wear (each 0..255, mean near 128). */
export function variationField(size = VARIATION_SIZE, seed = 'ground-variation'): Uint8Array {
  const rng = new Rng(seed);
  const octave = (cells: number): Float32Array => periodicNoise(size, cells, rng);
  const chan = (): Float32Array => {
    const a = octave(4), b = octave(9), c = octave(21);
    const o = new Float32Array(size * size);
    for (let i = 0; i < o.length; i++) o[i] = a[i] * 0.5 + b[i] * 0.33 + c[i] * 0.17;
    return o;
  };
  const r = chan(), g = chan(), bl = chan();
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // stretch the (naturally centred) noise so patches reach both ends of the range
    const f = (v: number): number => Math.max(0, Math.min(255, Math.round(((v - 0.5) * 2.1 + 0.5) * 255)));
    data[i * 4] = f(r[i]);
    data[i * 4 + 1] = f(g[i]);
    data[i * 4 + 2] = f(bl[i]);
    data[i * 4 + 3] = 255;
  }
  return data;
}

let shared: THREE.DataTexture | null = null;

/** The shared field texture (one per page). */
export function variationTexture(): THREE.DataTexture {
  if (!shared) {
    const t = new THREE.DataTexture(variationField(), VARIATION_SIZE, VARIATION_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    shared = t;
  }
  return shared;
}

export function disposeVariationTexture(): void { shared?.dispose(); shared = null; }

export interface VariationStrength {
  /** +- tone swing of the albedo (0.3 = +-15 %) */
  tone: number;
  /** how far grimy patches pull toward a brown-grey (0..1) */
  grime: number;
  /** how dark the oil / wear blotches get (0..1) */
  wear: number;
}

export const GROUND_VARIATION: Record<'asphalt' | 'concrete' | 'paint', VariationStrength> = {
  asphalt: { tone: 0.34, grime: 0.35, wear: 0.38 },
  concrete: { tone: 0.3, grime: 0.5, wear: 0.22 },
  paint: { tone: 0.2, grime: 0.55, wear: 0.5 },
};

/** Albedo multiplier (r, g, b) the shader computes for a field sample (mirrors the GLSL, used by the tests). */
export function variationFactor(sampleLarge: readonly [number, number, number], sampleSmall: readonly [number, number, number], s: VariationStrength): [number, number, number] {
  const tone = 1 + (sampleLarge[0] - 0.5) * s.tone * 1.0 + (sampleSmall[0] - 0.5) * s.tone * 0.65;
  const st = Math.max(0, Math.min(1, (sampleLarge[1] - 0.55) / 0.4)) ** 2 * (3 - 2 * Math.max(0, Math.min(1, (sampleLarge[1] - 0.55) / 0.4)));
  const grime = st * s.grime;
  const w = Math.max(0, Math.min(1, (sampleSmall[2] - 0.6) / 0.3));
  const wear = w * w * (3 - 2 * w) * s.wear * 0.45;
  const k = (1 - grime * 0.3) * (1 - wear);
  return [tone * k * (1 - grime * 0.04), tone * k * (1 - grime * 0.13), tone * k * (1 - grime * 0.26)];
}

/** Patches a standard material so its albedo follows the field. Chains with any existing onBeforeCompile (Weather's wet shader). */
export function patchGroundVariation(m: THREE.MeshStandardMaterial, strength: VariationStrength): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.tArtVar = { value: variationTexture() };
    shader.uniforms.artVarTone = { value: strength.tone };
    shader.uniforms.artVarGrime = { value: strength.grime };
    shader.uniforms.artVarWear = { value: strength.wear };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArtVarW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArtVarW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vArtVarW;
uniform sampler2D tArtVar;
uniform float artVarTone;
uniform float artVarGrime;
uniform float artVarWear;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 avL = texture2D( tArtVar, vArtVarW.xz * ${(1 / VARIATION_LARGE_M).toFixed(6)} ).rgb;
  vec3 avS = texture2D( tArtVar, vArtVarW.xz * ${(1 / VARIATION_SMALL_M).toFixed(6)} + vec2( 0.37, 0.11 ) ).rgb;
  float avTone = 1.0 + ( avL.r - 0.5 ) * artVarTone + ( avS.r - 0.5 ) * artVarTone * 0.65;
  float avGrime = smoothstep( 0.0, 1.0, clamp( ( avL.g - 0.55 ) / 0.4, 0.0, 1.0 ) ) * artVarGrime;
  float avWear = smoothstep( 0.0, 1.0, clamp( ( avS.b - 0.6 ) / 0.3, 0.0, 1.0 ) ) * artVarWear * 0.45;
  diffuseColor.rgb *= avTone * ( 1.0 - avGrime * 0.3 ) * ( 1.0 - avWear ) * vec3( 1.0 - avGrime * 0.04, 1.0 - avGrime * 0.13, 1.0 - avGrime * 0.26 );
}`);
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|artvar1`;
  m.needsUpdate = true;
}
