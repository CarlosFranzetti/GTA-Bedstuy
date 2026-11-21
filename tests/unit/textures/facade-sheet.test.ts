import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import { SHEET_LAYERS, SHEET_LAYER_OF, SHEET_NAME } from '@/textures/facadeSheet';
import { sheetFragMain } from '@/textures/lotTone';

const fake = (w: number, h: number): HTMLCanvasElement => {
  const ctx = new Proxy({}, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
  return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
};
const lib = () => new MaterialLibrary(new Rng(5), fake);

describe('facade sheet (SURFACES2)', () => {
  it('every wall class carries its layer and all of them resolve to one shared material', () => {
    const l = lib();
    const mats = SHEET_LAYERS.map((id) => { const [k, v] = id.split(':'); return l.get(k as never, Number(v)); });
    const sheet = mats[0].userData.sheetMat as THREE.Material;
    expect(sheet.name).toBe(SHEET_NAME);
    mats.forEach((m, i) => { expect(m.userData.sheetLayer).toBe(i); expect(m.userData.sheetMat).toBe(sheet); });
    expect(l.facadeSheetMaterial()).toBe(sheet);
  });

  it('variants folded by SHARED_AS reach the same layer through their target', () => {
    const l = lib();
    const painted = l.get('brickPainted', 0);
    const target = painted.userData.sharedAs as THREE.Material;
    expect(SHEET_LAYER_OF[target.name]).toBe(1);
    expect(target.userData.sheetMat).toBe(l.facadeSheetMaterial());
  });

  it('a plain get() does not build the sheet (other layers are not painted)', () => {
    const l = lib();
    const m = l.get('brickRed', 0);
    expect(m.userData.sheetLayer).toBe(0);
    expect(Object.keys(m.userData)).not.toContain('sheetMat'); // lazy getter, not enumerable
  });

  it('the sheet is a vertex-coloured standard material with the layer attribute defaulted', () => {
    const m = lib().facadeSheetMaterial() as THREE.MeshStandardMaterial & { defaultAttributeValues: Record<string, number[]> };
    expect(m.isMeshStandardMaterial).toBe(true);
    expect(m.vertexColors).toBe(true);
    expect(m.defaultAttributeValues.aLayer).toEqual([0]);
  });

  it('the wall shader keeps no compile-time class flags and stays balanced', () => {
    const src = sheetFragMain();
    expect(src).not.toMatch(/#ifdef LT_(STONE|CORNICE)/);
    expect(src).toContain('if ( ltIsStone )');
    expect(src).toContain('if ( ltIsCornice )');
    expect(src).toContain('tShMap');
    expect(src).not.toContain('textureLod( map,');
    const open = (src.match(/\{/g) ?? []).length, close = (src.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
    const ifs = (src.match(/^\s*#if/gm) ?? []).length, ends = (src.match(/^\s*#endif/gm) ?? []).length;
    expect(ifs).toBe(ends);
  });
});
