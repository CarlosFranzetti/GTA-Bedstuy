/**
 * Two-deck DJ mini-game. Pure logic (no DOM, no Web Audio): decks advance on `tick(dt)` and tell an
 * audio port what to play, so scripted inputs score deterministically in tests.
 *
 * Score (0..100) = beatmatch accuracy (tempo + beat phase while both decks are audible)
 *                + crossfade timing (incoming deck on a bar line when the fader crosses the middle)
 *                + variety (different records played) [+ crowd mood in the club].
 */
import type { RecordDef } from './records';

export type DeckId = 0 | 1;
export const MAX_PITCH = 0.08;
/** A deck counts as audible above this fader gain. */
export const AUDIBLE_GAIN = 0.25;

/** What the logic needs from the sound engine (WebDjAudio implements it; tests use a fake). */
export interface DjAudioPort {
  setBuffer(deck: DeckId, buffer: AudioBuffer | null): void;
  start(deck: DeckId, offsetSec: number, rate: number): void;
  stop(deck: DeckId): void;
  setRate(deck: DeckId, rate: number): void;
  setGain(deck: DeckId, gain: number): void;
}

export interface DjEmitter { emit(type: string, payload: unknown): void }

export interface DeckView {
  record: RecordDef | null;
  loaded: boolean;
  playing: boolean;
  /** Seconds into the track. */
  pos: number;
  length: number;
  cuePoint: number;
  pitch: number;
  /** Tempo at the current pitch. */
  bpm: number;
  /** Position inside the current beat, 0..1. */
  beatPhase: number;
  /** Position inside the bar, 0..4 beats. */
  barBeat: number;
  gain: number;
}

export interface SetResult { venue: string; score: number; minutes: number; match: number; timing: number; variety: number; crowd: number }

interface Deck {
  record: RecordDef | null; length: number; pos: number; cue: number; pitch: number; playing: boolean; loaded: boolean; gain: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const frac = (v: number) => v - Math.floor(v);
/** Shortest distance between two phases in [0,1). */
export const phaseDistance = (a: number, b: number): number => { const d = Math.abs(frac(a) - frac(b)); return Math.min(d, 1 - d); };

export class DjGame {
  private readonly decks: [Deck, Deck] = [DjGame.blank(), DjGame.blank()];
  private fader = 0;
  /** Venue of the running set, null when not playing a set. */
  venue: string | null = null;
  private clock = 0;

  // scoring accumulators
  private matchSum = 0;
  private overlapTime = 0;
  private timings: number[] = [];
  private crowdLevel = 0.3;
  private crowdSum = 0;
  private deadAir = 0;
  private lastQuality = 0;
  private readonly heard = new Map<string, { seconds: number; genre: string }>();

  constructor(private readonly audio: DjAudioPort | null, private readonly events: DjEmitter | null = null) {
    this.applyGains();
  }

  private static blank(): Deck {
    return { record: null, length: 0, pos: 0, cue: 0, pitch: 0, playing: false, loaded: false, gain: 0 };
  }

  // ------------------------------------------------------------ set lifecycle

  startSet(venue: string): void {
    this.venue = venue;
    this.clock = 0; this.matchSum = 0; this.overlapTime = 0; this.timings = [];
    this.crowdLevel = 0.3; this.crowdSum = 0; this.deadAir = 0; this.heard.clear(); this.lastQuality = 0;
  }

  get active(): boolean { return this.venue !== null; }

  /** Ends the set: emits `dj:setFinished { venue, score, minutes }` and stops the decks. */
  finishSet(): SetResult {
    const venue = this.venue ?? 'home';
    const r = this.result();
    const out: SetResult = { ...r, venue };
    for (const d of [0, 1] as const) { if (this.decks[d].playing) this.stop(d); }
    this.venue = null;
    this.events?.emit('dj:setFinished', { venue, score: out.score, minutes: out.minutes });
    return out;
  }

  // ------------------------------------------------------------ deck controls

  /** Loads a record. `length` is the loop/track length in seconds. */
  load(deck: DeckId, record: RecordDef, length: number, buffer: AudioBuffer | null = null): void {
    const d = this.decks[deck];
    if (d.playing) this.audio?.stop(deck);
    d.record = record; d.length = Math.max(0.1, length); d.pos = 0; d.cue = 0; d.playing = false; d.loaded = true; d.pitch = 0;
    this.audio?.setBuffer(deck, buffer);
  }

