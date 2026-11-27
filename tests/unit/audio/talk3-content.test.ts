/**
 * TALK3: content lint for the owner's satire targets (MEMORY.md rule 4 and the 26 to 27 Nov ask), the parody impressions,
 * the Group Chat rotation, WBSY's extra shows and a host for every station.
 */
import { describe, it, expect } from 'vitest';
import gcRaw from '@/audio/talk/script-groupchat-bits.json';
import gcOldRaw from '@/audio/talk/script-groupchat.json';
import wbRaw from '@/audio/voice/shows/extra-shows.json';
import { BitRotation, bitsFromFlat, groupChatRotation, parseBitFile } from '@/audio/talk/rotation';
import { parseScript, totalSeconds } from '@/audio/talk/script';
import { TalkPlayer, type TalkEnv } from '@/audio/talk/TalkPlayer';
import { parseExtraShows } from '@/audio/voice/shows/extra';
import { ADS, TALK_SHOWS, DJ_COPY } from '@/audio/voice/shows';
import { CAST_MAP } from '@/audio/voice/cast';
import { findBlocked, lineSeconds, slotsIn, spokenText } from '@/audio/voice/script';
import { KOKORO_VOICES } from '@/audio/voice/voices';
import { TalkSchedule } from '@/audio/voice/Scheduler';
import { CATALOG } from '@/audio/stations';
import { PERSONAS } from '@/audio/announcer/personas';
import { SCRIPTS } from '@/audio/announcer/scripts';
import { STATION_HOSTS, LIVE_HOST_MIN_GAP_S, stationHost } from '@/audio/announcer/stationHosts';
import { LiveHost } from '@/audio/announcer/LiveHost';

const gc = parseBitFile(gcRaw);
const gcOld = parseScript(gcOldRaw);
const wb = parseExtraShows(wbRaw);
const wbCast = new Map([...CAST_MAP, ...wb.cast.map((c) => [c.id, c] as const)]);

function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Real people the owner named (and the director he asked for), with the words that name them. */
const PEOPLE: Record<string, RegExp> = {
  musk: /\b(elon|musk)\b/i, putin: /\bputin\b/i, altman: /\baltman\b/i, kanye: /\b(kanye|ye)\b/i, sheen: /\bcharlie sheen\b|\bsheen\b/i,
  buffett: /\bbuffett\b/i, herzog: /\bherzog\b/i, trump: /\btrump\b/i, mamdani: /\bmamdani\b/i,
};
const COMPANIES: Record<string, RegExp> = {
  apple: /\bapple\b/i, google: /\bgoogle\b/i, openai: /\bopen a i\b/i, tesla: /\btesla\b|\bcybertruck\b/i, marvel: /\bmarvel\b/i,
  instagram: /\binstagram\b/i, facebook: /\bfacebook\b/i, twitter: /\btwitter\b/i, whatsapp: /\bwhatsapp\b/i,
};
const ANY_REAL = new RegExp([...Object.values(PEOPLE), ...Object.values(COMPANIES)].map((r) => r.source).join('|'), 'i');
/** No words put in a real mouth: a real name followed within a few words by a reporting verb. */
const REPORTING = /\b(said|says|saying|told|tells|tweeted|tweets|posted|announced|announces|claimed|claims|admitted|admits|confirmed|stated|wrote|revealed|insists|insisted|quoted|according to)\b/i;
/** Subjects kept away from real people (rule 4). */
const EXCLUDED = /\b(health|sick|ill|illness|disease|hospital|rehab|addict\w*|drugs?|drunk|alcohol\w*|sober|mental\w*|crazy|insane|breakdown|bipolar|diagnos\w*|wife|husband|divorce\w*|girlfriend|boyfriend|sons?|daughters?|kids?|child|children|bab(y|ies)|family|pregnan\w*|gay|lesbian|sexual\w*|sex|religio\w*|church|jewish|jews?|muslim|christian|god|race|racist|ethnic\w*|affair|died|death|dead|arrest\w*|prison|jail|crime|criminal)\b/i;
const SLOGANS = ['think different', 'just do it', "don't be evil", 'dont be evil', "i'm lovin it", 'im lovin it', 'happiest place on earth', 'because you are worth it', 'the best a man can get'];
const DRUGS = ['cocaine', 'heroin', 'ketamine', 'mdma', 'molly', 'xanax', 'fentanyl', 'meth', 'weed', 'marijuana'];

