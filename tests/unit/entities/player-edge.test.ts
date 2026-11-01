// @vitest-environment jsdom
/**
 * Regression: "you can't exit the cars". A frame that runs several fixed steps (any frame slower than 60 Hz)
 * left the F press edge set for every step, so the sim exited the car on step 1 and re-entered the very same car
 * (it is within 3 m of the door) on step 2. The F edge must fire exactly once per physical press, whatever the
 * steps-per-frame pattern is, and must survive frames that run zero steps.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Input } from '@/core/Input';
import { FixedStepper, FIXED_STEP } from '@/core/Game';
import { Player } from '@/entities/Player';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import type { IMaterialLibrary } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const mats: IMaterialLibrary = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} };

function world() {
  const events = new EventBus();
  const input = new Input(document.body);
  const player = new Player('player', { x: 0, z: 0 }, mats, events);
  const car = new Vehicle('car', VEHICLE_SPECS.sedan, { x: 1.5, z: 0 }, 0, mats, events);
  const radio: number[] = [];
  events.on('radioNext', () => radio.push(1));
  /** One simulation step exactly as main.ts does it (control, F edge, update). */
  const simStep = (useConsume = true) => {
    player.control(input, 0);
    const f = useConsume ? input.consume('KeyF') : input.pressed('KeyF');
    if (f) { if (player.inVehicle) player.exit(); else player.tryEnter([car]); }
    if (player.vehicle) player.vehicle.update(FIXED_STEP);
    player.update(FIXED_STEP);
  };
  /** One rendered frame of `frameMs` milliseconds, with Game's endFrame-only-after-a-step rule. */
  const stepper = new FixedStepper();
  const frame = (frameMs: number, useConsume = true) => {
    const n = stepper.advance(frameMs / 1000);
    for (let i = 0; i < n; i++) simStep(useConsume);
    if (n > 0) input.endFrame();
    return n;
  };
  const press = (code = 'KeyF') => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  const runFor = (seconds: number, frameMs: number, useConsume = true) => { for (let t = 0; t < seconds * 1000; t += frameMs) frame(frameMs, useConsume); };
  return { events, input, player, car, radio, frame, press, runFor, simStep };
}

describe('F press edge', () => {
  it('consume() returns true once per press, pressed() stays a level for the whole frame', () => {
    const { input, press } = world();
    press();
    expect(input.pressed('KeyF')).toBe(true);
    expect(input.pressed('KeyF')).toBe(true);
    expect(input.consume('KeyF')).toBe(true);
    expect(input.consume('KeyF')).toBe(false);
    expect(input.pressed('KeyF')).toBe(false);
    press();
    expect(input.consume('KeyF')).toBe(true);
  });

  it('a virtual (touch CAR / gamepad A) press is consumed once as well', () => {
    const { input } = world();
    input.setVirtual('KeyF', true); input.setVirtual('KeyF', false); // gamepad pulse
    expect(input.consume('KeyF')).toBe(true);
    expect(input.consume('KeyF')).toBe(false);
    input.setVirtual('KeyF', true); // touch button: held 120 ms
    expect(input.consume('KeyF')).toBe(true);
    expect(input.consume('KeyF')).toBe(false);
    input.setVirtual('KeyF', false);
  });

  it('a press made during a frame that runs zero steps is not lost', () => {
    const w = world();
    w.runFor(0.1, 16.7);
    w.press();
    expect(w.frame(4)).toBe(0); // 250 Hz display: no step this frame, endFrame is skipped
    expect(w.input.consume('KeyF')).toBe(true);
  });
});

describe('enter and exit at any frame rate', () => {
  // frame durations (ms): 240 Hz, 60 Hz, 30 Hz, 12 Hz and the 100 ms clamp (5 steps per frame)
  for (const ms of [4.2, 16.7, 33.3, 83, 100]) {
    it(`enter, drive, exit: inVehicle toggles exactly once per press at ${ms} ms frames`, () => {
      const w = world();
      w.runFor(0.2, ms);
      w.press();
      w.runFor(1.0, ms);
      expect(w.player.inVehicle).toBe(true);
      w.runFor(0.3, ms); // drive a bit before leaving
      w.press();
      w.runFor(2.0, ms);
      expect(w.player.inVehicle).toBe(false);
      expect(w.player.isEntering).toBe(false);
      expect(w.car.driver).toBeNull();
    });
  }

  it('the old pressed() polling DID re-enter on multi-step frames (guards the test itself)', () => {
    const w = world();
    w.press();
    w.runFor(1.0, 100, false);
    expect(w.player.inVehicle).toBe(true);
    w.press();
    w.runFor(2.0, 100, false);
    expect(w.player.inVehicle).toBe(true); // bug: exit and re-enter in the same frame
  });

  it('exit leaves the player outside the car footprint', () => {
    const w = world();
    w.press(); w.runFor(1.0, 100);
    expect(w.player.inVehicle).toBe(true);
    w.press(); w.runFor(0.5, 100);
    const p = w.player.body.pos, c = w.car.body.pos;
    const f = { x: Math.sin(w.car.body.heading), z: Math.cos(w.car.body.heading) };
    const dx = p.x - c.x, dz = p.z - c.z;
    const along = Math.abs(dx * f.x + dz * f.z), across = Math.abs(dx * f.z - dz * f.x);
    const outside = along > w.car.spec.length / 2 || across > w.car.spec.width / 2;
    expect(outside).toBe(true);
  });

  it('radio (E) toggles once per press on a multi-step frame', () => {
    const w = world();
    w.press(); w.runFor(1.0, 100);
    w.press('KeyE');
    w.runFor(0.5, 100);
    expect(w.radio.length).toBe(1);
  });
});
