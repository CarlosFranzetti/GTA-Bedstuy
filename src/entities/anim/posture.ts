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
  /**
   * POSE (22 Nov): the arms. The captured subjects hold the forearms well forward (idle: 34 degrees of elbow flexion, walk 20 to 29, a different
   * mean for each arm) and one upper arm further from the body than the other; the mesh's forearm already points about 10 degrees forward at rest,
   * so a person standing read as holding something. `elbow`: mean flexion of both elbows (deg), `elbowKeep` how much of the captured bending is kept
   * (1 = all), `elbowMin` the least flexion at any frame (deg). `abd`: the mean lift of each upper arm away from the body (deg, the same for both
   * arms), `armX`: added to both upper arms' mean forward swing (deg, + = forward).
   */
  /**
   * POSE: level the body. The capture subjects walk and stand with the chest leaning 3 to 6 degrees to one side and the head tilted up to 9 degrees
   * (the walk clip's head roll averages -9): `level` moves the mean roll of the chest to -0.5 degrees and of the head to 0 and keeps the motion about
   * them (the lean over the standing leg, the nod). `headYaw` / `torsoYaw`: [mean deg, how much of the captured turning is kept]: the standing
   * clips sweep the head from -67 to +59 degrees every four seconds and twist the chest by 30, which reads as someone scanning a room.
   */
  level?: boolean;
  headYaw?: readonly [number, number];
  torsoYaw?: readonly [number, number];
  elbow?: number;
  elbowKeep?: number;
  elbowMin?: number;
  abd?: number;
  armX?: number;
}

const STAND: Target = { torso: -2, torsoKeep: 0.6, head: -3, headKeep: 0.6, hips: -2, leg: 2, knee: -3, elbow: 5, elbowKeep: 0.7, elbowMin: 2, abd: 4, level: true, headYaw: [0, 0.4], torsoYaw: [0, 0.5] };
const WALKARMS = { elbow: 16, elbowKeep: 0.85, elbowMin: 5, abd: 5, level: true } as const;

export const POSTURE: Readonly<Record<string, Target>> = {
  idle: STAND,
  idle2: STAND,
  talk: { torso: -2, head: 2, headKeep: 0.8 },
  talk2: { torso: -1, head: 0, headKeep: 0.8 },
  eat: { torso: -3, head: -14 },
  phone: { torso: 2, head: -12 },
  walk: { torso: -3, head: -1, ...WALKARMS },
  walkBrisk: { torso: -4, head: -1, ...WALKARMS },
  walkFast: { torso: -4, head: 0, ...WALKARMS },
  walkStroll: { torso: -2, head: 0, ...WALKARMS },
  walkHeavy: { torso: -4, head: -5 },
  walkJaunty: { torso: -1, head: -2, ...WALKARMS },
  walkAngry: { torso: -8, head: -9 },   // still the one who leans into it, without the 16 degree hunch
  walkSad: { torso: -6, head: -12 },    // slumped forward (the capture leaned back 7 degrees with the head down)
  walkHobble: { torso: -7, head: -6, ...WALKARMS },
  walkLimp: { torso: -3, head: -1, ...WALKARMS },
  walkDrunk: { torso: 0, head: 4 },
  jog: { torso: -6, head: 2, abd: 6, armX: 8, level: true },
  run: { torso: -9, head: 3, abd: 6, armX: 12, level: true },
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
  // level the body, and keep the standing head and chest from sweeping round (POSE)
  if (t.level) {
    const tz = x('torso') + 2, hz = x('head') + 2;
    shift(c, tz, -0.5 * RAD - mean(c, tz));
    const m = mean(c, hz);
    for (let f = 0; f < c.frames; f++) { const i = f * NCH + hz; c.data[i] = (c.data[i] - m) * 0.7; }
  }
  for (const [spec, ch] of [[t.headYaw, x('head') + 1], [t.torsoYaw, x('torso') + 1]] as const) {
    if (!spec) continue;
    const m = mean(c, ch);
    for (let f = 0; f < c.frames; f++) { const i = f * NCH + ch; c.data[i] = spec[0] * RAD + (c.data[i] - m) * spec[1]; }
  }
  // the arms (POSE): elbows that bend a little, upper arms a few degrees clear of the body, the same on both sides
  if (t.elbow !== undefined) {
    const keep = t.elbowKeep ?? 1;
    for (const side of ['L', 'R'] as const) {
      const ch = x(`elbow${side}`), m = mean(c, ch);
      let lo = Infinity;
      for (let f = 0; f < c.frames; f++) { const i = f * NCH + ch; c.data[i] = t.elbow * RAD + (c.data[i] - m) * keep; lo = Math.min(lo, c.data[i]); }
      const floor = (t.elbowMin ?? 0) * RAD;
      if (lo < floor) shift(c, ch, floor - lo);
    }
  }
  if (t.abd !== undefined) {
    // the left arm (at -x) is lifted away by a negative roll, the right arm by a positive one
    for (const [side, sign] of [['L', -1], ['R', 1]] as const) { const ch = x(`arm${side}`) + 2; shift(c, ch, sign * t.abd * RAD - mean(c, ch)); }
  }
  if (t.armX !== undefined) for (const side of ['L', 'R'] as const) shift(c, x(`arm${side}`), t.armX * RAD);
  return c;
}
