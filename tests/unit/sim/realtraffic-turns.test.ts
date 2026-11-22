/**
 * REALTRAFFIC2: every turn connector of the real lane graph, driven by one car alone from rest at the stop line
 * (runner: realtraffic-turn-run.ts). A turn fails when the car strays more than 2.6 m from its path, does not get through,
 * or drives over a kerb. Cars of every normal length make (nearly) all of them; a 12.5 m bus and a 9.2 m refuse truck
 * do not, which is why trafficReal.ts runs them as box trucks (MAX_REAL_VEHICLE_LENGTH).
 */
import { describe, expect, it } from 'vitest';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { MAX_REAL_VEHICLE_LENGTH } from '@/world/roadnet/trafficReal';
import { driveTurns, MAX_DEV, type TurnResult } from './realtraffic-turn-run';

const bad = (r: TurnResult[]): TurnResult[] => r.filter((t) => t.maxDev > MAX_DEV || !t.finished || t.kerb > 0);

describe('real map turn connectors', () => {
  it('a sedan makes all but a handful of the connectors from rest', () => {
    const r = driveTurns('sedan', 1, true);
    expect(r.length).toBeGreaterThan(1000);
    const b = bad(r);
    expect(b.length / r.length).toBeLessThan(0.01);
    // the unfinished or far-off ones are the 90 deg turns across the short links of two Broadway signal pairs only (Middleton St 14 m, Malcolm X Blvd 33 m:
    // REALFIX2 measured 3 on the grown net). Pruning them (chord or angle rules in lanes.ts) strands lanes or builds longer fallbacks: see REALFIX.md.
    expect(b.filter((t) => t.maxDev > 6).length).toBeLessThanOrEqual(2);
  });

  it('a car at speed (8 m/s into the stop line) makes them too', () => {
    const r = driveTurns('sedan', 3, false);
    expect(bad(r).length / r.length).toBeLessThan(0.01);
  });

  it('a 7 m box truck, the longest vehicle the real map runs, makes at least 98 % of them', () => {
    const r = driveTurns('boxtruck', 2, true);
    expect(bad(r).length / r.length).toBeLessThan(0.02);
  });

  it('no vehicle longer than MAX_REAL_VEHICLE_LENGTH is a normal car', () => {
    const longer = Object.values(VEHICLE_SPECS).filter((s) => s.length > MAX_REAL_VEHICLE_LENGTH).map((s) => s.type).sort();
    expect(longer).toEqual(['bus', 'garbage', 'schoolbus']); // CARS4 school bus: the real map runs it as a box truck like the others
  });
});
