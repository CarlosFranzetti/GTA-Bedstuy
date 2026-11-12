/**
 * FACADES: wall, window, shop-glass and el-steel shaders ride on vertex attributes and patches only (no new meshes, no new
 * materials, no new draw calls). These tests pin the baked data (storey phase, roof height, window seeds, door leaves) and the
 * shape of every patch (it chains existing hooks, injects its own chunks, leaves nothing unreplaced).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { KIND_STEP, ROOF_SCALE, WallKind, lotColourway, doorTone } from '@/world/buildings/colourway';
import { LotBatch, UPPER_H } from '@/world/buildings/facade';
import { patchLotTone } from '@/textures/lotTone';
import { patchWindow, patchShopGlass } from '@/textures/windowShader';
import { patchElSteel } from '@/textures/elSteel';

const mat = (name: string): THREE.Material => { const m = new THREE.MeshBasicMaterial(); m.name = name; return m; };
const shaderOf = (): THREE.WebGLProgramParametersWithUniforms => ({
  vertexShader: '#include <common>\n#include <begin_vertex>',
  fragmentShader: '#include <common>\n#include <color_fragment>\n#include <map_fragment>\n#include <emissivemap_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
  uniforms: {},
}) as unknown as THREE.WebGLProgramParametersWithUniforms;

function bake(fn: (b: LotBatch, wall: THREE.Material, win: THREE.Material, metal: THREE.Material) => void) {
  const wall = mat('brickRed:0'), win = mat('window:0'), metal = mat('metalDark:0');
  const b = new LotBatch();
  b.setColourway(lotColourway({ id: 'lot-f', type: 'rowhouse' }), new Set([wall]));
  fn(b, wall, win, metal);
  b.flush(new THREE.Matrix4());
  const by = new Map<string, THREE.BufferGeometry>();
  for (const { material, geometry } of b.merged()) by.set(material.name, geometry);
  return by;
}

describe('stain placement data', () => {
  it('stores the roof-line height in the alpha of the wall colour attribute and the sill phase in the kind byte', () => {
    const sillY = 1.0 + 3.3 + 0.9; // an upper-storey sill
    const g = bake((b, wall) => {
      b.box(wall, 0, 0, -3, 5, 9.4, 0);
      b.addOpening({ x0: 1, x1: 2, y0: sillY, y1: sillY + 1.5 }, 0, 0.2);
    }).get('brickRed:0')!;
    const col = g.getAttribute('color'), st = g.getAttribute('aStyle');
    expect(Math.round(col.getW(0) * 255)).toBe(Math.round((9.4 / ROOF_SCALE) * 255));
    const byte = Math.round(st.getX(0) * 255);
    const kind = Math.floor(byte / KIND_STEP), q = byte - kind * KIND_STEP;
    expect(kind).toBeLessThanOrEqual(WallKind.party);
    expect(q).toBeLessThanOrEqual(20);
    expect(q).toBe(Math.round(((sillY % UPPER_H) / UPPER_H) * 20));
  });

  it('marks "no sill found" with phase 21 and keeps every kind byte inside 0..255', () => {
    const g = bake((b, wall) => b.box(wall, 0, 0, -3, 5, 5, 0)).get('brickRed:0')!;
    const byte = Math.round(g.getAttribute('aStyle').getX(0) * 255);
    expect(byte - Math.floor(byte / KIND_STEP) * KIND_STEP).toBe(21);
    for (const k of Object.values(WallKind)) expect(k * KIND_STEP + 21).toBeLessThanOrEqual(255);
  });
});

describe('window seeds', () => {
  it('gives every vertex of one window the same seed, two windows different seeds, and never a zero z (the shader marker)', () => {
    const g = bake((b, _w, win) => {
      b.rect(win, [1, 1, 0], [1, 0, 0], [0, 1.5, 0], { uvRect: [0.05, 0.05, 0.95, 0.92] });
      b.rect(win, [3, 1, 0], [1, 0, 0], [0, 1.5, 0], { uvRect: [0.05, 0.05, 0.95, 0.92] });
      b.rect(win, [1, 4, 0], [1, 0, 0], [0, 1.5, 0], { uvRect: [0.05, 0.05, 0.95, 0.92] });
    }).get('window:0')!;
    const s = g.getAttribute('aStyle');
    const seed = (i: number): string => [s.getX(i), s.getY(i), s.getZ(i)].join(',');
    for (let w = 0; w < 3; w++) for (let k = 1; k < 6; k++) expect(seed(w * 6 + k)).toBe(seed(w * 6));
    expect(new Set([seed(0), seed(6), seed(12)]).size).toBe(3);
    for (let i = 0; i < s.count; i++) expect(s.getZ(i)).toBeGreaterThan(0);
    // windows stay untinted for the wall shader (alpha 0) so no wall code runs on glass
    expect(g.getAttribute('aTone').getW(0)).toBe(0);
  });
});

describe('door leaves', () => {
  it('paints the leaf as a door in the lot door colour with its own 0..1 coordinates, and leaves other metal alone', () => {
    const cw = lotColourway({ id: 'lot-f', type: 'rowhouse' });
    const g = bake((b, _w, _win, metal) => {
      b.doorLeaf(metal, 2, 1.5, -0.3, 1.1, 2.2);
      b.box(metal, 4, 0, -1, 4.1, 1, -0.9);
    }).get('metalDark:0')!;
    const t = g.getAttribute('aTone'), s = g.getAttribute('aStyle');
    const kindOf = (i: number): number => Math.floor(Math.round(s.getX(i) * 255) / KIND_STEP);
    expect(kindOf(0)).toBe(WallKind.door);
    expect([t.getX(0), t.getY(0), t.getZ(0)].map((v) => Math.round(v * 255))).toEqual(cw.door);
    const us = new Set<number>(), vs = new Set<number>();
    for (let i = 0; i < 6; i++) { us.add(Math.round(s.getY(i) * 255)); vs.add(Math.round(s.getZ(i) * 255)); }
    expect([...us].sort((a, b) => a - b)).toEqual([0, 255]);
    expect([...vs].sort((a, b) => a - b)).toEqual([0, 255]);
    expect(kindOf(g.getAttribute('position').count - 1)).not.toBe(WallKind.door);
    expect(doorTone(cw).style[0]).toBe(WallKind.door * KIND_STEP);
  });

  it('door colours vary along a street', () => {
    const doors = new Set<string>();
    for (let i = 0; i < 40; i++) doors.add(lotColourway({ id: `st-${i}`, type: 'brownstone' }).door.join(','));
    expect(doors.size).toBeGreaterThanOrEqual(6);
  });
});

describe('shader patches', () => {
  it('lot tone: chains hooks, adds stone and cornice defines only where asked, injects the bump and no unreplaced template text', () => {
    for (const mode of ['', 'stone', 'cornice'] as const) {
      const m = new THREE.MeshStandardMaterial();
      let hooked = 0;
      m.onBeforeCompile = () => { hooked++; };
      patchLotTone(m, mode);
      const sh = shaderOf();
      m.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
      expect(hooked).toBe(1);
      expect(sh.fragmentShader.includes('#define LT_STONE')).toBe(mode === 'stone');
      expect(sh.fragmentShader.includes('#define LT_CORNICE')).toBe(mode === 'cornice');
      expect(sh.fragmentShader).toContain('gLtBump');
      expect(sh.fragmentShader).not.toMatch(/\$\{/);
      expect(m.customProgramCacheKey()).toContain(mode);
    }
  });

  it('window and shop glass patches read the per-window seed, replace the emissive chunk, and chain hooks', () => {
    for (const patch of [patchWindow, patchShopGlass]) {
      const m = new THREE.MeshStandardMaterial();
      let hooked = 0;
      m.onBeforeCompile = () => { hooked++; };
      patch(m);
      const sh = shaderOf();
      m.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
      expect(hooked).toBe(1);
      expect(sh.vertexShader).toContain('vWinSeed = aStyle.xyz');
      expect(sh.fragmentShader).toContain('gWinGlow');
      expect(sh.fragmentShader).not.toContain('#include <emissivemap_fragment>');
      expect(sh.fragmentShader).not.toMatch(/\$\{/);
    }
  });

  it('el steel patch handles instanced columns and leaves nothing unreplaced', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true });
    patchElSteel(m);
    const sh = shaderOf();
    m.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    expect(sh.vertexShader).toContain('USE_INSTANCING');
    expect(sh.fragmentShader).toContain('gElRust');
    expect(sh.fragmentShader).not.toMatch(/\$\{/);
  });
});
