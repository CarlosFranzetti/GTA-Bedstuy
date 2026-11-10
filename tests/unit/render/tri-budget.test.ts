import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { QUALITY_ORDER, TIER_BUDGET, TIER_CONFIG } from '@/render/QualityTier';
import { FINE_CELLS, chunkKeyOfCell, chunkLayout, chunkRangeFor } from '@/render/Culling';
import { RenderProxies, coarseCarHull } from '@/render/AoProxy';
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
    expect(TIER_CONFIG.phone.instanceDistance).toBeLessThanOrEqual(100);
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
    for (const x of [50, 450]) { const m = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), mat); m.position.set(x, 10, 50); root.add(m); }
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
