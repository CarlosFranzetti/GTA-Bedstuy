/**
 * The mix engine (WARDROBE seat, body team round 2 and 3): the rules that let tops, layers, bottoms, shoes, hats and bags combine into believable people.
 * Every part has a FORMALITY rank 0 to 4 and the decades of wear it belongs to (docs/reference/wardrobe-60.md part 1 and 2); the pair rules (F1 top and bottom
 * within one rank, F2 shoes within one rank of the bottom, F3 layer within one rank of the top, with the named exceptions) and the table scores multiply into
 * the weights pedWardrobe.composeSpec draws with. Older people draw the 1990s and 2000s cuts, younger people today's (DIRECTION.md).
 * The colour pass runs on the random mix only (whole outfits are authored): at most one accent colour, a lightness gap between the top and the bottom,
 * the shoes sometimes echoing the bag. No lettering, logos or numbers anywhere. Pure functions, no globals: the same input is the same answer.
 */
import type { PedSpec } from './ped';

type Age = 'kid' | 'teen' | 'adult' | 'old';
type Season = 'cold' | 'mild' | 'warm';

// ---------------------------------------------------------------- tags: formality rank and decades of wear

/** [rank, decades]: n = today (2020s), o = 2000s, x = 1990s, e = 1980s, a = any (never penalised) */
export const TAGS: Record<string, [number, string]> = {
  // tops
  tank: [0, 'nx'], ribTank: [1, 'n'], bballJersey: [0, 'no'], footballShirt: [0, 'no'],
  tee: [1, 'n'], tallTee: [1, 'o'], pocketTee: [1, 'n'], longTee: [1, 'n'], henley: [1, 'nx'], crewSweat: [1, 'nx'], hoodieUp: [1, 'n'], hoodieDown: [1, 'n'], zipHoodie: [1, 'n'],
  flannel: [1, 'nx'], campShirt: [1, 'nx'],
  polo: [2, 'no'], knitPolo: [2, 'x'], sweater: [2, 'a'], turtleneck: [2, 'nx'], bandShirt: [2, 'a'], dashiki: [2, 'a'], scrubs: [2, 'n'], uniformShirt: [2, 'no'],
  shirt: [3, 'a'], dressShirt: [3, 'xo'], blouse: [2.5, 'xon'],
  // layers
  windbreaker: [0, 'xn'], velourTrack: [0, 'o'], trackJacket: [0, 'xo'],
  pufferShort: [1, 'n'], pufferLong: [1, 'n'], bomber: [1, 'x'], bomberNylon: [1, 'n'], denimJacket: [1, 'a'], denimClosed: [1, 'a'], fleece: [1, 'on'], shirtOpen: [1, 'xn'], parka: [1, 'a'],
  varsity: [1, 'ox'], cropJacket: [1, 'n'], rainSlicker: [1, 'a'],
  workJacket: [2, 'a'], cardigan: [2, 'x'], cardiganOpen: [2, 'x'], workVest: [2, 'n'], apron: [2, 'a'], chefJacket: [2, 'a'], barberSmock: [2, 'n'], labCoat: [2, 'a'],
  blazer: [3, 'a'], peacoat: [3, 'a'], trench: [3, 'a'], leatherCoat: [3, 'x'], overcoat: [4, 'a'],
  // bottoms
  trackPants: [0, 'xo'], bballShorts: [0, 'on'], runShorts: [0, 'a'], sweatShorts: [0, 'a'],
  sweatsCuffed: [1, 'n'], leggings: [1, 'n'], jeansStraight: [1, 'a'], jeansSlim: [1, 'n'], jeansBaggy: [1, 'on'], jeansWide: [1, 'n'], jeansCropped: [1, 'n'], jeansFlare: [1, 'on'],
  cargo: [1, 'on'], cargoF: [1, 'on'], cargoShorts: [1, 'on'], chinoShorts: [1, 'a'], denimShorts: [1, 'a'], denimSkirt: [1, 'a'], denimMaxi: [1, 'a'], tennisSkirt: [1, 'a'],
  chinos: [2, 'a'], workTrousers: [2, 'a'], workDark: [2, 'a'], cordTrousers: [2, 'x'], maxiSkirt: [2, 'a'],
  suitTrousers: [3, 'a'], trousersWide: [3, 'n'], trousersSlim: [3, 'n'], midiSkirt: [3, 'xa'], pencil: [3, 'a'], pleated: [3, 'xa'],
  // shoes
  slide: [0, 'n'], flipFlop: [0, 'n'], runner: [0, 'n'], sandal: [1, 'a'],
  sneakerLow: [1, 'n'], sneakerDark: [1, 'n'], sneakerHigh: [1, 'on'], canvasLow: [1, 'a'], chunkySneaker: [1, 'n'], tanBoot: [1, 'on'], rainBoot: [1, 'a'],
  workBoot: [2, 'a'], ankleBoot: [2, 'n'], tallBoot: [2, 'a'],
  loafer: [3, 'xn'], flat: [3, 'a'], dressShoe: [4, 'x'], heel: [4, 'a'],
};
export const rankOf = (id: string): number => TAGS[id]?.[0] ?? 1;

