import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import type { Aux, Painter } from '@/textures/canvas';
import { brickPainter, brownstonePainter, cornicePainter, limestonePainter } from '@/textures/painters/masonry';

interface Op { name: string; args: unknown[]; fill: string; alpha: number }

/** Recording 2D context with save/restore state, no pixel access. */
function makeCtx(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  let state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, font: '10px sans-serif' };
  const stack: Record<string, unknown>[] = [];
  const ctx = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'save') return () => { stack.push({ ...state }); ops.push({ name: 'save', args: [], fill: '', alpha: 0 }); };
      if (prop === 'restore') return () => { state = stack.pop() ?? state; ops.push({ name: 'restore', args: [], fill: '', alpha: 0 }); };
      if (prop === 'measureText') return (t: string) => ({ width: t.length * 6 });
      if (prop in state) return state[prop];
      return (...args: unknown[]) => { ops.push({ name: prop, args, fill: String(state.fillStyle), alpha: Number(state.globalAlpha) }); };
    },
    set(_t, prop: string, v) {
      state[prop] = v;
      ops.push({ name: `set:${prop}`, args: [v], fill: '', alpha: 0 });
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

interface Run { ops: Op[]; height: Op[]; rough: Op[] }

function run(painter: Painter, seed: number, variant: number, size = 1024, withAux = false): Run {
  const c = makeCtx();
  const hc = makeCtx();
  const rc = makeCtx();
  const aux: Aux | undefined = withAux ? { height: hc.ctx, rough: rc.ctx, rng: new Rng(seed ^ 0x9e3779b9) } : undefined;
  painter(c.ctx, size, size, new Rng(seed), variant, aux);
  return { ops: c.ops, height: hc.ops, rough: rc.ops };
}

const json = (ops: Op[]): string => JSON.stringify(ops);

function luminance(color: string): number {
  let r = 0, g = 0, b = 0;
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color);
  const hsl = /^hsl\(([\d.]+),([\d.]+)%,([\d.]+)%\)$/.exec(color);
  if (hex) {
    r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16);
  } else if (rgb) {
    r = +rgb[1]; g = +rgb[2]; b = +rgb[3];
  } else if (hsl) {
    const h = +hsl[1] / 360, s = +hsl[2] / 100, l = +hsl[3] / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t0: number): number => {
      const t = ((t0 % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = f(h + 1 / 3) * 255; g = f(h) * 255; b = f(h - 1 / 3) * 255;
  } else {
    throw new Error(`unparsed colour ${color}`);
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mean luminance of all filled rects, weighted by area and alpha. */
function meanLuminance(ops: Op[]): number {
  let sum = 0;
  let wsum = 0;
  for (const o of ops) {
    if (o.name !== 'fillRect') continue;
    const [, , rw, rh] = o.args as number[];
    const wgt = Math.abs(rw * rh) * o.alpha;
    sum += luminance(o.fill) * wgt;
    wsum += wgt;
  }
  return sum / wsum;
}

const rects = (ops: Op[]): number[][] => ops.filter((o) => o.name === 'fillRect').map((o) => o.args as number[]);

/** A fillRect that starts inside the tile and runs past the given edge by more than half a pixel. */
function straddles(ops: Op[], w: number, h: number, edge: 'right' | 'bottom'): boolean {
  return rects(ops).some(([x, y, rw, rh]) => (edge === 'right' ? x < w - 0.5 && x + rw > w + 0.5 : y < h - 0.5 && y + rh > h + 0.5));
}

/** ... and a wrapped copy: the same feature poking out of the opposite (left/top) edge. */
function wrappedCopy(ops: Op[], edge: 'left' | 'top'): boolean {
  return rects(ops).some(([x, y, rw, rh]) => (edge === 'left' ? x < -0.5 && x + rw > 0.5 : y < -0.5 && y + rh > 0.5));
}

const PAINTERS: Array<{ name: string; painter: Painter; size: number; variants: number }> = [
  { name: 'brick', painter: brickPainter, size: 1024, variants: 4 },
  { name: 'brownstone', painter: brownstonePainter, size: 1024, variants: 2 },
  { name: 'limestone', painter: limestonePainter, size: 512, variants: 1 },
  { name: 'cornice', painter: cornicePainter, size: 512, variants: 2 },
];

describe('masonry painters', () => {
  for (const p of PAINTERS) {
    describe(p.name, () => {
      it('is deterministic from the rng (same seed, identical op list)', () => {
        const a = run(p.painter, 42, 0, p.size);
        const b = run(p.painter, 42, 0, p.size);
        expect(json(a.ops)).toBe(json(b.ops));
        expect(a.ops.length).toBeGreaterThan(500);
        expect(json(run(p.painter, 43, 0, p.size).ops)).not.toBe(json(a.ops));
      });

      it('relief layers are deterministic and do not change the colour ops', () => {
        const plain = run(p.painter, 7, 0, p.size);
        const a = run(p.painter, 7, 0, p.size, true);
        const b = run(p.painter, 7, 0, p.size, true);
        expect(json(a.ops)).toBe(json(plain.ops));
        expect(json(a.height)).toBe(json(b.height));
        expect(a.height.length).toBeGreaterThan(50);
      });

      it('wraps: features straddle the right and bottom edges and reappear on the left/top', () => {
        for (let v = 0; v < p.variants; v++) {
          const r = run(p.painter, 11, v, p.size);
          expect(straddles(r.ops, p.size, p.size, 'right'), `${p.name} v${v} right`).toBe(true);
          expect(straddles(r.ops, p.size, p.size, 'bottom'), `${p.name} v${v} bottom`).toBe(true);
          expect(wrappedCopy(r.ops, 'left'), `${p.name} v${v} left copy`).toBe(true);
          expect(wrappedCopy(r.ops, 'top'), `${p.name} v${v} top copy`).toBe(true);
        }
      });

      it('relief wraps as well', () => {
        const r = run(p.painter, 11, 0, p.size, true);
        expect(straddles(r.height, p.size, p.size, 'right')).toBe(true);
        expect(straddles(r.height, p.size, p.size, 'bottom')).toBe(true);
      });

      it('scales with the tile size (512 and 1024 both work)', () => {
        expect(run(p.painter, 5, 0, 512).ops.length).toBeGreaterThan(300);
        expect(run(p.painter, 5, 0, 1024).ops.length).toBeGreaterThan(300);
      });

      if (p.variants > 1) {
        it('variants differ', () => {
          const lists = Array.from({ length: p.variants }, (_, v) => json(run(p.painter, 9, v, p.size).ops));
          expect(new Set(lists).size).toBe(p.variants);
        });
      }
    });
  }

  it('variant index wraps (4 brick variants, 2 stone variants)', () => {
    expect(json(run(brickPainter, 3, 4).ops)).toBe(json(run(brickPainter, 3, 0).ops));
    expect(json(run(brownstonePainter, 3, 3).ops)).toBe(json(run(brownstonePainter, 3, 1).ops));
  });

  it('painted brick (v2 white, v3 grey) is lighter on average than red and brown brick', () => {
    const lum = [0, 1, 2, 3].map((v) => meanLuminance(run(brickPainter, 21, v).ops));
    expect(lum[2]).toBeGreaterThan(lum[0]);
    expect(lum[2]).toBeGreaterThan(lum[1]);
    expect(lum[3]).toBeGreaterThan(lum[0]);
    expect(lum[3]).toBeGreaterThan(lum[1]);
    expect(lum[2]).toBeGreaterThan(lum[3]); // white above grey
    expect(lum[1]).toBeLessThan(lum[0]); // brown darker than red
  });

  it('brick relief is shared by all variants, so it must not depend on the variant or the colour rng', () => {
    const base = run(brickPainter, 5, 0, 1024, true);
    for (let v = 1; v < 4; v++) {
      const r = run(brickPainter, 99 + v, v, 1024, true);
      // same aux seed in all runs
      const c = makeCtx();
      const hc = makeCtx();
      const rc = makeCtx();
      brickPainter(c.ctx, 1024, 1024, new Rng(99 + v), v, { height: hc.ctx, rough: rc.ctx, rng: new Rng(5 ^ 0x9e3779b9) });
      expect(json(hc.ops)).toBe(json(base.height));
      expect(json(rc.ops)).toBe(json(base.rough));
      expect(r.height.length).toBe(base.height.length);
    }
  });

  it('brownstone is darker than limestone; the stoop variant is darker than the facade variant', () => {
    const b0 = meanLuminance(run(brownstonePainter, 4, 0).ops);
    const b1 = meanLuminance(run(brownstonePainter, 4, 1).ops);
    const lime = meanLuminance(run(limestonePainter, 4, 0, 512).ops);
    expect(b1).toBeLessThan(b0);
    expect(lime).toBeGreaterThan(b0 * 1.5);
  });

  it('brownstone v1 spalls more: far more elliptical flakes than v0', () => {
    const n = (v: number): number => run(brownstonePainter, 4, v).ops.filter((o) => o.name === 'ellipse').length;
    expect(n(1)).toBeGreaterThan(n(0) * 2);
  });

  it('cornice is near-black paint with rust showing along the edges', () => {
    const r = run(cornicePainter, 6, 0, 512);
    expect(meanLuminance(r.ops)).toBeLessThan(50);
    const rust = r.ops.filter((o) => o.name === 'fillRect' && /^hsl\((1[4-9]|2[0-6]),/.test(o.fill));
    expect(rust.length).toBeGreaterThan(100);
  });

  it('cornice profile height: the aux height spans a wide grey range', () => {
    const r = run(cornicePainter, 6, 0, 512, true);
    const greys = r.height.filter((o) => o.name === 'set:fillStyle').map((o) => Number(/rgb\((\d+),/.exec(String(o.args[0]))?.[1] ?? NaN)).filter((n) => !Number.isNaN(n));
    expect(Math.max(...greys) - Math.min(...greys)).toBeGreaterThan(120);
  });
});
