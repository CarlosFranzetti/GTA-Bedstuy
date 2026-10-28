// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MissionHud, formatClock, formatCash } from '@/ui/MissionHud';
import type { MissionHudState } from '@/game/missions/types';

const base = (): MissionHudState => ({
  status: 'active', title: 'Bodega Run', objective: "Ms. Pearl's stoop", step: 2, steps: 5, timeLeft: 83.2, progress: -1,
  carrying: 'bodega bag, bodega bag', cash: 0, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '',
});

const q = (root: HTMLElement, sel: string): HTMLElement => {
  const e = root.querySelector<HTMLElement>(sel);
  if (!e) throw new Error(`missing ${sel}`);
  return e;
};

describe('MissionHud', () => {
  let root: HTMLElement;
  beforeEach(() => { vi.useFakeTimers(); root = document.createElement('div'); document.body.appendChild(root); });
  afterEach(() => { vi.useRealTimers(); root.remove(); });

  it('formats clock and cash', () => {
    expect(formatClock(83.2)).toBe('1:24');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
    expect(formatCash(1234.4)).toBe('$1,234');
    expect(formatCash(-5)).toBe('$0');
  });

  it('is hidden when idle and shows objective, step, timer and carried items when active', () => {
    const hud = new MissionHud(root);
    const s = base();
    s.status = 'idle';
    hud.update(s);
    expect(q(root, '.msn-panel').hidden).toBe(true);
    s.status = 'active';
    hud.update(s);
    expect(q(root, '.msn-panel').hidden).toBe(false);
    expect(q(root, '.msn-title').textContent).toBe('Bodega Run');
    expect(q(root, '.msn-objective').textContent).toBe("Ms. Pearl's stoop");
    expect(q(root, '.msn-step').textContent).toBe('2/5');
    expect(q(root, '.msn-timer').textContent).toBe('1:24');
    expect(q(root, '.msn-timer').hidden).toBe(false);
    expect(q(root, '.msn-timer').classList.contains('low')).toBe(false);
    expect(q(root, '.msn-carry').textContent).toBe('bodega bag, bodega bag');
  });

  it('timer turns urgent in the last 15 seconds and hides when there is no clock', () => {
    const hud = new MissionHud(root);
    const s = base();
    s.timeLeft = 14.2;
    hud.update(s);
    expect(q(root, '.msn-timer').classList.contains('low')).toBe(true);
    s.timeLeft = -1;
    hud.update(s);
    expect(q(root, '.msn-timer').hidden).toBe(true);
  });

  it('progress bar follows s.progress', () => {
    const hud = new MissionHud(root);
    const s = base();
    s.progress = 0.4;
    hud.update(s);
    expect(q(root, '.msn-bar').hidden).toBe(false);
    expect(q(root, '.msn-bar > i').style.width).toBe('40%');
    s.progress = -1;
    hud.update(s);
    expect(q(root, '.msn-bar').hidden).toBe(true);
  });

  it('failed state keeps the panel, labels it and shows the retry prompt', () => {
    const hud = new MissionHud(root);
    const s = base();
    s.status = 'failed';
    s.timeLeft = -1;
    s.retryPrompt = 'R  Retry   X  Give up';
    hud.update(s);
    expect(q(root, '.msn-title').textContent).toContain('failed');
    expect(q(root, '.msn-retry').hidden).toBe(false);
    expect(q(root, '.msn-retry').textContent).toBe('R  Retry   X  Give up');
    s.status = 'active'; s.retryPrompt = '';
    hud.update(s);
    expect(q(root, '.msn-retry').hidden).toBe(true);
  });

  it('shows a toast once per toastSeq and fades it out', () => {
    const hud = new MissionHud(root);
    const s = base();
    s.toastSeq = 1; s.toast = 'Bodega Run done.'; s.toastKind = 'good';
    hud.update(s);
    const t = q(root, '.msn-toast');
    expect(t.hidden).toBe(false);
    expect(t.textContent).toBe('Bodega Run done.');
    expect(t.dataset.kind).toBe('good');
    vi.advanceTimersByTime(4300);
    expect(t.classList.contains('out')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(t.hidden).toBe(true);
    hud.update(s); // same seq: does not pop again
    expect(t.hidden).toBe(true);
    s.toastSeq = 2; s.toast = 'again'; s.toastKind = 'bad';
    hud.update(s);
    expect(t.hidden).toBe(false);
    expect(t.dataset.kind).toBe('bad');
  });

  it('cash counts up toward the target and stays hidden at zero', () => {
    const hud = new MissionHud(root);
    const s = base();
    hud.update(s);
    expect(q(root, '.msn-cash').hidden).toBe(true);
    s.cash = 150;
    hud.update(s, 1 / 60);
    const cash = q(root, '.msn-cash');
    expect(cash.hidden).toBe(false);
    const first = Number(cash.textContent!.replace(/[$,]/g, ''));
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(150);
    for (let i = 0; i < 120; i++) hud.update(s, 1 / 60);
    expect(cash.textContent).toBe('$150');
  });

  it('dispose removes its nodes', () => {
    const hud = new MissionHud(root);
    hud.dispose();
    expect(root.children.length).toBe(0);
  });
});
