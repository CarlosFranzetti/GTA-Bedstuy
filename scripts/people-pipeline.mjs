#!/usr/bin/env node
/**
 * People pipeline: MakeHuman base mesh (CC0 data files only; the AGPL application code is not used) -> body shapes -> three LODs -> .glb.
 *
 *   node scripts/people-pipeline.mjs fetch    download the CC0 data into src/assets/models/people/src (gzip)
 *   node scripts/people-pipeline.mjs build    write src/assets/models/people/<shape>.glb (meshopt compressed) + shapes.json
 *
 * 1 parse base.obj (quads, UVs; only the `body` group, so the helper hair / clothes / joint / eye / teeth meshes are dropped),
 *   default.mhskel and default_weights.mhw;
 * 2 blend macro targets (ethnic x gender x age, weight, muscle) into body shapes;
 * 3 map the 163 MakeHuman bones to the game's 12-bone rig (PEDHI: rig hips torso head armL elbowL armR elbowR legL kneeL legR kneeR),
 *   lower the arms of the A pose with those weights, triangulate;
 * 4 decimate with meshoptimizer (hi ~4000, mid ~1500, far ~400 triangles; the 12 bone weights are simplifier attributes so skinning
 *   survives), then give every triangle UVs in the matching tile of PEDHI's 512 px atlas (pedHi.ts HI_RECTS): the painted skin, face
 *   and clothes land on the real geometry. The original MakeHuman UVs are parsed but not shipped (the painters work per body part);
 * 5 export per shape one meshopt-compressed glb with the meshes hi / mid / far, a 12-joint skin and the rig / head / torso data in
 *   scene.extras.people.
 * Units: metres, feet at y = 0, front at -z, the character's left at -x (the game's convention).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const I = Object.fromEntries(RIG.map((n, i) => [n, i]));

/** Macro targets used (makehuman/data/targets/macrodetails/<name>.target): <race>-<sex>-<age> for the three MakeHuman races, plus weight / muscle. */
const RACES = ['african', 'asian', 'caucasian'], SEXES = ['male', 'female'], AGES = ['child', 'young', 'old'];
export const TARGETS = [
  ...RACES.flatMap((r) => SEXES.flatMap((g) => AGES.map((a) => `${r}-${g}-${a}`))),
  ...SEXES.flatMap((g) => ['minweight', 'maxweight'].map((w) => `universal-${g}-young-averagemuscle-${w}`)),
  'universal-male-young-maxmuscle-averageweight',
];

/**
 * Population groups -> blend of MakeHuman's three race targets (a person's face structure, not only the tint). The base mesh is the
 * neutral 1/3 each human, so a pure sex needs weights summing to 1. Groups are a modelling convenience, not a claim about anyone.
 */
export const GROUPS = {
  ba: { african: 0.88, caucasian: 0.12 },                     // Black American
  ca: { african: 0.6, caucasian: 0.25, asian: 0.15 },         // Caribbean
  la: { caucasian: 0.6, asian: 0.25, african: 0.15 },         // Latino
  wh: { caucasian: 1 },                                       // white
  ea: { asian: 1 },                                           // East Asian
  sa: { caucasian: 0.78, asian: 0.12, african: 0.1 },         // South Asian
  me: { caucasian: 0.9, african: 0.1 },                       // Middle Eastern
  mx: { caucasian: 0.4, african: 0.3, asian: 0.3 },           // mixed
};

/** weights of the race targets for a group at an age ('young' | 'old' | 'teen' = child/young) and sex ('male' | 'female' | 'x' = both halves) */
export function shapeTargets(group, sex, age) {
  const t = {};
  const ages = age === 'teen' ? { child: 0.5, young: 0.5 } : { [age]: 1 };
  const sexes = sex === 'x' ? { male: 0.5, female: 0.5 } : { [sex]: 1 };
  for (const [race, wr] of Object.entries(GROUPS[group])) for (const [sx, ws] of Object.entries(sexes)) for (const [ag, wa] of Object.entries(ages)) {
    const k = `${race}-${sx}-${ag}`;
    t[k] = (t[k] ?? 0) + wr * ws * wa;
  }
  return t;
}

const heights = { male: 1.78, female: 1.66, x: 1.72 };
function shape(group, sex, age, extra = {}, hOverride = null) {
  const targets = shapeTargets(group, sex, age);
  for (const [k, w] of Object.entries(extra)) targets[k] = w;
  const h = (heights[sex] + (group === 'ea' ? -0.04 : group === 'ba' || group === 'ca' ? 0.01 : 0)) * (age === 'old' ? 0.965 : age === 'teen' ? 0.9 : 1);
  return { height: hOverride ?? Math.round(h * 100) / 100, targets, group, sex, age };
}

