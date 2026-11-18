/**
 * PERF3b: pins the draw-call levers that can be computed without a browser. The rendered numbers (triangles and draws per category at
 * four viewpoints and three tiers) come from scripts/perf3-breakdown.cjs and are in docs/swarm/tasks/PERF3.md; these tests keep the
 * structure that makes them (far building merge, small-prop range, instanced pickups, trim classes) from silently regressing.
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import * as THREE from 'three';
import { TIER_BUDGET, TIER_CONFIG } from '@/render/QualityTier';
import { ChunkCuller, DistanceCuller, FAR_MERGE_GROUP, SMALL_PROP_FRACTION, SMALL_PROP_MESH, TINY_PROP_FRACTION, TRIM_SMALL_FRACTION, chunkRangeFor, cullDistanceFor } from '@/render/Culling';
import { TRIM_MESH } from '@/render/TierGeometry';
import { PickupInstances, MAX_PICKUP_INSTANCES } from '@/game/combat/pickupView';
import type { PickupDef } from '@/game/combat/pickups';
import { mergeSideClasses, type StaticProxy } from '@/render/AoProxy';
import { buildSkylineGeometry, planSkyline } from '@/world/Skyline';
import { buildWorld } from '@/world/WorldBuilder';
import { loadBedstuyData } from '@/world/Grid';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import type { Quality } from '@/render/Shadows';

/** What the game draws from the lists: visible all the way up, on layer 0 and (for the camera) inside the frustum. */
function drawn(root: THREE.Object3D, frustum: THREE.Frustum | null): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.layers.isEnabled(0)) return;
    if ((m as THREE.InstancedMesh).isInstancedMesh && (m as THREE.InstancedMesh).count === 0) return;
    if (frustum && m.frustumCulled && !frustum.intersectsObject(m)) return;
    out.push(m);
  });
  return out;
}

