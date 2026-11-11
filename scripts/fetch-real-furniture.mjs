#!/usr/bin/env node
/**
 * Real street furniture positions for the real map (REAL PATH ONLY: hosted and native builds, never the single-file artifact).
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/fetch-real-furniture.mjs
 * Writes public/data/realmap-furniture.json: flat int arrays in decimetres of the REAL_FRAME grid (x, z), clipped to R1R2 grown by
 * EXTENT_MARGIN. Positions are the sources' true positions; the consumer (propsReal.ts) snaps them to the sidewalk band.
 *   hydrants  NYC DEP Hydrants (5bgh-vtsn)                          [x,z,...]
 *   busStops  MTA NYCT Brooklyn bus GTFS stops.txt (gtfs_b.zip)     [x,z,...]  (DOT's shelter dataset t4f2-8md7 has no shelter in this extent)
 *   bikeDocks Citi Bike GBFS station_information (CC; Lyft/NYCBS)   [x,z,capacity,...]
 *   litter    DSNY Litter Basket Inventory (8znf-7b2c)              [x,z,...]
 *   linknyc   LinkNYC kiosks (s4kf-3yrf), live sites                [x,z,...]
 *   trees     2015 Street Tree Census (uvpi-gqnh), living trees     [x,z,dbhIn*16+speciesClass,...]
 * Not Google. NYC Open Data is public data; Citi Bike data is published under the NYC Bike Share data licence (attribution).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/data/realmap-furniture.json');
const UA = { 'User-Agent': 'GTA-Bedstuy-fan-tribute/1.0' };

const vite = await createServer({ configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent', resolve: { alias: { '@': path.join(ROOT, 'src') } }, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true } });
const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
const trees = await vite.ssrLoadModule('/src/world/data/streetTrees.ts');
await vite.close();
const proj = geom.makeFrameProjection(geom.REAL_FRAME);
const RING = ext.R1R2_EXTENT;
const xs = RING.map((p) => p.x), zs = RING.map((p) => p.z);
const BOX = { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] };
// lat/lon query box from the ring's corners
const ll = RING.map((p) => proj.toLonLat(p));
const LAT = [Math.min(...ll.map((p) => p[1])), Math.max(...ll.map((p) => p[1]))], LON = [Math.min(...ll.map((p) => p[0])), Math.max(...ll.map((p) => p[0]))];

const place = (lat, lon) => {
  const p = proj.toGrid(Number(lon), Number(lat));
  if (!Number.isFinite(p.x) || p.x < BOX.x[0] || p.x > BOX.x[1] || p.z < BOX.z[0] || p.z > BOX.z[1] || !geom.pointInPolygon(p, RING)) return null;
  return [Math.round(p.x * 10), Math.round(p.z * 10)];
};

async function getJson(url) {
  for (let a = 0; a < 5; a++) {
    const res = await fetch(url, { headers: UA });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { await new Promise((r) => setTimeout(r, 3000 * (a + 1))); }
  }
  throw new Error(`failed ${url.slice(0, 80)}`);
}
async function socrata(id, select, where) {
  const all = [];
  for (let off = 0; ; off += 5000) {
    const q = new URLSearchParams({ $select: select, $where: where, $limit: '5000', $offset: String(off), $order: ':id' });
    const page = await getJson(`https://data.cityofnewyork.us/resource/${id}.json?${q}`);
    if (!Array.isArray(page)) throw new Error(`${id}: ${JSON.stringify(page).slice(0, 100)}`);
    all.push(...page);
    if (page.length < 5000) break;
  }
  return all;
}
const box = (a, b) => `${a} between '${LAT[0]}' and '${LAT[1]}' AND ${b} between '${LON[0]}' and '${LON[1]}'`;
const flat = (rows, la, lo, extra = () => []) => { const o = []; for (const r of rows) { const p = place(r[la], r[lo]); if (p) o.push(...p, ...extra(r)); } return o; };

const hyd = await socrata('5bgh-vtsn', 'latitude,longitude', box('latitude', 'longitude'));
const gtfs = Buffer.from(await (await fetch('https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip', { headers: UA })).arrayBuffer());
fs.mkdirSync(path.join(ROOT, 'cache'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'cache/gtfs_b.zip'), gtfs);
const stopsTxt = execFileSync('unzip', ['-p', path.join(ROOT, 'cache/gtfs_b.zip'), 'stops.txt'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n');
const splitCsv = (l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
const head = splitCsv(stopsTxt[0]);
const iLat = head.indexOf('stop_lat'), iLon = head.indexOf('stop_lon'), iLoc = head.indexOf('location_type');
const stops = stopsTxt.slice(1).filter(Boolean).map(splitCsv).filter((c) => !c[iLoc] || c[iLoc] === '0').map((c) => ({ lat: c[iLat], lon: c[iLon] }));
const lit = await socrata('8znf-7b2c', 'latitude,longitude', box('latitude', 'longitude'));
const link = await socrata('s4kf-3yrf', 'latitude,longitude,link_installation_status', `${box('latitude', 'longitude')} AND link_installation_status='Live'`);
const tre = await socrata('uvpi-gqnh', 'latitude,longitude,tree_dbh,spc_latin', `status='Alive' AND ${box('latitude', 'longitude')}`);
const gbfs = await getJson('https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_information.json');
const dock = gbfs.data.stations;

const CLASSES = [[/platanus/i, 1], [/gleditsia/i, 2], [/pyrus/i, 3], [/quercus/i, 4], [/acer/i, 5], [/ginkgo/i, 6], [/tilia/i, 7], [/malus|prunus|cercis|lagerstroemia|syringa|crataegus|cornus|amelanchier/i, 8]];
const cls = (s) => { for (const [re, c] of CLASSES) if (re.test(s ?? '')) return c; return 0; };
const out = {
  v: 1, frame: geom.REAL_FRAME, unit: 'dm', fetched: new Date().toISOString().slice(0, 10), extent: 'R1R2_EXTENT (R1R2 ring grown by EXTENT_MARGIN)',
  speciesClasses: trees.SPECIES_CLASSES,
  sources: {
    hydrants: 'NYC DEP Hydrants (5bgh-vtsn), NYC Open Data', busStops: 'MTA New York City Transit Brooklyn bus GTFS (stops.txt), MTA open data', litter: 'DSNY Litter Basket Inventory (8znf-7b2c), NYC Open Data',
    linknyc: 'LinkNYC Kiosk Locations (s4kf-3yrf), NYC OTI via NYC Open Data', trees: 'NYC Parks 2015 Street Tree Census (uvpi-gqnh), NYC Open Data', bikeDocks: 'Citi Bike GBFS station_information (Lyft / NYC Bike Share), published open data',
  },
  hydrants: flat(hyd, 'latitude', 'longitude'),
  busStops: flat(stops, 'lat', 'lon'),
  bikeDocks: flat(dock, 'lat', 'lon', (s) => [Math.min(99, Number(s.capacity) || 0)]),
  litter: flat(lit, 'latitude', 'longitude'),
  linknyc: flat(link, 'latitude', 'longitude'),
  trees: flat(tre, 'latitude', 'longitude', (r) => [Math.min(120, Math.round(Number(r.tree_dbh) || 0)) * 16 + cls(r.spc_latin)]),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const n = { hydrants: out.hydrants.length / 2, busStops: out.busStops.length / 2, bikeDocks: out.bikeDocks.length / 3, litter: out.litter.length / 2, linknyc: out.linknyc.length / 2, trees: out.trees.length / 3 };
console.log('counts', n, `${(fs.statSync(OUT).size / 1024).toFixed(1)} kB`);
for (const k of Object.keys(n)) console.log(k, `${(JSON.stringify(out[k]).length / 1024).toFixed(1)} kB`);
