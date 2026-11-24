/**
 * CAMERA seat: the classic camera style (docs/swarm/tasks/CAMERA.md). The camera driven directly with a scripted body (follow, lag,
 * look, views, frame rate) and, for getting in and out and the walls, through the CAMFIX harness (real Player, Vehicle and World2D).
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ThirdPersonCamera, CAM_CLASSIC, LOOK_FIRST_KEY, LOOK_LEFT_KEY, LOOK_RIGHT_KEY, type CameraMode } from '@/core/Camera';
import { LOOK_BACK_KEY } from '@/core/Input';
import { CameraViews, CLASSIC_VEHICLE_VIEWS, VIEWS, loadCameraStyle, setCameraStyle, onCameraStyleChange } from '@/core/CameraViews';
import { angleDiff, type Vec2 } from '@/core/Math2';
import { FakeInput } from '../entities/mechanics-measure';
import { CamRig, analyse, subject, carBoxContains, type CamFrame } from '../entities/camfix-harness';
import { SCENARIOS } from '../entities/camfix-scenarios';

// the unit tests run in node: give the camera a working localStorage (the camera and the views both treat it as optional)
{
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); }, clear: () => { mem.clear(); } });
}
const deg = (r: number): number => (r * 180) / Math.PI;
const FPS = [30, 60, 144];

/** A scripted body: position and heading as a function of time. */
type Path = (t: number) => { x: number; z: number; h: number; speed?: number };
interface Run { cam: ThirdPersonCamera; input: FakeInput; frames: Array<{ t: number; yaw: number; px: number; py: number; pz: number; dirX: number; dirZ: number; back: number }>; t: number; tgt: Vec2 }

function start(style: 'classic' | 'modern', path: Path, mode: CameraMode = 'foot'): Run {
  try { localStorage.clear(); } catch { /* none */ }
  const cam = new ThirdPersonCamera();
  cam.setStyle(style);
  return { cam, input: new FakeInput(), frames: [], t: 0, tgt: { x: 0, z: 0 } };
}

function advance(r: Run, path: Path, fps: number, seconds: number, mode: CameraMode = 'foot', veh?: { speed: number }): void {
  const n = Math.round(seconds * fps), dt = 1 / fps;
  const d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    r.t += dt;
    const p = path(r.t);
    r.tgt.x = p.x; r.tgt.z = p.z;
    r.cam.update(dt, r.tgt, p.h, mode, r.input as never, veh ? ({ vehicle: veh, speed: veh.speed } as never) : undefined);
    r.input.mouseDX = 0; r.input.mouseDY = 0;
    r.cam.camera.updateMatrixWorld(true);
    r.cam.camera.getWorldDirection(d);
    r.frames.push({ t: r.t, yaw: r.cam.yaw, px: r.cam.camera.position.x, py: r.cam.camera.position.y, pz: r.cam.camera.position.z, dirX: d.x, dirZ: d.z, back: r.cam.lookBackAmount });
  }
}

/** A body walking along `heading` at `speed`, turning its heading to `h1` at time `at` (the position path bends at once). */
function turnPath(h0: number, h1: number, at: number, speed: number): Path {
  const seg = (h: number, t: number): { x: number; z: number } => ({ x: Math.sin(h) * speed * t, z: -Math.cos(h) * speed * t });
  return (t) => {
    if (t < at) { const p = seg(h0, t); return { ...p, h: h0 }; }
    const a = seg(h0, at), b = seg(h1, t - at);
    return { x: a.x + b.x, z: a.z + b.z, h: h1 };
  };
}
const stand = (h = 0): Path => () => ({ x: 0, z: 0, h });
const yawAt = (r: Run, t: number): number => r.frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best)).yaw;

