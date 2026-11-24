/**
 * Block lettering for the loading panels. Built from the game's own Anton (SIL OFL): every letter gets its own tilt, slant,
 * height and bounce, a hard-edged two-tone fill, a thick ink outline, a stepped 3D block shadow, glints, a fat-cap halo and
 * paint drips. Words are invented section words and place names, never a brand or a writer's tag.
 */
import { drip, INK, mist, spray, type C, type Rnd } from './kit';

export const DISPLAY_FONT = (px: number): string => `${Math.round(px)}px Anton, Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;

export interface WordStyle { fill: string; hi: string; block: string; glow: string; ink?: string; drips?: number; track?: number; slant?: number }
export interface Laid { size: number; width: number; items: Array<{ ch: string; x: number; w: number }> }

/** Lays a word out left to right at `size`, shrinking it so the whole word, block shadow included, fits `maxW`. */
export function layoutWord(c: C, text: string, size: number, maxW: number, track = 0.04): Laid {
  const build = (sz: number): Laid => {
    c.font = DISPLAY_FONT(sz);
    let x = 0; const items: Laid['items'] = [];
    for (const ch of text) { const w = ch === ' ' ? sz * 0.28 : c.measureText(ch).width; items.push({ ch, x, w }); x += w + sz * track; }
    return { size: sz, width: Math.max(0, x - sz * track), items };
  };
  let l = build(size);
  const room = maxW - size * 0.3;
  if (l.width > room && l.width > 0) l = build(size * (room / l.width));
  return l;
}

/** Draws the word with its baseline at `y`, centred on `cx`. Returns the box it covers. */
export function drawWord(c: C, text: string, cx: number, y: number, size: number, maxW: number, st: WordStyle, R: Rnd): { x: number; y: number; w: number; h: number } {
  const lay = layoutWord(c, text, size, maxW, st.track ?? 0.04), sz = lay.size, ink = st.ink ?? INK;
  const x0 = cx - lay.width / 2, slant = st.slant ?? -0.16, ol = sz * 0.17, depth = sz * 0.12;
  const per = lay.items.filter((it) => it.ch !== ' ').map((it) => ({ it, rot: R.r(-0.09, 0.09), sy: R.r(0.92, 1.12), dy: R.r(-0.07, 0.07) * sz, jx: R.r(-0.02, 0.02) * sz }));
  // fat-cap halo behind the whole word
  c.save(); c.lineJoin = 'round';
  for (const p of per) { c.save(); place(c, p, x0, y, slant); c.font = DISPLAY_FONT(sz); c.shadowColor = st.glow; c.shadowBlur = sz * 0.5; c.strokeStyle = st.glow; c.globalAlpha = 0.8; c.lineWidth = ol * 1.4; c.strokeText(p.it.ch, 0, 0); c.restore(); }
  // block shadow, drawn back to front
  for (const p of per) {
    c.save(); place(c, p, x0, y, slant); c.font = DISPLAY_FONT(sz); c.lineJoin = 'round';
    for (let k = depth; k >= 1; k -= 1.5) { c.translate(1.3, 1.6); c.fillStyle = k % 3 < 1.5 ? st.block : ink; c.strokeStyle = ink; c.lineWidth = ol; c.strokeText(p.it.ch, 0, 0); c.fillText(p.it.ch, 0, 0); }
    c.restore();
  }
  // outline, then the two-tone face, then glints
  for (const p of per) {
    c.save(); place(c, p, x0, y, slant); c.font = DISPLAY_FONT(sz); c.lineJoin = 'round';
    c.strokeStyle = ink; c.lineWidth = ol; c.strokeText(p.it.ch, 0, 0);
    const g = c.createLinearGradient(0, -sz * 0.85, 0, 0);
    g.addColorStop(0, st.hi); g.addColorStop(0.46, st.hi); g.addColorStop(0.47, st.fill); g.addColorStop(1, st.fill);
    c.fillStyle = g; c.fillText(p.it.ch, 0, 0);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = Math.max(2, sz * 0.025); c.lineCap = 'round';
    c.beginPath(); c.moveTo(-p.it.w * 0.34, -sz * 0.7); c.lineTo(-p.it.w * 0.18, -sz * 0.78); c.stroke();
    c.restore();
  }
  // drips from the baseline of some letters
  const nd = st.drips ?? 3;
  for (let k = 0; k < nd && per.length; k++) {
    const p = per[R.i(per.length)]!;
    drip(c, x0 + p.it.x + p.it.w * R.r(0.2, 0.8), y + sz * 0.1 + p.dy, sz * R.r(0.25, 0.8), Math.max(3, sz * 0.045), st.fill, ink);
  }
  // an underline slash with a fat cap, and a little overspray round the word
  const uy = y + sz * 0.3;
  spray(c, x0 - sz * 0.1, uy, x0 + lay.width * 0.7, uy - sz * 0.05, sz * 0.05, st.hi, R, sz * 0.03);
  mist(c, cx, y - sz * 0.35, lay.width * 0.55, st.glow, R, 90);
  c.restore();
  return { x: x0, y: y - sz, w: lay.width, h: sz * 1.3 };
}

function place(c: C, p: { it: { x: number; w: number }; rot: number; sy: number; dy: number; jx: number }, x0: number, y: number, slant: number): void {
  c.translate(x0 + p.it.x + p.it.w / 2 + p.jx, y + p.dy);
  c.rotate(p.rot); c.transform(1, 0, slant, 1, 0, 0); c.scale(1, p.sy);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
}
