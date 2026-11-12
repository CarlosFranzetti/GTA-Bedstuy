/**
 * The separate pieces of a person (PEDHAIR): hair and beards, headwear, accessories, shoes. This file picks what a PedSpec wears
 * (`piecesFor`) and builds it fitted to the person's dressed skin (see pedPiecesKit.ts). Nothing here reads lettering or a logo.
 *
 *   hair      pedHairPieces.ts   21 styles + 3 beards
 *   headwear  pedHeadwear.ts     17 pieces
 *   gear      pedGear.ts         12 accessories and bags
 *   shoes     pedShoes.ts        6 shoes
 *
 * Wiring in pedMesh.geometryFor (hi and mid levels): `parts.push(...piecesFor(makeCtx(shape, spec, bt, L0, peopleRig(s, spec), detail)).map((p) => p.geo))`
 * in place of headParts, bodyParts' bags and shoeParts (the rest of bodyParts, skinExtras and clothExtras stay).
 */
import type { PedSpec } from '@/textures/painters/ped';
import { rnd, type Ctx, type Piece } from './pedPiecesKit';
import { BEARD_IDS, HAIR_IDS, buildBeard, buildHair, type BeardId, type HairId } from './pedHairPieces';
import { HAT_IDS, buildHat, type HatId } from './pedHeadwear';
import { ACCESSORY_IDS, ACC_HEAD, buildAccessory, type AccessoryId } from './pedGear';
import { SHOE_IDS, buildShoes, shoeIdFor, type ShoeId } from './pedShoes';

export { HAIR_IDS, BEARD_IDS, HAT_IDS, ACCESSORY_IDS, ACC_HEAD, SHOE_IDS, shoeIdFor };
export type { HairId, BeardId, HatId, AccessoryId, ShoeId };
export { makeCtx } from './pedPiecesKit';
export const hairPiece = (id: HairId, ctx: Ctx): Piece => buildHair(id, ctx);
export const beardPiece = (id: BeardId, ctx: Ctx): Piece => buildBeard(id, ctx);
export const hatPiece = (id: HatId, ctx: Ctx): Piece => buildHat(id, ctx);
export const accessoryPiece = (id: AccessoryId, ctx: Ctx): Piece => buildAccessory(id, ctx);
export const shoePieces = (id: ShoeId, ctx: Ctx): Piece[] => buildShoes(id, ctx);

/** a person from the roster used for the review sheets */
export const SHOWCASE_PEOPLE = ['ba-hoodie-fade', 'ba-puffer-braids', 'hj-man', 'me-hijabi', 'wh-elder', 'la-delivery', 'ca-nurse', 'wh-tote', 'ba-sundress', 'ea-office'];

// ---------------------------------------------------------------- what a spec wears