describe('far building merge (ChunkCuller)', () => {
  const mats = { red: new THREE.MeshBasicMaterial(), lime: new THREE.MeshBasicMaterial(), win: new THREE.MeshBasicMaterial() };
  /** nx x nz fine cells of 125 x 100 m, each with two wall materials and one trim class, all built from the same boxes the world uses */
  function cityBlock(nx: number, nz: number): { group: THREE.Group; cells: THREE.Mesh[] } {
    const group = new THREE.Group(); const cells: THREE.Mesh[] = [];
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      for (const [name, mat] of [['buildings:brickRed:0', mats.red], ['buildings:limestone:0', mats.lime], ['buildings:window:0', mats.win]] as const) {
        const g = new THREE.BoxGeometry(100, 20, 80).translate(ix * 125 + 62, 10, iz * 100 + 50);
        const m = new THREE.Mesh(g, mat); m.name = name;
        m.userData = { cell: `${ix}_${iz}`, chunk: `${ix}_${iz}` };
        group.add(m); cells.push(m);
      }
    }
    group.updateMatrixWorld(true);
    return { group, cells };
  }
  const withBuilds = <T,>(fn: () => T): T => { const was = ChunkCuller.buildsPerUpdate; ChunkCuller.buildsPerUpdate = 1e9; try { return fn(); } finally { ChunkCuller.buildsPerUpdate = was; } };

  it('cells whose whole 2 x 2 group is far draw one mesh per material instead of one per cell and material', () => {
    withBuilds(() => {
      const { group, cells } = cityBlock(8, 8);
      const cc = new ChunkCuller(5000);
      cc.farOverride = 60; cc.trimOverride = 150; cc.mergeOverride = 150;
      for (const m of cells) cc.add(m);
      const camera = { x: 20, z: 20 };
      cc.update(camera.x, camera.z, 2); cc.update(camera.x, camera.z, 2);
      const merged = drawn(group, null).filter((m) => m.userData.farMerged);
      const plain = drawn(group, null).filter((m) => !m.userData.farMerged);
      expect(cc.mergedGroups).toBeGreaterThan(8);
      // 8 x 8 cells = 16 groups of 4; the near ones stay per cell; merged groups cost 2 draws each (red + limestone, trim is dropped out there)
      expect(merged.length).toBe(cc.mergedGroups * 2);
      const mergedCells = cc.mergedGroups * FAR_MERGE_GROUP * FAR_MERGE_GROUP;
      expect(plain.length).toBeLessThanOrEqual((64 - mergedCells) * 3);
      // against the same view with the merge off
      const off = withBuilds(() => { const b = cityBlock(8, 8); const c2 = new ChunkCuller(5000); c2.farOverride = 60; c2.trimOverride = 150; c2.mergeOverride = Infinity; for (const m of b.cells) c2.add(m); c2.update(20, 20, 2); c2.update(20, 20, 2); return drawn(b.group, null).length; });
      expect(merged.length + plain.length).toBeLessThan(off * 0.7);
    });
  });

  it('the cell the camera stands in, and every group with a near cell, keeps its full per-cell meshes', () => {
    withBuilds(() => {
      const { group, cells } = cityBlock(8, 8);
      const cc = new ChunkCuller(5000); cc.farOverride = 60; cc.trimOverride = 150; cc.mergeOverride = 150;
      for (const m of cells) cc.add(m);
      cc.update(62, 50, 2); cc.update(62, 50, 2);
      const visible = drawn(group, null);
      for (const m of cells.filter((c) => c.userData.cell === '0_0' || c.userData.cell === '1_1')) expect(visible).toContain(m);
      expect(visible.filter((m) => m.userData.farMerged).length).toBeGreaterThan(0);
    });
  });

  it('walking back to the group puts the per-cell meshes back and hides the merged ones (no double draw, no hole)', () => {
    withBuilds(() => {
      const { group, cells } = cityBlock(8, 8);
      const cc = new ChunkCuller(5000); cc.farOverride = 60; cc.trimOverride = 150; cc.mergeOverride = 150;
      for (const m of cells) cc.add(m);
      cc.update(20, 20, 2); cc.update(20, 20, 2);
      const far = cells.find((c) => c.userData.cell === '6_6' && c.name.includes('Red'))!;
      expect(far.visible).toBe(false);
      cc.update(800, 700, 2); cc.update(800, 700, 2);
      expect(far.visible).toBe(true);
      const groupMeshes = drawn(group, null).filter((m) => m.userData.farMerged);
      // nothing is drawn twice: a cell with a drawn per-cell mesh is not also inside a drawn merged mesh
      for (const m of groupMeshes) { const b = new THREE.Box3().setFromObject(m); expect(b.containsPoint(new THREE.Vector3(800 + 0, 10, 700))).toBe(false); }
      expect(cc.mergedGroups).toBeGreaterThan(0);
    });
  });

  it('the 4 x 4 block replaces its 2 x 2 blocks far out: fewer draws again, and no cell is drawn twice', () => {
    withBuilds(() => {
      const draw = (two: number): { n: number; levels: Set<number>; double: number } => {
        const { group, cells } = cityBlock(8, 8);
        const cc = new ChunkCuller(5000); cc.farOverride = 60; cc.trimOverride = 150; cc.mergeOverride = 150; cc.mergeOverride2 = two;
        for (const m of cells) cc.add(m);
        cc.update(20, 20, 2); cc.update(20, 20, 2);
        const shown = drawn(group, null);
        const merged = shown.filter((m) => m.userData.farMerged);
        let double = 0;
        for (const c of shown.filter((m) => !m.userData.farMerged)) {
          const centre = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3());
          for (const m of merged) if (new THREE.Box3().setFromObject(m).containsPoint(centre)) double++;
        }
        return { n: shown.length, levels: new Set(merged.map((m) => m.userData.mergeLevel as number)), double };
      };
      const one = draw(Infinity), both = draw(300);
      expect(one.levels).toEqual(new Set([0]));
      expect(both.levels.has(1)).toBe(true);
      expect(both.n).toBeLessThan(one.n);
      expect(one.double + both.double).toBe(0);
    });
  });

  it('is off for tiers without a merge range and cleans up its meshes', () => {
    withBuilds(() => {
      for (const q of ['medium', 'high'] as const) { expect(TIER_CONFIG[q].buildingMergeDist).toBe(Infinity); expect(TIER_CONFIG[q].buildingMergeDist2).toBe(Infinity); }
      expect(TIER_CONFIG.low.buildingMergeDist2).toBeGreaterThan(TIER_CONFIG.low.buildingMergeDist);
      expect(TIER_CONFIG.low.buildingMergeDist).toBeGreaterThanOrEqual(TIER_CONFIG.low.buildingFarDist + 12);
      const { group, cells } = cityBlock(4, 4);
      const cc = new ChunkCuller(5000); cc.farOverride = 60; cc.trimOverride = 150; cc.mergeOverride = 150;
      for (const m of cells) cc.add(m);
      cc.update(-2000, -2000, 2); cc.update(-2000, -2000, 2);
      expect(cc.mergedGroups).toBeGreaterThan(0);
      const n = group.children.length;
      cc.clear();
      expect(group.children.length).toBeLessThan(n);
      expect(drawn(group, null).every((m) => !m.userData.farMerged)).toBe(true);
    });
  });
});

