/**
 * Mixed-use: a shop-front ground floor under recessed brick flats.
 *
 * Ground floor (this file, "S4"): piers, bulkhead, glazing either side of a set-back door (or one continuous run
 * with a diagonal corner door on corner lots), roll-gate housing and an optional lowered gate, a sloped awning with a
 * scalloped valance and a lit sign box above it, window stickers (ATM, EBT, lotto, OPEN neon). Everything below
 * y = GROUND_FLOOR_H. Corner lots wrap the corner: the shop front turns onto the cross street (glazing, awning and
 * sign on both faces) around a chamfered entrance.
 *
 * Above y = GROUND_FLOOR_H (upperFloors): recessed brick flats (stone sills, AC units, awnings), bracketed cornice,
 * roof clutter, rear fire escapes. B3 owns the upper-floor look; the hand-off is the single `upperFloors` call.
 *
 * Textures. Awnings and sign boxes are painted onto shared atlas sheets (one material per sheet, so every
 * storefront in the city costs a handful of draw calls instead of two per shop), each tile sized from the real
 * geometry it covers at one density across and down (storefront-art.ts: PX_PER_M), so type and icons are true to
 * shape. Without a canvas (unit tests, no DOM) the old fixed MaterialLibrary awning/sign is used instead.
 *
 * Night. Sign boxes and stickers are emissive after dark; roll gates drop on a deterministic subset of shops after
 * 22:00. Both follow `setStorefrontHour(hour)` (wire it next to the day/night update); light on/off also follows
 * MaterialLibrary.setNight on its own.
 */
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { createCanvas } from '@/textures/canvas';
import type { Painter } from '@/textures/canvas';
import { awningSlopePainter, awningValancePainter, signPainter, stickerAtlasPainter } from '@/textures/painters/signage';
import {
  STICKER_ATLAS, STICKER_SLOTS, cuisineOf, layoutAwning, ppmFor, storefrontName, storefrontSignCopy,
  type AwningStyle, type Cuisine, type StickerKind, type StoreKind,
} from '@/textures/painters/storefront-art';
import type { Archetype as PoiArchetype, IMaterialLibrary, Lot } from '@/world/types';
import { bayCentres, buildUpperFloors, familyMats, sideWallFrame, wallWithHoles, windows } from './facade';
import type { Hole, LotBatch, LotCtx, LotOutput, RectOpt, V3 } from './facade';

export type { Cuisine, StoreKind };

// ---------------------------------------------------------------------------------------------- dimensions (m)

/** Ground floor slab-to-slab height: everything below is the shop front, everything above belongs to the flats. */
export const GROUND_FLOOR_H = 4.0;
const GROUND_H = GROUND_FLOOR_H;
/** Top of the shop opening (glass, gate housing underside). */
export const SHOP_H = 3.0;
const PIER = 0.45;
/** Awning: height of its wall edge, projection, drop of the fold, valance height, mesh scallop depth, underside rise. */
export const AWN_Y = SHOP_H + 0.7;
export const AWN_OUT = 1.5;
const AWN_DROP = 0.4;
export const AWN_VAL = 0.34;
const AWN_SCALLOP = 0.13;
const AWN_UNDER = 0.5;
/** Extra rows below the valance text that the mesh scallops sample (colour and grime only). */
const AWN_FRINGE = 0.035;
/** Length of the awning's sloped top face. */
export const AWN_SLOPE = Math.hypot(AWN_OUT, AWN_DROP);
/** Sign box: bottom, face height, projection (lightbox) and frame width. */
const SIGN_Y0 = AWN_Y + 0.15;
export const SIGN_H = 0.7;
const SIGN_D = 0.3;
const BOARD_D = 0.1;
const SIGN_F = 0.07;
/** Corner chamfer (each leg). */
export const CORNER_CUT = 1.5;
const BACK_BY = 0.6;
/** Awning density on the atlas: valance (text) and slope (decoration, rarely seen close up). */
const AWN_VAL_PPM = 100;
const AWN_SLOPE_PPM = 28;
/** Width of the shared plain awning piece that fills either side of the lettering. */
const PLAIN_W = 1.5;
const SIGN_PPM = 80;
/** Lightbox face widths (m): boxes snap to a class so the same copy is one shared tile. */
const SIGN_CLASSES = [2.4, 3.4, 4.6, 6.0, 7.6, 9.4, 11.4] as const;
const LIGHTBOX_NIGHT = 0.55; // L9 limit: lightbox emissiveIntensity x texel <= 0.55 (night bloom threshold 0.9)
const STICKER_NIGHT = 0.55;

// ---------------------------------------------------------------------------------------------- storefront spec

export interface StorefrontSpec {
  kind: StoreKind;
  cuisine: Cuisine | null;
  /** parody sign copy ('MAIN LINE  ·  second line'); never a real business. Printed on the awning. */
  name: string;
  /** what the lit box says: the trade ("DELI & GROCERY ..."), or `name` itself for hand-authored shops */
  signCopy: string;
  awningColor: string;
  /** hour the gate comes down: 22, 22.5, 23, 24 or 25 (= 1 am); null = open all night */
  closesAt: number | null;
  /** gate down all day (closed down shop): no lit sign */
  shuttered: boolean;
  /** floors above the ground floor, when the data says */
  floorsAbove: number | null;
}

/**
 * What the lot generator hands over per mixed-use lot (schema v2 `storefront`, carried as `lot.spec.storefront`). Read
 * defensively: a bare archetype string, or an object with any of these fields.
 */
export interface StorefrontInput {
  archetype?: string;
  kind?: string;
  cuisine?: Cuisine;
  name?: string;
  sign?: string;
  awningColor?: string;
  closesAt?: number | null;
  open24?: boolean;
  shuttered?: boolean;
}

const KIND_ALIASES: Record<string, { kind: StoreKind; cuisine?: Cuisine }> = {
  bodega: { kind: 'bodega' }, corner: { kind: 'bodega' }, grocery: { kind: 'bodega' }, deli: { kind: 'deli' },
  laundromat: { kind: 'laundromat' }, laundry: { kind: 'laundromat' },
  barber: { kind: 'barber' }, barbershop: { kind: 'barber' },
  liquor: { kind: 'liquor' }, pharmacy: { kind: 'pharmacy' }, daycare: { kind: 'daycare' },
  restaurant: { kind: 'restaurant' }, caribbean: { kind: 'restaurant', cuisine: 'caribbean' },
  soul: { kind: 'restaurant', cuisine: 'soul' }, soulfood: { kind: 'restaurant', cuisine: 'soul' },
  chinese: { kind: 'restaurant', cuisine: 'chinese' }, takeout: { kind: 'restaurant', cuisine: 'chinese' }, pizza: { kind: 'restaurant' },
  cellphone: { kind: 'cellphone' }, phone: { kind: 'cellphone' }, wireless: { kind: 'cellphone' },
  church: { kind: 'church' }, storefrontchurch: { kind: 'church' },
  generic: { kind: 'generic' }, braiding: { kind: 'generic' }, dollar: { kind: 'generic' }, funeral: { kind: 'generic' },
  autorepair: { kind: 'generic' }, condo: { kind: 'generic' },
};

