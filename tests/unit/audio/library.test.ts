// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { LIBRARY_STATIONS, TOTAL_SLOTS, classifyGenre, isAudioFile, trackTitle } from '@/audio/library/genres';
import { Library, localLibraryStorage, trackId, type ImportedTrack, type LibraryStorage, type PersistedLibrary } from '@/audio/library/Library';
import { buildTimeline, locate, SYNTH_SLOT_SECONDS } from '@/audio/library/timeline';

const item = (path: string, over: Partial<ImportedTrack> = {}): ImportedTrack => ({ path, size: path.length * 1000, lastModified: 1_700_000_000_000, duration: 100, url: `blob:${path}`, ...over });

function memoryStorage(): LibraryStorage & { data: PersistedLibrary | null } {
  const s = { data: null as PersistedLibrary | null, load: () => (s.data ? JSON.parse(JSON.stringify(s.data)) : null), save: (d: PersistedLibrary) => { s.data = JSON.parse(JSON.stringify(d)); }, clear: () => { s.data = null; } };
  return s;
}

describe('station model', () => {
  it('has the requested slot counts and 147 slots in total', () => {
    const counts = Object.fromEntries(LIBRARY_STATIONS.map((s) => [s.id, s.slots]));
    expect(counts).toEqual({ pop: 15, eighties: 12, rap: 13, house: 22, trap: 25, psych: 28, folky: 16, jazzrock: 16 });
    expect(TOTAL_SLOTS).toBe(147);
  });

  it('gives each station a parody name', () => {
    expect(LIBRARY_STATIONS.find((s) => s.id === 'pop')!.name).toBe('Bed-Stuy Pop FM');
    expect(LIBRARY_STATIONS.find((s) => s.id === 'eighties')!.name).toBe('Flashback 80s');
    expect(LIBRARY_STATIONS.find((s) => s.id === 'rap')!.name).toBe('Throop Rap Radio');
    expect(LIBRARY_STATIONS.find((s) => s.id === 'house')!.name).toBe('Garvey House & Dub');
    expect(new Set(LIBRARY_STATIONS.map((s) => s.name)).size).toBe(8);
  });
});

describe('genre keywords', () => {
  it.each([
    ['Music/Pop/Some Song.mp3', 'pop'],
    ['Music/80s/Song.mp3', 'eighties'],
    ['Best of 1984/track.mp3', 'eighties'],
    ['Eighties Mix - Track.m4a', 'eighties'],
    ['Hip-Hop/Song.mp3', 'rap'],
    ['Music/Hip Hop/Song.mp3', 'rap'],
    ['Old school rap - song.mp3', 'rap'],
    ['Mixes/House/deep one.mp3', 'house'],
    ['Dub/Version.ogg', 'house'],
    ['Techno Bunker 04.wav', 'house'],
    ['Playlists/Trap/Song.mp3', 'trap'],
    ['Drill 2023 - Track.mp3', 'trap'],
    ['Sounds/808 Mafia.mp3', 'trap'],
    ['Weird/Wired/x.mp3', 'psych'],
    ['Psychedelic Rock/Track.mp3', 'psych'],
    ['Indie/lo-fi beat.mp3', 'psych'],
    ['Dreamy synthpop.mp3', 'psych'],
    ['Folk/Song.mp3', 'folky'],
    ['Shoegaze Reverb/Wall.mp3', 'folky'],
    ['Post-Rock/Long.mp3', 'folky'],
    ['Jazz/Take Five.mp3', 'jazzrock'],
    ['Fusion Friday/x.mp3', 'jazzrock'],
    ['Funk/x.mp3', 'jazzrock'],
    ['Prog/Epic.mp3', 'jazzrock'],
  ])('%s -> %s', (path, genre) => { expect(classifyGenre(path)).toBe(genre); });

  it('returns null when nothing matches or the word is only part of another word', () => {
    expect(classifyGenre('Music/Misc/song.mp3')).toBeNull();
    expect(classifyGenre('Popular Mechanics.mp3')).toBeNull();
    expect(classifyGenre('Rapture.mp3')).toBeNull();
    expect(classifyGenre('')).toBeNull();
  });

  it('lets the nearest folder win over parents and the file name', () => {
    expect(classifyGenre('Pop/Hip-Hop/song.mp3')).toBe('rap');
    expect(classifyGenre('Music/Misc/House of Pain - Jump Around.mp3')).toBe('house');
    expect(classifyGenre('Rap/trap beat.mp3')).toBe('rap'); // folder beats file name
  });

  it('prefers the more specific genre on a tie: trap over rap, 80s over pop, echo-dub over dub', () => {
    expect(classifyGenre('trap rap mix.mp3')).toBe('trap');
    expect(classifyGenre('80s pop hits.mp3')).toBe('eighties');
    expect(classifyGenre('Echo Dub Session.mp3')).toBe('folky');
    expect(classifyGenre('Dub Plate.mp3')).toBe('house');
  });

  it('knows audio files and titles', () => {
    expect(isAudioFile('a.MP3')).toBe(true);
    expect(isAudioFile('cover.jpg')).toBe(false);
    expect(isAudioFile('noext', 'audio/mpeg')).toBe(true);
    expect(trackTitle('Music/Pop/My_Song.v2.mp3')).toBe('My Song.v2');
  });
});

