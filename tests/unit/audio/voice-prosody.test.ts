import { describe, expect, it } from 'vitest';
import { BREAK_GAP, jitterPause, planLine, planSentence, planSpeech, rngFor, shapeClip, splitPhrases, turnGap, pedRhythmId } from '@/audio/voice/prosody';
import { RHYTHMS, rhythmFor } from '@/audio/voice/rhythm';
import { CAST, CAST_MAP } from '@/audio/voice/cast';
import { expand } from '@/audio/voice/SpeechPlayer';
import { bakeableUnits, planPack, rankOf } from '@/audio/voice/packPlan';
import { ADS, DJ_COPY, TALK_SHOWS } from '@/audio/voice/shows';
import { clipKey, lintLines, parseLine, spokenText } from '@/audio/voice/script';
import { planBarks } from '@/audio/voice/peds/lines';

const SLOTS = { station: 'Flashback 88', freq: 'eighty-eight point one', dj: 'Dee', title: 'A Set', time: 'seven forty', weather: 'steady rain', street: 'Fulton Street', hood: 'Bed-Stuy', prevDj: 'Lou', prevTitle: 'Late' };
const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => (SLOTS as Record<string, string>)[k] ?? '');
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };

/** Every line a speaker has in the shows, ads and DJ copy, as phrase plans. */
function corpus(who: string) {
  const texts: string[] = [];
  for (const s of [...TALK_SHOWS, ...ADS]) for (const l of s.lines) if (l.who === who) texts.push(fill(l.text));
  for (const c of Object.values(DJ_COPY)) if (c.who === who) for (const k of ['idents', 'intros', 'outros', 'hours', 'traffic', 'shouts'] as const) for (const t of c[k]) texts.push(fill(t));
  const speed = CAST_MAP.get(who)!.speed;
  const items = texts.flatMap((t) => planLine(t, who, speed, rhythmFor(who)));
  const gaps: number[] = []; const speeds: number[] = [];
  items.forEach((d, i) => {
    if (d.k === 'say') { speeds.push(d.speed / speed); if (items.slice(i + 1).some((x) => x.k === 'say')) gaps.push(d.gap); } else if (d.k === 'pause') gaps.push(d.s);
  });
  return { gaps, speeds, n: texts.length };
}

describe('phrase splitter', () => {
  it('keeps a short vocative whole and splits at dashes, colons and ellipses', () => {
    expect(splitPhrases('Good morning, Brooklyn.')).toEqual([{ text: 'Good morning, Brooklyn.', brk: 'stop' }]);
    expect(splitPhrases('Wait... what is that smell?').map((p) => p.brk)).toEqual(['ellipsis', 'q']);
    expect(splitPhrases('Nobody asked - not even once - but here we are.').map((p) => p.text)).toEqual(['Nobody asked,', 'not even once,', 'but here we are.']);
    expect(splitPhrases('Buy now: it is free, mostly.').map((p) => p.brk)).toEqual(['dash', 'stop']);
  });
  it('splits commas only between stretches of real length and keeps the comma so the voice carries on', () => {
    const p = splitPhrases('Well, I told him once, I told him twice, and he still parked on the hydrant.');
    expect(p.map((x) => x.text)).toEqual(['Well, I told him once,', 'I told him twice,', 'and he still parked on the hydrant.']);
    expect(p.every((x, i) => i === p.length - 1 || x.text.endsWith(','))).toBe(true);
    expect(splitPhrases('Eggs, milk, bread.')).toHaveLength(1);
  });
  it('breaks a long run with no punctuation before a conjunction near the middle', () => {
    const p = splitPhrases('We open at nine and we close whenever the owner decides that the afternoon has gone on long enough for everybody.');
    expect(p).toHaveLength(2);
    expect(p[0].brk).toBe('sense');
    expect(p.map((x) => x.text).join(' ').replace(/,/g, '')).toBe('We open at nine and we close whenever the owner decides that the afternoon has gone on long enough for everybody.');
  });
  it('never loses or reorders a word', () => {
    for (const s of [...TALK_SHOWS, ...ADS].flatMap((x) => x.lines).slice(0, 200)) {
      for (const sent of parseLine(fill(s.text)).filter((d) => d.t === 'say').map((d) => (d as { text: string }).text)) {
        const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
        expect(norm(splitPhrases(sent).map((p) => p.text).join(' '))).toBe(norm(sent));
      }
    }
  });
});

