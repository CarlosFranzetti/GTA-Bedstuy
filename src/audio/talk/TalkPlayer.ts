/**
 * WBSY Talk: plays the script segment by segment with the browser's SpeechSynthesis voices, procedural
 * stings between segments and a ducked bed. Without SpeechSynthesis it plays only the bed and shows the
 * unavailable notice. Time-based state is advanced by `update(dt)` (game time), so it pauses with the game.
 * Like the music stations it keeps a virtual clock: tuning away and back resumes at the segment that "would be on".
 */
import { stingDuration, talkSting, type TalkStingKind } from '../synth';
import { callerIndex, chunkText, openingSting, totalSeconds, voiceRole, type TalkSegment, type VoiceRole } from './script';

export interface VoiceLike { name: string; lang: string; localService?: boolean; default?: boolean; }

export interface UtteranceLike {
  text: string;
  voice: VoiceLike | null;
  pitch: number;
  rate: number;
  volume: number;
  lang: string;
  onend: ((e?: unknown) => void) | null;
  onerror: ((e?: unknown) => void) | null;
}

export interface SpeechLike {
  speak(u: UtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): VoiceLike[];
}

/** What the talk player needs from the audio graph. */
export interface TalkAudio {
  /** Plays a sting; returns its length in seconds. */
  sting(kind: TalkStingKind): number;
  /** Bed level 0..1 (relative; AudioSystem scales it to a tiny gain). */
  setBed(level: number): void;
}

export interface TalkEnv {
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  audio: TalkAudio;
}

export const TALK_STATION_NAME = 'WBSY Talk';
export const TALK_UNAVAILABLE_NAME = 'WBSY Talk (voice unavailable on this device)';

const BED_DUCKED = 0.25;
const BED_OPEN = 0.7;
const BED_ONLY = 1;
const GAP_SECONDS = 0.25;

/** Pitch/rate per role. Distinct even when the device offers a single voice. */
const PROFILE: Record<VoiceRole, { pitch: number; rate: number }> = {
  host: { pitch: 0.82, rate: 0.98 },
  sidekick: { pitch: 1.18, rate: 1.04 },
  caller: { pitch: 1.0, rate: 1.1 },
  announcer: { pitch: 1.05, rate: 1.2 },
};

const MALE = /daniel|alex\b|fred|david|mark\b|guy\b|aaron|arthur|george|james|male(?!\s*female)|ryan|thomas|rishi|oliver|google uk english male/i;
const FEMALE = /samantha|karen|moira|tessa|zira|susan|victoria|aria|jenny|female|serena|fiona|catherine|hazel|libby|google us english/i;

function langRank(v: VoiceLike): number {
  const l = v.lang.toLowerCase().replace('_', '-');
  if (l === 'en-us') return 0;
  if (l.startsWith('en')) return 1;
  return 2;
}

/** Picks up to four distinct voices by language and name heuristics. Roles with no spare voice get null (default voice). */
export function pickVoices(voices: readonly VoiceLike[]): Record<VoiceRole, VoiceLike | null> {
  const out: Record<VoiceRole, VoiceLike | null> = { host: null, sidekick: null, caller: null, announcer: null };
  if (voices.length === 0) return out;
  const sorted = [...voices].sort((a, b) => langRank(a) - langRank(b) || Number(!!b.localService) - Number(!!a.localService));
  const english = sorted.filter((v) => langRank(v) < 2);
  const pool = english.length >= 2 ? english : sorted;
  const used = new Set<VoiceLike>();
  const take = (pred: (v: VoiceLike) => boolean): VoiceLike | null => {
    const v = pool.find((x) => !used.has(x) && pred(x)) ?? pool.find((x) => !used.has(x)) ?? null;
    if (v) used.add(v);
    return v;
  };
  out.host = take((v) => MALE.test(v.name));
  out.sidekick = take((v) => FEMALE.test(v.name));
  out.caller = take((v) => MALE.test(v.name) || !FEMALE.test(v.name));
  out.announcer = take(() => true);
  // With fewer voices than roles the spare roles stay null: they share the host's voice, told apart by pitch and rate.
  return out;
}

