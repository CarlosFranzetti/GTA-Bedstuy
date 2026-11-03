/**
 * The six BIBLE section 4 concepts. Parody only: no real people or businesses, nobody gets hurt; the worst thing
 * that happens is a noise complaint. Coordinates come from the world data (places.ts).
 */
import type { MissionDef } from '../types';
import { corner, facePoint, poiSpot, streetMid, type PlaceCtx } from './places';

/** Mr. Alvin's double-parked Buick, a street sweeper at 09:30 and five cars that were already circling. */
export function alternateSideShuffle(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const alvin = facePoint(grid, 'r1c0', 'E', 0.5);
  const owner = facePoint(grid, 'r1c0', 'E', 0.85);
  const newSpot = facePoint(grid, 'r3c0', 'E', 0.5);
  return {
    id: 'alternate-side-shuffle',
    title: 'Alternate-Side Shuffle',
    blurb: 'Mr. Alvin has been double-parked for forty minutes. The street sweeper is coming. Move five cars.',
    giverPoi: 'oxtail',
    giver: alvin,
    triggerRadius: 4,
    availableHours: [7, 10],
    timeLimit: 240,
    phoneIntro: { from: 'Mr. Alvin', text: 'The sweeper comes at 9:30 and I am NOT moving. You have a car? Five cars need a legal spot. I will supervise from the Buick.' },
    twist: { at: 3, text: 'Every spot you freed has been taken by a car that was already circling. Follow the sweeper and see where it ends up.' },
    failJoke: {
      timeUp: 'The sweeper arrives. The street is clean. You are not.',
      lostTarget: 'You lost a street sweeper. It moves at the speed of a sleepy turtle.',
    },
    followUp: { from: 'Mr. Alvin', text: 'Your spot is now my spot. Thank you for your service.', delay: 75 },
    objectives: [
      { kind: 'enterVehicle', text: "Get in a car, any car. Alvin's keys are in the visor.", banter: ['Alvin: "Do not touch the radio. It is on the station it is on."'] },
      {
        kind: 'collect', points: [streetMid(grid, 'pulaski', 'tompkins', 'throop'), streetMid(grid, 'pulaski', 'throop', 'garvey'),
          streetMid(grid, 'kosciuszko', 'throop', 'garvey'), streetMid(grid, 'kosciuszko', 'tompkins', 'throop'), streetMid(grid, 'throop', 'pulaski', 'kosciuszko')],
        radius: 7, presence: 'inVehicle', item: 'car moved', text: 'Nudge five cars into legal spots (any order)',
        banter: ['Alvin: "The Corolla goes in the gap. The gap is a hydrant. Close enough."', 'Alvin: "Four minutes! Time is a flat circle with a sweeper in it."'],
      },
      { kind: 'talkTo', at: owner, radius: 4, presence: 'onFoot', npc: 'Mrs. Okafor', text: 'Wake the owner of the last car', lines: ['Five more minutes.', 'Oh. The sweeper. Why did nobody say?', 'Move the car yourself, baby. I am in the middle of a dream about Barbados.'] },
      {
        kind: 'tail', route: [corner(grid, 'throop', 'pulaski'), corner(grid, 'throop', 'kosciuszko'), corner(grid, 'throop', 'lafayette'), { x: 0, z: 190 }],
        speed: 6.5, maxDistance: 45, target: 'street sweeper', text: 'Follow the sweeper and grab the spots it frees',
        banter: ['Alvin: "It does not even sweep! It just threatens."'],
      },
      { kind: 'goTo', at: newSpot, radius: 9, presence: 'any', text: "Park Alvin's Buick in the one spot nobody wants", doneMessage: 'A spot. Next to a hydrant. Alvin calls it a win.' },
    ],
    reward: { cash: 120, message: 'Alvin: "I will remember this at the next block association meeting."' },
    retryHint: 'the Buick is still in the way',
  };
}

