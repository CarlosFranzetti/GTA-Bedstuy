/**
 * Whole outfits (CLOTHES seat, body team, 22 Nov 2026): a look is a set of garments that belongs to one kind of person, not a random pick
 * from four pools. Each outfit names its garments by the ids of pedWardrobe.ts (BASE_TOPS, LAYERS, BOTTOMS, SHOES), says who wears it (age
 * codes a adult, o old, t teen, k kid; sex; the looks and seasons it suits) and carries two or three COLOURWAYS: the colours the pieces are
 * made in together, inside DIRECTION.md's palette (black, navy, grey, olive, brown, denim, off-white) with at most one accent per person.
 * pedWardrobe.composeSpec uses an outfit for about half of the people it dresses and falls back to the random pools for the rest.
 * Source of the looks: docs/reference/clothing-brooklyn.md (O1 to O16, O15 left out on the lead's ruling) and the owner's brief. No lettering,
 * logos or numbers on anything: print is always 'none' here.
 */
import type { HatStyle } from './ped';

export interface Way { top: string; layer?: string; bottom: string; shoes: string; hat?: string; gear?: string }
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
  ways: Way[];
}

export const OUTFITS: readonly Outfit[] = [
  { id: 'churchAuntie', who: 'older woman on a Sunday: skirt suit, a hat as the one accent, flat shoes and a bag', a: 'o', sx: 'f', k: 'c5 e2 m1', season: [1, 1, 1],
    top: 'blouse', layer: 'blazer', bottom: 'midiSkirt', shoes: 'flat', hat: 'church', gear: 'bag',
    ways: [{ top: '#c8bfae', layer: '#2f3442', bottom: '#2f3442', shoes: '#1c1c20', hat: '#3b2a52', gear: '#2a2220' }, { top: '#b8b8b0', layer: '#4a3a44', bottom: '#4a3a44', shoes: '#2a2220', hat: '#d8c8b0', gear: '#3a2a22' }, { top: '#c8bfae', layer: '#3a4a52', bottom: '#3a4a52', shoes: '#1c1c20', hat: '#2d2638', gear: '#1c1c20' }] },
  { id: 'churchDeacon', who: 'older man on a Sunday: suit, shirt, dress shoes, a brimmed hat', a: 'ao', sx: 'm', k: 'c5 e2 m2', season: [1.2, 1, 0.5],
    top: 'dressShirt', layer: 'blazer', bottom: 'suitTrousers', shoes: 'dressShoe', hat: 'fedora', gear: 'none',
    ways: [{ top: '#b8b8b0', layer: '#2f3442', bottom: '#2f3442', shoes: '#161616', hat: '#2f3442' }, { top: '#a8b4be', layer: '#3a3e4a', bottom: '#3a3e4a', shoes: '#2a2220', hat: '#3a3028' }, { top: '#b8b8b0', layer: '#4a4a52', bottom: '#4a4a52', shoes: '#161616', hat: '#5a5348' }] },
  { id: 'elderErrand', who: 'older man on an errand: pressed shirt, slacks, a flat cap', a: 'o', sx: 'm', k: 'e5 s1 m1', season: [0.5, 1.5, 1],
    top: 'shirt', bottom: 'chinos', shoes: 'loafer', hat: 'flat', gear: 'none',
    ways: [{ top: '#a8b4be', bottom: '#6a5f48', shoes: '#3a2418', hat: '#5a5348' }, { top: '#b8b09a', bottom: '#4a4a40', shoes: '#2a2220', hat: '#3a3028' }, { top: '#98a4b0', bottom: '#7a7a72', shoes: '#5b3a24', hat: '#2f3442' }] },
  { id: 'elderHeadwrap', who: 'older woman, daily wear: head wrap, long skirt, a knit over a blouse', a: 'o', sx: 'f', k: 'e5 s1', season: [1, 1.5, 1],
    top: 'blouse', layer: 'cardigan', bottom: 'maxiSkirt', shoes: 'flat', hat: 'headwrap', gear: 'tote',
    ways: [{ top: '#b4aa94', layer: '#5a2a34', bottom: '#34483a', shoes: '#2a2220', hat: '#8a6a2a', gear: '#b0aca0' }, { top: '#b8b8b0', layer: '#2f3a58', bottom: '#4a3a30', shoes: '#1c1c20', hat: '#3a6a74', gear: '#8a7048' }] },
  { id: 'oldTimerTallTee', who: 'older man in a 2000s look: white tall tee, baggy denim, clean high-tops, a fitted cap', a: 'ao', sx: 'm', k: 's4 e2 n1 p1', season: [0.2, 1.5, 2.5],
    top: 'tee', bottom: 'jeansBaggy', shoes: 'sneakerHigh', hat: 'cap', gear: 'none',
    ways: [{ top: '#b8b8b2', bottom: '#34506f', shoes: '#b8b8b4', hat: '#1c1c20' }, { top: '#9c9a94', bottom: '#232b3b', shoes: '#b8b8b4', hat: '#2a4a7a' }, { top: '#1c1c20', bottom: '#4d6c98', shoes: '#aaa6a0', hat: '#1c1c20' }] },
  { id: 'leather90s', who: 'older man in a 1990s leather jacket and slacks', a: 'ao', sx: 'm', k: 'n3 s2 e2 m2', season: [2, 1.5, 0],
    top: 'shirt', layer: 'bomber', bottom: 'suitTrousers', shoes: 'dressShoe', hat: 'none', gear: 'none',
    ways: [{ top: '#a8a8b4', layer: '#1c1c20', bottom: '#3a3e4a', shoes: '#161616' }, { top: '#b8b8b0', layer: '#2a1c18', bottom: '#2f3442', shoes: '#2a2220' }] },
  { id: 'canvasWorker', who: 'tradesman: canvas work jacket, plaid or pocket tee, work trousers, boots', a: 'a', sx: 'm', k: 'w5 s1 u1', season: [2, 2, 0.3],
    top: 'pocketTee', layer: 'workJacket', bottom: 'workTrousers', shoes: 'workBoot', hat: 'beanie', gear: 'none',
    ways: [{ top: '#9c9a94', layer: '#6a5f48', bottom: '#3a3f48', shoes: '#5b3a24', hat: '#2f3442' }, { top: '#b4b0a4', layer: '#4a4a40', bottom: '#5b4a30', shoes: '#3a2418', hat: '#1c1c20' }, { top: '#7c8088', layer: '#5b4a30', bottom: '#2f3442', shoes: '#7a4a2a', hat: '#4a4a40' }] },
  { id: 'hiVisCrew', who: 'city utility crew: high-visibility vest over a tee, cargo trousers, boots, a hard hat', a: 'a', sx: 'm', k: 'w5 u2', season: [1, 2, 1.2],
    top: 'tee', layer: 'workVest', bottom: 'cargo', shoes: 'workBoot', hat: 'hardhat', gear: 'none',
    ways: [{ top: '#9c9a94', layer: '#c8651e', bottom: '#4a4a40', shoes: '#3a2418', hat: '#f4f4f0' }, { top: '#3a3f48', layer: '#b9b432', bottom: '#2f3442', shoes: '#161616', hat: '#f4d03f' }] },
  { id: 'clinicScrubs', who: 'clinic staff: scrubs under a fleece, clean sneakers', a: 'a', k: 'u5 w1', season: [1.5, 1.5, 1],
    top: 'scrubs', layer: 'fleece', bottom: 'workDark', shoes: 'sneakerDark', hat: 'none', gear: 'bag',
    ways: [{ top: '#3a6a74', layer: '#2f3a58', bottom: '#3a6a74', shoes: '#161616', gear: '#1c1c20' }, { top: '#2f3a58', layer: '#6c7078', bottom: '#2f3a58', shoes: '#b8b8b4', gear: '#34363e' }, { top: '#7a9ca8', layer: '#3a4a40', bottom: '#7a9ca8', shoes: '#b8b8b4', gear: '#2a2c32' }] },
  { id: 'transitUniform', who: 'commuter in uniform: pale shirt, dark trousers, black shoes, a cap, no insignia', a: 'a', k: 'u5 w1 m1', season: [1, 1.5, 1],
    top: 'dressShirt', bottom: 'suitTrousers', shoes: 'dressShoe', hat: 'cap', gear: 'bag',
    ways: [{ top: '#98a8b8', bottom: '#243a52', shoes: '#161616', hat: '#243a52', gear: '#1c1c20' }, { top: '#b8b8b0', bottom: '#2f3442', shoes: '#161616', hat: '#2f3442', gear: '#2a2c32' }] },
  { id: 'winterTeen', who: 'teenager in winter: puffer, slim joggers, clean white sneakers, a beanie', a: 't', k: 't5 s3', season: [3, 1, 0],
    top: 'crewSweat', layer: 'pufferShort', bottom: 'sweatsCuffed', shoes: 'sneakerLow', hat: 'beanie', gear: 'backpack',
    ways: [{ top: '#6c7078', layer: '#1c1c20', bottom: '#2a2c32', shoes: '#b8b8b4', hat: '#1c1c20', gear: '#2f3442' }, { top: '#3a3f48', layer: '#2f3a58', bottom: '#1c1c20', shoes: '#aaa8a2', hat: '#7a3028', gear: '#1c1c20' }, { top: '#9c9a94', layer: '#3a4a30', bottom: '#34363e', shoes: '#b8b8b4', hat: '#2a4a7a', gear: '#34363e' }] },
  { id: 'creativeCoat', who: 'young creative: oversized coat, a knit, wide trousers, dark sneakers', a: 'a', k: 's3 n3 m1', season: [2, 2, 0.1],
    top: 'sweater', layer: 'peacoat', bottom: 'jeansBaggy', shoes: 'sneakerDark', hat: 'none', gear: 'tote',
    ways: [{ top: '#a89e88', layer: '#5a5a40', bottom: '#1f2a3a', shoes: '#161616', gear: '#b0aca0' }, { top: '#7c8088', layer: '#2f3442', bottom: '#5a5448', shoes: '#2a2220', gear: '#8a7048' }, { top: '#b0aca0', layer: '#7a6a4c', bottom: '#232b3b', shoes: '#161616', gear: '#1c1c20' }] },
  { id: 'denimMidSeason', who: 'young adult in spring or autumn: denim jacket, tee, slim jeans, a cross-body bag', a: 'a', k: 's5 n2 t1', season: [0.8, 2, 0.4],
    top: 'tee', layer: 'denimJacket', bottom: 'jeansSlim', shoes: 'sneakerLow', hat: 'beanie', gear: 'messenger',
    ways: [{ top: '#b4b0a4', layer: '#4d6c98', bottom: '#1f2a3a', shoes: '#b8b8b4', hat: '#2f3442', gear: '#3a2a22' }, { top: '#3a3f48', layer: '#34506f', bottom: '#151a22', shoes: '#161616', hat: '#1c1c20', gear: '#2a2c32' }, { top: '#a8a290', layer: '#232b3b', bottom: '#5a7494', shoes: '#aaa6a0', hat: '#4a5a48', gear: '#4a2a1c' }] },
  { id: 'summerSlides', who: 'young adult in summer: tee, shorts, slides with socks, a bucket hat', a: 'a', k: 's5 t2 p1', season: [0, 0.6, 3],
    top: 'tee', bottom: 'chinoShorts', shoes: 'slide', hat: 'bucket', gear: 'none',
    ways: [{ top: '#b4b0a4', bottom: '#a89a78', shoes: '#1c1c20', hat: '#6a8098' }, { top: '#3a3f48', bottom: '#2e3848', shoes: '#b8b8b4', hat: '#4a5a48' }, { top: '#bdb49c', bottom: '#5a5448', shoes: '#1c1c20', hat: '#1c1c20' }] },
  { id: 'schoolDay', who: 'teenager on a school day: hoodie, straight jeans, sneakers, a backpack', a: 't', k: 't5 s3', season: [1.5, 2, 1],
    top: 'hoodieDown', bottom: 'jeansStraight', shoes: 'sneakerLow', hat: 'none', gear: 'backpack',
    ways: [{ top: '#3a3f48', bottom: '#34506f', shoes: '#b8b8b4', gear: '#1c1c20' }, { top: '#7c8088', bottom: '#232b3b', shoes: '#161616', gear: '#2f3a58' }, { top: '#4a5a48', bottom: '#4d6c98', shoes: '#aaa8a2', gear: '#34363e' }] },
  { id: 'deliveryRider', who: 'delivery rider: wind jacket, slim trousers, runners, a helmet and a work pack', a: 'a', sx: 'm', k: 'u3 s2 w1', season: [2, 2, 1.2],
    top: 'tee', layer: 'windbreaker', bottom: 'trackPants', shoes: 'runner', hat: 'helmet', gear: 'backpack',
    ways: [{ top: '#3a3f48', layer: '#2f3a58', bottom: '#1c1c20', shoes: '#6c7078', hat: '#1c1c20', gear: '#34363e' }, { top: '#9c9a94', layer: '#1c1c20', bottom: '#2a2c32', shoes: '#aaa6a0', hat: '#6c7078', gear: '#2a4a7a' }] },
  { id: 'nightOut', who: 'a night out: dark blazer over a black tee, slim black jeans, ankle boots', a: 'a', k: 'n5 m1 s1', season: [2, 2, 0.5],
    top: 'tee', layer: 'blazer', bottom: 'jeansSlim', shoes: 'ankleBoot', hat: 'none', gear: 'none',
    ways: [{ top: '#1c1c20', layer: '#2f3442', bottom: '#151a22', shoes: '#161616' }, { top: '#b4b0a4', layer: '#1c1c24', bottom: '#121216', shoes: '#2a1c18' }] },
];

const code = (a: string | undefined, c: string): boolean => (a ?? 'ato').includes(c);
const lookW = (k: string, l: string): number => { const m = new RegExp(`${l}(\\d)`).exec(k); return m ? Number(m[1]) : 0; };
export const LOOK_LETTER: Record<string, string> = { work: 'w', street: 's', smart: 'm', sport: 'p', church: 'c', elder: 'e', teen: 't', service: 'u', night: 'n' };

/** the outfits that suit a person (weight 0 = not at all) */
export function outfitWeights(age: 'kid' | 'teen' | 'adult' | 'old', sex: 'm' | 'f' | 'x', look: string, season: 'cold' | 'mild' | 'warm'): Array<[Outfit, number]> {
  const ac = age === 'kid' ? 'k' : age === 'teen' ? 't' : age === 'old' ? 'o' : 'a', si = season === 'cold' ? 0 : season === 'mild' ? 1 : 2;
  return OUTFITS.map((o) => [o, !code(o.a, ac) || (o.sx && sex !== 'x' && o.sx !== sex) ? 0 : lookW(o.k, LOOK_LETTER[look] ?? 's') * o.season[si]] as [Outfit, number]);
}
