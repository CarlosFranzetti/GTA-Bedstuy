import { describe, it, expect } from 'vitest';
import { ThirdPersonCamera, dampStep, vehicleFov, IDLE_CINEMATIC_AFTER } from '@/core/Camera';
import type { Input } from '@/core/Input';
import { angleDiff } from '@/core/Math2';

const DT = 1 / 60;
interface FakeOpts { dx?: number; keys?: string[]; any?: boolean }
const fake = (o: FakeOpts = {}) => ({
  isDown: (c: string) => !!o.keys?.includes(c), pressed: () => false, axis: () => 0,
  mouseDX: o.dx ?? 0, mouseDY: 0, wheel: 0, anyInput: () => !!o.any,
}) as unknown as Input;
const T = { x: 0, z: 0 };

describe('critically damped spring', () => {
  it('converges without overshoot beyond 5 % from rest and from an initial velocity', () => {
    for (const v0 of [0, 2, -2]) {
      let x = 1, v = v0, min = 1;
      for (let i = 0; i < 600; i++) { const s = dampStep(x, v, 4.6, DT); x = s.x; v = s.v; min = Math.min(min, x); }
      expect(min).toBeGreaterThan(-0.05);
      expect(Math.abs(x)).toBeLessThan(1e-3);
    }
  });
  it('is stable at large time steps', () => {
    const s = dampStep(1, 0, 4.6, 5);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
  });
});

describe('car yaw auto-centre', () => {
  it('swings behind the car in ~1.2 s once the stick is released, with no overshoot', () => {
    const c = new ThirdPersonCamera();
    c.yaw = 1.0; // 1 rad off, heading 0
    let t = 0, worst = 0, at95 = -1;
    for (; t < 3; t += DT) {
      c.update(DT, T, 0, 'vehicle', fake());
      worst = Math.min(worst, -c.yaw); // overshoot past heading would make yaw negative
      if (at95 < 0 && Math.abs(angleDiff(c.yaw, 0)) < 0.05) at95 = t;
    }
    expect(at95).toBeGreaterThan(0.6);
    expect(at95).toBeLessThan(1.3);
    expect(worst).toBeLessThan(0.05);
    expect(Math.abs(c.yaw)).toBeLessThan(0.01);
  });
  it('does nothing while the mouse is moving and does not touch yaw on foot', () => {
    const c = new ThirdPersonCamera(); c.yaw = 1;
    for (let i = 0; i < 120; i++) c.update(DT, T, 0, 'vehicle', fake({ dx: 0.0001 }));
    expect(c.yaw).toBeGreaterThan(0.9);
    const f = new ThirdPersonCamera(); f.yaw = 1;
    for (let i = 0; i < 240; i++) f.update(DT, T, 0, 'foot', fake());
    expect(f.yaw).toBeCloseTo(1);
  });
});

describe('field of view vs speed', () => {
  const table: Array<[number, number]> = [[0, 70], [7.5, 73], [15, 76], [30, 82], [60, 82], [-30, 82]];
  it.each(table)('vehicleFov(%d m/s) = %d', (sp, fov) => { expect(vehicleFov(sp)).toBeCloseTo(fov, 5); });
  it('the live camera reaches 70 at rest, 82 at top speed and 64 on foot', () => {
    const rest = new ThirdPersonCamera(), top = new ThirdPersonCamera(), foot = new ThirdPersonCamera();
    for (let i = 0; i < 360; i++) {
      rest.update(DT, T, 0, 'vehicle', fake(), { speed: 0 });
      top.update(DT, T, 0, 'vehicle', fake(), { speed: 30 });
      foot.update(DT, T, 0, 'foot', fake());
    }
    expect(rest.camera.fov).toBeCloseTo(70, 1);
    expect(top.camera.fov).toBeCloseTo(82, 1);
    expect(foot.camera.fov).toBeCloseTo(64, 1);
  });
});

describe('rig geometry', () => {
  it('car: 4.6 m behind, 1.7 m up at rest (pitch 0)', () => {
    const c = new ThirdPersonCamera(); c.pitch = 0;
    for (let i = 0; i < 120; i++) c.update(DT, T, 0, 'vehicle', fake(), { speed: 0 });
    expect(c.camera.position.z).toBeCloseTo(4.6, 2);
    expect(c.camera.position.y).toBeCloseTo(1.7, 2);
  });
  it('lateral g rolls the view, sign follows the turn, level when straight', () => {
    const c = new ThirdPersonCamera();
    let h = 0;
    for (let i = 0; i < 120; i++) { h += 0.03; c.update(DT, T, h, 'vehicle', fake(), { speed: 25 }); }
    expect(Math.abs(c.rollAngle)).toBeGreaterThan(0.01);
    expect(Math.abs(c.rollAngle)).toBeLessThanOrEqual(0.05 + 1e-9);
    for (let i = 0; i < 240; i++) c.update(DT, T, h, 'vehicle', fake(), { speed: 25 });
    expect(Math.abs(c.rollAngle)).toBeLessThan(0.002);
  });
});

