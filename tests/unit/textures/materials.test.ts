import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { MaterialKey } from '@/world/types';
import { MaterialLibrary } from '@/textures/MaterialLibrary';

interface Op { name: string; args: unknown[]; font?: string }
interface FakeCanvas { width: number; height: number; ops: Op[]; getContext(t: string): unknown }

function fontPx(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : 10;
}

function makeFakeCanvas(width: number, height: number): FakeCanvas {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1, textAlign: 'start' };
  const ctx = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'measureText') {
        return (text: string) => ({ width: text.length * fontPx(String(state.font)) * 0.6 });
      }
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        ops.push({ name: prop, args, font: prop === 'fillText' ? String(state.font) : undefined });
      };
    },
    set(_t, prop: string, v) {
      state[prop] = v;
      ops.push({ name: `set:${prop}`, args: [v] });
      return true;
    },
  });
  return { width, height, ops, getContext: () => ctx };
}

function setup(seed = 1234) {
  const canvases: FakeCanvas[] = [];
  const factory = (w: number, h: number): HTMLCanvasElement => {
    const c = makeFakeCanvas(w, h);
    canvases.push(c);
    return c as unknown as HTMLCanvasElement;
  };
  const lib = new MaterialLibrary(new Rng(seed), factory);
  return { lib, canvases };
}

/** ops of the first canvas created while calling fn */
function opsOf(seed: number, fn: (lib: MaterialLibrary) => void): string {
  const { lib, canvases } = setup(seed);
  fn(lib);
  return JSON.stringify(canvases[0].ops);
}