/** how likely each decade is, by age band (wardrobe-60.md 2.6) */
export const DECADE_W: Record<Age, Record<string, number>> = {
  kid: { n: 1, o: 0.02, x: 0.0, e: 0 },
  teen: { n: 1, o: 0.1, x: 0.05, e: 0 },
  adult: { n: 0.8, o: 1, x: 0.45, e: 0.02 },
  old: { n: 0.3, o: 0.8, x: 1, e: 0.4 },
};
/** the weight an age gives a part by the decades it belongs to (1 for parts of any decade) */
export function decadeW(id: string, age: Age): number {
  const t = TAGS[id];
  if (!t || t[1] === 'a') return 1;
  let m = 0; for (const d of t[1]) if (d === 'a') m = 1; else m = Math.max(m, DECADE_W[age][d] ?? 0);
  return m;
}

// ---------------------------------------------------------------- pair scores

const TOP_FAM: Record<string, string> = {
  tank: 'tank', ribTank: 'rib', bballJersey: 'jersey', footballShirt: 'jersey',
  tee: 'tee', tallTee: 'tee', pocketTee: 'tee', longTee: 'tee', henley: 'tee', hoodieUp: 'hood', hoodieDown: 'hood', zipHoodie: 'hood', crewSweat: 'hood',
  flannel: 'flannel', campShirt: 'camp', polo: 'polo', knitPolo: 'polo', sweater: 'sweater', turtleneck: 'sweater', shirt: 'shirt', bandShirt: 'shirt', dressShirt: 'dress', blouse: 'blouse',
  dashiki: 'dashiki', scrubs: 'scrubs', uniformShirt: 'uni', tunic: 'blouse',
};
const BOT_FAM: Record<string, string> = {
  jeansStraight: 'jeans', jeansSlim: 'jeans', jeansBaggy: 'jeans', jeansWide: 'jeans', jeansCropped: 'jeans', jeansFlare: 'jeans',
  cargo: 'cargo', cargoF: 'cargo', chinos: 'chinos', workTrousers: 'chinos', workDark: 'chinos', cordTrousers: 'chinos',
  sweatsCuffed: 'sweats', trackPants: 'sweats', suitTrousers: 'suit', trousersWide: 'suit', trousersSlim: 'suit',
  bballShorts: 'shorts', runShorts: 'shorts', cargoShorts: 'shorts', chinoShorts: 'shorts', denimShorts: 'shorts', sweatShorts: 'shorts',
  midiSkirt: 'skirt', maxiSkirt: 'skirt', pleated: 'skirt', pencil: 'skirt', denimSkirt: 'skirt', denimMaxi: 'skirt', tennisSkirt: 'skirt', leggings: 'leggings',
};
/** wardrobe-60.md 2.2: top family (rows) by bottom family (columns), in this order */
const COLS = ['jeans', 'cargo', 'chinos', 'sweats', 'suit', 'shorts', 'skirt', 'leggings'];
const TB: Record<string, number[]> = {
  tank: [1, 1.2, 0.3, 1, 0, 2, 0.5, 0.4], rib: [1, 1.2, 0.3, 1, 0, 2, 0.5, 1.5],
  jersey: [1, 0.6, 0.1, 1.5, 0, 0.3, 0, 0.1], tee: [2, 2, 1, 1.5, 0.15, 2, 0.5, 1.5], hood: [2, 2, 0.5, 2, 0, 1, 0.1, 1.2],
  flannel: [1.5, 1.5, 1.5, 0.2, 0.3, 1, 0.6, 0.3], camp: [1.5, 1.5, 1.5, 0.2, 0.3, 1.5, 0.6, 0.3], polo: [1.2, 0.8, 2, 0.2, 1.5, 1.2, 0.8, 0.2],
  sweater: [1.5, 0.6, 1.5, 0.3, 1.5, 0, 1.5, 1], shirt: [1.5, 0.4, 2, 0.1, 2, 0.8, 1.5, 0.3], dress: [0.6, 0.1, 1.5, 0, 2.5, 0.1, 0.3, 0],
  blouse: [1, 0.2, 1.5, 0.1, 2, 0.3, 2, 0.6], dashiki: [1.2, 0.5, 1.5, 0.2, 1.5, 0.4, 1, 0.4], scrubs: [0.3, 0.3, 1, 0.3, 0.3, 0.3, 0.3, 0.3], uni: [0.15, 0.5, 1.5, 0, 2.5, 0.15, 0, 0],
};
/** F1 and the compatibility table: how well a top and a bottom go together (0 never, 1 neutral, 2 likely) */
export function topBottom(topId: string, botId: string, age: Age = 'adult'): number {
  const tf = TOP_FAM[topId], bf = BOT_FAM[botId];
  if (!tf || !bf) return 1;
  let s = TB[tf][COLS.indexOf(bf)];
  if (botId === 'bballShorts' || botId === 'runShorts') s = tf === 'jersey' ? 2 : tf === 'tee' || tf === 'tank' || tf === 'rib' ? 1.6 : 0.3;
  if (botId === 'pencil') s = rankOf(topId) >= 2.5 ? 2 : 0.05;
  if (bf === 'skirt' && (tf === 'hood' || tf === 'jersey')) s = Math.min(s, 0.1);
  if (botId === 'leggings' && tf === 'rib') s = 1.5;
  if (bf === 'shorts' && (topId === 'sweater' || topId === 'turtleneck' || topId === 'longTee' || topId === 'crewSweat' || topId === 'henley' || topId === 'flannel')) s *= 0.15;   // shorts only with a short sleeve or none
  if (botId === 'cordTrousers' && age !== 'old') s *= 0.5;
  // F1: within one rank, except a shirt or a sweater with jeans (very common) and a hoodie or tee with chinos (young)
  const gap = Math.abs(rankOf(topId) - rankOf(botId));
  if (gap > 1.01 && !(bf === 'jeans' && (tf === 'shirt' || tf === 'sweater' || tf === 'dress' || tf === 'blouse' || tf === 'polo')) && !(bf === 'chinos' && age !== 'old' && (tf === 'tee' || tf === 'hood'))) s *= 0.3;
  return s;
}

