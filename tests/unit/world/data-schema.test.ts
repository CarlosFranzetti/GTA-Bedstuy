import { describe, it, expect } from 'vitest';
import raw from '@/world/data/bedstuy.json';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { dist } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import {
  CONFIDENCES, FAMILIES, STOREFRONTS, STOREFRONT_TO_ARCHETYPE, SchemaError, USES,
  applyPins, checkAgainstGrid, cornerInsets, emptyFaceSet, faceFor, faceKeyOf, fitLots, generateFaceLots, loadFaces,
  lotsForBlock, lotsForFace, migrateV1, resolveLot, schemaVersionOf, validateAgainstGrid, validateFaces, validateLot,
} from '@/world/data/schema';
import type { RawLot } from '@/world/data/schema';

const json = raw as unknown as Record<string, unknown> & { streets: unknown[]; faces: Array<Record<string, unknown>> };
const grid = buildGrid(loadBedstuyData());
const faces = loadFaces(json);

/** minimal valid explicit lot */
const lot = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ widthM: 6, floors: 3, family: 'brownstone', use: 'residential', confidence: 'M', ...over });
/** a v2 json with the real streets and one face carrying `lots` */
const withFace = (face: Record<string, unknown>): Record<string, unknown> => ({ schemaVersion: 2, streets: json.streets, faces: [{ street: 'throop', side: 'E', from: 'hart', to: 'pulaski', ...face }] });

describe('real bedstuy.json (schema v2)', () => {
  it('declares schemaVersion 2 and validates with zero errors', () => {
    expect(json.schemaVersion).toBe(2);
    expect(schemaVersionOf(json)).toBe(2);
    expect(validateFaces(json)).toEqual([]);
    expect(validateAgainstGrid(grid, faces)).toEqual([]);
  });

  it('has an entry for every one of the 40 block faces, none unmatched', () => {
    const res = checkAgainstGrid(grid, faces);
    expect(res.missing).toEqual([]);
    expect(res.unmatched).toEqual([]);
    expect(faces.faces).toHaveLength(40);
    for (const b of grid.blocks) for (const f of b.faces) expect(faceFor(faces, grid, f)).toBeDefined();
  });

  it('every lot has floors, family and use inside the enums and a confidence tag', () => {
    let n = 0;
    for (const f of faces.faces) {
      expect(f.lots.length).toBeGreaterThan(5);
      for (const l of f.lots) {
        n++;
        expect(Number.isInteger(l.floors)).toBe(true);
        expect(l.floors).toBeGreaterThanOrEqual(0);
        expect(l.floors).toBeLessThanOrEqual(8);
        if (l.use !== 'vacant') expect(l.floors).toBeGreaterThanOrEqual(1);
        expect(FAMILIES).toContain(l.family);
        expect(USES).toContain(l.use);
        expect(CONFIDENCES).toContain(l.confidence);
        if (l.use === 'mixed') expect(STOREFRONTS).toContain(l.storefront);
        expect(l.widthM).toBeGreaterThanOrEqual(3);
        expect(l.widthM).toBeLessThanOrEqual(40);
      }
    }
    expect(n).toBeGreaterThan(700);
  });

  it('Throop and Kosciuszko faces carry the curated anchors', () => {
    const throop = faces.faces.filter((f) => f.street === 'throop');
    const kosc = faces.faces.filter((f) => f.street === 'kosciuszko');
    expect(throop).toHaveLength(10);
    expect(kosc).toHaveLength(4);
    const all = (list: typeof throop) => list.flatMap((f) => f.lots);
    expect(all(throop).filter((l) => l.use === 'church').length).toBeGreaterThanOrEqual(2);
    expect(all(throop).some((l) => l.storefront === 'laundromat')).toBe(true);
    expect(all(throop).some((l) => l.storefront === 'bodega')).toBe(true);
    expect(all(kosc).some((l) => l.use === 'school')).toBe(true);
    expect(all(kosc).some((l) => l.use === 'vacant')).toBe(true);
    expect(all(kosc).some((l) => l.scaffold)).toBe(true);
    // street rows are mostly 3-4 storey residential with stoops
    const rows = all(kosc).filter((l) => l.use === 'residential');
    expect(rows.length / all(kosc).length).toBeGreaterThan(0.6);
    expect(rows.filter((l) => l.floors >= 3 && l.floors <= 4).length / rows.length).toBeGreaterThan(0.7);
    expect(rows.filter((l) => l.stoop).length / rows.length).toBeGreaterThan(0.7);
  });
});

