/**
 * Layering of the body below the head: which of skin, shoe, trousers and top covers a texel, with soft edges. The hem of a top,
 * the neckline, the sleeve end and the top of the shoe are each one level line round the body whatever the bone weights say.
 */
import { HEM_Y } from '@/entities/models/pedLegs';
import { shortsLen } from './ped';
import { Px, sst } from './pedPaintShared';
import type { Look, Tex } from './pedPaintShared';
import { paintSkinBody, paintShoeSkin, paintBottom, paintTop } from './pedPaintCloth';
import { hijabCloth } from './pedPaintFace';
import { rgb } from './pedPaintShared';

/** FIT: the base of the neck, where a top's neckline sits at the centre back, from the person's own shoulder joint (shY) and head size (hs = head height / 0.2285) */
export const neckBaseY = (shY: number, hs: number, kind: string): number => shY + (kind === 'hoodie' || kind === 'puffer' || kind === 'tracksuit' || kind === 'jacket' ? 0.079 : 0.065) * hs;

export interface NeckParams { shY: number; hs: number; kind: string; style?: string; neck?: string; open?: boolean }
/** FIT-TOPS: how far the front of the neckline drops below the neck base (m at head scale 1) for a kind of top and its neck style */
export function neckDip(kind: string, style?: string, neck?: string): number {
  if (neck === 'scoop') return 0.07; if (neck === 'wide') return 0.05; if (neck === 'roll') return -0.02; if (neck === 'band') return 0.012; if (neck === 'henley') return 0.03;
  return kind === 'scrubs' ? 0.075 : kind === 'blouse' ? 0.04 : kind === 'dress' ? (style === 'wrap' ? 0.1 : 0.045) : kind === 'uniform' ? 0.02 : kind === 'jersey' ? 0.04 : kind === 'tee' ? 0.032 : 0.008;
}
/** FIT-TOPS: the height of a top's neckline at body position (x, z): the neck base at the back, dropping to the front by the style's dip, a V when the layer is open, rising over the shoulder */
export function necklineY(p: NeckParams, x: number, z: number): number {
  const hk = p.hs, ax = Math.abs(x), fr0 = sst(-0.045, -0.11, z), cdip = neckDip(p.kind, p.style, p.neck);
  const w = (p.neck === 'wide' ? 0.13 : p.neck === 'scoop' ? 0.1 : 0.085) * hk, u = ax >= w ? 0 : Math.pow(1 - (ax / w) * (ax / w), 0.7);      // a round U, not a box
  const vee = Math.max(0, 1 - ax / (0.075 * hk));
  return neckBaseY(p.shY, hk, p.kind) - cdip * hk * fr0 * u
    + (p.open && fr0 > 0.3 ? -0.055 * hk * vee : 0) + 0.03 * hk * sst(0.07 * hk, 0.13 * hk, ax) + (p.neck === 'roll' ? 0.02 * hk : 0);
}
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
  // FIT-TOPS: the neckline is one function of (x, z) shared with the collar geometry (pedMesh.clothExtras -> pedCuts.necklineLoop), so the painted edge and the ring agree
  const neckY = necklineY({ shY: K.shY, hs: K.hs, kind: k, style: top.style, neck: top.neck, open: K.open }, t.x, t.z);
  const shoeTop = K.shoeTop;
  const hemBot = bot.kind === 'shorts' ? K.knY + shortsLen(bot.cut) : bot.kind === 'skirt' ? 9 : -9;
  let aTop = 0, aBot = 0, aShoe = 0;
  if (arm) { aTop = sleeves === 'none' || outerArms === null || hand ? 0 : sst(sleeveEnd - eps, sleeveEnd + eps, y); }
  else if (leg) {
    if (k !== 'dress') aTop = sst(hemTop - eps, hemTop + eps, y);
    // PEOPLE6: under cut trouser tubes the shoe is its own geometry and the whole tube down to its hem's lower edge is cloth (the cuff lip is not shoe)
    const covered = bot.kind === 'jeans' || bot.kind === 'trousers' || bot.kind === 'cargo' || bot.kind === 'sweats' || bot.kind === 'leggings', stTop = covered ? HEM_Y - 0.012 : shoeTop;
    aBot = bot.kind === 'skirt' ? 0 : sst(hemBot - eps, hemBot + eps, y) * (covered ? sst(stTop - 0.012, stTop - 0.002, y) : sst(shoeTop - 0.03, shoeTop - 0.012, y));
    aShoe = sst(stTop + eps, stTop - eps, y);
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
