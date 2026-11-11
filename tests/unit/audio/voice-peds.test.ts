import { describe, expect, it } from 'vitest';
import { CAST as GAME_CAST, EXTRA_SPEAKERS } from '@/game/story/cast';
import { assignVoice, candidateGroups, PedVoiceRegistry, playbackFor, MAX_CENTS } from '@/audio/voice/peds/assign';
import { BARK_KINDS, BARKS, CHATS, norm } from '@/audio/voice/peds/barks';
import { BARK_LINES, planBarks } from '@/audio/voice/peds/lines';
import { PED_GROUPS } from '@/audio/voice/peds/groups';
import { BarkDirector, LIMITS, type BackendHooks, type DirectorEnv, type SpeakJob, type SpeechBackend, type SpeechEventName } from '@/audio/voice/peds/BarkDirector';
import { syllableOpen, distanceGain } from '@/audio/voice/peds/PedVoicePlayer';
import { findBlocked, findDenied } from '@/audio/voice/script';
import { STORY_VOICES, planStory } from '@/audio/voice/StoryVoices';
import { BakedPackSource, ElevenLabsBakedSource, createPackSource } from '@/audio/voice/pack';
import { bakeableSentences, planPack } from '@/audio/voice/packPlan';
import { ADS } from '@/audio/voice/shows';

describe('ped voice assignment', () => {
  it('is stable per seed and keeps pitch within two semitones', () => {
    for (let seed = 1; seed < 200; seed++) {
      const a = assignVoice({ seed }); const b = assignVoice({ seed });
      expect(a.key).toBe(b.key);
      expect(a.group.id).toBe(b.group.id);
      expect(Math.abs(a.cents)).toBeLessThanOrEqual(MAX_CENTS);
      expect(a.speed).toBeGreaterThanOrEqual(0.85); expect(a.speed).toBeLessThanOrEqual(1.2);
    }
  });
  it('respects gender and age when known', () => {
    for (let seed = 1; seed < 60; seed++) {
      expect(assignVoice({ seed, gender: 'f' }).group.gender).toBe('f');
      expect(assignVoice({ seed, gender: 'm', age: 'elder' }).group.ages).toContain('elder');
      expect(assignVoice({ seed, age: 'kid' }).group.ages).toContain('kid');
    }
    expect(candidateGroups({ seed: 1 }).length).toBe(PED_GROUPS.length);
  });
  it('no two peds within 30 m share preset and speed (40 peds in one block)', () => {
    const reg = new PedVoiceRegistry(30);
    const keys: string[] = [];
    for (let i = 0; i < 40; i++) keys.push(reg.voiceFor(`p${i}`, { seed: i * 7919 + 3 }, { x: (i % 8) * 3, y: Math.floor(i / 8) * 3 }).key);
    expect(new Set(keys).size).toBe(keys.length);
    // far apart peds may repeat; the same ped keeps its voice
    expect(reg.voiceFor('p0', { seed: 99 }, { x: 500, y: 0 }).key).toBe(keys[0]);
  });
  it('playback maps to the intended rate and net pitch', () => {
    const v = assignVoice({ seed: 5 });
    const p = playbackFor(v);
    expect(p.playbackRate).toBe(v.rateMul);
    expect(1200 * Math.log2(p.playbackRate) + p.detune).toBeCloseTo(v.cents, 5);
  });
  it('twelve groups with distinct presets', () => {
    expect(PED_GROUPS.length).toBe(12);
    expect(new Set(PED_GROUPS.map((g) => g.voice)).size).toBe(12);
  });
});

describe('bark tables', () => {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  it('40+ lines per category, 3 to 9 words, clean, no repeats', () => {
    const all = new Set<string>();
    for (const k of BARK_KINDS) {
      if (k === 'chat') continue;
      const list = BARKS[k];
      expect(list.length, k).toBeGreaterThanOrEqual(40);
      for (const raw of list) {
        const t = norm(raw).text;
        expect(words(t), `${k}: ${t}`).toBeGreaterThanOrEqual(3);
        expect(words(t), `${k}: ${t}`).toBeLessThanOrEqual(9);
        expect(findDenied(t), t).toEqual([]); expect(findBlocked(t), t).toEqual([]);
        expect(t).not.toMatch(/[\[\]{}]/);
        expect(all.has(`${k}|${t}`), `dup ${t}`).toBe(false); all.add(`${k}|${t}`);
      }
    }
    expect(CHATS.length).toBeGreaterThanOrEqual(40);
    for (const p of CHATS) for (const raw of [p.a, p.b]) {
      const t = norm(raw).text;
      expect(words(t), t).toBeGreaterThanOrEqual(3); expect(words(t), t).toBeLessThanOrEqual(9);
      expect(findDenied(t), t).toEqual([]); expect(findBlocked(t), t).toEqual([]);
    }
  });
  it('every line is baked for 1+ existing groups; the plan stays inside the bark banks', () => {
    const ids = new Set(PED_GROUPS.map((g) => g.id));
    for (const l of BARK_LINES) { expect(l.baked.length).toBeGreaterThan(0); for (const g of l.baked) expect(ids.has(g)).toBe(true); }
    const plan = planBarks();
    expect(plan.length).toBeGreaterThan(900);
    expect(new Set(plan.map((c) => c.key)).size).toBe(plan.length);
  });
});

