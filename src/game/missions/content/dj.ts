/**
 * The DJ storyline, four chapters: Crate Digger (buy three records at Wax Deli), Open Decks (a two-minute set at the
 * block party), The Password (find the hidden door to Aftersloth by following a flyer trail at night) and Aftersloth
 * Residency (a four-minute set with a generator twist). Interior ids, record ids and flags live in djIds.ts.
 */
import type { MissionDef } from '../types';
import { facePoint, offset, streetMid, type PlaceCtx } from './places';
import {
  CRATE_RECORDS, FLAG_CLUB_SLOT, FLAG_CLUB_UNLOCKED, INTERIOR_CLUB, INTERIOR_DELI, SHOP_WAX_DELI, VENUE_BLOCKPARTY, VENUE_CLUB,
  clubDoor, deliDoor,
} from './djIds';

export function crateDigger(): MissionDef {
  const door = deliDoor();
  return {
    id: 'crate-digger',
    title: 'Crate Digger',
    blurb: 'Wax Deli sells sandwiches, heroes and, in the back, records. Ms. Odette wants to see what you pick.',
    giverPoi: 'wax-deli',
    giver: door,
    triggerRadius: 3,
    stake: 60,
    timeLimit: 480,
    phoneIntro: { from: 'Ms. Odette', text: 'You look like you can carry a crate. Come in, and spend what you have on three records: Throop Night Bus, Spin Cycle Love and Kickback On Kosciuszko. I will know if you cheat.' },
    twist: { at: 2, text: 'Ms. Odette does not ring you up at once. She looks at your records, then at you, then slides a flyer across the counter.' },
    failJoke: { timeUp: 'Ms. Odette: "Taste takes time. Yours is still loading."' },
    followUp: { from: 'Ms. Odette', text: "There is an open-decks slot at the block party. Evening. Don't be late and don't bring a laptop.", delay: 80 },
    objectives: [
      { kind: 'enterInterior', id: INTERIOR_DELI, at: door, radius: 4, text: 'Walk into WAX DELI' },
      { kind: 'buy', shop: SHOP_WAX_DELI, items: [...CRATE_RECORDS], at: door, text: 'Buy Throop Night Bus, Spin Cycle Love and Kickback On Kosciuszko', banter: ['Ms. Odette: "Nope. That one is a crime. The one next to it."'] },
      {
        kind: 'timer', seconds: 10, text: 'Ms. Odette wraps your records',
        banter: ['Ms. Odette: "Good. You do not buy what you like. You buy what you can mix."', 'Ms. Odette: "There is a night I will not name. There is a door I will not name. Go be seen first."'],
        banterEvery: 4,
      },
      { kind: 'exitInterior', id: INTERIOR_DELI, at: door, radius: 4, text: 'Head back outside', doneMessage: 'Records under your arm, a flyer in your pocket.' },
    ],
    reward: { cash: 80, message: 'Ms. Odette tucks a free sleeve into the bag. "On the house. This time."' },
    retryHint: 'the shop is still open',
  };
}

export function openDecks(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const party = streetMid(grid, 'vanburen', 'throop', 'garvey');
  const crew = facePoint(grid, 'r4c1', 'N', 0.62);
  const mama = offset(party, 6, -3);
  return {
    id: 'open-decks',
    title: 'Open Decks',
    blurb: "The block party has one set of decks and one open slot. Two minutes, and the street will tell you how you did.",
    giverPoi: 'dollar',
    giver: crew,
    triggerRadius: 3.5,
    requires: ['crate-digger'],
    availableHours: [12, 20],
    phoneIntro: { from: 'Mama Rue', text: 'Odette says you have ears. The party runs from seven. Come early, bring your records, and do not drop the needle on my cousin.' },
    twist: { at: 3, text: 'The decks belong to the only speaker on the block, and the whole street has stopped to watch. No pressure.' },
    failJoke: { lowScore: 'The crowd politely claps. Politely. Which is worse.' },
    followUp: { from: 'Mama Rue', text: 'Somebody from Aftersloth heard you. Look for the flyers after 11. Do not tell them I told you.', delay: 90 },
    objectives: [
      { kind: 'goTo', at: party, radius: 14, presence: 'any', text: 'Head to the block party on Van Buren St' },
      { kind: 'talkTo', at: mama, radius: 5, presence: 'onFoot', npc: 'Mama Rue', text: 'Check in with Mama Rue at the decks', lines: ['You must be the Wax Deli kid.', 'Two minutes. Keep the bass out of Mr. Pat\'s window.', 'The set goes on at seven. Evening, not early.'] },
      { kind: 'waitUntilHour', from: 19, to: 22, at: party, radius: 22, text: 'Wait for the party to fill up (seven in the evening)', banter: ['A cookout gets lit. Smoke and string lights.'] },
      { kind: 'djSet', venue: VENUE_BLOCKPARTY, minutes: 2, minScore: 60, at: party, radius: 10, text: 'Play a two-minute set on the block party decks (score 60+)' },
    ],
    reward: { cash: 200, message: 'Mama Rue hands you a plate of oxtail and a folded flyer.' },
    retryHint: 'the crowd is still waiting',
  };
}

