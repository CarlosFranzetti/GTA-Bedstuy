import { describe, it, expect } from 'vitest';
import {
  planDjMentions, DjMentionTracker, DjMentionRunner, seedOf, MIN_SPACING_S, LINE_S, END_MARGIN_S, INTRO_JOIN_WINDOW_S, GRACE_S,
  type DjClock, type DjMention,
} from '@/audio/sc/djMentions';
import { DJ_LINES, djLinePool } from '@/audio/sc/djLines';
import { SC_STATIONS } from '@/audio/radio';
import { Announcer, ANNOUNCER_DJ_DUCK, type AnnouncerEnv } from '@/audio/announcer/Announcer';
import type { SpeechLike, UtteranceLike, VoiceLike } from '@/audio/talk/TalkPlayer';

const SEEDS = Array.from({ length: 200 }, (_, i) => seedOf(`seed-${i}`));
const LENGTHS = [20, 45, 60, 90, 120, 180];
const plan = (lengthMin: number, joinedAtS: number, seed: number) => planDjMentions({ lengthMin, joinedAtS, seed });
const mids = (p: DjMention[]) => p.filter((m) => m.kind === 'mid');

describe('planDjMentions', () => {
  it('joined at the start: exactly one intro and one thanks, in order, for every length and seed', () => {
    for (const len of LENGTHS) for (const seed of SEEDS) {
      const p = plan(len, 0, seed);
      expect(p.filter((m) => m.kind === 'intro').length).toBe(1);
      expect(p.filter((m) => m.kind === 'thanks').length).toBe(1);
      expect(p.filter((m) => m.kind === 'listening').length).toBe(0);
      expect(p[0].kind).toBe('intro');
      expect(p[p.length - 1].kind).toBe('thanks');
      const intro = p[0];
      expect(intro.at).toBeGreaterThanOrEqual(20);
      expect(intro.at).toBeLessThanOrEqual(45); // within the first minute of the tune-in
      const thanks = p[p.length - 1];
      expect(thanks.at).toBeGreaterThanOrEqual(len * 60 - 180);
      expect(thanks.at).toBeLessThanOrEqual(len * 60 - 120);
    }
  });

  it('joined half way: the first mention is a "you are listening" line, never an intro; one thanks', () => {
    for (const len of LENGTHS) for (const seed of SEEDS) {
      const J = (len * 60) / 2;
      const p = plan(len, J, seed);
      expect(p.filter((m) => m.kind === 'intro').length).toBe(0);
      expect(p.filter((m) => m.kind === 'listening').length).toBe(1);
      expect(p[0].kind).toBe('listening');
      expect(p[0].at).toBeGreaterThanOrEqual(J + 20);
      expect(p[0].at).toBeLessThanOrEqual(J + 45);
      expect(p.filter((m) => m.kind === 'thanks').length).toBe(1);
      for (const m of p) expect(m.at).toBeGreaterThanOrEqual(J);
    }
  });

  it('joining within the first minute still counts as the start; after it, not', () => {
    expect(plan(90, INTRO_JOIN_WINDOW_S, 1)[0].kind).toBe('intro');
    expect(plan(90, INTRO_JOIN_WINDOW_S + 1, 1)[0].kind).toBe('listening');
  });

  it('middle mentions are never under 30 minutes from each other, from the first mention or from the thanks', () => {
    for (const len of LENGTHS) for (const J of [0, (len * 60) / 4, (len * 60) / 2]) for (const seed of SEEDS) {
      const p = plan(len, J, seed);
      for (let i = 1; i < p.length; i++) {
        // Every pair of neighbours that involves a middle mention is at least 30 minutes apart.
        if (p[i].kind === 'mid' || p[i - 1].kind === 'mid') expect(p[i].at - p[i - 1].at).toBeGreaterThanOrEqual(MIN_SPACING_S - 1e-6);
      }
      const gaps = mids(p).map((m, i, a) => (i === 0 ? null : m.at - a[i - 1].at)).filter((g): g is number => g !== null);
      for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(30 * 60); expect(g).toBeLessThanOrEqual(40 * 60 + 1e-6); }
    }
  });

  it('nothing in the last 20 seconds, and every line is over 20 seconds before the end', () => {
    for (const len of LENGTHS) for (const J of [0, (len * 60) / 2, len * 60 - 100, len * 60 - 50]) for (const seed of SEEDS) {
      for (const m of plan(len, J, seed)) {
        expect(m.at).toBeLessThanOrEqual(len * 60 - LINE_S - END_MARGIN_S + 1e-6);
        expect(m.deadline).toBeLessThanOrEqual(len * 60 - LINE_S - END_MARGIN_S + 1e-6);
        expect(m.deadline).toBeGreaterThanOrEqual(m.at);
      }
    }
  });

  it('how many mentions a set gets, joined at the start', () => {
    const count = (len: number) => SEEDS.map((s) => mids(plan(len, 0, s)).length);
    expect(Math.max(...count(20))).toBe(0);
    expect(Math.max(...count(45))).toBe(0); // 45 minutes: intro and thanks only
    expect(Math.max(...count(60))).toBe(0);
    expect(new Set(count(90))).toEqual(new Set([1]));
    expect(new Set(count(120))).toEqual(new Set([2]));
    expect(Math.min(...count(180))).toBeGreaterThanOrEqual(3);
    expect(Math.max(...count(180))).toBeLessThanOrEqual(4);
  });

  it('is deterministic per seed, and different seeds give different gaps', () => {
    for (const len of LENGTHS) for (const seed of SEEDS.slice(0, 30)) expect(plan(len, 0, seed)).toEqual(plan(len, 0, seed));
    const starts = new Set(SEEDS.map((s) => Math.round(plan(120, 0, s)[1].at)));
    expect(starts.size).toBeGreaterThan(50);
  });

  it('says nothing without a DJ name, or with a length that is not known', () => {
    for (const len of LENGTHS) for (const seed of SEEDS.slice(0, 20)) expect(planDjMentions({ lengthMin: len, joinedAtS: 0, seed, hasDj: false })).toEqual([]);
    expect(plan(0, 0, 1)).toEqual([]);
    expect(plan(NaN, 0, 1)).toEqual([]);
  });

  it('a listener who joins in the last minutes still gets the thanks, but nothing that would run into the end', () => {
    const L = 60 * 60;
    expect(plan(60, L - 100, 5).map((m) => m.kind)).toEqual(['thanks']);
    expect(plan(60, L - 30, 5)).toEqual([]);
    expect(plan(60, L, 5)).toEqual([]);
  });

  it('skipFirst (the set change was announced by name) and a recent mention of the same set remove the first line', () => {
    expect(planDjMentions({ lengthMin: 90, joinedAtS: 0, seed: 3, skipFirst: true })[0].kind).toBe('mid');
    const p = planDjMentions({ lengthMin: 90, joinedAtS: 600, seed: 3, lastMentionAtS: 560 });
    expect(p.find((m) => m.kind === 'listening' || m.kind === 'intro')).toBeUndefined();
    expect(p[0].at - 560).toBeGreaterThanOrEqual(30 * 60);
  });
});

