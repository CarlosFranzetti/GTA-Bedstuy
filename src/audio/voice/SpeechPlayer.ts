/**
 * Plays a list of script lines in character, through the best available path:
 *   neural  - HD engine renders each sentence (cached, pre-rendered ahead), scheduled on the WebAudio timeline through
 *             the per-character effect chain, so pauses, laughs, sound effects and interruptions are sample-accurate;
 *   system  - the browser's SpeechSynthesis, one voice slot + pitch + rate per character (the robot-ish fallback);
 *   silent  - nothing can speak: lines are "read" on a timer so captions and the show clock still advance.
 * A neural play drops to the system voice for the rest of the segment if a sentence fails or stalls, with one warning.
 */
import { CAST_MAP } from './cast';
import { ClipCache } from './ClipCache';
import { FxBank, playLaugh, playSfx, type FxHost } from './fx';
import { clipKey, lineSeconds } from './script';
import { planLine, shapeClip, turnGap } from './prosody';
import { rhythmFor } from './rhythm';
import type { CastMember, Clip, TtsEngine } from './types';
import { pickVoices, type SpeechLike, type UtteranceLike, type VoiceLike } from '../talk/TalkPlayer';
import type { VoiceRole } from '../talk/script';
import type { PackLookup } from './pack';

export interface ResolvedLine { who: string; text: string }

export interface PlayCallbacks {
  /** First sound of this play (duck the music here). */
  onStart?: () => void;
  onLine?: (who: CastMember, text: string) => void;
  /** Finished or failed over to nothing; not called after cancel(). */
  onEnd?: () => void;
}

export interface PlayHandle { cancel(): void; readonly mode: 'neural' | 'system' | 'silent' }

export interface SpeechPlayerEnv {
  ctx: () => AudioContext | null;
  dest: () => AudioNode | null;
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  engine: () => TtsEngine | null;
  cache: ClipCache;
  /** Speech volume 0..1 for the system voices. */
  volume: () => number;
  warn?: (msg: string) => void;
  /** Called when a live render stalled or failed (the owner may mark the engine unusable). */
  onEngineTrouble?: (reason: string) => void;
  /** Seconds to wait for a rendered sentence before giving up on HD for this segment. */
  stallSeconds?: number;
  fxBank?: (host: FxHost) => FxBank;
  /** Pre-rendered voice pack (hosted and native builds); null/absent in the artifact. Looked up before the cache and the live engine. */
  pack?: () => PackLookup | null;
}

/** A sentence the pack and the cache do not hold while no live engine can render it. Not an engine failure. */
export class ClipMiss extends Error {}

type Item =
  /** `speed` is the phrase's own Kokoro speed; `gap` the silence after it; `lead` the turn gap before a line (negative: a quick pickup). */
  | { k: 'say'; cast: CastMember; text: string; line: number; first: boolean; speed: number; gap: number; lead: number }
  | { k: 'pause'; s: number }
  | { k: 'laugh' }
  | { k: 'sfx'; name: string }
  | { k: 'over' };

const AHEAD = 4;

/** Script lines as phrases (prosody.ts) with pauses and turn gaps; `whole` keeps sentences whole for the system voices. */
export function expand(lines: readonly ResolvedLine[], castMap: ReadonlyMap<string, CastMember> = CAST_MAP, whole = false): Item[] {
  const out: Item[] = [];
  let prev: { who: string; text: string; laugh: boolean } | null = null;
  lines.forEach((l, li) => {
    const cast = castMap.get(l.who);
    if (!cast) return;
    const items = planLine(l.text, cast.id, cast.speed, rhythmFor(cast.id), whole);
    const lead = prev ? turnGap({ text: prev.text, laugh: prev.laugh, same: prev.who === l.who }, l.text, rhythmFor(cast.id)) : 0;
    const before = out.length;
    for (const d of items) {
      if (d.k === 'say') out.push({ k: 'say', cast, text: d.text, line: li, first: d.first, speed: d.speed, gap: d.gap, lead: d.first && !items.some((x) => x.k === 'over') ? lead : 0 });
      else out.push(d);
    }
    if (out.length > before) {
      for (let i = before - 1; i >= 0; i--) { const p = out[i]; if (p.k === 'say') { p.gap = 0; break; } }
      prev = { who: l.who, text: l.text, laugh: items[items.length - 1]?.k === 'laugh' };
    }
  });
  for (let i = out.length - 1; i >= 0; i--) { const p = out[i]; if (p.k === 'say') { p.gap = Math.min(p.gap, 0.05); break; } }
  return out;
}