describe('pause model', () => {
  const r = rhythmFor('lorraine');
  it('is seeded: the same sentence, speaker and profile always give the same plan', () => {
    const a = planSentence('Well, I told him once, I told him twice, and he still parked on the hydrant.', 'lorraine', 0.98, r);
    const b = planSentence('Well, I told him once, I told him twice, and he still parked on the hydrant.', 'lorraine', 0.98, r);
    expect(a).toEqual(b);
    expect(rngFor('x')()).toBe(rngFor('x')());
    expect(rngFor('x')()).not.toBe(rngFor('y')());
  });
  it('longer breaks give longer pauses on average (comma < dash < full stop < ellipsis) with a spread, never dead air', () => {
    const avg = (b: keyof typeof BREAK_GAP, n = 400) => {
      const v: number[] = [];
      for (let i = 0; i < n; i++) { const p = planSentence(b === 'stop' ? `Sentence number ${i} ends here.` : b === 'q' ? `Is number ${i} here?` : `A first stretch of number ${i} runs on${b === 'comma' ? ',' : b === 'dash' ? ' -' : '...'} and then the rest follows now.`, 'x', 1, rhythmFor('x')); v.push(p[0].gap); }
      return v;
    };
    const comma = avg('comma'); const dash = avg('dash'); const stop = avg('stop'); const dots = avg('ellipsis' as never);
    expect(mean(comma)).toBeLessThan(mean(dash));
    expect(mean(dash)).toBeLessThan(mean(stop));
    expect(mean(stop)).toBeLessThan(mean(dots));
    for (const v of [comma, dash, stop, dots]) { expect(sd(v)).toBeGreaterThan(0.01); expect(Math.max(...v)).toBeLessThanOrEqual(1.4); expect(Math.min(...v)).toBeGreaterThanOrEqual(0.03); }
    expect(mean(comma)).toBeGreaterThan(0.1); expect(mean(comma)).toBeLessThan(0.3); // breath-length, not dead air
  });
  it('speeds are quantised, bounded around the cast speed and vary phrase to phrase', () => {
    const speeds = new Set<number>();
    for (let i = 0; i < 60; i++) for (const p of planSentence(`Number ${i}, a thing happened here, and then another thing happened there.`, 'tommy', 1.14, rhythmFor('tommy'))) {
      speeds.add(p.speed);
      expect(p.speed).toBeGreaterThanOrEqual(1.14 * 0.84 - 0.01); expect(p.speed).toBeLessThanOrEqual(1.45 + 1e-9);
      expect(Math.abs(p.speed * 50 - Math.round(p.speed * 50))).toBeLessThan(1e-6);
    }
    expect(speeds.size).toBeGreaterThan(6);
  });
  it('slows the end of a sentence for a speaker who drags it and leans on one phrase', () => {
    const slow = { ...rhythmFor('lou'), finalSlow: 0.3, spread: 0, rush: 0, drag: 0, emphasis: 0 };
    const p = planSentence('A first stretch of words, and the second stretch of words follows.', 'z', 1, slow);
    expect(p[p.length - 1].speed).toBeLessThan(p[0].speed);
    const em = planSentence('That is the point.', 'z', 1, { ...slow, finalSlow: 0 }, { em: true });
    expect(em[0].em).toBe(true); expect(em[0].speed).toBeLessThan(0.9);
  });
  it('turn gaps: shorter after a question, longer after a laugh, sometimes a quick pickup, always the same for the same pair', () => {
    const hot = { ...rhythmFor('gus'), pickup: 1 };
    const cool = { ...rhythmFor('gus'), pickup: 0 };
    const q = (text: string, laugh = false) => turnGap({ text, laugh, same: false }, 'Next line here.', cool);
    expect(q('Is that so?')).toBeLessThan(q('That is so.') + 0.1);
    expect(q('That is so.', true)).toBeGreaterThan(q('That is so.') + 0.2);
    expect(turnGap({ text: 'A', laugh: false, same: false }, 'B', cool)).toBe(turnGap({ text: 'A', laugh: false, same: false }, 'B', cool));
    const picks = Array.from({ length: 40 }, (_, i) => turnGap({ text: `What was that number ${i}?`, laugh: false, same: false }, `It was ${i}.`, hot));
    expect(picks.some((g) => g < 0)).toBe(true);
    expect(Math.min(...picks)).toBeGreaterThanOrEqual(-0.2);
    expect(new Set(picks.map((g) => g.toFixed(2))).size).toBeGreaterThan(10); // varies, not a fixed gap
  });
});

