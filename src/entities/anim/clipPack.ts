/**
 * Compact motion clips: decoding, sampling and mirroring. The packs are built by scripts/anim/build-clips.mjs from CMU Graphics Lab
 * motion capture (see docs/CREDITS.md). One clip is a few hundred bytes to a couple of kilobytes: every channel is quantised to 8 bits
 * between its own minimum and range, channels that never move cost four header bytes and no data.
 *
 * Channels (NCH = 42): for each bone in BONES the Euler XYZ rotation (x, y, z) in radians, in the parent's frame, then the rig's
 * position x (sway), y (pelvis height change), z (surge) in metres. Clip rows are poses; a looping clip omits its closing pose.
 */
export const BONES = ['hips', 'torso', 'head', 'armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'legR', 'kneeR', 'ankleL', 'ankleR'] as const;
export type BoneName = (typeof BONES)[number];
export const NCH = BONES.length * 3 + 3;
export const RIG_CH = BONES.length * 3;
export const boneChannel = (b: BoneName): number => BONES.indexOf(b) * 3;

export interface Clip {
  name: string;
  loop: boolean;
  /** seconds for one pass (a loop's period) */
  duration: number;
  /** ground speed (m/s, our proportions) of the captured motion, for matching playback rate to travel */
  speed: number;
  /** net heading change over the clip (rad, our frame); non-zero only for the turn */
  turn: number;
  /** event times as fractions of the clip (jump: [feet leave the ground, feet land]) */
  marks: number[];
  /** rig.y is an absolute pelvis offset (jump, lying), not a foot-contact height */
  absY: boolean;
  frames: number;
  /** frames x NCH */
  data: Float32Array;
}

export function decodePack(bytes: Uint8Array): Clip[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u8 = (): number => dv.getUint8(p++);
  const u16 = (): number => { const v = dv.getUint16(p, true); p += 2; return v; };
  const i16 = (): number => { const v = dv.getInt16(p, true); p += 2; return v; };
  if (u8() !== 1) throw new Error('clip pack: unknown version');
  const count = u8();
  const clips: Clip[] = [];
  for (let c = 0; c < count; c++) {
    const nameLen = u8();
    let name = '';
    for (let i = 0; i < nameLen; i++) name += String.fromCharCode(u8());
    const flags = u8();
    const frames = u16(), durationMs = u16(), speed100 = u16(), turn1000 = i16();
    const marks: number[] = [];
    for (let m = u8(); m > 0; m--) marks.push(u8() / 255);
    const mins = new Float32Array(NCH), ranges = new Float32Array(NCH);
    for (let k = 0; k < NCH; k++) { mins[k] = i16() / 4096; ranges[k] = u16() / 8192; }
    const data = new Float32Array(frames * NCH);
    for (let k = 0; k < NCH; k++) {
      if (ranges[k] === 0) { for (let f = 0; f < frames; f++) data[f * NCH + k] = mins[k]; continue; }
      for (let f = 0; f < frames; f++) data[f * NCH + k] = mins[k] + (u8() / 255) * ranges[k];
    }
    clips.push({ name, loop: (flags & 1) !== 0, absY: (flags & 2) !== 0, duration: durationMs / 1000, speed: speed100 / 100, turn: turn1000 / 1000, marks, frames, data });
  }
  return clips;
}

export function decodeBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Catmull-Rom between frames; loops wrap, one-shots clamp. `t` in seconds (loops: any value, wrapped). Writes NCH numbers into `out`. */
export function sampleClip(clip: Clip, t: number, out: Float32Array): void {
  const n = clip.frames, d = clip.data;
  let x: number;
  if (clip.loop) { x = (((t / clip.duration) % 1) + 1) % 1 * n; } else { x = Math.min(1, Math.max(0, t / clip.duration)) * (n - 1); }
  const i1 = Math.floor(x), u = x - i1;
  const at = (i: number): number => (clip.loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)));
  const o0 = at(i1 - 1) * NCH, o1 = at(i1) * NCH, o2 = at(i1 + 1) * NCH, o3 = at(i1 + 2) * NCH;
  const u2 = u * u, u3 = u2 * u;
  for (let k = 0; k < NCH; k++) {
    const p0 = d[o0 + k], p1 = d[o1 + k], p2 = d[o2 + k], p3 = d[o3 + k];
    out[k] = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
}

/** Left/right mirror of a pose in place: swap the limb pairs, flip yaw and roll, flip the sway. */
export function mirrorPose(p: Float32Array): void {
  const swap = (a: BoneName, b: BoneName): void => { const ia = boneChannel(a), ib = boneChannel(b); for (let q = 0; q < 3; q++) { const t = p[ia + q]; p[ia + q] = p[ib + q]; p[ib + q] = t; } };
  swap('armL', 'armR'); swap('elbowL', 'elbowR'); swap('legL', 'legR'); swap('kneeL', 'kneeR'); swap('ankleL', 'ankleR');
  for (let b = 0; b < BONES.length; b++) { p[b * 3 + 1] *= -1; p[b * 3 + 2] *= -1; }
  p[RIG_CH] *= -1;
}
