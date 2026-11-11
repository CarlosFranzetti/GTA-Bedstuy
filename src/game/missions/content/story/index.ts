import type { MissionDef } from '../../types';
import type { PlaceCtx } from '../places';
import { backRent, handleWithCare, noticeOfIntent, publicComment } from './act1';
import { crateExpectations, fleeceVest, openHouse, repoTheRepo, walkDeeHome } from './act2';
import { boroughHallExpress, lastCallOnThroop, nightOfTheNarcan, smokeSignals } from './act3';
import { lastStopNorth, type StoryFeatures } from './north';

export { detectStoryFeatures, type StoryFeatures } from './north';
export {
  noticeOfIntent, publicComment, handleWithCare, backRent, fleeceVest, openHouse, walkDeeHome, repoTheRepo, crateExpectations,
  nightOfTheNarcan, smokeSignals, boroughHallExpress, lastCallOnThroop, lastStopNorth,
};

/** "Air Rights": act by act. The north mission only exists when the world has an el (see north.ts). */
export function storyActs(ctx: PlaceCtx, features: StoryFeatures = {}): { act1: MissionDef[]; act2: MissionDef[]; act3: MissionDef[] } {
  return {
    act1: [noticeOfIntent(ctx), publicComment(ctx), handleWithCare(ctx), backRent(ctx)],
    act2: [fleeceVest(ctx), openHouse(ctx), walkDeeHome(ctx), repoTheRepo(ctx), crateExpectations(ctx), ...(features.el ? [lastStopNorth(ctx, features.el)] : [])],
    act3: [nightOfTheNarcan(ctx), smokeSignals(ctx), boroughHallExpress(ctx), lastCallOnThroop(ctx)],
  };
}
