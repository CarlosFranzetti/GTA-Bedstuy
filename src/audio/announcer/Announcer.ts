/**
 * Station announcers: a synthesized voice per SoundCloud station, speaking with the browser's SpeechSynthesis the
 * same way WBSY Talk does (voice picking, utterance chunking, per-persona pitch and rate come from ../talk).
 *
 * When it speaks:
 *  - on tune-in, after the station jingle (a short station ID; at most once per 20 s so flipping the dial is quiet);
 *  - between sets: what just ended and what is up next. Always, whatever the cadence;
 *  - otherwise at most once every 8 minutes: a one-liner or the time and weather.
 * It never speaks while WBSY Talk is tuned in or on air (the talk show owns the speech queue), it ducks the
 * SoundCloud widget while talking, and with no SpeechSynthesis voices on the device it stays silent and only offers
 * a text line for the HUD for as long as the line would have taken to read.
 *
 * Time only advances through `update(dt)` (game time), so announcers pause with the game.
 */
import { scStationDef, type ScStationDef } from '../radio';
import { estimateSeconds, chunkText } from '../talk/script';
import { pickVoices, type SpeechLike, type UtteranceLike, type VoiceLike } from '../talk/TalkPlayer';
import { personaFor, type Persona } from './personas';
import { SCRIPTS, fillScript, shortStreet, spokenTime, weatherPhrase, type WeatherKind } from './scripts';
import type { DjScheduler, DjOut } from '../voice/Scheduler';
import type { VoiceHub } from '../voice/VoiceHub';
import type { PlayHandle, ResolvedLine } from '../voice/SpeechPlayer';
import type { VoiceContext } from '../voice/types';
import { spokenText } from '../voice/script';
import { DJ_COPY } from '../voice/shows/djs';

/** At most one unprompted announcement per this many seconds. */
export const ANNOUNCER_MIN_GAP_S = 8 * 60;
/** A fresh story bulletin is read once this long after the last announcement (instead of waiting for the 8 minute gap). */
export const ANNOUNCER_NEWS_GAP_S = 45;
/** Chance that an unprompted one-liner is a story ad when ads are loaded. */
export const ANNOUNCER_AD_CHANCE = 0.3;
/** Wait after a tune-in or a set change so the station jingle is not talked over. */
export const ANNOUNCER_JINGLE_DELAY_S = 1.8;
/** Minimum seconds between two tune-in IDs. */
export const ANNOUNCER_TUNE_COOLDOWN_S = 20;
/** Widget level while the announcer talks (1 = full). */
export const ANNOUNCER_DUCK = 0.22;
const DUCK_RELEASE_PER_S = 1.6;

export interface BroadcastContext {
  /** Hour of the day 0..24 (fractions are minutes). */
  hour: number;
  weather: WeatherKind;
  /** Rain intensity 0..1. */
  rain: number;
  street: string;
  /** Story news (newest first), read once each: the story director's `broadcast().bulletins`. */
  bulletins?: readonly string[];
  /** Story ads that may replace a one-liner (`broadcast().ads`). */
  ads?: readonly string[];
  /** VOX: live state for the police blotter and news bulletins. Wanted level 0..5, missions finished, title of the last one. */
  stars?: number;
  missionsDone?: number;
  lastMission?: string;
}

export const DEFAULT_BROADCAST: BroadcastContext = { hour: -1, weather: 'dry', rain: 0, street: 'Throop Ave' };

export interface AnnouncerEnv {
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  /** Speech volume 0..1 (the game's radio volume). */
  volume: () => number;
  /** 1 = music at full level, lower = ducked under the voice. */
  setDuck: (level: number) => void;
  /** True while WBSY Talk is tuned in or speaking. */
  talkBusy: () => boolean;
  context: () => BroadcastContext;
  random: () => number;
  /** VOX lane: in-character DJ copy (real set names, time, weather, traffic, shout-outs, ads) and the voice hub that speaks it (HD voices or system voices per character). Absent = the original SpeechSynthesis path. */
  dj?: DjScheduler;
  hub?: VoiceHub;
}

export interface SetInfo { title: string; user?: string; dj?: string }

export type AnnounceKind = 'id' | 'set' | 'ident' | 'hour';

type Phase = 'idle' | 'speaking' | 'text';

interface Pending { kind: AnnounceKind; lines: string[]; delay: number; rlines?: ResolvedLine[] }

