import { describe, it, expect, vi } from 'vitest';
import { RadioDirector, CROSSFADE_SECONDS } from '@/audio/RadioDirector';
import { Library, type ImportedTrack } from '@/audio/library/Library';
import { GENRE_STATIONS } from '@/audio/radio';
import { TalkPlayer } from '@/audio/talk/TalkPlayer';
import type { Deck } from '@/audio/decks';

class FakeDeck implements Deck {
  onEnded: (() => void) | null = null;
  onError: (() => void) | null = null;
  onDuration: ((s: number) => void) | null = null;
  loads: Array<{ url: string; offset: number }> = [];
  fades: Array<{ level: number; seconds: number }> = [];
  stops = 0;
  paused = false;
  unlocked = 0;
  playing = false;
  load(url: string, offset: number) { this.loads.push({ url, offset }); this.playing = true; }
  stop() { this.stops++; this.playing = false; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  fadeTo(level: number, seconds: number) { this.fades.push({ level, seconds }); }
  unlock() { this.unlocked++; }
}

const item = (path: string, duration: number): ImportedTrack => ({ path, size: path.length * 100, lastModified: 5, duration, url: `blob:${path}` });

function setup(tracks: ImportedTrack[] = []) {
  const lib = new Library();
  lib.addTracks(tracks);
  const talk = new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('no speech'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
  const dir = new RadioDirector(lib, talk);
  const decks: [FakeDeck, FakeDeck] = [new FakeDeck(), new FakeDeck()];
  dir.attachDecks(decks);
  const idx = (id: string) => dir.stations.findIndex((s) => s.id === id);
  return { lib, dir, decks, idx };
}

describe('station list', () => {
  it('keeps the three procedural stations first, then eight music stations, then WBSY Talk', () => {
    const { dir } = setup();
    expect(dir.stations.map((s) => s.kind)).toEqual(['synth', 'synth', 'synth', ...Array(8).fill('library'), 'talk']);
    expect(dir.stations.slice(3, 11).map((s) => s.name)).toEqual([
      'Bed-Stuy Pop FM', 'Flashback 80s', 'Throop Rap Radio', 'Garvey House & Dub',
      'Marcy Trap & Plug 808', 'Hazy Tompkins Weird Radio', 'Lewis Ave Echo-Dub Folk', 'Nostrand Jazz-Rock Gets Lit',
    ]);
    expect(dir.stations.at(-1)!.name).toBe('WBSY Talk');
  });

  it('next() wraps around the whole dial', () => {
    const { dir } = setup();
    for (let i = 0; i < dir.stations.length; i++) dir.next();
    expect(dir.index).toBe(0);
  });
});

describe('synth fallback for empty slots', () => {
  it('a station with no files plays its genre synth pattern and loads no deck', () => {
    const { dir, decks, idx } = setup();
    dir.setOn(true);
    for (const id of ['pop', 'eighties', 'rap', 'house', 'trap', 'psych', 'folky', 'jazzrock'] as const) {
      dir.select(idx(id));
      dir.update(0.1);
      expect(dir.synthPlayback?.station).toBe(GENRE_STATIONS[id]);
      expect(dir.trackName).toBe('');
    }
    expect(decks[0].loads).toHaveLength(0);
    expect(decks[1].loads).toHaveLength(0);
  });

  it('every genre synth pattern has notes (never silent)', () => {
    for (const st of Object.values(GENRE_STATIONS)) {
      expect(st.bpm).toBeGreaterThan(0);
      expect(st.pattern.flat().length).toBeGreaterThan(8);
    }
  });

  it('plays the file while its slot is on and falls back to synth for the empty slots after it', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(1);
    expect(decks[0].loads).toEqual([{ url: 'blob:Pop/a.mp3', offset: expect.closeTo(0, 0) }]);
    expect(dir.trackName).toBe('a');
    expect(dir.synthPlayback).toBeNull();
    // run past the end of the file: the next 14 slots are empty
    for (let i = 0; i < 110; i++) dir.update(1);
    expect(dir.synthPlayback?.station).toBe(GENRE_STATIONS.pop);
    expect(dir.trackName).toBe('');
    expect(decks[0].fades.at(-1)).toEqual({ level: 0, seconds: CROSSFADE_SECONDS });
  });

  it('does not touch the decks and reports no synth while the radio is off', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.select(idx('pop'));
    dir.update(1);
    expect(decks[0].loads).toHaveLength(0);
    expect(dir.synthPlayback).toBeNull();
  });

  it('a track that fails to load is skipped for synth', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(1);
    decks[0].onError?.();
    dir.update(0.1);
    expect(dir.synthPlayback?.station).toBe(GENRE_STATIONS.pop);
    expect(decks[0].loads).toHaveLength(1); // not retried
  });
});

