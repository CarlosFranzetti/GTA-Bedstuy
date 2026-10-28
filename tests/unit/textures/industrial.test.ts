import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import type { Aux, Painter } from '@/textures/canvas';
import {
  CAST_IRON_VARIANTS, CHAINLINK_FENCE_VARIANTS, CHAINLINK_RAIL_VARIANTS, CORRUGATED_VARIANTS, GRAFFITI_COLORS,
  GRAFFITI_VARIANTS, GRANITE_CURB_VARIANTS, TAR_ROOF_VARIANTS, castIronFencePainter, chainlinkFencePainter,
  chainlinkRailPainter, corrugatedSteelPainter, graffitiPainter, graniteCurbPainter, tarRoofPainter,
} from '@/textures/painters/industrial';

// ------------------------------------------------------------------------------------------------ software canvas
// A tiny non-antialiased 2D rasteriser covering only the primitives the painters may use (see ALLOWED). The shared
// fake canvases in the other texture tests only record calls, so tileability and alpha coverage need real pixels.

const ALLOWED = new Set([
  'fillRect', 'strokeRect', 'arc', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'fill', 'stroke',
  'quadraticCurveTo', 'save', 'restore',
]);

function parseColor(s: string): [number, number, number, number] {
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as unknown as [number, number, number, number];
  const r = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (r) return [+r[1], +r[2], +r[3], r[4] === undefined ? 1 : +r[4]];
  const h = /^hsl\(\s*(-?[\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/.exec(s);
  if (h) {
    const hh = (((+h[1] % 360) + 360) % 360) / 360, ss = +h[2] / 100, ll = +h[3] / 100;
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const f = (t0: number): number => {
      const t = ((t0 % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255, 1];
  }
  throw new Error(`unparsed colour ${s}`);
}

type Pt = [number, number];

class SoftCtx {
  readonly data: Float32Array; // r, g, b, a(0..1), non-premultiplied
  readonly names = new Set<string>();
  fillStyle = '#000000';
  strokeStyle = '#000000';
  globalAlpha = 1;
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  private path: Pt[][] = [];
  private stack: Record<string, unknown>[] = [];

  constructor(readonly w: number, readonly h: number, init?: [number, number, number, number]) {
    this.data = new Float32Array(w * h * 4);
    if (init) for (let i = 0; i < w * h; i++) this.data.set(init, i * 4);
  }

  save(): void {
    this.stack.push({ f: this.fillStyle, s: this.strokeStyle, a: this.globalAlpha, lw: this.lineWidth, c: this.lineCap, j: this.lineJoin });
  }

  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.fillStyle = s.f as string; this.strokeStyle = s.s as string; this.globalAlpha = s.a as number;
    this.lineWidth = s.lw as number; this.lineCap = s.c as string; this.lineJoin = s.j as string;
  }

  private blend(i: number, col: [number, number, number, number]): void {
    const a = col[3] * this.globalAlpha;
    if (a <= 0) return;
    const d = this.data;
    const da = d[i + 3];
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) d[i + k] = (col[k] * a + d[i + k] * da * (1 - a)) / oa;
    d[i + 3] = oa;
  }

  private composite(mask: Uint8Array, style: string): void {
    const col = parseColor(style);
    for (let p = 0; p < mask.length; p++) if (mask[p]) this.blend(p * 4, col);
  }

  fillRect(x: number, y: number, rw: number, rh: number): void {
    if (!(rw > 0 && rh > 0)) return;
    const col = parseColor(this.fillStyle);
    const x0 = Math.max(0, Math.ceil(x - 0.5)), x1 = Math.min(this.w, Math.ceil(x + rw - 0.5));
    const y0 = Math.max(0, Math.ceil(y - 0.5)), y1 = Math.min(this.h, Math.ceil(y + rh - 0.5));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.blend((py * this.w + px) * 4, col);
  }

  strokeRect(x: number, y: number, rw: number, rh: number): void {
    this.beginPath(); this.moveTo(x, y); this.lineTo(x + rw, y); this.lineTo(x + rw, y + rh); this.lineTo(x, y + rh); this.closePath(); this.stroke();
  }

  beginPath(): void { this.path = []; }
  moveTo(x: number, y: number): void { this.path.push([[x, y]]); }
  lineTo(x: number, y: number): void {
    if (!this.path.length) this.path.push([]);
    this.path[this.path.length - 1].push([x, y]);
  }
  closePath(): void {
    const sp = this.path[this.path.length - 1];
    if (sp && sp.length) sp.push([sp[0][0], sp[0][1]]);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    const n = Math.max(12, Math.ceil(r * 2));
    const sweep = a1 - a0;
    const pts: Pt[] = [];
    const steps = Math.max(4, Math.ceil((n * Math.abs(sweep)) / (Math.PI * 2)));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (sweep * i) / steps;
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    if (!this.path.length || Math.abs(sweep) >= Math.PI * 2 - 1e-9) this.path.push(pts);
    else this.path[this.path.length - 1].push(...pts);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const sp = this.path[this.path.length - 1];
    const [sx, sy] = sp[sp.length - 1];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      sp.push([(1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * x, (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * y]);
    }
  }

  fill(): void {
    const mask = new Uint8Array(this.w * this.h);
    for (let py = 0; py < this.h; py++) {
      const yc = py + 0.5;
      const xs: number[] = [];
      for (const sp of this.path) {
        const n = sp.length;
        if (n < 2) continue;
        for (let i = 0; i < n; i++) {
          const a = sp[i], b = sp[(i + 1) % n];
          if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(this.w, Math.ceil(xs[k + 1] - 0.5));
        for (let px = x0; px < x1; px++) mask[py * this.w + px] = 1;
      }
    }
    this.composite(mask, this.fillStyle);
  }

  stroke(): void {
    const mask = new Uint8Array(this.w * this.h);
    const hw = this.lineWidth / 2;
    const dot = (cx: number, cy: number): void => {
      for (let py = Math.max(0, Math.floor(cy - hw)); py < Math.min(this.h, Math.ceil(cy + hw) + 1); py++) {
        for (let px = Math.max(0, Math.floor(cx - hw)); px < Math.min(this.w, Math.ceil(cx + hw) + 1); px++) {
          if ((px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 <= hw * hw) mask[py * this.w + px] = 1;
        }
      }
    };
    for (const sp of this.path) {
      for (let i = 0; i + 1 < sp.length; i++) {
        const [ax, ay] = sp[i], [bx, by] = sp[i + 1];
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw)), x1 = Math.min(this.w, Math.ceil(Math.max(ax, bx) + hw) + 1);
        const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw)), y1 = Math.min(this.h, Math.ceil(Math.max(ay, by) + hw) + 1);
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const qx = px + 0.5 - ax, qy = py + 0.5 - ay;
            const t = len2 === 0 ? 0 : (qx * dx + qy * dy) / len2;
            if (t < 0 || t > 1) continue;
            const ex = qx - t * dx, ey = qy - t * dy;
            if (ex * ex + ey * ey <= hw * hw) mask[py * this.w + px] = 1;
          }
        }
        if (this.lineCap === 'round') { dot(ax, ay); dot(bx, by); }
      }
    }
    this.composite(mask, this.strokeStyle);
  }

  pixels(): Uint8ClampedArray {
    const o = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      const a = this.data[i * 4 + 3];
      o[i * 4] = Math.round(this.data[i * 4] * a);
      o[i * 4 + 1] = Math.round(this.data[i * 4 + 1] * a);
      o[i * 4 + 2] = Math.round(this.data[i * 4 + 2] * a);
      o[i * 4 + 3] = Math.round(a * 255);
    }
    return o;
  }
}