describe('small prop classes use a shorter range', () => {
  const prop = (name: string, x: number): THREE.Mesh => { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()); m.name = name; m.position.set(x, 1, 0); m.updateMatrixWorld(true); return m; };
  it('wires, bags, clutter, graffiti and metal bits go at SMALL_PROP_FRACTION of the range; poles and trees keep it all', () => {
    const dc = new DistanceCuller(200);
    const wires = prop('props:wires', 150), bags = prop('props:clutter-bag-r1-d2', 150), poles = prop('props:poles', 150), trunk = prop('props:treeTrunk', 150), nearWires = prop('props:wires', 60);
    for (const m of [wires, bags, poles, trunk, nearWires]) dc.addStatic(m);
    dc.update(0, 0);
    expect(wires.visible).toBe(false); expect(bags.visible).toBe(false);
    expect(poles.visible).toBe(true); expect(trunk.visible).toBe(true); expect(nearWires.visible).toBe(true);
    expect(SMALL_PROP_FRACTION).toBeLessThan(0.7); expect(TINY_PROP_FRACTION).toBeLessThan(SMALL_PROP_FRACTION);
    for (const n of ['props:wires', 'props:bags', 'props:wiresClutter', 'props:graffiti:0', 'props:clutter-flat-r2', 'props:metalDark', 'props:cone']) expect(SMALL_PROP_MESH.test(n)).toBe(true);
    for (const n of ['props:poles', 'props:treeTrunk', 'props:fences', 'props:billboards']) expect(SMALL_PROP_MESH.test(n)).toBe(false);
  });
  it('signal poles and lamps and the lime-line globes are trim classes (dropped beyond the trim range, a draw per cell each)', () => {
    for (const n of ['signal-poles', 'signal-lamps', 'lime:globe']) expect(TRIM_MESH.test(n)).toBe(true);
    expect(TRIM_MESH.test('el:section-3')).toBe(false);
  });
});

