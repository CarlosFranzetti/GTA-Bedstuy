import { describe, it, expect } from 'vitest';
import { ThirdPersonCamera } from '@/core/Camera';
import type { Input } from '@/core/Input';
import { angleDiff } from '@/core/Math2';

const fake = (dx = 0, dy = 0) => ({
  isDown: () => false, pressed: () => false, axis: () => 0, mouseDX: dx, mouseDY: dy, wheel: 0,
}) as unknown as Input;

describe('ThirdPersonCamera', () => {
  it('uses a 60deg perspective camera with near 0.1 / far 900', () => {
    const c = new ThirdPersonCamera();
    expect(c.camera.fov).toBe(60);
    expect(c.camera.near).toBe(0.1);
    expect(c.camera.far).toBe(900);
  });

  it('on foot sits 5 m behind and ~2.2 m up (at default pitch ~ slightly above)', () => {
    const c = new ThirdPersonCamera();
    c.yaw = 0; c.pitch = 0;
    c.update(1 / 60, { x: 10, z: 20 }, 0, 'foot', fake());
    // looking north (-z) -> camera is south (+z) of the target
    expect(c.camera.position.x).toBeCloseTo(10);
    expect(c.camera.position.z).toBeCloseTo(25);
    expect(c.camera.position.y).toBeCloseTo(2.2);
  });

  it('mouse orbit: dx turns yaw clockwise, dy clamps pitch to -0.1..0.9', () => {
    const c = new ThirdPersonCamera();
    c.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', fake(100, 0));
    expect(c.yaw).toBeCloseTo(0.25);
    c.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', fake(0, 100000));
    expect(c.pitch).toBeCloseTo(0.9);
    c.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', fake(0, -100000));
    expect(c.pitch).toBeCloseTo(-0.1);
  });

  it('yaw converges behind a vehicle heading PI/2 within 3 s of no mouse input', () => {
    const c = new ThirdPersonCamera();
    c.yaw = 0;
    for (let t = 0; t < 3; t += 1 / 60) c.update(1 / 60, { x: 0, z: 0 }, Math.PI / 2, 'vehicle', fake());
    expect(Math.abs(angleDiff(c.yaw, Math.PI / 2))).toBeLessThan(0.02);
  });

  it('does not recentre before 1.5 s idle, nor while the mouse moves, nor on foot', () => {
    const c = new ThirdPersonCamera();
    for (let t = 0; t < 1.4; t += 1 / 60) c.update(1 / 60, { x: 0, z: 0 }, Math.PI / 2, 'vehicle', fake());
    expect(c.yaw).toBeCloseTo(0);
    const d = new ThirdPersonCamera();
    for (let t = 0; t < 4; t += 1 / 60) d.update(1 / 60, { x: 0, z: 0 }, Math.PI / 2, 'vehicle', fake(0.0001, 0));
    expect(Math.abs(d.yaw - 0.0000025 * 240)).toBeLessThan(0.01);
    const e = new ThirdPersonCamera();
    for (let t = 0; t < 4; t += 1 / 60) e.update(1 / 60, { x: 0, z: 0 }, Math.PI / 2, 'foot', fake());
    expect(e.yaw).toBeCloseTo(0);
  });

  it('recentres the short way round', () => {
    const c = new ThirdPersonCamera();
    c.yaw = -3;
    for (let t = 0; t < 4; t += 1 / 60) c.update(1 / 60, { x: 0, z: 0 }, 3, 'vehicle', fake());
    expect(Math.abs(angleDiff(c.yaw, 3))).toBeLessThan(0.02);
  });

  it('smooths toward a moving target and the vehicle mode pulls the camera back to 8 m', () => {
    const c = new ThirdPersonCamera();
    c.yaw = 0; c.pitch = 0;
    c.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', fake());
    c.update(1 / 60, { x: 100, z: 0 }, 0, 'foot', fake());
    expect(c.camera.position.x).toBeGreaterThan(0);
    expect(c.camera.position.x).toBeLessThan(100);
    const v = new ThirdPersonCamera();
    v.pitch = 0;
    for (let t = 0; t < 3; t += 1 / 60) v.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake());
    expect(v.camera.position.z).toBeCloseTo(8, 1);
    expect(v.camera.position.y).toBeCloseTo(3, 1);
    expect(Number.isFinite(v.camera.position.x)).toBe(true);
  });
});
