/**
 * PICO, Act 1 "Open Decks" (docs/story/ARC.md, docs/story/missions/ACT1-*.md). Eight missions in the existing mission format.
 * Everything uses existing objective kinds plus `scene` (reply-picker scenes run by the StoryBridge). Money moves two ways: the
 * mission's own `stake` / `reward`, and the bridge (gig fee, resale prices) through the hooks in ./hooks.ts.
 * Dialogue here is condensed from the writer's pages; the pages stay the source of truth for the full lines.
 * PLACEHOLDERS (named so they can be swapped): positions that stand in for places the map does not have yet are marked PLACEHOLDER.
 */
import type { Vec2 } from '@/core/Math2';
import type { MissionDef } from '../../types';
import { offset, poiSpot, type PlaceCtx } from '../places';
import { INTERIOR_DELI, SHOP_WAX_DELI, deliDoor } from '../djIds';
import { venuePoint } from '@/game/story/venueTable';

/** Where Yesenia's stoop is (the player's home). The host sets it once with the real HOME; until then a street POI stands in. */
let home: Vec2 | null = null;
export const setPicoHome = (p: Vec2 | null): void => { home = p; };

/** Two records the bridge sells at WAX DELI for the rent. PLACEHOLDER ids: the writer's "Cumbia del Malecon" and "Salsa Para Lavar Platos" are not in records.ts yet. */
export const PICO_RENT_RECORDS = ['wax-03', 'wax-04'] as const;

export const PICO_IDS = ['pico-rent-money', 'pico-lunes-night', 'pico-paper-the-walls', 'pico-clems-corner', 'pico-size-medium', 'pico-second-wind', 'pico-not-a-date', 'pico-warm-up-slot'] as const;

const v = (id: string): Vec2 => venuePoint(id);

export function picoRentMoney(c: PlaceCtx): MissionDef {
  const stoop = home ?? offset(poiSpot(c, 'troop-deli'), 16, 12); // PLACEHOLDER until the host gives the real HOME
  const door = deliDoor();
  return {
    id: 'pico-rent-money', title: 'Rent Money', act: 1, tag: 'story', stake: 120, availableHours: [9, 20], deadlineHour: 20,
    blurb: 'An envelope that says RENT, a record shop that texts the whole block. Just to look.',
    giverPoi: 'home', giver: stoop, triggerRadius: 5,
    phoneIntro: { from: 'Yesenia', text: 'The envelope says RENT. Do not make me say it twice.' },
    failJoke: { clockUp: 'WAX DELI opens at nine and shuts at eight. The rent is still in the envelope. Who are you?' },
    followUp: { from: 'Yesenia', text: 'The landlord moved it to Friday. You have until Friday. Do not tell me anything. I can feel it from here.', delay: 6 },
    setFlags: ['pico.rentMoney.done', 'pico.rafa.number'],
    objectives: [
      { kind: 'talkTo', at: stoop, radius: 4, npc: 'Yesenia', text: 'Take the envelope from Yesenia', lines: ['Pedro. Look at me. This is the envelope. What does it say on it?', 'R-E-N-T. And what does it not say? Records. Good. The landlord comes at six.', 'You said that in March. I love you. Do not make me sell your couch. It is your couch? That is why I can sell it.'] },
      { kind: 'timer', seconds: 6, text: 'Read the text from WAX DELI', say: [{ who: 'Ms. Odette', text: 'Collector\'s estate in today. Latin, disco, two crates of things I cannot pronounce. Come early. O.' }] },
      { kind: 'goTo', at: door, radius: 5, presence: 'onFoot', text: 'Walk to WAX DELI. Just to look.', banter: ['Pedro: Just to look.', 'Pedro: Hands in pockets. Like a gentleman.'], banterEvery: 12 },
      { kind: 'enterInterior', id: INTERIOR_DELI, at: door, radius: 4, text: 'Walk in', say: [{ who: 'Ms. Odette', text: 'Good morning. You have the face. The face of a man holding an envelope.' }] },
      { kind: 'buy', shop: SHOP_WAX_DELI, items: [...PICO_RENT_RECORDS], at: door, text: 'Browse the Latin bin and buy two records', banter: ['Pedro: Ninety dollars? For this, ninety is a gift.', 'Ms. Odette: That one is fifty. You are reading the price of the frame.'], banterEvery: 9 },
      { kind: 'scene', scene: 'sleeve', at: door, radius: 6, presence: 'any', prompt: 'Look at the disco sleeve', text: 'Look at the sleeve of "Brooklyn Lights" (or put it back)', outcomes: { read: ['pico.sleeveCredit'], skip: [] }, doneMessage: 'Bass: Clement Ashy. Ms. Odette: "Ashby. They spelled him wrong."' },
      { kind: 'talkTo', at: door, radius: 5, presence: 'any', npc: 'Ms. Odette', text: 'Pay Ms. Odette', lines: ['One hundred and ten. Exactly what is in your envelope, minus ten.', 'I will not lecture you. Your cousin will. I will give you a number instead: Rafa, at Sabor a Lunes. He needs somebody for Monday.', 'Nobody goes out on a Monday? That is why he needs somebody. Go be somebody.'] },
      { kind: 'exitInterior', id: INTERIOR_DELI, at: door, radius: 4, text: 'Head back outside' },
    ],
    reward: { cash: 0, message: 'Two records, ten dollars, zero regrets. Yet.' },
    retryHint: 'the shop is still open',
  };
}

