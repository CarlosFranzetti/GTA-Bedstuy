import { describe, expect, it, vi } from 'vitest';
import { Rng } from '@/core/Rng';
import type { Painter } from '@/textures/canvas';
import * as art from '@/textures/painters/storefront-art';
import {
  PICTOGRAM_KINDS, classifyArchetype, drawPictogram, drawSegmentDigits, drawStripe, layoutAwning, layoutSign,
  type Archetype, type StripeKind,
} from '@/textures/painters/storefront-art';
import { awningPainter, awningStyle, signPainter } from '@/textures/painters/signage';
import bedstuy from '@/world/data/bedstuy.json';

// Wrap drawPictogram so the painter's calls (made through the module binding) can be counted, still drawing for real.
vi.mock('@/textures/painters/storefront-art', async (orig) => {
  const m = await orig<typeof import('@/textures/painters/storefront-art')>();
  return { ...m, drawPictogram: vi.fn(m.drawPictogram) };
});

interface Op { name: string; args: unknown[]; font?: string }

function fontPx(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : 10;
}

/**
 * Context that supports ONLY the calls the repo's pixel fake supports (plus strokeText): any other method, ellipse
 * included, throws. Records every call; measureText is estimated from the font size.
 */
const ALLOWED = new Set([
  'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'strokeRect', 'fillText', 'strokeText',
  'closePath', 'quadraticCurveTo', 'translate', 'rotate', 'scale', 'fillRect',
]);

function strict(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1, textAlign: 'start' };
  const ctx = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * fontPx(String(state.font)) * 0.6 });
      if (prop in state) return state[prop];
      if (!ALLOWED.has(prop)) throw new Error(`unsupported ctx.${prop}`);
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

function run(p: Painter, w: number, h: number, seed = 5): Op[] {
  const { ctx, ops } = strict();
  p(ctx, w, h, new Rng(seed), 0);
  return ops;
}

const json = (o: Op[]): string => JSON.stringify(o);
const texts = (o: Op[]): Op[] => o.filter((x) => x.name === 'fillText');

const POIS = (bedstuy as { pois: { id: string; sign: string; awningColor: string }[] }).pois;

describe('layoutAwning / archetypes', () => {
  it('maps keywords to archetypes', () => {
    const cases: [string, Archetype][] = [
      ['KING DELI', 'bodega'], ['BEDFORD GROCERY', 'bodega'], ['LEWIS FOOD', 'bodega'], ['NOSTRAND BODEGA', 'bodega'],
      ['SPEEDY WASH & FOLD', 'laundromat'], ['SUDS LAUNDROMAT', 'laundromat'],
      ['FRESH CUTZ', 'barber'], ['ROYAL BARBER SHOP', 'barber'],
      ['MAMA BRAIDING', 'salon'], ['MARIO PIZZA', 'pizza'], ['WOK KITCHEN', 'kitchen'],
      ['CORNER LIQUOR', 'liquor'], ['99¢ PLUS', 'dollar'], ['HEALTHY PHARMACY', 'pharmacy'],
      ['SUNSHINE DAYCARE', 'daycare'], ['EASY FUNERAL HOME', 'funeral'], ['QUICK AUTO', 'auto'],
      ['FIRST BAPTIST CHURCH', 'church'], ['TABERNACLE OF SOMETHING', 'church'], ['NOW LEASING', 'condo'],
      ['FULTON WIRELESS', 'generic'], ['A', 'generic'],
    ];
    for (const [text, arch] of cases) expect(classifyArchetype(text), text).toBe(arch);
    expect(classifyArchetype('king deli')).toBe('bodega');
  });

  it('classifies every parody POI as its data archetype', () => {
    const expected: Record<string, Archetype> = {
      'troop-deli': 'bodega', komat: 'laundromat', 'garvey-cutz': 'barber', braids: 'salon', oxtail: 'kitchen',
      golden: 'kitchen', slice: 'pizza', church: 'church', liquor: 'liquor', dollar: 'dollar', rx: 'pharmacy',
      daycare: 'daycare', funeral: 'funeral', auto: 'auto', condo: 'condo',
    };
    expect(POIS.length).toBe(15);
    for (const p of POIS) expect(layoutAwning(p.sign).archetype, p.id).toBe(expected[p.id]);
  });

  it('splits main/sub lines, adds a 718-555-01xx number and pictograms', () => {
    const l = layoutAwning('King Deli  ·  Grocery · ATM');
    expect(l.mainLine).toBe('KING DELI');
    expect(l.subLine).toBe('GROCERY · ATM');
    expect(l.phone).toMatch(/^718-555-01\d\d$/);
    expect(l.pictograms.length).toBe(4);
    expect(l.pictograms).toContain('atm');
    for (const k of l.pictograms) expect(PICTOGRAM_KINDS).toContain(k);
    expect(l.stripe).not.toBe('none');
    expect(layoutAwning('KING DELI').subLine).toBeNull();
    // every typed archetype gets at least one pictogram; churches have no phone number
    for (const p of POIS) expect(layoutAwning(p.sign).pictograms.length, p.id).toBeGreaterThan(0);
    expect(layoutAwning('GREATER TABERNACLE').phone).toBeUndefined();
    expect(layoutAwning('GREATER TABERNACLE').pictograms).toEqual(['cross']);
    expect(layoutAwning('A').pictograms).toEqual([]);
    expect(layoutAwning('A').phone).toBeUndefined();
  });

  it('is deterministic and agrees with awningStyle; metal only for bodega-type shops', () => {
    for (const p of POIS) {
      expect(JSON.stringify(layoutAwning(p.sign))).toBe(JSON.stringify(layoutAwning(p.sign)));
      expect(layoutAwning(p.sign).style).toBe(awningStyle(p.sign));
      if (!['bodega', 'dollar', 'generic'].includes(layoutAwning(p.sign).archetype)) expect(awningStyle(p.sign), p.id).toBe('vinyl');
    }
    const styles = new Set(['KING DELI', 'BEDFORD GROCERY', 'MARCY MARKET', 'THROOP DELI', 'LEWIS FOOD', 'NOSTRAND BODEGA'].map(awningStyle));
    expect(styles.size).toBe(2);
    // different shops get different numbers
    expect(layoutAwning('KING DELI').phone).not.toBe(layoutAwning('MARCY MARKET').phone);
  });
});

