import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NCH, RIG_CH, decodeBase64, decodePack, mirrorPose, sampleClip, boneChannel } from '@/entities/anim/clipPack';
import { CORE_PACK_B64 } from '@/entities/anim/corePack';
import { ClipLibrary } from '@/entities/anim/library';
import { chainBlend, cycleFrequency, idleWeight, jumpTime, rateFor } from '@/entities/anim/locomotion';
import { PLAYER_GAIT, makeGait } from '@/entities/anim/gait';
import { AnimController, type PoseTarget } from '@/entities/anim/controller';

const streetBytes = (): Uint8Array => new Uint8Array(readFileSync('public/anim/street.bin'));
const fakeModel = (): PoseTarget => {
  const o = (): THREE.Object3D => new THREE.Object3D();
  const m = { hips: o(), torso: o(), head: o(), rig: o(), arms: [o(), o()], elbows: [o(), o()], legs: [o(), o()], knees: [o(), o()], ankles: [o(), o()] };
  m.legs.forEach((l) => l.position.set(0, 0.82, 0)); m.knees.forEach((k) => k.position.set(0, -0.4, 0)); m.torso.position.set(0, 0.84, 0); m.head.position.set(0, 1.67, 0);
  m.rig.add(m.hips, m.torso, m.head, m.legs[0], m.legs[1]); m.legs.forEach((l, i) => l.add(m.knees[i])); m.arms.forEach((a, i) => { m.torso.add(a); a.add(m.elbows[i]); });
  return m;
};
const fullLib = (): ClipLibrary => { const l = ClipLibrary.fromCore(); l.add(decodePack(streetBytes())); return l; };

describe('clip loading', () => {
  it('decodes the bundled core pack with every clip the game needs', () => {
    const lib = ClipLibrary.fromCore();
    for (const n of ['idle', 'walk', 'walkBrisk', 'walkHeavy', 'jog', 'run', 'startRun', 'stopWalk', 'stopRun', 'turn', 'jump']) expect(lib.has(n), n).toBe(true);
    const walk = lib.get('walk')!;
    expect(walk.loop).toBe(true);
    expect(walk.frames).toBeGreaterThan(16);
    expect(walk.data.length).toBe(walk.frames * NCH);
    expect(walk.data.every(Number.isFinite)).toBe(true);
  });

  it('keeps the bundled data under the single-file budget (40 kB of text)', () => {
    expect(CORE_PACK_B64.length).toBeLessThanOrEqual(40 * 1024);
    expect(decodeBase64(CORE_PACK_B64).length).toBeLessThan(30 * 1024);
  });

  it('walk is a human walk: about 110 steps a minute, counter-swinging legs and arms, a few cm of pelvis bob', () => {
    const lib = ClipLibrary.fromCore();
    const w = lib.get('walk')!;
    const stepsPerMin = (2 / w.duration) * 60;
    expect(stepsPerMin).toBeGreaterThan(95);
    expect(stepsPerMin).toBeLessThan(135);
    let legMin = 9, legMax = -9, armMin = 9, armMax = -9, yMin = 9, yMax = -9, corr = 0;
    for (let f = 0; f < w.frames; f++) {
      const r = f * NCH;
      const l = w.data[r + boneChannel('legL')], a = w.data[r + boneChannel('armL')];
      legMin = Math.min(legMin, l); legMax = Math.max(legMax, l); armMin = Math.min(armMin, a); armMax = Math.max(armMax, a);
      yMin = Math.min(yMin, w.data[r + RIG_CH + 1]); yMax = Math.max(yMax, w.data[r + RIG_CH + 1]);
      corr += l * a;
    }
    expect(legMax - legMin).toBeGreaterThan(0.5);   // > 29 degrees of hip travel
    expect(armMax - armMin).toBeGreaterThan(0.15);  // arm swing present
    expect(corr).toBeLessThan(0);                   // left leg and left arm swing against each other
    expect(yMax - yMin).toBeGreaterThan(0.01);
    expect(yMax - yMin).toBeLessThan(0.1);          // pelvis bob of a few centimetres
  });

  it('loops are seamless: the pose after the last frame is the first', () => {
    const lib = fullLib();
    for (const n of ['walk', 'jog', 'run', 'idle', 'phone']) {
      const c = lib.get(n)!;
      const a = new Float32Array(NCH), b = new Float32Array(NCH), c2 = new Float32Array(NCH);
      sampleClip(c, 0, a); sampleClip(c, c.duration, b); sampleClip(c, c.duration * (1 - 1e-4), c2);
      for (let k = 0; k < NCH; k++) { expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-3); expect(Math.abs(a[k] - c2[k])).toBeLessThan(0.05); }
    }
  });

  it('mirroring twice gives the original pose back and swaps sides', () => {
    const lib = ClipLibrary.fromCore();
    const p = new Float32Array(NCH); sampleClip(lib.get('walk')!, 0.3, p);
    const q = p.slice(); mirrorPose(q);
    expect(q[boneChannel('legL')]).toBeCloseTo(p[boneChannel('legR')], 5);
    mirrorPose(q);
    for (let k = 0; k < NCH; k++) expect(q[k]).toBeCloseTo(p[k], 5);
  });

  it('loads the street pack from a file when one can be fetched, and survives when it cannot', async () => {
    const lib = ClipLibrary.fromCore();
    expect(lib.has('stumble')).toBe(false);
    const bad = await lib.loadStreet('x/street.bin', (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(bad).toBe(false);
    expect(await lib.loadStreet('x/street.bin', (async () => ({ ok: false })) as unknown as typeof fetch)).toBe(false);
    expect(await lib.loadStreet('', fetch)).toBe(false); // single-file build: no url
    expect(lib.has('walk')).toBe(true);
    const bytes = streetBytes();
    const ok = await lib.loadStreet('x/street.bin', (async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })) as unknown as typeof fetch);
    expect(ok).toBe(true);
    for (const n of ['stumble', 'sitDown', 'standUp', 'phone', 'idle2', 'walkHobble', 'walkJaunty']) expect(lib.has(n), n).toBe(true);
  });
});

