/**
 * The named cast of the Pedro Martinez story (24 Nov 2026). Names and roles of the first five are the owner's; the ages,
 * backgrounds and looks below are the CAST seat's reading until docs/story/BIBLE.md says otherwise, and the other five are
 * placeholders for the people the owner described (a homeless man, a man at a bar, love interests, a neighbour).
 * Every one is invented, adult, an ordinary and specific person. Each has a signature colour and a silhouette of their own so
 * they read at a glance: Pedro mustard and black, lean; Lana platinum bob and acid green, tall; Adele rust and cream, curvy;
 * Stavros navy and camel, big and bald-ish; Akira charcoal with one red note, narrow and neat.
 * Garments are ids from the wardrobe pools (src/textures/painters/pedWardrobe.ts), so a clothes shop can sell the same pieces.
 */
import type { CastId, CastMember } from './types';

const v = (voice: CastMember['voice']['voice'], speed: number, fx: CastMember['voice']['fx'], role: CastMember['voice']['fallback']['role'], pitch: number, rate: number): CastMember['voice'] =>
  ({ voice, speed, fx, fallback: { role, pitch, rate } });

export const CAST_MEMBERS: readonly CastMember[] = [
  {
    id: 'pedro', name: 'Pedro', full: 'Pedro Martinez', role: 'player',
    note: 'Colombian, early thirties, a DJ with a mustard bomber and a record bag. Lean and quick, always half a beat ahead of the room.',
    group: 'la', sex: 'm', age: 'adult', body: 'wiry', build: 'avg',
    skin: '#c99068', hair: 'curly', hairColor: '#1a120c',
    face: { eyes: 'wide', brows: 'thick', mouth: 'grin', stubble: true },
    outfits: {
      day: { label: 'Mustard bomber', top: ['tee', '#efe8d8'], layer: ['bomber', '#c8962e', '#efe8d8', '#8a6a1c'], bottom: ['jeansSlim', '#1d2230'], shoes: ['sneakerLow', '#e8e0d0', '#bcb4a4', '#c8962e'], hat: 'none', gear: 'messenger', gearColor: '#2a2420' },
      night: { label: 'Night leather', top: ['henley', '#1a1a1e'], layer: ['leatherCoat', '#2a211c', '#1a1a1e'], bottom: ['jeansSlim', '#14161c'], shoes: ['ankleBoot', '#2a1a10'], hat: 'none', gear: 'messenger', gearColor: '#2a2420' },
      gig: { label: 'Set night', top: ['tallTee', '#f2efe6'], bottom: ['cargo', '#3a3a34'], shoes: ['sneakerHigh', '#1a1a1e', '#d8d4cc', '#c8962e'], hat: 'snapback', hatColor: '#1a1a1e', gear: 'bag', gearColor: '#1a1a1e' },
    },
    voice: v('am_fenrir', 1.0, 'dry', 'caller', 0.96, 1.08),
    home: 'home-pedro',
    places: [
      { venue: 'club', station: 'booth', hours: [22, 27], days: [5, 6] },
      { venue: 'bar-2', station: 'bar', hours: [18, 23] },
    ],
    barks: {
      greet: ['Hey, what is good?', 'Ey, how you been?', 'There he is.'],
      bye: ['Catch you at the next one.', 'Walk safe.'],
      hurt: ['Not the hands, man, not the hands!', 'Ow, I need those for work!'],
      help: ['Okay, okay, I am down!', 'Somebody call someone!'],
      chat: ['I have a set at midnight and nothing to wear.', 'You hear that bassline? Sit with me.'],
      getUp: ['I am fine, I am fine.', 'Okay. Okay. Not my best.'],
    },
  },
  {
    id: 'lana', name: 'Lana', full: 'Lana Porskaia', role: 'playable',
    note: 'Late twenties, tall, platinum bob, a promoter and a selector who knows every door in the neighbourhood. Dry and exact.',
    group: 'wh', sex: 'f', age: 'adult', body: 'tall-thin', build: 'tall',
    skin: '#e6b894', hair: 'bob', hairColor: '#cfc8b8',
    face: { eyes: 'sleepy', brows: 'thin', mouth: 'flat', lips: '#6a2a3a', lashes: true },
    outfits: {
      day: { label: 'Green wind jacket', top: ['ribTank', '#15151a'], layer: ['windbreaker', '#9ab83a', '#15151a', '#6e8a28'], bottom: ['leggings', '#15151a'], shoes: ['runner', '#e8e8ec', '#bdbdbd', '#9ab83a'], hat: 'none', gear: 'bag', gearColor: '#15151a' },
      night: { label: 'Violet wrap dress', onePiece: ['wrapDress', '#3a2a52'], shoes: ['heel', '#15151a'], hat: 'none', gear: 'bag', gearColor: '#15151a' },
      gig: { label: 'Black on black', top: ['tank', '#15151a'], bottom: ['jeansWide', '#1c1c22'], shoes: ['chunkySneaker', '#e8e6e0', '#c8c4bc', '#9ab83a'], hat: 'none' },
    },
    voice: v('af_river', 0.98, 'dry', 'caller', 1.05, 1.0),
    home: 'home-lana',
    places: [{ venue: 'club', station: 'door', hours: [21, 27] }, { venue: 'bar-1', station: 'booth', hours: [17, 22] }],
    barks: {
      greet: ['You are late. It is fine.', 'Hey.', 'Oh good, a face I know.'],
      bye: ['Text me.', 'Go home, it is late.'],
      hurt: ['Seriously?', 'Ow. Do not do that.'],
      help: ['I will scream, I mean it!', 'Back off!'],
      chat: ['The list is the list. Nobody gets on the list twice.', 'I counted forty-one people and one of them was a cat.'],
      getUp: ['Fine. I am fine.', 'Do not help me up, I am doing it.'],
    },
    playable: { cash: 240, home: 'home-lana' },
  },
  {
    id: 'adele', name: 'Adele', full: 'Adele Labos', role: 'playable',
    note: 'Mid thirties, a vintage dealer and part-time bartender, glasses, warm and unbothered. Rust and cream, always carrying something.',
    group: 'mx', sex: 'f', age: 'adult', body: 'pear', build: 'stocky',
    skin: '#b97f55', hair: 'curly', hairColor: '#4a3220',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#8a3a3a', lashes: true, glasses: '#7a3a20' },
    outfits: {
      day: { label: 'Rust cardigan', top: ['blouse', '#efe4d0'], layer: ['cardiganOpen', '#b5532a', '#efe4d0'], bottom: ['jeansStraight', '#34506f'], shoes: ['canvasLow', '#efe4d0', '#c8bca4', '#b5532a'], hat: 'none', gear: 'tote', gearColor: '#c8a06a' },
      night: { label: 'Rust wrap dress', onePiece: ['wrapDress', '#b5532a'], shoes: ['ankleBoot', '#2a1a10'], hat: 'none', gear: 'bag', gearColor: '#2a1a10' },
      gig: { label: 'Behind the bar', top: ['turtleneck', '#2a2220'], layer: ['apron', '#3a3028', '#2a2220'], bottom: ['jeansStraight', '#1f2530'], shoes: ['sneakerDark', '#1c1c20'], hat: 'none' },
    },
    voice: v('af_sarah', 1.0, 'dry', 'sidekick', 1.1, 1.02),
    home: 'home-adele',
    places: [{ venue: 'bar-3', station: 'bar', hours: [17, 25] }, { venue: 'gym', station: 'stand', hours: [8, 11], days: [1, 3] }],
    barks: {
      greet: ['Hi, honey, sit anywhere.', 'Look who found us.', 'Hey, you. Eat something.'],
      bye: ['Drink some water.', 'Come back soon.'],
      hurt: ['Hey! I have a bottle and I know how to use it!', 'Ow, my glasses!'],
      help: ['Get away from me!', 'Somebody help!'],
      chat: ['Everything in this bag is somebody else\'s grandmother\'s.', 'I can price a coat from across the street.'],
      getUp: ['Help me find my glasses, then I will forgive you.', 'I have had worse Tuesdays.'],
    },
    playable: { cash: 180, home: 'home-adele' },
  },
  {
    id: 'stavros', name: 'Stavros', full: 'Stavros Yanos', role: 'contact',
    note: 'Mid fifties, big and thinning, a moustache, a navy blazer over a polo. Owns more than he lets on and settles everything over coffee.',
    group: 'wh', sex: 'm', age: 'adult', body: 'big-tall', build: 'stocky',
    skin: '#d19c76', hair: 'thinning', hairColor: '#b0b0b0',
    face: { eyes: 'sleepy', brows: 'thick', mouth: 'flat', mustache: true },
    outfits: {
      day: { label: 'Navy blazer', top: ['polo', '#e8e0cc'], layer: ['blazer', '#1f2c4a', '#e8e0cc'], bottom: ['chinos', '#b08a5a'], shoes: ['loafer', '#3a2418'], hat: 'none' },
      night: { label: 'Dark overcoat', top: ['dressShirt', '#1c1c20'], layer: ['overcoat', '#2a2a30', '#1c1c20'], bottom: ['suitTrousers', '#1c1c20'], shoes: ['dressShoe', '#15151a'], hat: 'none' },
      gig: { label: 'Open collar', top: ['shirt', '#d8d0bc'], layer: ['blazer', '#1f2c4a', '#d8d0bc'], bottom: ['suitTrousers', '#2a2a30'], shoes: ['loafer', '#2a1a10'], hat: 'none' },
    },
    voice: v('am_onyx', 0.92, 'dry', 'host', 0.82, 0.94),
    home: 'bar-2',
    places: [{ venue: 'bar-2', station: 'booth', hours: [15, 24] }, { venue: 'afterhours', station: 'booth', hours: [26, 31], days: [5, 6] }],
    barks: {
      greet: ['Sit. Coffee first.', 'Ah, the musician.', 'You are early. I like that.'],
      bye: ['Go. Be useful.', 'Give my regards to nobody.'],
      hurt: ['You are making a mistake.', 'Enough!'],
      help: ['Careful, I know people!', 'Stop this!'],
      chat: ['In my country we say, eat first, argue second.', 'Everything has a price. Even this coffee.'],
      getUp: ['Tell no one about this.', 'I am too old for the floor.'],
      recognise: ['Pedro. Good. Come, come.'],
    },
  },
  {
    id: 'akira', name: 'Akira', full: 'Akira Tonaka', role: 'contact',
    note: 'About forty, narrow and neat, glasses, a quiet man who runs a booking list and a record label out of a back room. One red note in every outfit.',
    group: 'ea', sex: 'm', age: 'adult', body: 'ecto', build: 'slim',
    skin: '#dcb088', hair: 'crop', hairColor: '#0e0a08',
    face: { eyes: 'dot', brows: 'thin', mouth: 'flat', glasses: '#2a2a2a' },
    outfits: {
      day: { label: 'Charcoal and red', top: ['turtleneck', '#2a2a2e'], layer: ['peacoat', '#3a3d44', '#2a2a2e'], bottom: ['trousersSlim', '#1c1c20'], shoes: ['sneakerDark', '#1c1c20', '#3a3a40', '#c0392b'], hat: 'none', gear: 'messenger', gearColor: '#2a2a2e' },
      night: { label: 'All dark', top: ['shirt', '#1a1a1e'], layer: ['blazer', '#1a1a1e', '#1a1a1e'], bottom: ['jeansSlim', '#14161c'], shoes: ['dressShoe', '#15151a'], hat: 'none' },
      gig: { label: 'Back room', top: ['henley', '#e8e6e0'], layer: ['cropJacket', '#2a2a2e', '#e8e6e0'], bottom: ['cargo', '#34343a'], shoes: ['sneakerDark', '#e8e6e0', '#bdbdbd', '#c0392b'], hat: 'none' },
    },
    voice: v('am_adam', 0.94, 'dry', 'host', 0.88, 0.96),
    home: 'afterhours',
    places: [{ venue: 'afterhours', station: 'counter', hours: [25, 32] }, { venue: 'dispensary', station: 'counter', hours: [12, 17], days: [2, 4] }],
    barks: {
      greet: ['Ah. Good timing.', 'Pedro-san. Sit.', 'Two minutes. Please.'],
      bye: ['Please take care.', 'I will remember that.'],
      hurt: ['That was unnecessary.', 'Please stop.'],
      help: ['Someone, please!', 'I will call the police!'],
      chat: ['The list has nine names and eleven people.', 'Punctuality is the cheapest kind of respect.'],
      getUp: ['I am unhurt. Thank you.', 'My glasses. Where are my glasses.'],
      recognise: ['Pedro. I have something for you.'],
    },
  },
  {
    id: 'augie', name: 'Augie', full: 'August "Augie" Pruitt', role: 'foe',
    note: 'Late fifties, lean and stooped, a grey beard and three coats. Has a history on this block, a bench of his own, and his reasons; he can be talked down.',
    group: 'wh', sex: 'm', age: 'adult', body: 'stoop-slim', build: 'slim',
    skin: '#d19c76', hair: 'short', hairColor: '#b0b0b0',
    face: { eyes: 'sleepy', brows: 'thick', mouth: 'frown', beard: true },
    outfits: {
      day: { label: 'Three coats', top: ['flannel', '#6a5a3a'], layer: ['parka', '#4a4f3a', '#6a5a3a'], bottom: ['workTrousers', '#3a3a34'], shoes: ['workBoot', '#3a2a1a'], hat: 'beanie', hatColor: '#4a4a40', gear: 'bag', gearColor: '#3a3a30' },
      night: { label: 'Added a blanket coat', top: ['flannel', '#6a5a3a'], layer: ['overcoat', '#3a3a3a', '#6a5a3a'], bottom: ['workTrousers', '#3a3a34'], shoes: ['workBoot', '#3a2a1a'], hat: 'beanie', hatColor: '#4a4a40', gear: 'bag', gearColor: '#3a3a30' },
    },
    voice: v('bm_lewis', 0.9, 'dry', 'host', 0.78, 0.9),
    home: 'corner-augie',
    places: [{ venue: 'corner-augie', station: 'corner', hours: [0, 24] }],
    barks: {
      greet: ['Got a minute?', 'I know you. You play the music.', 'That is my bench.'],
      bye: ['Mind yourself.', 'Alright. Alright then.'],
      hurt: ['I was here first!', 'You do not need to do that!'],
      help: ['Leave me be!', 'I have nowhere else to be hit!'],
      chat: ['This street used to have a name for every stoop.', 'I was somebody\'s landlord once. Think about that.'],
      getUp: ['Been worse. Been a lot worse.', 'Give me a second.'],
    },
  },
  {
    id: 'dom', name: 'Dom', full: 'Dominic "Dom" Verrill', role: 'foe',
    note: 'Early forties, heavy and loud at the end of a long shift, a cap and a work jacket. A regular who takes the wrong thing personally.',
    group: 'wh', sex: 'm', age: 'adult', body: 'heavy', build: 'stocky',
    skin: '#d6a47d', hair: 'short', hairColor: '#4a3220',
    face: { eyes: 'dot', brows: 'thick', mouth: 'frown', stubble: true },
    outfits: {
      day: { label: 'Shift', top: ['pocketTee', '#6a3a2a'], bottom: ['jeansStraight', '#34405a'], shoes: ['workBoot', '#4a3220'], hat: 'snapback', hatColor: '#7a2a2a' },
      night: { label: 'Bar stool', top: ['flannel', '#3a4a3a'], layer: ['workJacket', '#5a4a30', '#3a4a3a'], bottom: ['jeansStraight', '#2a3248'], shoes: ['tanBoot', '#7a5a38'], hat: 'snapback', hatColor: '#7a2a2a' },
    },
    voice: v('am_puck', 1.0, 'dry', 'caller', 0.82, 1.04),
    home: 'bar-1',
    places: [{ venue: 'bar-1', station: 'bar', hours: [17, 26] }],
    barks: {
      greet: ['What are you looking at? Kidding. Sit.', 'Hey, DJ!'],
      bye: ['Later.', 'Tip your bartender.'],
      hurt: ['Oh, now you are done!', 'You hit me, you hit ME?'],
      help: ['Okay, okay, we are done!', 'Somebody get this guy!'],
      fightMe: ['Outside. Now.', 'Come on, then, come on!', 'That was my seat!'],
      chat: ['Twelve hours on a roof and this is my reward.', 'Who picked this song?'],
      getUp: ['That was a cheap one.', 'I am up, I am up.'],
    },
  },
  {
    id: 'noor', name: 'Noor', full: 'Noor Haddad', role: 'love',
    note: 'Early thirties, small and quick, a nurse on nights who dances like nobody is watching. Teal and cream.',
    group: 'me', sex: 'f', age: 'adult', body: 'petite', build: 'slim',
    skin: '#c99068', hair: 'long', hairColor: '#17110d',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#a8484f', lashes: true },
    outfits: {
      day: { label: 'Teal knit', top: ['sweater', '#2f7a7a'], bottom: ['jeansStraight', '#2a3a5a'], shoes: ['sneakerLow', '#efe8d8', '#c8c0b0', '#2f7a7a'], hat: 'none', gear: 'tote', gearColor: '#efe8d8' },
      night: { label: 'Teal wrap dress', onePiece: ['wrapDress', '#2f7a7a'], shoes: ['heel', '#1a1a1e'], hat: 'none', gear: 'bag', gearColor: '#1a1a1e' },
      gig: { label: 'Scrubs under a fleece', top: ['scrubs', '#4a8a8a'], layer: ['fleece', '#2a3a3a', '#4a8a8a'], bottom: ['workDark', '#2a3a3a'], shoes: ['sneakerDark', '#e8e8ec'], hat: 'none', gear: 'bag', gearColor: '#2a3a3a' },
    },
    voice: v('af_sky', 1.02, 'dry', 'caller', 1.12, 1.06),
    home: 'home-noor',
    places: [{ venue: 'club', station: 'stand', hours: [23, 27], days: [5, 6] }, { venue: 'bar-3', station: 'booth', hours: [18, 22], days: [0, 1, 2] }],
    barks: {
      greet: ['Hey, you came!', 'There you are.', 'I was hoping you would play.'],
      bye: ['Text me when you are home.', 'Sleep, you need it.'],
      hurt: ['What is wrong with you?!', 'Ow!'],
      help: ['Leave me alone!', 'Somebody help me!'],
      chat: ['Nights are quiet until they are not.', 'I can tell you everything about a person from their hands.'],
      getUp: ['I am a nurse, I know how to fall.', 'Okay, ow.'],
    },
  },
  {
    id: 'julian', name: 'Julian', full: 'Julian Ashby', role: 'love',
    note: 'Mid thirties, a trainer at the gym, calm and broad, burgundy sweatshirts. Reads more than he lets on.',
    group: 'ba', sex: 'm', age: 'adult', body: 'athletic', build: 'tall',
    skin: '#6e4530', hair: 'fade', hairColor: '#0e0a08',
    face: { eyes: 'dot', brows: 'thick', mouth: 'smile', beard: true },
    outfits: {
      day: { label: 'Burgundy crew', top: ['crewSweat', '#6a2a34'], bottom: ['jeansSlim', '#1f2a3a'], shoes: ['sneakerHigh', '#e8e4dc', '#c8c4bc', '#6a2a34'], hat: 'none', gear: 'backpack', gearColor: '#2a2a30' },
      night: { label: 'Overshirt', top: ['shirt', '#d8d0bc'], layer: ['bomberNylon', '#2a2a30', '#d8d0bc'], bottom: ['trousersSlim', '#1c1c20'], shoes: ['loafer', '#2a1a10'], hat: 'none' },
      gig: { label: 'Floor shift', top: ['tank', '#e8e6e0'], bottom: ['sweatShorts', '#1c1c20'], shoes: ['runner', '#e8e8ec', '#bdbdbd', '#6a2a34'], hat: 'none' },
    },
    voice: v('am_liam', 0.98, 'dry', 'caller', 0.9, 1.0),
    home: 'home-julian',
    places: [{ venue: 'gym', station: 'counter', hours: [6, 15] }, { venue: 'bar-3', station: 'bar', hours: [19, 23], days: [4] }],
    barks: {
      greet: ['Morning. You lifting or lurking?', 'Hey, good to see you.', 'You look tired. Sit.'],
      bye: ['Drink water.', 'Same time next week.'],
      hurt: ['Hey. Easy.', 'I will let that one go.'],
      help: ['Back off!', 'Somebody call someone!'],
      chat: ['Nobody is late to the gym, only early to the couch.', 'Breathe in through your nose.'],
      getUp: ['I am okay. Let me stand.', 'Fine. Not the first time.'],
    },
  },
  {
    id: 'winston', name: 'Winston', full: 'Winston Pryce', role: 'neighbour',
    note: 'Seventies, tan and brown, flat cap, the man on the first-floor window who has seen everything on the block since 1979.',
    group: 'ca', sex: 'm', age: 'old', body: 'elder', build: 'avg',
    skin: '#8d5a3a', hair: 'thinning', hairColor: '#c8c8cc',
    face: { eyes: 'sleepy', brows: 'thick', mouth: 'smile', mustache: true },
    outfits: {
      day: { label: 'Tan polo', top: ['polo', '#d8cfa8'], bottom: ['chinos', '#8a7a5a'], shoes: ['loafer', '#3a2418'], hat: 'flat', hatColor: '#5a4a32' },
      night: { label: 'Cardigan', top: ['shirt', '#e8e0cc'], layer: ['cardigan', '#6a5a42', '#e8e0cc'], bottom: ['suitTrousers', '#3a3a34'], shoes: ['loafer', '#3a2418'], hat: 'flat', hatColor: '#5a4a32' },
    },
    voice: v('bm_fable', 0.85, 'dry', 'host', 0.78, 0.88),
    home: 'home-winston',
    places: [{ venue: 'home-winston', station: 'sit', hours: [7, 21] }],
    barks: {
      greet: ['Morning, young man.', 'Ah, it is the musician.', 'Keep it down after ten, but not tonight.'],
      bye: ['Take care of yourself.', 'Say hello to your mother.'],
      hurt: ['I am seventy-four years old!', 'What kind of person does that?'],
      help: ['Help! Help!', 'Call the police!'],
      chat: ['Back in my day the whole block knew every record on your shelf.', 'It was a better street with worse plumbing.'],
      getUp: ['Give me a minute. A long minute.', 'These knees have opinions.'],
    },
  },
];

export const CAST_IDS: readonly CastId[] = CAST_MEMBERS.map((m) => m.id);
const BY_ID = new Map<string, CastMember>(CAST_MEMBERS.map((m) => [m.id, m]));
export function castMember(id: string): CastMember | undefined { return BY_ID.get(id); }
export function isCastId(id: unknown): id is CastId { return typeof id === 'string' && BY_ID.has(id); }
/** the people the player can be: the first (Pedro) and those marked playable */
export const PLAYABLE_IDS: readonly CastId[] = CAST_MEMBERS.filter((m) => m.role === 'player' || m.role === 'playable').map((m) => m.id);
