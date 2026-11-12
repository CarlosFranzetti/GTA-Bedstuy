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
import { DETAIL_GLSL, detailAtlasTexture } from '@/textures/detailAtlas';
import { ASPHALT_GLSL, PAINT_GLSL, SIDEWALK_GLSL, STREET_HELPERS_GLSL } from '@/textures/streetShader';

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
  paint: { tone: 0.24, grime: 0.55, wear: 0.62 },
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

/**
 * Multiplies a CC0 grime map into the albedo of a wall material near the ground: full strength at the base, gone by
 * about 1.6 m. World-space mapping (x + z along the wall, y up), so it needs no UVs and works with the baked vertex AO.
 */
export function patchWallGrime(m: THREE.MeshStandardMaterial, grime: THREE.Texture): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.tWallGrime = { value: grime };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWallGrimeW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallGrimeW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWallGrimeW;\nuniform sampler2D tWallGrime;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float wgMask = 1.0 - smoothstep( 0.15, 1.6, vWallGrimeW.y );
  float wgTone = dot( texture2D( tWallGrime, vec2( vWallGrimeW.x + vWallGrimeW.z, vWallGrimeW.y ) * 0.37 ).rgb, vec3( 0.3333 ) );
  diffuseColor.rgb *= mix( 1.0, 0.5 + 0.8 * wgTone, wgMask * 0.65 );
}`);
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|wallgrime1`;
  m.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------- ground detail (TEXVAR)

export type GroundDetail = 'asphalt' | 'concrete' | 'paint' | 'curb' | 'bluestone';

/**
 * Hard-edged, world-space and road-space features on top of the soft field (TEXVAR, reworked by ROADS): asphalt with quiet
 * tone, wheel paths, gutter silt, utility cuts, sealed cracks, stop-line oil, plates and manholes; slab-by-slab sidewalks
 * (and bluestone flags) with cracks, gum and kerb silt; chipped and repainted lane paint; yellow and red painted curb
 * sections. Asphalt and sidewalks read the per-vertex info of roadInfo.ts. A pure function of position, so every tier shows
 * the same streets. The block bodies live in streetShader.ts.
 */
export function patchGroundDetail(m: THREE.MeshStandardMaterial, kind: GroundDetail): void {
  if ((import.meta as { env?: Record<string, string> }).env?.VITE_TEXVAR === '0') return;
  const id = { asphalt: 1, concrete: 2, paint: 3, curb: 4, bluestone: 5 }[kind];
  // the road / sidewalk info rides in the `color` attribute: take it over (the shader reads vColor, nothing multiplies it in)
  if (id === 1 || id === 2 || id === 5) m.vertexColors = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.tDetail = { value: detailAtlasTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGdW;\nvarying vec2 vGdUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGdW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvGdUv = uv;');
    const body = id === 1 ? ASPHALT_GLSL : id === 2 || id === 5 ? SIDEWALK_GLSL : id === 3 ? PAINT_GLSL : `
float cs = floor( ( gw.x + gw.y ) / 11.0 ); float chh = gdHash( vec2( cs, 61.0 ) );
vec3 cp = chh < 0.12 ? vec3( 0.62, 0.45, 0.04 ) : chh < 0.17 ? vec3( 0.5, 0.06, 0.05 ) : vec3( 0.0 );
if ( cp.r > 0.0 ) diffuseColor.rgb = mix( diffuseColor.rgb, cp * ( 0.6 + gdLum * 1.2 ), 0.88 );`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGdW;
varying vec2 vGdUv;
float gdHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float gdNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gdHash( i ), gdHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gdHash( i + vec2( 0.0, 1.0 ) ), gdHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
${STREET_HELPERS_GLSL}
${DETAIL_GLSL}
${id === 5 ? '#define GD_FLAG\n#define GD_UVM_X 2.7\n#define GD_UVM_Y 3.0' : '#define GD_UVM_X 3.0\n#define GD_UVM_Y 3.0'}`)
      // the road info is read from vColor, so the stock vertex-colour multiply must not run
      .replace('#include <color_fragment>', '')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 gw = vGdW.xz;
  float gdLum = dot( diffuseColor.rgb, vec3( 0.3333 ) );
  ${body}
}`);
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|gdetail3-${id}`;
  m.needsUpdate = true;
}

export const GROUND_DETAIL_KEYS: Readonly<Record<string, GroundDetail>> = {
  asphalt: 'asphalt', asphaltWorn: 'asphalt', concrete: 'concrete', bluestone: 'bluestone', laneLine: 'paint', crosswalk: 'paint', graniteCurb: 'curb',
};
