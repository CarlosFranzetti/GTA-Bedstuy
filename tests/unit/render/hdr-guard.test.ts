import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BLOOM_INPUT_CAP, HDR_SAFE_GLSL, guardBloomInput } from '@/render/HdrGuard';
import { FX_COMPOSITE_SHADER, SSR_TRACE_SHADER } from '@/render/ssr';

/** The GLSL function, mirrored in JS on real float bits (same masks, same order). */
function hdrSafe(x: number, cap: number): number {
  const f = new Float32Array([x]), bits = new Uint32Array(f.buffer)[0] & 0x7fffffff;
  let c = f[0];
  if (bits > 0x7f800000) c = 0; // NaN
  return Math.min(Math.max(c, 0), cap);
}

describe('HDR guard', () => {
  it('NaN becomes 0, Inf and huge values become the cap, negatives become 0, normal values pass', () => {
    expect(hdrSafe(NaN, 64)).toBe(0);
    expect(hdrSafe(-NaN, 64)).toBe(0);
    expect(hdrSafe(Infinity, 64)).toBe(64);
    expect(hdrSafe(-Infinity, 64)).toBe(0);
    expect(hdrSafe(1e30, 64)).toBe(64);
    expect(hdrSafe(-3, 64)).toBe(0);
    expect(hdrSafe(0.5, 64)).toBe(0.5);
    expect(hdrSafe(12, 64)).toBe(12);
  });

  it('the shader source uses the same bit masks and never isnan()', () => {
    expect(HDR_SAFE_GLSL).toContain('floatBitsToUint');
    expect(HDR_SAFE_GLSL).toContain('0x7FFFFFFFu');
    expect(HDR_SAFE_GLSL).toContain('0x7F800000u');
    expect(HDR_SAFE_GLSL).not.toContain('isnan');
  });

  it("patches the real UnrealBloomPass bright-pass (fails here if a three.js upgrade changes that shader)", () => {
    const bloom = new UnrealBloomPass(new THREE.Vector2(64, 36), 1, 0.4, 0.8);
    const m = (bloom as unknown as { materialHighPassFilter: THREE.ShaderMaterial }).materialHighPassFilter;
    const before = m.fragmentShader;
    expect(guardBloomInput(bloom as never)).toBe(true);
    expect(m.fragmentShader).not.toBe(before);
    expect(m.fragmentShader).toContain('vec3 hdrSafe(vec3 c, float cap)');
    expect(m.fragmentShader).toContain(`texel.rgb = hdrSafe( texel.rgb, ${BLOOM_INPUT_CAP.toFixed(1)} );`);
    // the function is defined before main, and the sample is sanitised before it is used
    expect(m.fragmentShader.indexOf('vec3 hdrSafe')).toBeLessThan(m.fragmentShader.indexOf('void main()'));
    expect(m.fragmentShader.indexOf('texel.rgb = hdrSafe')).toBeLessThan(m.fragmentShader.indexOf('luminance( texel.xyz )'));
    const once = m.fragmentShader;
    expect(guardBloomInput(bloom as never)).toBe(true); // idempotent
    expect(m.fragmentShader).toBe(once);
  });

  it('refuses a shader it does not recognise and leaves it alone', () => {
    const m = { fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }', needsUpdate: false };
    expect(guardBloomInput({ materialHighPassFilter: m })).toBe(false);
    expect(m.fragmentShader).toBe('void main() { gl_FragColor = vec4(1.0); }');
    expect(guardBloomInput({})).toBe(false);
  });

  it('every post shader of ours that reads scene colour sanitises it', () => {
    for (const sh of [SSR_TRACE_SHADER.fragmentShader, FX_COMPOSITE_SHADER.fragmentShader]) {
      expect(sh).toContain('vec3 hdrSafe(vec3 c, float cap)');
      // no raw scene sample left: every texture2D(tDiffuse ...) sits inside hdrSafe( ... ) or is sanitised on the next line
      const raw = sh.split('\n').filter((l) => l.includes('texture2D(tDiffuse') && !l.includes('hdrSafe('));
      for (const l of raw) expect(sh.slice(sh.indexOf(l), sh.indexOf(l) + l.length + 120)).toContain('hdrSafe(');
    }
  });
});
