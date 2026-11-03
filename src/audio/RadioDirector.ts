/**
 * The radio dial: procedural parody stations, the eight music-library stations and WBSY Talk.
 *
 * Every music station has a virtual clock that keeps running while you listen to something else (or are out
 * of the car), so tuning back in resumes mid-track like GTA. Tracks play on two decks with a 0.5 s cross-fade;
 * empty slots play that genre's procedural synth pattern. Time only advances through `update(dt)` (game time),
 * so the radio pauses with the game.
 */
import { STATIONS, GENRE_STATIONS, stepSeconds, type Station } from './radio';
import { LIBRARY_STATIONS, type LibraryStationId } from './library/genres';
import type { Library } from './library/Library';
import { buildTimeline, locate, type Timeline } from './library/timeline';
import type { Deck } from './decks';
import type { TalkPlayer } from './talk/TalkPlayer';
import { ScStation } from './sc/ScStation';

export const CROSSFADE_SECONDS = 0.5;

export type RadioKind = 'synth' | 'library' | 'talk' | 'sc';

export interface RadioStationEntry {
  id: string;
  kind: RadioKind;
  /** Display name (talk can change this when voices are unavailable: use `director.stationName`). */
  name: string;
  synth?: Station;
  lib?: LibraryStationId;
}

export interface SynthPlayback {
  station: Station;
  /** Changes whenever the pattern should restart from `startStep` (station change, new empty block). */
  epoch: number;
  startStep: number;
}

export class RadioDirector {
  readonly stations: RadioStationEntry[];
  private idx = 0;
  private on = false;
  private paused = false;
  private decks: [Deck, Deck] | null = null;
  private activeDeck = -1;
  private readonly retire: Array<number | null> = [null, null];
  private playingKey: string | null = null;
  private playingTrackName = '';
  private readonly vt = new Map<LibraryStationId, number>();
  private readonly bad = new Set<string>();
  private readonly timelines = new Map<LibraryStationId, Timeline>();
  private synth: SynthPlayback | null = null;
  private synthEpoch = 0;
  private synthKey = '';
  /** Called when the listener changes station (AudioSystem plays the station jingle). */
  onTune: ((entry: RadioStationEntry) => void) | null = null;
  /** Called every third natural track change on a music station (a station ID between songs). */
  onSweeper: ((entry: RadioStationEntry) => void) | null = null;
  private naturalChanges = 0;
  private readonly unsubLib: () => void;

  constructor(readonly library: Library, readonly talk: TalkPlayer, synthStations: Station[] = STATIONS, readonly sc: ScStation = new ScStation()) {
    this.stations = [
      ...synthStations.map((s, i): RadioStationEntry => ({ id: `synth${i}`, kind: 'synth', name: s.name, synth: s })),
      ...LIBRARY_STATIONS.map((d): RadioStationEntry => ({ id: d.id, kind: 'library', name: d.name, lib: d.id })),
      { id: 'talk', kind: 'talk', name: 'WBSY Talk' },
      { id: 'sc', kind: 'sc', name: 'Radio SC' },
    ];
    sc.onBetweenMixes = () => { if (this.current.kind === 'sc' && this.on) this.onSweeper?.(this.current); };
    for (const d of LIBRARY_STATIONS) this.vt.set(d.id, 0);
    this.unsubLib = library.onChange(() => {
      this.timelines.clear();
      // The playing file was cleared or the library was reset: stop it now.
      if (this.playingKey && this.playingTrackId && !library.locate(this.playingTrackId)) {
        this.retireActive(CROSSFADE_SECONDS);
        this.playingKey = null;
      }
    });
  }

  /* ---------- reading ---------- */

  get index(): number { return this.idx; }
  get current(): RadioStationEntry { return this.stations[this.idx]; }

  get stationName(): string {
    const c = this.current;
    if (c.kind === 'sc') return this.sc.stationName;
    return c.kind === 'talk' ? this.talk.stationName : c.name;
  }

  /** Now-playing text: file name without extension, or the talk speaker. Empty for synth music. */
  get trackName(): string {
    const c = this.current;
    if (c.kind === 'talk') return this.talk.caption;
    if (c.kind === 'sc') return this.sc.usingBed && this.sc.hasSources ? '' : this.sc.trackName;
    if (c.kind === 'library' && this.playingKey) return this.playingTrackName;
    return '';
  }

  /** 0..1 through the talk show loop while WBSY Talk is tuned in, otherwise 0. */
  get talkProgress(): number {
    return this.current.kind === 'talk' ? this.talk.progress.fraction : 0;
  }

