import { describe, expect, it, vi } from 'vitest';
import { Rng } from '@/core/Rng';
import type { Painter } from '@/textures/canvas';
import * as art from '@/textures/painters/storefront-art';
import {
  MAX_TEX, PICTOGRAM_KINDS, PX_PER_M, STICKER_ATLAS, STICKER_SLOTS, STORE_KINDS, STORE_NAMES, awningCanvasSize, classifyArchetype,
  cuisineOf, drawPictogram, drawSegmentDigits, drawStripe, layoutAwning, layoutSign, ppmFor, signCanvasSize, storefrontName,
  type Archetype, type StickerKind, type StripeKind,
} from '@/textures/painters/storefront-art';
import { awningPainter, awningSlopePainter, awningStyle, awningValancePainter, signPainter, stickerAtlasPainter } from '@/textures/painters/signage';
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
      ['FULTON WIRELESS', 'cellphone'], ['FONE FIXERS · UNLOCK · REPAIR', 'cellphone'], ['CELL-U-LAR CITY', 'cellphone'],
      ['FULTON NOTARY', 'generic'], ['A', 'generic'],
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
      for (const size of [24, 36]) {
        const { ctx, ops } = strict();
        real(ctx, kind, 40, 30, size, art.PICTOGRAM_COLOR[kind]);
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

describe('true-aspect textures (no pre-squeeze)', () => {
  it('canvas size follows the geometry at one density across and down', () => {
    for (const [w, slope, val] of [[3.2, 1.55, 0.34], [6.2, 1.55, 0.34], [11.4, 1.55, 0.34], [4.4, 1.0, 0.3]] as const) {
      const g = awningCanvasSize({ widthM: w, slopeM: slope, valanceM: val, fringeM: 0.035 });
      expect(Math.abs(g.w / w / g.ppm - 1), `awning ${w}`).toBeLessThan(0.02);
      expect(Math.abs(g.h / (slope + val + 0.035) / g.ppm - 1), `awning ${w}`).toBeLessThan(0.02);
      expect(g.w).toBeLessThanOrEqual(MAX_TEX);
    }
    for (const [w, h] of [[2.6, 0.56], [5.8, 0.56], [11, 0.56]] as const) {
      const g = signCanvasSize({ widthM: w, heightM: h });
      expect(Math.abs(g.w / w / g.ppm - 1)).toBeLessThan(0.02);
      expect(Math.abs(g.h / h / g.ppm - 1)).toBeLessThan(0.02);
      expect(g.ppm).toBeLessThanOrEqual(PX_PER_M);
    }
    // density only drops when the width would overflow the texture limit
    expect(ppmFor(6)).toBe(PX_PER_M);
    expect(ppmFor(20)).toBeCloseTo(MAX_TEX / 20, 5);
  });

  it('painters never scale x and y differently (no squeeze compensation)', () => {
    const geom = { widthM: 6.2, slopeM: 1.55, valanceM: 0.34, fringeM: 0.035 };
    const a = awningCanvasSize(geom);
    const sg = { widthM: 5.8, heightM: 0.56 };
    const s = signCanvasSize(sg);
    for (const p of POIS) {
      for (const ops of [
        run(awningPainter(p.awningColor, p.sign, geom), a.w, a.h),
        run(awningValancePainter(p.awningColor, p.sign, geom), a.w, Math.round(0.375 * a.ppm)),
        run(awningSlopePainter(p.awningColor, p.sign, 6.2), 298, 74),
        run(signPainter(p.sign, '#161616', '#f5f0e0', sg), s.w, s.h),
      ]) {
        for (const o of ops.filter((x) => x.name === 'scale')) expect(o.args[0], p.id).toBe(o.args[1]);
      }
    }
  });

  it('text fits the geometry it was sized for, on every parody name, at corner-store widths too', () => {
    for (const widthM of [4.4, 6.2, 11.4]) {
      const geom = { widthM, slopeM: 1.55, valanceM: 0.34, fringeM: 0.035 };
      const a = awningCanvasSize(geom);
      const sg = { widthM: widthM - 0.4, heightM: 0.56 };
      const s = signCanvasSize(sg);
      for (const name of Object.values(STORE_NAMES).flat()) {
        for (const x of texts(run(awningPainter('#d62828', name, geom), a.w, a.h))) {
          expect(String(x.args[0]).length * fontPx(x.font!) * 0.6, `${name} awning ${widthM}`).toBeLessThanOrEqual(a.w);
        }
        for (const x of texts(run(signPainter(name, '#161616', '#f5f0e0', sg), s.w, s.h))) {
          expect(String(x.args[0]).length * fontPx(x.font!) * 0.6, `${name} sign ${widthM}`).toBeLessThanOrEqual(s.w);
          // letters are no taller than the board
          expect(fontPx(x.font!), name).toBeLessThanOrEqual(s.h);
        }
      }
    }
  });

  it('a long awning prints the name once, at the same letter height as a short one', () => {
    const name = 'KING DELI';
    const h = (widthM: number): number => {
      const geom = { widthM, slopeM: 1.55, valanceM: 0.34, fringeM: 0.035 };
      const a = awningCanvasSize(geom);
      const t = texts(run(awningPainter('#d62828', name, geom), a.w, a.h));
      expect(t.length).toBe(1);
      return fontPx(t[0].font!) / a.ppm; // letter height in metres
    };
    expect(h(11.4)).toBeCloseTo(h(6.2), 1);
  });
});

describe('storefront names and cuisines', () => {
  const EXPECT: Record<string, Archetype[]> = {
    bodega: ['bodega'], deli: ['bodega'], laundromat: ['laundromat'], barber: ['barber'], liquor: ['liquor'], pharmacy: ['pharmacy'],
    daycare: ['daycare'], restaurant: ['kitchen', 'pizza'], cellphone: ['cellphone'], church: ['church'], generic: ['generic', 'dollar', 'auto'],
  };

  it('every pooled parody name classifies back to its own type', () => {
    expect(STORE_KINDS.length).toBe(11);
    for (const kind of STORE_KINDS) {
      expect(STORE_NAMES[kind].length, kind).toBeGreaterThanOrEqual(3);
      for (const n of STORE_NAMES[kind]) expect(EXPECT[kind], `${kind}: ${n}`).toContain(classifyArchetype(n));
    }
  });

  it('restaurants come in Caribbean, soul food and Chinese take-out, each with its own icons', () => {
    expect(STORE_NAMES.restaurant.length).toBe(9);
    const seen = new Set<string>();
    ['caribbean', 'soul', 'chinese'].forEach((c, i) => {
      for (let n = 0; n < 3; n++) {
        const name = storefrontName('restaurant', n, c as 'caribbean' | 'soul' | 'chinese');
        expect(STORE_NAMES.restaurant.indexOf(name) / 3 | 0, name).toBe(i);
        expect(cuisineOf(name), name).toBe(c);
        seen.add(layoutAwning(name).pictograms.join(','));
      }
    });
    expect(seen.size).toBe(3);
    expect(layoutAwning(storefrontName('restaurant', 0, 'caribbean')).pictograms).toContain('chili');
    expect(layoutAwning(storefrontName('restaurant', 0, 'soul')).pictograms).toContain('drumstick');
    expect(layoutAwning(storefrontName('restaurant', 0, 'chinese')).pictograms).toContain('bowl');
  });

  it('names are parody: no real chains or brands, deterministic by index', () => {
    const banned = /(CVS|WALGREEN|RITE AID|DUANE|MCDONALD|BURGER KING|SUBWAY|STARBUCKS|DUNKIN|7-?ELEVEN|VERIZON|T-?MOBILE|SPRINT|AT&T|METRO ?PCS|WESTERN UNION|BUDWEISER|COCA|PEPSI|LOTTERY|MEGA MILLIONS|POWERBALL|DOMINO|PAPA JOHN|FAMILY DOLLAR|KFC|POPEYES|WENDY|HERTZ)/i;
    for (const kind of STORE_KINDS) {
      for (const n of STORE_NAMES[kind]) expect(banned.test(n), n).toBe(false);
      expect(storefrontName(kind, 7)).toBe(storefrontName(kind, 7));
      expect(storefrontName(kind, 7)).toBe(storefrontName(kind, 7 + STORE_NAMES[kind].length));
    }
  });
});

describe('window stickers', () => {
  it('atlas slots lie inside the atlas, do not overlap, and are sized in metres at one density', () => {
    const kinds = Object.keys(STICKER_SLOTS) as StickerKind[];
    for (const k of kinds) {
      const s = STICKER_SLOTS[k];
      expect(s.x + s.w, k).toBeLessThanOrEqual(STICKER_ATLAS.w);
      expect(s.y + s.h, k).toBeLessThanOrEqual(STICKER_ATLAS.h);
      expect(s.w / s.wM, k).toBeCloseTo(s.h / s.hM, 3);
    }
    for (let i = 0; i < kinds.length; i++) {
      for (let j = i + 1; j < kinds.length; j++) {
        const a = STICKER_SLOTS[kinds[i]], b = STICKER_SLOTS[kinds[j]];
        const overlap = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
        expect(overlap, `${kinds[i]} vs ${kinds[j]}`).toBe(false);
      }
    }
  });

  it('paints ATM, EBT, lotto and OPEN stickers with supported calls only, deterministically', () => {
    const a = run(stickerAtlasPainter, STICKER_ATLAS.w, STICKER_ATLAS.h, 3);
    const strs = texts(a).map((x) => String(x.args[0]));
    for (const w of ['ATM', 'EBT', 'LOTTO', 'OPEN', 'MENU']) expect(strs, w).toContain(w);
    expect(json(run(stickerAtlasPainter, STICKER_ATLAS.w, STICKER_ATLAS.h, 3))).toBe(json(a));
    // the neon OPEN sign is stroked text (glow passes) inside its own slot
    expect(a.filter((x) => x.name === 'strokeText').length).toBeGreaterThanOrEqual(4);
    // generic wording only
    expect(strs.join(' ')).not.toMatch(/MEGA|POWERBALL|LOTTERY/i);
  });

  it('cellphone and cuisine pictograms exist', () => {
    for (const k of ['phone', 'chili', 'drumstick'] as const) expect(PICTOGRAM_KINDS).toContain(k);
    expect(layoutAwning('FONE FIXERS · UNLOCK').pictograms).toEqual(['phone', 'phone']);
  });
});
