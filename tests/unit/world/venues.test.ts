/**
 * VENUES: the real venues in venues-current.json (matched by address) carry their parody names on the shipped
 * lots, with a matching storefront kind, and no sign anywhere in the data repeats a real business name.
 * The 13 venues whose addresses are expansion lots (not in the current faces) are listed as pending; GEO3 adds them.
 */
import { describe, it, expect } from 'vitest';
import raw from '@/world/data/bedstuy.json';
import venues from '@/world/data/raw/venues-current.json';
import { STOREFRONTS } from '@/world/data/schema';

interface RawLot { storefront?: string; sign?: string; note?: string }
interface RawFace { lots: RawLot[] }
interface RawPoi { id: string; sign?: string }
interface Venue { real_name: string; address: string; storefront: string; parody_name: string }

const faces = (raw as unknown as { faces: RawFace[] }).faces;
const pois = (raw as unknown as { pois: RawPoi[] }).pois;
const list = venues.venues as Venue[];

/** house number plus the first street word, as the lot notes spell them ("305 THROOP AVENUE"). */
const addressRe = (address: string): RegExp => {
  const [num, word] = address.toUpperCase().split(/\s+/);
  return new RegExp(`(^|[^0-9])${num} ${word}\\b`);
};

const allLots = faces.flatMap((f) => f.lots);
const findLot = (address: string): RawLot | undefined => allLots.find((l) => addressRe(address).test((l.note ?? '').toUpperCase()));

/** venues whose address is not on any current lot: expansion lots that GEO3 adds to bedstuy.json */
const PENDING_EXPANSION = [
  '909 Dekalb Avenue', '833 Dekalb Avenue', '886 Dekalb Avenue', '905 Dekalb Avenue', '911 Dekalb Avenue',
  '835 Dekalb Avenue', '901 Dekalb Avenue', '892 Dekalb Avenue', '148 Lewis Ave', '98 Lewis Ave',
  '426 Kosciuszko St', '86 Lewis Ave', '207 Hart St',
];

const MISSION_POI_SIGNS: Record<string, string> = {
  'troop-deli': 'TROOP DELI & GROCERY  ·  OPEN 25 HRS',
  komat: 'KOSCIUSZ-K-O-MAT  ·  WASH DRY FOLD',
  'garvey-cutz': 'GARVEY CUTZ  ·  WALK-INS WELCOME, PATIENCE REQUIRED',
  rx: 'THROOP FAMILY PHARMACY  ·  WE TAKE SOME INSURANCE',
};

describe('real venues on current lots', () => {
  it('lists all 16 matched venues', () => {
    expect(list).toHaveLength(16);
  });

  it('gives each venue that is on a current lot its parody name and matching storefront kind', () => {
    const onLot = list.filter((v) => findLot(v.address));
    expect(onLot.length).toBe(16 - PENDING_EXPANSION.length);
    for (const v of onLot) {
      const lot = findLot(v.address)!;
      expect(lot.sign, v.address).toBe(v.parody_name);
      expect(lot.storefront, v.address).toBe(v.storefront);
      expect(STOREFRONTS as readonly string[]).toContain(v.storefront);
    }
  });

  it('keeps the expansion venues pending until GEO3 adds their lots', () => {
    const pending = list.filter((v) => !findLot(v.address)).map((v) => v.address);
    expect(pending.sort()).toEqual([...PENDING_EXPANSION].sort());
  });

  it('never puts a real business name on a sign', () => {
    const real = new Set(list.map((v) => v.real_name.trim().toUpperCase()));
    const signs = [
      ...allLots.map((l) => l.sign),
      ...pois.map((p) => p.sign),
    ].filter((s): s is string => typeof s === 'string');
    for (const s of signs) expect(real.has(s.trim().toUpperCase()), s).toBe(false);
    for (const v of list) expect(real.has(v.parody_name.trim().toUpperCase()), v.parody_name).toBe(false);
  });

  it('leaves the mission POI signs as they were', () => {
    for (const [id, sign] of Object.entries(MISSION_POI_SIGNS)) {
      expect(pois.find((p) => p.id === id)?.sign, id).toBe(sign);
    }
  });
});
