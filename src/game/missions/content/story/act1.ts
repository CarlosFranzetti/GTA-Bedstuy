/**
 * ACT I: "Welcome Back to the Block". The paper goes up, the board votes, the records get moved, and the first bill comes due.
 * Mechanics: spots (peel notices), petition run + cab race, fragile cargo in a van, a shop errand with money and the first fork.
 */
import type { MissionDef } from '../../types';
import { F } from '@/game/story/flags';
import { corner, facePoint, poiSpot, type PlaceCtx } from '../places';

export function noticeOfIntent(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const giver = facePoint(grid, 'r3c1', 'W', 0.2);
  const doors = [facePoint(grid, 'r3c1', 'W', 0.45), facePoint(grid, 'r3c1', 'W', 0.78), facePoint(grid, 'r4c1', 'W', 0.15), facePoint(grid, 'r4c1', 'W', 0.45)];
  const alvin = facePoint(grid, 'r1c0', 'E', 0.7);
  return {
    id: 'notice-of-intent', title: 'Notice of Intent', act: 1,
    requires: ['bodega-run'],
    blurb: 'Someone taped a paper with the word INTENT on it to every door on Throop. Auntie G wants them off before dinner.',
    giverPoi: 'daycare', giver, triggerRadius: 4, timeLimit: 260,
    phoneIntro: { from: 'Auntie G', text: 'Baby, somebody taped paper on every door on this block. It says INTENT. I do not trust a paper with intent. Come peel.' },
    failJoke: { timeUp: 'A man in a fleece vest re-tapes the doors behind you. He has a lot of tape and a lot of time.' },
    followUps: [
      { from: 'Auntie G', text: 'That paper said INTENT. You know who writes INTENT? Somebody who already decided.', delay: 70 },
      { from: 'Yossi', text: 'You do not know me. The name on that notice is an LLC, and the LLC\'s address is a UPS Store. Please read what you peeled and then read what it does not say.', delay: 140 },
    ],
    setFlags: [F.ACT1],
    objectives: [
      {
        kind: 'spots', points: doors, radius: 4, prompt: 'Peel the notice', item: 'notice', timeLimit: 130,
        text: 'Peel the four notices off the doors before the tape crew is back',
        say: [
          { who: 'Auntie G', text: 'Four doors. Peel fast, peel quiet. The vest comes back at six with more tape.' },
          { who: 'Auntie G', text: 'Do not read it out loud. It makes my blood do something.', at: 7 },
        ],
        banter: ['"NOTICE OF INTENT TO ACCEPT OFFERS." Accept offers from who? From whom? Nobody says.', 'Door four has two notices. One is for a tenant who moved out in 2009.'],
        doneMessage: 'Four notices. Each one signed by a person who does not exist.',
      },
      {
        kind: 'deliver', at: alvin, radius: 5, presence: 'any', items: ['notice', 'notice', 'notice', 'notice'],
        text: 'Take the notices to Mr. Alvin before the sweeper comes through',
        say: [{ who: 'You', text: 'Eight lines of text and every one of them is a verb with no subject.' }],
      },
      {
        kind: 'talkTo', at: alvin, radius: 5, presence: 'onFoot', npc: 'Mr. Alvin', text: 'Hear what Mr. Alvin makes of it',
        lines: [
          'I have read worse. I wrote worse. In 1998.',
          'This clause about "cooperation agreements" is, ahem, routine. Skip it. Go to paragraph four.',
          'Public comment is tonight. Three minutes each. I have timed myself. Nineteen years, and I have never once come in under.',
        ],
        beat: { letterbox: 3 },
      },
    ],
    reward: { cash: 140, message: 'Auntie G: "Here is forty for the tape. The rest is for the nerve."' },
    retryHint: 'the notices are back on the doors',
  };
}

