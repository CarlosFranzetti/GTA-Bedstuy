import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { MaterialKey } from '@/world/types';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import { heightToNormal } from '@/textures/normalmap';

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
    expect((lib.awning('#ff0000', 'A') as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
  });

  it('textures are repeat-wrapped sRGB canvas textures of 256-1024 px; materials are standard', () => {
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
      expect(c.width).toBeLessThanOrEqual(1024);
      expect(c.height).toBeGreaterThanOrEqual(128);
      expect(c.height).toBeLessThanOrEqual(1024);
    }
    expect((lib.get('brickRed') as THREE.MeshStandardMaterial).roughness).toBe(0.9);
    const g = lib.get('window') as THREE.MeshStandardMaterial;
    expect(g.roughness).toBe(0.08);
    expect(g.metalness).toBe(0);
    expect(g.envMapIntensity).toBe(1);
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
    expect(yellow.g).toBeGreaterThan(0.4);
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


// ------------------------------------------------------------------ PBR additions

/** Fake canvas with a real RGBA buffer: fillRect with rgb()/grey fills (opaque, honours scale); everything else no-ops. */
function makePixelCanvas(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  let sx = 1, sy = 1;
  let fill = [0, 0, 0];
  const noop = () => undefined;
  const ctx: Record<string, unknown> = {
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, arc: noop,
    strokeRect: noop, fillText: noop, closePath: noop, quadraticCurveTo: noop, translate: noop, rotate: noop,
    measureText: () => ({ width: 10 }),
    scale(a: number, b: number) { sx = a; sy = b; },
    fillRect(x: number, y: number, w: number, h: number) {
      const x0 = Math.max(0, Math.round(x * sx)), x1 = Math.min(width, Math.round((x + w) * sx));
      const y0 = Math.max(0, Math.round(y * sy)), y1 = Math.min(height, Math.round((y + h) * sy));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const o = (yy * width + xx) * 4;
        data[o] = fill[0]; data[o + 1] = fill[1]; data[o + 2] = fill[2]; data[o + 3] = 255;
      }
    },
    getImageData: () => ({ data, width, height }),
    set fillStyle(v: string) {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(v);
      fill = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
    },
    set strokeStyle(_v: string) { /* ignored */ },
    set globalAlpha(_v: number) { /* ignored */ },
    set lineWidth(_v: number) { /* ignored */ },
    set font(_v: string) { /* ignored */ },
    set textAlign(_v: string) { /* ignored */ },
    set textBaseline(_v: string) { /* ignored */ },
    set lineCap(_v: string) { /* ignored */ },
    set lineJoin(_v: string) { /* ignored */ },
  };
  return { width, height, data, getContext: () => ctx };
}

function pixelSetup(opts?: { maxAnisotropy?: number }) {
  const canvases: ReturnType<typeof makePixelCanvas>[] = [];
  const factory = (w: number, h: number): HTMLCanvasElement => {
    const c = makePixelCanvas(w, h);
    canvases.push(c);
    return c as unknown as HTMLCanvasElement;
  };
  return { lib: new MaterialLibrary(new Rng(99), factory, opts), canvases };
}

describe('heightToNormal', () => {
  it('flat field gives (128,128,255)', () => {
    const w = 8, h = 8;
    const n = heightToNormal(new Float32Array(w * h).fill(0.4), w, h, 3);
    expect(n.length).toBe(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      expect([n[i * 4], n[i * 4 + 1], n[i * 4 + 2], n[i * 4 + 3]]).toEqual([128, 128, 255, 255]);
    }
  });

  it('horizontal step tilts the normal toward -x (R<128) on the rising edge, G stays flat', () => {
    const w = 16, h = 8;
    const hf = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = w / 2; x < w; x++) hf[y * w + x] = 1;
    const n = heightToNormal(hf, w, h, 2);
    const at = (x: number, y: number) => [n[(y * w + x) * 4], n[(y * w + x) * 4 + 1], n[(y * w + x) * 4 + 2]];
    expect(at(w / 2, 3)[0]).toBeLessThan(128);     // rising to the right: normal leans left
    expect(at(w / 2 - 1, 3)[0]).toBeLessThan(128);
    expect(at(0, 3)[0]).toBeGreaterThan(128);      // wrap-around falling edge leans right
    expect(at(w / 2, 3)[1]).toBe(128);
    expect(at(4, 3)).toEqual([128, 128, 255]);
    expect(at(w / 2, 3)[2]).toBeLessThan(255);
  });

  it('vertical ramp (height grows toward image bottom) leans +G (toward +v is up, surface faces up)', () => {
    const w = 8, h = 16;
    const hf = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hf[y * w + x] = y < h / 2 ? 0 : 1;
    const n = heightToNormal(hf, w, h, 2);
    expect(n[((h / 2) * w + 2) * 4 + 1]).toBeGreaterThan(128);
    expect(n[((h / 2) * w + 2) * 4]).toBe(128);
  });
});