const TEE_ISH = new Set(['tee', 'tallTee', 'pocketTee', 'longTee', 'henley', 'turtleneck', 'ribTank']);
const NEVER_FORMAL = new Set(['bballJersey', 'footballShirt', 'tank', 'ribTank', 'hoodieUp', 'hoodieDown', 'zipHoodie', 'crewSweat']);
/** F3 and 2.5: what goes over what (0 never) */
export function layerScore(layerId: string, topId: string, botId: string): number {
  const formal = rankOf(layerId) >= 3;
  if (formal && NEVER_FORMAL.has(topId)) return layerId === 'overcoat' && (topId === 'hoodieUp' || topId === 'hoodieDown') ? 0.12 : 0.03;
  const bf = BOT_FAM[botId];
  if (formal && (bf === 'sweats' || bf === 'shorts')) return 0.03;
  const gap = rankOf(layerId) - rankOf(topId);
  let s = Math.abs(gap) <= 1.01 ? 1 : 0.25;
  if (layerId === 'blazer' && TEE_ISH.has(topId) && (botId === 'jeansSlim' || botId === 'chinos' || botId === 'suitTrousers' || botId === 'trousersSlim')) s = 1.2;
  if ((layerId === 'bomber' || layerId === 'denimJacket') && (topId === 'shirt' || topId === 'dressShirt')) s = 1.5;
  if (layerId === 'denimJacket' && (topId === 'flannel' || topId === 'hoodieUp')) s *= 0.3;
  if ((layerId === 'cardigan' || layerId === 'cardiganOpen') && NEVER_FORMAL.has(topId)) s *= 0.05;
  if ((layerId === 'workJacket' || layerId === 'shirtOpen') && topId === 'flannel') s *= 0.05;      // never two plaids: a flannel is a top, it is not worn open over another
  if (layerId === 'workVest' && rankOf(topId) >= 3) s *= 0.1;
  if (layerId === 'windbreaker' && rankOf(topId) >= 3) s *= 0.1;
  if (layerId === 'velourTrack' && !TEE_ISH.has(topId) && topId !== 'tank' && topId !== 'polo') s *= 0.2;
  if ((layerId === 'cardigan' || layerId === 'cardiganOpen' || layerId === 'blazer') && bf === 'jeans' && rankOf(topId) < 2) s *= 0.5;
  if ((layerId === 'pufferLong' || layerId === 'parka' || layerId === 'overcoat') && bf === 'shorts') s *= 0.1;
  if (formal && topId === 'scrubs') s = 0.02;
  return s;
}

