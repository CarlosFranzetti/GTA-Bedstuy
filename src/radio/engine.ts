/**
 * RADIOPAGE: the /radio page's engine. It builds the game's own RadioDirector (the catalog stations, the official SoundCloud widget,
 * the live streams, the announcers and DJ-name mentions, WBSY Talk and The Group Chat) and runs it on the real clock, with small
 * adapters where the game would give it its mixer, pause state and HUD. No game, world or three.js.
 *
 * Differences from the car radio, on purpose: `autoSkip` is off (a listener testing a station wants to see it fail, with the
 * reason, not be moved on), time is the wall clock, the hour is the real hour, and there is no dial static or station jingle.
 */
import { RadioDirector, type DirectorOptions, type LastStationStore, type RadioStationEntry } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';
import { VoiceHub } from '@/audio/voice/VoiceHub';
import { TalkStation } from '@/audio/voice/TalkStation';
import { DjScheduler } from '@/audio/voice/Scheduler';
import { TalkPlayer, type SpeechLike, type UtteranceLike } from '@/audio/talk/TalkPlayer';
import { GROUPCHAT_NAME, loadGroupChatScript, type TalkSegment } from '@/audio/talk/script';
import { stingDuration, talkSting, type StingNote } from '@/audio/synth';
import { LIVE_NO_STREAM } from '@/audio/live/LiveStation';
import { SC_NO_STREAM, SC_CONNECTING } from '@/audio/sc/ScStation';
import { TALK_SHOWS } from '@/audio/voice/shows';
import { allStations, type StationInfo } from './stationInfo';

export type StatusLevel = 'idle' | 'ok' | 'wait' | 'tap' | 'fail';
export interface Status { level: StatusLevel; text: string; reason: string }

export interface Mark { kind: 'intro' | 'listening' | 'mid' | 'thanks'; at: number; deadline: number; state: 'due' | 'spoken' | 'missed' }

export interface View {
  on: boolean;
  index: number;
  info: StationInfo;
  /** Station name as the car radio shows it (talk stations change it when no voice exists). */
  stationName: string;
  /** Set title, stream title or the talk show that is on. */
  title: string;
  dj: string;
  source: string;
  /** Seconds into the set and its length, null where not known. */
  pos: number | null;
  length: number | null;
  announcerName: string;
  announcerLine: string;
  status: Status;
  marks: Mark[];
  /** Credit link of what is on (the set's SoundCloud page, or the stream's site). */
  link: { label: string; url: string } | null;
  toast: string;
  /** 0..1 through the talk loop for talk stations. */
  talk: { fraction: number; speaker: string; show: string } | null;
  canNextSet: boolean;
}

export interface EngineEnv {
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  /** The real AudioContext, made on the first tap. Null in tests. */
  createContext?: () => AudioContext | null;
  /** Where the SoundCloud player frames go (the page shows them). */
  widgetHost?: { el: HTMLElement; css: string };
  /** Folder of the pre-rendered voice pack, relative to the page ("../voice/" from /radio/). Null = SpeechSynthesis only. */
  packBase?: string | null;
  lastStore?: LastStationStore | null;
  random?: () => number;
  /** Group Chat script (tests). Absent = fetched, hosted build only. */
  groupChatScript?: TalkSegment[];
  /** Extra director options (tests: scEnv, liveEnv, feed). */
  director?: Partial<DirectorOptions>;
  now?: () => number;
  /** Real hour 0..24 for the announcers. */
  hour?: () => number;
}

const MAX_DT = 5;
const TOAST_KEEP_MS = 8000;

export class RadioPage {
  readonly director: RadioDirector;
  readonly hub: VoiceHub;
  readonly talk: TalkStation;
  readonly chat: TalkPlayer;
  readonly stations: StationInfo[];
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private vol = 0.8;
  private on = false;
  private toastText = '';
  private toastAt = 0;
  private last = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  /** What the announcers said, with the time it was noticed (newest last). */
  readonly log: Array<{ at: number; who: string; text: string }> = [];
  private seen = 0;

  constructor(private readonly env: EngineEnv) {
    this.now = env.now ?? (() => Date.now());
    const speech = env.speech;
    const makeUtterance = env.makeUtterance;
    this.hub = new VoiceHub({
      ctx: () => this.ctx, dest: () => this.master, speech, makeUtterance, volume: () => this.vol,
      hosted: false, phone: false, packBase: env.packBase ?? null, storage: null, persist: null, warn: () => undefined,
    });
    this.talk = new TalkStation({ hub: this.hub, context: () => this.director.broadcastContext, setBed: () => undefined, random: env.random });
    this.chat = new TalkPlayer({
      speech, makeUtterance,
      audio: { sting: (kind) => this.sting(talkSting(kind)), setBed: () => undefined, volume: () => this.vol },
    }, env.groupChatScript ?? [], { name: GROUPCHAT_NAME, random: env.random ?? Math.random });
    if (!env.groupChatScript) void loadGroupChatScript().then((segs) => { if (segs.length) this.chat.setScript(segs); this.emit(); }).catch(() => undefined);
    this.director = new RadioDirector(new Library(null), this.talk, undefined, undefined, {
      talk2: this.chat,
      autoSkip: false,
      shuffleStart: false,
      random: env.random ?? Math.random,
      lastStore: env.lastStore ?? undefined,
      scEnv: env.widgetHost ? { widgetHost: env.widgetHost } : undefined,
      voice: { speech, makeUtterance, volume: () => this.vol, dj: new DjScheduler(), hub: this.hub },
      ...env.director,
    });
    this.director.onToast = (m) => { this.toastText = m; this.toastAt = this.now(); this.emit(); };
    this.director.onChange(() => this.emit());
    this.stations = allStations();
    this.director.setBroadcast({ hour: this.hour() });
  }

