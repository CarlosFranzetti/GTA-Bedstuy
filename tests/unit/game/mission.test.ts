import { describe, it, expect } from 'vitest';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef, MissionEvents } from '@/game/missions/types';

const P = (x: number, z = 0) => ({ x, z });

/** A tiny mission exercising most objective kinds. Giver at x=0, goal at x=100, drop at x=200. */
function def(over: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 't1', title: 'Test Job', blurb: 'go', giverPoi: 'x', giver: P(0), triggerRadius: 5,
    objectives: [
      { kind: 'pickUp', at: P(100), radius: 4, presence: 'any', items: ['box'], text: 'get box' },
      { kind: 'deliver', at: P(200), radius: 4, presence: 'any', items: ['box'], text: 'drop box' },
    ],
    reward: { cash: 100, message: 'nice' },
    ...over,
  };
}

function boot(d: MissionDef[] = [def()], opts = {}) {
  const m = new MissionSystem(d, opts);
  m.update(1 / 60, P(50), false, 0); // outside the zone: arms the trigger
  return m;
}

const step = (m: MissionSystem, pos: { x: number; z: number }, n = 1, inCar = false, stars = 0, speed = 0, hour = -1, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) m.update(dt, pos, inCar, stars, speed, hour);
};

describe('MissionSystem state machine', () => {
  it('starts available and shows a giver marker', () => {
    const m = boot();
    expect(m.statusOf('t1')).toBe('available');
    expect(m.markers).toHaveLength(1);
    expect(m.markers[0]).toMatchObject({ kind: 'giver', x: 0, z: 0, radius: 5 });
  });

  it('trigger radius: just outside does nothing, just inside starts', () => {
    const m = boot();
    step(m, P(5.01));
    expect(m.isActive).toBe(false);
    step(m, P(4.99));
    expect(m.isActive).toBe(true);
    expect(m.activeId).toBe('t1');
    expect(m.hud).toMatchObject({ status: 'active', title: 'Test Job', objective: 'get box', step: 1, steps: 2 });
  });

  it('does not start if the player is already inside the zone at boot, until they leave and come back', () => {
    const m = new MissionSystem([def()]);
    step(m, P(0), 5);
    expect(m.isActive).toBe(false);
    step(m, P(50));
    step(m, P(0));
    expect(m.isActive).toBe(true);
  });

  it('walks the objective chain, tracks inventory and completes with the reward', () => {
    const m = boot();
    const seen: string[] = [];
    m.on('mission:started', (e) => seen.push(`start:${e.id}`));
    m.on('mission:objective', (e: MissionEvents['mission:objective']) => seen.push(`obj:${e.index}/${e.total}`));
    m.on('mission:completed', (e) => seen.push(`done:${e.cash}:${e.totalCash}`));
    step(m, P(0));
    expect(m.markers).toHaveLength(1);
    expect(m.markers[0]).toMatchObject({ kind: 'objective', x: 100 });
    step(m, P(100), 2);
    expect(m.carrying).toEqual(['box']);
    expect(m.hud.carrying).toBe('box');
    expect(m.objectiveIndex).toBe(1);
    step(m, P(200), 2);
    expect(m.isActive).toBe(false);
    expect(m.statusOf('t1')).toBe('complete');
    expect(m.cash).toBe(100);
    expect(m.hud.cash).toBe(100);
    expect(m.carrying).toEqual([]);
    expect(m.markers).toHaveLength(0);
    expect(seen).toEqual(['start:t1', 'obj:0/2', 'obj:1/2', 'done:100:100']);
  });

  it('deliver does nothing without the item and one objective advances per update', () => {
    const d = def({ objectives: [
      { kind: 'deliver', at: P(10), radius: 3, presence: 'any', items: ['box'], text: 'drop' },
    ] });
    const m = boot([d]);
    step(m, P(0));
    step(m, P(10), 30);
    expect(m.isActive).toBe(true); // nothing carried
    const d2 = def({ objectives: [
      { kind: 'goTo', at: P(10), radius: 3, presence: 'any', text: 'a' },
      { kind: 'goTo', at: P(10), radius: 3, presence: 'any', text: 'b' },
    ] });
    const m2 = boot([d2]);
    step(m2, P(0));
    step(m2, P(10), 1);
    expect(m2.objectiveIndex).toBe(1);
    step(m2, P(10), 1);
    expect(m2.statusOf('t1')).toBe('complete');
  });

  it('presence: onFoot / inVehicle', () => {
    const d = def({ objectives: [
      { kind: 'goTo', at: P(10), radius: 3, presence: 'onFoot', text: 'walk' },
      { kind: 'goTo', at: P(20), radius: 3, presence: 'inVehicle', text: 'drive' },
    ] });
    const m = boot([d]);
    step(m, P(0));
    step(m, P(10), 5, true);
    expect(m.objectiveIndex).toBe(0);
    step(m, P(10), 1, false);
    expect(m.objectiveIndex).toBe(1);
    step(m, P(20), 5, false);
    expect(m.objectiveIndex).toBe(1);
    step(m, P(20), 1, true);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('one mission at a time; a completed mission never re-triggers', () => {
    const a = def({ id: 'a', giver: P(0) });
    const b = def({ id: 'b', title: 'B', giver: P(30) });
    const m = new MissionSystem([a, b]);
    step(m, P(15));
    step(m, P(0));
    expect(m.activeId).toBe('a');
    step(m, P(30), 3);
    expect(m.activeId).toBe('a');
    step(m, P(100), 3); step(m, P(200), 3);
    expect(m.statusOf('a')).toBe('complete');
    step(m, P(0), 5);
    expect(m.activeId).toBe(null);
    step(m, P(30));
    expect(m.activeId).toBe('b');
    step(m, P(15)); step(m, P(0), 3);
    expect(m.activeId).toBe('b');
  });

  it('availableHours gates the start and hints once', () => {
    const d = def({ availableHours: [6, 18] });
    const m = boot([d]);
    const seq = m.hud.toastSeq;
    step(m, P(0), 10, false, 0, 0, 20);
    expect(m.isActive).toBe(false);
    expect(m.hud.toastSeq).toBe(seq + 1);
    expect(m.hud.toast).toContain('come back');
    step(m, P(0), 10, false, 0, 0, 20);
    expect(m.hud.toastSeq).toBe(seq + 1);
    step(m, P(0), 1, false, 0, 0, 12);
    expect(m.isActive).toBe(true);
  });
});

describe('failure, timers and retry', () => {
  it('mission time limit fails with timeUp and clears the markers', () => {
    const m = boot([def({ timeLimit: 10 })]);
    const failed: string[] = [];
    m.on('mission:failed', (e) => failed.push(e.reason));
    step(m, P(0));
    step(m, P(50), 9 * 60);
    expect(m.isActive).toBe(true);
    expect(m.hud.timeLeft).toBeGreaterThan(0.5);
    step(m, P(50), 2 * 60);
    expect(m.isFailed).toBe(true);
    expect(m.failReason).toBe('timeUp');
    expect(failed).toEqual(['timeUp']);
    expect(m.hud.status).toBe('failed');
    expect(m.hud.retryPrompt).toContain('R');
    expect(m.markers).toHaveLength(0);
    expect(m.cash).toBe(0);
  });

  it('a failed mission is frozen: no progress and no other mission starts', () => {
    const m = boot([def({ timeLimit: 1 }), def({ id: 'o', giver: P(300) })]);
    step(m, P(0));
    step(m, P(100), 120);
    expect(m.isFailed).toBe(true);
    step(m, P(200), 10);
    step(m, P(300), 10);
    expect(m.isFailed).toBe(true);
    expect(m.activeId).toBe('t1');
  });

  it('per-objective time limit', () => {
    const d = def({ objectives: [
      { kind: 'goTo', at: P(100), radius: 4, presence: 'any', text: 'go', timeLimit: 5 },
      { kind: 'goTo', at: P(200), radius: 4, presence: 'any', text: 'go2' },
    ] });
    const m = boot([d]);
    step(m, P(0));
    step(m, P(100), 2);
    step(m, P(150), 20 * 60); // second objective has no limit
    expect(m.isActive).toBe(true);
    const m2 = boot([d]);
    step(m2, P(0));
    step(m2, P(50), 6 * 60);
    expect(m2.failReason).toBe('timeUp');
  });

  it('timeLeft reports the tightest clock', () => {
    const m = boot([def({ timeLimit: 100, objectives: [{ kind: 'goTo', at: P(100), radius: 4, presence: 'any', text: 'go', timeLimit: 30 }] })]);
    step(m, P(0));
    step(m, P(50), 60 * 10);
    expect(m.hud.timeLeft).toBeGreaterThan(19);
    expect(m.hud.timeLeft).toBeLessThan(21);
  });

  it('deadline hour fails with clockUp when the game clock passes it', () => {
    const d = def({ deadlineHour: 20, objectives: [{ kind: 'goTo', at: P(100), radius: 4, presence: 'any', text: 'go' }] });
    const m = boot([d]);
    step(m, P(0), 1, false, 0, 0, 19.5);
    step(m, P(50), 1, false, 0, 0, 19.9);
    expect(m.isActive).toBe(true);
    expect(m.hud.timeLeft).toBeCloseTo(6, 0); // 0.1 game hours at 1 game hour per real minute = 6 s
    step(m, P(50), 1, false, 0, 0, 20.01);
    expect(m.failReason).toBe('clockUp');
  });

  it('deadline hour wraps past midnight and does not fail while the clock is still before it', () => {
    const d = def({ deadlineHour: 1, objectives: [{ kind: 'goTo', at: P(100), radius: 4, presence: 'any', text: 'go' }] });
    const m = boot([d]);
    step(m, P(0), 1, false, 0, 0, 23.5);
    step(m, P(50), 1, false, 0, 0, 23.99);
    step(m, P(50), 1, false, 0, 0, 0.2);
    expect(m.isActive).toBe(true);
    step(m, P(50), 1, false, 0, 0, 1.1);
    expect(m.failReason).toBe('clockUp');
  });

  it('retry resets everything: objective, clocks, inventory, markers', () => {
    const m = boot([def({ timeLimit: 10 })]);
    step(m, P(0));
    step(m, P(100), 2);
    expect(m.carrying).toEqual(['box']);
    step(m, P(150), 12 * 60);
    expect(m.isFailed).toBe(true);
    expect(m.retry()).toBe(true);
    expect(m.isActive).toBe(true);
    expect(m.objectiveIndex).toBe(0);
    expect(m.carrying).toEqual([]);
    expect(m.hud).toMatchObject({ status: 'active', step: 1, carrying: '', retryPrompt: '' });
    expect(m.hud.timeLeft).toBeGreaterThan(9.5);
    expect(m.markers).toHaveLength(1);
    expect(m.markers[0].x).toBe(100);
    // and it can be completed after the retry
    step(m, P(100), 2); step(m, P(200), 2);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('retry is a no-op unless failed; abandon returns to available and re-arms on leaving the zone', () => {
    const m = boot([def({ timeLimit: 1 })]);
    expect(m.retry()).toBe(false);
    step(m, P(0));
    expect(m.retry()).toBe(false);
    step(m, P(2), 90);
    expect(m.isFailed).toBe(true);
    expect(m.abandon()).toBe(true);
    expect(m.statusOf('t1')).toBe('available');
    expect(m.hud.status).toBe('idle');
    step(m, P(0), 5);
    expect(m.isActive).toBe(false); // still standing in the zone
    step(m, P(40)); step(m, P(0));
    expect(m.isActive).toBe(true);
  });

  it('stayInVehicle: leaving the car for longer than the grace fails; getting back in resets the grace', () => {
    const d = def({ objectives: [{ kind: 'goTo', at: P(100), radius: 4, presence: 'any', text: 'drive', stayInVehicle: 3 }] });
    const m = boot([d]);
    step(m, P(0));
    step(m, P(30), 2 * 60, false);
    step(m, P(30), 1, true);
    step(m, P(30), 2 * 60, false);
    expect(m.isActive).toBe(true);
    step(m, P(30), 2 * 60, false);
    expect(m.failReason).toBe('leftVehicle');
  });
});

describe('objective kinds', () => {
  const run = (o: MissionDef['objectives'][number]) => {
    const m = boot([def({ objectives: [o] })]);
    step(m, P(0));
    return m;
  };

  it('enterVehicle', () => {
    const m = run({ kind: 'enterVehicle', text: 'car' });
    step(m, P(10), 5, false);
    expect(m.isActive).toBe(true);
    step(m, P(10), 1, true);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('timer counts mission time and reports progress', () => {
    const m = run({ kind: 'timer', seconds: 2, text: 'wait' });
    step(m, P(10), 60);
    expect(m.hud.progress).toBeCloseTo(0.5, 1);
    step(m, P(10), 70);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('surviveWanted only counts while wanted', () => {
    const m = run({ kind: 'surviveWanted', seconds: 2, minStars: 2, text: 'survive' });
    step(m, P(10), 3 * 60, false, 1);
    expect(m.isActive).toBe(true);
    step(m, P(10), 60, false, 2);
    expect(m.isActive).toBe(true);
    step(m, P(10), 70, false, 3);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('loseWanted completes at zero stars', () => {
    const m = run({ kind: 'loseWanted', text: 'lose' });
    step(m, P(10), 10, false, 2);
    expect(m.isActive).toBe(true);
    step(m, P(10), 1, false, 0);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('holdSpeedBelow needs an unbroken stretch and optionally a zone', () => {
    const m = run({ kind: 'holdSpeedBelow', kmh: 5, seconds: 1, at: P(50), radius: 5, text: 'still' });
    step(m, P(50), 50, true, 0, 0);
    step(m, P(50), 1, true, 0, 10); // 36 km/h resets
    step(m, P(50), 50, true, 0, 0);
    expect(m.isActive).toBe(true);
    step(m, P(90), 120, true, 0, 0); // outside the zone does not count
    expect(m.isActive).toBe(true);
    step(m, P(50), 70, true, 0, 0);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('escapeRadius', () => {
    const m = run({ kind: 'escapeRadius', from: P(0), radius: 100, text: 'run' });
    step(m, P(99), 5);
    expect(m.isActive).toBe(true);
    step(m, P(101), 1);
    expect(m.statusOf('t1')).toBe('complete');
  });

  it('raiseWantedTo asks the host once, clamped to 3, with the position', () => {
    const calls: Array<[number, number, number]> = [];
    const m = boot([def({ objectives: [{ kind: 'goTo', at: P(10), radius: 3, presence: 'any', text: 'x', raiseWantedTo: 9 }] })], {
      raiseWanted: (n: number, p: { x: number; z: number }) => calls.push([n, p.x, p.z]),
    });
    step(m, P(0));
    step(m, P(10), 3);
    expect(calls).toEqual([[3, 10, 0]]);
  });
});

describe('events, bus mirror and rewards', () => {
  it('mirrors every event to the bus', () => {
    const sent: string[] = [];
    const m = boot([def({ timeLimit: 1 })], { bus: { emit: (t: string) => sent.push(t) } });
    step(m, P(0));
    step(m, P(50), 90);
    expect(sent).toEqual(['mission:started', 'mission:objective', 'mission:failed']);
  });

  it('toast sequence bumps on start, objective message, complete and fail', () => {
    const m = boot([def({ objectives: [{ kind: 'goTo', at: P(10), radius: 3, presence: 'any', text: 'x', doneMessage: 'halfway' }] })]);
    const s0 = m.hud.toastSeq;
    step(m, P(0));
    expect(m.hud.toastSeq).toBe(s0 + 1);
    step(m, P(10), 2);
    expect(m.hud.toast).toContain('Test Job done');
    expect(m.hud.toast).toContain('+$100');
    expect(m.hud.toastKind).toBe('good');
  });

  it('listeners can unsubscribe', () => {
    const m = boot();
    let n = 0;
    const off = m.on('mission:started', () => { n++; });
    off();
    step(m, P(0));
    expect(n).toBe(0);
  });
});

describe('serialize / restore', () => {
  it('round trips completed missions and cash through JSON', () => {
    const a = def({ id: 'a' });
    const b = def({ id: 'b', giver: P(500) });
    const saved: unknown[] = [];
    const m = new MissionSystem([a, b], { persist: (s) => saved.push(JSON.parse(JSON.stringify(s))) });
    step(m, P(50)); step(m, P(0)); step(m, P(100), 2); step(m, P(200), 2);
    expect(saved).toHaveLength(1);
    const json = JSON.stringify(m.serialize());
    expect(JSON.parse(json)).toEqual({ v: 1, completed: ['a'], cash: 100 });

    const m2 = new MissionSystem([a, b]);
    expect(m2.restore(JSON.parse(json))).toBe(true);
    expect(m2.statusOf('a')).toBe('complete');
    expect(m2.statusOf('b')).toBe('available');
    expect(m2.cash).toBe(100);
    expect(m2.hud.cash).toBe(100);
    expect(m2.markers.map((k) => k.id)).toEqual(['b:giver']);
    expect(m2.serialize()).toEqual(m.serialize());
    // a restored completed mission does not re-trigger
    step(m2, P(50)); step(m2, P(0), 3);
    expect(m2.isActive).toBe(false);
  });

  it('rejects malformed saves and leaves state untouched; ignores unknown ids', () => {
    const m = boot();
    for (const bad of [null, 5, 'x', {}, { v: 2, completed: [], cash: 0 }, { v: 1, completed: [1], cash: 0 }, { v: 1, completed: [], cash: -1 }, { v: 1, completed: [], cash: NaN }, { v: 1, completed: 'a', cash: 0 }]) {
      expect(m.restore(bad)).toBe(false);
    }
    expect(m.statusOf('t1')).toBe('available');
    expect(m.restore({ v: 1, completed: ['nope'], cash: 12 })).toBe(true);
    expect(m.statusOf('t1')).toBe('available');
    expect(m.cash).toBe(12);
  });

  it('restore during a run drops the run', () => {
    const m = boot();
    step(m, P(0));
    expect(m.isActive).toBe(true);
    m.restore({ v: 1, completed: [], cash: 0 });
    expect(m.isActive).toBe(false);
    expect(m.hud.status).toBe('idle');
  });
});

describe('no per-step allocation in steady state', () => {
  it('update with an active mission leaves the marker array and hud object in place', () => {
    const m = boot();
    step(m, P(0));
    const markers = m.markers, hud = m.hud, v = m.markersVersion;
    step(m, P(30), 1000);
    expect(m.markers).toBe(markers);
    expect(m.hud).toBe(hud);
    expect(m.markersVersion).toBe(v);
  });
});
