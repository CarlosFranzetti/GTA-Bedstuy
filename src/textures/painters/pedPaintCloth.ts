/**
 * The body of the people painter: skin (neck, hands with knuckles and nails, arms, legs), real garments with seams, plackets,
 * zips, pockets, ribbed cuffs and hems, belts, denim twill and fades, quilted channels, plaid that follows the body, folds
 * where cloth bends and soft shading under the arms and between the legs. Layers: skin, shoe (the part of the foot the skin
 * mesh keeps), trousers, top, each with a soft edge. Fabric texture is low-contrast weave and mottling, never per-texel noise.
 * No letters, logos or brand marks anywhere: the "badge" is a plain plate, a hi-vis band is a plain reflective strip.
 */
import { Px, g2, ln, sst, band, hash, vn2, rnd, mixc, mulc, type Look, type Tex, type RGB } from './pedPaintShared';

const TAU = Math.PI * 2;
const METAL: RGB = [196, 192, 184], BRASS: RGB = [182, 150, 84], GOLD_STITCH: RGB = [196, 156, 84], SILVER: RGB = [188, 194, 200];
const LIGHT = { x: 0.35, y: 0.75, z: -0.55 };

// ------------------------------------------------------------------------------------------------ limb axes
const ax3 = [0, 0, 0];
/** centre line of a limb at height y: from p0 down through p1 to p2 (x taken as |x|); writes [x, z] into out */
function axisAt(p0: number[], p1: number[], p2: number[], y: number, out: number[]): void {
  const a = y > p1[1] ? p0 : p1, b = y > p1[1] ? p1 : p2, t = Math.min(1.15, Math.max(-0.15, (a[1] - y) / (a[1] - b[1] || 1e-6)));
  out[0] = Math.abs(a[0]) + (Math.abs(b[0]) - Math.abs(a[0])) * t; out[1] = a[2] + (b[2] - a[2]) * t;
}
/** the angle round a limb: 0 on the front (-z), +90 degrees outward, -90 degrees inward, 180 degrees behind */
function limbPhi(K: Look, t: Tex, arm: boolean): number {
  const R = K.R;
  if (arm) axisAt(R.shoulderL, R.elbowL, R.wristL, t.y, ax3); else axisAt(R.hipL, R.kneeL, [R.kneeL[0], K.anY, R.kneeL[2]], t.y, ax3);
  return Math.atan2(Math.abs(t.x) - ax3[0], -(t.z - ax3[1]));
}

// ------------------------------------------------------------------------------------------------ fabrics
function weave(K: Look, U: number, y: number, c: Px, t: Tex): void {
  switch (K.fabric) {
    case 'jersey': c.mul(1 + 0.022 * Math.sin(U * 560) + 0.05 * (vn2(U * 60, y * 60, 41) - 0.5)); break;
    case 'fleece': c.mul(1 + 0.06 * (vn2(U * 36, y * 36, 42) - 0.5) + 0.025 * (vn2(U * 110, y * 110, 43) - 0.5)); break;
    case 'knit': { const col = Math.sin(U * 520), row = Math.sin(y * 560 + (col > 0 ? 1.3 : 0)); c.mul(1 + 0.05 * col + 0.035 * row + 0.05 * (vn2(U * 50, y * 50, 44) - 0.5)); break; }
    case 'denim': c.mul(1 + 0.03 * Math.sin((U + y) * 700) + 0.09 * (vn2(U * 40, y * 90, 45) - 0.5)); break;
    case 'leather': c.mul(1 + 0.07 * (vn2(U * 26, y * 26, 46) - 0.5)).lite(0.16 * sst(0.55, 0.95, t.ny) + 0.06 * sst(0.2, 0.9, -t.nz * 0.7 + t.nx * 0.4)); break;
    case 'wool': c.mul(1 + 0.03 * Math.sin((U - y) * 520) + 0.07 * (vn2(U * 55, y * 55, 47) - 0.5)); break;
    case 'nylon': c.mul(1 + 0.04 * (vn2(U * 40, y * 40, 48) - 0.5)).lite(0.1 * sst(0.6, 0.95, t.ny)); break;
    case 'canvas': c.mul(1 + 0.028 * Math.sin(U * 640) * Math.sin(y * 640) + 0.09 * (vn2(U * 45, y * 45, 49) - 0.5)); break;
    case 'poplin': c.mul(1 + 0.014 * Math.sin(U * 700) + 0.05 * (vn2(U * 45, y * 45, 50) - 0.5)); break;
    case 'tricot': c.mul(1 + 0.02 * Math.sin(y * 480) + 0.04 * (vn2(U * 40, y * 40, 51) - 0.5)).lite(0.1 * sst(0.5, 0.95, t.ny)); break;
    case 'mesh': c.mul(1 + 0.03 * Math.sin(U * 560) * Math.sin(y * 560) + 0.04 * (vn2(U * 40, y * 40, 52) - 0.5)); break;
  }
}

