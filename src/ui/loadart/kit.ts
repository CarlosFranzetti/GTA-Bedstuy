/**
 * Loading-panel drawing kit (LOADSCREENS). Everything is drawn in code on a 2D canvas context: a wall, spray strokes with soft
 * halos and overspray, drips, stencils and thick-outline flat-colour shapes. Nothing is copied from any game or any writer.
 * All functions take a seeded `Rnd`, so a panel is the same picture for the same seed.
 */
export type C = CanvasRenderingContext2D;

export interface Rnd { f(): number; r(a: number, b: number): number; i(n: number): number; pick<T>(a: readonly T[]): T }

/** mulberry32: small, fast, deterministic. */
export function rnd(seed: number): Rnd {
  let s = (seed >>> 0) || 1;
  const f = (): number => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { f, r: (a, b) => a + (b - a) * f(), i: (n) => Math.floor(f() * n), pick: (a) => a[Math.floor(f() * a.length)]! };
}

export const INK = '#0b0912';

/** Tone helper: hsl string. */
export const hsl = (h: number, s: number, l: number, a = 1): string => `hsla(${Math.round(h)},${Math.round(s)}%,${Math.round(Math.max(0, Math.min(100, l)))}%,${a})`;

export interface WallTone { h: number; s: number; l: number }

/** Brick or poured concrete with grime, stains, patched paint-overs and speckle. */
export function wall(c: C, w: number, h: number, R: Rnd, kind: 'brick' | 'concrete', t: WallTone): void {
  c.fillStyle = hsl(t.h, t.s * 0.7, t.l * 0.55); c.fillRect(0, 0, w, h);
  if (kind === 'brick') {
    const bh = Math.max(14, Math.min(34, h / 24)), bw = bh * 2.5;
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      for (let x = -(row % 2) * bw / 2 - bw; x < w; x += bw) {
        c.fillStyle = hsl(t.h + R.r(-5, 5), t.s + R.r(-8, 8), t.l + R.r(-7, 7));
        c.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }
  } else {
    c.fillStyle = hsl(t.h, t.s, t.l); c.fillRect(0, 0, w, h);
    const pw = w / 3.4;
    c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 2;
    for (let x = pw * 0.5; x < w; x += pw) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.beginPath(); c.moveTo(0, h * 0.5); c.lineTo(w, h * 0.5); c.stroke();
    for (let k = 0; k < 14; k++) { c.fillStyle = hsl(t.h, t.s, t.l + R.r(-5, 5), 0.5); c.fillRect(R.f() * w, R.f() * h, R.r(30, 160), R.r(20, 90)); }
  }
  // paint-overs: flat patches of a slightly different tone, hand-rolled edges
  for (let k = 0; k < 4; k++) {
    const x = R.f() * w, y = R.f() * h * 0.8, pw = R.r(w * 0.12, w * 0.3), ph = R.r(h * 0.1, h * 0.28);
    c.fillStyle = hsl(t.h + R.r(-20, 20), t.s * 0.5, t.l + R.r(-12, 12), 0.5);
    c.fillRect(x, y, pw, ph);
  }
  // water stains run down, soot rises from the bottom
  for (let k = 0; k < 16; k++) {
    const x = R.f() * w, sw = R.r(3, 18), len = R.r(h * 0.15, h * 0.6);
    const g = c.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(0,0,0,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.save(); c.translate(x, 0); c.fillRect(0, 0, sw, len); c.restore();
  }
  const soot = c.createLinearGradient(0, h * 0.5, 0, h);
  soot.addColorStop(0, 'rgba(0,0,0,0)'); soot.addColorStop(1, 'rgba(6,4,10,0.62)');
  c.fillStyle = soot; c.fillRect(0, h * 0.5, w, h * 0.5);
  const n = Math.round((w * h) / 380);
  for (let k = 0; k < n; k++) { c.fillStyle = R.f() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,240,220,0.07)'; const s = R.r(1, 2.6); c.fillRect(R.f() * w, R.f() * h, s, s); }
}

/** A fat-cap spray stroke from a to b (optionally bowed): soft halo core, a hard bright centre, overspray dots. */
export function spray(c: C, x1: number, y1: number, x2: number, y2: number, wd: number, col: string, R: Rnd, bow = 0): void {
  const len = Math.hypot(x2 - x1, y2 - y1), steps = Math.max(2, Math.ceil(len / (wd * 0.22)));
  const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
  c.save();
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, b = Math.sin(t * Math.PI) * bow;
    const x = x1 + (x2 - x1) * t + nx * b, y = y1 + (y2 - y1) * t + ny * b;
    const g = c.createRadialGradient(x, y, 0, x, y, wd * 0.9);
    g.addColorStop(0, col); g.addColorStop(0.45, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.5; c.fillStyle = g; c.beginPath(); c.arc(x, y, wd * 0.9, 0, 6.283); c.fill();
  }
  c.globalAlpha = 1; c.fillStyle = col; c.lineCap = 'round'; c.strokeStyle = col; c.lineWidth = wd * 0.7;
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2 + nx * bow * 2, (y1 + y2) / 2 + ny * bow * 2, x2, y2); c.stroke();
  const dots = Math.ceil(len / 3);
  for (let k = 0; k < dots; k++) {
    const t = R.f(), a = R.f() * 6.283, d = wd * R.r(0.55, 1.9);
    c.globalAlpha = R.r(0.25, 0.8); c.beginPath(); c.arc(x1 + (x2 - x1) * t + Math.cos(a) * d, y1 + (y2 - y1) * t + Math.sin(a) * d, R.r(0.5, 1.7), 0, 6.283); c.fill();
  }
  c.restore();
}

