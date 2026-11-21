#!/usr/bin/env node
/**
 * import-lots-real: MapPLUTO lots and NYC building footprints for the RoadNet R1 and R2 extents (src/world/roadnet/extents.ts)
 * -> src/world/data/raw/lots-real-r1r2a.json, a compact derived file keyed by BBL. Each lot is attached to its nearest
 * at-grade street edge of src/world/data/roadnet-core.json (edge id, distance along the edge, side, distance from it).
 *
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/import-lots-real.mjs [--refresh]
 *
 * Raw caches: src/world/data/raw/pluto-r1r2.json (MapPLUTO rows, tracked) and cache/lots-real/footprints-r1r2.json
 * (footprint polygons, git-ignored: too big to track). Without --refresh the caches are reused; a missing cache is fetched.
 * Projection and origin are the same as import-streets.mjs (REAL_FRAME, grid metres, +x east, +z south).
 * Data: NYC DCP MapPLUTO (64uk-42ks) and NYC Building Footprints (5zhs-2jue) via NYC Open Data. No Google data.
 *
 * MapPLUTO has no geometry column on Socrata, so a lot is its centroid (latitude/longitude), not its polygon.
 *
 * --r3 (MAP7, 18 Nov 2026): the whole real map (R1+R2+R3, extents.ts R3_EXTENT) against src/world/data/roadnet-r123.json.
 *   Caches: cache/real-r3/pluto-r3.json and cache/real-r3/footprints-r3.json (git-ignored; the queries, row counts and fetch
 *   dates are in the tracked src/world/data/raw/pluto-r3.query.json and footprints-r3.query.json). Footprints are fetched
 *   without their polygons (the game places lots by PLUTO frontage and depth; it needs only each building's roof height, year and
 *   footprint area). Output: public/data/real/lots-index.json and one lots-<tx>_<tz>.json per 512 m tile (src/world/roadnet/lotTiles.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUTO_RAW = path.join(ROOT, 'cache/lots-real/pluto-r1r2.json');
const RINGS_OUT = path.join(ROOT, 'cache/lots-real/footprint-rings-r1r2.json');
const FOOT_RAW = path.join(ROOT, 'cache/lots-real/footprints-r1r2.json');
const OUT = path.join(ROOT, 'src/world/data/raw/lots-real-r1r2a.json');
const CORE = path.join(ROOT, 'src/world/data/roadnet-core.json');
const PLUTO = 'https://data.cityofnewyork.us/resource/64uk-42ks.json';
const FOOT = 'https://data.cityofnewyork.us/resource/5zhs-2jue.json';
const PLUTO_FIELDS = [
  'bbl', 'address', 'borough', 'block', 'lot', 'bldgclass', 'landuse', 'lotarea', 'bldgarea', 'numfloors', 'lotfront', 'lotdepth',
  'bldgfront', 'bldgdepth', 'yearbuilt', 'latitude', 'longitude',
];
const FOOT_FIELDS = ['base_bbl', 'bin', 'height_roof', 'construction_year', 'the_geom'];
const FT = 0.3048;
const FRONT_MAX_M = 40; // attached: nearest street centreline within this distance
const ANOMALY_M = 60; // no street within this distance is an anomaly
const SNAP = 10; // polygon vertices stored as integers in 0.1 m

const num = (s) => { const v = Number.parseFloat(s); return Number.isFinite(v) ? v : null; };
const r1 = (n) => Math.round(n * 10) / 10;

async function pagedFetch(base, select, where, order, label) {
  const rows = [];
  const page = 5000;
  for (let off = 0; ; off += page) {
    const q = new URLSearchParams({ $select: select, $where: where, $order: order, $limit: String(page), $offset: String(off) });
    const res = await fetch(`${base}?${q}`);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const rowsPage = await res.json();
    rows.push(...rowsPage);
    console.log(`  ${label} offset ${off}: ${rowsPage.length} rows`);
    if (rowsPage.length < page) break;
  }
  return rows;
}

function shoelace(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p.x * q.z - q.x * p.z; }
  return Math.abs(a) / 2;
}

/** outer rings of a GeoJSON Polygon or MultiPolygon, as lon/lat arrays */
function outerRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((poly) => poly[0]);
  return [];
}

