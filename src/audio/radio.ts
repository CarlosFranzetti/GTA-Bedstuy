/** Parody radio stations: pure pattern data. The AudioSystem turns notes into Web Audio. */

export type Voice = 'kick' | 'snare' | 'hat' | 'shaker' | 'bass' | 'arp' | 'mumble';

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
