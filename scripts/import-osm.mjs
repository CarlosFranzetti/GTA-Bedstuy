#!/usr/bin/env node
/**
 * Import real building footprints (OpenStreetMap) and optional NYC PLUTO attributes into src/world/data/bedstuy.json
 * as schema v2 lots.
 *
 *   node scripts/import-osm.mjs <input.geojson|osm.json> [--pluto pluto.csv] [--write] [--overwrite]
 *        [--origin lat,lon] [--bearing <deg>|fit] [--target <bedstuy.json>] [--out <file>] [--verbose]
 *
 * Input: Overpass JSON (`out geom;` or nodes+ways) or GeoJSON (Polygon/MultiPolygon buildings, Point shops/amenities).
 * Without --write it prints a diff summary and touches nothing. With --write it rewrites the target JSON (default
 * src/world/data/bedstuy.json) in its existing layout. See docs/REAL-BLOCKS.md.
 *
 * Data: (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright); NYC MapPLUTO via NYC Open Data.
 * No Google Maps / Street View data is read or produced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const a = { input: null, pluto: null, write: false, overwrite: false, origin: null, bearing: 'fit', target: path.join(ROOT, 'src/world/data/bedstuy.json'), out: null, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${t} needs a value`); return argv[++i]; };
    if (t === '--pluto') a.pluto = val();
    else if (t === '--write') a.write = true;
    else if (t === '--overwrite') a.overwrite = true;
    else if (t === '--origin') a.origin = val();
    else if (t === '--bearing') a.bearing = val();
    else if (t === '--target') a.target = path.resolve(val());
    else if (t === '--out') a.out = path.resolve(val());
    else if (t === '--verbose' || t === '-v') a.verbose = true;
    else if (t === '--help' || t === '-h') a.help = true;
    else if (t.startsWith('--')) throw new Error(`unknown option ${t}`);
    else if (!a.input) a.input = t;
    else throw new Error(`unexpected argument ${t}`);
  }
  return a;
}

const USAGE = `usage: node scripts/import-osm.mjs <input.geojson|osm.json> [--pluto pluto.csv] [--write] [--overwrite]
       [--origin lat,lon] [--bearing <deg>|fit] [--target bedstuy.json] [--out file] [--verbose]
  (no --write: prints a diff summary only)`;

// ---------------------------------------------------------------- input readers

/** Normalised feature: { id, tags, ring: [{lat,lon}] | null, point: {lat,lon} | null } */
function readFeatures(text, file) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error(`${file}: not valid JSON (${e.message})`); }
  if (doc && Array.isArray(doc.elements)) return fromOverpass(doc.elements);
  if (doc && (doc.type === 'FeatureCollection' || doc.type === 'Feature')) return fromGeoJson(doc);
  throw new Error(`${file}: neither Overpass JSON (elements[]) nor GeoJSON (FeatureCollection)`);
}

const dropClose = (ring) => (ring.length > 1 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lon === ring[ring.length - 1].lon ? ring.slice(0, -1) : ring);

function fromOverpass(elements) {
  const nodes = new Map();
  for (const e of elements) if (e.type === 'node') nodes.set(e.id, e);
  const out = [];
  const ringOf = (way) => {
    if (Array.isArray(way.geometry)) return dropClose(way.geometry.filter((g) => g && Number.isFinite(g.lat)).map((g) => ({ lat: g.lat, lon: g.lon })));
    if (Array.isArray(way.nodes)) {
      const pts = way.nodes.map((n) => nodes.get(n)).filter(Boolean).map((n) => ({ lat: n.lat, lon: n.lon }));
      return dropClose(pts);
    }
    return null;
  };
  for (const e of elements) {
    const tags = e.tags ?? {};
    if (e.type === 'way') {
      const ring = ringOf(e);
      if (ring && ring.length >= 3) out.push({ id: `way/${e.id}`, tags, ring, point: null });
    } else if (e.type === 'relation') {
      const outer = (e.members ?? []).find((m) => m.role === 'outer' && Array.isArray(m.geometry));
      if (outer) out.push({ id: `relation/${e.id}`, tags, ring: dropClose(outer.geometry.map((g) => ({ lat: g.lat, lon: g.lon }))), point: null });
    } else if (e.type === 'node' && e.tags && Number.isFinite(e.lat)) {
      out.push({ id: `node/${e.id}`, tags, ring: null, point: { lat: e.lat, lon: e.lon } });
    }
  }
  return out;
}

