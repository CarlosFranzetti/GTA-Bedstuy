/**
 * BarkDirector: decides which pedestrian, story or mission line is spoken now, with which voice, and enforces the
 * rate limits. Pure logic with an injected clock and audio backend, so a 10-minute walk can be simulated in a test.
 *
 * Priority (high to low): mission dialogue (4) > story barks (3) > reactions (2) > ambient chatter (1).
 * Limits: at most 2 ped voices at once; 1 bark per ped per 20 s; 1 bark per 4 s inside a 25 m radius; no ambient chatter
 * while story/mission speech or talk-radio speech in the car is playing; the same line never twice within 5 minutes;
 * nothing beyond 25 m. A line whose audio is not ready within 400 ms of being due is cancelled and shown as subtitle only
 * (the backend already prefers the system voice over waiting), so speech is never late by more than 400 ms.
 */
import { spokenText } from '../script';
import { storyPresets, storyVoice } from '../StoryVoices';
import type { FxPreset, KokoroVoice } from '../types';
import { assignVoice, PedVoiceRegistry, playbackFor, systemFor, type PedVoice, seededRandom } from './assign';
import type { AgeBand, Gender } from './groups';
import { BARK_KINDS, type BarkKind } from './barks';
import { BARK_BY_ID, BARK_LINES, linesFor, type BarkLine } from './lines';

export type SpeechClass = 'ambient' | 'reaction' | 'story' | 'mission';
export const PRIORITY: Readonly<Record<SpeechClass, number>> = { ambient: 1, reaction: 2, story: 3, mission: 4 };

export const LIMITS = {
  maxPedVoices: 2,
  perPedSec: 20,
  areaSec: 4,
  areaRadius: 25,
  repeatSec: 300,
  maxDist: 25,
  subtitleDist: 12,
  deadlineSec: 0.4,
  pairGapSec: 0.4,
  voiceRadius: 30,
  predictSec: 30,
} as const;

const AMBIENT: ReadonlySet<BarkKind> = new Set(['greeting', 'chat', 'stoop', 'seller']);
const REACTION_KINDS: Record<string, true> = { carClose: true, horn: true, nearMiss: true, knockedDown: true, gunshot: true, wanted: true, rain: true, playerRunning: true, playerDancing: true, complaint: true, bumped: true, crash: true };
export function classOf(kind: string): SpeechClass { return kind in REACTION_KINDS ? 'reaction' : 'ambient'; }

/** Leila's request (event `pedBark`): WHEN a ped speaks and to whom. */
export interface PedBarkEvent {
  pedId: string;
  kind: BarkKind | string;
  /** Words chosen by the emitter for kinds this module has no table for (chatReply, laugh, bye, excuse, bumped, crash, phone). */
  text?: string;
  pos?: { x: number; y: number };
  seed?: number;
  age?: AgeBand;
  gender?: Gender;
  /** Chat partner: this ped answers. */
  with?: string;
  toPlayer?: boolean;
  /** Metres to the player. */
  dist?: number;
  /** Optional hints; the voice assignment decides when absent. */
  pitch?: number;
  rate?: number;
}

/** Kinds of CHAR14's PedSocial that map onto this module's tables; the rest are spoken from the emitter's own text. */
const KIND_MAP: Readonly<Record<string, BarkKind>> = { greet: 'greeting', greetMorning: 'greeting', greetEvening: 'greeting', stoopHello: 'stoop', stoopReply: 'stoop', nearMiss: 'nearMiss', horn: 'horn', sirens: 'wanted' };

/**
 * Accepts both shapes of `pedBark`: the agreed one ({ pedId, kind, pos {x,y}, seed, age, gender, with, dist ... }) and what
 * PedSocial emits today ({ id, text, kind, pos {x,z}, sex 'm'|'f'|'x', age 'kid'|'teen'|'adult'|'old', loud }).
 */
