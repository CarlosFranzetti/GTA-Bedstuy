import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildRoads } from '@/world/RoadBuilder';
import type {
  Block, Crosswalk, GridModel, IMaterialLibrary, Intersection, MaterialKey, RoadSegment, Side, StreetDef,
} from '@/world/types';

interface StubLib extends IMaterialLibrary { requested: Set<string>; keys: Set<MaterialKey>; }

function stubLib(): StubLib {
  const cache = new Map<string, THREE.Material>();
  const requested = new Set<string>();
  const keys = new Set<MaterialKey>();
  const mk = () => new THREE.MeshBasicMaterial();
  return {
    requested,
    keys,
    get(key, variant = 0) {
      const k = `${key}:${variant}`;
      requested.add(k);
      keys.add(key);
      let m = cache.get(k);
      if (!m) { m = mk(); cache.set(k, m); }
      return m;
    },
    awning: () => mk(),
    sign: () => mk(),
    carPaint: () => mk(),
    setNight: () => undefined,
  };
}

/** 2 ns streets (x = -50, 50) x 2 ew streets (z = -50, 50) -> 1 block, 4 intersections, 4 segments. */
function fakeGrid(opts: { oneWay?: 0 | 1 | -1 } = {}): GridModel {
  const ow = opts.oneWay ?? 0;
  const street = (id: string, axis: 'ns' | 'ew', offset: number, roadWidth: number): StreetDef => ({
    id, name: id, signName: id, axis, offset, class: 'street', roadWidth, sidewalkWidth: 3, oneWay: ow,
  });
  const streets = [
    street('a', 'ns', -50, 14), street('b', 'ns', 50, 14),
    street('c', 'ew', -50, 12), street('d', 'ew', 50, 12),
  ];
  const nsList = streets.filter((s) => s.axis === 'ns');
  const ewList = streets.filter((s) => s.axis === 'ew');
  const intersections: Intersection[] = [];
  for (const ns of nsList) for (const ew of ewList) {
    intersections.push({
      id: `${ns.id}|${ew.id}`, center: { x: ns.offset, z: ew.offset },
      nsStreetId: ns.id, ewStreetId: ew.id, halfX: ns.roadWidth / 2, halfZ: ew.roadWidth / 2,
    });
  }
  const segments: RoadSegment[] = [];
  for (const ns of nsList) {
    segments.push({
      id: `seg-${ns.id}`, streetId: ns.id, fromIntersection: `${ns.id}|c`, toIntersection: `${ns.id}|d`,
      a: { x: ns.offset, z: -44 }, b: { x: ns.offset, z: 44 }, width: ns.roadWidth,
    });
  }
  for (const ew of ewList) {
    segments.push({
      id: `seg-${ew.id}`, streetId: ew.id, fromIntersection: `a|${ew.id}`, toIntersection: `b|${ew.id}`,
      a: { x: -43, z: ew.offset }, b: { x: 43, z: ew.offset }, width: ew.roadWidth,
    });
  }
  const crosswalks: Crosswalk[] = [];
  for (const i of intersections) {
    const sides: [Side, number, number][] = [
      ['N', 0, -1], ['S', 0, 1], ['E', 1, 0], ['W', -1, 0],
    ];
    for (const [side, dx, dz] of sides) {
      const cx = i.center.x + dx * (i.halfX + 1.5);
      const cz = i.center.z + dz * (i.halfZ + 1.5);
      const a = dx === 0 ? { x: cx - i.halfX, z: cz } : { x: cx, z: cz - i.halfZ };
      const b = dx === 0 ? { x: cx + i.halfX, z: cz } : { x: cx, z: cz + i.halfZ };
      crosswalks.push({ intersectionId: i.id, side, a, b, width: 3 });
    }
  }
  const curb = [{ x: -43, z: -44 }, { x: 43, z: -44 }, { x: 43, z: 44 }, { x: -43, z: 44 }];
  const buildingLine = [{ x: -40, z: -41 }, { x: 40, z: -41 }, { x: 40, z: 41 }, { x: -40, z: 41 }];
  const blocks: Block[] = [{ id: 'r0c0', row: 0, col: 0, curb, buildingLine, faces: [] }];
  const node = { id: 'n', pos: { x: 0, z: 0 }, streetId: 'a', heading: 0, stopLine: false };
  return {
    seed: 1,
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    streets, intersections, segments, crosswalks, blocks,
    lanes: { nodes: { n: node }, edges: [], adjacency: { n: [] } },
    sidewalks: { nodes: { n: { id: 'n', pos: { x: 0, z: 0 } } }, edges: [], adjacency: { n: [] } },
    streetById: (id) => streets.find((s) => s.id === id)!,
    blockById: (id) => blocks.find((b) => b.id === id)!,
    nearestLaneNode: () => node,
    nearestSidewalkNode: () => node.pos && { id: 'n', pos: { x: 0, z: 0 } },
    nearestStreet: () => streets[0]!,
    isOnRoad: () => false,
  };
}

