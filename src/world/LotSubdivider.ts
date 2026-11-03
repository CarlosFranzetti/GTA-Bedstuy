/**
 * Splits each block face into building lots.
 *  - Avenue faces (E/W): two 9-12 m corner lots (mixeduse), the rest 6-9 m, depth 14-18 m (shared per face so
 *    the street-face lots can start cleanly after it).
 *  - Street faces (N/S): lots 5-7.5 m, depth 12-16 m, starting after the adjoining corner lot's depth.
 *  - POIs claim the lot containing their `t` (church lots are widened to fit a 9 m nave).
 * Data-driven faces: when a schema-v2 `FaceSet` is passed (4th argument) every face the data describes
 * (`faceFor(...)` defined) is cut by `lotsForFace` (widths, depth, corner flags, ids) and each lot carries a builder
 * `spec` (see `specFromData`); faces without data keep the procedural subdivision above. Output contract (Lot[]) is
 * unchanged; a data-driven lot just carries an extra `spec`. Called with 3 arguments it behaves exactly as before.
 * Deterministic from the Rng.
 */
import { add, dist, norm, scale, sub } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { BlockFace, GridModel, Lot, LotType, PoiDef, Side } from '@/world/types';
import type { LotSpec, MaterialFamily } from '@/world/buildings/facade';
import type { SpecLot } from '@/world/BuildingGen';
import { STOREFRONT_TO_ARCHETYPE, faceFor, lotsForFace } from '@/world/data/schema';
import type { StorefrontKind } from '@/world/data/schema';
import type { FaceSet, LotSpec as DataLotSpec } from '@/world/data/schema';

/** Schema-v2 lot -> the builder-facing spec (families, uses and cornices mapped onto what the generators can draw). */
export function specFromData(d: DataLotSpec): LotSpec {
  const family: MaterialFamily = ({
    brownstone: 'brownstone', brickRed: 'brick', brickTan: 'tanBrick', brickPainted: 'paintedBrick', limestone: 'limestone',
    frame: 'paintedBrick', church: 'limestone', vacant: 'brick', newBuild: 'paintedBrick',
  } as const)[d.family];
  const floors = Math.max(0, Math.round(d.floors));
  let use: LotSpec['use'];
  let storefront = d.storefront as string | undefined;
  switch (d.use) {
    case 'mixed': use = 'mixed'; break;
    case 'church': use = 'church'; break;
    case 'school': use = 'institutional'; break;
    case 'vacant': use = 'vacant'; break;
    case 'garage': use = 'mixed'; storefront ??= 'autorepair'; break;
    default: use = !d.stoop && (floors >= 4 || d.family === 'newBuild') ? 'apartment' : 'residential';
  }
  return {
    floors: Math.max(1, floors),
    widthM: d.widthM,
    family,
    stoop: { present: d.stoop, heightM: d.stoop ? d.stoopHeightM : 0 },
    cornice: d.cornice === 'bracketed' ? 'bracket' : d.cornice,
    bays: d.bays > 0 ? d.bays : undefined,
    use,
    storefront,
    trees: d.trees,
    scaffold: d.scaffold,
    facadeTexture: (d as { facadeTexture?: string }).facadeTexture,
  };
}

/** Which generator builds a lot with this spec. */
export function lotTypeOf(spec: LotSpec): LotType {
  switch (spec.use) {
    case 'church': return 'church';
    case 'vacant': return 'vacant';
    case 'mixed': return 'mixeduse';
    case 'apartment':
    case 'institutional': return 'apartment';
    default:
      if (spec.scaffold) return 'scaffold';
      return spec.family === 'brownstone' || spec.family === 'limestone' ? 'brownstone' : 'rowhouse';
  }
}

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

export function subdivideLots(grid: GridModel, pois: PoiDef[], rng: Rng, faces?: FaceSet): Lot[] {
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

  /** A lot from the data (`lotsForFace` output): same id scheme, fronts, corner flag; the spec rides along. */
  const dataLot = (pl: ReturnType<typeof lotsForFace>[number]): SpecLot => {
    const spec = specFromData(pl);
    return {
      id: pl.id, blockId: pl.blockId, side: pl.side,
      frontA: pl.frontA, frontB: pl.frontB,
      width: dist(pl.frontA, pl.frontB), depth: pl.depthM,
      outward: { x: pl.outward.x, z: pl.outward.z },
      type: lotTypeOf(spec), corner: pl.corner, spec,
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
      const cw1 = Math.min(brng.range(9, 12), len * 0.3);
      const cw2 = Math.min(brng.range(9, 12), len * 0.3);
      if (faces && faceFor(faces, grid, face)) {
        const placed = lotsForFace(grid, face, faces);
        if (placed.length) {
          endDepths.push({ p: face.a, depth: placed[0].depthM }, { p: face.b, depth: placed[placed.length - 1].depthM });
          byFace.set(faceKey(face.blockId, face.side), placed.map(dataLot));
          faceInfo.set(faceKey(face.blockId, face.side), face);
          continue;
        }
      }
      endDepths.push({ p: face.a, depth }, { p: face.b, depth });
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
      if (faces && faceFor(faces, grid, face)) {
        const placed = lotsForFace(grid, face, faces, { insetA: i0, insetB: i1, autoInset: false });
        if (placed.length) {
          byFace.set(faceKey(face.blockId, face.side), placed.map(dataLot));
          faceInfo.set(faceKey(face.blockId, face.side), face);
          continue;
        }
      }
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
    {
      // a lot the data already made this kind of place (a church; a shop of the POI's archetype) is the one the POI names
      let bd = poi.archetype === 'church' ? Infinity : 25;
      lots.forEach((l, i) => {
        const sp = (l as SpecLot).spec;
        if (l.poi || !sp) return;
        const same = poi.archetype === 'church'
          ? sp.use === 'church'
          : sp.use === 'mixed' && !!sp.storefront && STOREFRONT_TO_ARCHETYPE[sp.storefront as StorefrontKind] === poi.archetype;
        if (!same) return;
        const c = (dist(face.a, l.frontA) + dist(face.a, l.frontB)) / 2;
        if (Math.abs(c - s) < bd) { bd = Math.abs(c - s); pick = i; }
      });
    }
    for (let k = 0; k < lots.length && pick < 0; k++) {
      if (ok(idx + k)) pick = idx + k;
      else if (ok(idx - k)) pick = idx - k;
    }
    if (pick < 0) continue;
    const lot = lots[pick] as SpecLot;
    const dataChurch = lot.spec?.use === 'church';
    lot.poi = poi;
    if (lot.spec && lot.spec.use !== (poi.archetype === 'church' ? 'church' : poi.archetype === 'condo' ? 'apartment' : 'mixed')) {
      // a POI re-purposes a data lot: keep its floors / family, drop what no longer applies
      const use = poi.archetype === 'church' ? 'church' : poi.archetype === 'condo' ? 'apartment' : 'mixed';
      lot.spec = { ...lot.spec, use, scaffold: false, stoop: use === 'mixed' || use === 'apartment' ? { present: false, heightM: 0 } : lot.spec.stoop };
    }
    if (poi.archetype === 'church') {
      lot.type = 'church';
      lot.depth = Math.max(lot.depth, 14);
      // widen by absorbing neighbours until a 9 m nave plus tower fits
      const free = (i: number) => i >= 0 && i < lots.length && !lots[i].poi && !lots[i].corner;
      while (lot.width < CHURCH_MIN_W && !dataChurch) {
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
