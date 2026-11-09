/**
 * GTA4-style people (the default at near and mid range): 7.5 heads tall, organic lofted topology with edge loops at the shoulders,
 * elbows, wrists, hips, knees, ankles, neck and jaw, a face with jaw, cheek, brow ridge and nose wedge, hands with fingers, sneakers,
 * hair / hat caps as geometry, smooth shading lit by the scene (MeshStandardMaterial) with a painted albedo, normal and roughness
 * map per variant (painters/pedHi.ts). Our own meshes and paint; nothing is taken from any game.
 *
 * Still ONE SkinnedMesh per level of detail on the same 12-bone rig as pedBody.ts (rig, hips, torso, head, arm/elbow, leg/knee x2),
 * so Pedestrian, Player and the interiors keep animateWalk and the idle poses unchanged. THREE.LOD shows one level at a time:
 *   hi  (2.5k to 4k tris)  0 m      mid (about 1.2k tris)  from MID_DIST      far (about 350 tris)  from FAR_DIST
 * Phone starts at mid (a decimated realistic body, never the blocky one) and uses half-size maps without normal / roughness.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { createCanvas } from '@/textures/canvas';
import { heightFromRgba, heightToNormal } from '@/textures/normalmap';
import { HEAD_MAP, HI_RECTS, PEDHI_ATLAS, paintPedHi, type HiTile } from '@/textures/painters/pedHi';
import { PED_SPECS, PED_VARIANT_COUNT, pedVariantIndex, type PedSpec, type PxRect } from '@/textures/painters/ped';
import { carPaintConfigured, carPaintTier } from '@/render/CarPaintFx';
import { pickPedVariant, type PedModel, type PedOptions } from './pedBody';

export type PedDetail = 'hi' | 'mid' | 'far';
export const MID_DIST = 18;
export const FAR_DIST = 40;

// ---------------------------------------------------------------- rig (metres, feet at y = 0)

const HIP_Y = 0.93;
const THIGH = 0.45;
const TORSO_Y = 0.97;
const SHOULDER_Y = 1.42;
const UPPER_ARM = 0.29;
const HEAD_Y = 1.58;
const LEG_X = 0.095;

interface R { y: number; rx: number; rz: number; cx?: number; cz?: number }

const SEGS: Record<PedDetail, { limb: number; torso: number; head: number; fine: number }> = {
  hi: { limb: 12, torso: 20, head: 22, fine: 6 },
  mid: { limb: 8, torso: 10, head: 12, fine: 0 },
  far: { limb: 5, torso: 6, head: 7, fine: 0 },
};

/** `n` rings taken evenly from `rs` (always the first and the last). */
function thin(rs: R[], n: number): R[] {
  if (rs.length <= n) return rs;
  const out: R[] = [];
  for (let i = 0; i < n; i++) out.push(rs[Math.round((i * (rs.length - 1)) / (n - 1))]);
  return out;
}

interface Part { geo: THREE.BufferGeometry; bone: number }

/**
 * A smooth loft of elliptical rings (ascending y), wrapped around once: u = angle (the FRONT, -z, at u = 0.5), v = height in the rect.
 * `planar` maps by x / y instead (the face): the back half of the head samples the left edge column of the tile.
 */
