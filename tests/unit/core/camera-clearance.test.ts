import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ThirdPersonCamera } from '@/core/Camera';
import type { Input } from '@/core/Input';
import { World2D } from '@/physics/World2D';
import type { Body2D } from '@/world/types';
import { boxExit, distToBox, lensGlare, lensGlareFactor, raiseAmount, slackFollow } from '@/core/CameraClearance';

const DT = 1 / 60;
const fake = () => ({
  isDown: () => false, pressed: () => false, axis: () => 0,
  mouseDX: 0, mouseDY: 0, wheel: 0, anyInput: () => false,
}) as unknown as Input;

// sedan: forward is -z at heading 0, so the chase lens sits at +z
const SPEC = { length: 4.6, width: 1.9, height: 1.45 };
const BOX = { halfL: SPEC.length / 2, halfW: SPEC.width / 2, top: SPEC.height };

function wall(w: World2D, x0: number, x1: number, z0: number, z1: number): void {
  w.addStatic({ kind: 'polygon', points: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] });
}
function carBody(w: World2D, id: string, x: number, z: number, heading = 0, kind: 'vehicle' | 'ped' = 'vehicle'): Body2D {
  const b: Body2D = {
    id, kind, pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400,
    shape: kind === 'ped' ? { kind: 'circle', r: 0.3 } : { kind: 'obb', halfW: 0.95, halfL: 2.3 },
  };
  w.addBody(b);
  return b;
}

function newCam(): ThirdPersonCamera {
  const c = new ThirdPersonCamera();
  c.views.setView('vehicle', 'chase');
  c.views.setView('foot', 'chase');
  return c;
}

interface Run { cam: ThirdPersonCamera; pos: { x: number; z: number } }
function drive(w: World2D, secs: number, opts: { speed?: number; id?: string; pos?: { x: number; z: number }; heading?: number; cam?: ThirdPersonCamera } = {}): Run {
  const cam = opts.cam ?? newCam();
  const pos = opts.pos ?? { x: 0, z: 0 };
  const vehicle = { id: opts.id ?? 'me', speed: opts.speed ?? 0, spec: SPEC };
  for (let i = 0; i < secs / DT; i++) cam.update(DT, pos, opts.heading ?? 0, 'vehicle', fake(), { world: w, vehicle });
  return { cam, pos };
}

/** Is the lens outside the car's box by `m` metres, or over its roof by `m` metres? */
function clearOfCar(cam: ThirdPersonCamera, cx: number, cz: number, heading: number, m = 0.3): boolean {
  const p = cam.camera.position;
  const d = distToBox(p.x, p.z, cx, cz, heading, BOX);
  return d >= m || p.y >= BOX.top + m;
}
function insideBox(p: { x: number; y: number; z: number }, cx: number, cz: number, heading: number, box = BOX): boolean {
  return distToBox(p.x, p.z, cx, cz, heading, box) === 0 && p.y < box.top;
}

describe('pure helpers', () => {
  it('boxExit gives the distance to the edge along the view line', () => {
    expect(boxExit(0, 1, 0, BOX)).toBeCloseTo(2.3, 6);
    expect(boxExit(1, 0, 0, BOX)).toBeCloseTo(0.95, 6);
    expect(boxExit(0, 1, Math.PI / 2, BOX)).toBeCloseTo(0.95, 6);
  });
  it('raiseAmount is 1 near the box, 0 well clear of it', () => {
    expect(raiseAmount(2.3, 2.3)).toBe(1);
    expect(raiseAmount(2.3 + 1.2, 2.3)).toBe(0);
    const mid = raiseAmount(2.3 + 0.65, 2.3);
    expect(mid).toBeGreaterThan(0.2); expect(mid).toBeLessThan(0.8);
  });
  it('slackFollow ignores jitter inside the band and follows a drift with a constant lag', () => {
    let v = 0;
    for (let i = 0; i < 100; i++) v = slackFollow(v, i % 2 ? 0.05 : -0.05, 0.1);
    expect(v).toBe(0);
    for (let i = 1; i <= 100; i++) v = slackFollow(v, i * 0.1, 0.1);
    expect(v).toBeCloseTo(10 - 0.1, 6);
  });
  it('lens glare fades to nothing within 0.3 m of a car and is untouched beyond a metre', () => {
    lensGlare.active = true;
    lensGlare.x = 0; lensGlare.z = 2.3 + 0.1; lensGlare.y = 1.0;
    expect(lensGlareFactor(0, 0, 0, 4.6, 1.9, 1.45)).toBe(0);
    lensGlare.z = 2.3 + 0.65;
    const mid = lensGlareFactor(0, 0, 0, 4.6, 1.9, 1.45);
    expect(mid).toBeGreaterThan(0.2); expect(mid).toBeLessThan(0.9);
    lensGlare.z = 2.3 + 1.2;
    expect(lensGlareFactor(0, 0, 0, 4.6, 1.9, 1.45)).toBe(1);
    lensGlare.x = 40;
    expect(lensGlareFactor(0, 0, 0, 4.6, 1.9, 1.45)).toBe(1);
    lensGlare.active = false;
  });
});

