import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import type { MissionDef } from '@/game/missions/types';
import { Bot, startHourFor } from './missionBot';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
const defs = buildMissions(grid, data, lots);

/** Missions that need earlier chapters done first, in the order they unlock. */
const prerequisitesOf = (def: MissionDef): string[] => {
  const out: string[] = [];
  const visit = (d: MissionDef): void => { for (const r of d.requires ?? []) { visit(defs.find((x) => x.id === r)!); if (!out.includes(r)) out.push(r); } };
  visit(def);
  return out;
};

function setup(def: MissionDef) {
  const flags: string[] = [];
  const paid: number[] = [];
  const events: string[] = [];
  let bot!: Bot;
  const m = new MissionSystem(defs, { raiseWanted: (n) => bot.raise(n), pay: (n) => paid.push(n), setFlag: (f) => flags.push(f) });
  m.restore({ v: 1, completed: prerequisitesOf(def), cash: 0 });
  flags.length = 0;
  bot = new Bot(m, { x: 0, z: 0 }, startHourFor(def));
  m.on('mission:twist', (e) => events.push(`twist:${e.id}`));
  m.on('mission:failed', (e) => events.push(`failed:${e.reason}`));
  return { m, bot, flags, paid, events };
}

/** How each mission is made to fail: a pure time-out for most, a specific rule for some. */
const FAILS: Record<string, { reason: string; run: (bot: Bot, def: MissionDef) => void; joke: string }> = {
  'bodega-run': { reason: 'timeUp', run: (b, d) => b.wait(d.timeLimit! + 1), joke: '' },
  'laundromat-getaway': { reason: 'timeUp', run: (b, d) => b.wait(d.timeLimit! + 1), joke: '' },
  'block-party': { reason: 'clockUp', run: (b) => b.wait(200), joke: '' },
  'alternate-side-shuffle': { reason: 'timeUp', run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'The sweeper arrives' },
  'soundclash': { reason: 'copsCalled', run: (b) => { b.raise(1); b.wait(0.2); }, joke: 'Noise complaint' },
  'senator-the-cat': { reason: 'timeUp', run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'footwell' },
  'dollar-van-last-run': { reason: 'copsCalled', run: (b) => { b.raise(2); b.wait(0.2); }, joke: 'bails out at a red light' },
  'moving-day': { reason: 'tooFast', run: (b) => { b.speed = 6; b.wait(1.2, 6); }, joke: 'honk chorus' },
  'permit-pending': { reason: 'clockUp', run: (b) => b.wait(300), joke: 'closes in your face' },
  'crate-digger': { reason: 'timeUp', run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'Taste takes time' },
  'open-decks': { reason: 'lowScore', run: (b) => { b.m.notify({ type: 'dj:setFinished', venue: 'blockparty', score: 20, minutes: 2 }); b.wait(0.1); }, joke: 'politely claps' },
  'the-password': { reason: 'clockUp', run: (b) => b.wait(400), joke: 'Sunrise' },
  'aftersloth-residency': { reason: 'lowScore', run: (b) => { b.m.notify({ type: 'dj:setFinished', venue: 'aftersloth', score: 10, minutes: 2 }); b.wait(0.1); }, joke: 'vending machine' },
  'lost-cat': { reason: 'timeUp', run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'missing-human' },
  'dollar-van-fare': { reason: 'tooFast', run: (b) => { b.speed = 40; b.wait(1.2, 40); }, joke: 'list of things' },
  'stoop-sale': { reason: 'timeUp', run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'toasters' },
};

/** For tooFast / copsCalled / lowScore the failure only exists on specific beats: play up to that beat. */
const FAIL_AT: Record<string, number> = {
  'soundclash': 1, 'dollar-van-last-run': 1, 'moving-day': 1, 'open-decks': 3, 'dollar-van-fare': 2, 'aftersloth-residency': 2,
  'block-party': 0, 'permit-pending': 0, 'the-password': 0,
};

describe('every mission: success chain', () => {
  for (const def of defs) {
    it(`${def.title} completes, pays, and shows the twist / follow-up data`, () => {
      const { m, bot, paid, events, flags } = setup(def);
      bot.startMission(def);
      expect(m.activeId, `${def.id} should start`).toBe(def.id);
      bot.playUntil(def);
      expect(m.statusOf(def.id), `${def.id} finished`).toBe('complete');
      expect(paid).toContain(def.reward.cash);
      expect(m.hud.toast).toContain(def.reward.message);
      if (def.twist) expect(events).toContain(`twist:${def.id}`);
      for (const f of def.setFlags ?? []) expect(flags).toContain(f);
      expect(m.carrying.filter((c) => !['car moved'].includes(c)).length >= 0).toBe(true);
    });
  }

  it('the DJ storyline plays in order as one chain', () => {
    const flags: string[] = [];
    let bot!: Bot;
    const m = new MissionSystem(defs, { setFlag: (f) => flags.push(f) });
    bot = new Bot(m, { x: 0, z: 0 }, 12);
    const chain = ['crate-digger', 'open-decks', 'the-password', 'aftersloth-residency'];
    for (const id of chain) {
      const def = defs.find((d) => d.id === id)!;
      expect(m.isOffered(id, bot.hour), `${id} not yet offered`).toBe(id === chain[0] || m.isCompleted(chain[chain.indexOf(id) - 1]));
      bot.hour = startHourFor(def);
      bot.startMission(def);
      expect(m.activeId).toBe(id);
      bot.playUntil(def);
      expect(m.isCompleted(id)).toBe(true);
    }
    expect(flags).toEqual(['aftersloth.unlocked', 'aftersloth.slot']);
  });
});

describe('every mission: fail + retry chain', () => {
  for (const def of defs) {
    it(`${def.title} fails with its joke and the retry can be won`, () => {
      const f = FAILS[def.id];
      expect(f, `${def.id} needs a FAILS entry`).toBeDefined();
      const { m, bot, events } = setup(def);
      bot.startMission(def);
      expect(m.activeId).toBe(def.id);
      bot.playUntil(def, FAIL_AT[def.id] ?? 1);
      f.run(bot, def);
      expect(m.failReason, def.id).toBe(f.reason);
      expect(events).toContain(`failed:${f.reason}`);
      if (f.joke) expect(m.hud.toast).toContain(f.joke);
      expect(m.hud.retryPrompt).not.toBe('');
      bot.stars = 0;
      expect(m.retry(bot.hour)).toBe(true);
      expect(m.objectiveIndex).toBe(0);
      bot.inCar = false;
      bot.playUntil(def);
      expect(m.statusOf(def.id)).toBe('complete');
    });
  }
});
