import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DistanceCuller, beyondRange, cellOf, shouldHide, splitGeometryByCell, splitMeshesIntoCells } from '@/render/Culling';

describe('beyondRange', () => {
  it('hides only when the whole sphere is out of range', () => {
    expect(beyondRange(100, 0, 0, 0, 0, 220)).toBe(false);
    expect(beyondRange(221, 0, 0, 0, 0, 220)).toBe(true);
    expect(beyondRange(221, 0, 10, 0, 0, 220)).toBe(false); // sphere reaches back inside
    expect(beyondRange(231.1, 0, 10, 0, 0, 220)).toBe(true);
    expect(beyondRange(0, -300, 0, 0, 0, 220)).toBe(true);
  });
  it('uses planar distance (ignores height)', () => {
    expect(beyondRange(150, 150, 0, 0, 0, 220)).toBe(false); // 212 m diagonal
    expect(beyondRange(160, 160, 0, 0, 0, 220)).toBe(true);  // 226 m diagonal
  });
  it('hysteresis: a hidden object returns only once margin m inside the range', () => {
    expect(shouldHide(false, 218, 0, 0, 0, 0, 220)).toBe(false);
    expect(shouldHide(true, 218, 0, 0, 0, 0, 220, 6)).toBe(true);
    expect(shouldHide(true, 210, 0, 0, 0, 0, 220, 6)).toBe(false);
  });
});

describe('cellOf', () => {
  it('bins coordinates into the grid', () => {
    const k = { ix: 0, iz: 0 };
    expect(cellOf(10, 10, 125, 100, k)).toEqual({ ix: 0, iz: 0 });
    expect(cellOf(-1, 100, 125, 100, k)).toEqual({ ix: -1, iz: 1 });
  });
});

function twoClusterGeometry(): THREE.BufferGeometry {
  // two boxes far apart in x, merged into one indexed geometry
  const a = new THREE.BoxGeometry(2, 2, 2); a.translate(-300, 0, 50);
  const b = new THREE.BoxGeometry(2, 2, 2); b.translate(300, 0, 50);
  const pos = new Float32Array([...(a.attributes.position.array as Float32Array), ...(b.attributes.position.array as Float32Array)]);
  const nor = new Float32Array([...(a.attributes.normal.array as Float32Array), ...(b.attributes.normal.array as Float32Array)]);
  const uv = new Float32Array([...(a.attributes.uv.array as Float32Array), ...(b.attributes.uv.array as Float32Array)]);
  const off = a.attributes.position.count;
  const idx = [...Array.from(a.index!.array), ...Array.from(b.index!.array, (i) => i + off)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

describe('splitGeometryByCell', () => {
  it('separates distant clusters, preserves triangle count and tightens bounds', () => {
    const g = twoClusterGeometry();
    const parts = splitGeometryByCell(g, 125, 100)!;
    expect(parts.size).toBe(2);
    let tris = 0;
    for (const p of parts.values()) {
      tris += p.index!.count / 3;
      expect(p.getAttribute('uv').count).toBe(p.getAttribute('position').count);
      expect(p.boundingSphere!.radius).toBeLessThan(5);
    }
    expect(tris).toBe(g.index!.count / 3);
  });
  it('works on non-indexed geometry', () => {
    const g = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    g.translate(10, 0, 50); g.clearGroups();
    const parts = splitGeometryByCell(g, 125, 100)!;
    expect(parts.size).toBe(1);
    expect([...parts.values()][0].index!.count / 3).toBe(12);
  });
});

describe('splitMeshesIntoCells', () => {
  it('replaces a merged mesh with per-cell meshes that keep name, material and flags', () => {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    const m = new THREE.Mesh(twoClusterGeometry(), mat);
    m.name = 'lamp-head'; m.castShadow = true;
    group.add(m);
    const stats = { meshesBefore: 0, meshesAfter: 0, trianglesAfter: 0 };
    const cells = splitMeshesIntoCells(group, 125, 100, stats);
    expect(cells).toHaveLength(2);
    expect(group.children).toHaveLength(2);
    for (const c of cells) {
      expect(c.name).toBe('lamp-head');
      expect(c.material).toBe(mat);
      expect(c.castShadow).toBe(true);
      expect(typeof c.userData.cell).toBe('string');
    }
    expect(stats).toMatchObject({ meshesBefore: 1, meshesAfter: 2 });
  });
});

describe('DistanceCuller', () => {
  it('hides static cells beyond range and shows them again when close', () => {
    const g = new THREE.BoxGeometry(10, 10, 10);
    const near = new THREE.Mesh(g), far = new THREE.Mesh(g);
    near.position.set(50, 0, 0); far.position.set(500, 0, 0);
    const holder = new THREE.Group(); holder.add(near, far);
    const c = new DistanceCuller(220);
    c.addStatic(near); c.addStatic(far);
    c.update(0, 0);
    expect(near.visible).toBe(true); expect(far.visible).toBe(false);
    c.update(400, 0);
    expect(near.visible).toBe(false); expect(far.visible).toBe(true);
    expect(c.hiddenCount).toBe(1);
  });
  it('dynamic objects: only restores what it hid itself', () => {
    const c = new DistanceCuller(220);
    const car = new THREE.Group(), other = new THREE.Group();
    other.visible = false;
    expect(c.applyTo(car, 500, 0, 0, 0)).toBe(true);
    expect(car.visible).toBe(false);
    expect(c.applyTo(car, 10, 0, 0, 0)).toBe(false);
    expect(car.visible).toBe(true);
    c.applyTo(other, 10, 0, 0, 0);
    expect(other.visible).toBe(false); // hidden by someone else: untouched
  });
});
