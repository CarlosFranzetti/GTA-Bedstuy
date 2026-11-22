import { describe, expect, it } from 'vitest';
import { TutorialEngine } from '@/ui/tutorial/engine';
import type { StepDef, TutorialCtx } from '@/ui/tutorial/types';
import { newContext } from '@/ui/tutorial/context';

const line = (s: string): StepDef['text'] => ({ keyboard: s, gamepad: s, touch: s });
const ctx = (o: Partial<TutorialCtx> = {}): TutorialCtx => ({ ...newContext(), ...o });

/** Three plain steps: a flag each, so the test decides when they are done. */
function steps(flags: Record<string, boolean>, extra: StepDef[] = []): StepDef[] {
  return [
    { id: 'a', text: line('A'), why: 'why a', done: () => flags.a },
    { id: 'b', text: line('B'), plain: { keyboard: 'B, plainly' }, why: 'why b', done: () => flags.b },
    { id: 'c', text: line('C'), why: 'why c', done: () => flags.c },
    ...extra,
  ];
}
const run = (e: TutorialEngine, seconds: number, c: TutorialCtx, dt = 0.1): void => { for (let t = 0; t < seconds - 1e-9; t += dt) e.update(dt, c); };

describe('tutorial engine: order, completion, tick', () => {
  it('goes through the steps in order, each done when its test says so, with a tick between', () => {
    const f = { a: false, b: false, c: false };
    const e = new TutorialEngine(steps(f));
    const done: string[] = []; e.onStepDone = (id) => done.push(id);
    e.start();
    const c = ctx();
    e.update(0.1, c);
    expect(e.current?.id).toBe('a');
    expect(e.view(c).visible).toBe(true);
    expect(e.view(c).dots.map((d) => d.current)).toEqual([true, false, false]);
    f.a = true; e.update(0.1, c);
    expect(done).toEqual(['a']);
    expect(e.view(c).tick).toBe(true);           // the tick shows first
    expect(e.view(c).id).toBe('a');
    run(e, 1.0, c);
    expect(e.current?.id).toBe('b');
    expect(e.view(c).tick).toBe(false);
    expect(e.view(c).dots.map((d) => d.done)).toEqual([true, false, false]);
    f.b = true; f.c = true; run(e, 3, c);
    expect(done).toEqual(['a', 'b', 'c']);
  });

  it('after the last step it says goodbye, then finishes done and hands back nothing deferred', () => {
    const f = { a: true, b: true, c: true };
    const e = new TutorialEngine(steps(f));
    let out = ''; e.onFinish = (o, d) => { out = `${o}:${d.length}`; };
    e.start();
    const c = ctx();
    run(e, 6, c);
    expect(e.view(c).kind).toBe('bye');
    expect(e.view(c).text).toMatch(/block is yours/);
    run(e, 6, c);
    expect(out).toBe('done:0');
    expect(e.running).toBe(false);
  });
});

describe('tutorial engine: availability and coming back', () => {
  it('a step whose thing is not near is skipped and offered when it is', () => {
    const f = { a: false, b: false, c: false };
    const gated: StepDef = { id: 'car', text: line('Car'), why: '', when: (c) => c.nearCar < 10, done: (c) => c.inVehicle };
    const e = new TutorialEngine([steps(f)[0], gated, steps(f)[1]]);
    e.start();
    const c = ctx();
    f.a = true; run(e, 1.2, c);
    expect(e.current?.id).toBe('b');             // car is not near: b is next
    c.nearCar = 5; f.b = true; run(e, 1.2, c);
    expect(e.current?.id).toBe('car');           // it came back
    c.inVehicle = true; run(e, 0.2, c);
    expect(e.completed).toContain('car');
  });

  it('a step that stays unavailable for four seconds goes back to the pool and the next one takes the card', () => {
    const f = { a: false, b: false, c: false };
    const gated: StepDef = { id: 'car', text: line('Car'), why: '', when: (c) => c.nearCar < 10, done: (c) => c.inVehicle };
    const e = new TutorialEngine([gated, steps(f)[0]]);
    e.start();
    const c = ctx({ nearCar: 5 });
    e.update(0.1, c); expect(e.current?.id).toBe('car');
    c.nearCar = 99; run(e, 4.5, c);
    expect(e.current?.id).toBe('a');
  });

  it('a `last` step waits until nothing else can be done; steps that never became available are handed back as deferred', () => {
    const f = { a: false, b: false, c: false };
    const gated: StepDef = { id: 'car', text: line('Car'), why: '', when: (c) => c.nearCar < 10, done: (c) => c.inVehicle };
    const last: StepDef = { id: 'home', text: line('Home'), why: '', last: true, auto: 1 };
    const e = new TutorialEngine([steps(f)[0], gated, last]);
    let got: string[] = []; e.onFinish = (_o, d) => { got = d; };
    e.start();
    const c = ctx();
    e.update(0.1, c); expect(e.current?.id).toBe('a');
    f.a = true; run(e, 1.2, c);
    expect(e.current?.id).toBe('home');          // car never came near: the last step has its turn
    run(e, 1.2 + 1 + 6, c);
    expect(e.running).toBe(false);
    expect(got).toEqual(['car']);
  });

  it('an opportunistic step (the vault) takes the card after a short dwell and the step it interrupted comes back', () => {
    const f = { a: false, b: false, c: false };
    const vault: StepDef = { id: 'vault', text: line('Vault'), why: '', opportunistic: true, when: (c) => c.nearCar < 7, done: (c) => c.vaulting };
    const e = new TutorialEngine([vault, ...steps(f)]);
    e.start();
    const c = ctx();
    e.update(0.1, c); expect(e.current?.id).toBe('a');
    c.nearCar = 4; e.update(0.3, c); expect(e.current?.id).toBe('a');   // not yet: walking past
    e.update(0.5, c); expect(e.current?.id).toBe('vault');
    c.vaulting = true; run(e, 1.2, c);
    expect(e.completed).toContain('vault');
    expect(e.current?.id).toBe('a');
  });
});