export function picoLunesNight(c: PlaceCtx): MissionDef {
  const bar = v('bar-dance');
  return {
    id: 'pico-lunes-night', title: 'Lunes Night', act: 1, tag: 'story', requires: ['pico-rent-money'], availableHours: [12, 20], deadlineHour: 23,
    blurb: 'Monday at Sabor a Lunes: bring the crate, wait for nine, play the room.',
    giverPoi: 'deli', giver: offset(deliDoor(), 20, 14), triggerRadius: 6,
    phoneIntro: { from: 'Rafa', text: 'Pedro? Odette gave me your number. Bring the records. Monday, nine. The dancers do not forgive.' },
    followUp: { from: 'Stavros', text: 'My friend! Rafa says you made Doña Carmen put her shoes back on. Call me. Beautiful.', delay: 90 },
    failJoke: { timeUp: 'Rafa plays the congas for two hours. Alone. He had a great night.', cargoBroken: 'Rafa: You broke the records before the party. That is a new one.', lowScore: 'The dancers sit down. Doña Carmen takes off her shoes. That is the end.' },
    fragile: { label: 'Records', hp: 3 },
    objectives: [
      { kind: 'timer', seconds: 5, text: 'Answer Rafa\'s call' },
      { kind: 'goTo', at: bar, radius: 7, presence: 'any', cargo: true, text: 'Get your crate to Sabor a Lunes' },
      { kind: 'talkTo', at: bar, radius: 6, presence: 'any', npc: 'Rafa', text: 'Talk to Rafa at the bar', lines: ['The decks are in the back booth. The room wants salsa, cumbia, boogaloo, merengue. Nothing after 1995.', 'If you play a techno record, I will not have you killed. I will just ask you to leave.'] },
      { kind: 'waitUntilHour', from: 21, to: 23, at: bar, radius: 14, text: 'Wait until nine' },
      { kind: 'djSet', venue: 'bar-dance', minutes: 3, minScore: 40, at: bar, radius: 14, text: 'Play a three-minute set', banter: ['Rafa: Nobody leaves the floor. Nobody.'] },
      { kind: 'talkTo', at: bar, radius: 8, presence: 'any', npc: 'Rafa', text: 'Talk to Rafa after the set', lines: ['Ninety dollars. And whatever the room tipped.', 'Monday. Every Monday. We will see.'] },
    ],
    reward: { cash: 0, message: 'First paid gig in New York. Pedro photographs the money.' },
    retryHint: 'Rafa holds the booth till nine',
  };
}