interface Line { where: string; speaker: string; text: string; parodyOf?: string; host: boolean }
const gcLines = (segs: readonly { id: string; speaker: string; text: string; parodyOf?: string; kind: string; voice: string }[]): Line[] =>
  segs.map((s) => ({ where: s.id, speaker: s.speaker, text: s.text, parodyOf: s.parodyOf, host: !s.parodyOf && (s.voice === 'host' || s.voice === 'sidekick') }));
const wbLines = (show: { id: string; lines: readonly { who: string; text: string; parodyOf?: string }[] }): Line[] =>
  show.lines.map((l, i) => ({ where: `${show.id}#${i}`, speaker: wbCast.get(l.who)?.name ?? l.who, text: spokenText(l.text), parodyOf: l.parodyOf,
    host: !l.parodyOf && (wbCast.get(l.who)?.kind === 'host') }));

const GC_ALL: Line[] = gc.bits.flatMap((b) => gcLines(b.segments));
const WB_ALL: Line[] = [...wb.shows, ...wb.ads].flatMap(wbLines);
const NEW_ALL = [...GC_ALL, ...WB_ALL];

/** The owner's list (22 Nov and 26 to 27 Nov) and TALK3's eight running news themes, as text patterns. */
const COVERAGE: Record<string, RegExp[]> = {
  'Elon Musk': [PEOPLE.musk], 'Vladimir Putin': [PEOPLE.putin], 'Sam Altman': [PEOPLE.altman], 'Kanye West': [PEOPLE.kanye],
  'Charlie Sheen': [PEOPLE.sheen], 'Warren Buffett': [PEOPLE.buffett], Apple: [COMPANIES.apple], Google: [COMPANIES.google],
  OpenAI: [COMPANIES.openai], Tesla: [COMPANIES.tesla], Marvel: [COMPANIES.marvel], vegans: [/\bvegans?\b/i], hipsters: [/\bhipsters?\b/i],
  'Gen Z': [/\bgen z\b/i], 'Gen X': [/\bgen x\b/i], 'men and women': [/\bmen\b/i, /\bwomen\b/i], Instagram: [COMPANIES.instagram],
  Facebook: [COMPANIES.facebook], Twitter: [COMPANIES.twitter], WhatsApp: [COMPANIES.whatsapp], 'Macs vs PCs': [/\bmacs?\b/i, /\bpcs?\b/i],
  'iPhones and Android': [/\biphones?\b/i, /\bandroids?\b/i],
  AI: [/\ba i\b/i], Trump: [/\b(trump|president)\b/i], Mamdani: [/\b(mamdani|mayor)\b/i], 'stocks and crypto': [/\bstocks?\b|\bmarkets?\b/i, /\b(crypto|coin)\b/i],
  subway: [/\b(subway|train)\b/i], 'parodied landmarks': [/\blady verdigris\b/i], weather: [/\bweather\b/i], dating: [/\bdat(e|ing)\b/i],
  techno: [/\btechno\b/i], house: [/\bhouse (music|people|scene)\b|\bhug frequency\b|\bsunbeam\b/i], underground: [/\bunderground\b|\bwarehouse\b|\bafter the after\b/i],
  'rent and broker fees': [/\b(rent|broker|landlords?)\b/i], 'congestion pricing and the fare': [/\bcongestion\b|costs? money to drive|driving into/i, /\bfare\b/i],
  'delivery apps and e-bikes': [/\bdelivery\b/i], 'streaming prices and password sharing': [/\bstreaming\b/i, /\bpassword\b/i],
  'airline fees': [/\b(airlines?|flew|seat)\b/i], 'ticket fees and resale': [/\btickets?\b/i, /\b(resale|fee)\b/i], 'tipping screens': [/\btip(ping)?\b/i],
  'return to office': [/\breturn to the office\b|\bback to the office\b|\breturn\b.*\boffice\b/i],
};

function covered(text: string, pats: RegExp[]): boolean { return pats.every((p) => p.test(text)); }