describe('open road is unchanged', () => {
  it('no obstacle: the chase lens sits 4.6 m behind and 1.7 m up, as before', () => {
    const w = new World2D(12);
    const { cam } = drive(w, 2);
    expect(cam.camera.position.z).toBeCloseTo(4.6, 2);
    expect(cam.camera.position.y).toBeCloseTo(1.7, 2);
  });
});

describe('car backed against a wall', () => {
  for (const gap of [0.05, 0.4, 1.0]) {
    it(`wall ${gap} m behind the bumper: the lens stays out of the car and out of the wall`, () => {
      const w = new World2D(12);
      const face = 2.3 + gap;
      wall(w, -30, 30, face, face + 8);
      const { cam } = drive(w, 3);
      const p = cam.camera.position;
      expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
      expect(insideBox(p, 0, 0, 0)).toBe(false);
      expect(p.z).toBeLessThan(face - 0.2);   // not inside the wall
      if (gap < 0.5) expect(p.y).toBeGreaterThan(BOX.top + 0.5); // high and close, over the roof
    });
  }
  it('the view looks down at the car when it comes in (tilted, not level)', () => {
    const w = new World2D(12);
    wall(w, -30, 30, 2.4, 10);
    const { cam } = drive(w, 3);
    const f = cam.camera.getWorldDirection(new THREE.Vector3());
    expect(f.y).toBeLessThan(-0.15);
  });
  it('works at any heading (car pointing along +x, wall behind it at -x)', () => {
    const w = new World2D(12);
    wall(w, -10.4, -2.4, -30, 30);
    // heading PI/2: forward = (sin, -cos) = (1, 0); the lens trails at -x
    const { cam } = drive(w, 3, { heading: Math.PI / 2 });
    const p = cam.camera.position;
    expect(clearOfCar(cam, 0, 0, Math.PI / 2)).toBe(true);
    expect(p.x).toBeGreaterThan(-2.2);
  });
});

describe('car between two walls', () => {
  it('alley walls either side and a wall behind: the lens stays clear of all of them and of the car', () => {
    const w = new World2D(12);
    wall(w, -6, -1.15, -30, 30);
    wall(w, 1.15, 6, -30, 30);
    wall(w, -6, 6, 2.6, 9);
    const { cam } = drive(w, 3);
    const p = cam.camera.position;
    expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
    expect(Math.abs(p.x)).toBeLessThan(1.15);
    expect(p.z).toBeLessThan(2.6);
  });
  it('alley with open back: the lens keeps its normal distance down the open end', () => {
    const w = new World2D(12);
    wall(w, -6, -1.3, -30, 30);
    wall(w, 1.3, 6, -30, 30);
    const { cam } = drive(w, 3);
    expect(cam.camera.position.z).toBeGreaterThan(4);
    expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
  });
  it('a car pressed into the wall (centre inside the collider) still keeps the lens out of the car box', () => {
    const w = new World2D(12);
    wall(w, -30, 30, 1.0, 9);   // the wall face passes through the car (1.3 m from its rear)
    const { cam } = drive(w, 3);
    expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
    expect(cam.camera.position.y).toBeGreaterThan(BOX.top + 0.4);
  });
});

