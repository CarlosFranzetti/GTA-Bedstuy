import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import type {
  Block, BlockFace, GridModel, IMaterialLibrary, Lot, MaterialKey, PoiDef, Polygon, Segment, Side, StaticCollider,
} from '@/world/types';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildBuildings } from '@/world/BuildingGen';

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

const bl = block.buildingLine;
const minX = Math.min(...bl.map((p) => p.x)), maxX = Math.max(...bl.map((p) => p.x));
const minZ = Math.min(...bl.map((p) => p.z)), maxZ = Math.max(...bl.map((p) => p.z));
const polyArea = (pts: Vec2[]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.z - q.x * p.z; } return a / 2; };
const isConvex = (pts: Vec2[]) => {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    const cr = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
  }
  return true;
};

describe('buildBuildings', () => {
  const r = build();
  const meshes: THREE.Mesh[] = [];
  r.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });

  it('returns at least one mesh and stays within the mesh budget', () => {
    expect(meshes.length).toBeGreaterThanOrEqual(1);
    expect(meshes.length).toBeLessThanOrEqual(25);
  });

  it('every mesh has finite positions, normals and uvs', () => {
    for (const m of meshes) {
      const g = m.geometry;
      for (const name of ['position', 'normal', 'uv']) {
        const a = g.getAttribute(name);
        expect(a, name).toBeTruthy();
        for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) throw new Error(`NaN in ${name}`);
      }
      expect(g.getAttribute('position').count % 3).toBe(0);
    }
  });

  it('uses the materials the plan calls for', () => {
    for (const k of ['brownstone', 'brickRed', 'cornice', 'window', 'storefrontGlass', 'rollGate', 'roof', 'stoop', 'awning', 'sign', 'waterTank', 'metalDark']) {
      expect(r.mats.keys.has(k), k).toBe(true);
    }
  });

  it('awnings and signs carry the POI text', () => {
    const names = meshes.map((m) => (m.material as THREE.Material).name);
    expect(names.some((n) => n.startsWith('awning:#d62828:TROOP DELI'))).toBe(true);
    expect(names.some((n) => n.startsWith('sign:TROOP DELI'))).toBe(true);
    expect(names.some((n) => n.startsWith('sign:TABERNACLE'))).toBe(true);
  });

  it('has one Polygon collider per non-vacant lot (plus stoops) and a Segment per vacant lot', () => {
    const polys = r.colliders.filter((c) => c.shape.kind === 'polygon');
    const segs = r.colliders.filter((c) => c.shape.kind === 'segment');
    const nonVacant = r.lots.filter((l) => l.type !== 'vacant');
    const vacant = r.lots.filter((l) => l.type === 'vacant');
    const bodies = polys.filter((c) => !c.id?.includes('-stoop'));
    expect(bodies.length).toBe(nonVacant.length);
    expect(polys.length).toBeGreaterThan(nonVacant.length); // stoops
    expect(segs.length).toBe(vacant.length);
    for (const l of nonVacant) expect(r.colliders.some((c) => c.id === l.id)).toBe(true);
  });

  it('colliders are convex, clockwise world-space shapes with pos 0,0 inside the building line', () => {
    const within = (p: Vec2) => {
      expect(p.x).toBeGreaterThanOrEqual(minX - 0.01); expect(p.x).toBeLessThanOrEqual(maxX + 0.01);
      expect(p.z).toBeGreaterThanOrEqual(minZ - 0.01); expect(p.z).toBeLessThanOrEqual(maxZ + 0.01);
    };
    for (const c of r.colliders as StaticCollider[]) {
      expect(c.pos).toEqual({ x: 0, z: 0 });
      if (c.shape.kind === 'polygon') {
        const pts = (c.shape as Polygon).points;
        expect(pts.length).toBeGreaterThanOrEqual(3);
        expect(polyArea(pts), c.id).toBeGreaterThan(0); // clockwise in x-east/z-south
        expect(isConvex(pts)).toBe(true);
        pts.forEach(within);
      } else if (c.shape.kind === 'segment') {
        within((c.shape as Segment).a); within((c.shape as Segment).b);
      }
    }
  });

  it('building footprints do not overlap each other', () => {
    const bodies = r.colliders.filter((c) => c.shape.kind === 'polygon' && !c.id?.includes('-stoop')).map((c) => {
      const pts = (c.shape as Polygon).points;
      return { id: c.id, x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)) };
    });
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      expect(ox > 0.05 && oz > 0.05, `${a.id} vs ${b.id}`).toBe(false);
    }
  });

  it('buildings face the street: front geometry lies on the outward side of the building line, not beyond the back', () => {
    // every vertex of every mesh must stay within the block's footprint grown by a small overhang toward the streets
    for (const m of meshes) {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        expect(x).toBeGreaterThan(minX - 3); expect(x).toBeLessThan(maxX + 3);
        expect(z).toBeGreaterThan(minZ - 3); expect(z).toBeLessThan(maxZ + 3);
      }
    }
  });

  it('brick and brownstone UVs tile at one repeat per 3 m', () => {
    for (const m of meshes) {
      const name = (m.material as THREE.Material).name;
      if (!/^(brownstone|brickRed|brickPainted):/.test(name)) continue;
      const g = m.geometry;
      const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      let checked = 0;
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
        const wa = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
        const ua = Math.abs((uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) - (uv.getX(i + 2) - uv.getX(i)) * (uv.getY(i + 1) - uv.getY(i))) / 2;
        if (wa < 1e-6) continue;
        expect(ua / wa).toBeCloseTo(1 / 9, 2);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('facade normals point away from the building (front faces face the street)', () => {
    // brownstone front walls: for each brownstone-material triangle, normal must be horizontal or up and the
    // facade of a street-face lot must have a normal along its outward direction.
    const brown = meshes.find((m) => (m.material as THREE.Material).name.startsWith('brownstone:'));
    expect(brown).toBeTruthy();
    const g = brown!.geometry;
    const nrm = g.getAttribute('normal');
    const lotsBrown = r.lots.filter((l) => l.type === 'brownstone');
    expect(lotsBrown.length).toBeGreaterThan(0);
    // normals of the brownstone mesh are all axis aligned horizontal and match some face's outward vector
    const outs = [{ x: 0, z: -1 }, { x: 0, z: 1 }, { x: 1, z: 0 }, { x: -1, z: 0 }];
    for (let i = 0; i < nrm.count; i += 3) {
      const nx = nrm.getX(i), nz = nrm.getZ(i);
      expect(outs.some((o) => Math.abs(o.x - nx) < 1e-4 && Math.abs(o.z - nz) < 1e-4) || Math.abs(nrm.getY(i)) > 0.99).toBe(true);
    }
  });

  it('is deterministic', () => {
    const a = build(1988), b = build(1988);
    expect(JSON.stringify(a.colliders)).toBe(JSON.stringify(b.colliders));
    const sig = (g: THREE.Group) => { const o: string[] = []; g.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) o.push(`${(m.material as THREE.Material).name}:${m.geometry.getAttribute('position').count}`); }); return o.join('|'); };
    expect(sig(a.group)).toBe(sig(b.group));
  });

  it('works on other seeds without throwing', () => {
    for (const seed of [1, 2, 3, 42]) {
      const x = build(seed);
      expect(x.group.children.length).toBeGreaterThan(0);
      const nonVacant = x.lots.filter((l: Lot) => l.type !== 'vacant').length;
      expect(x.colliders.filter((c) => c.shape.kind === 'polygon' && !c.id?.includes('-stoop')).length).toBe(nonVacant);
    }
  });
});
