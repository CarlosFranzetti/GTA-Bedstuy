/**
 * Speaks pedestrian barks (the `pedBark` event of PedSocial). Cheap by construction:
 *  - nothing is spoken beyond EARSHOT of the listener, volume falls with distance, quiet lines carry less far;
 *  - one bark at a time, at least MIN_GAP seconds apart, and not while a radio talk show is speaking (the browser's speech queue is
 *    shared, a bark would wait behind the host); in that case only the subtitle shows;
 *  - HD (neural) voices when the hub has them: a per-person cast member (voice preset by sex and age, speed by the person's rate) is
 *    registered with registerPedCast and played through a SpeechPlayer of its own (so a bark never cancels a radio segment); otherwise the
 *    system voice with the person's own pitch and rate (the same fallback the radio cast uses).
 * The caller wires it: `events.on('pedBark', (e) => pedVoice.say(e, listenerPos))` and shows `pedVoice.onSubtitle` text in the HUD.
 */
import { registerPedCast } from './cast';
import { SpeechPlayer, type SpeechPlayerEnv } from './SpeechPlayer';
import type { CastMember, KokoroVoice } from './types';
import type { SpeechLike, UtteranceLike } from '../talk/TalkPlayer';

export const EARSHOT = 15;
export const MIN_GAP = 1.4;
export const PED_PER_PERSON_GAP = 10;

export interface PedBarkLike { id: string; text: string; kind: string; pos: { x: number; z: number }; pitch: number; rate: number; sex: 'm' | 'f' | 'x'; age: 'kid' | 'teen' | 'adult' | 'old'; loud: number }

export interface PedVoiceEnv {
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  /** master speech volume 0..1 */
  volume: () => number;
  /** true while a radio talk show or the announcer is speaking (barks then stay silent) */
  talkBusy?: () => boolean;
  /** neural engine pieces (optional): when `engine()` is usable the barks are rendered with it */
  neural?: Pick<SpeechPlayerEnv, 'ctx' | 'dest' | 'engine' | 'cache' | 'warn'>;
  /** the clock in seconds (the game clock; defaults to performance.now) */
  now?: () => number;
  /** subtitle text to show, e.g. `Passerby: "Morning!"` (the HUD decides how) */
  onSubtitle?: (who: string, text: string, seconds: number) => void;
}

const FEMALE_VOICES: readonly KokoroVoice[] = ['af_heart', 'af_nova', 'af_sky', 'af_jessica', 'af_sarah', 'bf_emma', 'af_kore'];
const MALE_VOICES: readonly KokoroVoice[] = ['am_adam', 'am_michael', 'am_liam', 'am_eric', 'am_puck', 'bm_lewis', 'am_echo'];
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/** one cast member per pedestrian (the same person always has the same voice) */
export function pedCast(b: Pick<PedBarkLike, 'id' | 'sex' | 'age' | 'pitch' | 'rate'>): CastMember {
  const list = b.sex === 'f' ? FEMALE_VOICES : b.sex === 'm' ? MALE_VOICES : (hash(b.id) < 0.5 ? FEMALE_VOICES : MALE_VOICES);
  const voice = b.age === 'kid' ? 'af_sky' : list[Math.floor(hash(b.id + ':v') * list.length) % list.length];
  return {
    id: `ped:${b.id}`, name: 'Passerby', kind: 'caller', voice, speed: Math.max(0.8, Math.min(1.25, b.rate)), fx: 'dry',
    fallback: { role: b.sex === 'f' ? 'sidekick' : 'host', pitch: b.pitch, rate: b.rate },
    persona: 'A neighbour on the street.', catchphrases: [],
  };
}

export class PedVoice {
  private last = -99;
  private readonly perPerson = new Map<string, number>();
  private player: SpeechPlayer | null = null;
  /** barks spoken / shown without sound (tests, debug overlay) */
  spoken = 0;
  silentLines = 0;

  constructor(private readonly env: PedVoiceEnv) {
    if (env.neural) this.player = new SpeechPlayer({ ...env.neural, speech: null, makeUtterance: env.makeUtterance, volume: env.volume });
  }

  private now(): number { return this.env.now ? this.env.now() : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0); }

  /** Say a bark if the listener can hear it and the rate limits allow it. Returns true if a line was started. */
  say(b: PedBarkLike, listener: { x: number; z: number }): boolean {
    const d = Math.hypot(b.pos.x - listener.x, b.pos.z - listener.z);
    const reach = EARSHOT * (0.4 + 0.6 * b.loud);
    if (d > reach) return false;
    const t = this.now();
    if (t - this.last < MIN_GAP && b.loud < 1) return false;
    if (t - (this.perPerson.get(b.id) ?? -99) < PED_PER_PERSON_GAP && b.loud < 1) return false;
    this.last = t; this.perPerson.set(b.id, t);
    if (this.perPerson.size > 200) this.perPerson.clear();
    this.env.onSubtitle?.('Passerby', b.text, Math.min(4.5, 1.6 + b.text.length * 0.05));
    if (this.env.talkBusy?.()) { this.silentLines++; return true; }
    const gain = Math.max(0.12, 1 - d / reach) * (0.5 + 0.5 * b.loud) * this.env.volume();
    if (this.player && this.player.mode === 'neural') {
      const c = pedCast(b);
      registerPedCast(c);
      this.player.play([{ who: c.id, text: b.text }]);
      this.spoken++;
      return true;
    }
    const sp = this.env.speech;
    if (!sp) { this.silentLines++; return true; }
    try {
      const u = this.env.makeUtterance(b.text);
      u.pitch = b.pitch; u.rate = b.rate; u.volume = Math.min(1, gain);
      sp.speak(u);
      this.spoken++;
    } catch { this.silentLines++; }
    return true;
  }
}
