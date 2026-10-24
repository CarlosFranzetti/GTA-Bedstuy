import type { Painter } from '../canvas';
import { auxSpeckle, blotches, gray, hsl, speckle, withAlpha, wrapVariant } from './util';

export const ROLLGATE_VARIANTS = 4;

/** 256px: corrugated horizontal ribs. Variants: 0 plain, 1 magenta tag, 2 cyan tag, 3 dirty/rusty. */
export const rollGatePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const v = wrapVariant(variant, ROLLGATE_VARIANTS);
  const ribs = 16;
  const rh = h / ribs;
  for (let i = 0; i < ribs; i++) {
    ctx.fillStyle = hsl(210, 5, 54 + rng.range(-2, 2));
    ctx.fillRect(0, i * rh, w, rh);
    ctx.fillStyle = '#d3d6d9';
    ctx.fillRect(0, i * rh, w, rh * 0.22);
    ctx.fillStyle = '#6a6e73';
    ctx.fillRect(0, i * rh + rh * 0.62, w, rh * 0.2);
    ctx.fillStyle = '#4b4e52';
    ctx.fillRect(0, i * rh + rh * 0.86, w, rh * 0.14);
    if (aux) {
      // corrugation profile: lit crest, flat, falling shoulder, deep trough
      const levels: [number, number, number][] = [[0, 0.22, 200], [0.22, 0.62, 160], [0.62, 0.82, 105], [0.82, 1, 45]];
      for (const [a, b, g] of levels) {
        aux.height.fillStyle = gray(g);
        aux.height.fillRect(0, i * rh + rh * a, w, rh * (b - a));
      }
    }
  }
  if (v === 1 || v === 2) {
    const col = v === 1 ? '#e0289a' : '#18c4d8';
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const y0 = h * rng.range(0.3, 0.6);
    const bx = [w * 0.05, w * 0.3, w * 0.5, w * 0.72, w * 0.95];
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? '#161616' : col;
      ctx.lineWidth = pass === 0 ? 22 : 14;
      ctx.beginPath();
      ctx.moveTo(bx[0], y0);
      ctx.quadraticCurveTo(bx[1], y0 - h * 0.25, bx[2], y0);
      ctx.quadraticCurveTo(bx[3], y0 + h * 0.25, bx[4], y0 - h * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (v === 3) {
    blotches(ctx, w, h, rng, 20, '#7a4a28', 0.25, 6, 24);
    blotches(ctx, w, h, rng, 12, '#000000', 0.15, 10, 30);
  }
  // bottom lock bar
  ctx.fillStyle = '#35373a';
  ctx.fillRect(0, h - 8, w, 8);
  if (aux) {
    aux.height.fillStyle = gray(215);
    aux.height.fillRect(0, h - 8, w, 8);
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 800, [110, 150, 190], 1, 2, 0.25);
  }
  speckle(ctx, w, h, rng, 300, ['#000000', '#ffffff'], 1, 2, 0.08);
};

/** 256px diamond mesh on a transparent background. Tiles seamlessly. */
export const chainlinkPainter: Painter = (ctx, w, h) => {
  const s = 16;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  const lines = (): void => {
    ctx.beginPath();
    for (let k = -h; k <= w; k += s) {
      ctx.moveTo(k, 0);
      ctx.lineTo(k + h, h);
      ctx.moveTo(k + h, 0);
      ctx.lineTo(k, h);
    }
    ctx.stroke();
  };
  lines();
  ctx.strokeStyle = '#a9aeb3';
  ctx.lineWidth = 1.6;
  lines();
};

/** 256px. Variant 0: blue plywood sheets; variant 1: bare wood planks. */
export const scaffoldPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, 2);
  if (v === 0) {
    ctx.fillStyle = '#2f5fa8';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      withAlpha(ctx, rng.range(0.03, 0.1), () => {
        ctx.fillStyle = rng.chance(0.5) ? '#ffffff' : '#0a1a33';
        ctx.fillRect(0, rng.range(0, h), w, 1);
      });
    }
    blotches(ctx, w, h, rng, 12, '#10244a', 0.14, 10, 34);
    ctx.fillStyle = '#12284d';
    ctx.fillRect(0, h / 2 - 1, w, 2);
    ctx.fillRect(w / 2 - 1, 0, 2, h);
    ctx.fillStyle = '#c9d6ea';
    for (let x = 16; x < w; x += 48) for (let y = 12; y < h; y += 40) ctx.fillRect(x, y, 2, 2);
  } else {
    const rows = 6;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = hsl(32 + rng.range(-3, 3), 38, 48 + rng.range(-6, 6));
      ctx.fillRect(0, i * rh, w, rh - 2);
      withAlpha(ctx, 0.18, () => {
        ctx.fillStyle = '#3b2410';
        for (let g = 0; g < 6; g++) ctx.fillRect(0, i * rh + rng.range(2, rh - 4), w, 1);
      });
      ctx.fillStyle = '#2b1c10';
      ctx.fillRect(0, i * rh + rh - 2, w, 2);
    }
  }
};

/** 256px: dark rubber with tread blocks. */
export const tirePainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#242424';
  for (let x = 0; x < w; x += 16) {
    for (let y = 0; y < h; y += 32) ctx.fillRect(x + 2, y + ((x / 16) % 2) * 16 + 2, 12, 12);
  }
  speckle(ctx, w, h, rng, 600, ['#000000', '#303030'], 1, 2, 0.6);
};

/** 256px: weathered wooden tank staves with iron hoops. */
export const waterTankPainter: Painter = (ctx, w, h, rng) => {
  const staves = 16;
  const sw = w / staves;
  for (let i = 0; i < staves; i++) {
    ctx.fillStyle = hsl(28 + rng.range(-3, 3), 28, 30 + rng.range(-5, 5));
    ctx.fillRect(i * sw, 0, sw - 1, h);
  }
  ctx.fillStyle = '#1e1e20';
  for (const y of [h * 0.12, h * 0.45, h * 0.8]) ctx.fillRect(0, y, w, 6);
  blotches(ctx, w, h, rng, 12, '#000000', 0.12, 8, 28);
};
