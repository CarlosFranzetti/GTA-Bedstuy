// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hud, STATION_BANNER_MS, STATION_STRIP_SLOTS } from '@/ui/Hud';
import { MissionHud, CASH_DELTA_MS, SUBTITLE_MS, formatCashDelta, highlightKeywords } from '@/ui/MissionHud';
import type { HudState } from '@/world/types';
import type { MissionHudState } from '@/game/missions/types';

const hs: HudState = { stars: 0, speedKmh: 0, inVehicle: true, radioStation: 'Static FM', prompt: '', timeOfDay: 12, streetName: 'Throop Ave', fps: 60 };
const ms = (o: Partial<MissionHudState> = {}): MissionHudState => ({
  status: 'idle', title: '', objective: '', step: 0, steps: 0, timeLeft: -1, progress: -1, carrying: '', cash: 0, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '', prompt: '', ...o,
});
const q = (root: HTMLElement, sel: string): HTMLElement => { const e = root.querySelector<HTMLElement>(sel); if (!e) throw new Error(sel); return e; };

let root: HTMLElement;
beforeEach(() => { vi.useFakeTimers(); root = document.createElement('div'); document.body.appendChild(root); });
afterEach(() => { vi.useRealTimers(); root.remove(); });

describe('HUD street + area', () => {
  it('shows street and area, and restarts the fade-in only when the street changes', () => {
    const hud = new Hud(root);
    hud.update(hs);
    expect(q(root, '.hud-street').textContent).toBe('Throop Ave');
    expect(q(root, '.hud-area').textContent).toBe('Bed-Stuy');
    expect(q(root, '.hud-location').classList.contains('fresh')).toBe(false);
    hud.update({ ...hs, streetName: 'Kosciuszko St' });
    expect(q(root, '.hud-street').textContent).toBe('Kosciuszko St');
    expect(q(root, '.hud-location').classList.contains('fresh')).toBe(true);
  });
});

describe('HUD station strip', () => {
  const names = ['A 1', 'B 2', 'C 3', 'D 4', 'E 5', 'F 6'];
  it('stays hidden on first tune, appears on a change with the current station centred, then hides', () => {
    const hud = new Hud(root);
    hud.setStations(names);
    hud.update({ ...hs, radioStation: 'A 1' });
    expect(q(root, '.hud-station').hidden).toBe(true);
    hud.update({ ...hs, radioStation: 'C 3' });
    const banner = q(root, '.hud-station');
    expect(banner.hidden).toBe(false);
    expect(q(root, '.hud-station-name').textContent).toBe('C 3');
    const chips = [...root.querySelectorAll('.hud-station-chip')];
    expect(chips.length).toBe(STATION_STRIP_SLOTS);
    expect(chips.map((c) => c.textContent)).toEqual(['A 1', 'B 2', 'C 3', 'D 4', 'E 5']);
    expect(chips[Math.floor(chips.length / 2)]?.classList.contains('on')).toBe(true);
    vi.advanceTimersByTime(STATION_BANNER_MS + 10);
    expect(banner.hidden).toBe(true);
  });
  it('wraps around the dial and splits "name — tagline"', () => {
    const hud = new Hud(root);
    hud.setStations(['WBED 88.9 — Boom-Bap', 'B', 'C', 'D', 'E', 'F']);
    hud.update({ ...hs, radioStation: 'B' });
    hud.update({ ...hs, radioStation: 'WBED 88.9 — Boom-Bap' });
    expect(q(root, '.hud-station-name').textContent).toBe('WBED 88.9');
    expect(q(root, '.hud-station-sub').textContent).toBe('Boom-Bap');
    expect([...root.querySelectorAll('.hud-station-chip')].map((c) => c.textContent)).toEqual(['E', 'F', 'WBED 88.9', 'B', 'C']);
  });
});

describe('HUD bars', () => {
  it('shows real vitals only when supplied, else HEAT from the wanted level and SPEED in a car', () => {
    const hud = new Hud(root);
    hud.update({ ...hs, inVehicle: false, stars: 0 });
    expect(q(root, '.hud-bar-health').hidden).toBe(true);
    expect(q(root, '.hud-bar-speed').hidden).toBe(true);
    hud.update({ ...hs, inVehicle: true, stars: 2, speedKmh: 70 });
    expect(q(root, '.hud-bar-heat .hud-bar-fill').style.width).toBe('67%');
    expect(q(root, '.hud-bar-speed .hud-bar-fill').style.width).toBe('50%');
    hud.update({ ...hs, health: 0.5, armour: 0.25 });
    expect(q(root, '.hud-bar-health').hidden).toBe(false);
    expect(q(root, '.hud-bar-health .hud-bar-fill').style.width).toBe('50%');
    expect(q(root, '.hud-bar-armour .hud-bar-fill').style.width).toBe('25%');
  });
});