export function picoPaperTheWalls(c: PlaceCtx): MissionDef {
  const club = v('club');
  const yard = offset(club, -22, 14); // PLACEHOLDER: Stavros's sound yard, a garage near Mothhouse
  const avenue = offset(club, 75, 10);
  const boards = [offset(club, 40, 30), offset(club, 90, -10), offset(club, 120, 20), offset(club, -60, 40), offset(club, -100, 10)];
  const wall = offset(club, 8, -6); // PLACEHOLDER for `club:sidedoor`
  return {
    id: 'pico-paper-the-walls', title: 'Paper the Walls', act: 1, tag: 'story', requires: ['pico-lunes-night'],
    blurb: 'Stavros has a Friday to fill. Twenty flyers, six posters, three avenues.',
    giverPoi: 'club', giver: yard, triggerRadius: 6,
    phoneIntro: { from: 'Stavros', text: 'Pedro, my friend. Come to the garage. Paper, paper, paper. Beautiful.' },
    failJoke: { lowScore: 'Twenty flyers, eight people. Stavros calls it "a soft launch".', copsCalled: 'Stavros: Why are there police? Flyers are paper, my friend.' },
    followUp: { from: 'Stavros', text: 'Photo received. Beautiful. Mothhouse looks like it has a new face. Do not read the side wall.', delay: 20 },
    setFlags: ['pico.signCovered'],
    objectives: [
      { kind: 'talkTo', at: yard, radius: 5, npc: 'Stavros', text: 'Get flyers and posters from Stavros', grant: ['flyers', 'posters'], lines: ['Twenty flyers, six posters. Friday is the night. Your name is on it, very small, at the bottom.', 'Adults only on the flyers, my friend. Kids do not buy tickets. Beautiful. Go.'] },
      { kind: 'sell', item: 'flyer', count: 12, at: avenue, radius: 45, every: 7, failIfStars: 2, text: 'Hand out flyers to passers-by (F)' },
      { kind: 'spots', points: boards, radius: 5, presence: 'onFoot', prompt: 'Paste poster', item: 'poster', text: 'Paste five posters on the marked boards' },
      { kind: 'spots', points: [wall], radius: 6, presence: 'onFoot', prompt: 'Paste poster', item: 'poster', text: 'Last board: Mothhouse', say: [{ who: 'Pedro', text: 'This one has a cardboard sign on it. Somebody lettered it by hand. It will be fine.' }] },
      { kind: 'interact', at: wall, radius: 8, prompt: 'Text Stavros the photo', text: 'Text Stavros a photo', doneMessage: 'Stavros: Beautiful. Beautiful. Forty now, twenty next time.' },
    ],
    reward: { cash: 40, message: 'Paper on the walls. Your name is very small at the bottom. It is there. (Forty now, twenty next time.)' },
    retryHint: 'a new bag of paper',
  };
}

export function picoClemsCorner(c: PlaceCtx): MissionDef {
  const wall = offset(v('club'), 8, -6); // PLACEHOLDER for `club:sidedoor`
  const shop = poiSpot(c, 'troop-deli');
  return {
    id: 'pico-clems-corner', title: "Clem's Corner", act: 1, tag: 'story', requires: ['pico-paper-the-walls'], availableHours: [18, 26],
    blurb: 'The posters went over somebody\'s sign. Somebody has your bag.',
    giverPoi: 'club', giver: wall, triggerRadius: 6,
    phoneIntro: { from: 'Stavros', text: 'Pedro, my friend, a small thing at the side wall. Somebody is upset about a sign. Go say hello. Beautiful.' },
    failJoke: { timeUp: 'The line outside already has its phones out. Somebody is filming. Of course somebody is filming.' },
    followUps: [
      { from: 'Stavros', text: 'Where are my flyers? Twenty dollars off the pay, my friend. Where are my flyers?', delay: 20, ifFlag: 'pico.clem.walked' },
      { from: 'Clem', text: 'Put the corner on the paper. Spell it right.', delay: 40, ifFlag: 'pico.clem.talked' },
    ],
    objectives: [
      { kind: 'goTo', at: wall, radius: 6, presence: 'onFoot', text: 'Walk up to the wall', beat: { letterbox: 3 }, say: [{ who: 'Clem', text: 'Dolores lettered that sign. Paste your paper on your own wall.' }] },
      { kind: 'scene', scene: 'clem', at: wall, radius: 14, presence: 'onFoot', prompt: 'Talk to Clem', text: 'Talk to Clem (or walk away)', say: [{ who: 'Clem', text: 'Two years on this corner. Nobody asks me anything but to move.' }, { who: 'Pedro', text: 'Easy. Easy, señor. Tell me about the sign.' }], outcomes: { talked: ['pico.clem.talked'], won: ['pico.clem.fought'], lost: ['pico.clem.fought'], walkedAway: ['pico.clem.walked'] } },
      { kind: 'fork', id: 'clem-sign', text: 'Fix the sign', when: { flag: 'pico.clem.talked' }, options: [
        { label: 'Buy him a new sign ($15, Troop Deli)', at: shop, radius: 5, flag: 'pico.clem.newSign', cash: -15, doneMessage: 'Cardboard and two markers. He will want the good one.' },
        { label: 'Put his corner on the flyers', at: wall, radius: 5, flag: 'pico.clem.onFlyer', doneMessage: "CLEM'S CORNER, printed small at the bottom of every flyer." },
      ] },
      { kind: 'escapeRadius', from: wall, radius: 60, timeLimit: 45, when: { flag: 'pico.clem.fought' }, text: 'Get away from the line\'s phones', doneMessage: 'There is a video. It has a song on it that is not yours.' },
    ],
    reward: { cash: 0, message: 'Clem is not a punchline. Remember that.' },
    retryHint: 'Clem is still at the wall',
  };
}