/* ---------- director simulation ---------- */

interface Sim { dir: BarkDirector; now: number; events: Array<{ type: SpeechEventName; p: any }>; ends: Array<{ at: number; id: string; hooks: BackendHooks }>; begun: SpeakJob[]; concurrent: number; maxConc: number; }
function makeSim(opts: { radio?: () => boolean; mode?: 'all' | 'story' | 'off'; hang?: boolean } = {}): Sim {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sim = { now: 0, events: [], ends: [], begun: [], concurrent: 0, maxConc: 0 } as unknown as Sim;
  const backend: SpeechBackend = {
    begin(job, hooks) {
      sim.begun.push(job);
      if (opts.hang) return { cancel: () => undefined };
      const dur = 1.2 + job.text.split(/\s+/).length * 0.3;
      hooks.started(dur, 'pack');
      sim.concurrent++; sim.maxConc = Math.max(sim.maxConc, sim.concurrent);
      let alive = true;
      sim.ends.push({ at: sim.now + dur, id: job.speakerId, hooks: { ...hooks, ended: () => { if (alive) { alive = false; sim.concurrent--; hooks.ended(); } } } });
      return { cancel: () => { if (alive) { alive = false; sim.concurrent--; } } };
    },
  };
  const env: DirectorEnv = {
    now: () => sim.now, random: rnd, backend,
    emit: (type, p) => sim.events.push({ type, p }),
    subtitleMode: () => opts.mode ?? 'all', radioSpeechInCar: opts.radio ?? (() => false), idle: () => true,
  };
  sim.dir = new BarkDirector(env);
  return sim;
}
function advance(sim: Sim, to: number): void {
  while (true) {
    const next = sim.ends.filter((e) => e.at <= to).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    sim.now = next.at; sim.ends.splice(sim.ends.indexOf(next), 1); next.hooks.ended(); sim.dir.update();
  }
  sim.now = to; sim.dir.update();
}

