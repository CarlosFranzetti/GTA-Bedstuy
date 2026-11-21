// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  joystickVector, TouchControls, STICK_RADIUS, FloatingStick, LookSmoother, visibleButtons, promptNeedsCarButton, TouchPrefs, hapticTick, LOOK_GAIN,
} from '@/ui/TouchControls';
import { Input, ACTION_VIRTUAL } from '@/core/Input';

const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const ptr = (type: string, id: number, x: number, y: number): Event => {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(e, { pointerId: id, clientX: x, clientY: y });
  return e;
};

describe('joystickVector', () => {
  it('maps screen-up drag to forward', () => {
    const v = joystickVector(0, -STICK_RADIUS); expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(1);
  });
  it('has a dead zone and clamps to the unit disc', () => {
    expect(joystickVector(2, 2)).toEqual({ x: 0, y: 0 });
    const v = joystickVector(300, 400); expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
  it('starts from zero at the dead-zone edge instead of jumping', () => {
    const v = joystickVector(0, -STICK_RADIUS * 0.13); expect(v.y).toBeGreaterThan(0); expect(v.y).toBeLessThan(0.05);
  });
});

describe('FloatingStick', () => {
  it('plants its origin where the thumb lands and reads the drag from there', () => {
    const s = new FloatingStick(50); s.begin(120, 300);
    expect(s.origin).toEqual({ x: 120, y: 300 });
    const v = s.move(120 + 50, 300); expect(v.x).toBeCloseTo(1); expect(v.y).toBeCloseTo(0);
    const up = s.move(120, 300 - 25); expect(up.y).toBeGreaterThan(0.3); expect(up.y).toBeLessThan(0.7);
  });
  it('follows a thumb that drifts past the ring, so reversing is quick', () => {
    const s = new FloatingStick(50); s.begin(100, 100);
    s.move(300, 100);
    expect(s.origin.x).toBeCloseTo(250);                // dragged along, one radius behind the thumb
    const back = s.move(250, 100); expect(back.x).toBeCloseTo(0);
    const left = s.move(200, 100); expect(left.x).toBeLessThan(-0.9);
  });
  it('can be fixed (no follow) and resets on end', () => {
    const s = new FloatingStick(50, false); s.begin(0, 0); s.move(500, 0);
    expect(s.origin.x).toBe(0); expect(s.vec.x).toBeCloseTo(1);
    s.end(); expect(s.vec).toEqual({ x: 0, y: 0 }); expect(s.active).toBe(false);
    expect(s.move(30, 30)).toEqual({ x: 0, y: 0 });     // ignored while not active
  });
});

describe('LookSmoother', () => {
  it('conserves the total turn and empties its queue', () => {
    const l = new LookSmoother(2, 0.5); l.push(40, -10);
    let sx = 0, sy = 0, n = 0;
    while (l.pending && n++ < 50) { const o = l.step(); sx += o.x; sy += o.y; }
    expect(sx).toBeCloseTo(80); expect(sy).toBeCloseTo(-20); expect(l.pending).toBe(false);
  });
  it('spreads a fast flick over several frames and flushes the rest', () => {
    const l = new LookSmoother(2, 0.5); l.push(100, 0);
    const first = l.step(); expect(first.x).toBeCloseTo(100); expect(first.x).toBeLessThan(200);
    const rest = l.flush(); expect(first.x + rest.x).toBeCloseTo(200);
  });
});

describe('context buttons', () => {
  it('shows the on-foot set without CAR until a car is in reach', () => {
    const foot = visibleButtons({ driving: false, nearCar: false });
    expect(foot).toEqual(expect.arrayContaining(['act', 'jump', 'run', 'view', 'look']));
    expect(foot).not.toContain('car'); expect(foot).not.toContain('gas'); expect(foot).not.toContain('horn');
    expect(visibleButtons({ driving: false, nearCar: true })).toContain('car');
  });
  it('shows GAS, BRAKE and EXIT while driving and hides the on-foot buttons', () => {
    const drive = visibleButtons({ driving: true, nearCar: false });
    expect(drive).toEqual(expect.arrayContaining(['gas', 'brake', 'hand', 'horn', 'radio', 'car', 'view']));
    expect(drive).not.toContain('act'); expect(drive).not.toContain('jump'); expect(drive).not.toContain('run');
  });
  it('reads the HUD prompt', () => {
    expect(promptNeedsCarButton('CAR  Enter car')).toBe(true);
    expect(promptNeedsCarButton('F  Enter')).toBe(true);
    expect(promptNeedsCarButton('')).toBe(false);
    expect(promptNeedsCarButton('Offer: Crate Digger 15 m')).toBe(false);
  });
});

describe('TouchPrefs', () => {
  it('remembers the tutorial and survives broken storage', () => {
    const p = new TouchPrefs(memStore());
    expect(p.tutorialSeen).toBe(false); p.markTutorialSeen(); expect(p.tutorialSeen).toBe(true);
    expect(new TouchPrefs({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }).tutorialSeen).toBe(false);
    expect(() => new TouchPrefs(null).markTutorialSeen()).not.toThrow();
  });
  it('haptics default on and can be switched off', () => {
    const p = new TouchPrefs(memStore()); expect(p.haptics).toBe(true); p.haptics = false; expect(p.haptics).toBe(false);
  });
  it('hapticTick reports false where the browser has no vibrate (iPhone Safari)', () => {
    expect(hapticTick()).toBe(false);
    const v = vi.fn(() => true); Object.defineProperty(navigator, 'vibrate', { value: v, configurable: true });
    expect(hapticTick(7)).toBe(true); expect(v).toHaveBeenCalledWith(7);
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });
  });
});

