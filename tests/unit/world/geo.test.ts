import { describe, it, expect } from 'vitest';
import raw from '@/world/data/bedstuy.json';
import rawText from '@/world/data/bedstuy.json?raw';
import sampleText from '../../fixtures/osm-sample.geojson?raw';
import { buildGrid } from '@/world/Grid';
import type { BedstuyData } from '@/world/types';
import { loadFaces, validateAgainstGrid, validateFaces } from '@/world/data/schema';
import {
  AUTO_NOTE, IMPORT_MARK, MAX_LOT_M, MIN_VACANT_M, ORIGIN_LATLON,
  addressKey, assignFootprint, buildFaceFrames, deriveLot, fitBearing, fitBearingAlongStreet, formatBedstuyJson, importBlocks,
  isProtected, layoutFace, makeProjection, mergeFace, parseCsv, parseFeatures, parseLatLon, parsePluto, ringCentroid, streetKey,
} from '@/world/data/geo';
import type { LatLon, LotJson, StreetLite } from '@/world/data/geo';

const json = raw as unknown as Record<string, unknown> & { streets: StreetLite[]; faces: Array<Record<string, unknown>> };
const frames = buildFaceFrames(json.streets);
const sample = parseFeatures(sampleText, 'osm-sample.geojson');
const lot = (over: Partial<LotJson> = {}): LotJson => ({ widthM: 6, floors: 3, use: 'residential', confidence: 'L', ...over });

describe('projection', () => {
  it('maps the origin to (0,0) and north to -z at bearing 0', () => {
    const p = makeProjection(ORIGIN_LATLON, 0);
    const o = p.toGrid(ORIGIN_LATLON);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.z).toBeCloseTo(0, 6);
    const north = p.toLatLon({ x: 0, z: -100 });
    expect(north.lat).toBeGreaterThan(ORIGIN_LATLON.lat);
    expect(north.lon).toBeCloseTo(ORIGIN_LATLON.lon, 9);
    const east = p.toGrid({ lat: ORIGIN_LATLON.lat, lon: ORIGIN_LATLON.lon + 0.001 });
    expect(east.x).toBeGreaterThan(80);
    expect(east.x).toBeLessThan(90); // 0.001 deg lon at 40.7 N is about 84 m
    expect(Math.abs(east.z)).toBeLessThan(1e-6);
  });

  it('round-trips grid -> lat/lon -> grid for several bearings', () => {
    for (const b of [0, 28.5, -17, 44.9]) {
      const p = makeProjection(ORIGIN_LATLON, b);
      for (const g of [{ x: 0, z: 0 }, { x: 250, z: -200 }, { x: -240, z: 295 }, { x: 11.3, z: -108.5 }]) {
        const back = p.toGrid(p.toLatLon(g));
        expect(back.x).toBeCloseTo(g.x, 6);
        expect(back.z).toBeCloseTo(g.z, 6);
      }
    }
  });

  it('the bearing rotates the grid: 100 m along the bearing is straight "up" the grid', () => {
    const b = 30;
    const p = makeProjection(ORIGIN_LATLON, b);
    const kLat = 6371008.8 * (Math.PI / 180);
    const kLon = kLat * Math.cos(ORIGIN_LATLON.lat * (Math.PI / 180));
    const ll: LatLon = { lat: ORIGIN_LATLON.lat + (100 * Math.cos(b * Math.PI / 180)) / kLat, lon: ORIGIN_LATLON.lon + (100 * Math.sin(b * Math.PI / 180)) / kLon };
    const g = p.toGrid(ll);
    expect(g.x).toBeCloseTo(0, 4);
    expect(g.z).toBeCloseTo(-100, 4);
  });

  it('parses "lat,lon" and rejects nonsense', () => {
    expect(parseLatLon('40.6935, -73.942')).toEqual({ lat: 40.6935, lon: -73.942 });
    expect(() => parseLatLon('here')).toThrow();
    expect(() => parseLatLon('95,10')).toThrow();
  });
});

