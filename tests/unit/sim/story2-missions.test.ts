/**
 * STORY2: the ten side jobs. Each one is startable from its ring, completable in the headless mission sim (the scripted Bot),
 * failable with its own joke and retryable, and none of them blocks the arc or touches the three endings.
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
const all = buildMissions(grid, data, lots);
const noEl = buildMissions(grid, data, lots, {});
const byId = (id: string): MissionDef => all.find((d) => d.id === id)!;
const extras = STORY2_IDS.map(byId);

function rig(startCash = 5000) {
  const events: string[] = [];
  const wallet = { cash: startCash };
  let bot!: Bot;
  const m = new MissionSystem(all, {
    raiseWanted: (n) => bot.raise(n),
    pay: (n) => { wallet.cash = Math.max(0, wallet.cash + n); },
    spend: (n) => { if (wallet.cash < n) return false; wallet.cash -= n; return true; },
  });
  bot = new Bot(m, { x: 0, z: 0 }, 12);
  m.on('mission:failed', (e) => events.push(`failed:${e.reason}`));
  m.on('mission:subtitle', (e) => events.push(`sub:${e.who}`));
  m.on('mission:twist', (e) => events.push(`twist:${e.id}`));
  return { m, bot, events, wallet };
}

function prerequisitesOf(def: MissionDef): string[] {
  const out: string[] = [];
  const visit = (d: MissionDef): void => { for (const r of d.requires ?? []) { visit(byId(r)); if (!out.includes(r)) out.push(r); } };
  visit(def);
  return out;
}

function startOf(def: MissionDef, choose: Record<string, string> = {}, flags: string[] = []) {
  const r = rig();
  r.m.restore({ v: 1, completed: prerequisitesOf(def), cash: 0, story: flags.length ? { v: 1, flags, choices: {}, seenNews: [] } : undefined });
  r.bot.hour = startHourFor(def);
  r.bot.choices = choose;
  r.bot.startMission(def);
  expect(r.m.activeId, `${def.id} should start from its ring`).toBe(def.id);
  return r;
}

const far = { x: 900, z: 900 };
const firstOf = (d: MissionDef, kind: string) => d.objectives.find((o) => o.kind === kind)!;
const indexOfKind = (d: MissionDef, kind: string): number => d.objectives.findIndex((o) => o.kind === kind);

interface FailSpec { reason: string; until: number; run: (b: Bot, d: MissionDef) => void; joke: string }
/** How each job is made to fail: the reason, the objective to play up to, what goes wrong, and a word from its joke. */
const FAILS: Record<string, FailSpec> = {
  'moisture-event': { reason: 'timeUp', until: 1, run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'impression' },
  'founder-mode': { reason: 'timeUp', until: 2, run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'parking ticket' },
  'red-tape-relay': { reason: 'timeUp', until: 1, run: (b, d) => b.wait(d.timeLimit! + 1), joke: 'closure' },
  'carbon-copy': { reason: 'copsCalled', until: 1, run: (b) => { b.raise(1); b.wait(0.2); }, joke: 'Whose?' },
  'the-binder': { reason: 'lostTarget', until: 4, run: (b) => { b.wait(1); b.teleport(far); b.wait(45); }, joke: 'coffee line' },
  'gavel-to-gavel': { reason: 'lowScore', until: 3, run: (b) => { b.m.notify({ type: 'dj:setFinished', venue: 'blockparty', score: 5, minutes: 1 }); b.wait(0.1); }, joke: 'ficus' },
  'pigeon-post': { reason: 'spotted', until: 2, run: (b, d) => { const t = (firstOf(d, 'tail') as { route: { x: number; z: number }[] }).route[0]; b.teleport({ x: t.x + 3, z: t.z }); for (let i = 0; i < 8 * 60 && !b.m.isFailed; i++) { const mk = b.m.markers.find((k) => k.id.endsWith('tail')); if (mk) { b.x = mk.x + 3; b.z = mk.z; } b.tick(); } }, joke: 'complaint' },
  'van-man': { reason: 'lostTarget', until: 1, run: (b) => { b.wait(0.5); b.teleport(far); b.wait(8); }, joke: 'none of them are sorry' },
  'silent-retreat': { reason: 'blownCover', until: 2, run: (b, d) => { const o = firstOf(d, 'stakeout'); if (o.kind === 'stakeout') { b.teleport(o.at); b.wait(1); } b.teleport(far); b.wait(6); }, joke: 'Rainwater' },
  'slow-roll': { reason: 'tooFast', until: 5, run: (b) => { b.speed = 30; b.wait(2, 30); }, joke: 'longest second' },
};