function fromGeoJson(doc) {
  const feats = doc.type === 'Feature' ? [doc] : doc.features ?? [];
  const out = [];
  feats.forEach((f, i) => {
    const g = f.geometry;
    if (!g) return;
    const tags = {};
    for (const [k, v] of Object.entries(f.properties ?? {})) if (v !== null && typeof v !== 'object') tags[k] = String(v);
    const id = String(f.id ?? f.properties?.['@id'] ?? `feature/${i}`);
    const conv = (r) => dropClose(r.map(([lon, lat]) => ({ lat, lon })));
    if (g.type === 'Polygon') out.push({ id, tags, ring: conv(g.coordinates[0]), point: null });
    else if (g.type === 'MultiPolygon') {
      // the largest outer ring stands for the building (courtyards and annexes are separate OSM features anyway)
      const rings = g.coordinates.map((p) => conv(p[0]));
      rings.sort((a, b) => b.length - a.length);
      out.push({ id, tags, ring: rings[0], point: null });
    } else if (g.type === 'Point') out.push({ id, tags, ring: null, point: { lat: g.coordinates[1], lon: g.coordinates[0] } });
  });
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) { console.log(USAGE); process.exit(args.help ? 0 : 2); }

  // Vite's SSR loader resolves the '@/' alias and compiles the TypeScript modules the game itself uses.
  const vite = await createServer({
    configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent',
    resolve: { alias: { '@': path.join(ROOT, 'src') } },
    server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true },
  });
  try {
    const geo = await vite.ssrLoadModule('/src/world/data/geo.ts');
    const schema = await vite.ssrLoadModule('/src/world/data/schema.ts');
    const gridMod = await vite.ssrLoadModule('/src/world/Grid.ts');
    const code = await run(args, geo, schema, gridMod);
    process.exitCode = code;
  } finally {
    await vite.close();
  }
}

