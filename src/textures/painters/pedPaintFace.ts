/**
 * The head of the people painter: skin with warm and cool variation, small dark eyes with lids and light grey sclera, soft
 * brows made of hair, a nose that is shaded and not outlined, lips a shade off the skin, ears, beard and stubble as texture,
 * age lines for the elders, and the painted hairline under the hair pieces. Sizes are in "standard metres" (xm from the
 * midline, ym above the eye line, both divided by the head scale), so a big head and a small one carry the same face.
 */
import { eyeEdges } from './pedEyeShape';
import { hairlineFor, knotsAt } from './pedHairline';
import { Px, g2, ln, sst, band, hash, vn2, vn3, rnd, mixc, mulc, type Look, type Tex, type RGB } from './pedPaintShared';

const SCLERA: RGB = [232, 226, 216], SCLERA_SH: RGB = [158, 134, 126], CARUNCLE: RGB = [186, 108, 98], PUPIL: RGB = [12, 10, 10];

export function paintHead(K: Look, t: Tex, o: Px): void {
  const { lm, s, face } = K;
  const x = t.x, y = t.y, z = t.z, ax = Math.abs(x), side = x < 0 ? -1 : 1;
  const xm = ax / K.wsx, ym = (y - lm.eyeY) / K.hs, sx = x / K.wsx;                  // sx > 0 is the side the key light comes from
  const fz = (K.zc - z) / Math.max(0.05, K.rzH);
  const fm = sst(0.02, 0.32, fz);                                                    // 1 on the front of the face
  const edm = K.edm, yN = -0.32 * edm, yM = -0.59 * edm, yChin = -edm;
  const tt = (y - lm.chinY) / (lm.crownY - lm.chinY);
  const ageK = K.wear;   // FACES2: how much living shows, by person (0 child, about 0.15 to 0.85 adults, 1.1 to 1.5 elders)
  const old = K.old, expr = K.expr, tired = expr === 'tired', amused = expr === 'amused';
  o.set(K.skin);
  if ((globalThis as { __pedGrid?: boolean }).__pedGrid) { const gx = Math.floor(xm / 0.005 + 0.5) & 1, gy = Math.floor(ym / 0.005 + 0.5) & 1; o.set(gx ^ gy ? [230, 230, 230] : [40, 40, 90]); if (Math.abs(xm - 0.029) < 0.0006) o.set([255, 0, 0]); if (Math.abs(ym) < 0.0006) o.set([0, 255, 0]); return; }
  // ---------------------------------------------------------------- large form: forehead catches light, the sides of the head fall into shade
  o.mix(K.skinHi, 0.3 * sst(0.5, 0.78, tt) * sst(0.0, 0.6, fz));
  o.tint(K.skinSh, 0.55 * sst(0.55, -0.1, fz) * sst(0.02, 0.4, tt));
  o.mul(1 + 0.05 * side * sst(0.0, 0.07, ax) * fm);
  // lit from above: the brow and forehead catch it, the cheek hollows, the jaw and under the chin fall away
  o.mul(0.93 + 0.14 * sst(-0.4, 0.8, t.ny) + 0.05 * sst(0.5, 0.85, tt));
  // skin that is not one flat colour: slow mottling (smooth, never per texel) and a warmer nose, cheeks and ears
  const mott = vn2(x * 42, y * 42 + z * 30, 3) - 0.5;
  o.mul(1 + 0.07 * mott);
  o.mix(K.skinWarm, 0.14 * (vn3(x * 22, y * 22, z * 22, 9)) * fm);
  o.mix(K.skinCool, 0.1 * sst(0.45, 0.55, vn3(x * 18 + 7, y * 18, z * 18, 10)) * fm);
  if (fm > 0) {
    const jaw = sst(yChin * 0.55, yChin * 0.95, ym);
    o.mix(K.blush, (K.female || K.kidish ? 0.24 : 0.14) * g2(xm - 0.043, 0.022) * g2(ym + 0.018, 0.02) * fm);            // cheeks
    o.mix(K.skinHi, 0.16 * g2(xm - 0.05, 0.016) * g2(ym + 0.0035, 0.011) * fm);                                           // cheekbone catches the light
    o.tint(K.skinSh, 0.2 * g2(xm - 0.052, 0.014) * g2(ym + 0.03, 0.012) * fm);                                           // the hollow under the cheekbone
    o.tint(K.skinSh, 0.34 * (1 - jaw) * sst(0.02, 0.06, xm) * fm);                                                          // jaw underside
    o.tint(K.skinSh, 0.18 * sst(0.062, 0.082, xm) * sst(yChin * 0.5, yChin * 0.2, ym) * fm);                                // the jaw edge turning away
    o.tint(K.skinSh, 0.3 * g2(xm - 0.03, 0.021) * g2(ym - 0.0105, 0.0085) * fm);                                           // eye sockets
    o.tint(K.skinSh, 0.34 * g2(xm - 0.035, 0.03) * g2(ym - 0.0315, 0.0075) * fm * (old ? 1.4 : 1));                        // soft shadow under the brow ridge
    o.mix(K.skinHi, 0.13 * g2(xm - 0.034, 0.028) * g2(ym - 0.0415, 0.007) * fm);                                           // the brow bone above it
    o.tint(K.skinSh, 0.12 * sst(0.07, 0.09, xm) * sst(0.0, 0.04, ym) * fm);                                                // temples
    o.mix(K.skinCool, (0.1 + 0.16 * K.h.bag + (tired ? 0.14 : 0) + 0.1 * Math.min(1.4, ageK)) * g2(xm - 0.03, 0.017) * g2(ym + 0.0105, 0.0055) * fm);   // under-eye
    o.tint(K.skinSh, 0.14 * g2(sx + 0.03, 0.03) * g2(ym - yN * 0.4, 0.04) * fm * sst(0.02, 0.04, -ym - 0.012 + 0.04));      // the cheek on the shaded side of the nose
    // uneven tone: ruddy nose and cheeks, a sallow patch at the temple and a grey cast round the mouth on weathered faces
    if (ageK > 0) {
      const bl = vn3(x * 15 + 3, y * 15, z * 15, 12);
      o.mix(K.blush, 0.16 * ageK * sst(0.45, 0.8, bl) * g2(xm - 0.03, 0.03) * g2(ym + 0.01, 0.03) * fm);
      o.mix(K.skinCool, 0.1 * ageK * sst(0.5, 0.85, vn3(x * 20 + 9, y * 20, z * 20, 13)) * fm);
      o.tint(K.skinSh, 0.1 * ageK * g2(xm, 0.04) * band(yM - 0.012, yM + 0.002, ym, 0.004) * fm);
    }
    // FACES2: weathering that follows living: sun and age spots on the cheeks and temples, redder nose and cheeks with years, and pores at close range
    if (ageK > 0.3) o.tint(K.skinSh, 0.1 * Math.min(1.3, ageK) * sst(0.74, 0.86, vn3(x * 90 + 5, y * 90, z * 90, 21)) * sst(0.0, 0.5, fz) * sst(0.0, -0.05, ym - 0.045));
    if (K.size >= 512) o.tint(K.skinSh, (0.035 + 0.05 * K.h.pore) * sst(0.62, 0.8, vn3(x * 820, y * 820, z * 820, 22)) * g2(xm - 0.02, 0.04) * g2(ym + 0.01, 0.045) * fm);
    // ---------------------------------------------------------------- nose: bridge light, both side planes, wings, nostrils, tip
    const nzone = band(yN - 0.006, 0.0, ym, 0.004);
    o.mix(K.skinHi, 0.2 * g2(xm, 0.0032) * nzone * fm);                                                                      // the bridge
    o.tint(K.skinSh, 0.26 * g2(sx + 0.0125, 0.0055) * band(yN - 0.004, -0.006, ym, 0.004) * fm);                              // the shaded side plane
    o.tint(K.skinSh, 0.12 * g2(sx - 0.0125, 0.0055) * band(yN - 0.004, -0.006, ym, 0.004) * fm);                              // and a lighter one on the lit side
    o.tint(K.skinSh, 0.18 * g2(xm - 0.0135, 0.0045) * g2(ym - (yN + 0.0008), 0.0042) * fm);                                  // the wings
    o.tint(K.skinSh, 0.55 * g2(xm - 0.0092, 0.0036) * g2(ym - (yN + 0.0006), 0.0024) * fm);                                  // nostrils
    o.tint(K.skinSh, 0.24 * g2(ym - (yN - 0.0058), 0.0032) * g2(xm, 0.012) * fm);                                           // under the tip
    o.mix(K.skinHi, 0.16 * g2(xm, 0.0032) * g2(ym - (yN + 0.0042), 0.0026) * fm);                                            // a small highlight on the tip
    o.mix(K.skinWarm, 0.2 * g2(xm, 0.0065) * g2(ym - (yN + 0.0035), 0.005) * fm);                                           // warm tip
    // ---------------------------------------------------------------- age: nasolabial folds, marionette lines
    const fold = 0.03 + 0.15 * Math.min(1.5, ageK) + (tired ? 0.04 : 0) + (amused ? 0.04 : 0);
    const xf = 0.0185 + (yN - ym) * 0.34;
    o.tint(K.skinSh, fold * g2(xm - xf, 0.0034) * band(yM - 0.006, yN + 0.002, ym, 0.004) * fm);
    if (ageK > 0.55) o.tint(K.skinSh, 0.07 * Math.min(1.3, ageK) * g2(xm - 0.0215 + (yM - ym) * 0.2, 0.003) * band(yM - 0.026, yM - 0.004, ym, 0.004) * fm);
    // philtrum
    o.tint(K.skinSh, 0.07 * g2(xm - 0.0055, 0.0017) * band(yM + 0.007, yN - 0.002, ym, 0.002) * fm);

    // ---------------------------------------------------------------- eyes (FACES4)
    // the eye is drawn in map space round a slot: the patch rectangle's middle when this texel is in it (pedEyes.ts builds the lids and the eyeball over exactly this curve), else the eye texel
    // found in the head tile (the mid and far levels show the tile); otherwise by position. The opening's shape is shared with the geometry (pedEyeShape.ts).
    let slot = K.eyes[x < 0 ? 0 : 1];
    const pxq = t.q % K.size, pyq = (t.q / K.size) | 0, rr = K.eyeRect ? K.eyeRect[x < 0 ? 0 : 1] : null;
    let loc = !!slot && Math.abs(pxq - slot.cx) < 60 && Math.abs(pyq - slot.cy) < 40;
    if (rr && pxq >= rr.x0 && pxq < rr.x0 + rr.w && pyq >= rr.y0 && pyq < rr.y0 + rr.h) { slot = rr; loc = true; }
    const exm = loc ? (pxq - slot!.cx) * slot!.dirx * slot!.sx : xm - 0.029;
    const eym = loc ? (slot!.cy - pyq) * slot!.sy : ym;
    const E = K.eye, a = E.a, u = exm / a;
    if (Math.abs(u) < 1.5) {
      const { yu, yl } = eyeEdges(E, u), isOpen = Math.abs(u) < 1;
      const dUp = yu - eym, dLo = eym - yl;
      const lashT = (face.lashes ? 0.0022 : 0.0016) * (1 + 0.5 * sst(0.0, 1.0, u)) * (K.female ? 1.1 : 1);
      const lashC = mixc(K.hairC, [20, 14, 14], 0.6);
      if (isOpen && dUp > 0 && dLo > 0) {
        // inside the opening: the white of the eye (off-white, never pure, yellower with years), shaded under the upper lid and into the corners, then the iris
        const sc = mixc(SCLERA, [224, 210, 182], Math.min(0.6, 0.3 * K.wear));
        const shade = 0.66 * sst(0.0052, 0.0, dUp) + 0.2 * sst(0.0022, 0.0, dLo) + 0.34 * sst(0.45, 1.0, Math.abs(u));
        o.set(sc).mix(SCLERA_SH, Math.min(0.95, shade));
        o.mix([188, 92, 84], (0.06 + 0.12 * Math.min(1.3, K.wear)) * sst(0.55, 0.95, Math.abs(u)) * (0.6 + 0.4 * vn2(exm * 700, eym * 300, 17)));   // a little red in the corners
        o.mix(CARUNCLE, 0.55 * sst(-0.7, -0.94, u) * sst(0.0, 0.0016, dLo));
        o.mix([232, 168, 156], 0.22 * g2(u + 0.86, 0.05) * g2(eym - 0.0006, 0.0013));                                    // the caruncle catches a little light
        const side = x < 0 ? -1 : 1, ri = E.ri, dx0 = exm - E.gx * side, dy0 = eym - E.iy, dIr = Math.hypot(dx0, dy0) / ri;
        if (dIr < 1.0) {
          // iris: striations that fan out from the pupil, a lighter collar, a dark limbal ring at the edge, then the pupil and the catchlights
          const e = sst(1.0, 0.93, dIr), ang = Math.atan2(dy0, dx0), fan = 0.5 + 0.5 * Math.sin(ang * 13 + 2.4 * vn2(ang * 3 + 5, dIr * 4, 15));
          const ic = mixc(mulc(K.irisC, 0.8 + 0.3 * fan), mixc(K.irisC, [176, 142, 96], 0.5), 0.5 * sst(0.35, 0.68, dIr) * (1 - sst(0.68, 0.84, dIr)));
          o.mix(mulc(ic, (1 - 0.78 * sst(0.74, 0.98, dIr)) * (1 + 0.16 * sst(-0.1, -0.8, dy0 / ri))), e);                     // limbal ring; the lower iris takes the light through it
          o.mix(PUPIL, sst(0.42, 0.34, dIr) * e);
          const cxl = dx0 - side * 0.0018, cyl = dy0 - 0.0019;
          o.mix([246, 242, 234], 0.97 * g2(cxl, 0.00085) * g2(cyl, 0.0009) * sst(0.95, 0.6, dIr));                              // the catchlight: toward the key light (model +x), once
          o.mix([236, 232, 226], 0.22 * g2(cxl * 0.7, 0.0026) * g2(cyl * 0.7, 0.0022) * sst(1.0, 0.5, dIr));                    // the sheen round it
          o.mix([226, 222, 216], 0.3 * g2(dx0 + side * 0.0017, 0.0007) * g2(dy0 + 0.0022, 0.0006) * sst(0.95, 0.6, dIr));       // a faint second reflection, opposite
          o.mul(1 - 0.5 * sst(0.0044, 0.0003, dUp));                                                                          // the lid shades the top of the iris
        }
        o.tint(K.skinSh, 0.5 * sst(0.0016, 0.0, dUp));                                                                         // the upper lid's shadow on the ball (the lid has thickness)
        o.mix([236, 226, 216], 0.22 * g2(dLo - 0.0003, 0.00035) * sst(0.95, 0.5, Math.abs(u)));                                 // the wet line along the lower lid
        // lash line on the upper lid, thick and dark; a fine line under the lower lid
        o.mix(lashC, 0.96 * sst(lashT * 1.25, 0.0, dUp));
        o.mix(mixc(K.skinSh, [40, 24, 22], 0.4), 0.2 * sst(0.0008, 0.0, dLo));
      } else if (isOpen) {
        // outside: the lid skin, its crease above, the lower lid
        const lidAbove = eym - yu, lidBelow = yl - eym;
        if (lidAbove > 0 && lidAbove < 0.0075) {
          o.mix(mixc(K.skin, K.skinHi, 0.5), 0.2 * sst(0.0006, 0.002, lidAbove) * sst(0.0058, 0.0035, lidAbove));
          o.tint(K.skinSh, (0.1 + 0.08 * E.heavy) * sst(0.0, 0.002, lidAbove) * sst(0.0058, 0.0035, lidAbove));                  // the lid itself, a touch shaded
          o.tint(K.skinSh, 0.46 * g2(lidAbove - 0.0058, 0.0013) * (tired ? 1.25 : 1) * (0.8 + 0.5 * K.h.lid + 0.3 * E.heavy));   // lid crease
          o.mix(lashC, 0.92 * sst(lashT * 1.25, 0.0, lidAbove));
        }
        if (lidBelow > 0 && lidBelow < 0.0045) {
          o.tint(K.skinSh, 0.1 * sst(0.0, 0.001, lidBelow) * sst(0.0045, 0.0015, lidBelow));                                    // the lower lid, a touch shaded
          o.mix([176, 100, 94], 0.32 * sst(0.0009, 0.0, lidBelow));                                                              // the moist rim of the lid
          o.mix(K.skinHi, 0.2 * g2(lidBelow - 0.0019, 0.0007));                                                                  // the lid's edge catches light
        }
      }
    }
    // crow's feet and under-eye lines
    if (ageK > 0) {
      const cf = 0.14 * ageK;
      for (let i = 0; i < 3; i++) {
        const ang = -0.45 + i * 0.4, dxr = exm - 0.0145, dyr = ym - 0.001;
        const d = (dxr * Math.sin(ang) - dyr * Math.cos(ang)), r = dxr * Math.cos(ang) + dyr * Math.sin(ang);
        o.tint(K.skinSh, cf * g2(d, 0.0014) * band(0.004, 0.015, r, 0.003) * (0.6 + 0.4 * vn2(r * 300, i, 4)));
      }
    }
    if (ageK > 0) {
      o.tint(K.skinSh, (0.05 + 0.1 * K.h.bag) * (0.4 + ageK) * g2(xm - 0.03, 0.014) * g2(ym + 0.0185, 0.0035));                                                     // eye bag edge
      for (let i = 0; i < 4; i++) {                                                                                                // forehead lines, broken and wavy
        const yl2 = 0.03 + i * 0.0062, w = vn2(xm * 120 + i * 5, i, 6);
        o.tint(K.skinSh, 0.1 * Math.min(1.4, ageK * ageK + 0.1) * g2(ym - yl2 - 0.002 * (w - 0.5), 0.0012) * sst(0.075, 0.055, xm) * sst(0.25, 0.55, w) * sst(0.1, 0.4, fz));
      }
      o.tint(K.skinSh, 0.12 * g2(xm - 0.0055, 0.0016) * band(0.014, 0.03, ym, 0.003));                                            // between the brows
    }

    // ---------------------------------------------------------------- brows: strokes of hair, thick at the inner end, thin at the tail
    const bt = (xm - (0.009 + 0.008 * K.h.bg)) / 0.034;                                                                                               // 0 inner .. 1 tail
    if (bt > -0.1 && bt < 1.12) {
      const broad = face.brows === 'thick' ? 1.35 : face.brows === 'thin' ? 0.85 : 1.1;
      const wB = 0.0030 * broad * (0.66 + 0.82 * K.h.bw) * (1.15 - 0.62 * Math.pow(Math.max(0, bt), 1.3)) * (old ? 0.8 : 1);
      const lift = (tired ? 0.0009 : amused ? 0.0012 : 0.0003) * (1 - bt * 2) ;
      const arch = (face.brows === 'arched' ? 0.0033 : 0.0021) * (0.55 + 1.1 * K.h.ba) * Math.sin(Math.PI * Math.min(1, Math.max(0, bt * 0.85 + 0.12)));
      const yb = 0.0188 + arch + lift - (tired ? 0.0016 : 0.0004) * bt * bt;
      const d = (ym - yb) / wB;
      if (d > -1.3 && d < 1.3) {
        const strands = 0.7 + 0.3 * vn2(xm * 320, ym * 90 + 3, 7);
        const edge = sst(1.25, 0.35, Math.abs(d)) * strands;
        const body = edge * sst(1.12, 0.78, bt) * sst(-0.12, 0.08, bt) * (0.7 + 0.3 * sst(1.0, 0.0, bt));
        o.mix(mixc(mulc(K.hairC, 0.72), K.skin, old ? 0.36 : 0.1), Math.min(0.97, body * 1.3));
      }
    }

    // ---------------------------------------------------------------- mouth: lips as form (FACES4: a cupid's bow and a darker upper surface, a fuller lower lip that catches light on top, a soft border, thin / medium / full by person, drier and paler with age)
    const mx = xm / K.mouthMw;
    const gm = face.mouth, cornerLift = (gm === 'grin' ? 0.0032 : amused ? 0.0014 : 0.0002);   // FACES3: no painted droop (the geometry carries each person's resting expression)
    const my = ym - yM - cornerLift * mx * mx;
    const lf = K.lipFull * (old ? 0.82 : 1), upH = 0.0066 * lf * (1 - 0.45 * mx * mx) * (old ? 0.75 : 1), loH = 0.0094 * lf * (1 - 0.7 * mx * mx) * (old ? 0.8 : 1);
    const upTop = upH * (1 - 0.3 * g2(mx, 0.17) + 0.14 * g2(mx - 0.3, 0.13));                       // the bow: a dip in the middle between two peaks
    if (mx < 1.12) {
      const lipE = sst(1.08, 0.7, mx), pale = Math.min(0.4, 0.28 * Math.min(1.5, ageK));
      const lipUp = mixc(mulc(K.lipC, 0.88), K.skin, pale * 0.7), lipLo = mixc(K.lipC, K.skin, pale);
      const inUp = my > -0.0004 && my < upTop, inLo = my <= 0.0004 && my > -loH;
      if (inUp) {
        const edge = sst(upTop, upTop * 0.55, my);                                                    // the vermilion border is soft, not a line
        o.mix(lipUp, 0.9 * lipE * edge); o.tint(K.skinSh, 0.14 * lipE * sst(0.2, 1.0, my / upTop));
        o.mix(K.lipHi, 0.1 * g2(my - upTop * 0.35, upTop * 0.25) * g2(mx - 0.25, 0.22) * lipE);       // the upper lip's lit front on each side of the bow
      }
      if (inLo) {
        const edge = sst(-loH, -loH * 0.7, my);
        o.mix(lipLo, 0.9 * lipE * edge);
        o.mix(K.lipHi, 0.62 * g2(my + loH * 0.42, loH * 0.3) * g2(mx, 0.44) * lipE * (1 - 0.5 * pale));  // the lower lip's top catches the light
        o.tint(K.skinSh, 0.1 * lipE * sst(-loH * 0.55, -loH * 0.95, my));                             // and turns under at the bottom
        o.tint(K.skinSh, 0.07 * g2(mx, 0.05) * sst(-loH * 0.1, -loH * 0.9, my) * lipE);               // a faint central crease
      }
      if (gm === 'grin' && Math.abs(my) < 0.0032 * (1 - mx * mx) && mx < 0.78) o.set([222, 216, 205]).mix(K.lipDark, 0.1 + 0.4 * sst(0.0015, 0.0032, Math.abs(my)));
      // the seam between the lips, dark and thin, fading toward the soft corners, then the soft shadow under the lower lip
      o.mix(mulc(K.lipDark, 0.66), (0.62 * g2(my - 0.0001, 0.0007)) * sst(1.0, 0.45, mx) + 0.16 * g2(mx - 0.98, 0.1) * g2(my, 0.0012));
      o.tint(K.skinSh, 0.3 * g2(my + loH + 0.0035, 0.0042) * sst(0.95, 0.2, mx));                                                      // under the lower lip
      o.tint(K.skinSh, 0.12 * g2(my - upTop - 0.0032, 0.0035) * sst(0.8, 0.0, mx));                                                    // under the nose, above the lip
      o.mix(K.skinHi, 0.12 * g2(my - upTop - 0.0006, 0.0006) * sst(0.8, 0.1, mx));                                                     // the border's faint light edge
    }
    // the two ridges of the philtrum above the bow
    o.mix(K.skinHi, 0.07 * g2(xm - 0.0095, 0.0016) * band(yM + upH, yN - 0.002, ym, 0.002) * fm);
    // chin: a faint dimple, and a darker fold above the chin
    o.tint(K.skinSh, 0.14 * g2(xm, 0.006) * g2(ym - yChin * 0.86, 0.006));

    // ---------------------------------------------------------------- reading the face from 5 to 15 m, where it is a few pixels: broad dark shapes in the places a face keeps them
    o.tint(K.skinSh, 0.32 * g2(xm - 0.031, 0.03) * g2(ym - 0.006, 0.016) * fm);                                                // the eye band
    o.tint(K.skinSh, 0.26 * g2(xm - 0.034, 0.032) * g2(ym - 0.022, 0.0075) * fm);                                                // under the brow
    o.mix(mulc(K.lipDark, 0.8), 0.3 * g2(my, 0.0030) * sst(1.1, 0.4, mx) * (mx < 1.2 ? 1 : 0));                              // the mouth line, wider
    o.tint(K.skinSh, 0.22 * g2(xm, 0.014) * g2(ym - (yN - 0.004), 0.0065) * fm);                                              // the nose underside

    // ---------------------------------------------------------------- freckles and a mole, a few people
    if (K.grp === 'wh' || K.grp === 'hj' || K.grp === 'mx' || K.grp === 'la') if (K.h.fr < 0.22) {
      const fr = sst(0.74, 0.86, vn3(x * 380, y * 380, z * 380, 11));
      o.mix(mulc(K.skin, 0.8), 0.28 * fr * g2(xm - 0.03, 0.028) * g2(ym - yN * 0.35 + 0.002, 0.02));
    }
    if (K.h.mol < 0.18) {
      const mxp = 0.02 + 0.03 * K.h.mxp, myp = -0.015 - 0.05 * K.h.myp;
      o.mix(mulc(K.skinSh, 0.8), 0.7 * g2(Math.hypot(sx - mxp, ym - myp), 0.0016));
    }

  } else {
    // the back and sides of the head: shade only
    o.tint(K.skinSh, 0.05);
  }
  // beard and stubble run on round the jaw to the sideburns and ear, fading out toward the back of the head (a beard that stopped at the cheek showed as a hard vertical edge)
  if (fz > -0.75) beardPass(K, t, o, xm, ym, sx, fz);

  // ---------------------------------------------------------------- ears: warm rim, dark bowl, pink lobe
  const earM = sst(0.072, 0.082, ax) * g2(ym + 0.026, 0.034) * g2(fz + 0.02, 0.3);   // FACES: limited front to back to the ear itself (it ran as a pale line across the whole side of the head)
  if (earM > 0.02) {
    o.mix(K.skinWarm, 0.32 * earM);
    o.tint(K.skinSh, 0.34 * earM * sst(0.0, 0.6, -t.nz * 0.5 + 0.5 * Math.abs(t.nx) * -1 + 0.4) * g2(ym + 0.026, 0.015));
    o.mix(K.skinWarm, 0.18 * earM * g2(ym + 0.052, 0.008));
  }

  // ---------------------------------------------------------------- the scalp under the hair meshes and the hairline's soft edge (FACES4)
  // The hair shell ends in an edge; below it the skin should not meet it as a ruled line. The rim follows the style's table (pedHairline.ts, the same one the shell is built from): solid hair colour just under it (this
  // also covers the few mm the morph moves the rim), then hair-coloured stubble that fades into skin over about 8 mm, irregular, a widow's peak on some, grey with age.
  const kn = hairlineFor(s.hair);
  if (kn) {
    const az = Math.abs(Math.atan2(x, K.zc - z));
    let yRim = lm.chinY + (knotsAt(kn, az) + 0.014 * Math.sin(az * 3 + 1.3) + 0.008 * Math.sin(az * 6 + 0.7)) * (lm.crownY - lm.chinY);
    if (K.h.fr < 0.2 || K.h.mol < 0.1) yRim -= 0.014 * Math.exp(-Math.pow(az / 0.24, 2)) * sst(0.1, 0.3, (K.zc - z) / Math.max(0.05, K.rzH));   // a widow's peak on a few
    const d = yRim - y, nz = vn3(x * 300 + 4, y * 300, z * 300, 31), nz2 = vn3(x * 90, y * 90 + 2, z * 90, 32);
    if (d < 0.022) {
      const grey = K.old ? 0.45 : 0, stub = mixc(mixc(K.skin, K.hairC, 0.8), [150, 146, 142], grey);
      const wide = 0.0075 * (0.65 + 0.7 * nz2) * (K.old ? 1.1 : 1) * sst(0.1, 0.45, az + 0.2);                       // the front line is the finest
      const fade = 1 - sst(0.004, 0.004 + wide, d);
      o.mix(stub, d < 0.004 ? 0.96 : Math.min(0.9, fade * (0.55 + 0.6 * sst(0.3, 0.75, nz)) * 0.9));
      if (d >= 0.004 && d < 0.004 + wide) o.tint(K.skinSh, 0.1 * fade);                                              // the roots show as a faint shadow
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
/** beard, moustache and stubble: a texture with an edge, not a box (its own function: it reaches further round the head than the front-of-face features) */
function beardPass(K: Look, t: Tex, o: Px, xm: number, ym: number, sx: number, fz: number): void {
  const { face } = K, old = K.old, expr = K.expr, tired = expr === 'tired', amused = expr === 'amused';
  const edm = K.edm, yN = -0.32 * edm, yM = -0.59 * edm, yChin = -edm, sfade = sst(-0.75, -0.05, fz);
  const mx = xm / K.mouthMw, gm = face.mouth, cornerLift = (gm === 'grin' ? 0.0032 : amused ? 0.0014 : 0.0002);   // FACES3: no painted droop (the geometry carries each person's resting expression)
  const my = ym - yM - cornerLift * mx * mx;
  const upH = 0.0066 * (1 - 0.45 * mx * mx) * (old ? 0.75 : 1), loH = 0.0094 * (1 - 0.7 * mx * mx) * (old ? 0.8 : 1);
  // ---------------------------------------------------------------- beard, moustache, stubble: a texture with an edge, not a box
  // some men without any facial hair still carry a five o'clock shadow
  const shadow5 = !face.beard && !face.mustache && !face.stubble && !K.female && !K.kidish && K.h.f5 < 0.5;
  const hairy = !!(face.beard || face.mustache || face.stubble) || shadow5;
  if (hairy) {
    const topEdge = yM + 0.007 + 0.034 * sst(0.02, 0.078, xm);                          // the cheek line, high by the ear, low by the mouth
    const botEdge = yChin - 0.03 - 0.01 * sst(0.0, 0.06, xm);
    const inJaw = sst(topEdge + 0.004, topEdge - 0.004 - 0.008 * (face.beard ? 0 : 1), ym) * sst(botEdge, botEdge + 0.012, ym) * sst(0.084, 0.07, xm);
    const lipHole = 1 - 0.9 * sst(1.0, 0.8, mx) * band(-loH, upH, my, 0.0012);
    const stache = (face.mustache || face.beard) ? sst(0.036, 0.02, xm) * band(yM + 0.004 - 0.2 * xm, yN - 0.0025 - 0.12 * Math.max(0, xm - 0.008), ym, 0.0038) : 0;
    const strand = vn3(sx * 330 + 11, ym * 120, t.z * 330, 13), grainN = vn3(sx * 300, ym * 300, t.z * 300, 14);
    let dens = 0;
    if (face.beard) dens = Math.max(inJaw * lipHole, stache * lipHole);
    else if (face.stubble || shadow5) dens = (shadow5 ? 0.26 : 0.4) * Math.max(inJaw * sst(0.0, 0.03, -ym + 0.035 - 0.04 * sst(0.03, 0.07, xm)), stache) * lipHole;
    else if (face.mustache) dens = stache * lipHole;
    if (dens > 0) {
      const thresh = face.beard || face.mustache ? 0.5 : 0.62;
      const a = Math.min(0.95, Math.max(0, (dens - 0.18 + (grainN - 0.5) * 0.5) * (face.beard || face.mustache ? 2.0 : 1.3)) * sfade);
      const full = !!(face.beard || face.mustache);
      if (!full) {
        // stubble is a soft grey-brown shade on the skin with a little unevenness, never specks
        const sh = Math.min(1, dens * (0.8 + 0.7 * grainN) * 1.6) * sfade;
        o.mix(mixc(mulc(K.skin, 0.52), mixc(K.hairC, [30, 26, 30], 0.5), 0.45), Math.min(0.62, sh * 0.62));
        o.tint(K.skinCool, 0.18 * sh);
      } else {
      const hc = full ? mixc(mulc(K.hairC, K.old ? 0.8 + 0.16 * strand : 0.8 + 0.4 * strand), K.skin, (K.old ? 0.1 : 0.18) * (1 - strand)) : mixc(mulc(K.skin, 0.58), K.hairC, 0.4);
      o.mix(hc, a * (dens > thresh ? 1 : 0.8) * (K.old ? 0.85 : 1));
      }
    }
  }
}

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
