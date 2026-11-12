/** STORY2 writing: threads (every text has a sender and a trigger), overheard lines, signage, radio. Lint matches story_lint. */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import { isSpeaker } from '@/game/story/cast';
import { F } from '@/game/story/flags';
import { BULLETINS, ADS } from '@/game/story/news';
import { THREADS } from '@/game/story/threads';
import { OVERHEARD, OVERHEARD_REACTIVE, pickOverheard } from '@/game/story/overheard';
import { SIGNAGE_IDS, signageItems } from '@/game/story/signage';
import { StoryDirector } from '@/game/story/StoryDirector';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
const all = buildMissions(grid, data, lots);
const ids = new Set(all.map((d) => d.id));

const DENY = ['uber', 'lyft', 'airbnb', 'starbucks', 'google', 'apple', 'facebook', 'instagram', 'netflix', 'spotify', 'venmo', 'paypal', 'zillow', 'tesla', 'target', 'mta', 'nypd', 'amazon', 'walmart',
  'rockstar', 'trump', 'obama', 'biden', 'murder', 'corpse', 'gore', 'stab', 'shoot', 'torture', 'suicide', 'rape'];
const hasWord = (t: string, w: string): boolean => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`, 'i').test(t);
const clean = (t: string, at: string): void => { for (const w of DENY) expect(hasWord(t, w), `${at}: "${w}"`).toBe(false); };

describe('phone threads', () => {
  it('every text has a known sender, a real trigger mission, a unique id and a readable length', () => {
    expect(THREADS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(THREADS.map((t) => t.id)).size).toBe(THREADS.length);
    const flags = new Set<string>(Object.values(F));
    for (const t of THREADS) {
      expect(isSpeaker(t.from), `${t.id} sender ${t.from}`).toBe(true);
      expect(ids.has(t.after), `${t.id} trigger ${t.after}`).toBe(true);
      expect(t.delay).toBeGreaterThan(0);
      expect(t.text.length, t.id).toBeLessThanOrEqual(300);
      if (t.ifFlag) expect(flags.has(t.ifFlag)).toBe(true);
      clean(t.text, t.id);
    }
  });

  it('the four running threads exist and the director sends them when the trigger mission completes (once, branch-aware)', () => {
    for (const from of ['Pemberton', 'Garrett', 'Auntie G', 'CB3 Neighbors']) expect(THREADS.filter((t) => t.from === from).length, from).toBeGreaterThanOrEqual(9);
    const m = new MissionSystem(all);
    const sent: Array<{ from: string; key?: string }> = [];
    new StoryDirector(m, { text: (from, _t, o) => { if (!sent.some((s) => s.key === o?.key)) sent.push({ from, key: o?.key }); return true; } });
    m.restore({ v: 1, completed: [], cash: 0 });
    // fire the completion event the way the system does
    (m as unknown as { emit: (t: string, e: unknown) => void }).emit?.('mission:completed', { id: 'public-comment', title: '', cash: 0, message: '', totalCash: 0 });
    const keys = sent.map((s) => s.key);
    for (const t of THREADS.filter((x) => x.after === 'public-comment' && !x.ifFlag)) expect(keys, t.id).toContain(`th:${t.id}`);
  });
});

describe('overheard lines', () => {
  it('nine groups, twenty lines each, short, clean, no duplicates, voices from the existing personas', () => {
    expect(OVERHEARD).toHaveLength(9);
    const seen = new Set<string>();
    for (const g of OVERHEARD) {
      expect(g.lines, g.id).toHaveLength(20);
      expect(g.personas.length).toBeGreaterThan(0);
      for (const l of g.lines) {
        expect(l.length, l).toBeLessThanOrEqual(130); expect(l.length).toBeGreaterThan(12);
        expect(seen.has(l), `dup ${l}`).toBe(false); seen.add(l);
        clean(l, `${g.id}: ${l.slice(0, 30)}`);
      }
    }
    for (const r of OVERHEARD_REACTIVE) { expect(ids.has(r.after)).toBe(true); expect(OVERHEARD.some((g) => g.id === r.group)).toBe(true); clean(r.text, r.after); }
  });

  it('the picker avoids repeats and favours lines you have unlocked', () => {
    const rng = new Rng(7);
    const got = new Set<string>();
    for (let i = 0; i < 12; i++) got.add(pickOverheard(() => rng.next(), { done: new Set() }, 'kids').text);
    expect(got.size).toBeGreaterThan(8);
    let reactive = 0;
    for (let i = 0; i < 200; i++) if (pickOverheard(() => rng.next(), { done: new Set(['pigeon-post']) }, 'stoop-elders').reactive) reactive++;
    expect(reactive).toBeGreaterThan(0);
  });
});

describe('signage and radio', () => {
  it('signs are unique, on real faces, and the flag-driven ones use declared flags', () => {
    const items = signageItems(grid);
    expect(items).toHaveLength(SIGNAGE_IDS.length);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const flags = new Set<string>(Object.values(F));
    for (const i of items) {
      expect(Number.isFinite(i.x + i.z)).toBe(true);
      expect(i.title.length).toBeLessThanOrEqual(32);
      for (const f of [i.show.flag, i.show.not]) if (f) expect(flags.has(f)).toBe(true);
      clean(`${i.title} ${i.body}`, i.id);
    }
  });

  it('every STORY2 job has a radio bulletin that unlocks when it is done', () => {
    for (const id of ['moisture-event', 'founder-mode', 'red-tape-relay', 'carbon-copy', 'the-binder', 'gavel-to-gavel', 'pigeon-post', 'van-man', 'silent-retreat', 'slow-roll']) {
      expect(BULLETINS.some((b) => b.after === id), id).toBe(true);
    }
    for (const b of BULLETINS) { expect(b.text.length).toBeLessThan(330); clean(b.text, b.id); }
    for (const a of ADS) clean(a.text, a.id);
  });
});
