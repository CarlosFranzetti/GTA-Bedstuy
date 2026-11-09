#!/usr/bin/env node
// Fetch CC0 PBR texture sets from ambientCG and Poly Haven into src/assets/textures/cc0/<set>/.
//
// Per set: 1K albedo / OpenGL normal / roughness as JPEG (<map>_1k.jpg, original bytes) and a 512 px
// JPEG re-encode (<map>_512.jpg, quality 82) for the single-file artifact. Writes LICENSE.txt with the
// source URL, author and the CC0 evidence found on the source page. Displacement maps are skipped.
//
// Re-runnable: a set whose files and LICENSE.txt already exist is skipped unless --force is passed.
// Usage: node scripts/fetch-cc0-textures.mjs [--force] [--only=<set>[,<set>]]
// Behind the agent proxy (this container) Node needs:
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/fetch-cc0-textures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/assets/textures/cc0');
const CACHE = path.join(ROOT, 'node_modules/.cache/cc0-textures');
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '')
  .split(',')
  .filter(Boolean);
const TODAY = new Date().toISOString().slice(0, 10);
const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
const MAX_FOLDER_BYTES = 40 * 1024 * 1024;

// One good match per set. src: 'ambientcg' (id = assetId) or 'polyhaven' (id = asset slug).
// note: what the set is standing in for, when the match is partial.
const SETS = [
  { name: 'brick_red_common', src: 'polyhaven', id: 'red_brick_03', use: 'red common-bond brick' },
  { name: 'brick_brownstone', src: 'polyhaven', id: 'concrete_brick_wall_001', use: 'sandstone / brownstone brick' },
  { name: 'brick_painted', src: 'polyhaven', id: 'painted_brick', use: 'painted / whitewashed brick' },
  { name: 'asphalt', src: 'polyhaven', id: 'asphalt_03', use: 'road asphalt' },
  { name: 'concrete_sidewalk', src: 'polyhaven', id: 'concrete_pavers_03', use: 'concrete sidewalk slab' },
  { name: 'bluestone_slate', src: 'polyhaven', id: 'castle_wall_slates', use: 'slate / bluestone' },
  { name: 'corrugated_metal', src: 'polyhaven', id: 'corrugated_iron_02', use: 'corrugated metal' },
  { name: 'painted_metal', src: 'polyhaven', id: 'rusty_painted_metal', use: 'painted metal' },
  { name: 'tar_roof', src: 'polyhaven', id: 'bitumen', use: 'tar / bitumen roof' },
  { name: 'weathered_wood', src: 'polyhaven', id: 'brown_planks_05', use: 'weathered wood' },
  { name: 'grime_wall', src: 'polyhaven', id: 'concrete_wall_006', use: 'dirty wall grime overlay (no glass-grime asset found)' },
  { name: 'denim', src: 'polyhaven', id: 'denim_fabric', use: 'denim clothing' },
  { name: 'cotton_knit', src: 'polyhaven', id: 'cotton_jersey', use: 'cotton knit clothing' },
  { name: 'leather', src: 'polyhaven', id: 'brown_leather', use: 'leather clothing' },
  { name: 'nylon_puffer', src: 'polyhaven', id: 'bi_stretch', use: 'closest stretch fabric (no nylon / puffer asset found)' },
  { name: 'car_paint_flake', src: 'ambientcg', id: 'Metal027', use: 'painted car body (weak: no metallic-flake asset found)' },
  { name: 'tyre_rubber', src: 'ambientcg', id: 'Rubber001', use: 'tyre rubber' },
  { name: 'brushed_chrome', src: 'ambientcg', id: 'Metal009', use: 'brushed chrome (proxy: brushed silver steel)' },
];

const MAPS = {
  ambientcg: { color: '_Color.jpg', normal: '_NormalGL.jpg', rough: '_Roughness.jpg' },
  polyhaven: { color: 'Diffuse', normal: 'nor_gl', rough: 'Rough' },
};

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}

// Download to the cache dir (git-ignored) so re-runs do not re-fetch.
async function getCached(url, file) {
  const p = path.join(CACHE, file);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(p, buf);
  return buf;
}

