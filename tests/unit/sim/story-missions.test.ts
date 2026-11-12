/**
 * "Air Rights": every story mission is completable, failable (with its joke / reason) and retryable in the headless
 * mission sim (the scripted Bot from tests/unit/game/missionBot.ts), the forks set their flags and change what comes
 * next, and the whole arc plays end to end for each of the three endings.
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import { STORY2_IDS } from '@/game/missions/content/story';
import type { MissionDef } from '@/game/missions/types';
import { F } from '@/game/story/flags';
import { Bot, startHourFor } from '../game/missionBot';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
// the real map publishes data.transit.stations, so the el mission comes from auto-detection (the positive case)
const all = buildMissions(grid, data, lots);
// the ten STORY2 side jobs have their own file (story2-missions.test.ts); this one is the core arc
const isCore = (d: MissionDef): boolean => d.act !== undefined && !(STORY2_IDS as readonly string[]).includes(d.id);
const story = all.filter(isCore);
const byId = (id: string): MissionDef => all.find((d) => d.id === id)!;
const LEGACY_PREREQ = ['crate-digger', 'open-decks', 'the-password', 'aftersloth-residency'];

function rig(startCash = 5000) {
  const events: string[] = [];
  const flagsSet: string[] = [];
  const wallet = { cash: startCash };
  let bot!: Bot;
  const m = new MissionSystem(all, {
    raiseWanted: (n) => bot.raise(n),
    pay: (n) => { wallet.cash = Math.max(0, wallet.cash + n); },
    spend: (n) => { if (wallet.cash < n) return false; wallet.cash -= n; return true; },
    setFlag: (f) => flagsSet.push(f),
  });
  bot = new Bot(m, { x: 0, z: 0 }, 12);
  m.on('mission:failed', (e) => events.push(`failed:${e.reason}`));
  m.on('mission:choice', (e) => events.push(`choice:${e.flag}`));
  m.on('mission:objective', (e) => events.push(`obj:${e.id}:${e.index}`));
  m.on('mission:subtitle', (e) => events.push(`sub:${e.who}`));
  m.on('mission:beat', (e) => events.push(`beat:${e.seconds}`));
  return { m, bot, events, flagsSet, wallet };
}

/** Completed prerequisites (transitively) for a def. */
function prerequisitesOf(def: MissionDef): string[] {
  const out: string[] = [];
  const visit = (d: MissionDef): void => { for (const r of d.requires ?? []) { visit(byId(r)); if (!out.includes(r)) out.push(r); } };
  visit(def);
  return out;
}

function startOf(def: MissionDef, choose: Record<string, string> = {}) {
  const r = rig();
  r.m.restore({ v: 1, completed: prerequisitesOf(def), cash: 0 });
  r.bot.hour = startHourFor(def);
  r.bot.choices = choose;
  r.bot.startMission(def);
  expect(r.m.activeId, `${def.id} should start from its ring`).toBe(def.id);
  return r;
}

const routeStart = (def: MissionDef, kind: string, skip = 0): { x: number; z: number } => {
  const ob = def.objectives.filter((o) => o.kind === kind)[skip] as { route: { x: number; z: number }[] };
  return ob.route[0];
};