describe('MaterialLibrary', () => {
  it('same seed gives identical op list for brick variant 0', () => {
    const a = opsOf(7, (l) => l.get('brickRed', 0));
    const b = opsOf(7, (l) => l.get('brickRed', 0));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(100);
  });

  it('is independent of creation order', () => {
    const a = opsOf(7, (l) => l.get('brickRed', 0));
    const { lib, canvases } = setup(7);
    lib.get('asphalt', 0);
    lib.get('brickRed', 0);
    const idx = canvases.length - 1;
    expect(JSON.stringify(canvases[idx].ops)).toBe(a);
  });

  it('different seeds and different variants differ', () => {
    expect(opsOf(7, (l) => l.get('brickRed', 0))).not.toBe(opsOf(8, (l) => l.get('brickRed', 0)));
    const v0 = opsOf(7, (l) => l.get('brickRed', 0));
    for (const v of [1, 2, 3]) expect(opsOf(7, (l) => l.get('brickRed', v))).not.toBe(v0);
  });

  it('caches by key and variant', () => {
    const { lib } = setup();
    expect(lib.get('brickRed', 0)).toBe(lib.get('brickRed', 0));
    expect(lib.get('brickRed', 0)).not.toBe(lib.get('brickRed', 1));
    expect(lib.get('window')).toBe(lib.get('window', 0));
    expect(lib.carPaint('#ff0000')).toBe(lib.carPaint('#ff0000'));
    expect(lib.sign('A', '#000', '#fff')).toBe(lib.sign('A', '#000', '#fff'));
    expect(lib.awning('#d62828', 'X')).toBe(lib.awning('#d62828', 'X'));
  });

  it('awning differs by text and colour', () => {
    const { lib } = setup();
    expect(lib.awning('#d62828', 'X')).not.toBe(lib.awning('#d62828', 'Y'));
    expect(lib.awning('#d62828', 'X')).not.toBe(lib.awning('#2828d6', 'X'));
  });

  it('awning prints uppercase text that fits inside the valance', () => {
    const { lib, canvases } = setup();
    const text = 'Throop Deli & Grocery Corp Extra Long Name';
    lib.awning('#d62828', text);
    const c = canvases[0];
    const ft = c.ops.filter((o) => o.name === 'fillText');
    expect(ft.length).toBeGreaterThan(0);
    for (const o of ft) {
      const s = String(o.args[0]);
      expect(s).toBe(text.toUpperCase());
      expect(s.length * fontPx(o.font!) * 0.6).toBeLessThanOrEqual(c.width);
      expect(o.font).toMatch(/bold/);
      // sits in the bottom quarter-ish (valance)
      expect(Number(o.args[2])).toBeGreaterThan(c.height * 0.7);
    }
  });

  it('sign text is centred and shrinks to fit', () => {
    const { lib, canvases } = setup();
    lib.sign('KOSCIUSZKO STREET EXTENDED NAME', '#0a5a2f', '#ffffff');
    const c = canvases[0];
    const ft = c.ops.filter((o) => o.name === 'fillText');
    expect(ft.length).toBeGreaterThan(0);
    for (const o of ft) {
      expect(Number(o.args[1])).toBe(c.width / 2);
      expect(String(o.args[0]).length * fontPx(o.font!) * 0.6).toBeLessThanOrEqual(c.width);
    }
    expect(c.ops.some((o) => o.name === 'set:textAlign' && o.args[0] === 'center')).toBe(true);
  });

  it('copLivery says BPD and never NYPD', () => {
    const { lib, canvases } = setup();
    lib.get('copLivery');
    const texts = canvases[0].ops.filter((o) => o.name === 'fillText').map((o) => String(o.args[0]));
    expect(texts).toContain('BPD');
    expect(JSON.stringify(canvases[0].ops)).not.toMatch(/NYPD/);
  });

  it('setNight toggles window and storefront emissive, including late-created ones', () => {
    const { lib } = setup();
    const w = lib.get('window') as THREE.MeshStandardMaterial;
    const s = lib.get('storefrontGlass') as THREE.MeshStandardMaterial;
    expect(w.emissiveIntensity).toBe(0);
    lib.setNight(true);
    expect(w.emissiveIntensity).toBe(0.9);
    expect(s.emissiveIntensity).toBe(0.9);
    expect(w.emissive.getHexString()).toBe('ffd27a');
    const late = lib.get('window', 2) as THREE.MeshStandardMaterial;
    expect(late.emissiveIntensity).toBe(0.9);
    lib.setNight(false);
    expect(w.emissiveIntensity).toBe(0);
    expect(late.emissiveIntensity).toBe(0);
    expect((lib.awning('#ff0000', 'A') as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0);
  });

  it('textures are repeat-wrapped sRGB canvas textures of 256-512 px; materials are standard', () => {
    const { lib, canvases } = setup();
    const keys: MaterialKey[] = ['brickRed', 'brownstone', 'asphalt', 'concrete', 'rollGate', 'window', 'roof', 'treeLeaves', 'chainlink'];
    for (const k of keys) {
      const m = lib.get(k) as THREE.MeshStandardMaterial;
      expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
      const t = m.map!;
      expect(t).toBeInstanceOf(THREE.CanvasTexture);
      expect(t.wrapS).toBe(THREE.RepeatWrapping);
      expect(t.wrapT).toBe(THREE.RepeatWrapping);
      expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
    }
    for (const c of canvases) {
      expect(c.width).toBeGreaterThanOrEqual(256);
      expect(c.width).toBeLessThanOrEqual(512);
      expect(c.height).toBeGreaterThanOrEqual(128);
      expect(c.height).toBeLessThanOrEqual(512);
    }
    expect((lib.get('brickRed') as THREE.MeshStandardMaterial).roughness).toBe(0.9);
    const g = lib.get('window') as THREE.MeshStandardMaterial;
    expect(g.roughness).toBe(0.2);
    expect(g.metalness).toBe(0.1);
    expect(g.opacity).toBe(0.9);
    expect(g.transparent).toBe(true);
  });

  it('builds every key and several variants without throwing', () => {
    const { lib } = setup();
    const keys: MaterialKey[] = [
      'asphalt', 'asphaltWorn', 'concrete', 'curb', 'laneLine', 'crosswalk', 'brownstone', 'brickRed', 'brickPainted',
      'limestone', 'cornice', 'stoop', 'window', 'storefrontGlass', 'rollGate', 'roof', 'waterTank', 'treeTrunk',
      'treeLeaves', 'metalDark', 'metalGreen', 'hydrant', 'trash', 'scaffold', 'chainlink', 'carGlass', 'tire',
      'copLivery', 'skin', 'cloth',
    ];
    for (const k of keys) for (const v of [0, 1, 2, 3, 7, -1]) expect(lib.get(k, v)).toBeInstanceOf(THREE.Material);
  });

  it('cloth has at least 8 distinct variants; skin several', () => {
    const { lib } = setup();
    const cloth = new Set<string>();
    for (let v = 0; v < 12; v++) cloth.add((lib.get('cloth', v) as THREE.MeshStandardMaterial).color.getHexString());
    expect(cloth.size).toBeGreaterThanOrEqual(8);
    const skin = new Set<string>();
    for (let v = 0; v < 6; v++) skin.add((lib.get('skin', v) as THREE.MeshStandardMaterial).color.getHexString());
    expect(skin.size).toBeGreaterThanOrEqual(4);
  });

  it('honours the road builder variant contract (laneLine white/yellow, asphalt/concrete variants distinct)', () => {
    const { lib, canvases } = setup();
    const white = (lib.get('laneLine', 0) as THREE.MeshStandardMaterial).color;
    const yellow = (lib.get('laneLine', 1) as THREE.MeshStandardMaterial).color;
    expect(white.r).toBeGreaterThan(0.85);
    expect(white.g).toBeGreaterThan(0.85);
    expect(white.b).toBeGreaterThan(0.8);
    expect(yellow.r).toBeGreaterThan(0.8);
    expect(yellow.g).toBeGreaterThan(0.6);
    expect(yellow.b).toBeLessThan(0.3);
    const before = canvases.length;
    lib.get('asphalt', 0);
    lib.get('asphalt', 1);
    lib.get('concrete', 0);
    lib.get('concrete', 1);
    const [a0, a1, c0, c1] = canvases.slice(before).map((c) => JSON.stringify(c.ops));
    expect(a0).not.toBe(a1);
    expect(c0).not.toBe(c1);
    const base = (c: FakeCanvas): string => String(c.ops.find((o) => o.name === 'set:fillStyle')!.args[0]);
    expect(base(canvases[before])).not.toBe(base(canvases[before + 1]));
    expect(base(canvases[before + 2])).not.toBe(base(canvases[before + 3]));
  });

  it('draws only with recordable 2D calls and no images', () => {
    const { lib, canvases } = setup();
    lib.get('brownstone');
    const names = new Set(canvases[0].ops.map((o) => o.name));
    expect(names.has('drawImage')).toBe(false);
    expect(names.has('fillRect')).toBe(true);
  });
});
