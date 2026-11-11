/** Parody radio stations: pure pattern data. The AudioSystem turns notes into Web Audio. */
import { CATALOG, type RadioSourceKind } from './stations';

export type Voice = 'kick' | 'snare' | 'hat' | 'shaker' | 'bass' | 'arp' | 'mumble' | 'sub' | 'ride' | 'pluck' | 'wob';

export interface Note {
  voice: Voice;
  /** Pitch in Hz for tonal voices (bass, arp). Ignored by noise and drum voices. */
  freq: number;
  /** Relative level, 0..1. */
  gain: number;
  /** Length in steps (1 = one sixteenth note). */
  len: number;
}

/** One entry per step; steps with no notes are rests. The pattern loops. */
export type Pattern = Note[][];

export interface Station {
  name: string;
  bpm: number;
  pattern: Pattern;
}

const note = (voice: Voice, gain: number, len = 1, freq = 0): Note => ({ voice, freq, gain, len });

/** 16-step bar of a boom-bap loop with a walking bass. */
function boomBapPattern(): Pattern {
  const bass: Record<number, number> = { 0: 55, 3: 55, 6: 65.41, 8: 49, 11: 49 };
  return Array.from({ length: 16 }, (_, s) => {
    const notes: Note[] = [];
    if (s % 2 === 0) notes.push(note('hat', s % 4 === 2 ? 0.5 : 0.8));
    if ([0, 7, 8, 10].includes(s)) notes.push(note('kick', 1));
    if (s === 4 || s === 12) notes.push(note('snare', 0.9));
    if (bass[s] !== undefined) notes.push(note('bass', 0.5, 2, bass[s]));
    return notes;
  });
}

/** 16-step bright arpeggio over C major with a shaker on the offbeats. */
function kompaPattern(): Pattern {
  const arp = [523.25, 659.25, 783.99, 987.77];
  return Array.from({ length: 16 }, (_, s) => {
    const notes: Note[] = [note('arp', 0.12, 1, arp[s % arp.length])];
    if (s % 2 === 1) notes.push(note('shaker', 0.6));
    return notes;
  });
}

/** 'x' starts a syllable (a short low-pass noise burst), '.' is a pause. Uneven spacing gives speech rhythm. */
const TALK_RHYTHM = 'x.x.xx..x.x...xx.x.x..xx.x...x.xx..';

function talkPattern(): Pattern {
  return [...TALK_RHYTHM].map((c, s) =>
    c === 'x' ? [note('mumble', 0.7, 1, 120 + ((s * 37) % 60))] : [],
  );
}

export const STATIONS: Station[] = [
  { name: 'WBED 88.9 — Brownstone Boom-Bap', bpm: 90, pattern: boomBapPattern() },
  { name: 'Kosciusko Kompa FM', bpm: 120, pattern: kompaPattern() },
  { name: 'Throop Talk Radio', bpm: 100, pattern: talkPattern() },
];

/** Duration of one sixteenth-note step at a tempo, in seconds. */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

/** Notes that sound on a step. Deterministic; wraps around the pattern length. */
export function patternAt(station: Station, step: number): Note[] {
  const len = station.pattern.length;
  const i = ((step % len) + len) % len;
  return (station.pattern[i] ?? []).slice();
}

/* ---------- genre fallback patterns for the music-library stations ----------
 * An empty slot plays one of these instead of a song, so a station never goes silent.
 * Pop = bright plucks over a four-chord loop, 80s = gated snare and pulsing synth bass, Rap = boom-bap,
 * House = four on the floor, Trap = rolling hats and an 808, Psych = slow wobbling arps, Folky = echo-dub guitar,
 * Jazz-rock = walking bass and a ride cymbal. */

import type { LibraryStationId } from './library/genres';

const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

function bars(count: number, fn: (bar: number, s: number) => Note[]): Pattern {
  const out: Pattern = [];
  for (let b = 0; b < count; b++) for (let s = 0; s < 16; s++) out.push(fn(b, s));
  return out;
}

