/**
 * Per-building wall variation in the shader (TEXVAR). The shared wall materials (brick, painted brick, brownstone,
 * limestone, stoop, cornice, roll gate, ironwork) read two vertex attributes baked by `LotBatch` from the lot's
 * colourway (src/world/buildings/colourway.ts):
 *   aTone  = target sRGB colour of the surface + paint amount (alpha 0 = leave the material alone)
 *   aStyle = wall kind (x, kind * 32), mortar tone (y), lot seed (z), weathering amount (w)
 * so one mesh and one draw call per material still show a different building on every lot. The photo texture is divided
 * by its own average colour (a very high mip) and multiplied by the target: relief, brick-to-brick spread and mortar
 * lines survive, the hue is the lot's. On top: macro tint, soot, rain streaks, repointed patches, painted-over graffiti
 * rectangles, vinyl siding boards, stucco grain and new-build panel seams. All of it is a function of world position and
 * the lot seed, so every tier shows the same walls.
 */
import * as THREE from 'three';

export const TONE_ATTRIBUTES = ['aTone', 'aStyle'] as const;

/** Build with VITE_TEXVAR=0 to switch the per-lot wall variation and ground detail off (A/B captures). */
export const TEXVAR_ON = (import.meta as { env?: Record<string, string> }).env?.VITE_TEXVAR !== '0';

const VERT_DECL = `attribute vec4 aTone;
attribute vec4 aStyle;
varying vec4 vLtTone;
varying vec4 vLtStyle;
varying vec3 vLtW;
varying vec3 vLtN;`;

const FRAG_DECL = `varying vec4 vLtTone;
varying vec4 vLtStyle;
varying vec3 vLtW;
varying vec3 vLtN;
float gLtGloss = 0.0;
float gLtFlat = 0.0;
float ltHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float ltNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( ltHash( i ), ltHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( ltHash( i + vec2( 0.0, 1.0 ) ), ltHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float ltRect( vec2 pf, vec4 r ) { vec2 q = step( r.xy, pf ) * step( pf, r.xy + r.zw ); return q.x * q.y; }`;

