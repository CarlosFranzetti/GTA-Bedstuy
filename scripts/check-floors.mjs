#!/usr/bin/env node
/**
 * Floors check: MapPLUTO numfloors against the NYC Building Footprints roof height, per real-map lot
 * (src/world/data/raw/lots-real-r1r2a.json: fl, rf). Writes src/world/data/floors-check.json {bbl: floors} for lots where the city's
 * own two datasets disagree by 3+ storeys or PLUTO has no floor count, residential/mixed low-rise and mid-rise classes only
 * (A B C S K O: towers and institutions have taller storeys, so their ratio proves nothing). Storey height 3.2 m for 2-6 storeys.
 *   node scripts/check-floors.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lots = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/world/data/raw/lots-real-r1r2a.json'), 'utf8')).lots;
const out = {};
let both = 0, agree = 0, within1 = 0, noFloors = 0, noRoof = 0, fixed = 0;
for (const l of lots) {
  if (!l.rf) { noRoof++; continue; }
  const est = Math.max(1, Math.round(l.rf / 3.2));
  if (!l.fl) { noFloors++; if (/^[ABCSKO]/.test(l.cls ?? '') && est <= 8) { out[l.bbl] = est; fixed++; } continue; }
  both++;
  const d = Math.abs(l.fl - l.rf / 3.2);
  if (d < 2) agree++;
  if (d < 1) within1++;
  else if (d >= 3 && /^[ABCSKO]/.test(l.cls ?? '') && est <= 8 && l.fl <= 8) { out[l.bbl] = est; fixed++; }
}
fs.writeFileSync(path.join(ROOT, 'src/world/data/floors-check.json'), JSON.stringify({ note: 'floors suggested from footprint roof height where PLUTO has none or disagrees by 3+ storeys (low/mid-rise classes only)', floors: out }));
console.log({ lots: lots.length, both, withinOneStorey: within1, withinTwo: agree, plutoNoFloors: noFloors, noRoofHeight: noRoof, overrides: fixed });
