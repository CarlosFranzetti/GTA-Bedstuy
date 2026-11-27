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
import { picoAct1 } from './pedro/act1';

/** Off until the first act is finished and verified (see the note in `buildMissions`). */
/** Default off. `VITE_PEDRO=1` (or `true`) turns it on for tests and local runs: `VITE_PEDRO=1 npx vitest run tests/unit/game/story`. */
export const PEDRO_STORY_ON: boolean = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PEDRO ?? '') === '1' || ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PEDRO ?? '') === 'true';

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
    ...acts.extras,
    // LEAD, 27 Nov: the Pedro Martinez story, Act 1 (docs/story/ARC.md), was cut off by the usage limit part way. It stays out of the shipped
    // mission list until it is finished, wired (`setPicoHome`, the StoryBridge) and seen in the running game.
    ...(PEDRO_STORY_ON ? picoAct1(ctx) : []),
  ];
}