describe('DjMentionTracker', () => {
  it('hands a mention out once, however often it is asked, and again only when it was not acknowledged', () => {
    const t = new DjMentionTracker();
    t.begin('k', plan(90, 0, 9));
    const first = plan(90, 0, 9)[0];
    expect(t.due(first.at - 1)).toBeNull();
    const m = t.due(first.at)!;
    expect(m.kind).toBe('intro');
    expect(t.due(first.at + 1)?.index).toBe(m.index); // busy announcer: still due
    t.ack(m);
    expect(t.due(first.at + 1)).toBeNull();
  });

  it('a seek back never replays a mention that was spoken, a seek forward drops the ones it jumped over', () => {
    const p = plan(120, 0, 11);
    const t = new DjMentionTracker();
    t.begin('k', p);
    const spoken: number[] = [];
    const tick = (pos: number) => { const m = t.due(pos); if (m) { t.ack(m); spoken.push(m.index); } };
    tick(p[0].at); tick(p[0].at + 1); tick(0); tick(p[0].at); tick(p[0].at + 5);
    expect(spoken).toEqual([0]);
    tick(p[1].at - 600); tick(p[1].at); // back, then forward to the middle mention
    expect(spoken).toEqual([0, 1]);
    tick(p[1].at - 100); tick(p[1].at); tick(p[1].at + 2);
    expect(spoken).toEqual([0, 1]);
    // Seek to the end: the middle mention (2) is jumped over and dropped; only the thanks is spoken.
    const last = p[p.length - 1];
    expect(p.length).toBe(4);
    tick(last.at + 1);
    expect(spoken).toEqual([0, 1, 3]);
    tick(p[2].at); tick(p[2].at + 1);
    expect(spoken).toEqual([0, 1, 3]);
  });

  it('a mention not spoken within its grace is dropped, not spoken late', () => {
    const p = plan(60, 0, 2);
    const t = new DjMentionTracker();
    t.begin('k', p);
    expect(t.due(p[0].at + GRACE_S + 1)).toBeNull();
    expect(t.remaining).toBe(p.length - 1);
  });
});

