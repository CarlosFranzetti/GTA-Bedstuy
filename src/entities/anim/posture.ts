import { boneChannel, NCH, type BoneName, type Clip } from './clipPack';

/**
 * Posture correction for the captured clips, applied once when a clip enters the library.
 *
 * The capture subjects stand and walk the way real people do in a lab: knees soft (the standing take holds both knees bent about
 * 30 degrees), chest tipped 10 to 16 degrees forward, eyes on the floor. On a game character seen from behind and above that reads
 * as a crouching, hunched figure. The correction moves the AVERAGE pose of each looping clip to an upright one and keeps the motion
 * around that average (the weight shifts, the stride, the sway), so nothing is re-keyed and nothing new is invented.
 *
 * Angles are degrees here; forward pitch is negative x (see controller.ts). A knee bends with negative x and the ankle carries the
 * opposite of thigh plus knee so the sole stays flat, which is why the ankle is never given a target of its own.
 */
interface Target {
  /** mean chest pitch, and how much of the chest's own rocking is kept (1 = all) */
  torso: number;
  torsoKeep?: number;
  /** mean head pitch, and how much of the head's own nodding is kept (1 = all) */
  head: number;
  headKeep?: number;
  /** mean pelvis pitch; omitted = left as captured */
  hips?: number;
  /** standing clips only: mean thigh and knee pitch (the average of both legs is moved there, the left/right difference stays) */
  leg?: number;
  knee?: number;
}

const STAND: Target = { torso: -2, torsoKeep: 0.6, head: -3, headKeep: 0.6, hips: -2, leg: 2, knee: -6 };

export const POSTURE: Readonly<Record<string, Target>> = {
  idle: STAND,
  idle2: STAND,
  talk: { torso: -2, head: 2, headKeep: 0.8 },
  talk2: { torso: -1, head: 0, headKeep: 0.8 },
  eat: { torso: -3, head: -14 },
  phone: { torso: 2, head: -12 },
  walk: { torso: -3, head: -1 },
  walkBrisk: { torso: -4, head: -1 },
  walkFast: { torso: -4, head: 0 },
  walkStroll: { torso: -2, head: 0 },
  walkHeavy: { torso: -4, head: -5 },
  walkJaunty: { torso: -1, head: -2 },
  walkAngry: { torso: -8, head: -9 },   // still the one who leans into it, without the 16 degree hunch
  walkSad: { torso: -6, head: -12 },    // slumped forward (the capture leaned back 7 degrees with the head down)
  walkHobble: { torso: -7, head: -6 },
  walkLimp: { torso: -3, head: -1 },
  walkDrunk: { torso: 0, head: 4 },
  jog: { torso: -6, head: 2 },
  run: { torso: -9, head: 3 },
};

const RAD = Math.PI / 180;

function mean(c: Clip, ch: number): number {
  let s = 0;
  for (let f = 0; f < c.frames; f++) s += c.data[f * NCH + ch];
  return s / c.frames;
}

function shift(c: Clip, ch: number, by: number): void {
  for (let f = 0; f < c.frames; f++) c.data[f * NCH + ch] += by;
}

/** Corrects one clip in place (idempotent: a clip is marked once it has been done). Clips without an entry are left alone. */
export function settlePosture(c: Clip): Clip {
  const t = POSTURE[c.name];
  const done = c as Clip & { settled?: boolean };
  if (!t || done.settled) return c;
  done.settled = true;
  const x = (b: BoneName): number => boneChannel(b);
  {
    const ch = x('torso'), m = mean(c, ch), keep = t.torsoKeep ?? 1;
    for (let f = 0; f < c.frames; f++) { const i = f * NCH + ch; c.data[i] = t.torso * RAD + (c.data[i] - m) * keep; }
  }
  // the head: move the average, and optionally keep only part of the nodding about it
  {
    const ch = x('head'), m = mean(c, ch), keep = t.headKeep ?? 1;
    for (let f = 0; f < c.frames; f++) { const i = f * NCH + ch; c.data[i] = t.head * RAD + (c.data[i] - m) * keep; }
  }
  if (t.hips !== undefined) shift(c, x('hips'), t.hips * RAD - mean(c, x('hips')));
  if (t.leg !== undefined && t.knee !== undefined) {
    const dLeg = t.leg * RAD - (mean(c, x('legL')) + mean(c, x('legR'))) / 2;
    const dKnee = t.knee * RAD - (mean(c, x('kneeL')) + mean(c, x('kneeR'))) / 2;
    for (const s of ['L', 'R'] as const) {
      const lc = x(`leg${s}`), kc = x(`knee${s}`), ac = x(`ankle${s}`);
      for (let f = 0; f < c.frames; f++) {
        const o = f * NCH;
        const leg = c.data[o + lc] + dLeg;
        const knee = Math.min(-1 * RAD, c.data[o + kc] + dKnee); // a knee never bends backwards
        c.data[o + ac] -= leg - c.data[o + lc] + (knee - c.data[o + kc]); // the ankle takes the opposite, so the sole stays flat
        c.data[o + lc] = leg; c.data[o + kc] = knee;
      }
    }
  }
  return c;
}
