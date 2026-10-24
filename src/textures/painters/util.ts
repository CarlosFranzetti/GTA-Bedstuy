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
): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = rng.range(alpha * 0.4, alpha);
    ctx.beginPath();
    ctx.arc(rng.range(0, w), rng.range(0, h), rng.range(minR, maxR), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Random-walk crack. */
export function crack(
  ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, steps: number, step: number, color: string, width: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rng.range(0, Math.PI * 2);
  for (let i = 0; i < steps; i++) {
    a += rng.range(-0.7, 0.7);
    x += Math.cos(a) * step * rng.range(0.5, 1.2);
    y += Math.sin(a) * step * rng.range(0.5, 1.2);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
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