/** A fake station clock driven by hand. */
function rig(opts: { dj?: string; lengthMin?: number; key?: string; pos?: number; busy?: () => boolean } = {}) {
  const st = { on: true, id: 'bkhouse', name: 'Test FM', pos: opts.pos ?? 0, key: opts.key ?? 'https://soundcloud.com/a/b', dj: opts.dj ?? 'Test DJ', lengthMin: opts.lengthMin ?? 90, ready: true };
  const said: Array<{ text: string; kind: string; pos: number }> = [];
  const runner = new DjMentionRunner({
    clock: () => (st.ready ? ({ key: st.key, pos: st.pos, durationS: st.lengthMin * 60, dj: st.dj } as DjClock) : null),
    station: () => (st.on ? { id: st.id, name: st.name } : null),
    say: (text, kind) => { if (opts.busy?.()) return false; said.push({ text, kind, pos: st.pos }); return true; },
    random: () => 0.5,
  });
  const run = (to: number, step = 1) => { while (st.pos < to) { st.pos += step; runner.update(); } };
  return { st, runner, said, run };
}

describe('DjMentionRunner', () => {
  it('plays a whole 90 minute set: intro, one mid, thanks, each once, with the DJ name exactly as written', () => {
    const r = rig({ dj: "THE LEVEL PARTY with Shawn O'Sullivan" });
    r.runner.update();
    r.run(90 * 60);
    expect(r.said.map((s) => s.kind)).toEqual(['intro', 'mid', 'thanks']);
    for (const s of r.said) expect(s.text).toContain("THE LEVEL PARTY with Shawn O'Sullivan");
    expect(r.said[2].pos).toBeLessThanOrEqual(90 * 60 - 40);
  });

  it('a listener who joins mid-set gets a listening line, not an intro', () => {
    const r = rig({ pos: 40 * 60, lengthMin: 90 });
    r.runner.update();
    r.run(90 * 60);
    expect(r.said.map((s) => s.kind)).toEqual(['listening', 'thanks']);
  });

  it('says nothing without a DJ name', () => {
    const r = rig({ dj: '   ' });
    r.runner.update();
    r.run(90 * 60);
    expect(r.said).toEqual([]);
  });

  it('says nothing while the clock is not ready (radio off, paused, waiting for the mid-mix start), then starts when it is', () => {
    const r = rig();
    r.st.ready = false;
    r.run(300);
    expect(r.said).toEqual([]);
    r.st.ready = true; r.st.on = false;
    r.run(600);
    expect(r.said).toEqual([]);
    r.st.on = true;
    r.run(700); // the clock was not read in between: the listener joined at 600 s, so this is a listening line
    expect(r.said.map((s) => s.kind)).toEqual(['listening']);
  });

  it('a busy announcer is retried each frame until the line goes out, within the grace', () => {
    let busy = true;
    const r = rig({ busy: () => busy });
    r.runner.update();
    r.run(60);
    expect(r.said).toEqual([]);
    busy = false;
    r.run(70);
    expect(r.said.map((s) => s.kind)).toEqual(['intro']);
    // Busy for longer than the grace: dropped, never spoken late.
    const q = rig({ busy: () => true });
    q.runner.update();
    q.run(200);
    const calls = q.said.length;
    expect(calls).toBe(0);
  });

  it('seeks and widget hiccups do not repeat a mention', () => {
    const r = rig();
    r.runner.update();
    r.run(120);
    expect(r.said.length).toBe(1);
    r.st.pos = 5; r.run(120); // seek back over the intro
    r.st.ready = false; r.runner.update(); r.st.ready = true; // hiccup
    r.st.pos = 30; r.run(200);
    expect(r.said.length).toBe(1);
    r.st.pos = 85 * 60; r.run(90 * 60);
    expect(r.said.map((s) => s.kind)).toEqual(['intro', 'thanks']);
    r.st.pos = 80 * 60; r.run(90 * 60);
    expect(r.said.length).toBe(2);
  });

  it('a retune restarts the logic for the new station; a quick flip back to the same mix does not open it again', () => {
    const r = rig();
    r.runner.update();
    r.run(120);
    expect(r.said.length).toBe(1);
    r.runner.reset(); // tuned away and back 
    r.st.id = 'hiphop'; r.st.name = 'Other FM'; r.st.key = 'https://soundcloud.com/c/d'; r.st.pos = 10;
    r.runner.update(); r.run(120);
    expect(r.said.length).toBe(2);
    expect(r.said[1].kind).toBe('intro');
    expect(r.said[1].text).toBeTruthy();
    r.runner.reset();
    r.st.id = 'bkhouse'; r.st.name = 'Test FM'; r.st.key = 'https://soundcloud.com/a/b'; r.st.pos = 150;
    r.runner.update(); r.run(400);
    expect(r.said.length).toBe(2); // the first mix was mentioned two minutes ago
  });

  it('a set change that was announced by name is not introduced twice', () => {
    const r = rig();
    r.runner.update();
    r.run(120);
    r.runner.noteSetAnnounced();
    r.st.key = 'https://soundcloud.com/x/y'; r.st.pos = 0;
    r.runner.update(); r.run(300);
    expect(r.said.length).toBe(1);
  });

  it('every line in a set is different until the pool has been used', () => {
    const r = rig({ lengthMin: 180 });
    r.runner.update();
    r.run(180 * 60);
    const texts = r.said.map((s) => s.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('the line pools', () => {
  it('cover every SoundCloud station with at least six distinct lines of each kind', () => {
    expect(Object.keys(DJ_LINES).sort()).toEqual(SC_STATIONS.map((s) => s.id).sort());
    for (const def of SC_STATIONS) for (const kind of ['intro', 'mid', 'thanks'] as const) {
      const pool = djLinePool(def.id, kind);
      expect(pool.length).toBeGreaterThanOrEqual(6);
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it('use only the {dj} and {station} slots, always name the DJ, and stay short', () => {
    for (const id of Object.keys(DJ_LINES)) for (const kind of ['intro', 'mid', 'thanks'] as const) {
      for (const line of djLinePool(id, kind)) {
        expect(line).toContain('{dj}');
        const slots = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const s of slots) expect(['dj', 'station']).toContain(s);
        expect(line.replace(/\[[^\]]*\]/g, '').length).toBeLessThan(120);
      }
    }
  });

  it('make no claim about the DJ: no verb or pronoun that has to agree with the name, no numbers, places or quotes', () => {
    const bad = /\{dj\}(?:'s| (?:is|are|was|were|has|have|takes|take|plays|play|makes|make|brings|bring))|\b(?:he|she|they|his|her|their|him)\b|\d|["“”]|https?:|\bbest\b|\blegend/i;
    for (const id of Object.keys(DJ_LINES)) for (const kind of ['intro', 'mid', 'thanks'] as const) {
      for (const line of djLinePool(id, kind)) expect(line.replace(/\[[^\]]*\]/g, ''), line).not.toMatch(bad);
    }
  });

  it('thanks lines say the set is ending; intro lines say it is starting; mid lines do not claim either', () => {
    for (const id of Object.keys(DJ_LINES)) {
      for (const line of djLinePool(id, 'mid')) expect(line, line).not.toMatch(/\b(?:starting now|from the top|begins|winding down|nearly over|nearly done|almost over)\b/i);
      for (const line of djLinePool(id, 'thanks')) expect(line, line).toMatch(/thank|gracias|big ups|respect|give it up|thanks|credit/i);
    }
  });
});

/* ---------- the announcer delivers the line ---------- */

const VOICES: VoiceLike[] = [{ name: 'Daniel', lang: 'en-GB', localService: true }, { name: 'Alex', lang: 'en-US', localService: true }];
class FakeSpeech implements SpeechLike {
  spoken: UtteranceLike[] = [];
  paused = false;
  speak(u: UtteranceLike) { this.spoken.push(u); }
  cancel() { /* */ }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  getVoices() { return VOICES; }
  finish() { this.spoken[this.spoken.length - 1]?.onend?.(); }
}
function announcerRig(voices = true) {
  const speech = new FakeSpeech();
  const ducks: number[] = [];
  let talk = false;
  let vol = 0.6;
  const env: AnnouncerEnv = {
    speech: voices ? speech : null, makeUtterance: (text) => ({ text, voice: null, pitch: 1, rate: 1, volume: 1, lang: '', onend: null, onerror: null }),
    volume: () => vol, setDuck: (l) => ducks.push(l), talkBusy: () => talk, context: () => ({ hour: 12, weather: 'dry', rain: 0, street: 'Throop Ave' }), random: () => 0.5,
  };
  const a = new Announcer(env);
  a.tuneIn(SC_STATIONS[0]);
  for (let i = 0; i < 20; i++) a.update(0.5);
  for (let i = 0; i < 6 && a.speaking; i++) speech.finish();
  return { a, speech, ducks, setTalk: (v: boolean) => { talk = v; }, setVol: (v: number) => { vol = v; } };
}

describe('Announcer.djMention', () => {
  it('speaks the line in the station voice, ducks the music a little, shows the line, and lets go afterwards', () => {
    const r = announcerRig();
    expect(r.a.djMention('You are listening to Test DJ.')).toBe(true);
    expect(r.a.speaking).toBe(true);
    expect(r.a.currentKind).toBe('dj');
    expect(r.a.line).toBe('You are listening to Test DJ.');
    expect(r.a.name).not.toBe('');
    expect(r.ducks[r.ducks.length - 1]).toBe(ANNOUNCER_DJ_DUCK);
    expect(ANNOUNCER_DJ_DUCK).toBeGreaterThan(0.22); // lighter than a full announcement
    expect(r.speech.spoken[r.speech.spoken.length - 1].volume).toBeCloseTo(0.6);
    r.speech.finish();
    expect(r.a.speaking).toBe(false);
    for (let i = 0; i < 4; i++) r.a.update(1);
    expect(r.ducks[r.ducks.length - 1]).toBeGreaterThan(ANNOUNCER_DJ_DUCK);
    expect(r.a.history[r.a.history.length - 1].kind).toBe('dj');
  });

  it('takes the radio volume at the moment of speaking', () => {
    const r = announcerRig();
    r.setVol(0.25);
    r.a.djMention('Test.');
    expect(r.speech.spoken[r.speech.spoken.length - 1].volume).toBeCloseTo(0.25);
  });

  it('declines (returns false) while busy, paused, on WBSY Talk, untuned or with an empty line', () => {
    const r = announcerRig();
    expect(r.a.djMention('   ')).toBe(false);
    r.a.djMention('First.');
    expect(r.a.djMention('Second.')).toBe(false);
    r.speech.finish();
    r.a.setPaused(true);
    expect(r.a.djMention('Paused.')).toBe(false);
    r.a.setPaused(false);
    r.setTalk(true);
    expect(r.a.djMention('Talk.')).toBe(false);
    r.setTalk(false);
    r.a.tuneAway();
    expect(r.a.djMention('Away.')).toBe(false);
  });

  it('without speech voices the line is only shown, for as long as it would take to read', () => {
    const r = announcerRig(false);
    expect(r.a.djMention('You are listening to Test DJ.')).toBe(true);
    expect(r.a.line).toBe('You are listening to Test DJ.');
    for (let i = 0; i < 10; i++) r.a.update(1);
    expect(r.a.speaking).toBe(false);
  });
});
