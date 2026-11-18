import { describe, expect, it } from 'vitest';
import { SpeechPlayer, type SpeechPlayerEnv } from '@/audio/voice/SpeechPlayer';
import { ClipCache } from '@/audio/voice/ClipCache';
import { fadeOutAndStop, FADE_SEC } from '@/audio/voice/fade';
import { tuneFor, playbackRateFor } from '@/audio/voice/tune';
import { CAST } from '@/audio/voice/cast';
import { playHorn, aim, unaim, EngineNodes, ENGINE_TUNING } from '@/audio/vehicle/nodes';
import { sirenGateOpen, sirenHz, HORNS } from '@/audio/vehicle/hornModel';
import { ENGINE_VOICES, EngineSim, engineMix, SHIFT_LOAD } from '@/audio/vehicle/engineModel';
import type { Clip, TtsEngine } from '@/audio/voice/types';

/* ---------- a recording fake of the Web Audio pieces these tests touch ---------- */

type Ev = { kind: string; v?: number; t: number };
class Param {
  value = 1; ev: Ev[] = [];
  setValueAtTime(v: number, t: number) { this.ev.push({ kind: 'set', v, t }); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.ev.push({ kind: 'lin', v, t }); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.ev.push({ kind: 'exp', v, t }); return this; }
  setTargetAtTime(v: number, t: number, _tc: number) { this.ev.push({ kind: 'target', v, t }); return this; }
  cancelScheduledValues(t: number) { this.ev.push({ kind: 'cancel', t }); return this; }
}
class Node { connected: unknown[] = []; connect(d: unknown) { this.connected.push(d); return d; } disconnect() { this.connected = []; } }
class Gain extends Node { gain = new Param(); }
class Source extends Node { buffer: { duration: number } | null = null; playbackRate = new Param(); detune = new Param(); startAt = -1; stopAt: number | null = null; start(t: number) { this.startAt = t; } stop(t = 0) { this.stopAt = t; } }

function fakeCtx(now = 10) {
  const gains: Gain[] = []; const sources: Source[] = [];
  const ctx = {
    currentTime: now, sampleRate: 24000,
    createGain: () => { const g = new Gain(); gains.push(g); return g; },
    createBufferSource: () => { const s = new Source(); sources.push(s); return s; },
    createBuffer: (_c: number, len: number, sr: number) => ({ duration: len / sr, copyToChannel: () => undefined }),
    createBiquadFilter: () => { const n = new Node() as Node & { frequency: Param; Q: Param; gain: Param; type: string }; n.frequency = new Param(); n.Q = new Param(); n.gain = new Param(); n.type = 'lowpass'; return n; },
    createOscillator: () => { const n = new Source() as Source & { frequency: Param; type: string }; n.frequency = new Param(); n.type = 'sine'; return n; },
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, gains, sources };
}

const clip = (sec: number): Clip => ({ samples: new Float32Array(Math.round(24000 * sec)).fill(0.2), sampleRate: 24000 });

describe('speech cancel does not click', () => {
  function playing() {
    const f = fakeCtx(10);
    const engine = { kind: 'fake', ready: true, usable: true, rtf: 0.3, synth: () => Promise.resolve(clip(2)), cancelAll: () => undefined, demote: () => undefined, load: async () => undefined, dispose: () => undefined } as unknown as TtsEngine;
    const env: SpeechPlayerEnv = { ctx: () => f.ctx, dest: () => ({}) as AudioNode, speech: null, makeUtterance: () => ({}) as never, engine: () => engine, cache: new ClipCache(null), volume: () => 1, warn: () => undefined, fxBank: () => ({ input: () => ({}) as AudioNode }) as never };
    return { ...f, player: new SpeechPlayer(env) };
  }

  it('a cancelled clip is faded to zero over about 25 ms and only then stopped (a hard stop at a non-zero sample is a click)', async () => {
    const t = playing();
    const h = t.player.play([{ who: 'buck', text: 'Good morning, Brooklyn. Buck Mercer here.' }]);
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(t.sources.length).toBeGreaterThan(0);
    t.raw.currentTime = 10.5; // mid-phrase
    h.cancel();
    for (const s of t.sources) {
      expect(s.stopAt).not.toBeNull();
      expect(s.stopAt!).toBeGreaterThan(10.5 + FADE_SEC - 1e-9); // not stopped at once
      expect(s.stopAt!).toBeLessThan(10.5 + 0.1);
    }
    // every clip went through its own gate, and the gate was ramped to zero by the stop time
    const ramped = t.gains.filter((g) => g.gain.ev.some((e) => e.kind === 'lin' && e.v === 0));
    expect(ramped.length).toBeGreaterThanOrEqual(t.sources.length);
    for (const g of ramped) { const r = g.gain.ev.find((e) => e.kind === 'lin' && e.v === 0)!; expect(r.t).toBeGreaterThan(10.5); expect(r.t).toBeLessThanOrEqual(10.5 + FADE_SEC + 1e-9); }
  });

  it('fadeOutAndStop takes the chain apart after the fade, not before', () => {
    const f = fakeCtx(5);
    const src = new Source() as unknown as AudioScheduledSourceNode; const gate = new Gain() as unknown as GainNode;
    const later: Array<() => void> = [];
    fadeOutAndStop(f.ctx, [{ src, gate }], FADE_SEC, (fn) => { later.push(fn); });
    expect((src as unknown as Source).stopAt).toBeCloseTo(5 + FADE_SEC + 0.005, 6);
    (src as unknown as Source).connected = [gate];
    expect((src as unknown as Source).connected.length).toBe(1);
    later.forEach((fn) => fn());
    expect((src as unknown as Source).connected.length).toBe(0);
  });
});

