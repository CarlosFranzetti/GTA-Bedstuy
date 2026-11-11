/**
 * ACT II: "The Vest Comes Out". The block learns who is buying it and what they are using to do it.
 * Mechanics: stealth tail, stakeout with photos, on-foot escort, repo + getaway + fork, box truck crate run with a cutscene.
 */
import type { MissionDef } from '../../types';
import { F } from '@/game/story/flags';
import { corner, facePoint, offset, poiSpot, streetMid, type PlaceCtx } from '../places';

export function fleeceVest(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const yossi = facePoint(grid, 'r0c0', 'E', 0.2);
  const komat = poiSpot(ctx, 'komat', 16);
  const route = [corner(grid, 'tompkins', 'pulaski'), corner(grid, 'throop', 'pulaski'), streetMid(grid, 'throop', 'pulaski', 'kosciuszko'), komat];
  return {
    id: 'fleece-vest', title: 'Follow the Fleece Vest', act: 2, requires: ['back-rent'], availableHours: [9, 20],
    blurb: 'Yossi says Mr. Hobbs visits three properties every Tuesday, and the third is not a property. Follow him. Do not be seen.',
    giverPoi: 'funeral', giver: yossi, triggerRadius: 4, timeLimit: 400,
    phoneIntro: { from: 'Yossi', text: 'Mr. Hobbs does a round every Tuesday. The third stop is not on any property list. I can\'t follow him myself. I am not hiding anything. I am only very visible.' },
    failJoke: { spotted: 'Hobbs waves at your car. Hobbs knows. Hobbs sends a fruit basket, because Hobbs also knows that is worse.', lostTarget: 'You lose a man in a fleece vest on a street where everybody owns a fleece vest.' },
    followUps: [
      { from: 'Yossi', text: 'That third stop is a laundromat. It is where he takes money to be rinsed. I will make some calls. I will make them quietly, with a pen.', delay: 80 },
    ],
    objectives: [
      {
        kind: 'talkTo', at: yossi, radius: 5, presence: 'onFoot', npc: 'Yossi', text: 'Meet Yossi at the corner',
        lines: [
          'I am not a hero. I read documents. Twice. That is all I am.',
          'Mr. Hobbs works for a company whose name changes every quarter. My father owes them money. I owe my father a lot more.',
          'Take a car. Stay between fifteen and fifty metres behind. Any closer, he will make you. Any farther, he is just a man in a vest.',
        ],
      },
      { kind: 'enterVehicle', text: 'Get into a car, any car, and stay calm' },
      {
        kind: 'tail', route, speed: 7.5, maxDistance: 55, minDistance: 14, spotGrace: 2.5, grace: 6, target: 'Hobbs\'s grey crossover',
        text: 'Tail Hobbs\'s grey crossover, 15 to 50 m back',
        say: [{ who: 'Hobbs', text: 'Another Tuesday, another opportunity to listen to people.', at: 3 }],
        banter: ['It signals at every corner. It is the politest car you have ever hated.', 'Hobbs sips something in a metal cup. He is a man at peace with his choices.'],
        beat: { letterbox: 2 },
      },
      {
        kind: 'interact', at: komat, radius: 40, presence: 'any', prompt: 'Photograph the handoff', text: 'Photograph the handoff outside the laundromat',
        say: [
          { who: 'Hobbs', text: 'Doña Marisol. How are the machines?' },
          { who: 'Doña Marisol', text: 'Clean, Mr. Hobbs. Always clean.', at: 3.4 },
          { who: 'Hobbs', text: 'That is what I like about you. Nothing ever shows.', at: 6.8 },
        ],
        doneMessage: 'Three seconds of video. A duffel bag the same colour as the one you hauled in the spring.',
      },
      { kind: 'escapeRadius', from: komat, radius: 70, stayInVehicle: 8, text: 'Roll away before he looks up' },
    ],
    reward: { cash: 240, message: 'Yossi: "I have been waiting four years for someone to be quiet at the right moment."' },
    retryHint: 'Hobbs is still on his round',
  };
}

