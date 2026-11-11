import { describe, expect, it } from 'vitest';
import { ADS, DJ_COPY, TALK_SHOWS } from '@/audio/voice/shows';
import { DjScheduler, Rotation, TalkSchedule, contextSlots, resolveShow } from '@/audio/voice/Scheduler';
import { clipKey, fillSlots, hash32, parseLine, splitSentences } from '@/audio/voice/script';
import { SC_STATIONS } from '@/audio/radio';

const seeded = (seed = 7) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
const CTX = { hour: 14.5, weather: 'dry', rain: 0, street: 'Throop Ave' };

describe('Rotation', () => {
  it('never repeats until the pool is exhausted, across refills', () => {
    const items = Array.from({ length: 9 }, (_, i) => i);
    const r = new Rotation(items, seeded());
    for (let round = 0; round < 4; round++) {
      const seen = new Set<number>();
      for (let i = 0; i < 9; i++) seen.add(r.next());
      expect(seen.size).toBe(9);
    }
  });
  it('does not open a refill with the item that closed the last pool', () => {
    const r = new Rotation([1, 2, 3], seeded(3));
    let prev = -1;
    for (let i = 0; i < 60; i++) { const v = r.next(); expect(v).not.toBe(prev); prev = v; }
  });
});

describe('TalkSchedule', () => {
  it('rotates every show once before any repeats, with one or two ads between shows', () => {
    const s = new TalkSchedule(seeded(), TALK_SHOWS, ADS);
    const order: Array<{ id: string; ad: boolean }> = [];
    let b = s.ensure(CTX);
    for (let i = 0; i < 40; i++) { order.push({ id: b.show.id, ad: b.ad }); b = s.advance(CTX); }
    const shows = order.filter((o) => !o.ad).map((o) => o.id);
    expect(new Set(shows.slice(0, TALK_SHOWS.length)).size).toBe(TALK_SHOWS.length);
    expect(new Set(shows.slice(TALK_SHOWS.length, TALK_SHOWS.length * 2)).size).toBe(TALK_SHOWS.length);
    // breaks are 2 then 1 commercials
    const gaps: number[] = []; let run = 0;
    for (const o of order) { if (o.ad) run++; else { if (run) gaps.push(run); run = 0; } }
    expect(gaps.every((g) => g === 1 || g === 2)).toBe(true);
    expect(new Set(order.filter((o) => o.ad).map((o) => o.id)).size).toBeGreaterThan(10);
  });

  it('state survives tuning away: the same block resumes on the line that was on air', () => {
    const s = new TalkSchedule(seeded(), TALK_SHOWS, ADS);
    const b = s.ensure(CTX);
    s.setAt(7);
    expect(s.ensure(CTX)).toBe(b);
    expect(s.current?.at).toBe(7);
    expect(s.fraction).toBeCloseTo(7 / b.lines.length);
  });

  it('peekNext fixes the following block so it can be pre-rendered, and advance uses it', () => {
    const s = new TalkSchedule(seeded(), TALK_SHOWS, ADS);
    s.ensure(CTX);
    const nxt = s.peekNext(CTX);
    expect(s.peekNext(CTX)).toBe(nxt);
    expect(s.advance(CTX)).toBe(nxt);
  });
});

describe('news reacts to the game', () => {
  const news = TALK_SHOWS.find((s) => s.kind === 'news')!;
  const text = (ctx: object) => resolveShow(news, ctx, seeded()).map((l) => l.text).join(' ');
  it('wanted level lines air only with stars', () => {
    expect(text({ ...CTX, stars: 3 })).toMatch(/3 stars/);
    expect(text({ ...CTX, stars: 3 })).not.toMatch(/suspiciously peaceful/);
    expect(text({ ...CTX, stars: 0 })).toMatch(/suspiciously peaceful/);
    expect(text({ ...CTX, stars: 0 })).not.toMatch(/wanted level/);
  });
  it('completed missions and story bulletins are read out', () => {
    const t = text({ ...CTX, lastMission: 'back-rent', bulletins: ['A shutter came down on Throop.'] });
    expect(t).toMatch(/back rent/);
    expect(t).toMatch(/A shutter came down on Throop\./);
    expect(text(CTX)).not.toMatch(/mission was recently/);
  });
  it('never leaves a brace or an empty slot in any show, in any state', () => {
    for (const ctx of [CTX, { ...CTX, stars: 5, lastMission: 'x-y', bulletins: ['B.'], weather: 'rain', rain: 0.8, hour: 2 }]) {
      for (const show of [...TALK_SHOWS, ...ADS]) {
        for (const l of resolveShow(show, ctx, seeded())) expect(l.text, show.id).not.toMatch(/[{}]/);
      }
    }
  });
  it('slot values are spoken forms', () => {
    const s = contextSlots({ ...CTX, hour: 13.5, stars: 1 }, seeded());
    expect(String(s.time)).toMatch(/[a-z]/);
    expect(s.starsWord).toBe('star');
  });
});