describe('awning painter', () => {
  it('bodega awnings print the main line and draw pictograms (both styles)', () => {
    const drawn = vi.mocked(art.drawPictogram);
    for (const name of ['KING DELI · GROCERY · ATM', 'BEDFORD GROCERY', 'MARCY MARKET · LOTTO', 'THROOP DELI', 'LEWIS FOOD', 'NOSTRAND BODEGA']) {
      drawn.mockClear();
      const o = run(awningPainter('#d62828', name), 512, 256, 3);
      const main = layoutAwning(name).mainLine;
      expect(texts(o).map((x) => x.args[0]), name).toContain(main);
      expect(drawn.mock.calls.length, name).toBeGreaterThanOrEqual(1);
      expect(drawn.mock.calls.every((c) => PICTOGRAM_KINDS.includes(c[1])), name).toBe(true);
    }
  });

  it('the phone number is drawn as segments, never as text; the name is the only text', () => {
    const o = run(awningPainter('#1d6fa5', 'KOSCIUSZ-K-O-MAT · WASH DRY FOLD'), 512, 256, 3);
    const strs = texts(o).map((x) => String(x.args[0]));
    expect(strs).toEqual(['KOSCIUSZ-K-O-MAT', 'WASH DRY FOLD']);
    expect(strs.join(' ')).not.toMatch(/718/);
  });

  it('text shrinks to fit and keeps clear of the icons', () => {
    for (const name of ['A', 'THROOP DELI & GROCERY CORP EXTRA LONG NAME ON A VERY LONG AWNING', ...POIS.map((p) => p.sign)]) {
      for (const color of ['#d62828', '#ffd400', '#111111']) {
        const o = run(awningPainter(color, name), 512, 256, 2);
        for (const x of texts(o)) expect(String(x.args[0]).length * fontPx(x.font!) * 0.6, name).toBeLessThanOrEqual(512);
      }
    }
  });

  it('is deterministic for the same text and varies between archetypes', () => {
    const a = run(awningPainter('#d62828', 'MARIO PIZZA'), 512, 256, 9);
    expect(json(run(awningPainter('#d62828', 'MARIO PIZZA'), 512, 256, 9))).toBe(json(a));
    expect(json(run(awningPainter('#d62828', 'MARIO BARBER'), 512, 256, 9))).not.toBe(json(a));
  });
});

