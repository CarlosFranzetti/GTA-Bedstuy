// one-off generator for the faces section of bedstuy.json
import { it } from 'vitest';
import fs from 'node:fs';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { faceKeyOf, lotsForFace, loadFaces, resolveLot } from '@/world/data/schema';
import type { LotSpec, RawLot, StorefrontKind } from '@/world/data/schema';
import type { BlockFace } from '@/world/types';

const PATH = '/home/user/GTA-Bedstuy/src/world/data/bedstuy.json';
type Pin = { at: 'from' | 'to' | number; lot: RawLot };
const P = (at: Pin['at'], lot: RawLot): Pin => ({ at, lot: { confidence: 'L', ...lot } });
const SF: Record<string, StorefrontKind> = {
  bodega: 'bodega', laundromat: 'laundromat', barbershop: 'barber', braiding: 'braiding', caribbean: 'caribbean', chinese: 'chinese',
  pizza: 'pizza', liquor: 'liquor', dollar: 'dollar', pharmacy: 'pharmacy', daycare: 'daycare', funeral: 'funeral', autorepair: 'autorepair',
};
const pins = new Map<string, Pin[]>();
const notes = new Map<string, string>();
const addPin = (blockId: string, side: string, pin: Pin): void => {
  const k = `${blockId}|${side}`;
  pins.set(k, [...(pins.get(k) ?? []), pin]);
};
const CHURCH: RawLot = { widthM: 13, use: 'church', family: 'church', floors: 3, storefront: 'church', stoop: true, cornice: 'none' };

