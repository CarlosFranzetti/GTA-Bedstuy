/**
 * Splits each block face into building lots.
 *  - Avenue faces (E/W): two 9-12 m corner lots (mixeduse), the rest 6-9 m, depth 14-18 m (shared per face so
 *    the street-face lots can start cleanly after it).
 *  - Street faces (N/S): lots 5-7.5 m, depth 12-16 m, starting after the adjoining corner lot's depth.
 *  - POIs claim the lot containing their `t` (church lots are widened to fit a 9 m nave).
 * Deterministic from the Rng.
 */
import { add, dist, norm, scale, sub } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { BlockFace, GridModel, Lot, LotType, PoiDef, Side } from '@/world/types';

const CHURCH_MIN_W = 12.5;
const CHURCH_MAX_W = 14;

/** Split `total` into widths in [min,max]; the last lot absorbs the remainder (never < 4 m). */
function fillWidths(total: number, min: number, max: number, rng: Rng): number[] {
  const out: number[] = [];
  let rem = total;
  while (rem > 1e-6) {
    let w = rng.range(min, max);
    if (rem - w < min) w = rem <= max + 1 ? rem : rem / 2;
    out.push(w);
    rem -= w;
  }
  if (out.length) out[out.length - 1] += rem; // kill float residue
  return out;
}

function rollStreetType(rng: Rng): LotType {
  const r = rng.next();
  if (r < 0.65) return 'brownstone';
  if (r < 0.9) return 'rowhouse';
  if (r < 0.93) return 'church';
  if (r < 0.97) return 'scaffold';
  return 'vacant';
}

function rollAvenueType(rng: Rng): LotType {
  const r = rng.next();
  if (r < 0.7) return 'mixeduse';
  if (r < 0.85) return 'apartment';
  return 'brownstone';
}

interface Piece { w: number; type: LotType; corner: boolean; depth: number; }

function streetPieces(span: number, rng: Rng): Piece[] {
  const out: Piece[] = [];
  let rem = span;
  while (rem > 1e-6) {
    let type = rollStreetType(rng);
    if (type === 'church' && rem < CHURCH_MIN_W + 4) type = 'brownstone';
    const isChurch = type === 'church';
    const [lo, hi] = isChurch ? [CHURCH_MIN_W, CHURCH_MAX_W] : [5, 7.5];
    let w = rng.range(lo, hi);
    if (rem - w < (isChurch ? 4 : lo)) w = isChurch || rem <= hi + 1 ? rem : rem / 2;
    out.push({ w, type, corner: false, depth: isChurch ? rng.range(14, 16) : rng.range(12, 16) });
    rem -= w;
  }
  if (out.length) out[out.length - 1].w += rem;
  return out;
}