describe('bearing fit', () => {
  const rings = sample.filter((f) => f.ring).map((f) => f.ring as LatLon[]);
  it('recovers the arbitrary bearing the fixture was rotated by (28.5 deg)', () => {
    const fit = fitBearing(rings);
    expect(fit.bearingDeg).toBeCloseTo(28.5, 0);
    expect(fit.strength).toBeGreaterThan(0.95);
    const near = fitBearingAlongStreet(rings, ORIGIN_LATLON, 0, 45);
    expect(near.bearingDeg).toBeCloseTo(28.5, 0);
  });
  it('is 0 / zero-strength without data', () => {
    expect(fitBearing([])).toEqual({ bearingDeg: 0, strength: 0, edges: 0 });
  });
  it('a square footprint aligned to north fits ~0', () => {
    const p = makeProjection(ORIGIN_LATLON, 0);
    const sq = [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 15 }, { x: 0, z: 15 }].map((g) => p.toLatLon(g));
    expect(Math.abs(fitBearing([sq]).bearingDeg)).toBeLessThan(0.01);
  });
});

describe('face frames', () => {
  it('derive the same 180 faces the data file describes (40 original + 60 east, B1 + 80 north, WBURG)', () => {
    expect(frames).toHaveLength(180);
    const dataKeys = json.faces.map((f) => `${String(f.street)}|${String(f.side)}|${String(f.from)}|${String(f.to)}`).sort();
    expect(frames.map((f) => f.key).sort()).toEqual(dataKeys);
  });
  it('lengths and building lines match Grid.ts', () => {
    const grid = buildGrid(json as unknown as BedstuyData);
    for (const block of grid.blocks) {
      for (const bf of block.faces) {
        const fr = frames.find((f) => f.blockId === block.id && f.side === bf.side);
        expect(fr).toBeDefined();
        const len = Math.hypot(bf.b.x - bf.a.x, bf.b.z - bf.a.z);
        expect(fr!.length).toBeCloseTo(len, 6);
        const line = fr!.alongAxis === 'x' ? bf.a.z : bf.a.x;
        expect(fr!.lineCoord).toBeCloseTo(line, 6);
      }
    }
  });
});

describe('face assignment', () => {
  const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const hartN = frames.find((f) => f.key === 'hart|N|throop|garvey')!;
  it('puts a building behind the north building line on the N face with its position along the face', () => {
    const a = assignFootprint(frames, json.streets, rect(hartN.s0 + 40, hartN.lineCoord, hartN.s0 + 46.5, hartN.lineCoord + 13))!;
    expect(a.frame.key).toBe('hart|N|throop|garvey');
    expect(a.s0).toBeCloseTo(40, 6);
    expect(a.s1).toBeCloseTo(46.5, 6);
    expect(a.depthM).toBeCloseTo(13, 6);
  });
  it('puts a building on the avenue frontage on the E/W face, measured north -> south', () => {
    const f = frames.find((x) => x.key === 'throop|E|hart|pulaski')!;
    const a = assignFootprint(frames, json.streets, rect(f.lineCoord - 14, f.s0 + 20, f.lineCoord, f.s0 + 28))!;
    expect(a.frame.key).toBe('throop|E|hart|pulaski');
    expect(a.s0).toBeCloseTo(20, 6);
    expect(a.s1 - a.s0).toBeCloseTo(8, 6);
  });
  it('ignores footprints in the roadway or off the grid', () => {
    expect(assignFootprint(frames, json.streets, rect(-3, -150, 3, -140))).toBeNull(); // on Throop itself
    expect(assignFootprint(frames, json.streets, rect(1100, 0, 1110, 10))).toBeNull(); // east of Malcolm X Blvd
  });
  it('lets addr:street break the tie at a corner, and normalises street names', () => {
    // near the NE corner of the Hart/Throop block: closer to the N building line, but addressed on Throop
    const f = frames.find((x) => x.key === 'throop|E|hart|pulaski')!;
    const corner = rect(f.lineCoord - 12, f.s0 + 14, f.lineCoord - 3, f.s0 + 21);
    expect(assignFootprint(frames, json.streets, corner, 'Throop Avenue')!.frame.street).toBe('throop');
    expect(streetKey('Marcus Garvey Boulevard')).toBe(streetKey('MARCUS GARVEY BLVD.'));
    expect(streetKey('Kosciusko Street')).toBe('kosciuszko st');
  });
});

