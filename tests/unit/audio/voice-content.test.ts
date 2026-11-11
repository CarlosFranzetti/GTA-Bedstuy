import { describe, expect, it } from 'vitest';
import { CAST, CAST_MAP } from '@/audio/voice/cast';
import { ADS, DJ_COPY, TALK_SHOWS } from '@/audio/voice/shows';
import { SC_STATIONS } from '@/audio/radio';
import { findBlocked, findDenied, lineSeconds, lintLines, showVoices, slotsIn } from '@/audio/voice/script';
import { KOKORO_VOICES } from '@/audio/voice/voices';

const KNOWN_SLOTS = new Set(['dj', 'title', 'prevDj', 'prevTitle', 'station', 'freq', 'time', 'weather', 'street', 'hood', 'daypart', 'stars', 'starsWord', 'mission', 'bulletin']);
const showSeconds = (lines: readonly { who: string; text: string }[]) => lines.reduce((n, l) => n + lineSeconds(l.text, CAST_MAP.get(l.who)?.speed ?? 1), 0);

describe('voice content', () => {
  it('has a cast of 12+ with unique ids and valid neural voices, at least 10 distinct', () => {
    expect(CAST.length).toBeGreaterThanOrEqual(12);
    expect(new Set(CAST.map((c) => c.id)).size).toBe(CAST.length);
    for (const c of CAST) {
      expect(KOKORO_VOICES).toContain(c.voice);
      expect(c.speed).toBeGreaterThan(0.7);
      expect(c.speed).toBeLessThan(1.3);
      expect(c.fallback.pitch).toBeGreaterThan(0.5);
      expect(c.catchphrases.length).toBeGreaterThan(0);
      expect(c.persona.length).toBeGreaterThan(20);
    }
    expect(new Set(CAST.map((c) => c.voice)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(CAST.map((c) => c.voice[0] + c.voice[1])).size).toBe(4); // af am bf bm
  });

  it('every show and ad: speakers exist, no real brands or blocked words, short lines, 2+ voices', () => {
    for (const show of [...TALK_SHOWS, ...ADS]) {
      expect(lintLines(show.id, show.lines, CAST_MAP), show.id).toEqual([]);
      expect(showVoices(show).length, show.id).toBeGreaterThanOrEqual(2);
      // ids and titles count too (ids end up in filenames and manifests)
      expect(findDenied(`${show.id.replace(/-/g, ' ')} ${show.title}`), `${show.id} id/title`).toEqual([]);
    }
  });

  it('WBSY Talk has 6+ shows of 3 to 6 minutes (at least 3 min, at most 6) and 20+ ads', () => {
    expect(TALK_SHOWS.length).toBeGreaterThanOrEqual(6);
    const secs = TALK_SHOWS.map((s) => ({ id: s.id, sec: showSeconds(s.lines.filter((l) => !l.when)) }));
    console.log(secs.map((s) => `${s.id}=${Math.round(s.sec)}s`).join(' '));
    for (const s of secs) {
      expect(s.sec, `${s.id} ${Math.round(s.sec)}s`).toBeGreaterThanOrEqual(180);
      expect(s.sec, `${s.id} ${Math.round(s.sec)}s`).toBeLessThanOrEqual(400);
    }
    expect(ADS.length).toBeGreaterThanOrEqual(20);
    for (const a of ADS) expect(showSeconds(a.lines)).toBeLessThan(60);
    expect(new Set([...TALK_SHOWS, ...ADS].map((s) => s.id)).size).toBe(TALK_SHOWS.length + ADS.length);
  });

  it('the shows cover the requested formats', () => {
    const kinds = TALK_SHOWS.map((s) => s.kind);
    for (const k of ['callin', 'realestate', 'board', 'wellness', 'latenight', 'interview', 'news']) expect(kinds).toContain(k);
  });

  it('has one DJ per music station with all copy categories, known slots only, no real names', () => {
    for (const st of SC_STATIONS) {
      const c = DJ_COPY[st.id];
      expect(c, st.id).toBeDefined();
      expect(CAST_MAP.get(c.who)?.kind, st.id).toBe('dj');
      for (const cat of ['idents', 'intros', 'outros', 'blind', 'hours', 'traffic', 'shouts'] as const) {
        expect(c[cat].length, `${st.id}.${cat}`).toBeGreaterThanOrEqual(2);
        for (const t of c[cat]) {
          expect(findDenied(t), t).toEqual([]);
          expect(findBlocked(t), t).toEqual([]);
          expect(t.length).toBeLessThan(200);
          for (const s of slotsIn(t)) expect(KNOWN_SLOTS.has(s), `${st.id}.${cat} {${s}}`).toBe(true);
        }
      }
      for (const t of c.intros) { expect(t).toMatch(/\{dj\}/); expect(t).toMatch(/\{title\}/); }
      for (const t of c.outros) expect(t).toMatch(/\{prev(Dj|Title)\}/);
    }
    expect(new Set(SC_STATIONS.map((s) => DJ_COPY[s.id].who)).size).toBe(9);
  });

  it('the parody deny-list catches real brands and people', () => {
    expect(findDenied('Order from Starbucks today')).toContain('starbucks');
    expect(findDenied('as seen on Fox News')).toContain('fox news');
    expect(findDenied('Oat Barn Concentrate')).toEqual([]);
    expect(findDenied('ad oatly')).toContain('oatly');
    expect(ADS.map((a) => a.id)).not.toContain('ad-oatly');
    expect(findBlocked('a perfectly clean sentence')).toEqual([]);
  });
});