describe('virtual time', () => {
  it('resumes mid-track after listening to something else', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 200)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(1);
    dir.select(idx('rap'));
    for (let i = 0; i < 60; i++) dir.update(1);
    expect(dir.clock('pop')).toBeCloseTo(61, 5);
    dir.select(idx('pop'));
    const last = decks.flatMap((d) => d.loads).at(-1)!;
    expect(last.url).toBe('blob:Pop/a.mp3');
    expect(last.offset).toBeCloseTo(61, 5);
  });

  it('keeps time while the radio is off (out of the car)', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 300)]);
    dir.select(idx('pop'));
    for (let i = 0; i < 30; i++) dir.update(1);
    dir.setOn(true);
    expect(decks[0].loads.at(-1)!.offset).toBeCloseTo(30, 5);
  });

  it('does not advance while paused with the game', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 300)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(5);
    dir.setPaused(true);
    expect(decks[0].paused).toBe(true);
    dir.update(1000);
    expect(dir.clock('pop')).toBeCloseTo(5, 5);
    dir.setPaused(false);
    expect(decks[0].paused).toBe(false);
  });

  it('plays the second track after the first and picks up mid-way into it on a later tune-in', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100), item('Pop/b.mp3', 200)]);
    dir.setOn(true);
    dir.select(idx('house'));
    for (let i = 0; i < 150; i++) dir.update(1);
    dir.select(idx('pop'));
    const last = decks.flatMap((d) => d.loads).at(-1)!;
    expect(last.url).toBe('blob:Pop/b.mp3');
    expect(last.offset).toBeCloseTo(150 - 100, 5);
  });

  it('wraps through the loop: a lone track comes round again', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    const total = dir.timeline('pop').total;
    for (let i = 0; i < total + 20; i++) dir.update(1);
    const loads = decks.flatMap((d) => d.loads).filter((l) => l.url === 'blob:Pop/a.mp3');
    expect(loads.length).toBe(2);
    expect(loads[1].offset).toBeLessThan(25);
  });
});

describe('cross-fade', () => {
  it('starts the next track half a second early on the other deck and fades the old one out', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100), item('Pop/b.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(0.1);
    expect(decks[0].loads).toHaveLength(1);
    expect(decks[0].fades.at(-1)).toEqual({ level: 1, seconds: CROSSFADE_SECONDS });
    for (let i = 0; i < 99; i++) dir.update(1); // vt = 99.1
    expect(decks[1].loads).toHaveLength(0);
    dir.update(0.45); // vt = 99.55: lookahead crosses the boundary
    expect(decks[1].loads).toEqual([{ url: 'blob:Pop/b.mp3', offset: 0 }]);
    expect(decks[1].fades.at(-1)).toEqual({ level: 1, seconds: CROSSFADE_SECONDS });
    expect(decks[0].fades.at(-1)).toEqual({ level: 0, seconds: CROSSFADE_SECONDS });
    dir.update(0.6);
    expect(decks[0].stops).toBeGreaterThan(0);
  });

  it('a file that ends early moves the clock on instead of looping', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100), item('Pop/b.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    for (let i = 0; i < 60; i++) dir.update(1);
    decks[0].onEnded?.(); // real file was shorter than its metadata said
    dir.update(0.1);
    expect(decks.flatMap((d) => d.loads).at(-1)!.url).toBe('blob:Pop/b.mp3');
  });

  it('learns a missing duration from the deck', () => {
    const { dir, decks, idx, lib } = setup([item('Pop/a.mp3', 0)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(0.1);
    const spy = vi.spyOn(lib, 'updateDuration');
    decks[0].onDuration?.(123);
    expect(spy).toHaveBeenCalledWith(expect.any(String), 123);
  });
});

describe('library edits while listening', () => {
  it('clearing the playing slot fades the file out and switches to synth', () => {
    const { dir, decks, idx, lib } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(1);
    lib.clearSlot('pop', 0);
    dir.update(0.1);
    expect(decks[0].fades.at(-1)).toEqual({ level: 0, seconds: CROSSFADE_SECONDS });
    expect(dir.synthPlayback?.station).toBe(GENRE_STATIONS.pop);
  });

  it('station change and radio off fade the music out', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('pop'));
    dir.update(1);
    dir.setOn(false);
    expect(decks[0].fades.at(-1)!.level).toBe(0);
    dir.update(0.5);
    expect(decks[0].stops).toBeGreaterThan(0);
  });

  it('unlocks both decks when they are attached (iOS gesture rule)', () => {
    const { decks } = setup();
    expect(decks[0].unlocked).toBe(1);
    expect(decks[1].unlocked).toBe(1);
  });
});

describe('station imaging', () => {
  it('plays a station ID on every third natural track change', () => {
    const { dir, idx } = setup(Array.from({ length: 6 }, (_, i) => item(`Pop/t${i}.mp3`, 50)));
    const ids: string[] = [];
    dir.onSweeper = (e) => ids.push(e.id);
    dir.setOn(true);
    dir.select(idx('pop'));
    for (let i = 0; i < 6 * 50; i++) dir.update(1);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ids)).toEqual(new Set(['pop']));
  });
});

describe('tune callback', () => {
  it('fires on station change', () => {
    const { dir } = setup();
    const seen: string[] = [];
    dir.onTune = (e) => seen.push(e.id);
    dir.next();
    dir.next();
    expect(seen).toEqual(['synth1', 'synth2']);
  });
});