async function main() {
  if (process.argv.includes('--r3')) return mainR3();
  const refresh = process.argv.includes('--refresh');
  const vite = await createServer({
    configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent',
    resolve: { alias: { '@': path.join(ROOT, 'src') } },
    server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true },
  });
  try {
    const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
    const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
    const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
    const proj = geom.makeFrameProjection(geom.REAL_FRAME);

    // bounding box of the R1 and R2 extents in lon/lat (with a small margin)
    const ll = [...ext.R1_EXTENT, ...ext.R2_EXTENT].map((p) => proj.toLonLat(p));
    const lats = ll.map((p) => p[1]), lons = ll.map((p) => p[0]);
    const N = Math.max(...lats) + 0.0005, S = Math.min(...lats) - 0.0005, W = Math.min(...lons) - 0.0005, E = Math.max(...lons) + 0.0005;
    const bbox = { n: N, s: S, w: W, e: E };

    // ---- raw MapPLUTO rows (BK, inside the box; the polygon test happens below)
    let pluto;
    if (refresh || !fs.existsSync(PLUTO_RAW)) {
      const where = `borough='BK' AND latitude::number between ${S.toFixed(6)} and ${N.toFixed(6)} AND longitude::number between ${W.toFixed(6)} and ${E.toFixed(6)}`;
      const rows = await pagedFetch(PLUTO, PLUTO_FIELDS.join(','), where, 'bbl', 'pluto');
      pluto = { source: 'NYC DCP MapPLUTO (64uk-42ks) via NYC Open Data', url: PLUTO, where, bbox, fetched: new Date().toISOString(), rows };
      fs.writeFileSync(PLUTO_RAW, JSON.stringify(pluto));
    } else pluto = JSON.parse(fs.readFileSync(PLUTO_RAW, 'utf8'));
    console.log(`MapPLUTO rows: ${pluto.rows.length} (fetched ${pluto.fetched})`);

    // ---- raw footprints (polygons; the cache is git-ignored)
    let foot;
    if (refresh || !fs.existsSync(FOOT_RAW)) {
      const where = `within_box(the_geom, ${N.toFixed(6)}, ${W.toFixed(6)}, ${S.toFixed(6)}, ${E.toFixed(6)})`;
      const rows = await pagedFetch(FOOT, FOOT_FIELDS.join(','), where, 'bin', 'footprints');
      foot = { source: 'NYC Building Footprints (5zhs-2jue) via NYC Open Data', url: FOOT, where, bbox, fetched: new Date().toISOString(), rows };
      fs.mkdirSync(path.dirname(FOOT_RAW), { recursive: true });
      fs.writeFileSync(FOOT_RAW, JSON.stringify(foot));
    } else foot = JSON.parse(fs.readFileSync(FOOT_RAW, 'utf8'));
    console.log(`footprint rows: ${foot.rows.length} (fetched ${foot.fetched})`);

    // ---- lots: centroid inside R1 or R2 extent, first row per BBL wins
    const anomalies = { noCoordinates: [], outsideExtents: 0, duplicateBbl: [], zeroFrontage: [], noStreet60: [] };
    const lots = new Map();
    const sorted = [...pluto.rows].sort((a, b) => String(a.bbl).localeCompare(String(b.bbl)));
    for (const row of sorted) {
      const lat = num(row.latitude), lon = num(row.longitude);
      if (lat === null || lon === null) { anomalies.noCoordinates.push(row.bbl); continue; }
      const p = proj.toGrid(lon, lat);
      const inExt = geom.pointInPolygon(p, ext.R1_EXTENT) || geom.pointInPolygon(p, ext.R2_EXTENT);
      if (!inExt) { anomalies.outsideExtents++; continue; }
      const bbl = String(row.bbl).replace(/\.0+$/, '');
      if (lots.has(bbl)) { anomalies.duplicateBbl.push(bbl); continue; }
      const lf = num(row.lotfront), ld = num(row.lotdepth);
      lots.set(bbl, {
        bbl, ad: row.address ?? '', ph: ext.phaseOf(p) ?? 'R2', x: r1(p.x), z: r1(p.z),
        lf: lf === null ? null : r1(lf * FT), ld: ld === null ? null : r1(ld * FT),
        bf: num(row.bldgfront) === null ? null : r1(num(row.bldgfront) * FT),
        bd: num(row.bldgdepth) === null ? null : r1(num(row.bldgdepth) * FT),
        fl: num(row.numfloors), yr: num(row.yearbuilt), cls: row.bldgclass ?? '', lu: row.landuse ?? '',
        _p: p, _lat: lat, _lon: lon,
      });
      if (!lf) anomalies.zeroFrontage.push(bbl);
    }

    // ---- footprints: keep those whose BBL is a kept lot; one entry per BIN
    const buildings = new Map();
    for (const row of foot.rows) {
      const bbl = String(row.base_bbl ?? '').replace(/\.0+$/, '');
      if (!lots.has(bbl) || !row.bin || buildings.has(row.bin)) continue;
      const rings = outerRings(row.the_geom).map((ring) => ring.map(([lon, lat]) => proj.toGrid(lon, lat)));
      if (!rings.length) continue;
      const area = rings.reduce((a, r) => a + shoelace(r), 0);
      const roofM = num(row.height_roof) === null ? null : r1(num(row.height_roof) * FT);
      buildings.set(row.bin, {
        bin: String(row.bin), bbl, rf: roofM, yr: num(row.construction_year), fa: r1(area),
        rings: rings.map((r) => r.flatMap((p) => [Math.round(p.x * SNAP), Math.round(p.z * SNAP)])),
      });
    }
    for (const b of buildings.values()) {
      const lot = lots.get(b.bbl);
      lot.bins = [...(lot.bins ?? []), b.bin];
      lot.fa = r1((lot.fa ?? 0) + b.fa);
      lot.rf = Math.max(lot.rf ?? 0, b.rf ?? 0) || null;
    }

    // ---- RoadNet: nearest at-grade street edge (not BQE / ramps) per lot
    const coreJson = fs.readFileSync(CORE, 'utf8');
    const net = RoadNet.fromJson(JSON.parse(coreJson));
    const frontage = (e) => net.edges[e].level === 0 && net.edges[e].cls !== 'highway' && net.edges[e].cls !== 'ramp';
    for (const lot of lots.values()) {
      const p = lot._p;
      const hit = net.nearestEdge(p, 400, frontage);
      if (!hit || hit.dist > ANOMALY_M) anomalies.noStreet60.push(lot.bbl);
      if (hit) {
        const cross = hit.dir.x * (p.z - hit.point.z) - hit.dir.z * (p.x - hit.point.x);
        lot.e = hit.edge; lot.s = r1(hit.s); lot.sd = cross >= 0 ? 1 : -1; lot.d = r1(hit.dist);
      } else { lot.e = -1; lot.s = null; lot.sd = 0; lot.d = null; }
      lot.blk = net.blockAt(p);
    }

    // ---- write
    const outLots = [...lots.values()].map(({ _p, _lat, _lon, ...rest }) => {
      const o = { ...rest };
      for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
      return o;
    });
    const outBuildings = [...buildings.values()].sort((a, b) => a.bin.localeCompare(b.bin));
    // footprint polygons are big (git-ignored cache); the tracked file keeps the per-building numbers only
    fs.writeFileSync(RINGS_OUT, JSON.stringify(Object.fromEntries(outBuildings.map((b) => [b.bin, b.rings]))));
    for (const b of outBuildings) delete b.rings;
    const coreSha = crypto.createHash('sha1').update(coreJson).digest('hex');
    const out = {
      meta: {
        v: 1,
        script: 'scripts/import-lots-real.mjs',
        frame: geom.REAL_FRAME,
        units: 'metres in the RoadNet grid frame (+x east, +z south), x and z rounded to 0.1 m',
        phases: { R1: 'ext.R1_EXTENT (grown 45 m)', R2: 'ext.R2_EXTENT (grown 45 m); no separate R2a ring exists yet' },
        sources: [
          { name: pluto.source, fetched: pluto.fetched, rows: pluto.rows.length },
          { name: foot.source, fetched: foot.fetched, rows: foot.rows.length },
        ],
        roadnet: { file: 'src/world/data/roadnet-core.json', sha1: coreSha, edges: net.edges.length, nodes: net.nodes.length },
        keys: 'lot.bbl is the key; buildings link to lots by bbl (lot.bins lists their BIN); lot.e indexes roadnet-core edges',
        fields: {
          lot: {
            bbl: 'tax lot BBL (string)', ad: 'PLUTO address', ph: 'phase R1 | R2', x: 'centroid x (grid m)', z: 'centroid z (grid m)',
            lf: 'lot frontage (m, PLUTO lotfront)', ld: 'lot depth (m, PLUTO lotdepth)', bf: 'building front (m)', bd: 'building depth (m)',
            fl: 'floors (PLUTO numfloors)', yr: 'year built', cls: 'PLUTO building class', lu: 'PLUTO land use code',
            e: 'nearest frontage edge index in roadnet-core (at-grade, not highway/ramp); -1 if none within 400 m',
            s: 'distance along edge e from its a-node to the foot point (m)',
            sd: 'side of edge e: +1 lot is on the side where dir x offset is positive (grid frame), -1 the other side',
            d: 'distance from lot centroid to edge e (m)', blk: 'RoadNet block index containing the centroid, -1 none',
            bins: 'BINs of footprints on this lot', fa: 'footprint area sum (m2)', rf: 'highest roof height (m, footprint data)',
          },
          building: { bin: 'NYC BIN', bbl: 'lot BBL', rf: 'roof height (m)', yr: 'construction year', fa: 'footprint area (m2)' },
          rings: 'footprint outer rings (flat [x0,z0,x1,z1,...] in 0.1 m integers) are keyed by BIN in cache/lots-real/footprint-rings-r1r2.json (git-ignored)',
        },
        counts: {
          lots: outLots.length,
          byPhase: outLots.reduce((a, l) => ((a[l.ph] = (a[l.ph] ?? 0) + 1), a), {}),
          buildings: outBuildings.length,
        },
        anomalies: {
          noCoordinates: anomalies.noCoordinates.length,
          outsideExtents: anomalies.outsideExtents,
          duplicateBbl: anomalies.duplicateBbl,
          zeroFrontage: anomalies.zeroFrontage,
          noStreet60: anomalies.noStreet60,
        },
      },
      lots: outLots,
      buildings: outBuildings,
    };
    const json = JSON.stringify(out);
    fs.writeFileSync(OUT, json + '\n');

    // ---- summary
    console.log(`wrote ${path.relative(ROOT, OUT)}: ${(json.length / 1024).toFixed(0)} kB raw`);
    for (const ph of ['R1', 'R2']) {
      const L = outLots.filter((l) => l.ph === ph);
      if (!L.length) { console.log(`${ph}: 0 lots`); continue; }
      const withFp = L.filter((l) => l.bins?.length).length;
      const att = L.filter((l) => l.d !== null && l.d <= FRONT_MAX_M).length;
      const classes = Object.entries(L.reduce((a, l) => ((a[l.cls.slice(0, 2) || '--'] = (a[l.cls.slice(0, 2) || '--'] ?? 0) + 1), a), {}))
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', ');
      console.log(`${ph}: ${L.length} lots, footprints on ${(100 * withFp / L.length).toFixed(1)}%, attached within 40 m ${(100 * att / L.length).toFixed(1)}%`);
      console.log(`  top classes: ${classes}`);
    }
    const a = anomalies;
    console.log(`anomalies: duplicate BBL ${a.duplicateBbl.length} (${a.duplicateBbl.slice(0, 8).join(', ')}); zero frontage ${a.zeroFrontage.length}; no street within ${ANOMALY_M} m ${a.noStreet60.length}; no coordinates ${a.noCoordinates.length}; outside extents ${a.outsideExtents}`);
    console.log(`footprints: ${outBuildings.length} kept (on ${new Set(outBuildings.map((b) => b.bbl)).size} lots) of ${foot.rows.length} in the box; the rest lie outside the extents or have no kept lot`);
    console.log(`roadnet-core sha1 ${coreSha.slice(0, 12)}, ${net.edges.length} edges`);
  } finally {
    await vite.close();
  }
}