describe('a siren released while its gate is closed stays closed', () => {
  it('whoop: the gate is open for 45 % of each 0.7 s sweep and closed after it; the other modes never close', () => {
    let open = 0, shut = 0;
    for (let s = 0; s < 0.7; s += 0.04) (sirenHz('whoop', s) > 0 ? open++ : shut++);
    expect(open).toBeGreaterThan(5); expect(shut).toBeGreaterThan(5);
    for (const m of ['wail', 'yelp', 'hilo', 'parody'] as const) for (let s = 0; s < 3; s += 0.07) expect(sirenGateOpen(m, s)).toBe(true);
    for (let s = 0; s < 3; s += 0.013) expect(sirenGateOpen('whoop', s)).toBe(sirenHz('whoop', Math.floor(s / 0.04) * 0.04) > 0);
  });

  it('release in a gap writes the closed level, not the open one (the old code wrote the full level: a click)', () => {
    const f = fakeCtx(0);
    const h = playHorn(f.ctx, {} as AudioNode, HORNS.cop, 0.2, { mode: 'whoop' });
    // find a release time inside a gap of the whoop (0.45 of each 0.7 s sweep is open)
    let at = 0; for (let s = 1.0; s < 3; s += 0.01) if (!sirenGateOpen('whoop', s - 0.2) && !sirenGateOpen('whoop', s - 0.2 + 0.03)) { at = s; break; }
    expect(at).toBeGreaterThan(0);
    h.release(at);
    const amp = f.gains[0].gain; // the horn's amplitude node is the first gain it makes
    const afterCancel = amp.ev.slice(amp.ev.map((e) => e.kind).lastIndexOf('cancel') + 1);
    const first = afterCancel[0];
    expect(first.kind).toBe('set');
    expect(first.v).toBeLessThan(0.001);
  });
});

describe('automation writes', () => {
  it('aim skips a write that would not move the target, lets a real move through and a forgotten one', () => {
    const p = new Param() as unknown as AudioParam;
    aim(p, 1, 0, 0.1); aim(p, 1, 0.1, 0.1); aim(p, 1.001, 0.2, 0.1);
    expect((p as unknown as Param).ev.length).toBe(1);
    aim(p, 1.2, 0.3, 0.1);
    expect((p as unknown as Param).ev.length).toBe(2);
    unaim(p);
    aim(p, 1.2, 0.4, 0.1);
    expect((p as unknown as Param).ev.length).toBe(3);
  });

  it('a held cruise writes few events per frame (the old code wrote every parameter every frame)', () => {
    const f = fakeCtx(0);
    const v = ENGINE_VOICES.sedan;
    const params: Param[] = [];
    // count every param the engine writes by wrapping createGain/createOscillator/createBiquadFilter params
    const wrap = <T extends Record<string, unknown>>(n: T) => { for (const k of Object.keys(n)) if (n[k] instanceof Param) params.push(n[k] as Param); return n; };
    const raw = f.raw as unknown as Record<string, unknown>;
    const mk = raw.createGain as () => Gain; raw.createGain = () => wrap(mk() as unknown as Record<string, unknown>);
    const mo = raw.createOscillator as () => Source; raw.createOscillator = () => { const o = mo() as unknown as Record<string, unknown>; o.detune = new Param(); return wrap(o); };
    const mf = raw.createBiquadFilter as () => Node; raw.createBiquadFilter = () => { const n = mf() as unknown as Record<string, unknown>; n.Q = new Param(); n.gain = new Param(); return wrap(n); };
    raw.createBufferSource = () => { const s = new Source() as unknown as Record<string, unknown>; return wrap(s); };
    const nodes = new EngineNodes(f.ctx, v, { duration: 1 } as AudioBuffer, new Gain() as unknown as AudioNode, 0);
    const sim = new EngineSim(v, () => 0.5); sim.startNow();
    for (let i = 0; i < 60; i++) nodes.apply(sim.update(1 / 60, 15, 0.25), i / 60, 15, false); // warm up
    const before = params.reduce((n, p) => n + p.ev.length, 0);
    for (let i = 60; i < 120; i++) nodes.apply(sim.update(1 / 60, 15, 0.25), i / 60, 15, false);
    const perFrame = (params.reduce((n, p) => n + p.ev.length, 0) - before) / 60;
    expect(perFrame).toBeLessThan(8); // the whole vehicle layer went from 1869 to 525 events a second in the offline render (scripts/soundcheck-render.mjs stutter)
  });
});

