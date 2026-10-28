import type { MissionDef } from '../types';
import { facePoint, poiSpot, type PlaceCtx } from './places';

/**
 * Bodega Run: Troop Deli's order bag is for three stoops. Walk it or drive it, but the chopped cheese goes cold.
 * Starts at the deli door (no car needed); the whole run is on a clock.
 */
export function bodegaRun(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const door = poiSpot(ctx, 'troop-deli');
  const bag = 'bodega bag';
  const stoop = (blockId: string, side: 'N' | 'S' | 'E' | 'W', t: number) => facePoint(grid, blockId, side, t);
  return {
    id: 'bodega-run',
    title: 'Bodega Run',
    blurb: 'Three orders are up at Troop Deli. Get them to the stoops while they are still hot.',
    giverPoi: 'troop-deli',
    giver: door,
    triggerRadius: 4,
    timeLimit: 120,
    objectives: [
      { kind: 'timer', seconds: 3, text: 'Wait while the deli bags the order' },
      { kind: 'pickUp', at: door, radius: 5, presence: 'any', items: [bag, bag, bag], text: 'Grab the three bags at the counter', doneMessage: 'Three bags. Two sodas. One "extra napkins, please".' },
      { kind: 'deliver', at: stoop('r1c1', 'W', 0.55), radius: 5, presence: 'any', items: [bag], text: "Ms. Pearl's stoop on Throop Ave", doneMessage: 'Ms. Pearl: "You are a blessing. Tell your mother I said hi."' },
      { kind: 'deliver', at: stoop('r1c0', 'E', 0.45), radius: 5, presence: 'any', items: [bag], text: 'The 3rd-floor buzzer across the street (it is broken, yell)', doneMessage: 'A window opens, a wallet drops. Close enough.' },
      { kind: 'deliver', at: stoop('r1c1', 'S', 0.2), radius: 5, presence: 'any', items: [bag], text: "Big Lou's stoop on Kosciuszko St", doneMessage: 'Big Lou: "Still hot?" It was still hot.' },
    ],
    reward: { cash: 150, message: 'Mohammed throws in a free loosie of chopped cheese. Respect.' },
    retryHint: 'the cheese is cold, go back and re-bag it',
  };
}
