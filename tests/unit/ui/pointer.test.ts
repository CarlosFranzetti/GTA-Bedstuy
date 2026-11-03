// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MissionHud } from '@/ui/MissionHud';
import { headingFromVec } from '@/core/Math2';
import type { MissionHudState, MissionMarker } from '@/game/missions/types';

const idle = (): MissionHudState => ({
  status: 'idle', title: '', objective: '', step: 0, steps: 0, timeLeft: -1, progress: -1, carrying: '',
  toast: '', toastKind: 'info', toastSeq: 0, retryPrompt: '', prompt: '', cash: 0,
} as unknown as MissionHudState);
const giver = (id: string, x: number, z: number, label = id): MissionMarker => ({ id, kind: 'giver', x, z, radius: 5, color: '#fc0', label });

function setup() {
  const root = document.createElement('div'); document.body.appendChild(root);
  const hud = new MissionHud(root); hud.update(idle());
  const ptr = root.querySelector<HTMLElement>('.msn-pointer')!;
  return { hud, ptr, dist: () => parseFloat(ptr.dataset.dist ?? 'NaN'), deg: () => parseFloat((root.querySelector<HTMLElement>('.msn-pointer-arrow')!.style.transform.match(/-?[\d.]+/) ?? ['NaN'])[0]) };
}

describe('mission pointer', () => {
  it('points at the NEAREST giver and the distance shrinks monotonically while walking toward it', () => {
    const { hud, ptr, dist } = setup();
    const markers = [giver('far', 0, -400, 'Far Job'), giver('near', 9, 35, 'Crate Digger'), giver('mid', -120, 20, 'Mid Job')];
    let last = Infinity;
    // H4 start (9, 20), the giver is 15 m south: walk south (+z) toward it
    for (let z = 20; z <= 33; z += 0.5) {
      hud.updatePointer(markers, { x: 9, z }, Math.PI); // heading south
      expect(ptr.textContent).toContain('Crate Digger');
      expect(dist()).toBeLessThan(last + 1e-9); last = dist();
    }
    expect(last).toBeCloseTo(2, 1);
  });
  it('walking away (north) makes the distance grow, 15 m -> 25 m like the H4 run, and the arrow then points behind', () => {
    const { hud, ptr, dist, deg } = setup();
    const markers = [giver('g', 9, 35, 'Crate Digger')];
    hud.updatePointer(markers, { x: 9, z: 20 }, 0); // facing north, giver 15 m south
    expect(dist()).toBeCloseTo(15, 1);
    expect(ptr.textContent).toContain('15 m');
    expect(Math.abs(Math.abs(deg()) - 180)).toBeLessThan(4);
    let last = dist();
    for (let z = 20; z >= 10; z -= 1) { hud.updatePointer(markers, { x: 9, z }, 0); expect(dist()).toBeGreaterThanOrEqual(last); last = dist(); }
    expect(last).toBeCloseTo(25, 1);
    expect(ptr.textContent).toContain('25 m');
  });
  it('the arrow is relative to the facing passed in: a giver due east is +90 deg when facing north, 0 deg when facing east', () => {
    const { hud, deg } = setup();
    const markers = [giver('g', 50, 0)];
    hud.updatePointer(markers, { x: 0, z: 0 }, 0); expect(deg()).toBe(90);
    hud.updatePointer(markers, { x: 0, z: 0 }, headingFromVec({ x: 1, z: 0 })); expect(deg()).toBe(0);
    hud.updatePointer(markers, { x: 0, z: 0 }, Math.PI); expect(deg()).toBe(-90);
  });
  it('hides during a mission and shows "here" inside the ring', () => {
    const { hud, ptr } = setup();
    const markers = [giver('g', 0, 0, 'Crate Digger')];
    hud.updatePointer(markers, { x: 1, z: 1 }, 0);
    expect(ptr.textContent).toContain('here');
    hud.update({ ...idle(), status: 'active', title: 'x', objective: 'y', steps: 1, step: 1 } as MissionHudState);
    hud.updatePointer(markers, { x: 30, z: 0 }, 0);
    expect(ptr.hidden).toBe(true);
  });
});