// ------------------------------------------------------------------------------------------------ skin below the head
export function paintSkinBody(K: Look, t: Tex, o: Px, hand: boolean, leg: boolean, arm: boolean): void {
  const { lm } = K, y = t.y, ax = Math.abs(t.x), side = t.x < 0 ? -1 : 1;
  o.set(K.skin).mul(1 + 0.05 * (vn2(t.x * 55, y * 55, 61 + (t.z > 0 ? 1 : 0)) - 0.5));
  o.mix(K.skinWarm, 0.08 * vn2(t.x * 24, y * 24, 62));
  const form = 0.92 + 0.12 * (t.nx * LIGHT.x + t.ny * LIGHT.y + t.nz * LIGHT.z);
  // neck: shaded under the jaw, a pale throat, the line of the muscle to the collarbone
  if (!arm && !leg) {
    o.tint(K.skinSh, 0.38 * sst(lm.chinY - 0.05, lm.chinY + 0.0, y) * sst(-0.4, 0.5, -t.nz + 0.2));
    o.tint(K.skinSh, 0.07 * g2(ax - 0.028, 0.012) * sst(lm.chinY - 0.01, lm.chinY - 0.07, y));
    o.mix(K.skinHi, 0.1 * g2(ax, 0.011) * g2(y - (lm.chinY - 0.04), 0.012) * (K.s.sex === 'f' ? 0.4 : 1));
    if (K.old) o.tint(K.skinSh, 0.12 * Math.max(0, Math.sin(y * 420 + vn2(t.x * 40, 1, 63) * 3)) * sst(lm.chinY - 0.012, lm.chinY - 0.04, y));
  }
  if (arm) {
    const e = K.elY;
    o.mix(K.skinWarm, 0.22 * g2(y - e, 0.03));                                                                      // reddish at the elbow
    o.tint(K.skinSh, 0.1 * g2(y - e - 0.005, 0.008) * sst(0.0, 0.7, -t.nz));
    if (!K.female && !hand && K.s.sex !== 'x') o.mix(mulc(K.hairC, 0.9), 0.1 * (vn2(t.x * 300, y * 120, 64) > 0.62 ? 1 : 0) * sst(K.shY - 0.1, K.elY, y));          // forearm hair
    if (!hand) o.tint(K.skinSh, 0.12 * sst(K.wrY + 0.01, K.wrY - 0.01, y) * g2(ax - 0, 5));
  }
  if (leg) {
    o.mix(K.skinWarm, 0.18 * g2(y - K.knY, 0.04));
    o.mix(K.skinHi, 0.08 * g2(ax - (Math.abs(K.R.kneeL[0])), 0.02) * sst(0.0, 0.6, -t.nz) * sst(K.knY - 0.25, K.knY - 0.05, y));      // shin
    if (K.s.sex === 'm' && K.bot.kind === 'shorts') o.mix(mulc(K.hairC, 0.9), 0.1 * (vn2(t.x * 300, y * 120, 65) > 0.55 ? 1 : 0));
    // ankle socks: off-white with a rib band
    if (y < K.shoeTop + 0.04 && y > K.shoeTop - 0.02) {
      const sock = mixc([226, 224, 218], K.topC, 0.0), rib = 0.5 + 0.5 * Math.sin(t.x * 600 + t.z * 600);
      o.mix(mulc(sock, 0.93 + 0.07 * rib), 0.95 * sst(K.shoeTop - 0.02, K.shoeTop - 0.008, y)).mix(mulc(sock, 0.78), 0.4 * g2(y - (K.shoeTop + 0.034), 0.004));
    }
  }
  if (hand) {
    const w = K.handAxis === 0 ? t.x * side : t.z, tip = K.handTipY, len = Math.max(0.05, K.wrY - tip), v = (y - tip) / len;   // v 0 at the finger tips, 1 at the wrist
    const back = (K.handAxis === 0 ? t.nz : t.nx * side) < 0;
    o.mix(K.skinWarm, 0.14 * sst(0.55, 0.0, v));
    // knuckles, finger gaps, nails
    if (v < 0.62 && v > 0.0) {
      const gap = Math.max(0, Math.sin(w * 380 + 0.5));
      o.tint(K.skinSh, (back ? 0.2 : 0.12) * gap * sst(0.55, 0.05, v));
      if (back) {
        o.tint(K.skinSh, 0.18 * g2(v - 0.46, 0.035) * (0.6 + 0.4 * Math.sin(w * 380 + 0.5 + 1.57)));                // knuckle ridge
        o.mix(K.skinHi, 0.1 * g2(v - 0.5, 0.03));
        const nail = sst(0.12, 0.05, v) * sst(0.0, 0.03, v) * (1 - sst(0.35, 0.8, gap));
        o.mix(mixc(K.skin, [236, 206, 196], 0.45), 0.55 * nail).tint(K.skinSh, 0.08 * ln(v - 0.115, 0.012));
      } else {
        o.tint(K.skinSh, 0.12 * g2(v - 0.3, 0.015) + 0.12 * g2(v - 0.5, 0.015));                                       // palm creases
        o.mix(mixc(K.skin, [226, 150, 130], 0.4), 0.18 * sst(0.7, 0.3, v));
      }
    }
    if (K.old && back) o.mix([142, 96, 70], 0.18 * (vn2(t.x * 220, y * 220, 66) > 0.78 ? 1 : 0));                       // age spots
    o.tint(K.skinSh, 0.13 * g2(y - K.wrY + 0.004, 0.005));                                                              // wrist crease
  }
  o.mul(form).mul(1 + 0.014 * (rnd(t.q) - 0.5));
}

// ------------------------------------------------------------------------------------------------ the foot the skin keeps (a sock and the shoe's top edge)
export function paintShoeSkin(K: Look, t: Tex, o: Px): void {
  const { s } = K, y = t.y, sh = rgbS(s.shoes.color), so = rgbS(s.shoes.sole), toe = sst(-0.115, -0.15, t.z);
  const c = o.set(sh);
  c.mul(0.9 + 0.1 * t.ny).mix(mulc(sh, 0.8), 0.45 * sst(K.anY - 0.01, K.anY - 0.05, y));
  c.lite(0.07 * toe * sst(0.06, 0.02, y));
  if (y < 0.028 + 0.004 * Math.sin(t.z * 90) || t.ny < -0.55) { c.set(so).mul(0.95 + 0.05 * Math.sin(t.z * 200)); return; }
  if (y < 0.04) c.mix(so, 0.75);
  c.mul(1 + 0.012 * (rnd(t.q) - 0.5));
}
const rgbS = (h: string): RGB => rgbOf(h);
import { rgb as rgbOf } from './pedPaintShared';