describe('classic on foot: the rig', () => {
  it('sits behind and well above, as in the table', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 2);
    const f = r.frames[r.frames.length - 1];
    const horiz = Math.hypot(f.px, f.pz), look = 1.2;
    expect(horiz).toBeGreaterThan(4.9); expect(horiz).toBeLessThan(5.5);
    expect(f.py).toBeGreaterThan(3.2); expect(f.py).toBeLessThan(3.6);
    const down = deg(Math.atan2(f.py - look, horiz));
    expect(down).toBeGreaterThan(20); expect(down).toBeLessThan(26);
    // behind the heading-0 body (north is -z): the lens is south of it, on the line, no shoulder offset
    expect(f.pz).toBeGreaterThan(0); expect(Math.abs(f.px)).toBeLessThan(0.02);
    expect(r.cam.camera.fov).toBeCloseTo(60, 1);
    expect(r.cam.bodyFade).toBe(1);
  });
  it('has no roll, sway or drift when standing for a long time', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 14);
    expect(r.cam.rollAngle).toBe(0);
    expect(r.cam.cinematicAmount).toBe(0);
    const a = r.frames[120], b = r.frames[r.frames.length - 1];
    expect(Math.hypot(a.px - b.px, a.py - b.py, a.pz - b.pz)).toBeLessThan(1e-3);
  });
  it('does not turn when the body turns on the spot (stays put)', () => {
    const path: Path = (t) => ({ x: 0, z: 0, h: t < 1 ? 0 : 2 });
    const r = start('classic', path);
    advance(r, path, 60, 6);
    expect(Math.abs(deg(angleDiff(0, r.cam.yaw)))).toBeLessThan(0.5);
  });
});

describe('classic on foot: the lazy follow of movement', () => {
  const H1 = Math.PI / 2;
  const path = turnPath(0, H1, 1, 5);
  it('swings round behind a new direction: no snap, settled within 2.5 s, no overshoot', () => {
    const r = start('classic', path);
    advance(r, path, 60, 5);
    const turnAt = 1;
    const offAt = (s: number): number => Math.abs(deg(angleDiff(H1, yawAt(r, turnAt + s))));
    expect(offAt(0.0)).toBeGreaterThan(85);
    expect(offAt(0.1)).toBeGreaterThan(70);          // it does not snap
    expect(offAt(0.5)).toBeGreaterThan(20);          // and is still on its way after half a second
    expect(offAt(0.5)).toBeLessThan(80);
    expect(offAt(2.5)).toBeLessThan(10);             // settled behind the direction of travel
    let maxStep = 0, over = 0;
    for (let i = 1; i < r.frames.length; i++) {
      maxStep = Math.max(maxStep, Math.abs(deg(angleDiff(r.frames[i - 1].yaw, r.frames[i].yaw))));
      const o = deg(angleDiff(H1, r.frames[i].yaw));
      if (r.frames[i].t > turnAt && o > 0.5) over = Math.max(over, o); // yaw past the heading
    }
    expect(maxStep).toBeLessThan(2.5);               // degrees per frame at 60 fps (150 deg/s)
    expect(over).toBeLessThan(0.5);
  });
  it('gives the same yaw at 30, 60 and 144 updates a second', () => {
    const end: number[] = [];
    for (const fps of FPS) {
      const r = start('classic', path);
      advance(r, path, fps, 4);
      end.push(yawAt(r, 2.0), yawAt(r, 4.0));
    }
    for (let i = 0; i < 2; i++) {
      const v = [0, 1, 2].map((k) => end[k * 2 + i]);
      expect(Math.max(...v) - Math.min(...v), `sample ${i}: ${v.map((x) => deg(x).toFixed(2))}`).toBeLessThan(0.03);
    }
  });
  it('does not spin when running toward the lens', () => {
    const path2: Path = (t) => (t < 1 ? { x: 0, z: 0, h: 0 } : { x: 0, z: 3 * (t - 1), h: Math.PI }); // stand facing north, then run south: at the lens
    const r = start('classic', path2);
    advance(r, path2, 60, 4);
    // the yaw may drift a little while the angle opens, but never swings all the way round in 3 s
    expect(Math.abs(deg(angleDiff(0, r.cam.yaw)))).toBeLessThan(60);
  });
  it('waits two seconds after a look, then returns behind (moving)', () => {
    const path3: Path = (t) => ({ x: 0, z: -4 * t, h: 0 });
    const r = start('classic', path3);
    advance(r, path3, 60, 1);
    r.input.mouseDX = 400;                          // about 57 degrees
    advance(r, path3, 60, 1 / 60);
    const turned = r.cam.yaw;
    expect(Math.abs(deg(turned))).toBeGreaterThan(50);
    advance(r, path3, 60, 1.8);
    expect(r.cam.yaw).toBeCloseTo(turned, 3);        // held
    advance(r, path3, 60, 3.0);
    expect(Math.abs(deg(r.cam.yaw))).toBeLessThan(5);
  });
  it('returns behind after a look when standing still, and stays put afterwards', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 1);
    r.input.mouseDX = -300;
    advance(r, stand(), 60, 1 / 60);
    const turned = r.cam.yaw;
    advance(r, stand(), 60, 1.9);
    expect(r.cam.yaw).toBeCloseTo(turned, 3);
    advance(r, stand(), 60, 4);
    expect(Math.abs(deg(r.cam.yaw))).toBeLessThan(2);
    const y = r.cam.yaw;
    advance(r, stand(), 60, 3);
    expect(r.cam.yaw).toBe(y);
  });
  it('orbits freely with the mouse (pitch within its limits)', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 1);
    r.input.mouseDY = 5000; advance(r, stand(), 60, 1 / 60);
    expect(r.cam.pitch).toBeCloseTo(CAM_CLASSIC.pitchFoot.max, 5);
    r.input.mouseDY = -9000; advance(r, stand(), 60, 1 / 60);
    expect(r.cam.pitch).toBeCloseTo(CAM_CLASSIC.pitchFoot.min, 5);
    expect(r.cam.camera.position.y).toBeGreaterThan(0.4);
  });
  it('looks through the eyes on a held key (a cut in and out) and behind / to the side on keys', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 1);
    r.input.hold(LOOK_FIRST_KEY);
    advance(r, stand(), 60, 1 / 60);
    expect(r.cam.snappedThisFrame).toBe(true);
    expect(r.cam.firstPersonAmount).toBeGreaterThan(0.99);
    r.input.hold();
    advance(r, stand(), 60, 1 / 60);
    expect(r.cam.snappedThisFrame).toBe(true);
    expect(r.cam.firstPersonAmount).toBe(0);
    advance(r, stand(), 60, 1);
    const base = r.frames[r.frames.length - 1];
    r.input.hold(LOOK_BACK_KEY);
    advance(r, stand(), 60, 0.2);
    const back = r.frames[r.frames.length - 1];
    expect(back.back).toBeGreaterThan(0.98);
    expect(back.pz).toBeLessThan(-4);                // in front of the body now, looking back at it
    r.input.hold(LOOK_LEFT_KEY);
    advance(r, stand(), 60, 0.3);
    const l = r.frames[r.frames.length - 1];
    expect(l.px).toBeGreaterThan(4);                 // heading 0: the view looks left, so the lens is on the right
    r.input.hold(LOOK_RIGHT_KEY);
    advance(r, stand(), 60, 0.3);
    expect(r.frames[r.frames.length - 1].px).toBeLessThan(-4);
    expect(base.pz).toBeGreaterThan(4);
  });
});

