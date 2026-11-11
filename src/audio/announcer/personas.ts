/**
 * Announcer personas, one per SoundCloud station. All nine are invented: none is a real person or a real station,
 * and nothing here imitates a real voice. The voices are the browser's SpeechSynthesis voices, picked and told
 * apart exactly like WBSY Talk does it (src/audio/talk/TalkPlayer.ts `pickVoices` plus a pitch and rate per persona),
 * so a device with a single voice still gets eight distinguishable announcers.
 */
import type { VoiceRole } from '../talk/script';
import type { ScStationId } from '../radio';

export interface Persona {
  stationId: ScStationId;
  /** Shown on the HUD: "{station} — {name}". */
  name: string;
  /** Two or three lines describing the voice, used to write and review the scripts. */
  personality: readonly string[];
  /** Which of the (up to four) distinct system voices reads it. */
  role: VoiceRole;
  pitch: number;
  rate: number;
}

export const PERSONAS: readonly Persona[] = [
  { stationId: 'bkhouse', name: 'Deja Fontaine', role: 'sidekick', pitch: 1.08, rate: 0.98,
    personality: ['Warm late-night host who talks like she is standing at the edge of the dance floor.', 'Calls everyone "family", loves a long blend, never rushes a vocal.'] },
  { stationId: 'dublab', name: 'Odell Reverb', role: 'host', pitch: 0.7, rate: 0.84,
    personality: ['Slow, dry and deadpan; every sentence lands a beat late, like an echo.', 'Talks about bass as weather and the speaker stack as a roommate.'] },
  { stationId: 'stoop', name: 'Big Tayo', role: 'caller', pitch: 0.92, rate: 1.16,
    personality: ['Hyped stoop-side MC who never met a pause he did not fill.', 'Shouts out blocks, bodegas and bike lanes; thinks every verse is a lunchtime event.'] },
  { stationId: 'boogie', name: 'Velvet Lou', role: 'announcer', pitch: 0.86, rate: 0.92,
    personality: ['Smooth after-hours host in a very good jacket.', 'Treats the mirror ball as a co-host and the groove as a legal requirement.'] },
  { stationId: 'weird', name: 'Wren Calloway', role: 'sidekick', pitch: 1.3, rate: 0.88,
    personality: ['Dreamy, whispery and slightly lost, in a way that seems on purpose.', 'Mentions the time only to say it does not matter, and thanks the ceiling for listening.'] },
  { stationId: 'yard', name: 'Auntie Pearl', role: 'sidekick', pitch: 1.0, rate: 1.06,
    personality: ['Warm, teasing auntie who runs the sound system and the cookout.', 'Tells you to eat something, turn it up, and call your mother, in that order.'] },
  { stationId: 'flashback', name: 'Tommy Tapedeck', role: 'host', pitch: 1.0, rate: 1.12,
    personality: ['Overexcited pirate-radio MC with a rewind button for a heart.', 'Sprinkles in sound-effect words and calls every bass line serious business.'] },
  { stationId: 'latin', name: 'Lucho Ventura', role: 'caller', pitch: 0.95, rate: 1.1,
    personality: ['Warm, fast-talking host who narrates the dance floor like a ringside commentator.', 'Counts everyone into the clave and never lets a song end in silence.'] },
  { stationId: 'sc', name: 'Cass Meridian', role: 'announcer', pitch: 1.04, rate: 1.04,
    personality: ['Crisp, curious music nerd who reads the title and the DJ credit like liner notes.', 'Cares more about a seamless transition than about being heard.'] },
];

export function personaFor(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.stationId === id);
}
