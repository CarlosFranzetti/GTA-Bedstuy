// @ts-nocheck
import { it } from 'vitest';
import zlib from 'node:zlib';
import fs from 'node:fs';
import { Rng } from '@/core/Rng';
import * as G from '@/textures/painters/ground';

const OUT = '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/g/';

function parseColor(s: string): [number, number, number, number] {
  s = String(s).trim();
  let m;
  if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
    let h = m[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  if ((m = /^hsl\(([^)]+)\)$/.exec(s))) {
    const [h, sa, l] = m[1].split(',').map((x) => parseFloat(x));
    const S = sa / 100, L = l / 100, c = (1 - Math.abs(2 * L - 1)) * S, hp = ((h % 360) + 360) % 360 / 60, x = c * (1 - Math.abs(hp % 2 - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) [r, g, b] = [c, x, 0]; else if (hp < 2) [r, g, b] = [x, c, 0]; else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c]; else if (hp < 5) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    const mm = L - c / 2; return [(r + mm) * 255, (g + mm) * 255, (b + mm) * 255, 1];
  }
  return [255, 0, 255, 1];
}

class Ctx2D {
  data: Uint8ClampedArray; w: number; h: number;
  fillStyle = '#000'; strokeStyle = '#000'; lineWidth = 1; globalAlpha = 1; font = '10px sans-serif'; textAlign = 'start'; textBaseline = 'alphabetic';
  stack: any[] = []; subs: number[][] = []; cur: number[] | null = null;
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); }
  save() { this.stack.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.font]); }
  restore() { const s = this.stack.pop(); if (s) [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.font] = s; }
  measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); return { width: t.length * (m ? +m[1] : 10) * 0.6 }; }
  beginPath() { this.subs = []; this.cur = null; }
  moveTo(x, y) { this.cur = [x, y]; this.subs.push(this.cur); }
  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.push(x, y); }
  closePath() { if (this.cur && this.cur.length >= 2) this.cur.push(this.cur[0], this.cur[1]); }
  arc(x, y, r, a0, a1) { this.ellipse(x, y, r, r, 0, a0, a1); }
  ellipse(x, y, rx, ry, rot, a0, a1) {
    const n = Math.max(12, Math.ceil(Math.max(rx, ry) * 1.5));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      const X = x + px * Math.cos(rot) - py * Math.sin(rot), Y = y + px * Math.sin(rot) + py * Math.cos(rot);
      if (i === 0 && !this.cur) this.moveTo(X, Y); else if (i === 0) this.lineTo(X, Y); else this.lineTo(X, Y);
    }
  }
  poly(pts: number[], col: string) {
    const [r, g, b, a0] = parseColor(col); const al = a0 * this.globalAlpha;
    const edges: number[][] = [];
    let minY = 1e9, maxY = -1e9;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      const x0 = pts[i], y0 = pts[i + 1], x1 = pts[j], y1 = pts[j + 1];
      if (y0 === y1) continue;
      edges.push([x0, y0, x1, y1]); minY = Math.min(minY, y0, y1); maxY = Math.max(maxY, y0, y1);
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const yc = y + 0.5; const xs: number[] = [];
      for (const [x0, y0, x1, y1] of edges) if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(this.w, Math.round(xs[k + 1])); x++) {
          const o = (y * this.w + x) * 4; const da = this.data[o + 3] / 255; const oa = al + da * (1 - al);
          if (oa <= 0) continue;
          this.data[o] = (r * al + this.data[o] * da * (1 - al)) / oa; this.data[o + 1] = (g * al + this.data[o + 1] * da * (1 - al)) / oa;
          this.data[o + 2] = (b * al + this.data[o + 2] * da * (1 - al)) / oa; this.data[o + 3] = oa * 255;
        }
      }
    }
  }
  fill() { for (const s of this.subs) if (s.length >= 6) this.poly(s, this.fillStyle); }
  stroke() {
    const hw = Math.max(0.5, this.lineWidth / 2);
    for (const s of this.subs) for (let i = 0; i + 3 < s.length; i += 2) {
      const x0 = s[i], y0 = s[i + 1], x1 = s[i + 2], y1 = s[i + 3]; const dx = x1 - x0, dy = y1 - y0; const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l * hw, ny = dx / l * hw;
      this.poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], this.strokeStyle);
    }
  }
  fillRect(x, y, w, h) { this.poly([x, y, x + w, y, x + w, y + h, x, y + h], this.fillStyle); }
  strokeRect(x, y, w, h) { this.beginPath(); this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.lineTo(x, y); this.stroke(); }
  fillText(t, x, y) { const w = this.measureText(t).width; const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const px = m ? +m[1] : 10;
    for (let i = 0; i < t.length; i++) if (t[i] !== ' ') this.fillRect(x - w / 2 + i * px * 0.6 + px * 0.1, y - px * 0.35, px * 0.4, px * 0.7); }
}

function png(w, h, data: Uint8ClampedArray, path: string, scale = 1) {
  const W = w * scale, Hh = h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * Hh);
  for (let y = 0; y < Hh; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const o = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4; const d = y * (W * 4 + 1) + 1 + x * 4;
      raw[d] = data[o]; raw[d + 1] = data[o + 1]; raw[d + 2] = data[o + 2]; raw[d + 3] = 255;
    }
  }
  const crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

function run(name: string, painter, w: number, h: number, variant = 0, seed = 5, scale = 1, tiles = 1) {
  const c = new Ctx2D(w, h), hc = new Ctx2D(w, h), rc = new Ctx2D(w, h);
  painter(c as any, w, h, new Rng(seed), variant, { height: hc as any, rough: rc as any, rng: new Rng(seed + 99) });
  // tile it 'tiles' x 'tiles' times
  const tw = w * tiles, th = h * tiles; const out = new Uint8ClampedArray(tw * th * 4);
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = ((ty * h + y) * tw + tx * w + x) * 4; for (let k = 0; k < 4; k++) out[d + k] = c.data[s + k];
  }
  png(tw, th, out, OUT + name + '.png', scale);
  const ho = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const v = hc.data[i * 4]; ho[i * 4] = ho[i * 4 + 1] = ho[i * 4 + 2] = v; ho[i * 4 + 3] = 255; }
  png(w, h, ho, OUT + name + '_h.png', scale);
}

it('render', () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const v of [0, 1]) { run('asphalt' + v, G.asphaltPainter, 512, 512, v); run('concrete' + v, G.concretePainter, 512, 512, v); run('bluestone' + v, G.bluestonePainter, 512, 512, v); run('manhole' + v, G.manholePainter, 256, 256, v, 5, 2); }
  run('granite', G.granitePainter, 256, 256, 0, 5, 2); run('grate', G.gratePainter, 256, 256, 0, 5, 2); run('crosswalk', G.crosswalkPainter, 256, 256, 0, 5, 2);
});