describe('TouchControls DOM', () => {
  let root: HTMLElement; let input: Input; let tc: TouchControls;
  beforeEach(() => {
    document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root);
    input = new Input(document.body);
    tc = new TouchControls(root, input, new TouchPrefs(memStore()));
  });
  it('builds two zones, a stick ring, and the buttons; marks the root as touch', () => {
    expect(root.classList.contains('touch')).toBe(true);
    expect(root.querySelector('.tc-zone-left')).not.toBeNull();
    expect(root.querySelector('.tc-look')).not.toBeNull();
    expect(root.querySelector('.tc-stick')).not.toBeNull();
    expect(root.querySelectorAll('.tc-btn').length).toBe(11);
  });
  it('shows only the on-foot buttons at first, CAR when the HUD prompt asks for it, GAS and BRAKE in a car', () => {
    const shown = () => [...root.querySelectorAll<HTMLButtonElement>('.tc-btn')].filter((b) => !b.hidden).map((b) => b.className.match(/tc-btn-(\w+)/)![1]);
    expect(shown()).toEqual(expect.arrayContaining(['act', 'jump', 'run', 'view', 'look'])); expect(shown()).not.toContain('car');
    tc.setNearCar(true); expect(shown()).toContain('car');
    tc.setNearCar(false); expect(shown()).not.toContain('car');
    tc.setDriving(true);
    expect(shown()).toEqual(expect.arrayContaining(['gas', 'brake', 'car'])); expect(shown()).not.toContain('act');
    expect(root.querySelector('.tc-btn-car')!.textContent).toBe('EXIT');
    tc.setDriving(false); expect(root.querySelector('.tc-btn-car')!.textContent).toBe('CAR');
  });
  it('a thumb landing in the left half plants the stick there and drives touchAxis; release centres it', () => {
    const zone = root.querySelector('.tc-zone-left')!;
    zone.dispatchEvent(ptr('pointerdown', 1, 80, 260));
    expect(tc.root.classList.contains('tc-stick-on')).toBe(true);
    zone.dispatchEvent(ptr('pointermove', 1, 80, 260 - STICK_RADIUS));
    expect(input.touchAxis.y).toBeCloseTo(1); expect(input.touchAxis.x).toBeCloseTo(0);
    zone.dispatchEvent(ptr('pointerup', 1, 80, 200));
    expect(input.touchAxis).toEqual({ x: 0, y: 0 }); expect(tc.root.classList.contains('tc-stick-on')).toBe(false);
  });
  it('a second finger does not steal the stick', () => {
    const zone = root.querySelector('.tc-zone-left')!;
    zone.dispatchEvent(ptr('pointerdown', 1, 80, 260)); zone.dispatchEvent(ptr('pointerdown', 2, 150, 300));
    zone.dispatchEvent(ptr('pointermove', 2, 400, 300)); expect(input.touchAxis).toEqual({ x: 0, y: 0 });
  });
  it('dragging the right half turns the camera by the look gain, and lifting delivers what is queued', () => {
    const zone = root.querySelector('.tc-look')!;
    zone.dispatchEvent(ptr('pointerdown', 5, 600, 200));
    zone.dispatchEvent(ptr('pointermove', 5, 610, 200));
    zone.dispatchEvent(ptr('pointerup', 5, 610, 200));
    expect(input.mouseDX).toBeGreaterThan(0); expect(input.mouseDX).toBeLessThanOrEqual(10 * LOOK_GAIN + 0.001);
  });
  it('ACT holds the action virtual key while pressed; GAS holds KeyW; both release', () => {
    const act = root.querySelector('.tc-btn-act')!;
    act.dispatchEvent(ptr('pointerdown', 7, 700, 300)); expect(input.isDown(ACTION_VIRTUAL)).toBe(true);
    act.dispatchEvent(ptr('pointerup', 7, 700, 300)); expect(input.isDown(ACTION_VIRTUAL)).toBe(false);
    tc.setDriving(true);
    const gas = root.querySelector('.tc-btn-gas')!;
    gas.dispatchEvent(ptr('pointerdown', 8, 700, 300)); expect(input.isDown('KeyW')).toBe(true);
    gas.dispatchEvent(ptr('pointerup', 8, 700, 300)); expect(input.isDown('KeyW')).toBe(false);
    const brake = root.querySelector('.tc-btn-brake')!;
    brake.dispatchEvent(ptr('pointerdown', 9, 600, 300)); expect(input.isDown('Space')).toBe(true);
    brake.dispatchEvent(ptr('pointercancel', 9, 600, 300)); expect(input.isDown('Space')).toBe(false);
  });
  it('RUN latches sprint until tapped again or the stick lets go', () => {
    const run = root.querySelector('.tc-btn-run')!; const zone = root.querySelector('.tc-zone-left')!;
    run.dispatchEvent(ptr('pointerdown', 3, 700, 200)); expect(input.isDown('ShiftLeft')).toBe(true);
    run.dispatchEvent(ptr('pointerup', 3, 700, 200)); expect(input.isDown('ShiftLeft')).toBe(true);
    zone.dispatchEvent(ptr('pointerdown', 4, 80, 260)); zone.dispatchEvent(ptr('pointerup', 4, 80, 260));
    expect(input.isDown('ShiftLeft')).toBe(false);
  });
});

