/**
 * Loading-screen art: six Bed-Stuy scenes in a bold comic-poster style (flat colour, heavy ink outlines, halftone dots,
 * a diagonal split), drawn procedurally on a canvas. Original artwork, no image files: each panel costs a few
 * milliseconds and is drawn lazily, only when it is about to be shown.
 *
 * Every scene is authored in a 1000 x 562 design space. `drawPanel` fits that space into any canvas size (wider canvases
 * extend the sky and ground colours, so a portrait phone gets the same scene with more sky above and street below).
 */

export const DESIGN_W = 1000;
export const DESIGN_H = 562;
const INK = '#14101c';

export interface PanelInfo {
  id: string;
  /** Poster caption, shown in the corner by the loading screen (DOM, so it stays crisp and accessible). */
  caption: string;
  sub: string;
}

type Ctx = CanvasRenderingContext2D;
interface Scene { sky: [string, string]; ground: string; horizon: number; draw: (c: Ctx, rnd: () => number) => void }

export const PANELS: readonly PanelInfo[] = [
  { id: 'stoop', caption: 'The Stoop', sub: 'Brownstone blocks, Sunday evening' },
  { id: 'deli', caption: 'The Corner Deli', sub: 'Open late. Bacon egg and cheese, always' },
  { id: 'cab', caption: 'Throop Ave', sub: 'Yellow cab, green light' },
  { id: 'dj', caption: 'On the Decks', sub: 'Funk, boom-bap and block-party bass' },
  { id: 'train', caption: 'The Elevated', sub: 'Next stop: everywhere' },
  { id: 'roof', caption: 'Rooftop Hour', sub: 'Water tower, sunset, good company' },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- drawing helpers (all coordinates in design space)

function shape(c: Ctx, pts: ReadonlyArray<readonly [number, number]>, fill: string, lw = 5): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) { c.lineWidth = lw; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(); }
}

function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string, lw = 5): void {
  shape(c, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, lw);
}

function disc(c: Ctx, x: number, y: number, r: number, fill: string, lw = 5): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) { c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); }
}

function arch(c: Ctx, x: number, y: number, w: number, h: number, fill: string, lw = 4): void {
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + w / 2);
  c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.stroke();
}