/** Wrap a SoftCtx so any call outside ALLOWED throws (this is how "no ctx.ellipse" is enforced) and calls are recorded. */
function guard(sc: SoftCtx): CanvasRenderingContext2D {
  return new Proxy(sc, {
    get(t, prop: string) {
      const v = (t as unknown as Record<string, unknown>)[prop];
      if (typeof v === 'function') {
        if (!ALLOWED.has(prop)) throw new Error(`unsupported canvas call: ${prop}`);
        return (...args: unknown[]) => {
          t.names.add(prop);
          return (v as (...a: unknown[]) => unknown).apply(t, args);
        };
      }
      if (v === undefined && !(prop in t)) throw new Error(`unsupported canvas property: ${prop}`);
      return v;
    },
    set(t, prop: string, value) {
      (t as unknown as Record<string, unknown>)[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

interface Render { px: Uint8ClampedArray; h: Uint8ClampedArray | null; names: Set<string> }

function render(painter: Painter, w: number, h: number, seed: number, variant: number, withAux = false): Render {
  const c = new SoftCtx(w, h);
  const hc = new SoftCtx(w, h, [128, 128, 128, 1]);
  const aux: Aux | undefined = withAux
    ? { height: guard(hc), rough: null, rng: new Rng(seed ^ 0x9e3779b9) }
    : undefined;
  painter(guard(c), w, h, new Rng(seed), variant, aux);
  return { px: c.pixels(), h: withAux ? hc.pixels() : null, names: c.names };
}

function hash(px: Uint8ClampedArray): number {
  let hh = 2166136261 >>> 0;
  for (let i = 0; i < px.length; i++) { hh ^= px[i]; hh = Math.imul(hh, 16777619) >>> 0; }
  return hh;
}

function alphaCoverage(px: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] >= 128) n++;
  return n / (px.length / 4);
}

function meanLuma(px: Uint8ClampedArray): number {
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return s / (px.length / 4);
}

/** Mean absolute channel difference between column a and column b. */
function colDiff(px: Uint8ClampedArray, w: number, h: number, a: number, b: number): number {
  let s = 0;
  for (let y = 0; y < h; y++) for (let k = 0; k < 4; k++) s += Math.abs(px[(y * w + a) * 4 + k] - px[(y * w + b) * 4 + k]);
  return s / (h * 4);
}

function rowDiff(px: Uint8ClampedArray, w: number, h: number, a: number, b: number): number {
  let s = 0;
  for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) s += Math.abs(px[(a * w + x) * 4 + k] - px[(b * w + x) * 4 + k]);
  return s / (w * 4);
}

/** Seam (last col vs first col) difference relative to the typical neighbour-column difference inside the tile. */
function seamX(px: Uint8ClampedArray, w: number, h: number): { seam: number; typical: number } {
  let t = 0;
  for (let x = 0; x < w - 1; x++) t += colDiff(px, w, h, x, x + 1);
  return { seam: colDiff(px, w, h, w - 1, 0), typical: t / (w - 1) };
}

function seamY(px: Uint8ClampedArray, w: number, h: number): { seam: number; typical: number } {
  let t = 0;
  for (let y = 0; y < h - 1; y++) t += rowDiff(px, w, h, y, y + 1);
  return { seam: rowDiff(px, w, h, h - 1, 0), typical: t / (h - 1) };
}

interface Case { name: string; painter: Painter; w: number; h: number; variants: number }

const CASES: Case[] = [
  { name: 'corrugatedSteel', painter: corrugatedSteelPainter, w: 512, h: 512, variants: CORRUGATED_VARIANTS },
  { name: 'chainlinkFence', painter: chainlinkFencePainter, w: 256, h: 256, variants: CHAINLINK_FENCE_VARIANTS },
  { name: 'chainlinkRail', painter: chainlinkRailPainter, w: 256, h: 64, variants: CHAINLINK_RAIL_VARIANTS },
  { name: 'graniteCurb', painter: graniteCurbPainter, w: 512, h: 128, variants: GRANITE_CURB_VARIANTS },
  { name: 'castIronFence', painter: castIronFencePainter, w: 256, h: 256, variants: CAST_IRON_VARIANTS },
  { name: 'tarRoof', painter: tarRoofPainter, w: 512, h: 512, variants: TAR_ROOF_VARIANTS },
  { name: 'graffiti', painter: graffitiPainter, w: 512, h: 256, variants: GRAFFITI_VARIANTS },
];

describe('industrial painters: determinism and primitives', () => {
  for (const c of CASES) {
    it(`${c.name}: has the planned variant count and sizes in the 256-512 range`, () => {
      expect(c.variants).toBeGreaterThanOrEqual(2);
      expect(Math.max(c.w, c.h)).toBeLessThanOrEqual(512);
      expect(Math.max(c.w, c.h)).toBeGreaterThanOrEqual(256);
    });
    for (let v = 0; v < c.variants; v++) {
      it(`${c.name} v${v}: same seed gives an identical pixel hash, a different seed or variant differs`, () => {
        const a = render(c.painter, c.w, c.h, 7, v);
        const b = render(c.painter, c.w, c.h, 7, v);
        expect(hash(a.px)).toBe(hash(b.px));
        expect(hash(render(c.painter, c.w, c.h, 8, v).px)).not.toBe(hash(a.px));
        const other = render(c.painter, c.w, c.h, 7, (v + 1) % c.variants);
        expect(hash(other.px)).not.toBe(hash(a.px));
      });
      it(`${c.name} v${v}: only recordable primitives (no ellipse, gradients, pixel access) and aux does not change the colour map`, () => {
        const plain = render(c.painter, c.w, c.h, 3, v);
        const withAux = render(c.painter, c.w, c.h, 3, v, true);
        for (const n of withAux.names) expect(ALLOWED.has(n)).toBe(true);
        expect(withAux.names.has('ellipse' as string)).toBe(false);
        expect(hash(withAux.px)).toBe(hash(plain.px));
      });
      it(`${c.name} v${v}: wraps variants (variant + n wraps)`, () => {
        const a = render(c.painter, c.w, c.h, 5, v);
        const b = render(c.painter, c.w, c.h, 5, v + c.variants);
        expect(hash(b.px)).toBe(hash(a.px));
      });
    }
  }
});

describe('industrial painters: tileability', () => {
  const bothAxes: Case[] = CASES.filter((c) => ['corrugatedSteel', 'chainlinkFence', 'tarRoof'].includes(c.name));
  const xOnly: Case[] = CASES.filter((c) => ['graniteCurb', 'castIronFence', 'chainlinkRail'].includes(c.name));
  const tol = (s: { seam: number; typical: number }): number => s.typical * 1.6 + 5;

  for (const c of [...bothAxes, ...xOnly]) {
    for (let v = 0; v < c.variants; v++) {
      it(`${c.name} v${v}: left and right edge columns are continuous`, () => {
        const r = render(c.painter, c.w, c.h, 11, v);
        const s = seamX(r.px, c.w, c.h);
        expect(s.seam).toBeLessThanOrEqual(tol(s));
      });
    }
  }
  for (const c of bothAxes) {
    for (let v = 0; v < c.variants; v++) {
      it(`${c.name} v${v}: top and bottom edge rows are continuous`, () => {
        const r = render(c.painter, c.w, c.h, 11, v);
        const s = seamY(r.px, c.w, c.h);
        expect(s.seam).toBeLessThanOrEqual(tol(s));
      });
    }
  }
});

describe('industrial painters: alpha coverage', () => {
  const ranges: Record<string, [number, number]> = {
    chainlinkFence: [0.1, 0.4],
    chainlinkRail: [0.3, 0.5],
    castIronFence: [0.15, 0.45],
    graffiti: [0.02, 0.65],
  };
  for (const [name, [lo, hi]] of Object.entries(ranges)) {
    const c = CASES.find((k) => k.name === name)!;
    for (let v = 0; v < c.variants; v++) {
      it(`${name} v${v}: alpha-tested coverage is within ${lo}..${hi}`, () => {
        const cov = alphaCoverage(render(c.painter, c.w, c.h, 21, v).px);
        expect(cov).toBeGreaterThanOrEqual(lo);
        expect(cov).toBeLessThanOrEqual(hi);
      });
    }
  }
  it('graffiti leaves a transparent margin and the buff patch is the largest piece', () => {
    const covs = Array.from({ length: GRAFFITI_VARIANTS }, (_, v) => alphaCoverage(render(graffitiPainter, 512, 256, 21, v).px));
    expect(covs[5]).toBeGreaterThan(0.25);
    for (let v = 0; v < 5; v++) expect(covs[v]).toBeLessThan(covs[5]);
    for (let v = 0; v < GRAFFITI_VARIANTS; v++) {
      const px = render(graffitiPainter, 512, 256, 21, v).px;
      let edgeOpaque = 0;
      for (let x = 0; x < 512; x++) {
        if (px[x * 4 + 3] > 127) edgeOpaque++;
        if (px[((255 * 512) + x) * 4 + 3] > 127) edgeOpaque++;
      }
      expect(edgeOpaque).toBe(0);
    }
  });
  it('graffiti uses a 4-6 colour spray palette and no lettering calls', () => {
    expect(GRAFFITI_COLORS.length).toBeGreaterThanOrEqual(4);
    expect(GRAFFITI_COLORS.length).toBeLessThanOrEqual(6);
    for (let v = 0; v < GRAFFITI_VARIANTS; v++) {
      const names = render(graffitiPainter, 512, 256, 1, v).names;
      expect(names.has('fillText' as string)).toBe(false);
    }
  });
  for (const name of ['corrugatedSteel', 'graniteCurb', 'tarRoof']) {
    const c = CASES.find((k) => k.name === name)!;
    for (let v = 0; v < c.variants; v++) {
      it(`${name} v${v}: opaque everywhere`, () => {
        const px = render(c.painter, c.w, c.h, 2, v).px;
        let minA = 255;
        for (let i = 3; i < px.length; i += 4) minA = Math.min(minA, px[i]);
        expect(minA).toBe(255);
      });
    }
  }
});

describe('industrial painters: look sanity', () => {
  it('chain-link wire pitch is 50 mm: diamonds are 32 px wide, 64 px tall (perpendicular pitch 28.6 px)', () => {
    const px = render(chainlinkFencePainter, 256, 256, 4, 0).px;
    // along row 16 (a knuckle row, y multiple of 32 -> 0, 32 ...), wire centres repeat every 32 px / 2
    const row = 100;
    const hits: number[] = [];
    for (let x = 0; x < 256; x++) if (px[(row * 256 + x) * 4 + 3] >= 128 && (x === 0 || px[(row * 256 + x - 1) * 4 + 3] < 128)) hits.push(x);
    expect(hits.length).toBeGreaterThanOrEqual(12);
    const gaps = hits.slice(1).map((x, i) => x - hits[i]);
    // two wire families -> crossings alternate; the sum of two consecutive gaps is one full 32 px period
    for (let i = 0; i + 1 < gaps.length; i += 2) expect(gaps[i] + gaps[i + 1]).toBe(32);
  });

  it('corrugation: 76 mm ribs, 16 per tile, crest columns lighter than trough columns in the relief map', () => {
    const r = render(corrugatedSteelPainter, 512, 512, 9, 0, true);
    const hp = r.h!;
    const at = (x: number, y: number): number => hp[(y * 512 + x) * 4];
    // pick a row away from fasteners: crest at x = 16 + 32 k, trough at x = 32 k
    for (let k = 1; k < 15; k++) expect(at(32 * k + 16, 200)).toBeGreaterThan(at(32 * k, 200) + 80);
  });

  it('tar roof: asphalt is dark, aluminium coating is light; seams every 0.9 m (two per tile)', () => {
    const l0 = meanLuma(render(tarRoofPainter, 512, 512, 2, 0).px);
    const l1 = meanLuma(render(tarRoofPainter, 512, 512, 2, 1).px);
    const l2 = meanLuma(render(tarRoofPainter, 512, 512, 2, 2).px);
    expect(l0).toBeLessThan(90);
    expect(l1).toBeGreaterThan(l0 + 40);
    expect(l2).toBeLessThan(110);
    const px = render(tarRoofPainter, 512, 512, 2, 0).px;
    const colMean = (x: number): number => {
      let s = 0;
      for (let y = 0; y < 512; y++) s += px[(y * 512 + x) * 4];
      return s / 512;
    };
    // seam columns (x = 0 / 1 and 255 / 256) are the darkest of their neighbourhood
    expect(colMean(255)).toBeLessThan(colMean(240) - 5);
    expect(colMean(0)).toBeLessThan(colMean(16) - 5);
  });

  it('granite curb: dark gutter at the foot, brighter chamfer than face', () => {
    const px = render(graniteCurbPainter, 512, 128, 6, 0).px;
    const rowMean = (y: number): number => {
      let s = 0;
      for (let x = 8; x < 504; x++) s += px[(y * 512 + x) * 4];
      return s / 496;
    };
    const top = rowMean(30), cham = rowMean(Math.round(128 * 0.5)), face = rowMean(80), gutter = rowMean(125);
    expect(gutter).toBeLessThan(face - 20);
    expect(cham).toBeGreaterThan(face + 25);
    expect(top).toBeGreaterThan(face);
  });

  it('cast iron is near black', () => {
    for (let v = 0; v < CAST_IRON_VARIANTS; v++) {
      const px = render(castIronFencePainter, 256, 256, 8, v).px;
      let s = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) { s += px[i] + px[i + 1] + px[i + 2]; n += 3; }
      expect(s / n).toBeLessThan(70);
    }
  });
});
