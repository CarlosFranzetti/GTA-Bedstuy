/**
 * The radio dial: eight SoundCloud-mix stations (BK House, Dub Lab, Stoop Radio, Boogie Down, Weird Hours, Yard FM,
 * Flashback 88, Radio SC), WBSY Talk, and an optional "My Library" station for the player's own files.
 *
 * Every SoundCloud station is a `ScStation` fed by the shared ra-nyc pool and filtered by its own keywords; it keeps its
 * own virtual clock, so tuning away and back resumes mid-set. Each has a synthesized announcer (./announcer). My Library
 * plays the files the player placed in the Radio library on two decks with a 0.5 s cross-fade and also keeps a virtual
 * clock. Time only advances through `update(dt)` (game time), so the radio pauses with the game.
 */
import { SC_STATIONS, type ScStationDef, type Station } from './radio';
import { CATALOG, SOURCE_BADGE, type CatalogEntry, type RadioSourceKind } from './stations';
import { LiveStation, type LiveEnv } from './live/LiveStation';
import { LIBRARY_STATIONS } from './library/genres';
import type { Library } from './library/Library';
import { buildLibraryTimeline, locate, type Timeline } from './library/timeline';
import type { Deck } from './decks';
import type { TalkLike } from './voice/TalkStation';
import type { DjScheduler } from './voice/Scheduler';
import type { VoiceHub } from './voice/VoiceHub';
import type { SpeechLike, UtteranceLike } from './talk/TalkPlayer';
import { ScStation, SC_STORAGE_KEY } from './sc/ScStation';
import { RaFeed, matcherFor } from './sc/RaFeed';
import { Announcer, DEFAULT_BROADCAST, type BroadcastContext } from './announcer/Announcer';

export const CROSSFADE_SECONDS = 0.5;
export const MYLIB_ID = 'mylib';
export const MYLIB_NAME = 'My Library';

export type RadioKind = 'synth' | 'library' | 'talk' | 'sc' | 'live';

export const LAST_STATION_KEY = 'gta-bedstuy.radio.last.v1';
/** How long the "off the air" toast replaces the HUD track line (game seconds). */
export const TOAST_SECONDS = 6;

