/**
 * The swatches of the people map: the little rectangles the extra volumes sample (hair, hat, bag, the hood / coat-hem fabric,
 * the skirt fabric) and the shoe, which is a loft round the foot. They are painted pixel by pixel from (u, v), so they work at
 * 512 and at the 256 of the phone tier. Layout (see SK_RECTS in pedSkinPaint.ts, posted by the mesh lane):
 *   hair 256,0,128,64   hat 384,0,128,64   hood / coat fabric 256,64,64,64   skirt fabric 320,64,64,64   bag 384,64,128,64
 *   shoe 384,384,128,128: u round the cross-section (0 = middle of the sole, 0.5 = the top of the foot), v from the toe to the heel
 * Hair: v runs down the rect, light at the tips (top), dark at the roots (bottom). The right 16 texels of the bag are pure white
 * (a neutral texel the hair/accessory lane tints metal and frames with). No lettering, no logos.
 */
import { Px, g2, ln, sst, band, hash, vn2, mixc, mulc, rgb, type Look, type RGB } from './pedPaintShared';
import type { PxRect } from './pedSkinPaint';

type Fn = (u: number, v: number, o: Px) => void;
const px = new Px();
function fill(img: Uint8ClampedArray, size: number, r: PxRect, fn: Fn): void {
  const k = size / 512, x0 = Math.round(r.x * k), y0 = Math.round(r.y * k), w = Math.round(r.w * k), h = Math.round(r.h * k);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fn((x + 0.5) / w, (y + 0.5) / h, px);
    const i = ((y0 + y) * size + x0 + x) * 4;
    img[i] = px.r < 0 ? 0 : px.r > 255 ? 255 : px.r; img[i + 1] = px.g < 0 ? 0 : px.g > 255 ? 255 : px.g; img[i + 2] = px.b < 0 ? 0 : px.b > 255 ? 255 : px.b; img[i + 3] = 255;
  }
}
const offWhite = (c: RGB): RGB => [Math.min(c[0], 232), Math.min(c[1], 230), Math.min(c[2], 224)];
const hasHair = (h: string): boolean => h !== 'bald';

