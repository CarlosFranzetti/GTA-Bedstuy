/**
 * TEXTURES2: the facade of the far massing (the `buildings-far:*` box meshes of buildingStream.ts).
 *
 * Before, a far building was a flat box in one colour from a five-colour table, with a dark roof: cream and pink slabs that
 * stood out as soon as the player could see one (at the start and after a fast drive, a near chunk takes seconds to build and the
 * box shows in its place, 60 m away and closer). Now the box carries what a detailed building would show at that distance, drawn
 * in the fragment shader from per-vertex data of the lot, so it costs no texture, no draw call and no triangle:
 *   - the wall colour is the detailed building's own colourway colour (`lotColourway`, observed look and shop re-purposing
 *     included), so the switch to detail does not change the colour of the block;
 *   - window rows by the lot's floor count (parlour 3.3 m, then 2.9 m storeys, the numbers the generators use), bays by width,
 *     a door and a plinth on a house, a shop band (dark glass, bulkhead, awning colour) on a lot with a shop, a cornice line;
 *   - a roof with tar, silver coat, patches and a bulkhead or skylight;
 *   - at night each window is lit by the same rule as the detailed windows (about 40 percent, amber / warm white / pale / TV blue;
 *     the strength follows the window material's own night intensity).
 * Brick joints and fine wear fade out with the pixel footprint (`fwidth`), so nothing shimmers at distance.
 *
 * Vertex data (non-indexed, 30 vertices per building, 10 triangles as before):
 *   color  (u8x4, linear)  wall colour (roof colour on the roof quad)
 *   aWin   (f32x4)         along-wall metres, height metres (roof: depth metres), lot width, kind (0 plain wall, 1 facade, 2 roof)
 *   aLot   (u8x4)          floors / 32, seed, stoop height / 4, shop flag
 *   aTrim  (u8x4, linear)  cornice colour, roof tone
 *   aAwn   (u8x4, linear)  awning colour (shop band)
 */
import * as THREE from 'three';

export const FAR_KIND = { plain: 0, facade: 1, roof: 2 } as const;
/** parlour / ground floor and every storey above it (facade.ts PARLOUR_H, UPPER_H) */
export const FAR_PARLOUR_H = 3.3;
export const FAR_UPPER_H = 2.9;

const VERT_DECL = `
attribute vec4 aWin;
attribute vec4 aLot;
attribute vec4 aTrim;
attribute vec4 aAwn;
varying vec4 vFWin;
varying vec4 vFLot;
varying vec4 vFTrim;
varying vec4 vFAwn;
`;

const FRAG_DECL = `
varying vec4 vFWin;
varying vec4 vFLot;
varying vec4 vFTrim;
varying vec4 vFAwn;
vec3 gFarGlow = vec3( 0.0 );
float fHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float fNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( fHash( i ), fHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( fHash( i + vec2( 0.0, 1.0 ) ), fHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
vec3 fLamp( float h ) {
  return h < 0.34 ? vec3( 1.0, 0.7, 0.36 ) : h < 0.62 ? vec3( 1.0, 0.86, 0.62 ) : h < 0.78 ? vec3( 0.9, 0.95, 1.0 ) : h < 0.9 ? vec3( 0.42, 0.58, 1.0 ) : h < 0.95 ? vec3( 0.7, 1.0, 0.78 ) : vec3( 1.0, 0.58, 0.78 );
}
`;

