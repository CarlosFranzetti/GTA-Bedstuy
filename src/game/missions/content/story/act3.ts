/**
 * ACT III: "Last Call on Throop". The consequences land: a friend on the floor, a fire, a name that should not be on the list,
 * and a night where the whole block gets to vote with its feet. Mechanics: timed emergency, fire evacuation + foot chase,
 * bus with fragile passengers and a fork, finale with a DJ set and a three-way ending fork.
 */
import type { MissionDef } from '../../types';
import { F } from '@/game/story/flags';
import { clubDoor, INTERIOR_CLUB, VENUE_CLUB } from '../djIds';
import { corner, facePoint, offset, poiSpot, streetMid, type PlaceCtx } from '../places';

export function nightOfTheNarcan(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const giver = facePoint(grid, 'r4c1', 'S', 0.2);
  const kit = poiSpot(ctx, 'liquor');
  const yard = offset(clubDoor(), -16, 0);
  void grid;
  return {
    id: 'night-of-the-narcan', title: 'Four Minutes', act: 3, requires: ['crate-expectations'], availableHours: [19, 5],
    blurb: 'Dee finds Tay on the floor of the club yard. The kit is at the liquor store. Four minutes, a siren, and somebody\'s hands.',
    giverPoi: 'dollar', giver, triggerRadius: 4, timeLimit: 240,
    phoneIntro: { from: 'Dee', text: 'tay is on the ground at the club yard. hes breathing wrong. they said the kit is at the liquor store by the register. please. please come.' },
    failJoke: { timeUp: 'Seconds matter. You get another run at it. The hands are steadier the second time.' },
    followUps: [
      { from: 'Mission Log', text: 'Tay is at Kings County. He is awake. He asked for his car.', delay: 60, ifFlag: F.TAY_SOLD },
      { from: 'Mission Log', text: 'Tay is at Kings County. He is awake. He asked for you.', delay: 60, ifFlag: F.TAY_RETURNED },
    ],
    setFlags: [F.ACT3, F.TAY_ALIVE],
    objectives: [
      {
        kind: 'pickUp', at: kit, radius: 5, presence: 'any', items: ['naloxone kit'], prompt: 'Take the kit from the register', timeLimit: 70,
        text: 'Grab the free kit at the liquor store register',
        say: [{ who: 'Dee', text: 'Hurry. He is gray. He is gray, he is not moving right.' }],
        beat: { letterbox: 3 },
      },
      { kind: 'goTo', at: yard, radius: 6, presence: 'any', timeLimit: 70, text: 'Get to the club yard, fast and in one piece', banter: ['Dee (text): "i can see the lights from the corner. hurry."'], doneMessage: 'You skid in. Dee is on her knees on the concrete, hands shaking.' },
      { kind: 'interact', at: yard, radius: 5, presence: 'onFoot', prompt: 'Give the dose', presses: 2, text: 'Give Tay the dose', say: [{ who: 'Dee', text: 'Tilt his head. Like the video. Like the video, like the video.' }] },
      { kind: 'interact', at: yard, radius: 5, presence: 'onFoot', prompt: 'Stay with him, keep him breathing', presses: 8, text: 'Stay with him: keep him breathing', banter: ['Dee: "Come on, Tay. Come on, come on."'] },
      {
        kind: 'holdSpeedBelow', at: yard, radius: 8, kmh: 4, seconds: 12, text: 'Wait for the ambulance; do not leave him',
        say: [
          { who: 'Paramedic', text: 'Okay. Okay. You did the right thing. That is the third one on this block tonight.' },
          { who: 'Paramedic', text: 'Is this the friend? He is going to be okay. He is going to be very tired. Be there when he wakes.', at: 6 },
        ],
        beat: { letterbox: 6 },
      },
      {
        kind: 'talkTo', when: { flag: F.TAY_RETURNED }, at: yard, radius: 6, presence: 'onFoot', npc: 'Tay', text: 'Sit with Tay in the ambulance',
        lines: ['You brought my car back. And I did this. In your face.', 'I am not asking you to forgive me. I am asking you not to leave the room.'],
      },
      {
        kind: 'talkTo', when: { flag: F.TAY_SOLD }, at: yard, radius: 6, presence: 'onFoot', npc: 'Tay', text: 'Sit with Tay in the ambulance',
        lines: ['Hobbs told me my car got "relocated". He said it twice, like it was a prayer.', 'I am not mad. I would be if I could feel my arms. Do not go anywhere.'],
      },
    ],
    reward: { cash: 50, message: 'Dee presses fifty dollars into your hand for gas. You do not remember agreeing to take it.' },
    retryHint: 'Dee is still calling',
  };
}