  eject(deck: DeckId): void {
    const d = this.decks[deck];
    if (d.playing) this.audio?.stop(deck);
    this.decks[deck] = DjGame.blank();
    this.audio?.setBuffer(deck, null);
  }

  play(deck: DeckId): void {
    const d = this.decks[deck];
    if (!d.loaded) return;
    if (d.playing) { this.stop(deck); return; }
    d.playing = true;
    this.audio?.start(deck, d.pos, 1 + d.pitch);
    this.applyGains();
  }

  private stop(deck: DeckId): void {
    const d = this.decks[deck];
    d.playing = false;
    this.audio?.stop(deck);
  }

  /** Cue: while playing, jump back to the cue point and stop; while stopped, drop the cue point here. */
  cue(deck: DeckId): void {
    const d = this.decks[deck];
    if (!d.loaded) return;
    if (d.playing) { this.stop(deck); d.pos = d.cue; } else d.cue = d.pos;
  }

  /** Pitch as a fraction, clamped to +-8 %. */
  setPitch(deck: DeckId, pitch: number): void {
    const d = this.decks[deck];
    d.pitch = clamp(Number.isFinite(pitch) ? pitch : 0, -MAX_PITCH, MAX_PITCH);
    if (d.playing) this.audio?.setRate(deck, 1 + d.pitch);
  }

  /** Jog: shifts the deck by a fraction of a beat (positive = later). */
  nudge(deck: DeckId, beats: number): void {
    const d = this.decks[deck];
    if (!d.loaded || !d.record) return;
    d.pos = ((d.pos + (beats * 60) / d.record.bpm) % d.length + d.length) % d.length;
    if (d.playing) this.audio?.start(deck, d.pos, 1 + d.pitch);
  }

  /** Crossfader 0 (deck A) .. 1 (deck B). Crossing the middle with both decks running scores a transition. */
  setCrossfader(v: number): void {
    const next = clamp(Number.isFinite(v) ? v : 0.5, 0, 1);
    const prev = this.fader;
    this.fader = next;
    this.applyGains();
    if (!this.active) return;
    const crossedUp = prev < 0.5 && next >= 0.5;
    const crossedDown = prev > 0.5 && next <= 0.5;
    if (!crossedUp && !crossedDown) return;
    const incoming = this.decks[crossedUp ? 1 : 0];
    const outgoing = this.decks[crossedUp ? 0 : 1];
    if (!incoming.playing || !incoming.record || !outgoing.playing) return;
    const barBeat = frac((incoming.pos * incoming.record.bpm) / 240) * 4;
    const dist = Math.min(barBeat, 4 - barBeat); // beats from the nearest bar line, 0..2
    const aligned = clamp(1 - dist / 1.0, 0, 1);
    this.timings.push(aligned * (0.4 + 0.6 * this.lastQuality));
  }

  get crossfader(): number { return this.fader; }

  /** Equal-power gains for the fader position. */
  static gains(fader: number): [number, number] { return [Math.cos(fader * Math.PI / 2), Math.sin(fader * Math.PI / 2)]; }

  private applyGains(): void {
    const [a, b] = DjGame.gains(this.fader);
    this.decks[0].gain = a; this.decks[1].gain = b;
    this.audio?.setGain(0, a); this.audio?.setGain(1, b);
  }

  // ------------------------------------------------------------ simulation

