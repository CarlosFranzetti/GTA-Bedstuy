/**
 * Heads for the MakeHuman people (Ines Loft, HEADS lane): the face as real geometry.
 *
 * The shipped glbs carry a MakeHuman head (brow ridge, eye sockets, nose, lips, jaw, ears) simplified with most of its triangles on the
 * face (scripts/people-pipeline.mjs). The macro targets give each population group and sex a base structure; this module adds the rest of
 * what makes faces differ: a per-person set of FACE TRAITS (jaw, chin, nose, brow, cheeks, lips, eye spacing, ears, head proportions),
 * applied at load as smooth displacement fields on the head vertices. Zero bytes of new mesh data, deterministic per person id, and the
 * painted face (pedFace.ts) is attached by UV so every painted feature travels with the surface it belongs to.
 *
 * Traits are drawn from the same ranges for every population group: the group only sets the base structure through the blend of
 * MakeHuman's macro targets; nothing here pushes a group toward a type. Age and sex shift the ranges a little (older faces get a longer,
 * softer nose and jaw; stronger brow and jaw on average for men, fuller lips on average for women), and every person is an individual.
 */
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec } from '@/textures/painters/ped';

const HEAD_BONE = 3;
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
const gauss = (d: number, w: number): number => Math.exp(-(d / w) * (d / w));
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** deterministic number in [-1, 1] with a bell-ish shape (sum of two uniforms) for a person and a trait name */
function bell(id: string, trait: string): number {
  const a = (hash(`${id}:${trait}:a`) % 10007) / 10007, b = (hash(`${id}:${trait}:b`) % 10009) / 10009;
  return a + b - 1;
}

export interface FaceTraits {
  /** relative width of the jaw / lower face (1 = shipped shape) */ jawW: number;
  /** chin: forward and down in metres */ chinFwd: number; chinDrop: number;
  /** nose: tip forward, tip down (droop), alar width scale, bridge raised, length (tip to base) in metres / ratio */ noseFwd: number; noseDrop: number; noseW: number; bridge: number;
  /** brow ridge forward (m) */ brow: number;
  /** cheekbone / cheek fullness outward (m) */ cheek: number;
  /** lip fullness (m forward) */ lips: number;
  /** eye spacing scale (1 = shipped) */ eyeGap: number;
  /** ear scale */ ear: number;
  /** head width, depth and height scale */ headW: number; headL: number; headH: number;
  /** forehead height (m the hairline and brow move apart) and slope */ foreheadSlope: number;
}

/** The person's face traits, from their id, sex and age. Plain numbers so tests and the painter can read them. */
export function faceTraits(spec: PedSpec): FaceTraits {
  const id = spec.id, b = (t: string): number => bell(id, t);
  const male = spec.sex === 'm', female = spec.sex === 'f', old = spec.age === 'old', young = spec.age === 'kid' || spec.age === 'teen';
  const sx = male ? 1 : female ? -1 : 0;
  return {
    jawW: 1 + 0.085 * b('jaw') + 0.025 * sx - (old ? 0.02 : 0),
    chinFwd: 0.0085 * b('chinf') + 0.003 * sx,
    chinDrop: 0.0075 * b('chind') + 0.002 * sx,
    noseFwd: (0.0085 * b('nosef') + (old ? 0.004 : 0)) * (young ? 0.6 : 1),
    noseDrop: 0.004 * b('nosed') + (old ? 0.006 : 0),
    noseW: 1 + 0.12 * b('nosew'),
    bridge: 0.0055 * b('bridge'),
    brow: 0.0045 * b('brow') + 0.0025 * sx,
    cheek: 0.0065 * b('cheek') - (old ? 0.002 : 0),
    lips: 0.0045 * b('lips') - 0.0018 * sx + (old ? -0.002 : 0),
    eyeGap: 1 + 0.07 * b('eyegap'),
    ear: 1 + 0.16 * b('ear') + (old ? 0.1 : 0),
    headW: 1 + 0.035 * b('hw'),
    headL: 1 + 0.035 * b('hl'),
    headH: 1 + 0.03 * b('hh'),
    foreheadSlope: 0.006 * b('fs'),
  };
}

export interface HeadFrame {
  chinY: number; crownY: number; eyeY: number; eyeX: number;
  /** z of the face plane (front is -z) and of the middle of the head */
  frontZ: number; midZ: number;
  noseTipY: number; noseBaseY: number; mouthY: number; browY: number;
}

/** Positions of the face features on this shape, from its landmarks and rings (the same fractions the face painter and the pipeline use). */
export function headFrame(s: MhShape): HeadFrame {
  const lm = s.landmarks, D = lm.eyeY - lm.chinY;
  const eyeRing = s.headRings.reduce((b, r) => (Math.abs(r[0] - lm.eyeY) < Math.abs(b[0] - lm.eyeY) ? r : b));
  return {
    chinY: lm.chinY, crownY: lm.crownY, eyeY: lm.eyeY, eyeX: lm.eyeX,
    frontZ: eyeRing[2] - eyeRing[3], midZ: eyeRing[2],
    noseTipY: lm.chinY + 0.66 * D, noseBaseY: lm.chinY + 0.58 * D, mouthY: lm.chinY + 0.38 * D, browY: lm.eyeY + 0.2 * D,
  };
}

