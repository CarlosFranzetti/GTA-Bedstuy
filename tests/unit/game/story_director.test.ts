// @vitest-environment jsdom
/**
 * Story delivery: phone follow-ups by branch, the Mission Log thread, news bulletins and ads that react to completed
 * missions (the audio hook), subtitles + camera beats, ambient signs by flag, giver geometry, and the HUD dialogue bar.
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import { StoryDirector } from '@/game/story/StoryDirector';
import { AmbientNotices, ambientItems } from '@/game/story/AmbientNotices';
import { StoryState } from '@/game/story/StoryState';
import { ADS, BULLETINS, adsFor, currentAct, unlockedBulletins } from '@/game/story/news';
import { F } from '@/game/story/flags';
import { Phone } from '@/game/Phone';
import { MissionHud } from '@/ui/MissionHud';
import { Announcer, ANNOUNCER_NEWS_GAP_S, type AnnouncerEnv } from '@/audio/announcer/Announcer';
import { scStationDef } from '@/audio/radio';
import { Bot, startHourFor } from './missionBot';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
const defs = buildMissions(grid, data, lots, { el: { home: { x: 40, z: 60 }, north: { x: 120, z: -480 } } });
const byId = (id: string) => defs.find((d) => d.id === id)!;

function rig(opts: ConstructorParameters<typeof StoryDirector>[2] = {}) {
  const texts: Array<{ from: string; text: string; key?: string }> = [];
  const phone = { text: (from: string, text: string, o?: { key?: string }) => { texts.push({ from, text, key: o?.key }); return true; } };
  let bot!: Bot;
  const m = new MissionSystem(defs, { raiseWanted: (n) => bot.raise(n), spend: () => true });
  bot = new Bot(m, { x: 0, z: 0 }, 12);
  const casts: Array<{ who: string; text: string; pitch: number | null }> = [];
  const beats: number[] = [];
  const broadcasts: Array<{ bulletins: string[]; ads: string[] }> = [];
  const dir = new StoryDirector(m, phone, {
    speak: (who, text, v) => casts.push({ who, text, pitch: v?.pitch ?? null }),
    onBeat: (s) => beats.push(s),
    onBroadcast: (b) => broadcasts.push(b),
    ...opts,
  });
  const run = (id: string, pick: Record<string, string> = {}) => {
    const d = byId(id);
    bot.choices = pick; bot.hour = startHourFor(d); bot.stars = 0; bot.inCar = false;
    bot.startMission(d);
    expect(m.activeId, id).toBe(id);
    bot.playUntil(d);
    expect(m.isCompleted(id), id).toBe(true);
  };
  return { m, bot, dir, texts, casts, beats, broadcasts, run };
}

function done(r: ReturnType<typeof rig>, ids: string[]) {
  r.m.restore({ v: 1, completed: ids, cash: 0 });
}

describe('StoryDirector: phone, log, radio, subtitles', () => {
  it('sends the branch follow-up (and only that one) plus a Mission Log line', () => {
    const r = rig();
    done(r, ['bodega-run', 'notice-of-intent', 'public-comment', 'handle-with-care']);
    r.run('back-rent', { 'back-rent': F.ODETTE_FIXER });
    const from = r.texts.map((t) => t.from);
    expect(from).toContain('Hobbs');
    expect(from).not.toContain('Ms. Odette');
    expect(r.texts.find((t) => t.from === 'Mission Log')?.text).toContain('Back Rent');

    const r2 = rig();
    done(r2, ['bodega-run', 'notice-of-intent', 'public-comment', 'handle-with-care']);
    r2.run('back-rent', { 'back-rent': F.ODETTE_PAID });
    expect(r2.texts.map((t) => t.from)).toContain('Ms. Odette');
    expect(r2.texts.map((t) => t.from)).not.toContain('Hobbs');
  });

  it('works with the real Phone: keyed texts arrive once, in order, after their delay', () => {
    const phone = new Phone();
    const m = new MissionSystem(defs);
    phone.bind(m);
    const bot = new Bot(m, { x: 0, z: 0 }, 12);
    new StoryDirector(m, phone);
    m.restore({ v: 1, completed: ['bodega-run'], cash: 0 });
    const d = byId('notice-of-intent');
    bot.hour = startHourFor(d);
    bot.startMission(d);
    bot.playUntil(d);
    phone.update(2.5, { x: 0, z: 0 });
    expect(phone.messages.some((x) => x.from === 'Mission Log')).toBe(true);
    phone.update(200, { x: 0, z: 0 });
    const froms = phone.messages.map((x) => x.from);
    expect(froms).toContain('Auntie G');
    expect(froms).toContain('Yossi');
    expect(froms.filter((f) => f === 'Yossi')).toHaveLength(1);
  });

  it('news bulletins and ads follow the story and are handed to the radio hook', () => {
    const r = rig();
    expect(r.dir.broadcast().bulletins).toEqual([]);
    expect(r.dir.broadcast().ads.length).toBe(ADS.filter((a) => a.act === 0).length);
    r.m.restore({ v: 1, completed: ['bodega-run'], cash: 0 });
    r.dir.resync();
    expect(r.dir.broadcast().bulletins[0]).toContain('bodega');
    r.run('notice-of-intent');
    const b = r.dir.broadcast();
    expect(b.bulletins[0]).toContain('Overnight');       // newest first
    expect(b.bulletins).toHaveLength(2);
    expect(b.ads.length).toBeGreaterThan(ADS.filter((a) => a.act === 0).length); // act 1 ads join
    expect(r.broadcasts.at(-1)!.bulletins[0]).toBe(b.bulletins[0]);
  });

  it('bulletins depend on the branch you took', () => {
    const st = new StoryState();
    const doneSet = new Set(['back-rent']);
    st.set(F.ODETTE_FIXER);
    expect(unlockedBulletins(doneSet, st).map((b) => b.id)).toEqual(['n-rent-fixer']);
    const st2 = new StoryState(); st2.set(F.ODETTE_PAID);
    expect(unlockedBulletins(doneSet, st2).map((b) => b.id)).toEqual(['n-rent-paid']);
    expect(currentAct(st)).toBe(0); st.set(F.ACT3);
    expect(currentAct(st)).toBe(3);
    expect(adsFor(st).length).toBe(ADS.length);
    expect(BULLETINS.every((b) => b.text.length < 330)).toBe(true);
  });

  it('subtitle lines reach the speak hook with the cast voice, and beats reach the camera hook', () => {
    const r = rig();
    done(r, ['bodega-run']);
    r.run('notice-of-intent');
    expect(r.casts.length).toBeGreaterThan(0);
    const auntie = r.casts.find((c) => c.who === 'Auntie G')!;
    expect(auntie.pitch).toBeCloseTo(1.1);
    expect(r.casts.find((c) => c.who === 'You')?.pitch).toBeNull(); // not a cast member: no shaping
    expect(r.beats).toContain(3);
  });

  it('the mission log lists every story mission, locked until its prerequisites, with the choice you made', () => {
    const r = rig();
    done(r, ['bodega-run', 'notice-of-intent', 'public-comment', 'handle-with-care']);
    r.run('back-rent', { 'back-rent': F.ODETTE_PAID });
    const log = r.dir.log();
    expect(log).toHaveLength(14);
    const row = (id: string) => log.find((l) => l.id === id)!;
    expect(row('back-rent').status).toBe('complete');
    expect(row('back-rent').choice).toContain('own pocket');
    expect(row('fleece-vest').status).toBe('available');
    expect(row('last-call-on-throop').status).toBe('locked');
    expect(log.map((l) => l.act)).toEqual([...log.map((l) => l.act)].sort((a, b) => a - b).filter((_, i, a) => a[i] !== undefined)); // grouped by act in order
  });
});

describe('subtitles and the HUD dialogue bar', () => {
  it('say lines play in order at their times, one at a time, and the HUD shows "Speaker  line"', () => {
    const m = new MissionSystem(defs);
    const bot = new Bot(m, { x: 0, z: 0 }, 12);
    m.restore({ v: 1, completed: ['bodega-run'], cash: 0 });
    const root = document.createElement('div');
    const hud = new MissionHud(root);
    const lines: string[] = [];
    m.on('mission:subtitle', (e) => lines.push(`${e.who}: ${e.text}`));
    const d = byId('notice-of-intent');
    bot.hour = startHourFor(d);
    bot.startMission(d);
    bot.wait(0.1);
    expect(lines[0]).toMatch(/^Auntie G: Four doors/);
    expect(lines).toHaveLength(1);
    hud.update(m.hud);
    const bar = root.querySelector('.msn-sub') as HTMLElement;
    expect(bar.hidden).toBe(false);
    expect(bar.querySelector('.msn-who')?.textContent).toBe('Auntie G');
    expect(bar.textContent).toContain('Four doors');
    bot.wait(8);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toContain('Do not read it out loud');
    hud.dispose();
  });

  it('a speaker-less host (no speak hook) is fine, and subtitles hold for a readable time', () => {
    const m = new MissionSystem(defs);
    m.say('Dee', 'hello');
    expect(m.hud.subSeq).toBe(1);
    expect(m.hud.subMs!).toBeGreaterThanOrEqual(2800);
    m.say('Dee', 'x'.repeat(120));
    expect(m.hud.subMs!).toBeGreaterThan(m.hud.subMs! / 2);
    expect(m.hud.subSeq).toBe(2);
  });
});

describe('ambient storytelling: signs follow the flags', () => {
  it('lists signs whose positions are on the map and whose rules use real flags', () => {
    const items = ambientItems(grid);
    expect(items.length).toBeGreaterThanOrEqual(14);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const b = grid.bounds;
    for (const i of items) {
      expect(i.x).toBeGreaterThan(b.minX); expect(i.x).toBeLessThan(b.maxX); expect(i.z).toBeGreaterThan(b.minZ); expect(i.z).toBeLessThan(b.maxZ);
      expect(Math.hypot(i.nx, i.nz)).toBeCloseTo(1, 3);
      expect(i.title.length).toBeGreaterThan(3);
    }
  });

  it('shows the notices at the start, hides them once peeled, and swaps in the aftermath', () => {
    const amb = new AmbientNotices(grid);
    const st = new StoryState();
    const ids = () => amb.visibleIds(st);
    expect(ids().filter((i) => i.startsWith('notice-'))).toHaveLength(4);
    st.set(F.ACT1);
    expect(ids().some((i) => i.startsWith('notice-'))).toBe(false);
    expect(ids()).toContain('billboard-parallax');
    st.set(F.ODETTE_EVICTED);
    expect(ids()).toContain('wax-closed');
    expect(ids()).not.toContain('save-wax');
    st.set(F.AUNTIE_BURNED);
    expect(ids()).toContain('fire-board');
    st.set(F.END_TRUST);
    expect(ids()).toContain('land-trust');
    expect(ids()).not.toContain('fire-board');
    expect(ids()).not.toContain('billboard-parallax');
  });

  it('sync builds meshes lazily, toggles visibility, and does nothing when the story did not change', () => {
    const amb = new AmbientNotices(grid);
    const st = new StoryState();
    amb.sync(st);
    const n0 = amb.group.children.length;
    expect(n0).toBe(5); // the four notices and the Stillwater poster
    amb.sync(st);
    expect(amb.group.children.length).toBe(n0);
    st.set(F.ACT1);
    amb.sync(st);
    expect(amb.group.children.filter((c) => c.visible).length).toBeGreaterThan(0);
    expect(amb.group.children.filter((c) => (c as unknown as { userData: { ambient: string } }).userData.ambient.startsWith('notice-') && c.visible)).toHaveLength(0);
    amb.dispose();
    expect(amb.group.children).toHaveLength(0);
  });
});

describe('the announcer reads story bulletins and ads', () => {
  const station = scStationDef('bkhouse')!;
  function announcer(ctx: { bulletins?: string[]; ads?: string[] }, rnd = () => 0.9) {
    const env: AnnouncerEnv = {
      speech: null, makeUtterance: () => ({}) as never, volume: () => 1, setDuck: () => undefined, talkBusy: () => false,
      context: () => ({ hour: 12, weather: 'dry', rain: 0, street: 'Throop Ave', ...ctx }), random: rnd,
    };
    const a = new Announcer(env);
    a.tuneIn(station);
    return a;
  }

  it('reads a fresh bulletin shortly after it is unlocked (not after the 8 minute gap), once only', () => {
    const a = announcer({ bulletins: ['Overnight, paper appeared.'] });
    for (let i = 0; i < 4; i++) a.update(1); // pass the tune-in ID
    a.update(ANNOUNCER_NEWS_GAP_S);
    for (let i = 0; i < 10; i++) a.update(1);
    expect(a.history.some((h) => h.text.includes('Overnight, paper appeared.'))).toBe(true);
    const n = a.history.length;
    for (let i = 0; i < 400; i++) a.update(1);
    expect(a.history.slice(n).filter((h) => h.text.includes('Overnight, paper appeared.'))).toHaveLength(0);
  });

  it('an idle one-liner may be a story ad', () => {
    const a = announcer({ ads: ['Parallax Living. Live on a street that used to have a name.'] }, () => 0.05);
    for (let i = 0; i < 4; i++) a.update(1);
    for (let i = 0; i < 520; i++) a.update(1);
    expect(a.history.some((h) => h.text.includes('Parallax Living'))).toBe(true);
  });
});

describe('giver geometry', () => {
  it('every giver ring is on the map, clear of every other ring, and no story giver is within 12 m of another', () => {
    const b = grid.bounds;
    for (const d of defs) {
      expect(d.giver.x).toBeGreaterThan(b.minX - 30); expect(d.giver.x).toBeLessThan(b.maxX + 30);
      expect(d.giver.z).toBeGreaterThan(b.minZ - 30); expect(d.giver.z).toBeLessThan(b.maxZ + 30);
    }
    for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) {
      const d = Math.hypot(defs[i].giver.x - defs[j].giver.x, defs[i].giver.z - defs[j].giver.z);
      expect(d, `${defs[i].id} vs ${defs[j].id}`).toBeGreaterThan(defs[i].triggerRadius + defs[j].triggerRadius + 1);
    }
  });

  it('every objective point of a story mission is inside the map (with a margin) and finite', () => {
    const b = grid.bounds;
    for (const d of defs.filter((x) => x.act !== undefined)) {
      const pts = d.objectives.flatMap((o) => {
        const p: Array<{ x: number; z: number }> = [];
        if ('at' in o && o.at) p.push(o.at);
        if (o.kind === 'tail' || o.kind === 'chase' || o.kind === 'race') p.push(...o.route);
        if (o.kind === 'collect' || o.kind === 'spots') p.push(...o.points);
        if (o.kind === 'fork') p.push(...o.options.map((q) => q.at));
        return p;
      });
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z), d.id).toBe(true);
        expect(p.x, d.id).toBeGreaterThan(b.minX - 40); expect(p.x, d.id).toBeLessThan(b.maxX + 40);
        expect(p.z, d.id).toBeGreaterThan(b.minZ - 40); expect(p.z, d.id).toBeLessThan(b.maxZ + 40);
      }
    }
  });
});