/**
 * Body shapes (one glb each). Young adults for every group and sex, a few old people and teens; builds (slim / stocky / tall) are a
 * runtime non-uniform scale of these.
 */
export const SHAPES = {
  ...Object.fromEntries(Object.keys(GROUPS).flatMap((g) => [[`${g}_m`, shape(g, 'male', 'young')], [`${g}_f`, shape(g, 'female', 'young')]])),
  ba_m_old: shape('ba', 'male', 'old'), ba_f_old: shape('ba', 'female', 'old'),
  wh_m_old: shape('wh', 'male', 'old'), wh_f_old: shape('wh', 'female', 'old'),
  teen_a: shape('mx', 'male', 'teen'), teen_b: shape('ea', 'female', 'teen'),
  mx_x: shape('mx', 'x', 'young', {}, 1.72),
};
export const LOD_TRIS = { hi: 3400, mid: 1500, far: 400 };

// ------------------------------------------------------------------ parsing

/** Wavefront OBJ -> one group: { positions (all vertices), uvs, quads (4 position indices per face), quadUv }. */
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
      if (c.length === 3) c.push(c[2]);
      for (const k of c.slice(0, 4)) { quads.push(k[0]); quadUv.push(k[1]); }
    }
  }
  return { positions: Float32Array.from(pos), uvs: Float32Array.from(uv), quads: Int32Array.from(quads), quadUv: Int32Array.from(quadUv) };
}

/** Sparse MakeHuman target ("index dx dy dz" lines) -> { idx, d }. Offsets of vertices >= maxVertex are dropped (the joint helper vertices are kept: the rig joints are read from them). */
export function parseTarget(text, maxVertex = Infinity) {
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

/** positions + sum(weight * target offsets) (a copy). */
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

/** mean position of a joint's vertex group in a (morphed) mesh. */
export function jointPos(skel, name, positions) {
  const v = skel.joints[name];
  if (!v) throw new Error(`no joint ${name}`);
  let x = 0, y = 0, z = 0;
  for (const i of v) { x += positions[i * 3]; y += positions[i * 3 + 1]; z += positions[i * 3 + 2]; }
  return [x / v.length, y / v.length, z / v.length];
}

/** MakeHuman bone name -> index in RIG. `.L` is the character's left (game -x). */
export function rigIndexOf(bone) {
  const L = bone.endsWith('.L');
  const side = (l, r) => (L ? l : r);
  if (/^(upperleg)/.test(bone)) return side(I.legL, I.legR);
  if (/^(lowerleg|foot|toe)/.test(bone)) return side(I.kneeL, I.kneeR);
  if (/^upperarm/.test(bone)) return side(I.armL, I.armR);
  if (/^(lowerarm|wrist|finger|metacarpal)/.test(bone)) return side(I.elbowL, I.elbowR);
  if (/^(spine0[1-4]|clavicle|shoulder|breast)/.test(bone)) return I.torso;
  if (/^(neck|head|jaw|eye|levator|oculi|orbicularis|oris|risorius|temporalis|tongue|special0[1-6])/.test(bone)) return I.head;
  return I.hips; // root, pelvis.L/R, spine05
}

/** per-vertex weights over the 12 rig bones (Float32Array n*12, rows sum to 1) from the MakeHuman weights file. */
export function rigWeights(weightsJson, n) {
  const w = new Float32Array(n * 12);
  for (const [bone, list] of Object.entries(weightsJson.weights)) {
    const r = rigIndexOf(bone);
    for (const [v, x] of list) if (v < n) w[v * 12 + r] += x;
  }
  for (let v = 0; v < n; v++) {
    let s = 0;
    for (let k = 0; k < 12; k++) s += w[v * 12 + k];
    if (s < 1e-6) w[v * 12 + I.hips] = 1;
    else for (let k = 0; k < 12; k++) w[v * 12 + k] /= s;
  }
  return w;
}

/** quads -> triangles along the shorter diagonal. */
export function triangulate(quads, positions) {
  const out = [];
  const d = (a, b) => Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2]);
  for (let q = 0; q < quads.length; q += 4) {
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], e = quads[q + 3];
    if (c === e) { out.push(a, b, c); continue; }
    if (d(a, c) <= d(b, e)) out.push(a, b, c, a, c, e); else out.push(a, b, e, b, c, e);
  }
  return Uint32Array.from(out);
}

// ------------------------------------------------------------------ the shape

const DEG = Math.PI / 180;

