/**
 * Street-scene density: utility poles with sagging wires, billboards, chain-link fences, construction
 * hoardings, dumpsters, trash-bag piles, traffic cones and graffiti tags. Geometry is merged per material.
 *
 * Wiring: call after buildFurniture and lift the returned group by the sidewalk height (0.15 m) like the others.
 */
import * as THREE from 'three';
import type { GridModel, IMaterialLibrary, Lot, StaticCollider } from '@/world/types';
import type { Rng } from '@/core/Rng';
import { PropsBuilder } from './props/common';
import { buildPoles } from './props/poles';
import { buildBillboards } from './props/billboards';
import { buildFences } from './props/fences';
import { buildCurbside } from './props/curbside';
import { buildGraffiti } from './props/graffiti';
import { buildClutter, type ClutterStats } from './props/clutter';
import { applyClutterState } from './props/clutterTier';

export { applyClutterState, bagGroupForDay } from './props/clutterTier';
export { CLUTTER_TRI_BUDGET, DOOR_ZONE, type ClutterPlacement } from './props/clutter';

export { BILLBOARD_TEXTS } from './props/billboards';

export interface PropsOptions {
  /** Add a second chain-link run (with a gate gap) in front of vacant lots. Off: VacantLot already fences its front. */
  vacantFrontFence?: boolean;
}

export function buildProps(
  grid: GridModel,
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
  options: PropsOptions = {},
): { group: THREE.Group; colliders: StaticCollider[]; clutter: ClutterStats } {
  const pb = new PropsBuilder();
  buildPoles(pb, grid, lots, materials, rng.fork('props:poles'));
  buildBillboards(pb, grid, lots, materials, rng.fork('props:billboards'));
  buildFences(pb, lots, materials, rng.fork('props:fences'), { vacantFrontFence: options.vacantFrontFence ?? false });
  buildCurbside(pb, grid, lots, materials, rng.fork('props:curbside'));
  buildGraffiti(pb, lots, rng.fork('props:graffiti'), materials);
  const clutter = buildClutter(pb, grid, lots, materials, rng.fork('props:clutter'));
  const group = pb.build('props');
  applyClutterState(group, 'high', 0); // default state (survives the cell split): Monday's bag group out; the host re-applies per tier / day
  return { group, colliders: pb.colliders, clutter };
}
