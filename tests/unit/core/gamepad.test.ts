// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Input } from '@/core/Input';
import { GamepadInput, applyDeadZone, DEAD_ZONE, DEFAULT_TUNING } from '@/core/Gamepad';
import { GAME_BINDINGS } from '@/core/Bindings';

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

  it('Y is an enter/exit edge (KeyF), once per press (GTA V layout; A is sprint)', () => {
    const { gp, input, set } = setup();
    set(makePad({ pressed: [3] }));
    gp.update(1 / 60);
    expect(input.pressed('KeyF')).toBe(true);
    expect(input.isDown('KeyF')).toBe(false);
    // The pad is polled in the render callback, after the frame's steps: the edge survives that frame's
    // endFrame() so the NEXT frame's steps see it, and is gone after the one after.
    input.endFrame();
    expect(input.pressed('KeyF')).toBe(true);
    gp.update(1 / 60); // still held: no new edge
    input.endFrame();
    expect(input.pressed('KeyF')).toBe(false);
    expect(input.consume('KeyF')).toBe(false);
  });

  it('A also raises the PadConfirm edge (the title screen starts on it)', () => {
    const { gp, input, set } = setup();
    set(makePad({ pressed: [0] }));
    gp.update(1 / 60);
    expect(input.pressed('PadConfirm')).toBe(true);
    expect(input.pressed('KeyF')).toBe(false);
  });

  it('on foot: A sprints (held), X jumps, LB next item, d-pad up phone, d-pad left/right items', () => {
    const { gp, input, set } = setup();
    set(makePad({ pressed: [0, 2, 4, 12] }));
    gp.update(1 / 60);
    expect(input.isDown('ShiftLeft')).toBe(true);
    expect(input.pressed('Space')).toBe(true);
    expect(input.consumeCycle()).toBe(1);
    expect(input.pressed('KeyP')).toBe(true);
    set(makePad());
    gp.update(1 / 60);
    expect(input.isDown('ShiftLeft')).toBe(false);
    set(makePad({ pressed: [14] }));
    gp.update(1 / 60);
    expect(input.consumeCycle()).toBe(-1);
  });

  it('L3 toggles walking on foot; in a car L3 is the horn and RB the handbrake; d-pad is the radio', () => {
    const { gp, input, set } = setup();
    set(makePad({ pressed: [10] })); gp.update(1 / 60);
    expect(input.isDown('AltLeft')).toBe(true);
    set(makePad()); gp.update(1 / 60);
    expect(input.isDown('AltLeft')).toBe(true); // toggled on
    set(makePad({ pressed: [10] })); gp.update(1 / 60);
    set(makePad()); gp.update(1 / 60);
    expect(input.isDown('AltLeft')).toBe(false);
    gp.inVehicle = true;
    set(makePad({ pressed: [10, 5, 15] })); gp.update(1 / 60);
    expect(input.isDown('KeyH')).toBe(true);
    expect(input.isDown('ShiftLeft')).toBe(true);
    expect(input.pressed('KeyE')).toBe(true);
    set(makePad({ pressed: [14] })); gp.update(1 / 60);
    expect(input.pressed('RadioPrev')).toBe(true);
    set(makePad()); gp.update(1 / 60);
    expect(input.isDown('KeyH')).toBe(false);
    expect(input.isDown('ShiftLeft')).toBe(false);
  });

  it('in a vehicle RT is analog throttle and LT is brake (Space)', () => {
    const { gp, input, set } = setup();
    gp.inVehicle = true;
    set(makePad({ values: { 7: 0.6, 6: 1 } }));
    gp.update(1 / 60);
    expect(input.touchAxis.y).toBeCloseTo((0.6 - 0.05) / 0.95);
    expect(input.axis(['KeyS'], ['KeyW'])).toBeCloseTo((0.6 - 0.05) / 0.95);
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

  it('reads the pad family from the id and tells the binding table (prompts show Triangle on a PlayStation pad)', () => {
    const { gp, set } = setup();
    const ps = makePad(); (ps as unknown as { id: string }).id = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
    set(ps); gp.update(1 / 60);
    expect(gp.padKind).toBe('playstation');
    expect(GAME_BINDINGS.padKind).toBe('playstation');
    const xb = makePad(); (xb as unknown as { id: string }).id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)';
    set(xb); gp.update(1 / 60);
    expect(GAME_BINDINGS.padKind).toBe('xbox');
  });

  it('tuning: a bigger dead zone swallows a small stick push; look speed and curve scale the camera', () => {
    const input = new Input(document.body);
    let pad: Gamepad | null = makePad({ axes: [0.3, 0, 0, 0] });
    const gp = new GamepadInput(input, { getPads: () => [pad], tuning: { ...DEFAULT_TUNING, moveDeadZone: 0.4 } });
    gp.update(1 / 60);
    expect(input.touchAxis.x).toBe(0);
    gp.tuning.moveDeadZone = 0.1; gp.update(1 / 60);
    expect(input.touchAxis.x).toBeGreaterThan(0);
    pad = makePad({ axes: [0, 0, 1, 0] });
    input.endFrame(); gp.update(0.1);
    const base = input.mouseDX;
    input.endFrame(); gp.tuning.lookSpeed = 2; gp.update(0.1);
    expect(input.mouseDX).toBeCloseTo(base * 2);
  });

  it('rumble goes to the pad actuator as a dual-rumble effect, and not when switched off or paused', () => {
    const input = new Input(document.body);
    const calls: Array<{ type: string; p: { strongMagnitude: number; duration: number } }> = [];
    const pad = { ...makePad(), vibrationActuator: { playEffect: (type: string, p: { strongMagnitude: number; duration: number }) => { calls.push({ type, p }); return Promise.resolve('complete'); } } } as unknown as Gamepad;
    const gp = new GamepadInput(input, { getPads: () => [pad], tuning: { ...DEFAULT_TUNING } });
    gp.rumble(0.8, 0.3, 200);
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe('dual-rumble');
    expect(calls[0].p.strongMagnitude).toBeCloseTo(0.8);
    gp.rumble(5, 0, 99999);
    expect(calls[1].p.strongMagnitude).toBe(1); expect(calls[1].p.duration).toBe(2000);
    gp.tuning.vibration = false; gp.rumble(1, 1, 100);
    expect(calls).toHaveLength(2);
    gp.tuning.vibration = true; gp.paused = true; gp.rumble(1, 1, 100);
    expect(calls).toHaveLength(2);
  });
});
