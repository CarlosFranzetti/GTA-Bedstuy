import type { MissionDef } from '../types';
import { poiSpot, streetMid, type PlaceCtx } from './places';

/**
 * Block Party: Auntie needs a speaker, ice and a folding table on Van Buren St before 20:00 game time.
 * Daytime job only (the party needs setting up), so it is offered 6am to 6pm.
 */
export function blockParty(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const auntie = poiSpot(ctx, 'oxtail');
  const party = streetMid(grid, 'vanburen', 'throop', 'garvey');
  return {
    id: 'block-party',
    title: 'Block Party',
    blurb: "Auntie's block party kicks off on Van Buren St at 8pm. She needs a speaker, ice and a folding table. Hurry.",
    giverPoi: 'oxtail',
    giver: auntie,
    triggerRadius: 4,
    deadlineHour: 20,
    availableHours: [6, 18],
    objectives: [
      { kind: 'pickUp', at: poiSpot(ctx, 'garvey-cutz'), radius: 5, presence: 'any', items: ['speaker'], text: 'Borrow the speaker from Garvey Cutz', doneMessage: 'The barber hands it over mid-fade. "Do not let it get wet."' },
      { kind: 'pickUp', at: poiSpot(ctx, 'dollar'), radius: 5, presence: 'any', items: ['folding table'], text: 'Grab a folding table at the 99c store', doneMessage: 'A folding table. It folds. Mostly.' },
      { kind: 'pickUp', at: poiSpot(ctx, 'liquor'), radius: 5, presence: 'any', items: ['ice'], text: 'Pick up the ice at Van Buren Wine & Liquor', doneMessage: 'Forty pounds of ice. Move fast, it is melting.' },
      { kind: 'deliver', at: party, radius: 14, presence: 'any', items: ['speaker', 'folding table', 'ice'], text: 'Set it all up on Van Buren St', doneMessage: 'The block cheers. Somebody starts a cookout.' },
    ],
    reward: { cash: 250, message: 'Auntie: "You are on the guest list for life, baby."' },
    retryHint: 'the party is still on, grab the stuff again',
  };
}