function popPattern(): Pattern {
  const roots = [60, 67, 69, 65]; // C G Am F
  return bars(4, (b, s) => {
    const n: Note[] = [];
    if (s % 4 === 0) n.push(note('kick', 0.9));
    if (s === 4 || s === 12) n.push(note('snare', 0.7));
    if (s % 4 === 2) n.push(note('hat', 0.6));
    const arp = [0, 4, 7, 12][s % 4];
    if (s % 2 === 0) n.push(note('arp', 0.1, 1, midi(roots[b] + 12 + arp)));
    if (s === 0 || s === 8) n.push(note('bass', 0.5, 4, midi(roots[b] - 24)));
    return n;
  });
}

function eightiesPattern(): Pattern {
  const roots = [45, 41, 43, 40]; // A F G E
  return bars(4, (b, s) => {
    const n: Note[] = [];
    if (s === 0 || s === 6 || s === 8 || s === 14) n.push(note('kick', 1));
    if (s === 4 || s === 12) { n.push(note('snare', 1)); n.push(note('hat', 0.4)); }
    if (s % 2 === 1) n.push(note('hat', 0.5));
    n.push(note('bass', s % 2 === 0 ? 0.5 : 0.35, 1, midi(roots[b] + (s % 4 === 3 ? 12 : 0))));
    if (s % 4 === 0) n.push(note('arp', 0.1, 2, midi(roots[b] + 24 + [0, 3, 7, 10][(s / 4) | 0])));
    return n;
  });
}

function housePattern(): Pattern {
  const bass = [55, 55, 65.41, 49];
  return bars(2, (b, s) => {
    const n: Note[] = [];
    if (s % 4 === 0) n.push(note('kick', 1));
    if (s === 4 || s === 12) n.push(note('snare', 0.55));
    if (s % 4 === 2) { n.push(note('hat', 0.9)); n.push(note('bass', 0.45, 2, bass[(b * 2 + (s >> 3)) % bass.length])); }
    if (s % 2 === 1) n.push(note('shaker', 0.4));
    if (s === 6 || s === 14) n.push(note('arp', 0.09, 1, midi(72 + (b ? 3 : 0))));
    return n;
  });
}

function trapPattern(): Pattern {
  return bars(2, (b, s) => {
    const n: Note[] = [];
    n.push(note('hat', s % 4 === 0 ? 0.8 : 0.4));
    if (s >= 12 && b === 1) n.push(note('hat', 0.45)); // roll
    if (s === 8) n.push(note('snare', 0.9));
    if (s === 0) n.push(note('sub', 1, 6, 41.2));
    if (s === 10) n.push(note('sub', 0.9, 3, b ? 36.7 : 49));
    if (s === 3 && b === 1) n.push(note('kick', 0.7));
    return n;
  });
}

function psychPattern(): Pattern {
  const chord = [57, 60, 64, 67, 71, 67, 64, 60]; // Am7 up and down
  return bars(2, (b, s) => {
    const n: Note[] = [];
    if (s % 2 === 0) n.push(note('wob', 0.2, 4, midi(chord[((s / 2) + b * 3) % chord.length] + 12)));
    if (s === 0 || (b === 1 && s === 8)) n.push(note('kick', 0.6));
    if (s === 8) n.push(note('snare', 0.35));
    if (s % 4 === 3) n.push(note('shaker', 0.35));
    if (s === 0) n.push(note('bass', 0.4, 8, midi(b ? 41 : 45)));
    return n;
  });
}

