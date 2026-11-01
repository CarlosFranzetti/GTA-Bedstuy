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

/** 2 ns streets (x = -50, 50) x 2 ew streets (z = -50, 50) -> 2 blocks (rows 0 and 1), 4 intersections, 4 segments. */
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
  const curb1 = [{ x: 57, z: -44 }, { x: 90, z: -44 }, { x: 90, z: 44 }, { x: 57, z: 44 }];
  const buildingLine1 = [{ x: 60, z: -41 }, { x: 87, z: -41 }, { x: 87, z: 41 }, { x: 60, z: 41 }];
  const blocks: Block[] = [
    { id: 'r0c0', row: 0, col: 0, curb, buildingLine, faces: [] },
    { id: 'r1c1', row: 1, col: 1, curb: curb1, buildingLine: buildingLine1, faces: [] },
  ];
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
  it('merges the whole city into at most 16 meshes', () => {
    const { group } = buildRoads(fakeGrid(), stubLib());
    const n = meshes(group).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(16);
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

  it('requests asphalt, concrete, laneLine, crosswalk, graniteCurb, manhole, grate, bluestone and metalDark materials', () => {
    const lib = stubLib();
    buildRoads(fakeGrid(), lib);
    for (const k of ['asphalt', 'concrete', 'laneLine', 'crosswalk', 'graniteCurb', 'manhole', 'grate', 'bluestone', 'metalDark', 'asphaltWorn'] as MaterialKey[]) {
      expect(lib.keys.has(k)).toBe(true);
    }
    // the flat curb colour is gone: curbs are graniteCurb now
    expect(lib.keys.has('curb')).toBe(false);
  });

  it('lays bluestone on odd block rows and concrete on the others', () => {
    const lib = stubLib();
    const { group } = buildRoads(fakeGrid(), lib);
    const names = meshes(group).map((m) => m.name);
    expect(names).toContain('sidewalks');
    expect(names).toContain('sidewalks-bluestone');
    expect(lib.requested.has('bluestone:0')).toBe(true);
    expect(lib.requested.has('concrete:0')).toBe(true);
  });

  it('gives curbs, sidewalks and crosswalks finite UVs, with the curb top on v ~ 1', () => {
    const { group } = buildRoads(fakeGrid(), stubLib());
    let maxCurbV = -Infinity;
    for (const m of meshes(group)) {
      const uv = m.geometry.getAttribute('uv');
      expect(uv).toBeDefined();
      for (let i = 0; i < uv.count * 2; i++) expect(Number.isFinite(uv.array[i] as number)).toBe(true);
      if (m.name === 'curbs') {
        const pos = m.geometry.getAttribute('position');
        let topV = -Infinity;
        for (let i = 0; i < uv.count; i++) {
          maxCurbV = Math.max(maxCurbV, uv.getY(i));
          if (pos.getY(i) > 0.14) topV = Math.max(topV, uv.getY(i));
        }
        expect(topV).toBeGreaterThan(0.85);
      }
    }
    expect(maxCurbV).toBeLessThanOrEqual(1);
  });

  describe('graniteCurb (T11 tile: 1.2 m stone, joint at u = 0; rows top 0.48 / chamfer / face 0.54-0.92 / gutter)', () => {
    const curbMeshes = (g: THREE.Group) => meshes(g).filter((m) => m.name.startsWith('curbs'));
    // two blocks in the same column-parity class would get one stone; make the second block odd so both variants appear
    const twoVariantGrid = (): GridModel => { const g = fakeGrid(); g.blocks[1] = { ...g.blocks[1]!, col: 0 }; return g; };

    it('uses the graniteCurb key (both variants, alternating per block) and no longer the generic granite key', () => {
      const lib = stubLib();
      const { group } = buildRoads(twoVariantGrid(), lib);
      expect(lib.requested.has('graniteCurb:0')).toBe(true);
      expect(lib.requested.has('graniteCurb:1')).toBe(true);
      expect(lib.requested.has('granite:0')).toBe(false);
      expect(curbMeshes(group).map((m) => m.name).sort()).toEqual(['curbs', 'curbs-warm']);
    });

    it('blocks alternate in a checkerboard: neighbours along a row or a column never share a variant', () => {
      for (const [r, c] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 3]]) {
        const lib = stubLib();
        const g = fakeGrid(); g.blocks.length = 1; g.blocks[0] = { ...g.blocks[0]!, row: r, col: c };
        buildRoads(g, lib);
        expect(lib.requested.has(`graniteCurb:${(r + c) % 2}`)).toBe(true);
        expect(lib.requested.has(`graniteCurb:${1 - ((r + c) % 2)}`)).toBe(false);
      }
    });

    it('u counts 1.2 m stones along the run from a joint at u = 0; v follows the painter rows per face', () => {
      const { group } = buildRoads(fakeGrid(), stubLib());
      const m = curbMeshes(group).find((x) => x.name === 'curbs')!;
      const pos = m.geometry.getAttribute('position'), uv = m.geometry.getAttribute('uv');
      let minU = Infinity, maxU = -Infinity;
      for (let i = 0; i < uv.count; i++) {
        minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i));
        const v = uv.getY(i), y = pos.getY(i);
        expect(v).toBeGreaterThan(0.02); expect(v).toBeLessThan(0.98); // never on the tile edge
        if (y > 0.14) expect(v === 0.97 || v === 0.52 || Math.abs(v - 0.97) < 1e-6 || Math.abs(v - 0.52) < 1e-6).toBe(true); // top face: canvas rows 0..0.48 -> v 0.52..1
        if (y < 1e-6) expect(v).toBeLessThan(0.1); // foot = gutter grit rows
      }
      expect(minU).toBeCloseTo(0, 5);
      // the longest run of block r0c0 is the 88 m east/west edge (z -44..44) -> 73.33 stones
      expect(maxU).toBeCloseTo(88 / 1.2, 3);
      // a roadway-facing vertical face spans v 0.03..0.46 (rows 0.54..0.97), the chamfer 0.46..0.52 (rows 0.48..0.54)
      const vs = new Set<number>(); for (let i = 0; i < uv.count; i++) vs.add(Math.round(uv.getY(i) * 100) / 100);
      for (const v of [0.03, 0.08, 0.46, 0.52, 0.97]) expect(vs.has(v), String(v)).toBe(true);
    });

    it('curb geometry (positions) and colliders are unchanged by the UV remap: 4 edge walls, same curb height', () => {
      const { group, colliders } = buildRoads(fakeGrid(), stubLib());
      expect(colliders.length).toBe(4);
      const m = curbMeshes(group)[0]!;
      const pos = m.geometry.getAttribute('position');
      let maxY = 0; for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
      expect(maxY).toBeCloseTo(0.15, 5);
    });
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