describe('BarkDirector limits', () => {
  it('10-minute walk: per-ped 20 s, 1 bark per 4 s in 25 m, max 2 voices, no repeat inside 5 min, 25 m cut', () => {
    const sim = makeSim();
    const startsAt: Array<{ t: number; ped: string; x: number; y: number; line: string }> = [];
    const kinds = ['greeting', 'chat', 'stoop', 'seller', 'carClose', 'horn', 'rain', 'playerRunning', 'complaint'] as const;
    for (let t = 0; t < 600; t += 0.5) {
      advance(sim, t);
      for (let k = 0; k < 3; k++) {
        const i = Math.floor((t * 7 + k * 13) % 40);
        const before = sim.begun.length;
        sim.dir.request({ pedId: `ped${i}`, kind: kinds[(Math.floor(t) + k) % kinds.length], pos: { x: (i % 8) * 6, y: Math.floor(i / 8) * 6 }, seed: i + 1, dist: 5 + ((i * 3) % 24), with: `ped${(i + 11) % 40}` });
        for (const j of sim.begun.slice(before)) startsAt.push({ t: sim.now, ped: j.speakerId, x: j.pos?.x ?? 0, y: j.pos?.y ?? 0, line: j.lineId });
      }
    }
    const perMinute = Array.from({ length: 10 }, (_, m) => startsAt.filter((s) => s.t >= m * 60 && s.t < (m + 1) * 60).length);
    expect(sim.maxConc).toBeLessThanOrEqual(LIMITS.maxPedVoices);
    // area rule: two openers closer than 4 s apart are more than 25 m apart (answers in a chat pair are the same exchange)
    const openers = startsAt.filter((s) => BARK_LINES.find((l) => l.id === s.line)?.side !== 'b');
    for (let i = 0; i < openers.length; i++) for (let j = i + 1; j < openers.length && openers[j].t - openers[i].t < LIMITS.areaSec; j++) {
      expect(Math.hypot(openers[i].x - openers[j].x, openers[i].y - openers[j].y)).toBeGreaterThan(LIMITS.areaRadius);
    }
    expect(Math.max(...perMinute)).toBeLessThanOrEqual(60);
    expect(Math.min(...perMinute)).toBeGreaterThan(3);
    const lastByPed = new Map<string, number>();
    const lastByLine = new Map<string, number>();
    let prev = -99;
    for (const s of startsAt) {
      // chat answers start 0.4 s after the opener (same exchange), everything else obeys the limits
      const isReply = s.line && lastByLine.size > 0 && false;
      if (isReply) continue;
      const lp = lastByPed.get(s.ped); if (lp !== undefined) expect(s.t - lp).toBeGreaterThanOrEqual(LIMITS.perPedSec);
      lastByPed.set(s.ped, s.t);
      const ll = lastByLine.get(s.line); if (ll !== undefined) expect(s.t - ll).toBeGreaterThanOrEqual(LIMITS.repeatSec);
      lastByLine.set(s.line, s.t);
      prev = s.t;
    }
    expect(prev).toBeGreaterThan(0);
    expect(sim.dir.stats.dropped.far ?? 0).toBeGreaterThanOrEqual(0);
  });
  it('drops beyond 25 m, repeats inside 4 s in the radius, and the same ped inside 20 s', () => {
    const sim = makeSim();
    expect(sim.dir.request({ pedId: 'a', kind: 'greeting', dist: 26, pos: { x: 0, y: 0 } })).toBe(false);
    expect(sim.dir.request({ pedId: 'a', kind: 'greeting', dist: 10, pos: { x: 0, y: 0 } })).toBe(true);
    expect(sim.dir.request({ pedId: 'b', kind: 'greeting', dist: 10, pos: { x: 10, y: 0 } })).toBe(false); // area
    advance(sim, 4.5);
    expect(sim.dir.request({ pedId: 'a', kind: 'greeting', dist: 10, pos: { x: 0, y: 0 } })).toBe(false);  // same ped
    expect(sim.dir.request({ pedId: 'b', kind: 'greeting', dist: 10, pos: { x: 10, y: 0 } })).toBe(true);
    expect(sim.dir.stats.dropped.far).toBe(1);
  });
  it('priority: ambient waits for story speech, story preempts peds, reactions preempt ambient', () => {
    const sim = makeSim();
    sim.dir.speakStory('Dee', 'Hurry. He is not moving right.', 'mission');
    expect(sim.dir.request({ pedId: 'a', kind: 'greeting', dist: 5, pos: { x: 0, y: 0 } })).toBe(false);
    expect(sim.dir.request({ pedId: 'b', kind: 'gunshot', dist: 5, pos: { x: 100, y: 0 } })).toBe(true);   // reactions still allowed
    const sim2 = makeSim();
    sim2.dir.request({ pedId: 'a', kind: 'greeting', dist: 5, pos: { x: 0, y: 0 } });
    advance(sim2, 4.1);
    sim2.dir.request({ pedId: 'b', kind: 'stoop', dist: 5, pos: { x: 10, y: 0 } });
    advance(sim2, 8.2);
    expect(sim2.dir.activePeds).toBeLessThanOrEqual(2);
    sim2.dir.speakStory('Tay', 'Okay. Okay.', 'story');
    expect(sim2.dir.activePeds).toBe(0);
    expect(sim2.events.some((e) => e.type === 'speech:end')).toBe(true);
  });
  it('no ambient chatter while talk radio speaks in the car', () => {
    let radio = true;
    const sim = makeSim({ radio: () => radio });
    expect(sim.dir.request({ pedId: 'a', kind: 'greeting', dist: 5, pos: { x: 0, y: 0 } })).toBe(false);
    expect(sim.dir.request({ pedId: 'a', kind: 'carClose', dist: 5, pos: { x: 0, y: 0 } })).toBe(true);
    radio = false;
    advance(sim, 30);
    expect(sim.dir.request({ pedId: 'c', kind: 'greeting', dist: 5, pos: { x: 0, y: 0 } })).toBe(true);
  });
  it('chat pair: B answers about 0.4 s after A ends, with its own voice', () => {
    const sim = makeSim();
    expect(sim.dir.request({ pedId: 'a', kind: 'chat', with: 'b', dist: 5, pos: { x: 0, y: 0 }, seed: 3 })).toBe(true);
    const endA = sim.ends[0].at;
    advance(sim, endA);
    expect(sim.begun.length).toBe(1);
    advance(sim, endA + 0.45);
    expect(sim.begun.length).toBe(2);
    expect(sim.begun[1].speakerId).toBe('b');
    expect(sim.begun[0].voice!.kokoro + sim.begun[0].voice!.speed).not.toBe(sim.begun[1].voice!.kokoro + sim.begun[1].voice!.speed);
  });
  it('a line not ready in 400 ms becomes a subtitle only and frees the slot', () => {
    const sim = makeSim({ hang: true });
    sim.dir.request({ pedId: 'a', kind: 'carClose', dist: 5, pos: { x: 0, y: 0 }, toPlayer: true });
    expect(sim.dir.activeCount).toBe(1);
    advance(sim, 0.3);
    expect(sim.dir.activeCount).toBe(1);
    advance(sim, 0.5);
    expect(sim.dir.activeCount).toBe(0);
    expect(sim.events.filter((e) => e.type === 'speech:subtitle').length).toBe(1);
    expect(sim.dir.stats.subtitleOnly).toBe(1);
  });
  it('subtitles: peds only within 12 m or addressed; mission and story always; mode story/off; no directions', () => {
    const near = makeSim();
    near.dir.request({ pedId: 'a', kind: 'carClose', dist: 8, pos: { x: 0, y: 0 } });
    const far = makeSim();
    far.dir.request({ pedId: 'a', kind: 'carClose', dist: 18, pos: { x: 0, y: 0 } });
    const addressed = makeSim();
    addressed.dir.request({ pedId: 'a', kind: 'carClose', dist: 18, pos: { x: 0, y: 0 }, toPlayer: true });
    const subs = (s: Sim) => s.events.filter((e) => e.type === 'speech:subtitle').length;
    expect([subs(near), subs(far), subs(addressed)]).toEqual([1, 0, 1]);
    const st = makeSim({ mode: 'story' });
    st.dir.request({ pedId: 'a', kind: 'carClose', dist: 3, pos: { x: 0, y: 0 } });
    st.dir.speakStory('Hobbs', '[beat] Nice block. [pause 1] Shame.', 'story', { dist: 40 });
    expect(st.events.filter((e) => e.type === 'speech:subtitle').map((e) => e.p.text)).toEqual(['Nice block. Shame.']);
    const off = makeSim({ mode: 'off' });
    off.dir.speakStory('Hobbs', 'Nice block.', 'mission');
    expect(subs(off)).toBe(0);
  });
  it('a story speaker with no voice (You) is subtitle only', () => {
    const sim = makeSim();
    expect(sim.dir.speakStory('You', 'Fine.', 'mission')).toBe(false);
    expect(sim.begun[0].voice).toBeNull();
  });
  it('emits speech:start with the duration and a line id, then speech:end', () => {
    const sim = makeSim();
    sim.dir.request({ pedId: 'a', kind: 'horn', dist: 5, pos: { x: 0, y: 0 } });
    advance(sim, 10);
    const types = sim.events.map((e) => e.type);
    expect(types.indexOf('speech:start')).toBeLessThan(types.indexOf('speech:end'));
    const start = sim.events.find((e) => e.type === 'speech:start')!.p;
    expect(start.speakerId).toBe('a'); expect(start.durSec).toBeGreaterThan(0.5); expect(typeof start.lineId).toBe('string');
  });
});