function folkyPattern(): Pattern {
  const strum = [57, 64, 69, 72, 69, 64, 60, 67];
  return bars(2, (b, s) => {
    const n: Note[] = [];
    if (s === 0 || s === 10) n.push(note('kick', 0.55));
    if (s === 12) n.push(note('snare', 0.35));
    if (s % 4 === 2) n.push(note('hat', 0.45));
    if (s % 2 === 0) n.push(note('pluck', 0.4, 2, midi(strum[(s / 2 + b * 4) % strum.length])));
    if (s === 0 || s === 8) n.push(note('bass', 0.45, 3, midi(b ? 43 : 45)));
    return n;
  });
}

function jazzRockPattern(): Pattern {
  const walk = [40, 43, 45, 47, 48, 47, 45, 43]; // E walking bass, one note per beat
  return bars(2, (b, s) => {
    const n: Note[] = [];
    if (s % 4 === 0) n.push(note('bass', 0.55, 3, midi(walk[(s / 4 + b * 4) % walk.length])));
    if ([0, 4, 6, 8, 12, 14].includes(s)) n.push(note('ride', 0.7));
    if (s === 0 || s === 10) n.push(note('kick', 0.7));
    if (s === 7 || s === 15) n.push(note('snare', 0.25));
    if (s === 4 || s === 12) n.push(note('hat', 0.5));
    if (s === 2 || s === 11) n.push(note('arp', 0.08, 2, midi(64 + (b ? 5 : 0))));
    return n;
  });
}

const RAP_FALLBACK: Station = { name: 'Throop Rap Radio', bpm: 88, pattern: boomBapPattern() };

/** Synth fallback per library station (used for every empty slot). */
export const GENRE_STATIONS: Record<LibraryStationId, Station> = {
  pop: { name: 'Bed-Stuy Pop FM', bpm: 118, pattern: popPattern() },
  eighties: { name: 'Flashback 80s', bpm: 108, pattern: eightiesPattern() },
  rap: RAP_FALLBACK,
  house: { name: 'Garvey House & Dub', bpm: 124, pattern: housePattern() },
  trap: { name: 'Marcy Trap & Plug 808', bpm: 140, pattern: trapPattern() },
  psych: { name: 'Hazy Tompkins Weird Radio', bpm: 84, pattern: psychPattern() },
  folky: { name: 'Lewis Ave Echo-Dub Folk', bpm: 96, pattern: folkyPattern() },
  jazzrock: { name: 'Nostrand Jazz-Rock Gets Lit', bpm: 132, pattern: jazzRockPattern() },
};

/* ---------- the SoundCloud dial ----------
 * Eight music stations, every one a SoundCloud-mix station fed by the shared ra-nyc pool (src/audio/sc/RaFeed.ts).
 * A set belongs to a station when its title or DJ name matches one of the station's keyword patterns
 * (case-insensitive). Radio SC has no filter: any set. When SoundCloud cannot load, the station says so; nothing is synthesized. */

export type ScStationId = 'bkhouse' | 'dublab' | 'stoop' | 'boogie' | 'weird' | 'yard' | 'flashback' | 'sc';

export interface ScStationDef {
  id: ScStationId;
  /** Name on the HUD and in the Radio library. */
  name: string;
  /** Dial text used in announcer lines, e.g. "ninety point nine". */
  freq: string;
  genre: string;
  tagline: string;
  /** Informational keyword list (docs, Radio library). Matching uses `patterns`. */
  keywords: readonly string[];
  /** Case-insensitive patterns matched against "set title + DJ name". Empty = every set. */
  patterns: readonly RegExp[];
  kind: RadioSourceKind;
  /** SoundCloud account / playlist URLs played through the widget. */
  sources: readonly string[];
  /** True when the shared RA NYC pool feeds the station. */
  usesPool: boolean;
  site: string;
}

/** Whole-word-ish match so "rap" does not hit "rapture". */
const kw = (alts: string): RegExp => new RegExp(`(?:^|[^a-z0-9])(?:${alts})(?:$|[^a-z0-9])`, 'i');