function aliasOf(s: string | undefined): { kind: StoreKind; cuisine?: Cuisine } | null {
  if (!s) return null;
  return KIND_ALIASES[s.toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

/** The per-lot spec as far as the shop front cares (B3's LotSpec: `storefront` is D1's StorefrontKind, `floors` counts storeys). */
interface SpecLike { storefront?: string | StorefrontInput; floors?: number; family?: string }
type LotWithSpec = Lot & { spec?: SpecLike };

function readInput(lot: Lot, spec?: SpecLike | null): StorefrontInput | null {
  const sf = (spec ?? (lot as LotWithSpec).spec)?.storefront;
  if (!sf) return null;
  return typeof sf === 'string' ? { archetype: sf } : sf;
}

const CORNER_WEIGHTS: readonly (readonly [StoreKind, number])[] = [
  ['bodega', 46], ['deli', 8], ['liquor', 9], ['laundromat', 7], ['pharmacy', 6], ['cellphone', 6], ['restaurant', 12], ['generic', 6],
];
const MID_WEIGHTS: readonly (readonly [StoreKind, number])[] = [
  ['bodega', 10], ['deli', 10], ['laundromat', 9], ['barber', 14], ['liquor', 4], ['pharmacy', 3], ['daycare', 6],
  ['restaurant', 16], ['cellphone', 10], ['church', 6], ['generic', 12],
];

function weighted(table: readonly (readonly [StoreKind, number])[], r: number): StoreKind {
  let total = 0;
  for (const [, w] of table) total += w;
  let x = r * total;
  for (const [k, w] of table) {
    x -= w;
    if (x < 0) return k;
  }
  return table[table.length - 1][0];
}

const AWNING_COLORS: Record<StoreKind, readonly string[]> = {
  bodega: ['#d62828', '#f1c232', '#1d6fa5', '#1f7a3a'],
  deli: ['#d62828', '#1f7a3a', '#f1c232'],
  laundromat: ['#1d6fa5', '#2a9d8f', '#3a6ea5'],
  barber: ['#111111', '#c4161c', '#1d3f8f'],
  liquor: ['#111111', '#4a1d2e', '#1b2a4a'],
  pharmacy: ['#0a7f5a', '#1b6aa5'],
  daycare: ['#ff7eb3', '#ffd400', '#4caf50', '#42a5f5'],
  restaurant: ['#c8102e', '#f7d708', '#1f7a3a', '#e07b00'],
  cellphone: ['#2b3a55', '#7a3cff', '#0d8fa5'],
  church: ['#5a2d82', '#2d1747'],
  generic: ['#27303a', '#8a3b2e', '#2f6f4f', '#444444'],
};

const SIGN_COLORS: Record<StoreKind, readonly [string, string]> = {
  bodega: ['#161616', '#f5f0e0'], deli: ['#161616', '#f5f0e0'], laundromat: ['#0d3b66', '#ffffff'], barber: ['#111111', '#f5f0e0'],
  liquor: ['#161616', '#f5f0e0'], pharmacy: ['#0b3d2e', '#e9fff4'], daycare: ['#1b4f8f', '#fff6d6'], restaurant: ['#2a1210', '#fff1c8'],
  cellphone: ['#14192a', '#e8f6ff'], church: ['#2d1747', '#f2e6c9'], generic: ['#1d2328', '#f0ece0'],
};

/** Gate-down hours, by kind. null in the list = 24 h shop. */
const CLOSING: Record<StoreKind, readonly (number | null)[]> = {
  bodega: [null, null, 25, 24, null, 25], deli: [22.5, 23, 24], laundromat: [22, 22.5, 23], barber: [22, 22, 22.5],
  liquor: [23, 24, 23], pharmacy: [22, 22.5], daycare: [], restaurant: [22.5, 23, 24, 25], cellphone: [22, 22.5, 23],
  church: [], generic: [22, 22.5],
};

/** Parody storefront for a lot: from the lot generator's spec, else the lot's POI, else a deterministic pick. */
export function resolveStorefront(lot: Lot, lotSpec?: SpecLike | null, cornerLot = lot.corner): StorefrontSpec {
  const r = new Rng(Rng.hash(`${lot.id}:storefront`));
  const input = readInput(lot, lotSpec);
  const poi = lot.poi;
  let kind: StoreKind | null = null;
  let cuisine: Cuisine | null = input?.cuisine ?? null;
  const fromInput = aliasOf(input?.archetype ?? input?.kind);
  if (fromInput) {
    kind = fromInput.kind;
    cuisine = cuisine ?? fromInput.cuisine ?? null;
  } else if (poi) {
    const a = aliasOf(poi.archetype as PoiArchetype);
    if (a) {
      kind = a.kind;
      cuisine = cuisine ?? a.cuisine ?? null;
    }
  }
  const roll = r.next();
  if (!kind) kind = weighted(cornerLot ? CORNER_WEIGHTS : MID_WEIGHTS, roll);
  if (kind === 'restaurant' && !cuisine) {
    const c = r.next();
    cuisine = c < 0.4 ? 'caribbean' : c < 0.7 ? 'soul' : 'chinese';
  }
  const h = Rng.hash(lot.id);
  const text = input?.name ?? input?.sign ?? poi?.sign ?? storefrontName(kind, h >>> 3, cuisine);
  if (kind === 'restaurant' && !cuisine) cuisine = cuisineOf(text);
  const authored = !!(input?.name ?? input?.sign ?? poi?.sign);
  const signCopy = authored || kind === 'church' || kind === 'daycare' ? text : storefrontSignCopy(kind, h >>> 11, cuisine);
  const colors = AWNING_COLORS[kind];
  // un-authored shops colour their awning from the name, so one name is one shared texture tile
  const awningColor = input?.awningColor ?? poi?.awningColor ?? colors[Rng.hash(text) % colors.length];
  const opts = CLOSING[kind];
  let closesAt: number | null = opts.length ? opts[r.int(0, opts.length - 1)] : null;
  if (input && 'closesAt' in input) closesAt = input.closesAt ?? null;
  if (input?.open24) closesAt = null;
  // a few mid-block shops are closed down for good
  const shuttered = input?.shuttered ?? (!cornerLot && !poi && kind !== 'church' && r.chance(0.07));
  const fl = (lotSpec ?? (lot as LotWithSpec).spec)?.floors;
  return { kind, cuisine, name: text, signCopy, awningColor, closesAt, shuttered, floorsAbove: typeof fl === 'number' && fl >= 2 ? Math.min(5, Math.round(fl) - 1) : null };
}

// ---------------------------------------------------------------------------------------------- plan (pure layout)

/** [a, b] distances along a face, measured from the corner end (corner lots) or the left end (mid-block). */
export interface Run { a: number; b: number }
export type CornerSide = 'left' | 'right' | null;
export type Tile = 'cream' | 'green' | 'black' | 'navy';

export interface PlannedSticker { kind: StickerKind; face: 'front' | 'side'; at: number; y: number }

export interface StorefrontPlan {
  spec: StorefrontSpec;
  W: number;
  D: number;
  cs: CornerSide;
  corner: boolean;
  /** logical X runs from the corner end; the world x is W - X when true */
  mirror: boolean;
  cut: number;
  /** mid-block set-back door alcove (front), null on corner lots (diagonal corner door instead) */
  door: Run | null;
  /** front glazing runs */
  glass: Run[];
  /** cross-street glazing run (Z measured from the corner), corner lots only */
  sideGlass: Run | null;
  awning: { front: Run; side: Run | null } | null;
  sign: { front: Run; side: Run | null; lit: boolean; depth: number; height: number };
  stickers: PlannedSticker[];
  grille: boolean;
  tile: Tile;
  upper: number;
}

const TILE_OF: Record<StoreKind, readonly Tile[]> = {
  bodega: ['green', 'black', 'navy'], deli: ['cream', 'green'], laundromat: ['cream', 'navy'], barber: ['black', 'cream'],
  liquor: ['black', 'navy'], pharmacy: ['cream', 'green'], daycare: ['cream'], restaurant: ['black', 'cream', 'green'],
  cellphone: ['black', 'navy'], church: ['navy', 'black'], generic: ['green', 'navy', 'cream', 'black'],
};

const STICKER_SETS: Record<StoreKind, readonly StickerKind[]> = {
  bodega: ['open', 'atm', 'ebt', 'lotto', 'camera'],
  deli: ['open', 'ebt', 'camera'],
  laundromat: ['open', 'noloiter'],
  barber: ['open'],
  liquor: ['open', 'lotto', 'atm', 'noloiter'],
  pharmacy: ['open', 'camera'],
  daycare: [],
  restaurant: ['menu', 'open'],
  cellphone: ['open', 'camera'],
  church: [],
  generic: ['open'],
};

function runLen(r: Run): number {
  return r.b - r.a;
}

/** Posts every ~2 m inside a glazing run (not at its ends). */
function postsOf(run: Run): number[] {
  const n = Math.max(1, Math.round(runLen(run) / 2.0));
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(run.a + (runLen(run) * i) / n);
  return out;
}

/**
 * Pure layout of a shop front for a lot of width W and depth D (no geometry): glazing runs, door, awning and sign
 * spans, stickers, tile colour. Deterministic from (spec, W, D, corner side, rng). Corner lots (cs set) get a
 * chamfered corner door, a cross-street glazing run and a second awning/sign span.
 */
export function planStorefront(spec: StorefrontSpec, W: number, D: number, cs: CornerSide, rng: Rng, nUp = 2): StorefrontPlan {
  const corner = cs !== null;
  const mirror = cs === 'right';
  const kind = spec.kind;
  const cut = corner ? CORNER_CUT : 0;
  const lit = kind !== 'church' && kind !== 'daycare' && !spec.shuttered;
  const sign: StorefrontPlan['sign'] = {
    front: corner ? { a: -SIGN_D, b: W - 0.3 } : { a: 0.3, b: W - 0.3 },
    side: null,
    lit,
    depth: lit ? SIGN_D : BOARD_D,
    height: SIGN_H,
  };
  let door: Run | null = null;
  let glass: Run[];
  let sideGlass: Run | null = null;
  let awning: StorefrontPlan['awning'] = kind === 'church' ? null : { front: corner ? { a: 0, b: W - 0.15 } : { a: 0.15, b: W - 0.15 }, side: null };
  if (corner) {
    glass = [{ a: cut + 0.06, b: W - PIER }];
    const ls = Math.min(cut + 0.06 + Math.min(6, Math.max(3, D * 0.4)), D - 2.5);
    sideGlass = { a: cut + 0.06, b: ls };
    sign.side = { a: 0, b: ls + 0.3 };
    if (awning) awning = { front: awning.front, side: { a: 0, b: ls + 0.3 } };
  } else {
    const aw = 1.3;
    const doorLeft = rng.chance(0.5);
    const ax0 = doorLeft ? PIER + 0.05 : W - PIER - aw - 0.05;
    door = { a: ax0, b: ax0 + aw };
    glass = [];
    for (const [xa, xb] of [[PIER, door.a], [door.b, W - PIER]] as const) if (xb - xa >= 0.6) glass.push({ a: xa, b: xb });
  }
  const tiles = TILE_OF[kind];
  const tile = tiles[rng.int(0, tiles.length - 1)];
  const grille = !corner && kind !== 'church' && kind !== 'daycare' && rng.chance(0.3);

  // window stickers: biggest first, front glazing nearest the door/corner first; corner shops put every other one on the side
  const stickers: PlannedSticker[] = [];
  const pool = [...STICKER_SETS[kind]];
  if (spec.closesAt === null && (kind === 'bodega' || kind === 'deli' || kind === 'liquor')) pool.splice(1, 0, 'h24');
  if (spec.shuttered) pool.length = 0;
  const cursor = { front: 0.45, side: 0.45 };
  pool.forEach((sk, i) => {
    const slot = STICKER_SLOTS[sk];
    const onSide = sideGlass !== null && i % 2 === 1;
    const runs = onSide ? [sideGlass as Run] : glass;
    const run = runs[0];
    if (!run) return;
    const c = onSide ? cursor.side : cursor.front;
    if (c + slot.wM > runLen(run) - 0.15) return;
    const y = sk === 'open' ? 2.3 : sk === 'menu' ? 1.5 : 1.35 + (i % 3) * 0.28;
    stickers.push({ kind: sk, face: onSide ? 'side' : 'front', at: run.a + c + slot.wM / 2, y });
    if (onSide) cursor.side += slot.wM + 0.12;
    else cursor.front += slot.wM + 0.12;
  });
  return { spec, W, D, cs, corner, mirror, cut, door, glass, sideGlass, awning, sign, stickers, grille, tile, upper: nUp };
}

// ---------------------------------------------------------------------------------------------- night schedule

/** True between 19:30 and 06:00 (same as the game clock). */
export function isNightHour(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= 19.5 || h < 6;
}

/** Is a shop that closes at `closesAt` (22..25, 25 = 1 am; null = 24 h) shuttered at `hour`? Reopens at 06:00. */
export function isStoreClosed(closesAt: number | null, hour: number): boolean {
  if (closesAt === null) return false;
  const h = ((hour % 24) + 24) % 24;
  const t = h < 6 ? h + 24 : h;
  return t >= closesAt && t < 30;
}

// ---------------------------------------------------------------------------------------------- material kit

/** [u0, v0, u1, v1] with v1 the top row of the tile. */
export type UvRect = readonly [number, number, number, number];

/** One rect of an atlas sheet and the material of that sheet. */
export interface Piece { mat: THREE.Material; uv: UvRect }

/**
 * An awning is lettered in the middle and plain either side: `valance`/`slope` carry the name, icons and slope art over
 * `textW` metres; `plainValance`/`plainSlope` are one shared piece per colour and style (`plainW` metres) that fills the
 * rest. Textures are keyed by (colour, name), never by frontage width, so a name is one tile wherever it hangs.
 */
export interface AwningTile {
  textW: number;
  valance: Piece;
  slope: Piece;
  plainValance: Piece;
  plainSlope: Piece;
  plainW: number;
  /** flat colour rows (underside, caps, scallop tips) */
  fringe: Piece;
  /** true: the lettered piece spans the whole run (fixed-size library awning); the plain pieces are unused */
  full: boolean;
}
export interface SignTile { mat: THREE.Material; uv: UvRect; /** face width the tile was painted for (m) */ widthM: number }

export interface TileRecord {
  kind: 'awning-valance' | 'awning-slope' | 'sign' | 'board';
  text: string;
  /** metres covered by the tile */
  widthM: number;
  heightM: number;
  /** painted pixels */
  w: number;
  h: number;
}

interface Sheet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshStandardMaterial;
  x: number;
  y: number;
  rowH: number;
}

const SHEET_W = 2048;
const SHEET_H = 1024;
const SHEET_PAD = 4;

type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;
let canvasOverride: CanvasFactory | null | undefined;

/** Tests inject a fake canvas factory (or null to force the no-canvas fallback); undefined restores the default. */
export function setStorefrontCanvasFactory(f: CanvasFactory | null | undefined): void {
  canvasOverride = f;
  KITS.clear();
}

function defaultFactory(): CanvasFactory | null {
  if (canvasOverride !== undefined) return canvasOverride;
  return typeof document === 'undefined' ? null : createCanvas;
}

/** Shelf-packed texture sheets; every sheet has one material. */
class Atlas {
  readonly sheets: Sheet[] = [];
  constructor(
    private readonly factory: CanvasFactory,
    private readonly makeMat: (tex: THREE.CanvasTexture, index: number) => THREE.MeshStandardMaterial,
    private readonly sw = SHEET_W,
    private readonly sh = SHEET_H,
  ) {}

  private newSheet(): Sheet {
    const canvas = this.factory(this.sw, this.sh);
    canvas.width = this.sw;
    canvas.height = this.sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('storefront atlas: 2D context unavailable');
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const sheet: Sheet = { canvas, ctx, tex, mat: this.makeMat(tex, this.sheets.length), x: 0, y: 0, rowH: 0 };
    this.sheets.push(sheet);
    return sheet;
  }

  /** Place all `sizes` on one sheet (a new one when they do not fit); returns inner rects (px) and the sheet. */
  place(sizes: readonly { w: number; h: number }[]): { sheet: Sheet; rects: { x: number; y: number; w: number; h: number }[] } {
    const tryOn = (s: Sheet) => {
      let { x, y, rowH } = s;
      const rects: { x: number; y: number; w: number; h: number }[] = [];
      for (const sz of sizes) {
        const bw = sz.w + 2 * SHEET_PAD, bh = sz.h + 2 * SHEET_PAD;
        if (x + bw > this.sw) { x = 0; y += rowH; rowH = 0; }
        if (y + bh > this.sh || bw > this.sw) return null;
        rects.push({ x: x + SHEET_PAD, y: y + SHEET_PAD, w: sz.w, h: sz.h });
        x += bw;
        rowH = Math.max(rowH, bh);
      }
      return { rects, x, y, rowH };
    };
    let s = this.sheets[this.sheets.length - 1] ?? this.newSheet();
    let r = tryOn(s);
    if (!r) {
      s = this.newSheet();
      r = tryOn(s);
      if (!r) throw new Error('storefront atlas: tile larger than a sheet');
    }
    s.x = r.x; s.y = r.y; s.rowH = r.rowH;
    return { sheet: s, rects: r.rects };
  }

  paint(sheet: Sheet, rect: { x: number; y: number; w: number; h: number }, painter: Painter, seed: number): void {
    const { ctx } = sheet;
    ctx.save();
    ctx.translate(rect.x, rect.y);
    painter(ctx, rect.w, rect.h, new Rng(seed >>> 0), 0);
    ctx.restore();
    sheet.tex.needsUpdate = true;
  }

  uv(rect: { x: number; y: number; w: number; h: number }): UvRect {
    const hx = 0.5 / this.sw, hy = 0.5 / this.sh;
    return [rect.x / this.sw + hx, 1 - (rect.y + rect.h) / this.sh + hy, (rect.x + rect.w) / this.sw - hx, 1 - rect.y / this.sh - hy];
  }

  dispose(): void {
    for (const s of this.sheets) { s.tex.dispose(); s.mat.dispose(); }
    this.sheets.length = 0;
  }
}

/**
 * Metres of awning the lettering needs: the name at valance letter height plus the icon plates either side. Independent
 * of the frontage, so the same name is one texture tile wherever it hangs.
 */
export function awningTextWidth(text: string): number {
  const l = layoutAwning(text);
  const icons = l.pictograms.length ? 1.0 : 0;
  return Math.round(Math.min(8.5, Math.max(2.4, l.mainLine.length * 0.135 + icons + 0.5)) * 10) / 10;
}

/** The lightbox face width class for `avail` metres of face: the largest class that fits (never below 2 m). */
export function signFaceWidth(avail: number): number {
  let best = Math.max(2, Math.floor(avail * 10) / 10);
  for (const c of SIGN_CLASSES) if (c <= avail) best = c;
  return best;
}

const KITS = new Set<StorefrontKit>();

/**
 * Per-MaterialLibrary storefront materials: awning / sign / sticker atlases, gate variants, flat tile colours, and the
 * night state. Created lazily by buildMixedUse; `setStorefrontHour` drives every kit.
 */
export class StorefrontKit {
  /** every tile painted so far (tests check each against its real-world size) */
  readonly tiles: TileRecord[] = [];
  night = false;
  hour = 12;
  private hourSet = false;
  private readonly awnings: Atlas | null;
  private readonly lit: Atlas | null;
  private readonly boards: Atlas | null;
  private stickerSheet: Atlas | null = null;
  private stickerUvs: Partial<Record<StickerKind, UvRect>> = {};
  private readonly awningCache = new Map<string, AwningTile>();
  private readonly plainCache = new Map<string, { valance: Piece; slope: Piece; fringe: Piece }>();
  private readonly signCache = new Map<string, SignTile>();
  private readonly gates = new Map<number, THREE.Material>();
  private readonly gateDecals = new Map<string, THREE.Material>();
  private readonly flats = new Map<string, THREE.Material>();
  private readonly glowMats: THREE.MeshStandardMaterial[] = [];

  constructor(readonly lib: IMaterialLibrary, private readonly factory: CanvasFactory | null = defaultFactory()) {
    const seed = Rng.hash('storefront-kit');
    this.seed = seed;
    if (factory) {
      this.awnings = new Atlas(factory, (tex, i) => {
        const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
        m.name = `sf:awning:${i}`;
        return m;
      });
      this.lit = new Atlas(factory, (tex, i) => {
        const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0, roughness: 0.6, metalness: 0 });
        m.name = `sf:sign:${i}`;
        this.glowMats.push(m);
        m.userData.storefrontGlow = LIGHTBOX_NIGHT;
        return m;
      });
      this.boards = new Atlas(factory, (tex, i) => {
        const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
        m.name = `sf:board:${i}`;
        return m;
      });
    } else {
      this.awnings = this.lit = this.boards = null;
    }
    // follow the library's night state (windows glow exactly when it is night) and its later flips
    try {
      const w = lib.get('window', 0) as THREE.MeshStandardMaterial;
      this.night = (w.emissiveIntensity ?? 0) > 0;
      this.hour = this.night ? 21 : 12;
    } catch { /* stub libraries without the key */ }
    const prev = lib.setNight.bind(lib);
    lib.setNight = (n: boolean) => {
      prev(n);
      this.followNight(n);
    };
    KITS.add(this);
    this.apply();
  }

  private readonly seed: number;

  /** True when real textures are available (a canvas factory exists). */
  get textured(): boolean {
    return this.factory !== null;
  }

  private followNight(n: boolean): void {
    if (isNightHour(this.hour) !== n) this.hour = n ? 21 : 12;
    this.night = n;
    this.apply();
  }

  setHour(hour: number): void {
    // the game clock calls this every frame: skip until the minute changes (gates/glow only switch on the half hour)
    if (this.hourSet && Math.abs(hour - this.hour) < 1 / 120) return;
    this.hour = hour;
    this.hourSet = true;
    this.night = isNightHour(hour);
    this.apply();
  }

  get hourExplicit(): boolean {
    return this.hourSet;
  }

  private apply(): void {
    for (const m of this.glowMats) m.emissiveIntensity = this.night ? (m.userData.storefrontGlow as number) : 0;
    for (const [closesAt, m] of this.gates) m.visible = isStoreClosed(closesAt, this.hour);
    for (const [key, m] of this.gateDecals) m.visible = isStoreClosed(Number(key.split(':')[0]), this.hour);
  }

  private record(kind: TileRecord['kind'], text: string, widthM: number, heightM: number, w: number, h: number): void {
    this.tiles.push({ kind, text, widthM, heightM, w, h });
  }

  /** Style a name's awning is painted in (vinyl or corrugated metal). */
  styleOf(text: string): AwningStyle {
    return layoutAwning(text).style;
  }

  /** Shared plain pieces for a colour and style: valance + slope, `PLAIN_W` wide. */
  private plainPieces(color: string, style: AwningStyle): { valance: Piece; slope: Piece; fringe: Piece } | null {
    const key = `${color}|${style}`;
    const hit = this.plainCache.get(key);
    if (hit) return hit;
    if (!this.awnings) return null;
    const vh = Math.round((AWN_VAL + AWN_FRINGE) * AWN_VAL_PPM);
    const vw = Math.round(PLAIN_W * AWN_VAL_PPM);
    const sw = Math.max(8, Math.round(PLAIN_W * AWN_SLOPE_PPM)), sh = Math.max(8, Math.round(AWN_SLOPE * AWN_SLOPE_PPM));
    const { sheet, rects } = this.awnings.place([{ w: vw, h: vh }, { w: sw, h: sh }]);
    const seed = (Rng.hash(key) ^ this.seed) >>> 0;
    const geom = { widthM: PLAIN_W, slopeM: 0, valanceM: AWN_VAL, fringeM: AWN_FRINGE };
    this.awnings.paint(sheet, rects[0], awningValancePainter(color, '', geom, style), seed);
    this.awnings.paint(sheet, rects[1], awningSlopePainter(color, '', PLAIN_W, style), seed ^ 0x51ed);
    this.record('awning-valance', `plain:${style}`, PLAIN_W, AWN_VAL + AWN_FRINGE, vw, vh);
    this.record('awning-slope', `plain:${style}`, PLAIN_W, AWN_SLOPE, sw, sh);
    const v = this.awnings.uv(rects[0]);
    const fringeV = (Math.max(1, Math.round(AWN_FRINGE * AWN_VAL_PPM)) / vh) * (v[3] - v[1]);
    const out = {
      valance: { mat: sheet.mat, uv: [v[0], v[1] + fringeV, v[2], v[3]] as UvRect },
      slope: { mat: sheet.mat, uv: this.awnings.uv(rects[1]) },
      fringe: { mat: sheet.mat, uv: [v[0], v[1], v[2], v[1] + fringeV] as UvRect },
    };
    this.plainCache.set(key, out);
    return out;
  }

  /**
   * Awning tile for a name on a run at most `availW` metres long: the lettering at AWN_VAL_PPM over `textW` metres
   * (just what the name needs), the slope art at AWN_SLOPE_PPM, and the shared plain pieces for the remainder.
   */
  awningTile(color: string, text: string, availW: number, fullW = availW): AwningTile {
    const need = awningTextWidth(text);
    const full = need > availW - 0.5;
    const textW = full ? fullW : need;
    const key = `${color}|${text}|${full ? textW.toFixed(1) : 'n'}`;
    const hit = this.awningCache.get(key);
    if (hit) return hit;
    let tile: AwningTile;
    const style = this.styleOf(text);
    const plain = this.awnings && !full ? this.plainPieces(color, style) : null;
    if (this.awnings) {
      const vw = Math.round(textW * AWN_VAL_PPM), vh = Math.round((AWN_VAL + AWN_FRINGE) * AWN_VAL_PPM);
      const sw = Math.max(16, Math.round(textW * AWN_SLOPE_PPM)), sh = Math.max(8, Math.round(AWN_SLOPE * AWN_SLOPE_PPM));
      const { sheet, rects } = this.awnings.place([{ w: vw, h: vh }, { w: sw, h: sh }]);
      const seed = (Rng.hash(key) ^ this.seed) >>> 0;
      this.awnings.paint(sheet, rects[0], awningValancePainter(color, text, { widthM: textW, slopeM: 0, valanceM: AWN_VAL, fringeM: AWN_FRINGE }), seed);
      this.awnings.paint(sheet, rects[1], awningSlopePainter(color, text, textW), seed ^ 0x9e37);
      this.record('awning-valance', text, textW, AWN_VAL + AWN_FRINGE, vw, vh);
      this.record('awning-slope', text, textW, AWN_SLOPE, sw, sh);
      const v = this.awnings.uv(rects[0]);
      const fringeV = (Math.max(1, Math.round(AWN_FRINGE * AWN_VAL_PPM)) / vh) * (v[3] - v[1]);
      const valance: Piece = { mat: sheet.mat, uv: [v[0], v[1] + fringeV, v[2], v[3]] };
      const slope: Piece = { mat: sheet.mat, uv: this.awnings.uv(rects[1]) };
      const fringe: Piece = { mat: sheet.mat, uv: [v[0], v[1], v[2], v[1] + fringeV] };
      tile = plain
        ? { textW, valance, slope, plainValance: plain.valance, plainSlope: plain.slope, plainW: PLAIN_W, fringe: plain.fringe, full: false }
        : { textW, valance, slope, plainValance: valance, plainSlope: slope, plainW: textW, fringe, full: true };
    } else {
      // fixed 512x256 MaterialLibrary awning: slope = upper 72 %, valance the rest, painted scallops
      const mat = this.lib.awning(color, text);
      const valance: Piece = { mat, uv: [0, 0.06, 1, 0.28] };
      const slope: Piece = { mat, uv: [0, 0.28, 1, 1] };
      tile = { textW: availW, valance, slope, plainValance: valance, plainSlope: slope, plainW: availW, fringe: { mat, uv: [0, 0.01, 1, 0.05] }, full: true };
    }
    this.awningCache.set(key, tile);
    return tile;
  }

  /** Sign-face tile `widthM` x `heightM`. `lit` boxes are emissive after dark; boards are painted and unlit. */
  signTile(text: string, bg: string, fg: string, widthM: number, heightM: number, lit: boolean): SignTile {
    const key = `${text}|${bg}|${fg}|${widthM.toFixed(2)}|${lit ? 1 : 0}`;
    const hit = this.signCache.get(key);
    if (hit) return hit;
    let tile: SignTile;
    const atlas = lit ? this.lit : this.boards;
    if (atlas) {
      const geom = { widthM, heightM };
      const ppm = Math.min(SIGN_PPM, ppmFor(widthM));
      const sw = Math.max(16, Math.round(widthM * ppm)), sh = Math.max(16, Math.round(heightM * ppm));
      const { sheet, rects } = atlas.place([{ w: sw, h: sh }]);
      atlas.paint(sheet, rects[0], signPainter(text, bg, fg, geom), (Rng.hash(key) ^ this.seed) >>> 0);
      this.record(lit ? 'sign' : 'board', text, widthM, heightM, sw, sh);
      tile = { mat: sheet.mat, uv: atlas.uv(rects[0]), widthM };
    } else {
      tile = { mat: this.lib.sign(text, bg, fg), uv: [0, 0, 1, 1], widthM };
    }
    this.signCache.set(key, tile);
    return tile;
  }

  /** Shared sticker atlas material (null without a canvas) and the UV rect of one sticker. */
  stickers(): THREE.Material | null {
    if (!this.factory) return null;
    if (!this.stickerSheet) {
      const atlas = new Atlas(this.factory, (tex) => {
        const m = new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0, roughness: 0.5, metalness: 0,
          alphaTest: 0.5,
        });
        m.name = 'sf:stickers';
        m.userData.storefrontGlow = STICKER_NIGHT;
        this.glowMats.push(m);
        return m;
      }, STICKER_ATLAS.w + 2 * SHEET_PAD, STICKER_ATLAS.h + 2 * SHEET_PAD);
      // the sticker atlas has its own fixed size: one 512x384 sheet laid out by STICKER_SLOTS
      const { sheet, rects } = atlas.place([{ w: STICKER_ATLAS.w, h: STICKER_ATLAS.h }]);
      atlas.paint(sheet, rects[0], stickerAtlasPainter, Rng.hash('sf-stickers'));
      for (const k of Object.keys(STICKER_SLOTS) as StickerKind[]) {
        const s = STICKER_SLOTS[k];
        this.stickerUvs[k] = atlas.uv({ x: rects[0].x + s.x, y: rects[0].y + s.y, w: s.w, h: s.h });
      }
      this.stickerSheet = atlas;
      this.apply();
    }
    return this.stickerSheet.sheets[0].mat;
  }

  stickerUv(kind: StickerKind): UvRect {
    return this.stickerUvs[kind] ?? [0, 0, 1, 1];
  }

  /**
   * Roll-gate material that is visible only while the shop is closed (null = permanent: the plain shared gate).
   * Without a canvas (no real renderer) every shop shares one closing time, to keep the material count down.
   */
  gate(closesAt: number | null): THREE.Material {
    if (closesAt === null) return this.lib.get('rollGate', 0);
    if (!this.factory) closesAt = 23;
    let m = this.gates.get(closesAt);
    if (!m) {
      m = this.lib.get('rollGate', 0).clone();
      m.name = `rollGate:closes${closesAt}`;
      this.gates.set(closesAt, m);
      this.apply();
    }
    return m;
  }

  /**
   * Graffiti decal for a roll gate: shown only while that gate is down (a clone of the library's graffiti material
   * per closing hour and variant). closesAt === null = the permanent decal on a closed-down shop's gate.
   */
  gateDecal(closesAt: number | null, variant: number): THREE.Material {
    if (closesAt === null) return this.lib.get('graffiti', variant);
    if (!this.factory) closesAt = 23;
    const key = `${closesAt}:${variant}`;
    let m = this.gateDecals.get(key);
    if (!m) {
      m = this.lib.get('graffiti', variant).clone();
      m.name = `graffiti:gate${closesAt}:${variant}`;
      this.gateDecals.set(key, m);
      this.apply();
    }
    return m;
  }

  /** Flat painted/tiled colour (bulkheads), shared by name. */
  flat(color: string, roughness = 0.55, metalness = 0): THREE.Material {
    const key = `${color}|${roughness}|${metalness}`;
    let m = this.flats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
      m.name = `sf:flat:${color}`;
      this.flats.set(key, m);
    }
    return m;
  }

  dispose(): void {
    this.awnings?.dispose();
    this.lit?.dispose();
    this.boards?.dispose();
    this.stickerSheet?.dispose();
    for (const m of [...this.gates.values(), ...this.gateDecals.values(), ...this.flats.values()]) m.dispose();
    this.gates.clear(); this.gateDecals.clear(); this.flats.clear(); this.awningCache.clear(); this.plainCache.clear(); this.signCache.clear(); this.glowMats.length = 0;
    KITS.delete(this);
  }
}

