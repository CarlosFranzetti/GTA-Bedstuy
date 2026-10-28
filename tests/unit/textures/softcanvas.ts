import { Rng } from '@/core/Rng';
import type { Aux, Painter } from '@/textures/canvas';

// ------------------------------------------------------------------------------------------------ software canvas
// A tiny non-antialiased 2D rasteriser covering only the primitives the painters may use (see ALLOWED). The shared
// fake canvases in the other texture tests only record calls, so tileability and alpha coverage need real pixels.

export const ALLOWED = new Set([
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

export class SoftCtx {
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
export function guard(sc: SoftCtx): CanvasRenderingContext2D {
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

export interface Render { px: Uint8ClampedArray; h: Uint8ClampedArray | null; names: Set<string> }

export function render(painter: Painter, w: number, h: number, seed: number, variant: number, withAux = false): Render {
  const c = new SoftCtx(w, h);
  const hc = new SoftCtx(w, h, [128, 128, 128, 1]);
  const aux: Aux | undefined = withAux
    ? { height: guard(hc), rough: null, rng: new Rng(seed ^ 0x9e3779b9) }
    : undefined;
  painter(guard(c), w, h, new Rng(seed), variant, aux);
  return { px: c.pixels(), h: withAux ? hc.pixels() : null, names: c.names };
}