/** Where the last tuned station id is kept (localStorage by default; null in tests). */
export interface LastStationStore { get(): string | null; set(id: string): void }
export function localLastStation(key = LAST_STATION_KEY): LastStationStore {
  return {
    get() { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
    set(id) { try { globalThis.localStorage?.setItem(key, id); } catch { /* blocked */ } },
  };
}

export interface RadioStationEntry {
  id: string;
  kind: RadioKind;
  /** Display name (talk can change this when voices are unavailable: use `director.stationName`). */
  name: string;
  synth?: Station;
  /** The SoundCloud station definition for kind 'sc'. */
  sc?: ScStationDef;
  /** Source rule of the station (sc-account, sc-playlist, ra-pool, live-stream, scripted); undefined for synth and My Library. */
  source?: RadioSourceKind;
  /** Catalog row (about line, site link, genre) for the 15 dial stations. */
  info?: CatalogEntry;
  /** HUD / UI badge text: SC, RA, LIVE, TALK. */
  badge?: string;
}

export interface SynthPlayback {
  station: Station;
  /** Changes whenever the pattern should restart from `startStep` (station change, new empty block). */
  epoch: number;
  startStep: number;
}

export interface DirectorOptions {
  /** Shared ra-nyc pool. Default: the Radio SC override's feed, else a new RaFeed. Null disables the pool. */
  feed?: RaFeed | null;
  /** Extra ScStation environment (tests: canLoad, loadApi, doc, timeoutMs, ...), applied to every SoundCloud station. */
  scEnv?: Partial<import('./sc/ScStation').ScEnv>;
  /** Speech used by the announcers. Absent = no voices (text-only HUD line). */
  voice?: { speech: SpeechLike | null; makeUtterance: (text: string) => UtteranceLike; volume: () => number; random?: () => number; /** VOX: DJ copy + HD/system voice hub. */ dj?: DjScheduler; hub?: VoiceHub };
  /** Ready-made announcer (tests). */
  announcer?: Announcer;
  /** Live-stream environment (tests: fake audio element, clock). */
  liveEnv?: Partial<LiveEnv>;
  /** Remembers the last station across sessions. Absent = not persisted. */
  lastStore?: LastStationStore;
}

function stationStorageKey(id: string): string {
  return id === 'sc' ? SC_STORAGE_KEY : `${SC_STORAGE_KEY}.${id}`;
}

export class RadioDirector {
  private dial: RadioStationEntry[] = [];
  private readonly baseDial: RadioStationEntry[];
  private readonly myLib: RadioStationEntry = { id: MYLIB_ID, kind: 'library', name: MYLIB_NAME };
  private idx = 0;
  private on = false;
  private paused = false;
  private decks: [Deck, Deck] | null = null;
  private activeDeck = -1;
  private readonly retire: Array<number | null> = [null, null];
  private playingKey: string | null = null;
  private playingTrackName = '';
  private libClock = 0;
  private readonly bad = new Set<string>();
  private libTimeline: Timeline | null = null;
  private synth: SynthPlayback | null = null;
  private synthEpoch = 0;
  private synthKey = '';
  /** The shared ra-nyc pool. */
  readonly feed: RaFeed | null;
  /** Every SoundCloud station, in dial order. */
  readonly scStations: ScStation[] = [];
  private readonly scMap = new Map<string, ScStation>();
  /** Radio SC itself (the last SoundCloud station). */
  readonly sc: ScStation;
  /** Live internet-radio stations by id. */
  readonly liveStations = new Map<string, LiveStation>();
  readonly announcer: Announcer;
  /** Called with a short message when a station is off the air and the dial moves on. */
  onToast: ((msg: string) => void) | null = null;
  private toastText = '';
  private toastLeft = 0;
  /** Stations that failed in the current run of automatic skips (stops the dial from cycling forever offline). */
  private readonly failWave = new Set<string>();
  private readonly handledFail = new Set<string>();
  private readonly lastStore: LastStationStore | null;
  private readonly changeListeners = new Set<() => void>();
  /** Hour, weather and street that the announcers talk about. */
  private broadcast: BroadcastContext = { ...DEFAULT_BROADCAST };
  /** Called when the listener changes station (AudioSystem plays the station jingle). */
  onTune: ((entry: RadioStationEntry) => void) | null = null;
  /** Called between sets and every third natural track change (a station ID between songs). */
  onSweeper: ((entry: RadioStationEntry) => void) | null = null;
  private naturalChanges = 0;
  private readonly unsubLib: () => void;

  constructor(readonly library: Library, readonly talk: TalkLike, synthStations: Station[] = [], sc?: ScStation, opts: DirectorOptions = {}) {
    this.feed = opts.feed !== undefined ? opts.feed : (sc?.feed ?? new RaFeed());
    const classic = opts.feed !== undefined;
    for (const def of SC_STATIONS) {
      const match = matcherFor(def.patterns);
      const st = def.id === 'sc' && sc ? sc : new ScStation({
        ...opts.scEnv,
        // Production: only the RA station draws on the RA NYC pool and every other station plays its own account.
        // An injected feed (tests) is shared by all stations as before, without catalog sources.
        feed: def.usesPool || classic ? this.feed : null,
        config: { id: def.id, name: def.name, match: def.usesPool || classic ? match : null, storageKey: stationStorageKey(def.id), sources: classic ? [] : def.sources, randomStart: !classic },
        storage: opts.scEnv?.storage,
      } as Partial<import('./sc/ScStation').ScEnv>);
      this.scStations.push(st);
      st.onChange(() => this.emitChange());
      this.scMap.set(def.id, st);
      st.onBetweenMixes = (prev) => {
        if (!this.on || this.current.sc?.id !== def.id) return;
        this.announcer.betweenSets(prev, st.nowPlaying);
        this.onSweeper?.(this.current);
      };
    }
    this.sc = this.scMap.get('sc')!;
    this.sc.onGameHour = (h) => { if (h !== null) this.broadcast.hour = h; };
    this.lastStore = opts.lastStore ?? null;
    for (const e of CATALOG) {
      if (e.kind !== 'live-stream') continue;
      const ls = new LiveStation(e, opts.liveEnv);
      ls.onFail = () => this.onLiveFail(e.id);
      ls.onChange(() => this.emitChange());
      this.liveStations.set(e.id, ls);
    }
    this.baseDial = [
      ...synthStations.map((s, i): RadioStationEntry => ({ id: `synth${i}`, kind: 'synth', name: s.name, synth: s })),
      ...CATALOG.map((e): RadioStationEntry => {
        const base = { id: e.id, name: e.name, source: e.kind, info: e, badge: SOURCE_BADGE[e.kind] };
        if (e.kind === 'live-stream') return { ...base, kind: 'live' };
        if (e.kind === 'scripted') return { ...base, kind: 'talk' };
        return { ...base, kind: 'sc', sc: SC_STATIONS.find((d) => d.id === e.id)! };
      }),
    ];
    const v = opts.voice;
    this.announcer = opts.announcer ?? new Announcer({
      speech: v?.speech ?? null,
      makeUtterance: v?.makeUtterance ?? (() => { throw new Error('no speech'); }),
      volume: v?.volume ?? (() => 1),
      setDuck: (level) => { for (const s of this.scStations) s.setDuck(level); for (const l of this.liveStations.values()) l.setDuck(level); },
      talkBusy: () => this.current.kind === 'talk' || this.talk.isActive,
      context: () => this.broadcast,
      random: v?.random ?? Math.random,
      dj: v?.dj,
      hub: v?.hub,
    });
    this.refreshDial();
    const saved = this.lastStore?.get();
    const si = saved ? this.dial.findIndex((e) => e.id === saved) : -1;
    if (si >= 0) this.idx = si;
    this.unsubLib = library.onChange(() => {
      this.libTimeline = null;
      this.refreshDial();
      // The playing file was cleared or the library was reset: stop it now.
      if (this.playingKey && this.playingTrackId && !library.locate(this.playingTrackId)) {
        this.retireActive(CROSSFADE_SECONDS);
        this.playingKey = null;
      }
    });
  }

  /* ---------- the dial ---------- */

  /** My Library is on the dial only while at least one of the player's files can play. */
  get libraryOnDial(): boolean {
    return LIBRARY_STATIONS.some((d) => this.library.playableCount(d.id) > 0);
  }

  private refreshDial(): void {
    const keepId = this.dial[this.idx]?.id;
    this.dial = this.libraryOnDial ? [...this.baseDial, this.myLib] : this.baseDial;
    if (keepId) {
      const i = this.dial.findIndex((e) => e.id === keepId);
      if (i >= 0) { this.idx = i; return; }
      // My Library disappeared under the listener: back to the first station.
      this.idx = 0;
      this.synthEpoch++;
      this.synthKey = '';
      this.synth = null;
      this.playingKey = null;
      this.retireActive(CROSSFADE_SECONDS);
      this.syncActive();
      this.announcerTune();
      this.reconcile();
    }
  }

  get stations(): readonly RadioStationEntry[] { return this.dial; }

  scStation(id: string): ScStation | undefined { return this.scMap.get(id); }

  /** The SoundCloud station that is tuned in, or null. */
  get currentSc(): ScStation | null {
    const c = this.current;
    return c.kind === 'sc' ? this.scMap.get(c.id) ?? null : null;
  }

  /** Live broadcast state (hour, weather, street, wanted level ...) for the talk station. */
  get broadcastContext(): BroadcastContext { return this.broadcast; }

  /** Feeds hour, weather and street to the announcers (hour 0..24, rain 0..1). */
  setBroadcast(ctx: Partial<BroadcastContext>): void {
    this.broadcast = { ...this.broadcast, ...ctx };
  }

  /** Game radio level (times master) for every SoundCloud widget. */
  setScVolume(v: number): void {
    for (const s of this.scStations) s.setVolume(v);
    for (const l of this.liveStations.values()) l.setVolume(v);
  }

  /** Fires when the tuned station, a station's state or the toast changes (the station list repaints). */
  onChange(fn: () => void): () => void { this.changeListeners.add(fn); return () => { this.changeListeners.delete(fn); }; }
  private emitChange(): void { this.changeListeners.forEach((fn) => fn()); }

  /** Tunes to a station by id (false when it is not on the dial). */
  selectById(id: string): boolean {
    const i = this.dial.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.select(i);
    return true;
  }

  /** The live stream that is tuned in, or null. */
  get currentLive(): LiveStation | null {
    const c = this.current;
    return c.kind === 'live' ? this.liveStations.get(c.id) ?? null : null;
  }

  /** True when the browser blocked sound on the tuned-in SoundCloud or live station (the UI shows "Tap to start radio"). */
  get needsTap(): boolean { return !!(this.currentSc?.needsTap || this.currentLive?.needsTap); }

  /** Starts the tuned-in SoundCloud or live station from a user gesture. */
  userStart(): void { this.currentSc?.userStart(); this.currentLive?.userStart(); }

  /* ---------- reading ---------- */

  get index(): number { return this.idx; }
  get current(): RadioStationEntry { return this.dial[this.idx] ?? this.dial[0]; }

  get stationName(): string {
    const c = this.current;
    if (c.kind === 'sc') return this.currentSc!.stationName;
    if (c.kind === 'live') return c.name;
    return c.kind === 'talk' ? this.talk.stationName : c.name;
  }

  /**
   * HUD second half: the announcer's name while they speak ("Station — Deja Fontaine"), else "set title — DJ" for
   * SoundCloud sets, the file name for My Library, the speaker for WBSY Talk. Empty for synth music.
   */
  get trackName(): string {
    const c = this.current;
    if (this.toastText && this.toastLeft > 0) return this.toastText;
    if (c.kind === 'live') {
      const l = this.currentLive!;
      return l.notice && !l.needsTap ? l.notice : l.trackName;
    }
    if (c.kind === 'talk') return this.talk.caption;
    if (c.kind === 'sc') {
      if (this.on && this.announcer.speaking) return this.announcer.name;
      const sc = this.currentSc!;
      return sc.notice && !sc.needsTap ? sc.notice : sc.trackName;
    }
    if (c.kind === 'library' && this.playingKey) return this.playingTrackName;
    return '';
  }

  /** Text the announcer is saying right now (a subtitle, and the HUD line on devices with no voices). */
  get announcerLine(): string { return this.on && this.current.kind === 'sc' ? this.announcer.line : ''; }

  /** 0..1 through the talk show loop while WBSY Talk is tuned in, otherwise 0. */
  get talkProgress(): number {
    return this.current.kind === 'talk' ? this.talk.progress.fraction : 0;
  }

  /** Virtual clock of My Library in seconds (for tests). */
  get libraryClock(): number { return this.libClock; }

  get synthPlayback(): SynthPlayback | null { return this.on ? this.synth : null; }

  timeline(): Timeline {
    if (!this.libTimeline) this.libTimeline = buildLibraryTimeline(this.library, this.bad);
    return this.libTimeline;
  }

  /* ---------- control ---------- */

  attachDecks(decks: [Deck, Deck]): void {
    this.decks = decks;
    decks.forEach((d, i) => {
      d.onEnded = () => this.onDeckEnded(i);
      d.onError = () => this.onDeckError(i);
      d.onDuration = (sec) => this.onDeckDuration(i, sec);
      d.unlock();
    });
    this.activeDeck = -1;
    this.playingKey = null;
  }

  next(): void { this.select((this.idx + 1) % this.dial.length); }

  select(i: number): void {
    const n = this.dial.length;
    const target = ((Math.round(i) % n) + n) % n;
    if (target === this.idx) return;
    this.failWave.clear();
    // Our announcer lets go of the speech queue before WBSY Talk can take it.
    this.announcer.tuneAway();
    this.idx = target;
    this.lastStore?.set(this.current.id);
    this.synthEpoch++;
    this.synthKey = '';
    this.synth = null;
    this.playingKey = null;
    this.retireActive(CROSSFADE_SECONDS);
    this.syncActive();
    this.onTune?.(this.current);
    this.announcerTune();
    this.reconcile();
    this.emitChange();
  }

  /** True while the player is in a car with the radio on. */
  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (!on) {
      this.announcer.tuneAway();
      this.retireActive(0.15);
      this.playingKey = null;
      this.synth = null;
    }
    this.syncActive();
    if (on) { this.announcerTune(); this.reconcile(); }
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    this.talk.setPaused(p);
    this.announcer.setPaused(p);
    for (const s of this.scStations) s.setPaused(p);
    for (const l of this.liveStations.values()) l.setPaused(p);
    this.decks?.forEach((d) => { if (p) d.pause(); else d.resume(); });
  }

  /** Advances every station's virtual clock and keeps the decks in step with the active one. */
  update(dt: number): void {
    if (this.paused || !(dt > 0)) return;
    this.libClock += dt;
    this.talk.update(dt);
    for (const s of this.scStations) s.update(dt);
    this.announcer.update(dt);
    if (this.toastLeft > 0) { this.toastLeft -= dt; if (this.toastLeft <= 0) this.toastText = ''; }
    this.checkFailures();
    for (let i = 0; i < 2; i++) {
      const r = this.retire[i];
      if (r !== null) {
        this.retire[i] = r - dt;
        if (this.retire[i]! <= 0) { this.decks?.[i].stop(); this.retire[i] = null; }
      }
    }
    this.reconcile();
  }

  dispose(): void {
    this.unsubLib();
    this.announcer.dispose();
    this.talk.dispose();
    for (const s of this.scStations) s.dispose();
    for (const l of this.liveStations.values()) l.dispose();
    this.decks?.forEach((d) => { d.onEnded = null; d.onError = null; d.onDuration = null; d.stop(); });
    this.decks = null;
  }

  /* ---------- internals ---------- */

  private syncActive(): void {
    const c = this.current;
    this.talk.setActive(this.on && c.kind === 'talk');
    for (const s of this.scStations) s.setActive(this.on && c.kind === 'sc' && c.id === s.id);
    for (const l of this.liveStations.values()) l.setActive(this.on && c.kind === 'live' && c.id === l.id);
  }

  /* ---------- failure: skip to the next station with a toast ---------- */

  /** True when a station is known to be unreachable right now (skipped by automatic tuning). */
  isFailed(id: string): boolean {
    const l = this.liveStations.get(id);
    if (l) return l.status === 'failed';
    const sc = this.scMap.get(id);
    return !!sc && sc.status === 'failed';
  }

  private checkFailures(): void {
    const c = this.current;
    if (!this.on || c.kind !== 'sc') return;
    const sc = this.currentSc;
    if (!sc) return;
    if (sc.status !== 'failed') { this.handledFail.delete(c.id); if (sc.playState === 'playing') this.failWave.clear(); return; }
    if (this.handledFail.has(c.id)) return;
    this.handledFail.add(c.id);
    this.skipFailed(c);
  }

  private onLiveFail(id: string): void {
    const c = this.current;
    if (!this.on || c.id !== id) return;
    this.skipFailed(c);
  }

  /** Tunes to the next station that has not failed in this run, with a toast. Stops when every station has failed. */
  private skipFailed(from: RadioStationEntry): void {
    this.failWave.add(from.id);
    const n = this.dial.length;
    for (let k = 1; k < n; k++) {
      const cand = this.dial[(this.idx + k) % n];
      if (this.failWave.has(cand.id) || this.isFailed(cand.id) || cand.kind === 'library') continue;
      const keep = new Set(this.failWave);
      this.toast(`${from.name} is off the air. Tuning to ${cand.name}.`);
      this.select((this.idx + k) % n);
      keep.forEach((x) => this.failWave.add(x));
      return;
    }
    this.toast(`${from.name} is off the air. No other station could be reached.`);
  }

  private toast(msg: string): void {
    this.toastText = msg;
    this.toastLeft = TOAST_SECONDS;
    this.onToast?.(msg);
    this.emitChange();
  }

  private announcerTune(): void {
    const c = this.current;
    if (this.on && c.kind === 'sc' && c.sc) this.announcer.tuneIn(c.sc);
  }

  private reconcile(): void {
    const c = this.current;
    if (c.kind === 'synth') {
      this.setSynth(c.synth!, 0, 'synth');
      return;
    }
    if (c.kind === 'sc') {
      // Sets play in the SoundCloud widget only. When no stream can play, the HUD says so; nothing is synthesized.
      this.synth = null;
      return;
    }
    if (c.kind !== 'library') { this.synth = null; return; }
    this.synth = null;
    if (!this.on) return;
    const tl = this.timeline();
    if (tl.segments.length === 0 || tl.total <= 0) { this.retireActive(CROSSFADE_SECONDS); this.playingKey = null; return; }
    const vt = this.libClock;
    const look = locate(tl, vt + CROSSFADE_SECONDS);
    const key = `${look.cycle}:${look.segment.slot}`;
    if (key === this.playingKey) return;
    const track = look.segment.track!;
    const cur = locate(tl, vt);
    const offset = cur.segment === look.segment && cur.cycle === look.cycle ? cur.offset : 0;
    if (this.playingKey !== null && offset === 0 && ++this.naturalChanges % 3 === 0) this.onSweeper?.(c);
    this.startTrack(key, track.id, track.name, track.url!, offset);
  }

  private setSynth(station: Station, startStep: number, key: string): void {
    if (this.synth && this.synthKey === key && this.synth.station === station) return;
    this.synthKey = key;
    this.synthEpoch++;
    this.synth = { station, epoch: this.synthEpoch, startStep };
  }

  private startTrack(key: string, id: string, name: string, url: string, offset: number): void {
    if (!this.decks) { this.playingKey = null; return; }
    const next = this.activeDeck === 0 ? 1 : 0;
    const old = this.activeDeck;
    if (old >= 0) {
      this.decks[old].fadeTo(0, CROSSFADE_SECONDS);
      this.retire[old] = CROSSFADE_SECONDS + 0.05;
    }
    this.retire[next] = null;
    this.activeDeck = next;
    this.playingKey = key;
    this.playingTrackName = name;
    this.playingTrackId = id;
    const d = this.decks[next];
    d.load(url, offset);
    d.fadeTo(1, CROSSFADE_SECONDS);
  }
  private playingTrackId = '';

  private retireActive(seconds: number): void {
    if (!this.decks || this.activeDeck < 0) return;
    this.decks[this.activeDeck].fadeTo(0, seconds);
    this.retire[this.activeDeck] = seconds + 0.05;
    this.activeDeck = -1;
  }

  private onDeckEnded(i: number): void {
    if (i !== this.activeDeck) return;
    const c = this.current;
    if (c.kind === 'library' && this.playingKey) {
      // The file ended before the clock expected: jump the clock into the next block.
      const tl = this.timeline();
      if (tl.segments.length > 0) {
        const look = locate(tl, this.libClock + CROSSFADE_SECONDS);
        const end = look.cycle * tl.total + look.segment.start + look.segment.duration;
        this.libClock = Math.max(this.libClock, end - CROSSFADE_SECONDS + 0.01);
      }
    }
    this.activeDeck = -1;
    this.playingKey = null;
  }

  private onDeckError(i: number): void {
    if (i !== this.activeDeck) return;
    if (this.playingTrackId) this.bad.add(this.playingTrackId);
    this.libTimeline = null;
    this.activeDeck = -1;
    this.playingKey = null;
  }

  private onDeckDuration(i: number, sec: number): void {
    if (i !== this.activeDeck) return;
    const t = this.library.getTrack(this.playingTrackId);
    if (t && !(t.duration > 0)) this.library.updateDuration(t.id, sec);
  }
}