/** area weighted vertex normals, vertices at the same position share one (the UV tile borders duplicate them) */
function weld(pos: Float32Array, idx: Uint32Array): Float32Array {
  const acc = new Map<string, number[]>(), keys: string[] = [];
  const key = (i: number): string => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  for (let i = 0; i < pos.length / 3; i++) { const k = key(i); keys.push(k); if (!acc.has(k)) acc.set(k, [0, 0, 0]); }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const s = acc.get(keys[idx[t + k]])!; s[0] += nx; s[1] += ny; s[2] += nz; }
  }
  const out = new Float32Array(pos.length);
  keys.forEach((k, i) => { const s = acc.get(k)!, l = Math.hypot(s[0], s[1], s[2]) || 1; out[i * 3] = s[0] / l; out[i * 3 + 1] = s[1] / l; out[i * 3 + 2] = s[2] / l; });
  return out;
}

/** weight of the head bone on vertex i */
const headW = (L: MhLod, i: number): number => { let t = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] === HEAD_BONE) t += L.weights[i * 4 + k]; return t; };

/**
 * Displace the head vertices of a LOD by the person's face traits. The displacement is a function of position only (so vertices
 * duplicated for UV borders stay together), fades out over the neck by the head bone weight, and keeps the crown, ears and back of
 * the skull smooth. Returns the LOD unchanged for `far`.
 */
export function faceMorph(s: MhShape, spec: PedSpec, L: MhLod, tr: FaceTraits = faceTraits(spec)): MhLod {
  const f = headFrame(s), n = L.position.length / 3, pos = new Float32Array(L.position);
  const D = f.eyeY - f.chinY, H = f.crownY - f.chinY;
  const headMidY = f.chinY + H * 0.5;
  for (let i = 0; i < n; i++) {
    const hw = sstep(0.3, 0.85, headW(L, i));
    if (hw <= 0) continue;
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const ax = Math.abs(x), sgn = x < 0 ? -1 : 1;
    const front = sstep(f.midZ - 0.01, f.frontZ + 0.02, z);                 // 1 on the face plane, 0 behind the middle of the head
    const nv = (y - f.chinY) / D;                                            // 0 at the chin, 1 at the eyes, > 1 the brow and forehead
    let dx = 0, dy = 0, dz = 0;
    // jaw and lower face: the width fades in from the eyes down to the angle of the jaw
    dx += x * (tr.jawW - 1) * sstep(1.15, 0.15, nv);
    // chin: forward and down
    const chinG = gauss(y - (f.chinY + 0.012), 0.022) * gauss(ax, 0.034) * front;
    dz -= tr.chinFwd * chinG; dy -= tr.chinDrop * chinG;
    // nose: tip forward and drooping, wings wider, bridge raised
    const tipG = gauss(y - f.noseTipY, 0.02) * gauss(ax, 0.017) * front;
    dz -= tr.noseFwd * tipG; dy -= tr.noseDrop * tipG * 0.7;
    const wingG = gauss(y - f.noseBaseY, 0.017) * gauss(ax - 0.02, 0.014) * front;
    dx += sgn * (tr.noseW - 1) * 0.02 * wingG;
    dz -= tr.bridge * gauss(y - (f.eyeY - 0.012), 0.022) * gauss(ax, 0.011) * front;
    // brow ridge
    dz -= tr.brow * gauss(y - f.browY, 0.014) * sstep(0.075, 0.015, ax) * front;
    dy += tr.foreheadSlope * 0.5 * sstep(f.eyeY + 0.03, f.eyeY + 0.09, y) * front;
    dz += tr.foreheadSlope * sstep(f.eyeY + 0.03, f.eyeY + 0.09, y) * front;
    // cheeks: bone and fullness, out and a little forward
    const chG = gauss(y - (f.eyeY - 0.045), 0.03) * gauss(ax - 0.058, 0.026) * front;
    dx += sgn * tr.cheek * chG; dz -= tr.cheek * 0.5 * chG;
    // lips
    dz -= tr.lips * gauss(y - f.mouthY, 0.011) * gauss(ax, 0.026) * front;
    // eye spacing: scale x about the face centre round the eyes
    dx += x * (tr.eyeGap - 1) * gauss(y - f.eyeY, 0.032) * sstep(0.06, 0.02, ax) * front;
    // ears: the vertices beside the head, scaled about the ear root
    const earG = sstep(0.068, 0.082, ax) * gauss(y - (f.chinY + 0.55 * D), 0.034) * (1 - front);
    dx += sgn * (tr.ear - 1) * 0.012 * earG; dy += (tr.ear - 1) * (y - (f.chinY + 0.55 * D)) * 0.5 * earG;
    // overall head proportions, about the middle of the head
    dx += x * (tr.headW - 1) * sstep(f.chinY - 0.02, f.chinY + 0.1, y);
    dz += (z - f.midZ) * (tr.headL - 1);
    dy += (y - headMidY) * (tr.headH - 1) * sstep(f.chinY + 0.02, f.chinY + 0.12, y);
    pos[i * 3] = x + dx * hw; pos[i * 3 + 1] = y + dy * hw; pos[i * 3 + 2] = z + dz * hw;
  }
  return { ...L, position: pos, normal: weld(pos, L.index) };
}

/** how the head as a whole was scaled by faceMorph (hair and hats are fitted on top of it) */
export function headScale(tr: FaceTraits): { x: number; z: number; y: number } { return { x: tr.headW, z: tr.headL, y: tr.headH }; }
