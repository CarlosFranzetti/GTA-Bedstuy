#!/usr/bin/env node
/**
 * build-brooklyn-overview: the dim "rest of Brooklyn" layer for the map screen.
 *
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/build-brooklyn-overview.mjs [--refresh]
 *
 * Sources (NYC Open Data, no Google data): street centrelines CSCL `inkn-q76z` (Brooklyn, plus Queens near Ridgewood),
 * Borough Boundaries clipped to the shoreline `gthc-hcne` (Brooklyn, Queens, Manhattan land), 2020 NTAs `9nt8-h7nd`
 * (neighbourhood label points). Downloads are cached in node_modules/.cache/realmap (not committed).
 *
 * Output, both in the RoadNet grid frame (REAL_FRAME, metres, +x east along Bed-Stuy streets, +z south):
 *   public/data/brooklyn-overview.json         hosted/native, fetched lazily   (target <= 300 kB gzip)
 *   src/world/data/brooklyn-overview-lite.json  artifact, dynamic import        (target <= 60 kB gzip)
 * Format (v1): { v, f: [lat0, lon0, rot], q: metres per unit, names: [...],
 *   land: [[boro, x0, z0, dx, dz, ...], ...]            rings, quantised and delta coded
 *   st:   [[name|-1, cls, x0, z0, dx, dz, ...], ...]     merged street chains; cls 0 street 1 avenue 2 arterial 3 highway
 *   nta:  [[name, x, z], ...] }                          label points (quantised)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/realmap');
const OUT_HOSTED = path.join(ROOT, 'public/data/brooklyn-overview.json');
const OUT_LITE = path.join(ROOT, 'src/world/data/brooklyn-overview-lite.json');
const API = 'https://data.cityofnewyork.us/resource';
/** Queens streets are kept only inside this lat/lon box (Ridgewood and the Brooklyn border). */
const QUEENS_BOX = { s: 40.690, n: 40.716, w: -73.925, e: -73.885 };