interface FailSpec { reason: string; until: number; run: (b: Bot, d: MissionDef) => void; joke?: string }
const far = { x: 900, z: 900 };
/** Keep within a few metres of the moving tail target (a stealth tail's worst habit). */
const hug = (b: Bot, seconds: number): void => {
  for (let i = 0; i < seconds * 60 && !b.m.isFailed; i++) {
    const mk = b.m.markers.find((k) => k.id.endsWith('tail'));
    if (mk) { b.x = mk.x + 3; b.z = mk.z; }
    b.tick();
  }
};
/** Take your post, then walk away from it. */
const abandonPost = (b: Bot, d: MissionDef, seconds: number): void => {
  const ob = d.objectives.find((o) => o.kind === 'stakeout')!;
  if (ob.kind === 'stakeout') { b.teleport(ob.at); b.wait(1); }
  b.teleport(far); b.wait(seconds);
};
/** How each story mission is made to fail: the reason, the beat to play up to, and what goes wrong. */
const FAILS: Record<string, FailSpec> = {
  'notice-of-intent': { reason: 'timeUp', until: 0, run: (b) => b.wait(131), joke: 'tape' },
  'public-comment': { reason: 'lostRace', until: 2, run: (b) => b.wait(120), joke: 'lanyards' },
  'handle-with-care': { reason: 'cargoBroken', until: 2, run: (b) => { for (let i = 0; i < 3; i++) { b.m.notify({ type: 'impact', strength: 40 }); b.wait(0.1); } }, joke: 'ploughed field' },
  'back-rent': { reason: 'timeUp', until: 1, run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'bank makes a decision' },
  'fleece-vest': { reason: 'spotted', until: 2, run: (b, d) => { b.teleport({ x: routeStart(d, 'tail').x + 3, z: routeStart(d, 'tail').z }); hug(b, 8); }, joke: 'fruit basket' },
  'open-house': { reason: 'blownCover', until: 1, run: (b, d) => abandonPost(b, d, 9), joke: 'falafel' },
  'walk-dee-home': { reason: 'lostTarget', until: 0, run: (b) => { b.wait(0.5); b.teleport(far); b.wait(11); }, joke: 'lol where r u' },
  'repo-the-repo': { reason: 'copsCalled', until: 1, run: (b) => { b.raise(1); b.wait(0.2); }, joke: 'choir' },
  'crate-expectations': { reason: 'timeUp', until: 1, run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'PARTNERING' },
  'night-of-the-narcan': { reason: 'timeUp', until: 0, run: (b) => b.wait(71), joke: 'another run' },
  'smoke-signals': { reason: 'timeUp', until: 0, run: (b) => b.wait(91), joke: 'another go' },
  'borough-hall-express': { reason: 'cargoBroken', until: 1, run: (b) => { for (let i = 0; i < 3; i++) { b.m.notify({ type: 'impact', strength: 30 }); b.wait(0.1); } }, joke: 'collective complaint' },
  'last-call-on-throop': { reason: 'lowScore', until: 2, run: (b) => { b.m.notify({ type: 'dj:setFinished', venue: 'aftersloth', score: 5, minutes: 2 }); b.wait(0.1); }, joke: 'bass' },
  'last-stop-north': { reason: 'blownCover', until: 3, run: (b, d) => abandonPost(b, d, 6), joke: 'model unit' },
};

describe('story missions: every one completes, pays and plays its beats', () => {
  it('ships the arc: thirteen core missions plus the gated north job', () => {
    expect(story.map((d) => d.id)).toEqual([
      'notice-of-intent', 'public-comment', 'handle-with-care', 'back-rent',
      'fleece-vest', 'open-house', 'walk-dee-home', 'repo-the-repo', 'crate-expectations', 'last-stop-north',
      'night-of-the-narcan', 'smoke-signals', 'borough-hall-express', 'last-call-on-throop',
    ]);
    expect(buildMissions(grid, data, lots, {}).filter(isCore)).toHaveLength(13);
  });

  for (const def of story) {
    it(`${def.title} completes and pays`, () => {
      const { m, bot, wallet, events } = startOf(def);
      const before = wallet.cash;
      bot.playUntil(def);
      expect(m.statusOf(def.id), def.id).toBe('complete');
      expect(wallet.cash).toBeGreaterThanOrEqual(before - 1500); // forks may spend; the reward lands
      expect(m.hud.toast).toContain(def.reward.message);
      expect(events.filter((e) => e.startsWith('sub:')).length + events.filter((e) => e.startsWith('beat:')).length, `${def.id} has dialogue or a beat`).toBeGreaterThan(0);
      for (const f of def.setFlags ?? []) expect(m.story.has(f), f).toBe(true);
    });
  }
});

describe('story missions: every one can fail with its joke and the retry can be won', () => {
  for (const def of story) {
    it(`${def.title} fails (${FAILS[def.id]?.reason}) and retries`, () => {
      const f = FAILS[def.id];
      expect(f, `${def.id} needs a FAILS entry`).toBeDefined();
      const { m, bot, events } = startOf(def);
      bot.playUntil(def, f.until);
      expect(m.activeId).toBe(def.id);
      f.run(bot, def);
      expect(m.failReason, def.id).toBe(f.reason);
      expect(events).toContain(`failed:${f.reason}`);
      if (f.joke) expect(m.hud.toast).toContain(f.joke);
      expect(m.hud.retryPrompt).not.toBe('');
      bot.stars = 0;
      expect(m.retry(bot.hour)).toBe(true);
      bot.inCar = false;
      bot.teleport(def.giver); // the retry starts you back at the giver, not wherever you gave up
      bot.playUntil(def);
      expect(m.statusOf(def.id)).toBe('complete');
    });
  }
});