describe('engine level and swell', () => {
  it('the two chorus oscillators are mixed lighter than the lead so their beat swells at most 7 dB peak to trough', () => {
    const a = ENGINE_TUNING.a, b = ENGINE_TUNING.chorus;
    const swellDb = 20 * Math.log10((a + b) / (a - b));
    expect(swellDb).toBeLessThan(7); // was 0.55/0.4: 16 dB of slow level swell, the periodic "flutter" of a held cruise
  });

  it('cruise sits well under full throttle, idle stays audible, and a shift keeps most of the level', () => {
    const v = ENGINE_VOICES.sedan;
    const sim = new EngineSim(v, () => 0.5); sim.startNow();
    const idle = engineMix(v, sim.update(1 / 60, 0, 0));
    const cruise = engineMix(v, { ...sim.update(1 / 60, 16, 0.22), load: 0.25 });
    const wot = engineMix(v, { ...sim.update(1 / 60, 18, 1), load: 1 });
    const db = (x: number) => 20 * Math.log10(x);
    expect(db(wot.out / cruise.out)).toBeGreaterThan(5);
    expect(db(idle.out)).toBeGreaterThan(-60);
    expect(SHIFT_LOAD).toBeGreaterThanOrEqual(0.9);
  });

  it('no vehicle type is more than 7 dB louder than a sedan at full throttle (a beater or a pickup used to be 8 dB louder)', () => {
    const wot = (name: keyof typeof ENGINE_VOICES) => { const v = ENGINE_VOICES[name]; const f = { ...new EngineSim(v, () => 0.5).update(1 / 60, 0, 1), load: 1, level: 1, rpm: v.red * 0.8, elec: 1 }; return engineMix(v, f).out; };
    for (const name of Object.keys(ENGINE_VOICES) as Array<keyof typeof ENGINE_VOICES>) {
      if (ENGINE_VOICES[name].ev) continue;
      expect(20 * Math.log10(wot(name) / wot('sedan')), name).toBeLessThan(7);
    }
  });
});

describe('per-speaker tuning', () => {
  it('speakers that share a neural preset are at least 60 cents apart, everyone is within 200 cents, and it is stable', () => {
    const byVoice = new Map<string, string[]>();
    for (const c of CAST) byVoice.set(c.voice, [...(byVoice.get(c.voice) ?? []), c.id]);
    for (const [voice, ids] of byVoice) {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(Math.abs(tuneFor(ids[i]).cents - tuneFor(ids[j]).cents), `${voice}: ${ids[i]} vs ${ids[j]}`).toBeGreaterThanOrEqual(60);
    }
    for (const c of CAST) { const t = tuneFor(c.id); expect(Math.abs(t.cents)).toBeLessThanOrEqual(200); expect(tuneFor(c.id)).toBe(t); }
    expect(playbackRateFor({ cents: 1200 })).toBeCloseTo(2, 6);
  });

  it('SpeechPlayer plays each speaker at its own tuned rate and keeps the next clip clear of the tuned length', async () => {
    const f = fakeCtx(10);
    const engine = { kind: 'fake', ready: true, usable: true, rtf: 0.3, synth: () => Promise.resolve(clip(1)), cancelAll: () => undefined, demote: () => undefined, load: async () => undefined, dispose: () => undefined } as unknown as TtsEngine;
    const env: SpeechPlayerEnv = { ctx: () => f.ctx, dest: () => ({}) as AudioNode, speech: null, makeUtterance: () => ({}) as never, engine: () => engine, cache: new ClipCache(null), volume: () => 1, warn: () => undefined, fxBank: () => ({ input: () => ({}) as AudioNode }) as never };
    const p = new SpeechPlayer(env);
    p.play([{ who: 'dev', text: 'Hi there.' }, { who: 'lucho', text: 'Hello.' }, { who: 'garrett', text: 'Good evening.' }]);
    for (let i = 0; i < 60; i++) await Promise.resolve();
    const rates = f.sources.map((s) => s.playbackRate.value);
    expect(new Set(rates.map((r) => r.toFixed(3))).size).toBe(3); // dev, lucho and garrett all use am_eric
    expect(Math.max(...rates)).toBeLessThan(1.13);
    expect(Math.min(...rates)).toBeGreaterThan(0.89);
  });
});