describe('sign painter', () => {
  it('layoutSign parses lines and badges', () => {
    const l = layoutSign('FRESH FISH · OPEN 24 HRS');
    expect(l.mainLine).toBe('FRESH FISH');
    expect(l.subLine).toBeNull();
    expect(l.badges).toEqual([{ kind: 'open', label: 'OPEN 24 HRS' }]);
    const b = layoutSign('KING DELI · ATM · WE ACCEPT EBT');
    expect(b.mainLine).toBe('KING DELI');
    expect(b.subLine).toBeNull();
    expect(b.badges.map((x) => x.kind)).toEqual(['atm', 'ebt']);
    expect(layoutSign('TROOP DELI & GROCERY  ·  OPEN 25 HRS').badges[0]).toEqual({ kind: 'open', label: 'OPEN 25 HRS' });
    expect(layoutSign('GARVEY CUTZ · WALK-INS WELCOME').subLine).toBe('WALK-INS WELCOME');
    expect(layoutSign('FRESH FISH').badges).toEqual([]);
    expect(layoutSign('VAN BUREN WINE & LIQUOR').neon).toBe(true);
    expect(layoutSign('FRESH FISH').neon).toBe(false);
  });

  it('"OPEN 24 HRS" draws a badge: a filled, bordered rectangle with its own text off-centre', () => {
    const plain = run(signPainter('FRESH FISH', '#161616', '#f5f0e0'), 512, 128, 4);
    const o = run(signPainter('FRESH FISH · OPEN 24 HRS', '#161616', '#f5f0e0'), 512, 128, 4);
    const badge = texts(o).find((x) => x.args[0] === 'OPEN 24 HRS');
    expect(badge).toBeTruthy();
    expect(Number(badge!.args[1])).toBeGreaterThan(256 + 100);
    expect(badge!.font).toMatch(/bold/);
    const main = texts(o).find((x) => x.args[0] === 'FRESH FISH');
    expect(Number(main!.args[1])).toBe(256);
    expect(o.some((x) => x.name === 'set:fillStyle' && x.args[0] === '#c4161c')).toBe(true);
    expect(o.filter((x) => x.name === 'strokeRect').length).toBeGreaterThan(plain.filter((x) => x.name === 'strokeRect').length);
    expect(texts(plain).map((x) => x.args[0])).not.toContain('OPEN 24 HRS');
  });

  it('ATM and EBT badges appear, at most two', () => {
    const o = run(signPainter('KING DELI · OPEN 24 HRS · ATM · WE ACCEPT EBT', '#161616', '#f5f0e0'), 512, 128, 4);
    const strs = texts(o).map((x) => String(x.args[0]));
    expect(strs).toContain('OPEN 24 HRS');
    expect(strs).toContain('ATM');
    expect(strs).not.toContain('WE ACCEPT EBT');
    const e = run(signPainter('FRESH FISH · WE ACCEPT EBT', '#161616', '#f5f0e0'), 512, 128, 4);
    expect(texts(e).map((x) => x.args[0])).toContain('WE ACCEPT EBT');
  });

  it('two-line signs draw a big main line and a smaller second line, both centred', () => {
    const o = run(signPainter('GARVEY CUTZ · WALK-INS WELCOME', '#161616', '#f5f0e0'), 512, 128, 4);
    const t = texts(o);
    expect(t.map((x) => x.args[0])).toEqual(['GARVEY CUTZ', 'WALK-INS WELCOME']);
    for (const x of t) expect(x.args[1]).toBe(256);
    expect(fontPx(t[1].font!)).toBeLessThan(fontPx(t[0].font!));
  });

  it('liquor and bar signs get neon: bright stroked glow passes plus the fill; others get none', () => {
    const neon = run(signPainter('VAN BUREN WINE & LIQUOR · CHILLED', '#161616', '#f5f0e0'), 512, 128, 4);
    const strokes = neon.filter((x) => x.name === 'strokeText');
    expect(strokes.length).toBeGreaterThanOrEqual(8);
    const widths = new Set(neon.filter((x) => x.name === 'set:lineWidth').map((x) => x.args[0]));
    expect(widths.size).toBeGreaterThan(6);
    expect(texts(neon).map((x) => x.args[0])).toContain('VAN BUREN WINE & LIQUOR');
    expect(run(signPainter('FRESH FISH', '#161616', '#f5f0e0'), 512, 128, 4).some((x) => x.name === 'strokeText')).toBe(false);
  });

  it('text shrinks to fit and badge/icon margins keep it inside the board', () => {
    for (const p of POIS) {
      const o = run(signPainter(p.sign, '#161616', '#f5f0e0'), 512, 128, 6);
      expect(texts(o).length, p.id).toBeGreaterThan(0);
      for (const x of texts(o)) expect(String(x.args[0]).length * fontPx(x.font!) * 0.6, p.id).toBeLessThanOrEqual(512);
    }
    const long = run(signPainter('THE VERY LONG NAME OF A SHOP THAT KEEPS GOING · AND A VERY LONG SECOND LINE TOO · OPEN 24 HRS', '#161616', '#fff'), 512, 128);
    for (const x of texts(long)) expect(String(x.args[0]).length * fontPx(x.font!) * 0.6).toBeLessThanOrEqual(512);
  });

  it('is deterministic per text', () => {
    for (const p of POIS) {
      expect(json(run(signPainter(p.sign, '#161616', '#f5f0e0'), 512, 128, 2))).toBe(json(run(signPainter(p.sign, '#161616', '#f5f0e0'), 512, 128, 2)));
    }
  });
});