/** Two stoops, two speakers, one extension cord. The rival is Auntie's sister. */
export function soundclash(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const auntie = facePoint(grid, 'r2c1', 'W', 0.78);
  const rival = facePoint(grid, 'r3c1', 'W', 0.45);
  return {
    id: 'soundclash',
    title: 'Soundclash',
    blurb: "Two stoops, two speakers, one block. Auntie wants the playing field 'evened'. Quietly.",
    giverPoi: 'oxtail',
    giver: auntie,
    triggerRadius: 4,
    availableHours: [18, 21],
    timeLimit: 260,
    phoneIntro: { from: 'Auntie', text: 'That woman across the street has a bigger speaker than me. Get me a cord, change her playlist, and for the love of God do not let anyone call the cops.' },
    twist: { at: 3, text: 'The rival DJ is Auntie\'s sister Lorraine. They have not spoken since 1998. It is about a casserole dish.' },
    failJoke: {
      copsCalled: 'Noise complaint: one star and a lecture from a lady in a bathrobe.',
      timeUp: 'Both speakers go quiet. Peace breaks out. Disgusting.',
    },
    followUp: { from: 'Auntie', text: 'We are speaking again. Do not tell your cousin.', delay: 80 },
    objectives: [
      { kind: 'pickUp', at: poiSpot(ctx, 'dollar'), radius: 5, presence: 'any', items: ['extension cord'], text: 'Buy an extension cord at the 99c store', failIfStars: 1, doneMessage: 'A twenty-foot cord for ninety-nine cents. It is fifteen feet.' },
      { kind: 'interact', at: rival, radius: 5, prompt: 'Swap her playlist', presses: 3, text: 'Swap the rival playlist for something gentler', failIfStars: 1, banter: ['Auntie (text): "Put on the one with the flute. She hates the flute."'] },
      { kind: 'interact', at: rival, radius: 5, prompt: 'Unplug the speaker', presses: 2, text: 'Unplug the rival speaker (gently)', failIfStars: 1 },
      { kind: 'talkTo', at: rival, radius: 5, presence: 'onFoot', npc: 'Lorraine', text: 'Explain yourself to the DJ', lines: ['Who sent you? Was it Gloria?', 'Tell my sister the casserole dish was never hers.', 'Tell her I said... the flute is nice.'] },
      { kind: 'goTo', at: auntie, radius: 6, presence: 'any', text: 'Report back to Auntie', failIfStars: 1 },
    ],
    reward: { cash: 200, message: 'Auntie: "Family dinner is on Sunday. You are bringing the cord."' },
    retryHint: 'the speakers are still arguing',
  };
}

/** The deli cat has left the building. Three sightings, one chopped-cheese lure and a delivery van with a passenger. */
export function senatorTheCat(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const clerk = poiSpot(ctx, 'troop-deli', 12);
  const door = poiSpot(ctx, 'troop-deli');
  const van = [facePoint(grid, 'r2c1', 'N', 0.5), corner(grid, 'garvey', 'kosciuszko'), corner(grid, 'garvey', 'lafayette'), corner(grid, 'garvey', 'vanburen')];
  return {
    id: 'senator-the-cat',
    title: 'Senator the Bodega Cat',
    blurb: 'Senator, the deli cat, has left the shop. He has never left the shop. Mohammed is not okay.',
    giverPoi: 'troop-deli',
    giver: clerk,
    triggerRadius: 3.5,
    availableHours: [9, 17],
    timeLimit: 330,
    phoneIntro: { from: 'Mohammed', text: 'Senator is GONE. Orange. Fat. Judgmental. Three people saw him. Bring him home, I will pay you in chopped cheese.' },
    twist: { at: 2, text: 'Senator is asleep in the back of a delivery van, and the van is pulling away. Stay on it.' },
    failJoke: {
      timeUp: 'The cat is in your footwell and cannot be reasoned with. You are now his chauffeur.',
      lostTarget: 'The van turns a corner and takes the cat with it. The cat does not look back.',
    },
    followUp: { from: 'Mohammed', text: 'Senator is back on the counter. He ignores everyone. It is perfect.', delay: 70 },
    objectives: [
      {
        kind: 'collect', points: [facePoint(grid, 'r1c1', 'N', 0.5), facePoint(grid, 'r2c1', 'W', 0.2), facePoint(grid, 'r1c0', 'S', 0.6)],
        radius: 5, presence: 'onFoot', item: 'sighting', text: 'Check the three reported sightings (any order)',
        banter: ['Witness: "He went that way. Or the other way. He is a cat."'],
      },
      { kind: 'pickUp', at: door, radius: 5, presence: 'any', items: ['chopped-cheese bag'], text: 'Grab a chopped-cheese bag from the deli', doneMessage: 'The smell alone will find him.' },
      { kind: 'tail', route: van, speed: 7, maxDistance: 36, target: 'delivery van', text: 'Follow the delivery van with the cat in it', banter: ['Mohammed (text): "Wave the cheese out the window!"'] },
      { kind: 'pickUp', at: van[van.length - 1], radius: 8, presence: 'any', items: ['Senator'], text: 'Collect Senator from the van (bribe him with the cheese)', doneMessage: 'The driver: "I thought he was the manager."' },
      { kind: 'deliver', at: door, radius: 6, presence: 'any', items: ['Senator'], text: 'Bring Senator home to the deli' },
    ],
    reward: { cash: 100, message: 'Senator takes his place on the counter. He will never move again.' },
    retryHint: 'the cat is still at large',
  };
}