describe('branches: forks set flags, hide options and change what happens next', () => {
  it('Back Rent: the fixer path pays Odette from Hobbs\'s envelope; the loyal path costs you $150', () => {
    const def = byId('back-rent');
    const a = startOf(def, { 'back-rent': F.ODETTE_FIXER });
    const w0 = a.wallet.cash;
    a.bot.playUntil(def);
    expect(a.m.story.has(F.ODETTE_FIXER)).toBe(true);
    expect(a.m.story.has(F.ODETTE_PAID)).toBe(false);
    expect(a.m.story.choiceOf('back-rent')).toBe(F.ODETTE_FIXER);
    expect(a.wallet.cash - w0).toBe(-40 + 1000 - 900 + def.reward.cash);
    expect(a.events.filter((e) => e.startsWith('obj:back-rent:')).map((e) => e.slice(-1))).toContain('3');
    expect(a.events).not.toContain('obj:back-rent:5');
    const b = startOf(def, { 'back-rent': F.ODETTE_PAID });
    const w1 = b.wallet.cash;
    b.bot.playUntil(def);
    expect(b.m.story.has(F.ODETTE_PAID)).toBe(true);
    expect(b.wallet.cash - w1).toBe(-40 - 150 + def.reward.cash);
    expect(b.events).not.toContain('obj:back-rent:3');
    expect(b.events).toContain('obj:back-rent:5');
  });

  it('a fork you cannot afford takes what you have, and a pay step refuses when you are broke', () => {
    const def = byId('back-rent');
    const r = rig(10); // $10: the $40 light bill is refused
    r.m.restore({ v: 1, completed: prerequisitesOf(def), cash: 0 });
    r.bot.hour = startHourFor(def);
    r.bot.startMission(def);
    r.bot.playUntil(def, 1);
    expect(r.m.objectiveIndex).toBe(1);
    r.bot.playObjective(def.objectives[1]);
    expect(r.m.objectiveIndex).toBe(1);
    expect(r.m.hud.toast).toContain('Not enough cash');
    expect(r.wallet.cash).toBe(10);
  });

  it('Repo the Repo: return Gladys or sell her; each sends a different text and Tay\'s scene in Four Minutes differs', () => {
    const def = byId('repo-the-repo');
    for (const [flag, cash] of [[F.TAY_RETURNED, 0], [F.TAY_SOLD, 500]] as const) {
      const r = startOf(def, { 'repo-fork': flag });
      const w = r.wallet.cash;
      r.bot.playUntil(def);
      expect(r.m.story.has(flag)).toBe(true);
      expect(r.wallet.cash - w).toBe(cash + def.reward.cash);
      // the same later mission, played with this flag set, runs the matching talkTo
      const nn = byId('night-of-the-narcan');
      const n = rig();
      n.m.restore({ v: 1, completed: prerequisitesOf(nn), cash: 0, story: { v: 1, flags: [flag], choices: { 'repo-fork': flag }, seenNews: [] } });
      n.bot.hour = startHourFor(nn);
      n.bot.startMission(nn);
      n.bot.playUntil(nn);
      const lines = nn.objectives.flatMap((o) => (o.kind === 'talkTo' && o.when?.flag === flag ? [o.npc] : []));
      expect(lines).toEqual(['Tay']);
      expect(n.m.statusOf('night-of-the-narcan')).toBe('complete');
      expect(n.events.filter((e) => e.startsWith('obj:night-of-the-narcan:')).length).toBeGreaterThanOrEqual(nn.objectives.length - 1);
    }
  });

  it('Borough Hall Express: exposing Alvin and sparing him play different closing scenes', () => {
    const def = byId('borough-hall-express');
    for (const [flag, other] of [[F.ALVIN_EXPOSED, F.ALVIN_SPARED], [F.ALVIN_SPARED, F.ALVIN_EXPOSED]] as const) {
      const r = startOf(def, { 'alvin-fork': flag });
      r.bot.playUntil(def);
      expect(r.m.story.has(flag)).toBe(true);
      expect(r.m.story.has(other)).toBe(false);
      expect(r.m.statusOf(def.id)).toBe('complete');
    }
  });

  it('Last Call: the landlord ending is only offered after taking the fixer\'s envelope', () => {
    const def = byId('last-call-on-throop');
    const fork = def.objectives.find((o) => o.kind === 'fork')!;
    expect(fork.kind === 'fork' && fork.options.map((o) => o.flag)).toEqual([F.END_TRUST, F.END_BUYOUT, F.END_LANDLORD]);
    const without = startOf(def, { ending: F.END_LANDLORD });
    without.bot.playUntil(def);
    expect(without.m.story.has(F.END_LANDLORD)).toBe(false); // option hidden: the bot falls back to the first open option
    expect(without.m.story.has(F.END_TRUST)).toBe(true);
    const r = rig();
    r.m.restore({ v: 1, completed: prerequisitesOf(def), cash: 0, story: { v: 1, flags: [F.ODETTE_FIXER], choices: {}, seenNews: [] } });
    r.bot.hour = startHourFor(def);
    r.bot.choices = { ending: F.END_LANDLORD };
    r.bot.startMission(def);
    r.bot.playUntil(def);
    expect(r.m.story.has(F.END_LANDLORD)).toBe(true);
    expect(r.m.statusOf(def.id)).toBe('complete');
  });
});