const KIT_OF = new WeakMap<IMaterialLibrary, StorefrontKit>();

/** The (lazily created) kit for a material library. */
export function getStorefrontKit(lib: IMaterialLibrary): StorefrontKit {
  let k = KIT_OF.get(lib);
  if (!k) {
    k = new StorefrontKit(lib);
    KIT_OF.set(lib, k);
  }
  return k;
}

/**
 * Set the clock for every storefront kit: lit boxes and stickers after 19:30, roll gates down on the shops whose
 * closing hour has passed (22:00 to 01:00 by shop, reopening at 06:00). Call when the hour changes.
 */
export function setStorefrontHour(hour: number): void {
  for (const k of KITS) k.setHour(hour);
}

/** Drop every kit (tests, world rebuild). */
export function disposeStorefrontKits(): void {
  for (const k of [...KITS]) k.dispose();
}

if (typeof window !== 'undefined') {
  // review hook, same spirit as window.__gtaDebug: drive the storefront clock from the console or a screenshot script
  (window as unknown as { __gtaStorefronts?: unknown }).__gtaStorefronts = { setHour: setStorefrontHour };
}

// ---------------------------------------------------------------------------------------------- geometry helpers

type V2 = readonly [number, number];

function sub3(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

/** Quad p0..p3 (ring order) with per-corner UVs, wound to face `hint`. */
function quadUV(b: LotBatch, mat: THREE.Material, pts: [V3, V3, V3, V3], uvs: [V2, V2, V2, V2], hint: V3): void {
  let p = pts, t = uvs;
  if (dot3(cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])), hint) < 0) {
    p = [pts[3], pts[2], pts[1], pts[0]];
    t = [uvs[3], uvs[2], uvs[1], uvs[0]];
  }
  b.tri(mat, p[0], p[1], p[2], [[t[0][0], t[0][1]], [t[1][0], t[1][1]], [t[2][0], t[2][1]]]);
  b.tri(mat, p[0], p[2], p[3], [[t[0][0], t[0][1]], [t[2][0], t[2][1]], [t[3][0], t[3][1]]]);
}