function tube(rings: R[], seg: number, rect: PxRect, opts: { cap?: 'top' | 'bottom' | 'both'; planar?: boolean } = {}): THREE.BufferGeometry {
  const rs = [...rings].sort((a, b) => a.y - b.y);
  const ymin = rs[0].y, ymax = rs[rs.length - 1].y, dy = Math.max(1e-6, ymax - ymin);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const uvAt = (x: number, y: number, z: number, u: number, t: number): [number, number] => {
    let fu = u, ft = t;
    if (opts.planar) {
      fu = z > 0.025 ? 0.008 : Math.min(0.992, Math.max(0.008, x / HEAD_MAP.halfW / 2 + 0.5));
      ft = Math.min(1, Math.max(0, (y - HEAD_MAP.yMin) / (HEAD_MAP.yMax - HEAD_MAP.yMin)));
    }
    const px = rect.x + 0.5 + fu * (rect.w - 1), py = rect.y + 0.5 + (1 - ft) * (rect.h - 1);
    return [px / PEDHI_ATLAS, 1 - py / PEDHI_ATLAS];
  };
  for (const r of rs) {
    const t = (r.y - ymin) / dy;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const x = (r.cx ?? 0) + r.rx * Math.sin(a), z = (r.cz ?? 0) + r.rz * Math.cos(a);
      pos.push(x, r.y, z);
      uv.push(...uvAt(x, r.y, z, j / seg, t));
    }
  }
  const row = seg + 1;
  for (let i = 0; i + 1 < rs.length; i++) for (let j = 0; j < seg; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const addCap = (ri: number, up: boolean): void => {
    const r = rs[ri], base = pos.length / 3;
    const t = (r.y - ymin) / dy;
    pos.push(r.cx ?? 0, r.y, r.cz ?? 0);
    uv.push(...uvAt(r.cx ?? 0, r.y, r.cz ?? 0, 0.5, t));
    for (let j = 0; j < seg; j++) { const a = ri * row + j, b = a + 1; if (up) idx.push(base, b, a); else idx.push(base, a, b); }
  };
  if (opts.cap === 'top' || opts.cap === 'both') addCap(rs.length - 1, true);
  if (opts.cap === 'bottom' || opts.cap === 'both') addCap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // orientation: outward normals (flip when the winding came out inside-out)
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const cxm = rs[Math.floor(rs.length / 2)].cx ?? 0, czm = rs[Math.floor(rs.length / 2)].cz ?? 0;
  const mid = Math.floor(rs.length / 2) * row;
  const out = (pos[mid * 3] - cxm) * n.getX(mid) + (pos[mid * 3 + 2] - czm) * n.getZ(mid);
  if (out < 0) { const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const t = ix.getY(i); ix.setY(i, ix.getZ(i)); ix.setZ(i, t); } g.computeVertexNormals(); }
  // close the shading seam where the wrap meets itself
  const nn = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < rs.length; i++) {
    const a = i * row, b = a + seg;
    const sx = nn.getX(a) + nn.getX(b), sy = nn.getY(a) + nn.getY(b), sz = nn.getZ(a) + nn.getZ(b), l = Math.hypot(sx, sy, sz) || 1;
    nn.setXYZ(a, sx / l, sy / l, sz / l); nn.setXYZ(b, sx / l, sy / l, sz / l);
  }
  return g;
}

const FEMALE = new Set(['puffer-braids', 'headwrap-auntie', 'church-lady', 'scrubs-nurse', 'denim-girl', 'odette']);
const BULK: Partial<Record<PedSpec['top']['kind'], number>> = { puffer: 1.13, hoodie: 1.06, jacket: 1.04, cardigan: 1.05, tracksuit: 1.03, apron: 1.03 };
const BUILD = {
  avg: { w: 1, d: 1, h: 1, head: 1 }, slim: { w: 0.94, d: 0.94, h: 0.99, head: 1 }, stocky: { w: 1.1, d: 1.1, h: 0.98, head: 1 },
  tall: { w: 1, d: 1, h: 1.04, head: 1 }, kid: { w: 0.92, d: 0.92, h: 0.68, head: 1.28 },
} as const;

export interface HiGeo { geo: THREE.BufferGeometry; triangles: number; shoulderX: number }
const cache = new Map<string, HiGeo>();