it('generate faces', () => {
  const data = JSON.parse(fs.readFileSync(PATH, 'utf8')) as Record<string, unknown> & { pois: Array<Record<string, unknown>> };
  delete data.faces;
  delete data.schemaVersion;
  const grid = buildGrid(loadBedstuyData());

  for (const poi of data.pois) {
    const side = poi.face as string;
    const t = poi.t as number;
    const at = side === 'N' || side === 'E' ? 1 - t : t;
    const arch = poi.archetype as string;
    const base: RawLot = { confidence: 'M', sign: poi.sign as string, awningColor: poi.awningColor as string, note: `POI ${poi.id as string} (game placement, parody)` };
    let lot: RawLot;
    if (arch === 'church') lot = { ...base, ...CHURCH };
    else if (arch === 'condo') lot = { ...base, widthM: 14, use: 'residential', family: 'newBuild', floors: 6, stoop: false, cornice: 'none', bays: 6 };
    else if (arch === 'autorepair') lot = { ...base, widthM: 14, use: 'garage', family: 'brickPainted', floors: 1, storefront: 'autorepair' };
    else lot = { ...base, use: 'mixed', family: arch === 'daycare' ? 'brickTan' : 'brickRed', floors: arch === 'pizza' || arch === 'dollar' ? 3 : 4, storefront: SF[arch] };
    addPin(poi.block as string, side, { at: Number(at.toFixed(3)), lot });
  }

  // Throop Ave, west side of the avenue (block col 0, E faces)
  addPin('r0c0', 'E', P('from', { use: 'mixed', family: 'brickTan', floors: 4, storefront: 'deli', note: 'Hart & Throop corner: bus stop here per a listing (R2); deli is a typology guess' }));
  addPin('r1c0', 'E', P(0.78, { ...CHURCH, note: 'a church on Throop in this stretch (R2, 79th Pct directory lists three); exact lot inferred' }));
  addPin('r3c0', 'E', P(0.35, { ...CHURCH, note: 'second Throop church (R2); exact lot inferred' }));
  addPin('r3c0', 'E', P(0.72, { use: 'vacant', family: 'vacant', floors: 0, widthM: 9, note: 'vacant lot, typology: a few per avenue face' }));
  addPin('r4c0', 'E', P('from', { use: 'mixed', family: 'brickTan', floors: 5, storefront: 'restaurant', note: 'Van Buren corner, typology' }));
  // Throop Ave, east side (block col 1, W faces)
  addPin('r0c1', 'W', P('from', { use: 'mixed', family: 'brickRed', floors: 4, storefront: 'bodega', note: 'Hart & Throop corner store, typology' }));
  addPin('r0c1', 'W', P(0.45, { use: 'vacant', family: 'vacant', floors: 0, widthM: 10, note: 'vacant lot, typology' }));
  addPin('r1c1', 'W', P('to', { use: 'mixed', family: 'brickTan', floors: 4, storefront: 'cellphone', note: 'Kosciuszko & Throop corner, typology' }));
  addPin('r2c1', 'W', P('from', { use: 'mixed', family: 'brickRed', floors: 5, storefront: 'deli', note: 'Kosciuszko & Throop corner, typology' }));
  addPin('r4c1', 'W', P('from', { use: 'mixed', family: 'brickPainted', floors: 4, storefront: 'restaurant', note: 'Van Buren & Throop corner, typology' }));
  // Kosciuszko St
  addPin('r1c0', 'S', P(0.62, { ...CHURCH, note: 'Crossover Baptist at 358 Kosciuszko (R2 L); block inferred' }));
  addPin('r1c1', 'S', P(0.55, { use: 'vacant', family: 'vacant', floors: 0, widthM: 8, note: '289 Kosciuszko: vacant lot for over a decade, 4-storey filing in 2018 (R2 M vacancy, L block)' }));
  addPin('r2c0', 'N', P(0.3, { use: 'residential', family: 'brownstone', floors: 4, scaffold: true, note: 'sidewalk shed, typology: facade work on a rowhouse' }));
  addPin('r2c1', 'N', P(0.1, { widthM: 28, depthM: 22, use: 'school', family: 'brickTan', floors: 3, stoop: false, cornice: 'plain', bays: 8, storefront: 'daycare', note: 'Public School 79 stood on Kosciuszko near Throop (1907 record, R2); current use unknown' }));
  // Other streets (R2 pass-2 anchors; blocks are mostly inferred, so lot confidence stays L unless noted)
  addPin('r1c0', 'E', P(0.4, { use: 'residential', family: 'newBuild', floors: 5, stoop: false, cornice: 'none', note: '277 Throop: 2016 five-storey 8-unit filing (R2 M filing, L block)' }));
  addPin('r1c1', 'W', P(0.55, { use: 'mixed', family: 'brickTan', floors: 3, storefront: 'daycare', note: 'day care listed at 268 Throop (R2 L)' }));
  addPin('r0c1', 'W', P('to', { use: 'residential', family: 'brickTan', floors: 3, stoop: true, cornice: 'bracketed', confidence: 'M', note: 'Throop/Pulaski corner: 330 Throop, Second Empire built before 1873, not landmarked (R2 M); corner side inferred' }));
  addPin('r1c0', 'W', P('to', { widthM: 12, use: 'church', family: 'church', floors: 3, storefront: 'church', stoop: true, cornice: 'none', note: 'former St. Ambrose parish house at Tompkins & Kosciuszko (R2 L)' }));
  addPin('r2c1', 'E', P(0.25, { ...CHURCH, note: 'Bethany Baptist church at 460 Marcus Garvey (R2 M address, L block)' }));
  addPin('r2c1', 'E', P(0.6, { use: 'residential', family: 'newBuild', floors: 5, stoop: false, cornice: 'none', note: 'new building permitted at 488 Marcus Garvey in 2019 (R2); lot inferred' }));
  addPin('r3c1', 'E', P('to', { use: 'vacant', family: 'vacant', floors: 0, widthM: 14, note: '10,000 sq ft corner lot at Van Buren & Marcus Garvey for redevelopment (R2 L, possibly vacant)' }));
  addPin('r4c1', 'S', P(0.9, { ...CHURCH, widthM: 14, note: 'church on Greene, typology (the landmark Antioch Baptist, 828 Greene, is east of this grid per R2 C1)' }));
  addPin('r4c1', 'S', P(0.35, { use: 'residential', family: 'brownstone', floors: 3, trees: 1, confidence: 'M', note: '677 Greene: 1899 three-family brownstone, tree-lined (R2 M build, L block)' }));
  addPin('r4c0', 'S', P(0.4, { use: 'residential', family: 'brownstone', floors: 3, cornice: 'bracketed', confidence: 'M', note: '620 Greene: c.1872 Second Empire, Tompkins-Throop, not landmarked (R2 M)' }));
  addPin('r4c0', 'S', P(0.7, { use: 'residential', family: 'newBuild', floors: 4, stoop: false, cornice: 'none', note: '650 Greene: 2022 four-storey filing (R2 L)' }));
  addPin('r3c1', 'S', P(0.4, { use: 'residential', family: 'brickRed', floors: 3, cornice: 'bracketed', confidence: 'M', note: '127 Van Buren: Queen Anne row, Throop-Marcus Garvey (R2 M; floors L)' }));
  addPin('r3c0', 'S', P(0.5, { use: 'residential', family: 'brownstone', floors: 3, confidence: 'M', note: '64 Van Buren: two-unit brownstone, 1901, Tompkins-Throop (R2 M)' }));
  addPin('r4c0', 'N', P(0.5, { use: 'vacant', family: 'vacant', floors: 0, widthM: 24, trees: 2, note: 'Hattie Carthan Herban Farm open space between Tompkins and Throop (R2 L, street unknown)' }));
  addPin('r1c0', 'N', P(0.4, { use: 'residential', family: 'newBuild', floors: 4, stoop: false, cornice: 'none', note: '197 Pulaski: 2023 four-storey seven-unit filing (R2 M filing, L vacancy/block)' }));
  addPin('r0c0', 'N', P(0.5, { use: 'residential', family: 'newBuild', floors: 3, stoop: false, cornice: 'none', note: '173 Hart: 2004 three-storey infill (R2 L)' }));
  addPin('r0c1', 'N', P(0.5, { use: 'residential', family: 'brickTan', floors: 4, note: '226 Hart: pre-war four-storey (R2 L)' }));

  notes.set('hart', 'Hart St: late-19th-century neo-Grec rowhouses, 3-4 floors (R2, typology M, floors L)');
  notes.set('pulaski', 'Pulaski St: rowhouses; Grace Baptist Church at 83 Pulaski (R2 M, exact face unknown)');
  notes.set('kosciuszko', 'Kosciuszko St: rowhouses and small apartment buildings, 3-4 floors (R2 L)');
  notes.set('lafayette', 'Lafayette Ave: avenue rowhouses and walk-ups, 3-5 floors; the magnolia landmark is west of this grid (R2)');
  notes.set('vanburen', 'Van Buren St: rowhouses and small walk-ups, 3-4 floors (R2 L)');
  notes.set('greene', 'Greene Ave: private brownstone and rowhouse blocks, 3-4 floors, 1890s rows (R2 M)');
  notes.set('throop', 'Throop Ave: churches and storefront ground floors over rowhouses or walk-ups, 3-6 floors (R2 M church / L shops)');
  notes.set('garvey', 'Marcus Garvey Blvd: wider avenue frontage, churches, rows, some newer residential, 3-6 floors (R2 M)');
  notes.set('tompkins', 'Tompkins Ave: not sampled by R2, typology default');

  const faces: unknown[] = [];
  for (const block of grid.blocks) {
    for (const bf of block.faces) {
      const key = faceKeyOf(grid, bf as BlockFace)!;
      const [street, side, from, to] = key.split('|');
      const fp = (pins.get(`${block.id}|${side}`) ?? []).map((p) => ({ at: p.at, lot: p.lot }));
      const set = loadFaces({ streets: grid.streets, faces: [{ street, side, from, to, pins: fp }] });
      const placed = lotsForFace(grid, bf as BlockFace, set);
      const lots = side === 'N' || side === 'E' ? placed.slice().reverse() : placed;
      const avenueFace = side === 'E' || side === 'W' || ['lafayette', 'greene'].includes(street);
      let carry = 0;
      const rw = lots.map((l) => { const w = Math.round((l.widthM + carry) * 10) / 10; carry += l.widthM - w; return w; });
      const strip = (l: LotSpec, i: number): Record<string, unknown> => {
        const min: RawLot = { widthM: rw[i], use: l.use, family: l.family, floors: l.floors };
        if (l.storefront) min.storefront = l.storefront;
        const defS = resolveLot(min, { avenue: avenueFace });
        const o: Record<string, unknown> = { widthM: rw[i], floors: l.floors, family: l.family, use: l.use };
        if (l.storefront) o.storefront = l.storefront;
        for (const k of ['stoop', 'stoopHeightM', 'cornice', 'bays', 'trees', 'scaffold', 'depthM'] as const) {
          if (k === 'stoopHeightM' && !l.stoop) continue;
          if (l[k] !== defS[k]) o[k] = l[k];
        }
        o.confidence = l.confidence;
        if (l.note) o.note = l.note;
        if (l.sign) o.sign = l.sign;
        if (l.awningColor) o.awningColor = l.awningColor;
        return o;
      };
      const entry: Record<string, unknown> = { street, side, from, to };
      if (notes.get(street)) entry.note = notes.get(street);
      entry.confidence = 'L';
      entry.lots = lots.map(strip);
      faces.push(entry);
    }
  }

  const head = JSON.stringify({ name: data.name, seed: data.seed, schemaVersion: 2, streets: data.streets, pois: data.pois }, null, 2);
  const fmtFace = (f: Record<string, unknown>): string => {
    const { lots, ...rest } = f as { lots: Array<Record<string, unknown>> } & Record<string, unknown>;
    const restTxt = Object.entries(rest).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(', ');
    return `    {\n      ${restTxt},\n      "lots": [\n${lots.map((l) => `        ${JSON.stringify(l)}`).join(',\n')}\n      ]\n    }`;
  };
  const out = head.replace(/\n\}$/, `,\n  "faces": [\n${faces.map((f) => fmtFace(f as Record<string, unknown>)).join(',\n')}\n  ]\n}`) + '\n';
  fs.writeFileSync(PATH, out);
});