describe('another car or a pedestrian on the lens side', () => {
  it('reversing with a car close behind it (the rig swings round to the front of our car): lens stays out of that car', () => {
    const w = new World2D(12);
    carBody(w, 'other', 0, -5.4);     // its rear face is 3.1 m ahead of our centre, 0.8 m clear of our nose
    const { cam } = drive(w, 3, { speed: -4 });
    const p = cam.camera.position;
    expect(p.z).toBeLessThan(0);            // in front of us: the look-back side
    expect(insideBox(p, 0, -5.4, 0)).toBe(false);
    expect(distToBox(p.x, p.z, 0, -5.4, 0, BOX) > 0.3 || p.y > BOX.top + 0.3).toBe(true);
    expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
  });
  it('a car touching the bumper while reversing: still clear of both cars', () => {
    const w = new World2D(12);
    carBody(w, 'other', 0, -4.7);
    const { cam } = drive(w, 3, { speed: -4 });
    const p = cam.camera.position;
    expect(insideBox(p, 0, -4.7, 0)).toBe(false);
    expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
  });
  it('a tailgater right behind while driving forward: lens does not end up inside it', () => {
    const w = new World2D(12);
    carBody(w, 'tail', 0, 5.0);
    const { cam } = drive(w, 3, { speed: 10 });
    expect(insideBox(cam.camera.position, 0, 5.0, 0)).toBe(false);
    expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
  });
  it('a pedestrian standing behind: the lens stops short of them', () => {
    const w = new World2D(12);
    carBody(w, 'walker', 0, 3.6, 0, 'ped');
    const { cam } = drive(w, 3);
    expect(cam.camera.position.z).toBeLessThan(3.6 - 0.3);
  });
  it("the followed car's own body is ignored (open road, reversing: no trim)", () => {
    const w = new World2D(12);
    carBody(w, 'me', 0, 0);
    const { cam } = drive(w, 3, { speed: -4 });
    expect(cam.camera.position.z).toBeLessThan(-3.5);
  });
});

describe('on foot', () => {
  function foot(w: World2D, secs: number, pos = { x: 0, z: 0 }, cam = newCam()): ThirdPersonCamera {
    for (let i = 0; i < secs / DT; i++) cam.update(DT, pos, 0, 'foot', fake(), { world: w });
    return cam;
  }
  it('wall right behind the player: the lens rises over their head and stays out of the wall', () => {
    const w = new World2D(12);
    wall(w, -30, 30, 0.8, 8);
    const cam = foot(w, 3);
    const p = cam.camera.position;
    expect(p.z).toBeLessThan(0.8 - 0.25);
    expect(p.y).toBeGreaterThan(1.85 + 0.4);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(0.25);   // not on top of the head: close, high and tilted down
    expect(cam.camera.getWorldDirection(new THREE.Vector3()).y).toBeLessThan(-0.3);
  });
  it('a wall behind the preferred shoulder only: the camera slides to the free shoulder', () => {
    const w = new World2D(12);
    wall(w, 0.15, 12, 1.0, 3);   // behind and to the right (+x); the left is open
    const cam = foot(w, 3);
    const p = cam.camera.position;
    expect(p.x).toBeLessThan(-0.2);
    expect(p.z).toBeGreaterThan(2.5);   // full distance on the free side
  });
  it('the shoulder swap is not undone while the wall is still there', () => {
    const w = new World2D(12);
    wall(w, 0.15, 12, 1.0, 3);
    const cam = foot(w, 3);
    const x1 = cam.camera.position.x;
    foot(w, 3, { x: 0, z: 0 }, cam);
    expect(Math.abs(cam.camera.position.x - x1)).toBeLessThan(0.02);
  });
  it('open ground: the usual shoulder, no slide', () => {
    const w = new World2D(12);
    const cam = foot(w, 3);
    expect(cam.camera.position.x).toBeGreaterThan(0.2);
  });
});

