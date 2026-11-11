// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hud, VEHICLE_CARD_MS, STAR_FLASH_MS } from '@/ui/Hud';
import { MissionHud } from '@/ui/MissionHud';
import type { HudState } from '@/world/types';
import type { MissionHudState } from '@/game/missions/types';

const hs: HudState = { stars: 0, speedKmh: 0, inVehicle: false, radioStation: '', prompt: '', timeOfDay: 12, streetName: 'Throop Ave', fps: 60 };
const ms = (o: Partial<MissionHudState> = {}): MissionHudState => ({
  status: 'idle', title: '', objective: '', step: 0, steps: 0, timeLeft: -1, progress: -1, carrying: '', cash: 0, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '', prompt: '', ...o,
});
const q = (root: HTMLElement, sel: string): HTMLElement => { const e = root.querySelector<HTMLElement>(sel); if (!e) throw new Error(sel); return e; };
let root: HTMLElement;
beforeEach(() => { vi.useFakeTimers(); root = document.createElement('div'); document.body.appendChild(root); });
afterEach(() => { vi.useRealTimers(); root.remove(); });

describe('HUD life', () => {
  it('flashes gained stars, then settles; blinks while cooling off', () => {
    const hud = new Hud(root);
    hud.update({ ...hs, stars: 0 });
    hud.update({ ...hs, stars: 1 });
    expect(q(root, '.hud-stars').classList.contains('gain')).toBe(true);
    vi.advanceTimersByTime(STAR_FLASH_MS + 10);
    expect(q(root, '.hud-stars').classList.contains('gain')).toBe(false);
    hud.update({ ...hs, stars: 1, wantedCooling: true });
    expect(q(root, '.hud-stars').classList.contains('cooling')).toBe(true);
    hud.update({ ...hs, stars: 0, wantedCooling: true });
    expect(q(root, '.hud-stars').classList.contains('cooling')).toBe(false);
    expect(q(root, '.hud-stars').classList.contains('gain')).toBe(false); // losing a star is not a flash
  });

  it('shows the place name on a new street and the vehicle card for a few seconds after getting in', () => {
    const hud = new Hud(root);
    hud.update(hs);
    expect(q(root, '.hud-place').classList.contains('show')).toBe(true);
    q(root, '.hud-place').classList.remove('show');
    hud.update({ ...hs, streetName: 'Kosciuszko St' });
    expect(q(root, '.hud-place').classList.contains('show')).toBe(true);
    expect(q(root, '.hud-vehicle').hidden).toBe(true);
    hud.update({ ...hs, inVehicle: true, vehicleName: 'Hatchback', vehicleClass: 'Compact' });
    expect(q(root, '.hud-vehicle').hidden).toBe(false);
    expect(q(root, '.hud-vehicle-name').textContent).toBe('Hatchback');
    expect(q(root, '.hud-vehicle-class').textContent).toBe('Compact');
    vi.advanceTimersByTime(VEHICLE_CARD_MS + 10);
    expect(q(root, '.hud-vehicle').hidden).toBe(true);
    hud.update({ ...hs, inVehicle: false });
    hud.update({ ...hs, inVehicle: true, vehicleName: 'Hatchback' });
    expect(q(root, '.hud-vehicle').hidden).toBe(false); // getting in again shows it again
  });
});

describe('Mission passed and cash flash', () => {
  it('shows MISSION PASSED with the reward tallying up as the cash lands', () => {
    const m = new MissionHud(root);
    m.update(ms({ status: 'active', title: 'Air Rights', cash: 100 }), 1 / 60);
    expect(q(root, '.msn-passed').hidden).toBe(true);
    m.update(ms({ status: 'complete', title: 'Air Rights', cash: 350 }), 1 / 60);
    expect(q(root, '.msn-passed').hidden).toBe(false);
    expect(q(root, '.msn-passed-word').textContent).toBe('Mission passed');
    expect(q(root, '.msn-passed-title').textContent).toBe('Air Rights');
    for (let i = 0; i < 240; i++) m.update(ms({ status: 'complete', title: 'Air Rights', cash: 350 }), 1 / 60);
    expect(q(root, '.msn-passed-reward').textContent).toContain('250');
    expect(q(root, '.msn-cash').textContent).toContain('350');
    vi.advanceTimersByTime(5000);
    expect(q(root, '.msn-passed').hidden).toBe(true);
  });

  it('flashes the cash green on a gain and red on a loss', () => {
    const m = new MissionHud(root);
    m.update(ms({ cash: 100 }), 1 / 60);
    m.update(ms({ cash: 150 }), 1 / 60);
    expect(q(root, '.msn-cash').dataset.flash).toBe('up');
    expect(q(root, '.msn-cash').classList.contains('flash')).toBe(true);
    m.update(ms({ cash: 120 }), 1 / 60);
    expect(q(root, '.msn-cash').dataset.flash).toBe('down');
  });
});
