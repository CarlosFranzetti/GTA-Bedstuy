// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MissionHud } from '@/ui/MissionHud';
import type { MissionHudState, MissionMarker } from '@/game/missions/types';

const state = (o: Partial<MissionHudState> = {}): MissionHudState => ({
  status: 'active', title: 'Crate Digger', objective: 'Buy Throop Night Bus, Spin Cycle Love and Fire Escape Sunrise', step: 1, steps: 3,
  timeLeft: 90, progress: -1, carrying: '', cash: 0, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '', prompt: '', ...o,
});
const goal: MissionMarker = { id: 'g', kind: 'objective', x: 0, z: -4215, radius: 3, color: '#2ecc71', label: 'Buy' };
// @ts-ignore node types are not installed in this repo; vitest runs in node
import { readFileSync } from 'node:fs';
const missionCss: string = readFileSync('src/ui/mission.css', 'utf8');

let root: HTMLElement;
beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });
afterEach(() => root.remove());

describe('MissionHud layout', () => {
  it('title, objective, timer and the Goal pointer live in ONE flowing column, so they cannot overlap', () => {
    const hud = new MissionHud(root);
    hud.update(state());
    hud.updatePointer([goal], { x: 0, z: 0 }, 0);
    const col = root.querySelector('.msn-col')!;
    expect(col).not.toBeNull();
    for (const sel of ['.msn-title', '.msn-objective', '.msn-timer', '.msn-pointer']) expect(col.querySelector(sel), sel).not.toBeNull();
    // the pointer is a later sibling of the panel inside the column (flex column), not a separately positioned element
    expect(col.children[0].classList.contains('msn-panel')).toBe(true);
    expect(col.children[1].classList.contains('msn-pointer')).toBe(true);
  });

  it('css: column is the only absolutely positioned mission-text box; pointer and panel flow inside it', () => {
    const m = missionCss;
    expect(m).toMatch(/\.msn-col\s*{[^}]*position:\s*absolute[^}]*flex-direction:\s*column/s);
    expect(m).toMatch(/\.msn-pointer\s*{[^}]*position:\s*relative/s);
    expect(m).not.toMatch(/\.msn-panel\s*{[^}]*position:\s*absolute/s);
    expect(m).toMatch(/@media \(max-height: 480px\)[^{]*{[^}]*\.msn-col/s); // 640x360 tightening
    expect(m).toMatch(/\.touch \.msn-col\s*{[^}]*left:/s); // touch minimap sits top-left, column moves right of it
  });

  it('inside an interior the Goal line says "inside": no 4215 m, arrow hidden', () => {
    const hud = new MissionHud(root);
    hud.update(state({ inside: true }));
    hud.updatePointer([goal], { x: 0, z: 0 }, 0);
    const text = root.querySelector('.msn-pointer-text')!.textContent!;
    expect(text).toBe('Goal: Buy  inside');
    expect(text).not.toMatch(/\d+ m/);
    expect((root.querySelector('.msn-pointer-arrow') as HTMLElement).style.visibility).toBe('hidden');
  });

  it('back outside the distance and arrow return', () => {
    const hud = new MissionHud(root);
    hud.update(state({ inside: true }));
    hud.updatePointer([goal], { x: 0, z: 0 }, 0);
    hud.update(state({ inside: false }));
    hud.updatePointer([goal], { x: 0, z: -4000 }, 0);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toBe('Goal: Buy  215 m');
    expect((root.querySelector('.msn-pointer-arrow') as HTMLElement).style.visibility).toBe('');
  });

  it('idle Offer pointer also says inside', () => {
    const hud = new MissionHud(root);
    hud.update(state({ status: 'idle', inside: true }));
    hud.updatePointer([{ ...goal, kind: 'giver', label: 'Crate Digger' }], { x: 0, z: 0 }, 0);
    expect(root.querySelector('.msn-pointer-text')!.textContent).toBe('Offer: Crate Digger  inside');
  });
});