  tick(dt: number): void {
    if (!(dt > 0)) return;
    const step = Math.min(dt, 0.25);
    for (const id of [0, 1] as const) {
      const d = this.decks[id];
      if (d.playing) d.pos = (d.pos + step * (1 + d.pitch)) % d.length;
    }
    if (!this.active) return;
    this.clock += step;

    const [a, b] = this.decks;
    const audA = a.playing && a.gain >= AUDIBLE_GAIN && !!a.record;
    const audB = b.playing && b.gain >= AUDIBLE_GAIN && !!b.record;

    let q = 0;
    if (audA && audB) {
      q = this.matchQuality();
      this.matchSum += q * step; this.overlapTime += step;
    }
    this.lastQuality = audA && audB ? q : this.lastQuality;

    for (const [d, aud] of [[a, audA], [b, audB]] as const) {
      if (aud && d.record) {
        const h = this.heard.get(d.record.id) ?? { seconds: 0, genre: String(d.record.genre) };
        h.seconds += step; this.heard.set(d.record.id, h);
      }
    }

    // crowd
    let target: number;
    if (!audA && !audB) { target = 0; this.deadAir += step; }
    else if (audA && audB) target = q < 0.3 ? 0.08 : 0.35 + 0.65 * q;
    else target = 0.55;
    const rate = target > this.crowdLevel ? 0.15 : 0.25;
    this.crowdLevel = clamp(this.crowdLevel + clamp(target - this.crowdLevel, -rate * step, rate * step), 0, 1);
    this.crowdSum += this.crowdLevel * step;
  }

  /** Beatmatch quality right now, 0..1: tempo gap and beat-phase gap between the decks. */
  matchQuality(): number {
    const [a, b] = this.decks;
    if (!a.record || !b.record) return 0;
    const bpmA = a.record.bpm * (1 + a.pitch), bpmB = b.record.bpm * (1 + b.pitch);
    const tempo = 1 - clamp(Math.abs(bpmA - bpmB) / 5, 0, 1);
    const phA = frac((a.pos * a.record.bpm) / 60), phB = frac((b.pos * b.record.bpm) / 60);
    const phase = 1 - clamp(phaseDistance(phA, phB) / 0.2, 0, 1);
    return tempo * phase;
  }

  // ------------------------------------------------------------ views and score

  deck(id: DeckId): DeckView {
    const d = this.decks[id];
    const bpm = d.record ? d.record.bpm * (1 + d.pitch) : 0;
    const beats = d.record ? (d.pos * d.record.bpm) / 60 : 0;
    return {
      record: d.record, loaded: d.loaded, playing: d.playing, pos: d.pos, length: d.length, cuePoint: d.cue, pitch: d.pitch, bpm,
      beatPhase: frac(beats), barBeat: frac(beats / 4) * 4, gain: d.gain,
    };
  }

  /** 0..1 crowd mood (only meaningful in the club). */
  get crowd(): number { return this.crowdLevel; }

  /** Beat phase and tempo of what the room hears: the louder playing deck, or null if silent. */
  get roomBeat(): { phase: number; bpm: number; level: number } | null {
    const [a, b] = this.decks;
    const pick = a.playing && (!b.playing || a.gain >= b.gain) ? a : b.playing ? b : null;
    if (!pick || !pick.record) return null;
    const id = pick === a ? 0 : 1;
    const v = this.deck(id);
    return { phase: v.beatPhase, bpm: v.bpm, level: pick.gain };
  }

  /** Phase gap of deck B relative to A in beats, -0.5..0.5 (for the UI's sync meter). */
  phaseOffset(): number {
    const a = this.deck(0), b = this.deck(1);
    let d = b.beatPhase - a.beatPhase;
    if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
    return d;
  }

  result(): Omit<SetResult, 'venue'> {
    const elapsed = Math.max(this.clock, 1e-6);
    const match = this.overlapTime > 0 ? this.matchSum / this.overlapTime : 0;
    const timing = this.timings.length ? this.timings.reduce((s, v) => s + v, 0) / this.timings.length : 0;
    const distinct = [...this.heard.values()].filter((h) => h.seconds >= 6);
    const genres = new Set(distinct.map((h) => h.genre));
    const variety = clamp((distinct.length - 1) / 3 * 0.8 + (genres.size - 1) * 0.1, 0, 1);
    const crowd = this.crowdSum / elapsed;
    const club = this.venue !== null && this.venue !== 'home';
    let s = club ? 0.35 * match + 0.2 * timing + 0.2 * variety + 0.25 * crowd : 0.5 * match + 0.3 * timing + 0.2 * variety;
    s *= 1 - clamp(this.deadAir / elapsed, 0, 1) * 0.8;
    const score = Math.round(clamp(s, 0, 1) * 100);
    return { score, minutes: Math.round((this.clock / 60) * 10) / 10, match, timing, variety, crowd };
  }
}