function buildHi(variant: number, detail: PedDetail): HiGeo {
  const s = PED_SPECS[variant];
  const Bd = BUILD[s.build];
  const female = FEMALE.has(s.id);
  const bulk = BULK[s.top.kind] ?? 1;
  const sg = SEGS[detail];
  const hi = detail === 'hi';
  const w = Bd.w * (female ? 0.9 : 1), d = Bd.d;
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry, bone: number): void => { parts.push({ geo, bone }); };
  const sc = (rs: R[], kx: number, kz: number, ox = 0): R[] => rs.map((r) => ({ ...r, rx: r.rx * kx, rz: r.rz * kz, cx: (r.cx ?? 0) * kx + ox }));
  const T = (n: HiTile): PxRect => HI_RECTS[n];
  const shX = 0.205 * w * bulk;

  // ---- pelvis (+ skirt) on the hips bone
  const hipW = (female ? 1.07 : 1) * Bd.w;
  add(tube(thin(sc([{ y: 0.78, rx: 0.14, rz: 0.1 }, { y: 0.83, rx: 0.165, rz: 0.112 }, { y: 0.89, rx: 0.178, rz: 0.118 }, { y: 0.94, rx: 0.17, rz: 0.11 }, { y: 0.99, rx: 0.155, rz: 0.1 }], hipW, d), hi ? 5 : 3), sg.torso, T('pelvis'), { cap: 'bottom' }), 1);
  if (s.bottom.kind === 'skirt') {
    const hem = s.top.kind === 'dress' ? 0.45 : 0.56;
    add(tube(sc([{ y: hem, rx: 0.27, rz: 0.2 }, { y: (hem + 0.95) / 2, rx: 0.22, rz: 0.16 }, { y: 0.96, rx: 0.175, rz: 0.12 }], hipW, d), sg.torso, T('pelvis')), 1);
  }

  // ---- torso: waist, ribcage, chest, shoulder line, trapezius into the neck
  const chestZ = female ? 0.014 : 0;
  const torsoRings: R[] = [
    { y: 0.94, rx: 0.16, rz: 0.108 }, { y: 1.03, rx: 0.15, rz: 0.1 }, { y: 1.14, rx: 0.158, rz: 0.108 }, { y: 1.26, rx: 0.185, rz: 0.118 + chestZ },
    { y: 1.35, rx: 0.205, rz: 0.125 + chestZ, cz: -0.004 }, { y: 1.41, rx: 0.216, rz: 0.11 }, { y: 1.455, rx: 0.15, rz: 0.092 }, { y: 1.495, rx: 0.062, rz: 0.062 },
  ];
  add(tube(thin(sc(torsoRings, w * bulk, d * bulk), hi ? 8 : 5), sg.torso, T('torso'), { cap: 'top' }), 2);
  if (s.gear === 'backpack') {
    const k = s.build === 'kid' ? 1.15 : 1;
    add(tube([{ y: 1.0, rx: 0.13 * k, rz: 0.075, cz: 0.175 }, { y: 1.18, rx: 0.15 * k, rz: 0.085, cz: 0.18 }, { y: 1.38, rx: 0.14 * k, rz: 0.075, cz: 0.17 }], 8, T('gear'), { cap: 'both' }), 2);
  }

  // ---- neck and head (jaw, cheek, brow ridge), nose, ears
  add(tube([{ y: 1.46, rx: 0.054, rz: 0.058 }, { y: 1.52, rx: 0.05, rz: 0.054, cz: -0.004 }, { y: 1.58, rx: 0.052, rz: 0.056, cz: -0.006 }], sg.limb, T('neck')), 3);
  const head: R[] = [
    { y: 1.52, rx: 0.02, rz: 0.03, cz: -0.05 }, { y: 1.54, rx: 0.052, rz: 0.07, cz: -0.04 }, { y: 1.575, rx: 0.074, rz: 0.092, cz: -0.02 }, { y: 1.62, rx: 0.085, rz: 0.1 },
    { y: 1.665, rx: 0.088, rz: 0.104 }, { y: 1.695, rx: 0.087, rz: 0.108, cz: -0.003 }, { y: 1.73, rx: 0.08, rz: 0.1 }, { y: 1.757, rx: 0.052, rz: 0.072 }, { y: 1.775, rx: 0.018, rz: 0.03 },
  ];
  add(tube(thin(head, hi ? 9 : 6), sg.head, T('head'), { planar: true, cap: 'both' }), 3);
  add(tube([{ y: 1.612, rx: 0.014, rz: 0.03, cz: -0.1 }, { y: 1.645, rx: 0.011, rz: 0.026, cz: -0.114 }, { y: 1.675, rx: 0.008, rz: 0.012, cz: -0.108 }], hi ? 6 : 4, T('head'), { planar: true, cap: 'both' }), 3); // nose wedge
  if (hi) for (const sx of [-1, 1]) add(tube([{ y: 1.62, rx: 0.008, rz: 0.016, cx: sx * 0.088, cz: 0.01 }, { y: 1.65, rx: 0.01, rz: 0.022, cx: sx * 0.093, cz: 0.012 }, { y: 1.68, rx: 0.008, rz: 0.016, cx: sx * 0.088, cz: 0.01 }], 6, T('head'), { planar: true, cap: 'both' }), 3);

  // ---- hair and hats (the hair rect is painted with strands, the hat rect with the cap fabric)
  const hairR = T('hair'), hatR = T('hat');
  const cap = (): void => add(tube([{ y: 1.6, rx: 0.097, rz: 0.098, cz: 0.035 }, { y: 1.66, rx: 0.099, rz: 0.108, cz: 0.025 }, { y: 1.715, rx: 0.097, rz: 0.113, cz: 0.004 }, { y: 1.748, rx: 0.08, rz: 0.104 }, { y: 1.78, rx: 0.04, rz: 0.05 }], sg.head, hairR, { cap: 'top' }), 3);
  const covered = s.hat !== 'none';
  switch (s.hair) {
    case 'bald': break;
    case 'short': case 'fade': if (!covered) cap(); break;
    case 'afro': add(tube([{ y: 1.66, rx: 0.125, rz: 0.13, cz: 0.02 }, { y: 1.72, rx: 0.15, rz: 0.15, cz: 0.012 }, { y: 1.78, rx: 0.158, rz: 0.158, cz: 0.01 }, { y: 1.84, rx: 0.125, rz: 0.125, cz: 0.01 }, { y: 1.875, rx: 0.06, rz: 0.06, cz: 0.01 }], sg.head, hairR, { cap: 'top' }), 3); break;
    case 'puff': if (!covered) cap(); add(tube([{ y: 1.73, rx: 0.07, rz: 0.06, cz: 0.05 }, { y: 1.8, rx: 0.09, rz: 0.08, cz: 0.05 }, { y: 1.86, rx: 0.06, rz: 0.05, cz: 0.05 }], 8, hairR, { cap: 'both' }), 3); break;
    case 'bun': if (!covered) cap(); add(tube([{ y: 1.74, rx: 0.045, rz: 0.045, cz: 0.07 }, { y: 1.78, rx: 0.058, rz: 0.058, cz: 0.07 }, { y: 1.82, rx: 0.042, rz: 0.042, cz: 0.07 }], 8, hairR, { cap: 'both' }), 3); break;
    case 'long': if (!covered) cap(); add(tube([{ y: 1.4, rx: 0.095, rz: 0.035, cz: 0.1 }, { y: 1.55, rx: 0.105, rz: 0.04, cz: 0.108 }, { y: 1.68, rx: 0.1, rz: 0.03, cz: 0.1 }], 8, hairR, { cap: 'bottom' }), 3); break;
    case 'braids': case 'locs': {
      if (!covered) cap();
      const n = s.hair === 'braids' ? 5 : 6, len = s.hair === 'braids' ? 0.26 : 0.34;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.62 + (i / (n - 1)) * Math.PI * 1.24;
        const x = Math.sin(a) * 0.1, z = Math.cos(a) * 0.105;
        add(tube([{ y: 1.66 - len, rx: 0.013, rz: 0.013, cx: x, cz: z }, { y: 1.66 - len / 2, rx: 0.017, rz: 0.017, cx: x, cz: z }, { y: 1.68, rx: 0.019, rz: 0.019, cx: x, cz: z }], 5, hairR, { cap: 'bottom' }), 3);
      }
      break;
    }
  }
  switch (s.hat) {
    case 'none': break;
    case 'cap':
      add(tube([{ y: 1.7, rx: 0.1, rz: 0.114, cz: 0.004 }, { y: 1.745, rx: 0.1, rz: 0.116, cz: 0.002 }, { y: 1.785, rx: 0.082, rz: 0.1 }, { y: 1.81, rx: 0.04, rz: 0.05 }], sg.head, hatR, { cap: 'top' }), 3);
      add(tube([{ y: 1.7, rx: 0.075, rz: 0.06, cz: -0.15 }, { y: 1.71, rx: 0.075, rz: 0.062, cz: -0.152 }], 10, hatR, { cap: 'both' }), 3);
      break;
    case 'beanie': add(tube([{ y: 1.7, rx: 0.106, rz: 0.118 }, { y: 1.74, rx: 0.108, rz: 0.12 }, { y: 1.79, rx: 0.098, rz: 0.108 }, { y: 1.84, rx: 0.07, rz: 0.08 }, { y: 1.865, rx: 0.025, rz: 0.03 }], sg.head, hatR, { cap: 'top' }), 3); break;
    case 'headwrap':
      add(tube([{ y: 1.69, rx: 0.1, rz: 0.114 }, { y: 1.74, rx: 0.106, rz: 0.12 }, { y: 1.8, rx: 0.095, rz: 0.108 }, { y: 1.845, rx: 0.06, rz: 0.07 }], sg.head, hatR, { cap: 'top' }), 3);
      add(tube([{ y: 1.8, rx: 0.045, rz: 0.04, cz: -0.04 }, { y: 1.86, rx: 0.058, rz: 0.05, cz: -0.04 }, { y: 1.9, rx: 0.025, rz: 0.025, cz: -0.04 }], 8, hatR, { cap: 'both' }), 3);
      break;
    case 'church':
      add(tube([{ y: 1.71, rx: 0.1, rz: 0.108 }, { y: 1.76, rx: 0.1, rz: 0.108 }, { y: 1.8, rx: 0.09, rz: 0.098 }, { y: 1.822, rx: 0.065, rz: 0.07 }], sg.head, hatR, { cap: 'top' }), 3);
      add(tube([{ y: 1.708, rx: 0.235, rz: 0.235 }, { y: 1.722, rx: 0.235, rz: 0.235 }], sg.head, hatR, { cap: 'both' }), 3);
      break;
    case 'flat':
      add(tube([{ y: 1.7, rx: 0.104, rz: 0.115 }, { y: 1.75, rx: 0.116, rz: 0.126, cz: -0.006 }, { y: 1.775, rx: 0.108, rz: 0.12, cz: -0.012 }], sg.head, hatR, { cap: 'top' }), 3);
      add(tube([{ y: 1.7, rx: 0.075, rz: 0.04, cz: -0.14 }, { y: 1.71, rx: 0.075, rz: 0.04, cz: -0.14 }], 8, hatR, { cap: 'both' }), 3);
      break;
    case 'cop':
      add(tube([{ y: 1.7, rx: 0.103, rz: 0.115 }, { y: 1.76, rx: 0.099, rz: 0.108 }, { y: 1.8, rx: 0.115, rz: 0.125 }, { y: 1.83, rx: 0.108, rz: 0.118 }], sg.head, hatR, { cap: 'top' }), 3);
      add(tube([{ y: 1.7, rx: 0.08, rz: 0.05, cz: -0.15 }, { y: 1.71, rx: 0.08, rz: 0.05, cz: -0.15 }], 8, hatR, { cap: 'both' }), 3);
      break;
    case 'durag':
      add(tube([{ y: 1.7, rx: 0.1, rz: 0.113 }, { y: 1.75, rx: 0.103, rz: 0.116 }, { y: 1.8, rx: 0.088, rz: 0.1 }, { y: 1.815, rx: 0.04, rz: 0.04 }], sg.head, hatR, { cap: 'top' }), 3);
      for (const sx of [-1, 1]) add(tube([{ y: 1.52, rx: 0.016, rz: 0.008, cx: sx * 0.02, cz: 0.13 }, { y: 1.64, rx: 0.018, rz: 0.009, cx: sx * 0.02, cz: 0.125 }, { y: 1.74, rx: 0.016, rz: 0.008, cx: sx * 0.02, cz: 0.115 }], 4, hatR, { cap: 'bottom' }), 3);
      break;
    case 'hardhat':
      add(tube([{ y: 1.7, rx: 0.11, rz: 0.122 }, { y: 1.76, rx: 0.11, rz: 0.122 }, { y: 1.82, rx: 0.092, rz: 0.1 }, { y: 1.85, rx: 0.045, rz: 0.05 }], sg.head, hatR, { cap: 'top' }), 3);
      add(tube([{ y: 1.7, rx: 0.12, rz: 0.15, cz: -0.03 }, { y: 1.712, rx: 0.12, rz: 0.15, cz: -0.03 }], sg.head, hatR, { cap: 'both' }), 3);
      break;
  }

  // ---- arms: shoulder, upper arm, elbow, forearm, wrist, hand (palm + fingers + thumb)
  for (const [i, sx] of [-1, 1].entries()) {
    const X = sx * shX, ob = i === 0 ? 4 : 6;
    const upper: R[] = [{ y: 1.465, rx: 0.036, rz: 0.036 }, { y: 1.435, rx: 0.058, rz: 0.056 }, { y: 1.385, rx: 0.056, rz: 0.054 }, { y: 1.29, rx: 0.049, rz: 0.049 }, { y: 1.2, rx: 0.045, rz: 0.045 }, { y: 1.13, rx: 0.042, rz: 0.042 }];
    const fore: R[] = [{ y: 1.13, rx: 0.042, rz: 0.042 }, { y: 1.08, rx: 0.045, rz: 0.044 }, { y: 1.0, rx: 0.038, rz: 0.037 }, { y: 0.92, rx: 0.031, rz: 0.03 }, { y: 0.865, rx: 0.028, rz: 0.026 }];
    const bk = bulk > 1 ? bulk : 1;
    add(tube(thin(sc(upper, bk, bk, X), hi ? 6 : 3), sg.limb, T('upperArm'), { cap: 'top' }), ob);
    add(tube(thin(sc(fore, bk, bk, X), hi ? 5 : 3), sg.limb, T('foreArm')), ob + 1);
    const hand = T('hand');
    add(tube([{ y: 0.865, rx: 0.028, rz: 0.026, cx: X }, { y: 0.83, rx: 0.038, rz: 0.017, cx: X }, { y: 0.78, rx: 0.042, rz: 0.016, cx: X }, { y: 0.74, rx: hi ? 0.04 : 0.03, rz: hi ? 0.015 : 0.014, cx: X }], hi ? 8 : 6, hand, { cap: hi ? undefined : 'bottom' }), ob + 1);
    if (hi) {
      [[-0.027, 0.075], [-0.009, 0.085], [0.009, 0.082], [0.027, 0.068]].forEach(([fx, len], k) => {
        const x = X + fx;
        add(tube([{ y: 0.74 - len, rx: 0.007, rz: 0.007, cx: x, cz: 0.004 }, { y: 0.74 - len * 0.55, rx: 0.0085, rz: 0.0085, cx: x, cz: 0.002 }, { y: 0.745, rx: 0.0095, rz: 0.009, cx: x }], sg.fine, hand, { cap: 'bottom' }), ob + 1);
        void k;
      });
      add(tube([{ y: 0.72, rx: 0.009, rz: 0.009, cx: X - sx * 0.052, cz: -0.02 }, { y: 0.775, rx: 0.011, rz: 0.011, cx: X - sx * 0.047, cz: -0.012 }, { y: 0.82, rx: 0.013, rz: 0.012, cx: X - sx * 0.04, cz: -0.004 }], sg.fine, hand, { cap: 'bottom' }), ob + 1);
    }
    if (s.gear === 'bag' && sx === -1) add(tube([{ y: 0.5, rx: 0.11, rz: 0.045, cx: X - 0.01, cz: -0.02 }, { y: 0.62, rx: 0.115, rz: 0.048, cx: X - 0.01, cz: -0.02 }, { y: 0.74, rx: 0.1, rz: 0.04, cx: X - 0.01, cz: -0.02 }], 8, T('gear'), { cap: 'both' }), ob + 1);

    // ---- legs: thigh, knee, calf, ankle, sneaker
    const LX = sx * LEG_X * hipW, lb = i === 0 ? 8 : 10;
    const thigh: R[] = [{ y: 0.93, rx: 0.088, rz: 0.094 }, { y: 0.84, rx: 0.087, rz: 0.092 }, { y: 0.72, rx: 0.077, rz: 0.08 }, { y: 0.58, rx: 0.064, rz: 0.068 }, { y: 0.48, rx: 0.055, rz: 0.06 }];
    const shin: R[] = [{ y: 0.48, rx: 0.055, rz: 0.06 }, { y: 0.4, rx: 0.058, rz: 0.062, cz: 0.012 }, { y: 0.29, rx: 0.05, rz: 0.052, cz: 0.008 }, { y: 0.16, rx: 0.038, rz: 0.04 }, { y: 0.09, rx: 0.034, rz: 0.038 }];
    const bw = s.bottom.kind === 'sweats' || s.bottom.kind === 'cargo' ? 1.08 : s.bottom.kind === 'leggings' ? 0.95 : 1;
    add(tube(thin(sc(thigh, bw, bw, LX), hi ? 5 : 3), sg.limb, T('thigh')), lb);
    add(tube(thin(sc(shin, bw, bw, LX), hi ? 5 : 3), sg.limb, T('shin')), lb + 1);
    const tall = s.shoes.high ? 0.13 : 0.105;
    add(tube(thin([
      { y: 0.0, rx: 0.052, rz: 0.125, cx: LX, cz: -0.052 }, { y: 0.022, rx: 0.056, rz: 0.13, cx: LX, cz: -0.052 }, { y: 0.05, rx: 0.052, rz: 0.118, cx: LX, cz: -0.044 },
      { y: 0.075, rx: 0.05, rz: 0.1, cx: LX, cz: -0.03 }, { y: tall, rx: 0.042, rz: 0.062, cx: LX, cz: -0.002 }, { y: tall + 0.03, rx: 0.04, rz: 0.048, cx: LX, cz: 0.004 },
    ], hi ? 6 : 4), sg.limb, T('shoe'), { cap: 'bottom' }), lb + 1);
  }

  // ---- finish: scale the head (kids), skin to bones, merge
  const placed = parts.map(({ geo, bone }) => {
    const g = geo;
    if (bone === 3 && Bd.head !== 1) { g.translate(0, -HEAD_Y, 0); g.scale(Bd.head, Bd.head, Bd.head); g.translate(0, HEAD_Y, 0); }
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) { si[k * 4] = bone; sw[k * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return g;
  });
  const merged = mergeGeometries(placed, false);
  if (!merged) throw new Error('pedBodyHi: merge failed');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return { geo: merged, triangles: merged.index!.count / 3, shoulderX: shX };
}