export function thePassword(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const door = clubDoor();
  return {
    id: 'the-password',
    title: 'The Password',
    blurb: 'A flyer on a lamp post: a sloth, a time, no address. Follow the trail between 11pm and 4am.',
    giverPoi: 'funeral',
    giver: facePoint(grid, 'r2c1', 'N', 0.12),
    triggerRadius: 3,
    requires: ['open-decks'],
    availableHours: [22, 3],
    deadlineHour: 4,
    phoneIntro: { from: 'Unknown', text: 'Past eleven. Look up. Follow the sloth.' },
    twist: { at: 2, text: 'The flyer never had a password. It had a knock. Two short, one long, then nothing.' },
    failJoke: {
      clockUp: 'Sunrise. The door was never there. Neither was the club. Go to bed.',
      timeUp: 'You wandered Kosciuszko St until it was Tuesday.',
    },
    followUp: { from: 'DJ Sloth', text: "You're on the list. Show up for the residency set. Dress like you are not trying.", delay: 75 },
    setFlags: [FLAG_CLUB_UNLOCKED, FLAG_CLUB_SLOT],
    objectives: [
      { kind: 'waitUntilHour', from: 23, to: 4, at: facePoint(grid, 'r2c1', 'N', 0.12), radius: 25, text: 'Flyers only go up after 11pm. Wait near the lamp post.' },
      {
        kind: 'collect', ordered: true, radius: 4, presence: 'onFoot', item: 'flyer',
        points: [facePoint(grid, 'r1c1', 'S', 0.28), facePoint(grid, 'r2c1', 'N', 0.34), facePoint(grid, 'r1c1', 'S', 0.5)],
        text: 'Follow the flyers, lamp post to lamp post', banter: ['Each flyer points left. Then right. Then, rudely, left again.'],
      },
      { kind: 'interact', at: door, radius: 4, presses: 3, prompt: 'Knock: two short, one long', text: 'Find the unmarked door and knock', doneMessage: 'A slot slides. An eye looks. A latch drops.' },
    ],
    reward: { cash: 150, message: 'A voice from inside: "Residency starts at eleven. Do not be early."' },
    retryHint: 'the flyers are still there',
  };
}

export function afterslothResidency(ctx: PlaceCtx): MissionDef {
  const door = clubDoor();
  const yard = offset(door, -16, 0);
  void ctx;
  return {
    id: 'aftersloth-residency',
    title: 'Aftersloth Residency',
    blurb: 'Your first night on the Aftersloth decks. Four minutes, a crowd meter, and a booth that has seen things.',
    giverPoi: 'funeral',
    giver: door,
    triggerRadius: 3,
    requires: ['the-password'],
    availableHours: [18, 3],
    phoneIntro: { from: 'DJ Sloth', text: 'Eleven sharp. Two sets back to back. If the crowd leaves, they leave. If the power goes... the generator is in the yard.' },
    twist: { at: 3, text: 'Halfway through the set, the power cuts. The room goes black. Somebody screams "the generator!" It is a rumour of a generator.' },
    failJoke: { lowScore: 'The crowd goes to the bar next door. The bar next door is a vending machine.' },
    followUp: { from: 'DJ Sloth', text: 'Residency is yours. Thursdays. Bring spare needles and an alibi.', delay: 80 },
    objectives: [
      { kind: 'waitUntilHour', from: 23, to: 4, at: door, radius: 14, text: 'Wait outside until the club opens (11pm)' },
      { kind: 'enterInterior', id: INTERIOR_CLUB, at: door, radius: 4, text: 'Slip inside Aftersloth' },
      { kind: 'djSet', venue: VENUE_CLUB, minutes: 2, minScore: 50, text: 'Play the first two minutes on the club decks (keep the crowd up)' },
      { kind: 'exitInterior', id: INTERIOR_CLUB, at: door, radius: 4, text: 'The power is out. Get to the yard!' },
      { kind: 'interact', at: yard, radius: 5, presses: 6, prompt: 'Crank the generator', text: 'Restart the generator in the yard', banter: ['The generator coughs. Then spits. Then thinks about it.'], doneMessage: 'The generator catches. Somewhere inside, the crowd cheers.' },
      { kind: 'enterInterior', id: INTERIOR_CLUB, at: door, radius: 4, text: 'Back inside before they lose the room' },
      { kind: 'djSet', venue: VENUE_CLUB, minutes: 2, minScore: 60, text: 'Close the night with the second two minutes (score 60+)' },
    ],
    reward: { cash: 600, message: 'DJ Sloth hands you an envelope. "Do not count it in front of anyone."' },
    retryHint: 'the doorman still has your name',
  };
}
