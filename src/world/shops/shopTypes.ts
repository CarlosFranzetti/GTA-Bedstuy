/**
 * Shop types (STORES2): what each kind of small shop IS. The storefront FRAME (glazing, awning shape, gates) belongs to
 * `buildings/mixeduse.ts`; this table says what hangs on it: which store kind carries it (hours, tile, frame), the
 * art archetype its sign text must classify to (`classifyArchetype`), awning and sign colours, which window decals it
 * wears, and what stands on the sidewalk in front.
 *
 * Colours are sun-faded accents (DIRECTION.md: a muted world, earned accents): saturated enough to read from across a
 * street, never fresh vinyl. No real brand colourway is copied: each type uses the plain trade colours New York shops
 * of that kind share (a pizzeria's red and green, a pharmacy's green cross, a bodega's yellow and red).
 */
import type { Archetype, Cuisine, StickerKind, StoreKind } from '@/textures/painters/storefront-art';

export type ShopType =
  | 'pizzeria' | 'bodega' | 'grocery' | 'deli' | 'chinese' | 'caribbean' | 'chicken' | 'halal' | 'bakery' | 'coffee'
  | 'liquor' | 'dollar' | 'pharmacy' | 'laundromat' | 'barber' | 'braiding' | 'beauty' | 'nails' | 'phoneRepair'
  | 'cashing' | 'hardware' | 'autoRepair' | 'funeral' | 'church' | 'daycare' | 'bar' | 'smoke';

/** Sidewalk and window dressing kinds `shopDressing.ts` knows how to build as cheap merged boxes. */
export type DressingKind =
  | 'crates' | 'fruitStand' | 'iceBox' | 'newsRack' | 'sandwichBoard' | 'flowerBuckets' | 'barberPole' | 'plasticChairs'
  | 'washerRow' | 'hotCase' | 'bagStack';

export interface ShopTypeInfo {
  type: ShopType;
  label: string;
  /** which frame / hours / tile set carries it */
  kind: StoreKind;
  cuisine: Cuisine | null;
  /** relative frequency among the generated shops of its store kind */
  weight: number;
  /** the art archetype the sign text must classify to */
  archetype: Archetype;
  /** sun-faded awning colours, picked by name hash */
  awning: readonly string[];
  /** lit sign box background and letters */
  sign: readonly [string, string];
  /** window decals, biggest first (mixeduse plans them onto the glazing) */
  stickers: readonly StickerKind[];
  /** fascia: the box is a hand-painted board (a flat painted sign, no lamp) */
  fascia: boolean;
  /** things on the pavement */
  dressing: readonly DressingKind[];
}

const T = (i: ShopTypeInfo): ShopTypeInfo => i;