export function smokeSignals(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const giver = facePoint(grid, 'r2c0', 'E', 0.62);
  const doors = [0.5, 0.62, 0.74, 0.86, 0.96].map((t) => facePoint(grid, 'r2c1', 'W', t));
  const cat = facePoint(grid, 'r2c1', 'W', 0.44);
  const alley = [offset(facePoint(grid, 'r2c1', 'W', 0.98), 3, 8), offset(facePoint(grid, 'r2c1', 'S', 0.04), 20, 25), offset(facePoint(grid, 'r2c1', 'S', 0.04), 60, 50), offset(facePoint(grid, 'r2c1', 'S', 0.04), 90, 20)];
  const kowalski = facePoint(grid, 'r3c0', 'E', 0.85);
  return {
    id: 'smoke-signals', title: 'Smoke Signals', act: 3, requires: ['night-of-the-narcan'], availableHours: [0, 6],
    blurb: 'Fire at Auntie G\'s building at three in the morning. Nine households, one cat, one kid with a lighter, and a form with a form.',
    giverPoi: 'funeral', giver, triggerRadius: 4, timeLimit: 360,
    phoneIntro: { from: 'Mohammed', text: 'Auntie\'s building is on fire. I called it in. Come. I am shutting my shop and I am coming. I never shut my shop.' },
    failJoke: { timeUp: 'The stairs close with doors still unopened. You do not get another number three, but you get another go.' },
    followUps: [
      { from: 'Mohammed', text: 'I have fourteen months of tape in the back. My cameras saw the vest at night, three times. I have not told anyone because I was waiting for a better moment. This is the better moment.', delay: 80 },
      { from: 'Auntie G', text: 'I want to say something and I do not have a voice for it. I kept the buyout letters in a shoebox. Nine of them. I should have given them to everyone. Come see me.', delay: 160 },
    ],
    setFlags: [F.FIRE_LOG, F.AUNTIE_BURNED, F.FOOTAGE],
    objectives: [
      {
        kind: 'spots', points: doors, radius: 4, presence: 'onFoot', prompt: 'Bang on the door', item: 'door', ordered: true, timeLimit: 90, text: 'Bang on every door on Auntie\'s stoop, top floor to the stoop',
        say: [
          { who: 'Auntie G', text: 'Everyone out! Every door! Do not take the elevator! There is no elevator! Take the stairs!' },
          { who: 'Neighbour', text: 'My cat. My baby. My cat.', at: 6 },
        ],
        beat: { letterbox: 4 },
      },
      { kind: 'pickUp', at: cat, radius: 4, presence: 'onFoot', items: ['a very angry cat'], prompt: 'Grab the cat', timeLimit: 30, text: 'Grab the cat under the stoop', doneMessage: 'The cat has opinions. You carry it anyway. It is Senator, and he is fine.' },
      { kind: 'deliver', at: giver, radius: 5, presence: 'onFoot', items: ['a very angry cat'], text: 'Hand the cat to the neighbours across the street' },
      {
        kind: 'chase', route: alley, speed: 5.2, catchRadius: 3.2, target: 'the kid from the alley', stumbles: [{ at: 0.25, pause: 2.2 }, { at: 0.6, pause: 2.2 }], failIfStars: 3,
        text: 'Chase the kid who ran from the alley',
        say: [{ who: 'Mohammed', text: 'He had a lighter! I saw him! Left by the dumpster! Go go go go!' }],
        banter: ['He is in a Parallax-branded fleece. It is too big. He has the sleeves rolled up like a man preparing to be forgiven.'],
      },
      {
        kind: 'talkTo', at: alley[alley.length - 1], radius: 8, presence: 'onFoot', npc: 'Kyle', text: 'Hear the kid out',
        lines: [
          'I was told it was a "controlled clean-up". I get two hundred dollars. I was told by a guy, who was told by a guy.',
          'The first guy had a fleece vest. He said it was a trash fire. Trash fires do not have stairs.',
          'I am eighteen. I did not know there were people inside. Please, I did not know.',
        ],
        grant: ['lighter receipt'],
      },
      {
        kind: 'talkTo', at: kowalski, radius: 6, presence: 'onFoot', npc: 'Sgt. Kowalski', text: 'Give your statement to Sergeant Kowalski',
        lines: [
          'I need your name. And then I need the name of the form. The form is 61-Q. It is a Report of an Incident Report.',
          'No, I do not know who files the Incident Report. I file the Report of the Incident Report. It is a different drawer.',
          'Here. The fire marshal\'s log. It was in a pizza box. Nobody opens a pizza box. Eleven days until my pension. Do not tell me what is in it.',
        ],
        doneMessage: 'You walk away with a pizza box and a form with a form.',
      },
    ],
    reward: { cash: 350, message: 'Auntie G: "I will remember this when I remember anything. For now I remember the smell."' },
    retryHint: 'the doors are still closed',
  };
}