describe('the whole arc, start to finish, for each ending', () => {
  const ENDINGS: Array<{ name: string; pick: Record<string, string>; ending: string; expectFlags: string[] }> = [
    { name: 'loyalty', pick: { 'back-rent': F.ODETTE_PAID, 'repo-fork': F.TAY_RETURNED, 'alvin-fork': F.ALVIN_SPARED, ending: F.END_TRUST }, ending: F.END_TRUST, expectFlags: [F.ODETTE_PAID, F.TAY_RETURNED, F.ALVIN_SPARED] },
    { name: 'hustle', pick: { 'back-rent': F.ODETTE_FIXER, 'repo-fork': F.TAY_SOLD, 'alvin-fork': F.ALVIN_EXPOSED, ending: F.END_LANDLORD }, ending: F.END_LANDLORD, expectFlags: [F.ODETTE_FIXER, F.TAY_SOLD, F.ALVIN_EXPOSED] },
    { name: 'selling out', pick: { 'back-rent': F.ODETTE_FIXER, 'repo-fork': F.TAY_SOLD, 'alvin-fork': F.ALVIN_SPARED, ending: F.END_BUYOUT }, ending: F.END_BUYOUT, expectFlags: [F.ODETTE_FIXER, F.TAY_SOLD] },
  ];
  for (const e of ENDINGS) {
    it(`${e.name}: openers, Act I, the DJ chain, Acts II and III in order`, () => {
      const r = rig(300);
      r.bot.choices = e.pick;
      const order = [
        'bodega-run', 'notice-of-intent', 'public-comment', 'handle-with-care', 'back-rent', ...LEGACY_PREREQ,
        'fleece-vest', 'open-house', 'walk-dee-home', 'laundromat-getaway', 'repo-the-repo', 'crate-expectations', 'last-stop-north',
        'night-of-the-narcan', 'smoke-signals', 'borough-hall-express', 'last-call-on-throop',
      ];
      for (const id of order) {
        const def = byId(id);
        expect(r.m.isOffered(id, startHourFor(def)), `${id} offered when its prerequisites are done`).toBe(true);
        r.bot.hour = startHourFor(def);
        r.bot.stars = 0;
        r.bot.inCar = false;
        r.bot.startMission(def);
        expect(r.m.activeId, id).toBe(id);
        r.bot.playUntil(def);
        expect(r.m.isCompleted(id), id).toBe(true);
      }
      for (const f of [...e.expectFlags, e.ending, F.ACT1, F.ACT2, F.ACT3, F.DONE, F.ODETTE_EVICTED, F.TAY_ALIVE, F.FIRE_LOG]) expect(r.m.story.has(f), f).toBe(true);
      for (const other of [F.END_TRUST, F.END_LANDLORD, F.END_BUYOUT].filter((x) => x !== e.ending)) expect(r.m.story.has(other), other).toBe(false);
      // everything round-trips through a save
      const copy = new MissionSystem(all);
      expect(copy.restore(JSON.parse(JSON.stringify(r.m.serialize())))).toBe(true);
      expect(copy.story.has(e.ending)).toBe(true);
      expect(copy.isCompleted('last-call-on-throop')).toBe(true);
    });
  }

  it('the next-offer pointer walks the story in order', () => {
    const m = new MissionSystem(all);
    expect(m.nextOffer(12)?.id).toBe('bodega-run');
    m.restore({ v: 1, completed: ['bodega-run', 'laundromat-getaway', 'block-party'], cash: 0 });
    expect(m.nextOffer(12)?.id).toBe('notice-of-intent');
  });
});

