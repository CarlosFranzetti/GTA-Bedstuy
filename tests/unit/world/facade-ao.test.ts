import { describe, it, expect } from 'vitest';
import { AO_MIN, vertexAo } from '@/world/buildings/facade';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import type {
  Block, BlockFace, GridModel, IMaterialLibrary, Lot, MaterialKey, PoiDef, Polygon, Segment, Side, StaticCollider,
} from '@/world/types';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildBuildings } from '@/world/BuildingGen';
import { buildGrid, loadBedstuyData } from '@/world/Grid';

function fakeBlock(id = 'r0c0'): Block {
  const NW = { x: -240, z: -95 }, NE = { x: -10, z: -95 }, SE = { x: -10, z: -5 }, SW = { x: -240, z: -5 };
  const cNW = { x: -244, z: -99 }, cNE = { x: -6, z: -99 }, cSE = { x: -6, z: -1 }, cSW = { x: -244, z: -1 };
  const face = (side: Side, a: Vec2, b: Vec2, ca: Vec2, cb: Vec2, outward: Vec2, streetId: string): BlockFace =>
    ({ blockId: id, side, streetId, a, b, curbA: ca, curbB: cb, outward });
  return {
    id, row: 0, col: 0,
    curb: [cNW, cNE, cSE, cSW],
    buildingLine: [NW, NE, SE, SW],
    faces: [
      face('N', NE, NW, cNE, cNW, { x: 0, z: -1 }, 'hart'),
      face('S', SW, SE, cSW, cSE, { x: 0, z: 1 }, 'pulaski'),
      face('E', SE, NE, cSE, cNE, { x: 1, z: 0 }, 'throop'),
      face('W', NW, SW, cNW, cSW, { x: -1, z: 0 }, 'tompkins'),
    ],
  };
}
const block = fakeBlock();
const grid = { blocks: [block], blockById: () => block } as unknown as GridModel;

const POIS: PoiDef[] = [
  { id: 'bodega', block: 'r0c0', face: 'W', t: 0.08, archetype: 'bodega', sign: 'TROOP DELI', awningColor: '#d62828' },
  { id: 'church', block: 'r0c0', face: 'S', t: 0.5, archetype: 'church', sign: 'TABERNACLE', awningColor: '#5a2d82' },
  { id: 'condo', block: 'r0c0', face: 'W', t: 0.5, archetype: 'condo', sign: 'CONDOS', awningColor: '#e8e2d6' },
  { id: 'rx', block: 'r0c0', face: 'E', t: 0.1, archetype: 'pharmacy', sign: 'RX', awningColor: '#0a7f5a' },
];

class StubMaterials implements IMaterialLibrary {
  readonly keys = new Set<string>();
  private cache = new Map<string, THREE.Material>();
  private mk(k: string): THREE.Material {
    let m = this.cache.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.cache.set(k, m); }
    return m;
  }
  get(key: MaterialKey, variant = 0): THREE.Material { this.keys.add(key); return this.mk(`${key}:${variant}`); }
  awning(color: string, text: string): THREE.Material { this.keys.add('awning'); return this.mk(`awning:${color}:${text}`); }
  sign(text: string, bg = '', fg = ''): THREE.Material { this.keys.add('sign'); return this.mk(`sign:${text}:${bg}:${fg}`); }
  carPaint(color: string): THREE.Material { return this.mk(`car:${color}`); }
  setNight(): void { /* noop */ }
}

function build(seed = 1988) {
  const lots = subdivideLots(grid, POIS, new Rng(seed));
  const mats = new StubMaterials();
  const res = buildBuildings(lots, mats, new Rng(seed + 1));
  return { lots, mats, ...res };
}


describe('baked facade vertex AO', () => {
  const t0 = Date.now();
  const r = build();
  const buildMs = Date.now() - t0;
  const meshes: THREE.Mesh[] = [];
  r.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });

  it('every building mesh carries a colour attribute with weights in [AO_MIN, 1]', () => {
    let darkened = 0, total = 0;
    for (const m of meshes) {
      const c = m.geometry.getAttribute('color');
      expect(c, m.name).toBeTruthy();
      expect(c.count).toBe(m.geometry.getAttribute('position').count);
      expect((m.material as THREE.Material).vertexColors).toBe(true);
      for (let i = 0; i < c.count; i++) {
        const w = c.getX(i);
        expect(w).toBeGreaterThanOrEqual(AO_MIN - 1 / 255);
        expect(w).toBeLessThanOrEqual(1);
        total++;
        if (w < 0.9) darkened++;
      }
    }
    // reveals, bases and undersides are a minority of the surface but clearly present
    expect(darkened / total).toBeGreaterThan(0.02);
    expect(darkened / total).toBeLessThan(0.7);
  });

  it('is deterministic', () => {
    const r2 = build();
    const a = meshes.map((m) => m.geometry.getAttribute('color').array as Uint8Array);
    const b: Uint8Array[] = [];
    r2.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) b.push((o as THREE.Mesh).geometry.getAttribute('color').array as Uint8Array); });
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) expect(Array.from(b[i])).toEqual(Array.from(a[i]));
  });

  it('keeps the build cheap', () => { expect(buildMs).toBeLessThan(20000); });

  it('vertexAo: ground contact darkens, a reveal darkens with depth, an overhang darkens the wall under it', () => {
    const wallHigh = vertexAo(1, 3, 0, 0, 0, 1, [], []);
    const wallBase = vertexAo(1, 0, 0, 0, 0, 1, [], []);
    expect(wallHigh).toBe(1);
    expect(wallBase).toBeLessThan(0.8);
    const op = { lo: [0, 1, -0.3] as [number, number, number], hi: [1, 2, 0] as [number, number, number], ax: 2 as const, sign: 1 as const, plane: 0, depth: 0.3 };
    const front = vertexAo(0.5, 1.5, 0, 1, 0, 0, [op], []);
    const back = vertexAo(0.5, 1.5, -0.3, 1, 0, 0, [op], []);
    expect(back).toBeLessThan(front);
    expect(back).toBeGreaterThanOrEqual(AO_MIN);
    const free = vertexAo(0.5, 5, 0, 0, 0, 1, [], []);
    const under = vertexAo(0.5, 5, 0, 0, 0, 1, [], [{ x0: 0, x1: 2, y: 5.3, z0: 0, z1: 0.4 }]);
    expect(under).toBeLessThan(free);
    expect(vertexAo(0, 0, 0, 0, -1, 0, [op, op, op], [])).toBeGreaterThanOrEqual(AO_MIN);
  });
});