export function picoSizeMedium(c: PlaceCtx): MissionDef {
  const hospital = poiSpot(c, 'funeral'); // PLACEHOLDER for Wexcombe Medical Center
  const thrift = poiSpot(c, 'church');    // PLACEHOLDER for Second Act Thrift (St. Osric's basement)
  const stoop = poiSpot(c, 'dollar');
  const park = poiSpot(c, 'liquor');
  const lounge = v('bar-lounge');
  const stoopHome = home ?? poiSpot(c, 'troop-deli');
  return {
    id: 'pico-size-medium', title: 'Size Medium, Vintage', act: 1, tag: 'story', requires: ['pico-clems-corner'], availableHours: [9, 17], stake: 40,
    deadlineHour: 17,
    blurb: 'Rent is Friday. Lana has a rack, a truck-shaped hole and opinions.',
    giverPoi: 'thrift', giver: offset(thrift, 17, 13), triggerRadius: 8,
    phoneIntro: { from: 'Yesenia', text: 'Friday. One hundred ten. Lana says you have an eye. I say you have an envelope.' },
    followUp: { from: 'Lana', text: 'You have a good eye for people and a bad eye for collars. Call me when you have the truck again.', delay: 60 },
    failJoke: { clockUp: 'Lana: The church closes at five. God keeps office hours.', lowScore: 'Lana: You sold a 1994 jacket to the 2019 people. Again.' },
    setFlags: ['pico.flip.ok'],
    objectives: [
      { kind: 'talkTo', at: hospital, radius: 5, npc: 'Adele', when: { flag: 'pico.clem.fought' }, text: 'Hear Adele out at Wexcombe', lines: ['Hold still. Which hand?', 'It is not broken. It is embarrassed.', 'Come back if it swells. Go home.'] },
      { kind: 'goTo', at: thrift, radius: 8, presence: 'any', text: 'Get to Second Act Thrift' },
      { kind: 'talkTo', at: thrift, radius: 6, npc: 'Lana', text: 'Talk to Lana on the steps', lines: ['I need a truck. You need rent. Forty is a loan, not a gift. Write it down.', 'Four pieces. Under fifty. Look at the zips, not the labels.'] },
      { kind: 'interact', at: thrift, radius: 6, prompt: 'Browse the rack', text: 'Browse the rack and buy up to four pieces', doneMessage: 'Four pieces in a church bag. Lana squints at each one.' },
      { kind: 'scene', scene: 'haggle:stall', at: park, radius: 8, prompt: 'Sell to the vintage van', presence: 'onFoot', text: 'Sell at the vintage van by the park' },
      { kind: 'scene', scene: 'haggle:friend', at: stoop, radius: 8, prompt: 'Sell to the stoop', presence: 'onFoot', text: 'Sell at the stoop' },
      { kind: 'scene', scene: 'haggle:club', at: lounge, radius: 10, prompt: 'Sell to the line', presence: 'onFoot', text: "Sell outside Tincture & Ledger" },
      { kind: 'pay', at: thrift, radius: 8, amount: 40, prompt: 'Pay Lana back', text: 'Pay Lana back forty', presence: 'any' },
      { kind: 'pay', at: stoopHome, radius: 8, amount: 110, prompt: 'Pay Yesenia the rent', text: 'Pay Yesenia the rent', presence: 'any', doneMessage: 'Rent paid. Lana says your jacket is still a mistake.' },
    ],
    reward: { cash: 0, message: 'Rent paid. Whatever is left is yours.' },
    retryHint: 'the rack restocks tomorrow',
  };
}

