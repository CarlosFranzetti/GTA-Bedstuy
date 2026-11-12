/**
 * Layering of the body below the head: which of skin, shoe, trousers and top covers a texel, with soft edges. The hem of a top,
 * the neckline, the sleeve end and the top of the shoe are each one level line round the body whatever the bone weights say.
 */
import { Px, sst } from './pedPaintShared';
import type { Look, Tex } from './pedPaintShared';
import { paintSkinBody, paintShoeSkin, paintBottom, paintTop } from './pedPaintCloth';
import { hijabCloth } from './pedPaintFace';
import { rgb } from './pedPaintShared';

const eps = 0.0035;
const lShoe = new Px(), lBot = new Px(), lTop = new Px();

export function paintBody(K: Look, t: Tex, o: Px): void {
  const { top, bot, s, k } = K, y = t.y, z = t.z, ax = Math.abs(t.x);
  const arm = t.wa > 0.5, leg = t.wl > 0.5, hand = arm && y < K.wrY - 0.002;
  const sleeves = top.sleeves, hemTop = K.hemTop, shX = K.shX, shY = K.shY;
  const outerArms = k === 'vest' || k === 'apron' ? K.underC : K.topC;
  const sleeveEnd = sleeves === 'short' ? K.elY + (shY - K.elY) * 0.42 : sleeves === 'long' ? K.wrY + 0.012 : k === 'jersey' ? shY - 0.05 : 9;
  const front = (zz: number): number => sst(-0.045, -0.11, zz);
  const fr0 = front(z);
  const cdip = k === 'scrubs' ? 0.075 : k === 'blouse' ? 0.04 : k === 'dress' ? 0.045 : k === 'uniform' ? 0.02 : k === 'jersey' ? 0.04 : k === 'tee' ? 0.032 : 0.008;
  const neckY = (k === 'hoodie' || k === 'puffer' || k === 'tracksuit' || k === 'jacket' ? 1.512 : 1.498) - cdip * fr0 * (1 - sst(0.04, 0.1, ax))
    + (K.open && fr0 > 0.3 ? -0.05 * (1 - sst(0.0, 0.09, ax)) : 0) + 0.03 * sst(0.05, 0.1, ax);
  const shoeTop = K.shoeTop;
  const hemBot = bot.kind === 'shorts' ? K.knY + 0.09 : bot.kind === 'skirt' ? 9 : -9;
  let aTop = 0, aBot = 0, aShoe = 0;
  if (arm) { aTop = sleeves === 'none' || outerArms === null || hand ? 0 : sst(sleeveEnd - eps, sleeveEnd + eps, y); }
  else if (leg) {
    if (k !== 'dress') aTop = sst(hemTop - eps, hemTop + eps, y);
    aBot = bot.kind === 'skirt' ? 0 : sst(hemBot - eps, hemBot + eps, y) * sst(shoeTop - 0.03, shoeTop - 0.012, y);
    aShoe = sst(shoeTop + eps, shoeTop - eps, y);
  } else {
    const aNeck = sst(neckY + 0.0045, neckY - 0.0045, y);
    aTop = aNeck * sst(hemTop - eps, hemTop + eps, y) * (sleeves === 'none' && k !== 'jersey' ? 1 - sst(shX * 0.8 - 0.004, shX * 0.8 + 0.004, ax) * sst(shY - 0.03, shY - 0.012, y) : 1);
    aBot = aNeck;
    if (s.hat === 'hijab' && y >= neckY - 0.005) { o.copy(hijabCloth(K, t, rgb(s.hatColor))); return; }
  }
  paintSkinBody(K, t, o, hand, leg, arm);
  if (aShoe > 0) { paintShoeSkin(K, t, lShoe); o.mixP(lShoe, aShoe); }
  if (aBot > 0) { paintBottom(K, t, lBot, leg); o.mixP(lBot, aBot); }
  if (aTop > 0) { paintTop(K, t, lTop, arm, leg, neckY, fr0); o.mixP(lTop, aTop); }
  // where the neckline meets the skin, the cloth throws a soft shadow onto the neck and chest
  if (!arm && !leg && aTop < 0.99) o.mul(1 - 0.16 * Math.exp(-(((y - neckY) / 0.012) ** 2)) * (1 - aTop));
}
