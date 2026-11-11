#!/usr/bin/env node
/**
 * Derive per-lot facade facts from the licensed street photos fetched by scripts/fetch-street-photos.mjs.
 *   node scripts/derive-facade-palette.mjs [--photos cache/street-photos] [--debug dir] [--min-q 0.45]
 * Output: src/world/data/facade-observed.json (compact, keyed by BBL) and facade-observed.provenance.json (sidecar: which photo,
 * author, licence and url fed each lot; NOT bundled into the game).
 *
 * Method (pure geometry + colour statistics, no model, no Google data):
 *  1. A photo needs a position and a compass heading (KartaView and Mapillary give both; Commons photos only through the hand
 *     file scripts/data/photo-poses.json: {"<source>:<id>": {"heading": deg, "fov": deg}}).
 *  2. Every MapPLUTO lot within 10..80 m of the camera and inside the horizontal field of view is projected into the image with a
 *     pinhole model: the facade point is the lot centroid pulled toward the camera by half the lot depth, the facade tangent is the
 *     street's grid axis (8.7 degrees off State Plane), its angular span follows from lotfront. A per-column depth buffer lets nearer
 *     lots claim columns first (occlusion by lots only; cars and trees are filtered by colour instead).
 *  3. In each lot's columns a band of rows around the horizon is sampled; sky, foliage, glass/shadow and clipped highlights are
 *     dropped; the facade colour is the median of the most populated hue/value bin. Awning colour: the most saturated cluster in
 *     the shop band that differs from the wall. A texture energy figure separates brick (busy) from painted / stucco (smooth).
 *  4. Several photos of one lot are merged (median); a lot is published when two photos agree (colour distance < 38) or one photo
 *     scores >= 0.7. Quality q (0..1) rises with sampled pixels, column width and frontal view.
 * What it does NOT do: read floors (the photo band does not see the roofline reliably; PLUTO numfloors stays the authority and the
 * photo count is only reported as a mismatch flag when a roof is visible), or cornice colour. Geotag error (5 to 15 m for dashcams)
 * is the dominant source of wrong lots, hence the agreement rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const PHOTOS = path.resolve(ROOT, opt('photos', 'cache/street-photos'));
const DEBUG = opt('debug', '');
const MIN_Q = Number(opt('min-q', 0.45));
const OUT = path.join(ROOT, 'src/world/data/facade-observed.json');
const GRID_DEG = 8.7; // grid rotation: E-W streets run at bearing 90 - 8.7 = 81.3

/** material classes stored as a digit */
export const MATERIALS = ['brownstone', 'redBrick', 'tanBrick', 'paintedBrick', 'limestone', 'siding', 'stucco', 'panel'];
const RAD = Math.PI / 180;
const EW_STREETS = /\b(HART|PULASKI|KOSCIUSZKO|KOSCIUSKO|DEKALB|LAFAYETTE|VAN BUREN|GREENE|LEXINGTON|QUINCY|GATES|MONROE|MADISON|PUTNAM|JEFFERSON|HANCOCK|HALSEY|MYRTLE|FLUSHING|PARK|WILLOUGHBY)\b/;

// ---------------------------------------------------------------------------------------------- colour helpers
const rgb2hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
};
const hex = (c) => c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

/**
 * Dominant wall colour of a bag of pixels (flat [r,g,b,...]): the most populated hue family (low-saturation pixels form their own
 * family), then the median of its lit half, so shadowed courses and dark joints do not drag a yellow brick to brown.
 */
function dominant(flat) {
  const fam = new Map();
  for (let i = 0; i < flat.length; i += 3) {
    const [h, s, v] = rgb2hsv(flat[i], flat[i + 1], flat[i + 2]);
    const k = s < 0.14 ? 'g' : Math.floor(((h + 15) % 360) / 30);
    let a = fam.get(k); if (!a) { a = []; fam.set(k, a); } a.push([flat[i], flat[i + 1], flat[i + 2], v]);
  }
  let top = null; for (const a of fam.values()) if (!top || a.length > top.length) top = a;
  const mv = median(top.map((p) => p[3]));
  const lit = top.filter((p) => p[3] >= mv);
  return [0, 1, 2].map((i) => median(lit.map((p) => p[i])));
}