describe('tags -> lot', () => {
  it('floors: levels, else height / 3.1, else PLUTO, else default (M)', () => {
    expect(deriveLot({ building: 'house', 'building:levels': '4' }, 6, 13, undefined, 'way/1')).toMatchObject({ floorsFrom: 'levels', lot: { floors: 4, confidence: 'H' } });
    expect(deriveLot({ building: 'yes', height: '12.4' }, 6, 13, undefined, 'way/1')).toMatchObject({ floorsFrom: 'height', lot: { floors: 4, confidence: 'H' } });
    const p = { address: '1 X St', numFloors: 5 };
    expect(deriveLot({ building: 'yes' }, 6, 13, p, 'way/1')).toMatchObject({ floorsFrom: 'pluto', lot: { floors: 5, confidence: 'H' } });
    expect(deriveLot({ building: 'yes' }, 6, 13, undefined, 'way/1', 3)).toMatchObject({ floorsFrom: 'default', lot: { floors: 3, confidence: 'M' } });
    expect(deriveLot({ building: 'yes', 'building:levels': '20' }, 6, 13, undefined, 'way/1').lot.floors).toBe(8);
  });
  it('use: shop/amenity -> mixed with a storefront, worship -> church, parking -> garage, PLUTO land use', () => {
    expect(deriveLot({ building: 'yes', shop: 'convenience' }, 6, 13, undefined, 'x').lot).toMatchObject({ use: 'mixed', storefront: 'bodega' });
    expect(deriveLot({ building: 'yes', amenity: 'restaurant', cuisine: 'chinese' }, 6, 13, undefined, 'x').lot).toMatchObject({ use: 'mixed', storefront: 'chinese' });
    expect(deriveLot({ building: 'retail' }, 6, 13, undefined, 'x').lot).toMatchObject({ use: 'mixed', storefront: 'generic' });
    expect(deriveLot({ building: 'church' }, 12, 15, undefined, 'x').lot).toMatchObject({ use: 'church', family: 'church', storefront: 'church' });
    expect(deriveLot({ building: 'yes', amenity: 'place_of_worship' }, 12, 15, undefined, 'x').lot.use).toBe('church');
    expect(deriveLot({ building: 'garage' }, 6, 8, undefined, 'x').lot).toMatchObject({ use: 'garage' });
    expect(deriveLot({ building: 'yes' }, 6, 13, { address: '', landUse: '04' }, 'x').lot).toMatchObject({ use: 'mixed', storefront: 'generic' });
    expect(deriveLot({ building: 'yes' }, 6, 13, { address: '', landUse: '01', yearBuilt: 2005 }, 'x').lot.family).toBe('newBuild');
  });
  it('writes a source note that begins with the import marker and names the OSM id', () => {
    const l = deriveLot({ building: 'yes', 'building:levels': '3', 'addr:housenumber': '12', 'addr:street': 'Throop Avenue' }, 6, 13, undefined, 'way/42').lot;
    expect(l.note?.startsWith(IMPORT_MARK)).toBe(true);
    expect(l.note).toContain('way/42');
    expect(l.note).toContain('12 Throop Avenue');
  });
});

describe('PLUTO', () => {
  const csv = 'Address,BBL,YearBuilt,LandUse,NumFloors,BldgClass,ZipCode\r\n"442 THROOP AVENUE",3017770001,1899,4,3.5,S2,11221\n"12 Hart St",3017770002,2004,1,3,A4,11206\n';
  it('parses quoted CSV and joins by normalised address', () => {
    expect(parseCsv('a,"b,c","d""e"\n1,2,3')).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
    const m = parsePluto(csv);
    expect(m.size).toBe(2);
    const row = m.get(addressKey('442', 'Throop Ave'))!;
    expect(row).toMatchObject({ yearBuilt: 1899, landUse: '04', numFloors: 3.5, bldgClass: 'S2' });
    expect(m.get(addressKey('12', 'HART STREET'))?.yearBuilt).toBe(2004);
    expect(() => parsePluto('Foo,Bar\n1,2')).toThrow(/Address/);
  });
});