/** pieces named by the roster's hair styles (existing names map to one of the new styles, some by a stable pick for variety) */
export function hairIdFor(spec: Pick<PedSpec, 'id' | 'hair'>): HairId | null {
  const r = rnd(spec.id, 7), h = spec.hair as string;
  switch (h) {
    case 'bald': return null;
    case 'fade': return r < 0.3 ? 'highTop' : 'lowFade';
    case 'short': return r < 0.3 ? 'crop' : 'short';
    case 'crop': return 'crop';
    case 'curly': return 'curls';
    case 'afro': return r < 0.4 ? 'afroLarge' : 'afro';
    case 'braids': return r < 0.4 ? 'cornrows' : 'boxBraids';
    case 'twists': return 'twists';
    case 'locs': return r < 0.35 ? 'locsShort' : 'locs';
    case 'puff': return 'puff';
    case 'bun': return 'bun';
    case 'ponytail': return 'ponytail';
    case 'bob': return 'bob';
    case 'long': return r < 0.4 ? 'wavy' : 'long';
    case 'waves': return 'wavy';
    case 'thinning': return 'receding';
    case 'peyot': return 'peyos';
    // names the painter may add later
    case 'hightop': return 'highTop'; case 'cornrows': return 'cornrows'; case 'afroL': return 'afroLarge'; case 'locsS': return 'locsShort'; case 'recede': return 'receding'; case 'boxbraids': return 'boxBraids'; case 'wavy': return 'wavy';
    default: return (HAIR_IDS as readonly string[]).includes(h) ? (h as HairId) : 'short';
  }
}
export function hatIdFor(spec: Pick<PedSpec, 'id' | 'hat'>): HatId | null {
  const h = spec.hat as string, r = rnd(spec.id, 11);
  switch (h) {
    case 'none': return null;
    case 'cap': return r < 0.4 ? 'snapback' : 'fitted';
    case 'church': return 'churchHat';
    case 'headwrap': return 'headscarf';
    case 'flat': return 'flatCap';
    case 'cop': return 'policeCap';
    case 'hardhat': return 'hardHat';
    case 'helmet': return 'bikeHelmet';
    case 'durag': case 'beanie': case 'fedora': case 'hijab': case 'kufi': case 'kippah': case 'bucket': case 'snapback': case 'scarf': return h === 'scarf' ? 'headscarf' : (h as HatId);
    case 'hood': return 'hoodUp'; case 'hoodDown': return 'hoodDown';
    default: return (HAT_IDS as readonly string[]).includes(h) ? (h as HatId) : null;
  }
}
export function beardIdsFor(spec: Pick<PedSpec, 'id' | 'face' | 'age'>): BeardId[] {
  const out: BeardId[] = [];
  if (spec.face.beard) out.push(rnd(spec.id, 3) < 0.3 ? 'goatee' : 'beard');
  else if (spec.face.mustache) out.push('stache');
  return out;
}
export function accessoryIdsFor(spec: Pick<PedSpec, 'id' | 'face' | 'age' | 'sex' | 'gear' | 'hat' | 'hair' | 'role'>): AccessoryId[] {
  const out: AccessoryId[] = [], roll = rnd(spec.id, 1), grown = spec.age !== 'kid', hat = hatIdFor(spec);
  if (spec.face.glasses) out.push(spec.role === 'dj' || /^#1[0-9a-f]{5}$/i.test(spec.face.glasses) && rnd(spec.id, 5) < 0.5 ? 'sunglasses' : 'glasses');
  switch (spec.gear) {
    case 'backpack': out.push('backpack'); break;
    case 'tote': out.push('tote'); break;
    case 'messenger': out.push('messenger'); break;
    case 'bag': out.push(spec.sex === 'f' ? 'handbag' : rnd(spec.id, 9) < 0.5 ? 'shoppingBag' : 'handbag'); break;
    default: break;
  }
  const hasBag = spec.gear !== 'none';
  const adult = spec.age === 'adult' || spec.age === 'teen';
  if (adult && !hat && spec.hair !== 'afro' && spec.hair !== 'afroL' && roll < 0.1) out.push('headphones');
  else if (adult && !hat && roll < 0.17) out.push('earbuds');
  else if (grown && roll >= 0.17 && roll < 0.24 && hat !== 'hijab' && hat !== 'hoodUp') out.push('scarf');
  else if (grown && roll >= 0.24 && roll < 0.3 && spec.sex !== 'f') out.push('chain');
  if (spec.age === 'old' && rnd(spec.id, 13) < 0.5 && !(hasBag && spec.gear === 'bag')) out.push('cane');
  return out;
}

export interface PersonPieces { pieces: Piece[]; hair: HairId | null; hat: HatId | null; beards: BeardId[]; accessories: AccessoryId[]; shoe: ShoeId }
/** every piece a person wears, built for the context (hair, beard, hat, accessories, both shoes) */
export function personPieces(ctx: Ctx): PersonPieces {
  const spec = ctx.spec, hair = hairIdFor(spec), hat = hatIdFor(spec), beards = beardIdsFor(spec), accessories = accessoryIdsFor(spec), shoe = shoeIdFor(spec);
  ctx.underHat = hat !== null;
  const pieces: Piece[] = [];
  if (hair) { const p = buildHair(hair, ctx); if (p.tris > 0) pieces.push(p); }
  for (const b of beards) pieces.push(buildBeard(b, ctx));
  if (hat) pieces.push(buildHat(hat, ctx));
  for (const a of accessories) pieces.push(buildAccessory(a, ctx));
  pieces.push(...buildShoes(shoe, ctx));
  return { pieces, hair, hat, beards, accessories, shoe };
}
export const piecesFor = (ctx: Ctx): Piece[] => personPieces(ctx).pieces;