export const SHOP_TYPES: Record<ShopType, ShopTypeInfo> = {
  pizzeria: T({ type: 'pizzeria', label: 'pizzeria', kind: 'restaurant', cuisine: null, weight: 30, archetype: 'pizza',
    awning: ['#b3262d', '#2f6f3e', '#a8281f'], sign: ['#241410', '#f6e9c4'], stickers: ['hotslices', 'open', 'menu'], fascia: false, dressing: ['sandwichBoard', 'hotCase'] }),
  bodega: T({ type: 'bodega', label: 'bodega', kind: 'bodega', cuisine: null, weight: 60, archetype: 'bodega',
    awning: ['#c8242a', '#e2b52f', '#2a6aa0', '#2f7a43'], sign: ['#161616', '#f5f0e0'], stickers: ['open', 'atm', 'ebt', 'lotto', 'camera'], fascia: false, dressing: ['crates', 'iceBox', 'newsRack'] }),
  grocery: T({ type: 'grocery', label: 'corner grocery with fruit stand', kind: 'bodega', cuisine: null, weight: 40, archetype: 'bodega',
    awning: ['#2f7a43', '#d9a921', '#b3262d'], sign: ['#12261a', '#f4efd8'], stickers: ['fresh', 'open', 'ebt', 'lotto'], fascia: false, dressing: ['fruitStand', 'crates', 'flowerBuckets'] }),
  deli: T({ type: 'deli', label: 'deli', kind: 'deli', cuisine: null, weight: 50, archetype: 'bodega',
    awning: ['#b3262d', '#2f7a43', '#d9a921'], sign: ['#161616', '#f5f0e0'], stickers: ['open', 'ebt', 'camera'], fascia: false, dressing: ['sandwichBoard', 'newsRack'] }),
  chinese: T({ type: 'chinese', label: 'Chinese takeout', kind: 'restaurant', cuisine: 'chinese', weight: 22, archetype: 'kitchen',
    awning: ['#b3262d', '#d9a921', '#8c1d22'], sign: ['#2a1210', '#ffe9a8'], stickers: ['menu', 'open', 'camera'], fascia: false, dressing: ['sandwichBoard'] }),
  caribbean: T({ type: 'caribbean', label: 'Caribbean and jerk', kind: 'restaurant', cuisine: 'caribbean', weight: 18, archetype: 'kitchen',
    awning: ['#e2b52f', '#2f7a43', '#c8242a'], sign: ['#12261a', '#ffe08a'], stickers: ['menu', 'open'], fascia: true, dressing: ['sandwichBoard', 'plasticChairs'] }),
  chicken: T({ type: 'chicken', label: 'fried chicken', kind: 'restaurant', cuisine: 'soul', weight: 16, archetype: 'kitchen',
    awning: ['#c8242a', '#e07b00', '#e2b52f'], sign: ['#2a0f0c', '#ffe6b0'], stickers: ['menu', 'open', 'camera'], fascia: false, dressing: ['sandwichBoard'] }),
  halal: T({ type: 'halal', label: 'halal grill', kind: 'restaurant', cuisine: null, weight: 14, archetype: 'kitchen',
    awning: ['#2f7a43', '#d9a921', '#2a6aa0'], sign: ['#10221a', '#f3ecd0'], stickers: ['halal', 'menu', 'open'], fascia: false, dressing: ['sandwichBoard', 'plasticChairs'] }),
  bakery: T({ type: 'bakery', label: 'bakery', kind: 'deli', cuisine: null, weight: 22, archetype: 'bakery',
    awning: ['#c59a3a', '#8c4a2f', '#d98c9a'], sign: ['#2b1a12', '#fbeccb'], stickers: ['bake', 'open'], fascia: true, dressing: ['sandwichBoard'] }),
  coffee: T({ type: 'coffee', label: 'coffee shop', kind: 'deli', cuisine: null, weight: 18, archetype: 'coffee',
    awning: ['#33473a', '#5a3a28', '#2a3a55'], sign: ['#1c1511', '#efe0c0'], stickers: ['coffee', 'open'], fascia: false, dressing: ['sandwichBoard', 'plasticChairs'] }),
  liquor: T({ type: 'liquor', label: 'liquor store', kind: 'liquor', cuisine: null, weight: 75, archetype: 'liquor',
    awning: ['#1a1a1c', '#4a1d2e', '#1b2a4a'], sign: ['#141214', '#e8d49a'], stickers: ['open', 'lotto', 'atm', 'noloiter'], fascia: false, dressing: ['crates'] }),
  dollar: T({ type: 'dollar', label: 'dollar store', kind: 'generic', cuisine: null, weight: 14, archetype: 'dollar',
    awning: ['#d9a921', '#b3262d', '#e2c22f'], sign: ['#7a1015', '#fff2c2'], stickers: ['open', 'camera'], fascia: false, dressing: ['bagStack', 'sandwichBoard'] }),
  pharmacy: T({ type: 'pharmacy', label: 'pharmacy', kind: 'pharmacy', cuisine: null, weight: 1, archetype: 'pharmacy',
    awning: ['#1f8a63', '#2a6aa0'], sign: ['#0b3d2e', '#e9fff4'], stickers: ['cross', 'open', 'camera'], fascia: false, dressing: ['sandwichBoard'] }),
  laundromat: T({ type: 'laundromat', label: 'laundromat', kind: 'laundromat', cuisine: null, weight: 1, archetype: 'laundromat',
    awning: ['#2a6aa0', '#2a9d8f', '#4a7ab0'], sign: ['#0d3b66', '#ffffff'], stickers: ['open', 'noloiter'], fascia: false, dressing: ['washerRow', 'plasticChairs'] }),
  barber: T({ type: 'barber', label: 'barbershop', kind: 'barber', cuisine: null, weight: 1, archetype: 'barber',
    awning: ['#151515', '#a8222a', '#24408a'], sign: ['#111111', '#f5f0e0'], stickers: ['pole', 'open'], fascia: false, dressing: ['barberPole'] }),
  braiding: T({ type: 'braiding', label: 'hair braiding', kind: 'generic', cuisine: null, weight: 14, archetype: 'salon',
    awning: ['#d9a921', '#a8222a', '#2f8a5e'], sign: ['#2a1630', '#ffe9c8'], stickers: ['open', 'camera'], fascia: true, dressing: ['plasticChairs'] }),
  beauty: T({ type: 'beauty', label: 'beauty supply', kind: 'generic', cuisine: null, weight: 12, archetype: 'salon',
    awning: ['#a63a7a', '#2a3a55', '#d9a921'], sign: ['#2a1228', '#ffeef8'], stickers: ['open', 'camera'], fascia: false, dressing: ['bagStack'] }),
  nails: T({ type: 'nails', label: 'nail salon', kind: 'generic', cuisine: null, weight: 14, archetype: 'salon',
    awning: ['#d98c9a', '#7a5ab0', '#2a9d8f'], sign: ['#2a1a28', '#ffeef4'], stickers: ['open'], fascia: false, dressing: ['flowerBuckets'] }),
  phoneRepair: T({ type: 'phoneRepair', label: 'phone repair', kind: 'cellphone', cuisine: null, weight: 1, archetype: 'cellphone',
    awning: ['#2b3a55', '#6a3cc0', '#0d8fa5'], sign: ['#14192a', '#e8f6ff'], stickers: ['phonefix', 'open', 'camera'], fascia: false, dressing: ['sandwichBoard'] }),
  cashing: T({ type: 'cashing', label: 'check cashing', kind: 'generic', cuisine: null, weight: 8, archetype: 'cash',
    awning: ['#d9c12f', '#1f6f4a', '#2a3a55'], sign: ['#12301f', '#ffe97a'], stickers: ['cash', 'atm', 'camera'], fascia: false, dressing: [] }),
  hardware: T({ type: 'hardware', label: 'hardware', kind: 'generic', cuisine: null, weight: 8, archetype: 'hardware',
    awning: ['#c8242a', '#2a3a55', '#e2b52f'], sign: ['#1d2328', '#f0e6c4'], stickers: ['open', 'camera'], fascia: true, dressing: ['crates', 'bagStack'] }),
  autoRepair: T({ type: 'autoRepair', label: 'auto repair', kind: 'generic', cuisine: null, weight: 8, archetype: 'auto',
    awning: ['#e2b52f', '#1a1a1c', '#a8222a'], sign: ['#141414', '#f2d36a'], stickers: ['open'], fascia: true, dressing: ['crates'] }),
  funeral: T({ type: 'funeral', label: 'funeral home', kind: 'generic', cuisine: null, weight: 2, archetype: 'funeral',
    awning: ['#2b2b30', '#3a2438'], sign: ['#1a1a1e', '#d8d2c0'], stickers: [], fascia: true, dressing: ['flowerBuckets'] }),
  church: T({ type: 'church', label: 'storefront church', kind: 'church', cuisine: null, weight: 1, archetype: 'church',
    awning: ['#5a2d82', '#2d1747'], sign: ['#2d1747', '#f2e6c9'], stickers: [], fascia: true, dressing: [] }),
  daycare: T({ type: 'daycare', label: 'daycare', kind: 'daycare', cuisine: null, weight: 1, archetype: 'daycare',
    awning: ['#e0809f', '#e8c42a', '#4fa65a', '#4a9ae0'], sign: ['#1b4f8f', '#fff6d6'], stickers: [], fascia: true, dressing: [] }),
  bar: T({ type: 'bar', label: 'bar', kind: 'liquor', cuisine: null, weight: 25, archetype: 'liquor',
    awning: ['#1a1a1c', '#3a1a24', '#1b2a3a'], sign: ['#100e12', '#ffd890'], stickers: ['open', 'noloiter'], fascia: false, dressing: ['plasticChairs'] }),
  smoke: T({ type: 'smoke', label: 'smoke shop', kind: 'generic', cuisine: null, weight: 12, archetype: 'smoke',
    awning: ['#2f6f4f', '#4a2a6a', '#1a1a1c'], sign: ['#101a14', '#c8f2a0'], stickers: ['open', 'camera'], fascia: false, dressing: [] }),
};