describe('face layout (width scaling, gaps)', () => {
  const it0 = (s0: number, s1: number) => ({ s0, s1, lot: lot({ widthM: s1 - s0 }), ref: 'r' });
  it('trims overlaps, absorbs small gaps, turns big gaps into vacant lots, drops sheds', () => {
    const l = layoutFace([it0(0, 6.4), it0(6, 12), it0(13, 19), it0(19 + MIN_VACANT_M + 1, 30), it0(30, 31.5)]);
    expect(l.skippedTooNarrow).toBe(1);
    expect(l.vacantGaps).toBe(1);
    const w = l.items.map((i) => i.lot.widthM);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(30, 0);
    for (let i = 1; i < l.items.length; i++) expect(l.items[i].s0).toBeCloseTo(l.items[i - 1].s1, 6);
    expect(l.items.find((i) => i.lot.use === 'vacant')?.lot.floors).toBe(0);
  });
  it('splits a footprint wider than the schema allows into equal lots', () => {
    const l = layoutFace([it0(0, 70)]);
    expect(l.split).toBe(1);
    expect(l.items).toHaveLength(2);
    for (const i of l.items) expect(i.lot.widthM).toBeLessThanOrEqual(MAX_LOT_M);
  });
  it('widths of the imported fixture lots equal the footprint extents along the face', () => {
    const res = importBlocks(json, sample);
    const r = res.faces.find((f) => f.key === 'hart|N|throop|garvey')!;
    expect(r.items.length).toBeGreaterThan(25);
    const total = r.items.reduce((a, i) => a + i.lot.widthM, 0);
    const span = r.items[r.items.length - 1].s1 - r.items[0].s0;
    expect(Math.abs(total - span)).toBeLessThan(0.1 * r.items.length); // 0.1 m rounding per lot at most
    expect(span).toBeLessThanOrEqual(r.lengthM);
  });
});

describe('merge semantics', () => {
  const frame = { side: 'N' as const, length: 100 };
  const imp = (s0: number, s1: number, over: Partial<LotJson> = {}) => ({ s0, s1, lot: lot({ widthM: s1 - s0, confidence: 'H', note: `${IMPORT_MARK} way/${s0}`, floors: 5, ...over }) });
  const existing = (): LotJson[] => [
    lot({ widthM: 20, family: 'brickRed', stoop: false, trees: 1 }),
    lot({ widthM: 20, note: 'user screenshot: green door', confidence: 'M', family: 'limestone' }),
    lot({ widthM: 30, note: 'typology default: vacant lot', use: 'vacant', floors: 0, family: 'vacant' }),
    lot({ widthM: 10, note: 'W2 density pass: x' }),
  ];
  const importedRow = [imp(15, 35), imp(35, 55), imp(55, 85)];

  it('classifies protected lots', () => {
    expect(isProtected(lot())).toBe(false);
    expect(isProtected(lot({ note: 'typology default: a church on this face' }))).toBe(false);
    expect(AUTO_NOTE.test('filler: face data shorter')).toBe(true);
    expect(isProtected(lot({ note: 'Crossover Baptist at 358 Kosciuszko' }))).toBe(true);
    expect(isProtected(lot({ confidence: 'M' }))).toBe(true);
    expect(isProtected(lot({ note: `${IMPORT_MARK} way/1`, confidence: 'H' }))).toBe(false);
  });

  it('keeps hand-edited lots and replaces the rest; imported lots inherit style', () => {
    const { lots, stats } = mergeFace(existing(), importedRow, frame, false);
    expect(stats.kept).toBe(1);
    expect(lots.some((l) => l.note === 'user screenshot: green door' && l.family === 'limestone')).toBe(true);
    expect(lots.filter((l) => l.note?.startsWith(IMPORT_MARK)).length).toBe(2);
    const first = lots.find((l) => l.note?.includes('way/15'))!;
    expect(first.floors).toBe(5); // OSM wins on what it knows ...
    expect(first.family).toBe('brickRed'); // ... style comes from the lot it replaced
    expect(first.trees).toBe(1);
  });

  it('--overwrite replaces everything and inherits nothing', () => {
    const { lots, stats } = mergeFace(existing(), importedRow, frame, true);
    expect(stats.kept).toBe(0);
    expect(lots.every((l) => l.note?.startsWith(IMPORT_MARK))).toBe(true);
    expect(lots.some((l) => l.family === 'brickRed')).toBe(false);
  });

  it('a face with no imported footprints is returned untouched', () => {
    const { lots } = mergeFace(existing(), [], frame, false);
    expect(lots).toEqual(existing());
  });

  it('a hand note that starts with an address pins the lot to that footprint', () => {
    const ex = [lot({ widthM: 50, note: '12 Throop: my uncle lived here', confidence: 'M' }), lot({ widthM: 50 })];
    const items = [imp(60, 70, { note: `${IMPORT_MARK} way/1 · 3 fl · 10 Throop Avenue` }), imp(70, 80, { note: `${IMPORT_MARK} way/2 · 3 fl · 12 Throop Avenue` })];
    const { lots } = mergeFace(ex, items, frame, false);
    expect(lots).toHaveLength(2);
    expect(lots[0].note?.startsWith(`${IMPORT_MARK} way/1`)).toBe(true);
    expect(lots[1].note?.startsWith('12 Throop: my uncle')).toBe(true);
  });
});