/** Dial text for the announcers, per SoundCloud station id. */
const SC_FREQ: Record<ScStationId, string> = {
  bkhouse: 'ninety point nine', dublab: 'ninety one point seven', stoop: 'ninety three point five', boogie: 'ninety five point three',
  weird: 'ninety seven point one', yard: 'ninety eight point nine', flashback: 'eighty-eight point eight', sc: 'one hundred point one',
};

/** The eight SoundCloud stations are the catalog's sc-account / ra-pool entries (src/audio/stations.ts), in dial order.
 * Only the RA station draws on the RA NYC pool (keyword filter off: it plays any set); the others play their account through the widget. */
/** Keyword hints per station id (used to filter the RA NYC pool when a station draws on it). */
const SC_HINTS: Record<ScStationId, { keywords: readonly string[]; patterns: readonly RegExp[] }> = {
  bkhouse: { keywords: ['house', 'garage', 'deep', 'soulful', 'chicago', 'jackin'], patterns: [kw('house|garage|deep|soulful|chicago|jackin|2[- ]?step')] },
  dublab: { keywords: ['dub', 'techno', 'dubstep', 'bass', 'riddim'], patterns: [kw('dub|techno|dubstep|bass|minimal|industrial')] },
  stoop: { keywords: ['hip hop', 'rap', 'trap', 'boom bap', 'drill', 'grime', 'r&b'], patterns: [kw('hip[- ]?hop|rap|trap|boom[- ]?bap|drill|grime|cypher|r&b|rnb')] },
  boogie: { keywords: ['disco', 'boogie', 'funk', 'soul', 'italo', 'groove'], patterns: [kw('disco|boogie|funk|soul|italo|groove|nu[- ]?disco')] },
  weird: { keywords: ['psych', 'jazz', 'experimental', 'ambient', 'avant', 'krautrock', 'leftfield'], patterns: [kw('psych(?:edelic)?|jazz|experimental|ambient|avant|noise|krautrock|leftfield|improv|weird|dream|idm')] },
  yard: { keywords: ['reggae', 'dancehall', 'afrobeats', 'soca', 'amapiano', 'riddim'], patterns: [kw('reggae|dancehall|afro(?:beats?)?|soca|amapiano|kuduro|bashment|zouk|ragga|calypso|riddim|caribbean')] },
  flashback: { keywords: ['80s', 'eighties', 'pop', 'new wave', 'synthpop', 'retro'], patterns: [kw('80\'?s|198\\d|eighties|pop|new[- ]?wave|synth[- ]?pop|retro|freestyle|hi[- ]?nrg')] },
  sc: { keywords: [], patterns: [] },
};

const SC_ORDER = ['bkhouse', 'dublab', 'stoop', 'boogie', 'weird', 'yard', 'flashback', 'sc'];
export const SC_STATIONS: readonly ScStationDef[] = CATALOG.filter((e) => e.kind === 'sc-account' || e.kind === 'ra-pool' || e.kind === 'sc-playlist').map((e): ScStationDef => ({
  id: e.id as ScStationId,
  name: e.name,
  freq: SC_FREQ[e.id as ScStationId],
  genre: e.genre,
  tagline: e.about,
  keywords: SC_HINTS[e.id as ScStationId].keywords,
  patterns: SC_HINTS[e.id as ScStationId].patterns,
  kind: e.kind,
  sources: e.scUrls ?? [],
  usesPool: e.kind === 'ra-pool',
  site: e.site,
})).sort((a, b) => SC_ORDER.indexOf(a.id) - SC_ORDER.indexOf(b.id));

export function scStationDef(id: string): ScStationDef | undefined {
  return SC_STATIONS.find((s) => s.id === id);
}

/** True when a pool set belongs on the station (title or DJ name matches a keyword; always true for Radio SC). */
export function stationAccepts(def: ScStationDef, s: { title: string; dj: string }): boolean {
  if (def.patterns.length === 0) return true;
  const t = `${s.title} ${s.dj}`;
  return def.patterns.some((p) => p.test(t));
}
