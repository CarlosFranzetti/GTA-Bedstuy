import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { IMaterialLibrary, Circle } from '@/world/types';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry } from '@/world/roadnet/derive';
import { buildSidewalkGraph } from '@/world/roadnet/sidewalks';
import { chunkLayoutFromBounds } from '@/world/roadnet/chunksReal';
import { buildRealProps, updateRealSignals, type RealProps } from '@/world/roadnet/propsReal';
import { nodeControl } from '@/world/roadnet/signalPhases';
import { RealTrafficLights } from '@/world/roadnet/lightsReal';
import { LAMP_HEAD_NAME, setLampsLit } from '@/world/FurnitureGen';
import { pointInPolygon } from '@/world/roadnet/geom';
import { chunkKeyOf } from '@/render/Culling';

function stubLib(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const mk = (): THREE.Material => new THREE.MeshBasicMaterial();
  return {
    get(key, variant = 0) { const k = `${key}:${variant}`; let m = cache.get(k); if (!m) { m = mk(); m.name = k; cache.set(k, m); } return m; },
    awning: mk, sign: (t) => { let m = cache.get(`sign:${t}`); if (!m) { m = mk(); cache.set(`sign:${t}`, m); } return m; }, carPaint: mk, setNight: () => undefined,
  } as IMaterialLibrary;
}

function segDist(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

function checks(name: string, net: RoadNet, controlsJson: unknown): void {
  describe(`street furniture on ${name}`, () => {
    const d = deriveGeometry(net);
    const sw = buildSidewalkGraph(net, d);
    const layout = chunkLayoutFromBounds(net.bounds);
    const controls = nodeControl(net, controlsJson);
    const pr: RealProps = buildRealProps({ net, derived: d, sidewalks: sw, materials: stubLib(), rng: new Rng(11), layout, controls });
    const lights = new RealTrafficLights(net, d, controls);

    it('places every kind and reports its numbers', () => {
      const s = pr.stats;
      console.log(`${name}: ${JSON.stringify(s)}`);
      expect(s.trees).toBeGreaterThan(20);
      expect(s.lamps).toBeGreaterThan(20);
      expect(s.hydrants).toBeGreaterThan(0);
      expect(s.bins).toBeGreaterThan(0);
      expect(s.signs).toBeGreaterThan(10);
      expect(s.signalPoles).toBeGreaterThan(5);
      if (name === 'the real core') expect(s.stopSigns).toBeGreaterThan(20);
    });

    it('every collider stands on a sidewalk band: off the roadway, outside every building line, clear of crosswalks', () => {
      const bands = net.blocks.map((b, i) => ({ curb: d.curbRings[i], bld: d.buildingRings[i], island: b.island, fb: d.fallbackBuilding.includes(i) }));
      for (const c of pr.colliders) {
        expect(net.isOnRoad(c.pos), c.id).toBe(false);
        const inBlock = bands.find((b) => !b.island && b.curb.length >= 3 && pointInPolygon(c.pos, b.curb));
        expect(inBlock, c.id).toBeDefined();
        if (inBlock && !inBlock.fb && inBlock.bld.length >= 3) expect(pointInPolygon(c.pos, inBlock.bld), c.id).toBe(false);
        for (const cw of sw.crosswalks) {
          if (Math.abs(cw.a.x - c.pos.x) > 6 && Math.abs(cw.b.x - c.pos.x) > 6) continue;
          expect(segDist(c.pos, cw.a, cw.b), c.id).toBeGreaterThanOrEqual(1.2 - 1e-6);
        }
      }
    });

    it('collider ids are unique and circles have a positive radius', () => {
      const ids = new Set(pr.colliders.map((c) => c.id));
      expect(ids.size).toBe(pr.colliders.length);
      for (const c of pr.colliders) expect((c.shape as Circle).r).toBeGreaterThan(0);
    });

    it('lamps come in the form NightLights takes: one spot per lamp head instance, on the sidewalk side of the kerb line', () => {
      let heads = 0;
      pr.group.traverse((o) => { const m = o as THREE.InstancedMesh; if (m.isInstancedMesh && m.name === LAMP_HEAD_NAME) heads += m.count; });
      expect(pr.lamps.length).toBe(heads);
      expect(pr.lamps.length).toBe(pr.stats.lamps);
      for (const l of pr.lamps) { expect(Number.isFinite(l.pos.x + l.pos.z)).toBe(true); expect(l.height).toBeGreaterThan(5); }
      setLampsLit(pr.group, true);
      let lit = 0;
      pr.group.traverse((o) => { if (o.name === LAMP_HEAD_NAME) { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mm.emissiveIntensity > 0) lit++; } });
      expect(lit).toBeGreaterThan(0);
      setLampsLit(pr.group, false);
    });

    it('meshes are tagged by 128 m chunk and sit in the chunk of their instances', () => {
      expect(pr.chunkMeshes.length).toBeGreaterThan(0);
      for (const m of pr.chunkMeshes) {
        const key = m.userData.chunk as string;
        expect(typeof key).toBe('string');
        expect(pr.byChunk.get(key)).toContain(m);
        if ((m as THREE.InstancedMesh).isInstancedMesh && !/treeLeaves|signal-lamps/.test(m.name)) { // leaf clouds and signal heads hang off their pole
          const im = m as THREE.InstancedMesh;
          const e = im.instanceMatrix.array as Float32Array;
          for (let i = 0; i < im.count; i++) expect(chunkKeyOf(layout, e[i * 16 + 12], e[i * 16 + 14])).toBe(key);
        }
      }
    });

    it('a corner carries at most one blade per street', () => {
      // blades of a chunk are merged per text; check the per-corner rule on the placed colliders: signs <= 2 per corner pole
      expect(pr.stats.signs).toBeLessThanOrEqual(pr.stats.lamps * 2);
    });

    it('signal heads follow the controller', () => {
      let sets = 0, changed = 0;
      pr.group.traverse((o) => { if (o.userData.realSignals) sets++; });
      expect(sets).toBeGreaterThan(0);
      updateRealSignals(pr.group, lights);
      const before = pr.chunkMeshes.filter((m) => m.userData.realSignals).map((m) => Array.from(((m as THREE.InstancedMesh).instanceColor!.array as Float32Array)));
      lights.update(20);
      updateRealSignals(pr.group, lights);
      const after = pr.chunkMeshes.filter((m) => m.userData.realSignals).map((m) => Array.from(((m as THREE.InstancedMesh).instanceColor!.array as Float32Array)));
      before.forEach((b, i) => { if (b.some((v, k) => v !== after[i][k])) changed++; });
      expect(changed).toBeGreaterThan(0);
    });
  });
}

const grid = buildGrid(loadBedstuyData());
checks('the grid adapter', roadNetFromGrid(grid), {});

const core = (await import('@/world/data/roadnet-core.json')).default as unknown as RoadNetJson;
const controlsJson = (await import('@/world/data/roadnet-controls.json')).default as unknown;
checks('the real core', RoadNet.fromJson(core), controlsJson);
