import { describe, it, expect } from 'vitest';
import { MissionSystem, inHourWindow } from '@/game/missions/MissionSystem';
import type { MissionDef, ObjectiveDef } from '@/game/missions/types';
import { Bot } from './missionBot';

const P = (x: number, z = 0) => ({ x, z });

function mk(objectives: ObjectiveDef[], over: Partial<MissionDef> = {}): MissionDef {
  return { id: 'k', title: 'Kind Test', blurb: 'go', giverPoi: 'x', giver: P(0), triggerRadius: 3, objectives, reward: { cash: 10, message: 'ok' }, ...over };
}

function run(def: MissionDef, opts = {}, hour = 12) {
  const m = new MissionSystem([def], opts);
  const bot = new Bot(m, P(0), hour);
  bot.startMission(def);
  return { m, bot };
}

describe('talkTo / interact', () => {
  const def = mk([{ kind: 'talkTo', at: P(50), radius: 2, npc: 'Ms. Odette', lines: ['one', 'two'], text: 'talk' }]);

  it('needs F in range, shows each line, then completes', () => {
    const { m, bot } = run(def);
    bot.go(P(60), 5); // out of range (10 m)
    expect(bot.press()).toBe(false);
    expect(m.hud.prompt).toBe('');
    bot.go(P(50), 5);
    expect(m.hud.prompt).toBe('F  Talk to Ms. Odette');
    expect(bot.press()).toBe(true);
    expect(m.hud.toast).toBe('Ms. Odette: "one"');
    expect(m.isActive).toBe(true);
    bot.press(); bot.wait(0.1);
    expect(m.hud.toast).toBe('Ms. Odette: "two"');
    expect(m.isCompleted('k')).toBe(true);
  });

  it('is on foot only by default', () => {
    const { m, bot } = run(def);
    bot.go(P(50), 5);
    bot.inCar = true;
    bot.wait(0.1);
    expect(bot.press()).toBe(false);
    expect(m.hud.prompt).toBe('');
  });

  it('interact counts presses and shows progress', () => {
    const d = mk([{ kind: 'interact', at: P(20), radius: 3, prompt: 'Crank it', presses: 4, text: 'crank' }]);
    const { m, bot } = run(d);
    bot.go(P(20), 5);
    expect(m.hud.prompt).toBe('F  Crank it');
    bot.press(); bot.press();
    bot.wait(0.05);
    expect(m.hud.progress).toBeCloseTo(0.5);
    bot.press(); bot.press(); bot.wait(0.1);
    expect(m.isCompleted('k')).toBe(true);
  });

  it('interact does nothing when no mission is active', () => {
    const m = new MissionSystem([def]);
    expect(m.interact(P(50))).toBe(false);
  });
});

describe('tail', () => {
  const def = mk([{ kind: 'tail', route: [P(100), P(100, 100)], speed: 5, maxDistance: 20, grace: 3, target: 'car', text: 'tail' }]);

  it('the target waits until you are close, moves, and completes at the end', () => {
    const { m, bot } = run(def);
    bot.wait(5);
    expect(m.markers[0]).toMatchObject({ x: 100, z: 0 }); // not engaged: nobody moves
    bot.followTail(def.objectives[0] as never);
    expect(m.isCompleted('k')).toBe(true);
  });

  it('the moving marker is re-published (version bumps) so the 3D view follows it', () => {
    const { m, bot } = run(def);
    bot.go(P(95), 8);
    const v = m.markersVersion;
    bot.x = 100; bot.z = 0; bot.wait(2);
    expect(m.markersVersion).toBeGreaterThan(v);
    expect(m.markers[0].z).toBeGreaterThan(5);
  });

  it('lagging behind for longer than the grace fails with lostTarget', () => {
    const { m, bot } = run(def);
    bot.go(P(95), 8);
    bot.wait(2);      // engaged, target pulls away at 5 m/s
    bot.wait(8);
    expect(m.failReason).toBe('lostTarget');
  });

  it('a brief lag inside the grace is forgiven', () => {
    const { m, bot } = run(def);
    bot.go(P(95), 8);
    bot.wait(1);
    bot.x = 100; bot.z = 40; // 30 m behind for ~2 s
    bot.wait(2);
    bot.x = 100; bot.z = 15; bot.wait(0.1);
    expect(m.isFailed).toBe(false);
  });
});

