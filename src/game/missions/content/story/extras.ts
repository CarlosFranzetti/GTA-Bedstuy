/**
 * STORY2: ten more jobs for "Air Rights". All `tag: 'side'` (the phone's story pointer never lands on them), all tied to the
 * arc by `requires` only (never by flags), and none of them gates an ending. They use the objective kinds the game already has:
 * driving, tailing, foot chases, deliveries, the el, the DJ decks, shop errands, the phone, wanted stars, day and night.
 *
 * Tone: satire aimed at landlords, developers, founders, wellness cults and the city's forms; the neighbourhood's people are
 * the heart of every one of them, never the joke. A few are dark on purpose (heat that is "rebalanced", a detector with no
 * battery, a funeral for a woman whose apartment is already "original character").
 *
 * How each starts: STREET = a person on the street at the giver ring; PHONE = a thread text (story/threads.ts) tells you where
 * to go, the ring is at the place she names. Both read the same: walk into the ring, the phone gets the intro, the job begins.
 */
import type { Vec2 } from '@/core/Math2';
import { F } from '@/game/story/flags';
import type { MissionDef } from '../../types';
import { corner, facePoint, footRoute, offset, poiSpot, streetAt, streetMid, type PlaceCtx } from '../places';
import { VENUE_BLOCKPARTY } from '../djIds';
import type { StoryFeatures } from './north';

/** Ids of the ten, in the order they are listed (tests, the log and STORY.md read this). */
export const STORY2_IDS = [
  'moisture-event', 'founder-mode', 'red-tape-relay', 'carbon-copy', 'the-binder',
  'gavel-to-gavel', 'pigeon-post', 'van-man', 'silent-retreat', 'slow-roll',
] as const;

// ---------------------------------------------------------------------------------------------------------------- 1 STREET

