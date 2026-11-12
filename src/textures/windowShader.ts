/**
 * Window life in the shader (FACADES). Every window quad of a lot carries a per-window seed in the `aStyle` vertex attribute
 * (baked by `LotBatch.flush`, facade.ts), so one shared glass material (one draw call per variant, as before) shows a different
 * room behind every pane: open and dark, slatted blind at a random height, curtains drawn in one of eight fabrics, sheers, a
 * pulled shade, foil or board over the glass. At night the same seed decides whether the room is lit, in which tone (amber lamp,
 * warm white, pale tube, blue television light, rarely green or pink), and how the light falls (blinds and curtains glow as
 * fabric, open glass shows a lamp pool). The canvas paints the frame, sash lines, the reveal bevel and the sky reflection;
 * its emissive map carries the glass mask in R. Tiled quads (`ru` > 1, ground-floor strips) get a new seed per tile.
 * No lettering. The television glow is a static blue-white (no clock reaches the shader).
 */
import * as THREE from 'three';

const WIN_VERT = `attribute vec4 aStyle;
varying vec3 vWinSeed;`;

const WIN_FRAG_DECL = `varying vec3 vWinSeed;
float gWinGlow = 0.0;
vec3 gWinTone = vec3( 1.0 );
float wnHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float wnNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wnHash( i ), wnHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wnHash( i + vec2( 0.0, 1.0 ) ), wnHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
vec3 wnPal( float h ) {
  h = fract( h ) * 8.0;
  vec3 c = h < 1.0 ? vec3( 0.54, 0.29, 0.29 ) : h < 2.0 ? vec3( 0.29, 0.42, 0.54 ) : h < 3.0 ? vec3( 0.55, 0.48, 0.29 ) : h < 4.0 ? vec3( 0.36, 0.29, 0.42 )
    : h < 5.0 ? vec3( 0.29, 0.48, 0.37 ) : h < 6.0 ? vec3( 0.69, 0.6, 0.47 ) : h < 7.0 ? vec3( 0.85, 0.82, 0.76 ) : vec3( 0.22, 0.24, 0.27 );
  return pow( c, vec3( 2.2 ) );
}
vec3 wnLampCol( float h ) {
  // amber, warm white, pale tube, television blue, green, pink
  return h < 0.34 ? vec3( 1.0, 0.7, 0.36 ) : h < 0.62 ? vec3( 1.0, 0.86, 0.62 ) : h < 0.78 ? vec3( 0.9, 0.95, 1.0 ) : h < 0.9 ? vec3( 0.42, 0.58, 1.0 ) : h < 0.95 ? vec3( 0.7, 1.0, 0.78 ) : vec3( 1.0, 0.58, 0.78 );
}`;

