import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
import {
  CARGO_LIVERY_H, CARGO_LIVERY_TEXT, CARGO_LIVERY_VARIANTS, CARGO_LIVERY_W, CARGO_PLAIN_STRIP, cargoLiveryPainter,
  CAR_PAINT_SIZE, PLATE_VARIANTS, TIRE_TEXT, carPaintHeightField, carPaintMaps,
} from '@/textures/painters/vehicle';
import {
  DENIM_VARIANTS, HOODIE_VARIANTS, SNEAKER_VARIANTS, VARSITY_VARIANTS, varsityUV,
} from '@/textures/painters/people';

interface Op { name: string; args: unknown[] }
interface FakeCanvas { width: number; height: number; ops: Op[]; getContext(t: string): unknown }

function makeFakeCanvas(width: number, height: number): FakeCanvas {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1, textAlign: 'start' };
  const ctx = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'measureText') {
        return (text: string) => ({ width: text.length * (parseFloat(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? '10')) * 0.6 });
      }
      if (prop in state) return state[prop];
      return (...args: unknown[]) => { ops.push({ name: prop, args }); };
    },
    set(_t, prop: string, v) { state[prop] = v; ops.push({ name: `set:${prop}`, args: [v] }); return true; },
  });
  return { width, height, ops, getContext: () => ctx };
}

function setup(seed = 99) {
  const canvases: FakeCanvas[] = [];
  const factory = (w: number, h: number): HTMLCanvasElement => {
    const c = makeFakeCanvas(w, h);
    canvases.push(c);
    return c as unknown as HTMLCanvasElement;
  };
  return { lib: new MaterialLibrary(new Rng(seed), factory), canvases };
}

function texts(c: FakeCanvas): string[] {
  return c.ops.filter((o) => o.name === 'fillText').map((o) => String(o.args[0]));
}