export function paintSwatches(img: Uint8ClampedArray, size: number, K: Look, R: Record<'hair' | 'hat' | 'gear' | 'torso' | 'pelvis' | 'shoe', PxRect>): void {
  const s = K.s, id = s.id, hair = K.hairC;
  const style = s.hair;
  const curly = style === 'afro' || style === 'puff' || style === 'curly' || style === 'peyot' || style === 'afroL';
  const plaited = style === 'braids' || style === 'locs' || style === 'twists' || style === 'cornrows' || style === 'boxbraids' || style === 'locsS';
  const grey = (hair[0] + hair[1] + hair[2]) / 3 > 150;
  // ---------------------------------------------------------------- hair
  fill(img, size, R.hair, (u, v, o) => {
    o.set(hair);
    const light = 0.5 + 0.5 * (1 - v);                       // roots (bottom) darker
    let m = 0.72 + 0.4 * light;
    if (curly) {
      const cu = vn2(u * 70, v * 36, 101), cu2 = vn2(u * 150 + 7, v * 76, 102);
      m *= 0.62 + 0.55 * cu + 0.25 * cu2;                    // clustered curls: dark pits, lit tops
    } else if (plaited) {
      const rope = 0.5 + 0.5 * Math.sin((u * 46 - v * 5.5) * Math.PI * 2), seg = Math.abs(((u * 23) % 1) - 0.5);
      m *= 0.62 + 0.5 * rope; m *= 1 - 0.3 * sst(0.44, 0.5, seg);                    // a plait / loc: diagonal rope between dark gaps
    } else {
      const st = vn2(u * 200, v * 5 + 3, 103), st2 = vn2(u * 420 + 4, v * 9, 104);
      m *= 0.62 + 0.5 * st + 0.2 * st2;
      if (style === 'waves' || style === 'wavy') m *= 0.92 + 0.14 * Math.sin((u * 18 + v * 3) * Math.PI * 2);
    }
    o.mul(m);
    if (grey) o.mix(mixc(hair, [255, 255, 255], 0.5), 0.3 * vn2(u * 160, v * 6, 105));
    o.lite(0.13 * g2(v - 0.38, 0.12) * (curly ? 0.6 : 1));            // a soft sheen band
    o.mul(1 - 0.28 * sst(0.7, 1.0, v));                                // root shadow
    if (!hasHair(style)) o.set(mixc(K.skin, hair, 0.25));
  });
  // ---------------------------------------------------------------- hat
  const hat = rgb(s.hatColor), hatTrim = rgb(s.hatTrim), hk = s.hat;
  fill(img, size, R.hat, (u, v, o) => {
    o.set(hat);
    const wv = 1 + 0.03 * Math.sin(u * 128 * 2.1) * Math.sin(v * 64 * 2.1) + 0.06 * (vn2(u * 40, v * 20, 111) - 0.5);
    o.mul(wv).mul(0.84 + 0.2 * (1 - v));
    if (hk === 'beanie') { o.mul(0.88 + 0.16 * (0.5 + 0.5 * Math.sin(u * 128 * Math.PI * 1.0))); if (v > 0.66) o.mix(mulc(hat, 0.9), 0.6).mul(0.9 + 0.2 * (0.5 + 0.5 * Math.sin(u * 128 * 1.6))); o.mul(1 - 0.25 * ln(v - 0.66, 0.03)); }
    else if (hk === 'cap' || hk === 'snapback' || hk === 'cop') {
      o.mul(1 - 0.28 * ln(((u * 6) % 1) - 0.5 + 0.5, 0.025) * 0 - 0.22 * ln(Math.abs(((u * 6) % 1) - 0.5) - 0.5, 0.03));
      o.mix(mulc(hat, 0.6), 0.4 * ln(Math.abs(((u * 6) % 1) - 0.0), 0.012));
      if (v > 0.88) o.mix(hatTrim, 0.95 * sst(0.88, 0.9, v) * sst(0.95, 0.93, v));
      if (hk === 'cop') o.mix([208, 182, 92], 0.95 * sst(0.1, 0.07, Math.hypot((u - 0.5) * 2.0, (v - 0.52) * 1.0)));
    } else if (hk === 'hardhat' || hk === 'helmet') {
      o.lite(0.2 * g2(v - 0.3, 0.1) * g2(u - 0.3, 0.2)).mul(1 - 0.18 * sst(0.8, 1, v));
      if (hk === 'helmet') o.mul(1 - 0.5 * sst(0.45, 0.5, Math.abs(((u * 7) % 1) - 0.5)) * band(0.3, 0.8, v, 0.03) * 0 - 0.4 * (band(0.1, 0.16, ((u * 6) % 1), 0.02) * band(0.25, 0.85, v, 0.03)));
      if (hk === 'hardhat') o.mul(1 - 0.18 * ln(((u * 3) % 1) - 0.5, 0.02));
    } else if (hk === 'fedora' || hk === 'church' || hk === 'flat') {
      o.mul(1 + 0.04 * Math.sin(u * 260) * 0.3).mul(1 - 0.12 * sst(0.8, 1, v));
      if (v > 0.74 && v < 0.88) o.mix(hatTrim, 0.85 * sst(0.74, 0.76, v) * sst(0.88, 0.86, v)).mul(1 - 0.2 * ln(v - 0.8, 0.03) * 0);
    } else if (hk === 'headwrap' || hk === 'durag' || hk === 'scarf') {
      const fold = 0.5 + 0.5 * Math.sin((u * 7 + v * 5 + 1.2 * vn2(u * 8, v * 8, 112)) * Math.PI * 2);
      o.mul(0.78 + 0.34 * fold); if (hk === 'headwrap') o.mix(hatTrim, 0.55 * sst(0.45, 0.55, 0.5 + 0.5 * Math.sin((u * 20 - v * 6) * Math.PI * 2)) * 0.7);
      if (hk === 'durag') o.lite(0.1 * g2(v - 0.4, 0.15));
    } else if (hk === 'kippah' || hk === 'kufi') {
      const r = 0.5 + 0.5 * Math.sin(Math.hypot((u - 0.5) * 4, (v - 0.5) * 2) * 40); o.mul(0.92 + 0.1 * r);
    } else if (hk === 'bucket' || hk === 'hood' || hk === 'hoodDown') {
      o.mul(1 - 0.2 * ln(((u * 4) % 1) - 0.5, 0.03));
    }
    if (hk === 'cap' || hk === 'fedora' || hk === 'church' || hk === 'cop') o.mul(1 - 0.0 * v);
  });
  // ---------------------------------------------------------------- bag: coated canvas, a stitched border, straps' colour; the right 16 texels are pure white
  const gear = rgb(s.gearColor);
  fill(img, size, R.gear, (u, v, o) => {
    if (u > 0.875) { o.set([255, 255, 255]); return; }
    o.set(gear).mul(1 + 0.03 * Math.sin(u * 128 * 2.3) * Math.sin(v * 64 * 2.3) + 0.1 * (vn2(u * 30, v * 16, 121) - 0.5)).mul(0.86 + 0.18 * (1 - v));
    const e = Math.min(u * 0.875 * 128, (0.875 - u) * 128, v * 64, (1 - v) * 64);
    o.mul(1 - 0.18 * ln(e - 4.5, 1.6)).mix(mulc(gear, 0.55), 0.35 * ln(e - 6, 1.1) * (Math.sin(u * 128 * 1.2) > -0.2 ? 1 : 0.3));
    o.mul(1 - 0.2 * ln(v - 0.5, 0.02) * 0);
  });
  // ---------------------------------------------------------------- the top's fabric (hood roll, coat hem) and the trousers' (skirt)
  const topC = K.topC, botC = K.botC;
  fill(img, size, R.torso, (u, v, o) => {
    o.set(topC).mul((K.k === 'hoodie' ? 1.06 : 0.98) + 0.08 * (vn2(u * 20, v * 20, 131) - 0.5) + 0.02 * Math.sin(u * 64 * 2.2)).mul(0.9 + 0.12 * (1 - v));
    if (K.k === 'puffer') { const ph = (v * 4) % 1; o.mul(0.8 + 0.26 * Math.sin(ph * Math.PI)).mul(1 - 0.3 * (g2(ph * 0.25, 0.012) + g2((1 - ph) * 0.25, 0.012))); }
    if (K.k === 'hoodie') o.mul(0.9 + 0.14 * (0.5 + 0.5 * Math.sin(u * 64 * 0.9)));
    if (v > 0.9) o.mul(1 - 0.12 * sst(0.9, 1.0, v));
  });
  fill(img, size, R.pelvis, (u, v, o) => {
    o.set(botC).mul(0.9 + 0.1 * (vn2(u * 18, v * 18, 141) - 0.5));
    const pl = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 9 + 0.7 * vn2(u * 6, v * 6, 142)), dp = K.bot.kind === 'skirt';
    o.mul(dp ? 0.8 + 0.28 * pl : 0.9).mul(1 - 0.16 * g2(v - 0.04, 0.03));
    if (v > 0.9) o.mul(1 - 0.18 * ln(v - 0.92, 0.02)).mul(1 - 0.1 * sst(0.9, 1.0, v));
  });
  // ---------------------------------------------------------------- the shoe
  shoeSwatch(img, size, K, R.shoe);
}

