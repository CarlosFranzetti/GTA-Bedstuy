/**
 * TALK3: a host for every station on the dial.
 *
 * The nine SoundCloud stations already have one (personas.ts, scripts.ts, voice/shows/djs.ts). This file adds the six
 * live-stream stations and names the hosts of the two scripted talk stations. Every host is INVENTED, none is a real
 * person, and none claims to work for the real broadcaster: they are the game's own dial hosts, introducing a real public
 * stream by its own name before stepping out of the way.
 *
 * When a live host speaks (LiveHost.ts): once at tune-in, after the dial jingle; then at most once every ten minutes or
 * more. On streams whose now-playing data the game reads (KEXP, SomaFM) the timed link waits for a song change, so it
 * lands between songs; on the rest it goes on the timer. WNYC (news and talk) gets the tune-in line only: our host does not
 * talk over the newsroom. The talk stations speak through their own shows; their idents and links are the station's
 * scripted ones (script-groupchat-bits.json; WBSY's station breaks in voice/shows/extra-shows.json).
 */
import type { VoiceRole } from '../talk/script';

export interface StationHost {
  stationId: string;
  name: string;
  /** Two lines: who they are and how they talk. */
  personality: readonly [string, string];
  role: VoiceRole;
  pitch: number;
  rate: number;
  /** tune-and-timer: tune-in line plus timed links. tune-only: tune-in line only. own-show: the station's script speaks. */
  speaks: 'tune-and-timer' | 'tune-only' | 'own-show';
  /** {station} is the stream's own name as the HUD shows it. */
  idents: readonly string[];
  links: readonly string[];
}

export const LIVE_HOST_MIN_GAP_S = 10 * 60;

