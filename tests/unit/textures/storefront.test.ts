import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import type { Painter } from '@/textures/canvas';
import { WINDOW_VARIANTS, STOREFRONT_VARIANTS, storefrontEmissivePainter, storefrontPainter, windowEmissivePainter, windowPainter } from '@/textures/painters/glass';
import {
  ROLLGATE_VARIANTS, TANK_HOOP_H, chainlinkPainter, rollGatePainter, scaffoldPainter, waterTankPainter,
} from '@/textures/painters/metal';
import { awningPainter, awningStyle, copLiveryPainter, signPainter } from '@/textures/painters/signage';
import { CLOTH_COLORS, SKIN_TONES, treeLeavesPainter, treeTrunkPainter } from '@/textures/painters/organic';

interface Op { name: string; args: unknown[]; font?: string }

function fontPx(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : 10;
}

/** Recording 2D context: every call/assignment is logged, measureText is estimated from the font size. */
function recorder(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1, textAlign: 'start' };
  const ctx = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * fontPx(String(state.font)) * 0.6 });
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        ops.push({ name: prop, args, font: prop === 'fillText' || prop === 'strokeText' ? String(state.font) : undefined });
      };
    },
    set(_t, prop: string, v) {
      state[prop] = v;
      ops.push({ name: `set:${prop}`, args: [v] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function run(p: Painter, w: number, h: number, seed: number, variant = 0): Op[] {
  const { ctx, ops } = recorder();
  p(ctx, w, h, new Rng(seed), variant);
  return ops;
}

const json = (o: Op[]): string => JSON.stringify(o);
const texts = (o: Op[]): Op[] => o.filter((x) => x.name === 'fillText');

describe('storefront and street-metal painters', () => {
  it('every painter is deterministic per seed and variant', () => {
    const cases: [string, Painter, number, number, number][] = [
      ['rollGate', rollGatePainter, 256, 256, ROLLGATE_VARIANTS],
      ['window', windowPainter, 256, 256, WINDOW_VARIANTS],
      ['windowEm', windowEmissivePainter, 256, 256, WINDOW_VARIANTS],
      ['storefront', storefrontPainter, 512, 256, STOREFRONT_VARIANTS],
      ['storefrontEm', storefrontEmissivePainter, 512, 256, STOREFRONT_VARIANTS],
      ['waterTank', waterTankPainter, 256, 256, 1],
      ['scaffold', scaffoldPainter, 256, 256, 2],
      ['chainlink', chainlinkPainter, 256, 256, 1],
      ['copLivery', copLiveryPainter, 512, 256, 1],
      ['treeTrunk', treeTrunkPainter, 256, 256, 1],
      ['treeLeaves', treeLeavesPainter, 256, 256, 3],
      ['awning', awningPainter('#d62828', 'KING DELI'), 512, 256, 1],
      ['sign', signPainter('LAUNDROMAT', '#1b1b1b', '#ffffff'), 512, 128, 1],
    ];
    for (const [name, p, w, h, n] of cases) {
      for (let v = 0; v < n; v++) {
        const a = run(p, w, h, 5, v);
        const b = run(p, w, h, 5, v);
        expect(a.length, name).toBeGreaterThan(1);
        expect(json(a), `${name} v${v}`).toBe(json(b));
      }
    }
  });

  it('rollGate variants all differ, and the aux height contract is unchanged and variant-independent', () => {
    const seen = new Set<string>();
    for (let v = 0; v < ROLLGATE_VARIANTS; v++) seen.add(json(run(rollGatePainter, 256, 256, 3, v)));
    expect(seen.size).toBe(ROLLGATE_VARIANTS);

    const heightOps: string[] = [];
    for (let v = 0; v < ROLLGATE_VARIANTS; v++) {
      const col = recorder();
      const height = recorder();
      rollGatePainter(col.ctx, 256, 256, new Rng(3), v, { height: height.ctx, rough: null, rng: new Rng(77) });
      // the colour map is identical with or without aux
      expect(json(col.ops)).toBe(json(run(rollGatePainter, 256, 256, 3, v)));
      expect(height.ops.filter((o) => o.name === 'fillRect').length).toBeGreaterThan(16 * 4);
      heightOps.push(json(height.ops));
    }
    // relief is shared across rollGate variants, so it must not depend on the variant
    expect(new Set(heightOps).size).toBe(1);
  });

  it('awning picks vinyl or corrugated-metal deterministically from the text and draws the text', () => {
    const names = ['KING DELI', 'BEDFORD GROCERY', 'TOMPKINS CORNER STORE', 'MARCY MARKET', 'THROOP DELI', 'LEWIS FOOD', 'NOSTRAND BODEGA', 'FULTON WIRELESS'];
    const styles = names.map((n) => awningStyle(n));
    expect(names.map((n) => awningStyle(n))).toEqual(styles);
    expect(new Set(styles).size).toBe(2);

    const vinyl = names[styles.indexOf('vinyl')];
    const metal = names[styles.indexOf('metal')];
    const ov = run(awningPainter('#d62828', vinyl), 512, 256, 9);
    const om = run(awningPainter('#d62828', metal), 512, 256, 9);
    expect(json(ov)).not.toBe(json(om));
    expect(texts(ov).map((o) => o.args[0])).toContain(vinyl);
    expect(texts(om).map((o) => o.args[0])).toContain(metal);
    // the two styles use different faces; the metal one has rivet rows (many small arcs)
    expect(texts(ov)[0].font).toMatch(/Narrow/);
    expect(texts(om)[0].font).toMatch(/Impact/);
    expect(om.filter((o) => o.name === 'arc').length).toBeGreaterThan(ov.filter((o) => o.name === 'arc').length);
    // same text always gives the same ops
    expect(json(run(awningPainter('#d62828', vinyl), 512, 256, 9))).toBe(json(ov));
  });

  it('awning text shrinks to fit and a secondary line appears only with a middle dot', () => {
    for (const name of ['A', 'THROOP DELI & GROCERY CORP EXTRA LONG NAME ON A VERY LONG AWNING']) {
      const o = run(awningPainter('#e7b52e', name), 512, 256, 2);
      const t = texts(o);
      expect(t.length).toBeGreaterThan(0);
      for (const x of t) {
        expect(String(x.args[0])).toBe(name.toUpperCase());
        expect(String(x.args[0]).length * fontPx(x.font!) * 0.6).toBeLessThanOrEqual(512);
        expect(x.font).toMatch(/bold/);
      }
    }
    for (const name of ['KING DELI · GROCERY · ATM', 'ZAIN MARKET · DELI']) {
      const o = run(awningPainter('#d62828', name), 512, 256, 2);
      const strs = texts(o).map((x) => String(x.args[0]));
      const main = name.split('·')[0].trim();
      expect(strs).toContain(main);
      expect(strs.length).toBe(2);
      expect(strs[1]).toBe(name.slice(name.indexOf('·') + 1).trim());
      const sizes = texts(o).map((x) => fontPx(x.font!));
      expect(sizes[1]).toBeLessThan(sizes[0]);
    }
    // no dot, no secondary line
    expect(texts(run(awningPainter('#d62828', 'KING DELI'), 512, 256, 2)).length).toBe(1);
  });

  it('sign draws a frame and the text, centred', () => {
    const o = run(signPainter('FRESH FISH', '#0b3d91', '#ffffff'), 512, 128, 4);
    expect(o.some((x) => x.name === 'strokeRect')).toBe(true);
    const t = texts(o);
    expect(t.map((x) => x.args[0])).toContain('FRESH FISH');
    for (const x of t) expect(x.args[1]).toBe(256);
    expect(o.some((x) => x.name === 'set:textAlign' && x.args[0] === 'center')).toBe(true);
    // the stripe is optional but deterministic from the text
    const again = run(signPainter('FRESH FISH', '#0b3d91', '#ffffff'), 512, 128, 4);
    expect(json(again)).toBe(json(o));
  });

  it('waterTank draws at least six hoop rects', () => {
    const o = run(waterTankPainter, 256, 256, 1);
    const hoops = o.filter((x) => x.name === 'fillRect' && x.args[2] === 256 && x.args[3] === TANK_HOOP_H);
    expect(hoops.length).toBeGreaterThanOrEqual(6);
    // vertical staves: many tall narrow rects
    expect(o.filter((x) => x.name === 'fillRect' && Number(x.args[2]) <= 17 && Number(x.args[3]) === 256).length).toBeGreaterThanOrEqual(16);
  });

  it('window emissive carries the glass mask (R) for every variant: lit state is chosen per window in the shader, not per variant', () => {
    for (let v = 0; v < WINDOW_VARIANTS; v++) {
      const o = run(windowEmissivePainter, 256, 256, 1, v);
      const whites = o.filter((x) => x.name === 'set:fillStyle' && /^#ffffff$/i.test(String(x.args[0]))).length;
      expect(whites, `variant ${v}`).toBeGreaterThanOrEqual(1);
      // every window keeps a black frame: the full-canvas black fill comes first
      expect(o.find((x) => x.name === 'fillRect')?.args.slice(2, 4)).toEqual([256, 256]);
    }
  });

  it('the four window variants are four different frame treatments', () => {
    const seen = new Set<string>();
    for (let v = 0; v < WINDOW_VARIANTS; v++) seen.add(json(run(windowPainter, 256, 256, 2, v)));
    expect(seen.size).toBe(WINDOW_VARIANTS);
  });

  it('storefront variant 1 adds grille shadow lines; posters and notice are plain rectangles', () => {
    const a = run(storefrontPainter, 512, 256, 1, 0);
    const b = run(storefrontPainter, 512, 256, 1, 1);
    expect(json(a)).not.toBe(json(b));
    expect(b.filter((x) => x.name === 'fillRect').length).toBeGreaterThan(a.filter((x) => x.name === 'fillRect').length + 20);
    expect(texts(a).length + texts(b).length).toBe(0);
  });

  it('copLivery says POLICE only (no real department) and draws a door shield', () => {
    const o = run(copLiveryPainter, 512, 256, 1);
    expect(texts(o).map((x) => x.args[0])).toEqual(['POLICE']);
    expect(json(o)).not.toMatch(/NYPD/);
    expect(o.filter((x) => x.name === 'quadraticCurveTo').length).toBeGreaterThanOrEqual(2);
  });

  it('scaffold v0 is stencilled POST NO BILLS plywood; v1 is planks', () => {
    const a = run(scaffoldPainter, 256, 256, 1, 0);
    const b = run(scaffoldPainter, 256, 256, 1, 1);
    expect(texts(a).map((x) => x.args[0])).toContain('POST NO BILLS');
    expect(texts(b).length).toBe(0);
    expect(json(a)).not.toBe(json(b));
  });

  it('chainlink has a mesh and a top rail on both seam edges', () => {
    const o = run(chainlinkPainter, 256, 256, 1);
    expect(o.some((x) => x.name === 'fillRect' && x.args[1] === 0 && x.args[2] === 256 && x.args[3] === 3)).toBe(true);
    expect(o.some((x) => x.name === 'fillRect' && x.args[1] === 253 && x.args[2] === 256 && x.args[3] === 3)).toBe(true);
    expect(o.filter((x) => x.name === 'lineTo').length).toBeGreaterThan(30);
  });

  it('palette sizes', () => {
    expect(CLOTH_COLORS.length).toBeGreaterThanOrEqual(16);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(8);
    expect(SKIN_TONES.slice(0, 6)).toEqual(['#f1c9a5', '#e0ac82', '#c68642', '#a06a3c', '#7a4a2a', '#4f301d']);
    expect(CLOTH_COLORS.slice(0, 3)).toEqual(['#c0392b', '#2c3e50', '#27ae60']);
    expect(new Set(CLOTH_COLORS).size).toBe(CLOTH_COLORS.length);
  });
});