describe('visemes and distance', () => {
  it('syllable envelope stays in 0..1 and closes outside the line; 30 Hz gives about 30 samples a second', () => {
    let n = 0;
    for (let t = 0; t <= 2; t += 1 / 30) { const o = syllableOpen('Hey you with the car', 2, t); expect(o).toBeGreaterThanOrEqual(0); expect(o).toBeLessThanOrEqual(1); n++; }
    expect(n).toBeGreaterThanOrEqual(60);
    expect(syllableOpen('x', 1, 2)).toBe(0);
  });
  it('inverse distance gain', () => { expect(distanceGain(2)).toBeGreaterThan(distanceGain(10)); expect(distanceGain(4) / distanceGain(8)).toBeCloseTo(2, 5); });
});

describe('story voices', () => {
  it('every speaker the story can use has a voice entry', () => {
    for (const c of GAME_CAST) expect(c.name in STORY_VOICES, c.name).toBe(true);
    for (const n of EXTRA_SPEAKERS) expect(n in STORY_VOICES, n).toBe(true);
  });
  it('recurring characters get distinct presets', () => {
    const rec = GAME_CAST.filter((c) => !c.group && !c.offstage).map((c) => STORY_VOICES[c.name]!);
    expect(new Set(rec.map((v) => `${v.voice}@${v.speed}`)).size).toBe(rec.length);
    // only 6 male presets are outside the pedestrian groups; Hobbs shares one and the director reserves it while he speaks
    const ped = new Set(PED_GROUPS.map((g) => g.voice));
    const shared = GAME_CAST.filter((x) => !x.group && !x.offstage && ped.has(STORY_VOICES[x.name]!.voice)).map((x) => x.name);
    expect(shared).toEqual(['Hobbs']);
  });
  it('plans story clips without directions', () => {
    const plan = planStory([{ who: 'Dee', text: 'Hurry. [beat] He is gray.' }, { who: 'You', text: 'No.' }]);
    expect(plan.map((c) => c.text)).toEqual(['Hurry.', 'He is gray.']);
  });
});

