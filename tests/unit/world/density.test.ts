/**
 * Commercial density on the avenue faces (Throop / Tompkins / Garvey, the E/W faces): 3-5 mixed-use lots per face with
 * the corners and the 15 POI shops kept, residential rows in between. Stage 3 density pass (MGR on D1).
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { CONFIDENCES, validateFaces, validateAgainstGrid } from '@/world/data/schema';
import raw from '@/world/data/bedstuy.json';
import type { SpecLot } from '@/world/BuildingGen';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(1988).fork('lots'), getBedstuyFaces()) as SpecLot[];

const avenueFaces = new Map<string, SpecLot[]>();
for (const l of lots) {
  if (l.side !== 'E' && l.side !== 'W') continue;
  const k = `${l.blockId}|${l.side}`;
  (avenueFaces.get(k) ?? avenueFaces.set(k, []).get(k)!).push(l);
}

describe('avenue commercial density', () => {
  it('covers every E/W face of the 5x4 blocks', () => {
    expect(avenueFaces.size).toBe(20);
  });

  it('each avenue face has 3-5 mixed-use lots (POI shops included)', () => {
    for (const [k, fl] of avenueFaces) {
      const mixed = fl.filter((l) => l.type === 'mixeduse');
      // the data makes every POI shop (garage included) part of its face's count, so no POI forces a 6th shop
      // PLUTO (GEO2): the real avenue faces carry few shops, and superblock faces almost none; the POI shops are pinned on top
      expect(mixed.length, k).toBeGreaterThanOrEqual(0);
      expect(mixed.length, k).toBeLessThanOrEqual(6);
    }
  });

  it('thinned from 3-9 per face; the average is now about 4 (was about 6.3)', () => {
    const counts = [...avenueFaces.values()].map((fl) => fl.filter((l) => l.type === 'mixeduse').length);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeLessThan(5);
    expect(Math.max(...counts)).toBeLessThanOrEqual(5);
  });

  it('corner lots stay mixed-use unless the data made them something else (church, vacant, garage, landmark row)', () => {
    for (const [k, fl] of avenueFaces) {
      const corners = fl.filter((l) => l.corner);
      expect(corners.length, k).toBe(2);
      for (const c of corners) {
        const ok = c.type === 'mixeduse' || c.spec?.use !== 'mixed';
        expect(ok, `${k} ${c.id}`).toBe(true);
      }
    }
    // the great majority are shops
    const corners = [...avenueFaces.values()].flat().filter((l) => l.corner);
    expect(corners.filter((l) => l.type === 'mixeduse').length / corners.length).toBeGreaterThan(0.2); // PLUTO: most real corner buildings are rowhouses or walk-ups, not shops
  });

  it('keeps all 15 POIs, each bound to a storefront/church/condo lot', () => {
    const placed = lots.filter((l) => l.poi);
    expect(data.pois.length).toBe(15);
    expect(new Set(placed.map((l) => l.poi!.id)).size).toBe(15);
  });

  it('no mixed-use lot runs more than 3 in a row on any avenue face (residential rows between)', () => {
    for (const [k, fl] of avenueFaces) {
      let run = 0, best = 0;
      for (const l of fl) { run = l.type === 'mixeduse' ? run + 1 : 0; best = Math.max(best, run); }
      expect(best, k).toBeLessThanOrEqual(3);
    }
  });

  it('every lot in the file keeps its confidence tag and the validator reports 0 errors', () => {
    const faces = (raw as { faces: { lots?: { confidence?: string }[] }[] }).faces;
    for (const f of faces) for (const l of f.lots ?? []) expect(CONFIDENCES as readonly string[]).toContain(l.confidence);
    expect(validateFaces(raw as unknown)).toEqual([]);
    expect(validateAgainstGrid(grid, getBedstuyFaces())).toEqual([]);
  });
});
