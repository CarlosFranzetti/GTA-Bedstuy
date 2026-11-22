import { describe, expect, it } from 'vitest';
import { applyBodyLayers, armClearRad, makeBodyLayerState, type BodyLayerIn } from '@/entities/anim/bodyLayers';
import { BONES, NCH, RIG_CH, boneChannel } from '@/entities/anim/clipPack';
import { fullLib } from './anim-measure';

// POSE seat: the pure body layers. They add to the hips, torso, head, arms and elbows (and the rig's sway while standing) and nothing else.
const DEG = 180 / Math.PI;
const ch = (b: (typeof BONES)[number], k = 0): number => boneChannel(b) + k;
const NOT_MINE = [...(['legL', 'kneeL', 'legR', 'kneeR', 'ankleL', 'ankleR'] as const).flatMap((b) => [ch(b), ch(b, 1), ch(b, 2)]), RIG_CH + 1, RIG_CH + 2];

const inp = (o: Partial<BodyLayerIn> = {}): BodyLayerIn => ({ dt: 1 / 60, speed: 0, idleW: 1, yawRate: 0, age: 'adult', armSwing: 1, sway: 1, phase0: 0.3, seed: 11, splay: 0.03, ...o });
const restPose = (): Float32Array => { const p = new Float32Array(NCH); p[ch('elbowL')] = 0.12; p[ch('elbowR')] = 0.12; p[ch('armL', 2)] = -0.07; p[ch('armR', 2)] = 0.07; return p; };

/** Runs `seconds` of one person; returns the pose at each step (copied) */
function run(seconds: number, make: (t: number) => Partial<BodyLayerIn>, seed = 11, base: () => Float32Array = restPose): Float32Array[] {
  const st = makeBodyLayerState(seed), out: Float32Array[] = [];
  for (let i = 0; i < seconds * 60; i++) { const p = base(); applyBodyLayers(p, inp({ seed, ...make(i / 60) }), st); out.push(p); }
  return out;
}

describe('body layers: what they may touch', () => {
  it('never writes the legs, knees, ankles or the rig height and surge, standing, walking or at a sprint', () => {
    for (const speed of [0, 1.4, 3, 6.5]) {
      const base = (): Float32Array => { const p = new Float32Array(NCH); for (let k = 0; k < NCH; k++) p[k] = Math.sin(k * 1.7) * 0.2; return p; };
      const ref = base();
      for (const p of run(40, () => ({ speed, idleW: speed < 0.1 ? 1 : 0 }), 5, base)) for (const k of NOT_MINE) expect(p[k]).toBe(ref[k]);
    }
  });

  it('is exactly off while something else poses the body (off = 1): the pose comes back untouched', () => {
    const ref = restPose();
    for (const p of run(20, () => ({ off: 1 }))) expect(Array.from(p)).toEqual(Array.from(ref));
  });

  it('fades out at once when an action starts and eases back in when it ends (no pop on the first frame of an action)', () => {
    const st = makeBodyLayerState(3);
    for (let i = 0; i < 600; i++) applyBodyLayers(restPose(), inp({ seed: 3 }), st);
    const on = restPose(); applyBodyLayers(on, inp({ seed: 3 }), st);
    const p = restPose(); applyBodyLayers(p, inp({ seed: 3, off: 1 }), st);
    expect(Array.from(p)).toEqual(Array.from(restPose()));
    const back = restPose(); applyBodyLayers(back, inp({ seed: 3, off: 0 }), st);
    let d = 0; for (let k = 0; k < NCH; k++) d = Math.max(d, Math.abs(back[k] - restPose()[k]));
    expect(d, 'first frame back is a small step, not a jump').toBeLessThan(0.08);
  });

  it('arms busy (crossed arms, leaning, phone, a load): the arms and gestures are left alone, the rest of the body still works', () => {
    const ref = restPose();
    for (const p of run(30, () => ({ armsBusy: 1 }))) {
      for (const b of ['armL', 'armR', 'elbowL', 'elbowR'] as const) for (let k = 0; k < 3; k++) expect(p[ch(b, k)]).toBe(ref[ch(b, k)]);
    }
    const moved = run(30, () => ({ armsBusy: 1 })).some((p) => Math.abs(p[ch('hips', 2)]) > 0.005);
    expect(moved).toBe(true);
  });

  it('the far level (cheap) gets the arm layer only: no weight shift, no head turns, no gestures', () => {
    const ref = restPose();
    for (const p of run(30, () => ({ cheap: true }), 9)) {
      for (const b of ['hips', 'torso', 'head'] as const) for (let k = 0; k < 3; k++) expect(p[ch(b, k)]).toBe(ref[ch(b, k)]);
      expect(p[RIG_CH]).toBe(0);
    }
  });

  it('is finite and bounded for any input, including a huge time step and a wild speed', () => {
    const st = makeBodyLayerState(2);
    for (const dt of [0, 1e-4, 1 / 144, 0.05, 3, 100]) for (const speed of [0, 0.2, 2, 9]) {
      const p = restPose();
      applyBodyLayers(p, inp({ dt, speed, idleW: speed < 0.5 ? 1 : 0.4, yawRate: 9 }), st);
      for (let k = 0; k < NCH; k++) { expect(Number.isFinite(p[k])).toBe(true); expect(Math.abs(p[k] - restPose()[k])).toBeLessThan(1.2); }
    }
  });
});