describe('collect', () => {
  it('visits every point in any order and carries the item', () => {
    const d = mk([{ kind: 'collect', points: [P(30), P(60), P(90)], radius: 3, presence: 'onFoot', item: 'flyer', text: 'collect' }]);
    const { m, bot } = run(d);
    bot.go(P(90), 6);
    expect(m.markers.map((k) => Math.round(k.x))).toEqual([30, 60]);
    expect(m.hud.progress).toBeCloseTo(1 / 3);
    bot.go(P(30), 6); bot.go(P(60), 6); bot.wait(0.1);
    expect(m.isCompleted('k')).toBe(true);
  });

  it('ordered shows one marker at a time and ignores the wrong point', () => {
    const d = mk([{ kind: 'collect', ordered: true, points: [P(30), P(60)], radius: 3, presence: 'onFoot', item: 'flyer', text: 'collect' }, { kind: 'timer', seconds: 100, text: 'hold' }]);
    const { m, bot } = run(d);
    expect(m.markers).toHaveLength(1);
    bot.go(P(60), 6);
    expect(m.objectiveIndex).toBe(0);
    bot.go(P(30), 6); bot.go(P(60), 6); bot.wait(0.1);
    expect(m.objectiveIndex).toBe(1);
    expect(m.carrying).toEqual(['flyer', 'flyer']);
  });
});

describe('waitUntilHour', () => {
  const d = mk([{ kind: 'waitUntilHour', from: 23, to: 4, text: 'wait' }]);

  it('window math wraps midnight', () => {
    expect(inHourWindow(23.5, 23, 4)).toBe(true);
    expect(inHourWindow(2, 23, 4)).toBe(true);
    expect(inHourWindow(4, 23, 4)).toBe(false);
    expect(inHourWindow(12, 23, 4)).toBe(false);
    expect(inHourWindow(5, 4, 6)).toBe(true);
    expect(inHourWindow(1, 22, 26)).toBe(true);
  });

  it('completes when the clock gets there, not before', () => {
    const { m, bot } = run(d, {}, 22.5);
    bot.wait(20); // 22.83
    expect(m.isActive).toBe(true);
    bot.wait(30); // 23.33
    expect(m.isCompleted('k')).toBe(true);
  });

  it('with a place, you also have to be standing there', () => {
    const d2 = mk([{ kind: 'waitUntilHour', from: 23, to: 4, at: P(40), radius: 5, text: 'wait' }]);
    const { m, bot } = run(d2, {}, 23.5);
    bot.wait(2);
    expect(m.isActive).toBe(true);
    bot.go(P(40), 5); bot.wait(0.1);
    expect(m.isCompleted('k')).toBe(true);
  });
});

describe('interiors, shop, DJ', () => {
  it('enterInterior and exitInterior follow host signals, and a mission started inside counts', () => {
    const d = mk([{ kind: 'enterInterior', id: 'deli', text: 'in' }, { kind: 'exitInterior', id: 'deli', text: 'out' }]);
    const { m, bot } = run(d);
    m.notify({ type: 'interior:entered', id: 'club' });
    bot.wait(0.1);
    expect(m.objectiveIndex).toBe(0);
    m.notify({ type: 'interior:entered', id: 'deli' });
    bot.wait(0.1);
    expect(m.objectiveIndex).toBe(1);
    expect(m.insideInterior).toBe('deli');
    m.notify({ type: 'interior:exited', id: 'deli' });
    bot.wait(0.1);
    expect(m.isCompleted('k')).toBe(true);

    const { m: m2, bot: b2 } = (() => { const mm = new MissionSystem([d]); const bb = new Bot(mm, P(0)); mm.notify({ type: 'interior:entered', id: 'deli' }); bb.startMission(d); return { m: mm, bot: bb }; })();
    b2.wait(0.1);
    expect(m2.objectiveIndex).toBe(1);
  });

  it('buy needs every record (any order), counts each once, and ignores other shops', () => {
    const d = mk([{ kind: 'buy', shop: 'wax-deli', items: ['a', 'b', 'c'], text: 'buy' }]);
    const { m, bot } = run(d);
    m.notify({ type: 'shop:bought', recordId: 'a', shop: 'other-shop' });
    m.notify({ type: 'shop:bought', recordId: 'a', shop: 'wax-deli' });
    m.notify({ type: 'shop:bought', recordId: 'a', shop: 'wax-deli' });
    m.notify({ type: 'shop:bought', recordId: 'zzz', shop: 'wax-deli' });
    bot.wait(0.1);
    expect(m.hud.progress).toBeCloseTo(1 / 3);
    m.notify({ type: 'shop:bought', recordId: 'c' });
    bot.wait(0.1);
    expect(m.isActive).toBe(true);
    m.notify({ type: 'shop:bought', recordId: 'b', shop: 'wax-deli' });
    bot.wait(0.1);
    expect(m.isCompleted('k')).toBe(true);
  });

  it('djSet: exposes the request, rejects short sets, passes at the mark, fails below it', () => {
    const d = mk([{ kind: 'djSet', venue: 'aftersloth', minutes: 2, minScore: 60, at: P(5), radius: 4, text: 'dj' }]);
    const { m, bot } = run(d);
    expect(m.djRequest).toEqual({ venue: 'aftersloth', minutes: 2, minScore: 60, at: P(5), radius: 4 });
    m.notify({ type: 'dj:setFinished', venue: 'home', score: 99, minutes: 4 });
    bot.wait(0.1);
    expect(m.isActive).toBe(true);
    m.notify({ type: 'dj:setFinished', venue: 'aftersloth', score: 99, minutes: 1 });
    bot.wait(0.1);
    expect(m.isActive).toBe(true);
    expect(m.hud.toast).toContain('too short');
    m.notify({ type: 'dj:setFinished', venue: 'aftersloth', score: 60, minutes: 2 });
    bot.wait(0.1);
    expect(m.isCompleted('k')).toBe(true);
    expect(m.djRequest).toBeNull();

    const r2 = run(d);
    r2.m.notify({ type: 'dj:setFinished', venue: 'aftersloth', score: 59, minutes: 2 });
    r2.bot.wait(0.1);
    expect(r2.m.failReason).toBe('lowScore');
    expect(r2.m.djRequest).toBeNull();
  });
});