export function boroughHallExpress(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const giver = facePoint(grid, 'r3c1', 'S', 0.5);
  const stops = [facePoint(grid, 'r3c1', 'W', 0.5), facePoint(grid, 'r2c0', 'E', 0.7), facePoint(grid, 'r1c1', 'W', 0.5), facePoint(grid, 'r0c1', 'W', 0.5)];
  const hall = corner(grid, 'garvey', 'hart');
  const press = offset(hall, -22, 10);
  const bay = offset(hall, -22, -14);
  return {
    id: 'borough-hall-express', title: 'Borough Hall Express', act: 3, requires: ['smoke-signals'], availableHours: [6, 9], deadlineHour: 9,
    blurb: 'The tenants\' hearing is at nine. Thirty-one neighbours need a ride. You have a bus, a schedule that does not exist, and one name that should not be on the list.',
    giverPoi: 'golden', giver, triggerRadius: 4,
    fragile: { label: 'Passengers', hp: 100, minImpact: 2, perImpact: 2.2 },
    phoneIntro: { from: 'Yossi', text: 'Hearing at nine. Housing court wants to see the tenants. They do not have rides. I can make a phone call to a man with a bus. I do not know the man. I know his bus.' },
    failJoke: { cargoBroken: 'The passengers file a collective complaint. It is shorter than the one they filed against the landlord.', clockUp: 'The hearing starts at nine. You arrive at 9:01, with thirty-one people and a parking ticket.' },
    followUps: [
      { from: 'Auntie G', text: 'We were thirty-one on that bus. We were thirty-one in the room. They counted us. A man wrote a number down. I hope he writes it big.', delay: 80 },
      { from: 'Mr. Alvin', text: 'I wish to enter into the record that I have a statement to make. I will be making it in the parking lot. Please do not applaud.', delay: 140, ifFlag: F.ALVIN_SPARED },
      { from: 'Mr. Alvin', text: 'I said what I said, and I would say it again, and I will not be saying anything else for a week.', delay: 140, ifFlag: F.ALVIN_EXPOSED },
    ],
    objectives: [
      {
        kind: 'enterVehicle', vehicle: ['bus'], text: 'Commandeer the bus on the corner (the driver is in a diner; any big vehicle will do after a minute)',
        say: [{ who: 'Yossi', text: 'It is a bus. You press the large pedal. Please do not press it in any hurry.' }],
      },
      {
        kind: 'collect', points: stops, radius: 8, presence: 'inVehicle', item: 'neighbour', cargo: true, text: 'Pick up neighbours at four stoops (go gently; stop is optional, neatness is not)',
        banter: ['Stop three: "Is this the 38? No? Then why does it have a 38 on it?"', 'A woman gets on with a casserole. Casseroles are evidence.'],
        maxKmh: 70,
      },
      {
        kind: 'timer', seconds: 8, cargo: true, text: 'Auntie G reads the list aloud as the bus rolls',
        beat: { letterbox: 8 },
        say: [
          { who: 'Auntie G', text: 'Okay. I have the list of buildings with air-rights agreements on file. Yossi brought the paper.', at: 1 },
          { who: 'Auntie G', text: '421 Throop. 433 Throop. 437 Throop. Names. Greaves. Greaves.', at: 5 },
          { who: 'Mr. Alvin', text: '...Gloria. I can explain. I would like to explain at the right moment.', at: 9 },
        ],
      },
      {
        kind: 'fork', id: 'alvin-fork', presence: 'inVehicle', text: 'Decide how to handle Mr. Alvin',
        options: [
          { label: 'Pull up at the press line and say it out loud', at: press, radius: 8, flag: F.ALVIN_EXPOSED, doneMessage: 'You say it into a microphone shaped like a lollipop. Alvin closes his eyes.' },
          { label: 'Park in the loading bay and let Alvin testify first', at: bay, radius: 8, flag: F.ALVIN_SPARED, doneMessage: 'You park. Alvin takes a long breath through his nose. "I wanted to be the man who stopped it."' },
        ],
      },
      {
        kind: 'talkTo', when: { flag: F.ALVIN_EXPOSED }, at: hall, radius: 30, presence: 'any', npc: 'Mr. Alvin', text: 'Hear Mr. Alvin out',
        lines: ['In March I signed. For Marguerite\'s hospital bill. I wanted to fight, and I wanted to pay. I could do one.', 'I have been standing at that microphone for nineteen years so nobody would notice I sold the floor.'],
      },
      {
        kind: 'talkTo', when: { flag: F.ALVIN_SPARED }, at: hall, radius: 30, presence: 'any', npc: 'Mr. Alvin', text: 'Hear Mr. Alvin out',
        lines: ['Thank you for the loading bay. I will say it. I will say it on the record, in my own voice, with the timer running.', 'The man who stopped it is not a man who signed. I know. I am going to be the man who undid it.'],
      },
    ],
    reward: { cash: 380, message: 'The hearing officer counts thirty-one people and writes it down. Nobody has ever written down thirty-one before.' },
    retryHint: 'the bus is still at the stop',
  };
}

