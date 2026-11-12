import { describe, expect, it } from 'vitest';
import { ClipLibrary } from '@/entities/anim/library';
import { decodeBase64, decodePack, boneChannel, NCH, type BoneName, type Clip } from '@/entities/anim/clipPack';
import { CORE_PACK_B64 } from '@/entities/anim/corePack';
import { POSTURE, settlePosture } from '@/entities/anim/posture';

// The captured stand is a soft-kneed hunch (both knees bent about 30 degrees, chest 12 degrees forward): on a game character it read
// as crouching. posture.ts moves each looping clip's average pose upright and keeps the motion about it.
const DEG = 180 / Math.PI;
const mean = (c: Clip, b: BoneName): number => { let s = 0; for (let f = 0; f < c.frames; f++) s += c.data[f * NCH + boneChannel(b)]; return (s / c.frames) * DEG; };
const raw = (): Clip[] => decodePack(decodeBase64(CORE_PACK_B64));

describe('posture correction of the captured clips', () => {
  it('the raw standing clip really is a crouch (why the correction exists)', () => {
    const idle = raw().find((c) => c.name === 'idle')!;
    expect((mean(idle, 'kneeL') + mean(idle, 'kneeR')) / 2).toBeLessThan(-20);
    expect(mean(idle, 'torso')).toBeLessThan(-8);
  });

  it('every clip in the library with a posture entry has its chest and head at the stated average', () => {
    const lib = ClipLibrary.fromCore();
    let n = 0;
    for (const name of lib.names) {
      const t = POSTURE[name];
      if (!t) continue;
      n++;
      const c = lib.get(name)!;
      expect(mean(c, 'torso'), name + ' chest').toBeCloseTo(t.torso, 0);
      expect(mean(c, 'head'), name + ' head').toBeCloseTo(t.head, 0);
      expect(Math.abs(t.torso), name + ' is upright').toBeLessThanOrEqual(9);
    }
    expect(n).toBeGreaterThanOrEqual(6); // idle, walk, walkBrisk, walkHeavy, jog, run in the core pack
  });

  it('the stand has nearly straight legs, no knee bends backwards, and the soles stay as flat as they were captured', () => {
    const before = raw().find((c) => c.name === 'idle')!;
    const after = ClipLibrary.fromCore().get('idle')!;
    expect((mean(after, 'kneeL') + mean(after, 'kneeR')) / 2).toBeGreaterThan(-9);
    expect(Math.abs((mean(after, 'legL') + mean(after, 'legR')) / 2)).toBeLessThan(4);
    for (let f = 0; f < after.frames; f++) for (const s of ['L', 'R'] as const) {
      const sum = (c: Clip): number => c.data[f * NCH + boneChannel(`leg${s}`)] + c.data[f * NCH + boneChannel(`knee${s}`)] + c.data[f * NCH + boneChannel(`ankle${s}`)];
      expect(after.data[f * NCH + boneChannel(`knee${s}`)]).toBeLessThan(0);
      expect(sum(after)).toBeCloseTo(sum(before), 4); // thigh + knee + ankle pitch is the sole's pitch
    }
  });

  it('keeps the motion: the stand still shifts its weight, and a clip is only corrected once', () => {
    const before = raw().find((c) => c.name === 'idle')!;
    const after = ClipLibrary.fromCore().get('idle')!;
    const range = (c: Clip, b: BoneName): number => { let lo = 9, hi = -9; for (let f = 0; f < c.frames; f++) { const v = c.data[f * NCH + boneChannel(b)]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
    expect(range(after, 'torso')).toBeCloseTo(range(before, 'torso') * 0.6, 4); // the rocking is kept at 60 percent
    expect(range(after, 'legL')).toBeGreaterThan(0.02);
    const once = Float32Array.from(after.data);
    settlePosture(after);
    expect(Array.from(after.data)).toEqual(Array.from(once));
  });

  it('leaves the one-shots alone (start, stop, turn, jump are played as captured)', () => {
    const lib = ClipLibrary.fromCore();
    for (const c of raw()) if (!POSTURE[c.name]) expect(Array.from(lib.get(c.name)!.data), c.name).toEqual(Array.from(c.data));
  });
});
