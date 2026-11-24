/**
 * The loading panels: seven scenes of the neighbourhood as flat-colour, thick-outline pictures on a wall, with a big piece of
 * block lettering behind the subject. Scenes are drawn in "subject units" (about 1000 wide, y up is negative, y 0 is the ground
 * line) so the same picture works on a wide screen and a tall phone. People are bold silhouettes with two or three flat tones:
 * nobody is a real person.
 */
import { circ, ell, fig, INK, mist, poly, rect, smooth, spray, stencil, vignette, wall, type C, type Rnd, type WallTone } from './kit';
import { drawWord, type WordStyle } from './letters';

export interface Geo { c: C; R: Rnd; w: number; h: number; s: number; cx: number; gy: number; wide: boolean }
export interface Panel {
  id: string; word: string; style: WordStyle; kind: 'brick' | 'concrete'; tone: WallTone;
  /** word baseline as a fraction of height (wide, tall) and the subject zoom */
  wy: [number, number]; zoom: number;
  bg(g: Geo): void; fg(g: Geo): void;
}

/** Multiplies a #rrggbb colour. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16), ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
const T = (hex: string): { fill: string; tone: string } => ({ fill: hex, tone: shade(hex, 0.66) });

/** Thick limb: ink edge, then colour. */
function limb(c: C, pts: ReadonlyArray<readonly [number, number]>, wd: number, col: string): void {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [w, s] of [[wd + 8, INK], [wd, col]] as const) { c.strokeStyle = s; c.lineWidth = w; smooth(c, pts, false); c.stroke(); }
  c.restore();
}

interface Dress { top: string; bot: string; skin: string; hat?: string; arms?: 'down' | 'up' | 'hold'; back?: boolean }
/** A standing person, H tall, drawn as a bold figure (front or back is the same shape). */
function stand(c: C, x: number, y: number, H: number, o: Dress): void {
  const u = H / 10;
  limb(c, [[x - 0.9 * u, y - 4.8 * u], [x - 1 * u, y]], 1.8 * u, o.bot);
  limb(c, [[x + 0.9 * u, y - 4.8 * u], [x + 1 * u, y]], 1.8 * u, shade(o.bot, 0.8));
  fig(c, poly([[x - 1.1 * u, y - 0.1 * u], [x - 1.1 * u, y + 0.3 * u], [x + 0.2 * u, y + 0.3 * u]]), { fill: INK, lw: 2 });
  fig(c, smooth2([[x - 2.5 * u, y - 4.6 * u], [x - 2.8 * u, y - 7.6 * u], [x - 1.4 * u, y - 8.5 * u], [x + 1.4 * u, y - 8.5 * u], [x + 2.8 * u, y - 7.6 * u], [x + 2.5 * u, y - 4.6 * u]]), { ...T(o.top), k: u * 0.5 });
  const a = o.arms ?? 'down';
  const ay = a === 'up' ? -11 : a === 'hold' ? -6.2 : -4.8, ax = a === 'up' ? 3.4 : a === 'hold' ? 1.8 : 3.0;
  limb(c, [[x - 2.6 * u, y - 7.8 * u], [x - ax * u, y + ay * u * (a === 'up' ? 0.8 : 1)]], 1.5 * u, shade(o.top, 0.85));
  limb(c, [[x + 2.6 * u, y - 7.8 * u], [x + ax * u, y + ay * u * (a === 'up' ? 0.8 : 1)]], 1.5 * u, shade(o.top, 0.85));
  fig(c, circ(x, y - 9.3 * u, 1.15 * u), { ...T(o.skin), k: u * 0.3, lw: 4 });
  if (o.hat) fig(c, smooth2([[x - 1.35 * u, y - 9.4 * u], [x - 1.1 * u, y - 10.7 * u], [x + 1.1 * u, y - 10.7 * u], [x + 1.35 * u, y - 9.4 * u]]), { ...T(o.hat), k: u * 0.25, lw: 4 });
}
/** Closed smooth path builder (for fig). */
const smooth2 = (p: ReadonlyArray<readonly [number, number]>) => (c: C): void => smooth(c, p, true);

