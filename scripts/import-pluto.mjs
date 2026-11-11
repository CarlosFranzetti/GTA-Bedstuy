#!/usr/bin/env node
/**
 * Build the lots of src/world/data/bedstuy.json from NYC MapPLUTO (and, when present, NYC Building Footprints) alone.
 * Counterpart of import-osm.mjs for when no OpenStreetMap data is reachable.
 *
 *   node scripts/fetch-pluto.mjs                      # curl the rows into src/world/data/raw/ (needs data.cityofnewyork.us)
 *   node scripts/import-pluto.mjs [--write] [--verbose] [--pluto f] [--footprints f] [--out f] [--target f]
 *
 * Placement uses each lot's own latitude/longitude (PLUTO centroid): the street lines are fitted from the lots addressed
 * on them, a lot goes to the face of the block it sits in (side of the street + column between the avenues), ordered
 * along the face. Fields: lot width from lotfront, building depth from bldgdepth, storeys from numfloors (else roof
 * height / 3.1 m), use from bldgclass / landuse, family and cornice from yearbuilt, vacant lots from V classes and gardens
 * from V / Q9 / parks owners. The kind of shop is NOT in PLUTO: a shop lot gets a stand-in kind chosen deterministically
 * from the BBL, and the game's POIs then pick their nearest shop lot (POI archetypes are game placements, parody names).
 *
 * Hand edits survive in two ways: a lot whose note starts with a house number and street ("[GEO2] 620 Greene Ave: ...")
 * is matched to the PLUTO lot at that address and its note text is carried over; POI lots are re-pinned by the POI list.
 * Hand notes that only describe a typology stand-in ("church stand-in", garden types) are dropped: PLUTO supersedes them
 * and the report lists each one.
 *
 * Data: NYC Department of City Planning MapPLUTO and NYC Building Footprints via NYC Open Data. No Google data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FT = 0.3048;
const STOREY_M = 3.1;
const STREET_ORDER = ['hart', 'pulaski', 'kosciuszko', 'lafayette', 'vanburen', 'greene'];
const AVENUES = ['tompkins', 'throop', 'garvey']; // west to east
const STREET_BY_NAME = {
  'HART STREET': 'hart', 'PULASKI STREET': 'pulaski', 'KOSCIUSZKO STREET': 'kosciuszko', 'KOSCIUSKO STREET': 'kosciuszko',
  'LAFAYETTE AVENUE': 'lafayette', 'VAN BUREN STREET': 'vanburen', 'GREENE AVENUE': 'greene',
  'THROOP AVENUE': 'throop', 'TOMPKINS AVENUE': 'tompkins', 'MARCUS GARVEY BLVD': 'garvey', 'MARCUS GARVEY BOULEVARD': 'garvey',
};
const ARCH_TO_STOREFRONT = {
  bodega: 'bodega', laundromat: 'laundromat', barbershop: 'barber', braiding: 'braiding', pizza: 'pizza', chinese: 'chinese',
  caribbean: 'caribbean', daycare: 'daycare', funeral: 'funeral', autorepair: 'autorepair', dollar: 'dollar', pharmacy: 'pharmacy', liquor: 'liquor',
};
// stand-in shop kinds (PLUTO has no business type): weights per avenue / street
const KINDS_AVENUE = [['bodega', 22], ['deli', 9], ['barber', 10], ['restaurant', 12], ['cellphone', 9], ['liquor', 7], ['laundromat', 6], ['pharmacy', 4], ['daycare', 4], ['generic', 17]];
const KINDS_STREET = [['bodega', 40], ['deli', 15], ['generic', 30], ['barber', 15]];

function parseArgs(argv) {
  const a = { pluto: path.join(ROOT, 'src/world/data/raw/pluto-bedstuy.json'), footprints: path.join(ROOT, 'src/world/data/raw/footprints-bedstuy.json'), target: path.join(ROOT, 'src/world/data/bedstuy.json'), out: null, write: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${t} needs a value`); return argv[++i]; };
    if (t === '--pluto') a.pluto = path.resolve(val());
    else if (t === '--footprints') a.footprints = path.resolve(val());
    else if (t === '--target') a.target = path.resolve(val());
    else if (t === '--out') a.out = path.resolve(val());
    else if (t === '--write') a.write = true;
    else if (t === '--verbose' || t === '-v') a.verbose = true;
    else throw new Error(`unknown argument ${t}`);
  }
  return a;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const pick = (list, r) => { const tot = list.reduce((s, [, w]) => s + w, 0); let x = r * tot; for (const [k, w] of list) { x -= w; if (x < 0) return k; } return list[0][0]; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const round1 = (n) => Math.round(n * 10) / 10;
const num = (s) => { const v = Number.parseFloat(s); return Number.isFinite(v) ? v : 0; };

/** centre of a one-dimensional two-sided cluster: the street line sits between the lots on its two sides */
function lineOf(values) {
  const m = median(values);
  const lo = values.filter((v) => v < m), hi = values.filter((v) => v >= m);
  return lo.length && hi.length ? (median(lo) + median(hi)) / 2 : m;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  return run(args);
}

