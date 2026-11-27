/**
 * CAMFIX: the camera through getting in and out of cars and changing views, at 30, 60 and 144 frames a second and with one long
 * frame (a hitch) at different phases. The real ThirdPersonCamera, Player, Vehicle and World2D; see camfix-harness.ts.
 * CAMFIX_FULL=1 runs the hitch at every 0.2 s of every scenario (slow); the default is a coarser sweep.
 */
import { describe, expect, it } from 'vitest';
import { CamRig, analyse, subject, carBoxContains, type CamFrame } from './camfix-harness';
import { SCENARIOS, type Scenario } from './camfix-scenarios';
import { angleDiff } from '@/core/Math2';

const FULL = process.env.CAMFIX_FULL === '1';
const FPS = [30, 60, 144];
/** Bounds a viewer would notice if exceeded, outside the frames the camera reports as a cut. */
const relStepMax = (dt: number, blends = false): number => blends ? 0.15 + 30 * dt : 0.3 + 6 * dt;
const TURN_MAX = 240;      // deg/s of view direction, mouse look excluded
const FOV_MAX = 60;        // deg/s
const UP_MAX = 8;          // deg per frame
const LOOK_OFF_MAX = 3;    // m from the look target to the followed body

function run(s: Scenario, fps: number, hitchAt?: number): CamRig {
  const r = new CamRig({ fps, ...s.opts, hitchAt, hitchMs: 250 });
  s.run(r);
  return r;
}

function check(r: CamFrame[], label: string, blends = false): void {
  const a = analyse(r);
  const dtMax = Math.max(...r.map((f) => f.dt));
  expect(a.nan, `${label}: NaN`).toBe(0);
  expect(a.minAboveGround, `${label}: lens near the ground at t=${a.minAboveGroundAt.toFixed(2)}`).toBeGreaterThanOrEqual(0.3);
  expect(a.insideCar, `${label}: lens inside the car body from t=${a.insideCarAt.toFixed(2)}`).toBe(0);
  expect(a.lookOff, `${label}: look target away from the body`).toBeLessThanOrEqual(LOOK_OFF_MAX);
  expect(a.relStep, `${label}: lens jump of ${a.relStep.toFixed(2)} m at t=${a.relStepAt.toFixed(2)}`).toBeLessThanOrEqual(relStepMax(dtMax, blends));
  expect(a.turnRate, `${label}: view turns ${a.turnRate.toFixed(0)} deg/s at t=${a.turnRateAt.toFixed(2)}`).toBeLessThanOrEqual(TURN_MAX);
  expect(a.fovRate, `${label}: fov changes ${a.fovRate.toFixed(0)} deg/s`).toBeLessThanOrEqual(FOV_MAX);
  expect(a.upStep, `${label}: up vector turns ${a.upStep.toFixed(1)} deg in a frame`).toBeLessThanOrEqual(UP_MAX);
}

describe('camfix: every sequence at 30, 60 and 144 fps', () => {
  for (const s of SCENARIOS) {
    for (const fps of FPS) {
      it(`${s.name} @${fps}`, () => { check(run(s, fps).frames, `${s.name}@${fps}`, s.blends); });
    }
  }
});

describe('camfix: a 250 ms frame at any phase', () => {
  for (const s of SCENARIOS) {
    const step = FULL ? 0.2 : s.window > 6 ? 1.0 : 0.5;
    it(`${s.name}`, () => {
      for (const fps of FPS) {
        const every = fps === 60 ? step : step * 2;
        for (let t = 0.1; t < s.window; t += every) check(run(s, fps, t).frames, `${s.name}@${fps} hitch ${t.toFixed(2)}`, s.blends);
      }
    });
  }
});

/** Pose of the lens relative to the car or body, so frame rates can be compared when the sim timing differs by a frame. */
function restPose(s: Scenario, fps: number): { x: number; y: number; z: number; fov: number; yaw: number } {
  const r = new CamRig({ fps, ...s.opts });
  s.run(r);
  r.hold(r.player.inVehicle ? 'Space' : '');
  r.wait(8);
  r.hold(); r.wait(0.01);
  const f = r.frames[r.frames.length - 1], sub = subject(f);
  return { x: f.px - sub.x, y: f.py, z: f.pz - sub.z, fov: f.fov, yaw: f.yaw };
}

describe('camfix: the same rest pose at every frame rate, and settled', () => {
  for (const s of SCENARIOS) {
    it(`${s.name}`, () => {
      const p = FPS.map((f) => restPose(s, f));
      for (const q of p.slice(1)) {
        expect(Math.hypot(q.x - p[0].x, q.y - p[0].y, q.z - p[0].z), `${s.name}: lens offset differs between frame rates`).toBeLessThan(s.opts.walls ? 0.06 : 0.02); // a wall's pull-in has a 5 cm dead band by design (REACH_DEAD)
        expect(Math.abs(q.fov - p[0].fov)).toBeLessThan(0.05);
        expect(Math.abs(angleDiff(q.yaw, p[0].yaw))).toBeLessThan(0.02);
      }
      // settled: 1.5 s later the pose has not moved (the 2 s hold before the camera comes back behind you is part of the rule, so wait it out)
      const r = new CamRig({ fps: 60, ...s.opts });
      s.run(r);
      r.hold(r.player.inVehicle ? 'Space' : ''); r.wait(9); r.hold();
      const a = r.frames[r.frames.length - 1]; r.wait(1.5); const b = r.frames[r.frames.length - 1];
      const sa = subject(a), sb = subject(b);
      expect(Math.hypot(b.px - sb.x - (a.px - sa.x), b.py - a.py, b.pz - sb.z - (a.pz - sa.z))).toBeLessThan(0.02);
    });
  }
});

