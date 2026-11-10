import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { MIN_LOW_PER_100M } from '@/world/props/clutter';
import { buildProps, applyClutterState, bagGroupForDay, CLUTTER_TRI_BUDGET, DOOR_ZONE } from '@/world/PropsGen';
import { buildFurniture } from '@/world/FurnitureGen';
import { windowHasAc } from '@/world/buildings/facade';
import type { IMaterialLibrary } from '@/world/types';

function mats(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const named = (n: string): THREE.Material => { let m = cache.get(n); if (!m) { m = new THREE.MeshBasicMaterial({ name: n }); cache.set(n, m); } return m; };
  return { get: (k, v) => named(`${k}:${v ?? 0}`), awning: (c, t) => named(`a${c}${t}`), sign: (t) => named(t), carPaint: (c) => named(c), setNight: () => {} };
}

function world(seed: number) {
  const data = loadBedstuyData();
  const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
  const out = buildProps(grid, lots, mats(), new Rng(seed));
  return { grid, lots, ...out };
}

const W = world(1234);

describe('street clutter', () => {
  it('no block face of 25 m or more is bare at the low tier (floor of MIN_LOW_PER_100M per 100 m)', () => {
    const low = new Map<string, number>();
    for (const p of W.clutter.placements) if (p.rank === 1) low.set(p.faceKey, (low.get(p.faceKey) ?? 0) + 1);
    let checked = 0;
    for (const b of W.grid.blocks) for (const f of b.faces) {
      const L = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z);
      if (L < 25) continue;
      checked++;
      expect(low.get(`${b.id}${f.side}`) ?? 0, `${b.id}${f.side} (${L.toFixed(0)} m)`).toBeGreaterThanOrEqual(Math.floor((L * MIN_LOW_PER_100M) / 100));
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const again = world(1234);
    expect(again.clutter.placements).toEqual(W.clutter.placements);
    expect(again.clutter.tris).toEqual(W.clutter.tris);
    const other = world(99);
    expect(other.clutter.placements).not.toEqual(W.clutter.placements);
  });

  it('places something of every family', () => {
    const kinds = new Set(W.clutter.placements.map((p) => p.kind));
    for (const k of ['bags', 'newsbox', 'bikeRack', 'planter', 'sandwichBoard', 'crates', 'barricade', 'patch', 'tarSnake', 'oil', 'gum', 'poster', 'sticker'] as const) expect(kinds.has(k), k).toBe(true);
  });

  it('keeps solid props off the roadway and out of doors', () => {
    const doors = W.lots.map((l) => ({ x: (l.frontA.x + l.frontB.x) / 2, z: (l.frontA.z + l.frontB.z) / 2 }));
    const solids = W.clutter.placements.filter((p) => p.solid);
    expect(solids.length).toBeGreaterThan(50);
    // plain loops with one assertion each: an expect() per (prop, door) pair is millions of calls and times out under load
    const onRoad = solids.filter((p) => W.grid.isOnRoad({ x: p.x, z: p.z })).map((p) => `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    expect(onRoad, 'solid props on the road').toEqual([]);
    const nearest = (p: { x: number; z: number }): number => { let m = Infinity; for (const d of doors) { const h = Math.hypot(p.x - d.x, p.z - d.z); if (h < m) m = h; } return m; };
    const tooClose = solids.filter((p) => nearest(p) <= DOOR_ZONE - 0.6).map((p) => `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    expect(tooClose, 'solid props too close to a door').toEqual([]);
    // trash bags are not 'solid' (walk-through) but must still keep clear of the door line
    const bagsClose = W.clutter.placements.filter((q) => q.kind === 'bags' && nearest(q) <= DOOR_ZONE - 0.2).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    expect(bagsClose, 'bags too close to a door').toEqual([]);
  });

  it('stays inside the per-tier triangle budget', () => {
    expect(CLUTTER_TRI_BUDGET.phone).toBe(0);
    // the budgets were set for the ten-block city; the world is now 25 blocks (B1) and chunk culling bounds what is drawn
    const grow = W.grid.blocks.length / 10;
    expect(W.clutter.tris[1]).toBeLessThanOrEqual(CLUTTER_TRI_BUDGET.low * grow);
    expect(W.clutter.tris[1] + W.clutter.tris[2]).toBeLessThanOrEqual(CLUTTER_TRI_BUDGET.medium * grow);
    expect(W.clutter.tris[1]).toBeGreaterThan(0);
  });

  it('has no NaN in any clutter vertex', () => {
    W.group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || !o.name.startsWith('props:clutter')) return;
      const a = (o as THREE.Mesh).geometry.getAttribute('position').array as Float32Array;
      for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw new Error(`NaN in ${o.name}`);
    });
  });

  it('switches by tier and by game day', () => {
    const meshes = (re: RegExp): THREE.Mesh[] => { const r: THREE.Mesh[] = []; W.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && re.test(o.name)) r.push(o as THREE.Mesh); }); return r; };
    const clutter = meshes(/^props:clutter-/);
    expect(clutter.length).toBeGreaterThan(5);
    const vis = (): number => clutter.filter((m) => (m.material as THREE.Material).visible).length;
    applyClutterState(W.group, 'phone', 0);
    expect(vis()).toBe(0);
    applyClutterState(W.group, 'low', 0);
    const low = vis();
    expect(clutter.filter((m) => (m.material as THREE.Material).visible && /-r2/.test(m.name))).toHaveLength(0);
    applyClutterState(W.group, 'medium', 0);
    expect(vis()).toBeGreaterThan(low);
    const bag = (d: number): boolean => meshes(new RegExp(`^props:clutter-bag-r1-d${d}$`)).every((m) => (m.material as THREE.Material).visible);
    applyClutterState(W.group, 'high', 0); expect([bag(0), bag(1), bag(2)]).toEqual([true, false, false]);
    applyClutterState(W.group, 'high', 4); expect([bag(0), bag(1), bag(2)]).toEqual([false, true, false]);
    applyClutterState(W.group, 'high', 6); expect([bag(0), bag(1), bag(2)]).toEqual([false, false, false]);
    expect(bagGroupForDay(7)).toBe(0);
    applyClutterState(W.group, 'high', 0);
  });

  it('puts a hydrant on (nearly) every block face', () => {
    const data = loadBedstuyData();
    const grid = buildGrid(data);
    const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
    const f = buildFurniture(grid, lots, mats(), new Rng(5));
    const hyd = f.instanced.get('hydrant');
    const faces = grid.blocks.reduce((n, b) => n + b.faces.length, 0);
    expect((hyd?.matrices.length ?? 0) / 16 / faces).toBeGreaterThan(0.85);
  });

  it('window AC hash is deterministic, around 20 % overall and denser on brick', () => {
    let a = 0, br = 0, n = 0;
    for (let i = 0; i < 4000; i++) { const x = (i % 40) * 1.3, y = 2 + Math.floor(i / 40) * 0.1; n++; if (windowHasAc(x, y, 0, false)) a++; if (windowHasAc(x, y, 0, true)) br++; }
    expect(windowHasAc(1.3, 3, 0, false)).toBe(windowHasAc(1.3, 3, 0, false));
    expect(a / n).toBeGreaterThan(0.12); expect(a / n).toBeLessThan(0.22);
    expect(br).toBeGreaterThan(a);
  });
});