async function run(args) {
  const say = (s = '') => console.log(s);
  const rowsAll = JSON.parse(fs.readFileSync(args.pluto, 'utf8'));
  const fpRows = fs.existsSync(args.footprints) ? JSON.parse(fs.readFileSync(args.footprints, 'utf8')) : [];
  const rawTarget = fs.readFileSync(args.target, 'utf8');
  const source = JSON.parse(rawTarget);

  // ---- local frame: metres east / north of the Throop & Kosciuszko area, grid axes from the fitted street direction
  const lat0 = 40.6935, lon0 = -73.9420, kLat = 111194.9, kLon = kLat * Math.cos(lat0 * Math.PI / 180);
  const rows = rowsAll.map((r) => ({ ...r, street: STREET_BY_NAME[r.address.replace(/^\S+\s+/, '').toUpperCase()], e: (num(r.longitude) - lon0) * kLon, n: (num(r.latitude) - lat0) * kLat })).filter((r) => r.street);
  // streets run at theta from true east; fit it by PCA of the lots addressed on the six streets (one angle each, averaged)
  const angles = STREET_ORDER.map((id) => {
    const pts = rows.filter((r) => r.street === id);
    const mx = pts.reduce((s, p) => s + p.e, 0) / pts.length, my = pts.reduce((s, p) => s + p.n, 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { sxx += (p.e - mx) ** 2; syy += (p.n - my) ** 2; sxy += (p.e - mx) * (p.n - my); }
    return 0.5 * Math.atan2(2 * sxy, sxx - syy);
  });
  const theta = angles.reduce((s, a) => s + a, 0) / angles.length;
  const ex = [Math.cos(theta), Math.sin(theta)], nx = [-Math.sin(theta), Math.cos(theta)];
  for (const r of rows) { r.v = r.e * ex[0] + r.n * ex[1]; r.u = r.e * nx[0] + r.n * nx[1]; }
  const avLine = Object.fromEntries(AVENUES.map((id) => [id, lineOf(rows.filter((r) => r.street === id).map((r) => r.v))]));
  const stLine = Object.fromEntries(STREET_ORDER.map((id) => [id, lineOf(rows.filter((r) => r.street === id).map((r) => r.u))]));
  // order sanity: Hart is north (largest u)
  for (let i = 0; i + 1 < STREET_ORDER.length; i++) if (!(stLine[STREET_ORDER[i]] > stLine[STREET_ORDER[i + 1]])) throw new Error(`street order mismatch at ${STREET_ORDER[i]}`);
  say('GTA Bed-Stuy PLUTO import');
  say(`  rows       ${rows.length} PLUTO lots on the nine streets (box from fetch-pluto.mjs)`);
  say(`  grid angle ${(theta * 180 / Math.PI).toFixed(2)} deg (streets from true east); avenues at v = ${AVENUES.map((a) => `${a} ${avLine[a].toFixed(0)}`).join(', ')}`);
  say(`  streets    u = ${STREET_ORDER.map((s) => `${s} ${stLine[s].toFixed(0)}`).join(', ')}`);

  // ---- footprints by BBL: roof height of the largest footprint
  const fpBy = new Map();
  for (const f of fpRows) { const o = fpBy.get(f.bbl); if (!o || (f.areaSqFt ?? 0) > (o.areaSqFt ?? 0)) fpBy.set(f.bbl, f); }

  // ---- assign each lot to a face
  const faceDefs = new Map(source.faces.map((f) => [`${f.street}|${f.side}|${f.from}|${f.to}`, f]));
  const byFace = new Map();
  let dropped = 0;
  const colOf = (v) => (v > avLine.tompkins && v <= avLine.throop ? 0 : v > avLine.throop && v < avLine.garvey ? 1 : -1);
  for (const r of rows) {
    const id = r.street;
    let key = null, sKey = 0;
    if (STREET_ORDER.includes(id)) {
      const col = colOf(r.v);
      if (col < 0) { dropped++; continue; }
      const side = r.u < stLine[id] ? 'N' : 'S'; // south of the street line: north face of the block below
      const [from, to] = col === 0 ? ['tompkins', 'throop'] : ['throop', 'garvey'];
      key = `${id}|${side}|${from}|${to}`; sKey = r.v;
    } else {
      const west = r.v < avLine[id];
      const side = id === 'garvey' ? (west ? 'E' : null) : id === 'tompkins' ? (west ? null : 'W') : west ? 'E' : 'W';
      if (!side) { dropped++; continue; }
      let row = -1;
      for (let i = 0; i < 5; i++) if (r.u < stLine[STREET_ORDER[i]] && r.u >= stLine[STREET_ORDER[i + 1]]) row = i;
      if (row < 0) { dropped++; continue; }
      // a lot on the street line itself belongs to the row whose block holds its centre; the side tests above decide
      key = `${id}|${side}|${STREET_ORDER[row]}|${STREET_ORDER[row + 1]}`; sKey = -r.u;
    }
    if (!faceDefs.has(key)) { dropped++; continue; }
    (byFace.get(key) ?? byFace.set(key, []).get(key)).push({ r, s: sKey });
  }
  // one condo building can appear as many lots (same coordinates, lot >= 7501): keep the billing lot's building once
  for (const [k, list] of byFace) {
    const seen = new Set();
    byFace.set(k, list.filter(({ r }) => { const key2 = `${r.block}|${r.address}`; if (seen.has(key2)) return false; seen.add(key2); return true; }).sort((a, b) => a.s - b.s));
  }

  // ---- classify
  const worstOwner = /PARKS|GREEN|GARDEN|COMMUNITY|NYC DEPT OF PARKS/i;
  const mkLot = (r, avenue) => {
    const bc = (r.bldgclass ?? 'V0').toUpperCase();
    const c0 = bc[0];
    const year = num(r.yearbuilt);
    const fp = fpBy.get(r.bbl);
    const widthFt = num(r.lotfront);
    let floors = Math.round(num(r.numfloors));
    let floorsFrom = 'numfloors';
    if (!floors && fp?.roofM) { floors = Math.max(1, Math.round(fp.roofM / STOREY_M)); floorsFrom = 'footprint roof height'; }
    if (!floors) { floorsFrom = 'default'; }
    const lot = { widthM: round1(Math.max(3, widthFt * FT)), confidence: 'H' };
    if (/^\d{10}$/.test(String(r.bbl))) lot.bbl = String(r.bbl); // stable tax-lot key for per-lot observed data (facade-observed.json)
    const bits = [`${r.address}`, `PLUTO ${bc}${year ? ` built ${year}` : ''}${r.landuse ? ` LU${String(r.landuse).padStart(2, '0')}` : ''}`];
    let use = 'residential', family, storefront;
    const retail = num(r.retailarea) > 0;
    if (c0 === 'V' || (c0 === 'Q' && bc === 'Q9') || (!num(r.bldgarea) && num(r.landuse) === 9)) {
      use = 'vacant'; family = 'vacant'; floors = 0;
      if (worstOwner.test(r.ownername ?? '') || bc === 'Q9' || num(r.landuse) === 9) { lot.trees = 3; bits.push('open lot / garden (V, Q9 or park-owned)'); }
    } else if (c0 === 'M') { use = 'church'; family = 'church'; storefront = 'church'; floors = Math.min(Math.max(floors || 3, 2), 3); }
    else if (c0 === 'W') { use = 'school'; storefront = 'daycare'; floors = Math.max(floors || 3, 2); }
    else if (c0 === 'G' || num(r.landuse) === 10 || 'EFLUTY'.includes(c0)) { use = 'garage'; floors = Math.min(floors || 1, 2); }
    else if (c0 === 'K' || c0 === 'S' || bc === 'C7' || bc === 'D7' || bc === 'O' || ['O', 'H', 'J', 'P'].includes(c0) || num(r.landuse) === 5 || num(r.landuse) === 4 || retail) {
      use = 'mixed'; storefront = pick(avenue ? KINDS_AVENUE : KINDS_STREET, hash(r.bbl)); floors = Math.max(floors || 2, 1);
      bits.push('shop kind is a stand-in (PLUTO has no business type)');
    } else { use = 'residential'; floors = floors || (c0 === 'D' ? 6 : c0 === 'C' ? 4 : 3); }
    if (use !== 'vacant') floors = Math.min(8, Math.max(1, floors));
    // era
    if (use === 'residential' || use === 'mixed') {
      if (year >= 1990 && use === 'residential') family = 'newBuild';
      else {
        const h = hash(`${r.bbl}f`);
        if (year && year < 1900) family = h < 0.55 ? 'brownstone' : h < 0.9 ? 'brickRed' : 'limestone';
        else if (year && year < 1940) family = h < 0.25 ? 'brownstone' : h < 0.7 ? 'brickRed' : h < 0.9 ? 'brickTan' : 'limestone';
        else family = h < 0.5 ? 'brickTan' : h < 0.9 ? 'brickRed' : 'brickPainted';
        if (year && year >= 1940 && c0 === 'D') family = 'brickTan';
      }
    }
    if (use === 'residential' || use === 'mixed') {
      if (year && year < 1880) lot.cornice = 'bracketed';
      else if (year && year < 1925) lot.cornice = 'plain';
      else lot.cornice = 'none';
      const rowClass = ['A', 'B', 'C', 'S'].includes(c0) || bc === 'R3';
      if (use === 'residential') lot.stoop = rowClass && floors >= 2 && widthFt * FT <= 12 && (!year || year < 1940) && family !== 'newBuild';
      else lot.stoop = false;
    }
    const bd = num(r.bldgdepth) * FT;
    if (use !== 'vacant' && bd >= 9 && bd <= 40) lot.depthM = round1(bd);
    if (floors && use !== 'vacant') lot.floors = floors; else if (use === 'vacant') lot.floors = 0;
    lot.use = use;
    if (family) lot.family = family;
    if (storefront) lot.storefront = storefront;
    if (floorsFrom === 'default' && use !== 'vacant') lot.confidence = 'M';
    if (!widthFt) lot.confidence = 'M';
    const fpBit = fp?.roofM ? ` · roof ${fp.roofM} m (Building Footprints, BIN ${fp.bin})` : '';
    lot.note = `[import] ${bits.join(' · ')} · ${floors} fl (${floorsFrom})${fpBit}`;
    return lot;
  };

  // ---- grid (face lengths, corner insets) from the existing data
  const vite = await createServer({ configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent', resolve: { alias: { '@': path.join(ROOT, 'src') } }, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true } });
  let problems = [];
  let json;
  const droppedNotes = [];
  const keywordNotes = [];
  const report = [];
  const stats = { lots: 0, storefront: 0, vacant: 0, church: 0, school: 0, garage: 0, newBuild: 0, handCarried: 0, filler: 0, setbackLawns: 0, minYear: 9999, maxYear: 0, floors: {}, widthSum: 0, poiMoved: [] };
  try {
    const geo = await vite.ssrLoadModule('/src/world/data/geo.ts');
    const schema = await vite.ssrLoadModule('/src/world/data/schema.ts');
    const gridMod = await vite.ssrLoadModule('/src/world/Grid.ts');
    const oldSet = schema.loadFaces(source);
    const grid = gridMod.buildGrid({ ...source });
    const faceInfo = (f) => {
      const key = `${f.street}|${f.side}|${f.from}|${f.to}`;
      for (const b of grid.blocks) for (const bf of b.faces) if (schema.faceKeyOf(grid, bf) === key) {
        const ew = bf.side === 'E' || bf.side === 'W';
        const len = Math.hypot(bf.b.x - bf.a.x, bf.b.z - bf.a.z);
        const ins = ew ? { a: 0, b: 0 } : schema.cornerInsets(grid, bf, oldSet);
        return { len, span: len - ins.a - ins.b };
      }
      return { len: 230, span: 200 };
    };

    // ---- hand edits worth carrying: lots whose note starts with an address (house number + street word)
    const handByAddr = new Map();
    for (const f of source.faces) for (const l of f.lots) {
      const note = (l.note ?? '').trim();
      if (!note || note.startsWith('[import]') || /^POI /.test(note) || /^(typology default|W2 density pass|filler)/.test(note)) continue;
      const m = /^(?:\[GEO2\]\s*)?(\d+[A-Za-z]?)\s+([A-Za-z]+)/.exec(note);
      if (m) handByAddr.set(`${m[1]} ${m[2]}`.toUpperCase(), note.split(' || ')[0]); else if (/bus stop/i.test(note)) keywordNotes.push({ key: `${f.street}|${f.side}|${f.from}|${f.to}`, at: f.lots.slice(0, f.lots.indexOf(l)).reduce((t, x) => t + x.widthM, 0) / f.lots.reduce((t, x) => t + x.widthM, 0), note }); else droppedNotes.push(`${f.street} ${f.side} ${f.from}-${f.to}: ${note.slice(0, 90)}`);
    }

    const fillerLot = (w, avenueFace, seed) => {
      const h = hash(seed);
      return { widthM: round1(w), floors: avenueFace ? 4 : 3, family: h < 0.45 ? 'brownstone' : h < 0.85 ? 'brickRed' : 'brickTan', use: 'residential', stoop: !avenueFace, cornice: 'plain', confidence: 'L', note: '[import] filler: no PLUTO lot is addressed on this street along this stretch (side wall of a cross-street corner building or the rear of a larger parcel)' };
    };

    const newFaces = source.faces.map((f) => {
      const key = `${f.street}|${f.side}|${f.from}|${f.to}`;
      const list = byFace.get(key) ?? [];
      const { len, span } = faceInfo(f);
      const isAvenueFace = ['throop', 'tompkins', 'garvey'].includes(f.street);
      const avFace = isAvenueFace || f.street === 'lafayette';
      // real extent of the face: between the two street lines, less half a road each side
      const a0 = isAvenueFace ? 0 : avLine[f.from];
      const lenReal = isAvenueFace ? stLine[f.from] - stLine[f.to] : avLine[f.to] - avLine[f.from];
      const realA = 10, realB = lenReal - 10;
      const realLen = realB - realA;
      const sc = span / realLen;
      // items along the face in game metres
      const items = [];
      for (const { r } of list) {
        const sReal = isAvenueFace ? stLine[f.from] - r.u : r.v - a0;
        const wReal = Math.max(3, num(r.lotfront) * FT);
        const lot = mkLot(r, avFace);
        const mm = /^(\d+[A-Za-z]?)\s+(\S+)/.exec(r.address);
        const hand = mm ? handByAddr.get(`${mm[1]} ${mm[2]}`.toUpperCase()) : undefined;
        if (hand) { lot.note = `[GEO2] ${hand.replace(/^\[GEO2\]\s*/, '')} || PLUTO: ${lot.note.replace('[import] ', '')}`; lot.confidence = 'H'; stats.handCarried++; }
        if (lot.use !== 'vacant' && !lot.trees && hash(`${r.bbl}t`) < 0.3) lot.trees = 1; // decorative street tree, unsourced
        const bfW = num(r.bldgfront) * FT;
        const centre = (sReal - realA) * sc;
        const w = wReal * sc;
        items.push({ c: centre, w, lot, bfW: bfW * sc, r });
      }
      // pieces: set-back lawns around a building much narrower than its lot; very wide lots split equally
      const pieces = [];
      for (const it of items) {
        const { c, w, lot } = it;
        const narrow = lot.use !== 'vacant' && it.bfW > 2 && w > 24 && w > 2 * it.bfW;
        if (narrow) {
          const bw = Math.min(40, Math.max(it.bfW, 8));
          const lawn = (w - bw) / 2;
          const mk = (k) => ({ s0: c - w / 2 + (k === 0 ? 0 : lawn + bw), s1: c - w / 2 + (k === 0 ? lawn : w), lot: { widthM: round1(lawn), floors: 0, family: 'vacant', use: 'vacant', trees: 2, confidence: 'H', note: `[import] set-back lawn: ${it.r.address} lot is ${(num(it.r.lotfront)).toFixed(0)} ft wide, building ${(num(it.r.bldgfront)).toFixed(0)} ft (PLUTO)` } });
          pieces.push(mk(0)); stats.setbackLawns += 2;
          pieces.push({ s0: c - bw / 2, s1: c + bw / 2, lot: { ...lot, widthM: round1(bw) } });
          pieces.push(mk(1));
        } else {
          const n = Math.max(1, Math.ceil(w / 40));
          for (let k = 0; k < n; k++) pieces.push({ s0: c - w / 2 + (w * k) / n, s1: c - w / 2 + (w * (k + 1)) / n, lot: { ...lot, widthM: round1(w / n) } });
        }
      }
      pieces.sort((x, y) => (x.s0 + x.s1) - (y.s0 + y.s1));
      // clip to the face, trim overlaps at the midpoint
      const kept = pieces.filter((p) => p.s1 > 0 && p.s0 < span).map((p) => ({ ...p, s0: Math.max(0, p.s0), s1: Math.min(span, p.s1) })).filter((p) => p.s1 - p.s0 >= 3);
      for (let i = 0; i + 1 < kept.length; i++) { const x = kept[i], y = kept[i + 1]; if (y.s0 < x.s1) { const m = (x.s1 + y.s0) / 2; x.s1 = m; y.s0 = m; } }
      // fill every gap (and the ends) with filler rows
      const out = [];
      let cursor = 0;
      const gapFill = (from, to, tag) => {
        const g = to - from;
        if (g < 3) { if (out.length) { /* give the sliver to the previous lot */ out[out.length - 1].widthM = round1(out[out.length - 1].widthM + g); } return; }
        const n = Math.max(1, Math.round(g / 6.3));
        for (let k = 0; k < n; k++) { out.push(fillerLot(g / n, avFace, `${key}${tag}${k}`)); stats.filler++; }
      };
      for (const p of kept) { gapFill(cursor, p.s0, `g${Math.round(cursor)}`); out.push({ ...p.lot, widthM: round1(p.s1 - p.s0) }); cursor = p.s1; }
      gapFill(cursor, span, 'end');
      for (let i = out.length - 1; i >= 0; i--) if (out[i].widthM > 40) { const n = Math.ceil(out[i].widthM / 40); const parts = Array.from({ length: n }, () => ({ ...out[i], widthM: round1(out[i].widthM / n) })); out.splice(i, 1, ...parts); }
      if (!kept.length) { report.push({ key, n: 0, out: f.lots.length, note: 'no PLUTO lot is addressed on this face; the earlier typology row is kept' }); return f; }
      else report.push({ key, n: list.length, out: out.length, filler: out.filter((l) => l.note?.includes('filler')).length, span });
      return { ...f, lots: out };
    });

    // ---- hand notes about places that are not lots (a bus stop at a corner): carried to the lot at the same fraction of the face
    for (const kn of keywordNotes) {
      const f = newFaces.find((x) => `${x.street}|${x.side}|${x.from}|${x.to}` === kn.key);
      if (!f) continue;
      const tot = f.lots.reduce((t, l) => t + l.widthM, 0);
      let acc = 0, hit = f.lots[0];
      for (const l of f.lots) { if (acc + l.widthM / 2 >= kn.at * tot) { hit = l; break; } acc += l.widthM; hit = l; }
      hit.note = `${kn.note.replace(/^\[GEO2\]\s*/, '')} || ${hit.note.replace(/^\[import\] /, 'PLUTO: ')}`;
      hit.confidence = 'M';
    }

    // ---- corner depths follow the new E/W lots: refit every N/S row to the real room left between them (shrink only)
    {
      const newSet = schema.loadFaces({ ...source, faces: newFaces });
      for (const b of grid.blocks) for (const bf of b.faces) {
        const key = schema.faceKeyOf(grid, bf);
        const f = newFaces.find((x) => `${x.street}|${x.side}|${x.from}|${x.to}` === key);
        if (!f || !f.lots.length) continue;
        const ew = bf.side === 'E' || bf.side === 'W';
        const ins = ew ? { a: 0, b: 0 } : schema.cornerInsets(grid, bf, newSet);
        const room = Math.hypot(bf.b.x - bf.a.x, bf.b.z - bf.a.z) - ins.a - ins.b - (ew ? 0 : 0.5);
        const sum = f.lots.reduce((t, l) => t + l.widthM, 0);
        const k = sum > room ? room / sum : sum > 0.9 * room ? room / sum : 1; // shrink always; stretch a row that is short by <10% so the schema does not rescale it
        if (k !== 1) {
          for (const l of f.lots) l.widthM = Math.min(40, Math.max(3, Math.round(l.widthM * k * 10) / 10));
          // put the rounding residue on the widest lot so the row is as long as the room (the schema then leaves it alone)
          const resid = Math.round((room - f.lots.reduce((t, l) => t + l.widthM, 0)) * 10) / 10;
          const widest = f.lots.reduce((a, l) => (l.widthM > a.widthM ? l : a), f.lots[0]);
          if (widest.widthM + resid <= 40 && widest.widthM + resid >= 3) widest.widthM = Math.round((widest.widthM + resid) * 10) / 10;
        }
      }
    }

    // ---- POIs: nearest shop lot of the right kind on the POI's face (game placement, parody names)
    const poiMoved = stats.poiMoved;
    for (const poi of source.pois) {
      const dual = { N: 'N', S: 'S', E: 'E', W: 'W' };
      const block = grid.blockById(poi.block);
      const bf = block.faces.find((x) => x.side === dual[poi.face]);
      const key = schema.faceKeyOf(grid, bf);
      const face = newFaces.find((x) => `${x.street}|${x.side}|${x.from}|${x.to}` === key);
      if (!face || !face.lots.length) continue;
      const total = face.lots.reduce((s, l) => s + l.widthM, 0);
      const target = poi.t * total;
      let acc = 0; const mids = face.lots.map((l) => { const m = acc + l.widthM / 2; acc += l.widthM; return m; });
      const wantSf = ARCH_TO_STOREFRONT[poi.archetype];
      let best = -1, bd = Infinity;
      const okFor = (l) => (poi.archetype === 'church' ? l.use === 'church' : poi.archetype === 'condo' ? l.use === 'residential' && l.widthM >= 8 : l.use === 'mixed');
      face.lots.forEach((l, i) => {
        if (l.note?.startsWith('POI ') || l.use === 'vacant') return;
        const d = Math.abs(mids[i] - target) + (okFor(l) ? 0 : 1000);
        if (d < bd) { bd = d; best = i; }
      });
      // a matching lot more than 25 m from the POI's spot loses to converting the lot at the spot (keeps the game placement)
      if (best >= 0 && bd < 1000 && bd > 25 && poi.archetype !== 'church') {
        let b2 = -1, d2 = Infinity;
        face.lots.forEach((l, i) => { if (l.note?.startsWith('POI ') || l.use !== 'residential' || l.widthM < 4) return; const d = Math.abs(mids[i] - target); if (d < d2) { d2 = d; b2 = i; } });
        if (b2 >= 0) { best = b2; bd = 1000 + d2; }
      }
      if (best < 0) continue;
      const lot = face.lots[best];
      const dist = Math.abs(mids[best] - target);
      const converted = bd >= 1000;
      if (poi.archetype === 'church') { lot.use = 'church'; lot.family = 'church'; lot.storefront = 'church'; lot.stoop = true; lot.floors = Math.min(lot.floors || 3, 3); }
      else if (poi.archetype === 'condo') { /* LotSubdivider turns this lot into the apartment */ }
      else { lot.use = 'mixed'; lot.storefront = wantSf ?? 'generic'; lot.stoop = false; lot.floors = Math.max(lot.floors || 3, 2); if (lot.family === 'vacant') lot.family = 'brickRed'; }
      if (lot.use !== 'vacant' && lot.floors === 0) lot.floors = 3;
      lot.confidence = 'M';
      lot.note = `POI ${poi.id} (game placement, parody) || ${lot.note.replace(/^\[(import|GEO2)\] /, '')}`;
      if (dist > 25 || converted) poiMoved.push(`${poi.id}: nearest suitable lot is ${dist.toFixed(0)} m from t=${poi.t}${converted ? ' (a non-shop lot was converted)' : ''}`);
    }

    // ---- the interior doors (WAX DELI, the club door, HOME) are fixed world coordinates: the lot in front of each must be a real wall with a door
    {
      const defs = await vite.ssrLoadModule('/src/world/interiors/defs.ts');
      const set2 = schema.loadFaces({ ...source, faces: newFaces });
      // the deli door sits on a brownstone's stoop (areaway + stoop count as its doorstep) and HOME on a stooped house; the club door only needs a wall
      const ROLE = { deli: { use: 'residential', family: 'brownstone', stoop: true, minFloors: 3 }, home: { use: 'residential', family: 'brownstone', stoop: true, minFloors: 3 }, club: { use: 'residential', family: 'brickRed', stoop: false, minFloors: 3 } };
      for (const id of defs.INTERIOR_IDS) {
        const d = defs.INTERIORS[id].door;
        let found = null;
        for (const b of grid.blocks) for (const bf of b.faces) {
          const key = schema.faceKeyOf(grid, bf);
          const f = newFaces.find((x) => `${x.street}|${x.side}|${x.from}|${x.to}` === key);
          if (!f) continue;
          const placed = schema.lotsForFace(grid, bf, set2);
          placed.forEach((pl, i) => {
            const ax = pl.frontA.x, az = pl.frontA.z, bx = pl.frontB.x, bz = pl.frontB.z;
            const L = Math.hypot(bx - ax, bz - az);
            const t = ((d.x - ax) * (bx - ax) + (d.z - az) * (bz - az)) / (L * L);
            const dd = Math.abs((d.x - ax) * (bz - az) - (d.z - az) * (bx - ax)) / L;
            if (t >= 0 && t <= 1 && dd < 1.5) found = { f, idx: bf.side === 'N' || bf.side === 'E' ? placed.length - 1 - i : i, pl };
          });
        }
        if (!found) { stats.poiMoved.push(`door ${id}: no lot front within 1.5 m of (${d.x}, ${d.z})`); continue; }
        const lot = found.f.lots[found.idx];
        const before = `${lot.use}${lot.storefront ? '/' + lot.storefront : ''} ${lot.floors}fl w${lot.widthM}`;
        const role = ROLE[id] ?? ROLE.home;
        if (lot.use === 'church' && id !== 'home') { stats.doorLots = [...(stats.doorLots ?? []), `${id}: ${found.pl.id} stays ${before}`]; continue; }
        if (lot.use === 'vacant' || (id !== 'club' && (lot.use === 'garage' || lot.use === 'church' || lot.use !== 'residential' || lot.family !== 'brownstone' || !lot.stoop || lot.widthM < 5))) {
          Object.assign(lot, { use: role.use, family: role.family, stoop: role.stoop, floors: Math.max(lot.floors || 0, role.minFloors), cornice: lot.cornice ?? 'plain' });
          if (role.storefront) lot.storefront = role.storefront; else delete lot.storefront;
          delete lot.trees; lot.confidence = 'M';
          lot.note = `DOOR ${id} (game placement at ${d.x}, ${d.z}) || ${lot.note.replace(/^\[(import|GEO2)\] /, '')}`;
        }
        // a door lot wider than 8.5 m gets its extra width cut off as neighbours (the areaway fence allows three runs per lot)
        if (lot.widthM > 7.8) {
          const pl = found.pl;
          const L = Math.hypot(pl.frontB.x - pl.frontA.x, pl.frontB.z - pl.frontA.z);
          const sd = ((d.x - pl.frontA.x) * (pl.frontB.x - pl.frontA.x) + (d.z - pl.frontA.z) * (pl.frontB.z - pl.frontA.z)) / L;
          const dw = Math.min(7.2, L);
          const lo = Math.min(Math.max(0, sd - dw / 2), L - dw);
          const parts = [lo, dw, L - lo - dw].map((w) => Math.round(w * 10) / 10);
          const rev = found.pl.side === 'N' || found.pl.side === 'E';
          const nb = (delta) => found.f.lots[found.idx + (rev ? -delta : delta)]; // neighbour on the a-side (-1) or b-side (+1) in placed order
          const piece = (w, tag) => ({ ...lot, widthM: w, note: `[import] ${tag} of the ${id} door lot (rest of the PLUTO lot)`, use: lot.use === 'vacant' ? 'vacant' : 'residential', stoop: false, storefront: undefined });
          const seq = [];
          let door = parts[1];
          if (parts[0] >= 3) seq.push(piece(parts[0], 'neighbour')); else if (nb(-1)) nb(-1).widthM = Math.round((nb(-1).widthM + parts[0]) * 10) / 10; else door += parts[0];
          seq.push({ ...lot, widthM: 0 });
          const doorIdx = seq.length - 1;
          if (parts[2] >= 3) seq.push(piece(parts[2], 'neighbour')); else if (nb(1)) nb(1).widthM = Math.round((nb(1).widthM + parts[2]) * 10) / 10; else door += parts[2];
          seq[doorIdx].widthM = Math.round(door * 10) / 10;
          for (const x of seq) if (x.storefront === undefined) delete x.storefront;
          const jsonOrder = rev ? seq.reverse() : seq;
          found.f.lots.splice(found.idx, 1, ...jsonOrder);
        }
        stats.doorLots = [...(stats.doorLots ?? []), `${id}: ${found.pl.id} ${before} -> ${lot.use}${lot.storefront ? '/' + lot.storefront : ''} ${lot.floors}fl w${lot.widthM}`];
      }
    }

    // ---- decorative scaffolds: keep the old count per face on residential rows (unsourced decoration)
    for (const f of newFaces) {
      const old = source.faces.find((x) => x.street === f.street && x.side === f.side && x.from === f.from && x.to === f.to);
      if (f === old) continue;
      const nOld = old.lots.filter((l) => l.scaffold).length;
      if (!nOld) continue;
      const cand = f.lots.map((l, i) => [l, i]).filter(([l]) => l.use === 'residential' && l.floors >= 3 && !l.note?.startsWith('POI ')).sort((a, b) => hash(a[0].note) - hash(b[0].note)).slice(0, nOld);
      for (const [l] of cand) l.scaffold = true;
    }

    // ---- last refit: the door/POI passes can change corner depths, so shrink any N/S row that no longer fits
    {
      const finalSet = schema.loadFaces({ ...source, faces: newFaces });
      for (const b of grid.blocks) for (const bf of b.faces) {
        if (bf.side === 'E' || bf.side === 'W') continue;
        const key = schema.faceKeyOf(grid, bf);
        const f = newFaces.find((x) => `${x.street}|${x.side}|${x.from}|${x.to}` === key);
        if (!f || !f.lots.length) continue;
        const ins = schema.cornerInsets(grid, bf, finalSet);
        const room = Math.hypot(bf.b.x - bf.a.x, bf.b.z - bf.a.z) - ins.a - ins.b - 0.3;
        const sum = f.lots.reduce((t, l) => t + l.widthM, 0);
        if (sum > room) { const k = room / sum; for (const l of f.lots) l.widthM = Math.max(3, Math.floor(l.widthM * k * 10) / 10); }
      }
    }

    json = { ...source, faces: newFaces };
    json.geo = { source: 'NYC Department of City Planning MapPLUTO (64uk-42ks) and NYC Building Footprints (5zhs-2jue), via NYC Open Data', importer: 'scripts/import-pluto.mjs', fetched: (() => { try { return JSON.parse(fs.readFileSync(args.pluto.replace(/\.json$/, '.query.json'), 'utf8')).fetched; } catch { return undefined; } })(), gridAngleDeg: round1(theta * 180 / Math.PI), attribution: 'NYC Department of City Planning, MapPLUTO, via NYC Open Data' };
    problems = [...schema.validateFaces(json)];
    if (!problems.length) { const set = schema.loadFaces(json); problems.push(...schema.validateAgainstGrid(gridMod.buildGrid({ ...json }), set)); }

    // ---- stats
    for (const f of newFaces) for (const l of f.lots) {
      if (!l.note?.includes('PLUTO')) continue;
      stats.lots++;
      if (l.use === 'mixed') stats.storefront++;
      if (l.use === 'vacant') stats.vacant++;
      if (l.use === 'church') stats.church++;
      if (l.use === 'school') stats.school++;
      if (l.use === 'garage') stats.garage++;
      if (l.family === 'newBuild') stats.newBuild++;
      stats.floors[l.floors] = (stats.floors[l.floors] ?? 0) + 1;
      stats.widthSum += l.widthM;
      const ym = /built (\d{4})/.exec(l.note); if (ym) { stats.minYear = Math.min(stats.minYear, +ym[1]); stats.maxYear = Math.max(stats.maxYear, +ym[1]); }
    }
    // the three mission doors: which lot of which face covers each (coordinates from interiors/defs)
    stats.doorTargets = ['deli (11.05, 34) Throop W Kosciuszko-Lafayette', 'club (-11.05, -36) Throop E Pulaski-Kosciuszko', 'home (70, -8.55) Kosciuszko S Throop-Marcus Garvey'];
  } finally {
    await vite.close();
  }

  say(`  dropped    ${dropped} lots outside the grid (other side of Hart/Greene, beyond Tompkins/Marcus Garvey)`);
  say('');
  say('face                                      PLUTO lots  filler  lots(old->new)  span m');
  for (const r of report) {
    const old = source.faces.find((x) => `${x.street}|${x.side}|${x.from}|${x.to}` === r.key);
    say(`${r.key.padEnd(42)} ${String(r.n).padStart(6)} ${String(r.filler ?? '-').padStart(7)}  ${`${old.lots.length} -> ${r.out ?? old.lots.length}`.padEnd(14)} ${r.span ? r.span.toFixed(0).padStart(6) : '     -'}${r.note ? '  ' + r.note : ''}`);
  }
  say('');
  say(`imported lots ${stats.lots}: mixed/shop ${stats.storefront}, vacant ${stats.vacant}, church ${stats.church}, school ${stats.school}, garage ${stats.garage}, new build (>=1990) ${stats.newBuild}; year built ${stats.minYear}-${stats.maxYear}; mean width ${(stats.widthSum / stats.lots).toFixed(1)} m`);
  say(`floors histogram ${JSON.stringify(stats.floors)}`);
  say(`hand notes carried by address: ${stats.handCarried}; typology-only hand notes superseded by PLUTO: ${droppedNotes.length}`);
  if (args.verbose) for (const n of droppedNotes) say(`   dropped note ${n}`);
  for (const dl of stats.doorLots ?? []) say(`door lot  ${dl}`);
  say(`POIs needing a move/convert: ${stats.poiMoved.length ? '' : 'none'}`);
  for (const p of stats.poiMoved) say(`   ${p}`);
  say(`validator: ${problems.length} error${problems.length === 1 ? '' : 's'}`);
  for (const p of problems.slice(0, 20)) say(`  ! ${p}`);
  if (problems.length) { say('NOT written.'); return 1; }

  const vite2 = await createServer({ configFile: false, root: ROOT, appType: 'custom', logLevel: 'silent', resolve: { alias: { '@': path.join(ROOT, 'src') } }, server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true } });
  let text;
  try { text = (await vite2.ssrLoadModule('/src/world/data/geo.ts')).formatBedstuyJson(json); } finally { await vite2.close(); }
  const dest = args.out ?? args.target;
  if (!args.write) { say(`\ndry run: ${text === rawTarget ? 'no change to' : 'would change'} ${path.relative(ROOT, dest)} (pass --write).`); return 0; }
  fs.writeFileSync(dest, text);
  say(`\nwrote ${path.relative(ROOT, dest)}`);
  return 0;
}

main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(`import-pluto: ${e.stack ?? e.message}`); process.exit(1); });
