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
  const source = JSON.parse(rawTarget);

  const feats = geo.parseFeatures(fs.readFileSync(args.input, 'utf8'), args.input);
  const pluto = args.pluto ? geo.parsePluto(fs.readFileSync(args.pluto, 'utf8')) : null;
  const bearing = args.bearing === 'fit' ? 'fit' : Number(args.bearing);
  if (bearing !== 'fit' && !Number.isFinite(bearing)) throw new Error(`--bearing expects a number or "fit", got ${args.bearing}`);
  const res = geo.importBlocks(source, feats, { origin: args.origin ? geo.parseLatLon(args.origin) : undefined, bearing, overwrite: args.overwrite, pluto });

  // ---- validate (JSON rules, then the real grid)
  const problems = [...schema.validateFaces(res.json)];
  if (!problems.length) {
    const set = schema.loadFaces(res.json);
    problems.push(...schema.validateAgainstGrid(gridMod.buildGrid({ ...res.json }), set));
  }

  // ---- report
  const t = res.totals;
  say('GTA Bed-Stuy real-blocks import');
  say(`  input      ${args.input}  (${feats.length} features: ${t.buildings} buildings, ${t.shopPoints} shop/amenity points)`);
  say(`  origin     ${res.origin.lat}, ${res.origin.lon}${res.originIsDefault ? '   (default: approximate, verify - pass --origin lat,lon)' : ''}`);
  say(`  bearing    ${res.bearingDeg.toFixed(2)} deg  ${res.bearingNote}`);
  say(`  PLUTO      ${pluto ? `${pluto.size} rows, ${t.plutoHits} footprints joined by address` : 'not given'}`);
  say(`  merge      ${args.overwrite ? '--overwrite: hand-edited lots WILL be replaced' : 'hand-edited lots are kept (notes, H/M confidence)'}`);
  say(`  outside    ${t.outside} footprints fall outside every block (roadway or off the grid) and were ignored`);
  say('');
  say('face                                     len m  osm  lots(before->after)  kept replaced added vacant skipped split');
  for (const r of res.faces) {
    say(`${r.key.padEnd(40)} ${r.lengthM.toFixed(0).padStart(5)} ${String(r.footprints).padStart(4)}  ${`${r.before} -> ${r.after}`.padEnd(19)} ${String(r.stats.kept).padStart(4)} ${String(r.stats.replaced).padStart(8)} ${String(r.stats.added).padStart(5)} ${String(r.vacantGaps).padStart(6)} ${String(r.skippedTooNarrow).padStart(7)} ${String(r.split).padStart(5)}`);
  }
  if (args.verbose) {
    for (const r of res.faces) {
      say(`\n${r.key}`);
      for (const it of r.items) say(`  ${it.s0.toFixed(1).padStart(6)}..${it.s1.toFixed(1).padEnd(6)} ${it.lot.use.padEnd(11)} ${String(it.lot.floors ?? '-').padStart(2)} fl  ${it.lot.confidence}  ${it.lot.note ?? ''}`);
    }
  }
  say('');
  say(`imported lots by confidence: H ${t.importedH}, M ${t.importedM}`);
  say(`validator: ${problems.length} error${problems.length === 1 ? '' : 's'}`);
  for (const p of problems.slice(0, 20)) say(`  ! ${p}`);
  say('Attribution: building data (c) OpenStreetMap contributors, ODbL; PLUTO from NYC Open Data. No Google data.');

  if (problems.length) { say('\nNOT written: fix the problems above first.'); return 1; }
  const text = geo.formatBedstuyJson(res.json);
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