const SNEAKERS = new Set(['sneakerLow', 'sneakerDark', 'canvasLow', 'chunkySneaker', 'sneakerHigh']);
const WARM2_LAYERS = new Set(['pufferShort', 'pufferLong', 'parka', 'overcoat', 'peacoat']);
/** F2 and 2.3: shoes with a bottom, a top and a layer (0 never). `wet`: rain. */
export function shoeScore(shoeId: string, botId: string | null, topId: string, layerId: string, season: Season, age: Age, wet = false): number {
  let s = 1;
  const bf = botId ? BOT_FAM[botId] : undefined;
  const sr = rankOf(shoeId), br = botId ? rankOf(botId) : sr;
  if (bf) {
    const gap = Math.abs(sr - br);
    if (gap > 1.01) {
      // exceptions: clean sneakers with chinos or a suit (the young, a modern office look), sneakers with a midi skirt, sneakers or boots with a maxi
      if (SNEAKERS.has(shoeId) && (bf === 'chinos' || bf === 'suit' || bf === 'skirt') && age !== 'old') s *= bf === 'skirt' ? 0.5 : 0.8;
      else s *= 0.1;
    }
  }
  if ((shoeId === 'slide' || shoeId === 'flipFlop' || shoeId === 'sandal') && (WARM2_LAYERS.has(layerId) || season === 'cold' || wet)) return 0;
  if ((shoeId === 'slide' || shoeId === 'flipFlop') && (bf === 'chinos' || bf === 'suit')) return 0;
  if (shoeId === 'heel' && (age !== 'adult' || bf === 'sweats' || bf === 'shorts' || bf === 'cargo')) return 0;
  if (shoeId === 'sneakerHigh' && (bf === 'suit' || bf === 'skirt' || botId === 'jeansCropped')) s *= 0.1;
  if (shoeId === 'sneakerHigh' && (botId === 'jeansBaggy' || botId === 'jeansWide' || botId === 'cargo' || botId === 'bballShorts' || bf === 'sweats')) s *= 2;
  if (shoeId === 'chunkySneaker' && (bf === 'suit' || bf === 'skirt')) s *= (botId === 'trousersWide' ? 2 : 0.4);
  if (shoeId === 'runner' && (bf === 'sweats' || bf === 'leggings' || bf === 'shorts')) s *= 2;
  if (shoeId === 'runner' && (bf === 'suit' || botId === 'pencil' || rankOf(layerId) >= 3)) s *= 0.05;
  if (shoeId === 'workBoot' && (bf === 'suit' || bf === 'skirt' || rankOf(layerId) >= 3)) s *= 0.05;
  if (shoeId === 'workBoot' && bf === 'shorts') s *= 0.3;
  if (shoeId === 'tanBoot' && (bf === 'shorts' || bf === 'skirt' || bf === 'suit')) s *= 0.05;
  if (shoeId === 'ankleBoot' && (bf === 'shorts' || botId === 'trackPants' || bf === 'cargo')) s *= 0.05;
  if ((shoeId === 'loafer' || shoeId === 'dressShoe') && (bf === 'sweats' || bf === 'shorts' || botId === 'jeansBaggy' || botId === 'jeansWide' || bf === 'leggings' || NEVER_FORMAL.has(topId))) s *= 0.05;
  if ((shoeId === 'loafer' || shoeId === 'dressShoe') && age === 'kid') s *= 0.05;
  if (shoeId === 'flat' && bf === 'cargo') s *= 0.3;
  if (shoeId === 'tallBoot' && (bf === 'shorts' || bf === 'cargo' || bf === 'sweats')) return 0;
  return s;
}

