/**
 * TALK3: the invented dial host of a live-stream station (stationHosts.ts), spoken with the browser's SpeechSynthesis the
 * same way the SoundCloud announcers are (voice picking, chunking, pitch and rate per host).
 *
 * When it speaks:
 *  - on tune-in, after the dial jingle (at most once per 20 s, so flipping the dial is quiet);
 *  - then at most once every LIVE_HOST_MIN_GAP_S (ten minutes) plus a random 0 to 5 minutes. On a stream whose now-playing
 *    data the game reads, the timed link waits for the next song change (between songs), or 6 more minutes at most;
 *    otherwise it goes on the timer;
 *  - 'tune-only' hosts (WNYC) never speak after the tune-in line.
 * It ducks the stream while talking, never talks while a talk station owns the speech queue, cancels only its own speech,
 * and with no voices shows its line as text for as long as it would take to read. Time advances only through `update(dt)`.
 */
import { chunkText, estimateSeconds } from '../talk/script';
import { pickVoices, type SpeechLike, type UtteranceLike, type VoiceLike } from '../talk/TalkPlayer';
import { LIVE_HOST_MIN_GAP_S, stationHost, type StationHost } from './stationHosts';

export const LIVE_HOST_JINGLE_DELAY_S = 2.2;
export const LIVE_HOST_TUNE_COOLDOWN_S = 20;
export const LIVE_HOST_EXTRA_S = 5 * 60;
export const LIVE_HOST_SONG_WAIT_S = 6 * 60;
export const LIVE_HOST_DUCK = 0.3;

export interface LiveHostEnv {
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  volume: () => number;
  setDuck: (level: number) => void;
  talkBusy: () => boolean;
  random: () => number;
}

export class LiveHost {
  private host: StationHost | null = null;
  private stationName = '';
  private songAware = false;
  private pendingDelay = -1;
  private pendingText = '';
  private sinceLast = 0;
  private gap = LIVE_HOST_MIN_GAP_S;
  private sinceTune = Infinity;
  private phase: 'idle' | 'speaking' | 'text' = 'idle';
  private text = '';
  private timer = 0;
  private elapsed = 0;
  private chunks: string[] = [];
  private chunkAt = 0;
  private token = 0;
  private paused = false;
  private songChanged = false;
  private voices: Record<string, VoiceLike | null> | null = null;
  private voiceCount = -1;
  private readonly bags = new Map<string, string[]>();
  /** Everything said, newest last (tests). */
  readonly history: Array<{ station: string; kind: 'ident' | 'link'; text: string }> = [];

  constructor(private readonly env: LiveHostEnv) {}

  get speaking(): boolean { return this.phase !== 'idle'; }
  get line(): string { return this.phase === 'idle' ? '' : this.text; }
  get name(): string { return this.phase === 'idle' || !this.host ? '' : this.host.name; }
  get current(): StationHost | null { return this.host; }
  /** Seconds until a timed link may be spoken (tests). */
  get nextGap(): number { return this.gap; }

  /** Tuned in to a live station. `name` is what the HUD shows; `songAware` when the game reads its now-playing data. */
  tuneIn(stationId: string, name: string, songAware = false): void {
    this.stop();
    const h = stationHost(stationId);
    this.host = h && h.speaks !== 'own-show' ? h : null;
    this.stationName = name;
    this.songAware = songAware;
    this.sinceLast = 0;
    this.gap = LIVE_HOST_MIN_GAP_S + this.env.random() * LIVE_HOST_EXTRA_S;
    this.songChanged = false;
    if (!this.host || this.sinceTune < LIVE_HOST_TUNE_COOLDOWN_S) return;
    this.sinceTune = 0;
    this.pendingText = this.draw('ident', this.host.idents);
    this.pendingDelay = LIVE_HOST_JINGLE_DELAY_S;
  }

  tuneAway(): void { this.stop(); this.host = null; }

