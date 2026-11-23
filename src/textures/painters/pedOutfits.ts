/**
 * Whole outfits (CLOTHES seat 22 Nov 2026; WARDROBE seat rebuilt and grown to sixty-one looks on 23 Nov 2026): a look is a set of garments that belongs to one kind of
 * person, not a random pick from four pools. Each outfit names its garments by the ids of pedWardrobe.ts (BASE_TOPS, LAYERS, BOTTOMS, SHOES), says who wears it (age
 * codes a adult, o old, t teen, k kid; sex; the looks and seasons it suits) and carries two or three COLOURWAYS: the colours the pieces are made in together, inside
 * DIRECTION.md's palette (black, navy, grey, olive, brown, denim, off-white, cream) with at most one accent per person (pedMix.isAccent; the test checks every way).
 * The looks come from docs/reference/wardrobe-60.md part 3 (the seventeen that existed, forty-three new ones, one extra school look); where a look names "A or B" the
 * ways take the alternatives in turn. composeSpec uses an outfit for about half of the people it dresses and falls back to the random mix (pedMix.ts) for the rest.
 * No lettering, logos or numbers on anything.
 *
 * The compact text form of a look:  parts 'top/layer/bottom/shoes/hat/gear' ('-' none; 'a|b|c' alternatives, way i takes the i-th; a top that starts with '@' is a
 * one-piece: '@wrapDress/...'), and ways 'T b4b0a4 L 4d6c98 B 1f2a3a S b8b8b4 H 2f3442 G 3a2a22 X tie Y layer trim' (hex without '#': T top or dress, L layer,
 * B bottom, S shoes, H hat, G bag, X tie, Y trim of the layer).
 */
import type { HatStyle } from './ped';

export interface WayIds { top?: string; layer?: string; bottom?: string; shoes?: string; hat?: string; gear?: string }
export interface Way { top?: string; layer?: string; bottom?: string; shoes?: string; hat?: string; gear?: string; tie?: string; trim?: string; ids?: WayIds }
export interface Outfit {
  id: string;
  /** one line: who it is */
  who: string;
  /** ages that wear it (letters a o t k) and sex */
  a: string; sx?: 'm' | 'f';
  /** weights by look (w work, s street, m smart, p sport, c church, e elder, t teen, u service, n night) and by season (cold, mild, warm) */
  k: string; season: [number, number, number];
  top: string; layer?: string; bottom: string; shoes: string;
  /** headwear ('none' = bare head) and gear; omitted = the usual random pick */
  hat?: HatStyle; gear?: 'none' | 'backpack' | 'bag' | 'tote' | 'messenger';
  /** a dress or a boiler suit: fills the top and the bottom slot (id of ONE_PIECE in pedWardrobe.ts) */
  onePiece?: string;
  ways: Way[];
}

const COLD: [number, number, number] = [3, 1, 0], COOL: [number, number, number] = [1.2, 2, 0.4], COOLCOLD: [number, number, number] = [2.5, 1.5, 0.1];
const WARM: [number, number, number] = [0, 0.6, 3], WARMCOOL: [number, number, number] = [0.2, 1.5, 2.2], ANY: [number, number, number] = [1, 1.5, 1];

const KEY: Record<string, keyof Way> = { T: 'top', L: 'layer', B: 'bottom', S: 'shoes', H: 'hat', G: 'gear', X: 'tie', Y: 'trim' };
function O(id: string, who: string, a: string, sx: '' | 'm' | 'f', k: string, season: [number, number, number], parts: string, ways: string): Outfit {
  const slots = parts.split('/').map((p) => p.split('|').map((x) => (x === '-' ? '' : x)));
  const first = (i: number): string | undefined => slots[i]?.[0] || undefined;
  const one = slots[0][0].startsWith('@') ? slots[0][0].slice(1) : undefined;
  const W: Way[] = ways.split('|').map((w, wi) => {
    const t = w.trim().split(/\s+/), way: Way = {};
    for (let i = 0; i + 1 < t.length; i += 2) (way as Record<string, string>)[KEY[t[i]]] = `#${t[i + 1]}`;
    const ids: WayIds = {};
    (['top', 'layer', 'bottom', 'shoes', 'hat', 'gear'] as const).forEach((s, i) => { const al = slots[i]; if (al && al.length > 1) ids[s] = al[wi % al.length] || (s === 'layer' ? '' : 'none'); });
    if (Object.keys(ids).length) way.ids = ids;
    return way;
  });
  const o: Outfit = { id, who, a, k, season, top: one ? one : first(0)!, bottom: one ? 'pleated' : first(2)!, shoes: first(3)!, hat: (first(4) ?? 'none') as HatStyle, gear: (first(5) ?? 'none') as Outfit['gear'], ways: W };
  if (sx) o.sx = sx;
  if (one) o.onePiece = one;
  const layer = first(1); if (layer) o.layer = layer;
  // an alternative that is "none" in the first slot of a list (a way without a layer) is carried by ways[i].ids
  if (!layer && slots[1] && slots[1].length > 1) o.layer = slots[1].find(Boolean);
  return o;
}