async function fromAmbientCG(id) {
  const meta = await getJson(`https://ambientcg.com/api/v2/full_json?id=${id}&include=downloadData`);
  const asset = meta.foundAssets?.[0];
  if (!asset) throw new Error(`ambientCG: no asset ${id}`);
  const zips = asset.downloadFolders.default.downloadFiletypeCategories.zip.downloads;
  const dl = zips.find((d) => d.attribute === '1K-JPG');
  if (!dl) throw new Error(`ambientCG: no 1K-JPG zip for ${id}`);
  const zip = unzipSync(new Uint8Array(await getCached(dl.fullDownloadPath, `${id}_1K-JPG.zip`)));
  const pick = (suffix) => {
    const name = Object.keys(zip).find((n) => n.endsWith(suffix));
    if (!name) throw new Error(`ambientCG: ${id} zip has no *${suffix}`);
    return Buffer.from(zip[name]);
  };
  const html = await getText(`https://ambientcg.com/view?id=${id}`);
  if (!/CC0/i.test(html)) throw new Error(`ambientCG: CC0 not found on page for ${id}`);
  return {
    pageUrl: `https://ambientcg.com/view?id=${id}`,
    author: 'ambientCG.com',
    evidence: 'ambientcg.com asset page states CC0',
    maps: {
      color: pick(MAPS.ambientcg.color),
      normal: pick(MAPS.ambientcg.normal),
      rough: pick(MAPS.ambientcg.rough),
    },
  };
}

async function fromPolyHaven(id) {
  const info = await getJson(`https://api.polyhaven.com/info/${id}`);
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const page = await getText(`https://polyhaven.com/a/${id}`);
  if (!/CC0/.test(page)) throw new Error(`Poly Haven: CC0 not found on page for ${id}`);
  const url = (key) => {
    const entry = files[key]?.['1k']?.jpg;
    if (!entry?.url) throw new Error(`Poly Haven: no 1k jpg for ${key} on ${id}`);
    return entry.url;
  };
  const author = Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven';
  const get = async (key, map) => getCached(url(key), `${id}_${map}_1k.jpg`);
  return {
    pageUrl: `https://polyhaven.com/a/${id}`,
    author: `${author} (via Poly Haven)`,
    evidence: 'polyhaven.com asset page states CC0 1.0 Universal',
    maps: {
      color: await get(MAPS.polyhaven.color, 'color'),
      normal: await get(MAPS.polyhaven.normal, 'normal'),
      rough: await get(MAPS.polyhaven.rough, 'rough'),
    },
  };
}

function licenseText(set, src) {
  const srcName = set.src === 'ambientcg' ? 'ambientCG' : 'Poly Haven';
  return [
    `Texture set: ${set.name} (${set.use})`,
    `Source: ${srcName} asset ${set.id}`,
    `Source URL: ${src.pageUrl}`,
    `Author: ${src.author}`,
    'License: CC0 1.0 Universal (public domain dedication)',
    `Licence URL: ${CC0_URL}`,
    `Verified: ${src.evidence} (checked ${TODAY})`,
    '',
    'Files: color_1k.jpg (albedo), normal_1k.jpg (OpenGL normal), rough_1k.jpg (roughness), 1K JPEG.',
    'color_512.jpg, normal_512.jpg, rough_512.jpg: 512 px JPEG re-encodes (quality 82) made by',
    'scripts/fetch-cc0-textures.mjs for single-file artifacts. Displacement and other maps were not kept.',
    '',
  ].join('\n');
}

async function fetchSet(set) {
  const dir = path.join(OUT, set.name);
  const want = ['color', 'normal', 'rough'].flatMap((m) => [`${m}_1k.jpg`, `${m}_512.jpg`]);
  if (!FORCE && fs.existsSync(path.join(dir, 'LICENSE.txt')) && want.every((f) => fs.existsSync(path.join(dir, f)))) {
    return { name: set.name, status: 'skipped (present)' };
  }
  const src = set.src === 'ambientcg' ? await fromAmbientCG(set.id) : await fromPolyHaven(set.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const map of ['color', 'normal', 'rough']) {
    const full = src.maps[map];
    fs.writeFileSync(path.join(dir, `${map}_1k.jpg`), full);
    const small = await sharp(full).resize(512, 512, { fit: 'fill' }).jpeg({ quality: 82 }).toBuffer();
    fs.writeFileSync(path.join(dir, `${map}_512.jpg`), small);
  }
  fs.writeFileSync(path.join(dir, 'LICENSE.txt'), licenseText(set, src));
  return { name: set.name, status: 'fetched', source: `${set.src}:${set.id}` };
}

function dirBytes(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return total;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const todo = ONLY.length ? SETS.filter((s) => ONLY.includes(s.name)) : SETS;
  for (const set of todo) {
    try {
      const r = await fetchSet(set);
      console.log(`${r.name}: ${r.status}${r.source ? ` (${r.source})` : ''}`);
    } catch (err) {
      console.error(`${set.name}: FAILED ${err.message}`);
    }
  }
  const total = dirBytes(OUT);
  console.log(`total ${OUT}: ${(total / 1048576).toFixed(2)} MB`);
  if (total > MAX_FOLDER_BYTES) console.error('WARNING: folder is over 40 MB');
}

main();