export function lastCallOnThroop(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const giver = facePoint(grid, 'r1c1', 'S', 0.08);
  const door = clubDoor();
  const billboard = streetMid(grid, 'throop', 'kosciuszko', 'lafayette');
  const checkpoint = corner(grid, 'garvey', 'greene');
  const deed = facePoint(grid, 'r2c1', 'W', 0.56);
  void ctx;
  return {
    id: 'last-call-on-throop', title: 'Last Call on Throop', act: 3, requires: ['borough-hall-express', 'aftersloth-residency'], availableHours: [20, 4],
    blurb: 'Midnight. The Stoopable billboard goes live over Throop and the room next door is Sloth\'s last. Play the set, then decide what the block is worth.',
    giverPoi: 'funeral', giver, triggerRadius: 4,
    phoneIntro: { from: 'DJ Sloth', text: 'Midnight. The whole block, and a billboard, and a man with a check. I need you in the booth. I need your ears, if you can spare them.' },
    failJoke: { lowScore: 'The room walks out and takes the bass with it. The bass was the only thing holding the building up.', copsCalled: 'The cops arrive in a van that says COMMUNITY SAFETY on the side. It is not a joke. It is a van.' },
    followUps: [
      { from: 'Ms. Odette', text: 'Gloria and I are going to run the old Wax Deli out of the land trust basement. We have a name. It is "Wax Deli, But Nobody Can Evict It Now."', delay: 90, ifFlag: F.END_TRUST },
      { from: 'Hobbs', text: 'Congratulations on your acquisition. Please take care of the heat. I know a guy. I am the guy.', delay: 90, ifFlag: F.END_LANDLORD },
      { from: 'Pryce', text: 'Thank you for choosing to move forward. Your sublet is in the sky. The sky has a nice lobby.', delay: 90, ifFlag: F.END_BUYOUT },
      { from: 'DJ Sloth', text: 'I could not hear a single note, you know. I watched the room. The room told me. Thank you for being my ears.', delay: 150 },
    ],
    setFlags: [F.DONE],
    objectives: [
      {
        kind: 'timer', seconds: 8, text: 'Throop, midnight: the billboard goes live',
        beat: { letterbox: 8 },
        say: [
          { who: 'Pryce', text: 'Good evening, Throop. Tonight we unlock a frictionless block. Stoopable. Free, with a subscription.', at: 0 },
          { who: 'Hobbs', text: 'I grew up three blocks from here. I want you to know I am sorry, and I want you to know I am staying.', at: 3.6 },
          { who: 'DJ Sloth', text: 'Come on, kid. The room is waiting. I will be right behind you. Louder than I can hear.', at: 6.4 },
        ],
      },
      { kind: 'enterInterior', id: INTERIOR_CLUB, at: door, radius: 4, text: 'Slip inside Aftersloth' },
      {
        kind: 'djSet', venue: VENUE_CLUB, minutes: 2, minScore: 55, text: 'Play the last set (score 55+): be Sloth\'s ears',
        say: [{ who: 'DJ Sloth', text: 'Watch their feet. If they move, you are right. If they don\'t, you are right louder.' }],
      },
      { kind: 'exitInterior', id: INTERIOR_CLUB, at: door, radius: 4, text: 'Step out onto Throop; the billboard is waiting' },
      {
        kind: 'fork', id: 'ending', presence: 'onFoot', text: 'Decide what the block gets',
        say: [{ who: 'You', text: 'The screen. The check. The deed. The block is a hand of cards, and you are holding the last three.' }],
        options: [
          { label: 'Hijack the billboard: show the footage, the fire log and the names', at: billboard, radius: 8, flag: F.END_TRUST, doneMessage: 'The billboard goes dark, then it goes honest.' },
          { label: 'Take Pryce\'s buyout (+$2500) and the sublet in the sky', at: checkpoint, radius: 8, flag: F.END_BUYOUT, cash: 2500, doneMessage: 'You sign on a tablet. The tablet says THANK YOU in six fonts.' },
          { label: 'Use Hobbs\'s money to buy the building yourself', when: { flag: F.ODETTE_FIXER }, at: deed, radius: 6, flag: F.END_LANDLORD, doneMessage: 'You sign a deed with a pen that is heavier than it should be.' },
        ],
      },
      { kind: 'goTo', when: { flag: F.END_TRUST }, at: billboard, radius: 8, presence: 'onFoot', raiseWantedTo: 2, text: 'Plug the stream in and run before the cops arrive', doneMessage: 'The screen shows nine tenants and a fire marshal\'s log. A crowd gathers. The cops are somewhere behind it.' },
      { kind: 'loseWanted', when: { flag: F.END_TRUST }, text: 'Lose the cops' },
      { kind: 'timer', when: { flag: F.END_TRUST }, seconds: 7, text: 'The block watches', beat: { letterbox: 7 }, say: [
        { who: 'Auntie G', text: 'That is my building. That is my face. That is my building, and my face, and my name on a screen the size of a church.' },
        { who: 'Mr. Alvin', text: 'The timer is running. I have never been so happy to be out of time.', at: 4 },
      ] },
      { kind: 'goTo', when: { flag: F.END_BUYOUT }, at: checkpoint, radius: 8, presence: 'any', text: 'Walk to the car with the check' },
      { kind: 'timer', when: { flag: F.END_BUYOUT }, seconds: 7, text: 'The check clears', beat: { letterbox: 7 }, say: [
        { who: 'Pryce', text: 'Thank you for moving forward with us. Your new home has an amenity floor.' },
        { who: 'You', text: 'In the rear-view, the stoop shrinks. The stoop gets smaller than a stamp. The stoop does not wave.', at: 4 },
      ] },
      { kind: 'interact', when: { flag: F.END_LANDLORD }, at: deed, radius: 6, presence: 'onFoot', prompt: 'Sign the deed', presses: 3, text: 'Sign the deed (three times, in triplicate)' },
      { kind: 'timer', when: { flag: F.END_LANDLORD }, seconds: 7, text: 'The keys are yours', beat: { letterbox: 7 }, say: [
        { who: 'Hobbs', text: 'Welcome to the other side of the clipboard. The clipboard is lighter than you think. It gets heavier.' },
        { who: 'You', text: 'Somebody on the stoop says "landlord" the way you used to say "weather".', at: 4 },
      ] },
    ],
    reward: { cash: 800, message: 'DJ Sloth: "You did what you had to. I will remember it in the half of my hearing that works."' },
    retryHint: 'the room is still waiting',
  };
}