export function subdivideLots(grid: GridModel, pois: PoiDef[], rng: Rng): Lot[] {
  const byFace = new Map<string, Lot[]>();
  const faceKey = (blockId: string, side: Side) => `${blockId}|${side}`;
  const faceInfo = new Map<string, BlockFace>();

  const makeLot = (face: BlockFace, idx: number, s: number, p: Piece): Lot => {
    const d = norm(sub(face.b, face.a));
    return {
      id: `${face.blockId}-${face.side}-${idx}`,
      blockId: face.blockId,
      side: face.side,
      frontA: add(face.a, scale(d, s)),
      frontB: add(face.a, scale(d, s + p.w)),
      width: p.w,
      depth: p.depth,
      outward: { x: face.outward.x, z: face.outward.z },
      type: p.type,
      corner: p.corner,
    };
  };

  for (const block of grid.blocks) {
    const brng = rng.fork(block.id);
    const ew = block.faces.filter((f) => f.side === 'E' || f.side === 'W');
    const ns = block.faces.filter((f) => f.side === 'N' || f.side === 'S');
    const endDepths: { p: Vec2; depth: number }[] = [];

    for (const face of ew) {
      const len = dist(face.a, face.b);
      const depth = brng.range(14, 18);
      endDepths.push({ p: face.a, depth }, { p: face.b, depth });
      const cw1 = Math.min(brng.range(9, 12), len * 0.3);
      const cw2 = Math.min(brng.range(9, 12), len * 0.3);
      const pieces: Piece[] = [{ w: cw1, type: 'mixeduse', corner: true, depth }];
      for (const w of fillWidths(len - cw1 - cw2, 6, 9, brng)) {
        pieces.push({ w, type: rollAvenueType(brng), corner: false, depth });
      }
      pieces.push({ w: cw2, type: 'mixeduse', corner: true, depth });
      let s = 0;
      const lots: Lot[] = [];
      pieces.forEach((p, i) => { lots.push(makeLot(face, i, s, p)); s += p.w; });
      byFace.set(faceKey(face.blockId, face.side), lots);
      faceInfo.set(faceKey(face.blockId, face.side), face);
    }

    for (const face of ns) {
      const len = dist(face.a, face.b);
      const inset = (p: Vec2) => {
        let best = 0, bd = 1.5;
        for (const e of endDepths) { const dd = dist(e.p, p); if (dd < bd) { bd = dd; best = e.depth; } }
        return best;
      };
      const i0 = inset(face.a), i1 = inset(face.b);
      const span = Math.max(0, len - i0 - i1);
      const lots: Lot[] = [];
      let s = i0;
      streetPieces(span, brng).forEach((p, i) => { lots.push(makeLot(face, i, s, p)); s += p.w; });
      byFace.set(faceKey(face.blockId, face.side), lots);
      faceInfo.set(faceKey(face.blockId, face.side), face);
    }
  }

  // ---- POIs
  for (const poi of pois) {
    const key = faceKey(poi.block, poi.face);
    const lots = byFace.get(key);
    const face = faceInfo.get(key);
    if (!lots || !lots.length || !face) continue;
    const special = poi.archetype === 'church' || poi.archetype === 'condo';
    const s = poi.t * dist(face.a, face.b);
    let idx = lots.findIndex((l) => s >= dist(face.a, l.frontA) && s < dist(face.a, l.frontB));
    if (idx < 0) {
      let bd = Infinity;
      lots.forEach((l, i) => {
        const c = (dist(face.a, l.frontA) + dist(face.a, l.frontB)) / 2;
        if (Math.abs(c - s) < bd) { bd = Math.abs(c - s); idx = i; }
      });
    }
    const ok = (i: number) => i >= 0 && i < lots.length && !lots[i].poi && !(special && lots[i].corner);
    let pick = -1;
    for (let k = 0; k < lots.length && pick < 0; k++) {
      if (ok(idx + k)) pick = idx + k;
      else if (ok(idx - k)) pick = idx - k;
    }
    if (pick < 0) continue;
    const lot = lots[pick];
    lot.poi = poi;
    if (poi.archetype === 'church') {
      lot.type = 'church';
      lot.depth = Math.max(lot.depth, 14);
      // widen by absorbing neighbours until a 9 m nave plus tower fits
      const free = (i: number) => i >= 0 && i < lots.length && !lots[i].poi && !lots[i].corner;
      while (lot.width < CHURCH_MIN_W) {
        const li = lots.indexOf(lot);
        if (free(li + 1)) {
          const n = lots[li + 1];
          lot.frontB = n.frontB; lot.width += n.width; lots.splice(li + 1, 1);
        } else if (free(li - 1)) {
          const n = lots[li - 1];
          lot.frontA = n.frontA; lot.width += n.width; lots.splice(li - 1, 1);
        } else break;
      }
      lot.width = dist(lot.frontA, lot.frontB);
    } else if (poi.archetype === 'condo') {
      lot.type = 'apartment';
    } else {
      lot.type = 'mixeduse';
    }
  }

  const out: Lot[] = [];
  for (const lots of byFace.values()) out.push(...lots);
  return out;
}
