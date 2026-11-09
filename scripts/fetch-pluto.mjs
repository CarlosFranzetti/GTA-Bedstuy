#!/usr/bin/env node
/**
 * Fetch NYC MapPLUTO lots for the ten Bed-Stuy blocks from NYC Open Data (Socrata, dataset 64uk-42ks) with curl and write
 * src/world/data/raw/pluto-bedstuy.json (+ a .query.json sidecar with the query and the fetch date).
 *   node scripts/fetch-pluto.mjs [--out file]
 * Rows are limited to the nine streets of the game grid inside a box around them; scripts/import-pluto.mjs does the exact
 * block assignment. Source: NYC Department of City Planning, MapPLUTO, via NYC Open Data. No Google data.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'src/world/data/raw/pluto-bedstuy.json');
const URL = 'https://data.cityofnewyork.us/resource/64uk-42ks.json';
const STREETS = ['HART STREET', 'PULASKI STREET', 'KOSCIUSZKO STREET', 'KOSCIUSKO STREET', 'LAFAYETTE AVENUE', 'VAN BUREN STREET', 'GREENE AVENUE', 'THROOP AVENUE', 'TOMPKINS AVENUE', 'MARCUS GARVEY BLVD', 'MARCUS GARVEY BOULEVARD'];
const SELECT = 'address,bbl,block,lot,zipcode,bldgclass,landuse,lotarea,bldgarea,numbldgs,numfloors,unitsres,unitstotal,lotfront,lotdepth,bldgfront,bldgdepth,yearbuilt,latitude,longitude,histdist,retailarea,comarea,resarea,ownername';
const BOX = { lat: [40.6860, 40.6970], lon: [-73.9510, -73.9330] };
const where = `borough='BK' AND latitude between '${BOX.lat[0]}' and '${BOX.lat[1]}' AND longitude between '${BOX.lon[0]}' and '${BOX.lon[1]}' AND (${STREETS.map((s) => `address like '% ${s}'`).join(' OR ')})`;

const rows = [];
for (let off = 0; ; off += 5000) {
  const txt = execFileSync('curl', ['-sS', '-m', '120', '-G', URL, '--data-urlencode', `$select=${SELECT}`, '--data-urlencode', `$where=${where}`, '--data-urlencode', '$order=bbl', '--data-urlencode', '$limit=5000', '--data-urlencode', `$offset=${off}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const page = JSON.parse(txt);
  if (!Array.isArray(page)) throw new Error(`unexpected response: ${txt.slice(0, 200)}`);
  rows.push(...page);
  if (page.length < 5000) break;
}
const keep = rows.filter((r) => r.address && r.latitude && r.longitude).map((r) => {
  const o = {};
  for (const [k, v] of Object.entries(r)) if (v !== '0' && v !== '0.0000000' && v !== '') o[k] = k === 'bbl' ? String(Number(v)) : v;
  return o;
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(keep));
fs.writeFileSync(OUT.replace(/\.json$/, '.query.json'), JSON.stringify({ source: 'NYC Department of City Planning, MapPLUTO (64uk-42ks) via NYC Open Data', url: URL, select: SELECT, where, order: 'bbl', fetched: new Date().toISOString().slice(0, 10), rows: keep.length, note: 'Zero-valued fields are dropped to keep the file small. Exact block assignment happens in scripts/import-pluto.mjs.' }, null, 2) + '\n');
console.log(`wrote ${keep.length} rows to ${path.relative(ROOT, OUT)}`);

// ---- NYC Building Footprints (dataset 5zhs-2jue): roof height, ground elevation, construction year per BBL
const FP_URL = 'https://data.cityofnewyork.us/resource/5zhs-2jue.json';
const FP_SELECT = 'base_bbl,bin,height_roof,ground_elevation,construction_year,shape_area,the_geom';
const bbls = [...new Set(keep.map((r) => r.bbl))];
const fps = [];
for (let i = 0; i < bbls.length; i += 120) {
  const chunk = bbls.slice(i, i + 120);
  for (let attempt = 0; ; attempt++) {
    const txt = execFileSync('curl', ['-sS', '-m', '120', '-G', FP_URL, '--data-urlencode', `$select=${FP_SELECT}`, '--data-urlencode', `$where=base_bbl in(${chunk.map((b) => `'${b}'`).join(',')})`, '--data-urlencode', '$limit=5000'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    let page;
    try { page = JSON.parse(txt); } catch { page = null; }
    if (Array.isArray(page)) { fps.push(...page); break; }
    if (attempt >= 3) throw new Error(`footprints: unexpected response ${txt.slice(0, 200)}`);
  }
}
const fpOut = fps.map((f) => {
  const ring = f.the_geom?.coordinates?.[0]?.[0] ?? [];
  const n = Math.max(1, ring.length - 1);
  const lon = ring.slice(0, n).reduce((s, p) => s + p[0], 0) / n, lat = ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n;
  return { bbl: f.base_bbl, bin: f.bin, roofM: f.height_roof ? Math.round(Number(f.height_roof) * 0.3048 * 10) / 10 : undefined, year: f.construction_year, areaSqFt: f.shape_area ? Math.round(Number(f.shape_area)) : undefined, lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 };
});
const FP_OUT = OUT.replace(/pluto-bedstuy\.json$/, 'footprints-bedstuy.json');
fs.writeFileSync(FP_OUT, JSON.stringify(fpOut));
fs.writeFileSync(FP_OUT.replace(/\.json$/, '.query.json'), JSON.stringify({ source: 'NYC Building Footprints (5zhs-2jue) via NYC Open Data', url: FP_URL, select: FP_SELECT, where: 'base_bbl in(<the BBLs of pluto-bedstuy.json>)', fetched: new Date().toISOString().slice(0, 10), rows: fpOut.length, note: 'height_roof is converted from feet to metres (roofM); polygon reduced to its centroid.' }, null, 2) + '\n');
console.log(`wrote ${fpOut.length} footprints to ${path.relative(ROOT, FP_OUT)}`);