describe('shadow and skyline stand-ins', () => {
  const tri = (a: number): THREE.BufferGeometry => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, 0, 0, a + 1, 0, 0, a, 1, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); g.setIndex([0, 1, 2]); return g; };
  it('the three side classes of a shadow cell become one front-side mesh (a back-side class is the same triangles reversed, a double-sided one is both)', () => {
    const proxies: StaticProxy[] = [
      { geometry: tri(0), side: THREE.FrontSide, cell: '1_1' }, { geometry: tri(2), side: THREE.BackSide, cell: '1_1' }, { geometry: tri(4), side: THREE.DoubleSide, cell: '1_1' },
      { geometry: tri(6), side: THREE.FrontSide, cell: '2_1' },
    ];
    const out = mergeSideClasses(proxies);
    expect(out.length).toBe(2);
    expect(out.every((p) => p.side === THREE.FrontSide)).toBe(true);
    const cell = out.find((p) => p.cell === '1_1')!;
    expect(cell.geometry.index!.count / 3).toBe(1 + 1 + 2);
    // the back-side triangle's winding is reversed in the merged index
    const idx = Array.from(cell.geometry.index!.array);
    expect(idx.slice(3, 6)).toEqual([3, 5, 4]);
  });
  it('the low tier skyline is walls and roofs only: less than half the triangles of the full ring', () => {
    const bounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 } as never;
    const blocks = planSkyline(bounds, new Rng('perf3b'));
    const count = (g: THREE.BufferGeometry): number => g.index!.count / 3;
    const full = buildSkylineGeometry(blocks, bounds), lite = buildSkylineGeometry(blocks, bounds, true);
    expect(blocks.length).toBeGreaterThan(200);
    expect(count(lite)).toBeLessThan(count(full) * 0.5);
  });
  it('signs and tags drop at a share of the trim range, windows at all of it', () => {
    const mk = (name: string): THREE.Mesh => { const m = new THREE.Mesh(new THREE.BoxGeometry(100, 20, 80).translate(0, 10, 0), new THREE.MeshBasicMaterial()); m.name = name; m.userData = { cell: '0_0', chunk: '0_0' }; m.updateMatrixWorld(true); return m; };
    const win = mk('buildings:window:0'), sign = mk('buildings:sign:TEST|#fff'), wall = mk('buildings:brickRed:0');
    const cc = new ChunkCuller(5000); cc.farOverride = Infinity; cc.trimOverride = 110; cc.mergeOverride = Infinity;
    for (const m of [win, sign, wall]) cc.add(m);
    cc.update(0, 100, 2); // 60 m from the cell edge
    expect(win.visible).toBe(true); expect(sign.visible).toBe(true);
    const d = 110 * TRIM_SMALL_FRACTION + 10;
    cc.update(0, 40 + d, 2);
    expect(sign.visible).toBe(false); expect(win.visible).toBe(true); expect(wall.visible).toBe(true);
    cc.update(0, 40 + 130, 2);
    expect(win.visible).toBe(false); expect(wall.visible).toBe(true);
  });
});

describe('pickups are instanced', () => {
  const parts = { bottleBody: new THREE.CylinderGeometry(0.036, 0.038, 0.17, 10), bottleNeck: new THREE.CylinderGeometry(0.014, 0.024, 0.1, 8), brick: new THREE.BoxGeometry(0.21, 0.065, 0.1), pistolSlide: new THREE.BoxGeometry(0.034, 0.034, 0.19), pistolGrip: new THREE.BoxGeometry(0.03, 0.09, 0.045) };
  const mats = { glass: new THREE.MeshLambertMaterial(), brick: new THREE.MeshLambertMaterial(), gun: new THREE.MeshLambertMaterial() };
  const list = (n: number): PickupDef[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: (['bottle', 'brick', 'pistol'] as const)[i % 3], x: (i % 10) * 5, z: Math.floor(i / 10) * 5 }));
  it('forty pickups in view cost at most four draws (it was two to three each), and only the ones in range are drawn', () => {
    const pv = new PickupInstances(parts, mats, new THREE.Texture());
    pv.update(list(40), 0, 0, 1.5, 75, () => 0);
    const meshes = drawn(pv.group, null);
    expect(meshes.length).toBeLessThanOrEqual(4);
    expect(meshes.every((m) => (m as THREE.InstancedMesh).isInstancedMesh)).toBe(true);
    expect(pv.shown).toBe(40);
    expect(pv.items.bottle.count + pv.items.brick.count + pv.items.pistol.count).toBe(40);
    pv.update(list(40), 1000, 1000, 1.5, 75, () => 0); // everything out of range
    expect(drawn(pv.group, null).length).toBe(0);
    pv.update(list(500), 0, 0, 2, 1e6, () => 0); // never more than the cap per kind
    expect(pv.items.bottle.count).toBeLessThanOrEqual(MAX_PICKUP_INSTANCES);
  });
  it('a pickup keeps its size and pose: the bottle is one merged mesh of body and neck, standing about 0.5 m above the ground', () => {
    const pv = new PickupInstances(parts, mats, new THREE.Texture());
    pv.update([{ id: 'b', kind: 'bottle', x: 3, z: 4 }], 0, 0, 0, 75, () => 1);
    const m = new THREE.Matrix4(); pv.items.bottle.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(3, 5); expect(p.z).toBeCloseTo(4, 5); expect(p.y).toBeGreaterThan(1.5); expect(p.y).toBeLessThan(1.8);
    const geo = pv.items.bottle.geometry; geo.computeBoundingBox();
    expect(geo.boundingBox!.max.y).toBeGreaterThan(0.17); // neck on top of the body
  });
});

