import type { BedstuyData, GridModel, Lot } from '@/world/types';
import type { MissionDef } from '../types';
import type { PlaceCtx } from './places';
import { bodegaRun } from './bodegaRun';
import { laundromatGetaway } from './laundromatGetaway';
import { blockParty } from './blockParty';
import { alternateSideShuffle, dollarVanLastRun, movingDay, permitPending, senatorTheCat, soundclash } from './city';
import { afterslothResidency, crateDigger, openDecks, thePassword } from './dj';
import { dollarVanFare, lostCat, stoopSale } from './side';
import { detectStoryFeatures, storyActs, type StoryFeatures } from './story';

export {
  bodegaRun, laundromatGetaway, blockParty, alternateSideShuffle, soundclash, senatorTheCat, dollarVanLastRun, movingDay,
  permitPending, crateDigger, openDecks, thePassword, afterslothResidency, lostCat, dollarVanFare, stoopSale,
};

/**
 * All shipped missions, with coordinates resolved from the world (pass `world.lots` so POI doors match the built lots).
 * Order matters: the phone's "next mission" pointer picks the first story mission on offer: the three openers, Act I of
 * "Air Rights" (docs/reference/STORY.md), the DJ chapters, Acts II and III, then the BIBLE concepts and the optional side jobs.
 * `features` says what lane WBURG's world has (el stations); the north mission is only built when it does.
 */
export function buildMissions(grid: GridModel, data: BedstuyData, lots?: readonly Lot[], features: StoryFeatures = detectStoryFeatures(grid, data)): MissionDef[] {
  const ctx: PlaceCtx = { grid, data, lots };
  const acts = storyActs(ctx, features);
  return [
    bodegaRun(ctx), laundromatGetaway(ctx), blockParty(ctx),
    ...acts.act1,
    crateDigger(), openDecks(ctx), thePassword(ctx), afterslothResidency(ctx),
    ...acts.act2, ...acts.act3,
    alternateSideShuffle(ctx), soundclash(ctx), senatorTheCat(ctx), dollarVanLastRun(ctx), movingDay(ctx), permitPending(ctx),
    lostCat(ctx), dollarVanFare(ctx), stoopSale(ctx),
  ];
}