describe('vehicle gates are soft and feature gating is clean', () => {
  it('a wrong vehicle type blocks an enterVehicle gate for 45 s, then any wheels will do', () => {
    const def = byId('handle-with-care');
    const r = startOf(def);
    r.bot.playUntil(def, 0);
    r.bot.inCar = true;
    r.bot.vehicle = 'sedan';
    r.bot.wait(2);
    expect(r.m.objectiveIndex).toBe(0);
    r.bot.wait(46);
    expect(r.m.objectiveIndex).toBeGreaterThan(0);
  });

  it('the right vehicle passes at once; a host that does not report types is never blocked', () => {
    const def = byId('handle-with-care');
    const a = startOf(def);
    a.bot.inCar = true; a.bot.vehicle = 'cargovan'; a.bot.wait(0.3);
    expect(a.m.objectiveIndex).toBeGreaterThan(0);
    const b = startOf(def);
    b.bot.inCar = true; b.bot.vehicle = ''; b.bot.wait(0.3);
    expect(b.m.objectiveIndex).toBeGreaterThan(0);
  });

  it('without el stations the north mission is not built and nothing else changes', () => {
    const none = buildMissions(grid, data, lots, {});
    expect(none.some((d) => d.id === 'last-stop-north')).toBe(false);
    expect(none.filter((d) => d.id !== 'last-stop-north').map((d) => d.id)).toEqual(all.filter((d) => d.id !== 'last-stop-north').map((d) => d.id));
    // premise changed (WBURG): the real map now publishes data.transit.stations, so auto-detection finds the el.
    // The "no stations" case builds from a copy of the data without transit.
    const noTransit = { ...data, transit: undefined };
    expect(buildMissions(grid, noTransit, lots).some((d) => d.id === 'last-stop-north')).toBe(false);
    expect(all.some((d) => d.id === 'last-stop-north')).toBe(true); // completes: see the per-mission completes test
  });
});

describe('fragile cargo and stealth: the meter and the band', () => {
  it('small bumps wear the meter, big hits break it, gentle driving keeps it', () => {
    const def = byId('handle-with-care');
    const r = startOf(def);
    r.bot.playUntil(def, 2);
    expect(r.m.cargoHealth).toBe(100);
    r.m.notify({ type: 'impact', strength: 2 }); r.bot.wait(0.1);
    expect(r.m.cargoHealth).toBe(100); // below the threshold
    r.m.notify({ type: 'impact', strength: 15 }); r.bot.wait(0.1);
    expect(r.m.cargoHealth).toBeLessThan(100);
    expect(r.m.hud.carrying).toContain('Test pressings');
    r.bot.playUntil(def);
    expect(r.m.statusOf(def.id)).toBe('complete');
  });

  it('impacts outside a cargo objective do nothing', () => {
    const def = byId('handle-with-care');
    const r = startOf(def);
    r.m.notify({ type: 'impact', strength: 80 }); r.bot.wait(0.1);
    expect(r.m.isFailed).toBe(false);
  });

  it('a stealth tail is failed by hugging the target and by dropping too far back', () => {
    const def = byId('fleece-vest');
    const a = startOf(def);
    a.bot.playUntil(def, 2);
    const s = routeStart(def, 'tail');
    a.bot.teleport({ x: s.x + 30, z: s.z }); a.bot.wait(1); // engaged, in the band
    expect(a.m.isFailed).toBe(false);
    a.bot.teleport({ x: s.x + 300, z: s.z }); a.bot.wait(7);
    expect(a.m.failReason).toBe('lostTarget');
  });
});