// ---- the world at the home spawn, computed in node: what the city meshes alone cost before any car, person or post pass
const stubMaterials = (): IMaterialLibrary => {
  const cache = new Map<string, THREE.Material>();
  return new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { const key = String(k) + JSON.stringify(a); let m = cache.get(key); if (!m) { m = new THREE.MeshBasicMaterial(); m.name = key; cache.set(key, m); } return m; } }) as unknown as IMaterialLibrary;
};
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1200);

function worldAtSpawn(tier: Quality): { draws: Record<string, number>; tris: Record<string, number> } {
  const data = loadBedstuyData();
  const world = buildWorld(data, stubMaterials(), new Rng(data.seed), tier);
  const t = TIER_CONFIG[tier];
  const was = ChunkCuller.buildsPerUpdate; ChunkCuller.buildsPerUpdate = 1e9;
  try {
    const cc = new ChunkCuller(chunkRangeFor(tier));
    cc.farOverride = t.buildingFarDist; cc.trimOverride = t.buildingTrimDist; cc.mergeOverride = t.buildingMergeDist;
    for (const m of world.chunkMeshes) cc.add(m);
    const dc = new DistanceCuller(cullDistanceFor(tier));
    for (const m of world.propCells) dc.addStatic(m);
    camera.position.set(9.35, 1.55, 23.2); camera.lookAt(9.35, 2.5, -80); camera.updateMatrixWorld(true);
    cc.update(camera.position.x, camera.position.z, camera.position.y); cc.update(camera.position.x, camera.position.z, camera.position.y);
    dc.update(camera.position.x, camera.position.z);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const draws: Record<string, number> = {}; const tris: Record<string, number> = {};
    for (const m of drawn(world.group, frustum)) {
      let group = ''; for (let p: THREE.Object3D | null = m.parent; p && p !== world.group; p = p.parent) group = p.name;
      group = group || m.name;
      const g = m.geometry; const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3 * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
      draws[group] = (draws[group] ?? 0) + 1; tris[group] = (tris[group] ?? 0) + n;
    }
    return { draws, tris };
  } finally { ChunkCuller.buildsPerUpdate = was; }
}

describe('the city meshes at the home spawn stay inside their share of the tier budget', () => {
  it.each(['phone', 'low'] as const)('%s: buildings, props and signals', (tier) => {
    const w = worldAtSpawn(tier);
    // eslint-disable-next-line no-console
    if (process.env.PERF3B_PRINT) appendFileSync(process.env.PERF3B_PRINT, tier + " " + JSON.stringify(w) + "\n");
    const limit = LIMITS[tier];
    expect(w.draws.buildings ?? 0).toBeLessThanOrEqual(limit.buildings);
    expect(w.draws.props ?? 0).toBeLessThanOrEqual(limit.props);
    expect(w.draws.signals ?? 0).toBeLessThanOrEqual(limit.signals);
    expect(w.tris.skyline ?? 0).toBeLessThanOrEqual(limit.skylineTris);
    expect(w.tris.buildings ?? 0).toBeLessThanOrEqual(limit.buildingTris);
  }, 120_000);
});

/** measured in node at the end of PERF3b (home spawn, 60 deg camera, no instance culling, no transit range) plus about 8 %; the rendered totals are in docs/swarm/tasks/PERF3.md */
const LIMITS: Record<'phone' | 'low', { buildings: number; props: number; signals: number; skylineTris: number; buildingTris: number }> = {
  phone: { buildings: 70, props: 30, signals: 6, skylineTris: 40_000, buildingTris: 230_000 },
  low: { buildings: 215, props: 38, signals: 6, skylineTris: 12_000, buildingTris: 220_000 },
};