async function run(args, geo, schema, gridMod) {
  const say = (s = '') => console.log(s);
  const rawTarget = fs.readFileSync(args.target, 'utf8');
  const json = JSON.parse(rawTarget);
  const streets = json.streets;
  const frames = geo.buildFaceFrames(streets);
  const frameByKey = new Map(frames.map((f) => [f.key, f]));

  // ---- read
  const feats = readFeatures(fs.readFileSync(args.input, 'utf8'), args.input);
  const buildings = feats.filter((f) => f.ring && f.ring.length >= 3 && f.tags.building && f.tags.building !== 'no' && !f.tags['building:part']);
  const points = feats.filter((f) => f.point && (f.tags.shop || f.tags.amenity || f.tags.office));
  const pluto = args.pluto ? geo.parsePluto(fs.readFileSync(args.pluto, 'utf8')) : null;

  // ---- projection
  let origin = geo.ORIGIN_LATLON;
  const originGiven = Boolean(args.origin);
  if (args.origin) origin = geo.parseLatLon(args.origin);
  let bearing;
  let bearingNote;
  if (args.bearing === 'fit') {
    const fit = geo.fitBearingAlongStreet(buildings.map((b) => b.ring), origin, 0, 45);
    bearing = fit.bearingDeg;
    bearingNote = `fitted from ${fit.edges} footprint edges near Throop (strength ${fit.strength.toFixed(2)})`;
    if (fit.edges === 0) bearingNote = 'no footprints to fit; default bearing';
    else if (fit.strength < 0.5) bearingNote += ' - LOW, the footprints are not rectilinear; pass --bearing';
  } else {
    bearing = Number(args.bearing);
    if (!Number.isFinite(bearing)) throw new Error(`--bearing expects a number or "fit", got ${args.bearing}`);
    bearingNote = 'given on the command line';
  }
  const proj = geo.makeProjection(origin, bearing);

  // ---- assign + derive
  const stats = { buildings: buildings.length, outside: 0, shopPoints: points.length, plutoHits: 0, byConf: { H: 0, M: 0 } };
  const perFace = new Map(); // key -> items
  const gridRings = buildings.map((b) => ({ b, ring: b.ring.map((p) => proj.toGrid(p)) }));
  for (const { b, ring } of gridRings) {
    const tags = { ...b.tags };
    for (const p of points) {
      if (geo.pointInRing({ x: p.point.lon, z: p.point.lat }, b.ring.map((q) => ({ x: q.lon, z: q.lat })))) {
        for (const k of ['shop', 'amenity', 'cuisine', 'name']) if (!tags[k] && p.tags[k]) tags[k] = p.tags[k];
      }
    }
    const addr = geo.addressOf(tags);
    const a = geo.assignFootprint(frames, streets, ring, tags['addr:street']);
    if (!a) { stats.outside++; continue; }
    let row;
    if (pluto && addr) {
      row = pluto.get(geo.addressKey(addr.housenumber, addr.street));
      if (row) stats.plutoHits++;
    }
    const d = geo.deriveLot(tags, a.s1 - a.s0, a.depthM, row, b.id, a.frame.avenue ? 4 : 3);
    const list = perFace.get(a.frame.key) ?? [];
    list.push({ s0: a.s0, s1: a.s1, lot: d.lot, ref: b.id });
    perFace.set(a.frame.key, list);
  }

  // ---- layout + merge
  const faces = json.faces.map((f) => f);
  const byKey = new Map(faces.map((f) => [`${f.street}|${f.side}|${f.from}|${f.to}`, f]));
  const report = [];
  const newFaces = [];
  for (const [key, items] of perFace) {
    const frame = frameByKey.get(key);
    const layout = geo.layoutFace(items);
    const face = byKey.get(key);
    const existing = face?.lots ?? [];
    const merged = geo.mergeFace(existing, layout.items, frame, args.overwrite);
    for (const l of merged.lots) if (l.note?.startsWith(geo.IMPORT_MARK)) stats.byConf[l.confidence] = (stats.byConf[l.confidence] ?? 0) + 1;
    report.push({ key, footprints: items.length, before: existing.length, after: merged.lots.length, layout, stats: merged.stats, lengthM: frame.length });
    if (face) face.lots = merged.lots;
    else {
      const nf = { street: frame.street, side: frame.side, from: frame.from, to: frame.to, note: `imported from OSM footprints (${geo.IMPORT_MARK})`, confidence: 'M', lots: merged.lots };
      newFaces.push(nf);
    }
  }
  const outJson = { ...json };
  outJson.faces = [...faces, ...newFaces];
  outJson.geo = {
    origin: { lat: origin.lat, lon: origin.lon, note: originGiven ? 'given with --origin' : 'approximate, verify (default constant in src/world/data/geo.ts)' },
    bearingDeg: Math.round(bearing * 100) / 100,
    attribution: 'Building data (c) OpenStreetMap contributors, ODbL 1.0; attributes from NYC MapPLUTO (NYC Open Data) when joined.',
  };
  // keep `geo` right before `faces` in the file
  const ordered = {};
  for (const [k, v] of Object.entries(outJson)) { if (k !== 'faces' && k !== 'geo') ordered[k] = v; }
  ordered.geo = outJson.geo; ordered.faces = outJson.faces;

  // ---- validate
  const problems = [...schema.validateFaces(ordered)];
  if (!problems.length) {
    const set = schema.loadFaces(ordered);
    const grid = gridMod.buildGrid({ ...ordered });
    problems.push(...schema.validateAgainstGrid(grid, set));
  }

  // ---- report
  say('GTA Bed-Stuy real-blocks import');
  say(`  input      ${args.input}  (${feats.length} features: ${stats.buildings} buildings, ${stats.shopPoints} shop/amenity points)`);
  say(`  origin     ${origin.lat}, ${origin.lon}${originGiven ? '' : '   (default: approximate, verify - pass --origin lat,lon)'}`);
  say(`  bearing    ${bearing.toFixed(2)} deg  ${bearingNote}`);
  say(`  PLUTO      ${pluto ? `${pluto.size} rows, ${stats.plutoHits} footprints joined by address` : 'not given'}`);
  say(`  merge      ${args.overwrite ? '--overwrite: hand-edited lots WILL be replaced' : 'hand-edited lots are kept (notes, H/M confidence)'}`);
  say(`  outside    ${stats.outside} footprints fall outside every block (roadway or off the grid) and were ignored`);
  say('');
  say('face                                     len m  osm  lots(before->after)  kept replaced added vacant gaps skipped split');
  for (const r of report) {
    say(`${r.key.padEnd(40)} ${r.lengthM.toFixed(0).padStart(5)} ${String(r.footprints).padStart(4)}  ${`${r.before} -> ${r.after}`.padEnd(19)} ${String(r.stats.kept).padStart(4)} ${String(r.stats.replaced).padStart(8)} ${String(r.stats.added).padStart(5)} ${String(r.layout.vacantGaps).padStart(6)} ${String(r.layout.skippedTooNarrow).padStart(7)} ${String(r.layout.split).padStart(5)}`);
  }
  if (args.verbose) {
    for (const r of report) {
      say(`\n${r.key}`);
      for (const it of r.layout.items) say(`  ${it.s0.toFixed(1).padStart(6)}..${it.s1.toFixed(1).padEnd(6)} ${it.lot.use.padEnd(11)} ${String(it.lot.floors ?? '-').padStart(2)} fl  ${it.lot.confidence}  ${it.lot.note ?? ''}`);
    }
  }
  say('');
  say(`imported lots by confidence: H ${stats.byConf.H}, M ${stats.byConf.M}`);
  say(`validator: ${problems.length} error${problems.length === 1 ? '' : 's'}`);
  for (const p of problems.slice(0, 20)) say(`  ! ${p}`);
  say('Attribution: building data (c) OpenStreetMap contributors, ODbL; PLUTO from NYC Open Data. No Google data.');

  if (problems.length) { say('\nNOT written: fix the problems above first.'); return 1; }
  const text = geo.formatBedstuyJson(ordered);
  const dest = args.out ?? args.target;
  if (!args.write) {
    say(`\ndry run: ${text === rawTarget ? 'no change to' : 'would change'} ${path.relative(ROOT, dest)} (pass --write to apply${args.out ? ' to --out' : ''}).`);
    return 0;
  }
  if (text === rawTarget && !args.out) { say('\n--write: nothing to change.'); return 0; }
  fs.writeFileSync(dest, text);
  say(`\nwrote ${path.relative(ROOT, dest)}`);
  return 0;
}

main().catch((e) => { console.error(`import-osm: ${e.message}`); process.exit(1); });
