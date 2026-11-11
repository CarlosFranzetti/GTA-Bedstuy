#!/usr/bin/env node
/**
 * Attach the NYC tax-lot id (`bbl`, 10 digits) to every lot of src/world/data/bedstuy.json whose note names its PLUTO address
 * ("[GEO3] 827 LAFAYETTE AVENUE · PLUTO C1 ..."). The address is looked up in the raw MapPLUTO extracts; an address that maps to
 * more than one BBL is skipped. Lots keep every other field. Idempotent. The BBL is the key for per-lot observed data
 * (src/world/data/facade-observed.json), so it survives any re-gridding of the street network.
 *   node scripts/attach-bbl.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'src/world/data/raw');
const JSON_PATH = path.join(ROOT, 'src/world/data/bedstuy.json');
const norm = (a) => a.toUpperCase().replace(/\bBOULEVARD\b/, 'BLVD').replace(/KOSCIUSKO/, 'KOSCIUSZKO').replace(/\s+/g, ' ').trim();
const byAddr = new Map();
for (const f of ['pluto-bedstuy.json', 'north-pluto.json', 'expansion-pluto.json']) {
  const rows = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r.address || !r.bbl) continue;
    const bbl = String(Math.round(Number(r.bbl))).padStart(10, '0');
    const k = norm(r.address);
    const set = byAddr.get(k) ?? new Set();
    set.add(bbl); byAddr.set(k, set);
  }
}
const lookup = (l) => {
  const m = /^\[(?:import|GEO3|GEO2|WBURG)\]\s+(?:POI [^|]*\|\|\s*)?(\d[\dA-Z-]*\s+[A-Z0-9 .'-]+?)\s+·/.exec(l.note ?? '');
  const set = m && byAddr.get(norm(m[1]));
  return set ? (set.size === 1 ? [...set][0] : 'ambiguous') : null;
};
// the file keeps one lot per line; edit those lines in place so the diff is only the added field
const lines = fs.readFileSync(JSON_PATH, 'utf8').split('\n');
let lots = 0, hit = 0, ambiguous = 0, already = 0, none = 0;
const out = lines.map((line) => {
  const m = /^(\s*)(\{"widthM":.*\})(,?)$/.exec(line);
  if (!m) return line;
  lots++;
  const l = JSON.parse(m[2]);
  if (l.bbl) { already++; return line; }
  const b = lookup(l);
  if (b === 'ambiguous') { ambiguous++; return line; }
  if (!b) { none++; return line; }
  hit++;
  return `${m[1]}${m[2].slice(0, -1)},"bbl":"${b}"}${m[3]}`;
});
console.log(`lots ${lots}: attached ${hit}, already ${already}, ambiguous ${ambiguous}, no address match ${none}`);
if (process.argv.includes('--write')) { fs.writeFileSync(JSON_PATH, out.join('\n')); JSON.parse(out.join('\n')); console.log('written'); }