/** Overspray cloud: a patch of scattered dots, dense in the middle. */
export function mist(c: C, x: number, y: number, rad: number, col: string, R: Rnd, n = 160): void {
  c.save(); c.fillStyle = col;
  for (let k = 0; k < n; k++) {
    const a = R.f() * 6.283, d = rad * Math.pow(R.f(), 1.6);
    c.globalAlpha = R.r(0.15, 0.7); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, R.r(0.5, 1.6), 0, 6.283); c.fill();
  }
  c.restore();
}

/** A paint drip: a rounded run ending in a fat bead, with a thin dark edge. */
export function drip(c: C, x: number, y: number, len: number, wd: number, col: string, ink = INK): void {
  c.save(); c.lineCap = 'round';
  c.strokeStyle = ink; c.lineWidth = wd + 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + len); c.stroke();
  c.fillStyle = ink; c.beginPath(); c.arc(x, y + len, wd * 0.95 + 1.5, 0, 6.283); c.fill();
  c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(x, y - 1); c.lineTo(x, y + len); c.stroke();
  c.fillStyle = col; c.beginPath(); c.arc(x, y + len, wd * 0.95, 0, 6.283); c.fill();
  c.restore();
}

/** Smooth closed or open path through points (quadratic midpoints). Caller strokes or fills. */
export function smooth(c: C, p: ReadonlyArray<readonly [number, number]>, closed = true): void {
  const n = p.length;
  if (n < 2) return;
  c.beginPath();
  if (!closed) {
    c.moveTo(p[0]![0], p[0]![1]);
    for (let k = 1; k < n - 1; k++) c.quadraticCurveTo(p[k]![0], p[k]![1], (p[k]![0] + p[k + 1]![0]) / 2, (p[k]![1] + p[k + 1]![1]) / 2);
    c.lineTo(p[n - 1]![0], p[n - 1]![1]);
    return;
  }
  c.moveTo((p[0]![0] + p[n - 1]![0]) / 2, (p[0]![1] + p[n - 1]![1]) / 2);
  for (let k = 0; k < n; k++) { const a = p[k]!, b = p[(k + 1) % n]!; c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
  c.closePath();
}

export interface FigOpt { fill: string; tone?: string; hi?: string; ink?: string; lw?: number; k?: number }

/** A thick-outline flat shape with two or three tones: base, a shadow crescent lower right, an optional rim light upper left. */
export function fig(c: C, build: (c: C) => void, o: FigOpt): void {
  const lw = o.lw ?? 5, k = o.k ?? 9;
  c.save();
  build(c); c.fillStyle = o.fill; c.fill();
  c.save(); build(c); c.clip();
  if (o.tone) { c.fillStyle = o.tone; c.fillRect(-4000, -4000, 8000, 8000); c.translate(-k, -k); build(c); c.fillStyle = o.fill; c.fill(); c.translate(k, k); }
  if (o.hi) { c.translate(k * 1.2, k * 1.2); build(c); c.translate(-k * 1.2, -k * 1.2); c.globalCompositeOperation = 'source-over'; c.strokeStyle = o.hi; c.lineWidth = 3; c.stroke(); }
  c.restore();
  build(c); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = o.ink ?? INK; c.lineWidth = lw; c.stroke();
  c.restore();
}

export const rect = (x: number, y: number, w: number, h: number, r = 0) => (c: C): void => { c.beginPath(); if (r > 0) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); } else c.rect(x, y, w, h); };
export const circ = (x: number, y: number, r: number) => (c: C): void => { c.beginPath(); c.arc(x, y, r, 0, 6.283); };
export const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => (c: C): void => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 6.283); };
export const poly = (p: ReadonlyArray<readonly [number, number]>) => (c: C): void => { c.beginPath(); c.moveTo(p[0]![0], p[0]![1]); for (let k = 1; k < p.length; k++) c.lineTo(p[k]![0], p[k]![1]); c.closePath(); };