export interface TalkProgress {
  /** Index of the current segment, 0-based. */
  segment: number;
  total: number;
  /** Position in the loop, 0..1. */
  fraction: number;
  speaker: string;
  kind: string;
  /** Seconds elapsed in the loop. */
  elapsed: number;
  duration: number;
}

type Phase = 'idle' | 'sting' | 'speaking' | 'wait' | 'gap';

export class TalkPlayer {
  private segs: TalkSegment[];
  private starts: number[] = [];
  private loop = 0;
  /** Virtual clock, seconds into the loop (monotonic modulo `loop`). */
  private clock = 0;
  private index = 0;
  private phase: Phase = 'idle';
  private timer = 0;
  private active = false;
  private paused = false;
  private chunks: string[] = [];
  private chunkAt = 0;
  private token = 0;
  private speakElapsed = 0;
  private segElapsed = 0;
  private voices: Record<VoiceRole, VoiceLike | null> | null = null;
  private voiceCount = -1;

  constructor(private readonly env: TalkEnv, script: TalkSegment[]) {
    this.segs = script;
    this.reindex();
  }

  /** True when the device can speak. */
  get voiceAvailable(): boolean { return !!this.env.speech; }
  get stationName(): string { return this.voiceAvailable ? TALK_STATION_NAME : TALK_UNAVAILABLE_NAME; }
  get isActive(): boolean { return this.active; }
  get segmentCount(): number { return this.segs.length; }
  get loopSeconds(): number { return this.loop; }

  setScript(script: TalkSegment[]): void {
    this.segs = script;
    this.reindex();
    if (this.active) this.begin(this.segmentAt(this.clock));
  }

  /** Text shown next to the station name. */
  get caption(): string {
    if (!this.active || this.segs.length === 0) return '';
    const s = this.segs[this.index];
    const who = s.kind === 'ad' ? 'Ad break' : s.kind === 'jingle' || s.kind === 'sting' ? 'WBSY' : s.speaker || s.kind;
    return who;
  }

  get progress(): TalkProgress {
    const total = this.segs.length;
    const elapsed = total ? this.starts[this.index] + Math.min(this.segs[this.index].seconds, this.segElapsed) : 0;
    const s = this.segs[this.index];
    return {
      segment: this.index,
      total,
      fraction: this.loop > 0 ? Math.min(1, elapsed / this.loop) : 0,
      speaker: s?.speaker ?? '',
      kind: s?.kind ?? '',
      elapsed,
      duration: this.loop,
    };
  }

  /** Tune in (true) or away (false). Tuning in picks the segment the virtual clock says is on air. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this.env.audio.setBed(BED_OPEN);
      this.begin(this.segmentAt(this.clock));
    } else {
      this.halt();
      this.env.audio.setBed(0);
    }
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (!this.active) return;
    if (p) this.env.speech?.pause(); else this.env.speech?.resume();
  }

  update(dt: number): void {
    if (!(dt > 0) || this.paused || this.loop <= 0) return;
    // The clock always runs; while on air it never runs past the end of the current segment.
    this.clock += dt;
    if (!this.active) return;
    this.segElapsed += dt;
    const seg = this.segs[this.index];
    const cap = this.starts[this.index] + seg.seconds - 0.001;
    const base = Math.floor(this.clock / this.loop) * this.loop;
    if (this.clock - base > cap) this.clock = base + cap;
    switch (this.phase) {
      case 'sting':
      case 'gap':
      case 'wait':
        this.timer -= dt;
        if (this.timer <= 0) this.afterTimer();
        break;
      case 'speaking':
        this.speakElapsed += dt;
        if (this.speakElapsed > Math.max(25, seg.seconds * 2.5 + 10)) this.finishSegment(); // speech stalled
        break;
      default:
    }
  }

  dispose(): void {
    this.active = false;
    this.halt();
    this.env.audio.setBed(0);
  }

  /* ---------- state machine ---------- */

  private reindex(): void {
    let t = 0;
    this.starts = this.segs.map((s) => { const at = t; t += s.seconds; return at; });
    this.loop = totalSeconds(this.segs);
    if (this.index >= this.segs.length) this.index = 0;
  }

