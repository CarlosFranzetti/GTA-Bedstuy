import { describe, expect, it } from 'vitest';
import { keyAction, swingCurve, type ActionPose } from '@/entities/anim/controller';
import { NCH, boneChannel } from '@/entities/anim/clipPack';

const pose = (a: ActionPose): Float32Array => { const p = new Float32Array(NCH); keyAction(p, a); return p; };
const at = (p: Float32Array, b: Parameters<typeof boneChannel>[0], axis = 0): number => p[boneChannel(b) + axis];

describe('hand-keyed action poses', () => {
  it('a right cross drives the right arm forward at the hit, with the guard hand up', () => {
    const start = pose({ kind: 'punchR', k: 0.0 });
    const hit = pose({ kind: 'punchR', k: 0.4 });
    expect(at(hit, 'armR')).toBeGreaterThan(1.2);           // arm out at chest height
    expect(at(hit, 'elbowR')).toBeLessThan(0.3);            // and straight
    expect(at(start, 'armR')).toBeLessThan(at(hit, 'armR'));
    expect(at(hit, 'armL')).toBeGreaterThan(0.6);           // the guard hand is up
  });
  it('a left jab is the mirror: the left arm leads and the torso turns the other way', () => {
    const r = pose({ kind: 'punchR', k: 0.4 }), l = pose({ kind: 'punchL', k: 0.4 });
    expect(at(l, 'armL')).toBeCloseTo(at(r, 'armR'), 5);
    expect(Math.sign(at(l, 'torso', 1))).toBe(-Math.sign(at(r, 'torso', 1)));
  });
  it('the heavy hit is a hook: the arm swings out and round, and the body leans into it more than a cross', () => {
    const early = pose({ kind: 'heavy', k: 0.05 }), hit = pose({ kind: 'heavy', k: 0.5 });
    expect(at(hit, 'armR', 1)).toBeGreaterThan(at(early, 'armR', 1) + 0.6); // swept forward in a flat arc
    expect(at(hit, 'armR', 2)).toBeGreaterThan(1);                         // out to the side
    expect(at(hit, 'torso')).toBeLessThan(at(pose({ kind: 'punchR', k: 0.4 }), 'torso'));
    expect(at(hit, 'torso', 1)).toBeGreaterThan(at(early, 'torso', 1) + 0.7); // a big turn
  });
  it('the arm snaps out fast and comes back slower', () => {
    const hit = 0.4;
    let out = 0, back = 0;
    for (let k = 0; k <= 1; k += 0.005) { if (swingCurve(k, hit) >= 0.1 && swingCurve(k, hit) <= 0.9 && k < hit + 0.01) out += 0.005; }
    for (let k = hit + 0.06; k <= 1; k += 0.005) { if (swingCurve(k, hit) >= 0.1 && swingCurve(k, hit) <= 0.9) back += 0.005; }
    expect(out).toBeLessThan(back * 0.6);
    expect(swingCurve(hit, hit)).toBeCloseTo(1, 5);
    expect(swingCurve(1, hit)).toBeCloseTo(0, 5);
    expect(swingCurve(hit * 0.3, hit)).toBeLessThan(0); // drawn back a touch first
  });
  it('a punch is boxed from a stance: lead foot forward, hips turn ahead of the shoulders, the lead foot steps in, the rear foot pivots', () => {
    const guard = pose({ kind: 'punchR', k: 0 }), hit = pose({ kind: 'punchR', k: 0.4 });
    expect(at(guard, 'legL')).toBeGreaterThan(at(guard, 'legR') + 0.2);          // staggered
    expect(at(pose({ kind: 'punchL', k: 0.4 }), 'legL')).toBeGreaterThan(at(guard, 'legL') + 0.1); // the jab steps in
    expect(at(hit, 'legR', 1)).toBeGreaterThan(at(guard, 'legR', 1) + 0.3);      // rear foot pivots
    const early = pose({ kind: 'punchR', k: 0.34 }); // hips lead: by now the hips have moved a larger share of their turn than the torso
    const share = (b: 'hips' | 'torso'): number => (at(early, b, 1) - at(guard, b, 1)) / (at(hit, b, 1) - at(guard, b, 1));
    expect(share('hips')).toBeGreaterThan(share('torso'));
    const surge = (a: ActionPose): number => pose(a)[42 - 3 + 2];
    expect(surge({ kind: 'heavy', k: 0.5 })).toBeLessThan(surge({ kind: 'punchL', k: 0.4 })); // forward is negative z: the hook lunges furthest
  });
  it('the throw cocks the right arm up and back, then whips it forward', () => {
    const cock = pose({ kind: 'throw', k: 0.3 }), release = pose({ kind: 'throw', k: 0.5 });
    expect(at(cock, 'armR')).toBeGreaterThan(2.4);
    expect(at(release, 'armR')).toBeLessThan(at(cock, 'armR'));
    expect(at(cock, 'elbowR')).toBeGreaterThan(1);
  });
  it('aim levels both arms and the shot kicks the gun arm', () => {
    const down = pose({ kind: 'aim', k: 0 }), up = pose({ kind: 'aim', k: 1 }), kick = pose({ kind: 'aim', k: 1, recoil: 1 });
    expect(at(up, 'armR')).toBeGreaterThan(1.3);
    expect(at(down, 'armR')).toBeLessThan(0.3);
    expect(at(up, 'armL')).toBeGreaterThan(1);
    expect(at(kick, 'armR')).toBeGreaterThan(at(up, 'armR'));
    expect(at(kick, 'elbowR')).toBeGreaterThan(at(up, 'elbowR'));
  });
});