export function openHouse(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const studio = poiSpot(ctx, 'condo');
  const office = streetMid(grid, 'pulaski', 'tompkins', 'throop');
  const faces = [offset(office, -9, 8), offset(office, 5, -9), offset(office, 11, 7)];
  return {
    id: 'open-house', title: 'Open House, Closed Door', act: 2, requires: ['fleece-vest'], availableHours: [10, 22],
    blurb: 'Hallie and Bryce want to "observe the energy" outside the Parallax pop-up leasing office. Sit there. Photograph the visitors. Do not blink.',
    giverPoi: 'condo', giver: studio, triggerRadius: 4, timeLimit: 330,
    phoneIntro: { from: 'Hallie', text: 'Hi!! Bryce and I keep seeing men with clipboards at the pop-up on Pulaski and honestly it feels like a lot of energy. Could you just... sit near it?? We will pay in oat-milk vouchers.' },
    failJoke: { blownCover: 'You left your post for a falafel. The leasing office notices. The falafel was fine.', copsCalled: 'Loitering. A cop asks if you are "with the wellness thing". You say yes. You are now with the wellness thing.' },
    followUps: [{ from: 'Hallie', text: 'okay so I looked at our window decal again. it says COMMUNITY PARTNER. is that... a contract?? Bryce says it is a font.', delay: 60 }],
    objectives: [
      {
        kind: 'talkTo', at: studio, radius: 5, presence: 'onFoot', npc: 'Hallie', text: 'Meet Hallie and Bryce at Stillwater Collective',
        lines: [
          'We offer a sliding scale for sound, breath, and grief. Mostly grief, lately.',
          'Bryce is parked outside. The van has a plant in it. The plant is called Gerald. Not that Gerald.',
          'We just want to know whose energy it is. Is that a thing you can... find out?',
        ],
      },
      {
        kind: 'stakeout', at: office, radius: 15, seconds: 70, slack: 8, presence: 'any', failIfStars: 1,
        text: 'Keep watch on the pop-up leasing office (stay near, stay calm)',
        events: [
          { at: 12, text: 'A man in a fleece vest enters. His tote bag says LISTEN.' },
          { at: 30, text: 'Hobbs arrives. He is eating a salad out of a jar with a fork he brought from home.' },
          { at: 52, text: 'A woman in a raincoat enters carrying a pizza box. It is a police sergeant. You can tell by the lanyard and the grief.' },
        ],
        say: [{ who: 'Bryce', text: 'Just sit. Breathe. Notice the clipboards. Do not judge the clipboards.', at: 2 }],
        beat: { letterbox: 2 },
      },
      {
        kind: 'spots', points: faces, radius: 12, presence: 'any', prompt: 'Take the photo', item: 'photo', timeLimit: 60,
        text: 'Photograph the three visitors as they leave',
        banter: ['The first visitor is Hobbs. He poses. He poses like a man who has been photographed for years.'],
      },
      {
        kind: 'talkTo', at: studio, radius: 5, presence: 'onFoot', npc: 'Hallie', text: 'Show Hallie the photos',
        lines: [
          'That is... our logo. In their window. They said it was a decal for local businesses.',
          'Babe, they said "community partner" and I thought it meant we were, like, partners.',
          'It says here our lease is non-renewing on the first. We are the next ones, Bryce. We are the people we were worried about.',
        ],
        doneMessage: 'Bryce, softly: "I did read it. The font looked trustworthy."',
      },
    ],
    reward: { cash: 260, message: 'Hallie pays you in oat-milk vouchers and one genuine, slightly damp hug.' },
    retryHint: 'the clipboards are still there',
  };
}

export function walkDeeHome(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const studio = facePoint(grid, 'r3c0', 'W', 0.5);
  const home = facePoint(grid, 'r2c0', 'E', 0.8);
  const route = [studio, corner(grid, 'tompkins', 'lafayette'), corner(grid, 'throop', 'lafayette'), home];
  return {
    id: 'walk-dee-home', title: 'Walk Dee Home', act: 2, requires: ['open-house'], availableHours: [20, 3],
    blurb: 'Dee has a session that ran late and a car has been idling outside the studio. You are walking her home, on foot, close enough to hear her breathe.',
    giverPoi: 'braids', giver: studio, triggerRadius: 4, timeLimit: 330,
    phoneIntro: { from: 'Dee', text: 'hi its dee. the studio session ran late and theres a car outside that has been there since 9. can you walk me. my grandma will kill me. she will also kill the car' },
    failJoke: { lostTarget: 'You lose a teenager on a block where she has lived her entire life. She texts "lol where r u".', copsCalled: 'The sirens make Dee jump. She grabs the nearest brownstone railing and holds on like it is a mic stand.' },
    followUps: [
      { from: 'Dee', text: 'ok so i played the jingle back at 0.5x speed. it sounds like a funeral. i am keeping it.', delay: 70 },
      { from: 'DJ Sloth', text: 'You walked her home? Good. She does not know I know about the jingle. Leave it. We will use it.', delay: 150 },
    ],
    setFlags: [F.DEE_BEAT],
    objectives: [
      {
        kind: 'tail', route, speed: 2.2, maxDistance: 22, waitDistance: 9, grace: 10, target: 'Dee', text: 'Walk Dee home, stay within a few steps of her',
        failIfStars: 1,
        say: [
          { who: 'Dee', text: 'You know that jingle in the Parallax ads? "Stoop, stoop, stoop-oop-oop"?', at: 4 },
          { who: 'Dee', text: 'That\'s my beat. I sold it to a sync agency for three hundred dollars. I thought it was a gig.', at: 11 },
          { who: 'Dee', text: 'Now it\'s on every bus. My grandmother hums it at church. Please do not tell her.', at: 19 },
        ],
        banter: ['A grey car idles at the corner with its lights off. Then on. Then off. It is not subtle. It is not trying to be.', 'Dee: "If they get out, I walk faster. You walk faster too. That is the plan."'],
        beat: { letterbox: 2 },
      },
      {
        kind: 'talkTo', at: home, radius: 5, presence: 'onFoot', npc: 'Mrs. Okafor', text: 'Hand Dee to her grandmother',
        lines: [
          'Where was she. Where was she, and who was she with. Oh. You. Good. Come in, I have jollof.',
          'She hums that jingle in the kitchen. She does not know it is hers. I do not have the heart to tell her what it is.',
        ],
      },
    ],
    reward: { cash: 230, message: 'Mrs. Okafor sends you off with a foil tray the size of a hubcap.' },
    retryHint: 'the car is still idling',
  };
}

