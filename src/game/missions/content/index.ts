import type { BedstuyData, GridModel, Lot } from '@/world/types';
import type { MissionDef } from '../types';
import type { PlaceCtx } from './places';
import { bodegaRun } from './bodegaRun';
import { laundromatGetaway } from './laundromatGetaway';
import { blockParty } from './blockParty';

export { bodegaRun, laundromatGetaway, blockParty };

/** All shipped missions, with coordinates resolved from the world (pass `world.lots` so POI doors match the built lots). */
export function buildMissions(grid: GridModel, data: BedstuyData, lots?: readonly Lot[]): MissionDef[] {
  const ctx: PlaceCtx = { grid, data, lots };
  return [bodegaRun(ctx), laundromatGetaway(ctx), blockParty(ctx)];
}