// ------------------------------------------------------------------------------------------------ --r3
const R3_DIR = path.join(ROOT, 'cache/real-r3');
const R3_PLUTO_FIELDS = [...PLUTO_FIELDS, 'ownername', 'unitsres', 'unitstotal', 'numbldgs', 'zonedist1', 'schooldist'];
const R3_FOOT_FIELDS = ['base_bbl', 'bin', 'height_roof', 'construction_year', 'shape_area'];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagedFetchSlow(base, select, where, order, label) {
  // pages of 2,500 rows, each kept on disk as soon as it arrives so an interrupted run resumes where it stopped
  const rows = [];
  const page = 2500;
  const dir = path.join(R3_DIR, `${label}-pages`);
  fs.mkdirSync(dir, { recursive: true });
  for (let off = 0; ; off += page) {
    const file = path.join(dir, `${off}.json`);
    let rowsPage = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    for (let attempt = 0; attempt < 6 && !rowsPage; attempt++) {
      try {
        const q = new URLSearchParams({ $select: select, $where: where, $order: order, $limit: String(page), $offset: String(off) });
        const res = await fetch(`${base}?${q}`);
        if (res.ok) { rowsPage = await res.json(); fs.writeFileSync(file, JSON.stringify(rowsPage)); await pause(1500); }
        else { console.log(`  ${label} HTTP ${res.status}, retrying`); await pause(4000 * (attempt + 1)); }
      } catch (e) { console.log(`  ${label} ${String(e.cause?.code ?? e.message)}, retrying`); await pause(4000 * (attempt + 1)); }
    }
    if (!rowsPage) throw new Error(`${label}: failures at offset ${off}`);
    rows.push(...rowsPage);
    console.log(`  ${label} offset ${off}: ${rowsPage.length} rows`);
    if (rowsPage.length < page) break;
  }
  return rows;
}