export function publicComment(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const alvin = facePoint(grid, 'r1c0', 'E', 0.7);
  const church = poiSpot(ctx, 'church');
  const signs = [facePoint(grid, 'r2c1', 'W', 0.55), facePoint(grid, 'r3c1', 'W', 0.35), facePoint(grid, 'r3c0', 'E', 0.5)];
  const lap = [corner(grid, 'throop', 'lafayette'), corner(grid, 'garvey', 'lafayette'), corner(grid, 'garvey', 'pulaski'), corner(grid, 'throop', 'pulaski'), church];
  return {
    id: 'public-comment', title: 'Three Minutes of Public Comment', act: 1,
    requires: ['notice-of-intent'], availableHours: [14, 19], deadlineHour: 19,
    blurb: 'The community board votes at 7. Mr. Alvin needs three signatures, a ride, and to beat the rival car to the church basement.',
    giverPoi: 'oxtail', giver: alvin, triggerRadius: 4,
    phoneIntro: { from: 'Mr. Alvin', text: 'The vote is at 7pm. I need three signatures, and I need a cab. The cab on the corner. Ignore the meter, the meter is a metaphor.' },
    failJoke: { clockUp: 'The vote happens without you. It is four to three. It was always going to be four to three.', lostRace: 'The Zoomr gets there first. Its passengers have lanyards.' },
    followUps: [
      { from: 'Hallie', text: 'Hi! I heard you spoke up at the board?? That is SO brave. We are holding space for the block this week. Sound bath Thursday, sliding scale.', delay: 90 },
    ],
    objectives: [
      {
        kind: 'enterVehicle', vehicle: ['cab'], text: 'Flag down a cab (any wheels will do after a minute)',
        say: [{ who: 'Mr. Alvin', text: 'Cab. Corner. Do not make eye contact with the meter.' }],
      },
      {
        kind: 'spots', points: signs, radius: 6, presence: 'any', prompt: 'Get a signature', item: 'signature',
        text: 'Get three signatures from three stoops (you can lean out of the window)',
        banter: ['Stoop one: "Sign what? Oh. Is it the thing about the thing? Where do I sign?"', 'Stoop two: "I will sign if you hold the baby. I mean the cat. Sorry. The cat."'],
      },
      {
        kind: 'race', route: lap, radius: 12, rivalSpeed: 9.5, rival: 'the Zoomr', presence: 'inVehicle',
        text: 'Race the rival car to the church basement, checkpoints in order',
        say: [{ who: 'Mr. Alvin', text: 'The developer\'s people hired a car with a chauffeur and a lanyard. It leaves now. So do we.' }],
        banter: ['Mr. Alvin: "Do not stop for the red light. I will take the blame. I will take the blame at a hearing."'],
        beat: { letterbox: 2.5 },
      },
      {
        kind: 'talkTo', at: church, radius: 6, presence: 'onFoot', npc: 'Mr. Alvin', text: 'Stand with Mr. Alvin at the microphone',
        lines: [
          'Ahem. Three minutes. I would like to enter into the record that this block has a name and the name is not "the corridor".',
          'Nobody on this block has signed anything. Nobody. Sit down, Gerald.',
          'I yield the rest of my time to the clock. It has earned it.',
        ],
        doneMessage: 'The board votes four to three. Alvin gives you a thumbs up with both hands, the way he does everything.',
      },
    ],
    reward: { cash: 220, message: 'Mr. Alvin: "A moral victory. The kind you can\'t pay rent with."' },
    retryHint: 'the vote is still tonight',
  };
}

export function handleWithCare(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const door = facePoint(grid, 'r2c1', 'W', 0.0);
  const plant = poiSpot(ctx, 'auto');
  return {
    id: 'handle-with-care', title: 'Handle With Care', act: 1, requires: ['public-comment'],
    blurb: 'Odette\'s test pressings go to the plant today. In a van, with no scratches, past eleven potholes with names.',
    giverPoi: 'wax-deli', giver: door, triggerRadius: 4, timeLimit: 200,
    fragile: { label: 'Test pressings', hp: 100, minImpact: 3, perImpact: 1.7 },
    phoneIntro: { from: 'Ms. Odette', text: 'Baby, the test pressings go to the plant today. If they scratch, I scratch you. Drive like you are carrying an egg that owes me money.' },
    failJoke: { cargoBroken: 'The records look like a ploughed field. Ms. Odette looks like a ploughed field with a mouth.', timeUp: 'The plant closes. The pressings go back in the van, and so does your dignity.' },
    followUps: [{ from: 'Ms. Odette', text: 'The plant says one lacquer has a scratch. From 1979. Not you. Do not worry. Come by, I have patties.', delay: 70 }],
    objectives: [
      {
        kind: 'enterVehicle', vehicle: ['cargovan'], text: 'Take the cargo van behind the shop (any van will do after a minute)',
        say: [{ who: 'Ms. Odette', text: 'This is the van. The van has opinions. Do not argue with it.' }],
      },
      {
        kind: 'pickUp', at: door, radius: 6, presence: 'inVehicle', items: ['test pressings'], prompt: 'Load the crate', cargo: true,
        text: 'Load the test pressings at the back door',
        say: [{ who: 'Ms. Odette', text: 'Forty-two sides. One mother. Slow down at the bumps.', at: 1 }],
      },
      {
        kind: 'deliver', at: plant, radius: 8, presence: 'inVehicle', items: ['test pressings'], cargo: true,
        text: 'Drive the pressings to the plant on Garvey Blvd (no hard hits)',
        banter: ['The first pothole is called Kevin. You hit Kevin. Kevin forgives you, once.', 'A bus honks. The records hold their breath.'],
        maxKmh: 85,
      },
    ],
    reward: { cash: 260, message: 'The plant tech: "Not a mark on them. Who drove this, a monk?"' },
    retryHint: 'the crate is back on the shelf',
  };
}

