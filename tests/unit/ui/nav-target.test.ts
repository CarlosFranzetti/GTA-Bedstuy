// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MissionHud } from '@/ui/MissionHud';
import { Menu } from '@/ui/Menu';
import { MINIMAP_LEGEND } from '@/ui/Minimap';
import { NAV_TARGETS, cycleNavTarget, getNavTarget, setNavTarget } from '@/game/missions/NavTargets';
import { INTERIORS } from '@/world/interiors/defs';
import type { MissionHudState, MissionMarker } from '@/game/missions/types';

const idle = (o: Partial<MissionHudState> = {}): MissionHudState => ({
  status: 'idle', title: '', objective: '', step: 0, steps: 0, timeLeft: -1, progress: -1, carrying: '', cash: 0, toastSeq: 0, toast: '',
  toastKind: 'info', retryPrompt: '', prompt: '', ...o,
});
const giver: MissionMarker = { id: 'g', kind: 'giver', x: 100, z: 100, radius: 3, color: '#f5c542', label: 'Crate Digger' };

let root: HTMLElement;
const huds: MissionHud[] = [];
const makeHud = (): MissionHud => { const h = new MissionHud(root); huds.push(h); return h; };
beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); setNavTarget(null); });
afterEach(() => { for (const h of huds.splice(0)) h.dispose(); root.remove(); setNavTarget(null); });

describe('navigation targets (H6: HOME was invisible)', () => {
  it('HOME and WAX DELI are targets, placed on their real doors', () => {
    expect(NAV_TARGETS.map((t) => t.label)).toEqual(['HOME', 'WAX DELI']);
    const home = NAV_TARGETS[0];
    expect(Math.hypot(home.x - INTERIORS.home.door.x, home.z - INTERIORS.home.door.z)).toBeLessThan(2);
    expect(INTERIORS.home.sign).toBe('HOME');
  });

  it('N cycles off -> HOME -> WAX DELI -> off and replaces the idle Offer pointer', () => {
    const hud = makeHud();
    hud.update(idle());
    hud.updatePointer([giver], { x: 0, z: 0 }, 0);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toMatch(/^Offer: Crate Digger/);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }));
    expect(getNavTarget()?.id).toBe('home');
    hud.updatePointer([giver], { x: 0, z: 0 }, 0);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toMatch(/^Nav: HOME  \d+ m$/);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }));
    hud.updatePointer([giver], { x: 0, z: 0 }, 0);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toMatch(/^Nav: WAX DELI/);
    expect(cycleNavTarget()).toBeNull();
    hud.updatePointer([giver], { x: 0, z: 0 }, 0);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toMatch(/^Offer:/);
  });

  it('works with no mission offer at all, and tapping the chip cycles too', () => {
    const hud = makeHud();
    hud.update(idle());
    hud.updatePointer([], { x: 0, z: 0 }, 0);
    expect((root.querySelector('.msn-pointer') as HTMLElement).hidden).toBe(true);
    (root.querySelector('.msn-pointer') as HTMLElement).click();
    hud.updatePointer([], { x: 0, z: 0 }, 0);
    expect((root.querySelector('.msn-pointer') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toMatch(/^Nav: HOME/);
  });

  it('an active mission always wins over the nav target, and N does nothing then', () => {
    const hud = makeHud();
    setNavTarget('home');
    hud.update(idle({ status: 'active', title: 'T', objective: 'o', step: 1, steps: 1 }));
    const goal: MissionMarker = { id: 'o', kind: 'objective', x: 50, z: 0, radius: 3, color: '#2ecc71', label: 'Buy' };
    hud.updatePointer([goal], { x: 0, z: 0 }, 0);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toMatch(/^Goal: Buy/);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }));
    expect(getNavTarget()?.id).toBe('home'); // unchanged
  });

  it('the pause menu carries a minimap legend (you, offer, goal, HOME, deli, police, north)', () => {
    const menu = new Menu(root, {} as never, { storage: null });
    menu.open();
    const items = [...root.querySelectorAll('.gp-pane-settings .gp-list .gp-row')].filter((r) => (r as HTMLElement).dataset.id!.startsWith('l:')).map((r) => r.textContent);
    expect(items.length).toBe(MINIMAP_LEGEND.length);
    expect(items.join('|')).toMatch(/You.*offer.*goal.*HOME.*WAX DELI.*Police.*north/is);
    menu.dispose();
  });
});
