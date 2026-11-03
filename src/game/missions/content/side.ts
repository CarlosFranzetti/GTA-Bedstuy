/** Three optional side jobs: a lost cat, a dollar-van fare, and a stoop sale. */
import type { MissionDef } from '../types';
import { facePoint, type PlaceCtx } from './places';

export function lostCat(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const kid = facePoint(grid, 'r3c0', 'E', 0.3);
  const hide = facePoint(grid, 'r3c0', 'W', 0.6);
  return {
    id: 'lost-cat',
    title: 'Lost Cat: Biscuit',
    tag: 'side',
    blurb: 'A kid on a stoop has lost a cat named Biscuit. There are crumbs of tuna leading nowhere.',
    giverPoi: 'daycare',
    giver: kid,
    triggerRadius: 3.5,
    timeLimit: 260,
    phoneIntro: { from: 'Tiana (age 9)', text: 'my cat is gone. he is gray and he is sad and he likes tuna. please. i have $6.' },
    failJoke: { timeUp: 'Biscuit has filed a missing-human report on you.' },
    followUp: { from: 'Tiana (age 9)', text: 'biscuit says thank you. he is sleeping on my homework.', delay: 60 },
    objectives: [
      {
        kind: 'collect', ordered: true, radius: 4, presence: 'onFoot', item: 'tuna crumb', text: 'Follow the tuna crumbs around the block',
        points: [facePoint(grid, 'r3c0', 'S', 0.85), facePoint(grid, 'r3c0', 'S', 0.4), facePoint(grid, 'r3c0', 'W', 0.9)],
        banter: ['A trail of tuna. Somebody is having a very organized afternoon.'],
      },
      { kind: 'pickUp', at: hide, radius: 4, presence: 'onFoot', items: ['Biscuit'], text: 'Scoop up Biscuit from behind the planter', doneMessage: 'Biscuit allows this. For now.' },
      { kind: 'deliver', at: kid, radius: 4, presence: 'onFoot', items: ['Biscuit'], text: 'Bring Biscuit back to Tiana' },
    ],
    reward: { cash: 80, message: 'Tiana pays you six dollars in nickels and a drawing of a cat with sunglasses.' },
    retryHint: 'Biscuit is hiding again',
  };
}

export function dollarVanFare(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const stop = facePoint(grid, 'r4c1', 'S', 0.5);
  const drop = facePoint(grid, 'r2c1', 'S', 0.7);
  return {
    id: 'dollar-van-fare',
    title: 'Dollar Van Fare',
    tag: 'side',
    blurb: 'Someone at the stop is waving at every car. Take a fare for a dollar-van-style drop.',
    giverPoi: 'auto',
    giver: stop,
    triggerRadius: 3.5,
    availableHours: [6, 21],
    timeLimit: 200,
    phoneIntro: { from: 'Dispatch', text: 'Fare on Greene. Do not take the highway. We do not have a highway.' },
    failJoke: { tooFast: 'The passenger grips the handle and recites a long list of things you should not do at speed.', timeUp: 'The fare gets out and walks. It is faster.' },
    followUp: { from: 'Dispatch', text: 'Customer review: "Would ride again." Do not let it go to your head.', delay: 60 },
    objectives: [
      { kind: 'enterVehicle', text: 'Get a vehicle: any car is a van if you believe' },
      { kind: 'pickUp', at: stop, radius: 6, presence: 'inVehicle', items: ['fare'], text: 'Pick up the fare at the Greene Ave stop', banter: ['Fare: "Radio. No. The other one. The one with the lady."'] },
      { kind: 'deliver', at: drop, radius: 6, presence: 'inVehicle', items: ['fare'], text: 'Drop the fare on Lafayette (gently)', maxKmh: 80, stayInVehicle: 12 },
    ],
    reward: { cash: 60, message: 'The fare tips you a dollar and a long story.' },
    retryHint: 'the fare is still waiting',
  };
}

export function stoopSale(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const owner = facePoint(grid, 'r0c0', 'E', 0.5);
  const boxes = facePoint(grid, 'r0c0', 'E', 0.35);
  const stoop = facePoint(grid, 'r0c0', 'N', 0.5);
  return {
    id: 'stoop-sale',
    title: 'Stoop Sale',
    tag: 'side',
    blurb: 'Ms. Greer is clearing out the apartment. Sell five things from the stoop before the afternoon shadows come.',
    giverPoi: 'rx',
    giver: owner,
    triggerRadius: 3.5,
    availableHours: [9, 18],
    timeLimit: 300,
    phoneIntro: { from: 'Ms. Greer', text: 'Everything must go! Toaster, lamp, a lava lamp, two plants, a mirror. Sell five things. Do not sell the lamp. That is the good lamp.' },
    twist: { at: 1, text: 'Customer number three is the person who gave Ms. Greer the lamp. She wants it back. She is paying double.' },
    failJoke: { timeUp: 'The sun sets on a stoop full of toasters. No one wanted the toasters.' },
    followUp: { from: 'Ms. Greer', text: 'The lamp is gone. I feel lighter. Also freer. Also I miss the lamp.', delay: 60 },
    objectives: [
      { kind: 'pickUp', at: boxes, radius: 4, presence: 'onFoot', items: ['stoop item', 'stoop item', 'stoop item', 'stoop item', 'stoop item'], text: "Grab the boxes from Ms. Greer's hallway", doneMessage: 'A lava lamp. A toaster. A lamp that says "good". Five items.' },
      { kind: 'sell', item: 'stoop item', count: 5, at: stoop, radius: 6, every: 4, text: 'Set up on the stoop and sell five items to passers-by', banter: ['"How much for the toaster?" "How much you got?"'] },
      { kind: 'goTo', at: owner, radius: 5, presence: 'onFoot', text: 'Bring the cash back to Ms. Greer' },
    ],
    reward: { cash: 90, message: 'Ms. Greer keeps the receipts. And the good lamp, which came back to her.' },
    retryHint: 'the stoop is open for business',
  };
}
