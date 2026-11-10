import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { QUALITY_ORDER, TIER_BUDGET, TIER_CONFIG } from '@/render/QualityTier';
import { ChunkCuller, FINE_CELLS, SHADOW_PROXY_CELL, chunkDetailRangeFor, chunkKeyOfCell, chunkLayout, chunkRangeFor } from '@/render/Culling';
import { BlobShadows } from '@/render/BlobShadows';
import { AO_REACH, RenderProxies, coarseCarHull } from '@/render/AoProxy';
import { triBreakdown, categorize } from '@/render/TriBreakdown';
import { SHADOWS_ENABLED } from '@/render/Shadows';

const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

describe('tier budgets (locked numbers; the rendered counts come from scripts/perf-breakdown.mjs)', () => {
  it('budgets grow with the tier and phone/low/medium match the lane brief', () => {
    expect(TIER_BUDGET.phone).toEqual({ triangles: 300_000, draws: 150 });
    expect(TIER_BUDGET.low).toEqual({ triangles: 500_000, draws: 220 });
    expect(TIER_BUDGET.medium.triangles).toBe(1_200_000);
    for (let i = 1; i < QUALITY_ORDER.length; i++) {
      expect(TIER_BUDGET[QUALITY_ORDER[i]].triangles).toBeGreaterThan(TIER_BUDGET[QUALITY_ORDER[i - 1]].triangles);
      expect(TIER_BUDGET[QUALITY_ORDER[i]].draws).toBeGreaterThanOrEqual(TIER_BUDGET[QUALITY_ORDER[i - 1]].draws);
    }
  });

  it('no tier draws every instanced tree of the city: instanceDistance is finite and grows with the tier', () => {
    for (const q of QUALITY_ORDER) expect(Number.isFinite(TIER_CONFIG[q].instanceDistance)).toBe(true);
    for (let i = 1; i < QUALITY_ORDER.length; i++) {
      expect(TIER_CONFIG[QUALITY_ORDER[i]].instanceDistance).toBeGreaterThanOrEqual(TIER_CONFIG[QUALITY_ORDER[i - 1]].instanceDistance);
    }
    expect(TIER_CONFIG.phone.instanceDistance).toBeLessThanOrEqual(80);
    expect(TIER_CONFIG.low.instanceDistance).toBeLessThanOrEqual(200);
  });

  it('near-LOD cars stay close: phone 14 m, low <= 40 m, medium <= 56 m', () => {
    expect(TIER_CONFIG.phone.carNearDist).toBeLessThanOrEqual(14);
    expect(TIER_CONFIG.low.carNearDist).toBeLessThanOrEqual(40);
    expect(TIER_CONFIG.medium.carNearDist).toBeLessThanOrEqual(56);
  });

  it('the phone tier draws no real shadow pass and keeps its chunk range inside the fog', () => {
    expect(SHADOWS_ENABLED.phone).toBe(false);
    expect(chunkRangeFor('phone')).toBeLessThanOrEqual(TIER_CONFIG.phone.fog!.far);
  });
});

describe('render cells', () => {
  const streets = [
    { axis: 'ns' as const, offset: 0 }, { axis: 'ns' as const, offset: 250 }, { axis: 'ns' as const, offset: 500 },
    { axis: 'ew' as const, offset: 0 }, { axis: 'ew' as const, offset: 100 }, { axis: 'ew' as const, offset: 200 },
  ];
  it('phone and low use half-size cells that tile the 2 x 2 block chunk exactly', () => {
    expect(FINE_CELLS.phone && FINE_CELLS.low).toBe(true);
    const coarse = chunkLayout(streets), fine = chunkLayout(streets, true);
    expect(fine.cellX).toBe(coarse.cellX / 2);
    expect(fine.cellZ).toBe(coarse.cellZ / 2);
    expect([fine.chunkX, fine.chunkZ]).toEqual([coarse.chunkX, coarse.chunkZ]);
    expect(fine.chunkX / fine.cellX).toBe(4);
    // the 4 x 2 fine cells of one chunk map to that chunk, the next column of cells to the next chunk
    const keys = new Set([0, 1, 2, 3].flatMap((i) => [0, 1].map((j) => chunkKeyOfCell(fine, `${i}_${j}`))));
    expect(keys.size).toBe(1);
    expect(chunkKeyOfCell(fine, '4_0')).not.toBe(chunkKeyOfCell(fine, '3_0'));
  });
});