function triUV(b: LotBatch, mat: THREE.Material, pts: [V3, V3, V3], uvs: [V2, V2, V2], hint: V3): void {
  let p = pts, t = uvs;
  if (dot3(cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])), hint) < 0) {
    p = [pts[0], pts[2], pts[1]];
    t = [uvs[0], uvs[2], uvs[1]];
  }
  b.tri(mat, p[0], p[1], p[2], [[t[0][0], t[0][1]], [t[1][0], t[1][1]], [t[2][0], t[2][1]]]);
}

interface AwningRun {
  /** wall endpoints (lot-local x, z); a is the viewer's left looking at the wall from outside */
  a: V2;
  b: V2;
  /** unit outward normal in the x-z plane */
  n: V2;
  mitreA: boolean;
  mitreB: boolean;
}

/** Outer-edge length of an awning run (the valance), which is the width its texture must cover. */
export function awningRunLength(len: number, mitreA: boolean, mitreB: boolean): number {
  // each mitred end pushes the outer edge out by AWN_OUT along the wall
  return len + (mitreA ? AWN_OUT : 0) + (mitreB ? AWN_OUT : 0);
}

/**
 * Sloped awning over a straight wall run: top face, scalloped valance, underside and end caps; mitred ends continue
 * around a corner. The run is lettered in the middle (`tile.valance` / `tile.slope`, each `tile.textW` metres wide at
 * true aspect) and plain either side (the shared plain pieces, repeated every `plainW` metres).
 */
