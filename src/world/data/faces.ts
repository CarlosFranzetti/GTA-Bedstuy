/**
 * Convenience entry point for the real city data: loads (once) and validates the `faces` section of bedstuy.json and
 * hands out per-face lot rows. Consumers: BuildingGen/LotSubdivider (B3) and storefronts (S4).
 */
import data from '@/world/data/bedstuy.json';
import { loadFaces, lotsForBlock, lotsForFace } from '@/world/data/schema';
import type { FaceSet, LotsOptions, PlacedLot } from '@/world/data/schema';
import type { GridModel, Side } from '@/world/types';

let cached: FaceSet | undefined;

/** The validated faces of the shipped bedstuy.json (throws SchemaError if the file is malformed). Cached. */
export function getBedstuyFaces(): FaceSet {
  cached ??= loadFaces(data as unknown);
  return cached;
}

/**
 * `(blockId, side) => PlacedLot[] | null`: the shape B3's subdivideLots(.., faceSpecs) expects. Returns null for an
 * unknown block/side. Rows are ordered along face.a -> face.b, N/S faces already inset by the corner lots.
 */
export function faceSpecResolver(grid: GridModel, set: FaceSet = getBedstuyFaces(), opts: LotsOptions = {}): (blockId: string, side: Side) => PlacedLot[] | null {
  return (blockId, side) => {
    let block;
    try { block = grid.blockById(blockId); } catch { return null; }
    const face = block.faces.find((f) => f.side === side);
    return face ? lotsForFace(grid, face, set, opts) : null;
  };
}

/** All lots of the whole city in one list (every block, every face). */
export function allLots(grid: GridModel, set: FaceSet = getBedstuyFaces()): PlacedLot[] {
  const out: PlacedLot[] = [];
  for (const b of grid.blocks) out.push(...lotsForBlock(grid, b.id, set));
  return out;
}