/** A seated person (side view), H the standing height. */
function sit(c: C, x: number, y: number, H: number, o: Dress, dir = 1): void {
  const u = H / 10;
  limb(c, [[x, y - 2.2 * u], [x + dir * 2.6 * u, y - 2.4 * u], [x + dir * 2.9 * u, y]], 1.7 * u, o.bot);
  fig(c, smooth2([[x - dir * 1 * u, y - 2 * u], [x - dir * 1.4 * u, y - 5.2 * u], [x - dir * 0.2 * u, y - 6.4 * u], [x + dir * 1.2 * u, y - 5.8 * u], [x + dir * 1.2 * u, y - 2 * u]]), { ...T(o.top), k: u * 0.4 });
  limb(c, [[x, y - 5.4 * u], [x + dir * 1.5 * u, y - 3.6 * u], [x + dir * 2.4 * u, y - 3.9 * u]], 1.3 * u, shade(o.top, 0.8));
  fig(c, circ(x, y - 7.3 * u, 1.1 * u), { ...T(o.skin), k: u * 0.3, lw: 4 });
  if (o.hat) fig(c, smooth2([[x - 1.2 * u, y - 7.4 * u], [x - 1 * u, y - 8.5 * u], [x + 1 * u, y - 8.5 * u], [x + dir * 1.5 * u, y - 7.5 * u]]), { ...T(o.hat), k: u * 0.25, lw: 4 });
}

/** Crowd silhouettes seen from behind, with raised hands and a rim of coloured light. */
function crowd(c: C, R: Rnd, x0: number, x1: number, y: number, rim: string, base = '#15101c'): void {
  for (let x = x0; x < x1; x += R.r(70, 105)) {
    const r = R.r(30, 38), hy = y - R.r(0, 50), sk = R.pick(['#3a2a24', '#5a3b2c', '#2a1e1c']);
    if (R.f() < 0.4) { const d = R.r(-1, 1); limb(c, [[x + d * 40, hy + 50], [x + d * 70, hy - 40], [x + d * 78, hy - R.r(90, 150)]], 20, base); fig(c, circ(x + d * 78, hy - 120, 15), { fill: base, hi: rim, lw: 3, k: 4 }); }
    fig(c, smooth2([[x - r * 2.2, y + 260], [x - r * 2, hy + r * 1.7], [x - r * 1.1, hy + r * 1.05], [x + r * 1.1, hy + r * 1.05], [x + r * 2, hy + r * 1.7], [x + r * 2.2, y + 260]]), { fill: base, hi: rim, lw: 4, k: 5 });
    fig(c, circ(x, hy, r), { fill: sk, tone: shade(sk, 0.5), hi: rim, lw: 4, k: 7 });
  }
}

const rays = (c: C, x: number, y: number, ex: number, ey: number, spread: number, col: string): void => {
  c.save(); c.globalAlpha = 0.2; c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(ex - spread, ey); c.lineTo(ex + spread, ey); c.closePath(); c.fill(); c.restore();
};

const sunset = (g: Geo, bands: string[], sunX: number, sunY: number, sunR: number): void => {
  const { c, w, h } = g, n = bands.length;
  bands.forEach((b, i) => { c.fillStyle = b; c.fillRect(0, (h * 0.78 * i) / n, w, (h * 0.78) / n + 2); });
  c.save(); c.fillStyle = '#ffd26a'; c.beginPath(); c.arc(sunX, sunY, sunR, 0, 6.283); c.fill();
  for (let k = 0; k < 6; k++) { c.fillStyle = bands[Math.min(n - 1, 2 + k % 3)]!; c.fillRect(sunX - sunR, sunY + sunR * (0.05 + k * 0.17), sunR * 2, sunR * 0.03 * (k + 1)); }
  c.restore();
};

const skyline = (g: Geo, base: number, col: string, win: string): void => {
  const { c, R, w } = g;
  for (let x = -20; x < w; ) { const bw = R.r(50, 120), bh = R.r(60, 230); c.fillStyle = col; c.fillRect(x, base - bh, bw, bh + 400); c.fillStyle = win;
    for (let wy = base - bh + 14; wy < base - 8; wy += 22) for (let wx = x + 9; wx < x + bw - 12; wx += 20) if (R.f() < 0.4) c.fillRect(wx, wy, 8, 11);
    x += bw + R.r(2, 14); }
};

/** Brownstone-style stoop: steps up to the right, iron rail, a door. */
function stoop(c: C, x0: number): void {
  const p: Array<[number, number]> = [[x0, 80]];
  for (let i = 0; i < 7; i++) { p.push([x0 + i * 62, -i * 40], [x0 + i * 62, -(i + 1) * 40]); }
  p.push([x0 + 434, -280], [x0 + 520, -280], [x0 + 520, 80]);
  fig(c, poly(p), { fill: '#8a553f', tone: '#5e3a2c', hi: '#c98a64', k: 12, lw: 6 });
  for (let i = 0; i < 7; i++) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0 + i * 62, -i * 40 - 4, 62, 5); }
  c.save(); c.strokeStyle = INK; c.lineWidth = 5; c.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const px = x0 + 10 + i * 36, py = -(Math.min(px - x0, 434) / 62) * 40; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 110); c.stroke(); }
  c.lineWidth = 9; c.beginPath(); c.moveTo(x0 + 10, -110); c.lineTo(x0 + 434, -400); c.lineTo(x0 + 500, -400); c.stroke(); c.restore();
}