/**
 * Morph, convert to game space (metres, y up, feet at 0, front -z), lower the arms, derive the rig. Returns
 * { positions, w12, indices (triangles), rig, landmarks, height }.
 */
export function buildBody(src, shape) {
  const n = BODY_VERTS;
  const morphed = applyTargets(src.obj.positions, Object.entries(shape.targets).map(([k, weight]) => ({ target: src.targets.get(k), weight })));
  // height and the centre of the hips from the MakeHuman metrics (decimetres, y up, front +z, left +x)
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { minY = Math.min(minY, morphed[i * 3 + 1]); maxY = Math.max(maxY, morphed[i * 3 + 1]); }
  const s = shape.height / (maxY - minY);
  const hipJ = jointPos(src.skel, 'upperleg01.L____head', morphed);
  const G = (p) => [-p[0] * s, (p[1] - minY) * s, -(p[2] - hipJ[2]) * s];
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const g = G([morphed[i * 3], morphed[i * 3 + 1], morphed[i * 3 + 2]]); pos.set(g, i * 3); }
  const J = (name) => G(jointPos(src.skel, name, morphed));
  const flip = (p) => [-p[0], p[1], p[2]];
  const joints = {
    shoulderL: J('upperarm01.L____head'), elbowL: J('lowerarm01.L____head'), wristL: J('wrist.L____head'),
    hipL: J('upperleg01.L____head'), kneeL: J('lowerleg01.L____head'), ankleL: J('foot.L____head'),
    pelvis: J('spine05____head'), waist: J('spine04____head'), neckTop: J('head____head'), chin: J('jaw____tail'), eyeL: J('eye.L____head'),
  };
  const w12 = src.w12;
  // hang the A pose straight: rotate every arm / leg weighted vertex about the shoulder / hip (z axis) until the upper arm / the leg is vertical
  const OUT = 0.012; // keeps the upper arm clear of the ribs
  const rig = {};
  const limbs = [
    { name: 'arm', pivot: joints.shoulderL, ref: joints.elbowL, a: [I.armL, I.armR], e: [I.elbowL, I.elbowR], out: OUT, pts: { elbow: joints.elbowL, wrist: joints.wristL } },
    { name: 'leg', pivot: joints.hipL, ref: joints.ankleL, a: [I.legL, I.legR], e: [I.kneeL, I.kneeR], out: 0, pts: { knee: joints.kneeL, ankle: joints.ankleL } },
  ];
  for (const limb of limbs) {
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1, k = side === 'L' ? 0 : 1;
      const at = (p) => (side === 'L' ? p : flip(p));
      const sh = at(limb.pivot), ref = at(limb.ref);
      const ang = -Math.atan2(ref[0] - sh[0], -(ref[1] - sh[1])), c = Math.cos(ang), sn = Math.sin(ang);
      const rot = (p) => { const x = p[0] - sh[0], y = p[1] - sh[1]; return [sh[0] + x * c - y * sn + sg * limb.out, sh[1] + x * sn + y * c, p[2]]; };
      for (let i = 0; i < n; i++) {
        const wa = w12[i * 12 + limb.a[k]] + w12[i * 12 + limb.e[k]];
        if (wa < 1e-4) continue;
        const q = rot([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
        pos[i * 3] += (q[0] - pos[i * 3]) * wa; pos[i * 3 + 1] += (q[1] - pos[i * 3 + 1]) * wa; pos[i * 3 + 2] += (q[2] - pos[i * 3 + 2]) * wa;
      }
      if (limb.name === 'arm') { rig['shoulder' + side] = rot(sh); rig['elbow' + side] = rot(at(limb.pts.elbow)); rig['wrist' + side] = rot(at(limb.pts.wrist)); }
      else { rig['hip' + side] = rot(sh); rig['knee' + side] = rot(at(limb.pts.knee)); rig['ankle' + side] = rot(at(limb.pts.ankle)); }
    }
  }
  // relax the arms: the A pose holds the forearms forward; let them hang with a slight elbow bend, and make the hands a little smaller
  for (const side of ['L', 'R']) {
    const k = side === 'L' ? 0 : 1, e = rig['elbow' + side], w = rig['wrist' + side];
    const fwd = Math.atan2(-(w[2] - e[2]), -(w[1] - e[1]));           // forward lean of the forearm (front is -z)
    const bend = 0.2, ang = -(fwd - bend), c = Math.cos(ang), sn = Math.sin(ang);
    const rotX = (p) => { const y = p[1] - e[1], z = p[2] - e[2]; return [p[0], e[1] + y * c - z * sn, e[2] + y * sn + z * c]; };
    const eb = I.elbowL + 2 * k;
    for (let i = 0; i < n; i++) {
      const wb = w12[i * 12 + eb];
      if (wb < 1e-4) continue;
      const q = rotX([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
      pos[i * 3 + 1] += (q[1] - pos[i * 3 + 1]) * wb; pos[i * 3 + 2] += (q[2] - pos[i * 3 + 2]) * wb;
    }
    const wr = rotX(w);
    rig['wrist' + side] = wr;
    // hands: scale about the wrist (vertices below it, on the elbow bone)
    for (let i = 0; i < n; i++) {
      if (w12[i * 12 + eb] < 0.5 || pos[i * 3 + 1] > wr[1]) continue;
      pos[i * 3] = wr[0] + (pos[i * 3] - wr[0]) * 0.86;
      pos[i * 3 + 1] = wr[1] + (pos[i * 3 + 1] - wr[1]) * 0.9;
      pos[i * 3 + 2] = wr[2] + (pos[i * 3 + 2] - wr[2]) * 0.86;
    }
  }
  // straightening the legs moves the soles; put them back on y = 0
  let lowest = Infinity, highest = -Infinity;
  for (let i = 0; i < n; i++) { lowest = Math.min(lowest, pos[i * 3 + 1]); highest = Math.max(highest, pos[i * 3 + 1]); }
  for (let i = 0; i < n; i++) pos[i * 3 + 1] -= lowest;
  for (const v of Object.values(rig)) v[1] -= lowest;
  for (const k of ['chin', 'eyeL', 'neckTop', 'pelvis', 'waist', 'ankleL']) joints[k][1] -= lowest;
  rig.hips = [0, joints.pelvis[1], 0];
  rig.torso = [0, joints.waist[1], 0];
  rig.head = [0, joints.neckTop[1], joints.neckTop[2]];
  rig.ankleY = rig.ankleL[1];
  const crown = highest - lowest;
  const landmarks = { chinY: joints.chin[1], eyeY: joints.eyeL[1], eyeX: Math.abs(joints.eyeL[0]), crownY: crown, hemY: crown * 0.56, ankleY: rig.ankleL[1], wristY: rig.wristL[1] };
  const indices = triangulate(src.obj.quads, pos);
  smoothFeet(pos, w12, indices, rig.ankleY + 0.03);
  return { positions: pos, w12, indices, rig, landmarks, height: crown };
}

/** Laplacian smoothing of the foot (knee-bone vertices below the ankle) so the separate toes become one sneaker-like blob; the flat sole stays put. */
export function smoothFeet(pos, w12, indices, topY, iterations = 8) {
  const n = pos.length / 3, nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) for (let k = 0; k < 3; k++) { nb[indices[t + k]].add(indices[t + (k + 1) % 3]); nb[indices[t + k]].add(indices[t + (k + 2) % 3]); }
  const foot = [];
  for (let v = 0; v < n; v++) if (pos[v * 3 + 1] < topY && w12[v * 12 + I.kneeL] + w12[v * 12 + I.kneeR] > 0.5) foot.push(v);
  for (let it = 0; it < iterations; it++) {
    const next = foot.map((v) => {
      let x = 0, y = 0, z = 0;
      for (const u of nb[v]) { x += pos[u * 3]; y += pos[u * 3 + 1]; z += pos[u * 3 + 2]; }
      const c = nb[v].size || 1, low = pos[v * 3 + 1] < 0.006;
      return [pos[v * 3] * 0.4 + (x / c) * 0.6, low ? pos[v * 3 + 1] : pos[v * 3 + 1] * 0.4 + (y / c) * 0.6, pos[v * 3 + 2] * 0.4 + (z / c) * 0.6];
    });
    foot.forEach((v, i) => pos.set(next[i], v * 3));
  }
}

// ------------------------------------------------------------------ decimation

/** Simplify to ~targetTris triangles keeping the bone weights; returns a compact mesh. */
export function decimate(simplifier, body, targetTris) {
  const { positions, w12, indices } = body;
  if (indices.length / 3 <= targetTris) return compact(body, indices);
  const attr = new Float32Array(w12.length);
  for (let i = 0; i < w12.length; i++) attr[i] = w12[i];
  const [out] = simplifier.simplifyWithAttributes(indices, positions, 3, attr, 12, new Array(12).fill(0.05), null, targetTris * 3, 1, []);
  return compact(body, out);
}

function compact(body, indices) {
  const map = new Map();
  const keep = [];
  const idx = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    let m = map.get(indices[k]);
    if (m === undefined) { m = keep.length; map.set(indices[k], m); keep.push(indices[k]); }
    idx[k] = m;
  }
  const positions = new Float32Array(keep.length * 3), w12 = new Float32Array(keep.length * 12);
  keep.forEach((v, i) => { positions.set(body.positions.subarray(v * 3, v * 3 + 3), i * 3); w12.set(body.w12.subarray(v * 12, v * 12 + 12), i * 12); });
  return { positions, w12, indices: idx };
}

