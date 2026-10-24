import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import type { Aux, Painter } from '@/textures/canvas';
import {
  GUM, asphaltPainter, bluestonePainter, concretePainter, crosswalkPainter, granitePainter, gratePainter, manholePainter,
} from '@/textures/painters/ground';

interface Op { name: string; args: unknown[] }
interface Rec { ctx: CanvasRenderingContext2D; ops: Op[] }

/** Recording 2D context: no pixel access, no gradients, just a log of every call and property write. */
function recorder(): Rec {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1, textAlign: 'start' };
  const ctx = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 6 });
      if (prop in state) return state[prop];
      return (...args: unknown[]) => { ops.push({ name: prop, args }); };
    },
    set(_t, prop: string, v) {
      state[prop] = v;
      ops.push({ name: `set:${prop}`, args: [v] });
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

interface Run { main: Op[]; height: Op[]; rough: Op[] }

function paint(painter: Painter, w: number, h: number, seed: number, variant: number, withAux = false): Run {
  const c = recorder();
  const hc = recorder();
  const rc = recorder();
  const aux: Aux | undefined = withAux ? { height: hc.ctx, rough: rc.ctx, rng: new Rng(seed + 777) } : undefined;
  painter(c.ctx, w, h, new Rng(seed), variant, aux);
  return { main: c.ops, height: hc.ops, rough: rc.ops };
}

const PAINTERS: [string, Painter, number, number[]][] = [
  ['asphalt', asphaltPainter, 512, [0, 1]],
  ['concrete', concretePainter, 512, [0, 1]],
  ['crosswalk', crosswalkPainter, 256, [0]],
  ['bluestone', bluestonePainter, 512, [0, 1]],
  ['granite', granitePainter, 256, [0]],
  ['manhole', manholePainter, 256, [0, 1]],
  ['grate', gratePainter, 256, [0]],
];

describe('ground painters', () => {
  for (const [name, painter, size, variants] of PAINTERS) {
    for (const v of variants) {
      it(`${name} v${v} is deterministic for a seed and varies with it`, () => {
        const a = JSON.stringify(paint(painter, size, size, 11, v).main);
        const b = JSON.stringify(paint(painter, size, size, 11, v).main);
        expect(a).toBe(b);
        expect(a.length).toBeGreaterThan(200);
        const other = JSON.stringify(paint(painter, size, size, 12, v).main);
        expect(other).not.toBe(a);
      });

      it(`${name} v${v} colour map is identical with and without relief layers, and fills the relief canvas`, () => {
        const plain = paint(painter, size, size, 5, v, false);
        const withAux = paint(painter, size, size, 5, v, true);
        expect(JSON.stringify(withAux.main)).toBe(JSON.stringify(plain.main));
        if (name !== 'crosswalk') expect(withAux.height.length).toBeGreaterThan(10);
      });

      it(`${name} v${v} only uses recordable primitives (no pixel access, no gradients)`, () => {
        const ops = paint(painter, size, size, 3, v, true);
        const names = new Set([...ops.main, ...ops.height, ...ops.rough].map((o) => o.name));
        for (const bad of ['getImageData', 'putImageData', 'createLinearGradient', 'createRadialGradient', 'drawImage']) {
          expect(names.has(bad)).toBe(false);
        }
      });
    }
  }

  it('manhole v0 letters "BKLYN SEWER" as raised text, drawn into the relief too', () => {
    const run = paint(manholePainter, 256, 256, 9, 0, true);
    const texts = run.main.filter((o) => o.name === 'fillText').map((o) => String(o.args[0]));
    expect(texts.length).toBeGreaterThanOrEqual(2); // shadow + highlight
    for (const t of texts) expect(t).toContain('BKLYN');
    expect(run.height.some((o) => o.name === 'fillText' && String(o.args[0]).includes('BKLYN'))).toBe(true);
  });

  it('manhole v1 is the waffle variant and carries no lettering', () => {
    const v0 = paint(manholePainter, 256, 256, 9, 0);
    const v1 = paint(manholePainter, 256, 256, 9, 1);
    expect(v1.main.some((o) => o.name === 'fillText')).toBe(false);
    expect(JSON.stringify(v1.main)).not.toBe(JSON.stringify(v0.main));
    // many square bosses
    expect(v1.main.filter((o) => o.name === 'fillRect').length).toBeGreaterThan(200);
  });

  it('bluestone v0 and v1 differ, and v1 adds a replaced concrete patch and cracks', () => {
    const v0 = paint(bluestonePainter, 512, 512, 21, 0);
    const v1 = paint(bluestonePainter, 512, 512, 21, 1);
    expect(JSON.stringify(v0.main)).not.toBe(JSON.stringify(v1.main));
    const patch = (ops: Op[]) => ops.some((o) => o.name === 'set:fillStyle' && o.args[0] === 'rgb(152,150,143)');
    expect(patch(v0.main)).toBe(false);
    expect(patch(v1.main)).toBe(true);
    const strokes = (ops: Op[]) => ops.filter((o) => o.name === 'stroke').length;
    expect(strokes(v1.main)).toBeGreaterThan(strokes(v0.main));
  });

  it('bluestone flags show lichen spots and chipped corners', () => {
    const run = paint(bluestonePainter, 512, 512, 21, 0);
    const lichenFills = run.main.filter((o) => o.name === 'set:fillStyle' && /^rgb\((176,184,120|202,204,178|150,170,116|214,208,150)\)$/.test(String(o.args[0])));
    expect(lichenFills.length).toBeGreaterThan(3);
    expect(run.main.filter((o) => o.name === 'closePath').length).toBeGreaterThan(2); // chipped corner polygons
  });

  it('sidewalk concrete v0 draws at least 8 gum discs; the backyard variant draws none', () => {
    const gumDiscs = (ops: Op[]): number => {
      let fill = '';
      let n = 0;
      for (const o of ops) {
        if (o.name === 'set:fillStyle') fill = String(o.args[0]);
        else if (o.name === 'arc' && fill === GUM) n++;
      }
      return n;
    };
    expect(gumDiscs(paint(concretePainter, 512, 512, 4, 0).main)).toBeGreaterThanOrEqual(8);
    expect(gumDiscs(paint(concretePainter, 512, 512, 4, 1).main)).toBe(0);
    // size-independent: the 256px layout draws the same discs
    expect(gumDiscs(paint(concretePainter, 256, 256, 4, 0).main)).toBeGreaterThanOrEqual(8);
  });

  it('sidewalk concrete v0 has a 2x2 slab layout with an expansion joint and tar-sealed crack; v1 is algae-green', () => {
    const v0 = paint(concretePainter, 512, 512, 4, 0, true);
    const fills = (ops: Op[]) => ops.filter((o) => o.name === 'set:fillStyle').map((o) => String(o.args[0]));
    expect(fills(v0.main)).toContain('#34312d'); // asphalt-filled expansion joint
    expect(v0.main.some((o) => o.name === 'set:strokeStyle' && o.args[0] === 'rgba(22,20,18,0.9)')).toBe(true); // tar
    expect(fills(v0.main).some((f) => /^rgb\(\d+,\d+,\d+\)$/.test(f) || f.startsWith('#8a4a24'))).toBe(true); // rust
    const v1 = paint(concretePainter, 512, 512, 4, 1);
    expect(fills(v1.main).filter((f) => /^hsl\((8\d|9\d|10\d|11\d)/.test(f)).length).toBeGreaterThan(10);
  });

  it('asphalt v1 (worn) draws more cracks, patches and oil than v0, and relief marks patches raised', () => {
    const v0 = paint(asphaltPainter, 512, 512, 2, 0, true);
    const v1 = paint(asphaltPainter, 512, 512, 2, 1, true);
    const count = (ops: Op[], name: string) => ops.filter((o) => o.name === name).length;
    expect(count(v1.main, 'strokeRect')).toBeGreaterThan(count(v0.main, 'strokeRect'));
    expect(count(v1.main, 'ellipse')).toBeGreaterThan(count(v0.main, 'ellipse'));
    expect(count(v1.main, 'stroke')).toBeGreaterThan(count(v0.main, 'stroke'));
    expect(v1.height.some((o) => o.name === 'set:fillStyle' && /^rgb\((15\d),\1,\1\)$/.test(String(o.args[0])))).toBe(true);
    expect(v1.rough.length).toBeGreaterThan(10);
  });

  it('granite paints a lighter wear band across the top 22% of the tile', () => {
    const { main } = paint(granitePainter, 256, 256, 8, 0);
    const bands = main.filter((o) => o.name === 'fillRect' && o.args[1] === 0 && Math.abs(Number(o.args[3]) - 0.22 * 256) < 0.01);
    expect(bands.length).toBeGreaterThan(0);
    const idx = main.indexOf(bands[0]);
    const style = [...main.slice(0, idx)].reverse().find((o) => o.name === 'set:fillStyle');
    expect(String(style?.args[0])).toBe('#f4ece8');
  });

  it('crosswalk draws four bars joined by two long edge lines', () => {
    const { main } = paint(crosswalkPainter, 256, 256, 3, 0);
    const paintColours = new Set(['#e9e7df', '#dedbd0', '#d3d0c4']);
    let fill = '';
    const rects: unknown[][] = [];
    for (const o of main) {
      if (o.name === 'set:fillStyle') fill = String(o.args[0]);
      else if (o.name === 'fillRect' && paintColours.has(fill)) rects.push(o.args);
    }
    expect(rects.filter((r) => r[2] === 256)).toHaveLength(2); // two rails across the whole u range
    expect(rects.filter((r) => Number(r[2]) < 40)).toHaveLength(4); // four bars
  });

  it('storm grate draws parallel bars and a rusty frame', () => {
    const { main } = paint(gratePainter, 256, 256, 3, 0);
    expect(main.some((o) => o.name === 'set:fillStyle' && o.args[0] === 'rgb(76,47,31)')).toBe(true);
    const bars = main.filter((o) => o.name === 'fillRect' && Number(o.args[3]) > 200);
    expect(bars.length).toBeGreaterThanOrEqual(13);
  });
});
