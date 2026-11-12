#!/usr/bin/env node
// Builds the compact clip packs from CMU Graphics Lab mocap (BVH conversion). Run:
//   node scripts/anim/build-clips.mjs <dir-with-bvh> [--out public/anim] [--report]
// The BVH files are DATA: they are parsed as text, never executed. Output:
//   src/entities/anim/corePack.ts  (base64 of the pack the single-file build bundles)
//   public/anim/street.bin         (the larger pack, hosted and native builds only)
//   public/anim/core.bin           (same bytes as corePack, for tests and tools)
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { parseBvh, fk } from './bvh.mjs';
import { retarget, BONES, NCH, legScale } from './retarget.mjs';
import { CLIPS } from './catalog.mjs';

const dir = process.argv[2];
const outDir = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'public/anim'; })();
const report = process.argv.includes('--report');

const toOurs = (v) => new THREE.Vector3(-v.x, v.y, -v.z);

/** frames where the left foot passes the right one going forward: gait cycle boundaries */
function crossings(b, fa, fb) {
  const I = b.index;
  const hp0 = toOurs(fk(b, fa).pos[I.Hips]), hp1 = toOurs(fk(b, fb).pos[I.Hips]);
  const dir = hp1.clone().sub(hp0); dir.y = 0; dir.normalize();
  const d = [];
  for (let f = fa; f <= fb; f++) {
    const fr = fk(b, f);
    const l = toOurs(fr.pos[I.LeftFoot]), r = toOurs(fr.pos[I.RightFoot]);
    d.push(l.sub(r).dot(dir));
  }
  const w = Math.round(0.03 / b.dt);
  const sm = d.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - w); j <= Math.min(d.length - 1, i + w); j++) { s += d[j]; c++; } return s / c; });
  const out = [];
  for (let i = 1; i < sm.length; i++) if (sm[i - 1] < 0 && sm[i] >= 0) out.push(fa + i);
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;
function sampleRows(rows, dt, t) { // linear sample of rows (array of arrays) at time t seconds
  const x = Math.min(rows.length - 1, Math.max(0, t / dt));
  const i = Math.floor(x), j = Math.min(rows.length - 1, i + 1), u = x - i;
  return rows[i].map((v, c) => lerp(v, rows[j][c], u));
}
function unwrap(rows) {
  for (let c = 0; c < NCH; c++) for (let i = 1; i < rows.length; i++) {
    while (rows[i][c] - rows[i - 1][c] > Math.PI) rows[i][c] -= 2 * Math.PI;
    while (rows[i][c] - rows[i - 1][c] < -Math.PI) rows[i][c] += 2 * Math.PI;
  }
}
function boxSmooth(rows, w, wrap) {
  const n = rows.length;
  return rows.map((_, i) => {
    const acc = new Array(NCH).fill(0);
    let cnt = 0;
    for (let j = i - w; j <= i + w; j++) {
      let jj = j;
      if (wrap) jj = ((j % n) + n) % n; else jj = Math.min(n - 1, Math.max(0, j));
      for (let c = 0; c < NCH; c++) acc[c] += rows[jj][c];
      cnt++;
    }
    return acc.map((v) => v / cnt);
  });
}

