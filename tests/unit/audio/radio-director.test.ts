import { describe, it, expect, vi } from 'vitest';
import { RadioDirector, CROSSFADE_SECONDS } from '@/audio/RadioDirector';
import { Library, type ImportedTrack } from '@/audio/library/Library';
import { GENRE_STATIONS, SC_STATIONS } from '@/audio/radio';
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
  const dir = new RadioDirector(lib, talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => false } });
  const decks: [FakeDeck, FakeDeck] = [new FakeDeck(), new FakeDeck()];
  dir.attachDecks(decks);
  const idx = (id: string) => dir.stations.findIndex((s) => s.id === id);
  return { lib, dir, decks, idx };
}

describe('station list', () => {
  it('has the eight SoundCloud stations, then WBSY Talk, and no My Library while the library is empty', () => {
    const { dir } = setup();
    expect(dir.stations.map((s) => s.kind)).toEqual([...Array(8).fill('sc'), 'talk']);
    expect(dir.stations.map((s) => s.name)).toEqual(['BK House', 'Dub Lab', 'Stoop Radio', 'Boogie Down', 'Weird Hours', 'Yard FM', 'Flashback 88', 'Radio SC', 'WBSY Talk']);
    expect(dir.libraryOnDial).toBe(false);
  });

  it('adds My Library at the end of the dial once a file can play, and removes it when it is cleared', () => {
    const { dir, lib } = setup([item('Pop/a.mp3', 100)]);
    expect(dir.libraryOnDial).toBe(true);
    expect(dir.stations.at(-1)).toMatchObject({ id: 'mylib', name: 'My Library', kind: 'library' });
    expect(dir.stations).toHaveLength(10);
    lib.reset();
    expect(dir.stations).toHaveLength(9);
    expect(dir.stations.at(-1)!.kind).toBe('talk');
  });

  it('stays off the dial when tracks are saved but their files are not loaded this session', () => {
    const lib = new Library();
    lib.addTracks([{ path: 'Pop/a.mp3', size: 10, lastModified: 1, duration: 100, url: '' }]);
    const talk = new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    expect(new RadioDirector(lib, talk, undefined, undefined, { feed: null }).libraryOnDial).toBe(false);
  });

  it('next() wraps around the whole dial', () => {
    const { dir } = setup();
    for (let i = 0; i < dir.stations.length; i++) dir.next();
    expect(dir.index).toBe(0);
  });

  it('a SoundCloud station that cannot load synthesizes nothing and plays no deck', () => {
    const { dir, decks, idx } = setup();
    dir.setOn(true);
    for (const def of SC_STATIONS) {
      dir.select(idx(def.id));
      dir.update(0.1);
      expect(dir.synthPlayback).toBeNull();
    }
    expect(decks[0].loads).toHaveLength(0);
  });
});

describe('My Library', () => {
  it('plays every placed file in order, then wraps; empty slots never become synth blocks', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100), item('House/b.mp3', 200)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
    dir.update(1);
    expect(decks[0].loads.at(-1)!.url).toBe('blob:Pop/a.mp3');
    expect(dir.trackName).toBe('a');
    expect(dir.synthPlayback).toBeNull();
    expect(dir.timeline().total).toBe(300);
    for (let i = 0; i < 120; i++) dir.update(1);
    expect(decks.flatMap((d) => d.loads).at(-1)!.url).toBe('blob:House/b.mp3');
  });

  it('does not touch the decks while the radio is off', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.select(idx('mylib'));
    dir.update(1);
    expect(decks[0].loads).toHaveLength(0);
    expect(dir.synthPlayback).toBeNull();
  });

  it('a track that fails to load is skipped', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100), item('Pop/b.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
    dir.update(1);
    decks[0].onError?.();
    dir.update(0.1);
    expect(dir.timeline().segments).toHaveLength(1);
  });
});

describe('virtual time', () => {
  it('resumes mid-track after listening to something else', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 200)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
    dir.update(1);
    dir.select(idx('stoop'));
    for (let i = 0; i < 60; i++) dir.update(1);
    expect(dir.libraryClock).toBeCloseTo(61, 5);
    dir.select(idx('mylib'));
    const last = decks.flatMap((d) => d.loads).at(-1)!;
    expect(last.url).toBe('blob:Pop/a.mp3');
    expect(last.offset).toBeCloseTo(61, 5);
  });

  it('keeps time while the radio is off (out of the car)', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 300)]);
    dir.select(idx('mylib'));
    for (let i = 0; i < 30; i++) dir.update(1);
    dir.setOn(true);
    expect(decks[0].loads.at(-1)!.offset).toBeCloseTo(30, 5);
  });

  it('does not advance while paused with the game', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 300)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
    dir.update(5);
    dir.setPaused(true);
    expect(decks[0].paused).toBe(true);
    dir.update(1000);
    expect(dir.libraryClock).toBeCloseTo(5, 5);
    dir.setPaused(false);
    expect(decks[0].paused).toBe(false);
  });

  it('plays the second track after the first and picks up mid-way into it on a later tune-in', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100), item('Pop/b.mp3', 200)]);
    dir.setOn(true);
    dir.select(idx('stoop'));
    for (let i = 0; i < 150; i++) dir.update(1);
    dir.select(idx('mylib'));
    const last = decks.flatMap((d) => d.loads).at(-1)!;
    expect(last.url).toBe('blob:Pop/b.mp3');
    expect(last.offset).toBeCloseTo(150 - 100, 5);
  });

  it('wraps through the loop: a lone track comes round again', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
    const total = dir.timeline().total;
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
    dir.select(idx('mylib'));
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
    dir.select(idx('mylib'));
    for (let i = 0; i < 60; i++) dir.update(1);
    decks[0].onEnded?.(); // real file was shorter than its metadata said
    dir.update(0.1);
    expect(decks.flatMap((d) => d.loads).at(-1)!.url).toBe('blob:Pop/b.mp3');
  });

  it('learns a missing duration from the deck', () => {
    const { dir, decks, idx, lib } = setup([item('Pop/a.mp3', 0)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
    dir.update(0.1);
    const spy = vi.spyOn(lib, 'updateDuration');
    decks[0].onDuration?.(123);
    expect(spy).toHaveBeenCalledWith(expect.any(String), 123);
  });
});

describe('library edits while listening', () => {
  it('clearing the last playing file fades it out and drops My Library from the dial', () => {
    const { dir, decks, idx, lib } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
    dir.update(1);
    lib.reset();
    dir.update(0.1);
    expect(decks[0].fades.at(-1)).toEqual({ level: 0, seconds: CROSSFADE_SECONDS });
    expect(dir.current.id).toBe('bkhouse');
  });

  it('station change and radio off fade the music out', () => {
    const { dir, decks, idx } = setup([item('Pop/a.mp3', 100)]);
    dir.setOn(true);
    dir.select(idx('mylib'));
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
    dir.select(idx('mylib'));
    for (let i = 0; i < 6 * 50; i++) dir.update(1);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ids)).toEqual(new Set(['mylib']));
  });
});

describe('tune callback', () => {
  it('fires on station change', () => {
    const { dir } = setup();
    const seen: string[] = [];
    dir.onTune = (e) => seen.push(e.id);
    dir.next();
    dir.next();
    expect(seen).toEqual(['dublab', 'stoop']);
  });
});
