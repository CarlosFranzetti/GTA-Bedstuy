/**
 * VENUES registry: complete for both maps, doors on the building line of a real lot and a sidewalk (never in a building or on a
 * road), hours, and the table is the only place that carries names.
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import type { PoiDef } from '@/world/types';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { placeLots, type RealLot } from '@/world/roadnet/lotsReal';
import { RealPlaces, type PlacesTable } from '@/world/roadnet/placesReal';
import { INTERIORS } from '@/world/interiors/defs';
import { DISCOVER_M, VENUES, VENUE_IDS, VENUE_ROOM, hoursText, isOpen, venueById, venueDoor, venueNear, venuePlaces, venuePosition, type MapName } from '@/world/venues/venues';

const core = (await import('@/world/data/roadnet-core.json')).default as unknown as import('@/world/roadnet/codec').RoadNetJson;
const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown as { lots: Array<{ bbl: string }> };
const table = (await import('@/world/data/places-real.json')).default as unknown as PlacesTable;

const data = loadBedstuyData();
const grid = buildGrid(data);
const gridLots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), getBedstuyFaces());
const net = RoadNet.fromJson(core);
const derived = deriveGeometry(net);
const faces = blockFaces(net, derived);
const realLots = placeLots(net, derived, faces, lotsJson) as RealLot[];
const places = new RealPlaces({ net, derived, faces, lots: realLots, table, pois: data.pois as PoiDef[] });

describe('registry', () => {
  it('has the seven places the owner asked for', () => {
    expect(VENUE_IDS).toHaveLength(7);
    const kinds = VENUES.map((v) => v.kind).sort();
    expect(kinds).toEqual(['afterhours', 'bar', 'bar', 'bar', 'club', 'dispensary', 'gym']);
    expect(new Set(VENUES.map((v) => v.name)).size).toBe(7);
    expect(new Set(VENUES.map((v) => v.sign)).size).toBe(7);
  });
  it('has a finite door with a unit outward vector on both maps, and a room', () => {
    for (const v of VENUES) for (const m of ['grid', 'real'] as MapName[]) {
      const d = venueDoor(m, v.id);
      expect(Number.isFinite(d.x) && Number.isFinite(d.z), `${v.id} ${m}`).toBe(true);
      expect(Math.hypot(d.outX, d.outZ)).toBeCloseTo(1, 2);
      const p = venuePosition(m, v.id);
      expect(Math.hypot(p.x - d.x, p.z - d.z)).toBeGreaterThan(1.5);
    }
    for (const id of VENUE_IDS) expect(VENUE_ROOM[id].w).toBeGreaterThan(6);
  });
  it('rooms park apart from each other and from the deli, club and home rooms', () => {
    const origins = [...VENUE_IDS.map((id) => VENUE_ROOM[id]), ...(['deli', 'club', 'home'] as const).map((id) => ({ ...INTERIORS[id] }))].map((r) => ({ x: r.origin.x, z: r.origin.z, rad: Math.hypot(r.w, r.d) / 2 }));
    for (let i = 0; i < origins.length; i++) for (let j = i + 1; j < origins.length; j++) expect(Math.hypot(origins[i].x - origins[j].x, origins[i].z - origins[j].z)).toBeGreaterThan(origins[i].rad + origins[j].rad + 20);
  });
  it('venues are in the shared interior table', () => {
    for (const id of VENUE_IDS) expect(INTERIORS[`venue:${id}` as const].name).toBe(venueById(id).name);
  });
});

describe('hours', () => {
  it('wraps past midnight and honours a flag', () => {
    expect(isOpen('bar-lounge', 16.99)).toBe(false);
    expect(isOpen('bar-lounge', 17)).toBe(true);
    expect(isOpen('bar-lounge', 1.99)).toBe(true);
    expect(isOpen('bar-lounge', 2)).toBe(false);
    expect(isOpen('club', 4.5)).toBe(true);
    expect(isOpen('club', 5)).toBe(false);
    expect(isOpen('afterhours', 5)).toBe(true);
    expect(isOpen('afterhours', 12)).toBe(false);
    expect(isOpen('gym', 24 + 6)).toBe(true);
    expect(isOpen('dispensary', -2)).toBe(false); // 22:00 the day before
  });
  it('every hour of the day is covered by at least one venue, and the after-hours opens when the club shuts', () => {
    for (let h = 0; h < 24; h += 0.5) expect(VENUES.some((v) => isOpen(v.id, h)), `hour ${h}`).toBe(true);
    expect(isOpen('afterhours', venueById('club').hours.close)).toBe(true);
  });
  it('says its hours in words', () => {
    expect(hoursText('bar-lounge')).toBe('5 PM to 2 AM');
    expect(hoursText('afterhours')).toBe('4 AM to 11 AM');
  });
});

describe('grid map doors', () => {
  it.each(VENUES.map((v) => [v.id]))('%s stands on the building line of its lot, on a sidewalk', (id) => {
    const v = venueById(id);
    const d = venueDoor('grid', id);
    const lot = gridLots.find((l) => l.id === v.grid.lot);
    expect(lot, 'lot').toBeTruthy();
    expect(['mixeduse', 'apartment']).toContain(lot!.type);
    expect(lot!.poi, 'no shop poi on the lot').toBeUndefined();
    // along the front: inside the lot with room for the 1.4 m frame on both sides
    const ax = lot!.frontB.x - lot!.frontA.x, az = lot!.frontB.z - lot!.frontA.z;
    const len = Math.hypot(ax, az);
    const t = ((d.x - lot!.frontA.x) * ax + (d.z - lot!.frontA.z) * az) / len;
    expect(t).toBeGreaterThan(1.2); expect(t).toBeLessThan(len - 1.2);
    // on the line (door sits 0.05 behind it), facing the lot's own outward normal
    const off = (d.x - lot!.frontA.x) * lot!.outward.x + (d.z - lot!.frontA.z) * lot!.outward.z;
    expect(Math.abs(off + 0.05)).toBeLessThan(0.08);
    expect(d.outX * lot!.outward.x + d.outZ * lot!.outward.z).toBeGreaterThan(0.99);
    // the standing spot is on the sidewalk: past the building line, short of the kerb, and not at a corner
    const block = grid.blockById(lot!.blockId); const face = block.faces.find((f) => f.side === lot!.side)!;
    const p = venuePosition('grid', id);
    const s = (p.x - face.a.x) * face.outward.x + (p.z - face.a.z) * face.outward.z;
    const sc = (face.curbA.x - face.a.x) * face.outward.x + (face.curbA.z - face.a.z) * face.outward.z;
    expect(s).toBeGreaterThan(0.5); expect(s).toBeLessThan(sc - 0.3);
    const fl = Math.hypot(face.b.x - face.a.x, face.b.z - face.a.z);
    const along = ((d.x - face.a.x) * (face.b.x - face.a.x) + (d.z - face.a.z) * (face.b.z - face.a.z)) / fl;
    expect(along).toBeGreaterThan(15); expect(along).toBeLessThan(fl - 15);
  });
  it('no two doors (venues, deli, club, home, shops) are within 12 m', () => {
    const others = [...(['deli', 'club', 'home'] as const).map((i) => INTERIORS[i].door), ...gridLots.filter((l) => l.poi).map((l) => ({ x: (l.frontA.x + l.frontB.x) / 2, z: (l.frontA.z + l.frontB.z) / 2 }))];
    for (const v of VENUES) {
      const d = venueDoor('grid', v.id);
      for (const o of others) expect(Math.hypot(d.x - o.x, d.z - o.z), v.id).toBeGreaterThan(12);
      for (const w of VENUES) if (w.id !== v.id) { const e = venueDoor('grid', w.id); expect(Math.hypot(d.x - e.x, d.z - e.z)).toBeGreaterThan(40); }
    }
  });
});

describe('real map doors', () => {
  it.each(VENUES.map((v) => [v.id]))('%s is the front of its tax lot, on a sidewalk, not on a road', (id) => {
    const v = venueById(id);
    const lot = realLots.find((l) => l.bbl === v.real.bbl);
    expect(lot, `bbl ${v.real.bbl}`).toBeTruthy();
    expect(lot!.type).toBe('mixeduse');
    expect(lot!.width).toBeGreaterThan(8);
    const dr = places.doorOfLot(lot!);
    const d = venueDoor('real', id);
    expect(Math.hypot(d.x - dr.x, d.z - dr.z)).toBeLessThan(0.05);
    expect(d.outX * dr.outX + d.outZ * dr.outZ).toBeGreaterThan(0.999);
    expect(net.edges[faces[lot!.block][lot!.face].edge].name).toBe(v.real.street);
    const p = venuePosition('real', id);
    expect(net.isOnRoad(p), 'standing spot on a road').toBe(false);
    expect(net.isOnRoad({ x: d.x, z: d.z }), 'door on a road').toBe(false);
    const h = net.nearestEdge(p, 40, (e) => net.edges[e].level === 0)!;
    const e = net.edges[h.edge];
    expect(h.dist).toBeGreaterThanOrEqual(e.width / 2 - 0.3);
    expect(h.dist).toBeLessThanOrEqual(e.width / 2 + e.sidewalk + 0.6);
    // the door is inside the lot's frontage with room for the frame
    const ax = lot!.frontB.x - lot!.frontA.x, az = lot!.frontB.z - lot!.frontA.z; const len = Math.hypot(ax, az);
    const t = ((d.x - lot!.frontA.x) * ax + (d.z - lot!.frontA.z) * az) / len;
    expect(t).toBeGreaterThan(1.2); expect(t).toBeLessThan(len - 1.2);
  });
  it('is clear of the other doors (venues, home, deli, club, the 15 shops)', () => {
    const lotXZ = (bbl: string) => { const l = realLots.find((x) => x.bbl === bbl)!; return places.doorOfLot(l); };
    const others = [...Object.values(table.interiors), ...Object.values(table.pois)].map((e) => lotXZ(e.bbl));
    for (const v of VENUES) {
      const d = venueDoor('real', v.id);
      for (const o of others) expect(Math.hypot(d.x - o.x, d.z - o.z), v.id).toBeGreaterThan(12);
      for (const w of VENUES) if (w.id !== v.id) { const e = venueDoor('real', w.id); expect(Math.hypot(d.x - e.x, d.z - e.z)).toBeGreaterThan(40); }
    }
    expect(new Set(VENUES.map((v) => v.real.bbl)).size).toBe(7);
  });
});

describe('map markers and discovery', () => {
  it('lists only the discovered ones, with the venue name', () => {
    const seen = new Set(['gym', 'club']);
    const pl = venuePlaces('grid', (id) => seen.has(id));
    expect(pl.map((p) => p.label).sort()).toEqual(['Iron Stoop Gym', 'Neon Paloma']);
    expect(pl.every((p) => p.kind === 'venue' && p.id.startsWith('venue:'))).toBe(true);
  });
  it('finds a venue the player walks up to, once', () => {
    const p = venuePosition('real', 'gym');
    const seen = new Set<string>();
    expect(venueNear('real', p.x + DISCOVER_M - 1, p.z, (i) => seen.has(i))).toBe('gym');
    expect(venueNear('real', p.x + DISCOVER_M + 5, p.z, (i) => seen.has(i))).toBeNull();
    seen.add('gym');
    expect(venueNear('real', p.x, p.z, (i) => seen.has(i))).toBeNull();
  });
});