async function getJson(url, tries = 5) {
  for (let i = 0; ; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const body = await res.text();
    if (i >= tries - 1) throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
    console.log(`  retry ${i + 1} after HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
}

async function cached(name, refresh, fn) {
  const f = path.join(CACHE, name);
  if (!refresh && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}

async function paged(dataset, params, page = 20000) {
  const rows = [];
  for (let off = 0; ; off += page) {
    const q = new URLSearchParams({ ...params, $limit: String(page), $offset: String(off), $order: ':id' });
    const r = await getJson(`${API}/${dataset}.json?${q}`);
    rows.push(...r);
    console.log(`  ${dataset}: ${rows.length} rows`);
    if (r.length < page) return rows;
  }
}

function chains(segs) {
  // segs: {key, name, cls, pts:[{x,z}]}. Join segments of the same key end to end at shared endpoints (degree 2 in that key).
  const k = (p) => `${Math.round(p.x * 2)},${Math.round(p.z * 2)}`;
  const byKey = new Map();
  for (const s of segs) { const l = byKey.get(s.key) ?? []; l.push(s); byKey.set(s.key, l); }
  const out = [];
  for (const list of byKey.values()) {
    const ends = new Map();
    list.forEach((s, i) => {
      for (const p of [s.pts[0], s.pts[s.pts.length - 1]]) { const kk = k(p); const l = ends.get(kk) ?? []; l.push(i); ends.set(kk, l); }
    });
    const used = new Uint8Array(list.length);
    const extend = (pts, atEnd) => {
      for (;;) {
        const tip = atEnd ? pts[pts.length - 1] : pts[0];
        const cand = (ends.get(k(tip)) ?? []).filter((j) => !used[j]);
        if (cand.length !== 1 || (ends.get(k(tip)) ?? []).length > 2) return pts;
        const j = cand[0];
        used[j] = 1;
        let q = list[j].pts;
        if (atEnd) { if (k(q[0]) !== k(tip)) q = q.slice().reverse(); pts = pts.concat(q.slice(1)); }
        else { if (k(q[q.length - 1]) !== k(tip)) q = q.slice().reverse(); pts = q.slice(0, -1).concat(pts); }
      }
    };
    list.forEach((s, i) => {
      if (used[i]) return;
      used[i] = 1;
      let pts = s.pts.slice();
      pts = extend(pts, true);
      pts = extend(pts, false);
      out.push({ name: s.name, cls: s.cls, pts });
    });
  }
  return out;
}

function encode({ frame, chainsIn, land, nta, q, tol, simplify, minLen, nameMinCls, landTol, dropCls }) {
  const names = [];
  const ix = new Map();
  const intern = (s) => { let i = ix.get(s); if (i === undefined) { i = names.length; names.push(s); ix.set(s, i); } return i; };
  const coded = (pts) => {
    const row = [];
    let px = 0, pz = 0;
    pts.forEach((p, i) => {
      const x = Math.round(p.x / q), z = Math.round(p.z / q);
      if (i > 0 && x === px && z === pz) return;
      row.push(i === 0 ? x : x - px, i === 0 ? z : z - pz);
      px = x; pz = z;
    });
    return row;
  };
  const len = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return l; };
  const st = [];
  for (const c of chainsIn) {
    if (dropCls.includes(c.cls)) continue;
    if (len(c.pts) < minLen) continue;
    const pts = simplify(c.pts, tol);
    const row = coded(pts);
    if (row.length < 4) continue;
    st.push([c.cls >= nameMinCls && c.name ? intern(c.name) : -1, c.cls, ...row]);
  }
  const landRows = land.map(({ boro, pts }) => [boro, ...coded(simplify(pts, landTol))]).filter((r) => r.length > 7);
  return {
    v: 1, f: [frame.lat0, frame.lon0, frame.rotDeg], q, names,
    land: landRows,
    st,
    nta: nta.map((n) => [n.name, Math.round(n.p.x / q), Math.round(n.p.z / q)]),
  };
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
    const build = await vite.ssrLoadModule('/src/world/roadnet/build.ts');
    const proj = geom.makeFrameProjection(geom.REAL_FRAME);

    const streets = await cached('centerline-bk.json', refresh, () => paged('inkn-q76z', {
      $select: 'full_street_name,rw_type,trafdir,streetwidth,number_travel_lanes,carto_display_level,truck_route_type,post_type,pre_type,boroughcode,the_geom',
      $where: `(boroughcode='3' OR (boroughcode='4' AND within_box(the_geom, ${QUEENS_BOX.n}, ${QUEENS_BOX.w}, ${QUEENS_BOX.s}, ${QUEENS_BOX.e}))) AND rw_type in ('1','2','3','4','9') AND status='2'`,
    }));
    const boros = await cached('boroughs.json', refresh, () => getJson(`${API}/gthc-hcne.json?$where=borocode in ('1','3','4')`));
    const ntas = await cached('nta-bk.json', refresh, () => getJson(`${API}/9nt8-h7nd.json?$where=borocode='3' OR ntaname='Ridgewood'&$limit=500`));

    // streets -> classified, projected segments
    const CLS = { street: 0, avenue: 1, arterial: 2, highway: 3, ramp: 3, ped: 0 };
    const segs = [];
    for (const r of streets) {
      if (r.trafdir === 'NV') continue;
      const cls = CLS[build.classify(r)];
      const name = build.displayName(r.full_street_name);
      const lines = r.the_geom.type === 'LineString' ? [r.the_geom.coordinates] : r.the_geom.coordinates;
      for (const line of lines) segs.push({ key: `${name}|${cls}`, name, cls, pts: line.map(([lon, lat]) => proj.toGrid(lon, lat)) });
    }
    const merged = chains(segs);
    console.log(`streets: ${streets.length} rows -> ${segs.length} lines -> ${merged.length} chains`);

    // land rings (outer rings of each borough multipolygon; small islets dropped)
    const land = [];
    for (const b of boros) {
      for (const poly of b.the_geom.coordinates) {
        const pts = poly[0].map(([lon, lat]) => proj.toGrid(lon, lat));
        if (Math.abs(geom.signedArea(pts)) < 20000) continue;
        land.push({ boro: Number(b.borocode), pts });
      }
    }
    // NTA label points: area-weighted centroid of the largest outer ring
    const nta = ntas.filter((n) => Number(n.ntatype ?? 0) === 0).map((n) => {
      let best = null;
      for (const poly of n.the_geom.coordinates) {
        const pts = poly[0].map(([lon, lat]) => proj.toGrid(lon, lat));
        const a = Math.abs(geom.signedArea(pts));
        if (!best || a > best.a) best = { a, pts };
      }
      const c = best.pts.reduce((s, p) => ({ x: s.x + p.x / best.pts.length, z: s.z + p.z / best.pts.length }), { x: 0, z: 0 });
      return { name: n.ntaname, p: c };
    });

    const variants = [
      { file: OUT_HOSTED, q: 1, tol: 3, minLen: 0, nameMinCls: 0, landTol: 8, dropCls: [] },
      { file: OUT_LITE, q: 4, tol: 12, minLen: 60, nameMinCls: 2, landTol: 40, dropCls: [] },
    ];
    for (const v of variants) {
      const doc = encode({ frame: geom.REAL_FRAME, chainsIn: merged, land, nta, simplify: geom.simplifyPolyline, ...v });
      const json = JSON.stringify(doc);
      fs.mkdirSync(path.dirname(v.file), { recursive: true });
      fs.writeFileSync(v.file, json);
      const gz = zlib.gzipSync(json, { level: 9 }).length;
      const br = zlib.brotliCompressSync(json).length;
      console.log(`wrote ${path.relative(ROOT, v.file)}: ${(json.length / 1024).toFixed(0)} kB raw, ${(gz / 1024).toFixed(0)} kB gzip, ${(br / 1024).toFixed(0)} kB brotli; ${doc.st.length} chains, ${doc.land.length} land rings, ${doc.nta.length} NTA labels, ${doc.names.length} names`);
    }
  } finally {
    await vite.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
