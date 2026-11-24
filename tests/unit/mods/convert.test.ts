import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildDff as build, imageSize, checkImage, txdTexture } from '@/mods/convert';
import { parseDff } from '@/mods/rw/dff';
import { LIMITS } from '@/mods/limits';
import { carDff } from './carFixture';
import { buildDff, cubeGeo } from './rwWriters';

const L = LIMITS.high;

describe('buildDff (RenderWare clump to three objects)', () => {
  it('turns z-up into y-up with the front at -z, names wheels, finds paint, and leaves out damaged parts', () => {
    const b = build(parseDff(carDff(), L), new Map());
    const names = b.root.children.map((c) => c.name);
    expect(names.filter((n) => /^wheel_/.test(n)).sort()).toEqual(['wheel_f_l', 'wheel_f_r', 'wheel_r_l', 'wheel_r_r']);
    expect(names).not.toContain('chassis_dam');
    const box = new THREE.Box3().setFromObject(b.root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2.04, 3);  // width: body 2 m, wheels poke 2 cm out each side
    expect(size.z).toBeCloseTo(4, 3);  // length (was y)
    expect(box.min.y).toBeCloseTo(0, 3); // wheels stand on the ground (was z = 0)
    const front = b.root.children.find((c) => c.name === 'wheel_f_l')!;
    expect(new THREE.Box3().setFromObject(front).getCenter(new THREE.Vector3()).z).toBeLessThan(0); // GTA +y (forward) is -z here
    let paint = 0;
    b.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material) && m.material.name === 'paint') paint++; });
    expect(paint).toBeGreaterThan(0);
    expect(b.triangles).toBe(12 + 4 * 12);
  });

  it('keeps triangles facing outward (winding follows the normals)', () => {
    const geo = cubeGeo(-1, -1, -1, 1, 1, 1);
    // the cube's triangles are counter-clockwise from outside; normals point away from the centre
    geo.normals = [];
    for (let i = 0; i < 8; i++) { const p = geo.positions.slice(i * 3, i * 3 + 3); const l = Math.hypot(p[0], p[1], p[2]); geo.normals.push(p[0] / l, p[1] / l, p[2] / l); }
    for (const flip of [false, true]) {
      const g = { ...geo, tris: geo.tris.map((t) => (flip ? ([t[0], t[2], t[1], t[3]] as typeof t) : t)) };
      const root = build(parseDff(buildDff({ frames: [{ name: 'a' }, { name: 'b', parent: 0 }], geos: [g] }), L), new Map()).root;
      let outward = 0, total = 0;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const p = m.geometry.getAttribute('position'), ix = m.geometry.index!;
        for (let t = 0; t < ix.count; t += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(p, ix.getX(t)), b = new THREE.Vector3().fromBufferAttribute(p, ix.getX(t + 1)), c = new THREE.Vector3().fromBufferAttribute(p, ix.getX(t + 2));
          const n = b.clone().sub(a).cross(c.clone().sub(a));
          const centre = a.clone().add(b).add(c).divideScalar(3);
          total++; if (n.dot(centre) > 0) outward++;
        }
      });
      expect(total).toBe(12);
      expect(outward).toBe(12);
    }
  });
});

describe('image sniffing', () => {
  const png = (w: number, h: number): Uint8Array => { const b = new Uint8Array(32); const dv = new DataView(b.buffer); dv.setUint32(0, 0x89504e47); dv.setUint32(4, 0x0d0a1a0a); dv.setUint32(16, w); dv.setUint32(20, h); return b; };
  it('reads png sizes from the header', () => { expect(imageSize(png(640, 480))).toEqual({ width: 640, height: 480, type: 'png' }); });
  it('reads jpeg sizes', () => {
    const b = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 0, 2, 0, 3, 1, 0, 0]);
    expect(imageSize(b)).toEqual({ width: 512, height: 256, type: 'jpeg' });
  });
  it('refuses unreadable and oversize images before decoding', () => {
    expect(() => checkImage('x.png', new Uint8Array(40), L)).toThrow(/not a readable/);
    expect(() => checkImage('big.png', png(8192, 8192), L)).toThrow(/8192 x 8192/);
    expect(() => checkImage('mid.png', png(1024, 1024), LIMITS.phone)).toThrow(/allows up to 512/);
    expect(checkImage('ok.png', png(512, 512), LIMITS.phone).width).toBe(512);
  });
  it('flips ground texture rows', () => {
    const rgba = Uint8Array.from([1, 1, 1, 255, 2, 2, 2, 255]);
    const t = txdTexture({ name: 'a', mask: '', width: 1, height: 2, rgba, hasAlpha: false, encoding: 'x' }, true);
    expect(Array.from((t.image.data as Uint8Array).slice(0, 4))).toEqual([2, 2, 2, 255]);
  });
});