function awningRun(b: LotBatch, tile: AwningTile, run: AwningRun, yAtt: number): void {
  const { a, b: e, n } = run;
  const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
  const t: V2 = [(e[0] - a[0]) / len, (e[1] - a[1]) / len];
  const eA = run.mitreA ? AWN_OUT : 0, eB = run.mitreB ? AWN_OUT : 0;
  const outerA: V2 = [a[0] + n[0] * AWN_OUT - t[0] * eA, a[1] + n[1] * AWN_OUT - t[1] * eA];
  const outerB: V2 = [e[0] + n[0] * AWN_OUT + t[0] * eB, e[1] + n[1] * AWN_OUT + t[1] * eB];
  const outerLen = len + eA + eB;
  const yFold = yAtt - AWN_DROP, yv = yFold - AWN_VAL;
  const P = (p: V2, y: number): V3 => [p[0], y, p[1]];
  const wallAt = (d: number): V2 => [a[0] + t[0] * d, a[1] + t[1] * d];
  const outAt = (d: number): V2 => [outerA[0] + t[0] * d, outerA[1] + t[1] * d];
  const nUp: V3 = [n[0] * 0.3, 1, n[1] * 0.3];
  const nOut: V3 = [n[0], 0, n[1]];

  // lettered span, centred on the wall run
  const tw = tile.full ? len : Math.min(tile.textW, len);
  const w0 = (len - tw) / 2, w1 = w0 + tw;
  type Seg = { w0: number; w1: number; o0: number; o1: number; lettered: boolean };
  const segs: Seg[] = tile.full
    ? [{ w0: 0, w1: len, o0: 0, o1: outerLen, lettered: true }]
    : [
      { w0: 0, w1: w0, o0: 0, o1: eA + w0, lettered: false },
      { w0, w1, o0: eA + w0, o1: eA + w1, lettered: true },
      { w0: w1, w1: len, o0: eA + w1, o1: outerLen, lettered: false },
    ];
  for (const sg of segs) {
    if (sg.w1 - sg.w0 < 1e-4 && sg.o1 - sg.o0 < 1e-4) continue;
    const reps = sg.lettered ? 1 : Math.max(1, Math.ceil(Math.max(sg.w1 - sg.w0, sg.o1 - sg.o0) / tile.plainW));
    // a plain piece shorter than the texture takes the leading part of it, never a squeezed whole
    const part = (lenM: number): number => (sg.lettered ? 1 : Math.min(1, lenM / tile.plainW));
    const slope = sg.lettered ? tile.slope : tile.plainSlope;
    const val = sg.lettered ? tile.valance : tile.plainValance;
    for (let k = 0; k < reps; k++) {
      const f0 = k / reps, f1 = (k + 1) / reps;
      const wa = sg.w0 + (sg.w1 - sg.w0) * f0, wb = sg.w0 + (sg.w1 - sg.w0) * f1;
      const oa = sg.o0 + (sg.o1 - sg.o0) * f0, ob = sg.o0 + (sg.o1 - sg.o0) * f1;
      const [sU0, sV0, sU1x, sV1] = slope.uv;
      const sU1 = sU0 + (sU1x - sU0) * part(wb - wa);
      quadUV(b, slope.mat, [P(wallAt(wa), yAtt), P(wallAt(wb), yAtt), P(outAt(ob), yFold), P(outAt(oa), yFold)],
        [[sU0, sV1], [sU1, sV1], [sU1, sV0], [sU0, sV0]], nUp);
      const [vU0, vV0, vU1x, vV1] = val.uv;
      const vU1 = vU0 + (vU1x - vU0) * part(ob - oa);
      quadUV(b, val.mat, [P(outAt(oa), yFold), P(outAt(ob), yFold), P(outAt(ob), yv), P(outAt(oa), yv)],
        [[vU0, vV1], [vU1, vV1], [vU1, vV0], [vU0, vV0]], nOut);
    }
  }
  // underside and end caps: one flat colour from the fringe rows
  const fr = tile.fringe;
  const fu = (fr.uv[0] + fr.uv[2]) / 2, fv = (fr.uv[1] + fr.uv[3]) / 2;
  const flat: [V2, V2, V2, V2] = [[fu, fv], [fu, fv], [fu, fv], [fu, fv]];
  quadUV(b, fr.mat, [P(a, yAtt - AWN_UNDER), P(e, yAtt - AWN_UNDER), P(outerB, yv), P(outerA, yv)], flat, [0, -1, 0]);
  const cap = (wall: V2, outer: V2, hintDir: V3): void => {
    quadUV(b, fr.mat, [P(wall, yAtt), P(outer, yFold), P(outer, yv), P(wall, yAtt - AWN_UNDER)], flat, hintDir);
  };
  if (!run.mitreA) cap(a, outerA, [-t[0], 0, -t[1]]);
  if (!run.mitreB) cap(e, outerB, [t[0], 0, t[1]]);
  // scalloped fringe along the outer edge
  const nTri = Math.max(4, Math.round(outerLen / 0.34));
  const [fU0, fV0, fU1, fV1] = fr.uv;
  for (let i = 0; i < nTri; i++) {
    const f0 = i / nTri, f1 = (i + 1) / nTri, fm = (f0 + f1) / 2;
    const pa = outAt(outerLen * f0), pb = outAt(outerLen * f1), pm = outAt(outerLen * fm);
    const u = (f: number): number => fU0 + (fU1 - fU0) * f;
    triUV(b, fr.mat, [P(pa, yv), P(pm, yv - AWN_SCALLOP), P(pb, yv)],
      [[u(f0), fV1 - (fV1 - fV0) * 0.2], [u(fm), fV0 + (fV1 - fV0) * 0.2], [u(f1), fV1 - (fV1 - fV0) * 0.2]], nOut);
  }
}