describe('camfix: cuts are clean, blends are blends', () => {
  const rigIn = (type: 'sedan' = 'sedan'): CamRig => { const r = new CamRig({ fps: 60, car: { x: 0, z: 0, type }, start: { x: -2, z: 0.2 } }); r.tap('KeyF', 1.5); return r; };

  it('chase to hood is one clean cut: the frame it happens is fully the hood rig, the next frames do not move', () => {
    const r = rigIn(); r.hold(); r.wait(1);
    const n = r.frames.length;
    r.cam.views.setView('vehicle', 'hood'); r.wait(1);
    const f = r.frames.slice(n);
    expect(f[0].first, 'first frame already first person').toBeGreaterThan(0.99);
    for (let i = 1; i < 20; i++) expect(Math.hypot(f[i].px - f[i - 1].px, f[i].py - f[i - 1].py, f[i].pz - f[i - 1].pz), `frame ${i} drifts`).toBeLessThan(0.02);
    for (const x of f) expect(carBoxContains(x, x.px, x.py, x.pz, 0) && x.view !== 'hood', 'lens in the body outside the hood view').toBe(false);
  });
  it('hood to chase is one clean cut', () => {
    const r = rigIn(); r.wait(1); const d0 = r.frames[r.frames.length - 1].distance; r.cam.views.setView('vehicle', 'hood'); r.wait(1);
    const n = r.frames.length;
    r.cam.views.setView('vehicle', 'chase'); r.wait(1);
    const f = r.frames.slice(n);
    expect(f[0].first, 'first frame already chase').toBeLessThan(0.01);
    expect(Math.abs(f[0].distance - d0), 'distance on the cut frame').toBeLessThan(0.1);
    for (let i = 1; i < 20; i++) expect(Math.hypot(f[i].px - f[i - 1].px, f[i].py - f[i - 1].py, f[i].pz - f[i - 1].pz), `frame ${i} drifts`).toBeLessThan(0.02);
  });
  it('the cinematic view is entered and left by cuts (no yaw jump with a half blended distance)', () => {
    const r = rigIn(); r.wait(0.5); const d0 = r.frames[r.frames.length - 1].distance;
    const n = r.frames.length;
    r.cam.views.setView('vehicle', 'cinematic'); r.wait(0.5);
    const f = r.frames.slice(n);
    expect(f[0].camCut, 'reported as a cut').toBe(true);
    expect(Math.abs(f[0].distance - 9), 'on the cut frame the distance is the shot distance').toBeLessThan(0.2);
    const m = r.frames.length;
    r.cam.views.setView('vehicle', 'chase'); r.wait(0.5);
    const g = r.frames.slice(m);
    expect(g[0].camCut).toBe(true);
    expect(Math.abs(g[0].distance - d0)).toBeLessThan(0.2);
  });
  it('chase to far is a short blend of about a quarter second, not a cut', () => {
    const r = rigIn(); r.wait(1); const d0 = r.frames[r.frames.length - 1].distance;
    const n = r.frames.length;
    r.cam.views.setView('vehicle', 'far'); r.wait(1);
    const f = r.frames.slice(n);
    expect(f.some((x) => x.camCut)).toBe(false);
    const t = f.findIndex((x) => Math.abs(x.distance - d0 * 1.6) < 0.1) / 60;
    expect(t).toBeGreaterThan(0.15); expect(t).toBeLessThan(0.45);
  });
  it('getting in is one cut, on the press (CARENTRY: the camera cuts, the character does the half-second move)', () => {
    const r = new CamRig({ fps: 60, car: { x: 0, z: 0 }, start: { x: -2, z: 0.2 } }); r.wait(0.2);
    r.press('KeyF'); r.wait(1.0);
    const iCut = r.frames.findIndex((x) => x.mode === 'vehicle');
    expect(r.frames[iCut].camCut, 'a cut').toBe(true);
    expect(r.frames.filter((x) => x.camCut).length, 'exactly one cut').toBe(1);
    const last = r.frames[r.frames.length - 1].distance;
    expect(Math.abs(r.frames[iCut].distance - last), 'the rig is at its goal on the cut frame').toBeLessThan(0.05);
  });
});

describe('camfix: stepping out keeps the heading "walk forward" is measured against', () => {
  for (const [name, secs] of [['stopped', 0], ['moving at 6 m/s', 1.1], ['rolling out at speed', 3]] as const) {
    it(`${name}`, () => {
      const r = new CamRig({ fps: 60, car: { x: 0, z: 0 }, start: { x: -2, z: 0.2 } });
      r.tap('KeyF', 1.5); r.hold('KeyW'); r.wait(secs); r.hold();
      const yaw0 = r.cam.yaw;
      const n = r.frames.length;
      r.tap('KeyF', 1.8);
      const f = r.frames.slice(n);
      for (const x of f) expect(Math.abs(angleDiff(yaw0, x.yaw)) * 57.3, `yaw after exit at t=${x.t.toFixed(2)}`).toBeLessThan(10);
    });
  }
});