describe('speed blending', () => {
  const chain = [{ speed: 1.3 }, { speed: 2.4 }, { speed: 3.7 }];
  it('weights are valid, continuous, and pick neighbouring clips', () => {
    expect(chainBlend(0.5, chain)).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(chainBlend(9, chain)).toEqual({ lo: 2, hi: 2, t: 0 });
    let last = -1;
    for (let s = 1.31; s < 2.39; s += 0.05) {
      const b = chainBlend(s, chain);
      expect(b.lo).toBe(0); expect(b.hi).toBe(1);
      expect(b.t).toBeGreaterThanOrEqual(last - 1e-9); last = b.t;
    }
    expect(chainBlend(2.4, chain).t).toBeCloseTo(1, 5);
    const mid = chainBlend(3.0, chain); expect([mid.lo, mid.hi]).toEqual([1, 2]);
  });
  it('idle fades out between a shuffle and a walk', () => {
    expect(idleWeight(0)).toBe(1);
    expect(idleWeight(1.2)).toBe(0);
    expect(idleWeight(0.4)).toBeGreaterThan(0); expect(idleWeight(0.4)).toBeLessThan(1);
  });
  it('cycle rate follows ground speed within limits', () => {
    expect(rateFor(1.3, { speed: 1.3 })).toBeCloseTo(1, 5);
    expect(rateFor(0.1, { speed: 1.3 })).toBe(0.55);
    expect(rateFor(20, { speed: 3.7 })).toBe(1.5);
    const lib = ClipLibrary.fromCore();
    const ch = [lib.get('walk')!, lib.get('jog')!, lib.get('run')!];
    const f1 = cycleFrequency(1.3, ch, chainBlend(1.3, ch)), f2 = cycleFrequency(3.7, ch, chainBlend(3.7, ch));
    expect(f2).toBeGreaterThan(f1);
    expect(cycleFrequency(1.3, ch, chainBlend(1.3, ch), 1.1)).toBeCloseTo(f1 * 1.1, 6);
  });
  it('jump time is monotonic through take-off, air and landing', () => {
    const clip = ClipLibrary.fromCore().get('jump')!;
    expect(clip.marks.length).toBe(2);
    expect(clip.marks[0]).toBeGreaterThan(0.1); expect(clip.marks[1]).toBeGreaterThan(clip.marks[0]); expect(clip.marks[1]).toBeLessThan(1);
    const seq = [
      jumpTime(clip, 'takeoff', 0, 0.07, 0.5, 0.2), jumpTime(clip, 'takeoff', 0.07, 0.07, 0.5, 0.2),
      jumpTime(clip, 'air', 0, 0.07, 0.5, 0.2), jumpTime(clip, 'air', 0.25, 0.07, 0.5, 0.2), jumpTime(clip, 'air', 0.5, 0.07, 0.5, 0.2),
      jumpTime(clip, 'land', 0, 0.07, 0.5, 0.2), jumpTime(clip, 'land', 0.2, 0.07, 0.5, 0.2),
    ];
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1] - 1e-9);
    expect(seq[seq.length - 1]).toBeCloseTo(clip.duration, 5);
  });
});