describe('storefront art primitives', () => {
  it('never uses ctx.ellipse (or any call outside the pixel-fake set), for every POI', () => {
    // the strict context throws on anything but the supported calls, so simply painting proves it
    for (const p of POIS) {
      expect(() => run(awningPainter(p.awningColor, p.sign), 512, 256)).not.toThrow();
      expect(() => run(signPainter(p.sign, '#161616', '#f5f0e0'), 512, 128)).not.toThrow();
    }
    const { ctx } = strict();
    expect(() => (ctx as unknown as { ellipse: () => void }).ellipse()).toThrow(/unsupported/);
  });

  it('drawPictogram draws every kind with balanced save/restore, no text and no unsupported calls', () => {
    const real = vi.mocked(art.drawPictogram).getMockImplementation() ?? drawPictogram;
    for (const kind of PICTOGRAM_KINDS) {
      for (const aspect of [1, 2.4]) {
        const { ctx, ops } = strict();
        real(ctx, kind, 40, 30, 36, art.PICTOGRAM_COLOR[kind], aspect);
        expect(ops.length, kind).toBeGreaterThan(5);
        expect(ops.filter((o) => o.name === 'save').length, kind).toBe(ops.filter((o) => o.name === 'restore').length);
        expect(ops.some((o) => o.name === 'fillText' || o.name === 'strokeText'), kind).toBe(false);
        expect(ops.some((o) => o.name === 'fill' || o.name === 'fillRect' || o.name === 'stroke'), kind).toBe(true);
      }
    }
    // deterministic
    const a = strict(); real(a.ctx, 'sandwich', 10, 10, 30, '#d9a15b');
    const b = strict(); real(b.ctx, 'sandwich', 10, 10, 30, '#d9a15b');
    expect(json(a.ops)).toBe(json(b.ops));
  });

  it('drawSegmentDigits and drawStripe use fillRect/paths only', () => {
    const { ctx, ops } = strict();
    drawSegmentDigits(ctx, '718-555-0199', 100, 50, 22, '#fff');
    expect(ops.every((o) => o.name === 'fillRect' || o.name === 'set:fillStyle')).toBe(true);
    expect(ops.filter((o) => o.name === 'fillRect').length).toBeGreaterThan(30);
    const kinds: StripeKind[] = ['bands', 'diagonal', 'checker', 'waves', 'dots', 'zigzag', 'pin'];
    for (const k of kinds) {
      const s = strict();
      drawStripe(s.ctx, k, 0, 0, 512, 22, ['#c4161c', '#ffffff', '#1d4fa6']);
      expect(s.ops.length, k).toBeGreaterThan(3);
      expect(s.ops.filter((o) => o.name === 'save').length).toBe(s.ops.filter((o) => o.name === 'restore').length);
    }
    const none = strict();
    drawStripe(none.ctx, 'none', 0, 0, 512, 22, ['#fff']);
    expect(none.ops.length).toBe(0);
  });
});