/** area weighted vertex normals */
export function vertexNormals(pos, idx) {
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return nrm;
}

// ------------------------------------------------------------------ UVs into PEDHI's atlas

/** Must equal HI_RECTS / HEAD_MAP / PEDHI_ATLAS in src/textures/painters/pedHi.ts (a unit test checks it). */
export const ATLAS = 512;
export const TILES = {
  head: { x: 0, y: 0, w: 256, h: 256 }, hair: { x: 256, y: 0, w: 128, h: 128 }, hat: { x: 384, y: 0, w: 128, h: 128 },
  torso: { x: 256, y: 128, w: 256, h: 128 }, gear: { x: 256, y: 320, w: 256, h: 64 },
  upperArm: { x: 0, y: 256, w: 128, h: 128 }, foreArm: { x: 128, y: 256, w: 128, h: 128 }, hand: { x: 256, y: 256, w: 128, h: 64 }, neck: { x: 384, y: 256, w: 128, h: 64 },
  thigh: { x: 0, y: 384, w: 128, h: 128 }, shin: { x: 128, y: 384, w: 128, h: 128 }, pelvis: { x: 256, y: 384, w: 128, h: 128 }, shoe: { x: 384, y: 384, w: 128, h: 128 },
};
/** the painter puts the eyes at +-0.034 m of 0.09 m half width, and chin / mouth / nose base / eyes / crown at these fractions of the tile height */
export const FACE = { eyeFrac: 0.189, t: { chin: 0, mouth: 0.255, nose: 0.42, eye: 0.565, crown: 1 } };