describe('tutorial engine: timeouts, skip, hiding', () => {
  it('after 20 s the hint repeats more plainly; after 45 s the card offers to move on', () => {
    const f = { a: true, b: false, c: false };
    const e = new TutorialEngine(steps(f));
    e.start();
    const c = ctx();
    run(e, 1.5, c);
    expect(e.current?.id).toBe('b');
    run(e, 10, c); expect(e.view(c).stage).toBe('hint'); expect(e.view(c).text).toBe('B');
    run(e, 11, c);  expect(e.view(c).stage).toBe('plain'); expect(e.view(c).text).toBe('B, plainly');
    run(e, 25, c);  expect(e.view(c).stage).toBe('offer');
  });

  it('a step without a plain line repeats its normal line', () => {
    const e = new TutorialEngine(steps({ a: false, b: false, c: false }));
    e.start(); const c = ctx(); run(e, 22, c);
    expect(e.view(c).stage).toBe('plain'); expect(e.view(c).text).toBe('A');
  });

  it('moving on drops the step for good and shows a tick', () => {
    const e = new TutorialEngine(steps({ a: false, b: false, c: false }));
    e.start(); const c = ctx(); e.update(0.1, c);
    e.skipStep(); run(e, 1.2, c);
    expect(e.current?.id).toBe('b');
    expect(e.view(c).dots.map((d) => d.done)).toEqual([true, false, false]);
    expect(e.completed).toEqual([]);
  });

  it('skip tutorial ends it at once as skipped, with nothing deferred', () => {
    const e = new TutorialEngine(steps({ a: false, b: false, c: false }));
    let out = ''; e.onFinish = (o, d) => { out = `${o}:${d.length}`; };
    e.start(); e.update(0.1, ctx());
    e.skipAll();
    expect(out).toBe('skipped:0');
    expect(e.view(ctx()).visible).toBe(false);
    e.update(0.1, ctx());                         // nothing happens after
    expect(e.state).toBe('finished');
  });

  it('hides under a panel: the clock stands still, nothing is offered, the step waits, and it comes back where it was', () => {
    const e = new TutorialEngine(steps({ a: false, b: false, c: false }));
    e.start();
    const open = ctx({ blocked: true, panel: 'menu' });
    const shut = ctx();
    run(e, 15, shut);
    const t0 = e.stepTime;
    run(e, 60, open);
    expect(e.view(open).visible).toBe(false);
    expect(e.stepTime).toBeCloseTo(t0, 5);
    expect(e.stage).toBe('hint');
    expect(e.view(shut).visible).toBe(true);
    expect(e.current?.id).toBe('a');
  });

  it('a panel the player opened counts as seen for the step in progress, even though the card is hidden', () => {
    const step: StepDef = { id: 'phone', text: line('Phone'), why: '', done: (_c, s) => s.seen.has('phone') };
    const e = new TutorialEngine([step]);
    e.start();
    e.update(0.1, ctx());
    e.update(0.1, ctx({ blocked: true, panel: 'phone' }));
    expect(e.completed).toEqual(['phone']);
  });

  it('resume: a second run with only the deferred ids and no goodbye', () => {
    const e = new TutorialEngine(steps({ a: true, b: true, c: true }));
    let out = ''; e.onFinish = (o) => { out = o; };
    e.start(['b', 'c'], false);
    const c = ctx();
    run(e, 4, c);
    expect(out).toBe('done');
    expect(e.completed).toEqual(['b', 'c']);
  });

  it('an info step finishes by itself after its time, counted only while visible', () => {
    const info: StepDef = { id: 'info', text: line('Info'), why: '', auto: 2 };
    const e = new TutorialEngine([info]);
    e.start();
    run(e, 5, ctx({ blocked: true }));
    expect(e.completed).toEqual([]);
    run(e, 2.2, ctx());
    expect(e.completed).toEqual(['info']);
  });
});