export function normalizeBark(raw: unknown): PedBarkEvent | null {
  const e = raw as Record<string, any> | null;
  if (!e || typeof e !== 'object') return null;
  const pedId = String(e.pedId ?? e.id ?? '');
  if (!pedId || typeof e.kind !== 'string') return null;
  const pos = e.pos ? { x: Number(e.pos.x), y: Number(e.pos.y ?? e.pos.z ?? 0) } : undefined;
  const age = e.age === 'teen' ? 'young' : e.age === 'old' ? 'elder' : e.age;
  const gender = e.gender ?? (e.sex === 'm' || e.sex === 'f' ? e.sex : undefined);
  const mapped = KIND_MAP[e.kind];
  return {
    pedId, kind: mapped ?? e.kind, ...(mapped ? {} : { text: typeof e.text === 'string' ? e.text : undefined }), pos,
    seed: typeof e.seed === 'number' ? e.seed : undefined, age, gender, with: e.with, toPlayer: !!e.toPlayer, dist: typeof e.dist === 'number' ? e.dist : undefined,
  };
}

export type SubtitleMode = 'all' | 'story' | 'off';

export interface SpeechEventMap {
  'speech:start': { speakerId: string; durSec: number; lineId: string };
  'speech:viseme': { speakerId: string; t: number; open: number };
  'speech:end': { speakerId: string };
  'speech:subtitle': { who: string; text: string; durSec: number; pos?: { x: number; y: number }; kind: 'ped' | 'story' | 'mission' };
}
export type SpeechEventName = keyof SpeechEventMap;

/** Everything a backend needs to say one line. */
export interface SpeakJob {
  speakerId: string;
  lineId: string;
  /** Text with directions already removed. */
  text: string;
  /** Name shown on the subtitle. */
  who: string;
  cls: SpeechClass;
  priority: number;
  dist: number;
  pos?: { x: number; y: number };
  toPlayer: boolean;
  voice: { kokoro: KokoroVoice; speed: number; fx: FxPreset; playbackRate: number; detune: number; sys: { role: 'host' | 'sidekick' | 'caller' | 'announcer'; pitch: number; rate: number } } | null;
  /** Clock time the line was due. */
  dueAt: number;
}

export interface BackendHooks {
  /** Sound has begun. `mode` says where the audio came from. */
  started(durSec: number, mode: 'pack' | 'cache' | 'live' | 'system' | 'silent'): void;
  viseme(t: number, open: number): void;
  ended(): void;
}

export interface SpeechBackend {
  /** Starts the line (asynchronously) and reports through the hooks. */
  begin(job: SpeakJob, hooks: BackendHooks): { cancel(): void };
  /** Idle-time live render of a line into the cache (predicted lines only). */
  prerender?(job: SpeakJob): Promise<void>;
}

export interface DirectorEnv {
  now(): number;
  random(): number;
  backend: SpeechBackend;
  emit<K extends SpeechEventName>(type: K, payload: SpeechEventMap[K]): void;
  subtitleMode(): SubtitleMode;
  /** Talk-radio speech is playing in the car the player is in. */
  radioSpeechInCar(): boolean;
  /** Nothing else needs the CPU (no render in flight, not loading). */
  idle(): boolean;
  /** Cache check, so a predicted line already rendered is not rendered twice. */
  isReady?(job: SpeakJob): boolean;
}

export interface DirectorStats {
  accepted: number;
  dropped: Record<string, number>;
  started: number;
  subtitleOnly: number;
  maxConcurrent: number;
  preempted: number;
}

interface Active { job: SpeakJob; cancel(): void; startedEmitted: boolean; dur: number; beganAt: number }
interface Pending { at: number; job: SpeakJob }