describe('validator rejects bad data with path-qualified messages', () => {
  const bad = (lotOver: Record<string, unknown>, needle: string): void => {
    const issues = validateFaces(withFace({ lots: [lot(lotOver)] }));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join('\n')).toContain('faces[0].lots[0]');
    expect(issues.join('\n')).toContain(needle);
    expect(() => loadFaces(withFace({ lots: [lot(lotOver)] }))).toThrow(SchemaError);
  };

  it('floors outside 1-8 (0 only for vacant)', () => {
    bad({ floors: 9 }, 'floors');
    bad({ floors: -1 }, 'floors');
    bad({ floors: 0 }, 'floors');
    bad({ floors: 3.5 }, 'floors');
    expect(validateFaces(withFace({ lots: [lot({ floors: 0, use: 'vacant', family: 'vacant' })] }))).toEqual([]);
  });
  it('widthM outside 3-40 or missing', () => {
    bad({ widthM: 2.9 }, 'widthM');
    bad({ widthM: 41 }, 'widthM');
    bad({ widthM: 'wide' }, 'widthM');
    bad({ widthM: undefined }, 'widthM: required');
  });
  it('unknown enums', () => {
    bad({ family: 'granite' }, 'family');
    bad({ use: 'casino' }, 'use');
    bad({ storefront: 'sushi', use: 'mixed' }, 'storefront');
    bad({ cornice: 'ornate' }, 'cornice');
    bad({ confidence: 'Z' }, 'confidence');
  });
  it('missing confidence on an explicit lot', () => {
    bad({ confidence: undefined }, 'confidence: required');
  });
  it('unknown fields, wrong types, inconsistent combinations', () => {
    bad({ floor: 3 }, 'floor: unknown field');
    bad({ stoop: 'yes' }, 'stoop');
    bad({ scaffold: 1 }, 'scaffold');
    bad({ trees: 4 }, 'trees');
    bad({ bays: -1 }, 'bays');
    bad({ storefront: 'bodega', use: 'residential' }, 'storefront');
    bad({ use: 'vacant', family: 'brownstone', floors: 0 }, 'family');
    bad({ stoop: false, stoopHeightM: 1.5 }, 'stoopHeightM');
  });
  it('face-level problems', () => {
    expect(validateFaces({ faces: 'nope' })[0]).toContain('faces');
    expect(validateFaces(withFace({ side: 'Q' })).join()).toContain('faces[0].side');
    expect(validateFaces(withFace({ from: 'hart', to: 'hart' })).join()).toContain('from and to must differ');
    expect(validateFaces(withFace({ street: 'atlantis' })).join()).toContain('unknown street');
    expect(validateFaces(withFace({ typology: 'skyscraper' })).join()).toContain('typology');
    expect(validateFaces(withFace({ from: 'hart', to: 'kosciuszko' })).join()).toContain('adjacent');
    expect(validateFaces(withFace({ from: 'pulaski', to: 'hart' })).join()).toContain('adjacent');
    expect(validateFaces(withFace({ side: 'N' })).join()).toContain('east-west');
    expect(validateFaces(withFace({ pins: [{ at: 1.5, lot: {} }] })).join()).toContain('pins[0].at');
    expect(validateFaces(withFace({ colour: 'red' })).join()).toContain('colour: unknown field');
    expect(validateFaces({ schemaVersion: 3 }).join()).toContain('schemaVersion');
    const dup = { schemaVersion: 2, streets: json.streets, faces: [withFace({}).faces, withFace({}).faces].flat() };
    expect(validateFaces(dup).join()).toContain('duplicate face');
  });
  it('lot rows longer than the face (+1 m) are rejected against the grid', () => {
    const j = withFace({ lots: Array.from({ length: 20 }, () => lot({ widthM: 6 })) }); // 120 m on an 83 m face
    const set = loadFaces(j);
    const issues = validateAgainstGrid(grid, set);
    expect(issues.join()).toContain('lot widths sum to 120.0 m');
    const ok = loadFaces(withFace({ lots: Array.from({ length: 13 }, () => lot({ widthM: 6 })) })); // 78 m
    expect(validateAgainstGrid(grid, ok)).toEqual([]);
  });
  it('validateLot is usable standalone', () => {
    expect(validateLot(lot(), 'x', true)).toEqual([]);
    expect(validateLot(5, 'x', true)).toEqual(['x: expected an object']);
  });
});