describe('shadow stand-ins', () => {
  it('a car shadow hull is two boxes (<= 24 triangles), whatever the far model costs', () => {
    const big = new THREE.SphereGeometry(1, 80, 60).scale(0.9, 0.7, 2.2); // ~9 k triangles
    expect(tris(big)).toBeGreaterThan(5000);
    const hull = coarseCarHull(big);
    expect(tris(hull)).toBeLessThanOrEqual(24);
    hull.computeBoundingBox();
    expect(hull.boundingBox!.max.z).toBeCloseTo(2.2, 1);
  });

  it('the shadow pass only draws cell proxies and car hulls the sun box can see', () => {
    const proxies = new RenderProxies();
    const mat = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    for (const x of [45, 460]) { const m = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), mat); m.position.set(x, 10, 30); root.add(m); }
    root.updateMatrixWorld(true);
    proxies.addStatic([root], 100, 100);
    proxies.addHull('sedan', new THREE.BoxGeometry(2, 1.4, 4.5).translate(0, 0.7, 0), true);
    proxies.beginFrame();
    proxies.addCar('sedan', 5, 5, 0);      // inside the box
    proxies.addCar('sedan', 300, 0, 0);    // far outside it
    proxies.endFrame();

    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    const half = 60;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 400 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.position.set(0, 180, 0); sun.target.position.set(0, 0, 0);
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();

    let seen = { cells: -1, hulls: -1 };
    const renderer = { shadowMap: { render: (..._a: never[]) => { seen = { cells: proxies.shadowGroup.children.filter((c) => c.visible && (c as THREE.Mesh).isMesh && c.name.startsWith('shadow:')).length, hulls: proxies.shadowHullsDrawn }; } } };
    proxies.wrapShadowRender(renderer);
    (renderer.shadowMap.render as (...a: unknown[]) => void)([sun], new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(seen.cells).toBe(1);
    expect(seen.hulls).toBe(1);
    expect(proxies.shadowGroup.visible).toBe(false);
  });
});

describe('TriBreakdown', () => {
  it('counts what the render callback draws, per category, instances and groups included', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group(); root.name = 'world'; scene.add(root);
    const furn = new THREE.Group(); furn.name = 'furniture'; root.add(furn);
    const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 10);
    leaves.name = 'furniture:treeLeaves'; furn.add(leaves);
    const fake = (): void => { leaves.onBeforeRender({} as never, scene, new THREE.Camera(), leaves.geometry, leaves.material as THREE.Material, null as never); };
    const bd = triBreakdown(scene, fake);
    expect(bd.sceneTotal).toBe(20);
    expect(bd.scene.trees?.tris).toBe(20);
    expect(categorize('/Scene/car-lod/car-lod:carPaint', true)).toBe('cars-far');
    expect(categorize('/Scene/world/buildings/buildings:limestone:0', false)).toBe('buildings');
  });
});

describe('detail range and far shadow casters', () => {
  it('beyond half the chunk range (low 210 m, medium / high 260 m) fire escapes / tanks / fences are dropped, the facade stays', () => {
    expect(chunkDetailRangeFor('low')).toBe(210);
    expect(chunkDetailRangeFor('medium')).toBe(260);
    const cull = new ChunkCuller(420);
    const mk = (name: string, x: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(100, 10, 100), new THREE.MeshBasicMaterial());
      m.name = name; m.position.set(x, 5, 0); m.userData.chunk = `c${x}`; m.updateMatrixWorld(true); cull.add(m); return m;
    };
    const nearWall = mk('buildings:limestone:0', 0), nearIron = mk('buildings:metalDark:0', 0);
    const midWall = mk('buildings:limestone:0', 300), midIron = mk('buildings:metalDark:0', 300);
    const farWall = mk('buildings:limestone:0', 700);
    cull.update(0, 0);
    expect([nearWall.visible, nearIron.visible]).toEqual([true, true]);
    expect([midWall.visible, midIron.visible]).toEqual([true, false]); // 250 m to the nearest edge: wall yes, detail no
    expect(farWall.visible).toBe(false);                               // beyond 420 m
    cull.update(150, 0);
    expect(midIron.visible).toBe(true);                                // walking up to it brings the detail back
  });

  it('tiers with a real sun shadow draw only the building prisms from BlobShadows; phone draws all its casters', () => {
    const b = new BlobShadows();
    b.buildSunCasters([{ type: 'brownstone', frontA: { x: 0, z: 0 }, frontB: { x: 6, z: 0 }, outward: { x: 0, z: -1 }, depth: 14 } as never]);
    b.beginFrame(); b.addCar(0, 0, 0, 4.5, 1.8); b.endFrame();
    const seen: Array<{ group: boolean; cars: boolean }> = [];
    const caster = b.casterGroup.children.find((c) => c.name === 'caster:cars')!;
    const r = { shadowMap: { render: () => { seen.push({ group: b.casterGroup.visible, cars: caster.visible }); } } };
    b.wrapShadowRender(r as never);
    b.setSunCasters(false); r.shadowMap.render();
    b.setSunCasters(true); r.shadowMap.render();
    expect(seen).toEqual([{ group: true, cars: false }, { group: true, cars: true }]);
  });

  it('shadow / AO proxy cells are small on every tier that builds them', () => {
    for (const q of ['low', 'medium', 'high'] as const) expect(SHADOW_PROXY_CELL[q]).toBeLessThanOrEqual(50);
  });

  it('the AO G-buffer draws only the cell proxies within reach of the camera', () => {
    const proxies = new RenderProxies();
    const root = new THREE.Group();
    for (const x of [60, 660]) { const m = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial()); m.position.set(x, 10, 30); root.add(m); }
    root.updateMatrixWorld(true);
    proxies.addStatic([root], 100, 100);
    const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 2, 0); cam.updateMatrixWorld();
    proxies.ao.onBeforeRender({} as never, proxies.ao, cam, null as never, null as never, null as never);
    expect(proxies.aoCellsDrawn).toBe(1);
    expect(AO_REACH).toBeLessThanOrEqual(100);
  });
});