export const PANELS: readonly Panel[] = [
  {
    id: 'decks', word: 'DECKS', kind: 'concrete', tone: { h: 270, s: 22, l: 17 }, wy: [0.3, 0.4], zoom: 1,
    style: { fill: '#e8307a', hi: '#ff93bd', block: '#5a1580', glow: '#e8307a' },
    bg(g) {
      const { c, w, h, R } = g;
      rays(c, w * 0.18, 0, w * 0.1, h * 0.9, w * 0.18, '#e8307a'); rays(c, w * 0.82, 0, w * 0.9, h * 0.9, w * 0.18, '#28c8d8'); rays(c, w * 0.5, 0, w * 0.5, h * 0.9, w * 0.12, '#ffd26a');
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      for (const sx of [-1, 1]) {
        fig(c, rect(sx * 440 - 85, -420, 170, 420, 8), { fill: '#1d1a26', tone: '#100e17', hi: '#4a4560', k: 8 });
        for (const [cy, r] of [[-300, 56], [-160, 38]] as const) { fig(c, circ(sx * 440, cy, r), { fill: '#0e0c14', lw: 6, hi: '#6b6580' }); fig(c, circ(sx * 440, cy, r * 0.4), { fill: '#2a2536', lw: 4 }); }
      }
      c.restore(); mist(c, w * 0.5, h * 0.3, w * 0.4, '#ffe0f0', R, 90);
    },
    fg(g) {
      const { c, R } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      limb(c, [[-95, -300], [-160, -250], [-180, -200]], 40, '#c9402a'); limb(c, [[95, -300], [150, -250], [170, -200]], 40, '#c9402a');
      fig(c, smooth2([[-120, -175], [-125, -310], [-70, -365], [70, -365], [125, -310], [120, -175]]), { ...T('#e0522f'), hi: '#ff9a6a', k: 14 });
      fig(c, circ(0, -420, 52), { ...T('#c28a62'), k: 11 });
      fig(c, smooth2([[-56, -430], [-46, -490], [0, -508], [46, -490], [56, -430]]), { ...T('#2c6fb0'), k: 8, lw: 5 });
      limb(c, [[-62, -430], [-56, -480], [0, -498], [56, -480], [62, -430]], 9, '#1a1722');
      for (const sx of [-1, 1]) fig(c, rect(sx * 62 - 11, -440, 22, 46, 8), { fill: '#1a1722', hi: '#e8307a', lw: 4, k: 5 });
      fig(c, circ(-180, -200, 20), { ...T('#c28a62'), lw: 4, k: 5 }); fig(c, circ(170, -200, 20), { ...T('#c28a62'), lw: 4, k: 5 });
      fig(c, rect(-320, -200, 640, 26, 4), { fill: '#6a6485', tone: '#403b58', hi: '#aaa4c8', k: 5 });
      fig(c, rect(-320, -176, 640, 176), { fill: '#262233', tone: '#171420', k: 12 });
      for (const sx of [-1, 1]) {
        fig(c, ell(sx * 175, -208, 118, 28), { fill: '#0e0c14', hi: '#555', lw: 5 });
        fig(c, ell(sx * 175, -208, 36, 9), { fill: sx < 0 ? '#e8307a' : '#28c8d8', lw: 3 });
        c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2; for (const k of [60, 80, 98]) { c.beginPath(); c.ellipse(sx * 175, -208, k, k * 0.24, 0, 0, 6.283); c.stroke(); }
        limb(c, [[sx * 275, -224], [sx * 205, -226]], 6, '#bbb');
      }
      fig(c, rect(-52, -228, 104, 46, 5), { fill: '#2d2a3d', hi: '#8a85a8', k: 5 });
      for (let k = 0; k < 4; k++) fig(c, circ(-33 + k * 22, -208, 8), { fill: R.pick(['#ffd26a', '#28c8d8', '#e8307a', '#9ae03a']), lw: 3, k: 2 });
      crowd(c, R, -560, 560, 30, '#e8307a');
      c.restore();
    },
  },
  {
    id: 'stoop', word: 'STOOP', kind: 'brick', tone: { h: 12, s: 42, l: 30 }, wy: [0.3, 0.4], zoom: 0.86,
    style: { fill: '#f2c230', hi: '#fff0a0', block: '#a2321c', glow: '#ff9a3a' },
    bg(g) {
      const { c, R, w, h } = g;
      c.save(); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, h * 0.1); c.quadraticCurveTo(w * 0.5, h * 0.22, w, h * 0.08); c.stroke(); c.restore();
      for (let k = 0; k < 14; k++) { const t = k / 13, x = w * t, y = h * 0.1 + Math.sin(t * Math.PI) * h * 0.1 * 0.95 + (1 - t) * 0; c.fillStyle = 'rgba(255,214,120,0.18)'; c.beginPath(); c.arc(x, y + 16, 26, 0, 6.283); c.fill(); c.fillStyle = '#ffe7a0'; c.beginPath(); c.arc(x, y + 14, 6, 0, 6.283); c.fill(); }
      mist(c, w * 0.2, h * 0.5, w * 0.2, '#ff9a3a', R, 70);
    },
    fg(g) {
      const { c, R } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      fig(c, rect(-90, -240, 190, 20), { fill: '#6e4a3a', tone: '#3e2a22', k: 6 });
      stoop(c, -470);
      fig(c, rect(110, -580, 250, 300, 6), { fill: '#7a4a3a', tone: '#4d2e25', hi: '#b4785c', k: 12 });
      fig(c, smooth2([[140, -290], [140, -450], [160, -520], [235, -545], [310, -520], [330, -450], [330, -290]]), { fill: '#2a1d28', tone: '#150f17', hi: '#5b3a50', k: 9 });
      for (const [px, py, pw, ph] of [[165, -440, 55, 90], [250, -440, 55, 90], [165, -330, 55, 90], [250, -330, 55, 90]]) fig(c, rect(px!, py!, pw!, ph!, 4), { fill: '#3a2736', lw: 4, k: 4 });
      fig(c, circ(300, -370, 9), { fill: '#f2c230', lw: 3, k: 3 });
      fig(c, rect(380, -560, 120, 230, 6), { fill: '#ffcd6e', tone: '#d99a3c', hi: '#fff0b8', k: 14 });
      limb(c, [[380, -440], [440, -470], [500, -430]], 7, '#d94a6a');
      sit(c, -250, -2 * 40 - 2, 250, { top: '#2d8e8a', bot: '#2a3552', skin: '#8a5a3c', hat: '#e8307a' }, 1);
      sit(c, -60, -4 * 40 - 2, 250, { top: '#d9a02a', bot: '#3a2d4a', skin: '#c28a62' }, -1);
      fig(c, rect(15, -300, 70, 34, 6), { fill: '#e8e0d0', tone: '#9a917e', hi: '#fff', k: 5 }); fig(c, circ(36, -283, 10), { fill: '#222', lw: 3, k: 2 }); fig(c, circ(66, -283, 10), { fill: '#222', lw: 3, k: 2 });
      stand(c, -400, 70, 260, { top: '#c9402a', bot: '#2a2f45', skin: '#5a3b2c', hat: '#e8c030' });
      void R; c.restore();
    },
  },
  {
    id: 'kerb', word: 'NIGHT SHIFT', kind: 'concrete', tone: { h: 225, s: 24, l: 16 }, wy: [0.3, 0.4], zoom: 0.9,
    style: { fill: '#28c8d8', hi: '#a8f4ff', block: '#1a4a8a', glow: '#28c8d8', drips: 4 },
    bg(g) {
      const { c, w, h, R } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      c.fillStyle = '#17141f'; c.fillRect(-2000, 0, 4000, 900);
      fig(c, rect(-2000, -62, 4000, 62), { fill: '#4a4558', tone: '#2e2a3a', hi: '#8a85a0', k: 8 });
      c.fillStyle = 'rgba(255,255,255,0.3)'; for (let x = -1000; x < 1000; x += 160) c.fillRect(x, 120, 80, 8);
      limb(c, [[-300, -60], [-300, -520], [-260, -590]], 16, '#2a2833');
      fig(c, rect(-290, -620, 80, 30, 10), { fill: '#fff0b0', lw: 6, k: 3 });
      c.restore();
      const lx = g.cx - 250 * g.s, ly = g.gy - 610 * g.s, gr = c.createRadialGradient(lx, ly, 0, lx, ly, h * 0.7);
      gr.addColorStop(0, 'rgba(255,170,60,0.55)'); gr.addColorStop(0.3, 'rgba(255,140,40,0.2)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h); mist(c, lx, ly, h * 0.18, '#ffd88a', R, 80);
    },
    fg(g) {
      const { c } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      rays(c, 305, -78, 780, 40, 0, '#fff0b0');
      c.save(); c.globalAlpha = 0.22; c.fillStyle = '#ffe9a0'; c.beginPath(); c.moveTo(300, -90); c.lineTo(900, -150); c.lineTo(900, 70); c.lineTo(300, -50); c.fill(); c.restore();
      c.save(); c.globalAlpha = 0.28; c.fillStyle = '#ff9a3a'; c.beginPath(); c.ellipse(-240, 110, 190, 26, 0, 0, 6.283); c.fill(); c.fillStyle = '#28c8d8'; c.beginPath(); c.ellipse(60, 118, 260, 20, 0, 0, 6.283); c.fill(); c.restore();
      fig(c, poly([[-310, 0], [-312, -66], [-282, -94], [-196, -108], [-128, -172], [62, -172], [152, -112], [272, -100], [312, -62], [312, 0]]), { fill: '#1fa8a0', tone: '#0f6a68', hi: '#7ff2e6', k: 14, lw: 6 });
      fig(c, poly([[-108, -160], [-60, -118], [-40, -118], [-40, -160]]), { fill: '#24384c', tone: '#16222f', hi: '#6aa0c8', k: 6, lw: 4 });
      fig(c, poly([[-20, -160], [-20, -118], [128, -118], [62, -160]]), { fill: '#24384c', tone: '#16222f', hi: '#6aa0c8', k: 6, lw: 4 });
      c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(-30, -160); c.lineTo(-30, -100); c.moveTo(-100, -85); c.lineTo(-84, -85); c.moveTo(60, -85); c.lineTo(76, -85); c.stroke();
      fig(c, rect(282, -92, 34, 20, 6), { fill: '#fff0b0', lw: 4, k: 3 }); fig(c, rect(-314, -88, 18, 24, 5), { fill: '#e8307a', lw: 4, k: 3 });
      for (const wx of [-190, 190]) { fig(c, circ(wx, -2, 50), { fill: '#16141c', lw: 6, k: 6 }); fig(c, circ(wx, -2, 24), { fill: '#b9c0c8', tone: '#7d8590', hi: '#fff', lw: 4, k: 5 }); fig(c, circ(wx, -2, 7), { fill: '#222', lw: 2, k: 1 }); }
      fig(c, rect(440, -80, 56, 80, 14), { fill: '#e03a3a', tone: '#8f1f26', hi: '#ff9a8a', k: 8 }); fig(c, rect(432, -96, 72, 26, 12), { fill: '#e03a3a', tone: '#8f1f26', k: 6 });
      c.restore();
    },
  },
  {
    id: 'cat', word: 'BODEGA', kind: 'brick', tone: { h: 25, s: 30, l: 24 }, wy: [0.3, 0.4], zoom: 0.95,
    style: { fill: '#9ae03a', hi: '#e2ff9a', block: '#245a1c', glow: '#9ae03a' },
    bg(g) {
      const { c, w, h } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      fig(c, rect(-700, -300, 1400, 300), { fill: '#6f7a84', tone: '#434c55', k: 10, lw: 6 });
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 3; for (let y = -285; y < 0; y += 20) { c.beginPath(); c.moveTo(-700, y); c.lineTo(700, y); c.stroke(); }
      fig(c, poly([[-700, -300], [-720, -380], [720, -380], [700, -300]]), { fill: '#d94a3a', tone: '#8a2a24', hi: '#ff9a8a', k: 8 });
      for (let x = -700; x < 700; x += 100) fig(c, poly([[x, -300], [x + 50, -300], [x + 50, -380], [x, -380]]), { fill: '#f1e8d6', lw: 3, k: 1 });
      fig(c, rect(230, -250, 150, 100, 8), { fill: '#0f0e16', lw: 6, k: 1 });
      c.font = '52px Anton, Impact, sans-serif'; c.textAlign = 'center'; c.shadowColor = '#ff4fa0'; c.shadowBlur = 22; c.fillStyle = '#ff7ab8'; c.fillText('OPEN', 305, -180); c.shadowBlur = 0;
      c.restore();
      void w; void h;
    },
    fg(g) {
      const { c, R } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      fig(c, rect(-190, -180, 380, 180, 6), { fill: '#b57a3c', tone: '#7a4d22', hi: '#e8b270', k: 12 });
      c.strokeStyle = INK; c.lineWidth = 5; for (const y of [-120, -60]) { c.beginPath(); c.moveTo(-190, y); c.lineTo(190, y); c.stroke(); }
      for (let i = 0; i < 6; i++) fig(c, circ(-150 + i * 62, -196 + (i % 2) * 8, 32), { fill: '#f39a1c', tone: '#c26a0c', hi: '#ffd08a', lw: 5, k: 7 });
      fig(c, smooth2([[-130, -210], [-150, -340], [-90, -420], [-30, -400], [20, -300], [60, -215]]), { fill: '#3b3846', tone: '#24212e', hi: '#8a8499', k: 12 });
      limb(c, [[60, -225], [150, -230], [195, -300], [160, -350]], 24, '#3b3846');
      fig(c, smooth2([[-82, -215], [-60, -330], [-36, -330], [-24, -215]]), { fill: '#d9d4c8', tone: '#9d968a', lw: 4, k: 6 });
      fig(c, poly([[-100, -430], [-96, -515], [-60, -470]]), { fill: '#3b3846', lw: 5, k: 4 }); fig(c, poly([[60, -430], [56, -515], [20, -470]]), { fill: '#3b3846', lw: 5, k: 4 });
      fig(c, ell(-20, -410, 72, 60), { fill: '#3b3846', tone: '#24212e', hi: '#8a8499', k: 11 });
      for (const ex of [-52, 14]) { fig(c, ell(ex, -418, 15, 10), { fill: '#ffd23a', lw: 3, k: 2 }); c.fillStyle = INK; c.fillRect(ex - 2, -427, 4, 18); }
      fig(c, poly([[-26, -392], [-14, -392], [-20, -382]]), { fill: '#ff8aa8', lw: 2, k: 1 });
      c.strokeStyle = INK; c.lineWidth = 3; for (const s of [-1, 1]) for (const dy of [-7, 5]) { c.beginPath(); c.moveTo(-20 + s * 18, -386); c.lineTo(-20 + s * 92, -386 + dy * 2.4); c.stroke(); }
      fig(c, rect(250, -90, 110, 90, 10), { fill: '#5a6cc8', tone: '#34408a', hi: '#a8b6ff', k: 9 });
      for (let i = 0; i < 6; i++) fig(c, circ(262 + (i % 3) * 38, -126 - Math.floor(i / 3) * 12, 20), { fill: R.pick(['#ff7ab8', '#ffd23a', '#f1e8d6']), lw: 3, k: 3 });
      c.restore();
    },
  },
  {
    id: 'el', word: 'ELEVATED', kind: 'concrete', tone: { h: 210, s: 14, l: 22 }, wy: [0.3, 0.4], zoom: 0.9,
    style: { fill: '#ff6a2b', hi: '#ffc08a', block: '#7a1e2a', glow: '#ff6a2b' },
    bg(g) {
      const { c, w, h } = g;
      sunset(g, ['#3b2a62', '#6a2f78', '#a8366e', '#e0553c', '#f58a3a', '#ffc25a'], w * 0.72, h * 0.5, h * 0.2);
      skyline(g, h * 0.78, '#1d1830', '#ffc25a');
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      for (let x = -1500; x < 1500; x += 360) {
        fig(c, rect(x - 20, -520, 40, 520), { fill: '#2b3040', tone: '#171b27', hi: '#6a748a', k: 6 });
        c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.moveTo(x + 20, -500); c.lineTo(x + 340, -40); c.moveTo(x + 340, -500); c.lineTo(x + 20, -40); c.stroke();
      }
      fig(c, rect(-2000, -560, 4000, 58), { fill: '#343a4a', tone: '#1c202c', hi: '#8a94aa', k: 10 });
      c.fillStyle = '#9aa4ba'; for (let x = -1980; x < 2000; x += 40) { c.beginPath(); c.arc(x, -530, 4, 0, 6.283); c.fill(); }
      c.restore();
    },
    fg(g) {
      const { c, R } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      for (let i = -2; i < 2; i++) {
        const x = i * 470 + 40;
        fig(c, rect(x, -740, 450, 180, 30), { fill: '#b6c0c6', tone: '#7a8690', hi: '#ffffff', k: 12, lw: 7 });
        fig(c, rect(x, -660, 450, 34), { fill: '#e03a3a', lw: 4, k: 4 });
        for (let k = 0; k < 6; k++) fig(c, rect(x + 22 + k * 70, -722, 54, 56, 6), { fill: '#ffd26a', tone: '#d9a23a', lw: 4, k: 6 });
      }
      fig(c, circ(2*470 - 90, -640, 10), { fill: '#fff6b0', lw: 3, k: 2 });
      limb(c, [[300, 0], [300, -420], [330, -470]], 14, '#2a2833'); fig(c, rect(300, -490, 70, 24, 8), { fill: '#fff0b0', lw: 5, k: 3 });
      stand(c, -120, 20, 270, { top: '#e8c030', bot: '#2a3552', skin: '#8a5a3c', hat: '#2c6fb0' });
      stand(c, -40, 30, 250, { top: '#9a2f6a', bot: '#26263a', skin: '#c28a62', arms: 'hold' });
      void R; c.restore();
    },
  },
  {
    id: 'roof', word: 'ROOFTOP', kind: 'brick', tone: { h: 8, s: 30, l: 26 }, wy: [0.3, 0.4], zoom: 0.95,
    style: { fill: '#f2c230', hi: '#fff0a0', block: '#c43a2a', glow: '#ffb03a', drips: 4 },
    bg(g) {
      const { c, w, h } = g;
      sunset(g, ['#2c2a5a', '#5a2f78', '#b23c6a', '#ee6a3a', '#ffa23a'], w * 0.3, h * 0.55, h * 0.17);
      skyline(g, h * 0.72, '#1a1428', '#ffc25a');
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      for (const x of [250, 420]) { c.strokeStyle = INK; c.lineWidth = 8; c.beginPath(); c.moveTo(x, -230); c.lineTo(x - 12, -90); c.moveTo(x + 150, -230); c.lineTo(x + 162, -90); c.moveTo(x - 6, -150); c.lineTo(x + 156, -170); c.stroke(); }
      c.restore();
    },
    fg(g) {
      const { c, R } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      fig(c, rect(-500, -190, 1000, 90, 4), { fill: '#7a4a3a', tone: '#4d2e25', hi: '#b4785c', k: 8 });
      fig(c, rect(-520, -210, 1040, 26, 4), { fill: '#a88a72', tone: '#6e5848', hi: '#e0c8a8', k: 6 });
      fig(c, rect(-700, -100, 1400, 300), { fill: '#33303c', tone: '#201e29', k: 10 });
      limb(c, [[-420, -210], [-420, -520]], 8, '#2a2833'); limb(c, [[-470, -480], [-370, -480]], 6, '#2a2833'); limb(c, [[-470, -420], [-370, -420]], 6, '#2a2833');
      fig(c, poly([[280, -310], [330, -380], [380, -310]]), { fill: '#5a4636', tone: '#33281f', hi: '#a58a6f', k: 6 });
      fig(c, rect(240, -310, 180, 130, 20), { fill: '#7a5a42', tone: '#4a3626', hi: '#c19a74', k: 10 });
      c.strokeStyle = INK; c.lineWidth = 6; for (const y of [-290, -220]) { c.beginPath(); c.moveTo(244, y); c.lineTo(416, y); c.stroke(); }
      sit(c, -120, -210, 240, { top: '#2d8e8a', bot: '#2a3552', skin: '#5a3b2c', hat: '#e8307a' }, 1);
      sit(c, 60, -210, 230, { top: '#c9402a', bot: '#26263a', skin: '#c28a62' }, -1);
      for (const [bx, by, f] of [[-300, -222, 1], [-250, -218, -1], [180, -224, 1]] as const) {
        fig(c, ell(bx, by - 14, 22, 15), { fill: '#7c8396', tone: '#555c6e', hi: '#c8cfdd', lw: 4, k: 4 }); fig(c, circ(bx + f * 18, by - 28, 10), { fill: '#7c8396', tone: '#555c6e', lw: 4, k: 3 });
        fig(c, poly([[bx + f * 26, by - 28], [bx + f * 36, by - 25], [bx + f * 26, by - 22]]), { fill: '#f2c230', lw: 2, k: 1 });
      }
      void R; c.restore();
    },
  },
  {
    id: 'hydrant', word: 'BLOCK PARTY', kind: 'brick', tone: { h: 18, s: 36, l: 27 }, wy: [0.3, 0.4], zoom: 0.95,
    style: { fill: '#ff4fa0', hi: '#ffb0d6', block: '#3a1a8a', glow: '#ff4fa0' },
    bg(g) {
      const { c, w, h } = g, cols = ['#e8307a', '#f2c230', '#28c8d8', '#9ae03a', '#ff6a2b'];
      c.save(); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(-10, h * 0.07); c.quadraticCurveTo(w * 0.5, h * 0.2, w + 10, h * 0.06); c.stroke(); c.restore();
      for (let k = 0; k < 16; k++) { const t = (k + 0.5) / 16, x = w * t, y = h * 0.07 + Math.sin(t * Math.PI) * h * 0.095; fig(c, poly([[x - 17, y], [x + 17, y], [x, y + 46]]), { fill: cols[k % 5]!, lw: 3, k: 4 }); }
    },
    fg(g) {
      const { c, R } = g;
      c.save(); c.translate(g.cx, g.gy); c.scale(g.s, g.s);
      fig(c, rect(-1200, 0, 2400, 400), { fill: '#2a2833', tone: '#1a1822', k: 12 });
      fig(c, rect(-1200, -40, 2400, 40), { fill: '#6a6578', tone: '#443f54', hi: '#a8a2bc', k: 6 });
      for (const [a, b, bow] of [[-70, -330, -90], [-70, -330, 60]] as const) { spray(c, 60, -300, 520, 20, 30, '#bdf4ff', R, a + b < 0 ? bow : -bow); }
      for (const [px, py, dr] of [[300, -90, 40], [440, -20, 50], [160, -30, 40]] as const) { c.fillStyle = 'rgba(189,244,255,0.75)'; c.beginPath(); c.ellipse(px, py + 10, dr * 1.7, dr * 0.35, 0, 0, 6.283); c.fill(); }
      fig(c, smooth2([[-110, -20], [-110, -250], [-70, -300], [-40, -330], [-10, -300], [30, -250], [30, -20]]), { fill: '#d63a3a', tone: '#8a1f2c', hi: '#ff9a8a', k: 12 });
      fig(c, rect(-140, -30, 100, 30, 6), { fill: '#d63a3a', tone: '#8a1f2c', k: 6 });
      fig(c, rect(-100, -278, 60, 22, 6), { fill: '#e8d03a', lw: 4, k: 4 });
      fig(c, rect(30, -210, 60, 50, 8), { fill: '#d63a3a', tone: '#8a1f2c', k: 7 }); fig(c, circ(90, -185, 26), { fill: '#e8d03a', tone: '#a8902a', lw: 5, k: 5 });
      fig(c, rect(-340, -140, 160, 140, 8), { fill: '#e8e4da', tone: '#a8a498', hi: '#fff', k: 10 }); fig(c, rect(-350, -168, 180, 34, 8), { fill: '#2c6fb0', tone: '#1a4670', k: 6 });
      for (const [x, f] of [[-520, 1], [-440, -1]] as const) { limb(c, [[x, -150], [x + f * 30, -10]], 12, '#4a4658'); limb(c, [[x, -150], [x + f * 80, -200]], 12, '#4a4658'); fig(c, rect(x - 30, -170, 90, 22, 8), { fill: '#e8307a', lw: 4, k: 4 }); }
      fig(c, rect(-690, -90, 120, 90, 10), { fill: '#2a2833', hi: '#8a8499', lw: 5, k: 6 }); fig(c, circ(-660, -45, 25), { fill: '#111', lw: 4, k: 4 }); fig(c, circ(-600, -45, 25), { fill: '#111', lw: 4, k: 4 });
      c.restore();
    },
  },
];

