#!/usr/bin/env node
/**
 * import-signals: NYC Open Data signal point layers -> src/world/data/roadnet-controls.json, a control value for every
 * RoadNet node of roadnet-core.json (R1 + R2 union).
 *
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/import-signals.mjs [--refresh]
 *
 * Datasets (checked against data.cityofnewyork.us, 11 Nov 2026):
 *   xc4v-ntf4  VZV Leading Pedestrian Interval Signals (the_geom Point; the design's id mqt5-ctec returns the same 6,810 rows
 *              by count but no columns through the resource endpoint, so xc4v-ntf4 is read)
 *   de3m-c5p4  Accessible Pedestrian Signal Locations (Point, 4,404 rows, field `location` = "A and B")
 *   8kuj-2n3u  Exclusive Pedestrian Signal (Barnes Dance) Locations (Point, 737 rows, main_stree / cross_stre)
 * A point marks the RoadNet node within TOLERANCE_M of it as `signal`. NYC Open Data has no signal inventory and no
 * stop-sign / all-way-stop inventory (w76s-c5u4 is a request log with free-text locations), so no node is `stop` from data.
 * The core's own inferred control (build.ts: four or more legs, or two or more streets) is kept as `inferred` for comparison.
 * Raw point caches: cache/signals/ (git-ignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.join(ROOT, 'src/world/data/roadnet-core.json');
const OUT = path.join(ROOT, 'src/world/data/roadnet-controls.json');
const CACHE = path.join(ROOT, 'cache/signals');
const BASE = 'https://data.cityofnewyork.us/resource';
const TOLERANCE_M = 15;
const DATASETS = [
  { id: 'xc4v-ntf4', name: 'VZV Leading Pedestrian Interval Signals', label: 'lpi', cols: 'main_street,cross_stree,install_da' },
  { id: 'de3m-c5p4', name: 'Accessible Pedestrian Signal Locations', label: 'aps', cols: 'location,date_insta' },
  { id: '8kuj-2n3u', name: 'Exclusive Pedestrian Signal (Barnes Dance) Locations', label: 'barnes', cols: 'main_stree,cross_stre' },
];

async function fetchPoints(ds, bbox, refresh) {
  const file = path.join(CACHE, `${ds.id}.json`);
  if (!refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const where = `within_box(the_geom, ${bbox.n.toFixed(6)}, ${bbox.w.toFixed(6)}, ${bbox.s.toFixed(6)}, ${bbox.e.toFixed(6)})`;
  const rows = [];
  for (let off = 0; ; off += 5000) {
    const q = new URLSearchParams({ $where: where, $order: ':id', $limit: '5000', $offset: String(off) });
    const res = await fetch(`${BASE}/${ds.id}.json?${q}`);
    if (!res.ok) throw new Error(`${ds.id} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 5000) break;
  }
  const out = { dataset: ds.id, name: ds.name, url: `${BASE}/${ds.id}.json`, where, fetched: new Date().toISOString(), rows };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
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
    const ll = [...ext.R1_EXTENT, ...ext.R2_EXTENT].map((p) => proj.toLonLat(p));
    const bbox = {
      n: Math.max(...ll.map((p) => p[1])) + 0.0005, s: Math.min(...ll.map((p) => p[1])) - 0.0005,
      w: Math.min(...ll.map((p) => p[0])) - 0.0005, e: Math.max(...ll.map((p) => p[0])) + 0.0005,
    };

    const coreJson = JSON.parse(fs.readFileSync(CORE, 'utf8'));
    const net = RoadNet.fromJson(coreJson);
    const inCoverage = (p) => geom.pointInPolygon(p, ext.R1R2_EXTENT);

    // nearest node to each point (within the tolerance) and per-node sources
    const matched = new Map(); // node -> Set of dataset ids
    const unmatched = [];
    const counts = { points: {}, insideCoverage: {}, matched: {}, unmatched: {} };
    for (const ds of DATASETS) {
      const raw = await fetchPoints(ds, bbox, refresh);
      counts.points[ds.id] = raw.rows.length;
      counts.insideCoverage[ds.id] = 0; counts.matched[ds.id] = 0; counts.unmatched[ds.id] = 0;
      for (const row of raw.rows) {
        const c = row.the_geom?.coordinates;
        if (!c) continue;
        const p = proj.toGrid(c[0], c[1]);
        if (!inCoverage(p)) continue;
        counts.insideCoverage[ds.id]++;
        let best = -1, bd = Infinity;
        net.nodes.forEach((n, i) => { const d = Math.hypot(n.p.x - p.x, n.p.z - p.z); if (d < bd) { bd = d; best = i; } });
        if (bd <= TOLERANCE_M) {
          counts.matched[ds.id]++;
          if (!matched.has(best)) matched.set(best, new Set());
          matched.get(best).add(ds.id);
        } else {
          counts.unmatched[ds.id]++;
          unmatched.push({
            src: ds.id, label: row[ds.cols.split(',')[0]] ?? '', where: ds.cols.split(',').map((k) => row[k]).filter(Boolean).join(' / '),
            x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, nearestNode: best, dist: Math.round(bd * 10) / 10,
          });
        }
      }
    }

    // one entry per node: control and the source dataset ids
    const nodes = {};
    net.nodes.forEach((n, i) => {
      if (n.control === 'stub' || n.control === 'deadend') { nodes[i] = { control: 'none', source: null, inferred: n.control }; return; }
      const src = matched.get(i);
      nodes[i] = src
        ? { control: 'signal', source: [...src].sort() , inferred: n.control }
        : { control: 'none', source: null, inferred: n.control };
    });
    const tally = (k) => Object.values(nodes).filter((n) => n.control === k).length;
    const inferredSignal = Object.values(nodes).filter((n) => n.inferred === 'signal').length;
    const bothSignal = Object.entries(nodes).filter(([, n]) => n.control === 'signal' && n.inferred === 'signal').length;

    const out = {
      meta: {
        v: 1,
        script: 'scripts/import-signals.mjs',
        nodesFrom: 'src/world/data/roadnet-core.json',
        tolerance_m: TOLERANCE_M,
        sources: DATASETS.map((d) => ({ dataset: d.id, name: d.name, points: counts.points[d.id] })),
        controlValues: 'signal (a dataset point within tolerance) | stop (none: no stop-sign or all-way-stop inventory in NYC Open Data) | none (no point; not verified unsignalised) | stub/deadend are kept as none',
        inferred: 'the core control from build.ts (heuristic), for comparison only',
        counts: {
          nodes: net.nodes.length,
          signal: tally('signal'), stop: tally('stop'), none: tally('none'),
          inferredSignal, signalAgreeingWithInferred: bothSignal,
          pointsInsideCoverage: counts.insideCoverage,
          matchedPerDataset: counts.matched,
          unmatchedPerDataset: counts.unmatched,
        },
      },
      nodes,
      unmatched,
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

    console.log(`wrote ${path.relative(ROOT, OUT)}`);
    console.log(`nodes ${net.nodes.length}: signal ${tally('signal')}, stop ${tally('stop')}, none ${tally('none')}`);
    console.log(`points inside R1+R2 coverage: ${JSON.stringify(counts.insideCoverage)}; matched ${JSON.stringify(counts.matched)}; unmatched ${JSON.stringify(counts.unmatched)}`);
    console.log(`core inferred signal ${inferredSignal}; data signal ${tally('signal')}; both ${bothSignal}`);
    console.log(`unmatched points: ${unmatched.length}`);
    for (const u of unmatched.slice(0, 15)) console.log(`  ${u.src} ${u.where} at (${u.x}, ${u.z}) ${u.dist} m from node ${u.nearestNode}`);
  } finally {
    await vite.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
