import { describe, it, expect } from 'vitest';
import { STATIONS, patternAt, stepSeconds } from '@/audio/radio';

describe('radio stations', () => {
  it('has exactly the three parody stations by name', () => {
    expect(STATIONS.map((s) => s.name)).toEqual([
      'WBED 88.9 — Brownstone Boom-Bap',
      'Kosciusko Kompa FM',
      'Throop Talk Radio',
    ]);
  });

  it('gives every station a positive bpm and a non-empty pattern', () => {
    for (const s of STATIONS) {
      expect(s.bpm).toBeGreaterThan(0);
      expect(s.pattern.length).toBeGreaterThan(0);
    }
  });

  it('uses the planned tempos: 90 bpm boom-bap, 120 bpm kompa', () => {
    expect(STATIONS[0].bpm).toBe(90);
    expect(STATIONS[1].bpm).toBe(120);
  });

  it('gives the boom-bap station kick, snare, hat and bass', () => {
    const voices = new Set(STATIONS[0].pattern.flat().map((n) => n.voice));
    expect(voices).toContain('kick');
    expect(voices).toContain('snare');
    expect(voices).toContain('hat');
    expect(voices).toContain('bass');
  });

  it('gives talk radio no beat voices, only mumble bursts', () => {
    const voices = new Set(STATIONS[2].pattern.flat().map((n) => n.voice));
    expect(voices.has('mumble')).toBe(true);
    expect(voices.has('kick')).toBe(false);
    expect(voices.has('snare')).toBe(false);
    expect(voices.has('hat')).toBe(false);
  });
});

describe('stepSeconds', () => {
  it('is one sixteenth note at the station tempo', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 10);
    expect(stepSeconds(90)).toBeCloseTo(60 / 90 / 4, 10);
  });
});

describe('patternAt', () => {
  const station = STATIONS[0];

  it('is deterministic for the same station and step', () => {
    expect(patternAt(station, 5)).toEqual(patternAt(station, 5));
  });

  it('cycles with the pattern length', () => {
    const len = station.pattern.length;
    for (let step = 0; step < len; step++) {
      expect(patternAt(station, step + len)).toEqual(patternAt(station, step));
    }
  });

  it('wraps negative steps onto the loop', () => {
    const len = station.pattern.length;
    expect(patternAt(station, -1)).toEqual(patternAt(station, len - 1));
  });

  it('returns a copy, so callers cannot mutate the pattern', () => {
    const notes = patternAt(station, 0);
    notes.length = 0;
    expect(patternAt(station, 0).length).toBeGreaterThan(0);
  });
});
