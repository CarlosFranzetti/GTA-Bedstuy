#!/usr/bin/env node
/**
 * People pipeline: MakeHuman base mesh (CC0 data files only, no AGPL application code) -> body shapes -> three LODs -> .glb.
 *
 *   node scripts/people-pipeline.mjs fetch    download the CC0 data into src/assets/models/people/src (gzip, body vertices only)
 *   node scripts/people-pipeline.mjs build    write src/assets/models/people/<shape>.glb (meshopt compressed) + shapes.json
 *
 * Steps: parse base.obj (quads, body group only: the helper hair / clothes / joint / eye meshes are dropped) + default.mhskel +
 * default_weights.mhw; blend macro targets (ethnic x gender x age, weight, muscle) into body shapes; lower the arms of the A pose
 * with the skin weights; map the 163 MakeHuman bones to the game's 12-bone rig (PEDHI: rig hips torso head armL elbowL armR elbowR
 * legL kneeL legR kneeR); triangulate; decimate with meshoptimizer (hi ~4000, mid ~1500, far ~400 tris, bone weights as
 * simplifier attributes); then project every triangle's UVs into the matching tile of PEDHI's 512 px atlas (pedHi.ts HI_RECTS) so the
 * painted skin, face and clothes land on the real geometry. Units: metres, feet at y = 0, front at -z, character left at -x.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
export const PEOPLE = join(ROOT, 'src/assets/models/people');
export const SRC = join(PEOPLE, 'src');
const RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/';
export const BODY_VERTS = 13381; // vertices of the body group; everything after is helper geometry

export const RIG = ['rig', 'hips', 'torso', 'head', 'armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'legR', 'kneeR'];

/** target name -> path below makehuman/data/targets/macrodetails */
export const TARGETS = [
  ...['african', 'asian', 'caucasian'].flatMap((r) => ['male', 'female'].map((g) => `${r}-${g}-young`)),
  ...['male', 'female'].flatMap((g) => [`caucasian-${g}-child`, `caucasian-${g}-old`]),
  ...['male', 'female'].flatMap((g) => ['minweight', 'maxweight'].map((w) => `universal-${g}-young-averagemuscle-${w}`)),
  'universal-male-young-maxmuscle-averageweight',
];

// ------------------------------------------------------------------ parsing

/** Wavefront OBJ -> { positions: Float32Array, uvs: Float32Array, quads: Int32Array[4*n] (position indices), quadUv } for one group. */
export function parseObj(text, group = 'body') {
  const pos = [], uv = [], quads = [], quadUv = [];
  let cur = '';
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (l.startsWith('v ')) { const p = l.split(/\s+/); pos.push(+p[1], +p[2], +p[3]); }
    else if (l.startsWith('vt ')) { const p = l.split(/\s+/); uv.push(+p[1], +p[2]); }
    else if (l.startsWith('g ')) cur = l.slice(2).trim();
    else if (l.startsWith('f ') && cur === group) {
      const c = l.split(/\s+/).slice(1).map((t) => t.split('/').map((s) => (s ? parseInt(s, 10) - 1 : -1)));
      if (c.length === 3) c.push(c[2]); // degenerate quad
      for (const k of c) { quads.push(k[0]); quadUv.push(k[1]); }
    }
  }
  return { positions: Float32Array.from(pos), uvs: Float32Array.from(uv), quads: Int32Array.from(quads), quadUv: Int32Array.from(quadUv) };
}

/** Sparse MakeHuman target: lines "index dx dy dz" (comments with #). -> { idx: Int32Array, d: Float32Array(3n) } */
export function parseTarget(text, maxVertex = BODY_VERTS) {
  const idx = [], d = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l[0] === '#') continue;
    const p = l.split(/\s+/);
    const i = parseInt(p[0], 10);
    if (!(i < maxVertex)) continue;
    idx.push(i); d.push(+p[1], +p[2], +p[3]);
  }
  return { idx: Int32Array.from(idx), d: Float32Array.from(d) };
}

/** positions (copy) + sum of weight * target offsets. */
export function applyTargets(positions, list) {
  const out = Float32Array.from(positions);
  for (const { target, weight } of list) {
    if (!weight) continue;
    for (let k = 0; k < target.idx.length; k++) {
      const i = target.idx[k] * 3;
      out[i] += target.d[k * 3] * weight; out[i + 1] += target.d[k * 3 + 1] * weight; out[i + 2] += target.d[k * 3 + 2] * weight;
    }
  }
  return out;
}

/** mhskel JSON -> { bones: {name: {parent}}, joint(name, positions) -> [x,y,z] (mean of the joint's vertices) } */
export function parseSkeleton(json) {
  const s = typeof json === 'string' ? JSON.parse(json) : json;
  return {
    bones: s.bones,
    joint(name, positions) {
      const v = s.joints[name];
      if (!v) throw new Error(`no joint ${name}`);
      let x = 0, y = 0, z = 0;
      for (const i of v) { x += positions[i * 3]; y += positions[i * 3 + 1]; z += positions[i * 3 + 2]; }
      return [x / v.length, y / v.length, z / v.length];
    },
    boneHead: (b, p) => this_joint(s, `${b}____head`, p),
    boneTail: (b, p) => this_joint(s, `${b}____tail`, p),
  };
}
function this_joint(s, name, positions) {
  const v = s.joints[name];
  let x = 0, y = 0, z = 0;
  for (const i of v) { x += positions[i * 3]; y += positions[i * 3 + 1]; z += positions[i * 3 + 2]; }
  return [x / v.length, y / v.length, z / v.length];
}

/** mhw JSON -> Map boneName -> [[vertex, weight], ...] */
export function parseWeights(json) {
  const w = typeof json === 'string' ? JSON.parse(json) : json;
  return new Map(Object.entries(w.weights));
}

// ------------------------------------------------------------------ MakeHuman bone -> game rig

/** MakeHuman bone name -> index in RIG. L bones are the character's left (game -x). */
export function rigIndexOf(bone) {
  const side = bone.endsWith('.L') ? 'L' : bone.endsWith('.R') ? 'R' : '';
  const pick = (l, r) => (side === 'L' ? l : r);
  if (/^(upperleg|pelvis)/.test(bone)) return bone.startsWith('pelvis') ? 1 : pick(8, 10);
  if (/^(lowerleg|foot|toe)/.test(bone)) return pick(9, 11);
  if (/^upperarm/.test(bone)) return pick(4, 6);
  if (/^(lowerarm|wrist|finger|metacarpal)/.test(bone)) return pick(5, 7);
  if (/^(spine0[1-2])$/.test(bone)) return 1 === 1 && bone === 'spine01' ? 2 : 2;
  if (/^(spine0[3-5]|clavicle|shoulder|breast)/.test(bone)) return 2;
  if (/^(neck|head|jaw|eye|levator|oculi|orbicularis|oris|risorius|temporalis|tongue|special0[1-6])/.test(bone)) return 3;
  return 1; // root -> hips
}