export function backRent(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const odette = facePoint(grid, 'r2c1', 'W', 0.56);
  const deli = poiSpot(ctx, 'troop-deli');
  const suv = facePoint(grid, 'r1c1', 'S', 0.3);
  const counter = facePoint(grid, 'r2c1', 'W', 0.4);
  return {
    id: 'back-rent', title: 'Back Rent', act: 1, requires: ['handle-with-care'],
    blurb: 'Odette is $900 short and the landlord does not take records. Pick how she gets whole, and who you owe afterwards.',
    giverPoi: 'wax-deli', giver: odette, triggerRadius: 4, timeLimit: 480,
    phoneIntro: { from: 'Ms. Odette', text: 'Come sit. I put a milk crate out. I have some news and it is the kind that likes company.' },
    failJoke: { timeUp: 'You stand outside the shop making a decision, the way a bank makes a decision. It is closed.' },
    followUps: [
      { from: 'Hobbs', text: 'Ms. Brathwaite is all squared. Wonderful. We should get coffee. I know a place. It used to be your barber.', delay: 90, ifFlag: F.ODETTE_FIXER },
      { from: 'Ms. Odette', text: 'You paid out of your own pocket? Baby. I am putting you in my will. The will is a record sleeve.', delay: 80, ifFlag: F.ODETTE_PAID },
    ],
    setFlags: [F.ACT2],
    objectives: [
      {
        kind: 'talkTo', at: odette, radius: 5, presence: 'onFoot', npc: 'Ms. Odette', text: 'Sit with Ms. Odette on the milk crate',
        lines: [
          'I owe nine hundred dollars on the shop. I should say it plainly. I owe more than that, but nine hundred is the part I can say.',
          'The notices came for two years. I put them in the jazz section. Nobody looks in jazz.',
          'If the shop goes, the block goes with it. It is the only room on Throop where nobody asks what you do for a living.',
        ],
        beat: { letterbox: 3 },
      },
      {
        kind: 'pay', at: deli, radius: 5, presence: 'any', amount: 40, prompt: 'Cover the light bill', text: 'Cover the light bill at Mohammed\'s counter (prepay, $40)',
        say: [{ who: 'Mohammed', text: 'Forty. Same envelope every month. She adds it to my tab, I add it to hers. We are an economy.' }],
      },
      {
        kind: 'fork', id: 'back-rent', presence: 'onFoot', text: 'Choose how Odette gets whole',
        say: [{ who: 'You', text: 'Two ways to find nine hundred dollars by midnight. One of them has a fleece vest on it.' }],
        options: [
          { label: 'Take Hobbs\'s envelope (+$1000, no questions, wink)', at: suv, radius: 4, flag: F.ODETTE_FIXER, cash: 1000, doneMessage: 'Hobbs: "A little help between neighbours. We\'ll talk later. We always talk later."' },
          { label: 'Pay it out of your own pocket (-$150, sell the crate)', at: counter, radius: 4, flag: F.ODETTE_PAID, cash: -150, doneMessage: 'You sell the first-pressings crate to Odette\'s cousin. Your shoulders weigh less. Your wallet weighs less.' },
        ],
      },
      {
        kind: 'pay', when: { flag: F.ODETTE_FIXER }, at: odette, radius: 5, presence: 'any', amount: 900, prompt: 'Hand Odette the envelope', text: 'Hand Ms. Odette the envelope',
        say: [{ who: 'Ms. Odette', text: 'This envelope has a smell. It smells like a man who owns tablets.' }],
      },
      {
        kind: 'talkTo', when: { flag: F.ODETTE_FIXER }, at: odette, radius: 5, presence: 'onFoot', npc: 'Ms. Odette', text: 'Hear Odette take it',
        lines: ['I will take it. I will say thank you. Then I will want to wash my hands, and I do not have a laundromat that I trust.'],
      },
      {
        kind: 'talkTo', when: { flag: F.ODETTE_PAID }, at: odette, radius: 5, presence: 'onFoot', npc: 'Ms. Odette', text: 'Hear Odette take it',
        lines: ['That was your good crate, baby. The one with the first Black Uhuru pressing. You should not have.', 'I will keep a seat for you at the counter until the day they take the counter.'],
      },
    ],
    reward: { cash: 150, message: 'It buys the shop a month. Odette says a month is a long time to a record.' },
    retryHint: 'the milk crate is still out',
  };
}