export const SHOP_TYPE_LIST: readonly ShopType[] = Object.keys(SHOP_TYPES) as ShopType[];

/** Generated-shop types for a store kind, with weights (kinds the lot generator picks stay the frame; the type is the trade). */
export function typesOfKind(kind: StoreKind): ShopTypeInfo[] {
  return SHOP_TYPE_LIST.map((t) => SHOP_TYPES[t]).filter((i) => i.kind === kind);
}

/** Map a hand-authored archetype string (bedstuy.json POIs, lot specs) to a shop type, or null. */
export function typeOfArchetype(a: string | undefined): ShopType | null {
  if (!a) return null;
  const k = a.toLowerCase().replace(/[^a-z]/g, '');
  const m: Record<string, ShopType> = {
    pizza: 'pizzeria', bodega: 'bodega', corner: 'grocery', grocery: 'grocery', deli: 'deli', chinese: 'chinese', takeout: 'chinese',
    caribbean: 'caribbean', soul: 'chicken', soulfood: 'chicken', liquor: 'liquor', dollar: 'dollar', pharmacy: 'pharmacy',
    laundromat: 'laundromat', laundry: 'laundromat', barber: 'barber', barbershop: 'barber', braiding: 'braiding',
    cellphone: 'phoneRepair', phone: 'phoneRepair', wireless: 'phoneRepair', autorepair: 'autoRepair', funeral: 'funeral',
    church: 'church', daycare: 'daycare', bar: 'bar', bakery: 'bakery', coffee: 'coffee', halal: 'halal',
  };
  return m[k] ?? null;
}