export function tileUV(rect, fu, ft) {
  const px = rect.x + 0.5 + Math.min(1, Math.max(0, fu)) * (rect.w - 1), py = rect.y + 0.5 + (1 - Math.min(1, Math.max(0, ft))) * (rect.h - 1);
  return [px / ATLAS, 1 - py / ATLAS];
}

const LIMB_TILE = { [I.armL]: 'upperArm', [I.armR]: 'upperArm', [I.elbowL]: 'foreArm', [I.elbowR]: 'foreArm', [I.legL]: 'thigh', [I.legR]: 'thigh', [I.kneeL]: 'shin', [I.kneeR]: 'shin' };

/** tile name of a triangle from its mean bone weights and centroid height */
export function regionOf(w, cy, lm) {
  let b = 0;
  for (let k = 1; k < 12; k++) if (w[k] > w[b]) b = k;
  switch (b) {
    case I.head: return cy < lm.chinY ? 'neck' : 'head';
    case I.torso: return cy < lm.hemY ? 'pelvis' : 'torso';
    case I.elbowL: case I.elbowR: return cy < lm.wristY ? 'hand' : 'foreArm';
    case I.kneeL: case I.kneeR: return cy < lm.ankleY + 0.028 ? 'shoe' : 'shin';
    case I.rig: case I.hips: return 'pelvis';
    default: return LIMB_TILE[b];
  }
}

/**
 * Per-triangle UV projection. Returns a new indexed mesh whose vertices are duplicated per (vertex, tile): attributes
 * position / normal / uv / joints (4) / weights (4). Cylinder tiles wrap the angle around the part's axis with the FRONT at u = 0.5.
 */