describe('sell', () => {
  const d = mk([
    { kind: 'pickUp', at: P(10), radius: 3, presence: 'onFoot', items: ['lamp', 'lamp', 'lamp'], text: 'grab' },
    { kind: 'sell', item: 'lamp', count: 3, at: P(40), radius: 6, every: 3, text: 'sell' },
  ]);

  it('customers arrive only while you are at the stand; F sells; done after the count', () => {
    const { m, bot } = run(d);
    bot.playUntil(d, 1);
    bot.go(P(0), 5);
    bot.wait(10);
    expect(m.markers.some((k) => k.id.endsWith(':cust'))).toBe(false); // away from the stand: nobody comes
    bot.sellAll(d.objectives[1] as never);
    expect(m.isCompleted('k')).toBe(true);
    expect(m.carrying).toEqual([]);
  });

  it('F far from the customer does not sell, and an ignored customer wanders off', () => {
    const { m, bot } = run(d);
    bot.playUntil(d, 1);
    bot.go(P(40), 5);
    bot.wait(3.5);
    expect(m.markers.some((k) => k.id.endsWith(':cust'))).toBe(true);
    bot.x = 40; bot.z = 20; // out of reach
    expect(bot.press()).toBe(false);
    bot.go(P(40), 5);
    bot.wait(16);
    expect(m.carrying).toEqual(['lamp', 'lamp', 'lamp']);
  });

  it('a host with real peds can report sales', () => {
    const { m, bot } = run(d);
    bot.playUntil(d, 1);
    for (let i = 0; i < 3; i++) { m.notify({ type: 'sold', item: 'lamp' }); bot.wait(0.1); }
    expect(m.isCompleted('k')).toBe(true);
  });
});

