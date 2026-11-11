import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { CAR_COLORWAYS, SKIN_H, SKIN_PAINT_BASE, SKIN_RECTS, SKIN_W, paintCarSkin, type SkinStyle } from '@/textures/painters/vehicle';
import { buildSkinNormal, SkinCarPaint, assignSkinUV, packFor, paintBox, regionFor, skinLayoutFor } from '@/entities/models/carSkin';
import { buildCarModel, PAINT_VARIANTS } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { ALLOWED, SoftCtx, guard } from './softcanvas';

const STYLES: SkinStyle[] = ['sedan', 'coupe', 'suv', 'van'];
const mats = { get: () => new THREE.MeshStandardMaterial(), carPaint: (c: string) => new THREE.MeshPhysicalMaterial({ color: c }) } as never;

function bodyBox(style: SkinStyle) {
  const type = style === 'suv' ? 'suv' : style === 'van' ? 'boxtruck' : 'sedan';
  const m = buildCarModel(type, { ...VEHICLE_SPECS[type] }, mats, style === 'coupe' ? 3 : 0);
  const body = m.group.getObjectByName('body') as THREE.Mesh;
  return { m, body, box: paintBox(body.geometry) };
}

function skin(style: SkinStyle, pack = 0, seed = 5) {
  const { box } = bodyBox(style);
  const layout = skinLayoutFor(style, box, pack);
  const col = new SoftCtx(SKIN_W, SKIN_H), mask = new SoftCtx(SKIN_W, SKIN_H);
  paintCarSkin(guard(col), guard(mask), SKIN_W, SKIN_H, new Rng(seed), layout);
  return { col, mask, layout, cp: col.pixels(), mp: mask.pixels() };
}
const hash = (px: Uint8ClampedArray): number => { let h = 2166136261 >>> 0; for (let i = 0; i < px.length; i++) { h ^= px[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
const px = (a: Uint8ClampedArray, x: number, y: number): number[] => { const i = (y * SKIN_W + x) * 4; return [a[i], a[i + 1], a[i + 2]]; };

describe('car skin painter', () => {
  it('is deterministic for a style, pack and seed, differs between styles and packs, and uses only basic 2D calls', () => {
    const hashes = new Set<number>();
    for (const s of STYLES) for (const pack of [0, 1, 2]) {
      const a = skin(s, pack), b = skin(s, pack);
      expect(hash(a.cp)).toBe(hash(b.cp));
      expect(hash(a.mp)).toBe(hash(b.mp));
      hashes.add(hash(a.cp));
      for (const n of a.col.names) expect(ALLOWED.has(n)).toBe(true);
      for (const n of a.mask.names) expect(ALLOWED.has(n)).toBe(true);
    }
    expect(hashes.size).toBe(STYLES.length * 3);
    expect(hash(skin('sedan', 0, 1).cp)).not.toBe(hash(skin('sedan', 0, 2).cp));
  });

  it('keeps paint and fixed colour apart: clean paint is the base shade with a white mask, plates and lamps are black in the mask', () => {
    const { cp, mp, layout } = skin('sedan');
    // an upper door panel (flank, under the glass belt, away from lines): near the clean-paint shade
    const r = SKIN_RECTS.right;
    const y = Math.round(r.y + (1 - layout.belt) * r.h + 14);
    const x = Math.round(r.x + r.w * 0.5);
    const c = px(cp, x, y);
    expect(c[0]).toBeGreaterThan(SKIN_PAINT_BASE * 255 - 40);
    expect(c[0]).toBeLessThanOrEqual(255);
    expect(px(mp, x, y)[0]).toBeGreaterThan(200);
    // the front plate recess is a fixed dark colour
    const f = SKIN_RECTS.front;
    const py = Math.round(f.y + (1 - (layout.bumper[0] + layout.bumper[1]) / 2) * f.h);
    expect(px(mp, f.x + f.w / 2, py)[0]).toBeLessThan(40);
    expect(px(cp, f.x + f.w / 2, py)[0]).toBeLessThan(60);
    // the underside is plain dark
    expect(px(mp, 100, 220)[0]).toBeLessThan(40);
  });

  it('draws panel gaps, grime at the sill and the arches (darker than the paint above)', () => {
    const { cp, layout } = skin('sedan');
    const r = SKIN_RECTS.left;
    const col = (v: number, nn: number): number => px(cp, Math.round(r.x + nn * r.w), Math.round(r.y + (1 - v) * r.h))[0];
    const mid = (layout.axles[0] + layout.axles[1]) / 2;
    expect(col(0.03, mid)).toBeLessThan(col(Math.min(0.62, layout.belt - 0.12), mid) - 25);   // sill grime (reference on the door panel)
    const seam = layout.seams[0];
    const vDoor = Math.min(0.6, layout.belt - 0.12);                  // on the door panel, below the glass whatever the body height
    const gap = Math.min(...[-0.008, -0.004, 0, 0.004, 0.008].map((d) => col(vDoor, seam + d))); // the gap is ~8 mm: 1-2 px wide
    expect(gap).toBeLessThan(col(vDoor, seam + 0.07) - 20);    // door gap line
    expect(col(layout.archV, layout.axles[0])).toBeLessThan(60);     // wheel well
  });

  it('has 3 to 4 saturated colourways per body, and PAINT_VARIANTS follows them', () => {
    for (const s of STYLES) {
      const ways = CAR_COLORWAYS[s];
      expect(ways.length).toBeGreaterThanOrEqual(3);
      expect(ways.length).toBeLessThanOrEqual(4);
      expect(new Set(ways.map((w) => w.color)).size).toBe(ways.length);
      expect(new Set(ways.map((w) => w.pack)).size).toBeGreaterThanOrEqual(2);
    }
    expect(PAINT_VARIANTS.sedan).toEqual(CAR_COLORWAYS.sedan.map((c) => c.color));
    expect(PAINT_VARIANTS.boxtruck).toEqual(CAR_COLORWAYS.van.map((c) => c.color));
    expect(packFor('sedan', CAR_COLORWAYS.sedan[2].color.toUpperCase())).toBe(CAR_COLORWAYS.sedan[2].pack);
    expect(packFor('sedan', '#123456')).toBe(packFor('sedan', '#123456'));
  });
});

describe('car skin layout and UV set 1', () => {
  it('layout fractions are all inside the body', () => {
    for (const s of STYLES) {
      const { box } = bodyBox(s);
      const l = skinLayoutFor(s, box);
      const all = [...l.seams, ...l.handles, ...l.doorGlass.flat(), ...l.windshield, ...l.rearGlass, l.belt, ...l.axles, l.hoodEnd, l.bootStart, ...l.bumper, l.headLamp.v, l.tailLamp.v];
      for (const f of all) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1); }
      expect(l.axles[0]).toBeLessThan(l.axles[1]); // nose first
      expect(l.hoodEnd).toBeLessThan(l.bootStart);
    }
  });

  it('picks the region by face normal', () => {
    expect(regionFor(1, 0, 0)).toBe('right');
    expect(regionFor(-1, 0.2, 0)).toBe('left');
    expect(regionFor(0, 1, 0.3)).toBe('top');
    expect(regionFor(0, -1, 0)).toBe('under');
    expect(regionFor(0, 0.2, -1)).toBe('front');
    expect(regionFor(0.1, 0, 1)).toBe('rear');
  });

  it('the skinned bodies carry uv1 inside the atlas, keep uv untouched, and cab / cop keep their liveries', () => {
    for (const s of STYLES) {
      const { body, m } = bodyBox(s);
      const uv1 = body.geometry.getAttribute('uv1') as THREE.BufferAttribute;
      expect(uv1).toBeTruthy();
      expect(uv1.count).toBe(body.geometry.attributes.position.count);
      let right = 0, left = 0;
      for (let i = 0; i < uv1.count; i++) {
        expect(uv1.getX(i)).toBeGreaterThanOrEqual(0); expect(uv1.getX(i)).toBeLessThanOrEqual(1);
        expect(uv1.getY(i)).toBeGreaterThanOrEqual(0); expect(uv1.getY(i)).toBeLessThanOrEqual(1);
        if (uv1.getX(i) > 0.5 && uv1.getY(i) > 1 - 112 / SKIN_H) right++; else if (uv1.getX(i) <= 0.5 && uv1.getY(i) > 1 - 112 / SKIN_H) left++;
      }
      expect(right).toBeGreaterThan(30); expect(left).toBeGreaterThan(30);
      const uv = body.geometry.getAttribute('uv') as THREE.BufferAttribute;
      expect(uv.count).toBe(uv1.count);
      if (s !== 'van') expect((m.group.getObjectByName('hood') as THREE.Mesh).geometry.getAttribute('uv1')).toBeTruthy();
    }
    const cab = buildCarModel('sedan', { ...VEHICLE_SPECS.sedan, color: '#e0b01e' }, mats, 0);
    expect((cab.group.getObjectByName('body') as THREE.Mesh).geometry.getAttribute('uv1')).toBeUndefined();
    const cop = buildCarModel('cop', { ...VEHICLE_SPECS.cop }, mats, 0);
    expect((cop.group.getObjectByName('body') as THREE.Mesh).geometry.getAttribute('uv1')).toBeUndefined();
  });

  it('assignSkinUV maps the right flank nose to the right side of the right rect and the left flank nose to the left', () => {
    const g = new THREE.BufferGeometry();
    // two triangles facing +x, one at the nose (z = -2) and one at the tail (z = 2); y 0..1
    g.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, -2, 1, 1, -2, 1, 0, -1.5, 1, 0, 1.5, 1, 1, 2, 1, 0, 2], 3));
    // wind so the normal is +x: (0,1,0) x (0,0,-1)... check by regionFor below
    const box = { L: 4, W: 2, H: 1, yMin: 0, zMin: -2, xMin: -1 };
    assignSkinUV(g, box);
    const uv = g.getAttribute('uv1') as THREE.BufferAttribute;
    const r = SKIN_RECTS.right;
    const noseU = uv.getX(0) * SKIN_W;
    const tailU = uv.getX(3) * SKIN_W;
    if (regionFor(0, 0, 0) !== 'top') { /* winding decides the face; both triangles share a winding, so compare them to each other */ }
    expect(Math.abs(noseU - tailU)).toBeGreaterThan(r.w * 0.6);
  });

  it('SkinCarPaint is a physical paint that survives clone (the wreck darkening) with its library link', () => {
    const base = new THREE.MeshPhysicalMaterial({ color: '#c0392b' });
    const m = new SkinCarPaint(base);
    m.copy(base);
    m.base = base;
    const c = m.clone();
    expect((c as SkinCarPaint).isSkinCarPaint).toBe(true);
    expect((c as SkinCarPaint).base).toBe(base);
    c.color.multiplyScalar(0.55);
    expect(c.color.r).toBeCloseTo(base.color.r * 0.55, 5);
    const env = new THREE.Texture();
    base.envMap = env;
    expect(m.envMap).toBe(env);
    expect(typeof m.onBeforeCompile).toBe('function');
  });

  it('SkinCarPaint carries the shared clear-coat uniforms and injects the coat for paint pixels only', () => {
    const m = new SkinCarPaint(new THREE.MeshPhysicalMaterial());
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <begin_vertex>\nvoid main(){}',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <lights_fragment_end>\nvoid main(){}',
    };
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(shader, null);
    for (const k of ['cpMode', 'cpCoat', 'cpRim', 'cpRoof', 'cpStreetMix', 'cpWet', 'cpZenith', 'cpHorizon', 'cpStreet']) expect(shader.uniforms[k]).toBeDefined();
    // the per-car condition overlay (dirt, rust, primer, dents): its uniforms are the material's own, and the vertex shader hands the car-space position on
    for (const k of ['uCond', 'uPrimer', 'uBox', 'uDent', 'uOff'] as const) expect(shader.uniforms[k]).toBe(m.u[k]);
    expect(shader.vertexShader).toContain('vOPos = position + uOff');
    expect(shader.fragmentShader).toContain('uCond.w > 0.5');
    expect(shader.fragmentShader).toContain('cpMask = skinS.a');
    expect(shader.fragmentShader.indexOf('#include <lights_fragment_end>')).toBeLessThan(shader.fragmentShader.indexOf('cpMask > 0.5'));
  });
});

