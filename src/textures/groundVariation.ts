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

export type GroundDetail = 'asphalt' | 'concrete' | 'paint' | 'curb';

/**
 * Hard-edged, world-space features on top of the soft field: concrete slabs poured at different times, patches,
 * cracks and gum spots on sidewalks; asphalt repair patches, utility trench cuts and oil stains; faded vs fresh lane
 * paint; yellow and red painted curb sections. A pure function of world position, so every tier shows the same streets.
 */
export function patchGroundDetail(m: THREE.MeshStandardMaterial, kind: GroundDetail): void {
  if ((import.meta as { env?: Record<string, string> }).env?.VITE_TEXVAR === '0') return;
  const id = { asphalt: 1, concrete: 2, paint: 3, curb: 4 }[kind];
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.tDetail = { value: detailAtlasTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGdW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGdW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGdW;
float gdHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float gdNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gdHash( i ), gdHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gdHash( i + vec2( 0.0, 1.0 ) ), gdHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float gdRect( vec2 pf, vec4 r ) { vec2 q = step( r.xy, pf ) * step( pf, r.xy + r.zw ); return q.x * q.y; }
${DETAIL_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 gw = vGdW.xz;
  float gdLum = dot( diffuseColor.rgb, vec3( 0.3333 ) );
  #if ${id} == 1
    vec2 pc = gw / 7.0; vec2 pi = floor( pc ); float ph = gdHash( pi + 11.0 );
    if ( ph > 0.86 ) {
      vec4 r = vec4( gdHash( pi + 1.3 ) * 0.3, gdHash( pi + 2.9 ) * 0.3, 0.3 + gdHash( pi + 4.1 ) * 0.4, 0.2 + gdHash( pi + 5.7 ) * 0.3 );
      diffuseColor.rgb *= mix( 1.0, ph > 0.93 ? 0.6 : 1.22, gdRect( fract( pc ), r ) );
    }
    vec2 tc = gw / 41.0; vec2 ti = floor( tc ); float th = gdHash( ti + 3.0 );
    if ( th > 0.8 ) {
      bool alongX = gdHash( ti + 8.0 ) > 0.5;
      float across = alongX ? fract( tc.y ) * 41.0 : fract( tc.x ) * 41.0;
      float along = alongX ? fract( tc.x ) * 41.0 : fract( tc.y ) * 41.0;
      float c0 = 6.0 + gdHash( ti + 9.0 ) * 28.0; float a0 = gdHash( ti + 10.0 ) * 18.0;
      float d = abs( across - c0 );
      float run = step( a0, along ) * step( along, a0 + 8.0 + gdHash( ti + 12.0 ) * 12.0 );
      diffuseColor.rgb *= 1.0 - run * ( 1.0 - smoothstep( 0.38, 0.42, d ) ) * 0.4;
      diffuseColor.rgb *= 1.0 + run * ( smoothstep( 0.38, 0.42, d ) - smoothstep( 0.5, 0.56, d ) ) * 0.28;
    }
    vec2 kc = gw / 29.0; vec2 ki = floor( kc ); float kh = gdHash( ki + 71.0 );
    if ( kh > 0.82 ) {
      // Belgian block showing through worn asphalt
      vec4 kr = vec4( 0.15 + gdHash( ki + 1.1 ) * 0.3, 0.15 + gdHash( ki + 2.2 ) * 0.3, 0.2 + gdHash( ki + 3.3 ) * 0.25, 0.1 + gdHash( ki + 4.4 ) * 0.12 );
      vec2 kf = fract( kc ) + ( vec2( gdNoise( gw * 1.3 ), gdNoise( gw * 1.3 + 3.1 ) ) - 0.5 ) * 0.03;
      vec2 ke = min( kf - kr.xy, kr.xy + kr.zw - kf );
      float kedge = min( ke.x, ke.y );
      float km = smoothstep( 0.0, 0.01, kedge );
      vec3 kcol = vec3( 0.42, 0.4, 0.37 ) * dtlGain( 2.0, gw / 2.4, 1.5 ) * ( 0.75 + 0.5 * gdNoise( gw * 0.7 ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, kcol, km * 0.9 );
    }
    vec2 oc = gw / 4.5; vec2 oi = floor( oc ); float oh = gdHash( oi + 21.0 );
    if ( oh > 0.84 ) {
      vec2 ctr = vec2( 0.3 + gdHash( oi + 1.0 ) * 0.4, 0.3 + gdHash( oi + 2.0 ) * 0.4 );
      float rad = 0.12 + gdHash( oi + 3.0 ) * 0.14;
      float ob = length( fract( oc ) - ctr ) + ( gdNoise( gw * 5.0 ) - 0.5 ) * 0.08;
      diffuseColor.rgb *= 1.0 - ( 1.0 - smoothstep( rad * 0.6, rad, ob ) ) * 0.5;
    }
  #elif ${id} == 2
    vec2 sc = gw / 1.5; vec2 si = floor( sc ); float sh = gdHash( si + 5.0 );
    diffuseColor.rgb *= 1.0 + ( sh - 0.5 ) * 0.2;
    if ( sh > 0.9 ) diffuseColor.rgb *= vec3( 1.1, 1.12, 1.15 );
    if ( sh < 0.1 ) diffuseColor.rgb *= vec3( 0.86, 0.82, 0.76 );
    vec2 pc = gw / 6.0; vec2 pi = floor( pc ); float ph = gdHash( pi + 31.0 );
    if ( ph > 0.88 ) {
      // re-poured slab section: warped soft edge, a tone shift that keeps the slab texture, a dark joint line at the edge
      vec4 r = vec4( gdHash( pi + 1.3 ) * 0.3, gdHash( pi + 2.9 ) * 0.3, 0.3 + gdHash( pi + 4.1 ) * 0.4, 0.3 + gdHash( pi + 5.7 ) * 0.5 );
      vec2 pf = fract( pc ) + ( vec2( gdNoise( gw * 2.1 ), gdNoise( gw * 2.1 + 7.3 ) ) - 0.5 ) * 0.04;
      vec2 pe = min( pf - r.xy, r.xy + r.zw - pf );
      float pedge = min( pe.x, pe.y );
      float pm = smoothstep( 0.0, 0.015, pedge );
      float pseam = step( 0.0, pedge ) * ( 1.0 - smoothstep( 0.004, 0.014, pedge ) );
      vec3 ptone = ph > 0.95 ? vec3( 0.84, 0.82, 0.78 ) : vec3( 1.1, 1.1, 1.12 );
      diffuseColor.rgb *= mix( vec3( 1.0 ), ptone, pm ) * ( 1.0 - 0.35 * pseam );
    }
    // old paving showing through: stone-block patches in the asphalt are in the asphalt branch
    float crack = 1.0 - smoothstep( 0.0, 0.014, abs( gdNoise( gw * 1.7 + 4.0 ) - 0.5 ) );
    crack *= smoothstep( 0.55, 0.7, gdNoise( gw * 0.25 ) );
    diffuseColor.rgb *= 1.0 - crack * 0.45;
    vec2 gc = gw / 0.45; vec2 gi = floor( gc );
    if ( gdHash( gi + 41.0 ) > 0.982 ) {
      float gd = length( fract( gc ) - vec2( 0.5 ) );
      diffuseColor.rgb *= 1.0 - ( 1.0 - smoothstep( 0.05, 0.1, gd ) ) * 0.5;
    }
  #elif ${id} == 3
    vec2 fc = floor( gw / 11.0 ); float fh = gdHash( fc + 51.0 );
    if ( fh > 0.82 ) diffuseColor.rgb *= 1.28;
    else if ( fh < 0.3 ) diffuseColor.rgb *= 0.62 + 0.3 * gdNoise( gw * 3.0 );
  #else
    float cs = floor( ( gw.x + gw.y ) / 11.0 ); float chh = gdHash( vec2( cs, 61.0 ) );
    vec3 cp = chh < 0.12 ? vec3( 0.62, 0.45, 0.04 ) : chh < 0.17 ? vec3( 0.5, 0.06, 0.05 ) : vec3( 0.0 );
    if ( cp.r > 0.0 ) diffuseColor.rgb = mix( diffuseColor.rgb, cp * ( 0.6 + gdLum * 1.2 ), 0.88 );
  #endif
}`);
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|gdetail2-${id}`;
  m.needsUpdate = true;
}

export const GROUND_DETAIL_KEYS: Readonly<Record<string, GroundDetail>> = {
  asphalt: 'asphalt', asphaltWorn: 'asphalt', concrete: 'concrete', bluestone: 'concrete', laneLine: 'paint', crosswalk: 'paint', graniteCurb: 'curb',
};