describe('per-person gait', () => {
  it('is deterministic for a seed and different between seeds', () => {
    expect(makeGait(42, 'adult')).toEqual(makeGait(42, 'adult'));
    expect(makeGait(42, 'adult')).not.toEqual(makeGait(43, 'adult'));
  });
  it('spreads cadence, stride, arm swing, posture and starting phase across a crowd', () => {
    const crowd = Array.from({ length: 300 }, (_, i) => makeGait(i * 7919 + 13, 'adult'));
    const spread = (f: (g: (typeof crowd)[0]) => number): number => Math.max(...crowd.map(f)) - Math.min(...crowd.map(f));
    expect(spread((g) => g.cadence)).toBeGreaterThan(0.18);
    expect(spread((g) => g.stride)).toBeGreaterThan(0.15);
    expect(spread((g) => g.armSwing)).toBeGreaterThan(0.7);
    expect(spread((g) => g.lean)).toBeGreaterThan(0.08);
    expect(spread((g) => g.phase)).toBeGreaterThan(0.9);
    expect(new Set(crowd.map((g) => g.walkClip)).size).toBeGreaterThanOrEqual(6);
    const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) < eps;
    let twins = 0;
    for (let i = 1; i < crowd.length; i++) if (crowd[i].walkClip === crowd[i - 1].walkClip && near(crowd[i].cadence, crowd[i - 1].cadence, 0.01) && near(crowd[i].phase, crowd[i - 1].phase, 0.03)) twins++;
    expect(twins).toBeLessThan(2);
  });
  it('old people walk slower and stoop; kids are quicker', () => {
    const avg = (age: 'old' | 'kid' | 'adult', f: (g: ReturnType<typeof makeGait>) => number): number => { let s = 0; for (let i = 0; i < 200; i++) s += f(makeGait(i * 31 + 5, age)); return s / 200; };
    expect(avg('old', (g) => g.speedScale)).toBeLessThan(avg('adult', (g) => g.speedScale));
    expect(avg('old', (g) => g.lean)).toBeGreaterThan(avg('adult', (g) => g.lean));
    expect(avg('kid', (g) => g.cadence)).toBeGreaterThan(avg('adult', (g) => g.cadence));
  });
  it('two people at the same speed hold different poses at the same moment', () => {
    const lib = fullLib();
    const a = fakeModel(), b = fakeModel();
    const ca = new AnimController(a, makeGait(1), lib), cb = new AnimController(b, makeGait(2), lib);
    for (let i = 0; i < 40; i++) { ca.update(1 / 60, { speed: 1.2 }); cb.update(1 / 60, { speed: 1.2 }); }
    const d = Math.abs(a.legs[0].rotation.x - b.legs[0].rotation.x) + Math.abs(a.arms[0].rotation.x - b.arms[0].rotation.x);
    expect(d).toBeGreaterThan(0.05);
  });
});

