#!/usr/bin/env node
/**
 * Fetch the 2015 NYC Street Tree Census (NYC Parks, dataset uvpi-gqnh, NYC Open Data) for the game's box and write a compact
 * src/world/data/raw/street-trees.json: per game street id, the count, trunk-diameter histogram and species-class mix of the living street trees
 * (keyed by street so it survives any re-projection or re-gridding of the map).
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/fetch-street-trees.mjs [--bbox s,w,n,e]
 * speciesClass: 0 other, 1 London planetree, 2 honeylocust, 3 Callery pear, 4 pin/red/willow oak, 5 maple, 6 ginkgo, 7 linden, 8 small ornamental.
 * Licence: NYC Open Data terms (public data, no restriction). Not Google.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/world/data/raw/street-trees.json');
const bi = process.argv.indexOf('--bbox');
const [S, W, N, E] = bi > 0 ? process.argv[bi + 1].split(',').map(Number) : [40.686, -73.951, 40.6975, -73.933];
const URL = 'https://data.cityofnewyork.us/resource/uvpi-gqnh.json';
const CLASSES = [
  [/platanus/i, 1], [/gleditsia/i, 2], [/pyrus/i, 3], [/quercus/i, 4], [/acer/i, 5], [/ginkgo/i, 6], [/tilia/i, 7],
  [/malus|prunus|cercis|lagerstroemia|syringa|crataegus|cornus|amelanchier/i, 8],
];
const cls = (latin) => { for (const [re, c] of CLASSES) if (re.test(latin ?? '')) return c; return 0; };

const BINS = [6, 12, 18, 24, 1e9]; // trunk diameter (inches) upper bounds
const ALIAS = { kosciusko: 'kosciuszko', marcusgarvey: 'garvey', malcolmx: 'malcolmx', vanburen: 'vanburen' };
const IDS = new Set(['tompkins', 'throop', 'garvey', 'hart', 'pulaski', 'kosciuszko', 'lafayette', 'vanburen', 'greene', 'lewis', 'stuyvesant', 'malcolmx', 'myrtle', 'park', 'flushing', 'wallabout']);
const streetId = (addr) => {
  const name = (addr ?? '').toLowerCase().replace(/^[\d-]+[a-z]?\s+/, '').replace(/\b(street|st|avenue|ave|boulevard|blvd)\b/g, '').replace(/[^a-z]/g, '');
  const id = ALIAS[name] ?? name;
  return IDS.has(id) ? id : null;
};
const streets = {};
let total = 0;
for (let off = 0; ; off += 5000) {
  const q = new URLSearchParams({ $select: 'address,tree_dbh,spc_latin', $where: `status='Alive' AND latitude between '${S}' and '${N}' AND longitude between '${W}' and '${E}'`, $limit: '5000', $offset: String(off), $order: 'tree_id' });
  let page;
  for (let a = 0; a < 4; a++) {
    const res = await fetch(`${URL}?${q}`, { headers: { 'User-Agent': 'GTA-Bedstuy-fan-tribute/1.0' } });
    const txt = await res.text();
    try { page = JSON.parse(txt); if (Array.isArray(page)) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 3000 * (a + 1)));
  }
  if (!Array.isArray(page)) throw new Error('tree census fetch failed');
  for (const r of page) {
    const id = streetId(r.address);
    if (!id) continue;
    const st = (streets[id] ??= { n: 0, dbh: [0, 0, 0, 0, 0], species: Array(9).fill(0) });
    const d = Number(r.tree_dbh) || 0;
    st.n++; total++;
    st.dbh[BINS.findIndex((b) => d < b)]++;
    st.species[cls(r.spc_latin)]++;
  }
  if (page.length < 5000) break;
}
fs.writeFileSync(OUT, JSON.stringify({ source: 'NYC Parks 2015 Street Tree Census (uvpi-gqnh) via NYC Open Data', fetched: new Date().toISOString().slice(0, 10), bbox: [S, W, N, E], dbhBinsIn: BINS.slice(0, 4), speciesClasses: ['other', 'planetree', 'honeylocust', 'callery pear', 'oak', 'maple', 'ginkgo', 'linden', 'small ornamental'], streets }, null, 1));
console.log(`wrote ${total} trees on ${Object.keys(streets).length} streets to ${path.relative(ROOT, OUT)}`);