const FRAG_MAIN = `
{
  float fs = vFWin.x, fv = vFWin.y, fW = max( vFWin.z, 1.0 );
  float fKind = vFWin.w;
  float fSeed = vFLot.y;
  float fPix = fwidth( fs ) + fwidth( fv );
  float fFine = 1.0 - smoothstep( 0.05, 0.25, fPix ); // joints and speckle fade out with distance
  float fMid = 1.0 - smoothstep( 0.4, 1.6, fPix );     // window frames and roof patches fade into the mean colour a little later
  vec3 fBase = diffuseColor.rgb;
  if ( fKind < 1.5 ) {
    // wall: macro tint and wear over the lot, brick courses, damp plinth, soot under the cornice
    float floors = floor( vFLot.x * 32.0 + 0.5 );
    float bh = vFLot.z * 4.0;
    float H = bh + 3.3 + max( floors - 1.0, 0.0 ) * 2.9;
    float macro = fNoise( vec2( fs, fv ) * 0.23 + fSeed * 31.0 );
    fBase *= 0.9 + 0.2 * macro;
    float course = floor( fv / 0.0765 );
    float brick = fHash( vec2( floor( fs / 0.23 + 0.5 * mod( course, 2.0 ) ), course ) + fSeed * 57.0 );
    fBase *= 1.0 + ( brick - 0.5 ) * 0.14 * fFine;
    fBase *= 1.0 - 0.18 * ( 1.0 - smoothstep( 0.0, 1.0, fv ) );          // splash and damp at the foot
    fBase *= 1.0 - 0.1 * smoothstep( H - 2.2, H, fv ) * ( 0.4 + 0.6 * macro ); // soot under the cornice
    if ( fKind > 0.5 ) {
      bool shop = vFLot.w > 0.5;
      float topP = bh + 3.3;
      float k = fv < topP ? 0.0 : 1.0 + floor( ( fv - topP ) / 2.9 );
      float y0 = k < 0.5 ? bh : topP + ( k - 1.0 ) * 2.9;
      float yl = fv - y0;
      float nb = fW < 4.6 ? 1.0 : fW < 7.8 ? 2.0 : floor( fW / 2.7 + 0.5 );
      float bw = fW / nb;
      float bi = floor( fs / bw );
      float dx = abs( fs - ( bi + 0.5 ) * bw );
      vec3 trim = vFTrim.rgb;
      vec3 glass = vec3( 0.0 );
      float inGlass = 0.0, inFrame = 0.0, lit = 0.0;
      float litP = 0.4;
      float cellSeed = fHash( vec2( bi + 3.0 * k, k + fSeed * 40.0 ) );
      if ( k < 0.5 && shop ) {
        // shopfront: bulkhead, glass between two piers, awning, sign band
        float inX = step( 0.45, fs ) * step( fs, fW - 0.45 );
        float shopBand = step( 0.4, yl ) * step( yl, 2.5 ) * inX;
        inGlass = shopBand;
        inFrame = inX * step( 0.3, yl ) * step( yl, 2.62 ) * ( 1.0 - shopBand );
        glass = vec3( 0.07, 0.065, 0.06 ) * ( 0.7 + 0.6 * cellSeed );
        litP = 0.88;
        float awn = step( 2.62, yl ) * step( yl, 3.1 ) * step( 0.2, fs ) * step( fs, fW - 0.2 );
        vec3 awnC = vFAwn.rgb * ( 0.85 + 0.15 * step( 0.5, fract( fs * 1.6 ) ) * fMid );
        fBase = mix( fBase, awnC, awn );
        float signB = step( 3.1, yl ) * step( yl, 3.3 ) * step( 0.2, fs ) * step( fs, fW - 0.2 );
        fBase = mix( fBase, vec3( 0.07, 0.065, 0.06 ), signB * 0.8 );
        fBase = mix( fBase, fBase * 0.55, step( yl, 0.4 ) * inX ); // tile bulkhead
      } else {
        float wy0 = k < 0.5 ? 0.75 : 0.6;
        float wy1 = k < 0.5 ? 2.75 : 2.35;
        float ddx = dx;
        // door on a house: at one end, its own bay
        bool doorBay = k < 0.5 && ( fSeed < 0.5 ? bi < 0.5 : bi > nb - 1.5 );
        if ( doorBay ) {
          float door = step( dx, 0.55 ) * step( 0.0, yl ) * step( yl, 2.25 );
          fBase = mix( fBase, trim * 0.35, step( dx, 0.7 ) * step( 0.0, yl ) * step( yl, 2.4 ) * fMid );
          fBase = mix( fBase, vec3( 0.03, 0.025, 0.025 ) + 0.05 * vec3( cellSeed, cellSeed * 0.5, 0.0 ), door );
          ddx = 9.0;
        }
        float wx = step( ddx, 0.55 );
        float wyy = step( wy0, yl ) * step( yl, wy1 );
        inGlass = wx * wyy;
        float fx = step( ddx, 0.68 ), fyy = step( wy0 - 0.14, yl ) * step( yl, wy1 + 0.2 );
        inFrame = fx * fyy * ( 1.0 - inGlass );
        float blind = step( 0.82, cellSeed ) * step( yl, wy1 - 0.2 );
        glass = mix( vec3( 0.05, 0.058, 0.07 ) * ( 0.6 + 1.2 * fHash( vec2( bi, k ) + fSeed * 9.0 ) ), vec3( 0.22, 0.21, 0.19 ), blind * 0.8 );
        glass += vec3( 0.03, 0.04, 0.055 ) * smoothstep( wy0, wy1, yl ); // sky in the upper glass
        litP = 0.4;
      }
      fBase = mix( fBase, mix( fBase, trim, 0.85 ), inFrame * fMid );
      fBase = mix( fBase, glass, inGlass );
      // night: the same rule as the detailed windows (windowShader.ts): about 40 percent lit, amber to pale, TV blue now and then
      float nl = step( fHash( vec2( bi * 1.7 + k * 5.3, fSeed * 61.0 + k ) ), litP ) * inGlass;
      float tone = fHash( vec2( bi * 3.1 + 0.5, k * 2.3 + fSeed * 13.0 ) );
      gFarGlow = fLamp( tone ) * nl * ( k < 0.5 && shop ? 0.4 : 0.7 );
      // cornice line, parapet shadow
      float corn = step( H - 0.5, fv );
      fBase = mix( fBase, trim * 0.95, corn );
      fBase *= 1.0 - 0.28 * step( H - 0.62, fv ) * step( fv, H - 0.5 );
      // stoop house plinth: the raised basement below the parlour floor reads as darker masonry
      fBase = mix( fBase, fBase * 0.78, step( fv, bh ) * step( 0.1, bh ) );
    }
  } else {
    // roof: tar or silver coat with patches, a bulkhead or skylight, a lighter parapet line along the front
    float roofPatch = fNoise( vec2( fs, fv ) * 0.35 + fSeed * 17.0 );
    float tone = vFTrim.a;
    fBase *= 0.85 + 0.3 * roofPatch * ( 0.4 + 0.6 * fMid );
    vec2 bc = floor( vec2( fs, fv ) / 6.0 );
    float bl = fHash( bc + fSeed * 23.0 );
    vec2 bf = fract( vec2( fs, fv ) / 6.0 );
    float blk = step( 0.8, bl ) * step( 0.25, bf.x ) * step( bf.x, 0.6 ) * step( 0.25, bf.y ) * step( bf.y, 0.6 );
    fBase = mix( fBase, fBase * 1.7 + 0.03, blk * fMid );
    fBase = mix( fBase, vec3( 0.18, 0.2, 0.22 ), step( 0.93, bl ) * step( 0.3, bf.x ) * step( bf.x, 0.5 ) * step( 0.3, bf.y ) * step( bf.y, 0.5 ) * fMid );
    fBase *= 0.9 + 0.2 * tone;
    float edge = min( fs, fW - fs );
    fBase = mix( fBase, fBase * 1.35, step( edge, 0.3 ) * fMid );
  }
  diffuseColor.rgb = fBase;
}
`;

/** The material of every far massing mesh: standard lighting, vertex colour, the procedural facade above. `night` follows the window glass. */
export function makeFarMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 });
  m.name = 'buildings-far';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFWin = aWin; vFLot = aLot; vFTrim = aTrim; vFAwn = aAwn;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_MAIN}`)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= gFarGlow;');
  };
  m.customProgramCacheKey = () => 'buildings-far1';
  return m;
}

/** A default for attributes a far geometry might lack (a test stub, an older cache): zero alpha everywhere = plain wall. */
export const FAR_ATTRIBUTES = ['aWin', 'aLot', 'aTrim', 'aAwn'] as const;