describe('street pack on the native app', () => {
  it('is served by the app:// protocol handler (a file under the web root) and fetched with the page-relative url the loader builds', async () => {
    const { resolveAppPath } = await import('../../../native/src/policy');
    const { APP_ORIGIN } = await import('../../../native/src/policy');
    const web = '/opt/app/web';
    // the page is app://host/index.html and the loader fetches './anim/street.bin'
    const url = new URL('./anim/street.bin', `${APP_ORIGIN}/index.html`).href;
    expect(resolveAppPath(url, web)).toBe('/opt/app/web/anim/street.bin');
    const esc = resolveAppPath(`${APP_ORIGIN}/anim/../../etc/passwd`, web); expect(esc === null || esc.startsWith(web + '/')).toBe(true); // never outside the web root
  });
});

describe('foot planting', () => {
  const ankleY = (m: PoseTarget, leg: number): number => {
    m.rig.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, -0.345, 0); // ankle: 0.345 below the knee in this fake body
    m.knees[leg].localToWorld(v);
    return v.y;
  };
  for (const [name, hip, thigh, speed] of [['average adult walking', 0.82, 0.4, 1.3], ['tall body jogging', 1.0, 0.5, 2.8], ['short body walking', 0.66, 0.32, 1.1]] as const) {
    it(`the stance foot stays on the ground: ${name}`, () => {
      const lib = fullLib();
      const m = fakeModel();
      m.legs.forEach((l) => l.position.set(0, hip, 0)); m.knees.forEach((k) => k.position.set(0, -thigh, 0));
      const c = new AnimController(m, PLAYER_GAIT, lib);
      const shin = hip - thigh - 0.075;
      let worst = 0, lowest = 9, sunk = 0;
      for (let i = 0; i < 180; i++) {
        c.update(1 / 60, { speed });
        if (i < 60) continue;
        // lowest ankle height against its rest height (0.075)
        const lo = Math.min(...[0, 1].map((l) => { const v = new THREE.Vector3(0, -shin, 0); m.rig.updateMatrixWorld(true); m.knees[l].localToWorld(v); return v.y; }));
        worst = Math.max(worst, Math.abs(lo - 0.075)); lowest = Math.min(lowest, lo); sunk = Math.max(sunk, 0.075 - lo);
      }
      void ankleY;
      expect(sunk).toBeLessThan(0.03);              // never through the floor
      expect(lowest).toBeLessThan(0.075 + 0.03);    // and the planted foot does touch it
      if (speed < 2) expect(worst).toBeLessThan(0.035); // walking: always one foot down
    });
  }
  it('walking speed (Alt) plays the walk and the default jog plays the jog at the speeds the game uses', async () => {
    const { STROLL_SPEED, WALK_SPEED, RUN_SPEED } = await import('@/entities/Player');
    expect(STROLL_SPEED).toBeCloseTo(1.6);
    expect(WALK_SPEED).toBe(3);
    expect(RUN_SPEED).toBeGreaterThan(WALK_SPEED);
    const lib = fullLib();
    const ch = [lib.get('walkBrisk')!, lib.get('jog')!, lib.get('run')!];
    expect(chainBlend(STROLL_SPEED / 1.05, ch).t).toBe(0);                 // walking: the walk clip alone
    const jog = chainBlend(WALK_SPEED / 1.05, ch);                          // jogging: between the jog and the run, nearer the jog
    expect(jog.lo).toBe(1);
  });
});