function buildClip(spec) {
  const b = parseBvh(path.join(dir, spec.file + '.bvh'));
  const dt = b.dt;
  let f0, f1;
  if (spec.cycle) {
    const fa = Math.round((spec.from ?? 0.6) / dt) + 1, fb = Math.min(b.frames - 1, Math.round((spec.to ?? b.frames * dt - 0.4) / dt));
    const cr = crossings(b, fa, fb);
    if (cr.length < 2) throw new Error(spec.name + ': no gait cycle found');
    let best = null;
    for (let j = 0; j + 1 < cr.length; j++) {
      const r = retarget(b, cr[j], cr[j + 1], { heading: 'path', rigY: 'ground' });
      const T = (cr[j + 1] - cr[j]) * dt;
      const first = r.out[0].row, last = r.out[r.n - 1].row;
      let err = 0;
      for (let c = 0; c < BONES.length * 3; c++) err += (first[c] - last[c]) ** 2;
      if (T < 0.55 || T > 2.0) continue;
      const mid = Math.abs(j - (cr.length - 2) / 2);
      const score = err + mid * 0.002;
      if (!best || score < best.score) best = { score, j, r, T, err };
    }
    if (!best) throw new Error(spec.name + ': no usable cycle');
    f0 = cr[best.j]; f1 = cr[best.j + 1];
  } else {
    f0 = Math.max(1, Math.round(spec.t0 / dt)); f1 = Math.min(b.frames - 1, Math.round(spec.t1 / dt));
  }
  const heading = spec.heading ?? (spec.cycle ? 'path' : 'none');
  const r = retarget(b, f0, f1, { heading, rigY: spec.rigY ?? 'ground' });
  const n = r.n;
  const T = (n - 1) * dt;
  let rows = r.out.map((o) => o.row.slice());
  // rig channels: x lateral sway, y bob, z surge (heading frame); the path itself belongs to the game
  const k = r.k;
  const xz = r.out.map((o) => { const v = new THREE.Vector3(o.hipsXZ[0], 0, o.hipsXZ[1]).applyQuaternion(o.Rh); return [v.x, v.z]; });
  const fit = (arr) => { // least squares line
    const m = arr.length; let sx = 0, sy = 0, sxy = 0, sxx = 0;
    arr.forEach((y, i) => { sx += i; sy += y; sxy += i * y; sxx += i * i; });
    const a = (m * sxy - sx * sy) / (m * sxx - sx * sx || 1), c = (sy - a * sx) / m;
    return { a, c };
  };
  const detr = spec.detrend ?? (spec.cycle ? 'linear' : 'mean');
  const chans = [0, 1].map((c) => {
    const arr = xz.map((p) => p[c]);
    if (detr === 'linear') { const { a, c: c0 } = fit(arr); return arr.map((y, i) => y - (a * i + c0)); }
    if (detr === 'smooth') { const w = Math.round(0.6 / dt); return arr.map((y, i) => { let s = 0, cnt = 0; for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) { s += arr[j]; cnt++; } return y - s / cnt; }); }
    const mean = arr.reduce((p, q) => p + q, 0) / arr.length; return arr.map((y) => y - mean);
  });
  const NB = BONES.length * 3;
  rows.forEach((row, i) => { row[NB] = chans[0][i]; row[NB + 1] = r.out[i].dy; row[NB + 2] = chans[1][i]; });
  // ground speed (our metres per second) of the source motion
  let pathLen = 0;
  for (let i = 1; i < n; i++) pathLen += Math.hypot(r.out[i].hipsXZ[0] - r.out[i - 1].hipsXZ[0], r.out[i].hipsXZ[1] - r.out[i - 1].hipsXZ[1]);
  const speed = spec.speed ?? pathLen / T;
  unwrap(rows);
  rows = boxSmooth(rows, Math.round(0.02 / dt), false);
  // ankles are noisy in the source: extra smoothing on those channels only
  const wide = boxSmooth(rows, Math.round(0.035 / dt), false);
  for (let i = 0; i < n; i++) for (const bn of ['ankleL', 'ankleR']) { const o = BONES.indexOf(bn) * 3; for (let q = 0; q < 3; q++) rows[i][o + q] = wide[i][o + q]; }

  // resample
  let outRows;
  let duration;
  if (spec.cycle) {
    // close the loop: spread the end-to-start gap over the cycle, then sample N poses (without repeating the first)
    const gap = rows[n - 1].map((v, c) => v - rows[0][c]);
    rows = rows.map((row, i) => row.map((v, c) => v - gap[c] * (i / (n - 1))));
    const N = spec.frames ?? 24;
    outRows = Array.from({ length: N }, (_, i) => sampleRows(rows, dt, (i / N) * T));
    duration = T;
  } else {
    const fps = spec.fps ?? 20;
    if (spec.loop) { // idles: the tail is cross-faded into the head so the clip repeats without a pop
      const fadeT = Math.min(0.9, T * 0.3), loopT = T - fadeT;
      const M = Math.max(4, Math.round(loopT * fps)), F = Math.max(2, Math.round(fadeT * fps));
      outRows = Array.from({ length: M }, (_, i) => {
        const a = sampleRows(rows, dt, i / fps);
        if (i >= F) return a;
        const c = sampleRows(rows, dt, loopT + i / fps);
        const w = i / F;
        return c.map((v, q) => lerp(v, a[q], w));
      });
      duration = M / fps;
    } else {
      const N = Math.max(2, Math.round(T * fps) + 1);
      outRows = Array.from({ length: N }, (_, i) => sampleRows(rows, dt, (i / (N - 1)) * T));
      duration = T;
    }
  }
  // sanity: an upright clip never pitches or rolls the spine far; a big one must say so in the catalog (big: true)
  if (!spec.big) {
    const mean = (c) => outRows.reduce((s, r) => s + Math.abs(r[c]), 0) / outRows.length;
    const peak = (c) => Math.max(...outRows.map((r) => Math.abs(r[c])));
    for (const bn of ['hips', 'torso']) for (const ax of [0, 2]) {
      const c = BONES.indexOf(bn) * 3 + ax;
      if (peak(c) > 0.7 || mean(c) > 0.45) throw new Error(`${spec.name}: ${bn} axis ${ax} reaches ${(peak(c) * 57.3).toFixed(0)} degrees (heading or rest-pose problem; mark big: true only if the motion really is that big)`);
    }
  }
  if (spec.mirror) outRows = outRows.map(mirrorRow);
  let marks = [];
  if (spec.marks === 'jump') { // fractions of the clip where the feet leave the ground and land again
    const air = r.out.map((o) => o.lowM > 0.04);
    const a = air.indexOf(true), z = air.lastIndexOf(true);
    marks = [a / (n - 1), (z + 1) / (n - 1)];
  }
  return { marks, absY: spec.rigY === 'air' || spec.rigY === 'abs', name: spec.name, pack: spec.pack, loop: !!(spec.cycle || spec.loop), duration, speed, turn: r.netYaw, rows: outRows, k, meta: { file: spec.file, f0, f1, srcDur: T, netYaw: r.netYaw } };
}