  /** The stream's now-playing title changed (a new song started). */
  songChange(): void { this.songChanged = true; }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (this.phase === 'speaking') { try { if (p) this.env.speech?.pause(); else this.env.speech?.resume(); } catch { /* ignore */ } }
  }

  update(dt: number): void {
    if (!(dt > 0) || this.paused) return;
    this.sinceTune += dt;
    if (!this.host) return;
    if (this.env.talkBusy()) { if (this.phase !== 'idle') this.stop(); this.pendingDelay = -1; return; }
    if (this.pendingDelay >= 0) {
      this.pendingDelay -= dt;
      if (this.pendingDelay < 0) this.begin('ident', this.pendingText);
      return;
    }
    if (this.phase === 'speaking') {
      this.elapsed += dt;
      if (this.elapsed > estimateSeconds(this.text) * 2.5 + 10) this.finish();
      return;
    }
    if (this.phase === 'text') { this.timer -= dt; if (this.timer <= 0) this.finish(); return; }
    this.sinceLast += dt;
    if (this.host.speaks !== 'tune-and-timer' || this.sinceLast < this.gap) { if (this.sinceLast < this.gap) this.songChanged = false; return; }
    const late = this.sinceLast >= this.gap + LIVE_HOST_SONG_WAIT_S;
    if (!this.songAware || this.songChanged || late) this.begin('link', this.draw('link', this.host.links));
  }

  stop(): void {
    const was = this.phase === 'speaking';
    this.token++;
    this.phase = 'idle';
    this.pendingDelay = -1;
    if (was && !this.env.talkBusy()) { try { this.env.speech?.cancel(); } catch { /* ignore */ } }
    this.env.setDuck(1);
  }

  dispose(): void { this.tuneAway(); }

  private begin(kind: 'ident' | 'link', tpl: string): void {
    const h = this.host;
    if (!h || !tpl) return;
    const text = tpl.replace(/\{station\}/g, this.stationName || 'this station').replace(/\s*&\s*/g, ' and ');
    this.text = text;
    this.elapsed = 0;
    this.sinceLast = 0;
    this.songChanged = false;
    this.gap = LIVE_HOST_MIN_GAP_S + this.env.random() * LIVE_HOST_EXTRA_S;
    this.history.push({ station: h.stationId, kind, text });
    if (this.history.length > 100) this.history.shift();
    const sp = this.env.speech;
    let voices = 0;
    try { voices = sp ? sp.getVoices().length : 0; } catch { voices = 0; }
    if (!sp || voices === 0) { this.phase = 'text'; this.timer = Math.max(2.5, estimateSeconds(text)); return; }
    this.phase = 'speaking';
    this.env.setDuck(LIVE_HOST_DUCK);
    this.chunks = chunkText(text);
    this.chunkAt = 0;
    this.speakChunk();
  }

  private speakChunk(): void {
    const sp = this.env.speech;
    const h = this.host;
    if (!sp || !h || this.chunkAt >= this.chunks.length) { this.finish(); return; }
    const list = sp.getVoices();
    if (!this.voices || list.length !== this.voiceCount) { this.voices = pickVoices(list); this.voiceCount = list.length; }
    const u = this.env.makeUtterance(this.chunks[this.chunkAt]);
    u.voice = this.voices[h.role] ?? this.voices.host ?? null;
    u.pitch = Math.min(2, Math.max(0.1, h.pitch));
    u.rate = Math.min(10, Math.max(0.1, h.rate));
    u.volume = Math.min(1, Math.max(0, this.env.volume()));
    u.lang = u.voice?.lang ?? 'en-US';
    const my = this.token;
    const next = () => { if (my !== this.token || this.phase !== 'speaking') return; this.chunkAt++; this.speakChunk(); };
    u.onend = next;
    u.onerror = next;
    try { sp.speak(u); } catch { next(); }
  }

  private finish(): void {
    this.token++;
    this.phase = 'idle';
    this.env.setDuck(1);
  }

  private draw(key: string, list: readonly string[]): string {
    if (list.length === 0) return '';
    const k = `${this.host?.stationId}:${key}`;
    let bag = this.bags.get(k);
    if (!bag || bag.length === 0) {
      bag = [...list];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(this.env.random() * (i + 1))); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      this.bags.set(k, bag);
    }
    return bag.pop()!;
  }
}