/** Act I. A landlord's notices, a stoop, a woman in a coat indoors. Foot deliveries and a small fork. */
export function moistureEvent(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const crate = facePoint(grid, 'r2c0', 'W', 0.55);
  const doors = [0.1, 0.22, 0.78].map((t) => facePoint(grid, 'r2c0', 'W', t));
  const cordy = facePoint(grid, 'r2c0', 'W', 0.45);
  return {
    id: 'moisture-event', title: 'A Moisture Event', act: 1, tag: 'side', requires: ['notice-of-intent'], availableHours: [8, 19],
    blurb: 'The super has "transitioned to opportunities". Mr. Pemberton\'s notices are in a milk crate. Somebody has to put them under doors.',
    giverPoi: 'komat', giver: crate, triggerRadius: 4, timeLimit: 260,
    phoneIntro: { from: 'Pemberton', text: 'RE: RE: Courier opportunity. Please deliver the enclosed Notices of Seasonal Rebalancing to units 1B through 3A. Do not use the word "leak". Do not make eye contact with the moisture. Payment on completion, by portal.' },
    failJoke: { timeUp: 'The notices go back in the crate. A neighbour reads one aloud, in a very good impression of a man who is never in the building.' },
    followUps: [
      { from: 'Pemberton', text: 'NOTICE 10: Your courier work has been billed to the building as "community engagement" and split across all 24 units. Thank you for engaging.', delay: 70, ifFlag: F.S_NOTICES_DELIVERED },
      { from: 'Miss Cordy', text: 'Voicemail (0:39): "Baby? Cordelia, 2A. Somebody put a paper boat in my planter. Nicest thing a landlord ever did. I know it was not the landlord."', delay: 70, ifFlag: F.S_NOTICES_BINNED },
    ],
    twist: { at: 2, text: 'The last door opens before you knock: a woman in a winter coat, indoors, a binder on her lap as thick as a phone book.' },
    objectives: [
      {
        kind: 'pickUp', at: crate, radius: 4, presence: 'onFoot', items: ['Notice of Seasonal Rebalancing'], text: 'Take the stack of notices from the milk crate',
        doneMessage: 'Four notices, one staple and a sticky note that says "ask no questions" in a font that asks questions.',
        say: [{ who: 'Pemberton', text: 'Hello. This is an automated courier. You are the automation.' }],
      },
      {
        kind: 'spots', points: doors, radius: 5, presence: 'onFoot', prompt: 'Slide the notice under the door', item: 'delivered notice', timeLimit: 170,
        text: 'Slide a notice under the doors of 1B, 1C and 3A',
        banter: ['1B has a mat that says LEAVE. It is not a threat. It is a job posting.', '1C has taped the last notice to the door, upside down, with a note: "Received. Not believed."'],
        say: [{ who: 'Neighbour', text: 'Another one? I have a drawer of these. The drawer is a fire hazard.' }],
      },
      {
        kind: 'talkTo', at: cordy, radius: 5, presence: 'onFoot', npc: 'Miss Cordy', text: 'Knock on 2A, where the door opens before you do',
        lines: [
          'Read it to me, baby. My glasses are in the other coat. The other coat is in the other apartment, which is also this apartment.',
          '"Seasonal rebalancing of thermal services." Mm. That is how I know it is November.',
          'Forty-six years in 2A. Every year a new word for cold. In 1989 it was "conservation". In 2003 it was "a journey".',
          'I keep them all in the Binder. The Binder does not forget. I do. So I write it down, and then I write down that I wrote it down.',
        ],
      },
      {
        kind: 'fork', id: 'notice-fork', presence: 'onFoot', text: 'Decide what happens to the last notice (walk into a ring, press F)',
        options: [
          { label: 'Slide the last notice under her door (the courier fee, $60)', at: facePoint(grid, 'r2c0', 'W', 0.33), radius: 3, flag: F.S_NOTICES_DELIVERED, cash: 60, doneMessage: 'You slide it under. It goes in with the sound of every notice before it.' },
          { label: 'Fold it into a paper boat and set it afloat in the planter', at: facePoint(grid, 'r2c0', 'W', 0.58), radius: 3, flag: F.S_NOTICES_BINNED, doneMessage: 'A boat. It floats in a puddle of the building\'s own moisture event. It is seaworthy.' },
        ],
      },
      { kind: 'goTo', at: crate, radius: 6, presence: 'onFoot', text: 'Sign the courier sheet back at the crate', say: [{ who: 'Pemberton', text: 'Thank you for your service. Your service has been recorded and may be used in a proceeding.' }] },
    ],
    reward: { cash: 150, message: 'Pemberton (automated): "Payment issued. Do not reply. This inbox is monitored by neither a human nor a dog."' },
    retryHint: 'the crate is still on the stoop',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 2 PHONE

/** Act I. A founder's pitch that keeps pivoting. Driving, a stoop run, a copy shop and a bill. */
export function founderMode(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const office = poiSpot(ctx, 'condo', 30);
  const stoops = [facePoint(grid, 'r0c0', 'E', 0.3), facePoint(grid, 'r1c0', 'E', 0.7), facePoint(grid, 'r1c0', 'S', 0.3)];
  const copy = facePoint(grid, 'r3c1', 'W', 0.65);
  return {
    id: 'founder-mode', title: 'Founder Mode', act: 1, tag: 'side', requires: ['public-comment'], availableHours: [10, 19], stake: 40,
    blurb: 'Garrett has a stack of cards, three stoops to hit and a pitch that is changing as you read it. Drive. Do not ask what the product is.',
    giverPoi: 'condo', giver: office, triggerRadius: 4, timeLimit: 340,
    phoneIntro: { from: 'Garrett', text: 'hey!! Garrett from BlockBlock. we are a hyperlocal stoop-liquidity protocol. i need a driver for a soft launch: one stack of cards, three stoops, comp in equity-adjacent value. LMK, i am in a flow state' },
    twist: { at: 3, text: 'Garrett texts mid-delivery: "pivoting. we are not a stoop protocol. we are dog wellness. reprint the cards. take them to Rivka. tell her it is urgent."' },
    failJoke: { timeUp: 'Garrett: "No stress, deadlines are a social construct." Yours is a parking ticket, which is a construct with a fee.' },
    followUps: [
      { from: 'Garrett', text: 'your equity is in. it is a PDF. the PDF is a screenshot of a PDF. please do not open the second one, that is where the vesting is', delay: 80 },
    ],
    objectives: [
      {
        kind: 'talkTo', at: office, radius: 5, presence: 'onFoot', npc: 'Garrett', text: 'Meet Garrett at the co-working space (hot desk $450, cold desk $390)', grant: ['founding cards'],
        lines: [
          'So, BlockBlock. Think of every stoop as a node. The nodes sit. The sitting is the product.',
          'The cards say FOUNDING NEIGHBOUR. Hand one to each of three stoops. Each card is a share of the block.',
          'Legal says "a share of the block" is a phrase that ends careers. I said: it is a pre-career. Go.',
        ],
      },
      { kind: 'enterVehicle', text: 'Get a car, any car (Garrett offers to cover the gas in "gas tokens")' },
      {
        kind: 'collect', points: stoops, radius: 8, presence: 'inVehicle', item: 'card handed out', text: 'Hand out the cards at three stoops (slow down, wave, drive on)',
        banter: ['Stoop one: "Is this about the lease?" "It is a share of the lease." "Then it is about the lease."', 'Stoop two: a man reads the card, folds it into a hat, puts on the hat, closes his eyes.', 'Garrett (text): "pivot incoming, stay loose"'],
        banterEvery: 10,
      },
      {
        kind: 'goTo', at: copy, radius: 8, presence: 'any', text: 'Garrett has pivoted: take the cards to Gold\'s Copy & Print',
        say: [{ who: 'Garrett', text: 'Pivot! The dogs are the stakeholders now! Go go go, the dogs are waiting!' }],
      },
      { kind: 'pay', at: copy, radius: 6, presence: 'onFoot', amount: 30, prompt: 'Pay the PIVOT SURCHARGE', text: 'Pay Rivka the reprint fee (pivot surcharge, $30)' },
      {
        kind: 'talkTo', at: copy, radius: 6, presence: 'onFoot', npc: 'Rivka', text: 'Collect the reprinted cards',
        lines: [
          'This is the fourth pivot this month. Each time, the font gets bigger. At some point it will be a poster.',
          'The surcharge is not on the sign. The sign is also a pivot. I printed it on Tuesday.',
          'Keep the receipt. A receipt is the only thing in this business that outlives the business.',
        ],
      },
      { kind: 'deliver', at: office, radius: 6, presence: 'any', items: ['founding cards'], text: 'Bring the new cards back to Garrett' },
      {
        kind: 'talkTo', at: office, radius: 5, presence: 'onFoot', npc: 'Garrett', text: 'Hear the next big idea',
        lines: [
          'The cards say DOG WELLNESS now. It is a very clean font. Dogs love a clean font.',
          'Update: we pivoted in the car. We are a decentralised casserole. You are our first node.',
          'I paid you in equity. And, off the books, cash. Do not tell my investors cash exists.',
        ],
      },
    ],
    reward: { cash: 140, message: 'Garrett: "Also, you are now Chief Casserole Officer. It is unpaid. It is the best kind."' },
    retryHint: 'Garrett is still pitching the stack',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 3 STREET

/** Act I. The city's forms, as a relay. Three offices, a lunch that never ends, and an aunt who owns a stamp. */
export function redTapeRelay(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const copy = facePoint(grid, 'r3c1', 'W', 0.65);
  const o1 = facePoint(grid, 'r3c1', 'N', 0.5);
  const o2 = facePoint(grid, 'r2c1', 'S', 0.8);
  const o3 = facePoint(grid, 'r2c1', 'N', 0.3);
  return {
    id: 'red-tape-relay', title: 'Red Tape Relay', act: 1, tag: 'side', requires: ['handle-with-care'], availableHours: [9, 17], stake: 30,
    blurb: 'Rivka needs three stamps for Ms. Odette\'s Certificate of Continued Existence: three offices, one day, and a loop on the map.',
    giverPoi: 'rx', giver: copy, triggerRadius: 3.5, timeLimit: 400,
    phoneIntro: { from: 'Rivka', text: 'Rivka Gold, the copy shop. Odette needs a Certificate of Continued Existence. Three offices, three stamps, one day. Bring a pen. Not that pen. The other one. Exact change: all offices are cash only and none of them make change.' },
    twist: { at: 2, text: 'Window Three has gone to lunch. The sign says 12 to 1. It is 12:02. It has been 12:02 since March.' },
    failJoke: { timeUp: 'The offices close. They had already closed. The closure had been closed pending a review of closures.' },
    followUps: [{ from: 'Rivka', text: 'The certificate is framed in Odette\'s window. It says she exists. She says she knew. Come for a lollipop. They are not legal tender.', delay: 70 }],
    setFlags: [F.S_STAMPS],
    objectives: [
      {
        kind: 'talkTo', at: copy, radius: 5, presence: 'onFoot', npc: 'Rivka', text: 'Get the map from Rivka (the map has a loop)',
        lines: [
          'There are three offices. Each stamp needs a paper from another office. I drew a map. The map is a loop. Follow the loop.',
          'Window One needs the form from Window Three. Window Three needs the form from Window One. In between is a hallway. The hallway is where you find it.',
          'Say nothing is wrong. Smile. Say "pending". Pending is the only word they respect.',
        ],
      },
      {
        kind: 'spots', points: [o1, o2], radius: 6, presence: 'onFoot', ordered: true, prompt: 'Get the form stamped', item: 'stamp', timeLimit: 200,
        text: 'Get the first two stamps (Window One, then Window Two)',
        banter: ['Window One: "You need the form from Window Three." Window Three is across town. Window Three is also here.', 'Window Two stamps it without looking up. A stamp so quiet you feel it in a place that is not your hand.'],
        say: [{ who: 'Clerk', text: 'Next. Not you. The next next.' }],
      },
      { kind: 'timer', seconds: 14, text: 'Window Three is at lunch: wait in line, look unfazed', banter: ['A man ahead of you has been in line since the spring. He has a chair. He has a second chair for the lunch.'], banterEvery: 5 },
      { kind: 'pay', at: o3, radius: 6, presence: 'onFoot', amount: 25, prompt: 'Pay the filing fee (exact change)', text: 'Pay the filing fee at Window Three' },
      { kind: 'interact', at: o3, radius: 6, presence: 'onFoot', prompt: 'Receive the third stamp', text: 'Receive the third stamp', doneMessage: 'THUNK. Three stamps. The clerk has not once looked up. You respect it.' },
      {
        kind: 'talkTo', at: copy, radius: 6, presence: 'any', npc: 'Rivka', text: 'Bring the stamps home',
        lines: [
          'Three stamps. Good. Now I tell you something. I printed these three stamps in 2011. They work. I wanted to see if the process still does.',
          'It does not. Write that down. Do not write it down. There is a form for that.',
          'Take this to Odette. And a lollipop. The lollipop is the only thing in this shop that is not legal tender.',
        ],
      },
    ],
    reward: { cash: 160, message: 'Rivka: "Sixty cents for the map. I give you the stamps free. It is a wash."' },
    retryHint: 'the loop is still on the map',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 4 PHONE, NIGHT, DARK

/** Act II. A night job with an inspector. Photos, a detector with no battery, a stoop at 2 a.m. and a foot chase. */
export function carbonCopy(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const meet = facePoint(grid, 'r3c1', 'E', 0.5);
  const tags = [facePoint(grid, 'r3c1', 'E', 0.18), facePoint(grid, 'r3c1', 'E', 0.85), facePoint(grid, 'r4c1', 'E', 0.2)];
  const flat = facePoint(grid, 'r4c1', 'E', 0.55);
  const run = footRoute([facePoint(grid, 'r4c1', 'E', 0.62), facePoint(grid, 'r4c1', 'N', 0.12), facePoint(grid, 'r3c1', 'S', 0.1)]);
  return {
    id: 'carbon-copy', title: 'Carbon Copy', act: 2, tag: 'side', requires: ['fleece-vest'], availableHours: [20, 4],
    blurb: 'Priya, a building inspector with a route of 61 addresses, needs a witness and a camera tonight. Three boilers have been "inspected" by the same pencil.',
    giverPoi: 'auto', giver: meet, triggerRadius: 4, timeLimit: 480,
    phoneIntro: { from: 'Priya', text: 'Voicemail (0:44): Priya Raman, Bureau of Buildings. I am so sorry for the hour. Off the record: three boilers on Garvey were inspected eleven times by the same pencil. I need a second pair of eyes and a phone that takes photos. Bring a jacket.' },
    twist: { at: 2, text: 'In the last stairwell, the carbon monoxide detector reads 41. Nobody has changed its battery since the building had a lobby.' },
    failJoke: {
      timeUp: 'The hour passes. The detector keeps counting. You get another try. The detector does not need one.',
      copsCalled: 'A patrol car asks what you are doing in a boiler room at two a.m. "Housing inspection." "Whose?" You have no form for that.',
      lostTarget: 'Pencil outruns the city. That is not hard. The city has never been in a hurry.',
    },
    followUps: [
      { from: 'Priya', text: 'The boiler was replaced this morning. The family sleeps with the window open and the old detector on the table, like a trophy. Thank you for the spoon.', delay: 90 },
    ],
    setFlags: [F.S_CARBON],
    objectives: [
      {
        kind: 'talkTo', at: meet, radius: 5, presence: 'onFoot', npc: 'Priya', text: 'Meet Priya at the corner (after 8 p.m.)',
        lines: [
          'I have a form for everything. There is a form for the form. There is no form for this.',
          'The system will not take a complaint until there is a hearing on whether the complaint exists. So: carbon paper. Three copies. File, tenant, fire.',
          'If a tag says "inspected", I want the boiler to say it too. Boilers are honest. They mutter, but they are honest.',
        ],
      },
      {
        kind: 'spots', points: tags, radius: 5, presence: 'onFoot', prompt: 'Photograph the boiler tag', item: 'boiler photo', timeLimit: 150, failIfStars: 1,
        text: 'Photograph the boiler tags at three addresses',
        banter: ['Every tag is signed in the same pencil. The signature reads, in cursive: "Signature".', 'The tag says INSPECTED. The boiler says nothing. The boiler has seen things.'],
        say: [{ who: 'Priya', text: 'Fourth tag, same pencil. He never changes. I almost respect it.' }],
      },
      {
        kind: 'interact', at: flat, radius: 5, presence: 'onFoot', prompt: 'Knock until someone answers', presses: 4, text: 'Knock on 3B, the door under the detector',
        say: [{ who: 'Priya', text: 'Keep knocking. Do not stop. It does not care that it is two in the morning.' }],
        beat: { letterbox: 2 },
      },
      {
        kind: 'stakeout', at: flat, radius: 9, seconds: 18, slack: 5, presence: 'onFoot', text: 'Wait on the stoop with the family until the truck comes',
        events: [
          { at: 4, text: 'A toddler hands you a spoon. It is a very important spoon. You hold it.' },
          { at: 10, text: 'Upstairs, the detector keeps beeping. It is the loudest thing in the building. It has been right for a year.' },
          { at: 15, text: 'Priya, quietly: "That boiler was inspected twelve times. This is the first time anyone looked."' },
        ],
      },
      {
        kind: 'chase', route: run, speed: 4.4, catchRadius: 3, target: 'Pencil', failIfStars: 2, text: 'Pencil has come back to "re-inspect": catch him on foot', grant: ['signed tags'],
        stumbles: [{ at: 0.4, pause: 1.6 }],
        say: [{ who: 'Pencil', text: 'I only sign! I do not look! Looking is a different department!', at: 1.5 }],
      },
      {
        kind: 'talkTo', at: meet, radius: 5, presence: 'onFoot', npc: 'Priya', text: 'Give Priya the signed tags',
        lines: [
          'Eleven inspections, one pencil, one detector with no battery. And a family on a stoop at two in the morning with a spoon.',
          'Three copies. One for the file, which will lose it. One for the tenant, who will keep it. One for the fire. The fire does not read. I write anyway.',
          'Go home. Sleep. Or do not sleep. I will say you did, in the report.',
        ],
      },
    ],
    reward: { cash: 260, message: 'Priya hands you the tenant copy. "Keep it somewhere dry. Nothing in this city stays dry, but try."' },
    retryHint: 'the pencil is still signing',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 5 PHONE, EL

/** Where the Binder trip goes: the el when the world has one; two street corners when it does not. */
function trainPoints(ctx: PlaceCtx, features: StoryFeatures): { home: Vec2; north: Vec2; hasEl: boolean } {
  if (features.el) return { home: features.el.home, north: features.el.north, hasEl: true };
  return { home: facePoint(ctx.grid, 'r0c1', 'E', 0.5), north: corner(ctx.grid, 'garvey', 'hart'), hasEl: false };
}

/** Act II. An elder's lost binder, the end of the line and a founder with a lanyard. */
export function theBinder(ctx: PlaceCtx, features: StoryFeatures = {}): MissionDef {
  const { home, north, hasEl } = trainPoints(ctx, features);
  const meet = hasEl ? offset(home, -14, 6) : home;
  const desk = offset(north, 18, -8);
  const lane = hasEl ? 'flushing' : 'hart'; // the street under the el, or the corner street when the world has no el
  const run = footRoute([26, 52, 80, 92].map((dx) => streetAt(ctx.grid, lane, north.x + dx)));
  return {
    id: 'the-binder', title: 'The Binder', act: 2, tag: 'side', requires: ['open-house'], availableHours: [9, 21],
    blurb: 'Miss Cordy left her Binder on the el: forty-six years of landlord letters, dated and cross-referenced. She needs it before the board meets.',
    giverPoi: 'church', giver: meet, triggerRadius: 5, timeLimit: 560,
    phoneIntro: { from: 'Miss Cordy', text: 'Voicemail (0:52): Baby, it is Cordelia, 2A. I left my Binder on the train. Not THE train. The one that goes over the street. It has the dates in it. I have everything in it. I have me in it.' },
    twist: { at: 3, text: 'Lost Property has the Binder\'s description and a name: a man took it twenty minutes ago. His lanyard said FOUNDER.' },
    failJoke: {
      lostTarget: 'Garrett vanishes into a coffee line. The coffee line is longer than the platform.',
      timeUp: 'The Binder rides the line twice more and gets a seat both times. You get neither.',
    },
    followUps: [
      { from: 'Miss Cordy', text: 'Voicemail (0:31): "Baby? It is Cordelia. I am calling to thank someone. I forget who. The Binder is on my lap, so it must have been somebody good."', delay: 90 },
    ],
    setFlags: [F.S_BINDER],
    objectives: [
      {
        kind: 'talkTo', at: meet, radius: 6, presence: 'onFoot', npc: 'Miss Cordy', text: 'Meet Miss Cordy at the foot of the stairs',
        lines: [
          'Forty-six years of every landlord who ever wrote me a letter. I keep the carbons.',
          'I took the train to the end, fell asleep, and got off with my purse. My purse! Never forget the purse. The Binder I forget.',
          'I read it every morning, to make sure I am still the one who wrote it. Do not look at me like that. It works.',
        ],
      },
      {
        kind: 'goTo', at: home, radius: 14, presence: 'onFoot', text: hasEl ? 'Climb to the platform' : 'Walk to the end of the line',
        say: hasEl ? [{ who: 'Train', text: 'This is a last-stop train. Please take your belongings, your children and your debts.' }] : undefined,
      },
      { kind: 'goTo', at: north, radius: 16, presence: 'any', timeLimit: 240, text: hasEl ? 'Ride to the last stop and ask at Lost Property' : 'Get to the last stop and ask at Lost Property' },
      {
        kind: 'talkTo', at: desk, radius: 6, presence: 'onFoot', npc: 'Clerk', text: 'Ask the Lost Property clerk about a blue binder',
        lines: [
          'Lost Property. We have thirty umbrellas, a cello, and a gentleman\'s regret. Not the regret, it was claimed.',
          'A Binder? Big. Blue. Smells like a good decision. A man took it twenty minutes ago.',
          'He had a lanyard that said FOUNDER and a coffee that said "oat". He ran when I said "form".',
        ],
      },
      {
        kind: 'chase', route: run, speed: 4.6, catchRadius: 3, target: 'Garrett', text: 'Catch the founder before he reaches the exit', grant: ['Miss Cordy\'s Binder'],
        stumbles: [{ at: 0.35, pause: 1.5 }, { at: 0.7, pause: 1.2 }],
        say: [
          { who: 'Garrett', text: 'It is open-source! Oral history is an under-monetised data layer!', at: 1.5 },
          { who: 'Garrett', text: 'I am only indexing her! I added a table of contents!', at: 5 },
        ],
      },
      { kind: 'goTo', at: home, radius: 14, presence: 'any', text: hasEl ? 'Ride home with the Binder' : 'Take the Binder home' },
      {
        kind: 'talkTo', at: meet, radius: 6, presence: 'onFoot', npc: 'Miss Cordy', text: 'Hand Miss Cordy the Binder',
        lines: [
          'Oh. You found it. You found me. Sit. Sit, sit.',
          'Someone wrote in the margin: "Consider a table of contents." Hm. That is a good idea. Who wrote that? Is it you?',
          'He spelled "landlord" as "stakeholder". I have spelled it right since 1979. I will spell it right at the board.',
          'Who are you, baby? ... Oh. The nice one with the train. I knew that. I wrote it down. Page nine hundred and two.',
        ],
      },
    ],
    reward: { cash: 230, message: 'Miss Cordy presses a folded bill into your hand. "Not a tip. A retainer. Do not tell me what for. I will forget, and then we are even."' },
    retryHint: 'the Binder is still riding the line',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 6 STREET, DJ

/** Act II. The community board loses its quorum. A one-minute interlude on the block-party decks holds the room. */
export function gavelToGavel(ctx: PlaceCtx): MissionDef {
  const party = streetMid(ctx.grid, 'vanburen', 'throop', 'garvey');
  const alvin = offset(party, -8, -4);
  const chair = offset(party, 10, 5);
  return {
    id: 'gavel-to-gavel', title: 'Gavel to Gavel', act: 2, tag: 'side', requires: ['open-decks', 'public-comment'], availableHours: [17, 23],
    blurb: 'Community Board Three is losing its quorum at 8:15, Mr. Alvin is in minute 31 of his three, and Chair Tate needs a DJ.',
    giverPoi: 'church', giver: poiSpot(ctx, 'church'), triggerRadius: 4, timeLimit: 420,
    phoneIntro: { from: 'Chair Tate', text: 'Roslyn Tate, chair. The church hall is 94 degrees, the air is a rumour, and Mr. Greaves is in minute 31 of his three. We lose quorum at 8:15. I need a DJ, a speaker and an excuse. Come to Van Buren.' },
    twist: { at: 3, text: 'The room stays. For the first time in nineteen years, Mr. Alvin\'s three minutes end because the bass says so.' },
    failJoke: {
      lowScore: 'The room empties. Quorum is a rumour again. Mr. Alvin finishes minute 40 to eleven folding chairs and a ficus.',
      timeUp: 'Quorum lost at 8:15. The motion passes by default. Default is how things pass around here.',
    },
    followUps: [{ from: 'Chair Tate', text: 'The minutes record that "the board was moved". They do not say by what. Do not tell the borough that a dog is a resident. He is on the lease.', delay: 80 }],
    setFlags: [F.S_QUORUM],
    objectives: [
      {
        kind: 'talkTo', at: poiSpot(ctx, 'church'), radius: 5, presence: 'onFoot', npc: 'Chair Tate', text: 'Meet Chair Tate on the church steps',
        lines: [
          'Quorum is eleven. We are nine, and two of them are asleep, and one is a ficus.',
          'Tonight\'s item: renaming the block the Throop Row District. If we lose quorum it passes by default. Default is how things pass here.',
          'I am moving the hearing outside, to the Van Buren lot. The decks are there. Keep the room in the room, with music.',
        ],
      },
      {
        kind: 'goTo', at: party, radius: 14, presence: 'any', text: 'Head to the Van Buren lot',
        say: [{ who: 'Chair Tate', text: '(text) Hurry. Mr. Greaves has found a second wind. It is a gust.' }],
      },
      {
        kind: 'talkTo', at: alvin, radius: 5, presence: 'onFoot', npc: 'Mr. Alvin', text: 'Find Mr. Alvin at the microphone',
        lines: [
          'This is minute thirty-two of my three. I am nearly at the part about 1974.',
          'I will stop when the room stops me. The room has never stopped me. It has only left.',
          'Young person. You have records. Please. Be the room.',
        ],
      },
      { kind: 'djSet', venue: VENUE_BLOCKPARTY, minutes: 1, minScore: 45, at: party, radius: 12, text: 'Play a one-minute interlude to hold the room (score 45+)',
        say: [
          { who: 'Mr. Alvin', text: 'Is that a bass line? In my hearing? ... Carry on. I will wait. I am very good at waiting.', at: 2 },
          { who: 'Chair Tate', text: 'Sit, everyone. Sit. The next speaker is a kick drum. Three minutes.', at: 8 },
        ],
      },
      {
        kind: 'talkTo', at: chair, radius: 5, presence: 'onFoot', npc: 'Chair Tate', text: 'Find Chair Tate when the vote is called',
        lines: [
          'Quorum held. Twelve in the room, one of them a stray, who voted. I counted him.',
          'Now. A personal matter. I must recuse myself from this vote. My pension is in a fund. The fund holds their debt. I have known for a year.',
          'Recused. Write it down. Write it in pen. That is the first honest minute I have had in that chair.',
        ],
      },
    ],
    reward: { cash: 220, message: 'Chair Tate lets you hold the gavel. It is a toy mallet. "It works if everyone agrees it works."' },
    retryHint: 'the room is still waiting',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 7 STREET, DUSK

/** Act II. Forty birds loose at dusk, a stealth tail by a polite distance, and a billboard they will not leave. */
export function pigeonPost(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const roof = facePoint(grid, 'r1c1', 'N', 0.25);
  const seed = poiSpot(ctx, 'troop-deli');
  const billboard = facePoint(grid, 'r1c1', 'S', 0.5);
  const route = [roof, corner(grid, 'garvey', 'pulaski'), corner(grid, 'garvey', 'kosciuszko'), offset(billboard, 4, 0)];
  return {
    id: 'pigeon-post', title: 'Pigeon Post', act: 2, tag: 'side', requires: ['walk-dee-home'], availableHours: [16, 20],
    blurb: 'Tito\'s forty pigeons are in the wind after a "pest management" visit. Buy seed, follow the flock at a polite distance, and bring them home.',
    giverPoi: 'funeral', giver: roof, triggerRadius: 4, timeLimit: 440,
    phoneIntro: { from: 'Tito', text: 'Tito, roof of 411. Pest control came at noon in a van with no name and now forty birds are in the wind. Seed from the bodega, then follow the flock. Do not wave. Do not be a hero. Birds hate a hero.' },
    twist: { at: 3, text: 'The flock has landed on the Parallax billboard, on the word FRICTIONLESS. It is the first time the word has held any weight.' },
    failJoke: {
      spotted: 'You wave. The flock does not wave back. The flock files a complaint with the sky.',
      tooFast: 'You jog. The flock reconsiders everything it has ever believed about you.',
      lostTarget: 'The flock turns left. You turn into a bodega. It is not a flock decision. It is a you decision.',
      timeUp: 'Night falls. The birds sleep on the billboard. The billboard is the most comfortable it has been all year.',
    },
    followUps: [{ from: 'Tito', text: 'Mrs. Abernathy came home today. She left in March. That counts as a visit. I wrote it down, with a pen, in the book Cordy lent me.', delay: 80 }],
    setFlags: [F.S_BIRDS],
    objectives: [
      {
        kind: 'talkTo', at: roof, radius: 5, presence: 'onFoot', npc: 'Tito', text: 'Meet Tito at the foot of the roof ladder',
        lines: [
          'Forty birds. I named every one. That one is Mrs. Abernathy. That one is the Hendersons, both of them, it is one bird, it is complicated.',
          'Every bird is a neighbour who moved out. When one comes home it counts as a visit.',
          'Seed from the bodega. Then follow them. Slowly. Do not look like a man with a plan.',
        ],
      },
      {
        kind: 'pickUp', at: seed, radius: 5, presence: 'onFoot', items: ['bird seed'], prompt: 'Buy a bag of seed', text: 'Buy a bag of bird seed at Troop Deli',
        say: [{ who: 'Mohammed', text: 'Seed is two dollars. Advice is free. Advice: do not follow pigeons.' }],
      },
      {
        kind: 'tail', route, speed: 4, maxDistance: 40, minDistance: 8, spotGrace: 2, grace: 8, target: 'the flock', text: 'Follow the flock at a polite distance (8 to 40 m back)',
        banter: ['One bird is walking. It is the leader. It has never trusted a wing.', 'The flock turns a corner together. It is the best-coordinated thing on the block.'],
      },
      {
        kind: 'stakeout', at: billboard, radius: 16, seconds: 14, slack: 5, presence: 'any', text: 'Wait under the billboard. Do not flap.',
        events: [
          { at: 3, text: 'They have settled on the word FRICTIONLESS. They are not.' },
          { at: 9, text: 'A leg band flashes on one bird: STOOPABLE ASSET 4417. Somebody has tagged the pigeons as amenities.' },
        ],
      },
      {
        kind: 'interact', at: billboard, radius: 16, presence: 'any', prompt: 'Rattle the seed', presses: 4, text: 'Rattle the seed (slowly, like you are sorry)',
        say: [{ who: 'Tito', text: 'Shake it slow, mister. Slow. Like you are sorry. They can tell.', at: 1 }],
      },
      { kind: 'goTo', at: roof, radius: 7, presence: 'any', maxKmh: 16, text: 'Walk the flock home, under 16 km/h' },
      {
        kind: 'talkTo', at: roof, radius: 6, presence: 'onFoot', npc: 'Tito', text: 'Count the birds with Tito',
        lines: [
          'Thirty-nine. Forty. Forty-one? That one is not mine. It has a band.',
          '"Stoopable Asset 4417." They counted my pigeons as amenities. Amenity! That one bites.',
          'The brown one is Mrs. Abernathy. She left in March. She came home today. That is a visit.',
        ],
      },
    ],
    reward: { cash: 190, message: 'Tito hands you a pigeon feather and a thermos of coffee. "The feather is a thank-you. The coffee is a warning."' },
    retryHint: 'the flock is still out',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 8 PHONE, DRIVING, FORK

/** Act II. Auntie G's forwarded warning: a white van that photographs every stoop. Tail it, catch the technician, choose who gets the list. */
export function vanMan(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const spot = facePoint(grid, 'r4c0', 'S', 0.5);
  const park = streetMid(grid, 'lafayette', 'throop', 'garvey');
  const route = [spot, corner(grid, 'throop', 'greene'), corner(grid, 'throop', 'vanburen'), corner(grid, 'throop', 'lafayette'), park];
  const run = footRoute([park, offset(park, 62, 0), corner(grid, 'garvey', 'lafayette'), offset(corner(grid, 'garvey', 'lafayette'), 0, -40)]);
  const priya = facePoint(grid, 'r3c1', 'E', 0.5);
  const copy = facePoint(grid, 'r3c1', 'W', 0.65);
  return {
    id: 'van-man', title: 'Van Man', act: 2, tag: 'side', requires: ['walk-dee-home'], availableHours: [10, 18],
    blurb: 'Auntie G forwarded a warning to ten people: a white van is photographing every stoop on the block. Somebody has to follow it. The ten all said you.',
    giverPoi: 'liquor', giver: spot, triggerRadius: 4, timeLimit: 440,
    phoneIntro: { from: 'Auntie G', text: 'FWD: FWD: WHITE VAN TAKING PICTURES OF EVERY STOOP. IT IS NOT THE POST OFFICE. FORWARD TO TEN PEOPLE. I forwarded it to ten people. You were all ten. Go find the van.' },
    twist: { at: 3, text: 'The technician sees you in the mirror and bolts on foot, tablet under his arm. The tablet has a column called LIKELIHOOD OF VACATING.' },
    failJoke: {
      lostTarget: 'You lose a white van in a city where every third van is white and none of them are sorry.',
      copsCalled: 'You chase a man with a tablet down a sidewalk. A patrol car calls it "an incident". You call it "a Tuesday".',
      timeUp: 'The van finishes its route. Your stoop is scored. The score is not shared with you, which is the point of the score.',
    },
    followUps: [
      { from: 'Auntie G', text: 'MY STOOP WAS A 7.2. I HAVE NEVER BEEN A 7.2 IN MY LIFE. I AM A 10. I WILL FORWARD THIS TO TEN PEOPLE AND THEY WILL ALL BE ME.', delay: 70 },
      { from: 'Priya', text: 'I filed it in triplicate. The third copy is in my coat. It has sixty-one stoops on it, one of them mine.', delay: 100, ifFlag: F.S_VAN_PRIYA },
      { from: 'Rivka', text: 'Four thousand pages. Taped to the church door, the board room window and the lamp post outside Parallax. Facing in. Let them be scored.', delay: 100, ifFlag: F.S_VAN_RIVKA },
    ],
    setFlags: [F.S_VAN],
    objectives: [
      { kind: 'enterVehicle', text: 'Get into a car and find the white van (Auntie says: "it will be white")' },
      {
        kind: 'tail', route, speed: 7, maxDistance: 50, target: 'unmarked white van', text: 'Tail the white van without losing it',
        say: [{ who: 'Auntie G', text: '(text) Do NOT let it see your face. Do NOT smile. A smile is evidence.', at: 3 }],
        banter: ['The van stops at every stoop for exactly one and a half seconds. It does not wave.', 'The roof camera turns like a very patient owl.'],
      },
      {
        kind: 'stakeout', at: park, radius: 18, seconds: 12, slack: 5, presence: 'any', failIfStars: 1, text: 'Park nearby and watch the van\'s screen through the windshield',
        events: [
          { at: 3, text: 'On the screen your block is a heat map. Every stoop is scored from 1 to 10. Auntie\'s is a 7.2.' },
          { at: 8, text: 'The last column reads LIKELIHOOD OF VACATING. Low is good, if you are the van.' },
        ],
      },
      { kind: 'interact', at: park, radius: 20, presence: 'any', prompt: 'Photograph the screen', presses: 2, text: 'Photograph the screen' },
      {
        kind: 'chase', route: run, speed: 4.6, catchRadius: 3, target: 'Technician', failIfStars: 2, text: 'Catch the technician on foot', grant: ['risk tablet'],
        stumbles: [{ at: 0.45, pause: 1.6 }],
        say: [{ who: 'Technician', text: 'I only collect! The data is not my data! I have a lanyard!', at: 2 }],
      },
      {
        kind: 'fork', id: 'van-fork', presence: 'any', text: 'Decide who gets the tablet (walk into a ring, press F)',
        options: [
          { label: 'Give the tablet to Priya (official channel, slow, honest)', at: priya, radius: 5, flag: F.S_VAN_PRIYA, doneMessage: 'Priya takes the tablet with two hands, like a sleeping child.' },
          { label: 'Give the tablet to Rivka (print every page, post it everywhere)', at: copy, radius: 5, flag: F.S_VAN_RIVKA, doneMessage: 'Rivka turns the machine on. It sounds like a rain that has opinions.' },
        ],
      },
      {
        kind: 'talkTo', when: { flag: F.S_VAN_PRIYA }, at: priya, radius: 6, presence: 'any', npc: 'Priya', text: 'Hear what Priya makes of the list',
        lines: [
          'This is not evidence. It is a list of who has not left yet. I am accepting it. Do not tell my supervisor, who is also a form.',
          'There is a column for each stoop: months remaining. Sixty-one stoops on my route. I have never seen my route scored.',
          'I will file it in triplicate. The third copy goes in my coat.',
        ],
      },
      {
        kind: 'talkTo', when: { flag: F.S_VAN_RIVKA }, at: copy, radius: 6, presence: 'any', npc: 'Rivka', text: 'Hear what Rivka is going to do with the list',
        lines: [
          'Four thousand pages at six cents. For you, five. I print the whole list, every stoop, and I tape it to a door.',
          'Nobody reads a link. Everybody reads a door.',
          'One copy in my window, facing in. Let the board see how it feels to be scored.',
        ],
      },
    ],
    reward: { cash: 250, message: 'Auntie G: "I forwarded your receipt to ten people. They are all me."' },
    retryHint: 'the van is still on its route',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 9 PHONE, NIGHT

/** Act II. A wellness cult in a basement, a plant called Gerald, and a husband who has taken a vow of silence. */
export function silentRetreat(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const van = facePoint(grid, 'r2c1', 'S', 0.5);
  const door = facePoint(grid, 'r2c1', 'E', 0.6);
  const yard = facePoint(grid, 'r2c1', 'E', 0.85);
  const way = footRoute([yard, facePoint(grid, 'r2c1', 'S', 0.95), facePoint(grid, 'r2c1', 'S', 0.75), van]);
  return {
    id: 'silent-retreat', title: 'Silent Retreat', act: 2, tag: 'side', requires: ['open-house'], availableHours: [19, 4],
    blurb: 'Bryce went to a 72-hour silent retreat in a basement and it has been four days. He left his phone charger. He has never left his charger.',
    giverPoi: 'condo', giver: van, triggerRadius: 4, timeLimit: 500,
    phoneIntro: { from: 'Hallie', text: 'okay so Bryce went to a 72-hour silent retreat in a basement and it has been 4 days. which is normal?? but he left his charger and he has never left his charger. its called the Ascension Circle. can you just... go in? quietly. you are good at quiet' },
    twist: { at: 2, text: 'The facilitator, in linen and bare feet, is Garrett. He has pivoted again. He is now a "founder-guide".' },
    failJoke: {
      blownCover: 'You laugh during the silence. Forty heads turn. A man named Rainwater exhales for ninety seconds. You are asked to leave. You are asked to make a donation.',
      lostTarget: 'Bryce wanders off, serene, toward the next workshop. He is very serene. He is very gone.',
      timeUp: 'Dawn comes. The retreat extends itself by 72 hours. The fee extends itself by 72 hours of fee.',
    },
    followUps: [
      { from: 'Garrett', text: 'quick one, the Ascension Circle is now "Exit Mindfully (formerly Ascension)". refunds are in tokens. tokens are real. a lot of this is real', delay: 80 },
      { from: 'Hallie', text: 'he is home. he is eating toast. he said "the font was trustworthy" and then he cried a little and then he asked if we have any more toast.', delay: 120 },
    ],
    setFlags: [F.S_RETREAT],
    objectives: [
      {
        kind: 'talkTo', at: van, radius: 5, presence: 'onFoot', npc: 'Hallie', text: 'Meet Hallie at the van with the plant in it',
        lines: [
          'It is on Garvey, behind a door with a plant on it. It costs four thousand nine hundred ninety-nine dollars. For silence.',
          'Gerald is in there too. The plant. Not that Gerald.',
          'If he looks happy, do not break it. If he looks hungry, break it.',
        ],
      },
      { kind: 'goTo', at: door, radius: 5, presence: 'onFoot', text: 'Slip into the basement under the door with the plant' },
      {
        kind: 'stakeout', at: door, radius: 7, seconds: 22, slack: 4, presence: 'onFoot', text: 'Sit through the breathwork (no talking, no laughing)',
        events: [
          { at: 3, text: 'Facilitator: "Breathe in the monetisable present."' },
          { at: 8, text: 'Someone cries. Someone else invoices.' },
          { at: 13, text: 'Garrett, in linen: "We are building a conscious community on the blockchain of your breath."' },
          { at: 18, text: 'A gong sounds. It is a phone alarm. It is a very good phone alarm.' },
        ],
        say: [{ who: 'Facilitator', text: 'You are not late. Time is a payment plan.', at: 1 }],
      },
      { kind: 'pickUp', at: yard, radius: 5, presence: 'onFoot', items: ['Gerald (the plant)'], prompt: 'Lift Gerald out of the lotus pose', text: 'Take Gerald from the back room' },
      {
        kind: 'tail', route: way, speed: 2.2, waitDistance: 9, maxDistance: 40, grace: 10, target: 'Bryce (silent)', text: 'Walk Bryce out quietly (he will not hurry)',
        banter: ['Bryce mouths "namaste". He mouths it at a lamp post. He mouths it at you.', 'He has taken a vow of silence. The vow does not cover humming. He hums for three blocks.'],
      },
      { kind: 'deliver', at: van, radius: 6, presence: 'any', items: ['Gerald (the plant)'], text: 'Hand Gerald back to Hallie' },
      {
        kind: 'talkTo', at: van, radius: 5, presence: 'onFoot', npc: 'Bryce', text: 'Hear Bryce\'s first words in four days',
        lines: [
          'The font was trustworthy.',
          'Seventy-two hours of not speaking. I just spoke to a lamp post. The lamp post did not respond. It was the best conversation I have had all week.',
          'Hallie was right. Do not tell Hallie she was right. She will frame it.',
        ],
      },
    ],
    reward: { cash: 250, message: 'Hallie pays you in cash and an oat-milk voucher, and apologises for both.' },
    retryHint: 'the basement door is still open',
  };
}

// ---------------------------------------------------------------------------------------------------------------- 10 STREET, DARK

/** Act III. A funeral where the lead car is you, twelve miles an hour on purpose, and a banner that says ORIGINAL CHARACTER. */
export function slowRoll(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const home = poiSpot(ctx, 'funeral');
  const church = poiSpot(ctx, 'church');
  const old = streetMid(grid, 'throop', 'kosciuszko', 'lafayette');
  const route = [church, corner(grid, 'throop', 'pulaski'), corner(grid, 'throop', 'kosciuszko'), old];
  const truck = streetMid(grid, 'throop', 'lafayette', 'vanburen');
  const gate = corner(grid, 'throop', 'vanburen');
  return {
    id: 'slow-roll', title: 'Slow Roll', act: 3, tag: 'side', requires: ['night-of-the-narcan'], availableHours: [10, 16],
    blurb: 'Mrs. Vernita Hollis, Auntie G\'s oldest friend, is being buried today. The family needs a car that can drive twelve miles an hour on purpose.',
    giverPoi: 'funeral', giver: home, triggerRadius: 4, timeLimit: 500,
    phoneIntro: { from: 'Auntie G', text: 'Gloria. Vernita Hollis passed Tuesday. The funeral is at the church at 11. They need a family car, somebody who can drive twelve miles an hour on purpose. I cannot ask the family. I am asking you.' },
    twist: { at: 3, text: 'The hearse stops outside her old building. In the window, a banner: NOW LEASING, APT 5C, ORIGINAL CHARACTER.' },
    failJoke: {
      lostTarget: 'You lose a hearse in a neighbourhood where it is the slowest thing for a mile. That takes a gift.',
      tooFast: 'You pass a funeral. Forty people turn at once. It is the longest second of your life.',
      timeUp: 'The procession arrives while you are still circling for a spot. Mrs. Hollis would have had something to say. It would have been correct.',
    },
    followUps: [{ from: 'Auntie G', text: 'I am typing this myself. It is not a forward. Thank you. She would have said you drove like a deacon. That was her highest praise.', delay: 90 }],
    setFlags: [F.S_SLOW],
    objectives: [
      {
        kind: 'talkTo', at: home, radius: 5, presence: 'onFoot', npc: 'Funeral Director', text: 'Meet the funeral director at Gently Going',
        lines: [
          'We offer three tiers: Basic, Block-Wide and Legacy. Mrs. Hollis chose Basic. The block chose Legacy. The block is paying in casseroles.',
          'The procession is a hearse, the family car and forty people on foot. You are the family car. Twelve miles an hour, on purpose.',
          'The guest book asks for an email. I apologise. The software updated itself in the night. It does that now. It has opinions.',
        ],
      },
      { kind: 'enterVehicle', text: 'Take the family car (a borrowed sedan, black as a good suit)' },
      {
        kind: 'tail', route, speed: 3.4, maxDistance: 16, grace: 8, target: 'the hearse', text: 'Follow the hearse slowly from the church, close behind',
        banter: ['Forty people walk behind you in their good shoes. Nobody honks. The street has stopped being a street.', 'A cyclist takes off his helmet. A delivery rider cuts his engine. Nobody told them to.'],
        beat: { letterbox: 3 },
      },
      {
        kind: 'holdSpeedBelow', at: old, radius: 14, kmh: 4, seconds: 8, text: 'Stop outside her old building (the family asked)',
        say: [
          { who: 'Mourner', text: 'Original character. She was the original. She was the only one.', at: 1 },
          { who: 'Tito', text: 'Take the banner down? No. Leave it. Let them see who they are renting.', at: 4 },
        ],
      },
      {
        kind: 'interact', at: truck, radius: 10, presence: 'any', prompt: 'Ask the food truck to move', presses: 3, text: 'Ask the food truck blocking the lane to move',
        banter: ['The truck is called BROTHER KALE. Its menu: GRIEF BOWL $14 (OAT). REMEMBRANCE SMOOTHIE $11.'],
        doneMessage: 'The truck moves. The driver puts his cap over his heart. He still tries to sell Tito a bowl.',
      },
      { kind: 'goTo', at: gate, radius: 10, presence: 'any', maxKmh: 22, text: 'Roll to the cemetery gate at walking pace' },
      {
        kind: 'talkTo', at: offset(gate, 6, 4), radius: 6, presence: 'onFoot', npc: 'Auntie G', text: 'Stand with Auntie G at the gate',
        lines: [
          'Fifty-one years we sat across from each other. I said goodnight to her every night. I never said goodbye to anyone else on this block and I am not starting.',
          'She left last, after the "cash for keys". She took the keys. She gave them to me. I have them. Do not tell Hobbs.',
          'Now go home. Eat something. Somebody has to eat at these things.',
        ],
      },
    ],
    reward: { cash: 170, message: 'Auntie G folds a twenty into your hand, then folds your hand around it. "This is not payment. This is a casserole."' },
    retryHint: 'the procession is still waiting at the church',
  };
}

/** The ten, in the order listed in STORY2_IDS. The Binder takes the el when the world has one. */
export function storyExtras(ctx: PlaceCtx, features: StoryFeatures = {}): MissionDef[] {
  return [
    moistureEvent(ctx), founderMode(ctx), redTapeRelay(ctx), carbonCopy(ctx), theBinder(ctx, features),
    gavelToGavel(ctx), pigeonPost(ctx), vanMan(ctx), silentRetreat(ctx), slowRoll(ctx),
  ];
}