describe('classic in a car', () => {
  const car = { speed: 12 };
  it('is locked behind the heading with a soft lag in yaw, then catches up', () => {
    const rate = 0.8;                                // rad/s of turn
    const path: Path = (t) => { const h = t < 4 ? 0 : Math.min(rate * (t - 4), 1.6) ; return { x: 0, z: 0, h }; };
    const r = start('classic', path);
    advance(r, path, 60, 4, 'vehicle', car);
    expect(Math.abs(deg(angleDiff(0, r.cam.yaw)))).toBeLessThan(0.5);
    advance(r, path, 60, 1, 'vehicle', car);         // 0.8 rad (46 deg) into a turn at 0.8 rad/s
    const lag = deg(angleDiff(r.cam.yaw, 0.8));      // heading minus yaw: how far the view trails
    expect(lag).toBeGreaterThan(8); expect(lag).toBeLessThan(30);
    advance(r, path, 60, 1.5, 'vehicle', car);       // the turn stops at 1.6 rad
    advance(r, path, 60, 2, 'vehicle', car);
    expect(Math.abs(deg(angleDiff(1.6, r.cam.yaw)))).toBeLessThan(1);
  });
  it('gives the same pose at 30, 60 and 144 updates a second through a turn', () => {
    const path: Path = (t) => ({ x: 0, z: 0, h: t < 1 ? 0 : Math.min(0.9 * (t - 1), 1.2) });
    const poses = FPS.map((fps) => { const r = start('classic', path); advance(r, path, fps, 6, 'vehicle', car); const f = r.frames[r.frames.length - 1]; return [f.px, f.py, f.pz, r.cam.yaw]; });
    for (let i = 0; i < 4; i++) expect(Math.max(...poses.map((p) => p[i])) - Math.min(...poses.map((p) => p[i]))).toBeLessThan(0.02);
    // and mid-turn (t = 1.9 s, still turning)
    const mid = FPS.map((fps) => { const r = start('classic', path); advance(r, path, fps, 1.9, 'vehicle', car); return r.cam.yaw; });
    expect(Math.max(...mid) - Math.min(...mid)).toBeLessThan(0.02);
  });
  it('flips to a rear view in about a tenth of a second on the look-behind key, and back', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 3, 'vehicle', car);
    r.input.hold(LOOK_BACK_KEY);
    advance(r, stand(), 60, 0.1, 'vehicle', car);
    expect(r.cam.lookBackAmount).toBeGreaterThan(0.9);
    advance(r, stand(), 60, 0.2, 'vehicle', car);
    expect(r.cam.lookBackAmount).toBeGreaterThan(0.995);
    expect(r.frames[r.frames.length - 1].pz).toBeLessThan(0); // in front of a north-facing car, looking back at it
    r.input.hold();
    advance(r, stand(), 60, 0.3, 'vehicle', car);
    expect(r.cam.lookBackAmount).toBeLessThan(0.005);
  });
  it('does not flip when reversing (the view stays behind the car)', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 3, 'vehicle', { speed: -6 });
    expect(r.cam.lookBackAmount).toBe(0);
  });
  it('looks left and right on keys', () => {
    const r = start('classic', stand());
    advance(r, stand(), 60, 3, 'vehicle', car);
    r.input.hold(LOOK_RIGHT_KEY);
    advance(r, stand(), 60, 0.3, 'vehicle', car);
    expect(r.frames[r.frames.length - 1].px).toBeLessThan(-4); // looking right: the lens is on the left of a north-facing car
    r.input.hold(LOOK_LEFT_KEY);
    advance(r, stand(), 60, 0.3, 'vehicle', car);
    expect(r.frames[r.frames.length - 1].px).toBeGreaterThan(4);
  });
  it('pulls back and widens with speed, higher and looking slightly down', () => {
    const slow = start('classic', stand()); advance(slow, stand(), 60, 4, 'vehicle', { speed: 0 });
    const fast = start('classic', stand()); advance(fast, stand(), 60, 6, 'vehicle', { speed: 30 });
    const a = slow.frames[slow.frames.length - 1], b = fast.frames[fast.frames.length - 1];
    const da = Math.hypot(a.px, a.pz), db = Math.hypot(b.px, b.pz);
    expect(db - da).toBeGreaterThan(1.3); expect(db - da).toBeLessThan(1.9);
    expect(fast.cam.camera.fov).toBeGreaterThan(slow.cam.camera.fov + 5);
    expect(a.py).toBeGreaterThan(2.5);
    const down = deg(Math.atan2(a.py - 1.2, da));
    expect(down).toBeGreaterThan(10); expect(down).toBeLessThan(20);
    expect(da).toBeGreaterThan(5.8); expect(da).toBeLessThan(6.6);
  });
});