describe('PBR materials', () => {
  it('carPaint is a cached clearcoat MeshPhysicalMaterial', () => {
    const { lib } = setup();
    const m = lib.carPaint('#cc2222') as THREE.MeshPhysicalMaterial;
    expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(m.clearcoat).toBe(1);
    expect(m.clearcoatRoughness).toBeCloseTo(0.08);
    expect(m.metalness).toBeCloseTo(0.15);
    expect(m.roughness).toBeCloseTo(0.35);
    expect(m.envMapIntensity).toBeCloseTo(1.2);
    expect(lib.carPaint('#cc2222')).toBe(m);
    expect(lib.carPaint('#2222cc')).not.toBe(m);
  });

  it('carGlass and copLivery are physical with the requested settings', () => {
    const { lib } = setup();
    const g = lib.get('carGlass') as THREE.MeshPhysicalMaterial;
    expect(g).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(g.transmission).toBe(0);
    expect(g.metalness).toBeCloseTo(0);
    expect(g.roughness).toBeCloseTo(0.05);
    expect(g.opacity).toBeCloseTo(0.85);
    expect(g.transparent).toBe(true);
    expect(g.envMapIntensity).toBeCloseTo(1.5);
    const c = lib.get('copLivery') as THREE.MeshPhysicalMaterial;
    expect(c).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(c.clearcoat).toBe(1);
    expect(c.map).toBeTruthy();
  });

  it('setEnvironment applies to existing carPaint and to a window created afterwards', () => {
    const { lib } = setup();
    const paint = lib.carPaint('#ffffff') as THREE.MeshPhysicalMaterial;
    expect(paint.envMap).toBeNull();
    const env = new THREE.Texture();
    lib.setEnvironment(env);
    expect(paint.envMap).toBe(env);
    const win = lib.get('window') as THREE.MeshStandardMaterial;
    expect(win.envMap).toBe(env);
    expect(win.envMapIntensity).toBe(1);
    const asphalt = lib.get('asphalt') as THREE.MeshStandardMaterial;
    expect(asphalt.envMap).toBe(env);
    expect(asphalt.envMapIntensity).toBeCloseTo(0.25);
    expect((lib.get('metalDark') as THREE.MeshStandardMaterial).envMapIntensity).toBeCloseTo(0.5);
    expect((lib.carPaint('#00ff00') as THREE.MeshPhysicalMaterial).envMap).toBe(env);
    lib.setEnvironment(null);
    expect(paint.envMap).toBeNull();
    expect(win.envMap).toBeNull();
  });

  it('fake canvas path produces no normal/roughness maps, creates no extra canvases and does not throw', () => {
    const { lib, canvases } = setup();
    for (const k of ['brickRed', 'brownstone', 'limestone', 'cornice', 'asphalt', 'asphaltWorn', 'concrete', 'roof', 'rollGate', 'stoop'] as MaterialKey[]) {
      const before = canvases.length;
      const m = lib.get(k) as THREE.MeshStandardMaterial;
      expect(m.normalMap).toBeNull();
      expect(m.roughnessMap).toBeNull();
      expect(canvases.length - before).toBe(1);
    }
    expect((lib.get('asphalt') as THREE.MeshStandardMaterial).roughness).toBe(0.9);
  });

  it('with a pixel-capable canvas, relief materials carry tileable normal (and roughness) maps', () => {
    const { lib, canvases } = pixelSetup({ maxAnisotropy: 16 });
    const brick = lib.get('brickRed', 0) as THREE.MeshStandardMaterial;
    expect(canvases[0].width).toBe(1024);
    expect(brick.map!.anisotropy).toBe(8);
    const nm = brick.normalMap!;
    expect(nm).toBeInstanceOf(THREE.DataTexture);
    expect(nm.wrapS).toBe(THREE.RepeatWrapping);
    expect(nm.wrapT).toBe(THREE.RepeatWrapping);
    expect(nm.anisotropy).toBe(8);
    expect(nm.repeat.equals(brick.map!.repeat)).toBe(true);
    expect(brick.normalScale.x).toBeCloseTo(0.6);
    expect(brick.roughnessMap).toBeTruthy();
    expect(brick.roughness).toBe(1);
    // mortar joints are recessed so the normal map is not flat
    const px = (nm.image as { data: Uint8Array }).data;
    let varied = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] !== 128 || px[i + 1] !== 128) varied++;
    expect(varied).toBeGreaterThan(1000);
    // brick relief is shared across variants
    const brick1 = lib.get('brickRed', 1) as THREE.MeshStandardMaterial;
    expect(brick1.normalMap).toBe(nm);
    const asphalt = lib.get('asphalt') as THREE.MeshStandardMaterial;
    expect(asphalt.normalMap).toBeTruthy();
    expect(asphalt.normalScale.x).toBeCloseTo(0.35);
    expect(asphalt.roughnessMap).toBeTruthy();
    for (const k of ['brownstone', 'limestone', 'cornice', 'concrete', 'roof', 'rollGate'] as MaterialKey[]) {
      expect((lib.get(k) as THREE.MeshStandardMaterial).normalMap).toBeInstanceOf(THREE.DataTexture);
    }
  });

  it('maxAnisotropy option caps colour map anisotropy', () => {
    const lo = new MaterialLibrary(new Rng(1), (w, h) => makeFakeCanvas(w, h) as unknown as HTMLCanvasElement, { maxAnisotropy: 2 });
    expect((lo.get('brickRed') as THREE.MeshStandardMaterial).map!.anisotropy).toBe(2);
  });

  it('overrideMaps applies to existing and later-created materials and keeps night emissive', () => {
    const { lib } = setup();
    const mk = () => {
      const t = new THREE.Texture();
      return t;
    };
    const existing = lib.get('brickRed', 0) as THREE.MeshStandardMaterial;
    expect(lib.hasOverride('brickRed', 0)).toBe(false);
    const map = mk(), normalMap = mk(), roughnessMap = mk();
    lib.overrideMaps('brickRed', 0, { map, normalMap, roughnessMap, repeat: { x: 3, y: 2 }, normalScale: 0.8 });
    expect(lib.hasOverride('brickRed', 0)).toBe(true);
    expect(lib.hasOverride('brickRed', 4)).toBe(true); // variant wraps (4 variants)
    expect(lib.hasOverride('brickRed', 1)).toBe(false);
    expect(existing.map).toBe(map);
    expect(existing.normalMap).toBe(normalMap);
    expect(existing.roughnessMap).toBe(roughnessMap);
    expect(existing.normalScale.x).toBeCloseTo(0.8);
    expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normalMap.colorSpace).not.toBe(THREE.SRGBColorSpace);
    expect(map.repeat.x).toBe(3);
    expect(map.anisotropy).toBe(8);

    // override before creation, on a night-glowing key
    const wmap = mk();
    lib.overrideMaps('window', 1, { map: wmap });
    lib.setNight(true);
    const win = lib.get('window', 1) as THREE.MeshStandardMaterial;
    expect(win.map).toBe(wmap);
    expect(win.emissiveIntensity).toBe(0.9);
    expect(win.emissive.getHexString()).toBe('ffd27a');
    expect(win.metalness).toBeCloseTo(0);
    lib.setNight(false);
    expect(win.emissiveIntensity).toBe(0);
    // un-overridden variant is untouched
    expect((lib.get('window', 0) as THREE.MeshStandardMaterial).map).not.toBe(wmap);
  });
});