export const STATION_HOSTS: readonly StationHost[] = [
  { stationId: 'beat', name: 'Mo Clement', role: 'caller', pitch: 0.88, rate: 1.0, speaks: 'tune-and-timer',
    personality: ['Unhurried night-shift host with a voice like a low bass line and a cup of tea that is always too hot.', 'Talks like he is leaning on a car outside the bodega, never interrupts a hook, signs off with "stay tuned in, Stuy".'],
    idents: [
      'Mo Clement on the Bed-Stuy dial. This is {station}, live. Hip hop and R and B, no skips.',
      'You found it. {station}, live. Mo Clement, holding the door.',
      'Bed-Stuy dial, Mo Clement here. {station} is on. I will be quiet now.',
      '{station}, live and loud. Mo Clement, just passing through.',
      'Stay tuned in, Stuy. This is {station}, live.',
      'Mo Clement. Window down, volume up. {station}.',
      'Hip hop on the dial. {station}, live. Mo Clement says hello.',
      'This is {station}. Mo Clement on the Bed-Stuy dial. Nod accordingly.',
      'You are locked in to {station}, live. Mo Clement, keeping it short.',
      'Mo Clement here. {station}. If the bass rattles your mirror, that is the mirror\'s problem.',
      'Bed-Stuy dial. {station}. Somebody turn this up on Fulton.',
      'Mo Clement on the dial. {station} is live. I am just the doorman.',
    ],
    links: [
      'Mo Clement on the dial. Still {station}, still live. Hydrate.',
      'That one hit. Stay tuned in, Stuy.',
      'Quick word from Mo. Nobody is double parked in your heart. Back to {station}.',
      'If you are on a stoop right now, you are doing it right. {station}.',
      'Mo Clement. Just checking you are still nodding. Carry on.',
      'Still {station}. Still live. Still the right choice.',
      'This one goes out to the man on Nostrand who never takes his headphones off.',
      'Mo here. My tea is finally cool. Back to the music.',
      'Hip hop and R and B, live. You know where you are.',
      'Mo Clement, Bed-Stuy dial. I will not keep you. {station}.',
      'Somebody just turned their car speakers up at a red light. Respect. {station}.',
    ] },
  { stationId: 'rnsoul', name: 'Birdie Lowe', role: 'sidekick', pitch: 1.12, rate: 0.94, speaks: 'tune-and-timer',
    personality: ['Retired record-store clerk who filed every soul record under "love" and still thinks that was correct.', 'Sweet, unhurried, a little scandalised by everything, calls the listener "sugar".'],
    idents: [
      'Birdie Lowe on the Bed-Stuy dial, sugar. This is {station}, live.',
      'Soul and funk, live. {station}. Birdie Lowe says sit down a minute.',
      'This is {station}. Birdie Lowe, filing this one under love.',
      'Bed-Stuy dial. {station}, live. Birdie Lowe, with her shoes off.',
      'You are listening to {station}. Birdie Lowe. Slow down, sugar.',
      'Birdie Lowe here. {station}. The horns are coming, I can feel it.',
      'Live soul on the dial. {station}. Birdie Lowe, just saying hello.',
      '{station}. Birdie Lowe. Somebody call your mother back.',
      'Birdie Lowe on the dial. {station}, live. Mind the groove.',
      'Soul, sugar. {station}. Birdie Lowe will be quiet now.',
      'This is {station}, live. Birdie Lowe, Bed-Stuy dial.',
    ],
    links: [
      'Birdie Lowe again. That bass player should be thanked in a church.',
      'Still {station}, sugar. Still live.',
      'Birdie here. I filed that one under love. I file everything under love.',
      'If your shoulders moved just now, that was the music. Carry on.',
      'Birdie Lowe. A song like that deserves a clean kitchen. Go wipe something.',
      'Soul and funk, live. Birdie Lowe will get out of the way.',
      'That was the good stuff, sugar. More of it on {station}.',
      'Birdie here. Turn it up for the neighbor who pretends not to like it.',
      'Still on {station}. The record store closed but the records did not.',
      'Birdie Lowe on the dial. Back to the horns.',
    ] },
  { stationId: 'wfmu', name: 'Ambrose Fitch', role: 'host', pitch: 0.8, rate: 0.9, speaks: 'tune-and-timer',
    personality: ['Collector of oddities who speaks like a museum guide in a museum that is mostly one hallway.', 'Delighted by anything strange, describes songs as "specimens", never sure what day it is.'],
    idents: [
      'Ambrose Fitch on the Bed-Stuy dial. This is {station}, live. Anything can happen.',
      'You have wandered into {station}. Ambrose Fitch. Please touch nothing.',
      'Freeform, live. {station}. Ambrose Fitch, your guide to the hallway.',
      'This is {station}. Ambrose Fitch. I have no idea what is next. Wonderful.',
      'Bed-Stuy dial. {station}, live. Ambrose Fitch, holding a magnifying glass.',
      '{station}, live. Ambrose Fitch. The exhibits are loud today.',
      'Ambrose Fitch here. {station}. Expect a specimen.',
      'The strangest stream on the dial. {station}. Ambrose Fitch approves.',
      'Ambrose Fitch on the dial. {station}, live from somewhere across the river.',
      'This is {station}. Ambrose Fitch. Mind the step, it is a record.',
      'Live and unpredictable. {station}. Ambrose Fitch, curator of nothing.',
    ],
    links: [
      'Ambrose Fitch. What was that? I am delighted not to know.',
      'Still {station}. Still live. The hallway continues.',
      'Ambrose here. I would like to frame that last song and hang it in a laundromat.',
      'A specimen, friends. A genuine specimen. Back to {station}.',
      'Ambrose Fitch on the dial. If you are confused, you are listening correctly.',
      'That was either a song or a very musical elevator. Either way, thank you.',
      'Freeform, live. Ambrose Fitch will now step back behind the rope.',
      'Ambrose here. I have lost track of the day. The music has not.',
      'Still {station}. Somewhere, a man is dancing alone in a kitchen. Good for him.',
      'Ambrose Fitch. The museum is open late. Carry on.',
    ] },
  { stationId: 'kexp', name: 'Jess Varga', role: 'sidekick', pitch: 1.0, rate: 1.06, speaks: 'tune-and-timer',
    personality: ['Indie lifer in a flannel who measures her life in shows attended and earplugs lost.', 'Fast, friendly, a little hoarse, rates everything "solid" and means it as the highest praise.'],
    idents: [
      'Jess Varga on the Bed-Stuy dial. {station}, live. Indie, rock, the good stuff.',
      'This is {station}. Jess Varga. Solid choice.',
      'Live on the dial, {station}. Jess Varga, earplugs in.',
      'You are on {station}. Jess Varga, Bed-Stuy dial. Turn it up.',
      'Jess Varga here. {station}, live. I will keep this short, like a punk song.',
      '{station}. Jess Varga. Guitars, mostly. Some feelings.',
      'Bed-Stuy dial, Jess Varga. {station}, live. Air guitar is allowed.',
      'This is {station}, live. Jess Varga, standing near the speaker.',
      'Indie and rock, live. {station}. Jess Varga says hi from the back of the room.',
      'Jess Varga on the dial. {station}. That is a solid stream.',
      '{station}, live. Jess Varga. Your neighbor has the same band shirt.',
    ],
    links: [
      'Jess Varga. That was solid. Very solid.',
      'Still {station}, live. I have lost another earplug.',
      'Jess here. If you nodded, you are in a band now. Sorry.',
      'Indie and rock on the dial. Jess Varga will get off the mic.',
      'Jess Varga. That one sounded like a basement show in the best way.',
      'Still on {station}. Somebody in a van just felt that.',
      'Jess here. Solid. Moving on before I talk about the bass tone.',
      'Bed-Stuy dial. {station}. Tell a friend. Lend them earplugs.',
      'Jess Varga. Live music, live radio, dead phone battery. Classic.',
      'Back to {station}. Turn it up one more notch.',
    ] },
  { stationId: 'u80s', name: 'Rick Marquee', role: 'announcer', pitch: 0.95, rate: 1.14, speaks: 'tune-and-timer',
    personality: ['Eighties superfan with a mixtape for every occasion and hair he describes as "a commitment".', 'Bright, breathless, uses "totally" without irony, thinks a synthesizer can fix most problems.'],
    idents: [
      'Rick Marquee on the Bed-Stuy dial! This is {station}, live. Synths up!',
      'Totally live, totally eighties. {station}. Rick Marquee.',
      'This is {station}. Rick Marquee, rewinding your heart with a pencil.',
      'Bed-Stuy dial. {station}. Rick Marquee, hair at full volume.',
      'You are on {station}, live. Rick Marquee. Put the walkman on.',
      '{station}! Rick Marquee. Synthesizers solve problems.',
      'Rick Marquee here. {station}. This one is going on a mixtape.',
      'Eighties on the dial. {station}, live. Rick Marquee, totally.',
      'This is {station}. Rick Marquee, Bed-Stuy dial. Neon optional.',
      'Rick Marquee on the dial. {station}. Do not touch that dial, it is my best one.',
      'Live and new wave. {station}. Rick Marquee says hey.',
    ],
    links: [
      'Rick Marquee! That synth line was a commitment. So is my hair.',
      'Still {station}. Still totally live.',
      'Rick here. That one goes on side B of the mixtape for your crush.',
      'Bed-Stuy dial. Rick Marquee. Rewind not available. Listen harder.',
      'Rick Marquee. If you have shoulder pads, now is the time.',
      'Still on {station}. Somebody is dancing in their kitchen like it is a music video.',
      'Rick here. Totally. That is the whole link. Totally.',
      'Eighties, live. Rick Marquee will step out of the neon.',
      'Rick Marquee. A synthesizer just fixed my afternoon.',
      'Back to {station}! Big drums, bigger feelings.',
    ] },
  { stationId: 'wnyc', name: 'Harriet Moss', role: 'announcer', pitch: 1.0, rate: 0.96, speaks: 'tune-only',
    personality: ['Calm, precise dial host who introduces the public-radio stream and then gets out of the newsroom\'s way.', 'Speaks in complete, quiet sentences; the one host on the dial who never makes a joke on top of the news.'],
    idents: [
      'Harriet Moss on the Bed-Stuy dial. This is {station}, live.',
      'You are listening to {station}, live. Harriet Moss, stepping aside.',
      'Bed-Stuy dial. {station}, New York public radio, live.',
      'This is {station}. Harriet Moss. Over to the newsroom.',
      'Harriet Moss here. {station}, live news and talk.',
      '{station}, live. Harriet Moss on the dial.',
      'News and talk, live. {station}. Harriet Moss.',
      'This is the Bed-Stuy dial. {station} is live. Harriet Moss.',
      'Harriet Moss. {station}. I will let them take it from here.',
      'You have tuned to {station}, live. Harriet Moss, Bed-Stuy dial.',
    ],
    links: [
      'Harriet Moss on the dial. {station}, live.',
      'Still {station}. Live news and talk.',
      'Harriet Moss. Back to the newsroom.',
      'Bed-Stuy dial. {station} continues.',
      'This is {station}, live.',
      'Harriet Moss here. Nothing to add.',
      '{station}. Live from New York.',
      'Harriet Moss. Carry on.',
      'Still {station}. Harriet Moss on the dial.',
      'Harriet Moss. Over to them.',
    ] },
  { stationId: 'talk', name: 'Buck Mercer', role: 'host', pitch: 0.78, rate: 1.08, speaks: 'own-show',
    personality: ['WBSY Talk\'s blowhard morning host (voice/cast.ts). Never wrong, sometimes loud.', 'The station speaks through its own shows; its idents and links are the station breaks in voice/shows/extra-shows.json.'],
    idents: [], links: [] },
  { stationId: 'groupchat', name: 'Odessa Pruitt', role: 'host', pitch: 0.82, rate: 0.98, speaks: 'own-show',
    personality: ['The Group Chat\'s host: born on Hancock Street, auntie-energy realist (TALK2).', 'The station speaks through its own bits; idents and links are in talk/script-groupchat-bits.json.'],
    idents: [], links: [] },
];

export function stationHost(id: string): StationHost | undefined {
  return STATION_HOSTS.find((h) => h.stationId === id);
}