describe('rules: failIfStars, maxKmh, grant, banter, twist, requires, stake', () => {
  it('failIfStars and maxKmh fail with their reasons and jokes', () => {
    const d = mk([{ kind: 'timer', seconds: 50, text: 't', failIfStars: 1, maxKmh: 20 }], { failJoke: { copsCalled: 'busted joke', tooFast: 'fast joke' } });
    const a = run(d); a.bot.raise(1); a.bot.wait(0.1);
    expect(a.m.failReason).toBe('copsCalled'); expect(a.m.hud.toast).toContain('busted joke');
    const b = run(d); b.bot.wait(1, 9); expect(b.m.isFailed).toBe(false); b.bot.wait(1.5, 9);
    expect(b.m.failReason).toBe('tooFast'); expect(b.m.hud.toast).toContain('fast joke');
  });

  it('grant hands items over; banter shows lines on a schedule', () => {
    const d = mk([{ kind: 'timer', seconds: 30, text: 't', grant: ['cat'], banter: ['first', 'second'], banterEvery: 10 }]);
    const { m, bot } = run(d);
    bot.wait(0.1);
    expect(m.hud.toast).toBe('first');
    bot.wait(5);
    expect(m.hud.toast).toBe('first');
    bot.wait(6);
    expect(m.hud.toast).toBe('second');
    bot.wait(25);
    expect(m.isCompleted('k')).toBe(true);
  });

  it('requires hides the giver until the prerequisite is done; windows wrap midnight', () => {
    const a = mk([{ kind: 'timer', seconds: 1, text: 'a' }], { id: 'a' });
    const b = mk([{ kind: 'timer', seconds: 1, text: 'b' }], { id: 'b', title: 'B', giver: P(200), requires: ['a'], availableHours: [22, 3] });
    const m = new MissionSystem([a, b]);
    expect(m.markers.map((k) => k.id)).toEqual(['a:giver']);
    expect(m.isOffered('b', 23)).toBe(false);
    m.start('a');
    const bot = new Bot(m, P(0));
    bot.wait(1.2);
    expect(m.isCompleted('a')).toBe(true);
    expect(m.isOffered('b', 23)).toBe(true);
    expect(m.isOffered('b', 1)).toBe(true);
    expect(m.isOffered('b', 12)).toBe(false);
    expect(m.nextOffer(12)).toBeNull();
    expect(m.nextOffer(23)?.id).toBe('b');
    // stepping onto B's giver at noon only hints
    bot.hour = 12; bot.teleport(P(250)); bot.teleport(P(200)); bot.wait(0.1);
    expect(m.isActive).toBe(false);
    expect(m.hud.toast).toContain('come back between 10pm and 3am');
  });

  it('stake is paid once, even across a retry and a reload', () => {
    const paid: number[] = [];
    const d = mk([{ kind: 'timer', seconds: 100, text: 't' }], { stake: 60, timeLimit: 5 });
    const m = new MissionSystem([d], { pay: (n) => paid.push(n) });
    const bot = new Bot(m, P(0));
    bot.startMission(d);
    bot.wait(6);
    expect(m.isFailed).toBe(true);
    m.retry();
    expect(paid).toEqual([60]);
    const m2 = new MissionSystem([d], { pay: (n) => paid.push(n) });
    expect(m2.restore(JSON.parse(JSON.stringify(m.serialize())))).toBe(true);
    m2.start('k');
    expect(paid).toEqual([60]);
  });

  it('finishing on top of another giver does not start that job until you leave and return', () => {
    const a = mk([{ kind: 'goTo', at: P(100), radius: 3, presence: 'any', text: 'a' }], { id: 'a' });
    const b = mk([{ kind: 'timer', seconds: 5, text: 'b' }], { id: 'b', title: 'B', giver: P(100), triggerRadius: 4 });
    const m = new MissionSystem([a, b]);
    const bot = new Bot(m, P(0));
    bot.startMission(a);
    bot.go(P(100), 5); bot.wait(0.5);
    expect(m.isCompleted('a')).toBe(true);
    expect(m.activeId).toBeNull();
    bot.go(P(60), 5); bot.go(P(100), 5); bot.wait(0.1);
    expect(m.activeId).toBe('b');
  });
});

describe('save round trip', () => {
  it('serialize/restore keeps completions, cash and stakes, re-raises flags, and rejects garbage', () => {
    const flags: string[] = [];
    const d = mk([{ kind: 'timer', seconds: 1, text: 't' }], { setFlags: ['aftersloth.unlocked'], stake: 5 });
    const m = new MissionSystem([d], { setFlag: (f) => flags.push(f) });
    m.start('k');
    new Bot(m, P(500)).wait(1.2);
    expect(flags).toEqual(['aftersloth.unlocked']);
    const json = JSON.stringify(m.serialize());
    const flags2: string[] = [];
    const m2 = new MissionSystem([d], { setFlag: (f) => flags2.push(f) });
    expect(m2.restore(JSON.parse(json))).toBe(true);
    expect(m2.isCompleted('k')).toBe(true);
    expect(m2.cash).toBe(10);
    expect(flags2).toEqual(['aftersloth.unlocked']);
    expect(JSON.parse(JSON.stringify(m2.serialize()))).toEqual(JSON.parse(json));
    expect(m2.restore({ v: 2 })).toBe(false);
    expect(m2.restore({ v: 1, completed: [1], cash: 0 })).toBe(false);
    expect(m2.restore({ v: 1, completed: [], cash: -4 })).toBe(false);
  });
});