describe('no popping', () => {
  it('jitter of +-5 cm at 60 Hz on a car jammed against a wall moves the lens by less than 2 cm', () => {
    const w = new World2D(12);
    wall(w, -30, 30, 2.45, 10);
    const cam = newCam();
    const pos = { x: 0, z: 0 };
    const vehicle = { id: 'me', speed: 0, spec: SPEC };
    const step = (i: number, amp: number): void => {
      pos.x = (i % 2 ? 1 : -1) * amp; pos.z = (i % 3 ? 1 : -1) * amp * (i % 2 ? 1 : -1);
      cam.update(DT, pos, 0, 'vehicle', fake(), { world: w, vehicle });
    };
    for (let i = 0; i < 180; i++) step(i, 0);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < 240; i++) {
      step(i, 0.05);
      const p = cam.camera.position;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    expect(Math.max(maxX - minX, maxY - minY, maxZ - minZ)).toBeLessThan(0.02);
  });
  it('a car whose centre jitters across a wall face (origin inside, then outside the collider) does not flip the lens', () => {
    const w = new World2D(12);
    wall(w, -30, 30, 0.0, 9);
    const cam = newCam();
    const pos = { x: 0, z: 0 };
    const vehicle = { id: 'me', speed: 0, spec: SPEC };
    let lo = 1e9, hi = -1e9, ylo = 1e9, yhi = -1e9;
    for (let i = 0; i < 300; i++) {
      pos.z = (i % 2 ? 1 : -1) * 0.05;
      cam.update(DT, pos, 0, 'vehicle', fake(), { world: w, vehicle });
      if (i > 120) { const p = cam.camera.position; lo = Math.min(lo, p.z); hi = Math.max(hi, p.z); ylo = Math.min(ylo, p.y); yhi = Math.max(yhi, p.y); }
    }
    expect(hi - lo).toBeLessThan(0.02);
    expect(yhi - ylo).toBeLessThan(0.02);
  });
  it('backing up to a wall: the lens moves smoothly (relative to the car), never into the car', () => {
    const w = new World2D(12);
    wall(w, -30, 30, 14, 30);
    const cam = newCam();
    const vehicle = { id: 'me', speed: 0, spec: SPEC };
    const pos = { x: 0, z: 0 };
    let prev: THREE.Vector3 | null = null;
    let prevZ = 0;
    let worst = 0;
    for (let i = 0; i < 360; i++) {
      pos.z = Math.min(11.6, i * DT * 6);   // the car goes toward +z at 6 m/s and stops with its rear 0.1 m from the wall
      cam.update(DT, pos, 0, 'vehicle', fake(), { world: w, vehicle });
      const p = cam.camera.position.clone();
      if (prev) worst = Math.max(worst, Math.hypot(p.x - prev.x, p.y - prev.y, (p.z - pos.z) - (prev.z - prevZ)));
      prev = p; prevZ = pos.z;
      expect(insideBox(p, pos.x, pos.z, 0)).toBe(false);
    }
    expect(worst).toBeLessThan(0.3);
    expect(clearOfCar(cam, pos.x, pos.z, 0)).toBe(true);
  });
  it('recovers slowly and fully when the wall goes away (no snap back)', () => {
    const w = new World2D(12);
    wall(w, -30, 30, 2.4, 10);
    const cam = drive(w, 2).cam;
    const near = cam.camera.position.z;
    const w2 = new World2D(12);
    drive(w2, 0.1, { cam });
    const afterTenth = cam.camera.position.z;
    expect(afterTenth - near).toBeLessThan(1.5);  // eased, not an instant jump to 4.6
    drive(w2, 3, { cam });
    expect(cam.camera.position.z).toBeGreaterThan(4.4);
  });
});

describe('every view stays out of the car', () => {
  for (const id of ['close', 'chase', 'far']) {
    it(`${id} view with a wall right behind`, () => {
      const w = new World2D(12);
      wall(w, -30, 30, 2.5, 20);
      const cam = newCam();
      cam.views.setView('vehicle', id);
      drive(w, 3, { cam });
      expect(clearOfCar(cam, 0, 0, 0)).toBe(true);
      expect(cam.camera.position.z).toBeLessThan(2.5 - 0.2);
    });
  }
  it('cinematic shots (side, front, high) never put the lens in the car when walls crowd it', () => {
    const w = new World2D(12);
    wall(w, -30, -2.0, -30, 30);
    wall(w, 2.0, 30, -30, 30);
    wall(w, -30, 30, 3.0, 30);
    wall(w, -30, 30, -30, -3.0);
    const cam = newCam();
    cam.views.setView('vehicle', 'cinematic');
    const vehicle = { id: 'me', speed: 0, spec: SPEC };
    for (let i = 0; i < 60 * 40; i++) {
      cam.update(DT, { x: 0, z: 0 }, 0, 'vehicle', fake(), { world: w, vehicle });
      if (i > 20) expect(insideBox(cam.camera.position, 0, 0, 0)).toBe(false);
    }
  });
  it('looking back while driving forward with a wall ahead keeps the lens out of the car', () => {
    const w = new World2D(12);
    wall(w, -30, 30, -20, -2.5);
    const cam = newCam();
    const vehicle = { id: 'me', speed: 0, spec: SPEC };
    const look = { ...fake(), isDown: (c: string) => c === 'KeyC' } as unknown as Input;
    for (let i = 0; i < 180; i++) cam.update(DT, { x: 0, z: 0 }, 0, 'vehicle', look, { world: w, vehicle });
    expect(insideBox(cam.camera.position, 0, 0, 0)).toBe(false);
  });
});