// ------------------------------------------------------------------------------------------------ trousers, jeans, shorts, leggings, sweats, cargo
export function paintBottom(K: Look, t: Tex, c: Px, leg: boolean): void {
  const { bot } = K, x = t.x, y = t.y, ax = Math.abs(x), side = x < 0 ? -1 : 1, kind = bot.kind;
  const phi = leg ? limbPhi(K, t, false) : Math.atan2(x, -(t.z - K.torsoZ));
  const U = phi * (leg ? 0.075 : 0.17);
  c.set(K.botC);
  const denim = kind === 'jeans';
  // fabric
  if (denim) {
    c.mul(1 + 0.03 * Math.sin((U + y) * 760) + 0.1 * (vn2(U * 38, y * 90, 71) - 0.5));
    // fades: thighs, knees, a lighter seat and whiskers at the crotch, honeycomb behind the knee
    const fade = 0.2 * g2(y - (K.knY + 0.16), 0.085) * sst(1.9, 0.4, Math.abs(phi)) + 0.16 * g2(y - K.knY, 0.04) * sst(1.2, 0.0, Math.abs(phi)) + 0.1 * g2(y - (K.hipY - 0.1), 0.05) * (leg ? 1 : 0);
    c.mix([180, 198, 222], Math.min(0.3, fade * (0.85 + 0.3 * vn2(U * 30, y * 30, 72))));
    if (leg) {
      const wh = 0.07 * Math.max(0, Math.sin((y - K.hipY + 0.1) * 90 - (ax * 20))) * g2(y - (K.hipY - 0.08), 0.06) * sst(1.5, 0.3, Math.abs(phi));
      c.lite(wh * 0.6);
      c.mul(1 - 0.12 * Math.max(0, Math.sin(y * 260 + phi * 3)) * g2(y - K.knY + 0.03, 0.03) * sst(2.4, 3.1, Math.abs(phi)));       // honeycomb behind the knee
    }
  } else if (kind === 'trousers') {
    c.mul(1 + 0.03 * Math.sin((U - y) * 640) + 0.06 * (vn2(U * 50, y * 50, 73) - 0.5));
    if (leg) c.mul(1 - 0.2 * g2(Math.abs(phi) - 0.0, 0.035) * sst(K.hipY - 0.05, K.hipY - 0.3, y) * sst(K.anY + 0.02, K.anY + 0.1, y)).lite(0.05 * g2(Math.abs(phi) - 0.1, 0.04));   // front crease
  } else if (kind === 'cargo') {
    c.mul(1 + 0.035 * Math.sin(U * 650) * Math.sin(y * 650) + 0.1 * (vn2(U * 42, y * 42, 74) - 0.5));
  } else if (kind === 'leggings') {
    c.mul(1 + 0.015 * Math.sin(y * 500)).lite(0.12 * sst(0.4, 0.95, t.ny * 0.5 + (-t.nz) * 0.6 + 0.3 * t.nx * side));
  } else if (kind === 'sweats') {
    c.mul(1 + 0.08 * (vn2(U * 46, y * 46, 75) - 0.5) + 0.02 * Math.sin(y * 560));
  } else if (kind === 'shorts') {
    c.mul(1 + 0.03 * Math.sin((U + y) * 600) + 0.07 * (vn2(U * 48, y * 48, 76) - 0.5));
  } else {
    c.mul(1 + 0.04 * (vn2(U * 40, y * 40, 77) - 0.5));       // skirt
  }
  const stitch = (d: number, w: number, s: number): number => ln(d, w) * (0.45 + 0.55 * sst(0.1, 0.5, Math.sin(s * 520)));
  if (leg) {
    const outer = Math.abs(phi - 1.5708), inner = Math.abs(phi + 1.5708);
    // outseam and inseam
    const seamK = (denim ? 0.1 : 0.06) + (kind === 'leggings' ? 0.02 : 0);
    c.mul(1 - seamK * ln(outer * 0.075, 0.004)).mul(1 - 0.07 * ln(inner * 0.075, 0.003));
    if (denim) { c.mix(GOLD_STITCH, 0.55 * stitch(outer * 0.075 - 0.0055, 0.0018, y) + 0.55 * stitch(outer * 0.075 + 0.0055, 0.0018, y)); }
    if (kind === 'sweats' || kind === 'leggings') { }
    // cuff or hem
    const hemY = kind === 'shorts' ? K.knY + 0.09 : K.anY + 0.015, d = y - hemY;
    if (kind === 'sweats' || kind === 'cargo' && false) {
      if (d < 0.1) { const rib = 0.5 + 0.5 * Math.sin(U * 520); c.mix(K.botTrim, 0.85 * sst(0.095, 0.07, d)); c.mul(0.9 + 0.12 * rib * sst(0.095, 0.07, d)); }
      c.mul(1 - 0.16 * g2(d - 0.108, 0.01) * (kind === 'sweats' ? 1 : 0));
    } else if (d < 0.07) {
      c.mul(1 - 0.1 * ln(d - 0.03, 0.004)).mix(GOLD_STITCH, denim ? 0.3 * ln(d - 0.027, 0.0015) : 0);                       // turned hem with a stitch line
      c.mul(1 - 0.18 * g2(d + 0.01, 0.02));                                                                                // dark where it meets the shoe
      if (kind !== 'shorts') c.mul(1 - 0.12 * Math.max(0, Math.sin(d * 240 + phi * 2)) * sst(0.07, 0.0, d));                // a little bunching above the shoe
    }
    if (kind === 'shorts' && d < 0.05) c.mul(1 - 0.12 * ln(d - 0.025, 0.004));
    if (kind === 'sweats') c.mix(K.botTrim, 0.5 * sst(0.8, 0.9, Math.abs(Math.cos(phi - 1.5708) * 1.0 === 0 ? 0 : Math.abs(Math.sin(phi)))) * 0);
    if (kind === 'sweats' && Math.abs(Math.sin(phi)) > 0.97 && phi > 0) c.mix(K.botTrim, 0.5 * sst(0.97, 0.995, Math.abs(Math.sin(phi))));          // a side stripe
    if (kind === 'cargo') {
      // thigh pockets: flap with stitch and a button, on the outer side
      const py = K.knY + 0.2, inP = sst(0.55, 0.4, Math.abs(phi - 1.1)) * band(py - 0.075, py + 0.075, y, 0.004);
      c.mul(1 - 0.1 * inP);
      c.mul(1 - 0.22 * ln(y - (py + 0.012), 0.004) * sst(0.6, 0.3, Math.abs(phi - 1.1))).mix(GOLD_STITCH, 0.25 * stitch(y - (py + 0.03), 0.0015, phi) * sst(0.5, 0.3, Math.abs(phi - 1.1)));
      c.mix(METAL, 0.8 * g2(Math.hypot((phi - 1.1) * 0.075, y - (py + 0.012)), 0.004));
    }
    // knees: soft folds and the front kneecap bunch
    c.mul(1 - 0.12 * Math.max(0, Math.sin((y - K.knY) * 190 + phi * 2)) * g2(y - K.knY, 0.05) * sst(1.4, 0.4, Math.abs(phi)) * (denim || kind === 'trousers' || kind === 'sweats' ? 1 : 0.5));
    c.mul(1 - 0.28 * g2(y - (K.knY - 0.012), 0.009) * sst(2.3, 3.0, Math.abs(phi)));                                          // back of the knee crease
    // upper leg: a hip fold and the crotch shadow
    c.mul(1 - 0.18 * g2(y - (K.hipY - 0.06), 0.035) * sst(-0.2, -1.4, phi)).mul(1 - 0.34 * g2(y - (K.hipY - 0.08), 0.06) * sst(0.2, 0.0, ax - Math.abs(K.hipX) + 0.09) * sst(-0.5, -1.5, phi));
    if (kind !== 'skirt') { c.mul(1 - 0.2 * g2(y - (K.hipY - 0.1), 0.05) * sst(-0.9, -1.55, phi)); }
    // wear: dirt creeping up from the hem, and a worn knee
    c.mix([84, 74, 62], K.grime * 0.34 * sst(K.anY + 0.28, K.anY, y) * (0.4 + 0.8 * vn2(U * 30, y * 30, 78)) * (kind === 'leggings' ? 0.2 : 1));
  } else {
    // waist and hips (the part of the trousers the top does not cover)
    const wy = K.hemTop - 0.012;
    if (kind === 'skirt') { c.mul(1 + 0.03 * Math.sin(phi * 40)); return; }
    const beltOn = kind === 'jeans' || kind === 'trousers' || kind === 'cargo' || kind === 'shorts';
    const fr = sst(-0.045, -0.11, t.z);
    if (beltOn) {
      const bandD = y - wy;
      if (Math.abs(bandD) < 0.02 && kind !== 'jeans' || (kind === 'jeans' && bandD < 0.012 && bandD > -0.032)) {
        // belt: leather, stitched edges, a metal buckle at the front, loops
        const bc: RGB = kind === 'trousers' ? [38, 28, 22] : [66, 46, 30];
        const inBelt = sst(0.016, 0.01, Math.abs(bandD + (kind === 'jeans' ? 0.01 : 0)));
        if (kind === 'jeans') {
          c.mix(mulc(K.botC, 0.9), 0.5 * sst(-0.034, -0.03, bandD) * sst(0.014, 0.01, bandD)).mul(1 - 0.18 * ln(bandD - 0.0, 0.003));
          // belt loops: little vertical straps
          const lp = Math.abs(((phi + 6.2832) % 1.0472) - 0.5236);
          if (bandD > -0.034 && bandD < 0.014 && lp < 0.03 && Math.abs(phi) > 0.2) c.mul(0.84).mix(GOLD_STITCH, 0.2 * ln(Math.abs(bandD + 0.01) - 0.012, 0.0015));
          c.mix(METAL, 0.9 * g2(Math.hypot(ax * 1.0, (y - (wy - 0.012)) * 1.2), 0.0058) * fr);                                 // jeans button
        } else {
          c.mix(bc, 0.95 * inBelt).mul(1 + 0.18 * ln(bandD + 0.008, 0.006)).mix([150, 124, 92], 0.25 * stitch(Math.abs(bandD) - 0.012, 0.0011, phi) * inBelt);
          const buck = sst(0.019, 0.016, ax) * sst(0.016, 0.012, Math.abs(bandD)) * fr, hole = sst(0.012, 0.0095, ax) * sst(0.0075, 0.0048, Math.abs(bandD));
          c.mix(METAL, 0.95 * buck).mix(bc, 0.9 * hole);
        }
      } else if (y < wy - 0.04 && fr > 0.2 && ax < 0.17) {
        // fly and pockets on the front, back pockets behind
        if (kind === 'jeans' || kind === 'trousers' || kind === 'cargo' || kind === 'shorts') {
          c.mul(1 - 0.12 * ln(ax - 0.0, 0.0028) * sst(wy - 0.04, wy - 0.12, y));                                                  // fly line
          if (denim) c.mix(GOLD_STITCH, 0.5 * stitch(ax - 0.0095, 0.0013, y) * sst(wy - 0.035, wy - 0.045, y) * sst(wy - 0.12, wy - 0.1, y) * sst(0.0, 0.0001, 1));
          const pe = 0.068 + 0.55 * Math.max(0, wy - 0.012 - y) * (kind === 'trousers' ? 0.6 : 1);
          if (y > wy - 0.15) { c.mul(1 - 0.16 * ln(ax - pe, 0.0035)); if (denim) c.mix(GOLD_STITCH, 0.45 * stitch(ax - pe - 0.006, 0.0013, y)); }
          c.mix(METAL, 0.7 * g2(Math.hypot(ax - 0.069, y - (wy - 0.026)), 0.004) * (denim ? 1 : 0));                              // rivet
        }
      } else if (fr < 0.2 && y < wy - 0.012 && Math.abs(phi) > 2.2 && ax < 0.16) {
        // back pockets: two stitched patches, or welts on trousers
        const pcx = 0.078, pt = wy - 0.04, pb = wy - 0.125;
        if (kind === 'trousers') c.mul(1 - 0.35 * ln(y - (wy - 0.05), 0.0028) * sst(0.035, 0.03, Math.abs(ax - pcx))).mul(1 - 0.06 * band(-0.03, 0.03, ax - pcx, 0.004));
        else {
          const inside = band(pcx - 0.034, pcx + 0.034, ax, 0.003) * band(pb + 0.012 * Math.abs(ax - pcx) / 0.034 * 0, pt, y, 0.003);
          const edgeD = Math.min(ax - (pcx - 0.034), (pcx + 0.034) - ax, y - pb - 0.012 * (1 - Math.abs(ax - pcx) / 0.034), pt - y);
          c.mul(1 - 0.06 * inside).mix(denim ? GOLD_STITCH : mulc(K.botC, 0.7), 0.5 * ln(edgeD - 0.003, 0.0014) * inside * (denim ? 1 : 0.8));
        }
      }
    }
    if (kind === 'sweats' && y > K.hemTop - 0.04) {
      // elastic waist with a drawstring and its knot
      c.mix(K.botTrim, 0.4 * sst(K.hemTop - 0.045, K.hemTop - 0.02, y)).mul(1 - 0.12 * ln(y - (K.hemTop - 0.03), 0.004));
      c.mix([226, 222, 210], 0.85 * g2(Math.hypot(ax - 0.014, (y - (K.hemTop - 0.03)) * 1.2), 0.0055) * fr);
    }
    // crotch and seat: shadow between the legs, soft folds at the hip
    c.mul(1 - 0.2 * g2(ax, 0.03) * sst(K.hipY - 0.02, K.hipY - 0.1, y));
    c.mul(1 - 0.1 * g2(y - (K.hipY + 0.02), 0.05) * sst(0.1, 0.17, ax));
  }
  c.mul(0.93 + 0.1 * (t.nx * LIGHT.x + t.ny * LIGHT.y + t.nz * LIGHT.z));
  c.mul(1 + 0.012 * (rnd(t.q) - 0.5));
}