// ---------------------------------------------------------------------------------------------- ground floor

/** Everything the ground-floor builder needs to place stuff on the cross-street (side) face of a corner lot. */
interface Frame {
  W: number;
  D: number;
  mirror: boolean;
  /** x of the corner on this lot (0 or W) and the outward x direction of the cross-street face */
  cx0: number;
  nx: number;
}

function frameOf(plan: StorefrontPlan): Frame {
  const left = plan.cs !== 'right';
  return { W: plan.W, D: plan.D, mirror: plan.mirror, cx0: left ? 0 : plan.W, nx: left ? -1 : 1 };
}

/** Build the shop front below GROUND_FLOOR_H. Returns the y the flats above start from. */
export function buildGroundFloor(c: LotCtx, plan: StorefrontPlan, brick: THREE.Material): { topY: number } {
  const { b, m, W, D } = c;
  const kit = getStorefrontKit(m.lib);
  const f = frameOf(plan);
  const { spec } = plan;
  const wx = (X: number): number => (f.mirror ? W - X : X);
  const tileMat = kit.textured
    ? kit.flat({ cream: '#d9d2bd', green: '#25392f', black: '#1b1d20', navy: '#1f2c44' }[plan.tile], 0.45)
    : m.stoop;

  /** quad on the front plane z, spanning logical X0..X1; u runs toward world +x (so text reads left to right) */
  const front = (mat: THREE.Material, X0: number, X1: number, y0: number, y1: number, z: number, opt: RectOpt = {}): void => {
    b.rect(mat, [Math.min(wx(X0), wx(X1)), y0, z], [Math.abs(X1 - X0), 0, 0], [0, y1 - y0, 0], { hint: [0, 0, 1], ...opt });
  };
  /** quad on the cross-street plane at outward offset yo, spanning Z0..Z1 from the corner; u runs to the viewer's right */
  const side = (mat: THREE.Material, Z0: number, Z1: number, y0: number, y1: number, yo: number, opt: RectOpt = {}): void => {
    const x = f.cx0 + f.nx * yo;
    if (f.nx < 0) b.rect(mat, [x, y0, -Z1], [0, 0, Z1 - Z0], [0, y1 - y0, 0], { hint: [f.nx, 0, 0], ...opt });
    else b.rect(mat, [x, y0, -Z0], [0, 0, -(Z1 - Z0)], [0, y1 - y0, 0], { hint: [f.nx, 0, 0], ...opt });
  };
  const frontBox = (mat: THREE.Material, X0: number, X1: number, y0: number, y1: number, z0: number, z1: number, faces: string): void => {
    b.box(mat, Math.min(wx(X0), wx(X1)), y0, z0, Math.max(wx(X0), wx(X1)), y1, z1, faces);
  };
  const sideBox = (mat: THREE.Material, Z0: number, Z1: number, y0: number, y1: number, yo0: number, yo1: number, faces: string): void => {
    const xa = f.cx0 + f.nx * yo0, xb = f.cx0 + f.nx * yo1;
    b.box(mat, Math.min(xa, xb), y0, -Z1, Math.max(xa, xb), y1, -Z0, faces);
  };

  // ---- front: end piers, bulkhead, glazing, posts
  const pierBrick = (X0: number, X1: number): void => {
    front(brick, X0, X1, 0, SHOP_H, 0, { u0: Math.min(wx(X0), wx(X1)) / 3, v0: 0 });
  };
  if (plan.corner) {
    pierBrick(W - PIER, W);
  } else {
    pierBrick(0, PIER);
    pierBrick(W - PIER, W);
  }
  for (const g of plan.glass) {
    const len = g.b - g.a;
    front(tileMat, g.a, g.b, 0, 0.6, 0.01);
    front(m.glass, g.a, g.b, 0.6, SHOP_H, 0.01, { ru: Math.max(1, Math.round(len / 1.6)), rv: 1 });
    for (const px of postsOf(g)) frontBox(m.metal, px - 0.03, px + 0.03, 0, SHOP_H, 0, 0.05, 'lrf');
    frontBox(m.metal, g.a, g.b, 0.6, 0.66, 0, 0.04, 'f');
  }

  // ---- mid-block set-back door alcove (z = -BACK_BY)
  if (plan.door) {
    const d = plan.door;
    const aw = d.b - d.a;
    b.rect(m.metal, [d.a, 0, -BACK_BY], [0, 0, BACK_BY], [0, SHOP_H, 0], { hint: [1, 0, 0], ru: 0.2, rv: 1 });
    b.rect(m.metal, [d.b, 0, -BACK_BY], [0, 0, BACK_BY], [0, SHOP_H, 0], { hint: [-1, 0, 0], ru: 0.2, rv: 1 });
    b.rect(m.metal, [d.a, SHOP_H, -BACK_BY], [aw, 0, 0], [0, 0, BACK_BY], { hint: [0, -1, 0], ru: 0.4, rv: 0.2 });
    b.rect(m.stoop, [d.a, 0.02, -BACK_BY], [aw, 0, 0], [0, 0, BACK_BY], { hint: [0, 1, 0] });
    b.rect(m.glass, [d.a, 2.3, -BACK_BY + 0.01], [aw, 0, 0], [0, SHOP_H - 2.3, 0], { ru: 1, rv: 0.4 });
    b.rect(m.metal, [d.a + 0.15, 0, -BACK_BY + 0.02], [aw - 0.3, 0, 0], [0, 2.3, 0], { ru: 0.4, rv: 0.8 });
    b.rect(m.glass, [d.a + 0.25, 0.9, -BACK_BY + 0.03], [aw - 0.5, 0, 0], [0, 1.2, 0], { ru: 1, rv: 1 });
  }

  // ---- corner: chamfered entrance on a diagonal, with a floor patch and a soffit under the overhanging flats
  if (plan.corner && plan.sideGlass) {
    const cut = plan.cut;
    const A: V2 = [wx(cut), 0];
    const B: V2 = [f.cx0, -cut];
    const C: V2 = [f.cx0, 0];
    const s2 = Math.SQRT1_2;
    const nrm: V3 = [f.nx * s2, 0, s2];
    const dx = B[0] - A[0], dz = B[1] - A[1];
    const dl = Math.hypot(dx, dz);
    const at = (t: number, off: number): [number, number] => [A[0] + (dx * t) / dl + nrm[0] * off, A[1] + (dz * t) / dl + nrm[2] * off];
    const diag = (mat: THREE.Material, t0: number, t1: number, y0: number, y1: number, off: number, opt: RectOpt = {}): void => {
      const [ox, oz] = at(t0, off);
      b.rect(mat, [ox, y0, oz], [(dx * (t1 - t0)) / dl, 0, (dz * (t1 - t0)) / dl], [0, y1 - y0, 0], { hint: nrm, ...opt });
    };
    // the diagonal is the corner's door wall: bulkhead, side lights, a metal door leaf with its pane, transom
    diag(tileMat, 0, dl, 0, 0.45, 0.01);
    diag(m.glass, 0, dl, 0.45, SHOP_H, 0.01, { ru: 1, rv: 1 });
    const l0 = dl / 2 - 0.5, l1 = dl / 2 + 0.5;
    diag(m.metal, l0, l1, 0, 2.3, 0.03, { ru: 0.4, rv: 0.8 });
    diag(m.glass, l0 + 0.14, l1 - 0.14, 0.9, 2.1, 0.045, { ru: 1, rv: 1 });
    diag(m.metal, 0, dl, 2.3, 2.38, 0.03, { ru: 1, rv: 0.1 });
    for (const t of [0.04, dl - 0.04, l0, l1]) {
      const [px, pz] = at(t, 0.03);
      b.box(m.metal, px - 0.04, 0, pz - 0.04, px + 0.04, SHOP_H, pz + 0.04, 'rlfb');
    }
    b.polyFacing(m.stoop, [[A[0], 0.02, A[1]], [B[0], 0.02, B[1]], [C[0], 0.02, C[1]]], [0, 1, 0]);
    b.polyFacing(m.metal, [[A[0], SHOP_H, A[1]], [B[0], SHOP_H, B[1]], [C[0], SHOP_H, C[1]]], [0, -1, 0]);
    // end posts where the glazing meets the diagonal
    frontBox(m.metal, cut - 0.06, cut + 0.06, 0, SHOP_H, -0.06, 0.08, 'rlfb');
    sideBox(m.metal, cut - 0.06, cut + 0.06, 0, SHOP_H, -0.06, 0.08, 'rlfb');

    // cross-street glazing run, its pier and the plain wall beyond
    const sg = plan.sideGlass;
    side(tileMat, sg.a, sg.b, 0, 0.6, 0.01);
    side(m.glass, sg.a, sg.b, 0.6, SHOP_H, 0.01, { ru: Math.max(1, Math.round((sg.b - sg.a) / 1.6)), rv: 1 });
    for (const pz of postsOf(sg)) sideBox(m.metal, pz - 0.03, pz + 0.03, 0, SHOP_H, 0, 0.05, 'rlf');
    side(brick, sg.b, sg.b + 0.4, 0, SHOP_H, 0, { u0: 0.2, v0: 0 });
  }

  // ---- roll gates: housing over every glazed run, the gate itself lowered on closed shops
  const housingY0 = SHOP_H - 0.4;
  const gh = Rng.hash(`${c.lot.id}:gate`);
  const gateMat = spec.shuttered ? (kit.textured ? c.m.lib.get('corrugatedSteel', gh % 3) : m.rollGate) : spec.closesAt === null ? null : kit.gate(spec.closesAt);
  const gateTop = housingY0;
  const gateFront = plan.corner ? [{ a: plan.cut + 0.06, b: W - PIER }] : [{ a: PIER, b: W - PIER }];
  for (const g of gateFront) {
    frontBox(m.metal, g.a, g.b, housingY0, SHOP_H, 0, 0.28, 'rld');
    front(m.rollGate, g.a, g.b, housingY0, SHOP_H, 0.28, { ru: (g.b - g.a) / 3, rv: 0.4 / 3 });
    if (gateMat) front(gateMat, g.a, g.b, 0, gateTop, 0.14, { ru: (g.b - g.a) / 3, rv: gateTop / 3 });
  }
  if (plan.corner && plan.sideGlass) {
    const sg = plan.sideGlass;
    sideBox(m.metal, sg.a, sg.b, housingY0, SHOP_H, 0, 0.28, 'fbd');
    side(m.rollGate, sg.a, sg.b, housingY0, SHOP_H, 0.28, { ru: (sg.b - sg.a) / 3, rv: 0.4 / 3 });
    if (gateMat) side(gateMat, sg.a, sg.b, 0, gateTop, 0.14, { ru: (sg.b - sg.a) / 3, rv: gateTop / 3 });
    if (gateMat) {
      // the diagonal door gets its own panel in front of the leaf
      const s2 = Math.SQRT1_2;
      const A: V2 = [wx(plan.cut), 0], B: V2 = [f.cx0, -plan.cut];
      const dx = B[0] - A[0], dz = B[1] - A[1];
      b.rect(gateMat, [A[0] + s2 * f.nx * 0.07, 0, A[1] + s2 * 0.07], [dx, 0, dz], [0, gateTop, 0], { hint: [f.nx * s2, 0, s2], ru: 0.7, rv: gateTop / 3 });
    }
  }
  // graffiti over the gate: every closed-down shop, and about one night shutter in three (variant 5 is a roller 'buff'
  // patch, 0-4 are tags/throw-ups). The decal sits 1 cm in front of the gate quad and shows only while the gate is down.
  if (gateMat && kit.textured && (spec.shuttered || (gh >> 8) % 3 === 0)) {
    const v = spec.shuttered ? ((gh >> 4) % 6) : (gh >> 4) % 5;
    const dMat = kit.gateDecal(spec.shuttered ? null : spec.closesAt, v);
    for (const g of gateFront) {
      const len = g.b - g.a;
      const w = Math.min(len - 0.3, 1.6 + ((gh >> 12) % 5) * 0.4);
      const a = g.a + (len - w) * (((gh >> 16) % 7) / 6);
      if (w > 0.6) front(dMat, a, a + w, 0.15, 0.15 + Math.min(gateTop - 0.3, w / 2), 0.16);
    }
  }
  if (plan.grille && !gateMat) {
    for (const g of plan.glass) front(m.chain, g.a, g.b, 0.6, SHOP_H - 0.4, 0.07, { ru: (g.b - g.a) / 0.6, rv: (SHOP_H - 1.0) / 0.6 });
  }

  // ---- window stickers
  const stickerMat = kit.stickers();
  if (stickerMat) {
    for (const s of plan.stickers) {
      const slot = STICKER_SLOTS[s.kind];
      const uv = kit.stickerUv(s.kind);
      const opt: RectOpt = { uvRect: [uv[0], uv[1], uv[2], uv[3]] };
      const y0 = s.y - slot.hM / 2;
      if (s.face === 'front') front(stickerMat, s.at - slot.wM / 2, s.at + slot.wM / 2, y0, y0 + slot.hM, 0.06, opt);
      else side(stickerMat, s.at - slot.wM / 2, s.at + slot.wM / 2, y0, y0 + slot.hM, 0.06, opt);
    }
  }

  // ---- awning (wraps the corner on corner lots). Without a canvas only POI shops get their own texture.
  const unique = kit.textured || !!c.lot.poi;
  if (plan.awning) {
    const aw = plan.awning;
    const frontLen = aw.front.b - aw.front.a;
    const wa = wx(aw.front.a), wb = wx(aw.front.b);
    const colour = spec.awningColor;
    const faces: { run: AwningRun; len: number }[] = [];
    const mitre = plan.corner;
    // viewer-left to viewer-right along the front is world +x
    faces.push({
      run: { a: [Math.min(wa, wb), 0], b: [Math.max(wa, wb), 0], n: [0, 1], mitreA: mitre && !f.mirror, mitreB: mitre && f.mirror },
      len: awningRunLength(frontLen, mitre && !f.mirror, mitre && f.mirror),
    });
    if (aw.side) {
      const sl = aw.side.b - aw.side.a;
      // looking at the cross-street wall from outside, the viewer's right is +z for an outward -x wall, -z for +x
      const rear: V2 = [f.cx0, -aw.side.b], corner: V2 = [f.cx0, -aw.side.a];
      const left = f.nx < 0;
      faces.push({
        run: left
          ? { a: rear, b: corner, n: [f.nx, 0], mitreA: false, mitreB: true }
          : { a: corner, b: rear, n: [f.nx, 0], mitreA: true, mitreB: false },
        len: awningRunLength(sl, false, true),
      });
    }
    for (const { run, len } of faces) {
      const wallLen = Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]);
      const tile: AwningTile = unique
        ? kit.awningTile(colour, spec.name, wallLen, len)
        : (() => {
          const p: Piece = { mat: m.plainAwnings[Rng.hash(c.lot.id) & 1], uv: [0, 0.28, 1, 1] };
          const v: Piece = { mat: p.mat, uv: [0, 0.06, 1, 0.28] };
          return { textW: len, valance: v, slope: p, plainValance: v, plainSlope: p, plainW: len, fringe: { mat: p.mat, uv: [0, 0.01, 1, 0.05] as UvRect }, full: true };
        })();
      awningRun(b, tile, run, AWN_Y);
    }
  }

  // ---- sign box above the awning: lit box on most shops, a flat painted board on churches and day cares. The box
  // snaps to a face-width class (so the same copy is one shared tile) and hugs the corner on corner shops.
  const sg = plan.sign;
  const [bg, fg] = SIGN_COLORS[spec.kind];
  const y0 = SIGN_Y0, y1 = SIGN_Y0 + sg.height;
  const dep = sg.depth;
  const faceH = sg.height - 2 * SIGN_F;
  const copy = spec.signCopy;
  const boxOf = (run: Run, hugStart: boolean): Run => {
    const face = signFaceWidth(run.b - run.a - 2 * SIGN_F);
    const w = face + 2 * SIGN_F;
    const a = hugStart ? run.a : run.a + (run.b - run.a - w) / 2;
    return { a, b: a + w };
  };
  {
    const box = boxOf(sg.front, plan.corner);
    frontBox(m.metal, box.a, box.b, y0, y1, 0, dep, 'rludf');
    if (unique) {
      const tile = kit.signTile(copy, bg, fg, box.b - box.a - 2 * SIGN_F, faceH, sg.lit);
      front(tile.mat, box.a + SIGN_F, box.b - SIGN_F, y0 + SIGN_F, y1 - SIGN_F, dep + 0.005, { uvRect: [tile.uv[0], tile.uv[1], tile.uv[2], tile.uv[3]] });
    }
  }
  if (sg.side) {
    const box = boxOf(sg.side, true);
    sideBox(m.metal, box.a, box.b, y0, y1, 0, dep, 'fbud' + (f.nx < 0 ? 'l' : 'r'));
    if (unique) {
      const tile = kit.signTile(copy, bg, fg, box.b - box.a - 2 * SIGN_F, faceH, sg.lit);
      side(tile.mat, box.a + SIGN_F, box.b - SIGN_F, y0 + SIGN_F, y1 - SIGN_F, dep + 0.005, { uvRect: [tile.uv[0], tile.uv[1], tile.uv[2], tile.uv[3]] });
    }
  }
  return { topY: GROUND_H };
}