export class SpeechPlayer {
  private token = 0;
  private bank: FxBank | null = null;
  private bankCtx: AudioContext | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private silent: { items: Item[]; at: number; left: number; cb: PlayCallbacks; token: number; lines: readonly ResolvedLine[] } | null = null;
  private paused = false;
  private voices: Record<VoiceRole, VoiceLike | null> | null = null;
  private voiceCount = -1;
  private warned = false;

  constructor(private readonly env: SpeechPlayerEnv) {}

  /** Which path a play() started now would take. */
  get mode(): 'neural' | 'system' | 'silent' {
    const e = this.env.engine();
    const packReady = this.env.pack?.()?.state === 'ready';
    if ((e && e.usable || packReady) && this.env.ctx() && this.env.dest()) return 'neural';
    if (this.env.speech) return 'system';
    return 'silent';
  }

  get busy(): boolean { return this.token > 0 && this.active; }
  private active = false;

  /** Background pre-render of a segment's sentences (neural only; harmless otherwise). */
  prefetch(lines: readonly ResolvedLine[], max = 12): void {
    const pack = this.env.pack?.();
    if (pack && pack.state === 'ready') pack.warm(expand(lines).filter((i): i is Extract<Item, { k: 'say' }> => i.k === 'say').map((i) => clipKey(i.text, i.cast.voice, i.speed)));
    const e = this.env.engine();
    if (!e || !e.usable) return;
    let n = 0;
    for (const it of expand(lines)) {
      if (it.k !== 'say') continue;
      if (n++ >= max) break;
      void this.render(it, 1).catch(() => undefined);
    }
  }

  play(lines: readonly ResolvedLine[], cb: PlayCallbacks = {}): PlayHandle {
    this.cancel();
    const my = ++this.token;
    this.active = true;
    let mode = this.mode;
    const items = expand(lines, CAST_MAP, mode !== 'neural');
    // Pack-only playback (no usable live engine): every sentence must be in the pack or the memory cache, otherwise the
    // whole segment is spoken by one system voice instead of switching voices in the middle of a line.
    let run = items;
    if (mode === 'neural' && !this.env.engine()?.usable && !this.covered(items)) { mode = this.env.speech ? 'system' : 'silent'; run = expand(lines, CAST_MAP, true); }
    const finish = () => { if (my !== this.token) return; this.active = false; cb.onEnd?.(); };
    if (run.length === 0) { queueMicrotask(finish); return { cancel: () => this.cancelIf(my), mode }; }
    if (mode === 'neural') void this.runNeural(run, lines, cb, my, finish);
    else if (mode === 'system') void this.runSystem(run, cb, my, finish);
    else this.startSilent(run, lines, cb, my, finish);
    return { cancel: () => this.cancelIf(my), mode };
  }

  private covered(items: readonly Item[]): boolean {
    const pack = this.env.pack?.();
    return items.every((i) => i.k !== 'say' || this.env.cache.has(clipKey(i.text, i.cast.voice, i.speed)) || !!pack?.has(clipKey(i.text, i.cast.voice, i.speed)));
  }