export interface RenderOpts { seed: number; w: number; h: number }

/** Draws panel `p` onto `c` (a context sized w by h). Same seed gives the same picture. */
export function paintPanel(c: C, p: Panel, R: Rnd, w: number, h: number): void {
  const wide = w / h >= 1.15;
  const s = (wide ? (h / 900) * 0.8 : Math.min(w / 1000, h / 900) * 1.25) * p.zoom;
  const g: Geo = { c, R, w, h, s, cx: wide ? w * 0.5 : w * 0.5, gy: wide ? h * 0.8 : h * 0.72, wide };
  wall(c, w, h, R, p.kind, p.tone);
  p.bg(g);
  const base = (wide ? p.wy[0] : p.wy[1]) * h;
  const size = Math.min(wide ? h * 0.3 : h * 0.17, w * 0.28);
  drawWord(c, p.word, wide ? w * 0.6 : w * 0.5, base, size, wide ? w * 0.66 : w * 0.92, p.style, R);
  p.fg(g);
  stencil(c, R.pick(['star', 'arrow', 'bolt'] as const), w * R.r(0.78, 0.92), h * R.r(0.55, 0.7), Math.min(w, h) * 0.05, p.style.fill, R);
  stencil(c, 'arrow', w * R.r(0.06, 0.12), h * R.r(0.52, 0.62), Math.min(w, h) * 0.04, p.style.hi, R);
  vignette(c, w, h);
}