/** classify the wall from colour, texture energy and what PLUTO says about the lot */
export function classify(c, tex, lot) {
  const [h, s, v] = rgb2hsv(...c);
  const year = Number(lot.yearbuilt) || 0;
  const newer = year >= 1985;
  if (newer && s < 0.25) return 7; // new-build panel / smooth cladding in greys
  if (s < 0.13) return v > 0.62 ? (tex > 9 ? 3 : 4) : (tex > 9 ? 1 : 7);
  if (h >= 5 && h <= 30 && s >= 0.2 && v < 0.5 && tex <= 14) return 0; // dark warm smooth: brownstone
  if (h >= 345 || h < 22) return s > 0.4 && tex > 8 ? 1 : (tex > 8 ? 0 : 6); // reds: brick (busy) vs stucco (smooth)
  if (h >= 22 && h < 55) return s < 0.3 ? (v > 0.6 ? 4 : 2) : v > 0.55 ? 2 : 0;
  if (h >= 55 && h < 170) return 5; // greens and yellow-greens: siding
  return 5; // blues and the rest: siding or painted
}

// ---------------------------------------------------------------------------------------------- data
const FRAME = { lat0: 40.691633, lon0: -73.942663, rot: 8.6 * RAD };
const KX = (Math.PI / 180) * 6371008.8 * Math.cos(FRAME.lat0 * RAD), KY = (Math.PI / 180) * 6371008.8;
/** lat/lon -> grid metres (same frame as src/world/roadnet/geom.ts REAL_FRAME) */
const toGrid = (lat, lon) => { const e = (lon - FRAME.lon0) * KX, n = (lat - FRAME.lat0) * KY, c = Math.cos(FRAME.rot), s = Math.sin(FRAME.rot); return { x: e * c + n * s, z: e * s - n * c }; };
/** compass bearing (radians clockwise from north) -> unit direction in grid metres */
const dirGrid = (b) => { const e = Math.sin(b), n = Math.cos(b), c = Math.cos(FRAME.rot), s = Math.sin(FRAME.rot); return { x: e * c + n * s, z: e * s - n * c }; };

/**
 * Real-map lots (first and second ring, src/world/data/raw/lots-real-r1r2a.json: BBL, grid x/z, frontage, depth, floors, class).
 * The facade direction of each lot comes from its neighbours: lots on the same street edge and side (lot.e, lot.sd) within 40 m
 * along it are fitted with a line (principal axis); fewer than three neighbours fall back to the street name rule.
 */