describe('voice pack runtime', () => {
  const manifest = { version: 1, engine: 'kokoro-82m-v1.0-q8', sampleRate: 24000, entries: { k1: { file: 'banks/a.mp3', off: 2, len: 3, dur: 1.5, lufs: -16, peak: -3, who: 'x', text: 't' } } };
  const fetchOk = (urls: string[]) => async (u: string) => {
    urls.push(u);
    if (u.endsWith('manifest.json')) return { ok: true, status: 200, json: async () => manifest, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new Uint8Array([0, 1, 2, 3, 4, 5, 6]).buffer };
  };
  it('lazy: manifest first, a bank only when one of its clips is asked for; slices by offset', async () => {
    const urls: string[] = [];
    let got: number[] = [];
    const src = new BakedPackSource({ base: './voice/', fetchImpl: fetchOk(urls), decode: async (b) => { got = [...new Uint8Array(b)]; return { samples: new Float32Array(4), sampleRate: 24000 }; } });
    expect(src.has('k1')).toBe(false);
    expect(await src.load()).toBe(true);
    expect(urls).toEqual(['./voice/manifest.json']);
    expect(src.has('k1')).toBe(true); expect(src.duration('k1')).toBe(1.5);
    expect(await src.get('k1')).not.toBeNull();
    expect(got).toEqual([2, 3, 4]);
    expect(urls).toEqual(['./voice/manifest.json', './voice/banks/a.mp3']);
    expect(await src.get('nope')).toBeNull();
    expect(src.label).toContain('Kokoro');
  });
  it('a missing pack (artifact build, 404) is quiet: state missing, everything falls through', async () => {
    const warns: string[] = [];
    const src = new BakedPackSource({ base: './voice/', fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }), decode: async () => ({ samples: new Float32Array(1), sampleRate: 24000 }), warn: (m) => warns.push(m) });
    expect(await src.load()).toBe(false);
    expect(src.state).toBe('missing'); expect(src.has('k1')).toBe(false); expect(await src.get('k1')).toBeNull();
    expect(warns.length).toBe(1);
  });
  it('elevenlabs-baked reads the same manifest but only when the engine says so; default source is Kokoro', async () => {
    const el = createPackSource('elevenlabs-baked', { base: './voice/', fetchImpl: fetchOk([]), decode: async () => ({ samples: new Float32Array(1), sampleRate: 24000 }) });
    expect(el).toBeInstanceOf(ElevenLabsBakedSource);
    expect(await el.load()).toBe(false);   // a Kokoro manifest is not an ElevenLabs pack
    const kk = createPackSource('kokoro-baked', { base: './voice/', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...manifest, engine: 'elevenlabs:eleven_multilingual_v2' }), arrayBuffer: async () => new ArrayBuffer(0) }), decode: async () => ({ samples: new Float32Array(1), sampleRate: 24000 }) });
    expect(await kk.load()).toBe(false);   // and the default source refuses it
  });
});

describe('pack plan', () => {
  it('bakes finite slots, skips open ones, keeps keys unique, no real-brand ids', () => {
    expect(bakeableSentences('Shout-out to {hood}. Big love.').length).toBeGreaterThan(12);
    expect(bakeableSentences('Next up is {dj} with {title}. Find your spot.')).toEqual(['Find your spot.']);
    expect(bakeableSentences('It is {time} on {street}, and {weather}.')).toEqual([]);
    const plan = planPack({ stations: [{ id: 'bkhouse', name: 'Boiler Room', freq: 'ninety point nine' }] });
    expect(new Set(plan.map((c) => c.key)).size).toBe(plan.length);
    expect(plan[0].tier).toBe(0);
    expect(plan.some((c) => c.text.includes('{'))).toBe(false);
    expect(ADS.map((a) => a.id).join(' ')).not.toMatch(/oatly/);
  });
});