describe('defaults', () => {
  it('a bare face loads and resolves every field', () => {
    const set = loadFaces(withFace({}));
    const def = set.faces[0];
    expect(def.lots).toEqual([]);
    expect(def.seed).toBe(0);
    expect(def.confidence).toBe('L');
    expect(def.note).toBe('');
  });
  it('resolveLot fills missing fields consistently', () => {
    const s = resolveLot({ widthM: 6 }, { avenue: false });
    expect(s).toMatchObject({ widthM: 6, floors: 3, family: 'brownstone', use: 'residential', stoop: true, stoopHeightM: 1.5, cornice: 'bracketed', bays: 3, trees: 0, scaffold: false, confidence: 'L', note: '' });
    expect(s.storefront).toBeUndefined();
    expect(resolveLot({ widthM: 6 }, { avenue: true }).floors).toBe(4);
    const mixed = resolveLot({ widthM: 8, use: 'mixed' }, { avenue: true });
    expect(mixed).toMatchObject({ storefront: 'generic', stoop: false, stoopHeightM: 0, family: 'brickRed', cornice: 'plain', floors: 4 });
    expect(resolveLot({ widthM: 9, storefront: 'bodega' }, { avenue: true }).use).toBe('mixed');
    const vac = resolveLot({ widthM: 9, use: 'vacant' }, { avenue: true });
    expect(vac).toMatchObject({ floors: 0, family: 'vacant', stoop: false, bays: 0, cornice: 'none' });
    const ch = resolveLot({ widthM: 13, family: 'church' }, { avenue: false });
    expect(ch).toMatchObject({ use: 'church', storefront: 'church', stoop: true, cornice: 'none' });
    expect(resolveLot({ widthM: 6, stoop: false }, { avenue: false }).stoopHeightM).toBe(0);
    expect(resolveLot({ widthM: 6, family: 'limestone', stoop: true, stoopHeightM: 2 }, { avenue: false }).stoopHeightM).toBe(2);
  });
  it('explicit lots in a face are resolved by loadFaces', () => {
    const set = loadFaces(withFace({ lots: [{ widthM: 7, confidence: 'H', floors: 4 }] }));
    expect(set.faces[0].lots[0]).toMatchObject({ widthM: 7, floors: 4, use: 'residential', family: 'brownstone', confidence: 'H', stoop: true, cornice: 'bracketed', bays: 3 });
  });
  it('v1 files (no faces) still load; migration adds schemaVersion 2', () => {
    const v1 = { name: 'x', seed: 1, streets: json.streets, pois: [] };
    expect(schemaVersionOf(v1)).toBe(1);
    expect(loadFaces(v1).faces).toEqual([]);
    expect(() => loadFaces(undefined)).toThrow(SchemaError);
    const m = migrateV1(v1);
    expect(m.schemaVersion).toBe(2);
    expect(m.faces).toEqual([]);
    expect(validateFaces(m)).toEqual([]);
    expect(validateFaces({ ...v1, schemaVersion: 1, faces: [] }).join()).toContain('schemaVersion 1');
    // and the grid still lays out every face from typology defaults
    const lots = lotsForBlock(grid, 'r1c1', loadFaces(v1));
    expect(lots.length).toBeGreaterThan(30);
    expect(lots.every((l) => !l.fromData)).toBe(true);
  });
  it('every storefront kind maps to a frozen Archetype', () => {
    for (const k of STOREFRONTS) expect(typeof STOREFRONT_TO_ARCHETYPE[k]).toBe('string');
    expect(STOREFRONT_TO_ARCHETYPE.barber).toBe('barbershop');
  });
});