/** Runs after `map_fragment`: reads the painted frame / glass, replaces the glass pixels with the room behind them. */
const WIN_MAIN = `
if ( vWinSeed.z > 0.002 ) {
  vec2 wnT = floor( vMapUv );
  float wnA = wnHash( vWinSeed.xy * 17.0 + wnT * vec2( 1.7, 3.1 ) + 0.13 );
  float wnB = wnHash( vWinSeed.yx * 23.0 + wnT * vec2( 2.9, 1.3 ) + 0.57 );
  float wnC = wnHash( vWinSeed.xy * 31.0 + wnT * vec2( 4.1, 2.3 ) + 0.91 );
  float wnD = wnHash( vWinSeed.yx * 41.0 + wnT * vec2( 3.3, 5.1 ) + 0.29 );
  float wnE = wnHash( vWinSeed.xy * 53.0 + wnT * vec2( 5.3, 2.7 ) + 0.71 );
  float wnMask = texture2D( emissiveMap, vEmissiveMapUv ).r;
  vec2 wf = fract( vMapUv );
  vec2 gp = clamp( vec2( ( wf.x - 0.09 ) / 0.82, ( wf.y - 0.17 ) / 0.74 ), 0.0, 1.0 );
  vec3 wnRefl = diffuseColor.rgb;
  float wnRoomN = wnNoise( gp * vec2( 5.0, 4.0 ) + wnB * 20.0 );
  vec3 wnRoom = pow( vec3( 0.12, 0.115, 0.11 ) * ( 0.5 + 0.9 * wnB ), vec3( 2.2 ) ) * ( 0.6 + 0.9 * wnRoomN );
  wnRoom += vec3( 0.03, 0.027, 0.022 ) * smoothstep( 0.8, 0.9, gp.y ) * wnC;
  vec3 wnIn = wnRoom;
  float wnLitP = 0.35;
  float wnFabric = 0.0;
  float wnLamp = 0.0;
  float wnReflK = 0.5;
  if ( wnA < 0.26 ) {
    wnLamp = 1.0; wnLitP = 0.34; wnReflK = 0.5;
  } else if ( wnA < 0.5 ) {
    float wnDrop = 0.2 + 0.75 * wnB;
    float wnIs = step( 1.0 - wnDrop, gp.y );
    float wnSl = 0.86 + 0.14 * step( 0.5, fract( gp.y * 30.0 ) );
    vec3 wnBc = wnC < 0.45 ? vec3( 0.82, 0.8, 0.74 ) : wnC < 0.7 ? vec3( 0.72, 0.64, 0.5 ) : wnC < 0.85 ? vec3( 0.5, 0.52, 0.55 ) : vec3( 0.3, 0.22, 0.17 );
    vec3 wnBlind = pow( wnBc, vec3( 2.2 ) ) * wnSl * ( 0.85 + 0.2 * wnNoise( gp * vec2( 3.0, 40.0 ) ) );
    float wnBar = smoothstep( 0.035, 0.0, abs( gp.y - ( 1.0 - wnDrop ) ) ) * wnIs;
    wnIn = mix( wnRoom, wnBlind * ( 1.0 - 0.45 * wnBar ), wnIs );
    wnFabric = wnIs; wnLamp = 1.0 - wnIs; wnLitP = 0.55; wnReflK = mix( 0.4, 0.1, wnIs );
  } else if ( wnA < 0.72 ) {
    float wnW = 0.28 + 0.2 * wnB;
    float wnCx = min( gp.x, 1.0 - gp.x );
    float wnIs = 1.0 - smoothstep( wnW - 0.03, wnW, wnCx );
    float wnFold = 0.78 + 0.22 * sin( gp.x * 44.0 + wnC * 6.0 ) * sin( gp.y * 3.0 + 1.0 );
    vec3 wnCol = wnPal( wnC ) * wnFold * ( 0.85 + 0.25 * wnNoise( gp * vec2( 20.0, 3.0 ) ) );
    wnIn = mix( wnRoom, wnCol, wnIs );
    wnIn = mix( wnIn, vec3( 0.02 ), smoothstep( 0.965, 0.985, gp.y ) );
    wnFabric = wnIs; wnLamp = 1.0 - wnIs; wnLitP = 0.6; wnReflK = mix( 0.4, 0.1, wnIs );
  } else if ( wnA < 0.85 ) {
    float wnFold = 0.85 + 0.15 * sin( gp.x * 30.0 + wnB * 6.0 );
    vec3 wnSheer = pow( vec3( 0.86, 0.85, 0.8 ), vec3( 2.2 ) ) * wnFold;
    wnIn = mix( wnRoom, wnSheer, 0.5 + 0.2 * wnB );
    wnFabric = 0.7; wnLitP = 0.62; wnReflK = 0.2;
  } else if ( wnA < 0.93 ) {
    float wnDrop = 0.45 + 0.55 * wnB;
    float wnIs = step( 1.0 - wnDrop + 0.04 * sin( gp.x * 6.0 ), gp.y );
    vec3 wnSh = pow( vec3( 0.84, 0.78, 0.6 ), vec3( 2.2 ) ) * ( 0.92 + 0.12 * wnNoise( gp * 6.0 ) );
    wnIn = mix( wnRoom, wnSh, wnIs );
    wnFabric = wnIs; wnLamp = 1.0 - wnIs; wnLitP = 0.45; wnReflK = mix( 0.4, 0.12, wnIs );
  } else {
    vec3 wnFoil = wnC < 0.5 ? vec3( 0.55, 0.56, 0.58 ) * ( 0.8 + 0.4 * wnNoise( gp * vec2( 14.0, 9.0 ) ) ) : vec3( 0.36, 0.26, 0.17 ) * ( 0.85 + 0.3 * wnNoise( gp * vec2( 4.0, 30.0 ) ) );
    wnIn = pow( wnFoil, vec3( 2.2 ) );
    wnLitP = 0.0; wnReflK = wnC < 0.5 ? 0.6 : 0.05;
  }
  float wnDepth = max( smoothstep( 0.86, 1.0, gp.y ) * 0.55, max( smoothstep( 0.12, 0.0, gp.x ) * 0.4, smoothstep( 0.9, 1.0, gp.x ) * 0.15 ) );
  wnIn *= 1.0 - wnDepth;
  vec3 wnGlass = mix( wnIn, wnRefl, wnReflK * 0.8 + 0.1 );
  diffuseColor.rgb = mix( diffuseColor.rgb, wnGlass, wnMask );
  float wnLit = step( wnD, wnLitP );
  vec3 wnTone = wnLampCol( wnE );
  float wnTv = step( 0.78, wnE ) * step( wnE, 0.9 );
  float wnPool = wnLamp * ( 0.45 + 0.55 * smoothstep( 0.9, 0.0, length( ( gp - vec2( 0.3 + 0.4 * wnC, 0.82 ) ) * vec2( 1.0, 1.4 ) ) ) );
  vec3 wnFab = mix( wnTone, wnTone * pow( wnPal( wnC ) * 2.2, vec3( 0.7 ) ), 0.6 ) * 0.95;
  vec3 wnG = wnTone * wnPool * 0.8 + wnFab * wnFabric;
  wnG *= 1.0 - wnDepth * 0.5;
  wnG *= mix( 1.0, 0.55 + 0.45 * wnNoise( gp * 5.0 + wnA * 9.0 ), wnTv );
  gWinGlow = wnMask * wnLit;
  gWinTone = wnG;
}`;

/** `totalEmissiveRadiance` for a window: white emissive colour x per-window light x glass mask. */
const WIN_EMISSIVE = `
#ifdef USE_EMISSIVEMAP
  totalEmissiveRadiance *= gWinTone * gWinGlow;
#endif`;

/** Patch a window glass material (map + emissiveMap) with the per-window room shader. Chains with other patches. */
export function patchWindow(m: THREE.MeshStandardMaterial): void {
  if ((import.meta as { env?: Record<string, string> }).env?.VITE_TEXVAR === '0') return;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIN_VERT}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWinSeed = aStyle.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WIN_FRAG_DECL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${WIN_MAIN}`)
      .replace('#include <emissivemap_fragment>', WIN_EMISSIVE);
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|window1`;
  m.needsUpdate = true;
}
