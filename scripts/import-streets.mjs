#!/usr/bin/env node
/**
 * import-streets: NYC street centrelines (CSCL, NYC Open Data dataset inkn-q76z) -> src/world/data/roadnet-core.json
 * plus a debug SVG with street names (docs/reference/realmap-r1r2.svg) for checking against reality.
 *
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/import-streets.mjs [--refresh] [--no-svg]
 *
 * Without --refresh it rebuilds from the cached download (src/world/data/raw/centerline-r1r2.json). All geometry work is
 * in src/world/roadnet/*.ts (loaded through Vite SSR, like import-osm.mjs) so the unit tests cover it.
 * Data: NYC Open Data, NYC DoITT/OTI CSCL. No Google data.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'src/world/data/raw/centerline-r1r2.json');
const OUT = path.join(ROOT, 'src/world/data/roadnet-core.json');
const SVG = path.join(ROOT, 'docs/reference/realmap-r1r2.svg');
const DATASET = 'https://data.cityofnewyork.us/resource/inkn-q76z.json';
const FIELDS = [
  'physicalid', 'full_street_name', 'pre_type', 'post_type', 'rw_type', 'status', 'trafdir', 'streetwidth',
  'number_travel_lanes', 'number_park_lanes', 'from_level_code', 'to_level_code', 'truck_route_type',
  'carto_display_level', 'posted_speed', 'bike_lane', 'boroughcode', 'the_geom',
];

async function fetchExtent(proj, ring) {
  const ll = ring.map((p) => proj.toLonLat(p));
  const lons = ll.map((p) => p[0]);
  const lats = ll.map((p) => p[1]);
  const n = Math.max(...lats) + 0.0005, s = Math.min(...lats) - 0.0005, w = Math.min(...lons) - 0.0005, e = Math.max(...lons) + 0.0005;
  const q = new URLSearchParams({
    $select: FIELDS.join(','),
    $where: `within_box(the_geom, ${n.toFixed(6)}, ${w.toFixed(6)}, ${s.toFixed(6)}, ${e.toFixed(6)}) AND boroughcode in ('3','4')`,
    $order: 'physicalid',
    $limit: '50000',
  });
  const url = `${DATASET}?${q}`;
  console.log(`fetching ${url.slice(0, 160)}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return { query: url, bbox: { n, s, w, e }, fetched: new Date().toISOString(), rows };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svgOf(net, extents, proj) {
  const b = net.bounds;
  const S = 0.6; // px per metre
  const pad = 40;
  const W = Math.ceil((b.maxX - b.minX) * S + 2 * pad);
  const H = Math.ceil((b.maxZ - b.minZ) * S + 2 * pad);
  const X = (x) => ((x - b.minX) * S + pad).toFixed(1);
  const Y = (z) => ((z - b.minZ) * S + pad).toFixed(1);
  const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.z)}`).join('');
  const colour = { arterial: '#d9822b', avenue: '#e8c547', street: '#ffffff', ped: '#7fbf7f', highway: '#c0392b', ramp: '#c0392b' };
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#1e2228"/>`);
  out.push(`<text x="12" y="20" fill="#ccc" font-size="13">RoadNet R1+R2 from NYC Centerline (CSCL inkn-q76z). Grid frame: +x east along Bed-Stuy streets, +z south, origin Throop x Kosciuszko. ${net.edges.length} edges, ${net.blocks.filter((k) => !k.island).length} blocks. 100 m bar:</text>`);
  out.push(`<rect x="12" y="26" width="${100 * S}" height="4" fill="#ccc"/>`);
  // blocks
  net.blocks.forEach((bl, i) => {
    const r = net.blockRing(i);
    out.push(`<path d="${pathOf(r)}Z" fill="${bl.island ? '#3a5a3a' : '#2f3540'}" stroke="none"/>`);
  });
  // extents
  for (const [name, ring, col] of extents) out.push(`<path d="${pathOf(ring)}Z" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="6 4"><title>${name}</title></path>`);
  // edges
  net.edges.forEach((e, i) => {
    const dash = e.level !== 0 ? ' stroke-dasharray="4 3"' : '';
    out.push(`<path d="${pathOf(e.pts)}" fill="none" stroke="${colour[e.cls] ?? '#fff'}" stroke-opacity="0.85" stroke-width="${Math.max(1, e.width * S * 0.8).toFixed(1)}" stroke-linecap="round"${dash}><title>#${i} ${esc(e.name)} ${e.cls} w${e.width} lanes${e.lanes} ow${e.oneway}</title></path>`);
    if (e.oneway !== 0) {
      const m = net.pointAt(i, net.lengths[i] / 2);
      const d = e.oneway === 1 ? m.dir : { x: -m.dir.x, z: -m.dir.z };
      const tip = { x: m.p.x + d.x * 6, z: m.p.z + d.z * 6 };
      const l = { x: m.p.x - d.z * 3 - d.x * 2, z: m.p.z + d.x * 3 - d.z * 2 };
      const r = { x: m.p.x + d.z * 3 - d.x * 2, z: m.p.z - d.x * 3 - d.z * 2 };
      out.push(`<path d="M${X(l.x)},${Y(l.z)}L${X(tip.x)},${Y(tip.z)}L${X(r.x)},${Y(r.z)}" fill="none" stroke="#5aa0ff" stroke-width="1"/>`);
    }
  });
  // nodes
  net.nodes.forEach((n) => {
    const c = { signal: '#ff4d4d', stop: '#ffffff', stub: '#9b59b6', deadend: '#888', none: null }[n.control];
    if (c) out.push(`<circle cx="${X(n.p.x)}" cy="${Y(n.p.z)}" r="${n.control === 'stub' ? 3 : 1.8}" fill="${c}"/>`);
  });
  // labels: one per street per ~350 m of length, along the edge
  const placed = [];
  const byStreet = new Map();
  net.edges.forEach((e, i) => { if (!e.name) return; const l = byStreet.get(e.name) ?? []; l.push(i); byStreet.set(e.name, l); });
  let pid = 0;
  for (const [name, list] of byStreet) {
    const sorted = list.slice().sort((a, c) => net.lengths[c] - net.lengths[a]);
    for (const i of sorted) {
      if (net.lengths[i] < 55) continue;
      const m = net.pointAt(i, net.lengths[i] / 2);
      if (placed.some((p) => (p.name === name && Math.hypot(p.x - m.p.x, p.z - m.p.z) < 350) || Math.hypot(p.x - m.p.x, p.z - m.p.z) < 40)) continue;
      placed.push({ name, x: m.p.x, z: m.p.z });
      let ang = (Math.atan2(m.dir.z, m.dir.x) * 180) / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      out.push(`<text transform="translate(${X(m.p.x)},${Y(m.p.z)}) rotate(${ang.toFixed(1)})" text-anchor="middle" dy="3" font-size="8" fill="#0b0d10" stroke="#ffffff" stroke-width="2.2" paint-order="stroke">${esc(name)}</text>`);
      pid++;
    }
  }
  // lat/lon ticks in two corners for checking
  for (const p of [{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.maxZ }]) {
    const [lon, lat] = proj.toLonLat(p);
    out.push(`<text x="${X(p.x)}" y="${Y(p.z)}" fill="#888" font-size="9" dx="${p.x === b.minX ? 2 : -150}" dy="${p.z === b.minZ ? -4 : 14}">${lat.toFixed(5)}, ${lon.toFixed(5)}</text>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const vite = await createServer({
    configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent',
    resolve: { alias: { '@': path.join(ROOT, 'src') } },
    server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true },
  });
  try {
    const geom = await vite.ssrLoadModule('/src/world/roadnet/geom.ts');
    const build = await vite.ssrLoadModule('/src/world/roadnet/build.ts');
    const codec = await vite.ssrLoadModule('/src/world/roadnet/codec.ts');
    const ext = await vite.ssrLoadModule('/src/world/roadnet/extents.ts');
    const { RoadNet } = await vite.ssrLoadModule('/src/world/roadnet/RoadNet.ts');
    const proj = geom.makeFrameProjection(geom.REAL_FRAME);

    let raw;
    if (args.has('--refresh') || !fs.existsSync(RAW)) {
      raw = await fetchExtent(proj, ext.R1R2_EXTENT);
      fs.writeFileSync(RAW, JSON.stringify(raw));
      console.log(`wrote ${path.relative(ROOT, RAW)}: ${raw.rows.length} rows, ${(fs.statSync(RAW).size / 1024).toFixed(0)} kB`);
    } else {
      raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
      console.log(`cached ${path.relative(ROOT, RAW)}: ${raw.rows.length} rows (fetched ${raw.fetched}); --refresh to re-download`);
    }

    const { data, report } = build.buildRoadNet(raw.rows, { frame: geom.REAL_FRAME, extent: ext.R1R2_EXTENT });
    const json = JSON.stringify(codec.encodeRoadNet(data));
    fs.writeFileSync(OUT, json + '\n');
    const gz = zlib.gzipSync(json, { level: 9 }).length;
    const net = new RoadNet(data);

    // per-phase counts: an edge belongs to the first phase whose extent holds its midpoint, a block by its ring centroid
    const phases = [['R1', ext.R1_EXTENT, ext.R1_RING], ['R2', ext.R2_EXTENT, ext.R2_RING]];
    const counts = Object.fromEntries(phases.map(([n]) => [n, { edges: 0, km: 0, blocks: 0, islands: 0, signals: 0 }]));
    net.edges.forEach((e, i) => {
      const m = net.pointAt(i, net.lengths[i] / 2).p;
      const ph = phases.find(([, poly]) => geom.pointInPolygon(m, poly));
      if (ph) { counts[ph[0]].edges++; counts[ph[0]].km += net.lengths[i] / 1000; }
    });
    net.blocks.forEach((bl, i) => {
      const r = net.blockRing(i);
      const c = r.reduce((a, p) => ({ x: a.x + p.x / r.length, z: a.z + p.z / r.length }), { x: 0, z: 0 });
      const ph = phases.find(([, , ring]) => geom.pointInPolygon(c, ring)) ?? phases.find(([, poly]) => geom.pointInPolygon(c, poly));
      if (ph) counts[ph[0]][bl.island ? 'islands' : 'blocks']++;
    });
    net.nodes.forEach((n) => {
      if (n.control !== 'signal') return;
      const ph = phases.find(([, poly]) => geom.pointInPolygon(n.p, poly));
      if (ph) counts[ph[0]].signals++;
    });
    const names = new Set(data.edges.map((e) => e.name));
    console.log('report', report);
    console.log(`nodes ${data.nodes.length} edges ${data.edges.length} blocks ${data.blocks.filter((b) => !b.island).length} islands ${data.blocks.filter((b) => b.island).length} streets ${names.size}`);
    for (const [n, c] of Object.entries(counts)) console.log(`${n}: edges ${c.edges}, ${c.km.toFixed(1)} km, blocks ${c.blocks}, islands ${c.islands}, signals ${c.signals}`);
    console.log(`classes`, data.edges.reduce((a, e) => ((a[e.cls] = (a[e.cls] ?? 0) + 1), a), {}));
    console.log(`controls`, data.nodes.reduce((a, n) => ((a[n.control] = (a[n.control] ?? 0) + 1), a), {}));
    console.log(`wrote ${path.relative(ROOT, OUT)}: ${(json.length / 1024).toFixed(1)} kB raw, ${(gz / 1024).toFixed(1)} kB gzip`);
    const ll = (ring) => ring.map((p) => proj.toLonLat(p)).map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(' ');
    for (const [n, poly] of phases) console.log(`${n} extent lat,lon: ${ll(poly)}`);

    if (!args.has('--no-svg')) {
      const svg = svgOf(net, [['R1', ext.R1_EXTENT, '#4fc3f7'], ['R2', ext.R2_EXTENT, '#81c784']], proj);
      fs.writeFileSync(SVG, svg);
      console.log(`wrote ${path.relative(ROOT, SVG)}: ${(svg.length / 1024).toFixed(0)} kB`);
    }
  } finally {
    await vite.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