export function picoSecondWind(c: PlaceCtx): MissionDef {
  const club = v('club'), gym = v('gym');
  const yard = offset(club, -22, 14); // PLACEHOLDER for Stavros's sound yard
  return {
    id: 'pico-second-wind', title: 'Second Wind', act: 1, tag: 'story', requires: ['pico-clems-corner'], availableHours: [9, 20],
    blurb: 'Stavros\'s speakers for Akira\'s open house, and two rounds in the ring.',
    giverPoi: 'club', giver: offset(yard, 17, -15), triggerRadius: 6,
    deadlineHour: 20,
    phoneIntro: { from: 'Stavros', text: 'My friend, I rented speakers to Akira for his open house and my truck is dead. Carry them? Beautiful.' },
    failJoke: { clockUp: 'Akira locks the gym at eight. The speakers sleep in the yard. Stavros calls it a soft launch.' },
    followUps: [{ from: 'Akira', text: 'Saw the video. Come in Tuesday. Hands, not feet.', delay: 25, ifFlag: 'pico.clem.fought' }],
    objectives: [
      { kind: 'pickUp', at: yard, radius: 5, presence: 'any', items: ['speakers'], prompt: 'Load the speakers', text: 'Load the rented speakers', say: [{ who: 'Stavros', text: 'Handle with love, my friend. They are rented, and so is my house.' }] },
      { kind: 'deliver', at: gym, radius: 8, presence: 'any', items: ['speakers'], text: 'Carry them to Second Wind Boxing Club' },
      { kind: 'scene', scene: 'spar', at: gym, radius: 10, presence: 'onFoot', prompt: 'Step into the ring', text: 'Spar two rounds with Akira' },
      { kind: 'talkTo', at: gym, radius: 10, presence: 'onFoot', npc: 'Akira', text: 'Talk to Akira', lines: ['The best fight is the one you leave with your hands in your pockets.', 'Tuesdays. Bring your own tape.'] },
    ],
    reward: { cash: 40, message: 'The gym is open to you. Pockets.' },
    retryHint: 'the speakers are still in the yard',
  };
}

export function picoNotADate(c: PlaceCtx): MissionDef {
  const margo = v('bar-dive'), remy = v('club');
  return {
    id: 'pico-not-a-date', title: 'Coffee, Not a Date', act: 1, tag: 'story', requires: ['pico-size-medium'], availableHours: [12, 22],
    blurb: 'Two people have your number and a reason to use it. Both are adults. Pick one, or neither.',
    giverPoi: 'bar-dive', giver: margo, triggerRadius: 8,
    deadlineHour: 22,
    phoneIntro: { from: 'Margo', text: 'Coffee. Not a date. The park, two o\'clock. Bring the book answer. (Remy: sound check at five, bring cables.)' },
    failJoke: { clockUp: 'Two people waited. One read a book. One coiled a cable. Both were very gracious about it.' },
    followUps: [{ from: 'Margo', text: 'Tuesday. Come by the bar. Bring the book answer.', delay: 20, ifFlag: 'pico.date.margo' }, { from: 'Remy', text: 'I found a cable that does not hum. Come see.', delay: 20, ifFlag: 'pico.date.remy' }],
    objectives: [
      { kind: 'fork', id: 'who', text: 'Who do you call?', say: [{ who: 'Pedro', text: 'Two numbers in my phone and neither is a date. Coffee is not a date.' }, { who: 'Yesenia', text: 'Say it again, prima. Slower.' }, { who: 'Pedro', text: 'It is coffee. Coffee has no plot.', at: 4 }], options: [
        { label: 'Margo, at Glenda\'s Long Room', at: margo, radius: 6, flag: 'pico.date.margo' },
        { label: 'Remy, at Mothhouse', at: remy, radius: 6, flag: 'pico.date.remy' },
        { label: 'Nobody tonight', at: offset(margo, 14, 6), radius: 4, flag: 'pico.date.none' },
      ] },
      { kind: 'scene', scene: 'date:margo', at: margo, radius: 8, presence: 'onFoot', prompt: 'Sit down', when: { flag: 'pico.date.margo' }, text: 'Coffee with Margo', outcomes: { warm: ['pico.margo.warm'], friendly: [], cold: [], stoodUp: [] } },
      { kind: 'scene', scene: 'date:remy', at: remy, radius: 8, presence: 'onFoot', prompt: 'Sit down', when: { flag: 'pico.date.remy' }, text: 'Sound check with Remy', outcomes: { warm: ['pico.remy.warm'], friendly: [], cold: [], stoodUp: [] } },
    ],
    reward: { cash: 0, message: 'Whatever that was, it was not a date.' },
    retryHint: 'they can wait one more evening',
  };
}