  /** Virtual clock of a library station in seconds (for tests and the UI). */
  clock(id: LibraryStationId): number { return this.vt.get(id) ?? 0; }

  get synthPlayback(): SynthPlayback | null { return this.on ? this.synth : null; }

  timeline(id: LibraryStationId): Timeline {
    let tl = this.timelines.get(id);
    if (!tl) { tl = buildTimeline(this.library, id, this.bad); this.timelines.set(id, tl); }
    return tl;
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

  next(): void { this.select((this.idx + 1) % this.stations.length); }

  select(i: number): void {
    const n = this.stations.length;
    const target = ((Math.round(i) % n) + n) % n;
    if (target === this.idx) return;
    this.idx = target;
    this.synthEpoch++;
    this.synthKey = '';
    this.synth = null;
    this.playingKey = null;
    this.retireActive(CROSSFADE_SECONDS);
    this.talk.setActive(this.on && this.current.kind === 'talk');
    this.sc.setActive(this.on && this.current.kind === 'sc');
    this.onTune?.(this.current);
    this.reconcile();
  }

  /** True while the player is in a car with the radio on. */
  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (!on) {
      this.retireActive(0.15);
      this.playingKey = null;
      this.synth = null;
    }
    this.talk.setActive(on && this.current.kind === 'talk');
    this.sc.setActive(on && this.current.kind === 'sc');
    if (on) this.reconcile();
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    this.talk.setPaused(p);
    this.sc.setPaused(p);
    this.decks?.forEach((d) => { if (p) d.pause(); else d.resume(); });
  }

  /** Advances every station's virtual clock and keeps the decks in step with the active one. */
  update(dt: number): void {
    if (this.paused || !(dt > 0)) return;
    for (const d of LIBRARY_STATIONS) this.vt.set(d.id, (this.vt.get(d.id) ?? 0) + dt);
    this.talk.update(dt);
    this.sc.update(dt);
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
    this.talk.dispose();
    this.sc.dispose();
    this.decks?.forEach((d) => { d.onEnded = null; d.onError = null; d.onDuration = null; d.stop(); });
    this.decks = null;
  }

  /* ---------- internals ---------- */

  private reconcile(): void {
    const c = this.current;
    if (c.kind === 'synth') {
      this.setSynth(c.synth!, 0, 'synth');
      return;
    }
    if (c.kind === 'sc') {
      // Mixes play in the hidden widget; only the procedural bed (offline, blocked, empty list) uses the synth.
      if (this.on && this.sc.usingBed) this.setSynth(GENRE_STATIONS.house, 0, 'sc-bed'); else this.synth = null;
      return;
    }
    if (c.kind !== 'library' || !c.lib) { this.synth = null; return; }
    if (!this.on) return;
    const id = c.lib;
    const tl = this.timeline(id);
    const vt = this.vt.get(id) ?? 0;
    const look = locate(tl, vt + CROSSFADE_SECONDS);
    if (look.segment.kind === 'synth') {
      this.retireActive(CROSSFADE_SECONDS);
      this.playingKey = null;
      const cur = locate(tl, vt);
      const st = GENRE_STATIONS[id];
      const off = cur.segment === look.segment ? cur.offset : 0;
      this.setSynth(st, Math.floor(off / stepSeconds(st.bpm)), `${id}:${look.cycle}:${look.segment.slot}`);
      return;
    }
    this.synth = null;
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
    if (c.kind === 'library' && c.lib && this.playingKey) {
      // The file ended before the clock expected: jump the clock into the next block.
      const tl = this.timeline(c.lib);
      const vt = this.vt.get(c.lib) ?? 0;
      const look = locate(tl, vt + CROSSFADE_SECONDS);
      const end = look.cycle * tl.total + look.segment.start + look.segment.duration;
      this.vt.set(c.lib, Math.max(vt, end - CROSSFADE_SECONDS + 0.01));
    }
    this.activeDeck = -1;
    this.playingKey = null;
  }

  private onDeckError(i: number): void {
    if (i !== this.activeDeck) return;
    if (this.playingTrackId) this.bad.add(this.playingTrackId);
    this.timelines.clear();
    this.activeDeck = -1;
    this.playingKey = null;
  }

  private onDeckDuration(i: number, sec: number): void {
    if (i !== this.activeDeck) return;
    const t = this.library.getTrack(this.playingTrackId);
    if (t && !(t.duration > 0)) this.library.updateDuration(t.id, sec);
  }
}