describe('Library slots and counts', () => {
  let lib: Library;
  beforeEach(() => { lib = new Library(); });

  it('starts empty with every slot count at 0 of its capacity', () => {
    expect(lib.countLabel('pop')).toBe('0/15');
    expect(lib.countLabel('psych')).toBe('0/28');
    expect(lib.totalFilled).toBe(0);
  });

  it('assigns by keyword in path order and shows 7/15 style counts', () => {
    const items = Array.from({ length: 7 }, (_, i) => item(`Music/Pop/song ${i + 1}.mp3`));
    const r = lib.addTracks([...items, item('Music/House/a.mp3'), item('Music/Other/mystery.mp3')]);
    expect(r).toEqual({ added: 9, assigned: 8, unassigned: 1 });
    expect(lib.countLabel('pop')).toBe('7/15');
    expect(lib.countLabel('house')).toBe('1/22');
    expect(lib.slotTrack('pop', 0)!.name).toBe('song 1');
    expect(lib.slotTrack('pop', 6)!.name).toBe('song 7');
    expect(lib.slotTrack('pop', 7)).toBeNull();
    expect(lib.unassigned().map((t) => t.name)).toEqual(['mystery']);
  });

  it('stops at capacity: the 16th pop song stays unassigned', () => {
    lib.addTracks(Array.from({ length: 16 }, (_, i) => item(`Pop/s${String(i).padStart(2, '0')}.mp3`)));
    expect(lib.count('pop')).toBe(15);
    expect(lib.unassigned()).toHaveLength(1);
  });

  it('assign moves a track between stations and refuses a full station', () => {
    lib.addTracks([item('Pop/a.mp3'), item('Pop/b.mp3')]);
    const a = lib.slotTrack('pop', 0)!;
    expect(lib.assign(a.id, 'rap')).toBe(true);
    expect(lib.count('pop')).toBe(1);
    expect(lib.slotTrack('rap', 0)!.id).toBe(a.id);
    lib.addTracks(Array.from({ length: 12 }, (_, i) => item(`Rap/r${String(i).padStart(2, '0')}.mp3`)));
    expect(lib.count('rap')).toBe(13);
    const b = lib.slotTrack('pop', 1)!;
    expect(lib.assign(b.id, 'rap')).toBe(false);
    expect(lib.locate(b.id)).toEqual({ station: 'pop', index: 1 });
  });

  it('assigning into an occupied slot swaps the displaced track into the old slot', () => {
    lib.addTracks([item('Pop/a.mp3'), item('Pop/b.mp3')]);
    const [a, b] = [lib.slotTrack('pop', 0)!, lib.slotTrack('pop', 1)!];
    expect(lib.assign(a.id, 'pop', 1)).toBe(true);
    expect(lib.slotTrack('pop', 1)!.id).toBe(a.id);
    expect(lib.slotTrack('pop', 0)!.id).toBe(b.id);
  });

  it('clearSlot returns the track to the pool without deleting it', () => {
    lib.addTracks([item('Pop/a.mp3')]);
    lib.clearSlot('pop', 0);
    expect(lib.count('pop')).toBe(0);
    expect(lib.unassigned()).toHaveLength(1);
    expect(lib.autoAssign()).toBe(1); // "fill" places it again
    expect(lib.count('pop')).toBe(1);
  });

  it('re-adding a known file keeps its slot and attaches the new URL; no duplicates', () => {
    lib.addTracks([item('Pop/a.mp3', { url: 'blob:old', size: 5000 })]);
    const r = lib.addTracks([item('Other/Pop/a.mp3', { url: 'blob:new', size: 5000 })]);
    expect(r.added).toBe(0);
    expect(lib.size).toBe(1);
    expect(lib.slotTrack('pop', 0)!.url).toBe('blob:new');
  });

  it('notifies listeners once per batch', () => {
    let n = 0;
    lib.onChange(() => { n++; });
    lib.addTracks([item('Pop/a.mp3'), item('Pop/b.mp3'), item('Rap/c.mp3')]);
    expect(n).toBe(1);
  });
});

