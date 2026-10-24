import type { Rng } from '@/core/Rng';

const r1 = (n: number): number => Math.round(n * 10) / 10;

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${r1(h)},${r1(Math.max(0, Math.min(100, s)))}%,${r1(Math.max(0, Math.min(100, l)))}%)`;
}

export function wrapVariant(variant: number, n: number): number {
  return ((Math.floor(variant) % n) + n) % n;
}

/** Draw with a temporary alpha. */
export function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, fn: () => void): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  fn();
  ctx.restore();
}

/** Scatter small rects of the given colours (cheap per-pixel-ish noise). */
export function speckle(
  ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng,
  count: number, colors: readonly string[], minSize: number, maxSize: number, alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng.next() * colors.length)];
    const s = rng.range(minSize, maxSize);
    ctx.fillRect(rng.range(0, w), rng.range(0, h), s, s);
  }
  ctx.restore();
}

/** Vertical grime / soot streaks, heavier toward the top. */
export function grimeStreaks(
  ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, count: number, maxAlpha: number, color = '#000000',
): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const sw = rng.range(3, 18);
    const x = rng.range(0, w);
    const len = rng.range(h * 0.2, h * 0.9);
    ctx.globalAlpha = rng.range(maxAlpha * 0.3, maxAlpha);
    ctx.fillRect(x, 0, sw, len);
    ctx.globalAlpha *= 0.5;
    ctx.fillRect(x + sw * 0.25, 0, sw * 0.5, len * 1.1);
  }
  ctx.restore();
}

/** Soft blotches (stains). */
export function blotches(
  ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng,
  count: number, color: string, alpha: number, minR: number, maxR: number,
  mirror?: { ctx: CanvasRenderingContext2D; color: string } | null,
): void {
  ctx.save();
  mirror?.ctx.save();
  for (let i = 0; i < count; i++) {
    const a = rng.range(alpha * 0.4, alpha);
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(minR, maxR);
    for (const [c, col] of mirror ? [[ctx, color], [mirror.ctx, mirror.color]] as const : [[ctx, color]] as const) {
      c.fillStyle = col;
      c.globalAlpha = a;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }
  ctx.restore();
  mirror?.ctx.restore();
}

/** Random-walk crack. */
export function crack(
  ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, steps: number, step: number, color: string, width: number,
  mirrors?: readonly { ctx: CanvasRenderingContext2D; color: string; width: number }[],
): void {
  const pts: number[] = [x, y];
  let a = rng.range(0, Math.PI * 2);
  for (let i = 0; i < steps; i++) {
    a += rng.range(-0.7, 0.7);
    x += Math.cos(a) * step * rng.range(0.5, 1.2);
    y += Math.sin(a) * step * rng.range(0.5, 1.2);
    pts.push(x, y);
  }
  const layers = [{ ctx, color, width }, ...(mirrors ?? [])];
  for (const l of layers) {
    l.ctx.save();
    l.ctx.strokeStyle = l.color;
    l.ctx.lineWidth = l.width;
    l.ctx.beginPath();
    l.ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) l.ctx.lineTo(pts[i], pts[i + 1]);
    l.ctx.stroke();
    l.ctx.restore();
  }
}

/**
 * Pick a bold font size so `text` fits in maxW x maxH, and set ctx.font to it. Returns the pixel size.
 * Measures with ctx.measureText and shrinks until it fits.
 */
export function fitFont(
  ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number,
  weight = 'bold', family = 'Arial, Helvetica, sans-serif', minPx = 6,
): number {
  let px = Math.max(minPx, Math.floor(maxH));
  ctx.font = `${weight} ${px}px ${family}`;
  const w0 = ctx.measureText(text).width;
  if (w0 > maxW && w0 > 0) {
    px = Math.max(minPx, Math.floor(px * (maxW / w0)));
    ctx.font = `${weight} ${px}px ${family}`;
  }
  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

/** Grey level 0..255 as a CSS colour. */
export function gray(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${v},${v},${v})`;
}

/** Relief-only speckle (uses the aux rng): small squares at the given grey levels inside a region. */
export function auxSpeckle(
  ctx: CanvasRenderingContext2D, rng: Rng, x0: number, y0: number, rw: number, rh: number,
  count: number, levels: readonly number[], minSize: number, maxSize: number, alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = gray(levels[Math.floor(rng.next() * levels.length)]);
    const s = rng.range(minSize, maxSize);
    ctx.fillRect(x0 + rng.range(0, rw), y0 + rng.range(0, rh), s, s);
  }
  ctx.restore();
}

/** Soot streak that fades downward from (x, y0): stepped strips (no gradients) of decreasing alpha. */
export function sootStreak(
  ctx: CanvasRenderingContext2D, x: number, y0: number, width: number, len: number, maxAlpha: number, color = '#0a0604',
): void {
  const steps = 12;
  const sh = len / steps;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    ctx.globalAlpha = maxAlpha * (1 - t) * (1 - t);
    const wi = width * (1 - 0.35 * t);
    ctx.fillRect(x + (width - wi) / 2, y0 + i * sh, wi, sh + 0.5);
  }
  ctx.restore();
}
