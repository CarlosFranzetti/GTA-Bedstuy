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
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUTO_RAW = path.join(ROOT, 'src/world/data/raw/pluto-r1r2.json');
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
          building: { bin: 'NYC BIN', bbl: 'lot BBL', rf: 'roof height (m)', yr: 'construction year', fa: 'footprint area (m2)', rings: 'footprint outer rings, flat [x0,z0,x1,z1,...] in 0.1 m integers' },
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
    console.log(`buildings: ${outBuildings.length} for ${new Set(outBuildings.map((b) => b.bbl)).size} lots; buildings in footprints with no matching lot: ${foot.rows.length - outBuildings.length} (other BBL or duplicate BIN)`);
    console.log(`roadnet-core sha1 ${coreSha.slice(0, 12)}, ${net.edges.length} edges`);
  } finally {
    await vite.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
