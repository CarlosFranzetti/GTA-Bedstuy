/**
 * Shared state of the car-paint clear coat (GFX2). Every PaletteCarPaint material points at the SAME uniform objects, so a
 * tier switch or a new sky colour is a few number writes, never a recompile and never a draw call.
 *
 * Modes (per tier, see CAR_PAINT_TIERS):
 *   0 off      phone: the shader branch is skipped, nothing extra is computed.
 *   1 static   low: a three-colour analytic gradient (zenith / horizon / street) evaluated on the reflection vector; no texture fetch.
 *   2 env      medium / high: the SkyDome cube capture (scene.environment, PMREM) sampled with the clear-coat roughness. The lower
 *              hemisphere of that capture is a flat haze colour, so it is blended toward the street colour (asphalt lit by the sky,
 *              with lamp warmth at night): the "sky and street" a car body shows. The wet-road SSR only traces from ground pixels, so
 *              it cannot see a car; the wet street shows up on the paint through `wet` (more street reflection, tighter coat).
 */
import * as THREE from 'three';
import type { Quality } from './Shadows';

export interface CarPaintTier {
  /** 0 off, 1 static gradient, 2 environment capture */
  mode: 0 | 1 | 2;
  /** overall clear-coat strength (scales the fresnel reflection) */
  coat: number;
  /** extra fresnel rim lift at grazing angles */
  rim: number;
  /** additional gloss on up-facing paint (roof, hood, boot) */
  roofGloss: number;
  /** how much of the lower hemisphere reflection is the street colour instead of the capture's flat haze */
  street: number;
}

export const CAR_PAINT_TIERS: Record<Quality, CarPaintTier> = {
  phone: { mode: 0, coat: 0, rim: 0, roofGloss: 0, street: 0 },
  low: { mode: 1, coat: 0.85, rim: 0.5, roofGloss: 0.6, street: 1 },
  medium: { mode: 2, coat: 1, rim: 0.7, roofGloss: 0.8, street: 0.9 },
  high: { mode: 2, coat: 1.1, rim: 0.8, roofGloss: 1, street: 1 },
};

/** The uniform objects every PaletteCarPaint shader reads (shared by reference). */
export const CAR_PAINT_UNIFORMS = {
  cpMode: { value: 0 },
  cpCoat: { value: 0 },
  cpRim: { value: 0 },
  cpRoof: { value: 0 },
  cpStreetMix: { value: 0 },
  cpWet: { value: 0 },
  cpZenith: { value: new THREE.Color(0.2, 0.3, 0.5) },
  cpHorizon: { value: new THREE.Color(0.5, 0.55, 0.6) },
  cpStreet: { value: new THREE.Color(0.1, 0.1, 0.11) },
};

let current: Quality = 'phone';
let configured = false;

/** Applies a tier's clear-coat parameters. Called from Pipeline.setQuality. */
export function setCarPaintTier(q: Quality): CarPaintTier {
  const t = CAR_PAINT_TIERS[q] ?? CAR_PAINT_TIERS.low;
  current = q;
  configured = true;
  const u = CAR_PAINT_UNIFORMS;
  u.cpMode.value = t.mode;
  u.cpCoat.value = t.coat;
  u.cpRim.value = t.rim;
  u.cpRoof.value = t.roofGloss;
  u.cpStreetMix.value = t.street;
  return t;
}

export function carPaintTier(): Quality { return current; }
export function carPaintConfigured(): boolean { return configured; }

export interface CarPaintSky {
  /** time-cycle hemisphere sky colour */
  hemiSky: THREE.Color;
  /** colour at the horizon (fog / haze colour) */
  horizon: THREE.Color;
  /** time-cycle hemisphere ground colour */
  hemiGround: THREE.Color;
  /** scene.environmentIntensity at this hour (dome is dimmer when this is high: night) */
  env: number;
  /** 0 day .. 1 night, for lamp warmth on the street */
  night: number;
}

const WARM = new THREE.Color(1.0, 0.62, 0.3);

/** Scalars for the analytic (low) gradient and the street tint of the env mode. Cheap: call once per sky update. */
export function setCarPaintSky(s: CarPaintSky): void {
  const u = CAR_PAINT_UNIFORMS;
  // The dome is exposed through env (night env is high because the dome is dark): bring the gradient to a comparable level.
  const k = 1 / Math.max(0.6, s.env);
  u.cpZenith.value.copy(s.hemiSky).multiplyScalar(0.55 * k + 0.1);
  u.cpHorizon.value.copy(s.horizon).multiplyScalar(0.6 * k + 0.1);
  // Street: asphalt albedo (~0.13) lit by the sky, plus lamp warmth after dark.
  u.cpStreet.value.copy(s.hemiGround).lerp(s.horizon, 0.35).multiplyScalar(0.28 * k + 0.05);
  u.cpStreet.value.lerp(WARM.clone().multiplyScalar(0.16), Math.min(1, Math.max(0, s.night)) * 0.5);
}

/** Wetness 0..1 (Weather): wet asphalt is a better mirror, so the street term gets stronger and the coat tighter. */
export function setCarPaintWet(w: number): void {
  CAR_PAINT_UNIFORMS.cpWet.value = Math.min(1, Math.max(0, w));
}

export const CAR_PAINT_HEADER = /* glsl */ `
uniform float cpMode;
uniform float cpCoat;
uniform float cpRim;
uniform float cpRoof;
uniform float cpStreetMix;
uniform float cpWet;
uniform vec3 cpZenith;
uniform vec3 cpHorizon;
uniform vec3 cpStreet;
`;

/**
 * Injected after lights_fragment_end. `cpMask` is 1 on paint fragments (set in the paint block); windows, lamps and trim are untouched.
 * N, V: view-space shading normal and view direction. Fresnel is Schlick with the 4 % dielectric clear coat.
 */
export const CAR_PAINT_COAT = /* glsl */ `
if ( cpMask > 0.5 && cpMode > 0.5 ) {
  vec3 cpV = normalize( vViewPosition );
  vec3 cpN = normal;
  float cpNV = saturate( dot( cpN, cpV ) );
  float cpF = 0.04 + 0.96 * pow( 1.0 - cpNV, 5.0 );
  vec3 cpR = inverseTransformDirection( reflect( -cpV, cpN ), viewMatrix );
  float cpUp = dot( cpN, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
  float cpGloss = cpRoof * smoothstep( 0.5, 0.95, cpUp );
  float cpBelow = smoothstep( 0.05, -0.3, cpR.y );
  vec3 cpEnv;
  #if defined( ENVMAP_TYPE_CUBE_UV )
  if ( cpMode > 1.5 ) {
    cpEnv = getIBLRadiance( cpV, cpN, mix( 0.2, 0.07, max( cpGloss, cpWet * 0.6 ) ) );
    cpEnv = mix( cpEnv, cpStreet * ( 1.0 + cpWet * 1.4 ), cpBelow * cpStreetMix );
  } else
  #endif
  {
    float cpT = smoothstep( -0.3, 0.3, cpR.y );
    cpEnv = mix( cpStreet * ( 1.0 + cpWet * 1.4 ), mix( cpHorizon, cpZenith, saturate( cpR.y * 1.4 ) ), cpT );
  }
  float cpK = cpCoat * ( cpF + cpGloss * 0.05 + cpRim * pow( 1.0 - cpNV, 3.0 ) * 0.12 );
  reflectedLight.indirectSpecular += cpEnv * cpK;
}
`;
