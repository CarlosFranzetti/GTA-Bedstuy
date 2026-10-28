// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Input } from '@/core/Input';
import { GamepadInput, applyDeadZone, DEAD_ZONE } from '@/core/Gamepad';

function makePad(over: { axes?: number[]; pressed?: number[]; values?: Record<number, number> } = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const v = over.values?.[i] ?? (over.pressed?.includes(i) ? 1 : 0);
    return { pressed: over.pressed?.includes(i) || v > 0.5, touched: v > 0, value: v };
  });
  return { id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: over.axes ?? [0, 0, 0, 0], buttons } as unknown as Gamepad;
}

function setup() {
  const input = new Input(document.body);
  let pad: Gamepad | null = null;
  const onToast = vi.fn(), onStart = vi.fn(), onNav = vi.fn();
  const gp = new GamepadInput(input, { getPads: () => [pad], onToast, onStart, onNav });
  return { input, gp, onToast, onStart, onNav, set: (p: Gamepad | null) => { pad = p; } };
}

describe('applyDeadZone', () => {
  it('zeroes inside the 0.15 zone and rescales outside', () => {
    expect(applyDeadZone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const v = applyDeadZone(1, 0);
    expect(v.x).toBeCloseTo(1); expect(v.y).toBe(0);
    const mid = applyDeadZone(0.575, 0);
    expect(mid.x).toBeCloseTo((0.575 - DEAD_ZONE) / (1 - DEAD_ZONE));
  });
});

describe('GamepadInput', () => {
  it('reports connection once with a toast, and disconnection', () => {
    const { gp, set, onToast } = setup();
    gp.update(1 / 60);
    expect(gp.connected).toBe(false);
    set(makePad());
    gp.update(1 / 60); gp.update(1 / 60);
    expect(gp.connected).toBe(true);
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Controller connected');
    set(null);
    gp.update(1 / 60);
    expect(gp.connected).toBe(false);
  });

  it('left stick feeds touchAxis (y inverted so up = forward) and releases to zero', () => {
    const { gp, input, set } = setup();
    set(makePad({ axes: [0, -1, 0, 0] }));
    gp.update(1 / 60);
    expect(input.touchAxis.y).toBeCloseTo(1);
    expect(input.axis(['KeyS'], ['KeyW'])).toBeCloseTo(1);
    set(makePad({ axes: [0.6, 0, 0, 0] }));
    gp.update(1 / 60);
    expect(input.touchAxis.x).toBeGreaterThan(0.4);
    expect(input.touchAxis.y).toBeCloseTo(0);
    set(makePad({ axes: [0.05, 0.05, 0, 0] }));
    gp.update(1 / 60);
    expect(input.touchAxis).toEqual({ x: 0, y: 0 });
  });

  it('does not clobber a touch stick while the gamepad is idle', () => {
    const { gp, input, set } = setup();
    set(makePad());
    input.touchAxis.x = 0.5; input.touchAxis.y = 0.5;
    gp.update(1 / 60);
    expect(input.touchAxis).toEqual({ x: 0.5, y: 0.5 });
  });

  it('right stick adds look scaled by dt; invertLookY flips vertical', () => {
    const { gp, input, set } = setup();
    set(makePad({ axes: [0, 0, 1, 1] }));
    gp.update(0.5);
    expect(input.mouseDX).toBeGreaterThan(0);
    expect(input.mouseDY).toBeGreaterThan(0);
    const dx = input.mouseDX;
    input.endFrame(); input.invertLookY = true;
    gp.update(0.5);
    expect(input.mouseDX).toBeCloseTo(dx);
    expect(input.mouseDY).toBeLessThan(0);
    input.endFrame();
    gp.update(0.25);
    expect(input.mouseDX).toBeCloseTo(dx / 2);
  });

  it('A is an enter/exit edge (KeyF), once per press', () => {
    const { gp, input, set } = setup();
    set(makePad({ pressed: [0] }));
    gp.update(1 / 60);
    expect(input.pressed('KeyF')).toBe(true);
    expect(input.isDown('KeyF')).toBe(false);
    input.endFrame();
    gp.update(1 / 60);
    expect(input.pressed('KeyF')).toBe(false);
  });

  it('Y is radio (KeyE); LB horn and X handbrake/run are held', () => {
    const { gp, input, set } = setup();
    set(makePad({ pressed: [3, 4, 2] }));
    gp.update(1 / 60);
    expect(input.pressed('KeyE')).toBe(true);
    expect(input.isDown('KeyH')).toBe(true);
    expect(input.isDown('ShiftLeft')).toBe(true);
    set(makePad());
    gp.update(1 / 60);
    expect(input.isDown('KeyH')).toBe(false);
    expect(input.isDown('ShiftLeft')).toBe(false);
  });

  it('in a vehicle RT is analog throttle and LT is brake (Space)', () => {
    const { gp, input, set } = setup();
    gp.inVehicle = true;
    set(makePad({ values: { 7: 0.6, 6: 1 } }));
    gp.update(1 / 60);
    expect(input.touchAxis.y).toBeCloseTo(0.6);
    expect(input.axis(['KeyS'], ['KeyW'])).toBeCloseTo(0.6);
    expect(input.isDown('Space')).toBe(true);
    set(makePad({ values: { 7: 0.6 } }));
    gp.update(1 / 60);
    expect(input.isDown('Space')).toBe(false);
  });

  it('on foot triggers do nothing to the axes or brake', () => {
    const { gp, input, set } = setup();
    gp.inVehicle = false;
    set(makePad({ values: { 7: 1, 6: 1 } }));
    gp.update(1 / 60);
    expect(input.touchAxis).toEqual({ x: 0, y: 0 });
    expect(input.isDown('Space')).toBe(false);
  });

  it('Start fires onStart once per press; d-pad / A / B drive menu navigation', () => {
    const { gp, set, onStart, onNav } = setup();
    set(makePad({ pressed: [9, 12, 0, 1] }));
    gp.update(1 / 60); gp.update(1 / 60);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onNav.mock.calls.map((c) => c[0]).sort()).toEqual(['back', 'confirm', 'up']);
  });

  it('while paused nothing reaches the game but Start and navigation still work', () => {
    const { gp, input, set, onStart, onNav } = setup();
    gp.paused = true; gp.inVehicle = true;
    set(makePad({ axes: [1, -1, 1, 1], pressed: [9, 0, 2, 13], values: { 7: 1 } }));
    gp.update(0.1);
    expect(input.touchAxis).toEqual({ x: 0, y: 0 });
    expect(input.mouseDX).toBe(0);
    expect(input.pressed('KeyF')).toBe(false);
    expect(input.isDown('ShiftLeft')).toBe(false);
    expect(onStart).toHaveBeenCalled();
    expect(onNav).toHaveBeenCalledWith('down');
  });

  it('switches the input mode to gamepad on activity, and keyboard takes it back', () => {
    const { gp, input, set } = setup();
    const modes: string[] = [];
    input.onModeChange = (m) => modes.push(m);
    set(makePad());
    gp.update(1 / 60);
    expect(modes).toEqual([]);
    set(makePad({ pressed: [1] }));
    gp.update(1 / 60);
    expect(input.mode).toBe('gamepad');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(input.mode).toBe('keyboard');
    expect(modes).toEqual(['gamepad', 'keyboard']);
  });
});