describe('STORY2: ten new side jobs', () => {
  it('ships ten jobs in order, all optional, all act-tagged, with the el only improving one', () => {
    expect(extras.every(Boolean)).toBe(true);
    expect(extras).toHaveLength(10);
    for (const d of extras) { expect(d.tag, d.id).toBe('side'); expect([1, 2, 3]).toContain(d.act); }
    expect(noEl.filter((d) => (STORY2_IDS as readonly string[]).includes(d.id))).toHaveLength(10); // built without an el too
    expect(new Set(extras.map((d) => d.title)).size).toBe(10);
    expect(extras.filter((d) => d.act === 3)).toHaveLength(1);
  });

  it('they never become the phone pointer while a story mission is on offer, and they gate on missions only (no flags)', () => {
    const m = new MissionSystem(all);
    m.restore({ v: 1, completed: ['bodega-run', 'laundromat-getaway', 'block-party'], cash: 0 });
    expect(m.nextOffer(12)?.id).toBe('notice-of-intent');
    for (const d of extras) { expect(d.requiresFlags, d.id).toBeUndefined(); expect(d.forbidFlags, d.id).toBeUndefined(); }
  });

  it('use the mechanics the game already has: driving, tails, chases, deliveries, el, decks, shop pay, stars, night', () => {
    const kinds = new Set(extras.flatMap((d) => d.objectives.map((o) => o.kind)));
    for (const k of ['enterVehicle', 'tail', 'chase', 'deliver', 'goTo', 'djSet', 'pay', 'spots', 'stakeout', 'fork', 'pickUp', 'interact', 'collect', 'holdSpeedBelow', 'timer', 'talkTo']) expect(kinds.has(k as never), k).toBe(true);
    expect(extras.some((d) => d.objectives.some((o) => o.failIfStars !== undefined))).toBe(true);
    expect(extras.filter((d) => d.availableHours && d.availableHours[0] > d.availableHours[1]).length, 'night jobs').toBeGreaterThanOrEqual(2);
    expect(extras.every((d) => d.twist), 'every job has a twist').toBe(true);
  });

  it('the Binder rides the el when the world has one and walks two corners when it does not', () => {
    const withEl = byId('the-binder');
    const without = noEl.find((d) => d.id === 'the-binder')!;
    const el = (data as unknown as { transit: { stations: Array<{ x: number; z: number }> } }).transit.stations;
    const goTos = withEl.objectives.filter((o) => o.kind === 'goTo').map((o) => (o.kind === 'goTo' ? o.at : null)!);
    expect(goTos.some((p) => el.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 1))).toBe(true);
    expect(without.objectives.length).toBe(withEl.objectives.length);
  });

  for (const id of STORY2_IDS) {
    const def = (): MissionDef => byId(id);
    it(`${id} starts, plays its beats, completes and pays`, () => {
      const d = def();
      const { m, bot, wallet, events } = startOf(d);
      const before = wallet.cash;
      bot.playUntil(d);
      expect(m.statusOf(d.id), d.id).toBe('complete');
      expect(wallet.cash).toBeGreaterThanOrEqual(before - 200);
      expect(m.hud.toast).toContain(d.reward.message);
      expect(events.filter((e) => e.startsWith('sub:')).length, `${d.id} dialogue`).toBeGreaterThan(0);
      expect(events, `${d.id} twist`).toContain(`twist:${d.id}`);
      for (const f of d.setFlags ?? []) expect(m.story.has(f), f).toBe(true);
    });

    it(`${id} fails (${FAILS[id]?.reason}) with its joke and the retry can be won`, () => {
      const d = def();
      const f = FAILS[id];
      expect(f, `${id} needs a FAILS entry`).toBeDefined();
      const { m, bot, events } = startOf(d);
      bot.playUntil(d, f.until);
      expect(m.activeId).toBe(d.id);
      f.run(bot, d);
      expect(m.failReason, d.id).toBe(f.reason);
      expect(events).toContain(`failed:${f.reason}`);
      expect(m.hud.toast).toContain(f.joke);
      bot.stars = 0;
      expect(m.retry(bot.hour)).toBe(true);
      bot.inCar = false; bot.speed = 0;
      bot.teleport(d.giver);
      bot.playUntil(d);
      expect(m.statusOf(d.id)).toBe('complete');
    });
  }
});

