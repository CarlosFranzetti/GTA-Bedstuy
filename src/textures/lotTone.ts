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
import { DETAIL_GLSL, SIGN_COLS, SIGN_ROWS, WALL_SIGNS, detailAtlasTexture, wallSignTexture } from '@/textures/detailAtlas';
import { KIND_STEP, ROOF_SCALE } from '@/world/buildings/colourway';

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
float gLtRoof = 0.0;
float gLtH = 0.0;
float gLtBump = 0.0;
float ltHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float ltNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( ltHash( i ), ltHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( ltHash( i + vec2( 0.0, 1.0 ) ), ltHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float ltSeg( float dg, vec2 p ) {
  int d = int( dg );
  int m = d == 0 ? 63 : d == 1 ? 6 : d == 2 ? 91 : d == 3 ? 79 : d == 4 ? 102 : d == 5 ? 109 : d == 6 ? 125 : d == 7 ? 7 : d == 8 ? 127 : 111;
  float t = 0.07, r = 0.0;
  r = max( r, float( ( m & 1 ) != 0 ) * step( abs( p.y - 0.94 ), t ) * step( abs( p.x - 0.5 ), 0.36 ) );
  r = max( r, float( ( m & 2 ) != 0 ) * step( abs( p.x - 0.9 ), t ) * step( abs( p.y - 0.73 ), 0.2 ) );
  r = max( r, float( ( m & 4 ) != 0 ) * step( abs( p.x - 0.9 ), t ) * step( abs( p.y - 0.27 ), 0.2 ) );
  r = max( r, float( ( m & 8 ) != 0 ) * step( abs( p.y - 0.06 ), t ) * step( abs( p.x - 0.5 ), 0.36 ) );
  r = max( r, float( ( m & 16 ) != 0 ) * step( abs( p.x - 0.1 ), t ) * step( abs( p.y - 0.27 ), 0.2 ) );
  r = max( r, float( ( m & 32 ) != 0 ) * step( abs( p.x - 0.1 ), t ) * step( abs( p.y - 0.73 ), 0.2 ) );
  r = max( r, float( ( m & 64 ) != 0 ) * step( abs( p.y - 0.5 ), t ) * step( abs( p.x - 0.5 ), 0.36 ) );
  return r;
}
float ltRect( vec2 pf, vec4 r ) { vec2 q = step( r.xy, pf ) * step( pf, r.xy + r.zw ); return q.x * q.y; }
uniform sampler2D tSigns;
${DETAIL_GLSL}`;

/** The block injected after `map_fragment`; `#USE_MAP` is the only conditional (flat-colour ironwork has no map). */
const FRAG_MAIN = `
if ( vLtTone.a > 0.01 ) {
  float ltXb = floor( vLtStyle.x * 255.0 + 0.5 );
  float ltKind = floor( ltXb / ${KIND_STEP}.0 );
  float ltPhq = ltXb - ltKind * ${KIND_STEP}.0; // storey phase 0..20, 21 = unknown
  float ltSillPhase = ltPhq > 20.5 ? -1.0 : ltPhq / 20.0 * 2.9;
  #ifdef USE_COLOR_ALPHA
    gLtRoof = vColor.a * ${ROOF_SCALE}.0;
  #endif
  float ltParty = step( 8.5, ltKind ) * step( ltKind, 9.5 );
  if ( ltParty > 0.5 ) ltKind = 0.0;
  float ltSeed = floor( vLtStyle.z * 255.0 + 0.5 ) / 255.0; // snapped: hashing an interpolated byte would speckle
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
  #ifdef LT_STONE
    ltRel = mix( vec3( 1.0 ), ltRel, ltParty > 0.5 ? 1.0 : 0.28 ); // the rubble photo only whispers: the carving is drawn below
  #endif
  float ltLr = dot( ltRel, vec3( 0.3333 ) );
  vec3 ltChroma = mix( ltRel, vec3( ltLr ), ltPaint * 0.85 );
  ltChroma = vec3( 1.0 ) + ( ltChroma - 1.0 ) * mix( 1.0, 0.7, ltPaint );
  // mortar lines are the bright texels of a brick texture: darker or whiter per lot
  float ltMortar = smoothstep( 1.08, 1.45, ltLr );
  ltChroma *= mix( 1.0, 0.55 + vLtStyle.y * 0.9, ltMortar * step( ltKind, 0.5 ) );
  vec3 ltCol = ltTarget * ltChroma;
  if ( ltKind < 4.5 ) {
    // ---- shared by every masonry-like wall: layered macro variation so a five-storey wall never shows its tile
    // two noise octaves, warped so the blotches are not axis aligned, plus a slow hue drift (kiln batches / old repairs)
    vec2 ltWarp = vec2( ltNoise( ltP * 0.31 + ltSeed * 11.0 ), ltNoise( ltP * 0.27 + ltSeed * 23.0 ) ) * 2.2;
    float ltMac = ltNoise( ( ltP + ltWarp ) * vec2( 0.22, 0.16 ) + ltSeed * 40.0 ) * 0.55 + ltNoise( ( ltP + ltWarp ) * vec2( 0.9, 0.7 ) + ltSeed * 13.0 ) * 0.45;
    ltCol *= 1.0 + ( ltMac - 0.5 ) * 0.4;
    float ltBatch = ltNoise( ( ltP + ltWarp ) * vec2( 0.55, 1.15 ) + ltSeed * 77.0 );
    ltCol *= mix( vec3( 1.05, 1.0, 0.94 ), vec3( 0.95, 1.0, 1.06 ), ltBatch ) * ( 0.94 + 0.12 * ltBatch );
    // large-scale stains from the plaster photo (9 m repeat, per-lot offset) so a long wall never tiles
    ltCol *= dtlGain( 0.0, ltP / vec2( 9.0, 7.0 ) + ltSeed * 3.7, 1.7 );
    ltCol *= dtlGain( 0.0, ltP / vec2( 5.3, 4.1 ) + ltSeed * 9.1 + 0.37, 1.1 );
    ltCol *= mix( vec3( 1.04, 1.0, 0.95 ), vec3( 0.96, 1.0, 1.05 ), ltNoise( ltP * 0.08 + ltSeed * 9.0 ) );
    // ---- staining: soot under the cornice, rain runs below the sill line of every storey, damp and salt at the foot
    float ltRoofH = gLtRoof;
    float ltDTop = ltRoofH - ltY;
    float ltSootTop = ltRoofH > 1.0 ? ( 1.0 - smoothstep( 0.0, 2.4 + 2.0 * ltWx, ltDTop ) ) * smoothstep( -0.2, 0.15, ltDTop ) : 0.0;
    float ltRun = ltNoise( vec2( ltS * 4.3, ltY * 0.22 ) + ltSeed * 21.0 ) * 0.6 + ltNoise( vec2( ltS * 11.0, ltY * 0.5 ) + ltSeed * 5.0 ) * 0.4;
    float ltBelowSill = ltSillPhase >= 0.0 ? mod( ltSillPhase - ltY + 2.9 * 8.0, 2.9 ) : 3.0;
    float ltSillRun = ( 1.0 - smoothstep( 0.0, 1.5, ltBelowSill ) ) * smoothstep( 0.46, 0.8, ltRun ) * smoothstep( 1.4, 3.0, ltY );
    float ltStain = clamp( ltSootTop * ( 0.35 + 0.65 * ltRun ) * ( 0.35 + 0.65 * ltWx ) + ltSillRun * ( 0.25 + 0.5 * ltWx ), 0.0, 1.0 );
    ltCol *= 1.0 - ltStain * 0.34;
    ltCol = mix( ltCol, ltCol * vec3( 0.9, 0.94, 1.0 ), ltSillRun * 0.4 ); // runs are cool and grey, not just dark
    ltCol *= 1.0 - ltWx * smoothstep( 3.0, 16.0, ltY ) * 0.12;
    float ltFoot = 1.0 - smoothstep( 0.2, 1.1 + 0.5 * ltNoise( vec2( ltS * 1.7, 3.0 ) + ltSeed * 8.0 ), ltY );
    ltCol *= 1.0 - ltFoot * ltWx * 0.22; // rising damp darkens the first metre
    float ltSalt = smoothstep( 0.6, 0.85, ltNoise( vec2( ltS * 2.3, ltY * 5.5 ) + ltSeed * 31.0 ) ) * ( 1.0 - smoothstep( 0.1, 0.9, ltY ) );
    ltCol = mix( ltCol, ltCol * 0.6 + vec3( 0.34, 0.33, 0.3 ) * 0.4, ltSalt * 0.55 * ltWx ); // efflorescence
    if ( ltKind < 0.5 || ltKind > 3.5 ) {
      // repointed and patched areas: irregular blobs (a noise threshold, not a grid), lighter and flatter
      float ltPn = ltNoise( ( ltP + ltWarp ) * vec2( 0.38, 0.5 ) + ltSeed * 51.0 );
      float ltPm = smoothstep( 0.69 - 0.05 * ltWx, 0.71 - 0.05 * ltWx, ltPn ) * ( 1.0 - smoothstep( 0.78, 0.8, ltPn ) );
      float ltPe = ltNoise( ltP * 9.0 + ltSeed * 3.0 ); // ragged edge
      ltPm *= smoothstep( 0.25, 0.5, ltPe );
      vec3 ltFresh = ltTarget * mix( vec3( 1.0 ), ltChroma, 0.3 ) * ( ltPn > 0.74 ? 0.82 : 1.16 );
      ltCol = mix( ltCol, ltFresh, ltPm * 0.7 );
      gLtFlat = max( gLtFlat, ltPm * 0.5 );
    }
    // a painted lower storey on some lots: a flat coat to about the parlour sill, a hand-cut top edge, peeling at the foot
    float ltPaintedLow = step( 0.8, fract( ltSeed * 13.7 + 0.31 ) );
    #ifdef LT_STONE
      ltPaintedLow = 0.0;
    #endif
    if ( ltPaintedLow > 0.5 && ltKind < 0.5 && ltParty < 0.5 ) {
      float ltEdgeY = 1.85 + 0.06 * ltNoise( vec2( ltS * 3.0, 0.5 ) + ltSeed * 5.0 );
      float ltPm2 = 1.0 - smoothstep( ltEdgeY - 0.012, ltEdgeY + 0.012, ltY );
      float ltPick2 = fract( ltSeed * 29.3 + 0.7 );
      vec3 ltCoat = ltPick2 < 0.3 ? vec3( 0.2, 0.19, 0.18 ) : ltPick2 < 0.55 ? vec3( 0.46, 0.43, 0.38 ) : ltPick2 < 0.8 ? vec3( 0.36, 0.16, 0.12 ) : vec3( 0.34, 0.37, 0.31 );
      float ltPeel = smoothstep( 0.78, 0.9, ltNoise( ltP * vec2( 7.0, 6.0 ) + ltSeed * 19.0 ) * 0.8 + ( 1.0 - smoothstep( 0.0, 0.6, ltY ) ) * 0.3 );
      vec3 ltCoatCol = ltCoat * ( 0.9 + 0.2 * ltNoise( ltP * 14.0 ) );
      ltCol = mix( ltCol, mix( ltCoatCol, ltCol * 0.85, ltPeel * 0.6 ), ltPm2 * 0.92 );
      gLtFlat = max( gLtFlat, ltPm2 * 0.45 );
    }
    // painted-over graffiti: hand-rolled patches in a near-match paint on the lower wall, wobbly edges (blobs, not boxes)
    vec2 ltGc = vec2( ltS / 2.6 + ltSeed * 3.0, ltY / 1.45 );
    vec2 ltGi = floor( ltGc );
    float ltGh = ltHash( ltGi + ltSeed * 57.0 );
    if ( ltY < 3.0 && ltGh > 0.955 - 0.045 * ltWx ) {
      vec2 ltGq = fract( ltGc ) - vec2( 0.5 + ( ltHash( ltGi + 2.3 ) - 0.5 ) * 0.2, 0.5 + ( ltHash( ltGi + 4.1 ) - 0.5 ) * 0.2 );
      float ltWob = ltNoise( ltGc * 5.0 + ltSeed * 9.0 ) * 0.2;
      float ltM = 1.0 - smoothstep( 0.2, 0.26, length( ltGq * vec2( 0.8 + 0.5 * ltHash( ltGi + 6.7 ), 1.15 ) ) + ltWob - 0.06 );
      float ltPick = ltHash( ltGi + 9.1 );
      vec3 ltPaintCol = ltPick < 0.25 ? vec3( 0.22 ) : ltPick < 0.5 ? vec3( 0.3, 0.24, 0.16 ) : ltPick < 0.75 ? vec3( 0.2, 0.07, 0.06 ) : vec3( 0.26, 0.3, 0.24 );
      ltCol = mix( ltCol, ltPaintCol * ( 0.85 + 0.3 * ltNoise( ltP * 6.0 ) ), ltM * 0.85 );
    }
  }
  #ifdef LT_STONE
  if ( ltParty < 0.5 && ltKind < 0.5 ) {
    // ---- brownstone as carved stone: smooth ashlar courses with hairline joints and fine tooling, a rusticated base, spalling
    float ltPix = max( max( fwidth( ltS ), fwidth( ltY ) ), 1e-4 ); // metres per pixel
    float ltPy = max( fwidth( ltY ), 1e-4 );
    float ltBaseM = 1.0 - smoothstep( 1.55, 1.75, ltY );
    float ltCh = mix( 0.43, 0.5, ltBaseM );
    float ltRowF = ltY / ltCh + ltSeed * 4.0;
    float ltRow = floor( ltRowF );
    float ltBl = mix( 0.95, 0.72, ltBaseM ) * ( 0.85 + 0.3 * ltHash( vec2( ltRow, ltSeed * 9.0 ) ) );
    float ltBx = ltS / ltBl + ltHash( vec2( ltRow, ltSeed * 5.0 ) ) * 3.0;
    float ltBi = floor( ltBx );
    vec2 ltBf = vec2( fract( ltBx ), fract( ltRowF ) );
    float ltDx = min( ltBf.x, 1.0 - ltBf.x ) * ltBl;
    float ltDy = min( ltBf.y, 1.0 - ltBf.y ) * ltCh;
    float ltJw = mix( 0.004, 0.026, ltBaseM );
    float ltJ = 1.0 - smoothstep( ltJw * 0.5, ltJw + ltPix, min( ltDx, ltDy ) );
    ltJ *= mix( 0.65, 1.0, step( ltDy, ltDx ) );
    float ltBh = ltHash( vec2( ltBi, ltRow + ltSeed * 17.0 ) );
    vec3 ltStone = ltTarget * ( 0.91 + 0.18 * ltBh ) * ( 0.97 + 0.06 * ltHash( vec2( ltRow, 4.0 ) ) );
    float ltBed = ltNoise( vec2( ltS * 0.7 + ltBi * 3.1, ltY * 22.0 ) );
    ltStone *= 0.95 + 0.1 * ltBed; // faint sedimentary banding
    float ltTf = 1.0 - smoothstep( 0.007, 0.016, ltPy ); // tooling is only drawn while a pixel is smaller than a line
    float ltTl = abs( fract( ltY / 0.026 + ltBh * 7.0 ) - 0.5 ) * 2.0;
    float ltTool = ( 1.0 - smoothstep( 0.0, 0.35, ltTl ) ) * ( 0.4 + 0.6 * ltNoise( vec2( ltS * 3.0, ltY * 40.0 ) + ltBi ) );
    ltStone *= 1.0 - ltTool * ltTf * 0.08 * ( 1.0 - ltBaseM );
    float ltPit = ltNoise( ltP * 38.0 + ltBi * 7.0 ) * 0.6 + ltNoise( ltP * 15.0 ) * 0.4;
    ltStone *= 1.0 - ltBaseM * ( 0.2 * ltPit * ltTf + 0.07 ); // vermiculated, pitted rusticated faces
    ltStone = mix( ltStone, ltStone * vec3( 0.5, 0.48, 0.46 ), ltJ * 0.85 );
    // spalling: rawer, lighter stone where the face has flaked, with a dark chipped rim; commoner low down and on weathered lots
    float ltSp = ltNoise( ltP * vec2( 2.6, 3.4 ) + ltSeed * 23.0 ) * 0.65 + ltNoise( ltP * 9.0 + 3.0 ) * 0.35;
    float ltSpT = 0.67 - ltWx * 0.12 + smoothstep( 0.4, 2.4, ltY ) * 0.26;
    float ltSpM = smoothstep( ltSpT, ltSpT + 0.035, ltSp );
    float ltSpRim = smoothstep( ltSpT - 0.03, ltSpT, ltSp ) * ( 1.0 - ltSpM );
    ltStone = mix( ltStone, ltTarget * vec3( 1.26, 1.1, 0.9 ) * ( 0.9 + 0.2 * ltNoise( ltP * 25.0 ) ), ltSpM * 0.7 );
    ltStone *= 1.0 - ltSpRim * 0.3;
    // the weathering already applied to ltCol (macro tone, soot, runs, damp), relative to the flat target, rides on the carved colour
    vec3 ltWea = clamp( ltCol / max( ltTarget * ltChroma, vec3( 0.02 ) ), vec3( 0.35 ), vec3( 1.7 ) );
    ltCol = ltStone * ltWea;
    gLtFlat = max( gLtFlat, 0.9 );
    gLtH = -0.012 * ltJ + 0.0007 * ltTool * ltTf * ( 1.0 - ltBaseM ) + 0.004 * ltPit * ltBaseM * ltTf - 0.009 * ltSpM;
    gLtBump = 1.0;
  }
  #endif
  if ( ltKind > 0.5 && ltKind < 1.5 ) {
    // siding boards
    float ltBf = fract( ltY / 0.17 + ltSeed * 3.0 );
    float ltB = 1.0 - 0.26 * ( 1.0 - smoothstep( 0.0, 0.1, ltBf ) ) + 0.06 * smoothstep( 0.1, 0.2, ltBf ) * ( 1.0 - smoothstep( 0.2, 0.4, ltBf ) );
    ltCol = ltTarget * ltB * ( 0.95 + 0.1 * ltNoise( ltP * vec2( 1.5, 30.0 ) ) );
    gLtFlat = 0.85;
  } else if ( ltKind > 1.5 && ltKind < 2.5 ) {
    // stucco grain
    ltCol = ltTarget * ( 0.9 + 0.2 * ltNoise( ltP * 18.0 ) ) * dtlGain( 0.0, ltP / 2.2 + ltSeed * 5.0, 2.4 ) * dtlGain( 0.0, ltP / 7.0, 1.4 );
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
  } else if ( ltKind > 6.5 && ltKind < 7.5 ) {
    // striped shop awning: white stripes 12 cm wide
    ltCol = mix( ltCol, vec3( 0.7, 0.68, 0.62 ), step( 0.5, fract( ltS / 0.24 ) ) * 0.85 );
  } else if ( ltKind > 3.5 && ltKind < 4.5 ) {
    // glazed brick / tile: small square tiles with grout lines from the tile photo
    ltCol = ltTarget * dtlGain( 1.0, ltP / 1.0 + ltSeed * 3.0, 2.0 ) * ( 0.94 + 0.12 * ltNoise( ltP * 2.0 + ltSeed * 9.0 ) );
    gLtGloss = 0.6;
    gLtFlat = 0.4;
  } else if ( ltKind > 4.5 && ltKind < 5.5 ) {
    // limestone / cast stone trim, cornices, stoops
    #ifdef LT_CORNICE
    {
      // painted cornice: stacked mouldings (a lit top edge, a shadowed underside, an ogee bump), a dentil band, weathering
      float ltCf = fract( ltY / 0.16 );
      float ltMould = smoothstep( 0.0, 0.3, ltCf ) * ( 1.0 - smoothstep( 0.55, 1.0, ltCf ) );
      float ltDentY = step( 0.32, fract( ltY / 0.64 ) ) * step( fract( ltY / 0.64 ), 0.5 );
      float ltDent = ltDentY * step( 0.5, fract( ltS / 0.17 + ltSeed * 3.0 ) );
      vec3 ltPaintC = ltTarget * ( 0.96 + 0.08 * ltNoise( ltP * vec2( 1.1, 2.0 ) + ltSeed * 5.0 ) );
      ltPaintC *= 1.0 + 0.16 * ( 1.0 - smoothstep( 0.0, 0.14, ltCf ) ) - 0.2 * smoothstep( 0.8, 1.0, ltCf ) - 0.2 * ltDent * ltDentY;
      float ltDrip = smoothstep( 0.5, 0.85, ltNoise( vec2( ltS * 6.0, ltY * 0.8 ) + ltSeed * 9.0 ) ) * ltWx;
      ltPaintC *= 1.0 - 0.22 * ltDrip;
      ltPaintC = mix( ltPaintC, ltPaintC * vec3( 1.2, 1.12, 0.95 ) + 0.02, smoothstep( 0.68, 0.84, ltNoise( ltP * 6.0 + ltSeed * 2.0 ) ) * ltWx * 0.45 ); // flaking paint shows older coats
      ltCol = ltPaintC;
      gLtH = 0.014 * ltMould - 0.012 * ltDent * ltDentY;
      gLtBump = 1.0;
      gLtFlat = 0.85;
    }
    #else
    ltCol *= dtlGain( 3.0, ltP / 1.6 + ltSeed * 7.0, 2.6 ) * dtlGain( 3.0, ltP / 5.3, 1.8 );
    // ashlar courses: per-block tone and a joint line, so a big plain limestone face (pier, stoop wing) never reads as a flat grey slab
    vec2 ltBk = vec2( ltS / 0.9 + ltSeed * 9.0, ltY / 0.42 );
    vec2 ltBi = floor( ltBk + vec2( 0.5 * mod( floor( ltBk.y ), 2.0 ), 0.0 ) );
    vec2 ltBf = fract( ltBk + vec2( 0.5 * mod( floor( ltBk.y ), 2.0 ), 0.0 ) );
    float ltJ = 1.0 - smoothstep( 0.0, 0.045, min( min( ltBf.x, 1.0 - ltBf.x ) * 0.9, min( ltBf.y, 1.0 - ltBf.y ) * 0.42 ) * 2.4 );
    ltCol *= ( 0.86 + 0.28 * ltHash( ltBi + ltSeed * 13.0 ) ) * ( 1.0 - 0.32 * ltJ );
    ltCol *= mix( vec3( 1.04, 1.0, 0.94 ), vec3( 0.95, 0.99, 1.05 ), ltNoise( ltP * 0.35 + ltSeed * 3.0 ) );
    #endif
  } else if ( ltKind > 7.5 && ltKind < 8.5 ) {
    // roll-down gate: plain / rusty / tagged, by lot seed
    float ltGs = fract( ltSeed * 7.31 + 0.17 );
    float ltLow = 1.0 - smoothstep( 0.0, 1.6, ltY );
    float ltRust = ltGs > 0.55 ? ( ltGs > 0.8 ? 0.55 : 1.0 ) : 0.0;
    float ltRn = ltNoise( vec2( ltS * 6.0, ltY * 1.5 ) + ltSeed * 17.0 );
    float ltRm = ltRust * smoothstep( 0.35, 0.8, ltRn * 0.6 + ltLow * 0.7 + ltWx * 0.25 - 0.3 );
    ltCol = mix( ltCol, vec3( 0.34, 0.15, 0.06 ) * ( 0.7 + 0.6 * ltNoise( ltP * 14.0 ) ), ltRm * 0.8 );
    ltCol *= 0.92 + 0.16 * ltNoise( vec2( ltS * 40.0, ltY * 0.5 ) );
    if ( ltGs > 0.8 ) {
      // abstract tag: two looping marker strokes and a crown, in a per-lot colour
      vec2 ltT = vec2( ltS * 0.8 + ltSeed * 11.0, ltY * 1.1 );
      vec2 ltTc = fract( ltT * 0.5 ) * 2.0 - 1.0;
      ltTc.y = ( ltTc.y - 0.1 ) * 1.4;
      float ltWob = ltNoise( ltTc * 3.0 + ltSeed * 40.0 ) * 0.25;
      float ltR1 = abs( length( ltTc * vec2( 0.9, 1.5 ) ) - 0.55 - ltWob );
      float ltR2 = abs( length( ( ltTc - vec2( 0.55, -0.1 ) ) * vec2( 1.5, 1.0 ) ) - 0.3 - ltWob * 0.5 );
      float ltStroke = 1.0 - smoothstep( 0.03, 0.075, min( ltR1, ltR2 ) );
      ltStroke *= step( 0.0, ltTc.y + 0.5 ) * step( ltTc.y, 0.9 ) * step( ltY, 2.6 );
      vec3 ltInk = ltSeed > 0.5 ? vec3( 0.04, 0.04, 0.05 ) : vec3( 0.55, 0.12, 0.45 );
      ltCol = mix( ltCol, ltInk, ltStroke * 0.85 );
    }
    gLtFlat = 0.5;
  }
  if ( ltKind > 5.5 && ltKind < 7.5 ) {
    // shop and window awnings: sun-bleached patches, panel seams every 62 cm, dirt, mildew in the folds
    float ltFade = smoothstep( 0.25, 0.85, ltNoise( ltP * vec2( 0.35, 0.6 ) + ltSeed * 14.0 ) ) * ltWx;
    float ltLum = dot( ltCol, vec3( 0.3333 ) );
    ltCol = mix( ltCol, vec3( ltLum * 1.1 ), ltFade * 0.4 ) * ( 1.0 + 0.16 * ltFade );
    float ltSd = abs( fract( ltS / 0.62 + ltSeed * 3.0 ) - 0.5 ) * 0.62;
    ltCol *= 1.0 - 0.14 * ( 1.0 - smoothstep( 0.002, 0.008, ltSd ) );
    ltCol *= 1.0 - 0.28 * smoothstep( 0.55, 0.9, ltNoise( ltP * vec2( 5.0, 1.5 ) + ltSeed * 3.0 ) ) * ( 0.3 + 0.7 * ltWx );
    ltCol = mix( ltCol, ltCol * vec3( 0.82, 0.92, 0.8 ), smoothstep( 0.7, 0.9, ltNoise( ltP * 8.0 + ltSeed * 6.0 ) ) * ltWx * 0.5 );
    gLtFlat = max( gLtFlat, 0.4 );
  }
  if ( ltKind > 9.5 ) {
    // panelled front door: two tall lower panels, two upper panels behind the glass, stiles and rails, kick plate, knob, number plate
    vec2 dq = vec2( vLtStyle.y, vLtStyle.z );
    float dSeed = floor( vLtStyle.w * 255.0 + 0.5 ) / 255.0;
    vec2 a1 = abs( dq - vec2( 0.29, 0.27 ) ) / vec2( 0.15, 0.2 );
    vec2 a2 = abs( dq - vec2( 0.71, 0.27 ) ) / vec2( 0.15, 0.2 );
    vec2 a3 = abs( dq - vec2( 0.29, 0.76 ) ) / vec2( 0.15, 0.16 );
    vec2 a4 = abs( dq - vec2( 0.71, 0.76 ) ) / vec2( 0.15, 0.16 );
    float e1 = 1.0 - max( a1.x, a1.y ), e2 = 1.0 - max( a2.x, a2.y ), e3 = 1.0 - max( a3.x, a3.y ), e4 = 1.0 - max( a4.x, a4.y );
    float dE = max( max( e1, e2 ), max( e3, e4 ) );
    float dIn = step( 0.0, dE );
    vec2 dC = e1 > 0.0 ? dq - vec2( 0.29, 0.27 ) : e2 > 0.0 ? dq - vec2( 0.71, 0.27 ) : e3 > 0.0 ? dq - vec2( 0.29, 0.76 ) : dq - vec2( 0.71, 0.76 );
    float dRing = dIn * ( 1.0 - smoothstep( 0.0, 0.22, dE ) );
    vec3 dCol = ltTarget * ( 0.92 + 0.16 * ltNoise( ltP * vec2( 3.0, 1.5 ) + dSeed * 9.0 ) );
    dCol *= 1.0 + dRing * 0.3 * dot( normalize( dC + vec2( 1e-4 ) ), vec2( -0.5, 0.85 ) ) - dIn * 0.06;
    vec3 dBrass = vec3( 0.58, 0.43, 0.16 ) * ( 0.8 + 0.4 * ltNoise( ltP * 30.0 ) );
    float dKick = step( dq.y, 0.075 ) * step( 0.07, dq.x ) * step( dq.x, 0.93 );
    dCol = mix( dCol, dBrass * 0.8, dKick );
    vec2 dKn = ( dq - vec2( 0.88, 0.46 ) ) * vec2( 1.1, 2.2 );
    dCol = mix( dCol, dBrass * 1.25, 1.0 - smoothstep( 0.035, 0.045, length( dKn ) ) );
    // brass number plate on the middle rail: three seven-segment numerals
    vec2 dPl = ( dq - vec2( 0.5, 0.535 ) ) * vec2( 1.1, 2.2 );
    float dPlate = step( abs( dPl.x ), 0.17 ) * step( abs( dPl.y ), 0.05 );
    dCol = mix( dCol, dBrass * 1.1, dPlate );
    float dNum = 0.0;
    for ( int k = 0; k < 3; k++ ) {
      float fk = float( k );
      vec2 dp = vec2( ( dPl.x + 0.15 - fk * 0.1 ) / 0.08, ( dPl.y + 0.04 ) / 0.08 );
      if ( dp.x > 0.0 && dp.x < 1.0 && dp.y > 0.0 && dp.y < 1.0 ) dNum = max( dNum, ltSeg( floor( fract( dSeed * 7.13 + fk * 0.377 ) * 10.0 ), dp ) );
    }
    dCol = mix( dCol, vec3( 0.03 ), dNum * dPlate );
    dCol *= 1.0 - 0.3 * smoothstep( 0.0, 0.3, 0.3 - dq.y ) * ( 0.4 + 0.6 * ltNoise( ltP * vec2( 9.0, 3.0 ) ) ); // scuffed at the foot
    ltCol = dCol;
    gLtH = -0.012 * dIn + 0.006 * dRing;
    gLtBump = 1.0; gLtFlat = 0.6; gLtGloss = 0.2;
  }
  if ( ltParty > 0.5 && ltY > 6.0 && ltY < 11.0 ) {
    // faded painted wall sign on blank side walls: one 9 m cell in four, a 6.4 x 2 m board
    float ltCell = floor( ltS / 9.0 + ltSeed * 4.0 );
    float ltSh = ltHash( vec2( ltCell, ltSeed * 61.0 ) );
    vec2 ltSp = vec2( -( ltS / 9.0 + ltSeed * 4.0 - ltCell ) * 9.0, ltY - 7.0 );
    vec2 ltSu = vec2( ltSp.x / 6.4 - 0.1, ltSp.y / 2.0 );
    if ( ltSh > 0.74 && ltSu.x > 0.0 && ltSu.x < 1.0 && ltSu.y > 0.0 && ltSu.y < 1.0 ) {
      float ltIdx = floor( ltHash( vec2( ltCell + 3.0, ltSeed * 29.0 ) ) * ${WALL_SIGNS.length}.0 );
      vec2 ltCellUv = vec2( mod( ltIdx, ${SIGN_COLS}.0 ), floor( ltIdx / ${SIGN_COLS}.0 ) );
      vec4 ltSg = texture2D( tSigns, vec2( ltCellUv.x + ltSu.x, ${SIGN_ROWS - 1}.0 - ltCellUv.y + ltSu.y ) / vec2( ${SIGN_COLS}.0, ${SIGN_ROWS}.0 ) );
      float ltFade = 0.35 + 0.4 * ltNoise( ltP * vec2( 1.3, 1.9 ) + ltSeed * 5.0 );
      vec3 ltSc = pow( ltSg.rgb, vec3( 2.2 ) );
      ltCol = mix( ltCol, ltSc * ( 0.5 + 0.5 * ltLr ) * 0.8 + ltCol * 0.15, ltSg.a * ltFade );
    }
  }
  diffuseColor.rgb = ltCol;
}`;

/** Patch a standard material so it follows the per-vertex tone. Chains with other onBeforeCompile patches. */
export function patchLotTone(m: THREE.MeshStandardMaterial, mode: 'stone' | 'cornice' | '' = ''): void {
  const stone = mode === 'stone';
  if (!TEXVAR_ON) return;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.tDetail = { value: detailAtlasTexture() };
    shader.uniforms.tSigns = { value: wallSignTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLtTone = aTone; vLtStyle = aStyle;
vLtW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vLtN = normalize( mat3( modelMatrix ) * objectNormal );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${stone ? '#define LT_STONE\n' : ''}${mode === 'cornice' ? '#define LT_CORNICE\n' : ''}${FRAG_DECL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_MAIN}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.3, gLtGloss );')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize( mix( normal, nonPerturbedNormal, gLtFlat ) );
if ( gLtBump > 0.5 ) {
  vec2 ltDh = vec2( dFdx( gLtH ), dFdy( gLtH ) );
  vec3 ltSx = dFdx( - vViewPosition ), ltSy = dFdy( - vViewPosition );
  vec3 ltR1 = cross( ltSy, normal ), ltR2 = cross( normal, ltSx );
  float ltDet = dot( ltSx, ltR1 ) * faceDirection;
  vec3 ltGrad = sign( ltDet ) * ( ltDh.x * ltR1 + ltDh.y * ltR2 );
  normal = normalize( abs( ltDet ) * normal - ltGrad );
}`);
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|lottone3${mode}`;
  m.needsUpdate = true;
}

/** Material keys whose cached materials carry the tone patch. */
export const LOT_TONE_KEYS: readonly string[] = ['brickRed', 'brickPainted', 'brownstone', 'limestone', 'stoop', 'cornice', 'rollGate', 'metalDark', 'castIronFence'];
