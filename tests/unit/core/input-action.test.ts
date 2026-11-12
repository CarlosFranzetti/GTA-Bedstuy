// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ACTION_KEY, ACTION_MOUSE, ACTION_VIRTUAL, CYCLE_NEXT_KEY, CYCLE_PREV_VIRTUAL, Input } from '@/core/Input';
import { GamepadInput } from '@/core/Gamepad';
import { TouchControls } from '@/ui/TouchControls';

function mouse(el: HTMLElement, type: 'mousedown' | 'mouseup', button = 0): void {
  const e = new MouseEvent(type, { button, bubbles: true });
  (type === 'mouseup' ? window : el).dispatchEvent(e);
}

describe('action button: mouse', () => {
  it('the click that locks the pointer is not an action; later clicks are', () => {
    const el = document.createElement('div');
    const input = new Input(el);
    mouse(el, 'mousedown');           // pointer not locked yet: this click only takes the lock
    expect(input.actionHeld()).toBe(false);
    expect(input.consumeAction()).toBe(false);
    mouse(el, 'mouseup');
    input.pointerLocked = true;
    mouse(el, 'mousedown');
    expect(input.actionHeld()).toBe(true);
    expect(input.consumeAction()).toBe(true);
    expect(input.consumeAction()).toBe(false); // an edge, once
    expect(input.actionHeld()).toBe(true);     // still held
    mouse(el, 'mouseup');
    expect(input.actionHeld()).toBe(false);
  });
  it('other buttons are not the action', () => {
    const el = document.createElement('div');
    const input = new Input(el);
    input.pointerLocked = true;
    mouse(el, 'mousedown', 2);
    expect(input.actionHeld()).toBe(false);
    expect(input.isDown(ACTION_MOUSE)).toBe(false);
  });
});

describe('action button: keyboard and virtual', () => {
  it('G is the action; a Ctrl key is not (Ctrl+W closes a browser tab)', () => {
    const input = new Input(document.createElement('div'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlRight' }));
    expect(input.actionHeld()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: ACTION_KEY }));
    expect(input.actionHeld()).toBe(true);
    expect(input.consumeAction()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: ACTION_KEY }));
    expect(input.actionHeld()).toBe(false);
  });
  it('Q cycles forward, the virtual previous cycles back', () => {
    const input = new Input(document.createElement('div'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: CYCLE_NEXT_KEY }));
    expect(input.consumeCycle()).toBe(1);
    expect(input.consumeCycle()).toBe(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: CYCLE_NEXT_KEY }));
    input.pulse(CYCLE_PREV_VIRTUAL);
    expect(input.consumeCycle()).toBe(-1);
  });
});

function pad(over: { pressed?: number[]; values?: Record<number, number> }): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const v = over.values?.[i] ?? (over.pressed?.includes(i) ? 1 : 0);
    return { pressed: over.pressed?.includes(i) || v > 0.5, touched: v > 0, value: v };
  });
  return { id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
}

describe('action button: gamepad', () => {
  function setup() {
    const input = new Input(document.createElement('div'));
    let p: Gamepad | null = null;
    const gp = new GamepadInput(input, { getPads: () => [p], onToast: vi.fn() });
    return { input, gp, set: (x: Gamepad | null) => { p = x; } };
  }
  it('the right trigger on foot is the action; in a car it is the throttle', () => {
    const { input, gp, set } = setup();
    set(pad({ values: { 7: 1 } }));
    gp.update(1 / 60);
    expect(input.actionHeld()).toBe(true);
    expect(input.touchAxis.y).toBe(0);
    set(pad({}));
    gp.update(1 / 60);
    expect(input.actionHeld()).toBe(false);
    gp.inVehicle = true;
    set(pad({ values: { 7: 1 } }));
    gp.update(1 / 60);
    expect(input.actionHeld()).toBe(false);
    expect(input.touchAxis.y).toBeGreaterThan(0.9);
  });
  it('d-pad right and left step the held item on foot only', () => {
    const { input, gp, set } = setup();
    set(pad({ pressed: [15] })); gp.update(1 / 60);
    expect(input.consumeCycle()).toBe(1);
    set(pad({})); gp.update(1 / 60);
    set(pad({ pressed: [14] })); gp.update(1 / 60);
    expect(input.consumeCycle()).toBe(-1);
    gp.inVehicle = true;
    set(pad({})); gp.update(1 / 60);
    set(pad({ pressed: [15] })); gp.update(1 / 60);
    expect(input.consumeCycle()).toBe(0);
  });
});

describe('action button: touch', () => {
  it('has an ACT button that holds the action while pressed and hides in a car', () => {
    const parent = document.createElement('div');
    const input = new Input(parent);
    const tc = new TouchControls(parent, input);
    const btn = parent.querySelector('.tc-btn-act') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('ACT');
    btn.dispatchEvent(new Event('pointerdown', { cancelable: true }));
    expect(input.isDown(ACTION_VIRTUAL)).toBe(true);
    expect(input.actionHeld()).toBe(true);
    btn.dispatchEvent(new Event('pointerup'));
    expect(input.actionHeld()).toBe(false);
    tc.setDriving(true);
    expect(tc.root.classList.contains('tc-driving')).toBe(true);
  });
});