export function hiGeo(variant: number, detail: PedDetail): HiGeo {
  const k = `${variant}:${detail}`;
  let g = cache.get(k);
  if (!g) { g = buildHi(variant, detail); cache.set(k, g); }
  return g;
}

// ---------------------------------------------------------------- material

const matCache = new WeakMap<IMaterialLibrary, Map<string, THREE.Material>>();
let canvasBroken = false;

/** True on the phone tier (decided when a person is first built). */
export function pedPhone(): boolean { return carPaintConfigured() && carPaintTier() === 'phone'; }

/** Painted albedo + normal + roughness of a variant (1024 px for the player, 512 otherwise, 256 and albedo only on phone). Flat colour without a 2D canvas. */
export function pedHiMaterial(materials: IMaterialLibrary, variant: number, phone = pedPhone()): THREE.Material {
  const key = `${variant}:${phone ? 'p' : 'n'}`;
  let byV = matCache.get(materials);
  if (!byV) { byV = new Map(); matCache.set(materials, byV); }
  let m = byV.get(key);
  if (m) return m;
  const spec = PED_SPECS[variant];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, name: `pedhi:${spec.id}` });
  if (typeof document !== 'undefined' && !canvasBroken) {
    try {
      const size = phone ? 256 : spec.role === 'player' ? 1024 : 512;
      const ca = createCanvas(size, size), ctxA = ca.getContext('2d');
      if (!ctxA) canvasBroken = true;
      else {
        let ch: HTMLCanvasElement | null = null, cr: HTMLCanvasElement | null = null;
        if (!phone) { ch = createCanvas(size, size); cr = createCanvas(size, size); }
        const ctxH = ch?.getContext('2d') ?? null, ctxR = cr?.getContext('2d') ?? null;
        paintPedHi(ctxA, ctxH, ctxR, size, new Rng(`pedhi:${variant}`), variant);
        const tex = new THREE.CanvasTexture(ca);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.name = `pedHi:${spec.id}`;
        mat.map = tex;
        if (ctxH && ch) {
          const hf = heightFromRgba(ctxH.getImageData(0, 0, size, size).data, size, size);
          const nrm = heightToNormal(hf, size, size, 2.2);
          const nc = createCanvas(size, size), nctx = nc.getContext('2d');
          if (nctx) { nctx.putImageData(new ImageData(nrm as unknown as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0); const nt = new THREE.CanvasTexture(nc); nt.anisotropy = 4; mat.normalMap = nt; mat.normalScale.set(0.9, 0.9); }
        }
        if (cr) { const rt = new THREE.CanvasTexture(cr); rt.anisotropy = 4; mat.roughnessMap = rt; mat.roughness = 1; }
      }
    } catch { /* flat colour fallback */ }
  }
  if (!mat.map) mat.color.set(spec.top.color);
  m = mat;
  byV.set(key, m);
  return m;
}