describe('classic views', () => {
  it('cycles near, middle, far, bumper, cinematic with the view key, on its own memory', () => {
    const v = new CameraViews(null);
    v.setStyle('classic');
    const ids: string[] = [v.id('vehicle')];
    let clock = 0;
    for (let i = 0; i < 5; i++) { v.tick(1, 'vehicle'); clock += 1; v.pressView('vehicle'); ids.push(v.id('vehicle')); }
    expect(ids).toEqual(['middle', 'far', 'bumper', 'cinematic', 'near', 'middle']);
    expect(clock).toBe(5);
    expect(CLASSIC_VEHICLE_VIEWS.map((x) => x.id)).toEqual(['near', 'middle', 'far', 'bumper', 'cinematic']);
  });
  it('has one view on foot (the key does nothing) and no shoulder swap', () => {
    const v = new CameraViews(null);
    v.setStyle('classic');
    const s = v.serial;
    v.pressView('foot'); v.swapShoulder();
    expect(v.serial).toBe(s);
    expect(v.id('foot')).toBe('chase');
    expect(v.rig('foot').shoulder).toBe(0);
  });
  it('the near, middle and far chase sit at the table distances', () => {
    const dist = (id: string): number => {
      const r = start('classic', stand());
      r.cam.views.setView('vehicle', id);
      advance(r, stand(), 60, 4, 'vehicle', { speed: 0 });
      const f = r.frames[r.frames.length - 1];
      return Math.hypot(f.px, f.pz);
    };
    const n = dist('near'), m = dist('middle'), f = dist('far');
    expect(n).toBeCloseTo(0.8 * 6.2 + 0.0, 1); expect(m).toBeCloseTo(6.2, 1); expect(f).toBeCloseTo(1.45 * 6.2, 1);
    expect(n).toBeLessThan(m); expect(m).toBeLessThan(f);
  });
  it('the style choice is stored and announced; classic is the default', () => {
    try { localStorage.clear(); } catch { /* none */ }
    expect(loadCameraStyle()).toBe('classic');
    let got = '';
    const off = onCameraStyleChange((s) => { got = s; });
    setCameraStyle('modern');
    expect(got).toBe('modern'); expect(loadCameraStyle()).toBe('modern');
    setCameraStyle('classic');
    expect(loadCameraStyle()).toBe('classic');
    off();
    try { localStorage.clear(); } catch { /* none */ }
  });
});