describe('body layers: the standing person', () => {
  it('shifts the weight to the other leg every 5 to 12 seconds (an adult), the hip dropping on the unloaded side', () => {
    const series = run(120, () => ({}), 21);
    const zs = series.map((p) => p[ch('hips', 2)]);
    const flips: number[] = [];
    for (let i = 1; i < zs.length; i++) if (Math.sign(zs[i] - 0) !== Math.sign(zs[i - 1] - 0) && Math.abs(zs[i]) > 0 ) flips.push(i / 60);
    expect(flips.length, 'sides changed over two minutes').toBeGreaterThanOrEqual(6);
    const gaps = flips.slice(1).map((t, i) => t - flips[i]);
    for (const g of gaps) { expect(g).toBeGreaterThan(3.5); expect(g).toBeLessThan(14); }
    const peak = Math.max(...zs.map(Math.abs));
    expect(peak * DEG, 'hip drop of about 2 to 6 degrees').toBeGreaterThan(1.5);
    expect(peak * DEG).toBeLessThan(7);
  });

  it('the chest tips over the loaded leg and the head stays nearly level', () => {
    const series = run(60, () => ({}), 8);
    let tz = 0, hzs = 0;
    for (const p of series) { tz = Math.max(tz, Math.abs(p[ch('torso', 2)])); hzs = Math.max(hzs, Math.abs(p[ch('head', 2)])); }
    expect(tz * DEG).toBeLessThan(4);
    expect(hzs).toBeLessThan(tz); // head roll follows less than the chest does
  });

  it('five people stand five ways: different sides, timing and amplitude', () => {
    const sig = [1, 2, 3, 4, 5].map((s) => run(30, () => ({}), s * 977).map((p) => p[ch('hips', 2)]).reduce((a, b) => a + Math.abs(b), 0).toFixed(2));
    expect(new Set(sig).size).toBeGreaterThanOrEqual(4);
    const times = [1, 2, 3, 4, 5].map((s) => { const z = run(25, () => ({}), s * 977).map((p) => p[ch('hips', 2)]); return z.findIndex((v, i) => i > 1 && Math.sign(v) !== Math.sign(z[i - 1])); });
    expect(new Set(times).size).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic by seed: the same seed and inputs give the same poses, bit for bit', () => {
    const a = run(30, () => ({ speed: 0 }), 4242), b = run(30, () => ({ speed: 0 }), 4242);
    for (let i = 0; i < a.length; i++) expect(Array.from(a[i])).toEqual(Array.from(b[i]));
    const c = run(30, () => ({ speed: 0 }), 4243);
    expect(c.some((p, i) => p[ch('hips', 2)] !== a[i][ch('hips', 2)])).toBe(true);
  });

  it('children fidget (shift often), elders take it slowly, teenagers slouch', () => {
    const changes = (age: BodyLayerIn['age'], seed: number): number => { const st = makeBodyLayerState(seed); let n = 0, last = 0; for (let i = 0; i < 60 * 120; i++) { applyBodyLayers(restPose(), inp({ seed, age }), st); if (st.side !== last) { n++; last = st.side; } } return n; };
    let kid = 0, old = 0; for (let s = 1; s <= 6; s++) { kid += changes('kid', s * 31); old += changes('old', s * 31); }
    expect(kid).toBeGreaterThan(old * 1.6);
    const pitch = (age: BodyLayerIn['age']): number => { let s = 0; for (let k = 1; k <= 8; k++) { const p = run(5, () => ({ age }), k * 7).at(-1)!; s += p[ch('torso')]; } return s / 8; };
    expect(pitch('teen')).toBeLessThan(pitch('old') - 0.01); // forward is negative x: a teenager's chest is further forward
  });

  it('a person who is walking gets no weight shift or head turns (idleW = 0)', () => {
    for (const p of run(30, () => ({ speed: 1.4, idleW: 0 }), 6)) { expect(p[RIG_CH]).toBe(0); expect(p[ch('head', 1)]).toBe(0); }
  });

  it('a hand goes into a pocket now and then and comes out again (adults, over a few minutes)', () => {
    let any = 0, out = 0;
    for (let s = 1; s <= 8; s++) {
      const series = run(180, () => ({}), s * 53);
      const bent = series.map((p) => Math.min(p[ch('armL')], p[ch('armR')]) < -0.15); // the pocket pose carries the upper arm back
      if (bent.some(Boolean)) any++;
      if (bent.some(Boolean) && bent.some((b) => !b)) out++;
    }
    expect(any).toBeGreaterThanOrEqual(4);
    expect(out).toBeGreaterThanOrEqual(3);
    // no pockets (a dress): no hand goes in
    for (let s = 1; s <= 8; s++) expect(run(120, () => ({ pockets: 0 }), s * 53).some((p) => Math.min(p[ch('armL')], p[ch('armR')]) < -0.15)).toBe(false);
  });
});