  cancel(): void {
    this.token++;
    this.active = false;
    this.silent = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const s of this.sources) { try { s.stop(); s.disconnect(); } catch { /* already ended */ } }
    this.sources = [];
    try { this.env.speech?.cancel(); } catch { /* ignore */ }
    try { this.env.engine()?.cancelAll(); } catch { /* ignore */ }
  }

  setPaused(p: boolean): void {
    this.paused = p;
    try { if (p) this.env.speech?.pause(); else this.env.speech?.resume(); } catch { /* ignore */ }
  }

  /** Advances the silent (timer) mode with game time. */
  tick(dt: number): void {
    const s = this.silent;
    if (!s || this.paused || !(dt > 0)) return;
    s.left -= dt;
    while (s.left <= 0 && this.silent === s) this.silentStep(s);
  }

  /* ---------- neural ---------- */

  private cancelIf(my: number): void { if (my === this.token) this.cancel(); }

  private host(): FxHost | null {
    const ctx = this.env.ctx(); const dest = this.env.dest();
    return ctx && dest ? { ctx, dest } : null;
  }

  private fx(host: FxHost, preset: CastMember['fx']): AudioNode {
    if (!this.bank || this.bankCtx !== host.ctx) { this.bank = this.env.fxBank ? this.env.fxBank(host) : new FxBank(host); this.bankCtx = host.ctx; }
    return this.bank.input(preset);
  }

  private render(it: Extract<Item, { k: 'say' }>, priority: 0 | 1): Promise<Clip> {
    const e = this.env.engine();
    const key = clipKey(it.text, it.cast.voice, it.speed);
    const pack = this.env.pack?.();
    const fromPack: Promise<Clip | null> = pack && pack.has(key) ? pack.get(key) : Promise.resolve(null);
    return fromPack.then((baked) => baked ?? this.env.cache.get(key)).then((hit) => {
      if (hit) return hit;
      if (!e || !e.usable) throw new ClipMiss('clip not in the voice pack or cache');
      return e.synth({ text: it.text, voice: it.cast.voice, speed: it.speed }, priority).then((c) => { this.env.cache.put(key, c); return c; });
    }).then((c) => c, (err) => { throw err; }) as Promise<Clip>;
  }

  private async runNeural(items: Item[], lines: readonly ResolvedLine[], cb: PlayCallbacks, my: number, finish: () => void): Promise<void> {
    const host = this.host();
    if (!host) { void this.runSystem(items, cb, my, finish); return; }
    const says = items.filter((i): i is Extract<Item, { k: 'say' }> => i.k === 'say');
    const promises = new Map<Extract<Item, { k: 'say' }>, Promise<Clip>>();
    const request = (upto: number) => {
      for (let i = 0; i < Math.min(says.length, upto); i++) {
        const s = says[i];
        if (!promises.has(s)) { const p = this.render(s, 0); p.catch(() => undefined); promises.set(s, p); }
      }
    };
    request(AHEAD);
    let cursor = host.ctx.currentTime + 0.06;
    let clipEnd = cursor;
    let overlap = false;
    let sayIndex = 0;
    let started = false;
    const stall = (this.env.stallSeconds ?? 25) * 1000;
    for (let idx = 0; idx < items.length; idx++) {
      if (my !== this.token) return;
      const it = items[idx];
      if (it.k === 'over') { overlap = true; continue; }
      if (it.k === 'pause') { cursor += it.s; continue; }
      if (it.k === 'laugh') { const d = playLaugh(host, Math.max(cursor, host.ctx.currentTime)); cursor += d * 0.5; continue; }
      if (it.k === 'sfx') { const d = playSfx(host, it.name, Math.max(cursor, host.ctx.currentTime)); cursor += d * 0.6; continue; }
      request(sayIndex + AHEAD + 1);
      let clip: Clip;
      try {
        clip = await withTimeout(promises.get(it)!, stall);
      } catch (err) {
        if (my !== this.token) return;
        this.trouble(err);
        // Fall back to system voices for what is left of this segment.
        const rest = items.slice(idx);
        if (this.env.speech) void this.runSystem(rest, cb, my, finish, started);
        else this.startSilent(rest, lines, cb, my, finish);
        return;
      }
      if (my !== this.token) return;
      sayIndex++;
      const pcm = shapeClip(clip.samples, clip.sampleRate);
      const buf = host.ctx.createBuffer(1, pcm.length, clip.sampleRate);
      buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      const src = host.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.fx(host, it.cast.fx));
      const now = host.ctx.currentTime + 0.03;
      const startAt = Math.max(now, overlap ? clipEnd - 0.45 : cursor + it.lead);
      overlap = false;
      src.start(startAt);
      this.sources.push(src);
      clipEnd = startAt + buf.duration;
      cursor = clipEnd + it.gap;
      if (!started) { started = true; cb.onStart?.(); }
      if (it.first) {
        const wait = Math.max(0, (startAt - host.ctx.currentTime) * 1000);
        const t = setTimeout(() => { this.timers.delete(t); if (my === this.token) cb.onLine?.(it.cast, lines[it.line]?.text ?? it.text); }, wait);
        this.timers.add(t);
      }
    }
    // Wait for the audio timeline to reach the end of what was scheduled.
    const waitEnd = () => {
      if (my !== this.token) return;
      if (host.ctx.currentTime >= cursor - 0.02) { finish(); return; }
      const t = setTimeout(() => { this.timers.delete(t); waitEnd(); }, Math.min(500, Math.max(40, (cursor - host.ctx.currentTime) * 1000)));
      this.timers.add(t);
    };
    waitEnd();
  }

  private trouble(err: unknown): void {
    if (err instanceof ClipMiss) return; // nothing failed: the pack just does not hold this sentence
    const msg = err instanceof Error ? err.message : String(err);
    if (!this.warned) { this.warned = true; (this.env.warn ?? ((m: string) => console.warn(m)))(`HD voices stalled or failed (${msg}); using system voices`); }
    this.env.onEngineTrouble?.(msg);
  }

  /* ---------- system voices ---------- */

  private async runSystem(items: Item[], cb: PlayCallbacks, my: number, finish: () => void, startedAlready = false): Promise<void> {
    const speech = this.env.speech;
    if (!speech) { finish(); return; }
    let started = startedAlready;
    let announceLine = -1;
    const host = this.host();
    for (const it of items) {
      if (my !== this.token) return;
      if (it.k === 'pause') { await this.sleep(it.s * 1000, my); continue; }
      if (it.k === 'laugh') { if (host) playLaugh(host); await this.sleep(500, my); continue; }
      if (it.k === 'sfx') { if (host) { const d = playSfx(host, it.name); await this.sleep(d * 600, my); } continue; }
      if (it.k === 'over') continue;
      if (it.lead > 0) await this.sleep(it.lead * 1000, my);
      if (!started) { started = true; cb.onStart?.(); }
      if (it.first && it.line !== announceLine) { announceLine = it.line; cb.onLine?.(it.cast, it.text); }
      await new Promise<void>((resolve) => {
        const list = speech.getVoices();
        if (!this.voices || list.length !== this.voiceCount) { this.voices = pickVoices(list); this.voiceCount = list.length; }
        const u = this.env.makeUtterance(it.text);
        const fb = it.cast.fallback;
        u.voice = this.voices[fb.role] ?? this.voices.host ?? null;
        u.pitch = Math.min(2, Math.max(0.1, fb.pitch));
        u.rate = Math.min(10, Math.max(0.1, fb.rate * it.speed / it.cast.speed));
        u.volume = Math.min(1, Math.max(0, this.env.volume()));
        u.lang = u.voice?.lang ?? 'en-US';
        let done = false;
        const end = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
        const guard = setTimeout(end, Math.max(8000, lineSeconds(it.text, fb.rate) * 3000));
        u.onend = end;
        u.onerror = end;
        try { speech.speak(u); } catch { end(); }
      });
      if (it.gap > 0) await this.sleep(it.gap * 1000, my);
    }
    finish();
  }

  private sleep(ms: number, my: number): Promise<void> {
    return new Promise((res) => {
      if (my !== this.token) { res(); return; }
      const t = setTimeout(() => { this.timers.delete(t); res(); }, ms);
      this.timers.add(t);
    });
  }

  /* ---------- silent ---------- */

  private startSilent(items: Item[], lines: readonly ResolvedLine[], cb: PlayCallbacks, my: number, finish: () => void): void {
    const s = { items, at: 0, left: 0, cb, token: my, lines };
    (s as { finish?: () => void }).finish = finish;
    this.silent = s;
    cb.onStart?.();
    this.silentStep(s);
  }

  private silentStep(s: NonNullable<SpeechPlayer['silent']>): void {
    const fin = (s as unknown as { finish: () => void }).finish;
    if (s.token !== this.token) { this.silent = null; return; }
    if (s.at >= s.items.length) { this.silent = null; fin(); return; }
    const it = s.items[s.at++];
    if (it.k === 'say') {
      if (it.first) s.cb.onLine?.(it.cast, it.text);
      s.left = Math.max(0.8, it.text.split(/\s+/).length / 2.6 + 0.3) + Math.max(0, it.gap + it.lead);
    } else if (it.k === 'pause') s.left = it.s;
    else if (it.k === 'laugh') s.left = 0.6;
    else if (it.k === 'sfx') s.left = 0.5;
    else s.left = 0;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error('render stalled')), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