  private hour(): number { return this.env.hour ? this.env.hour() : new Date().getHours() + new Date().getMinutes() / 60; }

  /* ---------- audio graph (own, tiny) ---------- */

  /** Creates and resumes the AudioContext. Call from a tap. */
  unlockAudio(): void {
    if (!this.ctx && this.env.createContext) {
      try {
        this.ctx = this.env.createContext();
        if (this.ctx) { this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination); }
      } catch { this.ctx = null; this.master = null; }
    }
    try { void this.ctx?.resume(); } catch { /* blocked */ }
    this.hub.onGesture();
  }

  private sting(notes: StingNote[]): number {
    const ctx = this.ctx;
    const dest = this.master;
    if (ctx && dest) {
      try {
        const t0 = ctx.currentTime + 0.02;
        for (const n of notes) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = n.type; o.frequency.value = n.freq;
          g.gain.setValueAtTime(0.0001, t0 + n.t);
          g.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.peak * 0.3), t0 + n.t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.dur);
          o.connect(g); g.connect(dest);
          o.start(t0 + n.t); o.stop(t0 + n.t + n.dur + 0.05);
        }
      } catch { /* no sting */ }
    }
    return stingDuration(notes);
  }

  /* ---------- control ---------- */

  get volume(): number { return this.vol; }
  setVolume(v: number): void {
    this.vol = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    this.director.setScVolume(this.vol);
    if (this.master) this.master.gain.value = this.vol;
    this.emit();
  }

  get isOn(): boolean { return this.on; }
  get currentId(): string { return this.director.current.id; }

  /** Tune to a station by id. From a tap: starts the audio context, the radio and the station's player. */
  tune(id: string): boolean {
    this.unlockAudio();
    if (!this.director.selectById(id)) return false;
    this.on = true;
    this.director.setOn(true);
    this.director.setScVolume(this.vol);
    this.director.userStart();
    this.emit();
    return true;
  }

  private step(d: number): void {
    const n = this.director.stations.length;
    const i = (this.director.index + d + n) % n;
    this.tune(this.director.stations[i].id);
  }
  next(): void { this.step(1); }
  prev(): void { this.step(-1); }

  /** Radio off: stops the station and the announcer. */
  off(): void { this.on = false; this.director.setOn(false); this.emit(); }

  /** Next set of a SoundCloud station (a new shuffled mix). */
  nextSet(): void { this.unlockAudio(); this.director.currentSc?.next(); this.director.userStart(); this.emit(); }

  /** Start sound from a tap on a station the browser had blocked. */
  tapStart(): void { this.unlockAudio(); this.director.userStart(); this.emit(); }

  /** Tries the tuned station again (the same restart the director's watchdog does). */
  retry(): void {
    this.unlockAudio();
    const d = this.director;
    d.currentSc?.restart();
    d.currentLive?.restart();
    d.userStart();
    this.emit();
  }

  /* ---------- the clock ---------- */

  /** Advance by real seconds (the page's timer, or a test). */
  tick(dt: number): void {
    const d = Math.min(MAX_DT, Math.max(0, dt));
    this.director.update(d);
    const h = this.director.announcer.history;
    while (this.seen < h.length) {
      const e = h[this.seen++];
      this.log.push({ at: this.now(), who: this.director.announcer.station?.name ?? e.station, text: e.text });
    }
    while (this.seen > h.length) this.seen = h.length; // history was trimmed
    if (this.log.length > 60) this.log.splice(0, this.log.length - 60);
    this.emit();
  }

  /** Runs `tick` on the wall clock every 250 ms until `stop`. */
  start(): void {
    if (this.timer) return;
    this.last = this.now();
    this.timer = setInterval(() => {
      const t = this.now();
      this.tick((t - this.last) / 1000);
      this.last = t;
      this.director.setBroadcast({ hour: this.hour() });
    }, 250);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { this.listeners.forEach((fn) => fn()); }

  dispose(): void { this.stop(); this.director.dispose(); this.hub.dispose(); }

  /* ---------- reading ---------- */

  entry(): RadioStationEntry { return this.director.current; }

  view(): View {
    const d = this.director;
    const c = d.current;
    const info = this.stations.find((s) => s.id === c.id) ?? this.stations[0];
    const sc = d.currentSc;
    const live = d.currentLive;
    const clock = sc?.djClock ?? null;
    let title = '';
    let dj = '';
    let source = '';
    let pos: number | null = null;
    let length: number | null = null;
    let talk: View['talk'] = null;
    if (c.kind === 'sc' && sc) {
      const np = sc.nowPlaying;
      title = np?.title ?? '';
      dj = np?.user ?? '';
      pos = clock ? clock.pos : null;
      length = clock && clock.durationS > 0 ? clock.durationS : null;
      source = sc.mixUrl ? 'SoundCloud' : '';
    } else if (c.kind === 'live' && live) {
      title = live.trackName;
      source = live.sourceName;
    } else if (c.kind === 'talk') {
      const entry = c.info?.script === 'groupchat' ? this.chat : this.talk;
      const p = entry.progress;
      const show = entry === this.talk ? (this.talk.schedule.current ? TALK_SHOWS.find((s) => s.id === this.talk.schedule.current!.show.id)?.title ?? '' : '') : '';
      title = entry.caption;
      talk = { fraction: p.fraction, speaker: p.speaker || entry.caption, show };
    }
    const spoken = d.djMentions.spoken;
    const marks: Mark[] = d.djMentions.tracker.key && clock && d.djMentions.tracker.key === clock.key
      ? d.djMentions.tracker.mentions.map((m): Mark => ({
        kind: m.kind, at: m.at, deadline: m.deadline,
        state: spoken.some((s) => s.at === m.at && s.station === c.id) ? 'spoken' : clock.pos > m.deadline ? 'missed' : 'due',
      }))
      : [];
    const toast = this.toastText && this.now() - this.toastAt < TOAST_KEEP_MS ? this.toastText : '';
    return {
      on: this.on, index: d.index, info, stationName: c.kind === 'sc' ? info.name : d.stationName, title, dj, source, pos, length,
      announcerName: c.kind === 'sc' && d.announcer.speaking ? d.announcer.name : '',
      announcerLine: d.announcerLine,
      status: this.status(), marks, link: d.nowLink, toast, talk, canNextSet: c.kind === 'sc',
    };
  }

  /** A plain status for the tuned station: what is happening, and when nothing plays, why. */
  status(): Status {
    const d = this.director;
    const c = d.current;
    if (!this.on) return { level: 'idle', text: 'Radio off', reason: 'Pick a station to tune in. Sound starts only after a tap.' };
    if (c.kind === 'sc') {
      const sc = d.currentSc!;
      if (sc.status === 'failed') return { level: 'fail', text: SC_NO_STREAM, reason: 'The SoundCloud player script (w.soundcloud.com) did not load in time: it may be blocked by the browser, an ad blocker or the network. The station retries when you tap Retry.' };
      if (sc.needsTap) return { level: 'tap', text: 'Tap to start radio', reason: 'The browser blocked sound until you tap. Tap Start sound, or the play button in the SoundCloud player below.' };
      if (!sc.hasSources) return { level: 'fail', text: 'No mixes available', reason: 'The station has no mix to play and the RA NYC set pool could not be reached.' };
      if (sc.status === 'loading' || sc.status === 'idle') return { level: 'wait', text: SC_CONNECTING, reason: 'Loading the SoundCloud player and choosing a set.' };
      if (sc.playState === 'playing') return { level: 'ok', text: 'On air', reason: '' };
      return { level: 'wait', text: sc.notice || 'Starting the set...', reason: 'The player is up and the set is starting. If this lasts 20 seconds the station restarts itself once.' };
    }
    if (c.kind === 'live') {
      const l = d.currentLive!;
      if (l.status === 'failed') return { level: 'fail', text: LIVE_NO_STREAM, reason: `The stream did not answer: ${l.streamUrl || 'no URL'}. It may be offline, or your network blocks it. Retry tries the next mirror.` };
      if (l.needsTap) return { level: 'tap', text: 'Tap to start radio', reason: 'The browser blocked sound until you tap.' };
      if (l.playState === 'playing') return { level: 'ok', text: 'On air', reason: '' };
      return { level: 'wait', text: l.notice || 'Connecting to the stream...', reason: l.streamUrl };
    }
    if (c.kind === 'talk') {
      if (c.info?.script === 'groupchat') {
        if (!this.chat.voiceAvailable) return { level: 'fail', text: 'No speech voice on this device', reason: 'This station is spoken by the browser\'s speech synthesis, and none is available here.' };
        if (this.chat.segmentCount === 0) return { level: 'fail', text: 'Script not loaded', reason: 'The Group Chat script is part of the hosted build and did not load.' };
        return { level: 'ok', text: 'On air', reason: '' };
      }
      if (!this.hub.canSpeak) return { level: 'fail', text: 'No speech voice on this device', reason: 'WBSY Talk is spoken by the voice pack or the browser\'s speech synthesis, and neither is available here.' };
      return { level: 'ok', text: 'On air', reason: '' };
    }
    return { level: 'ok', text: 'On air', reason: '' };
  }
}