export class BarkDirector {
  readonly registry = new PedVoiceRegistry(LIMITS.voiceRadius);
  readonly stats: DirectorStats = { accepted: 0, dropped: {}, started: 0, subtitleOnly: 0, maxConcurrent: 0, preempted: 0 };
  private readonly active = new Map<string, Active>();
  private readonly pending: Pending[] = [];
  private readonly lastPed = new Map<string, number>();
  private readonly recentLines = new Map<string, number>();
  private readonly starts: Array<{ t: number; x: number; y: number; hasPos: boolean }> = [];
  private readonly predicted: Array<{ job: SpeakJob; dueAt: number; done: boolean }> = [];
  private prerendering = false;
  private readonly listeners = new Set<(type: SpeechEventName, payload: unknown) => void>();

  constructor(private readonly env: DirectorEnv) {}

  /** Every speech event also goes to these listeners (AudioSystem.onSpeech). */
  onSpeech(fn: (type: SpeechEventName, payload: unknown) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get activeCount(): number { return this.active.size; }
  get activePeds(): number { let n = 0; for (const a of this.active.values()) if (a.job.cls === 'ambient' || a.job.cls === 'reaction') n++; return n; }
  private get storyActive(): boolean { for (const a of this.active.values()) if (a.job.cls === 'story' || a.job.cls === 'mission') return true; return false; }
  /** A pedestrian is talking right now (the radio ducks a little while this is true). */
  get pedSpeaking(): boolean { return this.activePeds > 0; }

  private drop(why: string): false { this.stats.dropped[why] = (this.stats.dropped[why] ?? 0) + 1; return false; }

  private emit<K extends SpeechEventName>(type: K, payload: SpeechEventMap[K]): void {
    this.env.emit(type, payload);
    for (const l of this.listeners) l(type, payload);
  }

  /* ---------- pedestrian requests (pedBark) ---------- */

  request(ev: PedBarkEvent): boolean {
    if (!ev || !ev.pedId || !ev.kind) return this.drop('bad');
    const now = this.env.now();
    const dist = ev.dist ?? 10;
    if (!(dist <= LIMITS.maxDist)) return this.drop('far');
    const cls = classOf(ev.kind);
    if (cls === 'ambient' && (this.storyActive || this.env.radioSpeechInCar())) return this.drop('radio');
    const last = this.lastPed.get(ev.pedId);
    if (last !== undefined && now - last < LIMITS.perPedSec) return this.drop('ped');
    const pos = ev.pos ?? { x: 0, y: 0 };
    for (const s of this.starts) {
      if (now - s.t >= LIMITS.areaSec) continue;
      if (!s.hasPos || !ev.pos || Math.hypot(s.x - pos.x, s.y - pos.y) <= LIMITS.areaRadius) return this.drop('area');
    }
    if (ev.kind === 'chat' && ev.with) return this.requestChat(ev, now, dist, pos);
    if (!(BARK_KINDS as readonly string[]).includes(ev.kind) && !ev.text) return this.drop('bad');

    const blocked = this.blockedPresets();
    const voice = this.registry.voiceFor(ev.pedId, { seed: ev.seed ?? hashId(ev.pedId), age: ev.age, gender: ev.gender }, pos, blocked);
    const own = (BARK_KINDS as readonly string[]).includes(ev.kind);
    const line: BarkLine | null = own ? this.pick(ev.kind as BarkKind, voice, undefined, now)
      : ev.text && this.fresh(extId(ev.text), now) ? { id: extId(ev.text), text: ev.text, personas: [], kind: 'chat', baked: [] } : null;
    if (!line) return this.drop('recent');
    const job = this.makeJob(ev.pedId, line, voice, cls, dist, ev.pos, !!ev.toPlayer, now);
    return this.admit(job, now);
  }

  private requestChat(ev: PedBarkEvent, now: number, dist: number, pos: { x: number; y: number }): boolean {
    const partner = ev.with!;
    const lastB = this.lastPed.get(partner);
    if (lastB !== undefined && now - lastB < LIMITS.perPedSec) return this.drop('ped');
    const blocked = this.blockedPresets();
    const va = this.registry.voiceFor(ev.pedId, { seed: ev.seed ?? hashId(ev.pedId), age: ev.age, gender: ev.gender }, pos, blocked);
    const vb = this.registry.voiceFor(partner, { seed: hashId(partner) }, pos, blocked);
    // Prefer a pair whose both halves are baked for these two voices; fall back to any pair (live / system voice).
    const baked = BARK_LINES.filter((l) => l.kind === 'chat' && l.side === 'a' && l.baked.includes(va.group.id) && this.fresh(l.id, now)
      && BARK_LINES.some((m) => m.kind === 'chat' && m.side === 'b' && m.pair === l.pair && m.baked.includes(vb.group.id) && this.fresh(m.id, now)));
    const pool = baked.length ? baked : BARK_LINES.filter((l) => l.kind === 'chat' && l.side === 'a' && this.fresh(l.id, now));
    if (!pool.length) return this.drop('recent');
    const a = pool[Math.floor(this.env.random() * pool.length) % pool.length];
    const b = BARK_LINES.find((m) => m.kind === 'chat' && m.side === 'b' && m.pair === a.pair)!;
    const jobA = this.makeJob(ev.pedId, a, va, 'ambient', dist, ev.pos, !!ev.toPlayer, now);
    if (!this.admit(jobA, now)) return false;
    this.lastPed.set(partner, now);
    this.recentLines.set(b.id, now);
    const jobB = this.makeJob(partner, b, vb, 'ambient', dist, ev.pos, !!ev.toPlayer, now);
    jobB.dueAt = Number.POSITIVE_INFINITY; // set when A ends
    this.pending.push({ at: Number.POSITIVE_INFINITY, job: jobB });
    return true;
  }

  private fresh(id: string, now: number): boolean { const t = this.recentLines.get(id); return t === undefined || now - t >= LIMITS.repeatSec; }

  private pick(kind: BarkKind, voice: PedVoice, side: 'a' | 'b' | undefined, now: number): BarkLine | null {
    let pool = linesFor(kind, voice.group.id, side).filter((l) => this.fresh(l.id, now));
    if (!pool.length) {
      // Nothing baked is fresh: any fitting line (live or system voice), persona-matched when it has personas.
      pool = BARK_LINES.filter((l) => l.kind === kind && (!side || l.side === side) && this.fresh(l.id, now)
        && (!l.personas.length || l.personas.some((p) => voice.group.personas.includes(p))));
    }
    if (!pool.length) return null;
    return pool[Math.floor(this.env.random() * pool.length) % pool.length];
  }

  private makeJob(pedId: string, line: BarkLine, v: PedVoice, cls: SpeechClass, dist: number, pos: { x: number; y: number } | undefined, toPlayer: boolean, now: number): SpeakJob {
    const pb = playbackFor(v);
    return {
      speakerId: pedId, lineId: line.id, text: spokenText(line.text), who: pedId, cls, priority: PRIORITY[cls], dist, pos, toPlayer,
      voice: { kokoro: v.group.voice, speed: v.group.speed, fx: 'street', playbackRate: pb.playbackRate, detune: pb.detune, sys: systemFor(v) },
      dueAt: now,
    };
  }

  /** Concurrency and priority: returns true when the job started. */
  private admit(job: SpeakJob, now: number): boolean {
    if (job.cls === 'ambient' || job.cls === 'reaction') {
      if (this.activePeds >= LIMITS.maxPedVoices) {
        let low: Active | null = null;
        for (const a of this.active.values()) if (a.job.cls !== 'story' && a.job.cls !== 'mission' && (!low || a.job.priority < low.job.priority)) low = a;
        if (!low || low.job.priority >= job.priority) return this.drop('busy');
        this.stats.preempted++;
        this.finish(low.job.speakerId, true);
      }
    }
    this.lastPed.set(job.speakerId, now);
    this.recentLines.set(job.lineId, now);
    this.starts.push({ t: now, x: job.pos?.x ?? 0, y: job.pos?.y ?? 0, hasPos: !!job.pos });
    while (this.starts.length > 32) this.starts.shift();
    this.stats.accepted++;
    this.run(job);
    return true;
  }

  /* ---------- story and mission lines ---------- */

  /** A story or mission line (always accepted). Returns false when the speaker has no voice (subtitle only). */
  speakStory(who: string, text: string, kind: 'story' | 'mission' = 'mission', opts: { pos?: { x: number; y: number }; dist?: number } = {}): boolean {
    const now = this.env.now();
    const clean = spokenText(text);
    if (!clean) return false;
    const sv = storyVoice(who);
    const lineId = `${kind}:${who}:${clean.length}:${hashStr(clean)}`;
    const job: SpeakJob = {
      speakerId: `${kind}:${who}`, lineId, text: clean, who, cls: kind, priority: PRIORITY[kind], dist: opts.dist ?? 1, pos: opts.pos, toPlayer: true,
      voice: sv ? { kokoro: sv.voice, speed: sv.speed, fx: sv.fx, playbackRate: 1, detune: 0, sys: sv.fallback } : null, dueAt: now,
    };
    this.stats.accepted++;
    // Story speech wins: ambient peds stop, one story line at a time per speaker.
    for (const a of [...this.active.values()]) if (a.job.cls === 'ambient') this.finish(a.job.speakerId, true);
    for (const a of [...this.active.values()]) if (a.job.speakerId === job.speakerId) this.finish(a.job.speakerId, true);
    this.run(job);
    return !!sv;
  }

  private blockedPresets(): Set<string> {
    const s = new Set<string>();
    if (!this.storyActive) return s;
    const mine = storyPresets();
    for (const a of this.active.values()) if ((a.job.cls === 'story' || a.job.cls === 'mission') && a.job.voice && mine.has(a.job.voice.kokoro)) s.add(a.job.voice.kokoro);
    return s;
  }

  /* ---------- running a job ---------- */

  private run(job: SpeakJob): void {
    const began = this.env.now();
    const entry: Active = { job, cancel: () => undefined, startedEmitted: false, dur: 0, beganAt: began };
    this.active.set(job.speakerId, entry);
    this.stats.maxConcurrent = Math.max(this.stats.maxConcurrent, this.activePeds);
    const hooks: BackendHooks = {
      started: (durSec, mode) => {
        if (this.active.get(job.speakerId) !== entry || entry.startedEmitted) return;
        entry.startedEmitted = true; entry.dur = durSec;
        this.stats.started++;
        if (mode === 'silent') { this.stats.subtitleOnly++; this.subtitle(job, durSec); return; }
        this.emit('speech:start', { speakerId: job.speakerId, durSec, lineId: job.lineId });
        this.subtitle(job, durSec);
      },
      viseme: (t, open) => { if (this.active.get(job.speakerId) === entry && entry.startedEmitted) this.emit('speech:viseme', { speakerId: job.speakerId, t, open }); },
      ended: () => { if (this.active.get(job.speakerId) === entry) this.finish(job.speakerId, false); },
    };
    entry.cancel = this.env.backend.begin(job, hooks).cancel;
  }

  private subtitle(job: SpeakJob, durSec: number): void {
    const mode = this.env.subtitleMode();
    if (mode === 'off') return;
    const ped = job.cls === 'ambient' || job.cls === 'reaction';
    if (ped && (mode !== 'all' || !(job.dist <= LIMITS.subtitleDist || job.toPlayer))) return;
    this.emit('speech:subtitle', { who: job.who, text: job.text, durSec, ...(job.pos ? { pos: job.pos } : {}), kind: ped ? 'ped' : job.cls === 'story' ? 'story' : 'mission' });
  }

  private finish(id: string, cancelled: boolean): void {
    const a = this.active.get(id);
    if (!a) return;
    this.active.delete(id);
    if (cancelled) { try { a.cancel(); } catch { /* backend already gone */ } }
    if (a.startedEmitted) this.emit('speech:end', { speakerId: id });
    if (!cancelled) {
      // a chat partner answers 0.4 s after the opener ends
      const i = this.pending.findIndex((p) => p.job.speakerId !== id && p.at === Number.POSITIVE_INFINITY && p.job.lineId !== a.job.lineId && BARK_BY_ID.get(p.job.lineId)?.pair === BARK_BY_ID.get(a.job.lineId)?.pair && BARK_BY_ID.get(a.job.lineId)?.side === 'a');
      if (i >= 0) this.pending[i].at = this.env.now() + LIMITS.pairGapSec;
    } else {
      const pr = BARK_BY_ID.get(a.job.lineId);
      if (pr?.side === 'a') { const i = this.pending.findIndex((p) => BARK_BY_ID.get(p.job.lineId)?.pair === pr.pair); if (i >= 0) this.pending.splice(i, 1); }
    }
  }

  /* ---------- per-frame work ---------- */

  update(): void {
    const now = this.env.now();
    // 400 ms rule: a started job whose sound did not begin in time becomes a subtitle and is cancelled
    for (const a of [...this.active.values()]) {
      if (!a.startedEmitted && now - a.beganAt > LIMITS.deadlineSec) {
        const dur = Math.max(1.2, a.job.text.split(/\s+/).length / 2.6 + 0.3);
        this.stats.subtitleOnly++; this.stats.started++;
        a.startedEmitted = true; a.dur = dur;
        try { a.cancel(); } catch { /* ignore */ }
        this.subtitle(a.job, dur);
        this.active.delete(a.job.speakerId);
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (now >= p.at && !this.active.has(p.job.speakerId)) {
        this.pending.splice(i, 1);
        if (this.activePeds >= LIMITS.maxPedVoices) { this.drop('busy'); continue; }
        p.job.dueAt = now; this.run(p.job);
      }
    }
    this.pump(now);
  }

  /* ---------- predicted lines: live render only when idle and due within 30 s ---------- */

  predict(who: string, text: string, kind: 'story' | 'mission', dueInSec: number): void {
    const sv = storyVoice(who);
    if (!sv) return;
    const clean = spokenText(text);
    const job: SpeakJob = { speakerId: `${kind}:${who}`, lineId: `${kind}:${who}:${hashStr(clean)}`, text: clean, who, cls: kind, priority: PRIORITY[kind], dist: 1, toPlayer: true,
      voice: { kokoro: sv.voice, speed: sv.speed, fx: sv.fx, playbackRate: 1, detune: 0, sys: sv.fallback }, dueAt: this.env.now() + dueInSec };
    if (this.predicted.some((p) => p.job.lineId === job.lineId)) return;
    this.predicted.push({ job, dueAt: job.dueAt, done: false });
  }

  private pump(now: number): void {
    if (this.prerendering || !this.env.backend.prerender || !this.env.idle()) return;
    const next = this.predicted
      .filter((p) => !p.done && p.dueAt - now <= LIMITS.predictSec && p.dueAt - now > -5)
      .sort((a, b) => b.job.priority - a.job.priority || a.dueAt - b.dueAt)[0];
    if (!next) { for (let i = this.predicted.length - 1; i >= 0; i--) if (this.predicted[i].done || this.predicted[i].dueAt < now - 5) this.predicted.splice(i, 1); return; }
    next.done = true;
    if (this.env.isReady?.(next.job)) return;
    this.prerendering = true;
    void this.env.backend.prerender(next.job).catch(() => undefined).then(() => { this.prerendering = false; });
  }

  cancelAll(): void { for (const id of [...this.active.keys()]) this.finish(id, true); this.pending.length = 0; }
}

function extId(text: string): string { return `ext:${hashStr(text)}`; }

export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function hashId(id: string): number { return hashStr(id); }

// re-exports used by tests
export { assignVoice, seededRandom };