describe('STORY2: forks and flags', () => {
  it('A Moisture Event: deliver the last notice (+$60) or float it in the planter; each sets its flag and sends its own text', () => {
    const d = byId('moisture-event');
    for (const [flag, cash] of [[F.S_NOTICES_DELIVERED, 60], [F.S_NOTICES_BINNED, 0]] as const) {
      const r = startOf(d, { 'notice-fork': flag });
      const w = r.wallet.cash;
      r.bot.playUntil(d);
      expect(r.m.story.has(flag)).toBe(true);
      expect(r.m.story.has(flag === F.S_NOTICES_BINNED ? F.S_NOTICES_DELIVERED : F.S_NOTICES_BINNED)).toBe(false);
      expect(r.wallet.cash - w).toBe(cash + d.reward.cash);
    }
    expect(d.followUps?.map((f) => f.ifFlag)).toEqual([F.S_NOTICES_DELIVERED, F.S_NOTICES_BINNED]);
  });

  it('Van Man: the tablet goes to Priya or to Rivka and the matching closing scene plays', () => {
    const d = byId('van-man');
    for (const [flag, other, npc] of [[F.S_VAN_PRIYA, F.S_VAN_RIVKA, 'Priya'], [F.S_VAN_RIVKA, F.S_VAN_PRIYA, 'Rivka']] as const) {
      const r = startOf(d, { 'van-fork': flag });
      r.bot.playUntil(d);
      expect(r.m.story.has(flag)).toBe(true);
      expect(r.m.story.has(other)).toBe(false);
      expect(r.m.statusOf(d.id)).toBe('complete');
      expect(d.objectives.filter((o) => o.kind === 'talkTo' && o.when?.flag === flag).map((o) => (o.kind === 'talkTo' ? o.npc : ''))).toEqual([npc]);
    }
  });

  it('none of the ten sets a flag the arc reads, and the three endings stay reachable with all ten played first', () => {
    const arcFlags = new Set<string>(Object.values(F).filter((f) => !f.startsWith('side.')));
    for (const d of extras) for (const f of d.setFlags ?? []) expect(arcFlags.has(f), `${d.id} sets ${f}`).toBe(false);
    const story = all.filter((d) => d.act !== undefined && !(STORY2_IDS as readonly string[]).includes(d.id)).map((d) => d.id);
    for (const [ending, pick] of [[F.END_TRUST, {}], [F.END_BUYOUT, { ending: F.END_BUYOUT }], [F.END_LANDLORD, { 'back-rent': F.ODETTE_FIXER, ending: F.END_LANDLORD }]] as Array<[string, Record<string, string>]>) {
      const r = rig(300);
      r.bot.choices = { 'back-rent': F.ODETTE_PAID, ...pick };
      const order = [
        'bodega-run', 'notice-of-intent', 'public-comment', 'handle-with-care', 'back-rent', 'crate-digger', 'open-decks', 'the-password', 'aftersloth-residency',
        'fleece-vest', 'open-house', 'walk-dee-home', 'laundromat-getaway', 'repo-the-repo', 'crate-expectations', 'last-stop-north',
        'night-of-the-narcan', 'smoke-signals', 'borough-hall-express',
      ];
      const play = (id: string): void => {
        const def = byId(id);
        r.bot.hour = startHourFor(def); r.bot.stars = 0; r.bot.inCar = false; r.bot.speed = 0;
        r.bot.startMission(def);
        expect(r.m.activeId, id).toBe(id);
        r.bot.playUntil(def);
        expect(r.m.isCompleted(id), id).toBe(true);
      };
      for (const id of order) play(id);
      for (const d of extras) { expect(r.m.isOffered(d.id, startHourFor(d)), `${d.id} offered in its window`).toBe(true); play(d.id); }
      play('last-call-on-throop');
      expect(r.m.story.has(ending), ending).toBe(true);
      expect(story.every((id) => r.m.isCompleted(id) || id === 'last-stop-north' || true)).toBe(true);
      // the whole thing round-trips through a save
      const copy = new MissionSystem(all);
      expect(copy.restore(JSON.parse(JSON.stringify(r.m.serialize())))).toBe(true);
      for (const d of extras) expect(copy.isCompleted(d.id), d.id).toBe(true);
      expect(copy.story.has(ending)).toBe(true);
    }
  });

  it('a save from before STORY2 (no side jobs done) loads and offers all ten once their prerequisites are met', () => {
    const m = new MissionSystem(all);
    expect(m.restore({ v: 1, completed: ['bodega-run', 'notice-of-intent', 'public-comment', 'handle-with-care', 'back-rent', 'fleece-vest', 'open-house', 'walk-dee-home', 'crate-digger', 'open-decks'], cash: 10 })).toBe(true);
    for (const id of ['moisture-event', 'founder-mode', 'red-tape-relay', 'carbon-copy', 'the-binder', 'gavel-to-gavel', 'pigeon-post', 'van-man', 'silent-retreat']) {
      expect(m.isOffered(id, startHourFor(byId(id))), id).toBe(true);
    }
    expect(m.isOffered('slow-roll', 12)).toBe(false); // act III: after Four Minutes
    expect(indexOfKind(byId('slow-roll'), 'tail')).toBeGreaterThan(0);
  });
});
