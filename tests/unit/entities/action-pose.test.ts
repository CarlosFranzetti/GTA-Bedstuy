import { describe, expect, it } from 'vitest';
import { keyAction, type ActionPose } from '@/entities/anim/controller';
import { NCH, boneChannel } from '@/entities/anim/clipPack';

const pose = (a: ActionPose): Float32Array => { const p = new Float32Array(NCH); keyAction(p, a); return p; };
const at = (p: Float32Array, b: Parameters<typeof boneChannel>[0], axis = 0): number => p[boneChannel(b) + axis];

describe('hand-keyed action poses', () => {
  it('a right jab drives the right arm forward at the hit and leaves the legs alone', () => {
    const start = pose({ kind: 'punchR', k: 0.0 });
    const hit = pose({ kind: 'punchR', k: 0.4 });
    expect(at(hit, 'armR')).toBeGreaterThan(1.2);           // arm out at chest height
    expect(at(hit, 'elbowR')).toBeLessThan(0.3);            // and straight
    expect(at(start, 'armR')).toBeLessThan(at(hit, 'armR'));
    expect(at(hit, 'armL')).toBeGreaterThan(0.6);           // the guard hand is up
    for (const b of ['legL', 'legR', 'kneeL', 'kneeR', 'hips'] as const) for (let a = 0; a < 3; a++) expect(at(hit, b, a)).toBe(0);
  });
  it('a left jab is the mirror: the left arm leads and the torso turns the other way', () => {
    const r = pose({ kind: 'punchR', k: 0.4 }), l = pose({ kind: 'punchL', k: 0.4 });
    expect(at(l, 'armL')).toBeCloseTo(at(r, 'armR'), 5);
    expect(Math.sign(at(l, 'torso', 1))).toBe(-Math.sign(at(r, 'torso', 1)));
  });
  it('the heavy hit winds back further and leans into it', () => {
    const jab = pose({ kind: 'punchR', k: 0.1 }), heavy = pose({ kind: 'heavy', k: 0.1 });
    expect(at(heavy, 'armR')).toBeLessThan(at(jab, 'armR'));
    expect(at(pose({ kind: 'heavy', k: 0.5 }), 'torso')).toBeLessThan(0);
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