describe('modern is unchanged', () => {
  it('starts in modern and keeps its table, rig and numbers', () => {
    const cam = new ThirdPersonCamera();
    expect(cam.style).toBe('modern');
    expect(cam.views.rig('foot').shoulder).toBeCloseTo(0.35, 6);
    expect(VIEWS.vehicle.map((x) => x.id)).toEqual(['hood', 'close', 'chase', 'far', 'cinematic']);
    expect(VIEWS.foot.map((x) => x.id)).toEqual(['shoulder', 'chase', 'far', 'first']);
  });
  it('a camera switched to classic and back lands where a fresh modern camera does', () => {
    const path = turnPath(0, 0, 1, 3);
    const fresh = start('modern', path); advance(fresh, path, 60, 5);
    const sw = start('classic', path); advance(sw, path, 60, 1); sw.cam.setStyle('modern'); advance(sw, path, 60, 6);
    const a = fresh.frames[fresh.frames.length - 1], b = sw.frames[sw.frames.length - 1];
    // both are walking north along the same line: compare the lens relative to the body
    const rel = (f: typeof a, t: number): number[] => { const p = path(t); return [f.px - p.x, f.py, f.pz - p.z]; };
    const ra = rel(a, fresh.t), rb = rel(b, sw.t);
    for (let i = 0; i < 3; i++) expect(Math.abs(ra[i] - rb[i])).toBeLessThan(0.03);
    expect(sw.cam.camera.fov).toBeCloseTo(fresh.cam.camera.fov, 3);
  });
  it('a modern car stays put on the look-behind rules (reversing flips) and has roll and swing', () => {
    const r = start('modern', stand());
    advance(r, stand(), 60, 3, 'vehicle', { speed: -6 });
    expect(r.cam.lookBackAmount).toBeGreaterThan(0.9);
  });
});

// ------------------------------------------------------------------------------------------------ real bodies

function runScenario(s: (typeof SCENARIOS)[number], fps: number, hitchAt?: number): CamRig {
  const r = new CamRig({ fps, ...s.opts, style: 'classic', hitchAt, hitchMs: 250 });
  s.run(r);
  return r;
}
// the classic rig is 5 to 6 m behind, so getting in or out is a longer glide than the modern one: every scenario gets the blend allowance
const relStepMax = (dt: number): number => 0.15 + 30 * dt;

describe('classic: getting in and out and the walls, every CAMFIX scenario', () => {
  for (const s of SCENARIOS) {
    for (const fps of FPS) {
      it(`${s.name} @${fps}`, () => {
        const fr = runScenario(s, fps).frames;
        const a = analyse(fr);
        const dtMax = Math.max(...fr.map((f) => f.dt));
        expect(a.nan).toBe(0);
        expect(a.minAboveGround, `lens near the ground at t=${a.minAboveGroundAt.toFixed(2)}`).toBeGreaterThanOrEqual(0.3);
        expect(a.insideCar, `lens inside the car from t=${a.insideCarAt.toFixed(2)}`).toBe(0);
        expect(a.relStep, `lens jump of ${a.relStep.toFixed(2)} m at t=${a.relStepAt.toFixed(2)}`).toBeLessThanOrEqual(relStepMax(dtMax));
        expect(a.turnRate, `view turns ${a.turnRate.toFixed(0)} deg/s at t=${a.turnRateAt.toFixed(2)}`).toBeLessThanOrEqual(240);
        expect(a.fovRate, `fov ${a.fovRate.toFixed(0)} deg/s`).toBeLessThanOrEqual(60);
        expect(a.upStep, `up vector ${a.upStep.toFixed(1)} deg in a frame`).toBeLessThanOrEqual(8);
      });
    }
  }
  it('a 250 ms frame at any phase of enter, drive, exit does not break the rules', () => {
    const s = SCENARIOS.find((x) => x.name === 'enter-drive-off') ?? SCENARIOS[0];
    for (const fps of FPS) for (let t = 0.1; t < s.window; t += 0.4) {
      const fr = runScenario(s, fps, t).frames;
      const a = analyse(fr);
      expect(a.insideCar).toBe(0);
      expect(a.nan).toBe(0);
      expect(a.minAboveGround).toBeGreaterThanOrEqual(0.3);
    }
  });
});