describe('script markup', () => {
  it('knows [breath], [punch], [em]; [beat] stays a pause for old callers; directions are never spoken', () => {
    const d = parseLine('Hold on [breath] I said [em] no money back. [punch] Kidding. [beat] Mostly.');
    expect(d.map((x) => x.t)).toEqual(['say', 'breath', 'say', 'em', 'say', 'punch', 'say', 'pause', 'say']);
    expect(spokenText('Hold on [breath] I said [em] no money back.')).toBe('Hold on I said no money back.');
    expect(lintLines('t', [{ who: 'buck', text: 'Hold on [breath] I said [em] no. [punch] Kidding.' }], CAST_MAP)).toEqual([]);
  });
  it('[punch] puts a beat before the punchline and leans on it; [em] slows the next words', () => {
    const base = planLine('He was right. Kidding.', 'tayo', 1, rhythmFor('tayo'));
    const punch = planLine('He was right. [punch] Kidding.', 'tayo', 1, rhythmFor('tayo'));
    expect(punch.some((i) => i.k === 'pause')).toBe(true);
    const k = (l: ReturnType<typeof planLine>) => l.filter((i) => i.k === 'say').pop() as { speed: number; em: boolean };
    expect(k(punch).em).toBe(true);
    expect(k(punch).speed).toBeLessThan(k(base).speed);
    const pj = jitterPause(0.5, rhythmFor('wren'), 's1'); expect(pj).toBe(jitterPause(0.5, rhythmFor('wren'), 's1'));
  });
});

describe('rhythm profiles', () => {
  it('every cast member has its own rhythm; no two are the same', () => {
    for (const c of CAST) expect(RHYTHMS[c.id], c.id).toBeTruthy();
    const keys = new Set(CAST.map((c) => JSON.stringify(RHYTHMS[c.id])));
    expect(keys.size).toBe(CAST.length);
  });
  it('unlisted ids (new hosts, peds, story) get a stable, distinct derived profile', () => {
    expect(rhythmFor('latin-host-x')).toBe(rhythmFor('latin-host-x'));
    expect(JSON.stringify(rhythmFor('ped:af_nova'))).not.toBe(JSON.stringify(rhythmFor('ped:am_adam')));
  });
  it('a morning-zoo host, a late-night soul DJ, a nervous caller and a deadpan ad reader differ audibly in rhythm', () => {
    const tommy = corpus('tommy'); const lou = corpus('lou'); const dev = corpus('dev'); const noelle = corpus('noelle'); const trent = corpus('trent');
    expect(tommy.gaps.length).toBeGreaterThan(5); expect(lou.gaps.length).toBeGreaterThan(5);
    // pause length: the soul DJ leaves at least twice the room the morning zoo does
    expect(mean(lou.gaps)).toBeGreaterThan(2 * mean(tommy.gaps));
    // tempo variation: the nervous caller lurches, the deadpan reader does not
    expect(sd(dev.speeds)).toBeGreaterThan(2 * sd(noelle.speeds));
    // pause spread: for the same kind of break the nervous caller's pauses are far less even than the ad reader's
    const spread = (id: string) => { const v = Array.from({ length: 300 }, (_, i) => planSentence(`Number ${i} runs on, and then it carries on after that.`, id, 1, rhythmFor(id))[0].gap); return sd(v) / mean(v); };
    expect(spread('dev')).toBeGreaterThan(3 * spread('noelle'));
    // same ad, two readers: Noelle leaves more room than Trent
    expect(mean(noelle.gaps)).toBeGreaterThan(1.3 * mean(trent.gaps));
    // the morning zoo rushes: faster phrases on average than the soul DJ
    expect(mean(tommy.speeds)).toBeGreaterThan(mean(lou.speeds) + 0.05);
  });
});