export function projectUVs(mesh, lm) {
  const { positions: P, w12: W, indices: ix } = mesh;
  const tris = ix.length / 3;
  const region = new Array(tris);
  for (let t = 0; t < tris; t++) {
    const w = new Float32Array(12);
    let cy = 0;
    for (let k = 0; k < 3; k++) { const v = ix[t * 3 + k]; cy += P[v * 3 + 1] / 3; for (let j = 0; j < 12; j++) w[j] += W[v * 12 + j] / 3; }
    region[t] = regionOf(w, cy, lm);
  }
  // per-tile extents and axis centres (mean x,z of the lowest and the highest fifth)
  const ext = {};
  for (let t = 0; t < tris; t++) {
    const e = (ext[region[t]] ??= { vs: new Set() });
    for (let k = 0; k < 3; k++) e.vs.add(ix[t * 3 + k]);
  }
  for (const e of Object.values(ext)) {
    const vs = [...e.vs];
    let lo = Infinity, hi = -Infinity;
    for (const v of vs) { lo = Math.min(lo, P[v * 3 + 1]); hi = Math.max(hi, P[v * 3 + 1]); }
    const span = Math.max(1e-4, hi - lo);
    const mean = (f) => { let x = 0, z = 0, c = 0; for (const v of vs) if (f((P[v * 3 + 1] - lo) / span)) { x += P[v * 3]; z += P[v * 3 + 2]; c++; } return c ? [x / c, z / c] : [0, 0]; };
    e.lo = lo; e.hi = hi; e.cb = mean((q) => q < 0.2); e.ct = mean((q) => q > 0.8);
  }
  const eyeX = Math.max(1e-3, lm.eyeX);
  const ys = [lm.chinY, lm.chinY + 0.41 * (lm.eyeY - lm.chinY), lm.chinY + 0.68 * (lm.eyeY - lm.chinY), lm.eyeY, lm.crownY];
  const ts = [FACE.t.chin, FACE.t.mouth, FACE.t.nose, FACE.t.eye, FACE.t.crown];
  const headT = (y) => {
    if (y <= ys[0]) return 0;
    for (let k = 1; k < ys.length; k++) if (y <= ys[k]) return ts[k - 1] + ((y - ys[k - 1]) / (ys[k] - ys[k - 1])) * (ts[k] - ts[k - 1]);
    return 1;
  };
  let headCz = 0, headN = 0;
  for (const v of ext.head?.vs ?? []) { headCz += P[v * 3 + 2]; headN++; }
  headCz = headN ? headCz / headN : 0;
  const uvOf = (tile, v) => {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (tile === 'head') {
      const fu = z > headCz + 0.015 ? (x >= 0 ? 0.992 : 0.008) : 0.5 + FACE.eyeFrac * (x / eyeX);
      return [Math.min(0.992, Math.max(0.008, fu)), headT(y)];
    }
    const e = ext[tile];
    const ft = (y - e.lo) / Math.max(1e-4, e.hi - e.lo);
    const cx = e.cb[0] + (e.ct[0] - e.cb[0]) * ft, cz = e.cb[1] + (e.ct[1] - e.cb[1]) * ft;
    let a = Math.atan2(x - cx, z - cz);
    if (a < 0) a += Math.PI * 2;
    return [a / (Math.PI * 2), ft];
  };
  const keyMap = new Map();
  const outPos = [], outUv = [], outSrc = [], outIdx = [];
  for (let t = 0; t < tris; t++) {
    const tile = region[t];
    const uv3 = [0, 1, 2].map((k) => uvOf(tile, ix[t * 3 + k]));
    const us = uv3.map((u) => u[0]);
    if (tile !== 'head' && Math.max(...us) - Math.min(...us) > 0.5) for (const u of uv3) u[0] = 0.01; // crosses the back seam
    if (tile === 'head' && Math.max(...us) - Math.min(...us) > 0.5) for (const u of uv3) u[0] = us.reduce((a, b) => a + b, 0) / 3 < 0.5 ? 0.008 : 0.992;
    for (let k = 0; k < 3; k++) {
      const v = ix[t * 3 + k];
      const [u, ft] = uv3[k];
      const [tu, tv] = tileUV(TILES[tile], u, ft);
      const key = `${v}|${tile}|${Math.round(tu * 4096)}|${Math.round(tv * 4096)}`;
      let o = keyMap.get(key);
      if (o === undefined) { o = outSrc.length; keyMap.set(key, o); outSrc.push(v); outUv.push(tu, tv); }
      outIdx.push(o);
    }
  }
  const n = outSrc.length;
  const normals = vertexNormals(P, ix);
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
  outSrc.forEach((v, i) => {
    position.set(P.subarray(v * 3, v * 3 + 3), i * 3);
    normal.set(normals.subarray(v * 3, v * 3 + 3), i * 3);
    const order = [...Array(12).keys()].sort((a, b) => W[v * 12 + b] - W[v * 12 + a]).slice(0, 4);
    let s = 0;
    for (const j of order) s += W[v * 12 + j];
    order.forEach((j, k) => { joints[i * 4 + k] = j; weights[i * 4 + k] = W[v * 12 + j] / s; });
  });
  return { position, normal, uv: Float32Array.from(outUv), joints, weights, indices: Uint32Array.from(outIdx), regions: region };
}

/**
 * [y, rx, cz, rz, cx] rings of the vertices of a tile (half extents round the centre cx, cz): the loader fits hair, hats, skirts, packs
 * and PEDHI's clothing shells to them. `side` -1 / +1 keeps only the character's left (x < 0) / right (x > 0) vertices.
 */
