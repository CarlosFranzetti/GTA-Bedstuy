/**
 * TEXVAR: per-lot facade colourways are deterministic from the lot id, varied along a street, baked as vertex attributes
 * (no extra materials, so no extra draw calls) and the wall shader patch only adds attributes / uniforms, never meshes.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { loadBedstuyData, buildGrid } from '@/world/Grid';
import type { SpecLot } from '@/world/BuildingGen';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { WallKind, distinctLooks, lotColourway, toneFor } from '@/world/buildings/colourway';
import { LotBatch } from '@/world/buildings/facade';
import { LOT_TONE_KEYS, patchLotTone } from '@/textures/lotTone';
import { GROUND_DETAIL_KEYS, patchGroundDetail } from '@/textures/groundVariation';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), getBedstuyFaces()) as SpecLot[];

describe('lot colourway', () => {
  it('is a pure function of the lot id and spec', () => {
    for (const l of lots.slice(0, 200)) {
      expect(lotColourway(l)).toEqual(lotColourway({ ...l }));
    }
    const a = lotColourway({ id: 'x1', type: 'brownstone' }), b = lotColourway({ id: 'x2', type: 'brownstone' });
    expect(a).not.toEqual(b);
  });

  it('gives at least 6 distinct looks per 10 consecutive lots on average', () => {
    const per: number[] = [];
    for (let i = 0; i + 10 <= Math.min(lots.length, 800); i += 10) per.push(distinctLooks(lots.slice(i, i + 10)));
    const mean = per.reduce((s, v) => s + v, 0) / per.length;
    expect(mean).toBeGreaterThanOrEqual(6);
    expect(Math.min(...per)).toBeGreaterThanOrEqual(3);
  });

  it('uses every wall kind across the city and panel cladding only on new builds', () => {
    const kinds = new Set<number>();
    for (const l of lots) {
      const cw = lotColourway(l);
      kinds.add(cw.kind);
      if (cw.kind === WallKind.panel) expect(l.spec?.look).toBe('newBuild');
      if (cw.kind === WallKind.siding) expect(l.spec?.look === 'frame' || (l.spec?.floors ?? 9) <= 3).toBe(true);
    }
    for (const k of [WallKind.brick, WallKind.siding, WallKind.stucco, WallKind.panel, WallKind.glazed]) expect(kinds.has(k), `kind ${k}`).toBe(true);
  });

  it('keeps colours and amounts inside their ranges', () => {
    for (const l of lots.slice(0, 400)) {
      const cw = lotColourway(l);
      for (const c of [cw.front, cw.cornice, cw.metal, cw.gate, cw.trim, ...cw.party]) for (const v of c) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
      expect(cw.paint).toBeGreaterThanOrEqual(0); expect(cw.paint).toBeLessThanOrEqual(1);
      expect(cw.uv.scale).toBeGreaterThan(0.8); expect(cw.uv.scale).toBeLessThan(1.2);
    }
  });
});

describe('tone baking', () => {
  const mat = (name: string): THREE.Material => { const m = new THREE.MeshBasicMaterial(); m.name = name; return m; };

  it('writes aTone / aStyle for every material and leaves non-wall materials untinted', () => {
    const b = new LotBatch();
    const wall = mat('brickRed:0'), glass = mat('window:0');
    b.setColourway(lotColourway({ id: 'lot-a', type: 'rowhouse' }), new Set([wall]));
    b.box(wall, 0, 0, -3, 5, 8, 0);
    b.box(glass, 1, 1, 0, 2, 2, 0.1);
    b.flush(new THREE.Matrix4());
    const out = b.merged();
    expect(out).toHaveLength(2);
    for (const { material, geometry } of out) {
      const t = geometry.getAttribute('aTone'), s = geometry.getAttribute('aStyle');
      expect(t.count).toBe(geometry.getAttribute('position').count);
      expect(s.itemSize).toBe(4);
      const tinted = t.getW(0) > 0;
      expect(tinted).toBe(material === wall);
    }
  });

  it('front-facing quads take the lot colour and party walls the party colour', () => {
    const cw = lotColourway({ id: 'lot-b', type: 'rowhouse' });
    const front = toneFor('brickRed:0', cw, true, false)!, side = toneFor('brickRed:0', cw, false, false)!;
    expect(front.tone.slice(0, 3)).toEqual(cw.front);
    expect(side.tone.slice(0, 3)).toEqual(cw.party[0]);
    expect(toneFor('window:0', cw, true, false)).toBeNull();
  });

  it('patching a material adds attributes only (same program count per patch, chains existing hooks)', () => {
    const m = new THREE.MeshStandardMaterial();
    let hooked = 0;
    m.onBeforeCompile = () => { hooked++; };
    patchLotTone(m);
    const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>', uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(hooked).toBe(1);
    expect(shader.vertexShader).toContain('aTone');
    expect(shader.fragmentShader).toContain('vLtTone');
    expect(LOT_TONE_KEYS).toContain('brickRed');
  });
});

describe('ground detail patch', () => {
  it('adds a distinct program per kind and chains the previous hook', () => {
    const keys = new Set<string>();
    for (const kind of ['asphalt', 'concrete', 'paint', 'curb', 'bluestone'] as const) {
      const m = new THREE.MeshStandardMaterial();
      let hooked = 0;
      m.onBeforeCompile = () => { hooked++; };
      patchGroundDetail(m, kind);
      const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>', uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
      m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(hooked).toBe(1);
      expect(shader.fragmentShader).toContain(({ asphalt: 'gdRoad', concrete: 'kerbG', paint: 'chip', curb: 'chh', bluestone: 'GD_FLAG' } as const)[kind]);
      expect(shader.vertexShader).toContain('vGdUv = uv;');
      // asphalt and sidewalks read the road info from vColor, so the stock vertex-colour multiply is dropped for them
      expect(m.vertexColors).toBe(kind === 'asphalt' || kind === 'concrete' || kind === 'bluestone');
      expect(shader.fragmentShader).not.toContain('#include <color_fragment>');
      keys.add(m.customProgramCacheKey());
    }
    expect(keys.size).toBe(5);
    expect(GROUND_DETAIL_KEYS.graniteCurb).toBe('curb');
  });
});

describe('detail atlas, wall signs and gate states', () => {
  it('encodes every wall kind into one byte and gate / party walls carry their own kind', async () => {
    const { KIND_STEP } = await import('@/world/buildings/colourway');
    for (const k of Object.values(WallKind)) expect(k * KIND_STEP).toBeLessThanOrEqual(255);
    const cw = lotColourway({ id: 'lot-g', type: 'rowhouse' });
    expect(toneFor('rollGate:0', cw, true, false)!.style[0]).toBe(WallKind.gate * KIND_STEP);
    expect(toneFor('brickRed:1', cw, false, false)!.style[0]).toBe(WallKind.party * KIND_STEP);
    expect(toneFor('brickRed:1', cw, true, false)!.style[0]).toBe(cw.kind * KIND_STEP);
  });

  it('has a sign sheet with eight invented names that fits its grid, and the atlas file ships', async () => {
    const { WALL_SIGNS, SIGN_COLS, SIGN_ROWS } = await import('@/textures/detailAtlas');
    expect(WALL_SIGNS.length).toBeLessThanOrEqual(SIGN_COLS * SIGN_ROWS);
    expect(new Set(WALL_SIGNS.map((s) => s.lines.join('|'))).size).toBe(WALL_SIGNS.length);
    const atlases = Object.keys(import.meta.glob('/src/assets/textures/detail_atlas_*.jpg'));
    expect(atlases.map((f) => f.split('/').pop()).sort()).toEqual(['detail_atlas_1k.jpg', 'detail_atlas_512.jpg']);
    const lic = Object.keys(import.meta.glob('/src/assets/textures/cc0/detail_*/LICENSE.txt', { query: '?raw' }));
    expect(lic).toHaveLength(4);
  });

  it('mixes plain, rusty and tagged gate states across the city (by lot seed, deterministic)', () => {
    const states = { plain: 0, rusty: 0, tagged: 0 };
    for (const l of lots.slice(0, 600)) {
      const g = ((lotColourway(l).seed * 255 | 0) / 255 * 7.31 + 0.17) % 1;
      states[g > 0.8 ? 'tagged' : g > 0.55 ? 'rusty' : 'plain']++;
    }
    expect(states.plain).toBeGreaterThan(150);
    expect(states.rusty).toBeGreaterThan(80);
    expect(states.tagged).toBeGreaterThan(60);
  });

  it('keeps the variety metric after the new kinds', () => {
    const per: number[] = [];
    for (let i = 0; i + 10 <= Math.min(lots.length, 1200); i += 10) per.push(distinctLooks(lots.slice(i, i + 10)));
    expect(per.reduce((s, v) => s + v, 0) / per.length).toBeGreaterThanOrEqual(6);
  });
});