describe('Library persistence', () => {
  it('round-trips assignments through storage and needs files again after reload', () => {
    const store = memoryStorage();
    const a = new Library(store);
    a.folderName = 'Music';
    a.addTracks([item('Music/Pop/a.mp3'), item('Music/Pop/b.mp3'), item('Music/Trap/t.mp3'), item('Music/misc/x.mp3')]);
    a.assign(a.slotTrack('pop', 1)!.id, 'jazzrock', 3);

    const b = new Library(store); // new session
    expect(b.countLabel('pop')).toBe('1/15');
    expect(b.countLabel('trap')).toBe('1/25');
    expect(b.slotTrack('jazzrock', 3)!.name).toBe('b');
    expect(b.folderName).toBe('Music');
    expect(b.unassigned().map((t) => t.name)).toEqual(['x']);
    expect(b.slotTrack('pop', 0)!.url).toBeUndefined();
    expect(b.needsReconnect).toBe(true);
    expect(b.playableCount('pop')).toBe(0);

    // picking the same files again re-attaches URLs without moving anything
    b.addTracks([item('Music/Pop/a.mp3', { url: 'blob:again' })]);
    expect(b.slotTrack('pop', 0)!.url).toBe('blob:again');
    expect(b.playableCount('pop')).toBe(1);
  });

  it('stores only metadata, never URLs or file contents', () => {
    const store = memoryStorage();
    const lib = new Library(store);
    lib.addTracks([item('Pop/a.mp3', { url: 'blob:secret-session-url' })]);
    const json = JSON.stringify(store.data);
    expect(json).not.toContain('blob:');
    expect(Object.keys(store.data!.pool[0]).sort()).toEqual(['duration', 'id', 'lastModified', 'name', 'path', 'size']);
  });

  it('round-trips through real localStorage and ignores corrupt data', () => {
    const key = 'test.radio';
    const s = localLibraryStorage(key);
    const a = new Library(s);
    a.addTracks([item('Pop/a.mp3')]);
    expect(new Library(localLibraryStorage(key)).countLabel('pop')).toBe('1/15');
    localStorage.setItem(key, '{not json');
    expect(new Library(localLibraryStorage(key)).size).toBe(0);
    localStorage.setItem(key, JSON.stringify({ v: 1, pool: [{ id: 'x', path: 'p', name: 'n', size: 1, lastModified: 1, duration: 1 }], slots: { pop: ['x', 'x', 'ghost'], bogus: ['x'] } }));
    const c = new Library(localLibraryStorage(key));
    expect(c.count('pop')).toBe(1); // duplicate and unknown ids dropped
    localStorage.removeItem(key);
  });

  it('reset forgets everything and clears storage', () => {
    const store = memoryStorage();
    const lib = new Library(store);
    lib.addTracks([item('Pop/a.mp3')]);
    lib.reset();
    expect(lib.size).toBe(0);
    expect(lib.totalFilled).toBe(0);
    expect(store.data).toBeNull();
    expect(new Library(store).size).toBe(0);
  });
});

describe('timeline', () => {
  it('turns filled slots into tracks and runs of empty slots into synth blocks', () => {
    const lib = new Library();
    lib.addTracks([item('Pop/a.mp3', { duration: 100 }), item('Pop/b.mp3', { duration: 60 })]);
    lib.clearSlot('pop', 0);
    lib.assign(lib.unassigned()[0].id, 'pop', 2);
    // slots: [empty, b(60), a(100), empty x12]
    const tl = buildTimeline(lib, 'pop');
    expect(tl.segments.map((s) => s.kind)).toEqual(['synth', 'track', 'track', 'synth']);
    expect(tl.segments[0].duration).toBe(SYNTH_SLOT_SECONDS);
    expect(tl.segments[3].duration).toBe(12 * SYNTH_SLOT_SECONDS);
    expect(tl.total).toBe(SYNTH_SLOT_SECONDS + 60 + 100 + 12 * SYNTH_SLOT_SECONDS);
  });

  it('treats tracks without a file or marked unplayable as synth, and a fully empty station never has zero length', () => {
    const store = memoryStorage();
    const a = new Library(store);
    a.addTracks([item('Pop/a.mp3')]);
    const b = new Library(store); // no URL this session
    expect(buildTimeline(b, 'pop').segments.every((s) => s.kind === 'synth')).toBe(true);
    expect(buildTimeline(new Library(), 'rap').total).toBe(13 * SYNTH_SLOT_SECONDS);
    const bad = new Set([a.slotTrack('pop', 0)!.id]);
    expect(buildTimeline(a, 'pop', bad).segments[0].kind).toBe('synth');
  });

  it('locates a virtual time inside the loop and counts cycles', () => {
    const lib = new Library();
    lib.addTracks([item('Pop/a.mp3', { duration: 100 })]);
    const tl = buildTimeline(lib, 'pop');
    expect(locate(tl, 30)).toMatchObject({ offset: 30, cycle: 0 });
    expect(locate(tl, 30).segment.kind).toBe('track');
    expect(locate(tl, 100.5).segment.kind).toBe('synth');
    const again = locate(tl, tl.total + 40);
    expect(again.cycle).toBe(1);
    expect(again.offset).toBe(40);
    expect(locate(tl, -5).offset).toBe(0);
    expect(locate(tl, Number.NaN).offset).toBe(0);
  });

  it('trackId ignores the folder', () => {
    expect(trackId('A/B/song.mp3', 5, 9)).toBe(trackId('song.mp3', 5, 9));
    expect(trackId('song.mp3', 5, 9)).not.toBe(trackId('song.mp3', 6, 9));
  });
});