export function picoWarmUpSlot(c: PlaceCtx): MissionDef {
  const club = v('club');
  return {
    id: 'pico-warm-up-slot', title: 'Warm-Up Slot', act: 1, tag: 'story', requires: ['pico-second-wind', 'pico-not-a-date'], availableHours: [12, 22], deadlineHour: 26,
    blurb: 'Mothhouse, a Friday warm-up, five names and a man in a fleece vest.',
    giverPoi: 'club', giver: offset(club, -26, -22), triggerRadius: 8,
    phoneIntro: { from: 'Stavros', text: 'Friday. The booth. You warm up the room, you do not peak it. Beautiful. Bring five names.' },
    followUps: [
      { from: 'Stavros', text: 'A hundred next month, my friend. I forgot. You know how it is.', delay: 30 },
      { from: 'Whit', text: 'Pedro! Whit, Plush. We do last-mile wellness for the urban explorer. Coffee? Pitch deck attached. Warm regards.', delay: 60 },
    ],
    failJoke: { lowScore: 'The room stays empty. Kyle checks his watch. Stavros smiles with his teeth.' },
    setFlags: ['pico.plush.offered', 'story.pico.act2'],
    objectives: [
      { kind: 'goTo', at: club, radius: 8, presence: 'onFoot', text: 'Get to Mothhouse' },
      { kind: 'scene', scene: 'guestlist', at: club, radius: 10, presence: 'onFoot', prompt: 'Give the door your list', text: 'Give the door five names', outcomes: { listed: [] } },
      { kind: 'djSet', venue: 'club', minutes: 4, minScore: 45, at: club, radius: 14, text: 'Play a four-minute warm-up. Do not peak the room.', banter: ['Stavros: Easy. Easy. Let them arrive.'] },
      { kind: 'talkTo', at: club, radius: 10, presence: 'onFoot', npc: 'Stavros', text: 'Talk to Stavros', lines: ['Kyle, this is Pedro. Pedro, Kyle. Kyle is the money. Beautiful.', 'The Friday is yours. Next month. The month after is also next month.', 'Whit? He does wellness. Do not ask. He will ask you.'] },
    ],
    reward: { cash: 50, message: 'Fifty now. The other hundred is "next month".' },
    retryHint: 'the booth is still warm',
  };
}

/**
 * The eight missions. `others` are the missions already in the game: a giver ring that lands on (or within a few metres of) one of
 * theirs, or on another Pedro ring, is walked away along a fixed spiral until it is clear. The placeholder positions share
 * sidewalks with existing places, and on the real map `offset` snaps to the same sidewalk, so clearance is checked on the built values.
 */
export function picoAct1(c: PlaceCtx, others: readonly Pick<MissionDef, 'giver' | 'triggerRadius'>[] = []): MissionDef[] {
  const out = [picoRentMoney(c), picoLunesNight(c), picoPaperTheWalls(c), picoClemsCorner(c), picoSizeMedium(c), picoSecondWind(c), picoNotADate(c), picoWarmUpSlot(c)];
  const taken: Array<Pick<MissionDef, 'giver' | 'triggerRadius'>> = [...others];
  const STEPS: Array<[number, number]> = [[12, 0], [0, 12], [-12, 0], [0, -12], [18, 12], [-18, 12], [18, -12], [-18, -12], [26, 0], [0, 26], [-26, 0], [0, -26]];
  for (const d of out) {
    const base = d.giver;
    const clear = (p: Vec2): boolean => taken.every((t) => Math.hypot(p.x - t.giver.x, p.z - t.giver.z) > d.triggerRadius + t.triggerRadius + 3 && Math.hypot(p.x - t.giver.x, p.z - t.giver.z) > 12);
    let p = base;
    for (let k = 0; k < STEPS.length && !clear(p); k++) p = offset(base, STEPS[k][0], STEPS[k][1]);
    d.giver = p;
    taken.push(d);
  }
  return out;
}
