#!/usr/bin/env node
/**
 * Regenerates tests/fixtures/osm-sample.geojson.
 *
 * The sample is SYNTHETIC: two block faces built from the typology numbers in src/world/data/schema.ts (lot widths,
 * floors, mixed-use share, one church, one vacant gap), placed on the game grid, rotated by an arbitrary test bearing
 * and converted to lat/lon with the importer's own projection. Footprints are real-shaped, not real: ids are
 * "synthetic/N", house numbers are made up, nothing is copied from OpenStreetMap or any other map service.
 *
 *   node tests/fixtures/make-osm-sample.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TEST_BEARING_DEG = 28.5; // arbitrary, only to prove the bearing fit; NOT a claim about the real street grid

const vite = await createServer({
  configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent',
  resolve: { alias: { '@': path.join(ROOT, 'src') } }, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true },
});
const geo = await vite.ssrLoadModule('/src/world/data/geo.ts');
const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/world/data/bedstuy.json'), 'utf8'));
const frames = geo.buildFaceFrames(json.streets);
const proj = geo.makeProjection(geo.ORIGIN_LATLON, TEST_BEARING_DEG);

let seed = 20261103;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const between = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const features = [];
let nid = 0;
const ll = (p) => { const q = proj.toLatLon(p); return [Number(q.lon.toFixed(7)), Number(q.lat.toFixed(7))]; };

function face(key, plan) {
  const f = frames.find((x) => x.key === key);
  const lo = plan.corners ? 0 : geo.NOMINAL_CORNER_M;
  const hi = f.length - lo;
  let s = lo, num = plan.firstNumber, i = 0;
  while (s < hi - 4) {
    const corner = plan.corners && (s === lo || hi - s < 12);
    let w = corner ? between(...plan.cornerWidth) : between(...plan.width);
    if (hi - s - w < 5) w = hi - s;
    const k = i++;
    if (k === plan.vacantAt) { s += 9; continue; }
    const depth = between(...plan.depth);
    // rectangle in (s, depth) face coordinates -> grid metres
    const a0 = s, a1 = s + w;
    const into = -f.outwardSign;
    const line = f.lineCoord, deep = f.lineCoord + into * depth;
    const grid = f.alongAxis === 'x'
      ? [[f.s0 + a0, line], [f.s0 + a1, line], [f.s0 + a1, deep], [f.s0 + a0, deep]].map(([x, z]) => ({ x, z }))
      : [[line, f.s0 + a0], [line, f.s0 + a1], [deep, f.s0 + a1], [deep, f.s0 + a0]].map(([x, z]) => ({ x, z }));
    const ring = grid.map(ll); ring.push(ring[0]);
    const tags = { building: pick(plan.buildings), 'addr:housenumber': String(num), 'addr:street': plan.street };
    num += 2;
    const role = plan.roles[k];
    if (role === 'church') { tags.building = 'church'; tags.amenity = 'place_of_worship'; tags['building:levels'] = '3'; }
    else if (role === 'shop') { tags.building = 'retail'; tags['building:levels'] = String(pick([2, 3, 4])); }
    else if (role === 'height') tags.height = '12.4';
    else if (role === 'none') { /* no levels, no height: floors default, confidence M */ }
    else tags['building:levels'] = String(pick(plan.levels));
    const id = `synthetic/${++nid}`;
    features.push({ type: 'Feature', id, properties: tags, geometry: { type: 'Polygon', coordinates: [ring] } });
    if (role === 'shop') {
      const c = geo.ringCentroid(grid);
      features.push({
        type: 'Feature', id: `synthetic/${++nid}`,
        properties: { shop: pick(['convenience', 'laundry', 'hairdresser', 'alcohol']), name: 'Synthetic Shop' },
        geometry: { type: 'Point', coordinates: ll(c) },
      });
    }
    s += w;
  }
}

// Face 1: Throop Ave east side of the block between Hart and Pulaski (avenue, mixed, corners included)
face('throop|E|hart|pulaski', {
  street: 'Throop Avenue', corners: true, firstNumber: 100, width: [6, 9], cornerWidth: [9, 12], depth: [12, 18], levels: [3, 4, 5],
  buildings: ['apartments', 'house', 'residential'],
  roles: { 0: 'shop', 2: 'shop', 4: 'church', 6: 'height', 7: 'shop', 9: 'none', 10: 'shop' }, vacantAt: 5,
});
// Face 2: Hart St north side, Throop to Marcus Garvey (street row, brownstone-ish, 3-4 floors)
face('hart|N|throop|garvey', {
  street: 'Hart Street', corners: false, firstNumber: 201, width: [5.2, 7], cornerWidth: [7, 9], depth: [11, 15], levels: [3, 3, 3, 4],
  buildings: ['house', 'residential', 'terrace'],
  roles: { 6: 'shop', 12: 'height', 17: 'none', 23: 'shop' }, vacantAt: 14,
});

const doc = {
  type: 'FeatureCollection',
  comment: 'SYNTHETIC fixture for tests: real-shaped, not real. Built by tests/fixtures/make-osm-sample.mjs from the typology numbers in schema.ts. Not OpenStreetMap data.',
  features,
};
fs.writeFileSync(path.join(ROOT, 'tests/fixtures/osm-sample.geojson'), JSON.stringify(doc, null, 1) + '\n');
console.log(`wrote tests/fixtures/osm-sample.geojson with ${features.length} features`);
await vite.close();
