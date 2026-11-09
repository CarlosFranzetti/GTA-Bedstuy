/**
 * Areaway iron fences are physical: thin Segment colliders along the building line of every stooped house, open at the
 * stoop foot and the basement entry, a handful per lot.
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
import { doorLocalXs } from '@/world/interiors/doorGaps';

const stub = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;
const grid = buildGrid(loadBedstuyData());
const lots = subdivideLots(grid, loadBedstuyData().pois, new Rng(7).fork('lots'), getBedstuyFaces());
const { colliders } = buildBuildings(lots, stub, new Rng(7).fork('buildings'));
const fences = colliders.filter((c) => c.id?.includes('-areaway'));
const byLot = new Map<string, StaticCollider[]>();
for (const f of fences) { const k = f.id!.replace(/-areaway\d+$/, ''); (byLot.get(k) ?? byLot.set(k, []).get(k)!).push(f); }

const doorLot = (id: string): boolean => { const l = lots.find((x) => x.id === id); return !!l && doorLocalXs(l).length > 0; };
const seg = (c: StaticCollider) => c.shape as Segment;
const lenOf = (c: StaticCollider) => Math.hypot(seg(c).b.x - seg(c).a.x, seg(c).b.z - seg(c).a.z);

/** Walk a 0.3 m ped from `from` along `dir` for `dist` metres in a world holding `cols`; returns the final position. */
function walk(cols: StaticCollider[], from: Vec2, dir: Vec2, dist: number): Vec2 {
  const w = new World2D(12);
  for (const c of cols) w.addStatic(c.shape, c.pos, c.id);
  const speed = 1.4, dt = 1 / 60;
  const body = { id: 'ped', kind: 'ped' as const, shape: { kind: 'circle' as const, r: 0.3 }, pos: { ...from }, vel: { x: dir.x * speed, z: dir.z * speed }, heading: 0, mass: 80 };
  w.addBody(body);
  for (let t = 0; t < dist / speed; t += dt) {
    body.pos.x += body.vel.x * dt; body.pos.z += body.vel.z * dt;
    w.step(dt);
  }
  return body.pos;
}

describe('areaway iron fence colliders', () => {
  it('exist for stooped houses, bounded per lot, and are thin segments with no polygons added', () => {
    expect(byLot.size).toBeGreaterThan(100);
    for (const [id, list] of byLot) {
      expect(list.length, id).toBeGreaterThanOrEqual(1);
      // a lot carrying an interior door (WAX DELI) gets one extra run: the 1.8 m door gap splits the fence
      expect(list.length, id).toBeLessThanOrEqual(doorLot(id) ? 4 : 3);
      for (const c of list) { expect(c.shape.kind).toBe('segment'); expect(lenOf(c), id).toBeGreaterThanOrEqual(0.049); }
    }
    expect(fences.length).toBeLessThanOrEqual(byLot.size * 3);
    expect(new Set(fences.map((c) => c.id)).size).toBe(fences.length);
  });

  it('a ped walking from the sidewalk straight at a fence run is stopped by it', () => {
    let tested = 0;
    for (const [id, list] of [...byLot].slice(0, 60)) {
      const lot = lots.find((l) => l.id === id)!;
      const c = list.reduce((a, b) => (lenOf(b) > lenOf(a) ? b : a));
      const s = seg(c);
      const mid = { x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 };
      const out = lot.outward;
      const start = { x: mid.x + out.x * 1.2, z: mid.z + out.z * 1.2 };
      const end = walk(colliders.filter((q) => q === c), start, { x: -out.x, z: -out.z }, 3);
      const d = (end.x - mid.x) * out.x + (end.z - mid.z) * out.z; // signed distance past the fence line, + = sidewalk side
      expect(d, id).toBeGreaterThan(0.2);
      tested++;
    }
    expect(tested).toBeGreaterThan(20);
  });

  it('the basement-entry gap stays open: a ped crosses the fence line there', () => {
    let tested = 0;
    for (const [id, list] of byLot) {
      if (list.length < 3) continue; // need runs on both sides of the entry gap and the stoop gap
      const lot = lots.find((l) => l.id === id)!;
      const out = lot.outward;
      const along = { x: -out.z, z: out.x };
      const t = (p: Vec2) => (p.x - lot.frontA.x) * along.x + (p.z - lot.frontA.z) * along.z;
      const ivs = list.map((c) => [t(seg(c).a), t(seg(c).b)].sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]);
      const gaps = [[ivs[0][1], ivs[1][0]], [ivs[1][1], ivs[2][0]]].filter(([g0, g1]) => g1 > g0);
      expect(gaps.length, id).toBe(2);
      const entry = gaps.reduce((a, b) => (b[1] - b[0] < a[1] - a[0] ? b : a)); // 1.0 m entry vs 1.6 m stoop foot
      const tm = (entry[0] + entry[1]) / 2;
      const base = { x: lot.frontA.x + along.x * tm, z: lot.frontA.z + along.z * tm };
      const fenceMid = list[0].shape.kind === 'segment' ? seg(list[0]).a : base;
      const line = (fenceMid.x - lot.frontA.x) * out.x + (fenceMid.z - lot.frontA.z) * out.z; // fence offset from building line along outward
      const start = { x: base.x + out.x * (line + 1.2), z: base.z + out.z * (line + 1.2) };
      const end = walk(list, start, { x: -out.x, z: -out.z }, 1.8);
      const d = (end.x - base.x) * out.x + (end.z - base.z) * out.z - line;
      expect(d, id).toBeLessThan(-0.3); // well past the fence line, into the yard
      if (++tested >= 25) break;
    }
    expect(tested).toBeGreaterThan(5);
  });
});
