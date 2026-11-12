/**
 * Riveted, painted steel for the elevated line (FACADES). The `el:steel` material has only vertex colours; this patch adds,
 * in world space and with no UVs and no extra draw calls: plate edges every half metre and vertical splice seams every 1.8 m,
 * each with a row of domed rivets (albedo + a derivative bump), paint that has chalked and flaked in blotches, and rust that
 * weeps from the seams and the lower edges of the girders in long vertical streaks, heavier on upward-facing flanges.
 * A pure function of position: the same on the grid map and the real map.
 */
import * as THREE from 'three';

const VERT = `varying vec3 vElW;
varying vec3 vElN;`;

const FRAG_DECL = `varying vec3 vElW;
varying vec3 vElN;
float elHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float elNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( elHash( i ), elHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( elHash( i + vec2( 0.0, 1.0 ) ), elHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float gElH = 0.0;
float gElRust = 0.0;`;

const MAIN = `
{
  vec3 elN = normalize( vElN );
  vec2 elDir = normalize( elN.xz + vec2( 1e-4 ) );
  float elS = dot( vElW.xz, vec2( -elDir.y, elDir.x ) );
  float elY = vElW.y;
  float elPix = max( max( fwidth( elS ), fwidth( elY ) ), 1e-4 );
  float elVert = 1.0 - smoothstep( 0.55, 0.9, abs( elN.y ) ); // side faces carry the rivet rows
  float elUp = smoothstep( 0.6, 0.95, elN.y );
  // plate courses (0.5 m) and splice seams (1.8 m)
  float elEdgeY = abs( fract( elY / 0.5 ) - 0.5 ) * 0.5;      // metres to the nearest plate edge line (the lines sit at k * 0.5 + 0.25)
  float elSeamP = fract( elS / 1.8 + 0.37 );
  float elSeamD = min( elSeamP, 1.0 - elSeamP ) * 1.8;
  float elLine = 1.0 - smoothstep( 0.004, 0.004 + elPix * 1.2, min( elEdgeY, elSeamD ) );
  // domed rivets along both lines
  vec2 elRc = vec2( elS, elY ) / 0.1;
  vec2 elRf = fract( elRc ) - 0.5;
  float elOnRow = 1.0 - smoothstep( 0.012, 0.03, abs( elEdgeY - 0.04 ) );
  float elOnSeam = 1.0 - smoothstep( 0.012, 0.03, abs( elSeamD - 0.04 ) );
  float elRiv = ( 1.0 - smoothstep( 0.16, 0.26, length( elRf ) ) ) * max( elOnRow, elOnSeam ) * elVert * ( 1.0 - smoothstep( 0.02, 0.05, elPix ) );
  float elDome = elRiv * ( 1.0 - length( elRf ) * 3.0 );
  gElH = 0.004 * max( elDome, 0.0 ) - 0.002 * elLine;
  // paint: chalk and flake blotches, then rust weeping from seams and lower edges
  float elBl = elNoise( vec2( elS, elY ) * 1.3 + 4.0 ) * 0.6 + elNoise( vec2( elS, elY ) * 5.0 ) * 0.4;
  vec3 elBase = diffuseColor.rgb;
  elBase *= 0.82 + 0.36 * elBl;
  elBase = mix( elBase, elBase * 1.25 + 0.02, smoothstep( 0.62, 0.8, elBl ) * 0.4 ); // chalking
  float elWeep = elNoise( vec2( elS * 7.0, elY * 0.35 ) ) * 0.6 + elNoise( vec2( elS * 19.0, elY * 0.8 ) ) * 0.4;
  float elSource = max( elLine * 0.8, elRiv ) + elUp * 0.5 + 0.12 * ( 1.0 - smoothstep( 0.0, 1.6, elY - 5.0 ) );
  float elRust = smoothstep( 0.42, 0.78, elWeep * ( 0.35 + elSource ) + 0.2 * elBl ) * elVert;
  elRust = clamp( elRust + elUp * smoothstep( 0.55, 0.8, elBl ) * 0.6, 0.0, 1.0 );
  vec3 elRustCol = vec3( 0.36, 0.17, 0.07 ) * ( 0.7 + 0.6 * elNoise( vec2( elS, elY ) * 23.0 ) );
  elBase = mix( elBase, elRustCol, elRust * 0.72 );
  elBase *= 1.0 - elLine * 0.35;
  elBase = mix( elBase, elBase * 1.3 + 0.015, elRiv * 0.6 );
  diffuseColor.rgb = elBase;
  gElRust = elRust;
}`;

/** Patch the el steel material (vertex colours, no map). Chains with other patches. */
export function patchElSteel(m: THREE.MeshStandardMaterial): void {
  if ((import.meta as { env?: Record<string, string> }).env?.VITE_TEXVAR === '0') return;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vElW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vElN = normalize( mat3( modelMatrix ) * objectNormal );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${MAIN}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.97, gElRust );')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 elDh = vec2( dFdx( gElH ), dFdy( gElH ) );
  vec3 elSx = dFdx( - vViewPosition ), elSy = dFdy( - vViewPosition );
  vec3 elR1 = cross( elSy, normal ), elR2 = cross( normal, elSx );
  float elDet = dot( elSx, elR1 ) * faceDirection;
  vec3 elGrad = sign( elDet ) * ( elDh.x * elR1 + elDh.y * elR2 );
  normal = normalize( abs( elDet ) * normal - elGrad );
}`);
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|elsteel1`;
  m.needsUpdate = true;
}
