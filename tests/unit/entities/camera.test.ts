import { describe, it, expect } from 'vitest';
import { ThirdPersonCamera } from '@/core/Camera';
import type { Input } from '@/core/Input';
import { angleDiff } from '@/core/Math2';
import { World2D } from '@/physics/World2D';
import type { Body2D } from '@/world/types';

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
    // over the right shoulder: 0.5 m to the right (+x when looking north)
    expect(c.camera.position.x).toBeCloseTo(10.5);
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

  it('on foot the view is shifted 0.5 m to the right and the look target follows it', () => {
    const c = new ThirdPersonCamera();
    c.yaw = Math.PI / 2; c.pitch = 0; // looking east: right is +z
    c.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', fake());
    expect(c.camera.position.z).toBeCloseTo(0.5);
    expect(c.camera.position.x).toBeCloseTo(-5);
    const v = new ThirdPersonCamera();
    v.yaw = 0; v.pitch = 0;
    for (let t = 0; t < 3; t += 1 / 60) v.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake());
    expect(v.camera.position.x).toBeCloseTo(0, 1); // no shoulder in a car
  });

  it('vehicle mode: distance grows 8 -> 10 m and FOV widens 60 -> 68 deg with speed', () => {
    const slow = new ThirdPersonCamera();
    const fast = new ThirdPersonCamera();
    slow.pitch = fast.pitch = 0;
    for (let t = 0; t < 4; t += 1 / 60) {
      slow.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake(), { speed: 0 });
      fast.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake(), { vehicle: { speed: 30 } });
    }
    expect(slow.camera.position.z).toBeCloseTo(8, 1);
    expect(slow.camera.fov).toBeCloseTo(60, 1);
    expect(fast.camera.position.z).toBeCloseTo(10, 1);
    expect(fast.camera.fov).toBeCloseTo(68, 1);
    // reverse speed widens too; and on foot the speed is ignored
    const rev = new ThirdPersonCamera();
    for (let t = 0; t < 4; t += 1 / 60) rev.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake(), { speed: -30 });
    expect(rev.camera.fov).toBeCloseTo(68, 1);
    const foot = new ThirdPersonCamera();
    for (let t = 0; t < 2; t += 1 / 60) foot.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', fake(), { speed: 30 });
    expect(foot.camera.fov).toBe(60);
  });

  it('impact shake: consumes vehicle.shakeRequested and decays to zero over 0.4 s', () => {
    const c = new ThirdPersonCamera();
    const veh = { speed: 0, shakeRequested: 0.8 };
    c.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake(), { vehicle: veh });
    expect(veh.shakeRequested).toBe(0);
    expect(c.shakeAmount).toBeGreaterThan(0.6);
    let t = 1 / 60;
    for (; t < 0.2; t += 1 / 60) c.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake(), { vehicle: veh });
    expect(c.shakeAmount).toBeGreaterThan(0);
    expect(c.shakeAmount).toBeLessThan(0.6);
    for (; t < 0.5; t += 1 / 60) c.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake(), { vehicle: veh });
    expect(c.shakeAmount).toBe(0);
    // while shaking the lens actually wobbles
    const a = new ThirdPersonCamera(), b = new ThirdPersonCamera();
    a.pitch = b.pitch = 0;
    for (let i = 0; i < 30; i++) { a.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake()); b.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake()); }
    b.addShake(1);
    b.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake());
    a.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fake());
    expect(a.camera.position.distanceTo(b.camera.position)).toBeGreaterThan(0.01);
  });

  describe('wall avoidance', () => {
    const wallBody = (): Body2D['shape'] => ({
      kind: 'polygon', points: [{ x: -20, z: 8 }, { x: 20, z: 8 }, { x: 20, z: 10 }, { x: -20, z: 10 }],
    });

    it('pulls the camera in when a static polygon is between the target and the camera', () => {
      const w = new World2D();
      w.addStatic(wallBody() as never, undefined, 'wall');
      // target at z=14 looking north-ish: camera sits 5 m south (z=19)? flip: look south so the camera is north, behind the wall
      const free = new ThirdPersonCamera();
      const walled = new ThirdPersonCamera();
      free.yaw = walled.yaw = Math.PI; // looking south: camera sits NORTH (-z) of the target
      free.pitch = walled.pitch = 0;
      const target = { x: 0, z: 14 };
      free.update(1 / 60, target, Math.PI, 'foot', fake());
      walled.update(1 / 60, target, Math.PI, 'foot', fake(), { world: w });
      expect(free.camera.position.z).toBeLessThan(10); // would sit inside / behind the wall (z 9)
      expect(walled.camera.position.z).toBeGreaterThan(10.2); // kept on the player's side of the wall (z >= 10)
      expect(walled.camera.position.z).toBeLessThan(14);
      // settles and stays out for many frames, even when the smoothing tries to drag it back out
      for (let i = 0; i < 120; i++) walled.update(1 / 60, target, Math.PI, 'foot', fake(), { world: w });
      expect(walled.camera.position.z).toBeGreaterThan(10.2);
    });

    it('also works through camera.world, and releases when the wall is gone', () => {
      const w = new World2D();
      w.addStatic(wallBody() as never, undefined, 'wall');
      const c = new ThirdPersonCamera();
      c.yaw = Math.PI; c.pitch = 0; c.world = w;
      for (let i = 0; i < 30; i++) c.update(1 / 60, { x: 0, z: 14 }, Math.PI, 'foot', fake());
      expect(c.camera.position.z).toBeGreaterThan(10.2);
      // walk away from the wall: camera drifts back to its full 5 m
      for (let i = 0; i < 240; i++) c.update(1 / 60, { x: 0, z: 30 }, Math.PI, 'foot', fake());
      expect(c.camera.position.z).toBeCloseTo(25, 0);
    });

    it('ignores vehicles and pedestrians (dynamic bodies) between target and camera', () => {
      const w = new World2D();
      const car: Body2D = {
        id: 'car', kind: 'vehicle', shape: { kind: 'obb', halfW: 1, halfL: 1.5 }, pos: { x: 0, z: 12.2 },
        vel: { x: 0, z: 0 }, heading: 0, mass: 1400,
      };
      w.addBody(car);
      const c = new ThirdPersonCamera();
      c.yaw = Math.PI; c.pitch = 0;
      c.update(1 / 60, { x: 0, z: 14 }, Math.PI, 'foot', fake(), { world: w });
      expect(c.camera.position.z).toBeCloseTo(9, 1);
      // same via the generic raycast fallback (a world without raycastStatic)
      const generic = { raycast: w.raycast.bind(w) };
      const d = new ThirdPersonCamera();
      d.yaw = Math.PI; d.pitch = 0;
      d.update(1 / 60, { x: 0, z: 14 }, Math.PI, 'foot', fake(), { world: generic });
      expect(d.camera.position.z).toBeCloseTo(9, 1);
      // and the fallback still finds a wall behind that car
      w.addStatic(wallBody() as never, undefined, 'wall');
      const e = new ThirdPersonCamera();
      e.yaw = Math.PI; e.pitch = 0;
      e.update(1 / 60, { x: 0, z: 14 }, Math.PI, 'foot', fake(), { world: generic });
      expect(e.camera.position.z).toBeGreaterThan(10.2);
    });
  });
});