/** A night shift in a dollar van: three fares, three conversations, and the last passenger is the dispatcher. */
export function dollarVanLastRun(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const stand = facePoint(grid, 'r3c1', 'N', 0.3);
  const ride = (n: string, from: ReturnType<typeof facePoint>, to: ReturnType<typeof facePoint>, line: string, first = false) => [
    { kind: 'pickUp' as const, at: from, radius: 6, presence: 'inVehicle' as const, items: [n], text: `Pick up ${n}`, failIfStars: 2, ...(first ? {} : { stayInVehicle: 12 }), banter: [line] },
    { kind: 'deliver' as const, at: to, radius: 6, presence: 'inVehicle' as const, items: [n], text: `Drop ${n} at their stoop`, failIfStars: 2, stayInVehicle: 12, maxKmh: 75 },
  ];
  return {
    id: 'dollar-van-last-run',
    title: 'Dollar Van, Last Run',
    blurb: 'A voice on the dispatch radio says: "cover my shift." Three fares, one night.',
    giverPoi: 'golden',
    giver: stand,
    triggerRadius: 4,
    availableHours: [22, 2],
    timeLimit: 540,
    phoneIntro: { from: 'Dispatch', text: 'Van\'s the one with the cracked mirror. Three fares. Do not talk politics, do not touch the dial, do not ask about the sticker.' },
    twist: { at: 4, text: 'The last passenger gets in and says, "Good, you found the van." It is the dispatcher. She wanted to see if you were okay to drive.' },
    failJoke: {
      copsCalled: 'A passenger bails out at a red light, then so does the other one. The cop turns around and takes the ride.',
      leftVehicle: 'You walked away from a dollar van mid-route. The fares have started a group chat.',
      tooFast: 'A passenger grips the handle and recites the Lord\'s Prayer. In Spanish. Twice.',
    },
    followUp: { from: 'Dispatch', text: "Tip jar's on the dash. Take what you want.", delay: 70 },
    objectives: [
      ...ride('Dolores', facePoint(grid, 'r2c1', 'S', 0.5), facePoint(grid, 'r4c0', 'E', 0.5), 'Dolores: "You new? The last guy knew my stoop by heart. And my business."', true),
      ...ride('Mr. Pat', facePoint(grid, 'r4c1', 'N', 0.5), facePoint(grid, 'r3c0', 'E', 0.5), 'Mr. Pat: "Turn the radio. Not that one. The other one. No, back."'),
      ...ride('the stranger', facePoint(grid, 'r1c1', 'S', 0.5), facePoint(grid, 'r2c0', 'E', 0.4), 'The stranger: "I know a shortcut. It is not a shortcut."'),
    ],
    reward: { cash: 250, message: 'Dispatch: "You are hired. There is no pay. There is a hat."' },
    retryHint: 'the van is idling at the stand',
  };
}

