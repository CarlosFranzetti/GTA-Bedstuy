import { describe, expect, it } from 'vitest';
import { DjGame, MAX_PITCH, type DjAudioPort } from '@/game/DjGame';
import { PROCEDURAL_RECORDS } from '@/game/records';

const rec = (i: number) => ({ ...PROCEDURAL_RECORDS[i] });
const lenOf = (r: { bpm: number }) => (60 / r.bpm) * 4 * 16;

function fakeAudio() {
  const log: string[] = [];
  const port: DjAudioPort = {
    setBuffer: (d) => { log.push(`buf${d}`); }, start: (d, o, r) => { log.push(`start${d}@${o.toFixed(2)}x${r.toFixed(3)}`); },
    stop: (d) => { log.push(`stop${d}`); }, setRate: (d, r) => { log.push(`rate${d}=${r.toFixed(3)}`); }, setGain: () => undefined,
  };
  return { port, log };
}
function run(g: DjGame, seconds: number, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) g.tick(dt); }

function setup(a = 1, b = 1, venue = 'home') {
  const events: Array<{ type: string; payload: unknown }> = [];
  const { port, log } = fakeAudio();
  const g = new DjGame(port, { emit: (type, payload) => events.push({ type, payload }) });
  g.load(0, rec(a), lenOf(rec(a))); g.load(1, rec(b), lenOf(rec(b)));
  g.startSet(venue);
  return { g, events, log };
}

describe('DjGame controls', () => {
  it('clamps pitch to +-8 % and passes the rate to the audio port', () => {
    const { g, log } = setup();
    g.setPitch(0, 0.5); expect(g.deck(0).pitch).toBe(MAX_PITCH);
    g.setPitch(0, -1); expect(g.deck(0).pitch).toBe(-MAX_PITCH);
    g.setPitch(0, Number.NaN); expect(g.deck(0).pitch).toBe(0);
    g.setPitch(0, 0.04); g.play(0); g.setPitch(0, 0.05);
    expect(log).toContain('start0@0.00x1.040');
    expect(log).toContain('rate0=1.050');
    expect(g.deck(0).bpm).toBeCloseTo(rec(1).bpm * 1.05, 3);
  });
  it('cue returns to the cue point; cue while stopped sets it', () => {
    const { g } = setup();
    g.play(0); run(g, 2); g.cue(0);
    expect(g.deck(0).playing).toBe(false); expect(g.deck(0).pos).toBe(0);
    g.play(0); run(g, 1.5); g.play(0); // pause
    const p = g.deck(0).pos; g.cue(0); expect(g.deck(0).cuePoint).toBeCloseTo(p, 6);
    g.play(0); run(g, 1); g.cue(0); expect(g.deck(0).pos).toBeCloseTo(p, 6);
  });
  it('loops the track and equal-power crossfades', () => {
    const { g } = setup();
    g.play(0); run(g, lenOf(rec(1)) + 1);
    expect(g.deck(0).pos).toBeLessThan(2.5);
    g.setCrossfader(0.5);
    const [a, b] = DjGame.gains(0.5); expect(a).toBeCloseTo(b, 6); expect(a * a + b * b).toBeCloseTo(1, 6);
    expect(DjGame.gains(0)[1]).toBeCloseTo(0, 6);
  });
});

describe('DjGame scoring', () => {
  it('perfect beatmatch (same record, same phase) scores far above a clashing mix', () => {
    const good = setup(1, 1);
    good.g.play(0); good.g.play(1); good.g.setCrossfader(0.5);
    run(good.g, 30);
    expect(good.g.matchQuality()).toBeGreaterThan(0.95);

    const bad = setup(0, 7); // 88 vs 130 bpm
    bad.g.play(0); bad.g.play(1); bad.g.setCrossfader(0.5);
    run(bad.g, 30);
    expect(bad.g.matchQuality()).toBeLessThan(0.3);

    expect(good.g.result().match).toBeGreaterThan(0.9);
    expect(bad.g.result().match).toBeLessThan(0.3);
    expect(good.g.result().score).toBeGreaterThan(bad.g.result().score);
  });
  it('pitching the slower record into the same tempo restores the tempo match', () => {
    const { g } = setup(8, 1); // 120 vs 122
    g.setPitch(0, 122 / 120 - 1);
    expect(Math.abs(g.deck(0).bpm - g.deck(1).bpm)).toBeLessThan(0.01);
  });
  it('a phase offset hurts and a nudge fixes it', () => {
    const { g } = setup(1, 1);
    g.play(0); run(g, 0.2); g.play(1); g.setCrossfader(0.5);
    run(g, 0.5);
    const off = g.phaseOffset();
    expect(Math.abs(off)).toBeGreaterThan(0.2);
    expect(g.matchQuality()).toBeLessThan(0.1);
    g.nudge(1, -off);
    expect(Math.abs(g.phaseOffset())).toBeLessThan(0.02);
    expect(g.matchQuality()).toBeGreaterThan(0.85);
  });
  it('crossfading on a bar line scores better than off it', () => {
    const bar = 60 / 122 * 4;
    const cross = (late: number) => {
      const t = setup(1, 1);
      t.g.play(0); t.g.play(1);
      run(t.g, bar * 3 - 0.3, 0.01);
      t.g.setCrossfader(0.4); run(t.g, 0.3 + late, 0.01); // both audible while the fader moves in
      t.g.setCrossfader(0.55);
      return t.g.result().timing;
    };
    expect(cross(0)).toBeGreaterThan(0.8); // crossing right on the bar line
    expect(cross(60 / 122 * 2)).toBeLessThan(0.15); // two beats off
  });
  it('variety rewards playing different records, and dead air tanks the crowd and score', () => {
    const one = setup(1, 2); one.g.play(0); run(one.g, 20);
    const two = setup(1, 2); two.g.play(0); run(two.g, 10); two.g.setCrossfader(1); two.g.play(1); two.g.play(0); run(two.g, 12);
    expect(two.g.result().variety).toBeGreaterThan(one.g.result().variety);
    const silent = setup(1, 2); run(silent.g, 30);
    expect(silent.g.result().score).toBe(0);
    expect(silent.g.crowd).toBeLessThan(0.05);
    expect(one.g.crowd).toBeGreaterThan(0.5);
  });
  it('club sets weigh the crowd; scripted full set emits dj:setFinished', () => {
    const { g, events } = setup(1, 2, 'aftersloth');
    g.setPitch(1, 122 / 118 - 1 + (118 - 122) * 0); // 118 -> ~122
    g.play(0); run(g, 12);
    g.setCrossfader(0.3); g.play(1); run(g, 4); g.setCrossfader(0.55); run(g, 10); g.setCrossfader(1); g.play(0); run(g, 6);
    const r = g.finishSet();
    expect(r.venue).toBe('aftersloth');
    expect(r.score).toBeGreaterThan(0); expect(r.score).toBeLessThanOrEqual(100);
    expect(r.minutes).toBeCloseTo(32 / 60, 1);
    const ev = events.find((e) => e.type === 'dj:setFinished');
    expect(ev?.payload).toEqual({ venue: 'aftersloth', score: r.score, minutes: r.minutes });
    expect(g.active).toBe(false);
    expect(g.deck(0).playing).toBe(false);
  });
  it('roomBeat follows the louder playing deck', () => {
    const { g } = setup(1, 2);
    expect(g.roomBeat).toBeNull();
    g.play(0); g.play(1); g.setCrossfader(0.9);
    run(g, 1);
    expect(g.roomBeat?.bpm).toBeCloseTo(rec(2).bpm, 3);
  });
});
