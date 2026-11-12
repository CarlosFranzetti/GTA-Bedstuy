/**
 * The head of the people painter: skin with warm and cool variation, small dark eyes with lids and light grey sclera, soft
 * brows made of hair, a nose that is shaded and not outlined, lips a shade off the skin, ears, beard and stubble as texture,
 * age lines for the elders, and the painted hairline under the hair pieces. Sizes are in "standard metres" (xm from the
 * midline, ym above the eye line, both divided by the head scale), so a big head and a small one carry the same face.
 */
import { Px, g2, ln, sst, band, hash, vn2, rnd, mixc, mulc, type Look, type Tex, type RGB } from './pedPaintShared';

const SCLERA: RGB = [206, 200, 190], SCLERA_SH: RGB = [146, 126, 118], CARUNCLE: RGB = [186, 108, 98], PUPIL: RGB = [12, 10, 10];

export function paintHead(K: Look, t: Tex, o: Px): void {
  const { lm, s, face } = K;
  const x = t.x, y = t.y, z = t.z, ax = Math.abs(x), side = x < 0 ? -1 : 1;
  const xm = ax / K.wsx, ym = (y - lm.eyeY) / K.hs, sx = x / K.wsx;                  // sx > 0 is the side the key light comes from
  const fz = (K.zc - z) / Math.max(0.05, K.rzH);
  const fm = sst(0.02, 0.32, fz);                                                    // 1 on the front of the face
  const edm = K.edm, yN = -0.32 * edm, yM = -0.59 * edm, yChin = -edm;
  const tt = (y - lm.chinY) / (lm.crownY - lm.chinY);
  const old = K.old, expr = K.expr, tired = expr === 'tired', amused = expr === 'amused';
  o.set(K.skin);
  if ((globalThis as { __pedGrid?: boolean }).__pedGrid) { const gx = Math.floor(xm / 0.005 + 0.5) & 1, gy = Math.floor(ym / 0.005 + 0.5) & 1; o.set(gx ^ gy ? [230, 230, 230] : [40, 40, 90]); if (Math.abs(xm - 0.029) < 0.0006) o.set([255, 0, 0]); if (Math.abs(ym) < 0.0006) o.set([0, 255, 0]); return; }
  // ---------------------------------------------------------------- large form: forehead catches light, the sides of the head fall into shade
  o.mix(K.skinHi, 0.26 * sst(0.5, 0.78, tt) * sst(0.0, 0.6, fz));
  o.tint(K.skinSh, 0.55 * sst(0.55, -0.1, fz) * sst(0.02, 0.4, tt));
  o.mul(1 + 0.035 * side * sst(0.0, 0.07, ax) * fm);
  // skin that is not one flat colour: slow mottling and a warmer nose, cheeks and ears
  const mott = vn2(x * 60, y * 60 + z * 40, 3) - 0.5;
  o.mul(1 + 0.05 * mott);
  o.mix(K.skinWarm, 0.1 * (vn2(x * 28, y * 28, 9)) * fm);
  if (fm > 0) {
    const jaw = sst(yChin * 0.55, yChin * 0.95, ym);
    o.mix(K.blush, (K.female || K.kidish ? 0.2 : 0.12) * g2(xm - 0.043, 0.022) * g2(ym + 0.018, 0.02) * fm);            // cheeks
    o.mix(K.skinHi, 0.09 * g2(xm - 0.052, 0.014) * g2(ym + 0.004, 0.012) * fm);                                           // cheekbone
    o.tint(K.skinSh, 0.16 * (1 - jaw) * sst(0.02, 0.06, xm) * fm);                                                          // jaw underside
    o.tint(K.skinSh, 0.14 * g2(xm - 0.03, 0.02) * g2(ym - 0.012, 0.0075) * fm);                                            // eye sockets
    o.tint(K.skinSh, 0.1 * g2(xm - 0.035, 0.03) * g2(ym - 0.032, 0.007) * fm * (old ? 1.5 : 1));                          // under the brow ridge / forehead edge
    o.mix(K.skinCool, (0.14 + (tired ? 0.16 : 0) + (old ? 0.12 : 0)) * g2(xm - 0.03, 0.017) * g2(ym + 0.0105, 0.0055) * fm);   // under-eye
    o.tint(K.skinSh, 0.1 * g2(sx + 0.03, 0.03) * g2(ym - yN * 0.4, 0.04) * fm * sst(0.02, 0.04, -ym - 0.012 + 0.04));      // the cheek on the shaded side of the nose
    // ---------------------------------------------------------------- nose: bridge light, side shadow, nostrils, tip
    const nzone = band(yN - 0.006, 0.0, ym, 0.004);
    o.mix(K.skinHi, 0.12 * g2(xm, 0.0035) * nzone * fm);
    o.tint(K.skinSh, 0.2 * g2(sx + 0.0125, 0.0055) * band(yN - 0.004, -0.006, ym, 0.004) * fm);
    o.tint(K.skinSh, 0.34 * g2(xm - 0.0098, 0.0048) * g2(ym - (yN + 0.0012), 0.0034) * fm);                                  // nostrils
    o.tint(K.skinSh, 0.13 * g2(ym - (yN - 0.0055), 0.0032) * g2(xm, 0.012) * fm);                                           // under the tip
    o.mix(K.skinWarm, 0.2 * g2(xm, 0.0065) * g2(ym - (yN + 0.0035), 0.005) * fm);                                           // warm tip
    // ---------------------------------------------------------------- age: nasolabial folds, marionette lines
    const fold = (old ? 0.2 : 0.05) + (tired ? 0.04 : 0) + (amused ? 0.04 : 0);
    const xf = 0.0185 + (yN - ym) * 0.34;
    o.tint(K.skinSh, fold * g2(xm - xf, 0.0034) * band(yM - 0.006, yN + 0.002, ym, 0.004) * fm);
    if (old) o.tint(K.skinSh, 0.12 * g2(xm - 0.0215 + (yM - ym) * 0.2, 0.003) * band(yM - 0.026, yM - 0.004, ym, 0.004) * fm);
    // philtrum
    o.tint(K.skinSh, 0.07 * g2(xm - 0.0055, 0.0017) * band(yM + 0.007, yN - 0.002, ym, 0.002) * fm);

    // ---------------------------------------------------------------- eyes
    const exm = xm - 0.029, a = 0.0136 * K.eyeK, u = exm / a;
    const tilt = 0.0009 + 0.0004 * hash(K.id + 'tl');
    if (Math.abs(u) < 1.5) {
      const shp = u * u < 1 ? Math.pow(1 - u * u, 0.62) : 0;
      const bUp = 0.0056 * (tired ? 0.76 : amused ? 0.92 : 1) * (K.kidish ? 1.1 : 1) * (face.eyes === 'wide' ? 1.1 : face.eyes === 'sleepy' ? 0.8 : 1);
      const bLo = 0.0036 * (amused ? 0.68 : 1);
      const yu = bUp * shp * (u < 0 ? 0.92 : 1) + tilt * u, yl = -bLo * Math.pow(Math.max(0, 1 - u * u), 0.8) + tilt * u;
      const dUp = yu - ym, dLo = ym - yl;
      const lashT = (face.lashes ? 0.0012 : 0.00085) * (1 + 0.5 * sst(0.0, 1.0, u));
      if (shp > 0 && dUp > 0 && dLo > 0) {
        // inside the opening: light grey sclera, shaded under the upper lid and into the corners, then the iris
        const shade = 0.6 * sst(0.0045, 0.0, dUp) + 0.2 * sst(0.55, 1.0, Math.abs(u));
        o.set(SCLERA).mix(SCLERA_SH, shade);
        o.mix(CARUNCLE, 0.4 * sst(-0.7, -0.95, u) * sst(0.0, 0.002, dLo));
        const ri = 0.0063 * (K.kidish ? 1.08 : 1), gx = 0.0005 * (hash(K.id + 'gz') - 0.5), dIr = Math.hypot(exm - gx, ym - 0.0001) / ri;
        if (dIr < 1.05) {
          const e = sst(1.05, 0.93, dIr);
          const ic = dIr < 0.7 ? mixc(K.irisC, [150, 118, 78], 0.28 * sst(0.38, 0.62, dIr)) : mulc(K.irisC, 0.55 + 0.45 * sst(1.0, 0.72, dIr));
          o.mix(ic, e);
          if (dIr < 0.4) o.mix(PUPIL, sst(0.4, 0.3, dIr));
          o.mix([210, 206, 200], 0.55 * g2(exm - gx + 0.0017, 0.0008) * g2(ym - 0.0021, 0.0008));                                // a small catchlight
        }
        o.tint(K.skinSh, 0.35 * sst(0.0012, 0.0, dUp));                                                                            // the lid's shadow on the eye
        // lash line on the upper lid, a hair line under the lower
        o.mix(mixc(K.hairC, [26, 20, 18], 0.5), 0.92 * sst(lashT, 0.0, dUp));
        o.mix(mixc(K.skinSh, [40, 24, 22], 0.4), 0.3 * sst(0.0007, 0.0, dLo));
      } else {
        // outside: the lid skin, its crease above, the lower lid and a flick of lashes
        const lidAbove = ym - yu, lidBelow = yl - ym;
        if (lidAbove > 0 && lidAbove < 0.0075 && shp > 0) {
          o.mix(mixc(K.skin, K.skinHi, 0.5), 0.18 * sst(0.0006, 0.002, lidAbove) * sst(0.0058, 0.0035, lidAbove));
          o.tint(K.skinSh, 0.34 * g2(lidAbove - 0.0058, 0.0014) * (tired ? 1.3 : 1));                                            // lid crease
          o.mix(mixc(K.hairC, [26, 20, 18], 0.5), 0.78 * sst(lashT, 0.0, lidAbove));
        }
        if (lidBelow > 0 && lidBelow < 0.0035 && shp > 0) o.tint(K.skinSh, 0.1 * sst(0.0, 0.0008, lidBelow) * sst(0.0035, 0.0012, lidBelow));
        if (u > 0.8 && u < 1.45 && Math.abs(ym - (tilt * u + 0.0003)) < 0.0013 + 0.0006 * (u - 0.8)) o.mix(mixc(K.hairC, [26, 20, 18], 0.5), (face.lashes ? 0.5 : 0.28) * sst(1.45, 0.9, u));
      }
    }
    // crow's feet and under-eye lines
    if (old) {
      const cf = 0.14;
      for (let i = 0; i < 3; i++) {
        const ang = -0.45 + i * 0.4, dxr = exm - 0.0145, dyr = ym - 0.001;
        const d = (dxr * Math.sin(ang) - dyr * Math.cos(ang)), r = dxr * Math.cos(ang) + dyr * Math.sin(ang);
        o.tint(K.skinSh, cf * g2(d, 0.0014) * band(0.004, 0.015, r, 0.003) * (0.6 + 0.4 * vn2(r * 300, i, 4)));
      }
    }
    if (old) {
      o.tint(K.skinSh, 0.1 * g2(xm - 0.03, 0.014) * g2(ym + 0.0185, 0.0035));                                                     // eye bag edge
      for (let i = 0; i < 4; i++) {                                                                                                // forehead lines, broken and wavy
        const yl2 = 0.03 + i * 0.0062, w = vn2(xm * 120 + i * 5, i, 6);
        o.tint(K.skinSh, 0.13 * g2(ym - yl2 - 0.002 * (w - 0.5), 0.0012) * sst(0.075, 0.055, xm) * sst(0.25, 0.55, w) * sst(0.1, 0.4, fz));
      }
      o.tint(K.skinSh, 0.12 * g2(xm - 0.0055, 0.0016) * band(0.014, 0.03, ym, 0.003));                                            // between the brows
    }

    // ---------------------------------------------------------------- brows: strokes of hair, thick at the inner end, thin at the tail
    const bt = (xm - 0.012) / 0.034;                                                                                               // 0 inner .. 1 tail
    if (bt > -0.1 && bt < 1.12) {
      const broad = face.brows === 'thick' ? 1.35 : face.brows === 'thin' ? 0.85 : 1.1;
      const wB = 0.0030 * broad * (0.88 + 0.2 * hash(K.id + 'bw')) * (1.15 - 0.62 * Math.pow(Math.max(0, bt), 1.3)) * (old ? 0.8 : 1);
      const lift = (tired ? 0.0009 : amused ? 0.0012 : 0.0003) * (1 - bt * 2) ;
      const arch = (face.brows === 'arched' ? 0.0033 : 0.0021) * Math.sin(Math.PI * Math.min(1, Math.max(0, bt * 0.85 + 0.12)));
      const yb = 0.0188 + arch + lift - (tired ? 0.0016 : 0.0004) * bt * bt;
      const d = (ym - yb) / wB;
      if (d > -1.3 && d < 1.3) {
        const strands = 0.55 + 0.45 * vn2(xm * 520, ym * 90 + 3, 7);
        const edge = sst(1.25, 0.35, Math.abs(d)) * strands;
        const body = edge * sst(1.12, 0.78, bt) * sst(-0.12, 0.08, bt) * (0.7 + 0.3 * sst(1.0, 0.0, bt));
        o.mix(mixc(mulc(K.hairC, 0.8), K.skin, old ? 0.4 : 0.16), Math.min(0.95, body * 1.2));
      }
    }

    // ---------------------------------------------------------------- mouth: lips as form
    const mx = xm / K.mouthMw;
    const gm = face.mouth, cornerLift = (gm === 'grin' ? 0.0032 : amused ? 0.0017 : tired ? -0.0007 : gm === 'frown' ? -0.0006 : 0.0001);
    const my = ym - yM - cornerLift * mx * mx;
    const upH = 0.0066 * (1 - 0.45 * mx * mx) * (old ? 0.75 : 1), loH = 0.0094 * (1 - 0.7 * mx * mx) * (old ? 0.8 : 1);
    if (mx < 1.12) {
      const lipE = sst(1.08, 0.78, mx);
      const inUp = my > 0 && my < upH, inLo = my <= 0 && my > -loH;
      if (inUp) { o.mix(K.lipC, 0.82 * lipE * sst(upH, upH * 0.82, my) * (1 - 0.35 * sst(0.55, 0.0, mx) * 0)); o.tint(K.skinSh, 0.12 * lipE); }
      if (inLo) { o.mix(K.lipC, 0.8 * lipE * sst(-loH, -loH * 0.8, my)); o.mix(K.lipHi, 0.45 * g2(my + loH * 0.5, loH * 0.35) * g2(mx, 0.45) * lipE); }
      if (gm === 'grin' && Math.abs(my) < 0.0032 * (1 - mx * mx) && mx < 0.78) o.set([222, 216, 205]).mix(K.lipDark, 0.1 + 0.4 * sst(0.0015, 0.0032, Math.abs(my)));
      // the mouth line and its corners, then the soft shadow under the lower lip
      o.mix(K.lipDark, 0.62 * g2(my, 0.00085) * sst(1.1, 0.85, mx) + 0.4 * g2(mx - 1.0, 0.09) * g2(my, 0.0022));
      o.tint(K.skinSh, 0.16 * g2(my + loH + 0.0035, 0.0042) * sst(0.95, 0.2, mx));
      o.tint(K.skinSh, 0.08 * g2(my - upH - 0.0035, 0.0035) * sst(0.8, 0.0, mx) * (1 - 0.0));                                          // under the nose, above the lip
    }
    // chin: a faint dimple, and a darker fold above the chin
    o.tint(K.skinSh, 0.07 * g2(xm, 0.006) * g2(ym - yChin * 0.86, 0.006));

    // ---------------------------------------------------------------- freckles and a mole, a few people
    if (K.grp === 'wh' || K.grp === 'hj' || K.grp === 'mx' || K.grp === 'la') if (hash(K.id + 'fr') < 0.22) {
      const fr = vn2(x * 520, y * 520, 11) > 0.8 ? 1 : 0;
      o.mix(mulc(K.skin, 0.8), 0.28 * fr * g2(xm - 0.03, 0.028) * g2(ym - yN * 0.35 + 0.002, 0.02));
    }
    if (hash(K.id + 'mol') < 0.18) {
      const mxp = 0.02 + 0.03 * hash(K.id + 'mxp'), myp = -0.015 - 0.05 * hash(K.id + 'myp');
      o.mix(mulc(K.skinSh, 0.8), 0.7 * g2(Math.hypot(sx - mxp, ym - myp), 0.0016));
    }

    // ---------------------------------------------------------------- beard, moustache, stubble: a texture with an edge, not a box
    const hairy = !!(face.beard || face.mustache || face.stubble);
    if (hairy) {
      const topEdge = yM + 0.007 + 0.034 * sst(0.02, 0.078, xm);                          // the cheek line, high by the ear, low by the mouth
      const botEdge = yChin - 0.03 - 0.01 * sst(0.0, 0.06, xm);
      const inJaw = sst(topEdge + 0.004, topEdge - 0.004 - 0.008 * (face.beard ? 0 : 1), ym) * sst(botEdge, botEdge + 0.012, ym) * sst(0.084, 0.07, xm);
      const lipHole = 1 - 0.9 * sst(1.0, 0.8, mx) * band(-loH, upH, my, 0.0012);
      const stache = (face.mustache || face.beard) ? sst(0.034, 0.02, xm) * band(yM + 0.003, yN - 0.002, ym, 0.0025) : 0;
      const strand = vn2(sx * 330 + 11, ym * 120, 13), grainN = vn2(sx * 700, ym * 700, 14);
      let dens = 0;
      if (face.beard) dens = Math.max(inJaw * lipHole, stache * lipHole);
      else if (face.stubble) dens = 0.38 * Math.max(inJaw * sst(0.0, 0.03, -ym + 0.035 - 0.04 * sst(0.03, 0.07, xm)), stache) * lipHole;
      else if (face.mustache) dens = stache * lipHole;
      if (dens > 0) {
        const thresh = face.beard || face.mustache ? 0.5 : 0.62;
        const a = Math.min(0.95, Math.max(0, (dens - 0.18 + (grainN - 0.5) * 0.5) * (face.beard || face.mustache ? 2.0 : 1.3)));
        const hc = mixc(mulc(K.hairC, 0.8 + 0.4 * strand), K.skin, face.beard || face.mustache ? (K.old ? 0.1 : 0.18) * (1 - strand) : 0.5);
        o.mix(hc, a * (dens > thresh ? 1 : 0.8) * (face.beard || face.mustache ? 1 : 0.7));
      }
    }
  } else {
    // the back and sides of the head: shade only
    o.tint(K.skinSh, 0.05);
  }

  // ---------------------------------------------------------------- ears: warm rim, dark bowl, pink lobe
  const earM = sst(0.072, 0.082, ax) * g2(ym + 0.026, 0.034) * sst(0.55, 0.1, fz);
  if (earM > 0.02) {
    o.mix(K.skinWarm, 0.32 * earM);
    o.tint(K.skinSh, 0.34 * earM * sst(0.0, 0.6, -t.nz * 0.5 + 0.5 * Math.abs(t.nx) * -1 + 0.4) * g2(ym + 0.026, 0.015));
    o.mix(K.skinWarm, 0.18 * earM * g2(ym + 0.052, 0.008));
  }

  // ---------------------------------------------------------------- hair on the skull, under the hair pieces: a broken hairline, strands, a darker fringe at the roots
  const bald = s.hair === 'bald';
  if (!bald || s.hat === 'cap') {
    const back = sst(0.1, -0.35, fz), side2 = sst(0.05, 0.085, ax);
    const hl0 = lm.chinY + (lm.crownY - lm.chinY) * (0.77 - 0.2 * side2 - 0.45 * back) + 0.004 * (vn2(x * 90, 1, 21) - 0.5) * 2;
    const lift = s.hair === 'fade' ? 0.06 * (side2 + back * 0.8) : s.hair === 'recede' || s.hair === 'thinning' ? 0.018 * (1 - side2) : 0;
    const hl = hl0 + lift;
    if (y > hl - 0.004) {
      const n = vn2(x * 170, y * 170, 22), strand = vn2(x * 200 + z * 160, y * 36, 23);
      const root = clampStep((y - hl) / 0.02 + (n - 0.5) * 0.55);
      let hc = mixc(mulc(K.hairC, 0.72 + 0.4 * strand), mixc(K.hairC, [255, 255, 255], 0.2), 0.35 * sst(0.4, 1, t.ny) * (1 - strand));
      if (bald) { hc = mixc(K.skin, K.hairC, 0.2); }
      o.mix(hc, root * (bald ? 0.5 : 0.96));
      if (s.hair === 'fade' && y < hl + 0.025) o.mix(K.hairC, 0.34 * (1 - root) * sst(0.25, 0.7, n));
    }
  }

  // ---------------------------------------------------------------- hats that show on the skull
  if (s.hat === 'hijab') { hijab(K, t, o, xm, ym, fz); return; }
  if ((s.hat === 'kippah' || s.hat === 'kufi') && y > lm.crownY - 0.05 && ax < 0.075) {
    const hc = rgbHat(K), ring = 0.5 + 0.5 * Math.sin(Math.hypot(x, z - K.zc * 0.2) * 420);
    o.mix(mulc(hc, 0.92 + 0.1 * ring), 0.96 * sst(lm.crownY - 0.05, lm.crownY - 0.042, y));
  }

  // ---------------------------------------------------------------- glasses and mask
  if (face.glasses && fm > 0) {
    const gc = glassC(K), gr = Math.hypot((xm - 0.029) / 1.1, ym - 0.0012);
    o.mix(gc, Math.min(0.9, 1.0 * g2(gr - 0.0225, 0.0011)) + (xm < 0.0095 && Math.abs(ym - 0.0075) < 0.0013 ? 0.85 : 0));
    if (gr < 0.0225) { o.mix([140, 168, 184], 0.07); o.mix([255, 255, 255], 0.06 * g2(exmL(xm) + ym * 0.5, 0.007)); }
    o.tint(K.skinSh, 0.1 * g2(gr - 0.0245, 0.004) * sst(0.0225, 0.025, gr));                                                    // the frame's soft shadow on the cheek
  } else if (face.glasses && ax > 0.074 && ax < 0.1 && Math.abs(ym - 0.0012) < 0.002 && fz > -0.35) o.mix(glassC(K), 0.85);
  if (face.mask) {
    const edge = sst(0.085, 0.07, ax) * sst(-0.016, -0.0075 + 0.0, ym - 0.0 + 0.0) ;
    void edge;
    const top2 = lm.eyeY - 0.016 * K.hs, inMask = sst(0.085, 0.07, ax) * sst(top2 - 0.002, top2 - 0.01, y) * sst(lm.chinY - 0.012, lm.chinY + 0.004, y) * (fz > -0.2 ? 1 : 0);
    if (inMask > 0.4) {
      const pleat = 0.5 + 0.5 * Math.sin((y - top2) * 520);
      o.mix(mixc([198, 224, 236], [152, 188, 206], 0.55 * pleat), 0.96).mul(0.96 + 0.06 * sst(0.2, 1, fz));
    }
    if (fz > -0.5 && ax > 0.075 && Math.abs(y - (top2 - 0.02)) < 0.0028 + 0.016 * sst(0.1, 0.02, fz)) o.mix([200, 218, 228], 0.8);        // ear loops
  }
}