  private segmentAt(clock: number): number {
    if (this.segs.length === 0 || this.loop <= 0) return 0;
    const t = ((clock % this.loop) + this.loop) % this.loop;
    for (let i = this.segs.length - 1; i >= 0; i--) if (t >= this.starts[i]) return i;
    return 0;
  }

  private halt(): void {
    this.token++;
    this.phase = 'idle';
    this.env.speech?.cancel();
  }

  private begin(i: number): void {
    this.token++;
    this.env.speech?.cancel();
    if (this.segs.length === 0) { this.phase = 'wait'; this.timer = Infinity; this.env.audio.setBed(BED_ONLY); return; }
    this.index = i % this.segs.length;
    const seg = this.segs[this.index];
    const prev = this.segs[(this.index + this.segs.length - 1) % this.segs.length];
    const base = Math.floor(this.clock / this.loop) * this.loop;
    this.clock = Math.max(this.clock, base + this.starts[this.index]);
    this.segElapsed = Math.max(0, this.clock - base - this.starts[this.index]);
    this.speakElapsed = 0;
    this.chunks = [];
    const kind = openingSting(seg, this.index === 0 && !this.hasPlayed ? null : prev);
    this.hasPlayed = true;
    if (kind) {
      this.phase = 'sting';
      this.timer = this.env.audio.sting(kind) + 0.1;
      this.env.audio.setBed(BED_OPEN);
    } else {
      this.afterTimer();
    }
  }
  private hasPlayed = false;

  private afterTimer(): void {
    if (this.phase === 'gap') { this.advance(); return; }
    if (this.phase === 'wait') { this.finishSegment(); return; }
    // sting finished (or none): speak
    const seg = this.segs[this.index];
    const text = seg.kind === 'sting' ? '' : seg.text;
    if (!text || !this.env.speech) {
      // Nothing to say or no voice: hold the planned time with just the bed.
      this.phase = 'wait';
      this.timer = text ? Math.max(1, seg.seconds) : 0.2;
      this.env.audio.setBed(this.env.speech ? BED_OPEN : BED_ONLY);
      return;
    }
    this.chunks = chunkText(text);
    this.chunkAt = 0;
    this.phase = 'speaking';
    this.speakElapsed = 0;
    this.env.audio.setBed(seg.kind === 'host' || seg.kind === 'caller' ? BED_DUCKED : BED_OPEN);
    this.speakChunk();
  }

  private speakChunk(): void {
    const speech = this.env.speech;
    const seg = this.segs[this.index];
    if (!speech || !seg) return;
    if (this.chunkAt >= this.chunks.length) { this.finishSegment(); return; }
    const role = voiceRole(seg);
    const list = speech.getVoices();
    if (!this.voices || list.length !== this.voiceCount) { this.voices = pickVoices(list); this.voiceCount = list.length; }
    const u = this.env.makeUtterance(this.chunks[this.chunkAt]);
    const prof = PROFILE[role];
    const ci = callerIndex(seg);
    u.voice = this.voices[role] ?? (role === 'host' ? null : this.voices.host);
    u.pitch = Math.min(2, Math.max(0.1, prof.pitch + (role === 'caller' ? (ci % 3 - 1) * 0.14 : 0)));
    u.rate = prof.rate + (role === 'caller' ? (ci % 2) * 0.05 : 0);
    u.volume = 1;
    u.lang = u.voice?.lang ?? 'en-US';
    const my = this.token;
    const next = () => {
      if (my !== this.token || this.phase !== 'speaking') return;
      this.chunkAt++;
      this.speakChunk();
    };
    u.onend = next;
    u.onerror = next;
    try { speech.speak(u); } catch { next(); }
  }

  private finishSegment(): void {
    this.token++;
    this.env.speech?.cancel();
    this.phase = 'gap';
    this.timer = GAP_SECONDS;
    this.env.audio.setBed(BED_OPEN);
  }

  private advance(): void {
    const next = (this.index + 1) % Math.max(1, this.segs.length);
    const base = Math.floor(this.clock / this.loop) * this.loop;
    const wrapped = next === 0;
    this.clock = base + (wrapped ? this.loop : this.starts[next]);
    this.begin(next);
  }
}