function shoeSwatch(img: Uint8ClampedArray, size: number, K: Look, r: PxRect): void {
  const sh = K.s.shoes, up = offWhite(rgb(sh.color)), so = offWhite(rgb(sh.sole)), ac = rgb(sh.accent), style = K.shoeStyle;
  const upper = style === 'sneaker' ? up : up;
  const welt = style === 'boot' ? 0.2 : style === 'dress' ? 0.1 : 0.15;
  const midsole = style === 'sneaker' ? mixc(so, [232, 228, 218], 0.4) : so;
  const tread = style === 'sneaker' ? mulc(so, 0.55) : mulc(so, 0.6);
  fill(img, size, r, (u, v, o) => {
    const s = Math.min(u, 1 - u) * 2;                                    // 0 at the middle of the sole .. 1 at the top of the foot
    const grain = 1 + 0.04 * (vn2(u * 50, v * 60, 151) - 0.5);
    // ---- outsole, midsole, upper
    if (s < 0.1) { o.set(tread).mul(0.9 + 0.1 * Math.sin(v * 128 * 0.7) * Math.sin(s * 40)).mul(grain); return; }
    if (s < welt + 0.1) {
      const tt = (s - 0.1) / welt;
      o.set(midsole).mul(grain).mul(0.92 + 0.12 * tt);
      if (style === 'sneaker') o.mul(1 - 0.12 * ln(tt - 0.5, 0.1) * 0 - 0.18 * g2(tt - 0.15, 0.06)).lite(0.1 * g2(tt - 0.7, 0.12));
      if (style === 'boot') o.mul(1 - 0.25 * (0.5 + 0.5 * Math.sin(v * 128 * 0.9)) * sst(0.5, 0.0, tt) * 0 - 0.22 * ln(tt - 0.25, 0.1));
      if (style === 'dress') o.mix([156, 120, 82], 0.0);
      return;
    }
    const a = (s - welt - 0.1) / (1 - welt - 0.1);                       // 0 at the sole edge .. 1 across the instep
    o.set(upper).mul(grain);
    const base = 0.86 + 0.18 * a;
    o.mul(base);
    // toe cap
    const toe = v < 0.2 + 0.1 * (1 - a);
    if (style === 'sneaker') {
      if (toe) o.mix(mixc(upper, [240, 236, 226], 0.2), 0.6).mul(1 + 0.0);
      o.mul(1 - 0.22 * ln(v - (0.2 + 0.1 * (1 - a)), 0.012) - 0.0);
      // perforations on the toe box
      if (v < 0.17 && a > 0.3 && Math.sin(u * 128 * 0.9) * Math.sin(v * 128 * 1.1) > 0.8) o.mul(0.82);
      // side panel
      const panel = band(0.3, 0.72, v, 0.012) * band(0.12, 0.62, a, 0.03) * (1 - 0.5 * sst(0.6, 0.7, v));
      o.mix(ac, 0.9 * panel * (1 - 0.0)).mul(1 - 0.12 * ln(v - 0.3, 0.01) * band(0.12, 0.62, a, 0.03) * 0);
      // laces over the instep: bars across, eyelets either side
      if (a > 0.78 && v > 0.26 && v < 0.62) {
        const tw = (v - 0.26) / 0.36 * 7, ph = tw - Math.floor(tw), bar = sst(0.38, 0.5, ph) * sst(0.68, 0.56, ph);
        o.mix(mixc([232, 230, 222], upper, 0.1), 0.92 * bar).mul(1 - 0.2 * (1 - bar) * sst(0.88, 1.0, a));
        o.mul(1 - 0.5 * g2(Math.hypot((a - 0.8) * 8, (ph - 0.5) * 3), 0.5) * 0);
      }
      if (a > 0.7 && a < 0.8 && v > 0.26 && v < 0.62) { const tw = (v - 0.26) / 0.36 * 7, ph = tw - Math.floor(tw); o.mul(1 - 0.5 * g2((ph - 0.5), 0.12) * band(0.72, 0.78, a, 0.01)); }
      // the tongue top, the padded collar and the heel counter
      if (v > 0.62 && v < 0.75 && a > 0.82) o.mul(0.78 + 0.2 * (v - 0.62) / 0.13);
      if (v > 0.74) o.mix(mulc(upper, 0.82), 0.85 * sst(0.74, 0.76, v)).mul(1 - 0.18 * ln(v - 0.745, 0.01) * sst(0.1, 0.3, a));
      if (v > 0.9 && a > 0.55) o.mul(0.7 + 0.3 * (1 - sst(0.9, 1.0, v))).mul(1 - 0.25 * ln(v - 0.93, 0.02));
      // stitching along the sole
      o.mix(mulc(upper, 0.62), 0.5 * ln(a - 0.015, 0.012) * (Math.sin(v * 128 * 1.6) > 0 ? 1 : 0.25));
    } else if (style === 'boot') {
      // leather: creases at the flex point, a stitched toe cap, hooks and laces
      o.mul(1 + 0.08 * (vn2(u * 28, v * 40, 152) - 0.5));
      o.mul(1 - 0.18 * Math.max(0, Math.sin(v * 128 * 0.55 + a * 3)) * g2(v - 0.36, 0.07) - 0.24 * ln(v - 0.24, 0.012));
      o.lite(0.14 * g2(a - 0.55, 0.12) * g2(v - 0.4, 0.3));
      if (v < 0.24) o.mix(mulc(upper, 0.9), 0.4);
      o.mix(mulc(upper, 0.55), 0.45 * ln(v - 0.226, 0.01) * (Math.sin(u * 128 * 1.4) > 0 ? 1 : 0.2));
      if (a > 0.72 && v > 0.26 && v < 0.84) {
        const tw = (v - 0.26) / 0.58 * 8, ph = tw - Math.floor(tw), bar = sst(0.4, 0.5, ph) * sst(0.62, 0.52, ph);
        o.mix([218, 208, 188], 0.85 * bar).mul(1 - 0.35 * g2(a - 0.74, 0.02) * sst(0.1, 0.6, ph) * sst(0.9, 0.5, ph));
        o.mix(BRASS_B, 0.8 * g2(Math.hypot((a - 0.74) * 5, (ph - 0.5) * 2.2), 0.28));
      }
      if (v > 0.86) o.mul(0.7 + 0.3 * (1 - sst(0.86, 1.0, v)));
      if (v > 0.74 && v <= 0.86) o.mul(1 - 0.12 * ln(v - 0.74, 0.02));
    } else {
      // dress shoe: a glossy toe, welt stitch, a seam arc over the toe and a streak of light along the side
      o.mul(1 + 0.03 * (vn2(u * 30, v * 40, 153) - 0.5));
      o.lite(0.26 * g2(a - 0.55, 0.1) * g2(v - 0.38, 0.28)).lite(0.12 * g2(a - 0.9, 0.06) * g2(v - 0.3, 0.2));
      o.mul(1 - 0.22 * ln(v - (0.28 - 0.08 * a), 0.012));
      o.mix(mulc(upper, 0.5), 0.35 * ln(a - 0.02, 0.012) * (Math.sin(v * 128 * 1.7) > 0 ? 1 : 0.2));
      if (a > 0.76 && v > 0.4 && v < 0.7) { const tw = (v - 0.4) / 0.3 * 4, ph = tw - Math.floor(tw); o.mix(mulc(upper, 0.5), 0.6 * g2(Math.hypot((a - 0.8) * 5, (ph - 0.5) * 2), 0.3)); o.mix(mixc(upper, [190, 190, 190], 0.5), 0.5 * band(0.4, 0.7, v, 0.01) * ln(a - 0.95, 0.03) * 0); }
      if (v > 0.9) o.mul(0.7 + 0.3 * (1 - sst(0.9, 1.0, v)));
    }
  });
}
const BRASS_B: RGB = [176, 150, 98];
void hash;
