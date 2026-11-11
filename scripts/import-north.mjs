#!/usr/bin/env node
/**
 * WBURG: lots for the four block rows north of Hart St (Hart-Myrtle, Myrtle-Park, Park-Flushing, Flushing-Wallabout), from NYC MapPLUTO.
 *   node scripts/import-north.mjs            # reads src/world/data/raw/north-pluto.json, splices the faces into src/world/data/bedstuy.json
 * Raw rows: NYC DCP MapPLUTO (64uk-42ks) via data.cityofnewyork.us, fetched 11 Nov 2026 inside lat 40.6925..40.7120, lon -73.9520..-73.9200;
 * X/Z are grid metres (State Plane -> metres -> rotated 8.7 deg, origin Throop x Kosciuszko), the same fit as expansion-pluto.json.
 * No Google data. Shop kinds are stand-ins (PLUTO has no business type); every name in the game is a parody.
 *
 * The game rows are 100 m, the real ones 82 m to 250 m (Willoughby, Vernon, Stockton, Ellery and the Harrison/Bartlett/Gerry
 * streets are left out the way DeKalb was), so a real band between two game streets is squeezed: each lot is placed by its position
 * inside its real band and attached to the nearest game face; lots deeper than `REACH` game metres from every face are dropped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'src/world/data/raw/north-pluto.json');
const FT = 0.3048, STOREY_M = 3.1, REACH = 34;
const AVE = ['tompkins', 'throop', 'garvey', 'lewis', 'stuyvesant', 'malcolmx'];
const AVE_X0 = { tompkins: -248, throop: 1, garvey: 242, lewis: 493, stuyvesant: 742, malcolmx: 991 }; // real x at z = 0 (EXPANSION.md)
const AVE_NAMES = { tompkins: ['TOMPKINS AVENUE'], throop: ['THROOP AVENUE'], garvey: ['MARCUS GARVEY BLVD', 'MARCY AVENUE'], lewis: ['LEWIS AVENUE'], stuyvesant: ['STUYVESANT AVENUE'], malcolmx: ['MALCOLM X BOULEVARD', 'REID AVENUE'] };
// game streets north to south, with the real centreline z at x (measured from the lots addressed on them, slopes from linear fits)
const ROWS = ['wallabout', 'flushing', 'park', 'myrtle', 'hart'];
const ZLINE = {
  hart: (x) => -249 - 0.019 * x,
  myrtle: (x) => -481 - 0.015 * x,
  park: (x) => -762 + 0.016 * x,
  flushing: (x) => -989 - 0.085 * x,
  wallabout: (x) => -1184 - 0.085 * x,
};
const GAME_Z = { hart: -200, myrtle: -300, park: -400, flushing: -500, wallabout: -600 };
const HALF = { hart: 5, myrtle: 6.5, park: 6.5, flushing: 8, wallabout: 5 };
const SIDEW = { hart: 3.5, myrtle: 4, park: 4, flushing: 4.5, wallabout: 3.5 };
const COL_LEN = 228; // N/S face building-line length between two avenues (250 - 14 - 2 x 4)

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const pick = (list, r) => { const tot = list.reduce((s, [, w]) => s + w, 0); let x = r * tot; for (const [k, w] of list) { x -= w; if (x < 0) return k; } return list[0][0]; };
const num = (s) => { const v = Number.parseFloat(s); return Number.isFinite(v) ? v : 0; };
const round1 = (n) => Math.round(n * 10) / 10;

const rows = JSON.parse(fs.readFileSync(RAW, 'utf8'));
// venues already placed by the VENUES lane (parody names): a lot at the same house number and street word carries the sign
const venueKey = (a) => { const [n, w] = String(a).toUpperCase().split(/\s+/); return `${n} ${w}`; };
const VENUES = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/world/data/raw/venues-current.json'), 'utf8')).venues.map((v) => [venueKey(v.address), v]));
const streetOf = (r) => r.address.replace(/^\S+\s+/, '').toUpperCase();

// ---- avenue lines x(z): least squares on lots addressed on each avenue, anchored to the known x at z = 0 when the sample is thin
const aveLine = {};
for (const id of AVE) {
  const pts = rows.filter((r) => AVE_NAMES[id].includes(streetOf(r)) && r.Z < -170 && r.Z > -1250);
  let a = AVE_X0[id], b = 0;
  if (pts.length >= 12) {
    const n = pts.length, mx = pts.reduce((s, p) => s + p.Z, 0) / n, my = pts.reduce((s, p) => s + p.X, 0) / n;
    let sxx = 0, sxy = 0;
    for (const p of pts) { sxx += (p.Z - mx) ** 2; sxy += (p.Z - mx) * (p.X - my); }
    b = sxx > 1 ? Math.max(-0.12, Math.min(0.12, sxy / sxx)) : 0; a = my - b * mx;
  }
  aveLine[id] = (z) => a + b * z;
}

const KINDS_AVENUE = [['bodega', 22], ['deli', 9], ['barber', 8], ['restaurant', 12], ['cellphone', 9], ['liquor', 5], ['laundromat', 6], ['pharmacy', 4], ['daycare', 3], ['generic', 22]];
const KINDS_STREET = [['bodega', 40], ['deli', 15], ['generic', 30], ['barber', 15]];
const KINDS_WBURG = [['deli', 30], ['bodega', 22], ['generic', 18], ['pharmacy', 8], ['pizza', 10], ['dollar', 12]];
const worstOwner = /PARKS|GREEN|GARDEN|COMMUNITY|NYC DEPT OF PARKS/i;

function mkLot(r, ctx) {
  const bc = (r.bldgclass ?? 'V0').toUpperCase();
  const c0 = bc[0];
  const year = num(r.yearbuilt);
  const widthFt = num(r.lotfront);
  let floors = Math.round(num(r.numfloors));
  const lot = { widthM: round1(Math.max(3, widthFt * FT)), confidence: 'H' };
  const bits = [r.address, `PLUTO ${bc}${year ? ` built ${year}` : ''}${r.landuse ? ` LU${String(r.landuse).padStart(2, '0')}` : ''}`];
  let use = 'residential', family, storefront;
  const retail = num(r.retailarea) > 0;
  const lu = num(r.landuse);
  const owner = (r.ownername ?? '').toUpperCase();
  const industrial = 'EFLU'.includes(c0) && c0 !== 'L' ? true : c0 === 'L' || lu === 6 || bc === 'G9' || c0 === 'G' || c0 === 'T';
  if (c0 === 'V' || (c0 === 'Q' && bc === 'Q9') || (!num(r.bldgarea) && lu === 9)) {
    use = 'vacant'; family = 'vacant'; floors = 0;
    if (worstOwner.test(owner) || bc === 'Q9' || lu === 9) { lot.trees = 3; bits.push('open lot / garden'); }
  } else if (c0 === 'M') { use = 'church'; family = 'church'; storefront = 'church'; floors = Math.min(Math.max(floors || 3, 2), 3); if (ctx.wburg) bits.push('shul'); }
  else if (c0 === 'W' || c0 === 'I' || c0 === 'N') { use = 'school'; storefront = 'daycare'; floors = Math.max(floors || 3, 2); }
  else if (industrial) {
    use = 'garage'; storefront = 'warehouse'; floors = Math.min(Math.max(floors || 2, 1), 3);
    if (/PFIZER/.test(owner)) bits.push('the old pharma plant (parody: Phizer-Dyne Labs)');
  } else if (c0 === 'K' || c0 === 'S' || bc === 'C7' || bc === 'D7' || c0 === 'O' || ['H', 'J', 'P'].includes(c0) || lu === 5 || lu === 4 || retail) {
    use = 'mixed'; storefront = pick(ctx.wburg ? KINDS_WBURG : ctx.avenue ? KINDS_AVENUE : KINDS_STREET, hash(r.bbl)); floors = Math.max(floors || 2, 1);
    bits.push('shop kind is a stand-in (PLUTO has no business type)');
  } else { use = 'residential'; floors = floors || (c0 === 'D' ? 6 : c0 === 'C' ? 4 : 3); }
  if (use !== 'vacant') floors = Math.min(7, Math.max(1, floors));
  if (use === 'residential' || use === 'mixed') {
    const h = hash(`${r.bbl}f`);
    if (year >= 1990) family = use === 'residential' ? 'newBuild' : 'brickPainted';
    else if (ctx.wburg) family = h < 0.5 ? 'brickRed' : h < 0.85 ? 'brickTan' : 'brickPainted';
    else if (year && year < 1900) family = h < 0.55 ? 'brownstone' : h < 0.9 ? 'brickRed' : 'limestone';
    else if (year && year < 1940) family = h < 0.25 ? 'brownstone' : h < 0.7 ? 'brickRed' : h < 0.9 ? 'brickTan' : 'limestone';
    else family = h < 0.5 ? 'brickTan' : h < 0.9 ? 'brickRed' : 'brickPainted';
    if (year >= 1940 && (c0 === 'D' || owner.includes('HOUSING AUTH'))) family = 'brickTan';
    if (ctx.wburg && use === 'residential' && floors >= 4) { family = family === 'newBuild' ? 'newBuild' : family; }
  }
  if (use === 'garage') family = hash(`${r.bbl}w`) < 0.6 ? 'brickTan' : 'brickRed';
  if (use === 'residential' || use === 'mixed') {
    lot.cornice = year && year < 1880 ? 'bracketed' : year && year < 1925 ? 'plain' : 'none';
    const rowClass = ['A', 'B', 'C', 'S'].includes(c0) || bc === 'R3';
    lot.stoop = use === 'residential' && rowClass && floors >= 2 && widthFt * FT <= 12 && (!year || year < 1940) && family !== 'newBuild' && !(ctx.wburg && floors >= 4);
    if (ctx.wburg && use === 'residential' && floors >= 4) lot.stoop = false; // walk-up apartment houses: no stoop, the lobby door is at grade (apartment builder)
  }
  if (use === 'garage') lot.cornice = 'none';
  const bd = num(r.bldgdepth) * FT;
  if (use !== 'vacant' && bd >= 9 && bd <= 40) lot.depthM = round1(bd);
  if (use === 'garage') lot.depthM = round1(Math.min(30, Math.max(18, bd || 24)));
  lot.floors = use === 'vacant' ? 0 : floors;
  lot.use = use;
  if (family) lot.family = family;
  if (storefront) lot.storefront = storefront;
  if (!widthFt) lot.confidence = 'M';
  if (use !== 'vacant' && use !== 'garage' && !lot.trees && hash(`${r.bbl}t`) < 0.25 && !ctx.industrialFace) lot.trees = 1;
  const venue = VENUES.get(venueKey(r.address));
  if (venue && use !== 'vacant' && use !== 'church') { lot.use = 'mixed'; lot.storefront = venue.storefront; lot.sign = venue.parody_name; lot.stoop = false; lot.floors = Math.max(2, lot.floors); }
  lot.note = `[WBURG] ${bits.join(' · ')} · ${floors} fl`;
  return lot;
}

const fillerLot = (w, avenueFace, seed, ctx) => {
  const h = hash(seed);
  if (ctx.industrialFace) return { widthM: round1(w), floors: 2, family: h < 0.5 ? 'brickTan' : 'brickRed', use: 'garage', storefront: 'warehouse', cornice: 'none', depthM: 24, confidence: 'L', note: '[WBURG] filler: no PLUTO lot placed on this stretch (warehouse stand-in)' };
  return { widthM: round1(w), floors: ctx.wburg ? 4 : avenueFace ? 4 : 3, family: h < 0.45 ? 'brickRed' : h < 0.85 ? 'brickTan' : 'brickPainted', use: 'residential', stoop: !avenueFace && !ctx.wburg, cornice: 'plain', confidence: 'L', note: '[WBURG] filler: no PLUTO lot placed on this stretch' };
};

// ---- blocks (game): row -1 = myrtle..hart ... row -4 = wallabout..flushing, columns 0..4 = tompkins..malcolmx
const faces = [];
const report = [];
for (let br = 0; br < 4; br++) {
  const row = -4 + br; // r-4 .. r-1
  const nStreet = ROWS[br], sStreet = ROWS[br + 1];
  for (let col = 0; col < 5; col++) {
    const wId = AVE[col], eId = AVE[col + 1];
    const blockLen = (GAME_Z[sStreet] - HALF[sStreet] - SIDEW[sStreet]) - (GAME_Z[nStreet] + HALF[nStreet] + SIDEW[nStreet]);
    const wburg = row === -4;
    // lots of this block
    const items = [];
    let project = false; // a housing-authority superblock (PLUTO class D, > 60 000 sq ft) centred in this block: towers in lawns on all four faces
    for (const r of rows) {
      if (num(r.lotarea) < 60000 || !(r.bldgclass ?? '').startsWith('D')) continue;
      const xw = aveLine[wId](r.Z), xe = aveLine[eId](r.Z);
      if (r.X > xw && r.X <= xe && r.Z > ZLINE[nStreet](r.X) && r.Z <= ZLINE[sStreet](r.X)) project = true;
    }
    for (const r of rows) {
      const xw = aveLine[wId](r.Z), xe = aveLine[eId](r.Z);
      if (r.X <= xw || r.X > xe) continue;
      const zN = ZLINE[nStreet](r.X), zS = ZLINE[sStreet](r.X);
      if (!(r.Z > zN && r.Z <= zS)) continue;
      const u = (r.X - xw) / (xe - xw), v = (r.Z - zN) / (zS - zN);
      const dists = { N: v * blockLen, S: (1 - v) * blockLen, W: u * COL_LEN, E: (1 - u) * COL_LEN };
      const side = Object.keys(dists).sort((a, b) => dists[a] - dists[b])[0];
      if (dists[side] > REACH) continue;
      items.push({ r, side, u, v });
    }
    for (const side of ['N', 'S', 'E', 'W']) {
      const ewFace = side === 'N' || side === 'S';
      const streetId = side === 'N' ? nStreet : side === 'S' ? sStreet : side === 'E' ? eId : wId;
      const from = ewFace ? wId : nStreet, to = ewFace ? eId : sStreet;
      const key = `${streetId}|${side}|${from}|${to}`;
      const faceLen = ewFace ? COL_LEN : blockLen;
      const list = items.filter((i) => i.side === side)
        // authoring order is from -> to: west to east on N/S faces, north to south on E/W faces
        .sort((a, b) => (ewFace ? a.u - b.u : a.v - b.v));
      // one condo building can appear as many lots (same address): keep it once
      const seen = new Set();
      const uniq = list.filter(({ r }) => { const k = r.address; if (seen.has(k)) return false; seen.add(k); return true; });
      const avFace = !ewFace || ['myrtle', 'park', 'flushing'].includes(streetId);
      const industrialFace = streetId === 'flushing' || (row === -3 && side === 'N') || (row === -4 && side === 'S');
      const ctx = { wburg: wburg && streetId !== 'flushing', avenue: avFace, industrialFace: false };
      const flushingCtx = { ...ctx, wburg: false, industrialFace: false };
      const lots = [];
      let total = 0;
      const faceCtx = streetId === 'flushing' ? flushingCtx : ctx;
      for (const { r } of uniq) {
        const lot = mkLot(r, faceCtx);
        // very wide lots (plants, superblocks, parking) become equal pieces of at most 40 m
        const n = Math.max(1, Math.ceil(lot.widthM / 40));
        for (let k = 0; k < n; k++) { lots.push({ ...lot, widthM: round1(lot.widthM / n) }); total += lot.widthM / n; }
      }
      // thin the sample so it fits the face (the game block is shorter than the real band): deterministic by address
      const room = ewFace ? COL_LEN - 34 : faceLen; // N/S faces lose the two corner lots' depth (capped at 16 m below); the schema rescales up to 1.25x
      let kept = lots;
      if (total > room) {
        const p = room / total;
        kept = lots.filter((l, i) => hash(`${key}${i}${l.note}`) < p);
        let acc = 0;
        kept = kept.filter((l) => { acc += l.widthM; return acc <= room; });
      }
      // pad the rest with filler (the schema pads too, this keeps the lot kinds right for the face)
      let sum = kept.reduce((s, l) => s + l.widthM, 0);
      let k = 0;
      if (project && uniq.length < 6) {
        kept = []; sum = 0; k = 0;
        while (sum < (ewFace ? COL_LEN - 40 : faceLen - 6) && k < 40) {
          const tower = k % 2 === 0;
          const w = tower ? 30 : 14 + hash(`${key}lawn${k}`) * 6;
          if (sum + w > (ewFace ? COL_LEN - 36 : faceLen - 1)) break;
          kept.push(tower
            ? { widthM: round1(w), floors: 6 + (hash(`${key}h${k}`) < 0.4 ? 1 : 0), family: 'brickTan', use: 'residential', stoop: false, cornice: 'none', depthM: 14, confidence: 'M', note: '[WBURG] public-housing tower (PLUTO class D superblock in this block)' }
            : { widthM: round1(w), floors: 0, family: 'vacant', use: 'vacant', trees: 2, confidence: 'M', note: '[WBURG] lawn between towers (PLUTO class D superblock)' });
          sum += w; k++;
        }
      }
      while (sum < (ewFace ? COL_LEN - 40 : faceLen * 0.9) && k < 80) { const w = ewFace ? 6 : 5.5; kept.push(fillerLot(w, avFace, `${key}fill${k}`, { wburg: faceCtx.wburg, industrialFace: streetId === 'flushing' })); sum += w; k++; }
      // corner lots of E/W faces set the insets of the N/S faces: keep them shallow
      if (!ewFace && kept.length) for (const i of [0, kept.length - 1]) if (kept[i].depthM === undefined || kept[i].depthM > 16) kept[i].depthM = 16;
      if (!ewFace) { let tot = kept.reduce((a, l) => a + l.widthM, 0); while (tot > faceLen - 0.5 && kept.length > 2) { tot -= kept[kept.length - 2].widthM; kept.splice(kept.length - 2, 1); } }
      const real = uniq.length;
      report.push({ key, real, out: kept.length, filler: k });
      faces.push({ street: streetId, side, from, to, note: `[WBURG] PLUTO lots for this face (${real} placed, ${kept.length} used; filler where the real band is shorter)`, confidence: real ? 'M' : 'L', lots: kept });
    }
  }
}
// one stable order: by block row then column then side, matching the grid build order
// splice the faces onto the end of bedstuy.json's faces array in its one-lot-per-line style (idempotent: earlier [WBURG] faces are cut first)
const TARGET = path.join(ROOT, 'src/world/data/bedstuy.json');
let text = fs.readFileSync(TARGET, 'utf8');
const END = '\n    }\n  ],\n  "geo": {';
const first = text.indexOf('"note": "[WBURG] PLUTO lots for this face');
if (first >= 0) { const start = text.lastIndexOf('\n    {', first); text = text.slice(0, start - 1) + text.slice(text.indexOf(END) + "\n    }".length); }
const emit = (f) => {
  const head = `    {\n      "street": ${JSON.stringify(f.street)}, "side": ${JSON.stringify(f.side)}, "from": ${JSON.stringify(f.from)}, "to": ${JSON.stringify(f.to)}, "note": ${JSON.stringify(f.note)}, "confidence": ${JSON.stringify(f.confidence)},\n      "lots": [\n`;
  return head + f.lots.map((l) => `        ${JSON.stringify(l)}`).join(',\n') + '\n      ]\n    }';
};
const at = text.indexOf(END);
if (at < 0) throw new Error('faces array end not found');
text = text.slice(0, at + '\n    }'.length) + ',\n' + faces.map(emit).join(',\n') + text.slice(at + '\n    }'.length);
fs.writeFileSync(TARGET, text);
JSON.parse(text);
const totalLots = faces.reduce((s, f) => s + f.lots.length, 0);
console.log(`faces ${faces.length}, lots ${totalLots}`);
for (const r of report) console.log(r.key.padEnd(50), String(r.real).padStart(3), '->', String(r.out).padStart(3), 'filler', r.filler);