const clampStep = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const exmL = (xm: number): number => xm - 0.029;
function rgbHat(K: Look): RGB { return mixc(rgbOf(K.s.hatColor), [0, 0, 0], 0); }
function glassC(K: Look): RGB { return rgbOf(K.face.glasses ?? '#222222'); }
import { rgb as rgbOf } from './pedPaintShared';

/** a scarf draped round the face: an oval opening, folds that fall from the crown, a shadow where the cloth meets the face */
function hijab(K: Look, t: Tex, o: Px, xm: number, ym: number, fz: number): void {
  const { lm } = K, x = t.x, y = t.y;
  const hc = rgbOf(K.s.hatColor);
  const ox = x / (0.064 * K.wsx), oy = (y - (lm.chinY + 0.092 * K.hs)) / (0.108 * K.hs), d = Math.hypot(ox, oy), inside = d < 1 && fz > 0.15;
  const skinHere = o.r + 0 === 0 ? 0 : 1; void skinHere; void xm; void ym;
  if (inside) {
    const e = sst(0, 0.08, 1 - d);
    // the opening's soft edge: cloth shadow on the skin, a lighter hem line
    const cloth = hijabCloth(K, t, hc);
    o.mixP(cloth, 1 - e);
    o.tint(K.skinSh, 0.26 * sst(0.22, 0.0, 1 - d) * e);
  } else o.copy(hijabCloth(K, t, hc));
}
const tmpCloth = new Px();
/** the cloth itself (also used by the neck): vertical folds with a slow wobble, lighter on top, darker in the hollows, a hint of sheen */
export function hijabCloth(K: Look, t: Tex, hc: RGB): Px {
  const x = t.x, y = t.y, c = tmpCloth.set(hc);
  const wob = vn2(x * 40 + 3, y * 26, 31), fold = 0.5 + 0.5 * Math.sin(x * 165 + wob * 4.2 + y * 28);
  c.mul(0.84 + 0.2 * fold + 0.05 * (wob - 0.5));
  c.mul(0.9 + 0.12 * sst(-0.2, 1, t.ny));
  c.lite(0.06 * sst(0.55, 0.95, fold) * sst(0.2, 1, t.ny));
  c.mul(1 + 0.012 * (rnd(t.q) - 0.5));
  return c;
}
export { hash as _hash };
