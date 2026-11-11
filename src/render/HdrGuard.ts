/**
 * Keeps one broken pixel from blacking out the screen.
 *
 * The scene is drawn into a half-float HDR buffer. A pixel there can overflow to Inf (very bright additive glare stacked
 * close to the lens, an absurd emissive value) or be NaN (a shader dividing by zero). Every post effect that averages
 * neighbours then spreads it: Inf times a zero weight is NaN, and NaN poisons the whole blur footprint. The bloom blurs
 * across the entire frame at its coarse levels, so one bad pixel becomes a screen-filling black block that jumps about
 * from frame to frame (the owner's "whole screen blinks" recording, 11 Nov: block edges stepping in 64 px units).
 *
 * `hdrSafe(c, cap)` is applied wherever a post effect reads scene colour: NaN becomes 0, Inf and anything above `cap`
 * become `cap`, negatives become 0. The NaN test reads the float's bits, because fast-math shader compilers are allowed to
 * drop isnan() and `x != x`.
 */
export const HDR_SAFE_GLSL = /* glsl */ `
vec3 hdrSafe(vec3 c, float cap) {
  uvec3 bits = floatBitsToUint(c) & uvec3(0x7FFFFFFFu);
  c = mix(c, vec3(0.0), greaterThan(bits, uvec3(0x7F800000u))); // NaN: exponent all ones, mantissa non-zero
  return clamp(c, vec3(0.0), vec3(cap));
}
`;

/** Scene colour above this never reaches the bloom: 64 times display white is far past anything a lamp needs to glow. */
export const BLOOM_INPUT_CAP = 64;
/** Cap for the effects that keep the picture itself (grading, depth of field centre, reflections composite). */
export const HDR_CAP = 4096;

const BLOOM_SAMPLE = 'vec4 texel = texture2D( tDiffuse, vUv );';

/** The part of UnrealBloomPass this touches. */
export interface BloomLike { materialHighPassFilter?: { fragmentShader: string; needsUpdate: boolean } | null }

/**
 * Makes the bloom's bright-pass sanitise what it reads from the scene buffer. Returns false (and changes nothing) when the
 * three.js shader no longer has the expected sample line, so a library upgrade fails the unit test instead of silently
 * bringing the black blocks back.
 */
export function guardBloomInput(bloom: BloomLike, cap: number = BLOOM_INPUT_CAP): boolean {
  const m = bloom.materialHighPassFilter;
  if (!m) return false;
  if (m.fragmentShader.includes('hdrSafe(')) return true;
  if (!m.fragmentShader.includes(BLOOM_SAMPLE) || !m.fragmentShader.includes('void main()')) return false;
  m.fragmentShader = m.fragmentShader
    .replace('void main()', `${HDR_SAFE_GLSL}\nvoid main()`)
    .replace(BLOOM_SAMPLE, `${BLOOM_SAMPLE} texel.rgb = hdrSafe( texel.rgb, ${cap.toFixed(1)} );`);
  m.needsUpdate = true;
  return true;
}