describe('body layers: the arms', () => {
  it('lift the upper arm clear of a wide body or a thick coat and never pull it in', () => {
    const roll = (splay: number): number => run(2, () => ({ splay })).at(-1)![ch('armR', 2)];
    expect(roll(0.03)).toBeGreaterThanOrEqual(0.07 - 1e-6);
    expect(roll(0.2)).toBeGreaterThan(roll(0.03) + 0.05);
    const L = run(2, () => ({ splay: 0.15 })).at(-1)![ch('armL', 2)], R = run(2, () => ({ splay: 0.15 })).at(-1)![ch('armR', 2)];
    expect(L).toBeLessThan(-0.07); expect(R).toBeGreaterThan(0.07); // outward is negative z on the left arm, positive on the right
    expect(Math.abs(L + R), 'the same on both sides').toBeLessThan(1e-6);
  });

  it('the elbow is never locked straight, standing or walking, and bends more on the forward swing', () => {
    const base = (): Float32Array => { const p = new Float32Array(NCH); p[ch('armL')] = 0.35; p[ch('armR')] = -0.35; return p; }; // elbows at 0 = straight
    const p = run(3, () => ({ speed: 1.4, idleW: 0 }), 3, base).at(-1)!;
    expect(p[ch('elbowL')]).toBeGreaterThan(0.15); expect(p[ch('elbowR')]).toBeGreaterThan(0.05);
    expect(p[ch('elbowL')], 'the arm swinging forward bends more').toBeGreaterThan(p[ch('elbowR')] + 0.04);
    const s = run(3, () => ({ speed: 0 }), 3, base).at(-1)!;
    expect(s[ch('elbowL')]).toBeGreaterThan(0.03);
  });
});

describe('armClearRad: how far a wide body pushes its arms out', () => {
  it('is zero when the elbow already clears, grows with the torso and with a thick coat, and is capped', () => {
    expect(armClearRad(0.1, 0.18, 0.3)).toBe(0);
    const a = armClearRad(0.16, 0.17, 0.3), b = armClearRad(0.2, 0.17, 0.3), c = armClearRad(0.2, 0.17, 0.3, 0.085);
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b);
    expect(armClearRad(0.5, 0.1, 0.3)).toBeLessThanOrEqual(Math.asin(0.5) + 1e-9);
    expect(armClearRad(0.2, 0.17, 0)).toBe(0);
  });
});

describe('body layers: cost', () => {
  it('a call is a few microseconds', () => {
    const st = makeBodyLayerState(1), p = restPose(), i = inp({ speed: 0 }), j = inp({ speed: 1.4, idleW: 0 });
    for (let k = 0; k < 2000; k++) applyBodyLayers(p, k % 2 ? i : j, st); // warm up
    const n = 20000, t0 = performance.now();
    for (let k = 0; k < n; k++) { applyBodyLayers(p, k % 2 ? i : j, st); }
    const us = ((performance.now() - t0) * 1000) / n;
    if (process.env.POSE_COST) console.log('POSE_COST_US', us.toFixed(3));
    expect(us).toBeLessThan(25);
  });
});

describe('the corrected clips carry the arm rest the layers build on', () => {
  const lib = fullLib();
  const meanOf = (name: string, bone: (typeof BONES)[number], k: number): number => { const c = lib.get(name)!; let s = 0; for (let f = 0; f < c.frames; f++) s += c.data[f * NCH + boneChannel(bone) + k]; return (s / c.frames) * DEG; };
  it('the standing clip: elbows under 15 degrees on average, arms 4 degrees off the body on both sides, head and chest level', () => {
    for (const n of ['idle', 'idle2']) {
      expect(meanOf(n, 'elbowL', 0)).toBeLessThan(15); expect(meanOf(n, 'elbowR', 0)).toBeLessThan(15);
      expect(meanOf(n, 'armL', 2)).toBeCloseTo(-4, 0); expect(meanOf(n, 'armR', 2)).toBeCloseTo(4, 0);
      expect(Math.abs(meanOf(n, 'head', 2))).toBeLessThan(1); expect(Math.abs(meanOf(n, 'head', 1))).toBeLessThan(1);
    }
  });
  it('the walks: the same elbow and arm on both sides, head roll centred', () => {
    for (const n of ['walk', 'walkBrisk']) {
      expect(Math.abs(meanOf(n, 'elbowL', 0) - meanOf(n, 'elbowR', 0))).toBeLessThan(3);
      expect(meanOf(n, 'armL', 2)).toBeCloseTo(-5, 0); expect(meanOf(n, 'armR', 2)).toBeCloseTo(5, 0);
      expect(Math.abs(meanOf(n, 'head', 2))).toBeLessThan(1);
    }
  });
});