// ---------------------------------------------------------------- headwear and hair

/** hair that fits under (or beside) each hat: the geometry puts the hat on the skull, so tight hats only take short hair; undefined = any hair */
const SHORT_HAIR = new Set(['bald', 'short', 'fade', 'crop', 'waves', 'thinning', 'curly']);
const SMALL_BUN = new Set(['bun', 'ponytail', 'bob']);
export const HAT_HAIR: Record<string, ReadonlySet<string> | undefined> = {
  none: undefined, cap: new Set([...SHORT_HAIR, ...SMALL_BUN, 'braids', 'twists']), snapback: new Set([...SHORT_HAIR, 'braids', 'twists']),
  beanie: new Set([...SHORT_HAIR, 'bun', 'ponytail']), bucket: new Set([...SHORT_HAIR, ...SMALL_BUN, 'braids', 'twists']),
  flat: SHORT_HAIR, fedora: SHORT_HAIR, church: new Set([...SHORT_HAIR, ...SMALL_BUN, 'waves', 'long']),
  durag: new Set(['bald', 'short', 'fade', 'crop', 'waves']), headwrap: new Set([...SHORT_HAIR, 'bun']), hijab: new Set(['bald', 'short', 'bun']),
  kufi: new Set(['bald', 'short', 'fade', 'crop', 'thinning', 'curly', 'waves']), hardhat: new Set([...SHORT_HAIR, 'ponytail']), helmet: new Set([...SHORT_HAIR, 'ponytail', 'bun']),
  hood: new Set([...SHORT_HAIR, ...SMALL_BUN, 'braids', 'twists', 'locs', 'long']), hoodDown: undefined, scarf: undefined,
};
export const hairFitsHat = (hat: string, hair: string): boolean => { const s = HAT_HAIR[hat]; return !s || s.has(hair); };

export interface HatCtx { topId: string; layerId: string; botId: string; shoeId: string; season: Season; look: string; age: Age; sex: 'm' | 'f' | 'x' }
/** the multiplier a hat gets from what the person wears (0 never): the clashes of wardrobe-60.md 2.4 */
export function hatScore(hat: string, c: HatCtx): number {
  const formalLayer = rankOf(c.layerId) >= 3 && !!c.layerId, hoodTop = c.topId === 'hoodieUp' || c.topId === 'hoodieDown' || c.topId === 'crewSweat';
  let s = 1;
  if (hat === 'church') { if (c.look !== 'church' && c.look !== 'smart' && c.look !== 'elder') return 0; if (hoodTop || NEVER_FORMAL.has(c.topId) || c.sex === 'm') return 0; }
  if (hat === 'fedora') { if (c.look !== 'church' && c.look !== 'smart' && c.look !== 'elder') s *= 0.1; if (hoodTop || NEVER_FORMAL.has(c.topId)) return 0; }
  if (hat === 'flat' && (hoodTop || NEVER_FORMAL.has(c.topId))) s *= 0.05;
  if (hat === 'hardhat' && c.look !== 'work' && c.look !== 'service') return 0;
  if (hat === 'helmet' && (formalLayer || c.look === 'church' || c.look === 'smart' || c.look === 'night')) return 0;
  if ((hat === 'cap' || hat === 'snapback' || hat === 'bucket') && (formalLayer || c.look === 'church')) s *= 0.04;
  if (hat === 'beanie') s *= c.season === 'warm' ? 0.02 : formalLayer ? 0.1 : 1;
  if ((hat === 'durag' || hat === 'headwrap') && (c.look === 'church' || c.look === 'work' || (c.look === 'smart' && formalLayer))) s *= 0.1;
  if (hat === 'kufi' && hoodTop) return 0;
  if (hat === 'bucket' && c.season === 'cold') s *= 0.1;
  return s;
}

