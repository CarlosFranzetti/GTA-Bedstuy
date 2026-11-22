/**
 * BODY seat: the proportions of the shipped MakeHuman bases, corrected once when a base is loaded (all three levels, the rig, the rings and the
 * landmarks move together, so garments, legs, painters and the skin bake all see the same body).
 *
 * Measured on the bases (22 Nov): the elbow stood 0.027 of stature too high, the wrist 0.03 too high and the hand was a third too short, so the
 * fingertips of a hanging arm fell at 0.425 of stature (real people: 0.375, mid-thigh; ANSUR II via docs/reference/gta5-characters.md) and the
 * upper arm was a fifth short. The arm is re-spaced along its length: shoulder fixed, elbow 0.630, wrist 0.485, fingertip 0.375 of stature.
 */
import type { MhLod, MhShape } from './pedMesh';
import { weldedNormals } from './pedMesh';

export const ARM_TARGET = { elbow: 0.630, wrist: 0.485, tip: 0.375 } as const;
const ARM_BONES = [4, 5, 6, 7];

function armWeight(L: MhLod, i: number): number {
  let t = 0;
  for (let k = 0; k < 4; k++) if (ARM_BONES.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k];
  return Math.min(1, t);
}

/** piecewise linear map of height along the arm: [from] anchors to [to] anchors, shifted below the last */
function armMap(from: number[], to: number[]): (y: number) => number {
  return (y) => {
    if (y >= from[0]) return y;
    for (let i = 1; i < from.length; i++) if (y >= from[i]) return to[i] + ((y - from[i]) / (from[i - 1] - from[i])) * (to[i - 1] - to[i]);
    return y + (to[from.length - 1] - from[from.length - 1]);
  };
}

export function normalizeShape(s: MhShape): MhShape {
  const H = s.landmarks.crownY, sh = s.rig.shoulderL[1], el = s.rig.elbowL[1], wr = s.rig.wristL[1];
  const hi = s.lods.hi;
  let tip = Infinity;
  for (let i = 0; i < hi.position.length / 3; i++) if (hi.position[i * 3] < 0 && armWeight(hi, i) > 0.5) tip = Math.min(tip, hi.position[i * 3 + 1]);
  const f = armMap([sh, el, wr, tip], [sh, ARM_TARGET.elbow * H, ARM_TARGET.wrist * H, ARM_TARGET.tip * H]);
  for (const L of [s.lods.hi, s.lods.mid, s.lods.far]) {
    const n = L.position.length / 3, before = weldedNormals(L.position, L.index);
    for (let i = 0; i < n; i++) {
      const w = armWeight(L, i);
      if (w <= 0) continue;
      const y = L.position[i * 3 + 1];
      L.position[i * 3 + 1] = y + (f(y) - y) * w;
    }
    const now = weldedNormals(L.position, L.index);
    if (L.normal0) for (let i = 0; i < now.length; i += 3) {
      const x = L.normal0[i] + now[i] - before[i], y = L.normal0[i + 1] + now[i + 1] - before[i + 1], z = L.normal0[i + 2] + now[i + 2] - before[i + 2], l = Math.hypot(x, y, z) || 1;
      L.normal0[i] = x / l; L.normal0[i + 1] = y / l; L.normal0[i + 2] = z / l;
    }
    L.normal = now;
  }
  for (const k of Object.keys(s.rig)) if (/^(elbow|wrist)/.test(k)) s.rig[k][1] = f(s.rig[k][1]);
  s.landmarks.wristY = f(s.landmarks.wristY);
  for (const rs of [s.armRings.upper, s.armRings.fore]) for (const r of rs) if (r) r[0] = f(r[0]);
  void wr;
  return s;
}

// ---------------------------------------------------------------- what the other seats read from a built person (metres, in world scale, at rest)
import type { PedModel } from './pedBody';
import { bodyTypeOf } from './pedBodyTypes';
import { shapeByName } from './pedMesh';

const segLen = (o: { position: { x: number; y: number; z: number } }): number => Math.hypot(o.position.x, o.position.y, o.position.z);
/** leg segments of a built person: hip joint to knee, knee to ankle joint, ankle joint to the floor, and the whole (hip joint height) */
export function legSegments(p: PedModel): { thigh: number; shin: number; ankleHeight: number; total: number } {
  const sy = p.group.scale.y, thigh = segLen(p.knees[0]) * sy, shin = (p.ankles ? segLen(p.ankles[0]) : 0.4) * sy, total = (p.legs[0].position.y) * sy;
  return { thigh, shin, ankleHeight: Math.max(0, total - thigh - shin), total };
}
/** hip joint height above the floor: what a foot-planting solver treats as the leg's reach (thigh + shin + ankle height) */
export const legLength = (p: PedModel): number => legSegments(p).total;
/** arm segments: shoulder joint to elbow, elbow to wrist (the hand hangs below that: handLength) and the reach of the straight arm to the fingertips */
export function armSegments(p: PedModel): { upper: number; fore: number; hand: number; total: number } {
  const sy = p.group.scale.y, upper = segLen(p.elbows[0]) * sy * (p.arms[0].scale.y || 1), s = shapeByName(p.group.userData.pedShape);
  const wrist = s ? s.rig.wristL : null, el = s ? s.rig.elbowL : null;
  const fore = wrist && el ? Math.hypot(wrist[0] - el[0], wrist[1] - el[1], wrist[2] - el[2]) * sy : 0.26 * sy;
  const hand = (s ? s.landmarks.wristY - ARM_TARGET.tip * s.landmarks.crownY : 0.19) * sy;
  return { upper, fore, hand, total: upper + fore + hand };
}
export const armLength = (p: PedModel): number => armSegments(p).total;
/** half the width of the body's torso (without the arms) at a height above the floor, from the base shape's rings and the person's type and scale: a close estimate for placing hands, hip props and sleeves, not a surface */
export function torsoHalfWidthAt(p: PedModel, height: number): number {
  const s = shapeByName(p.group.userData.pedShape);
  if (!s) return 0.17 * p.group.scale.x;
  const bt = bodyTypeOf(p.spec), y = height / p.group.scale.y, rings = [...s.hipRings, ...s.torsoRings].filter((r) => r).sort((a, b) => a[0] - b[0]);
  let r = rings[rings.length - 1];
  for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) { const a = rings[i - 1], b = rings[i], t = (y - a[0]) / (b[0] - a[0] || 1); r = [y, a[1] + (b[1] - a[1]) * t, 0, 0]; break; }
  const k = y > s.rig.shoulderL[1] - 0.12 ? bt.shoulders : y < s.rig.hipL[1] + 0.05 ? bt.hips : 1 + 0.5 * (bt.belly * 1.1 + bt.hips - 1);
  return r[1] * k * p.group.scale.x;
}