function loadLots() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/world/data/raw/lots-real-r1r2a.json'), 'utf8')).lots;
  const groups = new Map();
  for (const l of raw) { if (l.e < 0) continue; const k = `${l.e}|${l.sd}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(l); }
  const out = [];
  for (const l of raw) {
    const nb = l.e >= 0 ? groups.get(`${l.e}|${l.sd}`).filter((o) => Math.abs(o.s - l.s) <= 40) : [];
    let tx, tz;
    if (nb.length >= 3) {
      const mx = nb.reduce((a, o) => a + o.x, 0) / nb.length, mz = nb.reduce((a, o) => a + o.z, 0) / nb.length;
      let sxx = 0, szz = 0, sxz = 0; for (const o of nb) { sxx += (o.x - mx) ** 2; szz += (o.z - mz) ** 2; sxz += (o.x - mx) * (o.z - mz); }
      const th = 0.5 * Math.atan2(2 * sxz, sxx - szz); tx = Math.cos(th); tz = Math.sin(th);
    } else { const ew = EW_STREETS.test((l.ad ?? '').toUpperCase()); const t = (ew ? 0 : 90) * RAD + 0; tx = ew ? 1 : 0; tz = ew ? 0 : 1; void t; }
    out.push({ bbl: l.bbl, address: l.ad, x: l.x, z: l.z, tx, tz, front: l.lf || 6, depth: l.ld || 25, off: Math.max(0, (l.d ?? 20) - 11), yearbuilt: l.yr, cls: l.cls ?? '', retail: /^[KO]/.test(l.cls ?? '') || l.lu === '5' || l.lu === '4', floors: l.fl || 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- one photo
async function loadImage(file, W = 1000) {
  const im = sharp(file).rotate().resize({ width: W, withoutEnlargement: true });
  const { data, info } = await im.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Subject photo: a frontal shot of one building whose geotag is the building itself (Commons CC0 series). The nearest lot within 30 m is the subject. */
function observeSubject(img, pose, lots) {
  const { data, w, h } = img;
  const cam = toGrid(pose.lat, pose.lon);
  let best = null;
  for (const l of lots) { const d = Math.hypot(l.x - cam.x, l.z - cam.z); if (d < 30 && (!best || d < best.d)) best = { l, d }; }
  if (!best) return [];
  const bins = new Map();
  let kept = 0, edge = 0, edgeN = 0;
  for (let y = Math.round(h * 0.3); y < Math.round(h * 0.85); y += 2) for (let x = Math.round(w * 0.25); x < Math.round(w * 0.75); x += 2) {
    const p = (y * w + x) * 3, r = data[p], g = data[p + 1], b = data[p + 2], [hh, s, v] = rgb2hsv(r, g, b);
    if (x + 2 < w * 0.75) { const q = p + 6; edge += Math.abs(0.3 * r + 0.59 * g + 0.11 * b - (0.3 * data[q] + 0.59 * data[q + 1] + 0.11 * data[q + 2])); edgeN++; }
    if (v < 0.18 || (v > 0.93 && s < 0.12) || (hh > 70 && hh < 170 && s > 0.2) || (hh > 190 && hh < 250 && s < 0.35 && v > 0.55 && y < h * 0.5)) continue;
    kept++;
    const k = `${Math.floor(hh / 20)}:${Math.floor(v * 5)}:${s < 0.12 ? 0 : s < 0.35 ? 1 : 2}`;
    let a = bins.get(k); if (!a) { a = []; bins.set(k, a); } a.push(r, g, b);
  }
  if (kept < 800) return [];
  return [{ bbl: best.l.bbl, color: dominant([...bins.values()].flat()), tex: edgeN ? edge / edgeN : 0, awning: null, q: 0.75, lot: best.l, span: [Math.round(w * 0.25), Math.round(w * 0.75)] }];
}

function observePhoto(img, pose, lots, dbg) {
  const { data, w, h } = img;
  const fov = (pose.fov ?? 78) * RAD;
  const f = (w / 2) / Math.tan(fov / 2);
  const cam = toGrid(pose.lat, pose.lon);
  const hv = dirGrid(pose.heading * RAD);
  const ha = Math.atan2(hv.x, -hv.z);
  const ang = (dx, dz) => { let r = Math.atan2(dx, -dz) - ha; while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r; };
  const cands = [];
  for (const l of lots) {
    let dx = l.x - cam.x, dz = l.z - cam.z;
    if (Math.abs(dx) > 90 || Math.abs(dz) > 90) continue;
    // facade point: from the centroid toward the street (normal to the facade line, toward the camera) by its distance to the building line
    let nx = -l.tz, nz = l.tx;
    if (nx * -dx + nz * -dz < 0) { nx = -nx; nz = -nz; }
    const pull = Math.min(l.off, 30);
    dx += nx * pull; dz += nz * pull;
    const d = Math.hypot(dx, dz);
    if (d < 10 || d > 80) continue;
    const rel = ang(dx, dz);
    if (Math.abs(rel) > fov / 2 * 0.98) continue;
    const hw = l.front / 2;
    const col = (px, pz) => { const r = ang(px, pz); return Math.abs(r) >= Math.PI / 2 ? null : w / 2 + f * Math.tan(r); };
    const c0 = col(dx - l.tx * hw, dz - l.tz * hw), c1 = col(dx + l.tx * hw, dz + l.tz * hw);
    if (c0 == null || c1 == null) continue;
    const x0 = Math.min(c0, c1), x1 = Math.max(c0, c1);
    const cosInc = Math.abs((dx / d) * nx + (dz / d) * nz); // 1 = looking straight at the facade
    if (x1 - x0 < 24 || cosInc < 0.12) continue;
    cands.push({ l, d, x0, x1, cosInc });
  }
  cands.sort((a, b) => a.d - b.d);
  const zbuf = new Float32Array(w).fill(1e9);
  const out = [];
  for (const c of cands) {
    const xa = Math.max(0, Math.round(c.x0)), xb = Math.min(w - 1, Math.round(c.x1));
    const free = [];
    for (let x = xa; x <= xb; x++) if (zbuf[x] > c.d - 1) free.push(x);
    if (free.length < 24 || free.length < (xb - xa) * 0.5) continue;
    for (const x of free) zbuf[x] = Math.min(zbuf[x], c.d);
    // keep the central 70% of the free columns: lot edges are where geotag error bites
    const lo = Math.floor(free.length * 0.15), hi = Math.ceil(free.length * 0.85);
    const cols = free.slice(lo, hi);
    const y0 = Math.round(h * 0.22), y1 = Math.round(h * 0.6);
    const bins = new Map();
    let lum = 0, lumN = 0, edge = 0, edgeN = 0, kept = 0, total = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let i = 0; i < cols.length; i += 2) {
        const x = cols[i], p = (y * w + x) * 3;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        total++;
        const [hh, s, v] = rgb2hsv(r, g, b);
        const L = 0.3 * r + 0.59 * g + 0.11 * b;
        if (i + 2 < cols.length) { const q = (y * w + cols[i + 2]) * 3; edge += Math.abs(L - (0.3 * data[q] + 0.59 * data[q + 1] + 0.11 * data[q + 2])); edgeN++; }
        if (v < 0.18) continue; // windows and shadow
        if (v > 0.93 && s < 0.12) continue; // clipped sky or paint highlights
        if (hh > 70 && hh < 170 && s > 0.2) continue; // foliage
        if (s < 0.3 && v > 0.55 && y < h * 0.5 && (hh > 170 || b > r)) continue; // sky, blue or overcast grey (a pale painted wall in the upper half is lost with it)
        kept++; lum += L; lumN++;
        const k = `${Math.floor(hh / 20)}:${Math.floor(v * 5)}:${s < 0.12 ? 0 : s < 0.35 ? 1 : 2}`;
        let b0 = bins.get(k); if (!b0) { b0 = []; bins.set(k, b0); }
        b0.push(r, g, b);
      }
    }
    if (kept < 120 || kept < total * 0.25) continue;
    const col = dominant([...bins.values()].flat());
    const tex = edgeN ? edge / edgeN : 0;
    // shop band: awning colour = most saturated cluster that is not the wall
    let awning = null;
    if (c.l.retail) {
      const ab = new Map();
      for (let y = Math.round(h * 0.52); y < Math.round(h * 0.72); y += 2) for (let i = 0; i < cols.length; i += 2) {
        const p = (y * w + cols[i]) * 3, [hh, s, v] = rgb2hsv(data[p], data[p + 1], data[p + 2]);
        if (s < 0.5 || v < 0.25 || (hh > 70 && hh < 170)) continue;
        const dh = Math.min(Math.abs(hh - rgb2hsv(...col)[0]), 360 - Math.abs(hh - rgb2hsv(...col)[0]));
        if (dh < 25 && v < 0.7) continue;
        const k = Math.floor(hh / 20); let a = ab.get(k); if (!a) { a = []; ab.set(k, a); } a.push(data[p], data[p + 1], data[p + 2]);
      }
      let top = null; for (const a of ab.values()) if (!top || a.length > top.length) top = a;
      if (top && top.length / 3 > 40) { const r2 = [], g2 = [], b2 = []; for (let i = 0; i < top.length; i += 3) { r2.push(top[i]); g2.push(top[i + 1]); b2.push(top[i + 2]); } awning = [median(r2), median(g2), median(b2)]; }
    }
    const q = Math.min(1, (Math.min(kept, 1500) / 1500) * 0.5 + Math.min((xb - xa) / 160, 1) * 0.25 + Math.min(c.cosInc / 0.6, 1) * 0.15 + (lumN && lum / lumN > 60 ? 0.1 : 0));
    out.push({ bbl: c.l.bbl, color: col, tex, awning, q, lot: c.l, span: [xa, xb] });
  }
  if (dbg) for (const o of out) { dbg.push(o); }
  return out;
}

// ---------------------------------------------------------------------------------------------- main
async function main() {
  const man = JSON.parse(fs.readFileSync(path.join(PHOTOS, 'manifest.json'), 'utf8'));
  const posesFile = path.join(ROOT, 'scripts/data/photo-poses.json');
  const poses = fs.existsSync(posesFile) ? JSON.parse(fs.readFileSync(posesFile, 'utf8')) : {};
  const lots = loadLots();
  const per = new Map(); // bbl -> observations
  let used = 0, skipped = 0;
  for (const p of man.photos) {
    const pose = { lat: p.lat, lon: p.lon, heading: p.heading, fov: p.source === 'kartaview' ? 78 : 70, ...(poses[`${p.source}:${p.id}`] ?? {}) };
    if (!p.file || p.pano || pose.lat == null || (pose.heading == null && !pose.subject)) { skipped++; continue; }
    let img;
    try { img = await loadImage(path.join(PHOTOS, p.file)); } catch { skipped++; continue; }
    if (img.h > img.w && !pose.subject) { skipped++; continue; } // portrait phone frames: the field of view is unknown
    const meanL = (() => { let s = 0, n = 0; for (let i = 0; i < img.data.length; i += 300) { s += img.data[i]; n++; } return s / n; })();
    if (meanL < 45) { skipped++; continue; } // night / dark frames
    const obs = pose.subject ? observeSubject(img, pose, lots) : observePhoto(img, pose, lots, null);
    used++;
    for (const o of obs) { const a = per.get(o.bbl) ?? []; a.push({ ...o, photo: p }); per.set(o.bbl, a); }
    if (DEBUG) {
      fs.mkdirSync(DEBUG, { recursive: true });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.w}" height="${img.h}">${obs.map((o) => `<rect x="${o.span[0]}" y="${img.h * 0.22}" width="${o.span[1] - o.span[0]}" height="${img.h * 0.38}" fill="none" stroke="#fff" stroke-width="2"/><rect x="${o.span[0]}" y="${img.h * 0.6}" width="${o.span[1] - o.span[0]}" height="40" fill="#${hex(o.color)}" stroke="#000"/><text x="${o.span[0] + 3}" y="${img.h * 0.6 + 30}" font-size="13" fill="#fff" stroke="#000" stroke-width="0.5">${o.lot.address.replace(/&/g, '')} q${o.q.toFixed(2)}</text>`).join('')}</svg>`;
      await sharp(path.join(PHOTOS, p.file)).rotate().resize({ width: img.w }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80 }).toFile(path.join(DEBUG, p.file));
    }
  }
  const lotsOut = {};
  const prov = {};
  let agreed = 0, single = 0, rejected = 0;
  for (const [bbl, arr] of per) {
    const lot = arr[0].lot;
    arr.sort((a, b) => b.q - a.q);
    // find the largest agreeing group
    let group = [arr[0]];
    for (const a of arr) { const g = arr.filter((b) => dist(a.color, b.color) < 38); if (g.length > group.length) group = g; }
    const best = group[0];
    const ok = group.length >= 2 ? (agreed++, group.reduce((s, o) => s + o.q, 0) / group.length >= MIN_Q) : (best.q >= 0.75 ? (single++, true) : false);
    if (!ok) { rejected++; continue; }
    const col = [0, 1, 2].map((i) => median(group.map((o) => o.color[i])));
    const tex = median(group.map((o) => o.tex));
    const aw = group.map((o) => o.awning).filter(Boolean);
    const awning = aw.length ? [0, 1, 2].map((i) => median(aw.map((o) => o[i]))) : null;
    const m = classify(col, tex, lot);
    const q = Math.min(1, group.reduce((s, o) => s + o.q, 0) / group.length + (group.length > 1 ? 0.1 : 0));
    lotsOut[bbl] = `${hex(col)}:${m}:${Math.round(q * 100)}${awning ? ':' + hex(awning) : ''}`;
    prov[bbl] = group.map((o) => ({ photo: `${o.photo.source}:${o.photo.id}`, author: o.photo.author, licence: o.photo.licenceText ?? o.photo.licence, url: o.photo.page, taken: o.photo.taken }));
  }
  const body = { v: 1, format: '<rrggbb wall>:<material index>:<quality 0-100>[:<rrggbb awning>]', materials: MATERIALS, source: 'colour statistics of openly licensed street photos (see facade-observed.provenance.json); facts only, no pixels are redistributed', lots: lotsOut };
  fs.writeFileSync(OUT, JSON.stringify(body));
  fs.writeFileSync(OUT.replace(/\.json$/, '.provenance.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), photosUsed: used, photosSkipped: skipped, note: 'CC BY-SA photos contribute facts (a wall colour), not pixels; attribution kept here and in docs/CREDITS.md.', lots: prov }, null, 1));
  console.log(`photos used ${used}, skipped ${skipped}; lots seen ${per.size}; published ${Object.keys(lotsOut).length} (agreed ${agreed}, single ${single}, rejected ${rejected})`);
  const byM = {}; for (const v of Object.values(lotsOut)) { const mm = MATERIALS[+v.split(':')[1]]; byM[mm] = (byM[mm] ?? 0) + 1; }
  console.log('by material', byM);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