export function ringsOf(mesh, tileName, lm, yMin, yMax, count, side = 0) {
  const { positions: P, w12: W, indices: ix } = mesh;
  const vs = new Set();
  for (let t = 0; t < ix.length; t += 3) {
    const w = new Float32Array(12);
    let cy = 0;
    for (let k = 0; k < 3; k++) { const v = ix[t + k]; cy += P[v * 3 + 1] / 3; for (let j = 0; j < 12; j++) w[j] += W[v * 12 + j] / 3; }
    if (regionOf(w, cy, lm) === tileName) for (let k = 0; k < 3; k++) if (!side || Math.sign(P[ix[t + k] * 3]) === side) vs.add(ix[t + k]);
  }
  const out = [];
  for (let r = 0; r < count; r++) {
    const y = yMin + ((yMax - yMin) * r) / (count - 1), band = ((yMax - yMin) / (count - 1)) * 0.6;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, c = 0;
    for (const v of vs) if (Math.abs(P[v * 3 + 1] - y) <= band) { x0 = Math.min(x0, P[v * 3]); x1 = Math.max(x1, P[v * 3]); z0 = Math.min(z0, P[v * 3 + 2]); z1 = Math.max(z1, P[v * 3 + 2]); c++; }
    out.push(c ? [y, (x1 - x0) / 2, (z0 + z1) / 2, (z1 - z0) / 2, (x0 + x1) / 2] : null);
  }
  return out.map((o, i) => o ?? [yMin + ((yMax - yMin) * i) / (count - 1), ...(out.find((p, j) => p && j > i) ?? [...out].reverse().find(Boolean) ?? [0, 0.05, 0, 0.05, 0]).slice(1)]);
}

// ------------------------------------------------------------------ io

export function loadSources(dir = SRC) {
  const obj = parseObj(gunzipSync(readFileSync(join(dir, 'base.obj.gz'))).toString());
  const skel = JSON.parse(readFileSync(join(dir, 'default.mhskel'), 'utf8'));
  const weightsJson = JSON.parse(gunzipSync(readFileSync(join(dir, 'default_weights.mhw.gz'))).toString());
  const targets = new Map();
  for (const t of TARGETS) targets.set(t, parseTarget(gunzipSync(readFileSync(join(dir, 'targets', `${t}.target.gz`))).toString()));
  return { obj, skel, w12: rigWeights(weightsJson, BODY_VERTS), targets };
}

export async function fetchSources(dir = SRC) {
  const get = async (p) => { const r = await fetch(RAW + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); };
  mkdirSync(join(dir, 'targets'), { recursive: true });
  writeFileSync(join(dir, 'base.obj.gz'), gzipSync(await get('3dobjs/base.obj'), { level: 9 }));
  writeFileSync(join(dir, 'default.mhskel'), await get('rigs/default.mhskel'));
  writeFileSync(join(dir, 'default_weights.mhw.gz'), gzipSync(await get('rigs/default_weights.mhw'), { level: 9 }));
  for (const t of TARGETS) {
    const txt = await get(`targets/macrodetails/${t}.target`);
    writeFileSync(join(dir, 'targets', `${t}.target.gz`), gzipSync(txt.split('\n')  .filter((l) => l && l[0] !== '#').join('\n'), { level: 9 }));
  }
}

/** build the three LODs of a shape (not yet written) */
export function buildShape(src, simplifier, name) {
  const shape = SHAPES[name];
  const body = buildBody(src, shape);
  const lods = {};
  for (const [lod, tris] of Object.entries(LOD_TRIS)) {
    const m = decimate(simplifier, body, tris);
    lods[lod] = { ...projectUVs(m, body.landmarks), triangles: m.indices.length / 3, mesh: m };
  }
  const hiMesh = lods.hi.mesh, lm = body.landmarks;
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const rings = (arr) => arr.map((a) => a.map(r));
  const R = body.rig;
  const people = {
    shape: name, group: shape.group, sex: shape.sex, age: shape.age, height: r(body.height),
    rig: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, Array.isArray(v) ? v.map(r) : r(v)])),
    landmarks: Object.fromEntries(Object.entries(lm).map(([k, v]) => [k, r(v)])),
    headRings: rings(ringsOf(hiMesh, 'head', lm, lm.chinY, lm.crownY, 12)),
    torsoRings: rings(ringsOf(hiMesh, 'torso', lm, lm.hemY, R.shoulderL[1] + 0.03, 8)),
    hipRings: rings(ringsOf(hiMesh, 'pelvis', lm, lm.ankleY + 0.6, lm.hemY + 0.03, 5)),
    // left limbs (x < 0), ascending in y; the loader mirrors them for the right side
    armRings: {
      upper: rings(ringsOf(hiMesh, 'upperArm', lm, R.elbowL[1], R.shoulderL[1] + 0.04, 7, -1)),
      fore: rings(ringsOf(hiMesh, 'foreArm', lm, R.wristL[1], R.elbowL[1], 6, -1)),
    },
    legRings: {
      thigh: rings(ringsOf(hiMesh, 'thigh', lm, R.kneeL[1], R.hipL[1] + 0.02, 7, -1)),
      shin: rings(ringsOf(hiMesh, 'shin', lm, lm.ankleY + 0.03, R.kneeL[1], 6, -1)),
    },
  };
  return { name, body, lods, people };
}