/** Stencil cut-out: a star, arrow or bolt in one colour with bridge gaps and a soft spray edge. */
export function stencil(c: C, kind: 'star' | 'arrow' | 'bolt', x: number, y: number, r: number, col: string, R: Rnd): void {
  c.save(); c.translate(x, y); c.rotate(R.r(-0.25, 0.25));
  const path = (): void => {
    c.beginPath();
    if (kind === 'star') for (let k = 0; k < 10; k++) { const a = -1.5708 + (k * Math.PI) / 5, q = k % 2 ? r * 0.42 : r; c[k ? 'lineTo' : 'moveTo'](Math.cos(a) * q, Math.sin(a) * q); }
    else if (kind === 'arrow') { const p: Array<[number, number]> = [[-r, -r * 0.3], [r * 0.1, -r * 0.3], [r * 0.1, -r * 0.7], [r, 0], [r * 0.1, r * 0.7], [r * 0.1, r * 0.3], [-r, r * 0.3]]; p.forEach((q, k) => c[k ? 'lineTo' : 'moveTo'](q[0], q[1])); }
    else { const p: Array<[number, number]> = [[r * 0.2, -r], [-r * 0.6, r * 0.1], [-r * 0.05, r * 0.1], [-r * 0.3, r], [r * 0.6, -r * 0.2], [r * 0.05, -r * 0.2]]; p.forEach((q, k) => c[k ? 'lineTo' : 'moveTo'](q[0], q[1])); }
    c.closePath();
  };
  c.shadowColor = col; c.shadowBlur = r * 0.35; c.fillStyle = col; path(); c.fill(); c.shadowBlur = 0;
  c.strokeStyle = 'rgba(12,9,16,0.85)'; c.lineWidth = Math.max(2, r * 0.07);
  c.beginPath(); c.moveTo(-r * 1.1, -r * 0.08); c.lineTo(r * 1.1, -r * 0.08); c.moveTo(r * 0.1, -r * 1.1); c.lineTo(r * 0.1, r * 1.1); c.stroke();
  c.restore();
  mist(c, x, y, r * 1.1, col, R, 40);
}

/** A loose abstract scribble (loops, no letters): filler "tag" energy that spells nothing. */
export function scribble(c: C, x: number, y: number, size: number, col: string, R: Rnd): void {
  const pts: Array<[number, number]> = []; let a = R.f() * 6;
  for (let k = 0; k < 9; k++) { a += R.r(1.4, 2.6); const d = size * R.r(0.3, 1); pts.push([x + Math.cos(a) * d + k * size * 0.18, y + Math.sin(a) * d * 0.6]); }
  c.save(); smooth(c, pts, false); c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = INK; c.lineWidth = size * 0.2 + 4; c.stroke();
  c.strokeStyle = col; c.lineWidth = size * 0.2; c.stroke(); c.restore();
}

/** Darkens the corners so the picture sits in the frame. */
export function vignette(c: C, w: number, h: number, a = 0.55): void {
  const g = c.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(4,3,8,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}
