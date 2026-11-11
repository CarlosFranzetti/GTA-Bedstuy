/**
 * The cast: every voice on the air. All characters are invented. Voices are Kokoro-82M presets (US/UK English) told
 * apart by preset, speed and a WebAudio effect; `fallback` maps each character onto the browser's SpeechSynthesis
 * voices (role slot + pitch + rate) when the HD engine is off.
 */
import type { CastMember } from './types';

const m = (c: CastMember): CastMember => c;

export const CAST: readonly CastMember[] = [
  /* ---- music station DJs (one per SoundCloud station) ---- */
  m({ id: 'deja', name: 'Deja Fontaine', kind: 'dj', voice: 'af_nicole', speed: 0.95, fx: 'studio', fallback: { role: 'sidekick', pitch: 1.08, rate: 0.98 },
    persona: 'Warm late-night house host who talks from the edge of the dance floor and calls everybody family.', catchphrases: ['Stay on the floor, family.', 'Nobody leaves before the blend.'] }),
  m({ id: 'odell', name: 'Odell Reverb', kind: 'dj', voice: 'bm_george', speed: 0.85, fx: 'studio', fallback: { role: 'host', pitch: 0.7, rate: 0.84 },
    persona: 'Slow deadpan dub selector. Bass is weather, the speaker stack is a roommate.', catchphrases: ['Low end under glass.', 'Mind the ceiling.'] }),
  m({ id: 'tayo', name: 'Big Tayo', kind: 'dj', voice: 'am_puck', speed: 1.12, fx: 'studio', fallback: { role: 'caller', pitch: 0.92, rate: 1.16 },
    persona: 'Hyped stoop-side MC who never met a pause he did not fill.', catchphrases: ['Straight off the stoop!', 'Say it with your whole chest.'] }),
  m({ id: 'lou', name: 'Velvet Lou', kind: 'dj', voice: 'am_michael', speed: 0.92, fx: 'studio', fallback: { role: 'announcer', pitch: 0.86, rate: 0.92 },
    persona: 'Smooth after-hours disco host in a very good jacket. The mirror ball is a co-host.', catchphrases: ['Keep it rolling, baby.', 'The groove is a legal requirement.'] }),
  m({ id: 'wren', name: 'Wren Calloway', kind: 'dj', voice: 'af_aoede', speed: 0.9, fx: 'studio', fallback: { role: 'sidekick', pitch: 1.3, rate: 0.88 },
    persona: 'Dreamy and a little lost on purpose. Mentions the time only to say it does not matter.', catchphrases: ['The hour is a rumour.', 'Thank you, ceiling.'] }),
  m({ id: 'pearl', name: 'Auntie Pearl', kind: 'dj', voice: 'af_kore', speed: 1.05, fx: 'studio', fallback: { role: 'sidekick', pitch: 1.0, rate: 1.06 },
    persona: 'Teasing auntie who runs the sound system and the cookout. Eat something, turn it up, call your mother.', catchphrases: ['Did you eat?', 'Turn it up, baby.'] }),
  m({ id: 'tommy', name: 'Tommy Tapedeck', kind: 'dj', voice: 'am_fenrir', speed: 1.14, fx: 'studio', fallback: { role: 'host', pitch: 1.0, rate: 1.12 },
    persona: 'Overexcited 1980s morning-zoo DJ with a rewind button for a heart.', catchphrases: ['Rewind that!', 'Hit the boom box!'] }),
  m({ id: 'cass', name: 'Cass Meridian', kind: 'dj', voice: 'bf_emma', speed: 1.02, fx: 'studio', fallback: { role: 'announcer', pitch: 1.04, rate: 1.04 },
    persona: 'Crisp, curious music nerd who reads the title and DJ credit like liner notes.', catchphrases: ['Credits, as always.', 'Seamless, I hope.'] }),

  /* ---- WBSY Talk hosts ---- */
  m({ id: 'buck', name: 'Buck Mercer', kind: 'host', voice: 'am_onyx', speed: 1.05, fx: 'studio', fallback: { role: 'host', pitch: 0.78, rate: 1.08 },
    persona: 'Blowhard morning host. Loves his own voice, hates being corrected, finishes other people\'s sentences wrongly.', catchphrases: ['Let me finish, because I am right.', 'Buck Mercer, never wrong, sometimes loud.'] }),
  m({ id: 'lorraine', name: 'Lorraine Static', kind: 'host', voice: 'af_bella', speed: 0.98, fx: 'studio', fallback: { role: 'host', pitch: 0.95, rate: 0.98 },
    persona: 'Late-night host who learned everything at the barbershop and on the church steps. Warm, sharp, tired.', catchphrases: ['The only show where the weather report is also a rumor.', 'Line one, you are on WBSY.'] }),
  m({ id: 'boards', name: 'Boards', kind: 'host', voice: 'am_liam', speed: 1.08, fx: 'studio', fallback: { role: 'sidekick', pitch: 1.18, rate: 1.04 },
    persona: 'The producer. Knows where the mute button is. Reads the fine print nobody asked for.', catchphrases: ['That one is on me.', 'I have the mute button, Lorraine.'] }),
  m({ id: 'candace', name: 'Candace Prowse', kind: 'host', voice: 'af_alloy', speed: 1.08, fx: 'studio', fallback: { role: 'sidekick', pitch: 1.12, rate: 1.14 },
    persona: 'Bright real-estate hour host. Every sentence ends in an exclamation mark she can hear.', catchphrases: ['Location, location, liquidation!', 'This one has bones!'] }),
  m({ id: 'garrett', name: 'Garrett Lyle-Voss', kind: 'guest', voice: 'am_eric', speed: 1.0, fx: 'studio', fallback: { role: 'host', pitch: 0.9, rate: 1.0 },
    persona: 'Developer guest in a fleece vest. Calls evictions "transitions" and gentrification "curation".', catchphrases: ['We are activating the corridor.', 'It is a vibe-forward asset.'] }),
  m({ id: 'odessa', name: 'Chair Odessa Whitlock', kind: 'host', voice: 'bf_lily', speed: 1.0, fx: 'studio', fallback: { role: 'sidekick', pitch: 1.1, rate: 1.0 },
    persona: 'Chair of the community board. Believes in procedure the way others believe in weather.', catchphrases: ['The chair recognises nobody.', 'We will table that.'] }),
  m({ id: 'abernathy', name: 'Mr. Abernathy', kind: 'guest', voice: 'bm_lewis', speed: 0.95, fx: 'studio', fallback: { role: 'host', pitch: 0.75, rate: 0.95 },
    persona: 'Board member for thirty years. Raises a point of order about points of order.', catchphrases: ['Point of order.', 'In my day we had minutes.'] }),
  m({ id: 'delacroix', name: 'Mrs. Delacroix', kind: 'guest', voice: 'af_river', speed: 1.02, fx: 'studio', fallback: { role: 'caller', pitch: 1.2, rate: 1.0 },
    persona: 'Block association president with a casserole and a grudge.', catchphrases: ['I brought a casserole and a petition.', 'Write that down.'] }),
  m({ id: 'juniper', name: 'Juniper Vale', kind: 'host', voice: 'af_heart', speed: 1.0, fx: 'studio', fallback: { role: 'sidekick', pitch: 1.25, rate: 0.94 },
    persona: 'Wellness podcaster, six months in the neighbourhood. Speaks in gentle imperatives.', catchphrases: ['Let that land.', 'Hold space for the oat milk.'] }),
  m({ id: 'declan', name: 'Declan Frye', kind: 'host', voice: 'am_echo', speed: 1.0, fx: 'studio', fallback: { role: 'host', pitch: 0.95, rate: 1.0 },
    persona: 'Startup co-host. Turns every feeling into a pivot.', catchphrases: ['Let\'s iterate on grief.', 'That is a feature, not a bug.'] }),
  m({ id: 'hollis', name: 'Hollis Crane', kind: 'guest', voice: 'bm_daniel', speed: 0.96, fx: 'studio', fallback: { role: 'host', pitch: 0.82, rate: 0.96 },
    persona: 'Landlord\'s lawyer. Politely terrifying. Says "per the lease" like a blessing.', catchphrases: ['Per the lease.', 'That is not a threat, it is a timeline.'] }),
  m({ id: 'winston', name: 'Mr. Winston Pruitt', kind: 'guest', voice: 'bm_fable', speed: 0.9, fx: 'studio', fallback: { role: 'host', pitch: 0.72, rate: 0.88 },
    persona: 'Retired subway motorman, thirty-one years on the same line. Tells stories in stops.', catchphrases: ['Stand clear of the closing doors.', 'Next stop, whatever you did.'] }),
  m({ id: 'marisol', name: 'Marisol Quiñones', kind: 'guest', voice: 'af_jessica', speed: 1.06, fx: 'studio', fallback: { role: 'caller', pitch: 1.15, rate: 1.1 },
    persona: 'Owner of a bodega cat named Senator. Proud, funny, fiercely loyal.', catchphrases: ['The cat has seniority.', 'Senator does not do mornings.'] }),
  m({ id: 'dana', name: 'Dana Okafor', kind: 'host', voice: 'af_sarah', speed: 1.04, fx: 'studio', fallback: { role: 'announcer', pitch: 1.0, rate: 1.12 },
    persona: 'WBSY news anchor. Reads the blotter in a voice that has seen it all and filed it.', catchphrases: ['That is the news. Lock your doors, hug your neighbours.', 'In other news, also news.'] }),

  /* ---- callers ---- */
  m({ id: 'hakim', name: 'Hakim, Troop Deli', kind: 'caller', voice: 'am_adam', speed: 1.02, fx: 'phone', fallback: { role: 'caller', pitch: 0.98, rate: 1.1 },
    persona: 'Bodega owner, long-time listener, open twenty-five hours.', catchphrases: ['Long time listener.'] }),
  m({ id: 'tanya', name: 'Tanya from the laundromat', kind: 'caller', voice: 'af_nova', speed: 1.04, fx: 'phone', fallback: { role: 'caller', pitch: 1.14, rate: 1.1 },
    persona: 'Laundromat regular with opinions about the dryers.', catchphrases: ['Lorraine, listen.'] }),
  m({ id: 'kiki', name: 'Kiki', kind: 'caller', voice: 'af_sky', speed: 1.15, fx: 'phone', fallback: { role: 'caller', pitch: 1.35, rate: 1.2 },
    persona: 'Teenager who is not scared of any of it, only bored.', catchphrases: ['Okay but, like, no.'] }),
  m({ id: 'gerald', name: 'Gerald Pemberton', kind: 'caller', voice: 'bm_lewis', speed: 0.98, fx: 'phone', fallback: { role: 'caller', pitch: 0.8, rate: 0.98 },
    persona: 'A landlord who thinks he is the victim of the story.', catchphrases: ['I am a small businessman.'] }),
  m({ id: 'gus', name: 'Gus', kind: 'caller', voice: 'am_michael', speed: 1.1, fx: 'tinny', fallback: { role: 'caller', pitch: 0.88, rate: 1.18 },
    persona: 'Conspiracy caller. Connects the pigeons to the parking meters.', catchphrases: ['Think about it.', 'Who benefits?'] }),
  m({ id: 'tillman', name: 'Reverend Tillman', kind: 'caller', voice: 'bm_daniel', speed: 0.92, fx: 'phone', fallback: { role: 'caller', pitch: 0.78, rate: 0.95 },
    persona: 'Pastor with a kind voice and a long memory.', catchphrases: ['Let us be gentle with each other.'] }),
  m({ id: 'rosa', name: 'Rosa from Marcy', kind: 'caller', voice: 'af_river', speed: 1.0, fx: 'phone', fallback: { role: 'caller', pitch: 1.08, rate: 1.04 },
    persona: 'Lonely-hearts regular. Writes the best letters on the show.', catchphrases: ['Dear Lorraine.'] }),
  m({ id: 'dev', name: 'Dev the new neighbour', kind: 'caller', voice: 'am_eric', speed: 1.06, fx: 'phone', fallback: { role: 'caller', pitch: 1.05, rate: 1.12 },
    persona: 'Newly arrived, very friendly, slightly lost, brings kombucha to a stoop.', catchphrases: ['Hi! First time, long time.'] }),

  /* ---- ads, jingles, machines ---- */
  m({ id: 'trent', name: 'Trent Voiceover', kind: 'announcer', voice: 'bm_lewis', speed: 1.08, fx: 'ad', fallback: { role: 'announcer', pitch: 1.05, rate: 1.2 },
    persona: 'Commercial announcer. Every product is life-changing and the disclaimer is a blur.', catchphrases: ['Act now!'] }),
  m({ id: 'noelle', name: 'Noelle Voiceover', kind: 'announcer', voice: 'af_heart', speed: 1.04, fx: 'ad', fallback: { role: 'announcer', pitch: 1.2, rate: 1.14 },
    persona: 'Second commercial voice: silky, reassuring, slightly sinister.', catchphrases: ['You deserve it.'] }),
  m({ id: 'smartspeaker', name: 'Sheldon (smart speaker)', kind: 'announcer', voice: 'af_alloy', speed: 0.98, fx: 'tinny', fallback: { role: 'announcer', pitch: 1.3, rate: 0.95 },
    persona: 'A cheerful machine that is wrong with total confidence.', catchphrases: ['I have no record of you.'] }),
];

const byId = new Map(CAST.map((c) => [c.id, c]));
export const CAST_MAP: ReadonlyMap<string, CastMember> = byId;
export function castMember(id: string): CastMember | undefined { return byId.get(id); }