describe('classic: walls and bodies', () => {
  const box = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  it('slides in along the ray toward a body with a wall behind it, never inside the wall, no jitter, and fades the body', () => {
    // the player at z = 3 faces north, so the lens is south of it; a wall spans z 4.2 .. 6 (1.2 m behind the player)
    for (const fps of FPS) {
      const r = new CamRig({ fps, style: 'classic', start: { x: 0, z: 3 }, walls: [box(-8, 4.2, 8, 6)] });
      r.wait(2.5);
      const fr = r.frames.filter((f) => f.t > 1.0);
      for (const f of fr) expect(f.pz, `lens inside the wall at t=${f.t.toFixed(2)}`).toBeLessThan(4.2 - 0.1);
      const xs = fr.map((f) => f.pz), spread = Math.max(...xs) - Math.min(...xs);
      expect(spread, `lens shivers ${spread.toFixed(3)} m against the wall at ${fps} fps`).toBeLessThan(0.03);
      expect(r.cam.bodyFade).toBeLessThan(0.3);
      const a = analyse(r.frames);
      expect(a.minAboveGround).toBeGreaterThanOrEqual(0.3);
    }
  });
  it('eases back out when the wall is gone, without a pop', () => {
    const r = new CamRig({ fps: 60, style: 'classic', start: { x: 0, z: 3 }, walls: [box(-8, 4.2, 8, 6)] });
    r.wait(1.5);
    r.input.hold('KeyW');                 // walk north, away from the wall
    r.wait(3);
    const a = analyse(r.frames.filter((f) => f.t > 1.5));
    expect(a.relStep).toBeLessThan(0.3 + 6 * (1 / 60) + 0.05);
    const last = r.frames[r.frames.length - 1];
    expect(Math.hypot(last.px - last.bx, last.pz - last.bz)).toBeGreaterThan(4);
  });
  it('is the same rest pose at 30, 60 and 144 fps against a wall (5 cm dead band)', () => {
    const ends = FPS.map((fps) => { const r = new CamRig({ fps, style: 'classic', start: { x: 0, z: 3 }, walls: [box(-8, 4.2, 8, 6)] }); r.wait(3); const f = r.frames[r.frames.length - 1]; return [f.px, f.py, f.pz]; });
    for (let i = 0; i < 3; i++) expect(Math.max(...ends.map((e) => e[i])) - Math.min(...ends.map((e) => e[i]))).toBeLessThan(0.06);
  });
  it('is the same rest pose at 30, 60 and 144 fps in the open and in a car', () => {
    for (const mk of [() => ({}), () => ({ car: { x: 0, z: 0 }, start: { x: -2, z: 0.2 } })]) {
      const ends = FPS.map((fps) => {
        const r = new CamRig({ fps, style: 'classic', ...mk() });
        if ('car' in mk()) r.tap('KeyF', 1.2);
        r.wait(3);
        const f = r.frames[r.frames.length - 1];
        return [f.px, f.py, f.pz];
      });
      for (let i = 0; i < 3; i++) expect(Math.max(...ends.map((e) => e[i])) - Math.min(...ends.map((e) => e[i]))).toBeLessThan(0.02);
    }
  });
});

describe('classic: a drive with the real car, get out, walk on', () => {
  it('has no frame inside the car, the lens never under the ground, and "forward" holds after stepping out', () => {
    const r = new CamRig({ fps: 60, style: 'classic', car: { x: 0, z: 0 }, start: { x: -2.0, z: 0.2 } });
    r.tap('KeyF', 1.2);
    r.hold('KeyW'); r.wait(3);
    r.hold('KeyW', 'KeyD'); r.wait(1.5);
    r.hold(); r.wait(3);
    r.tap('KeyF', 3);
    r.hold('KeyW'); r.wait(3);
    const a = analyse(r.frames);
    expect(a.insideCar).toBe(0);
    expect(a.minAboveGround).toBeGreaterThanOrEqual(0.3);
    expect(a.nan).toBe(0);
    const fr = r.frames as CamFrame[];
    expect(fr.every((f) => !f.hasCar || !f.inVehicle || !carBoxContains(f, f.px, f.py, f.pz) || f.view === 'bumper')).toBe(true);
    expect(subject(fr[fr.length - 1])).toBeTruthy();
  });
});