export function repoTheRepo(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const tay = facePoint(grid, 'r4c0', 'E', 0.45);
  const lot = facePoint(grid, 'r4c0', 'S', 0.6);
  const yard = facePoint(grid, 'r3c1', 'S', 0.7);
  return {
    id: 'repo-the-repo', title: 'Repo the Repo', act: 2, requires: ['walk-dee-home', 'laundromat-getaway'],
    blurb: 'Hobbs\'s crew repossessed Tay\'s beater to pay a debt Tay won\'t name. Take it back from the Parallax lot, and decide where it goes next.',
    giverPoi: 'liquor', giver: tay, triggerRadius: 4, timeLimit: 420,
    phoneIntro: { from: 'Tay', text: 'bro they took Gladys. my car. the beater. its in a lot behind the new building with a rope around it. i dont have a plan. i have a screwdriver.' },
    failJoke: { copsCalled: 'The alarm on a car that is not Gladys goes off. A second alarm answers. You have started a choir.', leftVehicle: 'You abandon Gladys at a red light. Gladys does not forgive.' },
    followUps: [
      { from: 'Tay', text: 'you didnt have to do that. ill pay you back. (he will not pay you back)', delay: 80, ifFlag: F.TAY_RETURNED },
      { from: 'Hobbs', text: 'A pleasure doing business. Tay\'s car found a good home. Tay has been told it was a mix-up in the paperwork. People believe paperwork.', delay: 80, ifFlag: F.TAY_SOLD },
    ],
    objectives: [
      {
        kind: 'talkTo', at: tay, radius: 5, presence: 'onFoot', npc: 'Tay', text: 'Hear what Tay owes and to whom',
        lines: [
          'It is a small thing. It is thirty-one hundred dollars. And a little more. And a little more than that.',
          'I told them about the people who were behind on rent. Not names. Just... who is who. They said it would help the block.',
          'Do not look at me like that. You are the one who left. I had to be here.',
        ],
      },
      { kind: 'goTo', at: lot, radius: 6, presence: 'onFoot', failIfStars: 1, text: 'Sneak into the Parallax lot behind the new building' },
      {
        kind: 'interact', at: lot, radius: 6, presence: 'onFoot', prompt: 'Pop the lock', presses: 3, text: 'Pop Gladys\'s lock with Tay\'s screwdriver',
        banter: ['It has a lock the size of a quarter. It has a quarter in the lock.'], raiseWantedTo: 1,
        doneMessage: 'The alarm yelps once. It is a brave alarm. It is also late.',
      },
      { kind: 'enterVehicle', vehicle: ['beater'], text: 'Get into Gladys (any car will do after a minute)' },
      { kind: 'escapeRadius', from: lot, radius: 120, stayInVehicle: 8, text: 'Roll out of the lot (no stopping, no stalling)' },
      { kind: 'loseWanted', stayInVehicle: 10, text: 'Lose the heat' },
      {
        kind: 'fork', id: 'repo-fork', presence: 'inVehicle', text: 'Decide where Gladys goes',
        say: [{ who: 'You', text: 'Gladys idles. In the rear-view, Tay\'s whole life, with a broken tail light.' }],
        options: [
          { label: 'Roll Gladys back to Tay', at: tay, radius: 6, flag: F.TAY_RETURNED, doneMessage: 'Tay stands there for a long time, hand on the roof, like it is a horse.' },
          { label: 'Sell Gladys to the Parallax yard guy (+$500)', at: yard, radius: 6, flag: F.TAY_SOLD, cash: 500, doneMessage: 'The yard guy counts out five hundreds. He has a clipboard for the money. Of course he does.' },
        ],
      },
    ],
    reward: { cash: 200, message: 'You are down one friendship or up one car. The ledger refuses to say which.' },
    retryHint: 'Gladys is still behind the rope',
  };
}

