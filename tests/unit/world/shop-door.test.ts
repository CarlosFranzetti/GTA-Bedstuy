/**
 * Wax Deli door: the prompt zone is a band along the frontage (not one spot) and the areaway fence in front of the
 * shop's building line has a gap at the door, so the stoop / doorstep is walkable (H4 got wedged in the areaway pit).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import type { IMaterialLibrary, Segment, StaticCollider } from '@/world/types';
import { World2D } from '@/physics/World2D';
import { loadBedstuyData, buildGrid } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildBuildings } from '@/world/BuildingGen';
import { getBedstuyFaces } from '@/world/data/faces';
import { DOOR_BAND_HALF, DOOR_BAND_OUT, INTERIORS, INTERIOR_IDS, doorLocal, inDoorBand } from '@/world/interiors/defs';
import { DOOR_FENCE_GAP_HALF, doorLocalXs } from '@/world/interiors/doorGaps';
import { Interiors } from '@/world/interiors/Interiors';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';

const stub = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;
const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(7).fork('lots'), getBedstuyFaces());
const { colliders } = buildBuildings(lots, stub, new Rng(7).fork('buildings'));
const deli = INTERIORS.deli.door;

function walkTo(cols: StaticCollider[], from: Vec2, waypoints: Vec2[]): Vec2 {
  const w = new World2D(12);
  for (const c of cols) w.addStatic(c.shape, c.pos, c.id);
  const body = { id: 'ped', kind: 'ped' as const, shape: { kind: 'circle' as const, r: 0.3 }, pos: { ...from }, vel: { x: 0, z: 0 }, heading: 0, mass: 80 };
  w.addBody(body);
  const speed = 1.8, dt = 1 / 60;
  for (const t of waypoints) {
    for (let i = 0; i < 60 * 12; i++) {
      const dx = t.x - body.pos.x, dz = t.z - body.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) break;
      body.vel.x = (dx / d) * speed; body.vel.z = (dz / d) * speed;
      body.pos.x += body.vel.x * dt; body.pos.z += body.vel.z * dt;
      w.step(dt);
    }
  }
  return body.pos;
}

describe('door prompt band', () => {
  it('is at least 1.5 m along the frontage each way... and at least 1.2 m deep, for every door', () => {
    expect(DOOR_BAND_HALF * 2).toBeGreaterThanOrEqual(3);
    expect(DOOR_BAND_OUT).toBeGreaterThanOrEqual(1.2);
    for (const id of INTERIOR_IDS) {
      const def = INTERIORS[id]; const d = def.door;
      const at = (along: number, out: number) => ({ x: d.x + d.outX * out + -d.outZ * along, z: d.z + d.outZ * out + d.outX * along });
      for (const along of [-1.5, -0.75, 0, 0.75, 1.5]) for (const out of [0.1, 0.6, 1.2, 1.4, 2.0]) {
        const p = at(along, out);
        expect(inDoorBand(def, p.x, p.z), `${id} along ${along} out ${out}`).toBe(true);
        const l = doorLocal(def, p.x, p.z);
        expect(l.along).toBeCloseTo(along, 6); expect(l.out).toBeCloseTo(out, 6);
      }
      // outside the band: well along the wall, far out on the street
      for (const [al, ou] of [[2.5, 1.4], [-2.5, 1.4], [0, 3.5], [0, -4]] as const) { const p = at(al, ou); expect(inDoorBand(def, p.x, p.z), `${id} ${al},${ou}`).toBe(false); }
    }
  });
  it('the deli doorstep counts down into the areaway (the pit H4 walked into), so F works there too', () => {
    expect(inDoorBand(INTERIORS.deli, 12.5, 34)).toBe(true);
    expect(inDoorBand(INTERIORS.deli, 13.6, 36.4)).toBe(false); // too far along the wall: the old stuck spot is not the door
    expect(inDoorBand(INTERIORS.deli, 13.6, 34.5)).toBe(true);
  });
  it('Interiors.prompt shows the whole band and nothing beyond it', () => {
    const it = new Interiors({ scene: new THREE.Group(), world: new World2D(), materials: { get: () => new THREE.MeshBasicMaterial(), sign: () => new THREE.MeshBasicMaterial() } as never, inventory: new Inventory(PROCEDURAL_RECORDS, null), getHour: () => 12, teleport: () => undefined });
    for (const [x, z, want] of [[9.65, 34, true], [9.65, 32.6, true], [9.65, 35.4, true], [9.0, 34, true], [10.8, 34, true], [9.65, 36.0, false], [9.65, 31.8, false], [6.5, 34, false]] as const) {
      expect(!!it.prompt({ x, z }), `${x},${z}`).toBe(want);
    }
    expect(it.doorAt({ x: 9.65, z: 34 })).toBe('deli');
  });
});

describe('Wax Deli stoop and doorstep are walkable', () => {
  it('the door lies on a brownstone lot whose areaway fence now has a gap at the door', () => {
    const lot = lots.find((l) => l.id === 'r2c1-W-3')!;
    expect(doorLocalXs(lot)).toHaveLength(1);
    expect(lot.type).toBe('brownstone');
    const fences = colliders.filter((c) => c.id?.startsWith(`${lot.id}-areaway`)).map((c) => c.shape as Segment);
    expect(fences.length).toBeGreaterThanOrEqual(1);
    for (const s of fences) {
      const lo = Math.min(s.a.z, s.b.z), hi = Math.max(s.a.z, s.b.z);
      // no run covers any point of the door opening
      expect(hi <= deli.z - DOOR_FENCE_GAP_HALF + 1e-6 || lo >= deli.z + DOOR_FENCE_GAP_HALF - 1e-6, `${lo}..${hi}`).toBe(true);
    }
    // the other houses keep their continuous runs
    expect(colliders.filter((c) => c.id?.includes('-areaway')).length).toBeGreaterThan(100);
  });
  it('from the H4 stuck spot (13.6, 36.4) in the areaway a ped reaches the door band, then the sidewalk', () => {
    const end = walkTo(colliders, { x: 13.6, z: 36.4 }, [{ x: 12.4, z: 34.2 }, { x: 9.65, z: 34.0 }]);
    expect(Math.hypot(end.x - 9.65, end.z - 34)).toBeLessThan(0.5);
  });
  it('and the other way: from the sidewalk straight at the door reaches the doorstep (x > 11.5)', () => {
    const end = walkTo(colliders, { x: 8, z: 34 }, [{ x: 12.2, z: 34 }]);
    expect(end.x).toBeGreaterThan(11.5);
    expect(Math.hypot(end.x - 12.2, end.z - 34)).toBeLessThan(0.5);
  });
  it('control: 2 m along the frontage the fence still blocks (only the door opening is cut)', () => {
    const end = walkTo(colliders, { x: 8, z: 35.6 }, [{ x: 12.2, z: 35.6 }]);
    expect(end.x).toBeLessThan(11.1);
  });
});
