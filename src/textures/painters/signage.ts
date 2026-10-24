import type { Painter } from '../canvas';
import { fitFont, speckle, withAlpha } from './util';

/**
 * Awning texture 512x256. Top 75% is the vinyl colour with faint panel stripes; the bottom 25% is a lighter
 * scalloped valance carrying the sign text in white bold capitals, shrunk to fit.
 */
export function awningPainter(color: string, text: string): Painter {
  return (ctx, w, h, rng) => {
    const valTop = h * 0.75;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    // vinyl panel stripes
    const stripes = 8;
    for (let i = 0; i < stripes; i += 2) {
      withAlpha(ctx, 0.1, () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect((i * w) / stripes, 0, w / stripes, valTop);
      });
    }
    speckle(ctx, w, h, rng, 300, ['#000000', '#ffffff'], 1, 2, 0.05);
    // valance: lighter band
    withAlpha(ctx, 0.3, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, valTop, w, h - valTop);
    });
    // scalloped bottom edge: cut-outs are the darker vinyl peeking through between arcs
    const sc = 8;
    const r = w / sc / 2;
    const base = h - r * 0.55;
    ctx.fillStyle = color;
    ctx.fillRect(0, base, w, h - base);
    for (let i = 0; i < sc; i++) {
      ctx.beginPath();
      ctx.arc(r + i * 2 * r, base, r, 0, Math.PI);
      ctx.fill();
      withAlpha(ctx, 0.3, () => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r + i * 2 * r, base, r, 0, Math.PI);
        ctx.fill();
      });
      ctx.fillStyle = color;
    }
    withAlpha(ctx, 0.25, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, valTop, w, 2);
    });
    // text
    const label = text.toUpperCase();
    const maxW = w * 0.9;
    const maxH = (base - valTop) * 0.7;
    const cy = valTop + (base - valTop) / 2 + 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, label, maxW, maxH);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(label, w / 2 + 2, cy + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, w / 2, cy);
  };
}

/** Sign board 512x128: border, centred shrink-to-fit text (wraps to two lines if one line would be tiny). */
export function signPainter(text: string, bg: string, fg: string): Painter {
  return (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = Math.max(2, h * 0.04);
    ctx.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    const maxW = w * 0.86;
    const maxH = h * 0.56;
    const px = fitFont(ctx, text, maxW, maxH);
    const sp = text.indexOf(' ', Math.floor(text.length / 2) - 4);
    if (px < maxH * 0.5 && sp > 0 && text.includes(' ')) {
      const a = text.slice(0, sp).trim();
      const b = text.slice(sp + 1).trim();
      fitFont(ctx, a.length >= b.length ? a : b, maxW, h * 0.34);
      ctx.fillText(a, w / 2, h * 0.32);
      ctx.fillText(b, w / 2, h * 0.68);
      return;
    }
    ctx.fillText(text, w / 2, h / 2 + 1);
  };
}

/** Police car side livery 512x256: white body, blue stripe, parody text "BPD". */
export const copLiveryPainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#f1f3f5';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, 400, ['#9aa0a6', '#ffffff'], 1, 2, 0.12);
  const y = h * 0.36;
  const sh = h * 0.3;
  ctx.fillStyle = '#1d4fa6';
  ctx.fillRect(0, y, w, sh);
  ctx.fillStyle = '#0f2f6b';
  ctx.fillRect(0, y + sh, w, 4);
  ctx.fillStyle = '#7fa6e6';
  ctx.fillRect(0, y - 6, w, 3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'BPD', w * 0.4, sh * 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('BPD', w / 2, y + sh / 2 + 2);
};