describe('lotsForFace', () => {
  it('lot widths plus insets equal the face length on all 40 faces (within 1e-6 m)', () => {
    for (const b of grid.blocks) {
      for (const f of b.faces) {
        const lots = lotsForFace(grid, f, faces);
        const total = dist(f.a, f.b);
        const sum = lots.reduce((s, l) => s + l.widthM, 0);
        const ins = cornerInsets(grid, f, faces);
        if (f.side === 'E' || f.side === 'W') expect(sum).toBeCloseTo(total, 6);
        else {
          expect(ins.a).toBeGreaterThan(8);
          expect(ins.b).toBeGreaterThan(8);
          expect(sum + ins.a + ins.b).toBeCloseTo(total, 6);
        }
        expect(lots.length).toBeGreaterThan(5);
        for (const l of lots) expect(l.widthM).toBeGreaterThan(2.5);
      }
    }
  });

  it('lots are contiguous, ordered a -> b, start at the inset, and carry ids like LotSubdivider', () => {
    for (const b of grid.blocks) {
      for (const f of b.faces) {
        const lots = lotsForFace(grid, f, faces);
        const ins = cornerInsets(grid, f, faces);
        expect(dist(f.a, lots[0].frontA)).toBeCloseTo(ins.a, 6);
        expect(dist(f.b, lots[lots.length - 1].frontB)).toBeCloseTo(ins.b, 6);
        lots.forEach((l, i) => {
          expect(l.id).toBe(`${f.blockId}-${f.side}-${i}`);
          expect(l.index).toBe(i);
          expect(dist(l.frontA, l.frontB)).toBeCloseTo(l.widthM, 6);
          if (i > 0) expect(dist(lots[i - 1].frontB, l.frontA)).toBeLessThan(1e-9);
          expect(l.outward).toEqual(f.outward);
        });
      }
    }
  });

  it('data order is from -> to: the first authored lot ends up at the matching end of the face', () => {
    // r0c0 E (throop, hart -> pulaski): authoring starts at hart (north); E face a = SE (south), so reversed
    const bf = grid.blockById('r0c0').faces.find((f) => f.side === 'E')!;
    const def = faceFor(faces, grid, bf)!;
    expect(def.from).toBe('hart');
    const lots = lotsForFace(grid, bf, faces);
    expect(lots[0].cornerStreetId).toBe('pulaski');
    expect(lots[lots.length - 1].cornerStreetId).toBe('hart');
    expect(lots[lots.length - 1].storefront).toBe(def.lots[0].storefront); // authored first lot = north corner (deli pin)
    expect(lots[0].widthM).toBeCloseTo(def.lots[def.lots.length - 1].widthM, 1);
    // W face is authored in the same direction as a -> b
    const wf = grid.blockById('r1c1').faces.find((f) => f.side === 'W')!;
    const wd = faceFor(faces, grid, wf)!;
    const wl = lotsForFace(grid, wf, faces);
    expect(wl[0].storefront).toBe(wd.lots[0].storefront);
    expect(wl[0].cornerStreetId).toBe('pulaski');
  });

  it('corner info: E/W faces flag their two end lots with the cross street; N/S faces have none', () => {
    for (const b of grid.blocks) {
      for (const f of b.faces) {
        const lots = lotsForFace(grid, f, faces);
        const corners = lots.filter((l) => l.corner);
        if (f.side === 'E' || f.side === 'W') {
          expect(corners).toHaveLength(2);
          expect(corners[0].cornerEnd).toBe('a');
          expect(corners[1].cornerEnd).toBe('b');
          expect(corners[0].cornerStreetId).toBeTruthy();
          expect(corners[0].cornerStreetId).not.toBe(corners[1].cornerStreetId);
        } else expect(corners).toHaveLength(0);
      }
    }
  });

  it('is deterministic: same inputs give identical output, with and without data', () => {
    const f = grid.blockById('r2c0').faces[0];
    expect(lotsForFace(grid, f, faces)).toEqual(lotsForFace(grid, f, faces));
    const empty = emptyFaceSet();
    const a = lotsForFace(grid, f, empty);
    const b = lotsForFace(grid, f, empty);
    expect(a).toEqual(b);
    expect(a.every((l) => !l.fromData)).toBe(true);
    // a different world seed gives a different default row
    const other = { ...grid, seed: 7 } as typeof grid;
    expect(lotsForFace(other, f, empty).map((l) => l.widthM)).not.toEqual(a.map((l) => l.widthM));
    // loading twice gives the same structure
    expect(loadFaces(json)).toEqual(loadFaces(json));
  });

  it('data lots are marked fromData; widths stay close to the authored ones (scale within a few percent)', () => {
    const bf = grid.blockById('r1c0').faces.find((f) => f.side === 'S')!;
    const def = faceFor(faces, grid, bf)!;
    const lots = lotsForFace(grid, bf, faces);
    expect(lots).toHaveLength(def.lots.length);
    expect(lots.every((l) => l.fromData)).toBe(true);
    for (let i = 0; i < lots.length; i++) expect(Math.abs(lots[i].widthM / def.lots[i].widthM - 1)).toBeLessThan(0.06);
  });

  it('typology faces: pins override single lots; sparse faces still fill the block', () => {
    const j = withFace({ typology: 'avenueMixed', pins: [{ at: 0.5, lot: { use: 'church', family: 'church', floors: 3, widthM: 13, confidence: 'M' } }, { at: 'from', lot: { use: 'mixed', storefront: 'pharmacy' } }] });
    const set = loadFaces(j);
    const bf = grid.blockById('r0c0').faces.find((f) => f.side === 'E')!;
    const lots = lotsForFace(grid, bf, set);
    expect(lots.some((l) => l.use === 'church')).toBe(true);
    // 'from' = north end = last lot on an E face
    expect(lots[lots.length - 1].storefront).toBe('pharmacy');
    expect(lots.reduce((s, l) => s + l.widthM, 0)).toBeCloseTo(dist(bf.a, bf.b), 6);
    expect(faceKeyOf(grid, bf)).toBe('throop|E|hart|pulaski');
  });

  it('lotsForBlock returns all four faces; N/S lots clear the corner buildings', () => {
    const lots = lotsForBlock(grid, 'r2c0', faces);
    const bySide = (s: string) => lots.filter((l) => l.side === s);
    expect(bySide('E').length).toBeGreaterThan(5);
    expect(bySide('W').length).toBeGreaterThan(5);
    expect(bySide('N').length).toBeGreaterThan(20);
    expect(bySide('S').length).toBeGreaterThan(20);
    const block = grid.blockById('r2c0');
    const ew = lotsForFace(grid, block.faces.find((f) => f.side === 'E')!, faces);
    const north = bySide('N');
    expect(north[0].offsetM).toBeCloseTo(ew[ew.length - 1].depthM, 6);
  });

  it('works on a hand-built grid with no street list (falls back to typology defaults)', () => {
    const fake = {
      seed: 5,
      blocks: [],
      streets: [],
      blockById: () => { throw new Error('nope'); },
      streetById: (id: string) => ({ id, class: 'street' }),
    } as unknown as typeof grid;
    const face = grid.blockById('r0c0').faces.find((f) => f.side === 'S')!;
    const lots = lotsForFace(fake, face, faces);
    expect(lots.length).toBeGreaterThan(20);
    expect(lots.reduce((s, l) => s + l.widthM, 0)).toBeCloseTo(dist(face.a, face.b), 6);
  });
});