// ---------------------------------------------------------------------------------------------- the lot

/**
 * The shop front's own wall below the flats: the party-wall shell (0..GROUND_H), the front wall between the opening
 * and the slab (sign band), and on a corner lot the cross-street wall (windows beyond the glazing, plain above it).
 */
function groundShell(c: LotCtx, plan: StorefrontPlan, brick: THREE.Material): void {
  const { b, m, rng, W, D } = c;
  const cs = c.cornerSide;
  b.box(brick, 0, 0, -D, W, GROUND_H, 0, cs === 'left' ? 'rb' : cs === 'right' ? 'lb' : 'rlb');
  // sign band: wall from the top of the opening to the slab, flush with the flats above
  b.rect(brick, [0, SHOP_H, 0], [W, 0, 0], [0, GROUND_H - SHOP_H, 0], { hint: [0, 0, 1], u0: 0, v0: SHOP_H / 3 });
  // cellar doors (two flat steel leaves, no collider) beside the awning line
  if (!plan.corner && rng.chance(0.4)) {
    const cx = (plan.door?.a ?? 0) > W / 2 ? W * 0.3 : W * 0.7;
    for (const dx of [-0.46, 0.46]) b.box(m.metal, cx + dx - 0.43, 0, 0.35, cx + dx + 0.43, 0.07, 1.4, 'ufrl');
  }
  if (cs) {
    // cross-street wall below the flats: shop front for the first stretch (built in buildGroundFloor), then brick
    // with barred windows; the band above the shop opening is plain wall the whole way
    const fromZ = plan.sideGlass ? plan.sideGlass.b + 0.4 : 0;
    const nb = Math.max(2, Math.floor((D - 1) / 3));
    const sx = bayCentres(D, nb);
    b.with(sideWallFrame(cs, W, D), () => {
      // local x runs along the wall: its front end is D (left corner) or 0 (right corner)
      const lo = cs === 'left' ? 0 : fromZ;
      const hi = cs === 'left' ? D - fromZ : D;
      const holes: Hole[] = [];
      const xs = sx.filter((x) => x - 0.75 > lo && x + 0.75 < hi);
      windows(b, m, { xs, y: 0.9, w: 1.5, h: 2.0, z: 0, holes, wall: brick, sill: true, trim: m.limestone, rng });
      if (hi - lo > 0.2) wallWithHoles(b, brick, lo, 0, hi, SHOP_H, 0, holes);
      b.rect(brick, [0, SHOP_H, 0], [D, 0, 0], [0, GROUND_H - SHOP_H, 0], { u0: 0, v0: SHOP_H / 3 });
    });
  }
}

export function buildMixedUse(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot } = c;
  const spec = resolveStorefront(lot, c.spec as SpecLike | undefined);
  const nUp = spec.floorsAbove ?? rng.int(2, 3);
  const r0 = rng.next();
  const fam = c.spec?.family;
  const mats = fam ? familyMats(m, fam) : null;
  const brick = mats ? mats.front : r0 < 0.3 ? m.brickPainted : r0 < 0.65 ? m.brickRed : m.brickAlt;
  const trim = mats ? mats.trim : m.limestone;

  const plan = planStorefront(spec, W, D, c.cornerSide, new Rng(Rng.hash(`${lot.id}:plan`)), nUp);
  groundShell(c, plan, brick);
  buildGroundFloor(c, plan, brick);
  // everything above the slab is B3's stacker: flats, cornice, parapet, roof, fire escape, side wall above
  buildUpperFloors(c, { y0: GROUND_H, floors: nUp, wall: brick, trim });
  return { body: [{ x0: 0, x1: W, z0: -D, z1: 0 }], stoops: [] };
}
