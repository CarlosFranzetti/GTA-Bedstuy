// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Bindings } from '@/core/Bindings';
import { Input } from '@/core/Input';

const key = (code: string, type: 'keydown' | 'keyup' = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
const mk = () => { const b = new Bindings(false); const input = new Input(document.createElement('div'), b); return { b, input }; };

describe('Input resolves action ids through the binding table', () => {
  it('a rebound key drives the action and the old key no longer does', () => {
    const { b, input } = mk();
    key('KeyF');
    expect(input.consume('KeyF')).toBe(true);
    key('KeyF', 'keyup');
    b.rebind('enter', 0, 'KeyE');
    key('KeyF');
    expect(input.consume('KeyF')).toBe(false);
    key('KeyF', 'keyup');
    key('KeyE');
    expect(input.consume('KeyF')).toBe(true);
    expect(input.isDown('KeyF')).toBe(true);
    key('KeyE', 'keyup');
    expect(input.isDown('KeyF')).toBe(false);
  });

  it('arrows no longer move (Up is the phone, as in GTA); W does', () => {
    const { input } = mk();
    key('ArrowUp');
    expect(input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])).toBe(0);
    expect(input.consume('KeyP')).toBe(true); // the phone action
    key('ArrowUp', 'keyup');
    key('KeyW');
    expect(input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])).toBe(1);
  });

  it('Space is the jump on foot and the handbrake in a vehicle', () => {
    const { input } = mk();
    key('Space');
    expect(input.isDown('Space')).toBe(true);        // jump / brake id on foot
    expect(input.isDown('ShiftLeft')).toBe(false);   // handbrake id: not live on foot
    input.vehicleContext = true;
    expect(input.isDown('Space')).toBe(false);       // the hard-brake action has no key
    expect(input.isDown('ShiftLeft')).toBe(true);    // Space is the handbrake in a car
    key('Space', 'keyup');
  });

  it('Shift sprints on foot only; G is the action button on foot and the horn in a car', () => {
    const { input } = mk();
    key('ShiftLeft');
    expect(input.isDown('ShiftLeft')).toBe(true);
    input.vehicleContext = true;
    expect(input.isDown('ShiftLeft')).toBe(false);
    key('ShiftLeft', 'keyup');
    input.vehicleContext = false;
    key('KeyG');
    expect(input.actionHeld()).toBe(true);
    expect(input.isDown('KeyH')).toBe(false);
    input.vehicleContext = true;
    expect(input.isDown('KeyH')).toBe(true);
    key('KeyG', 'keyup');
  });

  it('the wheel steps items on foot and radio stations in a car; Tab steps items', () => {
    const { input } = mk();
    const el = (input as unknown as { el: HTMLElement }).el;
    Object.defineProperty(input, 'pointerLocked', { value: true, writable: true });
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    expect(input.consumeCycle()).toBe(1);
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(input.consumeCycle()).toBe(-1);
    input.vehicleContext = true;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    expect(input.consume('KeyE')).toBe(true);        // radio next
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(input.consume('RadioPrev')).toBe(true);
    input.vehicleContext = false;
    key('Tab');
    expect(input.consumeCycle()).toBe(1);
    key('Tab', 'keyup');
  });

  it('middle mouse opens the phone and does not swap the shoulder', () => {
    const { input } = mk();
    const el = (input as unknown as { el: HTMLElement }).el;
    el.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true }));
    expect(input.consume('KeyP')).toBe(true);
    expect(input.consume('MouseMiddle')).toBe(false); // CameraViews reads the shoulder swap on 'MouseMiddle' and 'KeyB': not bound to the middle button now
    expect(input.consume('KeyB')).toBe(false);
  });

  it('Left Ctrl is ignored unless the keyboard lock holds it', () => {
    const { b, input } = mk();
    key('ControlLeft');
    expect(input.isDown('AltLeft')).toBe(false);
    key('ControlLeft', 'keyup');
    b.ctrlSafe = true; b.version++;
    key('ControlLeft');
    expect(input.isDown('AltLeft')).toBe(true); // walk
    key('ControlLeft', 'keyup');
  });

  it('virtual (touch, pad) presses keep reaching the canonical ids whatever the binding', () => {
    const { b, input } = mk();
    b.rebind('enter', 0, 'KeyE');
    input.setVirtual('KeyF', true);
    expect(input.isDown('KeyF')).toBe(true);
    input.setVirtual('KeyF', false);
    input.pulse('KeyF');
    expect(input.consume('KeyF')).toBe(true);
  });

  it('keys that no action uses pass through untouched', () => {
    const { input } = mk();
    key('KeyJ');
    expect(input.isDown('KeyJ')).toBe(true);
    key('KeyJ', 'keyup');
  });
});
