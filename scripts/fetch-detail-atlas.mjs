#!/usr/bin/env node
// Builds the wall / ground detail atlas (src/assets/textures/detail_atlas_{512,1k}.jpg) from small CC0 ambientCG sets.
// Each tile is the set's colour map reduced to RELATIVE luminance (mean = mid grey), so the per-lot colourway shader
// multiplies the relief into any hue and bleeding between tiles at a distance is neutral. Greyscale JPEG: tiny.
// Per set: src/assets/textures/cc0/<name>/{color_1k.jpg, LICENSE.txt}. Tile order = DETAIL_TILES in src/textures/detailAtlas.ts.
// Usage (behind the agent proxy): NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/fetch-detail-atlas.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/assets/textures');
const CACHE = path.join(ROOT, 'node_modules/.cache/cc0-textures');
const FORCE = process.argv.includes('--force');
const TODAY = new Date().toISOString().slice(0, 10);

// Order matters: tile i sits at column i % 2, row floor(i / 2) of the 2x2 atlas.
const TILES = [
  { name: 'detail_stucco', id: 'Plaster007', use: 'stucco / plaster wall grain' },
  { name: 'detail_tile', id: 'Tiles107', use: 'glazed tile storefront base and glazed brick' },
  { name: 'detail_cobble', id: 'PavingStones046', use: 'Belgian block / cobble showing through worn asphalt' },
  { name: 'detail_caststone', id: 'Concrete034', use: 'cast stone, cracked concrete and limestone trim' },
];

async function zipFor(id) {
  const p = path.join(CACHE, `${id}_1K-JPG.zip`);
  if (fs.existsSync(p)) return unzipSync(new Uint8Array(fs.readFileSync(p)));
  const meta = await (await fetch(`https://ambientcg.com/api/v2/full_json?id=${id}&include=downloadData`)).json();
  const asset = meta.foundAssets?.[0];
  if (!asset) throw new Error(`no asset ${id}`);
  const dl = asset.downloadFolders.default.downloadFiletypeCategories.zip.downloads.find((d) => d.attribute === '1K-JPG');
  const r = await fetch(dl.fullDownloadPath);
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(p, buf);
  return unzipSync(new Uint8Array(buf));
}

async function tilePixels(set, size) {
  const dir = path.join(OUT, 'cc0', set.name);
  const file = path.join(dir, 'color_1k.jpg');
  if (FORCE || !fs.existsSync(file)) {
    const zip = await zipFor(set.id);
    const name = Object.keys(zip).find((n) => n.endsWith('_Color.jpg'));
    if (!name) throw new Error(`${set.id}: no colour map`);
    const html = await (await fetch(`https://ambientcg.com/view?id=${set.id}`)).text();
    if (!/CC0/i.test(html)) throw new Error(`${set.id}: CC0 not found on source page`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, Buffer.from(zip[name]));
    fs.writeFileSync(path.join(dir, 'LICENSE.txt'), [
      `Texture set: ${set.name} (${set.use})`, `Source: ambientCG asset ${set.id}`, `Source URL: https://ambientcg.com/view?id=${set.id}`,
      'Author: ambientCG.com', 'License: CC0 1.0 Universal (public domain dedication)', 'Licence URL: https://creativecommons.org/publicdomain/zero/1.0/',
      `Verified: ambientcg.com asset page states CC0 (checked ${TODAY})`, '',
      'Files: color_1k.jpg (original albedo). The game uses it only as a relative-luminance tile inside detail_atlas_{512,1k}.jpg',
      '(src/assets/textures), built by scripts/fetch-detail-atlas.mjs.', '',
    ].join('\n'));
  }
  const { data } = await sharp(file).resize(size, size, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  // relative luminance: divide by the mean, clip highlights, then store 128 = mean (decoded as value * 2 in the shader)
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  const out = Buffer.alloc(size * size);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((data[i] / mean) * 128)));
  return out;
}

async function atlas(tile, q) {
  const W = tile * 2;
  const buf = Buffer.alloc(W * W);
  for (let i = 0; i < TILES.length; i++) {
    const px = await tilePixels(TILES[i], tile);
    const ox = (i % 2) * tile, oy = Math.floor(i / 2) * tile;
    for (let y = 0; y < tile; y++) px.copy(buf, (oy + y) * W + ox, y * tile, (y + 1) * tile);
  }
  return sharp(buf, { raw: { width: W, height: W, channels: 1 } }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
}

for (const [tile, suffix, q] of [[512, '512', 78], [1024, '1k', 82]]) {
  const b = await atlas(tile, q);
  fs.writeFileSync(path.join(OUT, `detail_atlas_${suffix}.jpg`), b);
  console.log(`detail_atlas_${suffix}.jpg ${(b.length / 1024).toFixed(0)} KB`);
}