export function crateExpectations(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const odette = facePoint(grid, 'r2c1', 'S', 0.05);
  const crates = [facePoint(grid, 'r2c1', 'W', 0.28), facePoint(grid, 'r2c1', 'W', 0.62), facePoint(grid, 'r2c0', 'E', 0.5), facePoint(grid, 'r2c0', 'E', 0.15), facePoint(grid, 'r1c1', 'W', 0.8), facePoint(grid, 'r1c1', 'W', 0.45)];
  const storage = facePoint(grid, 'r0c1', 'E', 0.5);
  return {
    id: 'crate-expectations', title: 'Crate Expectations', act: 2, requires: ['repo-the-repo'], availableHours: [8, 18],
    blurb: 'The marshal arrives at six to lock Odette out. Six crates of records are on the pavement. Get them into a truck and out of the block.',
    giverPoi: 'wax-deli', giver: odette, triggerRadius: 4, timeLimit: 330, deadlineHour: 18,
    phoneIntro: { from: 'Ms. Odette', text: 'The marshal comes at six. I would like my records on a truck by then, and I would like to be sitting on a milk crate looking dignified.' },
    failJoke: { timeUp: 'The shutter closes with records still inside. A man puts a sticker over the lock. It says THANK YOU FOR PARTNERING.', tooFast: 'The crates slide into each other. Miles Davis is now touching Bunny Wailer. Odette is not ready.' },
    followUps: [
      { from: 'Ms. Odette', text: 'I am staying with Gloria. Thirty-eight years, and it fits in a milk crate. I am not going to look at it again.', delay: 80, ifFlag: F.ODETTE_PAID },
      { from: 'Hobbs', text: 'We have taken a keen interest in preserving Odette\'s legacy. The legacy will be on display in a vitrine. A vitrine is a nice box.', delay: 80, ifFlag: F.ODETTE_FIXER },
    ],
    setFlags: [F.ODETTE_EVICTED],
    objectives: [
      {
        kind: 'talkTo', at: odette, radius: 5, presence: 'onFoot', npc: 'Ms. Odette', text: 'Hear Odette\'s plan',
        lines: ['They sent me a letter that said "we regret to inform you" and then did not regret it.', 'The crates are on the sidewalk. The truck is on the corner. Be quick and be gentle. In that order.'],
      },
      { kind: 'enterVehicle', vehicle: ['boxtruck'], text: 'Take the box truck on the corner (any truck after a minute)' },
      {
        kind: 'collect', points: crates, radius: 6, presence: 'inVehicle', item: 'crate', text: 'Load six crates of records from the sidewalks (any order)',
        banter: ['Odette: "Not that one. That one is a pressing of a pressing of a mistake. Take it."'],
      },
      {
        kind: 'talkTo', when: { flag: F.ODETTE_FIXER }, at: crates[0], radius: 8, presence: 'any', npc: 'Hobbs', text: 'Say no to Hobbs\'s "helpful" van',
        lines: ['We can take those off your hands. Storage, at no charge. Parallax Living is passionate about preservation.', 'I will keep your records safe. I keep a lot of things safe. It is a gift and a curse.'],
      },
      {
        kind: 'deliver', at: storage, radius: 9, presence: 'inVehicle', items: ['crate', 'crate', 'crate', 'crate', 'crate', 'crate'], maxKmh: 70,
        text: 'Drive the crates to Yossi\'s empty garage (gently: under 70 km/h)',
      },
      {
        kind: 'talkTo', at: storage, radius: 6, presence: 'onFoot', npc: 'Yossi', text: 'Meet Yossi at the garage',
        lines: ['This garage is empty because my father forgot it. I have been paying the electric. He knows. He never mentions it. That is how we say love.', 'I leaked you the chart. The company on your notice is owned by a company that is owned by a man whose name is a bird.'],
      },
      {
        kind: 'timer', seconds: 7, text: 'Watch the shutter come down on Wax Deli',
        beat: { letterbox: 7 },
        say: [
          { who: 'Ms. Odette', text: 'Thirty-eight years. I opened it the week the other shop went. I had four records and a hot plate.' },
          { who: 'Ms. Odette', text: 'Keep the key. It does not open anything now. It opens something in me.', at: 4 },
        ],
      },
    ],
    reward: { cash: 300, message: 'Odette: "I never wanted a retirement party. I wanted a Tuesday."' },
    retryHint: 'the crates are back on the sidewalk',
  };
}
