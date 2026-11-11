import { describe, it, expect } from 'vitest';
import provenance from '@/world/data/facade-observed.provenance.json';
import type { ColourwayInput } from '@/world/buildings/colourway';
import { lotColourway, applyObserved } from '@/world/buildings/colourway';
import { observedFacade, parseObserved, FAMILY_FOR_OBSERVED, OBSERVED_MATERIALS } from '@/world/data/facadeObserved';
import observedJson from '@/world/data/facade-observed.json';
import { specFromData } from '@/world/LotSubdivider';
import { validateLot } from '@/world/data/schema';
import type { LotSpec as DataLotSpec } from '@/world/data/schema';
import { scaleForDbh, treeStyleFor, STREET_TREE_STATS, SPECIES_CLASSES } from '@/world/data/streetTrees';

const table = { '3015850001': '8a4a3c:1:80:2f6f4f', '3015850002': 'd8d2c4:3:30', '3015850003': 'zzzzzz:1:80' };

describe('facade observed data format', () => {
  it('parses wall, material, quality and awning', () => {
    const o = parseObserved('8a4a3c:1:80:2f6f4f')!;
    expect(o.wall).toEqual([0x8a, 0x4a, 0x3c]);
    expect(o.material).toBe('redBrick');
    expect(o.quality).toBeCloseTo(0.8);
    expect(o.awning).toEqual([0x2f, 0x6f, 0x4f]);
    expect(parseObserved('nope')).toBeNull();
    expect(parseObserved('8a4a3c:99:80')).toBeNull();
  });
  it('applies the quality bar and ignores missing or malformed lots', () => {
    expect(observedFacade('3015850001', table)).not.toBeNull();
    expect(observedFacade('3015850002', table)).toBeNull(); // q 0.30 < 0.45
    expect(observedFacade('3015850003', table)).toBeNull();
    expect(observedFacade('3015859999', table)).toBeNull();
    expect(observedFacade(undefined, table)).toBeNull();
  });
  it('the shipped file is well formed, keyed by 10-digit BBL, and every material class maps to a family', () => {
    for (const [bbl, rec] of Object.entries(observedJson.lots as Record<string, string>)) {
      expect(bbl).toMatch(/^\d{10}$/);
      expect(parseObserved(rec), bbl).not.toBeNull();
    }
    for (const m of OBSERVED_MATERIALS) expect(FAMILY_FOR_OBSERVED[m]).toBeTruthy();
  });
  it('the provenance sidecar names a photo, author and licence for every observed lot', () => {
    const side = provenance as unknown as { lots: Record<string, { author: string; licence: string; url: string }[]> };
    for (const bbl of Object.keys(observedJson.lots)) {
      expect(side.lots[bbl]?.length, bbl).toBeGreaterThan(0);
      for (const p of side.lots[bbl]) { expect(p.author).toBeTruthy(); expect(p.licence).toMatch(/CC|public/i); expect(p.url).toMatch(/^https:/); }
    }
  });
});

describe('observed override of the colourway', () => {
  const lot = { id: 'r1c1-N-3', spec: { family: 'brick', floors: 3, use: 'residential', stoop: { present: true, heightM: 1.4 } } } as unknown as ColourwayInput;
  const base = lotColourway(lot);
  it('leaves a lot without observations exactly as the procedural colourway', () => {
    expect(lotColourway({ ...lot, spec: { ...lot.spec!, bbl: '3000000001' } })).toEqual(base);
    expect(applyObserved(base, undefined)).toBe(base);
  });
  it('replaces only wall colour, kind, paint and (when seen) awning', () => {
    const cw = applyObserved(base, '3015850001', table);
    expect(cw.front).toEqual([0x8a, 0x4a, 0x3c]);
    expect(cw.id).toBe('observed:redBrick');
    expect(cw.awning[0]).toEqual([0x2f, 0x6f, 0x4f]);
    expect(cw.awning[1]).toEqual(base.awning[1]);
    // every other procedural look is untouched
    expect({ ...cw, id: '', kind: 0, paint: 0, front: base.front, awning: base.awning }).toEqual({ ...base, id: '', kind: 0, paint: 0 });
    expect(applyObserved(base, '3015850002', table)).toBe(base); // below the quality bar
  });
  it('maps every observed material onto a drawable family', () => {
    const d = { widthM: 6, floors: 3, family: 'brickRed', stoop: true, stoopHeightM: 1.4, cornice: 'plain', bays: 0, use: 'residential', trees: 0, scaffold: false, depthM: 14, confidence: 'H', note: '' } as unknown as DataLotSpec;
    expect(specFromData(d).family).toBe('brick');
  });
  it('lot data accepts a bbl and rejects a malformed one', () => {
    expect(validateLot({ widthM: 6, confidence: 'H', bbl: '3015850001' }, 'x', true)).toEqual([]);
    expect(validateLot({ widthM: 6, confidence: 'H', bbl: '12' }, 'x', true).length).toBe(1);
  });
});

describe('street tree census', () => {
  it('has real stats for the main streets and sensible scales', () => {
    expect(Object.keys(STREET_TREE_STATS).length).toBeGreaterThanOrEqual(8);
    expect(STREET_TREE_STATS.kosciuszko.n).toBeGreaterThan(50);
    expect(scaleForDbh(3)).toBeCloseTo(0.69);
    expect(scaleForDbh(60)).toBe(1.4);
    expect(scaleForDbh(0)).toBe(0.6);
  });
  it('draws deterministic, in-range styles that follow the street mix', () => {
    const a = treeStyleFor('kosciuszko', 0.3, 0.6, 0.5), b = treeStyleFor('kosciuszko', 0.3, 0.6, 0.5);
    expect(a).toEqual(b);
    expect(SPECIES_CLASSES[a.species]).toBeTruthy();
    const sizes = Array.from({ length: 200 }, (_, i) => treeStyleFor('pulaski', ((i * 37) % 200) / 200, ((i * 91) % 200) / 200, ((i * 13) % 200) / 200).dbhIn);
    const small = sizes.filter((d) => d < 12).length / sizes.length;
    expect(small).toBeGreaterThan(0.6); // Pulaski's census: mostly young trees
  });
  it('an unknown street falls back to a mid-size tree', () => {
    expect(treeStyleFor('nowhere', 0.1, 0.1, 0.1)).toEqual({ dbhIn: 10, species: 0, scale: 0.9, canopy: 1 });
  });
});
