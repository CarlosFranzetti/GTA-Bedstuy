/**
 * Camera smoothness: the follow camera must give the same result whatever the display frame rate (dt-correct), must not
 * jitter at steady speed with an uneven frame pacing, and must glide (not pop) when the pivot jumps on getting in / out.
 */
import { describe, expect, it } from 'vitest';
import { ThirdPersonCamera } from '@/core/Camera';
import { FIXED_STEP, FixedStepper, PoseSnapshots, type BlendedPose } from '@/core/Game';
import type { Input } from '@/core/Input';
import type { Body2D } from '@/world/types';

const fake = () => ({ isDown: () => false, pressed: () => false, axis: () => 0, mouseDX: 0, mouseDY: 0, wheel: 0 }) as unknown as Input;

/** A target driving north (-z) at `speed` m/s, stepped at 60 Hz and drawn at frames of `frameMs` (with optional pacing jitter). */
function run(speed: number, mode: 'foot' | 'vehicle', frameMs: number, jitter: number, seconds = 6): { sd: number; maxStep: number } {
  const body: Body2D = { id: 't', kind: 'player', shape: { kind: 'circle', r: 0.4 }, pos: { x: 0, z: 0 }, vel: { x: 0, z: -speed }, heading: 0, mass: 80 };
  const poses = new PoseSnapshots(); const stepper = new FixedStepper(FIXED_STEP);
  const cam = new ThirdPersonCamera(); const input = fake();
  const out: BlendedPose = { x: 0, z: 0, h: 0 };
  const offs: number[] = []; let prev: number | null = null; let maxStep = 0;
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let t = 0;
  while (t < seconds) {
    const dt = (frameMs / 1000) * (1 + (rnd() * 2 - 1) * jitter);
    t += dt;
    const n = stepper.advance(dt);
    for (let i = 0; i < n; i++) { poses.beginCapture(); poses.capture(body); poses.endCapture(); body.pos.z -= speed * FIXED_STEP; }
    poses.blend(body, stepper.alpha, out);
    cam.update(dt, { x: out.x, z: out.z }, out.h, mode, input, { speed });
    if (t > 2) {
      const o = cam.camera.position.z - out.z; // camera-to-target offset along the travel axis
      offs.push(o);
      if (prev !== null) maxStep = Math.max(maxStep, Math.abs(o - prev));
      prev = o;
    }
  }
  const m = offs.reduce((a, b) => a + b, 0) / offs.length;
  return { sd: Math.sqrt(offs.reduce((a, b) => a + (b - m) ** 2, 0) / offs.length), maxStep };
}

describe('follow camera smoothness', () => {
  it('prints the jitter metric (sd of camera-to-target offset, metres) at 30 / 60 / 144 fps', () => {
    const rows: string[] = [];
    for (const [mode, sp] of [['foot', 3], ['vehicle', 20]] as const) {
      for (const ms of [1000 / 30, 1000 / 60, 1000 / 144]) {
        const even = run(sp, mode, ms, 0), uneven = run(sp, mode, ms, 0.3);
        rows.push(`${mode} ${sp} m/s ${(1000 / ms).toFixed(0)} fps: sd even ${even.sd.toFixed(5)} uneven(+-30%) ${uneven.sd.toFixed(5)} max frame-to-frame offset change ${uneven.maxStep.toFixed(4)}`);
        expect(uneven.sd).toBeLessThan(0.02);
      }
    }
    console.log(rows.join('\n'));
  });

  it('is frame-rate independent: 30 fps and 144 fps end up at the same camera pose', () => {
    const a = run(20, 'vehicle', 1000 / 30, 0).sd, b = run(20, 'vehicle', 1000 / 144, 0).sd;
    expect(Math.abs(a - b)).toBeLessThan(0.01);
    const pose = (frameMs: number) => {
      const cam = new ThirdPersonCamera(); const input = fake();
      let t = 0;
      while (t < 3) { const dt = frameMs / 1000; t += dt; cam.update(dt, { x: 0, z: -t * 10 }, 0, 'vehicle', input, { speed: 10 }); }
      return { x: cam.camera.position.x, y: cam.camera.position.y, z: cam.camera.position.z + 10 * t };
    };
    const p30 = pose(1000 / 30), p144 = pose(1000 / 144);
    expect(Math.hypot(p30.x - p144.x, p30.y - p144.y, p30.z - p144.z)).toBeLessThan(0.05);
  });

  it('getting in or out glides: a 1.4 m pivot jump moves the lens by well under that on the first frame, then settles', () => {
    const cam = new ThirdPersonCamera(); const input = fake();
    for (let i = 0; i < 120; i++) cam.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', input);
    const before = cam.camera.position.clone();
    cam.update(1 / 60, { x: 1.4, z: 0 }, 0, 'vehicle', input); // car centre is 1.4 m from the door spot
    const first = Math.hypot(cam.camera.position.x - before.x, cam.camera.position.z - before.z);
    console.log(`enter pivot jump 1.4 m: first-frame lens move ${first.toFixed(3)} m`);
    expect(first).toBeLessThan(0.5);
    for (let i = 0; i < 180; i++) cam.update(1 / 60, { x: 1.4, z: 0 }, 0, 'vehicle', input);
    expect(Math.abs(cam.camera.position.x - 1.4)).toBeLessThan(0.05); // yaw 0, no shoulder in a car
  });

  it('pulls in against a wall over a few frames instead of one pop, and never ends inside it', () => {
    const wall = { raycast: () => null, raycastStatic: () => ({ dist: 2 }) };
    const cam = new ThirdPersonCamera(); const input = fake();
    for (let i = 0; i < 60; i++) cam.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', input);
    const d0 = Math.abs(cam.camera.position.z);
    cam.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', input, { world: wall });
    const d1 = Math.abs(cam.camera.position.z);
    for (let i = 0; i < 60; i++) cam.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', input, { world: wall });
    const d2 = Math.abs(cam.camera.position.z);
    console.log(`wall pull-in: lens distance before ${d0.toFixed(2)} first frame ${d1.toFixed(2)} settled ${d2.toFixed(2)}`);
    expect(d1).toBeGreaterThan(d2); expect(d1).toBeLessThan(d0);
    expect(d2).toBeLessThan(2 - 0.3);
  });

  it('touch look drags are smoothed over several frames but rotate by exactly the same total, at any frame rate', () => {
    const total = (frameMs: number) => {
      const cam = new ThirdPersonCamera();
      const touch = { ...fake(), mode: 'touch', mouseDX: 0, mouseDY: 0 } as unknown as Input & { mouseDX: number };
      const yaw0 = cam.yaw;
      let first = 0;
      touch.mouseDX = 200; // one burst of drag events
      cam.update(frameMs / 1000, { x: 0, z: 0 }, 0, 'foot', touch);
      first = cam.yaw - yaw0;
      touch.mouseDX = 0;
      for (let t = 0; t < 1; t += frameMs / 1000) cam.update(frameMs / 1000, { x: 0, z: 0 }, 0, 'foot', touch);
      return { first, total: cam.yaw - yaw0 };
    };
    const a = total(1000 / 60), b = total(1000 / 30);
    expect(a.total).toBeCloseTo(0.5, 2); expect(b.total).toBeCloseTo(0.5, 2);
    expect(a.first).toBeLessThan(0.5 * 0.5); // not applied in one frame
  });
});
