import { describe, it, expect } from 'vitest';
import { parseDff, rwVersion } from '@/mods/rw/dff';
import { LIMITS, ModError } from '@/mods/limits';
import { buildDff, cubeGeo, chunk, w, STAMP_III, STAMP_SA } from './rwWriters';

const HIGH = LIMITS.high;

describe('rwVersion', () => {
  it('decodes library stamps', () => {
    expect(rwVersion(STAMP_SA)).toBe(0x36003);
    expect(rwVersion(0x0c02ffff)).toBeLessThan(0x34000);
    expect(rwVersion(0x1003ffff)).toBeGreaterThanOrEqual(0x34000);
  });
});

describe('parseDff', () => {
  const frames = [{ name: 'chassis_dummy' }, { name: 'chassis', pos: [0, 0.5, 0] as [number, number, number], parent: 0 }];
  for (const [label, stamp] of [['3.6 (newer struct)', STAMP_SA], ['older stamp with lighting floats', STAMP_III]] as const) {
    it(`reads a cube with two materials, ${label}`, () => {
      const geo = cubeGeo();
      geo.normals = new Array(24).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0));
      const c = parseDff(buildDff({ stamp, frames, geos: [geo] }), HIGH);
      expect(c.frames.map((f) => f.name)).toEqual(['chassis_dummy', 'chassis']);
      expect(c.frames[1].position).toEqual([0, 0.5, 0]);
      expect(c.frames[1].parent).toBe(0);
      expect(c.geometries).toHaveLength(1);
      const g = c.geometries[0];
      expect(g.vertexCount).toBe(8);
      expect(Array.from(g.positions.slice(0, 6))).toEqual([-1, -2, 0, 1, -2, 0]);
      expect(g.indices.length / 3).toBe(12);
      expect(Array.from(g.indices.slice(0, 3))).toEqual([0, 3, 2]); // v1, v2, v3 from the file's v2, v1, mat, v3 order
      expect(Array.from(g.uvs!.slice(0, 4))).toEqual([0, 0, 1, 0]);
      expect(g.normals).not.toBeNull();
      expect(g.materials.map((m) => m.texture)).toEqual([null, 'glass']);
      expect(g.materials[0].color).toEqual([60, 255, 0, 255]);
      expect(Array.from(g.triMaterial.slice(0, 4))).toEqual([1, 1, 1, 1]);
      expect(c.atomics).toEqual([{ frame: 1, geometry: 0 }]);
    });
  }

  it('reads a triangle list from the Bin Mesh when the geometry struct has none, and unrolls strips', () => {
    const geo = cubeGeo();
    geo.binMesh = { strip: true, meshes: [{ material: 0, indices: [0, 1, 3, 2, 2, 4, 4, 5, 6] }] };
    const c = parseDff(buildDff({ frames, geos: [geo] }), HIGH);
    const g = c.geometries[0];
    // strip 0 1 3 2: tris (0,1,3) and (2,3,1); 2 2 4 4 5 6: degenerates skipped, (4,5,6) kept
    expect(Array.from(g.indices)).toEqual([0, 1, 3, 3, 1, 2, 4, 5, 6]);
    expect(Array.from(g.triMaterial)).toEqual([0, 0, 0]);
    for (const v of g.indices) expect(v).toBeLessThan(8);
  });

  it('refuses PlayStation 2 / Xbox native geometry', () => {
    const geo = cubeGeo(); geo.native = true;
    expect(() => parseDff(buildDff({ frames, geos: [geo] }), HIGH)).toThrow(/native/i);
  });

  it('refuses a file that is not a clump', () => {
    expect(() => parseDff(chunk(0x16, STAMP_SA, new Uint8Array(40)), HIGH)).toThrow(ModError);
    expect(() => parseDff(new Uint8Array(10), HIGH)).toThrow(/not a RenderWare/);
  });

  it('refuses counts over the tier budget before reading the data', () => {
    const geo = cubeGeo();
    geo.claimVerts = 10_000_000;
    expect(() => parseDff(buildDff({ frames, geos: [geo] }), HIGH)).toThrow(/vertices/);
    const g2 = cubeGeo(); g2.claimTris = 4_000_000_000;
    expect(() => parseDff(buildDff({ frames, geos: [g2] }), HIGH)).toThrow(/triangles/);
    expect(() => parseDff(buildDff({ frames, geos: [cubeGeo()] }), { ...HIGH, maxVertices: 4 })).toThrow(/vertices/);
    expect(() => parseDff(buildDff({ frames, geos: [cubeGeo()] }), { ...HIGH, maxModelFileBytes: 100 })).toThrow(/too large/);
  });

  it('refuses a triangle that points past the vertices', () => {
    const geo = cubeGeo(); geo.tris[0] = [0, 1, 99, 0];
    expect(() => parseDff(buildDff({ frames, geos: [geo] }), HIGH)).toThrow(/past the end/);
  });

  it('never throws anything but ModError on truncated or damaged files', () => {
    const good = buildDff({ frames, geos: [cubeGeo()] });
    for (let cut = 0; cut < good.length; cut += 7) {
      try { parseDff(good.subarray(0, cut), HIGH); } catch (e) { expect(e).toBeInstanceOf(ModError); }
    }
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    for (let n = 0; n < 300; n++) {
      const bad = good.slice();
      for (let k = 0; k < 6; k++) bad[rnd() % bad.length] = rnd() & 255;
      try { parseDff(bad, HIGH); } catch (e) { expect(e).toBeInstanceOf(ModError); }
    }
    for (let n = 0; n < 50; n++) {
      const junk = new Uint8Array(200); for (let i = 0; i < junk.length; i++) junk[i] = rnd() & 255;
      junk.set(w().u32(0x10).u32(188).u32(STAMP_SA).done(), 0);
      try { parseDff(junk, HIGH); } catch (e) { expect(e).toBeInstanceOf(ModError); }
    }
  });
});