// ------------------------------------------------------------------------------------------------ tops
/** the garment on the body; `arm` selects the sleeve (its colour may differ: a vest shows the shirt on the arms), `leg` the hem over the thighs */
export function paintTop(K: Look, t: Tex, c: Px, arm: boolean, leg: boolean, neckY: number, fr0: number): void {
  const { top, k } = K, x = t.x, y = t.y, ax = Math.abs(x), side = x < 0 ? -1 : 1;
  const tor = !arm && !leg, sleeves = top.sleeves, hemTop = K.hemTop, shY = K.shY, elY = K.elY, wrY = K.wrY, shX = K.shX;
  const phi = arm ? limbPhi(K, t, true) : leg ? limbPhi(K, t, false) : Math.atan2(x, -(t.z - K.torsoZ));
  const rad = arm ? 0.045 : leg ? 0.075 : 0.17, U = phi * rad;
  const outerArms = k === 'vest' || k === 'apron' ? K.underC : K.topC;
  const sleeveEnd = sleeves === 'short' ? elY + (shY - elY) * 0.42 : sleeves === 'long' ? wrY + 0.012 : k === 'jersey' ? shY - 0.05 : 9;
  const front = fr0;
  const fabric = (arm ? (outerArms ?? K.topC) : K.topC);
  const trimC = K.trimC, open = K.open, underC = K.underC;
  const zipped = !open && (k === 'hoodie' || k === 'jacket' && top.zip || k === 'puffer' || k === 'tracksuit' || k === 'cardigan' && false);
  c.set(fabric);
  weave(K, U, y, c, t);
  // ------------------------------------------------------------ patterns that follow the body
  const p = top.pattern ?? 'none';
  if (p === 'plaid') {
    const a = 0.5 + 0.5 * Math.cos(U * TAU / 0.05), b2 = 0.5 + 0.5 * Math.cos(y * TAU / 0.05);
    c.mix(trimC, 0.32 * a * a + 0.28 * b2 * b2).mul(1 - 0.22 * a * b2).mix([232, 226, 210], 0.07 * (0.5 + 0.5 * Math.cos(U * TAU / 0.1 + 1)));
  } else if (p === 'stripe') c.mix(trimC, 0.82 * sst(0.45, 0.55, 0.5 + 0.5 * Math.sin(y * TAU / 0.04)));
  else if (p === 'check') c.mix(trimC, 0.6 * (((Math.floor(U / 0.026) + Math.floor(y / 0.026)) & 1)));
  else if (p === 'heather') c.mix(mixc(fabric, [255, 255, 255], 0.14), 0.5 * vn2(U * 40, y * 40, 81));
  else if (p === 'block') { if (!(y > shY - 0.11 || (arm && y > elY + 0.02))) c.mix(trimC, 1); }
  else if (p === 'print') {
    // small flowers on a staggered grid
    const gu = U / 0.05, gv = y / 0.05, row = Math.floor(gv), cu = (gu + (row & 1) * 0.5) % 1 - 0.5, cv = gv - row - 0.5, d = Math.hypot(cu, cv);
    const petal = 0.5 + 0.5 * Math.cos(Math.atan2(cv, cu) * 5 + hash(K.id) * 6);
    c.mix(rgbOf(top.printColor), 0.62 * sst(0.2 + 0.05 * petal, 0.14 + 0.03 * petal, d)).mix(BRASS, 0.7 * sst(0.07, 0.04, d));
  }
  if (top.print === 'stripes' && !arm && Math.abs(y - (shY - 0.19)) < 0.012) c.mix(rgbOf(top.printColor), 0.95);
  if (top.print === 'bars' && !arm && Math.abs(y - (shY - 0.17)) < 0.009 + 0.011 * (Math.sin(U * 40) > 0 ? 1 : 0)) c.mix(rgbOf(top.printColor), 0.95);

  // ------------------------------------------------------------ construction by kind
  const hemD = y - hemTop, yn = shY - y;           // distance above the hem; below the shoulder line
  const frontish = tor && front > 0.3;
  const stitchL = (d: number, w: number, s: number): number => ln(d, w) * (0.5 + 0.5 * sst(0.0, 0.5, Math.sin(s * 560)));
  if (k === 'tracksuit') {
    const sideBand = sst(0.72, 0.8, Math.abs(Math.sin(phi))) * (tor ? sst(shY - 0.04, shY - 0.1, y) * 0 + 1 : 1);
    c.mix(trimC, 0.92 * sst(0.78, 0.86, Math.abs(Math.sin(phi))) * (tor ? 1 : 1) * (arm || tor ? 1 : 0));
    void sideBand;
  }
  if (k === 'vest' && tor) {
    // hi-vis: reflective tape round the waist and over each shoulder, a plain strip with segment lines
    const tapeY = Math.abs(y - (hemTop + 0.12)), tape = sst(0.02, 0.013, tapeY) + (ax > 0.03 && ax < 0.062 && y > hemTop + 0.17 && front > 0.5 ? 1 : 0) * 0 + 0;
    const strapT = ax > 0.034 && ax < 0.064 && y > hemTop + 0.17 && front > 0.4 ? sst(0.034, 0.038, ax) * sst(0.064, 0.06, ax) : 0;
    const tp = Math.max(tape, strapT);
    c.mix(SILVER, 0.92 * tp).mul(1 - 0.1 * tp * (0.5 + 0.5 * Math.sin((U + y) * 380)));
    c.mul(1 - 0.28 * ln(Math.abs(y - (hemTop + 0.12)) - 0.02, 0.0025));
  }
  if (k === 'uniform' && tor) {
    if (y > shY - 0.025 && ax > shX * 0.55 && ax < shX + 0.01 && tor) c.mix(trimC, 0.65);                                       // epaulettes
    if (top.tie && ax < 0.011 * (1 + 0.5 * sst(shY - 0.1, shY - 0.25, y)) && y < shY + 0.02 && y > shY - 0.3 && front > 0.5) c.mix(rgbOf(top.tie), 0.95);
    // chest pockets with a flap
    if (frontish) for (const sd of [-1, 1]) {
      const px = x * sd - 0.075, py = y - (shY - 0.2), inP = band(-0.034, 0.034, px, 0.003) * band(-0.04, 0.032, py, 0.003);
      c.mul(1 - 0.08 * inP).mul(1 - 0.25 * ln(py - 0.012, 0.0028) * band(-0.034, 0.034, px, 0.003)).mix(METAL, 0.8 * g2(Math.hypot(px, py - 0.008), 0.0035) * 0);
      c.mul(1 - 0.18 * ln(py + 0.04, 0.0025) * band(-0.034, 0.034, px, 0.003)).mul(1 - 0.18 * ln(Math.abs(px) - 0.034, 0.0025) * band(-0.04, 0.032, py, 0.003));
    }
    const bx = x + 0.075, by = y - (shY - 0.14);
    if (bx * bx + by * by * 1.4 < 0.0004 && front > 0.5) c.mix([208, 184, 96], 0.95).mul(1 - 0.12 * g2(Math.hypot(bx, by) - 0.017, 0.003));      // a plain badge plate
  }
  if (k === 'scrubs' && frontish) {
    const px = x + 0.085, py = y - (shY - 0.25), inP = band(-0.032, 0.032, px, 0.003) * band(-0.04, 0.03, py, 0.003);
    c.mul(1 - 0.07 * inP).mul(1 - 0.22 * ln(py - 0.03, 0.0028) * band(-0.032, 0.032, px, 0.003)).mul(1 - 0.16 * ln(Math.abs(px) - 0.032, 0.0025) * band(-0.04, 0.03, py, 0.003)).mul(1 - 0.16 * ln(py + 0.04, 0.0025) * band(-0.032, 0.032, px, 0.003));
  }
  if (k === 'hoodie' && frontish) {
    // kangaroo pocket: stitched trapezoid with two diagonal openings; drawstrings with metal tips
    const py = y - hemTop, inP = band(0.012, 0.15, py, 0.004) * sst(0.15 - 0.0 + 0.04 * Math.max(0, py - 0.05) / 0.1, 0.12, ax);
    const sideE = 0.118 - 0.02 * sst(0.05, 0.15, py);
    c.mul(1 - 0.08 * band(0.012, 0.145, py, 0.004) * sst(sideE + 0.004, sideE - 0.004, ax)).mul(1 - 0.22 * ln(py - 0.145, 0.003) * sst(sideE, sideE - 0.01, ax)).mul(1 - 0.2 * ln(ax - sideE, 0.003) * band(0.012, 0.145, py, 0.004));
    void inP;
    c.mul(1 - 0.22 * ln(py - (0.145 - 0.0) - 0.0, 0.0) );
    // cords
    for (const sd of [-1, 1]) {
      const cx = x * sd - 0.034, cy = neckY - y;
      if (cy > 0.0 && cy < 0.135 - 0.01 * 0) c.mix(mixc(trimC, [236, 230, 220], 0.55), 0.9 * ln(cx - 0.004 * Math.sin(cy * 40), 0.0042)).mul(1 - 0.15 * ln(cx - 0.004 * Math.sin(cy * 40) - 0.004, 0.0025));
      if (Math.abs(cy - 0.135) < 0.007) c.mix(METAL, 0.85 * sst(0.0045, 0.0025, Math.abs(cx)));
    }
  }
  if ((k === 'puffer' || k === 'jacket' && K.fabric === 'nylon') && !leg) {
    // quilted channels: a stitched line and a lit puff between each pair; pockets with a zip
    const pitch = tor ? 0.078 : 0.07, yy = (tor ? hemD : arm ? y - sleeveEnd : y - hemTop), ph = ((yy / pitch) % 1 + 1) % 1;
    const puff = Math.sin(ph * Math.PI);
    c.mul(0.8 + 0.26 * puff).mul(1 - 0.34 * g2(ph * pitch, 0.0034) - 0.34 * g2((1 - ph) * pitch, 0.0034)).lite(0.06 * puff * puff * sst(0.0, 0.8, t.ny));
    if (frontish) {
      const py = hemD - 0.06;
      c.mul(1 - 0.3 * ln(ax - (0.085 + 0.12 * Math.max(0, 0.15 - py - 0.06)), 0.0026) * band(0.02, 0.115, py, 0.003)).mix([92, 84, 78], 0.2 * ln(ax - 0.085, 0.0035) * band(0.02, 0.115, py, 0.003));
    }
  }
  if (zipped && tor && front > 0.3) {
    const zy = Math.min(1, Math.max(0, (neckY - y) / 0.5)), tooth = 0.5 + 0.5 * Math.sin(y * 620);
    // tape and teeth, a darker slot, and the pull at the top
    const tape = sst(0.0085, 0.0065, ax);
    c.mix(mulc(c as unknown as RGB, 1), 0).mul(1 - 0.3 * tape * 0.5);
    c.mix(METAL, 0.62 * sst(0.0034, 0.0018, ax) * (0.55 + 0.45 * tooth)).mul(1 - 0.35 * ln(ax - 0.0, 0.0012) * (1 - tooth * 0.5)).mul(1 - 0.05 * tape);
    if (y > neckY - 0.095 && y < neckY - 0.006 && ax < 0.0075) {
      const pull = sst(0.0058, 0.0038, ax) * band(neckY - 0.058, neckY - 0.012, y, 0.003);
      c.mix([92, 92, 96], 0.7 * pull * 0).mix(METAL, 0.8 * sst(0.0048, 0.003, ax) * band(neckY - 0.048, neckY - 0.02, y, 0.002)).mul(1 - 0.35 * ln(ax - 0.0, 0.0035) * band(neckY - 0.07, neckY - 0.05, y, 0.002));
    }
    void zy;
  }
  if (open && underC && tor && front > 0.15) {
    // jacket worn open over a tee or hoodie: the shirt in the V, an inner lining line, the placket edge with stitching, a zip or buttons
    const w = 0.056 - 0.012 * sst(hemTop + 0.1, hemTop + 0.3, y) + 0.002;
    const inside = sst(w + 0.001, w - 0.001, ax);
    if (inside > 0.0) {
      const shirt = y > shY - 0.02 ? K.skin : y > hemTop + 0.06 ? underC : K.botC;
      c.mix(shirt as RGB, inside);
      if (y > hemTop + 0.06) { c.mul(1 - 0.14 * (1 - sst(0.0, w, ax)) * 0 + 0.02 * Math.sin(y * 300) - 0.12 * sst(0.0, 0.02, w - ax) * 0); }
      c.mul(1 - 0.35 * inside * sst(w - 0.012, w, ax));                                                         // shade inside the opening
    }
    c.mul(1 - 0.3 * ln(ax - w - 0.004, 0.0045)).mix(mulc(fabric, 1.12), 0.35 * band(w + 0.007, w + 0.03, ax, 0.004));
    if (K.fabric === 'denim' || K.fabric === 'canvas') c.mix(GOLD_STITCH, 0.55 * stitchL(ax - w - 0.014, 0.0014, y));
    if (K.fabric === 'leather') c.lite(0.1 * ln(ax - w - 0.012, 0.004));
    if (K.fabric === 'denim' && y < shY - 0.18) c.mix(METAL, 0.8 * g2(Math.hypot(ax - w - 0.02, (y - (hemTop + 0.27 - 0.0)) * 1.0), 0.0045) * 0);
  }
  if (k === 'jacket' && !open && tor && front > 0.15) {
    // a tailored front: the shirt and tie in the V, lapel edges, buttons, hip flaps
    const vTop = neckY, vBot = hemTop + 0.34, tV = sst(vTop, vBot, y), w = 0.018 + 0.052 * (1 - tV) * (y > vBot ? 1 : 0.0);
    if (y > vBot - 0.0) {
      const wv = 0.016 + 0.05 * sst(vBot, neckY - 0.01, y);
      const inV = sst(wv + 0.001, wv - 0.001, ax) * sst(vBot - 0.002, vBot + 0.002, y);
      if (inV > 0) {
        c.mix(underC ?? K.skin, inV).mul(1 - 0.12 * inV * sst(0.0, 0.03, wv - ax));
        c.mul(1 + 0.02 * Math.sin(y * 250) * inV);
        if (underC) {
          // shirt collar points and the tie knot and blade
          c.mix(mulc(underC, 0.82), 0.5 * inV * band(neckY - 0.03, neckY, y, 0.004) * sst(0.004, 0.016, ax));
          if (top.tie) { const tw = 0.0055 * (0.9 + 0.5 * sst(neckY - 0.04, hemTop + 0.36, y)); c.mix(rgbOf(top.tie), 0.96 * sst(tw, tw - 0.002, ax) * inV).mul(1 - 0.2 * g2(y - (neckY - 0.03), 0.004) * sst(tw, 0, ax) * inV); }
        }
      }
      c.mul(1 - 0.3 * ln(ax - wv - 0.003, 0.0042) * sst(vBot - 0.004, vBot + 0.006, y));                          // lapel edge
      c.mix(mulc(fabric, 1.14), 0.25 * band(wv + 0.006, wv + 0.045, ax, 0.005) * sst(vBot, vBot + 0.02, y));
      c.mix(mulc(fabric, 0.7), 0.35 * ln(ax - wv - 0.008 - 0.03 * 0, 0.0017) * sst(vBot, vBot + 0.02, y));
    }
    // buttons down the front (two) and flap pockets
    for (const by of [hemTop + 0.27, hemTop + 0.12]) c.mix(mulc(fabric, 0.55), 0.9 * g2(Math.hypot(x - 0.012 * 0, y - by) * 1, 0.0042) * front * 1).mul(1 - 0.2 * g2(Math.hypot(ax - 0.0, y - by), 0.007) * front);
    c.mul(1 - 0.22 * ln(ax, 0.0016) * band(hemTop - 0.02, vBot, y, 0.004));
    const px = ax - 0.085, py = y - (hemTop + 0.045), inP = band(-0.035, 0.035, px, 0.003) * band(-0.016, 0.016, py, 0.003);
    c.mul(1 - 0.12 * inP).mul(1 - 0.3 * ln(py - 0.016, 0.0024) * band(-0.035, 0.035, px, 0.003)).mul(1 + 0.04 * ln(py + 0.016, 0.003) * band(-0.035, 0.035, px, 0.003));
    void w;
  }
  if ((k === 'blouse' || k === 'cardigan' || k === 'uniform' || k === 'scrubs') && tor && front > 0.3 && !open) {
    // a placket and its buttons (cardigan: a knit band)
    const pw = k === 'cardigan' ? 0.021 : 0.014;
    const cardi = k === 'cardigan';
    if (!(k === 'scrubs')) {
      c.mix(mulc(fabric, cardi ? 0.9 : 1.06), 0.5 * sst(pw + 0.002, pw - 0.002, ax) * band(neckY - 0.6, neckY, y, 0.004)).mul(1 - 0.16 * ln(ax - pw, 0.0022) * band(neckY - 0.6, neckY + 0.0, y, 0.004));
      for (let i = 0; i < 8; i++) {
        const by = neckY - 0.034 - i * (cardi ? 0.075 : 0.082);
        if (by < hemTop + 0.015) break;
        c.mix(cardi ? mulc(K.trimC, 0.8) : [228, 224, 214], 0.92 * sst(0.0058, 0.0034, Math.hypot(ax, (y - by) * 0.95))).mul(1 - 0.2 * g2(Math.hypot(ax, y - by) - 0.006, 0.0022));
      }
    }
  }
  if (k === 'dress' && tor) {
    // princess seams from shoulder to waist, a waist seam, a gathered skirt top
    const seam = Math.abs(ax - (0.045 + 0.02 * sst(shY - 0.1, shY - 0.35, y))), wy = hemTop + 0.1;
    c.mul(1 - 0.14 * ln(seam, 0.003) * band(wy, shY - 0.05, y, 0.004) * front);
    c.mul(1 - 0.2 * ln(y - wy, 0.0035)).mix(rgbOf(top.trim), 0.5 * band(wy - 0.012, wy + 0.012, y, 0.003));
  }
  if (k === 'cardigan' && frontish) for (const sd of [-1, 1]) {
    const px = x * sd - 0.095, py = y - (hemTop + 0.07), inP = band(-0.04, 0.04, px, 0.003) * band(-0.04, 0.04, py, 0.003);
    c.mul(1 - 0.08 * inP).mul(1 - 0.2 * ln(Math.abs(px) - 0.04, 0.0025) * band(-0.04, 0.04, py, 0.003)).mul(1 - 0.18 * ln(py + 0.04, 0.0025) * band(-0.04, 0.04, px, 0.003));
    c.mul(1 + 0.05 * g2(py - 0.04, 0.006) * band(-0.04, 0.04, px, 0.003) * 0);
  }
  if (k === 'jersey' && tor && !arm) {
    c.mix(trimC, 0.9 * ln(Math.abs(ax - (shX * 0.8)) - 0.0, 0.004) * sst(shY - 0.03, shY - 0.2, y) * 0);          // armhole piping
  }

  // ------------------------------------------------------------ collar, neckline, rib
  const ribLike = k === 'hoodie' || k === 'puffer' || k === 'tracksuit' || (k === 'jacket' && K.fabric !== 'wool' && K.fabric !== 'denim' && K.fabric !== 'canvas' && K.fabric !== 'leather') || k === 'cardigan';
  const ribC = mixc(k === 'cardigan' ? K.trimC : K.trimC, fabric, 0.2);
  const rib = (period: number, s: number): number => 0.5 + 0.5 * Math.sin(s * TAU / period);
  if (tor) {
    const dn = neckY - y;
    if (!open) {
      const crew = k === 'tee' || k === 'jersey';
      const bandW = crew ? 0.018 : k === 'scrubs' ? 0.014 : k === 'hoodie' ? 0.026 : 0.016;
      if (dn >= -0.003 && dn < bandW && tor) {
        const tt2 = sst(bandW, bandW - 0.004, dn);
        if (crew || k === 'scrubs') c.mix(mulc(k === 'scrubs' ? K.trimC : fabric, k === 'scrubs' ? 1 : 0.78), 0.9 * tt2).mul(1 + (crew ? 0.02 * Math.sin(U * 760) : 0)).mul(1 - 0.25 * ln(dn - bandW, 0.003) );
        else if (k === 'hoodie') c.mul(0.72 + 0.06 * rib(0.011, U) ).mul(1 - 0.18 * ln(dn - bandW, 0.004)).mix(K.trimC, 0.25 * tt2);
        else if (k === 'blouse' || k === 'uniform' || k === 'dress' || k === 'jacket' || k === 'cardigan') {
          c.mix(mulc(fabric, k === 'blouse' || k === 'uniform' ? 1.08 : 0.85), 0.8 * tt2).mul(1 - 0.28 * ln(dn - bandW, 0.003));
          if (k === 'blouse' || k === 'uniform') c.mul(1 - 0.22 * ln(dn - 0.01 - 0.12 * ax, 0.003));
        } else c.mix(ribC, 0.7 * tt2).mul(1 - 0.2 * ln(dn - bandW, 0.003));
        // a stitch line just inside the binding
        if (crew) c.mix(mulc(fabric, 0.6), 0.5 * stitchL(dn - bandW - 0.004, 0.0013, U));
      }
      // the shadow cloth casts on the skin and the collar's own soft shadow below the neck
      c.mul(1 - 0.12 * g2(dn - 0.03, 0.03));
    }
  }
  // sleeve ends, hems: ribbed on sweatshirts and puffers, turned and stitched elsewhere
  const rib2 = ribLike && k !== 'jacket' || (k === 'jacket' && ribLike && open);
  if (arm && sleeves !== 'none') {
    const d = y - sleeveEnd;
    if (sleeves === 'long' && d < 0.075) {
      if (rib2) { const r = rib(0.009, phi * 0.045), e = sst(0.066, 0.058, d); c.mix(ribC, 0.9 * e).mul(0.82 + 0.2 * r * e + 0.18 * (1 - e)).mul(1 - 0.22 * ln(d - 0.062, 0.004)); }
      else { c.mul(1 - 0.12 * ln(d - 0.022, 0.0035)).mix(mulc(fabric, 0.55), (K.fabric === 'denim' ? 0.45 : 0.2) * stitchL(d - 0.021, 0.0013, phi)).mul(1 - 0.1 * sst(0.024, 0.0, d)); if (k === 'jacket' && K.fabric === 'wool') c.mix(mulc(fabric, 0.5), 0.8 * g2(Math.hypot((phi - 1.3) * 0.045, d - 0.04), 0.004) + 0.8 * g2(Math.hypot((phi - 1.3) * 0.045, d - 0.058), 0.004)); }
    } else if (sleeves === 'short' && d < 0.03) {
      c.mul(1 - 0.12 * ln(d - 0.016, 0.0035)).mix(mulc(fabric, 0.65), 0.3 * stitchL(d - 0.015, 0.0012, phi));
      if (k === 'jersey') c.mix(trimC, 0.9 * sst(0.012, 0.005, d));
    }
  }
  if (tor || leg) {
    const d = y - hemTop;
    if (d < 0.065 && k !== 'dress') {
      if (rib2) { const r = rib(0.009, U), e = sst(0.058, 0.05, d); c.mix(ribC, 0.9 * e).mul(0.82 + 0.2 * r * e + 0.18 * (1 - e)).mul(1 - 0.2 * ln(d - 0.054, 0.004)); }
      else c.mul(1 - 0.1 * ln(d - 0.024, 0.004)).mix(mulc(fabric, 0.6), 0.3 * stitchL(d - 0.024, 0.0014, U)).mul(1 - 0.1 * sst(0.026, 0.0, d));
    }
  }
  // armscye (the ring where the sleeve is set in) and the underarm seam
  if (arm && sleeves !== 'none' || (tor && sleeves !== 'none')) {
    if (arm) c.mul(1 - 0.1 * ln(y - (shY - 0.022), 0.004) * 1).mul(1 - 0.07 * ln(Math.abs(phi + 1.5708) * 0.045, 0.004) * sst(shY - 0.1, shY - 0.2, y));
  }
  if (tor) c.mul(1 - 0.12 * ln((Math.abs(phi) - 1.5708) * 0.17, 0.005) * sst(hemTop, hemTop + 0.15, y));       // side seam

  // ------------------------------------------------------------ folds and soft ambient shadow, where cloth bends
  const jointsArm = g2(y - elY, 0.05) + g2(y - (shY - 0.06), 0.05), jointsLeg = g2(y - K.knY, 0.06) + g2(y - (K.hipY - 0.04), 0.06);
  const stiff = K.fabric === 'nylon' ? 0.45 : K.fabric === 'leather' ? 0.6 : K.fabric === 'denim' ? 0.8 : K.fabric === 'wool' ? 0.7 : 1;
  if (arm) {
    const fo = Math.max(0, Math.sin((y - elY) * 160 + Math.sin(U * 40) * 0.8 + phi));
    c.mul(1 - 0.17 * fo * Math.min(1, jointsArm) * stiff);
    // inside of the elbow: a V of creases, a bunch at the back
    c.mul(1 - 0.3 * g2(y - elY + 0.006 * Math.sin(phi * 2.2), 0.0065) * sst(1.6, 0.3, Math.abs(phi)) * stiff).mul(1 - 0.18 * g2(y - elY - 0.03, 0.006) * sst(1.3, 0.2, Math.abs(phi)) * stiff);
    c.mul(1 - 0.16 * g2(y - elY + 0.03 + 0.4 * Math.abs(phi) * 0.045, 0.0055) * sst(2.0, 0.6, Math.abs(phi)) * stiff).mul(1 - 0.12 * g2(y - elY + 0.01, 0.007) * sst(2.3, 3.0, Math.abs(phi)) * stiff);
    // under the arm: ambient shade down the inside of the sleeve and the armpit
    c.mul(1 - 0.3 * sst(0.0, -1.55, phi) * sst(shY - 0.2, shY - 0.04, y) - 0.1 * sst(-0.4, -1.6, phi));
  } else if (leg) {
    c.mul(1 - 0.04 * Math.min(1, jointsLeg) * stiff);
  } else {
    c.mul(1 - 0.24 * g2(ax - (shX * 0.9), 0.04) * g2(y - (shY - 0.11), 0.07));                                       // armpit
    c.mul(1 - 0.12 * g2(y - (shY - 0.25), 0.03) * front * (K.s.sex === 'f' ? 1.0 : 0.25) * sst(0.0, 0.07, ax));          // under the bust or chest
    c.mul(1 - 0.12 * Math.max(0, Math.sin((y - hemTop) * 90 + Math.sin(U * 24) * 2.2)) * g2(y - (hemTop + 0.07), 0.09) * stiff * front);   // folds over the belly
    c.mul(1 - 0.13 * g2(y - (hemTop + 0.02) + 0.25 * ax, 0.012) * stiff);
    c.mul(1 - 0.12 * g2(ax - 0.12, 0.05) * g2(y - (hemTop + 0.17), 0.1) * (1 - front));                              // soft side shadow at the waist
    c.mul(1 - 0.1 * g2(y - (shY - 0.06), 0.03) * (1 - front) * sst(0.0, 0.08, ax) * 0);
  }

  // ------------------------------------------------------------ wear: dirt at hems and cuffs, a worn elbow, light on the shoulders
  const gr = K.grime;
  if (arm && sleeves === 'long') c.mix([88, 76, 64], 0.2 * gr * sst(sleeveEnd + 0.09, sleeveEnd, y) * (0.5 + vn2(U * 40, y * 40, 82)));
  if (tor) c.mix([84, 72, 60], 0.16 * gr * sst(hemTop + 0.1, hemTop, y) * (0.4 + vn2(U * 28, y * 28, 83)));
  if (K.fabric === 'denim' || K.fabric === 'canvas') c.lite(0.07 * ln(Math.abs(phi) - 1.5708, 0.05) * (arm ? 1 : 0.5) * vn2(U * 40, y * 40, 84));
  c.mul(0.93 + 0.1 * (t.nx * LIGHT.x + t.ny * LIGHT.y + t.nz * LIGHT.z));
  c.mul(1 + 0.012 * (rnd(t.q) - 0.5));
}
import { rgb as rgbOf2 } from './pedPaintShared';
void rgbOf2;