describe('live and baked paths agree, and a changed clip changes its key', () => {
  const clipsOf = (who: string, text: string) => expand([{ who, text }]).filter((i) => i.k === 'say').map((i) => (i as { text: string; speed: number }));
  it('every phrase SpeechPlayer asks for is in the pack plan', () => {
    const plan = planPack({ stations: Object.values(DJ_COPY).slice(0, 0).map(() => ({ id: 'x', name: 'x', freq: 'x' })) });
    const keys = new Set(plan.map((c) => c.key));
    let checked = 0;
    for (const s of [...TALK_SHOWS, ...ADS]) for (const l of s.lines) {
      if (/\{/.test(l.text)) continue; // open slots are not baked
      const c = CAST_MAP.get(l.who)!;
      for (const p of clipsOf(l.who, l.text)) { expect(keys.has(clipKey(p.text, c.voice, p.speed)), `${s.id}: ${p.text}`).toBe(true); checked++; }
    }
    expect(checked).toBeGreaterThan(200);
  });
  it('em/punch units are planned for the pack the same way', () => {
    const u = bakeableUnits('Hold on. [punch] Kidding. [em] Really truly.');
    expect(u.map((x) => [x.text, x.em])).toEqual([['Hold on.', false], ['Kidding.', true], ['Really truly.', true]]);
  });
  it('clip keys change with the phrase speed, the speaker and the text; ped and story plans use the same phrases as the player', () => {
    const a = planSentence('Hello there, neighbour.', 'tommy', 1.14, rhythmFor('tommy'))[0];
    expect(clipKey(a.text, 'am_fenrir', a.speed)).not.toBe(clipKey(a.text, 'am_fenrir', 1.14)); // the old key (cast speed) is stale
    const b = planSentence('Hello there, neighbour.', 'lou', 1.14, rhythmFor('lou'))[0];
    expect(b.speed === a.speed && b.gap === a.gap).toBe(false);
    const bark = planBarks()[0];
    expect(bark.key).toBe(clipKey(bark.text, bark.voice, bark.speed));
    const again = planSpeech(bark.text, pedRhythmId(bark.voice), planBarks()[0].speed, rhythmFor(pedRhythmId(bark.voice)));
    expect(again.length).toBeGreaterThan(0);
  });
  it('turn gaps and pickups never put a second voice on top of a laugh, and [over] keeps its explicit overlap', () => {
    const items = expand([{ who: 'buck', text: 'That was a good one. [laugh]' }, { who: 'boards', text: 'Sure it was.' }, { who: 'buck', text: '[over] Hey.' }]);
    const says = items.filter((i) => i.k === 'say') as Array<{ lead: number; first: boolean }>;
    expect(says[1].lead).toBeGreaterThan(0.25);
    expect(says[2].lead).toBe(0);
  });
});

describe('clip edges', () => {
  it('trims silence to 30 ms and fades both ends so a join cannot click; trimming twice changes nothing', () => {
    const x = new Float32Array(24000); for (let i = 6000; i < 18000; i++) x[i] = 0.5 * Math.sin(i / 7);
    const f = shapeClip(x, 24000);
    expect(f.length).toBeLessThan(12000 + 2 * 24000 * 0.03 + 5);
    expect(Math.abs(f[0])).toBeLessThan(1e-6); expect(Math.abs(f[f.length - 1])).toBeLessThan(1e-6);
    expect(x[6000]).toBeCloseTo(0.5 * Math.sin(6000 / 7), 6); // the source is not modified
    expect(shapeClip(f, 24000).length).toBe(f.length);
  });
});

describe('bake order', () => {
  it('idents first, then the DJ lines, story and everyday barks, then commercials and talk shows, the shout-out expansions last', () => {
    const stations = [{ id: 'flashback', name: 'Flashback 88', freq: 'eighty-eight point one' }];
    const bark = planBarks().filter((b) => b.prio !== undefined)[0];
    const external = { ...bark, key: 'x', prio: 3 };
    const plan = planPack({ stations, extra: [...planBarks().slice(0, 400), external] });
    const ranks = plan.map(rankOf);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(plan[0].tier).toBe(0);
    expect(Math.max(...plan.filter((c) => c.tier === 0).map(rankOf))).toBeLessThan(Math.min(...plan.filter((c) => c.tier === 1).map(rankOf)));
    const early = plan.filter((c) => c.tier === 5 && rankOf(c) < 4); const ads = plan.filter((c) => c.tier === 2);
    expect(early.length).toBeGreaterThan(0);
    expect(rankOf(early[0])).toBeLessThan(rankOf(ads[0]));
    expect(plan.filter((c) => c.tier === 6).every((c) => rankOf(c) === 8)).toBe(true);
  });
});