async function mainR3() {
  const refresh = process.argv.includes('--refresh');
  const vite = await createServer({
    configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent',
    resolve: { alias: { '@': path.join(ROOT, 'src') } },
    server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true },
  });
  try {
    const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
    const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
    const tiles = await vite.ssrLoadModule('/src/world/roadnet/lotTiles.ts');
    const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
    const proj = geom.makeFrameProjection(geom.REAL_FRAME);
    fs.mkdirSync(R3_DIR, { recursive: true });
    const ll = ext.R3_EXTENT.map((p) => proj.toLonLat(p));
    const lats = ll.map((p) => p[1]), lons = ll.map((p) => p[0]);
    const N = Math.max(...lats) + 0.0005, S = Math.min(...lats) - 0.0005, W = Math.min(...lons) - 0.0005, E = Math.max(...lons) + 0.0005;
    const bbox = { n: N, s: S, w: W, e: E };
    const plutoFile = path.join(R3_DIR, 'pluto-r3.json'), footFile = path.join(R3_DIR, 'footprints-r3.json');

    let pluto;
    if (refresh || !fs.existsSync(plutoFile)) {
      const where = `borough='BK' AND latitude::number between ${S.toFixed(6)} and ${N.toFixed(6)} AND longitude::number between ${W.toFixed(6)} and ${E.toFixed(6)}`;
      const rows = await pagedFetchSlow(PLUTO, R3_PLUTO_FIELDS.join(','), where, 'bbl', 'pluto');
      pluto = { source: 'NYC DCP MapPLUTO (64uk-42ks) via NYC Open Data', url: PLUTO, select: R3_PLUTO_FIELDS.join(','), where, bbox, fetched: new Date().toISOString(), rows };
      fs.writeFileSync(plutoFile, JSON.stringify(pluto));
      fs.writeFileSync(path.join(ROOT, 'src/world/data/raw/pluto-r3.query.json'), JSON.stringify({ source: pluto.source, url: PLUTO, select: pluto.select, where, order: 'bbl', pages: '2500 rows, 1.5 s apart', fetched: pluto.fetched.slice(0, 10), rows: rows.length, note: 'raw rows cached in cache/real-r3/ (git-ignored); the shipped lots are public/data/real/lots-*.json' }, null, 2) + '\n');
    } else pluto = JSON.parse(fs.readFileSync(plutoFile, 'utf8'));
    console.log(`MapPLUTO rows: ${pluto.rows.length} (fetched ${pluto.fetched})`);

    let foot;
    if (refresh || !fs.existsSync(footFile)) {
      const where = `within_box(the_geom, ${N.toFixed(6)}, ${W.toFixed(6)}, ${S.toFixed(6)}, ${E.toFixed(6)})`;
      const rows = await pagedFetchSlow(FOOT, R3_FOOT_FIELDS.join(','), where, 'bin', 'footprints');
      foot = { source: 'NYC Building Footprints (5zhs-2jue) via NYC Open Data', url: FOOT, select: R3_FOOT_FIELDS.join(','), where, bbox, fetched: new Date().toISOString(), rows };
      fs.writeFileSync(footFile, JSON.stringify(foot));
      fs.writeFileSync(path.join(ROOT, 'src/world/data/raw/footprints-r3.query.json'), JSON.stringify({ source: foot.source, url: FOOT, select: foot.select, where, order: 'bin', pages: '2500 rows, 1.5 s apart', fetched: foot.fetched.slice(0, 10), rows: rows.length, note: 'polygons not fetched: height_roof (ft), construction_year and shape_area (sq ft) per BIN only' }, null, 2) + '\n');
    } else foot = JSON.parse(fs.readFileSync(footFile, 'utf8'));
    console.log(`footprint rows: ${foot.rows.length} (fetched ${foot.fetched})`);

    const coreText = fs.readFileSync(path.join(ROOT, 'src/world/data/roadnet-r123.json'), 'utf8');
    const net = RoadNet.fromJson(JSON.parse(coreText));
    const netSha = crypto.createHash('sha1').update(coreText).digest('hex').slice(0, 12);

    const anomalies = { noCoordinates: 0, outsideExtents: 0, duplicateBbl: 0, zeroFrontage: 0, noStreet60: 0, duplicateUnit: 0, blkFixed: 0 };
    const lots = new Map();
    for (const row of [...pluto.rows].sort((a, b) => String(a.bbl).localeCompare(String(b.bbl)))) {
      const lat = num(row.latitude), lon = num(row.longitude);
      if (lat === null || lon === null) { anomalies.noCoordinates++; continue; }
      const p = proj.toGrid(lon, lat);
      if (!geom.pointInPolygon(p, ext.R3_EXTENT)) { anomalies.outsideExtents++; continue; }
      const bbl = String(row.bbl).replace(/\.0+$/, '');
      if (lots.has(bbl)) { anomalies.duplicateBbl++; continue; }
      const lf = num(row.lotfront), ld = num(row.lotdepth);
      if (!lf) anomalies.zeroFrontage++;
      lots.set(bbl, {
        bbl, ph: ext.phaseOf(p) ?? 'R3', x: r1(p.x), z: r1(p.z), lf: lf === null ? null : r1(lf * FT), ld: ld === null ? null : r1(ld * FT),
        bf: num(row.bldgfront) === null ? null : r1(num(row.bldgfront) * FT), bd: num(row.bldgdepth) === null ? null : r1(num(row.bldgdepth) * FT),
        fl: num(row.numfloors), yr: num(row.yearbuilt), cls: row.bldgclass ?? '', lu: row.landuse ?? '', ad: row.address ?? '', nb: 0, rf: null, _p: p,
        own: row.ownername ?? '', ur: num(row.unitsres), la: num(row.lotarea),
      });
    }
    const seenBin = new Set();
    for (const row of foot.rows) {
      const bbl = String(row.base_bbl ?? '').replace(/\.0+$/, '');
      const lot = lots.get(bbl);
      if (!lot || !row.bin || seenBin.has(row.bin)) continue;
      seenBin.add(row.bin);
      lot.nb++;
      const h = num(row.height_roof);
      if (h !== null) lot.rf = Math.max(lot.rf ?? 0, r1(h * FT)) || null;
    }
    const frontage = (e) => net.edges[e].level === 0 && net.edges[e].cls !== 'highway' && net.edges[e].cls !== 'ramp';
    const rings = net.blocks.map((_, i) => net.blockRing(i));
    for (const lot of lots.values()) {
      const p = lot._p;
      const hit = net.nearestEdge(p, 400, frontage);
      if (!hit || hit.dist > ANOMALY_M) anomalies.noStreet60++;
      if (hit) {
        const cross = hit.dir.x * (p.z - hit.point.z) - hit.dir.z * (p.x - hit.point.x);
        lot.e = hit.edge; lot.s = r1(hit.s); lot.sd = cross >= 0 ? 1 : -1;
      } else { lot.e = -1; lot.s = null; lot.sd = 0; }
      lot.blk = net.blockAt(p);
      if (lot.blk < 0) {
        let best = -1, bd = 30;
        rings.forEach((ring, bi) => {
          if (net.blocks[bi].island) return;
          let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
          for (const v of ring) { mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mnz = Math.min(mnz, v.z); mxz = Math.max(mxz, v.z); }
          if (p.x < mnx - 30 || p.x > mxx + 30 || p.z < mnz - 30 || p.z > mxz + 30) return;
          for (let i = 0; i < ring.length; i++) { const d = Math.sqrt(geom.closestOnSegment(p, ring[i], ring[(i + 1) % ring.length]).d2); if (d < bd) { bd = d; best = bi; } }
        });
        if (best >= 0) { lot.blk = best; anomalies.blkFixed++; }
      }
    }
    const seenUnit = new Set();
    const kept = [];
    for (const lot of lots.values()) {
      if (!lot.lf || lot.lf <= 0 || lot.e < 0) continue;
      const uk = `${lot.ad}|${lot.x}|${lot.z}|${lot.lf}`;
      if (seenUnit.has(uk)) { anomalies.duplicateUnit++; continue; }
      seenUnit.add(uk);
      kept.push(lot);
    }
    const bt = tiles.blockTiles(rings);
    const tileOfBlock = new Map();
    for (const [k, list] of bt) for (const b of list) tileOfBlock.set(b, k);
    const byTile = new Map();
    for (const lot of kept) {
      const k = lot.blk >= 0 ? tileOfBlock.get(lot.blk) : tiles.tileKeyOf(lot.x, lot.z);
      const l = byTile.get(k); if (l) l.push(lot); else byTile.set(k, [lot]);
    }
    const outDir = path.join(ROOT, 'public/data/real');
    fs.mkdirSync(outDir, { recursive: true });
    for (const f of fs.readdirSync(outDir)) if (/^lots-.*\.json$/.test(f)) fs.unlinkSync(path.join(outDir, f));
    const index = { v: 2, tile: tiles.LOT_TILE_M, net: netSha, tiles: {}, total: 0 };
    let rawBytes = 0;
    for (const [k, list] of [...byTile].sort((a, b) => a[0].localeCompare(b[0]))) {
      list.sort((a, b) => a.bbl.localeCompare(b.bbl));
      const json = JSON.stringify(tiles.encodeLotTile(k, list));
      fs.writeFileSync(path.join(outDir, `lots-${k}.json`), json);
      rawBytes += json.length;
      let b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const l of list) b = [Math.min(b[0], l.x), Math.min(b[1], l.z), Math.max(b[2], l.x), Math.max(b[3], l.z)];
      index.tiles[k] = { n: list.length, b: b.map(Math.round) };
      index.total += list.length;
    }
    fs.writeFileSync(path.join(outDir, 'lots-index.json'), JSON.stringify(index));
    fs.writeFileSync(path.join(R3_DIR, 'lots-r3-all.json'), JSON.stringify([...lots.values()].map(({ _p, ...r }) => r)));
    console.log(`lots: ${lots.size} in extent, ${kept.length} written in ${byTile.size} tiles, ${rawBytes} bytes raw; footprints with a lot ${seenBin.size}; anomalies ${JSON.stringify(anomalies)}; net sha ${netSha}`);
    console.log('by phase', kept.reduce((a, l) => ((a[l.ph] = (a[l.ph] ?? 0) + 1), a), {}));
  } finally {
    await vite.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
