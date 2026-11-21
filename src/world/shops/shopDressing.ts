/**
 * Sidewalk and window dressing per shop trade (STORES2). Cheap merged boxes and a few painted quads, added to the
 * lot's own batch: no new material anywhere. Everything is built from the building's plain materials (metal, the four
 * shop tile colours) and the sticker atlas, so it costs triangles (a few hundred per shop at most) and no draw calls.
 * Props stand on the pavement within one metre of the wall, away from the door and the corner chamfer; they are not
 * colliders (a crate you can walk through is a smaller problem than a crate that traps a pedestrian).
 */
import type * as THREE from 'three';
import type { StickerKind } from '@/textures/painters/storefront-art';
import { STICKER_SLOTS } from '@/textures/painters/storefront-art';
import type { DressingKind } from './shopTypes';

type UvRect = readonly [number, number, number, number];

/** What buildGroundFloor hands over: positions are logical X from the shop's left end, z out from the wall, y up. */
export interface DressingEnv {
  W: number;
  /** [from, to] logical X of the door alcove (mid-block) or null */
  door: readonly [number, number] | null;
  /** x where the corner chamfer ends on a corner lot (0 mid-block) */
  cut: number;
  glass: readonly { a: number; b: number }[];
  /** deterministic per-lot number */
  seed: number;
  box(mat: THREE.Material, X0: number, X1: number, y0: number, y1: number, z0: number, z1: number, faces: string): void;
  /** quad facing out (+z) on the plane z, painted with `uv` of the sticker sheet */
  quad(mat: THREE.Material, X0: number, X1: number, y0: number, y1: number, z: number, uv: UvRect): void;
  /** horizontal quad facing up at height y */
  top(mat: THREE.Material, X0: number, X1: number, z0: number, z1: number, y: number, uv: UvRect): void;
  /** quad on the plane X, spanning z0..z1, facing toward +x or -x */
  across(mat: THREE.Material, X: number, y0: number, y1: number, z0: number, z1: number, uv: UvRect, facing: 1 | -1): void;
  /** z of the glass plane's inside face, where window decals sit */
  glassZ: number;
  /** the sandwich board's decal */
  board?: StickerKind;
  metal: THREE.Material;
  tile: { cream: THREE.Material; green: THREE.Material; black: THREE.Material; navy: THREE.Material };
  stickers: THREE.Material | null;
  uv(kind: StickerKind): UvRect;
}

const sz = (k: StickerKind, scale = 1): { w: number; h: number } => ({ w: STICKER_SLOTS[k].wM * scale, h: STICKER_SLOTS[k].hM * scale });

interface Zone { a: number; b: number }

/** Free stretches of pavement along the front: the two ends of the shop, clear of the door and the corner. */
function zonesOf(e: DressingEnv): Zone[] {
  const zs: Zone[] = [];
  const lo = Math.max(0.25, e.cut + 0.35);
  const hi = e.W - 0.25;
  const left: Zone = { a: lo, b: Math.min(lo + 1.7, hi) };
  const right: Zone = { a: Math.max(hi - 1.7, lo), b: hi };
  for (const z of [left, right]) {
    if (e.door && z.b > e.door[0] - 0.3 && z.a < e.door[1] + 0.3) {
      // trim away from the door
      if (z.a < e.door[0]) z.b = Math.min(z.b, e.door[0] - 0.3);
      else z.a = Math.max(z.a, e.door[1] + 0.3);
    }
    if (z.b - z.a >= 0.5 && !zs.some((o) => o.a === z.a && o.b === z.b)) zs.push(z);
  }
  if (zs.length === 2 && zs[0].b > zs[1].a) zs.pop(); // a narrow shop has one zone
  return zs;
}

type Placer = (e: DressingEnv, z: Zone, h: number) => number;

