/**
 * Garment fit numbers (CLOTHES seat, body team, 22 Nov 2026): one place for how much cloth stands off the skin, by garment. The torso and sleeves
 * of a person are the body mesh offset along its normals (pedMesh.dressLodBody), so these thicknesses ARE the ease at the body's own surface: they
 * are added to whatever the body is (slim, heavy, wide), never to a constant size.
 *
 * Ease key (docs/reference/clothing-brooklyn.md): skin-close 0 to 4 cm round the chest, regular 8 to 12, relaxed 14 to 20, oversized 24 to 36.
 * Round a chest of 100 cm, a radial offset of t metres adds 2 pi t of girth, so a T-shirt at 5 mm is 3 cm of ease, a jacket at 14 mm 9 cm, a hoodie at
 * 17 mm 11 cm, a puffer at 30 mm 19 cm (puffed). The sleeve gets 0.85 of the body's value (arm girth is smaller and the arm moves inside the sleeve).
 *
 * pedMesh.ts keeps its own copy of THICK_SKIN and THICK_BOT_SKIN until BODY swaps them for these (two imports); `clothThickAt` is what POSE
 * reads to keep an arm out of a coat.
 */
import type { PedSpec } from '@/textures/painters/ped';

type TopKind = PedSpec['top']['kind'];
type BottomKind = PedSpec['bottom']['kind'];

/** radial thickness of the top over the skin at the chest and belly (m) */
export const THICK_TOP: Partial<Record<TopKind, number>> = { puffer: 0.03, hoodie: 0.017, jacket: 0.014, cardigan: 0.013, uniform: 0.011, tracksuit: 0.01, vest: 0.01, apron: 0.008, jersey: 0.005, tee: 0.005, blouse: 0.005, scrubs: 0.006, dress: 0.005 };
/** radial thickness of the bottom over the skin at the thigh (m) */
export const THICK_BOTTOM: Partial<Record<BottomKind, number>> = { jeans: 0.008, trousers: 0.009, cargo: 0.016, sweats: 0.014, shorts: 0.008, leggings: 0.002 };

/** the extra a cuff or hem band adds at its edge (m): ribbed 9, rolled 7, baffle 12 (pedMesh.clothExtras) */
export const BAND_MM: Record<'roll' | 'rib' | 'baffle', number> = { roll: 7, rib: 9, baffle: 12 };

export type FitPlace = 'chest' | 'armpit' | 'upperArm' | 'forearm' | 'hem' | 'thigh';
/**
 * How much cloth there is between the skin and the air at a place on a person (metres). 'armpit' is the one that matters for the arm hanging at the
 * side: the sleeve on the arm and the body of the garment on the ribs both sit there, so the clearance an arm needs is the sum of the two
 * (this returns the sum; for a hanging arm the sleeve and the torso cloth do not both stand out sideways, so POSE may use 0.7 of it).
 */
export function clothThickAt(spec: Pick<PedSpec, 'top' | 'bottom'>, where: FitPlace): number {
  const t = THICK_TOP[spec.top.kind] ?? 0, b = THICK_BOTTOM[spec.bottom.kind] ?? 0;
  switch (where) {
    case 'chest': return t;
    case 'armpit': return t + (spec.top.sleeves === 'none' ? 0 : t * 0.85);
    case 'upperArm': case 'forearm': return spec.top.sleeves === 'none' ? 0 : t * 0.85;
    case 'hem': return t * 0.8 + (['hoodie', 'tracksuit', 'jacket', 'cardigan', 'puffer'].includes(spec.top.kind) ? BAND_MM.rib / 1000 : 0);
    case 'thigh': return b;
  }
}