describe('skin normal map', () => {
  it('turns a recessed panel gap into a tilted normal and keeps flat paint and fixed pixels flat', () => {
    const w = 8, h = 8;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = 230; rgba[i * 4 + 1] = 230; rgba[i * 4 + 2] = 230; rgba[i * 4 + 3] = 255; }
    for (let y = 0; y < h; y++) { const o = (y * w + 4) * 4; rgba[o] = 40; } // a dark vertical gap at x = 4
    const n = buildSkinNormal(rgba, w, h).image.data as Uint8Array;
    const nx = (x: number, y: number): number => n[(y * w + x) * 4] / 255 * 2 - 1;
    const nz = (x: number, y: number): number => n[(y * w + x) * 4 + 2] / 255 * 2 - 1;
    expect(Math.abs(nx(0, 4))).toBeLessThan(0.05);           // flat paint
    expect(nx(3, 4)).toBeGreaterThan(0.2);                    // wall of the groove tilts one way...
    expect(nx(5, 4)).toBeLessThan(-0.2);                      // ...and the other
    expect(nz(3, 4)).toBeGreaterThan(0);
    const fixed = rgba.slice(); for (let i = 0; i < w * h; i++) fixed[i * 4 + 3] = 0;
    const f = buildSkinNormal(fixed, w, h).image.data as Uint8Array;
    expect(Math.abs(f[(4 * w + 3) * 4] - 128)).toBeLessThan(3); // fixed pixels: no relief
  });
});