function meshes(group: THREE.Group): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
}

describe('buildRoads', () => {
  it('merges the whole city into at most 14 meshes', () => {
    const { group } = buildRoads(fakeGrid(), stubLib());
    const n = meshes(group).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(14);
  });

  it('marks road and sidewalk meshes as shadow receivers and keeps details out of the shadow pass', () => {
    const { group } = buildRoads(fakeGrid(), stubLib());
    for (const m of meshes(group)) {
      expect(m.receiveShadow).toBe(true);
      expect(m.castShadow).toBe(false);
    }
  });

  it('spans at least the grid bounds', () => {
    const grid = fakeGrid();
    const { group } = buildRoads(grid, stubLib());
    const box = new THREE.Box3().setFromObject(group);
    expect(box.min.x).toBeLessThanOrEqual(grid.bounds.minX);
    expect(box.max.x).toBeGreaterThanOrEqual(grid.bounds.maxX);
    expect(box.min.z).toBeLessThanOrEqual(grid.bounds.minZ);
    expect(box.max.z).toBeGreaterThanOrEqual(grid.bounds.maxZ);
  });

  it('requests asphalt, concrete, laneLine, crosswalk, curb and metalDark materials', () => {
    const lib = stubLib();
    buildRoads(fakeGrid(), lib);
    for (const k of ['asphalt', 'concrete', 'laneLine', 'crosswalk', 'curb', 'metalDark', 'asphaltWorn'] as MaterialKey[]) {
      expect(lib.keys.has(k)).toBe(true);
    }
  });

  it('has no NaN or infinite vertex positions', () => {
    const { group } = buildRoads(fakeGrid(), stubLib());
    for (const m of meshes(group)) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count * 3; i++) {
        expect(Number.isFinite(pos.array[i] as number)).toBe(true);
      }
    }
  });

  it('returns exactly four map-edge Segment colliders at bounds +/- 30 m', () => {
    const grid = fakeGrid();
    const { colliders } = buildRoads(grid, stubLib());
    expect(colliders).toHaveLength(4);
    for (const c of colliders) expect(c.shape.kind).toBe('segment');
    const xs: number[] = [];
    const zs: number[] = [];
    for (const c of colliders) {
      if (c.shape.kind !== 'segment') continue;
      xs.push(c.shape.a.x, c.shape.b.x);
      zs.push(c.shape.a.z, c.shape.b.z);
    }
    expect(Math.min(...xs)).toBe(grid.bounds.minX - 30);
    expect(Math.max(...xs)).toBe(grid.bounds.maxX + 30);
    expect(Math.min(...zs)).toBe(grid.bounds.minZ - 30);
    expect(Math.max(...zs)).toBe(grid.bounds.maxZ + 30);
  });

  it('draws yellow centre dashes only on two-way streets', () => {
    const twoWay = stubLib();
    buildRoads(fakeGrid({ oneWay: 0 }), twoWay);
    expect(twoWay.requested.has('laneLine:1')).toBe(true);

    const oneWay = stubLib();
    buildRoads(fakeGrid({ oneWay: 1 }), oneWay);
    expect(oneWay.requested.has('laneLine:1')).toBe(false);
    // white edge lines and stop lines are still drawn
    expect(oneWay.requested.has('laneLine:0')).toBe(true);
  });

  it('keeps all geometry finite and flat on the ground plane', () => {
    const { group } = buildRoads(fakeGrid(), stubLib());
    const box = new THREE.Box3().setFromObject(group);
    expect(Number.isFinite(box.min.x + box.max.x + box.min.y + box.max.y + box.min.z + box.max.z)).toBe(true);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.011);
    expect(box.max.y).toBeLessThan(0.2);
  });
});