/** The block injected after `map_fragment`; `#USE_MAP` is the only conditional (flat-colour ironwork has no map). */
const FRAG_MAIN = `
if ( vLtTone.a > 0.01 ) {
  float ltKind = floor( vLtStyle.x * 255.0 / 32.0 + 0.5 );
  float ltSeed = vLtStyle.z;
  float ltWx = vLtStyle.w;
  float ltPaint = vLtTone.a;
  vec2 ltDir = normalize( vLtN.xz + vec2( 1e-4 ) );
  float ltS = dot( vLtW.xz, vec2( -ltDir.y, ltDir.x ) );
  float ltY = vLtW.y;
  vec2 ltP = vec2( ltS, ltY );
  vec3 ltTarget = pow( vLtTone.rgb, vec3( 2.2 ) );
  #ifdef USE_MAP
    vec3 ltAvg = textureLod( map, vMapUv, 11.0 ).rgb * diffuse;
    vec3 ltRel = diffuseColor.rgb / max( ltAvg, vec3( 0.02 ) );
  #else
    vec3 ltRel = vec3( 1.0 );
  #endif
  float ltLr = dot( ltRel, vec3( 0.3333 ) );
  vec3 ltChroma = mix( ltRel, vec3( ltLr ), ltPaint * 0.85 );
  ltChroma = vec3( 1.0 ) + ( ltChroma - 1.0 ) * mix( 1.0, 0.7, ltPaint );
  // mortar lines are the bright texels of a brick texture: darker or whiter per lot
  float ltMortar = smoothstep( 1.08, 1.45, ltLr );
  ltChroma *= mix( 1.0, 0.55 + vLtStyle.y * 0.9, ltMortar * step( ltKind, 0.5 ) );
  vec3 ltCol = ltTarget * ltChroma;
  if ( ltKind < 4.5 ) {
    // soot below the roof line, rain streaks, macro tint so long walls never tile
    float ltMac = ltNoise( ltP * vec2( 0.22, 0.16 ) + ltSeed * 40.0 ) * 0.6 + ltNoise( ltP * vec2( 0.9, 0.7 ) + ltSeed * 13.0 ) * 0.4;
    ltCol *= 1.0 + ( ltMac - 0.5 ) * 0.34;
    ltCol *= mix( vec3( 1.04, 1.0, 0.95 ), vec3( 0.96, 1.0, 1.05 ), ltNoise( ltP * 0.08 + ltSeed * 9.0 ) );
    ltCol *= 1.0 - ltWx * smoothstep( 3.0, 16.0, ltY ) * 0.2;
    float ltSt = smoothstep( 0.58, 0.92, ltNoise( vec2( ltS * 3.1, ltY * 0.11 ) + ltSeed * 21.0 ) );
    ltCol *= 1.0 - ltSt * ltWx * 0.2 * ( 0.4 + 0.6 * smoothstep( 1.0, 9.0, ltY ) );
    if ( ltKind < 0.5 || ltKind > 3.5 ) {
      // repointed / patched areas: lighter, flatter masonry in a rectangle of the wall grid
      vec2 ltPc = vec2( ltS / 2.1 + ltSeed * 5.0, ltY / 1.3 );
      vec2 ltPi = floor( ltPc );
      float ltPh = ltHash( ltPi + ltSeed * 31.0 );
      if ( ltPh > 0.94 - 0.06 * ltWx ) {
        vec4 ltR = vec4( ltHash( ltPi + 1.7 ) * 0.3, ltHash( ltPi + 3.1 ) * 0.3, 0.5 + ltHash( ltPi + 5.3 ) * 0.45, 0.4 + ltHash( ltPi + 7.7 ) * 0.5 );
        float ltM = ltRect( fract( ltPc ), ltR );
        vec3 ltFresh = ltTarget * mix( vec3( 1.0 ), ltChroma, 0.35 ) * ( ltPh > 0.97 ? 0.8 : 1.2 );
        ltCol = mix( ltCol, ltFresh, ltM * 0.75 );
      }
    }
    // painted-over graffiti: flat rectangles in a near-match paint on the lower wall
    vec2 ltGc = vec2( ltS / 2.6 + ltSeed * 3.0, ltY / 1.45 );
    vec2 ltGi = floor( ltGc );
    float ltGh = ltHash( ltGi + ltSeed * 57.0 );
    if ( ltY < 3.0 && ltGh > 0.955 - 0.045 * ltWx ) {
      vec4 ltR = vec4( ltHash( ltGi + 2.3 ) * 0.2, ltHash( ltGi + 4.1 ) * 0.2, 0.55 + ltHash( ltGi + 6.7 ) * 0.4, 0.5 + ltHash( ltGi + 8.9 ) * 0.45 );
      float ltM = ltRect( fract( ltGc ), ltR );
      float ltPick = ltHash( ltGi + 9.1 );
      vec3 ltPaintCol = ltPick < 0.25 ? vec3( 0.22 ) : ltPick < 0.5 ? vec3( 0.3, 0.24, 0.16 ) : ltPick < 0.75 ? vec3( 0.2, 0.07, 0.06 ) : vec3( 0.26, 0.3, 0.24 );
      ltCol = mix( ltCol, ltPaintCol * ( 0.85 + 0.3 * ltNoise( ltP * 6.0 ) ), ltM * 0.9 );
    }
  }
  if ( ltKind > 0.5 && ltKind < 1.5 ) {
    // siding boards
    float ltBf = fract( ltY / 0.17 + ltSeed * 3.0 );
    float ltB = 1.0 - 0.26 * ( 1.0 - smoothstep( 0.0, 0.1, ltBf ) ) + 0.06 * smoothstep( 0.1, 0.2, ltBf ) * ( 1.0 - smoothstep( 0.2, 0.4, ltBf ) );
    ltCol = ltTarget * ltB * ( 0.95 + 0.1 * ltNoise( ltP * vec2( 1.5, 30.0 ) ) );
    gLtFlat = 0.85;
  } else if ( ltKind > 1.5 && ltKind < 2.5 ) {
    // stucco grain
    ltCol = ltTarget * ( 0.88 + 0.24 * ltNoise( ltP * 18.0 ) ) * ( 0.95 + 0.1 * ltNoise( ltP * 4.0 ) );
    gLtFlat = 0.7;
  } else if ( ltKind > 2.5 && ltKind < 3.5 ) {
    // new-build panels: 1.2 x 0.6 m with dark seams and a per-panel tone
    vec2 ltPn = vec2( ltS / 1.2 + ltSeed * 7.0, ltY / 0.6 );
    vec2 ltFp = fract( ltPn );
    float ltEdge = min( min( ltFp.x, 1.0 - ltFp.x ) * 1.2, min( ltFp.y, 1.0 - ltFp.y ) * 0.6 );
    float ltSeam = 1.0 - smoothstep( 0.0, 0.012, ltEdge );
    float ltCell = ltHash( floor( ltPn ) + ltSeed * 3.0 );
    ltCol = ltTarget * ( 1.0 - 0.5 * ltSeam ) * ( 1.0 + ( ltCell - 0.5 ) * 0.16 ) * ( ltCell > 0.93 ? 0.8 : 1.0 );
    gLtFlat = 0.95;
    gLtGloss = 0.45;
  } else if ( ltKind > 6.5 ) {
    // striped shop awning: white stripes 12 cm wide
    ltCol = mix( ltCol, vec3( 0.7, 0.68, 0.62 ), step( 0.5, fract( ltS / 0.24 ) ) * 0.85 );
  } else if ( ltKind > 3.5 && ltKind < 4.5 ) {
    gLtGloss = 0.6;
    gLtFlat = 0.4;
  }
  diffuseColor.rgb = ltCol;
}`;

/** Patch a standard material so it follows the per-vertex tone. Chains with other onBeforeCompile patches. */
export function patchLotTone(m: THREE.MeshStandardMaterial): void {
  if (!TEXVAR_ON) return;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLtTone = aTone; vLtStyle = aStyle;
vLtW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vLtN = normalize( mat3( modelMatrix ) * objectNormal );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_MAIN}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.3, gLtGloss );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( mix( normal, nonPerturbedNormal, gLtFlat ) );');
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|lottone1`;
  m.needsUpdate = true;
}

/** Material keys whose cached materials carry the tone patch. */
export const LOT_TONE_KEYS: readonly string[] = ['brickRed', 'brickPainted', 'brownstone', 'limestone', 'stoop', 'cornice', 'rollGate', 'metalDark', 'castIronFence'];
