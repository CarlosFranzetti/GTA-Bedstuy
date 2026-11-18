import { describe, expect, it } from 'vitest';
import { CombatSfx, LEVELS, type SfxHost } from '@/game/combat/sfx';

/** A context that records what is scheduled, enough for the synth to run. */
function fakeHost(): { host: SfxHost; started: number; gains: number[] } {
  const rec = { started: 0, gains: [] as number[] };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime(v: number) { rec.gains.push(v); } });
  const node = () => ({ connect() { return this; }, start() { rec.started++; }, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: param(), Q: { value: 0 }, type: '', buffer: null as unknown });
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 8000,
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    createBufferSource: node, createBiquadFilter: node, createGain: node, createOscillator: node,
  } as unknown as AudioContext;
  return { host: { ctx, dest: {} as AudioNode }, get started() { return rec.started; }, gains: rec.gains };
}

describe('combat sounds', () => {
  it('every sound plays something when there is a context, and nothing (no error) when there is none or it is closed', () => {
    const f = fakeHost();
    const sfx = new CombatSfx(() => f.host);
    const calls: Array<() => void> = [() => sfx.whoosh(), () => sfx.punch(false), () => sfx.punch(true), () => sfx.thud(), () => sfx.carThud(), () => sfx.glass(), () => sfx.crack(), () => sfx.tick(), () => sfx.click(), () => sfx.reload(), () => sfx.pickup(), () => sfx.throwAway()];
    for (const c of calls) { const before = f.started; c(); expect(f.started).toBeGreaterThan(before); }
    const none = new CombatSfx(() => null);
    for (const c of [() => none.crack(), () => none.reload(), () => none.carThud()]) expect(c).not.toThrow();
    (f.host.ctx as unknown as { state: string }).state = 'closed';
    const before = f.started; sfx.crack(); expect(f.started).toBe(before);
  });
  it('the level table scales the gain of its own sound only, and a reload does not pick up the click level twice', () => {
    const f = fakeHost();
    const sfx = new CombatSfx(() => f.host);
    sfx.click();
    const click = Math.max(...f.gains);
    f.gains.length = 0;
    sfx.reload();
    const reload = f.gains.slice(0, 2);                       // the first burst of a reload is the click, at the reload's own level
    expect(Math.max(...reload)).toBeCloseTo(click * (LEVELS.reload / LEVELS.click), 5);
    f.gains.length = 0;
    sfx.crack();
    expect(Math.max(...f.gains)).toBeCloseTo(0.95 * LEVELS.crack, 5);
  });
});