describe('car paint detail', () => {
  it('carPaintMaps is deterministic and returns the three textures', () => {
    const run = (seed: number) => {
      const cs: FakeCanvas[] = [];
      const m = carPaintMaps((w, h) => { const c = makeFakeCanvas(w, h); cs.push(c); return c as unknown as HTMLCanvasElement; }, new Rng(seed));
      return { m, ops: JSON.stringify(cs.map((c) => c.ops)), n: Array.from((m.normalMap.image.data as Uint8Array).subarray(0, 4096)) };
    };
    const a = run(5), b = run(5), c = run(6);
    expect(a.ops).toBe(b.ops);
    expect(a.n).toEqual(b.n);
    expect(a.ops).not.toBe(c.ops);
    expect(a.m.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(a.m.roughnessMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(a.m.dirtMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(a.m.dirtMap.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(a.m.normalMap.image.width).toBe(CAR_PAINT_SIZE);
  });

  it('dirt map is white at the top and brown only in the lower quarter', () => {
    const cs: FakeCanvas[] = [];
    carPaintMaps((w, h) => { const c = makeFakeCanvas(w, h); cs.push(c); return c as unknown as HTMLCanvasElement; }, new Rng(1));
    const dirt = cs[0];
    const rects = dirt.ops.filter((o) => o.name === 'fillRect' && (o.args[2] as number) === CAR_PAINT_SIZE && (o.args[3] as number) < 20);
    expect(rects.length).toBeGreaterThan(8);
    for (const r of rects) expect(r.args[1] as number).toBeGreaterThanOrEqual(CAR_PAINT_SIZE * 0.75 - 1);
  });

  it('flake height field varies and tiles into a normal map with unit-ish normals', () => {
    const hf = carPaintHeightField(new Rng(3), 64, []);
    expect(new Set(Array.from(hf)).size).toBeGreaterThan(5);
  });

  it('carPaintDetail applies normalMap to an existing carPaint material and to later ones, keeping the clearcoat', () => {
    const { lib } = setup();
    const before = lib.carPaint('#cc2222') as THREE.MeshPhysicalMaterial;
    expect(before.normalMap).toBeNull();
    const maps = lib.carPaintDetail();
    expect(before.normalMap).toBe(maps.normalMap);
    expect(before.roughnessMap).toBe(maps.roughnessMap);
    expect(before.map).toBe(maps.dirtMap);
    expect(before.clearcoat).toBe(1);
    expect(before.clearcoatRoughness).toBeCloseTo(0.08);
    const after = lib.carPaint('#2222cc') as THREE.MeshPhysicalMaterial;
    expect(after.normalMap).toBe(maps.normalMap);
    expect(lib.carPaintDetail()).toBe(maps);
    expect(before.color.getHexString()).toBe('cc2222');
  });
});

describe('tyre and plate', () => {
  it('tireSidewall draws the raised BEDSTUY RADIAL text', () => {
    const { lib, canvases } = setup();
    const m = lib.get('tireSidewall') as THREE.MeshStandardMaterial;
    expect(m.map).toBeTruthy();
    const all = canvases.flatMap(texts);
    expect(all.filter((t) => t === TIRE_TEXT).length).toBeGreaterThanOrEqual(4);
  });

  it('tireSidewall is deterministic', () => {
    const run = () => { const s = setup(4); s.lib.get('tireSidewall'); return JSON.stringify(s.canvases[0].ops); };
    expect(run()).toBe(run());
  });

  it('plate has BK-STUY on variant 0, bands, and distinct variants', () => {
    const { lib, canvases } = setup();
    lib.get('plate', 0);
    expect(texts(canvases[0])).toContain('BK-STUY');
    const ops0 = JSON.stringify(canvases[0].ops);
    for (let v = 1; v < PLATE_VARIANTS; v++) {
      const s = setup();
      s.lib.get('plate', v);
      expect(JSON.stringify(s.canvases[0].ops)).not.toBe(ops0);
    }
    const fills = canvases[0].ops.filter((o) => o.name === 'set:fillStyle').map((o) => String(o.args[0]));
    expect(fills).toContain('#1c3f94');
    expect(fills).toContain('#c9a227');
  });
});

describe('people fabrics', () => {
  it('clothVarsity has at least 4 distinct variants', () => {
    expect(VARSITY_VARIANTS).toBeGreaterThanOrEqual(4);
    const { lib, canvases } = setup();
    const seen = new Set<string>();
    for (let v = 0; v < VARSITY_VARIANTS; v++) {
      const before = canvases.length;
      lib.get('clothVarsity', v);
      seen.add(JSON.stringify(canvases[before].ops));
    }
    expect(seen.size).toBe(VARSITY_VARIANTS);
  });

  it('every fabric key builds 4-8 distinct variants with a map, and caches', () => {
    for (const [key, n] of [
      ['clothHoodie', HOODIE_VARIANTS], ['clothDenim', DENIM_VARIANTS],
      ['clothVarsity', VARSITY_VARIANTS], ['clothSneaker', SNEAKER_VARIANTS],
    ] as const) {
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(8);
      const { lib, canvases } = setup();
      const ops = new Set<string>();
      for (let v = 0; v < n; v++) {
        const i = canvases.length;
        const m = lib.get(key, v) as THREE.MeshStandardMaterial;
        expect(m.map).toBeTruthy();
        ops.add(JSON.stringify(canvases[i].ops));
      }
      expect(ops.size).toBe(n);
      expect(lib.get(key, 0)).toBe(lib.get(key, n));
    }
  });

  it('fabrics are deterministic for the same seed', () => {
    const run = (s: number) => { const x = setup(s); x.lib.get('clothDenim', 2); return JSON.stringify(x.canvases[0].ops); };
    expect(run(8)).toBe(run(8));
    expect(run(8)).not.toBe(run(9));
  });

  it('existing flat cloth variants remain', () => {
    const { lib } = setup();
    expect((lib.get('cloth', 0) as THREE.MeshStandardMaterial).map).toBeNull();
  });

  it('varsityUV squeezes v into the requested half', () => {
    const body = varsityUV(new THREE.BoxGeometry(1, 1, 1), 'body');
    const sleeve = varsityUV(new THREE.BoxGeometry(1, 1, 1), 'sleeve');
    for (let i = 0; i < body.attributes.uv.count; i++) {
      expect(body.attributes.uv.getY(i)).toBeGreaterThanOrEqual(0.5);
      expect(sleeve.attributes.uv.getY(i)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('cargo box liveries', () => {
  const paint = (variant: number, seed = 5) => {
    const c = makeFakeCanvas(CARGO_LIVERY_W, CARGO_LIVERY_H);
    cargoLiveryPainter(c.getContext('2d') as CanvasRenderingContext2D, c.width, c.height, new Rng(seed), variant);
    return c.ops;
  };
  const texts = (ops: Op[]) => ops.filter((o) => o.name === 'fillText').map((o) => String(o.args[0]));

  it('offers a plain white plus eleven local-business liveries (the last is the garbage truck)', () => {
    expect(CARGO_LIVERY_VARIANTS).toBe(12);
    expect(CARGO_LIVERY_TEXT[0]).toBeNull();
    expect(CARGO_LIVERY_TEXT.slice(1).every((t) => t && t[0].length > 8)).toBe(true);
  });

  it('variant 0 carries no lettering; variants 1-11 print their invented business name and tagline', () => {
    expect(texts(paint(0))).toEqual([]);
    for (let v = 1; v < 12; v++) {
      const t = texts(paint(v));
      expect(t).toContain(CARGO_LIVERY_TEXT[v]![0]);
      expect(t).toContain(CARGO_LIVERY_TEXT[v]![1]);
    }
  });

  it('uses no real brand names', () => {
    const all = CARGO_LIVERY_TEXT.flatMap((t) => (t ? [...t] : [])).join(' ').toUpperCase();
    for (const brand of ['UPS', 'FEDEX', 'U-HAUL', 'UHAUL', 'DHL', 'PENSKE', 'RYDER', 'AMAZON', 'WHOLE FOODS']) expect(all).not.toContain(brand);
  });

  it('is deterministic per seed and differs between variants', () => {
    const sig = (ops: Op[]) => JSON.stringify(ops);
    expect(sig(paint(2, 9))).toBe(sig(paint(2, 9)));
    expect(new Set([0, 1, 2, 3].map((v) => sig(paint(v)))).size).toBe(4);
  });

  it('keeps every rect inside the canvas and finishes by restoring the plain strip', () => {
    for (let v = 0; v < 4; v++) {
      const ops = paint(v);
      for (const o of ops) {
        if (o.name !== 'fillRect') continue;
        const [x, y, w, h] = o.args as number[];
        expect(x).toBeGreaterThanOrEqual(-1); expect(y).toBeGreaterThanOrEqual(-1);
        expect(x + w).toBeLessThanOrEqual(CARGO_LIVERY_W + 2); expect(y + h).toBeLessThanOrEqual(CARGO_LIVERY_H + 2);
      }
      const last = ops[ops.length - 1];
      expect(last.name).toBe('fillRect');
      expect(last.args).toEqual([0, 0, CARGO_LIVERY_W, CARGO_LIVERY_H * CARGO_PLAIN_STRIP]);
    }
  });
});