// ---------------------------------------------------------------- builder

export function buildPedModel(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel {
  let variant: number;
  if (opts.variant === undefined) variant = pickPedVariant(rng);
  else if (typeof opts.variant === 'string') variant = pedVariantIndex(opts.variant);
  else variant = ((Math.floor(opts.variant) % PED_VARIANT_COUNT) + PED_VARIANT_COUNT) % PED_VARIANT_COUNT;
  const spec = PED_SPECS[variant];
  const B = BUILD[spec.build];
  const phone = pedPhone();
  const jitter = rng.range(0.97, 1.03);
  const mat = pedHiMaterial(materials, variant, phone);

  const group = new THREE.Group();
  group.name = 'human';
  group.userData.pedVariant = spec.id;
  const rig = new THREE.Bone();
  rig.name = 'rig';
  group.add(rig);
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number): THREE.Bone => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, 0); parent.add(b); return b; };
  const G = hiGeo(variant, phone ? 'mid' : 'hi');
  const hips = bone('hips', rig, 0, HIP_Y);
  const torso = bone('torso', rig, 0, TORSO_Y);
  const head = bone('head', rig, 0, HEAD_Y);
  const arms: THREE.Object3D[] = [], elbows: THREE.Object3D[] = [], legs: THREE.Object3D[] = [], knees: THREE.Object3D[] = [];
  const hipW = (FEMALE.has(spec.id) ? 1.07 : 1) * B.w;
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'L' : 'R';
    const arm = bone(`arm${side}`, torso, sx * G.shoulderX, SHOULDER_Y - TORSO_Y);
    const elbow = bone('elbow', arm, 0, -UPPER_ARM);
    const leg = bone(`leg${side}`, rig, sx * LEG_X * hipW, HIP_Y);
    const knee = bone('knee', leg, 0, -THIGH);
    arms.push(arm); elbows.push(elbow); legs.push(leg); knees.push(knee);
  }
  const bones = [rig, hips, torso, head, arms[0], elbows[0], arms[1], elbows[1], legs[0], knees[0], legs[1], knees[1]] as THREE.Bone[];
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const lod = new THREE.LOD();
  lod.name = 'pedLod';
  const levels: Array<[PedDetail, number]> = phone ? [['mid', 0], ['far', FAR_DIST]] : [['hi', 0], ['mid', MID_DIST], ['far', FAR_DIST]];
  let triangles = 0;
  for (const [detail, dist] of levels) {
    const g = hiGeo(variant, detail);
    const m = new THREE.SkinnedMesh(g.geo, mat);
    m.name = detail === 'hi' || (phone && detail === 'mid') ? 'body' : `body-${detail}`;
    m.frustumCulled = false;
    lod.addLevel(m, dist);
    if (dist === 0) triangles = g.triangles;
  }
  group.add(lod);
  group.updateMatrixWorld(true);
  for (const lv of lod.levels) (lv.object as THREE.SkinnedMesh).bind(skeleton);
  group.scale.setScalar(opts.heightScale ?? B.h * jitter);

  return { group, legs, arms, head, knees, elbows, torso, rig, hips, spec, variant, triangles };
}