/** A couch, three flights of stoop and a truck. The couch is not hers. */
export function movingDay(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const tenant = facePoint(grid, 'r3c0', 'S', 0.5);
  const couch = facePoint(grid, 'r3c0', 'S', 0.4);
  const truck = facePoint(grid, 'r3c0', 'S', 0.2);
  const storage = facePoint(grid, 'r1c0', 'S', 0.5);
  return {
    id: 'moving-day',
    title: 'Moving Day',
    blurb: 'A tenant needs a couch down three flights of stoop and into a truck. Gently.',
    giverPoi: 'braids',
    giver: tenant,
    triggerRadius: 4,
    availableHours: [8, 16],
    timeLimit: 300,
    phoneIntro: { from: 'Ms. Dee', text: 'The couch is blue, the couch is heavy, the couch is the only thing in this apartment I trust. Truck is on the corner. Walk slow!' },
    twist: { at: 4, text: 'The man at the storage unit stares at the couch. "That is MY couch. It went missing in October."' },
    failJoke: {
      tooFast: 'The couch falls off at an intersection and blocks it. A honk chorus rises, in perfect B-flat.',
      timeUp: 'The couch is now a permanent part of the sidewalk. Neighbors have already put cushions on it.',
    },
    followUp: { from: 'Ms. Dee', text: 'Keep the couch. I never saw it.', delay: 70 },
    objectives: [
      { kind: 'pickUp', at: couch, radius: 4, presence: 'onFoot', items: ['couch'], text: 'Lift the couch at the top of the stoop', doneMessage: 'The couch is heavier than the lease.' },
      { kind: 'goTo', at: truck, radius: 4, presence: 'onFoot', text: 'Carry the couch to the truck. Slowly. It is a sofa, not a sled.', maxKmh: 16, banter: ['Ms. Dee: "Mind the railing! The railing is older than I am!"'] },
      { kind: 'enterVehicle', text: 'Climb in the truck (any vehicle will do)' },
      { kind: 'deliver', at: storage, radius: 8, presence: 'inVehicle', items: ['couch'], text: 'Drive the couch to storage. Stop at every red.', maxKmh: 48, banter: ['Ms. Dee: "Is it still on the roof? It is on the roof."'] },
      { kind: 'talkTo', at: storage, radius: 12, presence: 'any', npc: 'Mr. Pham', text: 'Hand the couch over', lines: ['That couch. Where did you get that couch?', 'Three flights of stoop and she carried it down for me? Bless her.', 'I will pay the delivery fee. Cash. Do not tell Ms. Dee.'] },
    ],
    reward: { cash: 180, message: 'Mr. Pham slips you a folded twenty and a fruit basket.' },
    retryHint: 'the couch is back upstairs',
  };
}

/** Tail the inspector, pass a note, and learn the shed was approved in 2014. */
export function permitPending(ctx: PlaceCtx): MissionDef {
  const { grid } = ctx;
  const contractor = facePoint(grid, 'r0c1', 'S', 0.3);
  const office = facePoint(grid, 'r1c1', 'S', 0.6);
  return {
    id: 'permit-pending',
    title: 'Permit Pending',
    blurb: "Rico's sidewalk shed has been up so long it has its own mailbox. He needs one stamp by 5pm.",
    giverPoi: 'rx',
    giver: contractor,
    triggerRadius: 4,
    availableHours: [13, 15.5],
    deadlineHour: 17,
    phoneIntro: { from: 'Rico', text: 'One stamp, my friend. The inspector drives a gray sedan with a tiny flag. Tail him to the permits office, wait, pass this note, and run it back before 5.' },
    twist: { at: 3, text: 'You hand Rico the stamped form. He reads it twice. "The shed was approved in 2014. Nobody told us."' },
    failJoke: {
      clockUp: 'The office closes in your face. A sign: "Back tomorrow." It is the same sign as yesterday.',
      lostTarget: 'You lost an inspector. He drives like a man with nowhere to be.',
    },
    followUp: { from: 'Rico', text: 'The shed stays. It is part of the block now.', delay: 80 },
    objectives: [
      {
        kind: 'tail', route: [{ x: contractor.x, z: -100 }, corner(grid, 'garvey', 'pulaski'), corner(grid, 'garvey', 'kosciuszko'), { x: office.x, z: 0 }],
        speed: 8, maxDistance: 45, target: "inspector's sedan", text: "Tail the inspector's gray sedan to the permits office",
        banter: ['Rico (text): "Do not get close. He can smell a clipboard."'],
      },
      { kind: 'holdSpeedBelow', kmh: 4, seconds: 8, at: office, radius: 14, text: 'Wait outside the permits office. Look casual.', banter: ['A man with a clipboard looks at you. You look at the sky.'] },
      { kind: 'interact', at: office, radius: 8, prompt: 'Slide the note under the door', presses: 1, text: 'Pass the note through the office slot' },
      { kind: 'talkTo', at: contractor, radius: 6, presence: 'any', npc: 'Rico', text: 'Race the stamp back to Rico', lines: ['You are a legend. A legend with a stamp.', 'Wait. Hold on. Did you read the date?', 'Approved in 2014. We have been legal for ten years. Ten!'] },
    ],
    reward: { cash: 150, message: 'Rico: "Let us celebrate with a pizza. Under the shed."' },
    retryHint: 'the inspector is on his way again',
  };
}
