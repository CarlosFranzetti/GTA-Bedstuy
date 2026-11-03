import type { BedstuyData, GridModel, Lot } from '@/world/types';
import type { MissionDef } from '../types';
import type { PlaceCtx } from './places';
import { bodegaRun } from './bodegaRun';
import { laundromatGetaway } from './laundromatGetaway';
import { blockParty } from './blockParty';
import { alternateSideShuffle, dollarVanLastRun, movingDay, permitPending, senatorTheCat, soundclash } from './city';
import { afterslothResidency, crateDigger, openDecks, thePassword } from './dj';
import { dollarVanFare, lostCat, stoopSale } from './side';

export {
  bodegaRun, laundromatGetaway, blockParty, alternateSideShuffle, soundclash, senatorTheCat, dollarVanLastRun, movingDay,
  permitPending, crateDigger, openDecks, thePassword, afterslothResidency, lostCat, dollarVanFare, stoopSale,
};

/**
 * All shipped missions, with coordinates resolved from the world (pass `world.lots` so POI doors match the built lots).
 * Order matters: the phone's "next mission" pointer picks the first story mission on offer, so the DJ chapters come
 * right after the three openers, then the BIBLE concepts, then the optional side jobs.
 */
export function buildMissions(grid: GridModel, data: BedstuyData, lots?: readonly Lot[]): MissionDef[] {
  const ctx: PlaceCtx = { grid, data, lots };
  return [
    bodegaRun(ctx), laundromatGetaway(ctx), blockParty(ctx),
    crateDigger(), openDecks(ctx), thePassword(ctx), afterslothResidency(ctx),
    alternateSideShuffle(ctx), soundclash(ctx), senatorTheCat(ctx), dollarVanLastRun(ctx), movingDay(ctx), permitPending(ctx),
    lostCat(ctx), dollarVanFare(ctx), stoopSale(ctx),
  ];
}