describe('importBlocks on the fixture', () => {
  const res = importBlocks(json, sample);
  it('assigns every synthetic footprint and fits the bearing', () => {
    expect(res.totals.outside).toBe(0);
    expect(res.totals.buildings).toBe(40);
    expect(res.bearingDeg).toBeCloseTo(28.5, 0);
    expect(res.originIsDefault).toBe(true);
    expect(res.faces.map((f) => f.key).sort()).toEqual(['hart|N|throop|garvey', 'throop|E|hart|pulaski']);
  });
  it('produces lots with H (levels/height) and M (defaulted) confidence and source notes', () => {
    expect(res.totals.importedH).toBeGreaterThan(30);
    expect(res.totals.importedM).toBeGreaterThan(0);
    const face = (res.json.faces as Array<Record<string, unknown>>).find((f) => f.street === 'throop' && f.side === 'E' && f.from === 'hart')!;
    const lots = face.lots as LotJson[];
    expect(lots.some((l) => l.use === 'church' && l.note?.includes('synthetic/'))).toBe(true);
    expect(lots.some((l) => l.use === 'mixed' && l.storefront)).toBe(true);
    expect(lots.some((l) => l.use === 'vacant' && l.floors === 0)).toBe(true);
    for (const l of lots.filter((x) => x.note?.startsWith(IMPORT_MARK))) expect(['H', 'M']).toContain(l.confidence);
  });
  it('validates with 0 errors against the schema and the real grid', () => {
    expect(validateFaces(res.json)).toEqual([]);
    const set = loadFaces(res.json);
    expect(set.faces).toHaveLength(180);
    expect(validateAgainstGrid(buildGrid(res.json as unknown as BedstuyData), set)).toEqual([]);
  });
  it('leaves the other 98 faces and the input object untouched', () => {
    const before = JSON.stringify(json.faces.filter((f) => !(f.street === 'throop' && f.side === 'E' && f.from === 'hart') && !(f.street === 'hart' && f.side === 'N' && f.from === 'throop')));
    const after = JSON.stringify((res.json.faces as Array<Record<string, unknown>>).filter((f) => !(f.street === 'throop' && f.side === 'E' && f.from === 'hart') && !(f.street === 'hart' && f.side === 'N' && f.from === 'throop')));
    expect(after).toBe(before);
    expect(JSON.stringify(json)).toBe(JSON.stringify(JSON.parse(rawText)));
  });
  it('hand-written notes survive (curated Throop/Hart anchors are kept)', () => {
    const face = (res.json.faces as Array<Record<string, unknown>>).find((f) => f.street === 'throop' && f.side === 'E' && f.from === 'hart')!;
    const notes = (face.lots as LotJson[]).map((l) => l.note ?? '');
    expect(notes.some((n) => n.includes('bus stop here per a listing'))).toBe(true);
  });
  it('--overwrite drops them', () => {
    const o = importBlocks(json, sample, { overwrite: true });
    const face = (o.json.faces as Array<Record<string, unknown>>).find((f) => f.street === 'throop' && f.side === 'E' && f.from === 'hart')!;
    expect((face.lots as LotJson[]).every((l) => l.note?.startsWith(IMPORT_MARK))).toBe(true);
    expect(validateFaces(o.json)).toEqual([]);
  });
  it('is deterministic and records provenance', () => {
    expect(JSON.stringify(importBlocks(json, sample).json)).toBe(JSON.stringify(res.json));
    const geoBlock = res.json.geo as { origin: { note: string }; attribution: string };
    expect(geoBlock.origin.note).toMatch(/approximate, verify/);
    expect(geoBlock.attribution).toMatch(/OpenStreetMap contributors, ODbL/);
  });
  it('PLUTO fills floors and land use for footprints without OSM levels', () => {
    const hartFace = (res.json.faces as Array<Record<string, unknown>>).find((f) => f.street === 'hart' && f.side === 'N' && f.from === 'throop')!;
    const victim = (hartFace.lots as LotJson[]).find((l) => /way\/|synthetic\//.test(l.note ?? '') && /fl \(levels\) · \d+ Hart Street/.test(l.note ?? ''))!;
    const num = /· (\d+) Hart Street/.exec(victim.note ?? '')![1];
    const feats = sample.map((f) => ({ ...f, tags: { ...f.tags } }));
    const target = feats.find((f) => f.tags['addr:housenumber'] === num && f.tags['addr:street'] === 'Hart Street')!;
    delete target.tags['building:levels'];
    const pluto = parsePluto(`Address,YearBuilt,LandUse,NumFloors,BldgClass\n${num} Hart Street,1901,2,6,C1\n`);
    const r = importBlocks(json, feats, { pluto });
    expect(r.totals.plutoHits).toBe(1);
    const face = (r.json.faces as Array<Record<string, unknown>>).find((f) => f.street === 'hart' && f.side === 'N' && f.from === 'throop')!;
    const l = (face.lots as LotJson[]).find((x) => x.note?.includes(`${num} Hart Street`))!;
    expect(l.floors).toBe(6);
    expect(l.confidence).toBe('H');
    expect(l.note).toContain('built 1901');
  });
});

describe('readers and serializer', () => {
  it('reads Overpass JSON with geometry, with node refs, and relations', () => {
    const doc = {
      elements: [
        { type: 'node', id: 1, lat: 40.6, lon: -73.9 }, { type: 'node', id: 2, lat: 40.6, lon: -73.8999 }, { type: 'node', id: 3, lat: 40.6001, lon: -73.8999 },
        { type: 'node', id: 9, lat: 40.6, lon: -73.9, tags: { shop: 'convenience' } },
        { type: 'way', id: 10, nodes: [1, 2, 3, 1], tags: { building: 'yes' } },
        { type: 'way', id: 11, geometry: [{ lat: 40.6, lon: -73.9 }, { lat: 40.6, lon: -73.8999 }, { lat: 40.6001, lon: -73.8999 }, { lat: 40.6, lon: -73.9 }], tags: { building: 'house' } },
        { type: 'relation', id: 12, tags: { building: 'yes' }, members: [{ role: 'outer', geometry: [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }, { lat: 2, lon: 2 }] }] },
      ],
    };
    const f = parseFeatures(JSON.stringify(doc));
    expect(f.map((x) => x.id)).toEqual(['node/9', 'way/10', 'way/11', 'relation/12']);
    expect(f[1].ring).toHaveLength(3); // closing node dropped
    expect(f[0].point).toEqual({ lat: 40.6, lon: -73.9 });
    expect(() => parseFeatures('{"hello":1}')).toThrow(/neither Overpass/);
    expect(() => parseFeatures('nope')).toThrow(/not valid JSON/);
  });
  it('bedstuy.json round-trips byte-identically through formatBedstuyJson', () => {
    expect(formatBedstuyJson(JSON.parse(rawText))).toBe(rawText);
  });
  it('centroid of a rectangle is its middle', () => {
    expect(ringCentroid([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 0, z: 2 }])).toEqual({ x: 2, z: 1 });
  });
});