export function mirrorRow(row) {
  const out = row.slice();
  const pair = (a, c) => { const ia = BONES.indexOf(a) * 3, ic = BONES.indexOf(c) * 3; for (let q = 0; q < 3; q++) { out[ia + q] = row[ic + q]; out[ic + q] = row[ia + q]; } };
  pair('armL', 'armR'); pair('elbowL', 'elbowR'); pair('legL', 'legR'); pair('kneeL', 'kneeR'); pair('ankleL', 'ankleR');
  for (let i = 0; i < BONES.length; i++) { out[i * 3 + 1] *= -1; out[i * 3 + 2] *= -1; }
  const NB = BONES.length * 3;
  out[NB] *= -1;
  return out;
}

// ---------------------------------------------------------------- pack format (little endian)
// u8 version(1) u8 clipCount; per clip: u8 nameLen, name, u8 flags(bit0 loop, bit1 rig.y is an absolute pelvis offset), u16 frames, u16 durationMs, u16 speed*100, i16 turn*1000 (rad), u8 nMarks + marks (0..255 of the clip),
//   NCH x (i16 min*4096, u16 range*8192), then per channel with range>0: frames x u8
export function packClips(clips) {
  const parts = [];
  const push = (...bytes) => parts.push(Buffer.from(bytes));
  push(1, clips.length);
  for (const c of clips) {
    const nm = Buffer.from(c.name, 'ascii');
    push(nm.length); parts.push(nm);
    push((c.loop ? 1 : 0) | (c.absY ? 2 : 0));
    const n = c.rows.length;
    const hdr = Buffer.alloc(8);
    const marks = c.marks ?? [];
    hdr.writeUInt16LE(n, 0); hdr.writeUInt16LE(Math.round(c.duration * 1000), 2); hdr.writeUInt16LE(Math.round(c.speed * 100), 4); hdr.writeInt16LE(Math.round((c.turn ?? 0) * 1000), 6);
    parts.push(hdr);
    push(marks.length); for (const m of marks) push(Math.round(Math.min(1, Math.max(0, m)) * 255));
    const ch = Buffer.alloc(NCH * 4);
    const data = [];
    for (let k = 0; k < NCH; k++) {
      let lo = Infinity, hi = -Infinity;
      for (const row of c.rows) { lo = Math.min(lo, row[k]); hi = Math.max(hi, row[k]); }
      const eps = k < NCH - 3 ? 0.004 : 0.0015; // below this the channel is a constant
      const range = hi - lo > eps ? hi - lo : 0;
      const qmin = Math.round(lo * 4096);
      ch.writeInt16LE(qmin, k * 4);
      const qr = Math.min(65535, Math.ceil(range * 8192));
      ch.writeUInt16LE(qr, k * 4 + 2);
      if (qr > 0) {
        const lo2 = qmin / 4096, rg = qr / 8192;
        data.push(Buffer.from(c.rows.map((row) => Math.max(0, Math.min(255, Math.round(((row[k] - lo2) / rg) * 255))))));
      }
    }
    parts.push(ch, ...data);
  }
  return Buffer.concat(parts);
}

const built = CLIPS.map((s) => {
  try { return buildClip(s); } catch (e) { console.error('FAILED', s.name, e.message); return null; }
}).filter(Boolean);

if (report) {
  for (const c of built) console.log(c.name.padEnd(12), c.pack.padEnd(6), 'frames', String(c.rows.length).padStart(3), 'dur', c.duration.toFixed(2), 'speed', c.speed.toFixed(2), 'k', c.k.toFixed(3), JSON.stringify(c.meta));
}
fs.mkdirSync(outDir, { recursive: true });
const core = built.filter((c) => c.pack === 'core');
const street = built.filter((c) => c.pack === 'street');
const coreBin = packClips(core), streetBin = packClips(street);
fs.writeFileSync(path.join(outDir, 'core.bin'), coreBin);
fs.writeFileSync(path.join(outDir, 'street.bin'), streetBin);
fs.writeFileSync('src/entities/anim/corePack.ts',
  `// GENERATED by scripts/anim/build-clips.mjs from CMU Graphics Lab mocap (see docs/CREDITS.md). Do not edit.\n// ${core.length} clips, ${coreBin.length} bytes raw.\nexport const CORE_PACK_B64 =\n  '${coreBin.toString('base64')}';\n`);
console.log('core', core.length, 'clips', coreBin.length, 'bytes (', Math.ceil(coreBin.length * 4 / 3), 'base64 )');
console.log('street', street.length, 'clips', streetBin.length, 'bytes');
const dump = process.argv.indexOf('--dump');
if (dump > 0) fs.writeFileSync(process.argv[dump + 1], JSON.stringify(built.map((c) => ({ name: c.name, pack: c.pack, loop: c.loop, duration: c.duration, speed: c.speed, turn: c.turn, frames: c.rows.length, rows: c.rows }))));