/** Comic halftone: a dot grid inside the rect whose dot size follows `k(nx, ny)` in 0..1. */
function halftone(c: Ctx, x: number, y: number, w: number, h: number, color: string, step: number, k: (nx: number, ny: number) => number): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = color;
  for (let j = 0, gy = y; gy < y + h + step; gy += step * 0.866, j++) {
    for (let gx = x + (j % 2 ? step / 2 : 0); gx < x + w + step; gx += step) {
      const r = step * 0.62 * Math.max(0, Math.min(1, k((gx - x) / w, (gy - y) / h)));
      if (r < 0.6) continue;
      c.beginPath();
      c.arc(gx, gy, r, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

function rays(c: Ctx, cx: number, cy: number, r: number, n: number, color: string, phase = 0): void {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a0 = phase + (i / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / n / 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    c.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    c.closePath();
    c.fill();
  }
}

type Hair = 'afro' | 'braids' | 'cap' | 'wrap' | 'bun' | 'fade' | 'locs';
interface Figure { skin: string; top: string; bottom: string; hair: Hair; hairColor?: string; sit?: boolean; arm?: 'up' | 'down' | 'bag' }

/** Flat poster figure, feet at (x, y), `h` tall. Faceless on purpose: silhouette-level, same proportions for everyone. */
function person(c: Ctx, x: number, y: number, h: number, f: Figure): void {
  const hr = h * 0.085;
  const hair = f.hairColor ?? '#1d1620';
  const torsoH = h * 0.34;
  const legH = f.sit ? h * 0.2 : h * 0.4;
  const torsoTop = y - legH - torsoH;
  const headY = torsoTop - hr * 1.15;
  const tw = h * 0.2;
  c.lineJoin = 'round';
  // legs
  if (f.sit) {
    box(c, x - tw * 0.45, y - h * 0.17, tw * 1.6, h * 0.09, f.bottom, 4);
    box(c, x + tw * 0.9, y - h * 0.17, h * 0.08, h * 0.17, f.bottom, 4);
  } else {
    box(c, x - tw * 0.42, y - legH, tw * 0.38, legH, f.bottom, 4);
    box(c, x + tw * 0.04, y - legH, tw * 0.38, legH, f.bottom, 4);
    box(c, x - tw * 0.5, y - h * 0.03, tw * 0.46, h * 0.03, INK, 0);
    box(c, x + tw * 0.04, y - h * 0.03, tw * 0.46, h * 0.03, INK, 0);
  }
  // arm behind torso when raised
  if (f.arm === 'up') shape(c, [[x + tw * 0.4, torsoTop + 6], [x + tw * 0.95, torsoTop - h * 0.16], [x + tw * 1.15, torsoTop - h * 0.12], [x + tw * 0.6, torsoTop + torsoH * 0.35]], f.top, 4);
  // torso
  shape(c, [[x - tw * 0.5, torsoTop], [x + tw * 0.5, torsoTop], [x + tw * 0.44, torsoTop + torsoH], [x - tw * 0.44, torsoTop + torsoH]], f.top, 5);
  if (f.arm === 'down' || f.arm === 'bag') box(c, x - tw * 0.72, torsoTop + 4, tw * 0.24, torsoH * 0.82, f.top, 4);
  if (f.arm === 'bag') {
    box(c, x + tw * 0.32, torsoTop + torsoH * 0.62, tw * 0.5, tw * 0.55, '#c8935a', 4);
    box(c, x + tw * 0.46, torsoTop + torsoH * 0.5, tw * 0.22, torsoH * 0.18, f.skin, 3);
  }
  // neck + head
  box(c, x - hr * 0.35, torsoTop - hr * 0.4, hr * 0.7, hr * 0.5, f.skin, 3);
  disc(c, x, headY, hr, f.skin, 4);
  // hair
  c.fillStyle = hair;
  c.strokeStyle = INK;
  c.lineWidth = 4;
  switch (f.hair) {
    case 'afro': disc(c, x, headY - hr * 0.35, hr * 1.35, hair, 4); disc(c, x, headY + hr * 0.15, hr * 0.92, f.skin, 0); break;
    case 'braids':
      c.beginPath(); c.arc(x, headY, hr * 1.08, Math.PI * 0.95, Math.PI * 2.05); c.fill(); c.stroke();
      for (const s of [-1, 1]) box(c, x + s * hr * 0.95 - hr * 0.12, headY - hr * 0.1, hr * 0.26, hr * 1.7, hair, 3);
      break;
    case 'cap': c.beginPath(); c.arc(x, headY - hr * 0.1, hr * 1.06, Math.PI, 0); c.closePath(); c.fill(); c.stroke(); box(c, x - hr * 0.1, headY - hr * 0.15, hr * 1.5, hr * 0.28, hair, 3); break;
    case 'wrap': disc(c, x, headY - hr * 0.35, hr * 1.05, '#e05a3a', 4); box(c, x - hr * 1.02, headY - hr * 0.55, hr * 2.04, hr * 0.42, '#f2b632', 3); break;
    case 'bun': disc(c, x, headY - hr * 1.2, hr * 0.5, hair, 4); c.beginPath(); c.arc(x, headY, hr * 1.05, Math.PI * 0.98, Math.PI * 2.02); c.fill(); c.stroke(); break;
    case 'locs':
      c.beginPath(); c.arc(x, headY - hr * 0.05, hr * 1.08, Math.PI * 0.9, Math.PI * 2.1); c.fill(); c.stroke();
      for (let i = -2; i <= 2; i++) box(c, x + i * hr * 0.4 - hr * 0.1, headY - hr * 0.2, hr * 0.22, hr * (1.4 + (i % 2 ? 0.3 : 0)), hair, 3);
      break;
    default: c.beginPath(); c.arc(x, headY - hr * 0.1, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill(); c.stroke();
  }
}

const SKIN = ['#7a4a2e', '#c68a5c', '#4a2c1e', '#e0b58a', '#9a6240', '#b87850'] as const;

// ---- scenes

const SCENES: Record<string, Scene> = {
  stoop: {
    sky: ['#f7c47a', '#ee6f4a'], ground: '#4a4658', horizon: 470,
    draw(c) {
      rays(c, 160, 130, 900, 14, 'rgba(255,240,200,0.28)');
      // sidewalk + street
      box(c, -40, 440, 1080, 40, '#cbb89b', 5);
      box(c, -40, 478, 1080, 120, '#4a4658', 0);
      for (let x = 30; x < 1000; x += 160) box(c, x, 520, 80, 8, '#f4d35e', 0);
      // brownstone
      box(c, 330, 70, 700, 372, '#8d4a36', 6);
      box(c, 318, 52, 724, 34, '#6e3a2b', 6);
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 3; k++) {
          const wx = 520 + k * 150, wy = 112 + r * 108;
          if (r === 2 && k === 0) continue;
          arch(c, wx, wy, 76, 92, r === 1 && k === 1 ? '#ffd35c' : '#f7e3a1');
          box(c, wx - 8, wy + 92, 92, 10, '#d9c3a0', 4);
          c.beginPath(); c.moveTo(wx + 38, wy + 40); c.lineTo(wx + 38, wy + 92); c.stroke();
        }
      }
      // door + stoop
      arch(c, 380, 262, 92, 178, '#1f6f6b');
      arch(c, 392, 274, 68, 80, '#7fd1c6', 3);
      box(c, 366, 252, 120, 14, '#d9c3a0', 4);
      for (let i = 0; i < 6; i++) box(c, 140 + i * 40, 440 - (i + 1) * 28 + 4, 260 - i * 40 - 20 + 0, 28, i % 2 ? '#d8c6a8' : '#e3d2b5', 4);
      shape(c, [[132, 440], [372, 262], [380, 262], [380, 276], [150, 440]], '#2a2430', 4);
      // tree
      box(c, 82, 250, 22, 190, '#5b3b27', 5);
      for (const [tx, ty, r] of [[92, 210, 74], [40, 250, 52], [150, 244, 56]] as const) disc(c, tx, ty, r, '#3f8f5a', 5);
      // people on the stoop
      person(c, 250, 372, 150, { skin: SKIN[0], top: '#e4572e', bottom: '#2b3a67', hair: 'braids', sit: true });
      person(c, 306, 340, 152, { skin: SKIN[3], top: '#3a86ff', bottom: '#222831', hair: 'cap', arm: 'up' });
      person(c, 780, 470, 170, { skin: SKIN[1], top: '#f2b632', bottom: '#2b2d42', hair: 'afro', arm: 'bag' });
      halftone(c, 0, 0, 520, 300, 'rgba(120,30,20,0.35)', 12, (nx, ny) => Math.max(0, 1 - nx * 1.3 - ny * 0.6));
    },
  },
  deli: {
    sky: ['#8fd0e8', '#d8f0f4'], ground: '#51505c', horizon: 470,
    draw(c) {
      halftone(c, 0, 0, 1000, 240, 'rgba(255,255,255,0.45)', 14, (nx, ny) => 1 - ny);
      box(c, -40, 450, 1080, 36, '#d6c8b0', 5);
      box(c, -40, 486, 1080, 120, '#51505c', 0);
      // storefront building
      box(c, 150, 60, 760, 392, '#b5523b', 6);
      for (let k = 0; k < 4; k++) arch(c, 210 + k * 170, 92, 70, 96, k === 2 ? '#ffd35c' : '#f7e3a1');
      // sign band
      box(c, 190, 214, 680, 62, '#14101c', 6);
      c.fillStyle = '#ffd35c';
      c.font = '900 46px "Arial Black", Impact, system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('CORNER DELI', 530, 262);
      // striped awning
      for (let i = 0; i < 12; i++) shape(c, [[190 + i * 56.7, 284], [190 + (i + 1) * 56.7, 284], [180 + (i + 1) * 58.3, 350], [170 + i * 58.3 + 10, 350]], i % 2 ? '#f7f2e6' : '#2f9e5b', 4);
      for (let i = 0; i < 12; i++) disc(c, 188 + i * 57 + 28, 354, 14, i % 2 ? '#f7f2e6' : '#2f9e5b', 4);
      // window + door
      box(c, 210, 372, 380, 80, '#7fd1c6', 5);
      box(c, 240, 384, 90, 56, '#f2b632', 3); box(c, 350, 384, 90, 56, '#e05a3a', 3); box(c, 460, 384, 90, 56, '#4a90d9', 3);
      box(c, 640, 330, 130, 122, '#1f2a44', 6); box(c, 656, 346, 98, 88, '#7fd1c6', 3);
      // flower buckets
      for (const bx of [210, 270]) { box(c, bx, 430, 46, 28, '#7a7f87', 4); for (let i = 0; i < 4; i++) disc(c, bx + 8 + i * 10, 420 - (i % 2) * 8, 9, ['#ff6b6b', '#ffd166', '#f78fb3', '#ff9f1c'][i] ?? '#fff', 3); }
      // neon "OPEN"
      box(c, 800, 330, 80, 40, '#14101c', 4); c.fillStyle = '#ff5a5f'; c.font = '800 26px system-ui, sans-serif'; c.fillText('OPEN', 840, 360);
      person(c, 640, 490, 176, { skin: SKIN[2], top: '#ffffff', bottom: '#2d6a4f', hair: 'fade', arm: 'bag' });
      person(c, 860, 494, 168, { skin: SKIN[4], top: '#9d4edd', bottom: '#1d3557', hair: 'bun', arm: 'down' });
      person(c, 90, 494, 160, { skin: SKIN[5], top: '#ffb703', bottom: '#264653', hair: 'wrap' });
      halftone(c, 700, 0, 300, 562, 'rgba(20,16,28,0.25)', 12, (nx, ny) => nx * (1 - ny * 0.4));
    },
  },
  cab: {
    sky: ['#ffd36e', '#ff8a5c'], ground: '#3a3a4a', horizon: 400,
    draw(c) {
      rays(c, 760, 250, 1000, 18, 'rgba(255,255,255,0.22)');
      // buildings silhouette
      let x = -20;
      const hs = [230, 300, 200, 340, 260, 310, 220];
      for (const h of hs) { box(c, x, 400 - h, 150, h, '#5b3a59', 5); for (let r = 0; r < h / 46 - 1; r++) for (let k = 0; k < 3; k++) box(c, x + 18 + k * 44, 400 - h + 22 + r * 46, 22, 26, (r + k + x) % 3 === 0 ? '#ffd35c' : '#8f6b8d', 0); x += 150; }
      // street
      box(c, -40, 400, 1080, 200, '#3a3a4a', 0);
      shape(c, [[-40, 388], [1040, 388], [1040, 404], [-40, 404]], '#cbb89b', 5);
      for (let i = 0; i < 6; i++) box(c, 20 + i * 180, 500, 90, 10, '#f4d35e', 0);
      // street sign
      box(c, 820, 130, 14, 262, '#2a2430', 4); box(c, 700, 108, 250, 52, '#1f6f4a', 5);
      c.fillStyle = '#fff'; c.font = '800 30px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('THROOP AVE', 825, 145);
      // taxi
      const cx = 420, cy = 470;
      shape(c, [[cx - 250, cy], [cx - 250, cy - 70], [cx - 190, cy - 82], [cx - 130, cy - 150], [cx + 80, cy - 150], [cx + 150, cy - 86], [cx + 250, cy - 70], [cx + 250, cy]], '#ffcc1a', 7);
      shape(c, [[cx - 118, cy - 138], [cx - 14, cy - 138], [cx - 14, cy - 88], [cx - 170, cy - 88]], '#bfe6f2', 5);
      shape(c, [[cx + 4, cy - 138], [cx + 70, cy - 138], [cx + 126, cy - 88], [cx + 4, cy - 88]], '#bfe6f2', 5);
      box(c, cx - 36, cy - 168, 74, 22, '#fff6c0', 5);
      c.fillStyle = INK; c.font = '900 16px system-ui, sans-serif'; c.fillText('TAXI', cx + 1, cy - 151);
      for (let i = 0; i < 8; i++) { box(c, cx - 250 + i * 62, cy - 62, 31, 14, '#14101c', 0); box(c, cx - 219 + i * 62, cy - 62, 31, 14, '#ffcc1a', 0); }
      for (const wx of [cx - 150, cx + 150]) { disc(c, wx, cy + 4, 46, '#14101c', 0); disc(c, wx, cy + 4, 24, '#c9ccd4', 5); }
      disc(c, cx + 245, cy - 40, 12, '#fff6c0', 4);
      // passenger silhouettes in the cab
      disc(c, cx - 80, cy - 112, 20, '#14101c', 0); disc(c, cx + 50, cy - 112, 20, '#14101c', 0);
      person(c, 900, 396, 150, { skin: SKIN[1], top: '#06d6a0', bottom: '#073b4c', hair: 'locs', arm: 'up' });
      person(c, 80, 398, 140, { skin: SKIN[3], top: '#ef476f', bottom: '#26547c', hair: 'cap' });
      halftone(c, 0, 380, 1000, 182, 'rgba(0,0,0,0.3)', 12, (nx, ny) => ny);
    },
  },
  dj: {
    sky: ['#2b1b52', '#7a2f8f'], ground: '#1a1228', horizon: 440,
    draw(c, rnd) {
      rays(c, 500, 300, 1100, 22, 'rgba(255,90,170,0.3)', 0.1);
      halftone(c, 0, 0, 1000, 562, 'rgba(255,200,60,0.4)', 16, (nx, ny) => Math.max(0, 1 - Math.hypot(nx - 0.5, ny - 0.5) * 2.2));
      // speakers
      for (const sx of [40, 800]) { box(c, sx, 200, 160, 262, '#1d1830', 6); disc(c, sx + 80, 290, 52, '#3a3158', 5); disc(c, sx + 80, 290, 20, '#14101c', 4); disc(c, sx + 80, 400, 30, '#3a3158', 5); }
      // equaliser bars
      for (let i = 0; i < 20; i++) { const bh = 40 + rnd() * 120; box(c, 250 + i * 25, 250 - bh, 18, bh, ['#ff4d6d', '#ffd23f', '#3ddc97'][i % 3] ?? '#fff', 3); }
      // table
      box(c, 220, 392, 560, 40, '#2a2240', 6); box(c, 250, 432, 500, 130, '#1d1830', 6);
      // DJ behind the decks
      person(c, 500, 392, 250, { skin: SKIN[0], top: '#ffd23f', bottom: '#1d1830', hair: 'afro', arm: 'up' });
      // headphones
      c.lineWidth = 7; c.strokeStyle = INK; c.beginPath(); c.arc(500, 170, 44, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      box(c, 450, 160, 14, 34, '#ff4d6d', 4); box(c, 536, 160, 14, 34, '#ff4d6d', 4);
      // decks
      for (const dx of [290, 560]) { box(c, dx, 340, 150, 56, '#3a3158', 5); disc(c, dx + 75, 366, 38, '#14101c', 4); disc(c, dx + 75, 366, 12, '#ff4d6d', 3); }
      box(c, 462, 352, 76, 44, '#14101c', 4); for (let i = 0; i < 4; i++) box(c, 470 + i * 17, 358, 7, 28, i % 2 ? '#3ddc97' : '#ffd23f', 0);
      // dancers
      person(c, 150, 540, 190, { skin: SKIN[4], top: '#3ddc97', bottom: '#5f0f40', hair: 'braids', arm: 'up' });
      person(c, 860, 548, 200, { skin: SKIN[3], top: '#ff4d6d', bottom: '#14101c', hair: 'wrap', arm: 'up' });
      person(c, 700, 560, 150, { skin: SKIN[2], top: '#4cc9f0', bottom: '#14101c', hair: 'fade' });
      for (let i = 0; i < 14; i++) { c.fillStyle = ['#ffd23f', '#ff4d6d', '#3ddc97'][i % 3] ?? '#fff'; c.beginPath(); c.arc(60 + rnd() * 880, 40 + rnd() * 180, 3 + rnd() * 4, 0, 7); c.fill(); }
    },
  },
  train: {
    sky: ['#3b2a6e', '#ff9a5c'], ground: '#1b1626', horizon: 500,
    draw(c) {
      disc(c, 700, 330, 120, '#ffe08a', 0);
      halftone(c, 0, 0, 1000, 360, 'rgba(255,150,90,0.55)', 14, (nx, ny) => ny);
      // skyline silhouettes
      let x = -10;
      for (const h of [120, 190, 150, 230, 140, 260, 170, 210, 130, 180]) { box(c, x, 400 - h, 104, h, '#2a1f45', 5); x += 104; }
      // viaduct
      box(c, -40, 300, 1080, 26, '#1b1626', 6);
      for (let i = 0; i < 8; i++) { box(c, 20 + i * 140, 326, 36, 190, '#241c35', 5); shape(c, [[10 + i * 140, 326], [66 + i * 140, 326], [50 + i * 140, 360], [26 + i * 140, 360]], '#241c35', 4); }
      // train
      for (let i = 0; i < 3; i++) {
        const tx = 40 + i * 330;
        box(c, tx, 204, 316, 96, i === 0 ? '#d94f3d' : '#c9ccd4', 6);
        box(c, tx, 258, 316, 14, '#14101c', 0);
        for (let k = 0; k < 6; k++) box(c, tx + 16 + k * 50, 222, 34, 32, '#ffd96a', 4);
      }
      box(c, 40, 190, 316, 14, '#14101c', 4);
      // rail sparks / lamps
      for (let i = 0; i < 5; i++) { box(c, 80 + i * 200, 150, 8, 54, '#14101c', 0); disc(c, 84 + i * 200, 148, 10, '#ffe08a', 3); }
      // street level
      box(c, -40, 500, 1080, 100, '#1b1626', 0);
      for (let i = 0; i < 5; i++) box(c, 40 + i * 200, 530, 100, 8, '#f4d35e', 0);
      person(c, 780, 520, 180, { skin: SKIN[0], top: '#4cc9f0', bottom: '#14101c', hair: 'locs', arm: 'bag' });
      person(c, 850, 520, 168, { skin: SKIN[3], top: '#ffd23f', bottom: '#2a1f45', hair: 'bun' });
      person(c, 150, 520, 176, { skin: SKIN[5], top: '#ef476f', bottom: '#14101c', hair: 'cap', arm: 'down' });
    },
  },
  roof: {
    sky: ['#ff6b6b', '#ffd36e'], ground: '#2b2340', horizon: 440,
    draw(c) {
      rays(c, 300, 360, 1200, 20, 'rgba(255,255,220,0.3)');
      disc(c, 300, 360, 150, '#fff0b8', 6);
      halftone(c, 0, 0, 1000, 340, 'rgba(160,30,70,0.4)', 13, (nx, ny) => 1 - ny * 1.2);
      // far rooftops
      let x = -20;
      for (const h of [110, 150, 90, 170, 120, 140, 100, 160]) { box(c, x, 440 - h, 130, h, '#4a2e5a', 5); x += 130; }
      // near roof
      box(c, -40, 440, 1080, 180, '#2b2340', 6);
      box(c, -40, 440, 1080, 14, '#6d5a8a', 4);
      // water tower
      for (const [lx, rx] of [[640, 700], [720, 780], [800, 860]] as const) shape(c, [[lx, 150], [lx + 14, 150], [rx + 14, 440], [rx, 440]], '#4a2f22', 4);
      shape(c, [[650, 300], [850, 300], [770, 400], [730, 400]], '#4a2f22', 0);
      box(c, 626, 120, 252, 30, '#2a1810', 5);
      shape(c, [[630, 150], [874, 150], [874, 40], [752, 6], [630, 40]], '#8a5a3a', 6);
      for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(630 + i * 40.6, 150); c.lineTo(630 + i * 40.6, i < 3 ? 40 - i * 5 : 10 + (i - 3) * 8 + 20); c.lineWidth = 3; c.stroke(); }
      // crates + string lights
      box(c, 90, 392, 90, 48, '#8a5a3a', 5); box(c, 160, 360, 70, 80, '#a06b44', 5);
      c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, 220); c.quadraticCurveTo(250, 320, 520, 230); c.stroke();
      for (let i = 0; i < 9; i++) { const t = i / 8; disc(c, t * 520, 220 + Math.sin(t * Math.PI) * 78 + 8, 9, ['#ffd23f', '#ff6b6b', '#8be9fd'][i % 3] ?? '#fff', 3); }
      // friends on the roof
      person(c, 380, 440, 200, { skin: SKIN[1], top: '#3a86ff', bottom: '#14101c', hair: 'afro' });
      person(c, 470, 440, 186, { skin: SKIN[0], top: '#ffd23f', bottom: '#5f0f40', hair: 'wrap', arm: 'up' });
      person(c, 560, 440, 192, { skin: SKIN[3], top: '#06d6a0', bottom: '#14101c', hair: 'bun', arm: 'down' });
    },
  },
};

/**
 * Draws panel `index` into `canvas` (any size). Deterministic per index. Returns false when no 2D context exists
 * (jsdom, or a blocked canvas), so callers can fall back to the panel's CSS gradient.
 */
export function drawPanel(canvas: HTMLCanvasElement, index: number): boolean {
  const info = PANELS[((index % PANELS.length) + PANELS.length) % PANELS.length];
  const scene = info ? SCENES[info.id] : undefined;
  if (!info || !scene) return false;
  let c: Ctx | null = null;
  try { c = canvas.getContext('2d'); } catch { c = null; }
  if (!c) return false;
  const w = canvas.width, h = canvas.height;
  const s = Math.min(w / DESIGN_W, h / DESIGN_H);
  const ox = (w - DESIGN_W * s) / 2;
  const oy = (h - DESIGN_H * s) / 2;
  c.save();
  // extended backdrop: sky above the horizon, ground below it, so non-16:9 canvases have no empty bars
  const horizonY = oy + scene.horizon * s;
  const g = c.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, scene.sky[0]);
  g.addColorStop(1, scene.sky[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, w, horizonY);
  c.fillStyle = scene.ground;
  c.fillRect(0, horizonY, w, h - horizonY);
  c.translate(ox, oy);
  c.scale(s, s);
  c.beginPath();
  c.rect(-ox / s, -oy / s, w / s, h / s);
  c.clip();
  c.textBaseline = 'alphabetic';
  scene.draw(c, mulberry32(0xb3d57 + index * 977));
  c.restore();
  // diagonal split: a bold ink slash with a halftone shadow, cut from the lower-left to the upper-right
  c.save();
  c.strokeStyle = INK;
  c.lineWidth = Math.max(4, w * 0.008);
  c.beginPath();
  c.moveTo(0, h * 0.965);
  c.lineTo(w, h * 0.035);
  c.stroke();
  c.restore();
  return true;
}

/** Canvas size for the panels: capped so a panel stays ~0.5 MP (16:9 landscape, or 9:16 on a portrait screen). */
export function panelSize(viewW: number, viewH: number): { w: number; h: number } {
  const portrait = viewH > viewW;
  return portrait ? { w: 540, h: 960 } : { w: 960, h: 540 };
}