describe('tutorial and rotate hint', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.useFakeTimers(); });
  it('shows once when asked, and dismissing it is remembered', () => {
    const root = document.createElement('div'); document.body.appendChild(root);
    const prefs = new TouchPrefs(memStore());
    const tc = new TouchControls(root, new Input(document.body), prefs);
    tc.showTutorial();
    expect(root.querySelector('.tc-tutorial')).not.toBeNull();
    (root.querySelector('.tc-tut-ok') as HTMLElement).dispatchEvent(ptr('pointerdown', 1, 0, 0));
    expect(prefs.tutorialSeen).toBe(true);
    vi.advanceTimersByTime(500); expect(root.querySelector('.tc-tutorial')).toBeNull();
    vi.useRealTimers();
  });
  it('does not show on a later run once it was seen', () => {
    const root = document.createElement('div'); document.body.appendChild(root);
    const prefs = new TouchPrefs(memStore()); prefs.markTutorialSeen();
    new TouchControls(root, new Input(document.body), prefs);
    vi.advanceTimersByTime(2000);
    expect(root.querySelector('.tc-tutorial')).toBeNull();
    vi.useRealTimers();
  });
  it('first touches of play do not whisk the tutorial away before it can be read', () => {
    const root = document.createElement('div'); document.body.appendChild(root);
    const prefs = new TouchPrefs(memStore());
    const tc = new TouchControls(root, new Input(document.body), prefs);
    tc.showTutorial();
    root.querySelector('.tc-zone-left')!.dispatchEvent(ptr('pointerdown', 1, 50, 200));
    expect(root.querySelector('.tc-tutorial.out')).toBeNull();
    vi.advanceTimersByTime(4100);
    root.querySelector('.tc-zone-left')!.dispatchEvent(ptr('pointerup', 1, 50, 200));
    root.querySelector('.tc-zone-left')!.dispatchEvent(ptr('pointerdown', 2, 50, 200));
    expect(root.querySelector('.tc-tutorial.out')).not.toBeNull();
    vi.useRealTimers();
  });
});