describe('look-back', () => {
  it('snaps round within ~0.4 s, flips the camera to the front, and returns smoothly on release', () => {
    const c = new ThirdPersonCamera(); c.pitch = 0;
    for (let i = 0; i < 90; i++) c.update(DT, T, 0, 'vehicle', fake());
    expect(c.camera.position.z).toBeGreaterThan(4);
    let t = 0, snap = -1, maxBlend = 0;
    for (; t < 1; t += DT) {
      c.update(DT, T, 0, 'vehicle', fake({ keys: ['KeyC'], any: true }));
      maxBlend = Math.max(maxBlend, c.lookBackAmount);
      if (snap < 0 && c.lookBackAmount > 0.95) snap = t;
    }
    expect(snap).toBeGreaterThan(0.1);
    expect(snap).toBeLessThan(0.5);
    expect(maxBlend).toBeLessThanOrEqual(1);
    expect(c.camera.position.z).toBeLessThan(-4);       // in front of the car (north), looking back south
    expect(c.yaw).toBeCloseTo(0);                        // cam.yaw semantics untouched
    let back = -1;
    for (t = 0; t < 1.5; t += DT) {
      c.update(DT, T, 0, 'vehicle', fake());
      if (back < 0 && c.lookBackAmount < 0.05) back = t;
    }
    expect(back).toBeGreaterThan(0.1);
    expect(back).toBeLessThan(0.7);
    expect(c.camera.position.z).toBeGreaterThan(4);
  });
  it('works on foot too (camera ends up in front of the player)', () => {
    const c = new ThirdPersonCamera(); c.pitch = 0;
    for (let i = 0; i < 120; i++) c.update(DT, T, 0, 'foot', fake({ keys: ['KeyC'], any: true }));
    expect(c.camera.position.z).toBeLessThan(-2.5);
  });
});

describe('idle cinematic', () => {
  it('starts after 8 s of stillness with a slow orbit and zoom-out, and cancels on input', () => {
    const c = new ThirdPersonCamera(); c.pitch = 0;
    let t = 0;
    for (; t < IDLE_CINEMATIC_AFTER - 0.1; t += DT) c.update(DT, T, 0, 'vehicle', fake(), { speed: 0 });
    expect(c.cinematicAmount).toBe(0);
    const d0 = Math.hypot(c.camera.position.x, c.camera.position.z);
    for (t = 0; t < 6; t += DT) c.update(DT, T, 0, 'vehicle', fake(), { speed: 0 });
    expect(c.cinematicAmount).toBeGreaterThan(0.5);
    expect(Math.abs(c.camera.position.x)).toBeGreaterThan(0.2);   // orbited off the axis
    expect(Math.hypot(c.camera.position.x, c.camera.position.z)).toBeGreaterThan(d0 + 0.3);
    expect(c.yaw).toBeCloseTo(0);
    // any key press cancels, and the view returns to the chase position
    for (t = 0; t < 2.5; t += DT) c.update(DT, T, 0, 'vehicle', fake({ any: true }), { speed: 0 });
    expect(c.cinematicAmount).toBe(0);
    expect(c.idleSeconds).toBe(0);
    expect(Math.abs(c.camera.position.x)).toBeLessThan(0.05);
    expect(c.camera.position.z).toBeCloseTo(4.6, 1);
  });
  it('does not start while the target is moving', () => {
    const c = new ThirdPersonCamera();
    for (let i = 0; i < 60 * 12; i++) c.update(DT, { x: 0, z: -i * 0.1 }, 0, 'vehicle', fake());
    expect(c.cinematicAmount).toBe(0);
  });
});

describe('mission letterbox', () => {
  it('toggles on, holds for the requested time, and slides out again', () => {
    const c = new ThirdPersonCamera();
    expect(c.letterboxAmount).toBe(0);
    c.setLetterbox(true, 2.5);
    expect(c.letterboxOn).toBe(true);
    let t = 0;
    for (; t < 1; t += DT) c.update(DT, T, 0, 'foot', fake());
    expect(c.letterboxAmount).toBeGreaterThan(0.9);
    for (; t < 2.4; t += DT) c.update(DT, T, 0, 'foot', fake());
    expect(c.letterboxOn).toBe(true);
    for (; t < 5; t += DT) c.update(DT, T, 0, 'foot', fake());
    expect(c.letterboxOn).toBe(false);
    expect(c.letterboxAmount).toBe(0);
  });
  it('manual on/off without a timer', () => {
    const c = new ThirdPersonCamera();
    c.setLetterbox(true);
    for (let i = 0; i < 300; i++) c.update(DT, T, 0, 'foot', fake());
    expect(c.letterboxAmount).toBe(1);
    c.setLetterbox(false);
    for (let i = 0; i < 300; i++) c.update(DT, T, 0, 'foot', fake());
    expect(c.letterboxAmount).toBe(0);
  });
});