describe('fitLots / generators', () => {
  const ctx = { avenue: false };
  const mk = (n: number, w: number) => Array.from({ length: n }, () => resolveLot({ widthM: w }, ctx));
  it('scales a slightly-off row to the exact length', () => {
    const { lots } = fitLots(mk(10, 6), 66, ctx);
    expect(lots.reduce((s, l) => s + l.widthM, 0)).toBeCloseTo(66, 9);
    expect(lots[0].widthM).toBeCloseTo(6.6, 3);
  });
  it('drops trailing lots when the data is far too long, pads with filler when far too short', () => {
    const long = fitLots(mk(30, 6), 90, ctx);
    expect(long.lots.length).toBeLessThan(30);
    expect(long.lots.reduce((s, l) => s + l.widthM, 0)).toBeCloseTo(90, 9);
    const short = fitLots(mk(5, 6), 90, ctx);
    expect(short.lots.length).toBeGreaterThan(5);
    expect(short.synthesised.slice(0, 5).every((x) => !x)).toBe(true);
    expect(short.synthesised.slice(5).every((x) => x)).toBe(true);
    expect(short.lots.reduce((s, l) => s + l.widthM, 0)).toBeCloseTo(90, 9);
    expect(fitLots([], 50, ctx).lots).toEqual([]);
    expect(fitLots(mk(3, 6), 0, ctx).lots).toEqual([]);
  });
  it('does not mutate its input', () => {
    const input = mk(4, 6);
    const copy = JSON.parse(JSON.stringify(input));
    fitLots(input, 30, ctx);
    expect(input).toEqual(copy);
  });
  it('generateFaceLots is deterministic, sums exactly, and follows the typology', () => {
    const a = generateFaceLots(228, 'streetRow', new Rng(11), false, false);
    const b = generateFaceLots(228, 'streetRow', new Rng(11), false, false);
    expect(a).toEqual(b);
    expect(a.reduce((s, l) => s + l.widthM, 0)).toBeCloseTo(228, 6);
    expect(a.length).toBeGreaterThan(30);
    expect(generateFaceLots(228, 'streetRow', new Rng(12), false, false)).not.toEqual(a);
    const ave = generateFaceLots(83, 'avenueMixed', new Rng(3), true, true);
    expect(ave[0].use).toBe('mixed');
    expect(ave[ave.length - 1].use).toBe('mixed');
    expect(ave.filter((l) => l.use === 'mixed').length / ave.length).toBeGreaterThan(0.4);
    expect(ave[0].floors).toBeGreaterThanOrEqual(3);
  });
  it('typology statistics: street rows are 3-4 storey residential, avenues are taller and mixed', () => {
    const rows = generateFaceLots(2280, 'streetRow', new Rng(99), false, false);
    const res = rows.filter((l) => l.use === 'residential');
    expect(res.length / rows.length).toBeGreaterThan(0.8);
    expect(res.filter((l) => l.floors === 3 || l.floors === 4).length / res.length).toBeGreaterThan(0.8);
    expect(rows.filter((l) => l.use === 'vacant').length / rows.length).toBeLessThan(0.1);
    const ave = generateFaceLots(2280, 'avenueMixed', new Rng(99), false, true);
    const avg = (xs: { floors: number }[]) => xs.reduce((s, l) => s + l.floors, 0) / xs.length;
    expect(avg(ave.filter((l) => l.use === 'mixed'))).toBeGreaterThan(avg(res));
  });
  it('applyPins merges by position and re-resolves dependent defaults', () => {
    const base = generateFaceLots(80, 'streetRow', new Rng(1), false, false);
    const pinned = applyPins(base, [{ at: 'to', lot: { use: 'vacant' } }, { at: 0, lot: { note: 'first' } }], { avenue: false });
    expect(pinned[pinned.length - 1]).toMatchObject({ use: 'vacant', family: 'vacant', floors: 0 });
    expect(pinned[0].note).toBe('first');
    expect(pinned[0].family).toBe(base[0].family);
    expect(base[base.length - 1].use).not.toBe(undefined); // input untouched
    const rl: RawLot = { widthM: 6 };
    expect(rl.widthM).toBe(6);
  });
});

describe('faces.ts entry point', () => {
  it('getBedstuyFaces caches the validated real data; faceSpecResolver yields rows or null', async () => {
    const { getBedstuyFaces, faceSpecResolver, allLots } = await import('@/world/data/faces');
    expect(getBedstuyFaces()).toBe(getBedstuyFaces());
    expect(getBedstuyFaces().faces).toHaveLength(40);
    const resolve = faceSpecResolver(grid);
    const rows = resolve('r1c1', 'W')!;
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[0].id).toBe('r1c1-W-0');
    expect(resolve('r9c9', 'W')).toBeNull();
    const all = allLots(grid);
    expect(all.length).toBeGreaterThan(700);
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    expect(all.filter((l) => l.fromData).length).toBe(all.length);
  });
});