export async function writeGlb(built, path) {
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS, EXTMeshoptCompression } = await import('@gltf-transform/extensions');
  const { quantize, meshopt } = await import('@gltf-transform/functions');
  const { MeshoptEncoder } = await import('meshoptimizer');
  await MeshoptEncoder.ready;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('people').setExtras({ people: built.people });
  const R = built.people.rig;
  const names = RIG;
  const world = {
    rig: [0, 0, 0], hips: R.hips, torso: R.torso, head: R.head, armL: R.shoulderL, elbowL: R.elbowL, armR: R.shoulderR, elbowR: R.elbowR,
    legL: R.hipL, kneeL: R.kneeL, legR: R.hipR, kneeR: R.kneeR,
  };
  const parent = { hips: 'rig', torso: 'rig', head: 'rig', armL: 'torso', armR: 'torso', elbowL: 'armL', elbowR: 'armR', legL: 'rig', legR: 'rig', kneeL: 'legL', kneeR: 'legR' };
  const nodes = {};
  for (const nm of names) {
    const p = parent[nm];
    const rel = p ? world[nm].map((v, i) => v - world[p][i]) : world[nm];
    nodes[nm] = doc.createNode(nm).setTranslation(rel);
    if (p) nodes[p].addChild(nodes[nm]); else scene.addChild(nodes[nm]);
  }
  // no glTF skin on purpose: the loader builds the 12-bone skeleton itself (pedMesh.ts) from extras.people.rig, and a skin would move
  // the position quantisation transform onto the bones
  const mat = doc.createMaterial('people').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.8).setMetallicFactor(0);
  for (const [lod, g] of Object.entries(built.lods)) {
    const acc = (nm, arr, type) => doc.createAccessor(nm).setArray(arr).setType(type).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc('pos', g.position, 'VEC3'))
      // no NORMAL: the loader welds by position and computes them (saves 13 % of the file)
      .setAttribute('TEXCOORD_0', acc('uv', g.uv, 'VEC2'))
      .setAttribute('JOINTS_0', acc('j', g.joints, 'VEC4'))
      .setAttribute('WEIGHTS_0', acc('w', g.weights, 'VEC4'))
      .setIndices(acc('idx', g.indices, 'SCALAR'))
      .setMaterial(mat);
    const mesh = doc.createMesh(lod).addPrimitive(prim);
    scene.addChild(doc.createNode(lod).setMesh(mesh));
  }
  await doc.transform(quantize({ quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 12, quantizeWeight: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  doc.getRoot().getAsset().generator = 'GTA Bed-Stuy people-pipeline (MakeHuman CC0 base mesh)';
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  writeFileSync(path, bytes);
  return bytes.length;
}

export async function build(only = null) {
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const src = loadSources();
  const index = {};
  for (const name of Object.keys(SHAPES)) {
    if (only && !only.includes(name)) continue;
    const b = buildShape(src, MeshoptSimplifier, name);
    const bytes = await writeGlb(b, join(PEOPLE, `${name}.glb`));
    index[name] = { height: SHAPES[name].height, bytes, tris: Object.fromEntries(Object.entries(b.lods).map(([k, v]) => [k, v.triangles])) };
    console.log(name, `${(bytes / 1024).toFixed(0)} kB`, JSON.stringify(index[name].tris));
  }
  if (!only) writeFileSync(join(PEOPLE, 'shapes.json'), JSON.stringify(index, null, 1) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cmd = process.argv[2];
  if (cmd === 'fetch') await fetchSources();
  else if (cmd === 'build') await build(process.argv[3] ? process.argv[3].split(',') : null);
  else console.log('usage: node scripts/people-pipeline.mjs fetch|build [shape,shape]');
}