/** Makes a SoundCloud title safe and short to read aloud. */
export function speakable(text: string, max = 90): string {
  let t = (text ?? '').replace(/https?:\/\/\S+/g, ' ').replace(/[|]/g, ', ').replace(/&/g, ' and ').replace(/[\u{1F000}-\u{1FFFF}☀-➿]/gu, ' ').replace(/[_*#~^<>[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > max) {
    t = t.slice(0, max);
    const sp = t.lastIndexOf(' ');
    if (sp > 30) t = t.slice(0, sp);
  }
  return t;
}

export class Announcer {
  private def: ScStationDef | null = null;
  private persona: Persona | null = null;
  private phase: Phase = 'idle';
  private pending: Pending | null = null;
  private lines: string[] = [];
  private chunks: string[] = [];
  private chunkAt = 0;
  private lineAt = 0;
  private token = 0;
  private timer = 0;
  private elapsed = 0;
  private text = '';
  private kind: AnnounceKind | null = null;
  private paused = false;
  /** Seconds since an announcement started (starts "full" so the first one is one gap after tuning in). */
  private sinceLast = 0;
  private sinceTune = Infinity;
  private duck = 1;
  private duckTarget = 1;
  private voices: Record<string, VoiceLike | null> | null = null;
  private voiceCount = -1;
  private handle: PlayHandle | null = null;
  private readonly bags = new Map<string, number[]>();
  private readonly newsHeard = new Set<string>();
  /** Everything that was announced, newest last (tests and the transcript). */
  readonly history: Array<{ station: string; kind: AnnounceKind; text: string }> = [];

  constructor(private readonly env: AnnouncerEnv) {}

  /* ---------- reading ---------- */

  /** True when this device has at least one SpeechSynthesis voice. */
  get voiceAvailable(): boolean {
    if (this.env.hub) return this.env.hub.canSpeak;
    const sp = this.env.speech;
    if (!sp) return false;
    try { return sp.getVoices().length > 0; } catch { return false; }
  }
  /** True while a line is being read (or, without voices, shown). */
  get speaking(): boolean { return this.phase !== 'idle'; }
  get station(): ScStationDef | null { return this.def; }
  get currentKind(): AnnounceKind | null { return this.phase === 'idle' ? null : this.kind; }
  /** The line being read, for subtitles and the voice-less HUD. */
  get line(): string { return this.phase === 'idle' ? '' : this.text; }
  /** Announcer name while speaking, else ''. HUD: "{station} — {name}". */
  get name(): string { return this.phase === 'idle' || !this.persona ? '' : this.persona.name; }
  get duckLevel(): number { return this.duck; }
  get secondsSinceLast(): number { return this.sinceLast; }
  get hasPending(): boolean { return this.pending !== null; }

  /* ---------- events ---------- */

  /** The listener tuned in (or got into the car on) a music station. Speaks the station ID after the jingle. */
  tuneIn(def: ScStationDef): void {
    this.stop();
    this.def = def;
    this.persona = personaFor(def.id) ?? null;
    this.pending = null;
    if (!this.persona || this.sinceTune < ANNOUNCER_TUNE_COOLDOWN_S) return;
    this.sinceTune = 0;
    if (this.env.dj) {
      this.pending = { ...this.fromDj('id', this.env.dj.ident(def.id, def.name, def.freq, this.vctx())), delay: ANNOUNCER_JINGLE_DELAY_S };
      return;
    }
    const s = SCRIPTS[def.id];
    const line = fillScript(this.pick(s.ids), { station: def.name, freq: def.freq });
    this.pending = { kind: 'id', lines: [line], delay: ANNOUNCER_JINGLE_DELAY_S };
  }

  /** The listener left the music stations (talk show, radio off, out of the car). */
  tuneAway(): void {
    this.stop();
    this.def = null;
    this.persona = null;
    this.pending = null;
  }

  /** A set ended and the next one started: always announced (outro, then intro), whatever the cadence. */
  betweenSets(prev: SetInfo | null, next: SetInfo | null): boolean {
    const def = this.def;
    if (!def || !this.persona || this.env.talkBusy()) return false;
    if (this.env.dj) {
      const nm = (x: SetInfo | null) => (x ? { dj: speakable(x.dj ?? x.user ?? '', 50) || undefined, title: speakable(x.title) || undefined } : null);
      this.stopOwnSpeech();
      this.pending = { ...this.fromDj('set', this.env.dj.betweenSets(def.id, def.name, def.freq, nm(prev), nm(next), this.vctx())), delay: ANNOUNCER_JINGLE_DELAY_S };
      return true;
    }
    const s = SCRIPTS[def.id];
    const lines: string[] = [];
    const pd = speakable(prev?.dj ?? prev?.user ?? '', 50);
    const pt = speakable(prev?.title ?? '');
    if (pd || pt) lines.push(fillScript(this.pick(s.outros), { prevDj: pd || 'the last DJ', prevTitle: pt || 'that set' }));
    const nd = speakable(next?.dj ?? next?.user ?? '', 50);
    const nt = speakable(next?.title ?? '');
    lines.push(nd && nt
      ? fillScript(this.pick(s.intros), { dj: nd, title: nt, station: def.name })
      : fillScript(this.pick(s.blind), { station: def.name }));
    this.stopOwnSpeech();
    this.pending = { kind: 'set', lines, delay: ANNOUNCER_JINGLE_DELAY_S };
    return true;
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (this.phase === 'speaking') { try { if (p) this.env.speech?.pause(); else this.env.speech?.resume(); } catch { /* ignore */ } }
  }

  update(dt: number): void {
    if (!(dt > 0) || this.paused) return;
    this.sinceTune += dt;
    if (this.def) this.sinceLast += dt;
    this.stepDuck(dt);
    if (!this.def) return;
    if (this.env.talkBusy()) {
      // The talk show owns the speech queue: never talk over it.
      if (this.phase !== 'idle') this.stop();
      this.pending = null;
      return;
    }
    if (this.pending) {
      this.pending.delay -= dt;
      if (this.pending.delay <= 0) { const p = this.pending; this.pending = null; this.begin(p.kind, p.lines, p.rlines); }
      return;
    }
    switch (this.phase) {
      case 'speaking':
        this.elapsed += dt;
        if (this.elapsed > Math.max(this.env.hub ? 120 : 25, estimateSeconds(this.text) * 2.5 + 10)) this.finish(); // speech stalled
        break;
      case 'text':
        this.timer -= dt;
        if (this.timer <= 0) this.finish();
        break;
      default:
        if (this.sinceLast >= ANNOUNCER_MIN_GAP_S) this.idle();
        else if (this.sinceLast >= ANNOUNCER_NEWS_GAP_S && this.nextBulletin() !== null) this.speakBulletin();
    }
  }

  stop(): void {
    this.stopOwnSpeech();
    this.pending = null;
  }

  dispose(): void {
    this.stop();
    this.def = null;
    this.setDuckNow(1);
  }

  /* ---------- internals ---------- */

  /** The newest story bulletin this announcer has not read yet. */
  private nextBulletin(): string | null {
    for (const b of this.env.context().bulletins ?? []) if (!this.newsHeard.has(b)) return b;
    return null;
  }

  private speakBulletin(): void {
    const b = this.nextBulletin();
    if (b === null) return;
    this.newsHeard.add(b);
    this.begin('ident', ['News.', b]);
  }

  /** One unprompted line: mostly one-liners, sometimes the clock and weather. */
  private idle(): void {
    const def = this.def;
    if (!def) return;
    if (this.nextBulletin() !== null) { this.speakBulletin(); return; }
    const ads = this.env.context().ads;
    if (ads && ads.length > 0 && this.env.random() < ANNOUNCER_AD_CHANCE) { this.begin('ident', [this.pick(ads)]); return; }
    if (this.env.dj) {
      const out = this.env.dj.idle(def.id, def.name, def.freq, this.vctx());
      const k = out.label === 'hours' ? 'hour' : 'ident';
      const f = this.fromDj(k, out);
      this.begin(f.kind, f.lines, f.rlines);
      return;
    }
    const s = SCRIPTS[def.id];
    if (this.env.random() < 0.3) {
      const ctx = this.env.context();
      const h = ctx.hour >= 0 ? ctx.hour : new Date().getHours() + new Date().getMinutes() / 60;
      const hh = Math.floor(h) % 24;
      const mm = Math.floor((h - Math.floor(h)) * 60);
      const night = hh >= 20 || hh < 5;
      this.begin('hour', [fillScript(this.pick(s.hours), { time: spokenTime(hh, mm), street: shortStreet(ctx.street), weather: weatherPhrase(ctx.weather, ctx.rain, night) })]);
    } else {
      this.begin('ident', [this.draw(def.id, s.idents)]);
    }
  }

  private vctx(): Partial<VoiceContext> { return this.env.context() as unknown as Partial<VoiceContext>; }

  private fromDj(kind: AnnounceKind, out: DjOut): { kind: AnnounceKind; lines: string[]; rlines: ResolvedLine[] } {
    return { kind, lines: out.lines.map((l) => spokenText(l.text)), rlines: out.lines };
  }

  private begin(kind: AnnounceKind, lines: string[], rlines?: ResolvedLine[]): void {
    const def = this.def;
    const persona = this.persona;
    if (!def || !persona || lines.length === 0 || this.env.talkBusy()) return;
    this.stopOwnSpeech();
    this.kind = kind;
    this.lines = lines;
    this.lineAt = 0;
    this.text = lines.join(' ');
    this.elapsed = 0;
    this.sinceLast = 0;
    this.history.push({ station: def.id, kind, text: this.text });
    if (this.history.length > 200) this.history.shift();
    if (!this.voiceAvailable) {
      this.phase = 'text';
      this.timer = Math.max(2.5, estimateSeconds(this.text));
      return;
    }
    this.phase = 'speaking';
    this.setDuckNow(ANNOUNCER_DUCK);
    const hub = this.env.hub;
    if (hub) {
      const rl = rlines ?? lines.map((text) => ({ who: DJ_COPY[def.id].who, text }));
      const my = this.token;
      this.handle = hub.player.play(rl, { onEnd: () => { if (my === this.token && this.phase === 'speaking') this.finish(); } });
      return;
    }
    this.nextLine();
  }

  private nextLine(): void {
    if (this.lineAt >= this.lines.length) { this.finish(); return; }
    this.chunks = chunkText(this.lines[this.lineAt]);
    this.chunkAt = 0;
    this.speakChunk();
  }

  private speakChunk(): void {
    const speech = this.env.speech;
    const persona = this.persona;
    if (!speech || !persona) { this.finish(); return; }
    if (this.chunkAt >= this.chunks.length) { this.lineAt++; this.nextLine(); return; }
    const list = speech.getVoices();
    if (!this.voices || list.length !== this.voiceCount) { this.voices = pickVoices(list); this.voiceCount = list.length; }
    const u = this.env.makeUtterance(this.chunks[this.chunkAt]);
    u.voice = this.voices[persona.role] ?? this.voices.host ?? null;
    u.pitch = Math.min(2, Math.max(0.1, persona.pitch));
    u.rate = Math.min(10, Math.max(0.1, persona.rate));
    u.volume = Math.min(1, Math.max(0, this.env.volume()));
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

  private finish(): void {
    this.handle = null;
    this.token++;
    this.phase = 'idle';
    this.duckTarget = 1;
  }

  /** Cancels only our own speech: the shared synthesizer also carries WBSY Talk, so it is never cancelled otherwise. */
  private stopOwnSpeech(): void {
    const wasSpeaking = this.phase === 'speaking';
    if (this.handle) { this.handle.cancel(); this.handle = null; }
    this.token++;
    this.phase = 'idle';
    if (wasSpeaking && !this.env.talkBusy()) { try { this.env.speech?.cancel(); } catch { /* ignore */ } }
    this.setDuckNow(1);
  }

  private setDuckNow(level: number): void {
    this.duck = level;
    this.duckTarget = level;
    this.env.setDuck(level);
  }

  private stepDuck(dt: number): void {
    if (this.duck >= this.duckTarget) return;
    this.duck = Math.min(this.duckTarget, this.duck + DUCK_RELEASE_PER_S * dt);
    this.env.setDuck(this.duck);
  }

  private pick(list: readonly string[]): string {
    return list[Math.min(list.length - 1, Math.floor(this.env.random() * list.length))];
  }

  /** Shuffle-bag draw: every line is used once before any repeats. */
  private draw(key: string, list: readonly string[]): string {
    let bag = this.bags.get(key);
    if (!bag || bag.length === 0) {
      bag = list.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(this.env.random() * (i + 1)));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.bags.set(key, bag);
    }
    return list[bag.pop()!];
  }
}

/** Convenience for the docs and tests. */
export function stationScript(id: string) {
  const def = scStationDef(id);
  return def ? SCRIPTS[def.id] : undefined;
}