describe('controller', () => {
  it('poses every bone with finite numbers while blending idle, walk, jog and run', () => {
    const lib = fullLib();
    const m = fakeModel();
    const c = new AnimController(m, PLAYER_GAIT, lib);
    const bones = [m.hips, m.torso, m.head, ...m.arms, ...m.elbows, ...m.legs, ...m.knees, ...m.ankles!, m.rig];
    for (let i = 0; i < 600; i++) {
      const speed = Math.max(0, 3.3 * (1 + Math.sin(i / 60)) + (i > 400 ? 3 : 0));
      expect(c.update(1 / 60, { speed })).toBe(true);
      for (const b of bones) { expect(Number.isFinite(b.rotation.x + b.rotation.y + b.rotation.z + b.position.x + b.position.y + b.position.z)).toBe(true); }
    }
  });
  it('never jumps between frames: pose change per frame stays small through a start and a stop', () => {
    const lib = fullLib();
    const m = fakeModel();
    const c = new AnimController(m, PLAYER_GAIT, lib);
    const snap = (): number[] => [m.legs[0].rotation.x, m.legs[1].rotation.x, m.arms[0].rotation.x, m.torso.rotation.x, m.torso.rotation.y, m.rig.position.y];
    let prev: number[] | null = null, worst = 0;
    for (let i = 0; i < 480; i++) {
      const t = i / 60;
      const speed = t < 1 ? 0 : t < 3.5 ? 3 : t < 4.2 ? Math.max(0, 3 - (t - 3.5) * 5) : 0;
      c.update(1 / 60, { speed });
      const s = snap();
      if (prev) for (let k = 0; k < s.length; k++) worst = Math.max(worst, Math.abs(s[k] - prev[k]));
      prev = s;
    }
    expect(worst).toBeLessThan(0.35); // radians (or metres) in one 60th of a second
  });
  it('triggers the start clip on a run-up and the stop clip when a walk ends, even when speed ramps over several frames', () => {
    const lib = fullLib();
    const c = new AnimController(fakeModel(), PLAYER_GAIT, lib);
    let busyAtStart = false, busyAtStop = false;
    for (let i = 0; i < 90; i++) { c.update(1 / 60, { speed: Math.min(4, i * 0.12) }); if (i > 20 && c.busy) busyAtStart = true; }
    for (let i = 0; i < 120; i++) c.update(1 / 60, { speed: 4 });
    for (let i = 0; i < 40; i++) c.update(1 / 60, { speed: 0 });
    c.update(1 / 60, { speed: 0 });
    busyAtStop = c.busy;
    expect(busyAtStart).toBe(true);
    expect(busyAtStop).toBe(true);
    for (let i = 0; i < 200; i++) c.update(1 / 60, { speed: 0 });
    expect(c.busy).toBe(false);
  });
  it('plays a one-shot clip, then hands back', () => {
    const lib = fullLib();
    const c = new AnimController(fakeModel(), PLAYER_GAIT, lib);
    expect(c.playOnce('nope')).toBe(false);
    expect(c.playOnce('stumble')).toBe(true);
    expect(c.busy).toBe(true);
    for (let i = 0; i < 200; i++) c.update(1 / 60, { speed: 0 });
    expect(c.busy).toBe(false);
  });
  it('reports false when the core clips are missing so the caller can fall back to the procedural walk', () => {
    expect(new AnimController(fakeModel(), PLAYER_GAIT, new ClipLibrary([])).update(0.016, { speed: 1 })).toBe(false);
  });
  it('falls back to the plain walk when a street style is not loaded', () => {
    const lib = ClipLibrary.fromCore();
    const c = new AnimController(fakeModel(), { ...PLAYER_GAIT, walkClip: 'walkHobble' }, lib);
    expect(c.update(0.016, { speed: 1.2 })).toBe(true);
  });
  it('a jump drives the legs through crouch, tuck and landing', () => {
    const lib = ClipLibrary.fromCore();
    const m = fakeModel();
    const c = new AnimController(m, PLAYER_GAIT, lib);
    c.update(0.016, { speed: 0 });
    const stand = m.knees[0].rotation.x;
    for (let i = 0; i < 6; i++) c.update(0.02, { speed: 0, jump: { phase: 'air', t: 0.2, vy: 4.6 } });
    expect(Math.abs(m.knees[0].rotation.x - stand)).toBeGreaterThan(0.2);
  });
});
