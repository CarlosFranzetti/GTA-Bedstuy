/**
 * The street population. BASE_SPECS (ped.ts) are OUTFITS; here every outfit is worn by people of different backgrounds, sexes and ages
 * (so clothing and role are not tied to a skin tone), plus new everyday outfits (Hasidic man and woman, hijabi, gentrifier with a
 * tote, cyclist, office workers, construction worker, delivery rider ...) and the player's random looks.
 *
 * `group` is a crowd category used for the mix and for the MakeHuman body (race-target blend, see scripts/people-pipeline.mjs GROUPS):
 * faces differ in structure, not only in tint. Nobody is drawn as a caricature: the groups only choose skin tone palette, hair
 * options and the body shape; outfits are everyday dress, with religious dress only on the people who wear it.
 */
import type { PedSpec, PopGroup } from './ped';

export const GROUP_SHARE: Record<PopGroup, number> = { ba: 0.22, ca: 0.09, la: 0.15, wh: 0.18, ea: 0.09, sa: 0.07, me: 0.05, mx: 0.08, hj: 0.07 };
export const GROUPS = Object.keys(GROUP_SHARE) as PopGroup[];

/** skin tone palettes (sRGB hex), hair colours and natural hair styles per group */
export const PALETTE: Record<PopGroup, { skin: string[]; hair: string[] }> = {
  ba: { skin: ['#5e3a26', '#6e4530', '#8d5a3a', '#4a2e1e', '#7a4c32'], hair: ['#0e0a08', '#150e0a', '#1c1410'] },
  ca: { skin: ['#8d5a3a', '#a56e46', '#b97f55', '#6e4530'], hair: ['#120c08', '#1c1410', '#2a1c12'] },
  la: { skin: ['#d9a37a', '#c99068', '#b97f55', '#e0b48a'], hair: ['#17110d', '#241812', '#2a1c12'] },
  wh: { skin: ['#e0b08c', '#d9a680', '#d19c76', '#e6b894', '#d6a47d'], hair: ['#4a3220', '#8a6a3a', '#c8a060', '#6a3a22', '#2a1c12', '#b8b8b8'] },
  ea: { skin: ['#dcb088', '#d3a47a', '#cb986e', '#e0b78f'], hair: ['#0e0a08', '#17110d', '#1c1410'] },
  sa: { skin: ['#b97f55', '#a56e46', '#8d5a3a', '#c99068'], hair: ['#0e0a08', '#17110d', '#241812'] },
  me: { skin: ['#d9a37a', '#c99068', '#b97f55', '#e0b48a'], hair: ['#17110d', '#241812', '#2a1c12'] },
  mx: { skin: ['#d9a37a', '#b97f55', '#8d5a3a', '#e0b48a'], hair: ['#17110d', '#2a1c12', '#4a3220'] },
  hj: { skin: ['#e0b08c', '#d9a680', '#d19c76'], hair: ['#2a1c12', '#4a3220', '#17110d'] },
};

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** a few percent of lightness / warmth variation per person so no two tones are identical */
function varied(hex: string, id: string): string {
  const h = hash(id + 'v'), k = ((h % 1000) / 1000 - 0.5) * 0.1, w = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.04;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const o = c.map((x, i) => Math.max(0, Math.min(255, Math.round(x * (1 + k) + (i === 0 ? 255 * w : i === 2 ? -255 * w : 0)))));
  return `#${o.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
const pick = <T,>(a: readonly T[], id: string, salt: string): T => a[hash(id + salt) % a.length];

interface Person {
  id: string; outfit: string; group: PopGroup; sex: 'm' | 'f' | 'x'; age: 'kid' | 'teen' | 'adult' | 'old';
  hair?: PedSpec['hair']; hairColor?: string; hat?: PedSpec['hat']; hatColor?: string; hatTrim?: string; hatLogo?: string;
  face?: Partial<PedSpec['face']>; top?: Partial<PedSpec['top']>; bottom?: Partial<PedSpec['bottom']>; build?: PedSpec['build'];
  gear?: PedSpec['gear']; gearColor?: string; shoes?: Partial<PedSpec['shoes']>; sunday?: boolean; skin?: string;
}

const FEM_FACE: Partial<PedSpec['face']> = { eyes: 'wide', brows: 'arched', lashes: true, lips: '#a8484f' };
const NOFACE: Partial<PedSpec['face']> = { stubble: false, beard: false, mustache: false };

/** Outfits that are not in BASE_SPECS (new everyday looks). */
const NEW_OUTFITS: Record<string, Omit<PedSpec, 'id' | 'skin'>> = {
  'hasidic-man': {
    role: 'civilian', hair: 'peyot', hairColor: '#2a1c12', hat: 'fedora', hatColor: '#101014', hatTrim: '#2a2a30', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat', beard: true, mustache: true },
    top: { kind: 'jacket', color: '#121216', trim: '#0a0a0e', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#f4f4f4', long: true },
    bottom: { kind: 'trousers', color: '#121216', trim: '#0a0a0e' }, shoes: { color: '#0e0e0e', sole: '#050505', accent: '#222222' },
    gear: 'none', gearColor: '#222222', build: 'avg', weight: 1,
  },
  'hasidic-woman': {
    role: 'civilian', hair: 'long', hairColor: '#3a2418', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'arched', mouth: 'smile', lips: '#9a4a52' },
    top: { kind: 'cardigan', color: '#34343f', trim: '#26262e', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#e8e4dc' },
    bottom: { kind: 'skirt', color: '#2a2a34', trim: '#1c1c24', long: true }, shoes: { color: '#1c1c1c', sole: '#0a0a0a', accent: '#333333' },
    gear: 'none', gearColor: '#222222', build: 'avg', weight: 1,
  },
  'hijabi': {
    role: 'civilian', hair: 'bald', hairColor: '#17110d', hat: 'hijab', hatColor: '#6f8aa0', hatTrim: '#6f8aa0', hatLogo: '',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#a05058' },
    top: { kind: 'jacket', color: '#3a5a6a', trim: '#2a4452', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#f0ece4', long: true },
    bottom: { kind: 'trousers', color: '#2a2e36', trim: '#1c2026' }, shoes: { color: '#f4f4f4', sole: '#d0d0d0', accent: '#3a5a6a' },
    gear: 'bag', gearColor: '#b8a080', build: 'avg', weight: 1,
  },
  'tote-gentrifier': {
    role: 'civilian', hair: 'long', hairColor: '#6a3a22', hat: 'beanie', hatColor: '#b8532a', hatTrim: '#8a3a1c', hatLogo: '',
    face: { eyes: 'dot', brows: 'thin', mouth: 'smile' },
    top: { kind: 'cardigan', color: '#d8cdb8', trim: '#b8ad98', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#f4f1e8' },
    bottom: { kind: 'jeans', color: '#4a5a78', trim: '#34425c' }, shoes: { color: '#f4f4f4', sole: '#e0e0e0', accent: '#3a6a4a' },
    gear: 'bag', gearColor: '#e0d4b0', build: 'slim', weight: 1,
  },
  'cyclist': {
    role: 'civilian', hair: 'short', hairColor: '#4a3220', hat: 'helmet', hatColor: '#e8e8ec', hatTrim: '#2a5ab0', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat' },
    top: { kind: 'jersey', color: '#2a5ab0', trim: '#e8e8ec', sleeves: 'short', print: 'stripes', printColor: '#e8e8ec' },
    bottom: { kind: 'leggings', color: '#14161a', trim: '#0a0c10' }, shoes: { color: '#1a1a1e', sole: '#0c0c10', accent: '#e8e8ec' },
    gear: 'none', gearColor: '#222222', build: 'slim', weight: 1,
  },
  'office-jacket': {
    role: 'civilian', hair: 'short', hairColor: '#241812', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat' },
    top: { kind: 'jacket', color: '#2f3442', trim: '#1c2030', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#f4f4f4', tie: '#7a2a3a' },
    bottom: { kind: 'trousers', color: '#2f3442', trim: '#1c2030' }, shoes: { color: '#161616', sole: '#0a0a0a', accent: '#444444' },
    gear: 'bag', gearColor: '#3a3028', build: 'avg', weight: 1,
  },
  'office-blouse': {
    role: 'civilian', hair: 'long', hairColor: '#241812', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'arched', mouth: 'smile', lips: '#a8484f' },
    top: { kind: 'blouse', color: '#c8d8e8', trim: '#a8b8c8', sleeves: 'long', print: 'none', printColor: '#ffffff' },
    bottom: { kind: 'trousers', color: '#3a3e4a', trim: '#262a34' }, shoes: { color: '#3a2a22', sole: '#1a1210', accent: '#6a5a4a' },
    gear: 'bag', gearColor: '#7a4a32', build: 'avg', weight: 1,
  },
  'loose-hoodie': {
    role: 'civilian', hair: 'short', hairColor: '#2a1c12', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'thin', mouth: 'flat' },
    top: { kind: 'hoodie', color: '#8a9a8a', trim: '#6a7a6a', sleeves: 'long', print: 'none', printColor: '#ffffff', zip: false },
    bottom: { kind: 'cargo', color: '#4a4a40', trim: '#323228' }, shoes: { color: '#e8e8e8', sole: '#bdbdbd', accent: '#8a9a8a' },
    gear: 'none', gearColor: '#222222', build: 'avg', weight: 1,
  },
  'transit-worker': {
    // a transit-authority style uniform (parody: plain navy, reflective piping, no lettering)
    role: 'civilian', hair: 'short', hairColor: '#241812', hat: 'cap', hatColor: '#1b2c52', hatTrim: '#d8d8dc', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat' },
    top: { kind: 'uniform', color: '#2a4478', trim: '#16213a', sleeves: 'long', print: 'badge', printColor: '#c8cdd4' },
    bottom: { kind: 'trousers', color: '#1c2540', trim: '#10162a' }, shoes: { color: '#161616', sole: '#0a0a0a', accent: '#444444' },
    gear: 'none', gearColor: '#222222', build: 'avg', weight: 1,
  },
  'site-crew': {
    role: 'civilian', hair: 'short', hairColor: '#2a1c12', hat: 'hardhat', hatColor: '#f4f4f0', hatTrim: '#d0d0cc', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat', stubble: true },
    top: { kind: 'vest', color: '#f0731a', trim: '#c85a10', sleeves: 'long', print: 'stripes', printColor: '#d8d8d8', under: '#3a3f48' },
    bottom: { kind: 'cargo', color: '#6a5f48', trim: '#4a4232' }, shoes: { color: '#8a6a2a', sole: '#3a2a10', accent: '#c9a36a', high: true },
    gear: 'none', gearColor: '#222222', build: 'stocky', weight: 1,
  },
  'denim-over-hoodie': {
    role: 'civilian', hair: 'fade', hairColor: '#17110d', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'smile' },
    top: { kind: 'jacket', color: '#4d6c98', trim: '#364f74', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#8c9098', open: true, fabric: 'denim' },
    bottom: { kind: 'jeans', color: '#222a3a', trim: '#161c28' }, shoes: { color: '#e8e4dc', sole: '#c8c4bc', accent: '#3a3a40' },
    gear: 'messenger', gearColor: '#3a4a3a', build: 'avg', weight: 1,
  },
  'bomber-tee': {
    role: 'civilian', hair: 'short', hairColor: '#2a1c12', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat' },
    top: { kind: 'jacket', color: '#2b2622', trim: '#1a1612', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#e8e6e0', open: true, fabric: 'leather' },
    bottom: { kind: 'jeans', color: '#2e3848', trim: '#1c2430' }, shoes: { color: '#f0f0ee', sole: '#d8d8d4', accent: '#7a2a2a' },
    gear: 'none', gearColor: '#222222', build: 'avg', weight: 1,
  },
  'camel-coat': {
    role: 'civilian', hair: 'short', hairColor: '#241812', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat' },
    top: { kind: 'jacket', color: '#9a8260', trim: '#6a5a40', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#f4f4f4', tie: '#5a2a3a', long: true, fabric: 'wool' },
    bottom: { kind: 'trousers', color: '#2a2e3a', trim: '#1a1e28' }, shoes: { color: '#161616', sole: '#0a0a0a', accent: '#444444' },
    gear: 'messenger', gearColor: '#4a3a2a', build: 'tall', weight: 1,
  },
  'sundress': {
    role: 'civilian', hair: 'long', hairColor: '#241812', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#b0505a' },
    top: { kind: 'dress', color: '#c8586a', trim: '#f4e8e0', sleeves: 'short', print: 'heart', printColor: '#f4e8e0', pattern: 'print' },
    bottom: { kind: 'skirt', color: '#c8586a', trim: '#f4e8e0' }, shoes: { color: '#f4f0e8', sole: '#d8d0c0', accent: '#c8586a' },
    gear: 'tote', gearColor: '#d8c8a0', build: 'slim', weight: 1,
  },
  'shorts-tee': {
    role: 'civilian', hair: 'short', hairColor: '#2a1c12', hat: 'cap', hatColor: '#3a4a3a', hatTrim: '#e8e8e8', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'smile' },
    top: { kind: 'tee', color: '#e4dcc6', trim: '#c8c0aa', sleeves: 'short', print: 'none', printColor: '#ffffff', pattern: 'heather' },
    bottom: { kind: 'shorts', color: '#a89a78', trim: '#8a7c5a' }, shoes: { color: '#e8e8e8', sole: '#bdbdbd', accent: '#3a5a8a' },
    gear: 'none', gearColor: '#222222', build: 'avg', weight: 1,
  },
  'breton-tee': {
    role: 'civilian', hair: 'long', hairColor: '#4a3220', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { eyes: 'dot', brows: 'thin', mouth: 'smile', glasses: '#2a2a2a' },
    top: { kind: 'tee', color: '#e8e8e4', trim: '#c8c8c4', sleeves: 'long', print: 'stripes', printColor: '#1f3a6a', pattern: 'stripe' },
    bottom: { kind: 'jeans', color: '#3a4a68', trim: '#28344c' }, shoes: { color: '#f0f0ee', sole: '#d8d8d4', accent: '#1f3a6a' },
    gear: 'tote', gearColor: '#c8b890', build: 'slim', weight: 1,
  },
  'flannel-open': {
    role: 'civilian', hair: 'short', hairColor: '#4a3220', hat: 'beanie', hatColor: '#2f3a48', hatTrim: '#222a34', hatLogo: '',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat', beard: true },
    top: { kind: 'jacket', color: '#2a5a4a', trim: '#1c3c32', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#d8d4cc', open: true, pattern: 'plaid' },
    bottom: { kind: 'jeans', color: '#2a3446', trim: '#1c2434' }, shoes: { color: '#5b3a24', sole: '#2a1a10', accent: '#c9a36a', high: true },
    gear: 'backpack', gearColor: '#3a3a40', build: 'avg', weight: 1,
  },
};

const PEOPLE: Person[] = [
  // Black American
  { id: 'ba-hoodie-fade', outfit: 'hoodie-cap', group: 'ba', sex: 'm', age: 'adult', hat: 'none' },
  { id: 'ba-puffer-braids', outfit: 'puffer-braids', group: 'ba', sex: 'f', age: 'adult', hair: 'braids' },
  { id: 'ba-church-man', outfit: 'church-man', group: 'ba', sex: 'm', age: 'adult', sunday: true },
  { id: 'ba-church-lady', outfit: 'church-lady', group: 'ba', sex: 'f', age: 'adult', sunday: true },
  { id: 'ba-durag', outfit: 'durag-tee', group: 'ba', sex: 'm', age: 'adult' },
  { id: 'ba-jersey-teen', outfit: 'jersey-teen', group: 'ba', sex: 'm', age: 'teen', hair: 'afro' },
  { id: 'ba-work', outfit: 'work-plaid', group: 'ba', sex: 'm', age: 'adult' },
  { id: 'ba-elder', outfit: 'elder-cardigan', group: 'ba', sex: 'f', age: 'old', hair: 'bun', hairColor: '#c8c8cc', hat: 'none', face: { ...NOFACE, ...FEM_FACE, glasses: '#2a2a2a' }, bottom: { kind: 'skirt' } },
  // Caribbean
  { id: 'ca-headwrap', outfit: 'headwrap-auntie', group: 'ca', sex: 'f', age: 'adult' },
  { id: 'ca-nurse', outfit: 'scrubs-nurse', group: 'ca', sex: 'f', age: 'adult' },
  { id: 'ca-tracksuit', outfit: 'tracksuit-man', group: 'ca', sex: 'm', age: 'adult', hair: 'locs' },
  // Latino
  { id: 'la-hoodie-cap', outfit: 'hoodie-cap', group: 'la', sex: 'm', age: 'adult', hatColor: '#6a1c1c' },
  { id: 'la-delivery', outfit: 'delivery-vest', group: 'la', sex: 'm', age: 'adult' },
  { id: 'la-construction', outfit: 'work-plaid', group: 'la', sex: 'm', age: 'adult' },
  { id: 'la-denim', outfit: 'denim-girl', group: 'la', sex: 'f', age: 'adult', hair: 'curly' },
  { id: 'la-jersey-teen', outfit: 'jersey-teen', group: 'la', sex: 'm', age: 'teen', hair: 'short', top: { color: '#2a5aa0' }, bottom: { color: '#2a5aa0' } },
  // white
  { id: 'wh-beanie', outfit: 'puffer-beanie', group: 'wh', sex: 'm', age: 'adult', face: { ...NOFACE, beard: true } },
  { id: 'wh-tote', outfit: 'tote-gentrifier', group: 'wh', sex: 'f', age: 'adult' },
  { id: 'wh-cyclist', outfit: 'cyclist', group: 'wh', sex: 'm', age: 'adult' },
  { id: 'wh-elder', outfit: 'elder-cardigan', group: 'wh', sex: 'm', age: 'old', hairColor: '#d0d0d4' },
  { id: 'wh-office', outfit: 'office-blouse', group: 'wh', sex: 'f', age: 'adult', hair: 'curly', hairColor: '#c8a060' },
  // Hasidic Jewish (religious dress only on the people who wear it)
  { id: 'hj-man', outfit: 'hasidic-man', group: 'hj', sex: 'm', age: 'adult' },
  { id: 'hj-woman', outfit: 'hasidic-woman', group: 'hj', sex: 'f', age: 'adult' },
  // East Asian
  { id: 'ea-puffer', outfit: 'puffer-braids', group: 'ea', sex: 'f', age: 'adult', hair: 'long', face: { ...FEM_FACE }, top: { color: '#3a6a8a', trim: '#2a506a' } },
  { id: 'ea-office', outfit: 'office-jacket', group: 'ea', sex: 'm', age: 'adult' },
  { id: 'ea-kid', outfit: 'kid-backpack', group: 'ea', sex: 'm', age: 'kid', hair: 'short', top: { color: '#e0702a' } },
  // South Asian (ea-nurse sits above)
  { id: 'ea-nurse', outfit: 'scrubs-nurse', group: 'ea', sex: 'f', age: 'adult', top: { color: '#3a7ac0', trim: '#2a5a90' }, bottom: { color: '#3a7ac0', trim: '#2a5a90' } },
  { id: 'sa-rider', outfit: 'delivery-vest', group: 'sa', sex: 'm', age: 'adult', hat: 'helmet', hatColor: '#d8d8dc', hatTrim: '#e9d628' },
  { id: 'sa-hijabi', outfit: 'hijabi', group: 'sa', sex: 'f', age: 'adult', hatColor: '#9a5a6a', hatTrim: '#9a5a6a' },
  // Middle Eastern
  { id: 'me-hijabi', outfit: 'hijabi', group: 'me', sex: 'f', age: 'adult' },
  { id: 'me-tracksuit', outfit: 'tracksuit-man', group: 'me', sex: 'm', age: 'adult', hair: 'bald', face: { beard: true }, top: { color: '#2a4a8a' }, bottom: { color: '#2a4a8a' }, shoes: { sole: '#2a4a8a', accent: '#2a4a8a' } },
  // mixed
  { id: 'mx-androgynous', outfit: 'loose-hoodie', group: 'mx', sex: 'x', age: 'adult' },
  { id: 'mx-jersey-teen', outfit: 'jersey-teen', group: 'mx', sex: 'f', age: 'teen', hair: 'curly', top: { color: '#7a3a9a' }, bottom: { color: '#7a3a9a' }, face: { ...FEM_FACE } },
  { id: 'mx-office', outfit: 'office-jacket', group: 'mx', sex: 'f', age: 'adult', hair: 'long', face: { ...FEM_FACE }, bottom: { kind: 'skirt' } },
  // stage 14: layered outfits, uniforms, dresses, shorts, bags and masks; the outfit follows the person, not the background
  { id: 'ba-transit', outfit: 'transit-worker', group: 'ba', sex: 'm', age: 'adult' },
  { id: 'ca-transit', outfit: 'transit-worker', group: 'ca', sex: 'f', age: 'adult', hair: 'bun', face: { ...FEM_FACE } },
  { id: 'la-site', outfit: 'site-crew', group: 'la', sex: 'm', age: 'adult' },
  { id: 'ea-site', outfit: 'site-crew', group: 'ea', sex: 'f', age: 'adult', face: { ...NOFACE, ...FEM_FACE }, hair: 'bun', hat: 'none' },
  { id: 'ba-denim-open', outfit: 'denim-over-hoodie', group: 'ba', sex: 'm', age: 'adult' },
  { id: 'wh-denim-open', outfit: 'denim-over-hoodie', group: 'wh', sex: 'f', age: 'adult', hair: 'long', face: { ...FEM_FACE } },
  { id: 'sa-bomber', outfit: 'bomber-tee', group: 'sa', sex: 'm', age: 'adult' },
  { id: 'la-bomber', outfit: 'bomber-tee', group: 'la', sex: 'f', age: 'teen', hair: 'long', face: { ...FEM_FACE } },
  { id: 'wh-coat', outfit: 'camel-coat', group: 'wh', sex: 'm', age: 'adult' },
  { id: 'ba-coat', outfit: 'camel-coat', group: 'ba', sex: 'f', age: 'adult', hair: 'short', face: { ...FEM_FACE }, build: 'avg' },
  { id: 'ba-sundress', outfit: 'sundress', group: 'ba', sex: 'f', age: 'adult', hair: 'puff' },
  { id: 'la-sundress', outfit: 'sundress', group: 'la', sex: 'f', age: 'adult', top: { color: '#3a7a9a' }, bottom: { color: '#3a7a9a' } },
  { id: 'ea-sundress', outfit: 'sundress', group: 'ea', sex: 'f', age: 'teen', top: { color: '#d8b84a' }, bottom: { color: '#d8b84a' } },
  { id: 'ca-shorts', outfit: 'shorts-tee', group: 'ca', sex: 'm', age: 'adult' },
  { id: 'wh-shorts', outfit: 'shorts-tee', group: 'wh', sex: 'm', age: 'adult', top: { color: '#7a9ab8' } },
  { id: 'me-shorts', outfit: 'shorts-tee', group: 'me', sex: 'f', age: 'teen', hair: 'long', face: { ...FEM_FACE }, hat: 'none' },
  { id: 'ea-breton', outfit: 'breton-tee', group: 'ea', sex: 'f', age: 'adult', hairColor: '#17110d' },
  { id: 'mx-breton', outfit: 'breton-tee', group: 'mx', sex: 'm', age: 'adult', hair: 'curly', face: { ...NOFACE, glasses: '#2a2a2a' } },
  { id: 'wh-flannel', outfit: 'flannel-open', group: 'wh', sex: 'm', age: 'adult' },
  { id: 'ba-flannel', outfit: 'flannel-open', group: 'ba', sex: 'f', age: 'adult', hair: 'braids', hat: 'none', face: { ...FEM_FACE } },
  { id: 'sa-masked', outfit: 'loose-hoodie', group: 'sa', sex: 'f', age: 'adult', hair: 'long', face: { ...FEM_FACE, mask: true } },
  { id: 'ea-masked', outfit: 'office-blouse', group: 'ea', sex: 'f', age: 'adult', face: { ...FEM_FACE, mask: true }, hair: 'long' },
  { id: 'hj-boy', outfit: 'kid-backpack', group: 'hj', sex: 'm', age: 'kid', hair: 'peyot', hat: 'none', top: { color: '#e8e8ec', print: 'none' }, bottom: { kind: 'trousers', color: '#1c1c22' }, shoes: { color: '#161616', sole: '#0a0a0a' } },
];

// ---------------------------------------------------------------- the player's looks

export interface PlayerLook { group: PopGroup; variant: number }
const PLAYER_VARIANTS = 3;
const PLAYER_HAIR: Record<PopGroup, Array<PedSpec['hair']>> = {
  ba: ['fade', 'locs', 'afro'], ca: ['short', 'locs', 'fade'], la: ['short', 'fade', 'short'], wh: ['short', 'long', 'fade'], ea: ['short', 'fade', 'long'],
  sa: ['short', 'fade', 'short'], me: ['short', 'fade', 'short'], mx: ['afro', 'short', 'puff'], hj: ['short', 'short', 'short'],
};
const playerId = (l: PlayerLook): string => `player-${l.group}-${l.variant}`;
/** a fresh random look per page load / new game (fixed under test); UI10's save / load restores it with setPlayerLook */
let look: PlayerLook = { group: 'ba', variant: 0 };
let lookInit = false;
function initLook(): void { if (lookInit) return; lookInit = true; if (import.meta.env?.MODE !== 'test') look = randomPlayerLook(`${Math.random()}:${Date.now()}`); }

export function getPlayerLook(): PlayerLook { initLook(); return { ...look }; }
/** Set the player's look (before the player model is built). Unknown groups / variants fall back to the nearest valid one. */
export function setPlayerLook(l: PlayerLook): void {
  lookInit = true;
  look = { group: GROUPS.includes(l.group) && l.group !== 'hj' ? l.group : 'ba', variant: Math.max(0, Math.min(PLAYER_VARIANTS - 1, Math.floor(l.variant) || 0)) };
}
/** A look from a seed string: any group except the religious-dress one, any of the three hair / skin variants. */
export function randomPlayerLook(seed: string): PlayerLook {
  const gs = GROUPS.filter((g) => g !== 'hj');
  const h = hash(seed);
  return { group: gs[h % gs.length], variant: (h >>> 8) % PLAYER_VARIANTS };
}
export function playerSpecId(): string { initLook(); return playerId(look); }

// ---------------------------------------------------------------- the roster

function person(base: PedSpec, p: Person, extra?: Omit<PedSpec, 'id' | 'skin'>): PedSpec {
  const o = extra ?? base;
  const pal = PALETTE[p.group];
  const female = p.sex === 'f';
  const hair = p.hair ?? o.hair;
  const natural = p.group === 'ba' || p.group === 'ca';
  const hairColor = p.hairColor ?? (o.hair === 'bald' ? o.hairColor : pick(pal.hair, p.id, 'h'));
  const face = { ...o.face, ...(female ? { lashes: true } : {}), ...p.face };
  if (p.group === 'hj' || p.sex === 'f') { /* beard only where the outfit sets it */ }
  const keepHair = natural || !['afro', 'braids', 'locs', 'puff'].includes(hair);
  return {
    ...o,
    id: p.id, role: 'civilian', group: p.group, sex: p.sex, age: p.age,
    skin: p.skin ?? varied(pick(pal.skin, p.id, 's'), p.id),
    hair: keepHair ? hair : 'short', hairColor,
    hat: p.hat ?? o.hat, hatColor: p.hatColor ?? o.hatColor, hatTrim: p.hatTrim ?? o.hatTrim, hatLogo: p.hatLogo ?? o.hatLogo,
    face, top: { ...o.top, ...p.top }, bottom: { ...o.bottom, ...p.bottom }, shoes: { ...o.shoes, ...p.shoes },
    gear: p.gear ?? o.gear, gearColor: p.gearColor ?? o.gearColor,
    build: p.build ?? (p.age === 'kid' ? 'kid' : o.build), sunday: p.sunday ?? false,
    weight: 1,
  };
}

/** Civilians (people wearing outfits), then the named people (cop, shopkeeper, DJ) and the player looks. */
export function buildRoster(baseSpecs: readonly PedSpec[]): PedSpec[] {
  const byId = new Map(baseSpecs.map((s) => [s.id, s]));
  const civ = PEOPLE.map((p) => {
    const b = byId.get(p.outfit);
    if (b) return person(b, p);
    const n = NEW_OUTFITS[p.outfit];
    if (!n) throw new Error(`pedRoster: unknown outfit ${p.outfit}`);
    return person({ id: p.id, skin: '#000000', ...n } as PedSpec, p, n);
  });
  // equal weight inside a group, the group's share of the street overall
  for (const g of GROUPS) {
    const mine = civ.filter((s) => s.group === g);
    for (const s of mine) s.weight = GROUP_SHARE[g] / mine.length;
  }
  const named = baseSpecs.filter((s) => s.role !== 'civilian' && s.role !== 'player').map((s) => {
    const g: PopGroup = s.id === 'cop' ? 'la' : 'ba';
    const sex = s.id === 'odette' ? 'f' : 'm', age = s.id === 'odette' ? 'old' : 'adult';
    return { ...s, group: g, sex, age } as PedSpec;
  });
  const out = baseSpecs.find((s) => s.role === 'player')!;
  const players: PedSpec[] = [];
  for (const g of GROUPS) {
    if (g === 'hj') continue;
    for (let v = 0; v < PLAYER_VARIANTS; v++) {
      const l: PlayerLook = { group: g, variant: v };
      const pal = PALETTE[g];
      players.push({
        ...out, id: playerId(l), group: g, sex: 'm', age: 'adult',
        skin: pal.skin[(hash(g + v) + v) % pal.skin.length], hair: PLAYER_HAIR[g][v], hairColor: pal.hair[v % pal.hair.length],
        face: { ...out.face, stubble: v === 1 }, weight: 0,
      });
    }
  }
  return [...civ, ...named, ...players];
}