// ---------------------------------------------------------------- colour: families, lightness, accents

const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
/** CIE L* of a colour (0 to 100) */
export function lstar(h: string): number {
  const [r, g, b] = hexRgb(h), y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}
/** hue (0..360), HSV saturation and value of a colour */
export function hsv(h: string): [number, number, number] {
  const [r, g, b] = hexRgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0;
  if (d > 0) hue = mx === r ? 60 * (((g - b) / d + 6) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [hue, mx ? d / mx : 0, mx / 255];
}
/**
 * An ACCENT is a colour with HSV saturation above 0.45 that is not one of the neutral families (black, white, grey, navy, denim blue, olive and forest, brown and tan).
 * A person has at most one (wardrobe-60.md 2.7). Rust, burgundy, ochre, safety yellow and orange, red-brown and teal are accents.
 */
export function isAccent(h: string): boolean {
  const [hue, s, v] = hsv(h);
  if (s <= 0.45) return false;
  if (hue >= 195 && hue <= 262) return false;                       // navy, denim, slate
  if (hue >= 60 && hue < 195 && (s < 0.62 || v < 0.5) && !(hue > 160 && s > 0.45 && v > 0.4)) return false;   // olive, forest, sage (teal is an accent)
  if (hue >= 22 && hue <= 50 && s < 0.62) return false;              // brown, tan, camel, khaki
  if (hue >= 10 && hue < 22 && v < 0.4) return false;                // dark chocolate leather
  if (hue >= 262 && hue < 300 && v < 0.36) return false;             // very dark plum
  return true;
}
/** a name for the family a colour belongs to: the spread test counts people by it */
export function colourFamily(h: string): string {
  const L = lstar(h), [hue, s] = hsv(h);
  if (L < 20) return 'black';
  const blue = hue >= 195 && hue <= 262;
  if (L >= 66 && blue) return 'paleblue';
  if (L >= 66 && s < 0.1) return 'offwhite';
  if (s < 0.14 || (blue && s < 0.28)) return L < 38 ? 'charcoal' : L < 66 ? 'grey' : 'cream';        // a blue-grey is still a grey
  if (blue) return L < 34 ? 'navy' : 'denim';
  if (hue >= 60 && hue < 195) return 'olive';
  if (hue >= 18 && hue < 60) return L > 62 ? 'cream' : s > 0.3 && L < 50 ? 'brown' : 'tan';
  if (L < 40) return 'burgundy';
  return 'rust';
}
/** the colours of the outermost garment and the family counted for the spread */
export const outerColour = (s: Pick<PedSpec, 'top'>): string => s.top.color;

/** the one-colour-family tonal sets (matching suit, tracksuit, scrubs, uniform) may have a smaller lightness gap */
function tonal(a: string, b: string): boolean { const [ha, sa] = hsv(a), [hb, sb] = hsv(b); return sa < 0.2 || sb < 0.2 || Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb)) < 30; }
export const VALUE_GAP = 18, VALUE_GAP_TONAL = 8, VALUE_GAP_LAYER = 12;

export interface PassParts { layerId: string; topId: string; botId: string; onePiece: boolean }
/**
 * The colour pass on a random mix: (1) top and bottom differ in lightness by L* 18 (8 for a tonal set), the layer and the top under it by 12: the less visible piece
 * is re-drawn, then falls back to black or off-white; (2) one accent: a second accent colour is toned down; (3) a leather shoe sometimes takes the bag's colour.
 * `redraw(slot)` returns a new colour from the slot's own pool; `r` gives numbers in [0,1).
 */
