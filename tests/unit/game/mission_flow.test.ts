// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { MissionHud } from '@/ui/MissionHud';
import { createPointerRouter } from '@/game/missions/PointerRoute';
import type { MissionDef, MissionHudState } from '@/game/missions/types';
import { Bot } from './missionBot';

const P = (x: number, z = 0) => ({ x, z });
const def = (id: string, x: number, title = id): MissionDef => ({
  id, title, blurb: `${title} blurb`, giverPoi: 'x', giver: P(x), triggerRadius: 3, reward: { cash: 10, message: 'ok' },
  objectives: [{ kind: 'goTo', at: P(x + 200), radius: 3, presence: 'onFoot', text: `go ${id}` }],
});

describe('one mission at a time', () => {
  it('walking into another giver ring while a mission runs changes nothing; hud and active agree', () => {
    const m = new MissionSystem([def('a', 0, 'Crate Digger'), def('b', 100, 'Laundromat Getaway')]);
    const bot = new Bot(m, P(-40));
    bot.go(P(0), 5);
    expect(m.activeId).toBe('a');
    const seq = m.hud.toastSeq;
    bot.go(P(100), 5); // through b's ring (it was armed from far away)
    bot.wait(1);
    expect(m.activeId).toBe('a');
    expect(m.hud.title).toBe('Crate Digger');
    expect(m.hud.status).toBe('active');
    expect(m.hud.toastSeq).toBe(seq); // nothing silently swapped
    expect(m.markers.every((k) => k.kind === 'objective')).toBe(true);
  });
  it('every start toasts, and a blocked start() explains itself', () => {
    const m = new MissionSystem([def('a', 0, 'Crate Digger'), def('b', 100, 'Laundromat Getaway')]);
    expect(m.start('a')).toBe(true);
    expect(m.hud.toast).toContain('Crate Digger blurb');
    const seq = m.hud.toastSeq;
    expect(m.start('b')).toBe(false);
    expect(m.hud.toastSeq).toBe(seq + 1);
    expect(m.hud.toast).toContain('Crate Digger');
    expect(m.activeId).toBe('a');
  });
});

const idleHud = (): MissionHudState => ({ status: 'idle', title: '', objective: '', step: 0, steps: 0, timeLeft: -1, progress: -1, carrying: '', cash: 0, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '', prompt: '' });

describe('pointer after abandon', () => {
  it('clears (no stale "here") while standing in the abandoned giver ring, returns after leaving', () => {
    const m = new MissionSystem([def('a', 0, 'Crate Digger')]);
    const root = document.createElement('div');
    const hud = new MissionHud(root);
    const bot = new Bot(m, P(-40));
    bot.go(P(0), 5);
    expect(m.activeId).toBe('a');
    hud.update({ ...m.hud }); hud.updatePointer(m.markers, bot.pos, 0);
    expect(root.querySelector<HTMLElement>('.msn-pointer')!.textContent).toContain('Goal');
    m.abandon();
    bot.wait(0.1);
    hud.update({ ...idleHud(), ...m.hud }); hud.updatePointer(m.markers, bot.pos, 0);
    const el = root.querySelector<HTMLElement>('.msn-pointer')!;
    expect(el.hidden).toBe(true);
    expect(m.markers.length).toBe(0);
    bot.go(P(-20), 5);
    hud.updatePointer(m.markers, bot.pos, 0);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain('Offer: Crate Digger');
    expect(el.textContent).not.toContain('here');
  });
});

describe('pointer routed along sidewalks', () => {
  const data = loadBedstuyData();
  const grid = buildGrid(data);
  void Rng;
  it('aims at the target when the line is clear and around the block when it is not', () => {
    const route = createPointerRouter(grid);
    const b = grid.blocks[0];
    const xs = b.buildingLine.map((p) => p.x), zs = b.buildingLine.map((p) => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const from = P(Math.min(...xs) - 3, cz), to = P(Math.max(...xs) + 3, cz); // either side of the block
    const aim = route(from, to);
    expect(Math.hypot(aim.x - to.x, aim.z - to.z)).toBeGreaterThan(1); // not the target
    // the aim point itself is not behind the block: the segment from -> aim stays out of the building line
    const inside = (p: { x: number; z: number }) => p.x > Math.min(...xs) + 0.4 && p.x < Math.max(...xs) - 0.4 && p.z > Math.min(...zs) + 0.4 && p.z < Math.max(...zs) - 0.4;
    for (let t = 0; t <= 1; t += 0.05) expect(inside({ x: from.x + (aim.x - from.x) * t, z: from.z + (aim.z - from.z) * t })).toBe(false);
    // following the arrow converges on the target without ever walking through the block
    let pos = { ...from };
    for (let i = 0; i < 200 && Math.hypot(pos.x - to.x, pos.z - to.z) > 2; i++) {
      const a = route(pos, to);
      const d = Math.hypot(a.x - pos.x, a.z - pos.z) || 1;
      const s = Math.min(d, 6);
      pos = { x: pos.x + ((a.x - pos.x) / d) * s, z: pos.z + ((a.z - pos.z) / d) * s };
      expect(inside(pos)).toBe(false);
    }
    expect(Math.hypot(pos.x - to.x, pos.z - to.z)).toBeLessThanOrEqual(2);
    const clear = route(from, P(from.x - 30, from.z));
    expect(clear.x).toBeCloseTo(from.x - 30, 3);
    void cx;
  });
  it('keeps the straight distance in the text', () => {
    const root = document.createElement('div');
    const hud = new MissionHud(root);
    hud.setRouter(createPointerRouter(grid));
    hud.update(idleHud());
    const b = grid.blocks[0];
    const xs = b.buildingLine.map((p) => p.x), zs = b.buildingLine.map((p) => p.z);
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const mk = { id: 'g', kind: 'giver' as const, x: Math.max(...xs) + 3, z: cz, radius: 3, color: '#fc0', label: 'X' };
    hud.updatePointer([mk], P(Math.min(...xs) - 3, cz), 0);
    const el = root.querySelector<HTMLElement>('.msn-pointer')!;
    expect(parseFloat(el.dataset.dist!)).toBeCloseTo(Math.max(...xs) - Math.min(...xs) + 6, 0);
  });
});