/** Each placer builds one thing inside zone z and returns the width it used. */
const PLACERS: Record<DressingKind, Placer> = {
  crates(e, z, h) {
    const w = 0.46, x0 = z.a;
    const mat = (h & 1) === 0 ? e.tile.navy : e.tile.black;
    for (let i = 0; i < 2; i++) e.box(mat, x0 + i * (w + 0.03), x0 + i * (w + 0.03) + w, 0, 0.3, 0.1, 0.46, 'rlufb');
    e.box(e.tile.cream, x0 + 0.1, x0 + 0.1 + w, 0.3, 0.6, 0.12, 0.48, 'rlufb');
    return 2 * w + 0.03;
  },
  fruitStand(e, z, h) {
    const w = Math.min(1.5, z.b - z.a), d = 0.75, x0 = z.a;
    for (const lx of [x0 + 0.05, x0 + w - 0.09]) for (const lz of [0.12, 0.12 + d - 0.05]) e.box(e.metal, lx, lx + 0.04, 0, 0.8, lz, lz + 0.04, 'rlfb');
    e.box(e.tile.green, x0, x0 + w, 0.8, 0.88, 0.1, 0.1 + d, 'rlufdb');
    if (e.stickers) e.top(e.stickers, x0 + 0.04, x0 + w - 0.04, 0.14, 0.1 + d - 0.04, 0.885, e.uv('produce'));
    e.box(e.tile.green, x0, x0 + w, 0.88, 1.0, 0.1 + d - 0.03, 0.1 + d, 'rlufb'); // lip, front
    void h;
    return w + 0.1;
  },
  iceBox(e, z) {
    const w = 0.95, x0 = z.a;
    e.box(e.tile.cream, x0, x0 + w, 0, 0.95, 0.06, 0.58, 'rlufb');
    e.box(e.tile.black, x0 - 0.01, x0 + w + 0.01, 0.95, 1.01, 0.05, 0.59, 'rlufb');
    e.box(e.tile.navy, x0 + 0.08, x0 + w - 0.08, 0.3, 0.4, 0.58, 0.6, 'f');
    return w + 0.1;
  },
  newsRack(e, z) {
    const x0 = z.a;
    e.box(e.metal, x0, x0 + 0.5, 0, 1.1, 0.08, 0.42, 'rlufb');
    e.box(e.tile.cream, x0 + 0.04, x0 + 0.46, 0.55, 0.95, 0.42, 0.44, 'f');
    e.box(e.tile.navy, x0 + 0.04, x0 + 0.46, 0.98, 1.06, 0.42, 0.44, 'f');
    return 0.6;
  },
  sandwichBoard(e, z) {
    const x0 = z.a + 0.1;
    e.box(e.tile.black, x0, x0 + 0.56, 0, 0.92, 0.62, 0.66, 'rlufb');
    if (e.stickers) {
      const k: StickerKind = e.board ?? 'menu';
      const s = sz(k, 1.5);
      const cx = x0 + 0.28;
      e.quad(e.stickers, cx - s.w / 2, cx + s.w / 2, 0.55, 0.55 + s.h, 0.665, e.uv(k));
    }
    return 0.75;
  },
  flowerBuckets(e, z, h) {
    const x0 = z.a;
    for (let i = 0; i < 3; i++) {
      const bx = x0 + i * 0.36;
      e.box(i === 1 ? e.tile.green : e.tile.navy, bx, bx + 0.3, 0, 0.38, 0.14, 0.44, 'rlufb');
      if (e.stickers) e.top(e.stickers, bx + 0.02, bx + 0.28, 0.16, 0.42, 0.385, e.uv('flowers'));
    }
    void h;
    return 1.1;
  },
  barberPole(e, z) {
    // a blade pole on a bracket by the door: two crossed painted quads, so it reads from the street and along it
    const cx = Math.max(z.a, Math.min(z.b, z.a + 0.4));
    e.box(e.metal, cx - 0.03, cx + 0.03, 1.55, 1.6, 0.05, 0.36, 'rlufb');
    if (e.stickers) {
      const s = sz('pole');
      e.quad(e.stickers, cx - s.w / 2, cx + s.w / 2, 1.6, 1.6 + s.h, 0.36, e.uv('pole'));
      e.across(e.stickers, cx, 1.6, 1.6 + s.h, 0.36 - s.w / 2, 0.36 + s.w / 2, e.uv('pole'), 1);
      e.across(e.stickers, cx, 1.6, 1.6 + s.h, 0.36 - s.w / 2, 0.36 + s.w / 2, e.uv('pole'), -1);
    }
    return 0.5;
  },
  plasticChairs(e, z) {
    let used = 0;
    for (let i = 0; i < 2; i++) {
      const x0 = z.a + i * 0.62;
      if (x0 + 0.45 > z.b + 0.2) break;
      e.box(e.tile.cream, x0, x0 + 0.44, 0.43, 0.47, 0.14, 0.56, 'rlufb');
      e.box(e.tile.cream, x0, x0 + 0.44, 0.47, 0.92, 0.14, 0.18, 'rlufb');
      for (const [lx, lz] of [[0.02, 0.16], [0.4, 0.16], [0.02, 0.52], [0.4, 0.52]] as const) e.box(e.metal, x0 + lx, x0 + lx + 0.03, 0, 0.43, lz, lz + 0.03, 'rlfb');
      used += 0.62;
    }
    return used || 0.5;
  },
  washerRow(e) {
    // the glazing is a painted display, not a window onto an interior: the washers are a decal on the glass
    const g = e.glass[0];
    if (!g || !e.stickers) return 0;
    const s = sz('washers', 1.7);
    const cx = (g.a + g.b) / 2;
    if (g.b - g.a < s.w + 0.3) return 0;
    e.quad(e.stickers, cx - s.w / 2, cx + s.w / 2, 0.68, 0.68 + s.h, e.glassZ, e.uv('washers'));
    return 0;
  },
  hotCase(e, _z, h) {
    // the oven's mouth glows through the window (the glow is on the emissive sticker sheet, so it is lit at night)
    const g = e.glass[h % Math.max(1, e.glass.length)] ?? e.glass[0];
    if (!g || !e.stickers) return 0;
    const s = sz('oven', 1.5);
    if (g.b - g.a < s.w + 0.3) return 0;
    const cx = (g.a + g.b) / 2;
    e.quad(e.stickers, cx - s.w / 2, cx + s.w / 2, 0.68, 0.68 + s.h, e.glassZ, e.uv('oven'));
    return 0;
  },
  bagStack(e, z) {
    const x0 = z.a;
    e.box(e.tile.cream, x0, x0 + 0.5, 0, 0.36, 0.12, 0.5, 'rlufb');
    e.box(e.tile.navy, x0 + 0.04, x0 + 0.5, 0.36, 0.7, 0.14, 0.5, 'rlufb');
    return 0.6;
  },
};

/** Build the dressing of a shop. Deterministic from env.seed. Returns the number of things placed. */
export function addShopDressing(kinds: readonly DressingKind[] | undefined, e: DressingEnv): number {
  if (!kinds || !kinds.length) return 0;
  const zones = zonesOf(e);
  let placed = 0;
  const inside = kinds.filter((k) => k === 'washerRow' || k === 'hotCase');
  const outside = kinds.filter((k) => k !== 'washerRow' && k !== 'hotCase');
  for (const k of inside) {
    PLACERS[k](e, { a: 0, b: 0 }, e.seed >>> 3);
    placed++;
  }
  // one thing per zone, the kinds taken in a per-lot order so neighbours differ
  const start = outside.length ? e.seed % outside.length : 0;
  for (let i = 0; i < zones.length && i < outside.length; i++) {
    const k = outside[(start + i) % outside.length];
    const z = zones[(i + (e.seed >>> 5)) % zones.length];
    // each kind only in a zone wide enough for it
    if (z.b - z.a < 0.55) continue;
    if (i > 0 && zones.length === 1) break;
    PLACERS[k](e, z, e.seed >>> (4 + i));
    placed++;
  }
  return placed;
}
