import type { MissionDef } from '../types';
import { poiSpot, streetMid, type PlaceCtx } from './places';

/**
 * Laundromat Getaway: grab the duffel, take the heat (2 stars), and get it to the garage under Marcus Garvey
 * without ditching the car. No one gets hurt; it is a paperwork dispute about a wash-and-fold ticket.
 */
export function laundromatGetaway(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const door = poiSpot(ctx, 'komat');
  const waiting = poiSpot(ctx, 'komat', 14); // Tay waits a few doors down
  const garage = streetMid(grid, 'garvey', 'lafayette', 'vanburen');
  const bag = 'laundry bag';
  const KEEP_CAR = 8;
  return {
    id: 'laundromat-getaway',
    title: 'Laundromat Getaway',
    blurb: "Tay's duffel is behind the counter at KOSCIUSZ-K-O-MAT over a $14 wash-and-fold ticket. Grab it, then get it to the garage under Marcus Garvey. Keep the car.",
    giverPoi: 'komat',
    giver: waiting,
    triggerRadius: 4,
    timeLimit: 360,
    objectives: [
      { kind: 'pickUp', at: door, radius: 4, presence: 'onFoot', items: [bag], text: 'Grab the duffel at KOSCIUSZ-K-O-MAT', raiseWantedTo: 2, doneMessage: 'Somebody saw that. Two stars. Move.' },
      { kind: 'enterVehicle', text: 'Get in a car, any car' },
      { kind: 'escapeRadius', from: door, radius: 110, text: 'Put some blocks between you and the laundromat', stayInVehicle: KEEP_CAR },
      { kind: 'deliver', at: garage, radius: 9, presence: 'inVehicle', items: [bag], text: 'Roll into the garage under Marcus Garvey Blvd', stayInVehicle: KEEP_CAR },
      { kind: 'holdSpeedBelow', kmh: 4, seconds: 5, at: garage, radius: 12, text: 'Kill the engine and keep quiet', stayInVehicle: KEEP_CAR },
      { kind: 'loseWanted', text: 'Stay put until the heat dies down', stayInVehicle: KEEP_CAR },
    ],
    reward: { cash: 400, message: 'Tay: "You never saw me. I never saw you. The socks are yours."' },
    retryHint: 'the bag is back on the counter',
  };
}