describe('TALK3 content: who speaks', () => {
  it('every Group Chat speaker is invented: no real name in any speaker label', () => {
    for (const l of GC_ALL) if (!l.parodyOf) expect(ANY_REAL.test(l.speaker), `${l.where} speaker ${l.speaker}`).toBe(false);
  });

  it('every WBSY line is spoken by a cast member; new cast are invented and valid', () => {
    for (const show of [...wb.shows, ...wb.ads]) for (const l of show.lines) expect(wbCast.has(l.who), `${show.id} ${l.who}`).toBe(true);
    for (const c of wb.cast) {
      expect(ANY_REAL.test(c.name), c.name).toBe(false);
      expect(KOKORO_VOICES).toContain(c.voice);
      expect(c.speed).toBeGreaterThan(0.7); expect(c.speed).toBeLessThan(1.3);
      expect(['host', 'sidekick', 'caller', 'announcer']).toContain(c.fallback.role);
      expect(CAST_MAP.has(c.id), `${c.id} clashes with the bundled cast`).toBe(false);
    }
  });
});

describe('TALK3 content: the satire rules (rule 4)', () => {
  it('no line puts words in a real person\'s or company\'s mouth', () => {
    for (const l of NEW_ALL) {
      const t = l.text.toLowerCase();
      expect(l.text, `${l.where} uses a quotation mark`).not.toMatch(/["“”]/);
      for (const r of [...Object.values(PEOPLE), ...Object.values(COMPANIES)]) {
        const m = new RegExp(r.source, 'gi');
        for (const hit of t.matchAll(m)) {
          const after = t.slice((hit.index ?? 0) + hit[0].length).split(/\s+/).slice(0, 6).join(' ');
          expect(REPORTING.test(after), `${l.where}: "${hit[0]} ${after}"`).toBe(false);
        }
      }
    }
  });

  it('keeps health, addiction, mind, family, sexuality, religion, ethnicity and crime away from every real person', () => {
    for (const l of NEW_ALL) {
      const person = Object.entries(PEOPLE).find(([, r]) => r.test(l.text));
      if (!person && !l.parodyOf) continue;
      const m = EXCLUDED.exec(l.text);
      expect(m, `${l.where} (${person?.[0] ?? l.parodyOf}): "${m?.[0]}"`).toBeNull();
    }
  });

  it('no slurs, drug names or real slogans; written for the ear (no digits or symbols, short lines)', () => {
    for (const l of NEW_ALL) {
      const t = l.text.replace(/\{[a-zA-Z]+\}/g, 'x');
      expect(findBlocked(t), l.where).toEqual([]);
      const low = ` ${t.toLowerCase().replace(/[^a-z' ]/g, ' ')} `;
      for (const w of [...DRUGS, ...SLOGANS]) expect(low.includes(` ${w} `), `${l.where}: ${w}`).toBe(false);
      expect(t, `${l.where} has a symbol the voice would read out`).not.toMatch(/[0-9$%&@#*/\\<>=+_^~|[\]]/);
      expect(t.split(/\s+/).length, l.where).toBeLessThanOrEqual(60);
    }
  });

  it('Group Chat lines carry no stage directions; WBSY uses only its own directions and known slots', () => {
    for (const b of gc.bits) for (const s of b.segments) expect(s.text, s.id).not.toMatch(/[[\]{}()]/);
    const known = new Set(['time', 'street', 'weather', 'daypart', 'hood']);
    for (const show of [...wb.shows, ...wb.ads]) for (const l of show.lines) {
      for (const m of l.text.matchAll(/\[([a-z]+)/gi)) expect(['pause', 'beat', 'breath', 'punch', 'em', 'laugh', 'over', 'sfx']).toContain(m[1]);
      for (const s of slotsIn(l.text)) expect(known.has(s), `${show.id} {${s}}`).toBe(true);
    }
  });
});

describe('TALK3 content: parody impressions', () => {
  const groups: Array<{ id: string; lines: Line[] }> = [
    ...gc.bits.map((b) => ({ id: b.id, lines: gcLines(b.segments) })),
    ...[...wb.shows, ...wb.ads].map((s) => ({ id: s.id, lines: wbLines(s) })),
  ];

  it('at most five impression characters across the stations, each tagged parodyOf', () => {
    const who = new Set(NEW_ALL.filter((l) => l.parodyOf).map((l) => `${l.speaker}~${l.parodyOf}`));
    expect(who.size).toBeGreaterThanOrEqual(1);
    expect(who.size).toBeLessThanOrEqual(5);
    expect([...who].some((w) => /herzog/i.test(w)), 'the director impression the owner asked for').toBe(true);
  });

  it('a segment with an impression is framed by a host as an impression at its start and at its end', () => {
    for (const g of groups) {
      const parody = [...new Set(g.lines.filter((l) => l.parodyOf).map((l) => l.parodyOf!))];
      for (const real of parody) {
        const surname = real.split(/\s+/).pop()!.toLowerCase();
        const frames = (ls: Line[]) => ls.some((l) => l.host && /\bimpression\b/i.test(l.text) && l.text.toLowerCase().includes(surname) && /not the real one/i.test(l.text));
        expect(frames(g.lines.slice(0, 3)), `${g.id}: framing at the start`).toBe(true);
        expect(frames(g.lines.slice(-2)), `${g.id}: framing at the end`).toBe(true);
      }
    }
  });

  it('a parody line names no date and no real speech', () => {
    for (const l of NEW_ALL.filter((x) => x.parodyOf)) {
      expect(l.text, l.where).not.toMatch(/["“”]/);
      expect(l.text, l.where).not.toMatch(/\b(nineteen|twenty|two thousand|january|february|march|april|may|june|july|august|september|october|november|december|yesterday)\b/i);
      expect(REPORTING.test(l.text), l.where).toBe(false);
      expect(ANY_REAL.test(l.speaker), `${l.where}: the speaker label is the performer, not the real name`).toBe(false);
    }
  });
});

describe('TALK3 content: rotation size, forms and coverage', () => {
  it('the Group Chat has 8+ new bits of 8+ different forms, each two to four minutes', () => {
    expect(gc.bits.length).toBeGreaterThanOrEqual(8);
    expect(new Set(gc.bits.map((b) => b.form)).size).toBeGreaterThanOrEqual(8);
    for (const b of gc.bits) {
      const sec = totalSeconds(b.segments);
      expect(sec, `${b.id} ${Math.round(sec)} s`).toBeGreaterThanOrEqual(120);
      expect(sec, `${b.id} ${Math.round(sec)} s`).toBeLessThanOrEqual(240);
    }
    expect(gc.idents.length).toBeGreaterThanOrEqual(10);
    expect(gc.links.length).toBeGreaterThanOrEqual(10);
  });

  it('WBSY has 8+ new shows of 8+ different forms, each two to four minutes, and 6+ new ads', () => {
    const forms = (wbRaw as { shows: Array<{ form: string }> }).shows.map((s) => s.form);
    expect(wb.shows.length).toBeGreaterThanOrEqual(8);
    expect(new Set(forms).size).toBeGreaterThanOrEqual(8);
    for (const s of wb.shows) {
      const sec = s.lines.reduce((n, l) => n + lineSeconds(l.text, wbCast.get(l.who)?.speed ?? 1), 0);
      expect(sec, `${s.id} ${Math.round(sec)} s`).toBeGreaterThanOrEqual(120);
      expect(sec, `${s.id} ${Math.round(sec)} s`).toBeLessThanOrEqual(240);
    }
    expect(wb.ads.filter((a) => !a.id.startsWith('wbsy-break')).length).toBeGreaterThanOrEqual(6);
    const ids = [...TALK_SHOWS, ...ADS, ...wb.shows, ...wb.ads].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each talk station covers every target and topic the owner named, and the eight news themes', () => {
    const gcText = [...gcOld.map((s) => s.text), ...GC_ALL.map((l) => l.text)].join(' \n ');
    const wbText = [...TALK_SHOWS, ...ADS, ...wb.shows, ...wb.ads].flatMap((s) => s.lines.map((l) => spokenText(l.text))).join(' \n ');
    for (const [target, pats] of Object.entries(COVERAGE)) {
      expect(covered(gcText, pats), `Group Chat misses ${target}`).toBe(true);
      expect(covered(wbText, pats), `WBSY misses ${target}`).toBe(true);
    }
  });
});

describe('TALK3: the Group Chat rotation', () => {
  it('cuts the old script into its 22 bits, opener first and sign-off last, losing no line', () => {
    const bits = bitsFromFlat(gcOld);
    expect(bits.length).toBe(22);
    expect(bits[0].pin).toBe('first');
    expect(bits[bits.length - 1].pin).toBe('last');
    expect(bits.reduce((n, b) => n + b.segments.length, 0)).toBe(gcOld.length);
  });

  it('plays every bit once per pass, never repeats a bit before the pool is used up, and never opens a pass with the last one', () => {
    const rot = groupChatRotation(gcOld, gc, seeded(3));
    const all = rot.bits.map((b) => b.id);
    let prevLast = '';
    for (let p = 0; p < 12; p++) {
      const pass = rot.nextPass();
      expect(rot.order.length).toBe(all.length);
      expect(new Set(rot.order).size).toBe(all.length);
      expect(rot.order[0]).toMatch(/-morn$/);
      expect(rot.order[rot.order.length - 1]).toMatch(/-close$/);
      expect(rot.order[1]).not.toBe(prevLast);
      prevLast = rot.order[rot.order.length - 2];
      const ids = pass.map((s) => s.id);
      expect(new Set(ids).size, 'segment ids unique in a pass').toBe(ids.length);
      // every bit is preceded by a station ident (ours, or the bit's own opening jingle)
      const starts = new Map(rot.bits.map((b) => [b.segments[0].id, b] as const));
      pass.forEach((sg, i) => { if (starts.has(sg.id)) expect(sg.kind === 'jingle' || pass[i - 1]?.kind === 'jingle', `${sg.id} has no ident before it`).toBe(true); });
    }
  });

  it('a pure new-bits rotation never opens a pass with the bit that closed the previous one', () => {
    const rot = new BitRotation(gc.bits, gc.idents, gc.links, seeded(11));
    let last = '';
    for (let p = 0; p < 30; p++) { rot.nextPass(); expect(rot.order[0]).not.toBe(last); last = rot.order[rot.order.length - 1]; }
  });

  it('TalkPlayer reshuffles at the end of a pass and a first tune-in lands inside a bit', () => {
    const rot = new BitRotation(gc.bits.slice(0, 3), ['Ident.'], [], seeded(5));
    const env: TalkEnv = { speech: null, makeUtterance: () => { throw new Error('no'); }, audio: { sting: () => 0.5, setBed: () => undefined, volume: () => 1 } };
    const p = new TalkPlayer(env, [], { random: () => 0.5 });
    p.setScript(rot.nextPass(), () => rot.nextPass());
    p.setActive(true);
    expect(p.progress.segment).toBeGreaterThan(0);
    const first = rot.passes;
    for (let i = 0; i < 20000 && rot.passes === first; i++) p.update(0.5);
    expect(rot.passes).toBe(first + 1);
    expect(p.progress.segment).toBeLessThan(3);
  });

  it('WBSY: added shows join the bag without early repeats, and a first tune-in can start part-way into a show', () => {
    const s = new TalkSchedule(seeded(9), TALK_SHOWS, ADS, { midStart: true });
    const b = s.ensure({ hour: 9 });
    s.addShows(wb.shows, wb.ads);
    expect(b.at).toBeGreaterThanOrEqual(0);
    const seen: string[] = [b.show.id];
    let x = b;
    for (let i = 0; i < 80 && seen.length < TALK_SHOWS.length + wb.shows.length; i++) { x = s.advance({ hour: 9 }); if (!x.ad) seen.push(x.show.id); }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(TALK_SHOWS.length + wb.shows.length);
    const mids = [0.1, 0.4, 0.8].map((r) => { const t = new TalkSchedule(() => r, TALK_SHOWS, ADS, { midStart: true }); return t.ensure({ hour: 9 }).at; });
    expect(mids.some((a) => a > 0)).toBe(true);
  });
});

describe('TALK3: a host on every station', () => {
  it('every catalog station has a host with a name, two lines of character, a voice role, pitch, rate, 10+ idents and 10+ links', () => {
    for (const e of CATALOG) {
      const sc = PERSONAS.find((p) => p.stationId === e.id);
      if (sc) {
        const s = SCRIPTS[sc.stationId];
        const dj = DJ_COPY[sc.stationId];
        expect(sc.personality.length, e.id).toBeGreaterThanOrEqual(2);
        expect(s.idents.length + dj.idents.length, `${e.id} idents`).toBeGreaterThanOrEqual(10);
        expect(s.hours.length + s.blind.length + dj.hours.length + dj.traffic.length + dj.shouts.length, `${e.id} links`).toBeGreaterThanOrEqual(10);
        continue;
      }
      const h = stationHost(e.id);
      expect(h, `${e.id} has no host`).toBeDefined();
      expect(h!.personality.length).toBe(2);
      expect(h!.pitch).toBeGreaterThan(0.5); expect(h!.rate).toBeGreaterThan(0.7);
      expect(ANY_REAL.test(h!.name), h!.name).toBe(false);
      if (h!.speaks === 'own-show') {
        if (e.id === 'groupchat') { expect(gc.idents.length).toBeGreaterThanOrEqual(10); expect(gc.links.length).toBeGreaterThanOrEqual(10); }
        else {
          const breaks = wb.ads.filter((a) => a.id.startsWith('wbsy-break'));
          expect(breaks.length, 'WBSY station breaks').toBeGreaterThanOrEqual(10);
        }
        continue;
      }
      expect(e.kind).toBe('live-stream');
      expect(h!.idents.length, `${e.id} idents`).toBeGreaterThanOrEqual(10);
      expect(h!.links.length, `${e.id} links`).toBeGreaterThanOrEqual(10);
      for (const t of [...h!.idents, ...h!.links]) {
        expect(t.length, t).toBeLessThan(160);
        expect(findBlocked(t)).toEqual([]);
        expect(t.replace('{station}', ''), t).not.toMatch(/[{}[\]0-9]/);
      }
    }
    expect(STATION_HOSTS.length).toBe(CATALOG.filter((e) => !PERSONAS.some((p) => p.stationId === e.id)).length);
  });

  const mk = (opts: { busy?: () => boolean } = {}) => {
    const duck: number[] = [];
    const h = new LiveHost({ speech: null, makeUtterance: () => { throw new Error('no'); }, volume: () => 1, setDuck: (l) => duck.push(l), talkBusy: opts.busy ?? (() => false), random: () => 0 });
    return { h, duck };
  };
  const run = (h: LiveHost, s: number) => { for (let t = 0; t < s; t += 0.5) h.update(0.5); };

  it('a live host says one line at tune-in, then nothing for ten minutes, then a link on the timer', () => {
    const { h } = mk();
    h.tuneIn('beat', '181.FM The Beat');
    run(h, 5);
    expect(h.history.length).toBe(1);
    expect(h.history[0].kind).toBe('ident');
    expect(h.history[0].text).toContain('181.FM The Beat');
    run(h, LIVE_HOST_MIN_GAP_S - 30);
    expect(h.history.length).toBe(1);
    run(h, 60);
    expect(h.history.length).toBe(2);
    expect(h.history[1].kind).toBe('link');
  });

  it('on a stream with now-playing data the link waits for a song change after the ten minutes', () => {
    const { h } = mk();
    h.tuneIn('kexp', 'KEXP 90.3', true);
    run(h, LIVE_HOST_MIN_GAP_S + 30);
    expect(h.history.length).toBe(1);
    h.songChange();
    run(h, 1);
    expect(h.history.length).toBe(2);
  });

  it('the news station host speaks at tune-in only; nobody talks while a talk show is on', () => {
    const { h } = mk();
    h.tuneIn('wnyc', 'WNYC 93.9 FM');
    run(h, 3 * LIVE_HOST_MIN_GAP_S);
    expect(h.history.length).toBe(1);
    const b = mk({ busy: () => true });
    b.h.tuneIn('u80s', 'SomaFM Underground 80s');
    run(b.h, 2 * LIVE_HOST_MIN_GAP_S);
    expect(b.h.history.length).toBe(0);
  });
});
