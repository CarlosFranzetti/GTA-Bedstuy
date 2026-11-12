import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { loadBedstuyData, buildGrid } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { buildWorld } from '@/world/WorldBuilder';
import { World2D } from '@/physics/World2D';
import { PICKUP_RADIUS, PickupSet, RESPAWN_SECONDS, placePickups, type PickupDef } from '@/game/combat/pickups';
import type { IMaterialLibrary } from '@/world/types';

const HOME = { x: 9, z: 20 };

describe('PickupSet', () => {
  const defs: PickupDef[] = [{ id: 'b1', kind: 'bottle', x: 5, z: 0 }, { id: 'p1', kind: 'pistol', x: 20, z: 0 }];

  it('is collected by walking over it, once', () => {
    const s = new PickupSet(defs);
    expect(s.update(0.016, { x: 0, z: 0 }, true)).toHaveLength(0);
    const got = s.update(0.016, { x: 5 + PICKUP_RADIUS - 0.1, z: 0 }, true);
    expect(got.map((g) => g.id)).toEqual(['b1']);
    expect(s.update(0.016, { x: 5, z: 0 }, true)).toHaveLength(0);
    expect([...s.active()].map((d) => d.id)).toEqual(['p1']);
  });

  it('does not collect while blocked (menu, car)', () => {
    const s = new PickupSet(defs);
    expect(s.update(0.016, { x: 5, z: 0 }, false)).toHaveLength(0);
    expect(s.isActive('b1')).toBe(true);
  });

  it('respawns after a few minutes', () => {
    const s = new PickupSet(defs);
    s.update(0.016, { x: 5, z: 0 }, true);
    s.update(RESPAWN_SECONDS.bottle - 1, { x: 100, z: 0 }, true);
    expect(s.isActive('b1')).toBe(false);
    s.update(2, { x: 100, z: 0 }, true);
    expect(s.isActive('b1')).toBe(true);
    expect(RESPAWN_SECONDS.bottle).toBeGreaterThanOrEqual(120);
    expect(RESPAWN_SECONDS.pistol).toBeLessThanOrEqual(600);
  });

  it('a dropped brick cannot be taken back at the same instant, then can, and expires', () => {
    const s = new PickupSet([]);
    s.drop('brick', 3, 3, 10);
    expect(s.update(0.1, { x: 3, z: 3 }, true)).toHaveLength(0);
    expect(s.update(1, { x: 3, z: 3 }, true)).toHaveLength(1);
    s.drop('brick', 3, 3, 5);
    s.update(6, { x: 50, z: 50 }, true);
    expect(s.droppedCount).toBe(0);
  });
});

describe('placePickups on the grid map', () => {
  const data = loadBedstuyData();
  const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), getBedstuyFaces());

  it('is deterministic: two runs give the same positions', () => {
    expect(placePickups(lots, HOME)).toEqual(placePickups(lots, HOME));
  });

  it('puts bottles at the shops and trash, bricks at the scaffolds, and pistols near home and in three more places', () => {
    const p = placePickups(lots, HOME);
    const by = (k: string) => p.filter((d) => d.kind === k);
    expect(by('bottle').length).toBeGreaterThanOrEqual(data.pois.length);
    expect(p.filter((d) => d.id.startsWith('bottle:shop:')).length).toBe(lots.filter((l) => l.poi).length);
    expect(by('brick').length).toBe(lots.filter((l) => l.type === 'scaffold').length);
    expect(by('pistol').length).toBe(4);
    const home = p.find((d) => d.id === 'pistol:home')!;
    expect(Math.hypot(home.x - HOME.x, home.z - HOME.z)).toBeLessThan(45);
    expect(new Set(p.map((d) => d.id)).size).toBe(p.length);
  });

  it('nudges a pickup off anything solid', () => {
    const all = placePickups(lots, HOME);
    const blockedFirst = new Set<string>();
    const p = placePickups(lots, HOME, (q) => { const k = `${q.x.toFixed(1)},${q.z.toFixed(1)}`; if (blockedFirst.size < 3) blockedFirst.add(k); return blockedFirst.has(k); });
    expect(p.length).toBeGreaterThan(all.length - 5);
    const first = all[0], again = p.find((d) => d.id === first.id);
    expect(again && (again.x !== first.x || again.z !== first.z)).toBe(true);
  });
});

describe('the pickups in the real built world', () => {
  it('none is inside a wall or prop, and the pistol by home can be walked to from the spawn', () => {
    const stub = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;
    const data = loadBedstuyData();
    const w = buildWorld(data, stub, new Rng(data.seed), 'low');
    const phys = new World2D(12);
    for (const c of w.colliders) phys.addStatic(c.shape, c.pos, c.id);
    const R = 0.35;
    const pickups = placePickups(w.lots, HOME, (p, r) => phys.overlapsSolid(p, r));
    expect(pickups.length).toBeGreaterThan(40);
    const inside = pickups.filter((d) => phys.overlapsSolid({ x: d.x, z: d.z }, R));
    expect(inside.map((d) => d.id)).toEqual([]);
    // breadth-first walk over 0.5 m cells from the spawn
    const home = pickups.find((d) => d.id === 'pistol:home')!;
    const step = 0.5, N = 130;
    const key = (i: number, j: number) => i * 1000 + j;
    const seen = new Set<number>([key(0, 0)]);
    const q: Array<[number, number]> = [[0, 0]];
    const goal = [Math.round((home.x - HOME.x) / step), Math.round((home.z - HOME.z) / step)];
    let reached = false;
    while (q.length && !reached) {
      const [i, j] = q.shift()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, k = key(a, b);
        if (Math.abs(a) > N || Math.abs(b) > N || seen.has(k)) continue;
        if (phys.overlapsSolid({ x: HOME.x + a * step, z: HOME.z + b * step }, R)) continue;
        seen.add(k); q.push([a, b]);
        if (Math.abs(a - goal[0]) <= 1 && Math.abs(b - goal[1]) <= 1) reached = true;
      }
    }
    expect(reached).toBe(true);
  }, 120_000);
});
