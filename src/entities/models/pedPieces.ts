export { HAIR_IDS, BEARD_IDS } from './pedHairPieces';
import { buildHair, buildBeard, type HairId, type BeardId } from './pedHairPieces';
import type { Ctx } from './pedPiecesKit';
export const hairPiece = (id: HairId, ctx: Ctx) => buildHair(id, ctx);
export const beardPiece = (id: BeardId, ctx: Ctx) => buildBeard(id, ctx);
export const HAT_IDS: string[] = [], ACCESSORY_IDS: string[] = [], ACC_HEAD: string[] = [], SHOE_IDS: string[] = [], SHOWCASE_PEOPLE: string[] = [];