export function colourPass(spec: PedSpec, parts: PassParts, redraw: (slot: 'under' | 'bottom' | 'top' | 'gear') => string, r: () => number): void {
  const t = spec.top, b = spec.bottom;
  const tonalSet = parts.onePiece || parts.topId === 'scrubs' || parts.layerId === 'velourTrack' || parts.layerId === 'trackJacket' || (rankOf(parts.layerId) >= 3 && rankOf(parts.botId) >= 3);
  const gapOk = (x: string, y: string): boolean => { const g = Math.abs(lstar(x) - lstar(y)); return g >= VALUE_GAP || (tonalSet && tonal(x, y) && g >= VALUE_GAP_TONAL); };
  // one accent: keep the first of hat or bag, shoe, layer or top (the order of likelihood in 2.7), tone down the rest
  const slots: Array<[string, () => string, (c: string) => void]> = [
    ['gear', () => spec.gearColor, (c) => { spec.gearColor = c; }],
    ['hat', () => spec.hatColor, (c) => { spec.hatColor = c; spec.hatTrim = c; }],
    ['shoes', () => spec.shoes.color, (c) => { spec.shoes.color = c; spec.shoes.accent = c; }],
    ['top', () => spec.top.color, (c) => { spec.top.color = c; }],
    ['bottom', () => spec.bottom.color, (c) => { spec.bottom.color = c; }],
  ];
  if (spec.top.under) slots.splice(4, 0, ['under', () => spec.top.under!, (c) => { spec.top.under = c; }]);
  if (spec.gear === 'none') slots.shift();
  if (spec.hat === 'none' || spec.hat === 'hood' || spec.hat === 'hoodDown') slots.splice(slots.findIndex((s) => s[0] === 'hat'), 1);
  let kept: string | null = null;                                   // one accent COLOUR (a scrub top and its trousers are the same one)
  for (const [, get, set] of slots) {
    const c = get();
    if (!isAccent(c)) continue;
    if (kept === null || c === kept) { kept = c; continue; }
    set(mute(c));
  }
  if (!parts.onePiece) {
    for (let i = 0; i < 10 && !gapOk(t.color, b.color); i++) b.color = redraw('bottom');
    if (!gapOk(t.color, b.color)) b.color = lstar(t.color) > 45 ? '#232b3b' : '#a89a78';
    b.trim = b.trim;
    if (parts.layerId && t.under) {
      for (let i = 0; i < 8 && Math.abs(lstar(t.color) - lstar(t.under)) < VALUE_GAP_LAYER; i++) t.under = redraw('under');
      if (Math.abs(lstar(t.color) - lstar(t.under)) < VALUE_GAP_LAYER) t.under = lstar(t.color) > 50 ? '#3a3f48' : '#b4b0a4';
    }
  }
  if (spec.hat === 'hood' || spec.hat === 'hoodDown') { spec.hatColor = spec.top.color; spec.hatTrim = spec.top.trim; }
  // the shoes echo the bag one time in four (leather shoes only; never a bright bag)
  if (spec.gear !== 'none' && ['loafer', 'dressShoe', 'flat', 'workBoot', 'heel'].includes(spec.shoes.kind ?? '') && r() < 0.25 && !isAccent(spec.gearColor)) {
    spec.shoes.color = spec.gearColor; spec.shoes.sole = darken(spec.gearColor, 0.35); spec.shoes.accent = darken(spec.gearColor, 0.7);
  }
}
const darken = (h: string, k: number): string => { const c = hexRgb(h); return `#${c.map((x) => Math.round(x * k).toString(16).padStart(2, '0')).join('')}`; };
/** tone an accent down to a neutral of the same lightness (keeps a hint of the hue so it does not read as grey) */
export function mute(h: string): string {
  const [r, g, b] = hexRgb(h), y = 0.3 * r + 0.59 * g + 0.11 * b, k = 0.32;
  return `#${[r, g, b].map((x) => Math.round(y + (x - y) * k).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------- what the geometry cannot make yet (for the FIT seat)

/** Parts built today from the nearest garment kind; the spec carries top.fit / top.neck / bottom.fit / shoes.chunky so FIT can finish the shape. */
export const NEEDS_SHAPE: Record<string, string> = {
  tallTee: 'oversized tee: chest ease 32 cm, hem to the upper thigh, shoulder seam dropped 6 cm, sleeve to mid-forearm (top.fit oversized)',
  ribTank: 'fitted rib tank: scoop neck, 2.5 cm straps, hem at the waist or hip (top.fit skin, top.neck scoop)',
  turtleneck: 'folded roll neck 7 cm tall standing 4 cm off the throat (top.neck roll)',
  henley: 'three-button placket 12 cm, no collar (top.neck henley)',
  bandShirt: 'mandarin collar 2.5 cm and a short placket, hem to the knee (top.neck band)',
  dashiki: 'wide sleeves to the elbow, rounded V neck with a 2 cm band, oversized (top.neck wide, top.fit oversized)',
  cropJacket: 'hem at the waist, relaxed, work or bomber cut (top.fit cropped)',
  jeansWide: 'straight from the hip, ankle opening 32 cm, 3 cm stack, high rise (bottom.fit wide)',
  trousersWide: 'high rise, ankle opening 30 cm, a pleat at the waist, a soft fall (bottom.fit wide)',
  chunkySneaker: 'platform sole 4 cm, wide round toe (shoes.chunky)',
  velourTrack: 'nothing new in shape: a plush nap in the painter',
  chefJacket: 'double-breasted front with two rows of cloth knots, three-quarter sleeve turned back',
  barberSmock: 'short sleeve, snap front, hem mid-thigh',
  bonnet: 'HEAD: satin gathered cap, wide soft band, puffed crown 6 cm, no tail (drawn today as a headwrap)',
  strawHat: 'HEAD: woven brim 7 cm with a low rounded crown (drawn today as a bucket hat)',
  sling: 'GEAR: small pack 20 x 12 x 8 cm worn on the chest, one diagonal strap (drawn today as a messenger bag)',
  duffel: 'GEAR: barrel bag 55 x 28 cm, two handles (drawn today as a messenger bag)',
  groceryBag: 'GEAR: bulb shopping bag 30 cm tall, swinging at the knee (drawn today as a tote)',
  deliveryBag: 'GEAR: square insulated pack 35 x 35 x 30 cm on the back (drawn today as a backpack)',
  headphones: 'HEAD: on-ear band over the head, 5 cm cups, or earbuds with a thin cable',
};

/** headwear and bag colourways as DATA (wardrobe-60.md 1.4 and 1.6): what the existing shapes can already be made in, by hat id */
export const HAT_WAYS: Record<string, string[]> = {
  cap: ['#1c1c20', '#2a4a7a', '#6c7078', '#4a5a48', '#5a5348', '#7a3028'], snapback: ['#1c1c20', '#6c7078', '#2f3a58', '#7a3028'],
  beanie: ['#1c1c20', '#2f3442', '#b0aca0', '#7a3028', '#4a5a48', '#5a5348', '#8a7048'], bucket: ['#4a5a48', '#bdb49c', '#1c1c20', '#6a8098', '#8a7048', '#b0aca0'],
  flat: ['#5a5348', '#3a3028', '#2f3442', '#6c7078', '#7a6a4c'], fedora: ['#2f3442', '#3a3028', '#5a5348', '#101014'],
  church: ['#3b2a52', '#d8c8b0', '#2d2638', '#c9a2a0', '#5a2a34', '#34483a'], headwrap: ['#8a6a2a', '#3a6a74', '#8a4a32', '#c8bfae', '#34483a', '#5a2a34'],
  durag: ['#1c1c20', '#2f3a58', '#6c7078', '#5a2a34'], kufi: ['#d8d4c8', '#c8bca0', '#1c1c20', '#5a4228'], hardhat: ['#f4f4f0', '#d8c84a', '#c87a2a'],
  helmet: ['#1c1c20', '#6c7078', '#b8b8b4'], hijab: ['#1c1c20', '#2f3a58', '#8a8a86', '#b0a894'],
};
export const GEAR_WAYS: Record<string, string[]> = {
  backpack: ['#1c1c20', '#2f3442', '#34363e', '#6c7078', '#4a5a48'], bag: ['#1c1c20', '#3a2a22', '#8a7048', '#4a2a2a', '#2a2220'],
  tote: ['#b0aca0', '#1c1c20', '#8a7048', '#2f3a58', '#5a5348'], messenger: ['#1c1c20', '#3a2a22', '#2a2c32', '#8a7048', '#34363e'],
};