export const OUTFITS: readonly Outfit[] = [
  // ---- the seventeen that existed (colourways kept)
  O('churchAuntie', 'older woman on a Sunday: skirt suit, a hat as the one accent, flat shoes and a bag', 'o', 'f', 'c5 e2 m1', ANY, 'blouse/blazer/midiSkirt/flat/church/bag',
    'T c8bfae L 2f3442 B 2f3442 S 1c1c20 H 3b2a52 G 2a2220 | T b8b8b0 L 4a3a44 B 4a3a44 S 2a2220 H d8c8b0 G 3a2a22 | T c8bfae L 3a4a52 B 3a4a52 S 1c1c20 H 2d2638 G 1c1c20'),
  O('churchDeacon', 'older man on a Sunday: suit, shirt, dress shoes, a brimmed hat', 'ao', 'm', 'c5 e2 m2', [1.2, 1, 0.5], 'dressShirt/blazer/suitTrousers/dressShoe/fedora/-',
    'T b8b8b0 L 2f3442 B 2f3442 S 161616 H 2f3442 | T a8b4be L 3a3e4a B 3a3e4a S 2a2220 H 3a3028 | T b8b8b0 L 4a4a52 B 4a4a52 S 161616 H 5a5348'),
  O('elderErrand', 'older man on an errand: pressed shirt, slacks, a flat cap', 'o', 'm', 'e5 s1 m1', [0.5, 1.5, 1], 'shirt/-/chinos/loafer/flat/-',
    'T a8b4be B 6a5f48 S 3a2418 H 5a5348 | T b8b09a B 4a4a40 S 2a2220 H 3a3028 | T 98a4b0 B 7a7a72 S 5b3a24 H 2f3442'),
  O('elderHeadwrap', 'older woman, daily wear: head wrap, long skirt, a knit over a blouse', 'o', 'f', 'e5 s1', [1, 1.5, 1], 'blouse/cardigan/maxiSkirt/flat/headwrap/tote',
    'T b4aa94 L 5a2a34 B 34483a S 2a2220 H 8a6a2a G b0aca0 | T b8b8b0 L 2f3a58 B 4a3a30 S 1c1c20 H 3a6a74 G 8a7048'),
  O('oldTimerTallTee', 'older man in a 2000s look: white tall tee, baggy denim, clean high-tops, a fitted cap', 'ao', 'm', 's4 e2 n1 p1', [0.2, 1.5, 2.5], 'tallTee/-/jeansBaggy/sneakerHigh/cap/-',
    'T b8b8b2 B 34506f S b8b8b4 H 1c1c20 | T 9c9a94 B 232b3b S b8b8b4 H 2a4a7a | T 1c1c20 B 4d6c98 S aaa6a0 H 1c1c20'),
  O('leather90s', 'older man in a 1990s leather jacket and slacks', 'ao', 'm', 'n3 s2 e2 m2', [2, 1.5, 0], 'shirt/bomber/suitTrousers/dressShoe/-/-',
    'T a8a8b4 L 1c1c20 B 3a3e4a S 161616 | T b8b8b0 L 2a1c18 B 2f3442 S 2a2220'),
  O('canvasWorker', 'tradesman: canvas work jacket, plaid or pocket tee, work trousers, boots', 'a', 'm', 'w5 s1 u1', [2, 2, 0.3], 'pocketTee/workJacket/workTrousers/workBoot/beanie/-',
    'T 9c9a94 L 6a5f48 B 3a3f48 S 5b3a24 H 2f3442 | T b4b0a4 L 4a4a40 B 5b4a30 S 3a2418 H 1c1c20 | T 7c8088 L 5b4a30 B 2f3442 S 7a4a2a H 4a4a40'),
  O('hiVisCrew', 'city utility crew: high-visibility vest over a tee, cargo trousers, boots, a hard hat', 'a', 'm', 'w5 u2', [1, 2, 1.2], 'tee/workVest/cargo/workBoot/hardhat/-',
    'T 9c9a94 L bc5420 B 4a4a40 S 3a2418 H f4f4f0 | T 3a3f48 L aab22e B 2f3442 S 161616 H f4f4f0'),
  O('clinicScrubs', 'clinic staff: scrubs under a fleece, clean sneakers', 'a', '', 'u5 w1', [1.5, 1.5, 1], 'scrubs/fleece/workDark/sneakerDark/-/bag',
    'T 3a6a74 L 2f3a58 B 3a6a74 S 161616 G 1c1c20 | T 2f3a58 L 6c7078 B 2f3a58 S b8b8b4 G 34363e | T 7a9ca8 L 3a4a40 B 7a9ca8 S b8b8b4 G 2a2c32'),
  O('transitUniform', 'commuter in uniform: pale shirt, dark trousers, black shoes, a cap, no insignia', 'a', '', 'u5 w1 m1', [1, 1.5, 1], 'uniformShirt/-/suitTrousers/dressShoe/cap/bag',
    'T 98a8b8 B 243a52 S 161616 H 243a52 G 1c1c20 | T b8b8b0 B 2f3442 S 161616 H 2f3442 G 2a2c32'),
  O('winterTeen', 'teenager in winter: puffer, slim joggers, clean white sneakers, a beanie', 't', '', 't5 s3', COLD, 'crewSweat/pufferShort/sweatsCuffed/sneakerLow/beanie/backpack',
    'T 6c7078 L 1c1c20 B 2a2c32 S b8b8b4 H 1c1c20 G 2f3442 | T 9c9a94 L 2f3a58 B 1c1c20 S aaa8a2 H 7a3028 G 1c1c20 | T 9c9a94 L 3a4a30 B 34363e S b8b8b4 H 2a4a7a G 34363e'),
  O('creativeCoat', 'young creative: oversized coat, a knit, wide trousers, dark sneakers', 'a', '', 's3 n3 m1', [2, 2, 0.1], 'sweater/peacoat/jeansWide/sneakerDark/-/tote',
    'T a89e88 L 5a5a40 B 1f2a3a S 161616 G b0aca0 | T 7c8088 L 2f3442 B 5a5448 S 2a2220 G 8a7048 | T b0aca0 L 7a6a4c B 232b3b S 161616 G 1c1c20'),
  O('denimMidSeason', 'young adult in spring or autumn: denim jacket, tee, slim jeans, a cross-body bag', 'a', '', 's5 n2 t1', [0.8, 2, 0.4], 'tee/denimJacket/jeansSlim/sneakerLow/beanie/messenger',
    'T b4b0a4 L 4d6c98 B 1f2a3a S b8b8b4 H 2f3442 G 3a2a22 | T 3a3f48 L 34506f B 151a22 S 161616 H 1c1c20 G 2a2c32 | T a8a290 L 232b3b B 5a7494 S aaa6a0 H 4a5a48 G 4a2a1c'),
  O('summerSlides', 'young adult in summer: tee, shorts, slides with socks, a bucket hat', 'a', '', 's5 t2 p1', [0, 0.6, 3], 'tee/-/chinoShorts/slide/bucket/-',
    'T 3a3f48 B a89a78 S 1c1c20 H 6a8098 | T b4b0a4 B 2e3848 S b8b8b4 H 4a5a48 | T bdb49c B 5a5448 S 1c1c20 H 1c1c20'),
  O('schoolDay', 'teenager on a school day: hoodie, straight jeans, sneakers, a backpack', 't', '', 't5 s3', [1.5, 2, 1], 'hoodieDown/-/jeansStraight/sneakerLow/-/backpack',
    'T 3a3f48 B 34506f S b8b8b4 G 1c1c20 | T 7c8088 B 232b3b S 161616 G 2f3a58 | T 4a5a48 B 4d6c98 S aaa8a2 G 34363e'),
  O('deliveryRider', 'delivery rider: wind jacket, slim trousers, runners, a helmet and a work pack', 'a', 'm', 'u3 s2 w1', [2, 2, 1.2], 'tee/windbreaker/trackPants/runner/helmet/backpack',
    'T 9c9a94 L 2f3a58 B 1c1c20 S 6c7078 H 1c1c20 G 34363e | T 9c9a94 L 1c1c20 B 2a2c32 S aaa6a0 H 6c7078 G 2a4a7a'),
  O('nightOut', 'a night out: dark blazer over a black tee, slim black jeans, ankle boots', 'a', '', 'n5 m1 s1', [2, 2, 0.5], 'tee/blazer/jeansSlim/ankleBoot/-/-',
    'T 1c1c20 L 2f3442 B 151a22 S 161616 | T b4b0a4 L 1c1c24 B 121216 S 2a1c18'),

  // ---- older men and women (the 1990s and 2000s)
  O('elderVelour', 'older man (or woman) in a plush velour tracksuit, a plain tee, clean sneakers', 'o', '', 'e4 s1 p1', [1, 1.5, 0.6], 'tee/velourTrack/trackPants/sneakerLow/-|-|flat/-',
    'T b8b8b2 L 243a52 B 243a52 S b8b8b4 | T 1c1c20 L 5a2a34 B 5a2a34 S b8b8b4 | T b4b0a4 L 2d4a3a B 2d4a3a S aaa6a0 H 3a3028'),
  O('elderTrackWoman', 'older woman in a velour tracksuit, a head wrap sometimes, a tote', 'o', 'f', 'e4 s1', [1, 1.5, 0.6], 'tee/velourTrack/trackPants/sneakerLow/-|headwrap|-/tote|tote|-',
    'T b4aa94 L 3a3248 B 3a3248 S b8b8b4 G b0aca0 | T b8b8b2 L 34483a B 34483a S aaa6a0 H 8a6a2a G 8a7048 | T 1c1c20 L 6c7078 B 34363e S b8b8b4'),
  O('elderCardiganWalk', 'older woman out walking: blouse, cardigan, pleated skirt, flats, a shopping bag', 'o', 'f', 'e5 s1', [1.5, 1.5, 0.8], 'blouse/cardigan/pleated/flat/-/tote',
    'T c8bfae L 5a2a34 B 2f3442 S 1c1c20 G b8b8b0 | T b8b8b0 L 2f3a58 B 4a3a44 S 2a2220 G a89a78 | T b4aa94 L a89e88 B 34483a S 1c1c20 G 8a7048'),
  O('elderOvercoat', 'older man in a winter overcoat over a knit, a flat cap', 'o', 'm', 'e4 m2 c1', COLD, 'sweater/overcoat/suitTrousers/loafer/flat/-',
    'T a89e88 L 2f3442 B 3a3e4a S 161616 H 3a3028 | T 2f3a58 L 7a6a4c B 4a4a52 S 2a2220 H 2f3442 | T 5a2a34 L 1c1c20 B 2f3442 S 161616'),
  O('elderSummerPolo', 'older man in summer: polo, chinos, clean sneakers, a sun hat', 'ao', 'm', 'e4 s2 w1', WARM, 'polo/-/chinos/sneakerLow/bucket|cap|bucket/-',
    'T b4b0a4 B 7a6a4a S b8b8b4 H 6a8098 | T 6a8098 B c8bca0 S aaa6a0 H b4b0a4 | T 8a8a86 B 2f3a48 S b8b8b4 H 4a5a48'),
  O('elderJeansBlouse', 'older woman in easy clothes: blouse, open cardigan, jeans, sneakers', 'o', 'f', 'e4 s2', ANY, 'blouse/cardiganOpen/jeansStraight/sneakerLow/-/tote',
    'T c8bfae L 8a7048 B 34506f S b8b8b4 G b0aca0 | T a0aab4 L 3a4a40 B 232b3b S aaa6a0 G 2f3442 | T b4a0a2 L 5a5a40 B 4d6c98 S b8b8b4 G 3a2a22'),
  O('elderKufiTunic', 'older man in a long band-collar shirt, trousers, loafers and a kufi', 'ao', 'm', 'e2 c2 s1', ANY, 'bandShirt/-/chinos|suitTrousers|chinos/loafer/kufi/-',
    'T b8b8b0 B 8a8478 S 3a2418 H d8d4c8 | T b0a48a B 4a4a40 S 2a2220 H 1c1c20 | T 6a6a50 B 3a3f48 S 3a2418 H c8bca0'),
  O('tallTeeTan', 'a man in a 2000s look: tall tee, baggy jeans, tan boots, a durag or snapback', 'a', 'm', 's4 n1 t1', [0.4, 1.5, 2], 'tallTee/-/jeansBaggy/tanBoot/durag|snapback|snapback/-',
    'T b8b8b2 B 34506f S 98804e H 1c1c20 | T 1c1c20 B 4d6c98 S 7a5e36 H 6c7078 | T 8a8a86 B 232b3b S 98804e H 2f3a58'),

  // ---- workers
  O('kitchenWhites', 'kitchen crew: white chef jacket over a dark tee, check trousers, a cap', 'a', '', 'u3 w2', ANY, 'tee/chefJacket/workDark/sneakerDark/cap|beanie/-',
    'T 1c1c20 L b8b8b2 B 34363e S 161616 H b8b8b2 | T 3a3f48 L b4b0a4 B 2f3442 S 1c1c20 H 2f3442'),
  O('barberSmock', 'barber: a dark smock over a tee, slim jeans, clean dark sneakers', 'a', 'm', 'u2 s1 w1', ANY, 'tee/barberSmock/jeansSlim/sneakerDark/-/-',
    'T b4b0a4 L 1c1c20 B 232b3b S 161616 | T 9c9a94 L 3a3f48 B 151a22 S 2a2c32 | T 1c1c20 L 6c7078 B 34506f S b8b8b4'),
  O('mechanicCoveralls', 'mechanic: coveralls, boots, a cap', 'a', 'm', 'w4 u1', [2, 2, 0.6], '@boilerSuit/-/-/workBoot/cap/-',
    'T 2f3442 S 3a2418 H 1c1c20 | T 5b4a30 S 161616 H 5a5348 | T 4a4a40 S 3a2418 H 2f3442'),
  O('counterApron', 'shop or deli counter: apron over a tee, jeans, dark sneakers', 'a', '', 'u3 w1 s1', ANY, 'tee|longTee|tee/apron/jeansStraight/sneakerDark/-|cap|-/-',
    'T b4b0a4 L 6a5f48 B 34506f S 161616 | T 3a3f48 L 8a8a86 B 232b3b S 2a2c32 H 1c1c20 | T 7c8088 L 3a3f48 B 4d6c98 S b8b8b4'),
  O('securityGuard', 'security: pale uniform shirt under a plain dark jacket, work trousers, black boots, a cap', 'a', 'm', 'u3 w2', [2, 2, 0.5], 'uniformShirt/windbreaker/workDark/workBoot/cap/-',
    'T 98a8b8 L 1c1c20 B 1c1c20 S 161616 H 1c1c20 | T b8b8b0 L 243a52 B 2f3442 S 161616 H 243a52'),
  O('housePainter', 'house painter: pocket tee, off-white work trousers, canvas shoes, a cap', 'a', 'm', 'w3', [0.3, 1.5, 2], 'pocketTee/-/workTrousers/canvasLow/cap/-',
    'T 8a8a86 B b4b0a4 S b8b8b4 H b4b0a4 | T 6c7078 B c8bca0 S 8a8a86 H 6c7078'),
  O('baristaApron', 'cafe: apron over a tee, slim jeans, a beanie and a cross-body bag', 'a', '', 'u3 s1', ANY, 'tee/apron/jeansSlim/sneakerDark/beanie|-|-/messenger|messenger|-',
    'T b4b0a4 L 3a3f48 B 232b3b S 161616 H 2f3442 G 3a2218 | T 1c1c20 L 6a5f48 B 151a22 S b8b8b4 G 2a2c32 | T a8a290 L 34363e B 34506f S 161616'),
  O('parksCrew', 'parks crew: a tee, fleece, cargo trousers, work boots, a cap', 'a', 'm', 'w3 u1', [2, 2, 0.8], 'tee/fleece/cargo/workBoot/cap/-',
    'T 9c9a94 L 3a4a40 B 4a4a40 S 3a2418 H 3a4a40 | T 3a3f48 L 46607a B 2f3442 S 161616 H 1c1c20'),

  // ---- office and smart
  O('officeSuit', 'office: a matching suit, pale shirt, a tie, dark shoes', 'a', 'm', 'm4 w2 n1', [2, 2, 0.7], 'dressShirt/blazer/suitTrousers/dressShoe/-/messenger',
    'T b8b8b0 L 2f3442 B 2f3442 S 161616 X 5a2a34 G 2a2220 | T a8b4be L 3a3e4a B 3a3e4a S 2a2220 G 2a2220 | T b8b8b0 L 1c1c24 B 1c1c24 S 161616 X 3a4a5a G 1c1c20'),
  O('officeShirtChinos', 'office, relaxed: pressed shirt, chinos, loafers, a cross-body bag', 'a', '', 'm3 w3 s1', [0.5, 1.5, 1.6], 'shirt/-/chinos/loafer|sneakerDark|loafer/messenger',
    'T a8b4be B a89a78 S 3a2418 G 3a2a22 | T b8b8b0 B 2f3a48 S 161616 G 2a2c32 | T 98a4b0 B 4a4a40 S 2a2220 G 3a2a22'),
  O('officeBlouse', 'office: blouse, blazer and trousers, flats or heels, a handbag', 'a', 'f', 'm4 w3 n1', [2, 2, 0.4], 'blouse/blazer/suitTrousers|trousersSlim|suitTrousers/flat|heel|flat/bag',
    'T c8bfae L 3a3e4a B 3a3e4a S 1c1c20 G 2a2220 | T a0aab4 L 2f3442 B 2f3442 S 2f3442 G 1c1c20 | T b4a0a2 L 4a4a52 B 4a4a52 S 1c1c20 G 3a2a22'),
  O('officeWrapDress', 'office: a wrap dress with a cardigan or a jacket, heels or flats, a handbag', 'a', 'f', 'm3 w2 n1', [1.5, 2, 0.7], '@wrapDress/cardigan|blazer|blazer/-/heel|flat|flat/-/bag',
    'T 2f3a58 L b0aca0 S 1c1c20 G 1c1c20 | T 5a2a34 L 1c1c24 S 1c1c20 G 2a2220 | T 34483a L 3a3e4a S 2a2220 G 3a2a22'),
  O('commuterOvercoat', 'commuter in winter: overcoat over a shirt or knit, suit trousers, dress shoes, a bag', 'a', '', 'm3 w2 n1', COLD, 'dressShirt|sweater|dressShirt/overcoat/suitTrousers/dressShoe/-/bag',
    'T b8b8b0 L 2f3442 B 3a3e4a S 161616 G 1c1c20 | T a89e88 L 7a6a4c B 2f3442 S 2a2220 G 3a2a22 | T 98a4b0 L 1c1c20 B 1c1c24 S 161616 G 2a2220'),

  // ---- young adults, today
  O('pufferWide', 'young: hoodie under a short puffer, wide jeans or cargo, chunky sneakers, a beanie and a small bag', 'at', '', 't3 s4', [3, 0.8, 0], 'hoodieDown/pufferShort/jeansWide|cargo|jeansWide/sneakerHigh|chunkySneaker|sneakerHigh/beanie/messenger',
    'T 6c7078 L 1c1c20 B 4d6c98 S b8b8b4 H 1c1c20 G 34363e | T 1c1c20 L 3a4a30 B 1c1c20 S aaa6a0 H 2f3442 G 1c1c20 | T b0aca0 L 2f3a58 B 6c7078 S b8b8b4 H 7a3028 G 34363e'),
  O('oversizedWide', 'young creative: roll neck, a camel overcoat, wide trousers, chunky sneakers, a tote', 'a', '', 's3 n3 m1', [3, 1.5, 0], 'turtleneck/overcoat/trousersWide/chunkySneaker/-/tote',
    'T 1c1c20 L 7a6a4c B 3a3e4a S b8b8b4 G b0aca0 | T b0a894 L 2f3442 B 1c1c20 S aaa6a0 G 8a7048 | T 3a3f48 L 5a5a40 B a89e88 S 161616 G 1c1c20'),
  O('croppedJogger', 'young: tee, a cropped work jacket, slim joggers, clean sneakers, a cap', 'a', '', 's4 t1', [1, 2, 0.4], 'tee/cropJacket/sweatsCuffed/sneakerLow/cap|-|cap/messenger',
    'T b4b0a4 L 4a4a40 B 1c1c20 S b8b8b4 H 1c1c20 G 2a2c32 | T 3a3f48 L 6a5f48 B 6c7078 S aaa6a0 G 3a2a22 | T b8b8b2 L 1c1c20 B 34363e S b8b8b4 H 7a3028'),
  O('athleisureW', 'young woman: fitted rib tank, a wind jacket, leggings, running shoes, a small bag', 'a', 'f', 'p3 s3', [0.5, 2, 1], 'ribTank/windbreaker/leggings/runner/-/messenger|messenger|-',
    'T b4b0a4 L 2f3a58 B 1c1c20 S 8a8a86 G 1c1c20 | T 1c1c20 L 6c7078 B 34363e S b8b8b4 G 34363e | T 8a9482 L 1c1c20 B 1c1c20 S aaa6a0'),
  O('summerTankShorts', 'young in summer: tank, cargo shorts, canvas shoes or slides, a bucket hat', 'at', '', 's4 t2', WARM, 'tank/-/cargoShorts/canvasLow|slide|canvasLow/bucket/-',
    'T b8b8b2 B 4a4a40 S 1c1c20 H 6a8098 | T 1c1c20 B a89a78 S b8b8b4 H 4a5a48 | T 9c9a94 B 2e3848 S 161616 H bdb49c'),
  O('vintageSport', 'young in a retro sport look: tee, a wind jacket, joggers or baggy jeans, high-tops, a bucket hat', 'a', '', 'p2 s2', [1, 2, 0.6], 'tee/windbreaker/trackPants|jeansBaggy|jeansBaggy/sneakerHigh/bucket/-',
    'T b4b0a4 L 6a8098 Y aaa69a B 1c1c20 S b8b8b4 H 1c1c20 | T 1c1c20 L 3a4a30 Y 8a8a86 B 34506f S aaa6a0 H 4a5a48 | T 8a8a86 L 2f3a58 Y b4b0a4 B 232b3b S b8b8b4 H a8582a'),
  O('flannelBoots', 'young man in a plaid flannel, straight jeans, tan boots, a beanie and a backpack', 'a', 'm', 's4 w2', [2, 2, 0.3], 'flannel/-/jeansStraight/tanBoot/beanie/backpack',
    'T 7a3028 B 232b3b S 98804e H 1c1c20 G 2f3442 | T 2f4a6a B 34506f S 7a5e36 H 2f3442 G 34363e | T 34503a B 151a22 S 98804e H 3a3f48 G 1c1c20'),
  O('denimDouble', 'young: a pale denim jacket over a tee, dark jeans, boots or sneakers', 'a', '', 's1 t1', [1.2, 2, 0.3], 'tee/denimJacket/jeansStraight/tanBoot|sneakerLow|sneakerLow/-/messenger|-|messenger',
    'T 1c1c20 L 667f9a B 151a22 S 98804e G 2a2c32 | T b4b0a4 L 4d6c98 B 1f2a3a S 161616 | T b0aca0 L 232b3b B 667f9a S b8b8b4 G 3a2a22'),

  // ---- teenagers and children
  O('schoolUniform', 'schoolchild or teen in a plain school uniform: polo, cardigan, grey trousers, a backpack', 'kt', '', 't4 u1 c1', [1.5, 2, 0.6], 'polo/cardigan/chinos/sneakerDark/-/backpack',
    'T b8b8b0 L 2f3a58 B 6c7078 S 161616 G 1c1c20 | T 98a8b8 L 34363e B 2f3442 S 161616 G 2f3a58'),
  O('schoolUniformGirl', 'schoolgirl in a plain school uniform: polo, cardigan, pleated skirt, a backpack', 'kt', 'f', 't4 u1 c1', [1.5, 2, 0.6], 'polo/cardigan/pleated/sneakerDark/-/backpack',
    'T b8b8b0 L 2f3a58 B 6c7078 S 161616 G 1c1c20 | T 98a8b8 L 34363e B 2f3442 S 161616 G 2f3a58'),
  O('hoopsCourt', 'teen or young man on the court: plain jersey, long shorts, high-tops, a backpack', 'at', 'm', 'p4 t3 s1', WARM, 'bballJersey/-/bballShorts/sneakerHigh/-/backpack',
    'T 14161a B 14161a S b8b8b4 G 2f3442 | T 2a3a5a B b4b4b4 S 161616 G 1c1c20 | T b4b4b4 B 5a2030 S aaa6a0 G 34363e'),
  O('teenGirlWide', 'teen girl: tee, a nylon bomber, wide jeans, chunky sneakers, a cross-body bag', 't', 'f', 't4 s2', [1, 2, 0.5], 'tee/bomberNylon/jeansWide/chunkySneaker/-/messenger',
    'T b4b0a4 L 3a4a30 B 667f9a S b8b8b4 G 1c1c20 | T 1c1c20 L 6c7078 B 4d6c98 S aaa6a0 G 3a2a22 | T b8b8b2 L 1c1c20 B 232b3b S b8b8b4 G 2a2c32'),
  O('kidPlayground', 'child at play: tee, joggers or cargo shorts, sneakers, a backpack', 'k', '', 't5 s3', [1, 1.5, 1.5], 'tee/-/sweatsCuffed|sweatsCuffed|cargoShorts/sneakerLow/cap|-|-/backpack',
    'T 6a8098 B 34363e S b8b8b4 H 1c1c20 G 2f3442 | T 9a8040 B 232b3b S aaa6a0 G 1c1c20 | T b4b0a4 B 4a4a40 S b8b8b4 G 46607a'),
  O('kidPuffer', 'child in winter: sweatshirt, a puffer, jeans, a beanie, a backpack', 'k', '', 't4 s2', COLD, 'crewSweat/pufferShort/jeansStraight/sneakerLow/beanie/backpack',
    'T 9c9a94 L 7a3028 B 232b3b S aaa6a0 H 1c1c20 G 1c1c20 | T 3a3f48 L 2f3a58 B 1c1c20 S b8b8b4 H 6c7078 G 2f3442 | T b4b0a4 L 3a4a30 B 34506f S b8b8b4 H 3a4a30 G 1c1c20'),
  O('churchKidBoy', 'boy in his church clothes: shirt, cardigan or jacket, trousers, shoes', 'kt', 'm', 't2 c3', [1.2, 1.5, 0.6], 'shirt/cardigan|blazer/suitTrousers/dressShoe|sneakerDark/-/-',
    'T b8b8b0 L 2f3442 B 2f3442 S 161616 | T a8b4be L 4a3a44 B 3a3e4a S 2a2220'),
  O('churchKidGirl', 'girl in her church clothes: a shirt dress, a cardigan, flat shoes, a small bag', 'kt', 'f', 't2 c3', [1.2, 1.5, 0.6], '@shirtDress/cardigan/-/flat/-/bag',
    'T b4a0a2 L 2f3a58 S 1c1c20 G 3a2a22 | T a0aab4 L 5a2a34 S 2a2220 G 2a2220 | T a8b0a0 L 3a3248 S 1c1c20 G 1c1c20'),

  // ---- sport and the night
  O('runningKit', 'runner: tank or tee, running shorts, running shoes, a cap', 'a', '', 'p4 s1', [0.2, 1.5, 2.5], 'tank|tee|tank/-/runShorts/runner/cap/-',
    'T b8b8b2 B 14161a S 8a8a86 H 1c1c20 | T 1c1c20 B 2a3a5a S b8b8b4 H 6c7078 | T 8a9482 B 1c1c20 S aaa6a0 H 1c1c20'),
  O('yogaStudio', 'on the way to class: rib tank, a fleece or cardigan, leggings, easy shoes, a tote with a mat', 'a', 'f', 'p2 s2', [0.5, 2, 1.5], 'ribTank/fleece|cardigan|-/leggings/slide|sneakerLow|sneakerLow/-/tote',
    'T b4b0a4 L 6c7078 B 1c1c20 S 1c1c20 G 8a7048 | T 1c1c20 L 3a4a40 B 34363e S b8b8b4 G b0aca0 | T 8a9482 B 1c1c20 S aaa6a0 G 2f3a58'),
  O('nightWrap', 'a night out: a wrap dress, heels or ankle boots, a small bag', 'a', 'f', 'n4 s1 m1', [1.5, 2, 1], '@wrapDress/-/-/heel|ankleBoot|heel/-/bag|messenger|bag',
    'T 1c1c24 S 1c1c20 G 1c1c20 | T 5a2a34 S 161616 G 2a2220 | T 34483a S 1c1c20 G 3a2a22'),

  // ---- dress worn on this street every day (ordinary clothing, plain and solid)
  O('boubouWoman', 'woman in a long plain kaftan with a head wrap, flats and a handbag', 'ao', 'f', 's3 c2 e2', [1, 1.5, 1.5], '@kaftan/-/-/flat/headwrap/bag',
    'T 34483a H 8a6a2a S 2a2220 G 2a2220 | T 2f3a58 H b8b8b0 S 1c1c20 G 3a2a22 | T 8a4a32 H 3a3248 S 5b3a24 G 1c1c20'),
  O('dashikiSet', 'man in a plain dashiki, trousers, loafers, a kufi sometimes', 'ao', 'm', 's2 c2', [0.8, 1.5, 1.5], 'dashiki/-/chinos|suitTrousers|chinos/loafer/kufi|-|-/-',
    'T 8a6a2a B 3a3f48 S 2a2220 H 1c1c20 | T 34503a B b0a48a S 3a2418 H d8d4c8 | T 2f3a58 B 4a4a40 S 161616'),
  O('hijabModest', 'woman in modest dress: a long shirt, a long cardigan, a maxi skirt or trousers, a headscarf', 'tao', 'f', 's2 c2 m1 t1', [1.5, 1.5, 0.7], 'shirt/cardigan|-|cardigan/maxiSkirt|suitTrousers|maxiSkirt/flat|sneakerLow|flat/hijab/tote|bag|tote',
    'T b8b8b0 L 2f3a58 B 1c1c20 S 1c1c20 H 1c1c20 G 3a2a22 | T a8b0a0 B 34483a S 2a2220 H b0a894 G 8a7048 | T c8bfae L 1c1c20 B 3a3f48 S b8b8b4 H 8a8a86 G b0aca0'),
  O('bonnetErrand', 'a woman on a short errand: sweatshirt, leggings, slides, a satin head cover, a shopping bag', 'a', 'f', 's2 t1', [0.2, 1.5, 1.2], 'crewSweat|hoodieDown|crewSweat/-/leggings|sweatsCuffed|leggings/slide/headwrap/tote',
    'T 7c8088 B 1c1c20 S 1c1c20 H 5a2a34 G b8b8b0 | T 3a3f48 B 34363e S b8b8b4 H 1c1c20 G a89a78 | T b0aca0 B 2f3442 S 1c1c20 H c8bfae G 8a7048'),
];

const code = (a: string | undefined, c: string): boolean => (a ?? 'ato').includes(c);
const lookW = (k: string, l: string): number => { const m = new RegExp(`${l}(\\d)`).exec(k); return m ? Number(m[1]) : 0; };
export const LOOK_LETTER: Record<string, string> = { work: 'w', street: 's', smart: 'm', sport: 'p', church: 'c', elder: 'e', teen: 't', service: 'u', night: 'n' };

/** the outfits that suit a person (weight 0 = not at all) */
export function outfitWeights(age: 'kid' | 'teen' | 'adult' | 'old', sex: 'm' | 'f' | 'x', look: string, season: 'cold' | 'mild' | 'warm'): Array<[Outfit, number]> {
  const ac = age === 'kid' ? 'k' : age === 'teen' ? 't' : age === 'old' ? 'o' : 'a', si = season === 'cold' ? 0 : season === 'mild' ? 1 : 2;
  return OUTFITS.map((o) => [o, !code(o.a, ac) || (o.sx && sex !== 'x' && o.sx !== sex) ? 0 : lookW(o.k, LOOK_LETTER[look] ?? 's') * o.season[si]] as [Outfit, number]);
}