describe('cash ticker', () => {
  it('counts up toward the new total and shows a +$ chip that clears itself', () => {
    const m = new MissionHud(root);
    m.update(ms({ cash: 100 }), 1);
    for (let i = 0; i < 40; i++) m.update(ms({ cash: 100 }), 0.1);
    expect(q(root, '.msn-cash').textContent).toBe('$100');
    m.update(ms({ cash: 150 }), 0.05);
    const chip = q(root, '.msn-cash-delta');
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe('+$50');
    expect(chip.dataset.sign).toBe('up');
    expect(q(root, '.msn-cash').textContent).not.toBe('$150'); // still ticking
    for (let i = 0; i < 60; i++) m.update(ms({ cash: 150 }), 0.1);
    expect(q(root, '.msn-cash').textContent).toBe('$150');
    vi.advanceTimersByTime(CASH_DELTA_MS + 10);
    expect(chip.hidden).toBe(true);
  });
  it('sums quick changes and flags spending with -$', () => {
    const m = new MissionHud(root);
    m.update(ms({ cash: 200 }), 1);
    m.update(ms({ cash: 180 }), 0.1);
    expect(q(root, '.msn-cash-delta').textContent).toBe('-$20');
    expect(q(root, '.msn-cash-delta').dataset.sign).toBe('down');
    m.update(ms({ cash: 170 }), 0.1);
    expect(q(root, '.msn-cash-delta').textContent).toBe('-$30');
    expect(formatCashDelta(0)).toBeNull();
    expect(formatCashDelta(1234)).toBe('+$1,234');
  });
});

describe('mission subtitle', () => {
  it('shows the objective bottom-centre with keywords highlighted, once per objective change', () => {
    const m = new MissionHud(root);
    m.update(ms({ status: 'active', title: 'T', objective: 'Deliver the crate to Wax Deli for $40' }), 0.1);
    const sub = q(root, '.msn-sub');
    expect(sub.hidden).toBe(false);
    expect([...sub.querySelectorAll('.msn-kw')].map((e) => e.textContent)).toEqual(['Wax Deli', '$40']);
    vi.advanceTimersByTime(SUBTITLE_MS + 10);
    expect(sub.hidden).toBe(true);
    m.update(ms({ status: 'active', title: 'T', objective: 'Deliver the crate to Wax Deli for $40' }), 0.1);
    expect(sub.hidden).toBe(true); // same objective: no replay
  });
  it('does not highlight a capitalised first word', () => {
    expect(highlightKeywords(document, 'Go to Throop Ave').filter((n) => (n as HTMLElement).className === 'msn-kw').map((n) => n.textContent)).toEqual(['Throop Ave']);
  });
});

describe('HUD help text and wanted stars', () => {
  it('shows the help prompt and flags the root so the objective box makes room', () => {
    const hud = new Hud(root);
    hud.update(hs);
    expect(root.classList.contains('has-help')).toBe(false);
    hud.update({ ...hs, prompt: 'F  Enter car' });
    expect(q(root, '.hud-prompt').hidden).toBe(false);
    expect(q(root, '.hud-prompt').textContent).toContain('Enter car');
    expect(root.classList.contains('has-help')).toBe(true);
    hud.update({ ...hs, prompt: '' });
    expect(root.classList.contains('has-help')).toBe(false);
  });

  it('draws the wanted level as stars (on / off) with a pulse when it changes', () => {
    const hud = new Hud(root);
    hud.update({ ...hs, stars: 1 });
    const stars = [...root.querySelectorAll('.hud-star')];
    expect(stars.map((s) => s.classList.contains('on'))).toEqual([true, false, false]);
    hud.update({ ...hs, stars: 3 });
    expect(stars.map((s) => s.classList.contains('on'))).toEqual([true, true, true]);
    expect(q(root, '.hud-stars').classList.contains('pulse')).toBe(true);
    expect(q(root, '.hud-stars').getAttribute('aria-label')).toContain('3');
  });
});