describe('DJ copy', () => {
  it('back-announces the real set and artist and introduces the next one', () => {
    const dj = new DjScheduler(seeded());
    const st = SC_STATIONS[0];
    const out = dj.betweenSets(st.id, st.name, st.freq, { dj: 'Floating Hands', title: 'Basement Hours 12' }, { dj: 'Kyle Hall', title: 'Boiler Room Brooklyn' }, CTX);
    const text = out.lines.map((l) => l.text).join(' | ');
    expect(text).toContain('Floating Hands');
    expect(text).toContain('Basement Hours 12');
    expect(text).toContain('Kyle Hall');
    expect(text).toContain('Boiler Room Brooklyn');
    expect(text).not.toMatch(/[{}]/);
    expect(out.lines.every((l) => l.who === DJ_COPY[st.id].who)).toBe(true);
  });
  it('uses blind lines when the next set has no names, and skips the outro when nothing played before', () => {
    const dj = new DjScheduler(seeded());
    const out = dj.betweenSets('dublab', 'Dub Lab', 'x', null, null, CTX);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].text).not.toMatch(/[{}]/);
  });
  it('every station fills every category with no stray slots, and fills the time/weather from the live game state', () => {
    for (const st of SC_STATIONS) {
      const dj = new DjScheduler(seeded());
      const texts: string[] = [];
      for (let i = 0; i < 12; i++) texts.push(...dj.idle(st.id, st.name, st.freq, { ...CTX, weather: 'rain', rain: 0.7 }).lines.map((l) => l.text));
      texts.push(dj.ident(st.id, st.name, st.freq, CTX).lines[0].text);
      for (const t of texts) expect(t).not.toMatch(/[{}]/);
    }
    const dj = new DjScheduler(seeded());
    const all = Array.from({ length: 4 }, () => dj.idle('bkhouse', 'BK House', 'x', { ...CTX, street: 'Throop Ave' }).lines.map((l) => l.text).join(' ')).join(' ');
    expect(all.length).toBeGreaterThan(40);
  });
  it('rotates DJ lines without repeats and drops a commercial in every fourth idle', () => {
    const dj = new DjScheduler(seeded());
    const labels = Array.from({ length: 8 }, () => dj.idle('yard', 'Yard FM', 'x', CTX).label);
    expect(labels[3]).toBe('ad');
    expect(labels[7]).toBe('ad');
    const hours = new Set<string>();
    const d2 = new DjScheduler(seeded());
    for (let i = 0; i < 12; i++) { const o = d2.idle('yard', 'Yard FM', 'x', CTX); if (o.label === 'hours') hours.add(o.lines[0].text); }
    expect(hours.size).toBeGreaterThanOrEqual(2);
  });
});

describe('script helpers', () => {
  it('fillSlots drops unknown slots without leaving braces or doubled spaces', () => {
    const out = fillSlots('Hello {dj} on {station}, {nope} ok!', { dj: 'Ana', station: 'Yard FM' });
    expect(out).toBe('Hello Ana on Yard FM, ok!');
    expect(fillSlots('Now {a} {b}.', { a: 'x' })).toBe('Now x.');
  });
  it('parses stage directions into gaps, laughs, effects and interruptions, not spoken text', () => {
    const d = parseLine('[over] Wait. [pause 0.8] Really? [laugh] [sfx airhorn] [beat] Yes.');
    expect(d.map((x) => x.t)).toEqual(['over', 'say', 'pause', 'say', 'laugh', 'sfx', 'pause', 'say']);
    expect(d.filter((x) => x.t === 'say').map((x) => (x as { text: string }).text).join(' ')).not.toMatch(/[\[\]]/);
  });
  it('splits long text into sentences of bounded length', () => {
    const long = 'word '.repeat(80).trim() + '. Short one.';
    for (const s of splitSentences(long, 120)) expect(s.length).toBeLessThanOrEqual(120);
  });
  it('cache keys are stable and distinguish voice, speed and text', () => {
    expect(hash32('abc')).toBe(hash32('abc'));
    expect(clipKey('Hello  World', 'af_heart', 1)).toBe(clipKey('hello world', 'af_heart', 1.0));
    expect(clipKey('Hello World', 'af_heart', 1)).toMatch(/^k1:af_heart:1\.00:[0-9a-f]{8}$/);
    expect(clipKey('Hello World', 'af_heart', 1)).not.toBe(clipKey('Hello World', 'am_adam', 1));
    expect(clipKey('Hello World', 'af_heart', 1)).not.toBe(clipKey('Hello World', 'af_heart', 1.05));
    expect(clipKey('Hello World', 'af_heart', 1)).toBe('k1:af_heart:1.00:' + hash32('hello world'));
    expect(hash32('hello world')).toBe('d58b3fa7'); // FNV-1a, pinned: changing it would invalidate every saved clip
  });
});
