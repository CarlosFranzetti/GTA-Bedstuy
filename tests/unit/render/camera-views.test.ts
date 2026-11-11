import { describe, it, expect } from 'vitest';
import { ThirdPersonCamera } from '@/core/Camera';
import {
  CameraViews, FOOT_VIEWS, VEHICLE_VIEWS, STORAGE_KEY, DOUBLE_TAP, CinematicDirector, CINE_HOLD_MIN, CINE_HOLD_MAX, CINE_SHOTS,
} from '@/core/CameraViews';
import type { Input } from '@/core/Input';

const fakeInput = () => ({ isDown: () => false, pressed: () => false, axis: () => 0, mouseDX: 0, mouseDY: 0, wheel: 0 }) as unknown as Input;
function memStore(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } } as Storage;
}
/** Press V `n` times, `gap` seconds apart (slow enough to not be a double tap by default). */
function press(v: CameraViews, mode: 'foot' | 'vehicle', n: number, gap = 1): void { for (let i = 0; i < n; i++) { v.tick(gap, mode); v.pressView(mode); } }

describe('view cycling', () => {
  it('on foot: shoulder, chase, far, first person, then back round (default chase)', () => {
    expect(FOOT_VIEWS.map((v) => v.id)).toEqual(['shoulder', 'chase', 'far', 'first']);
    const v = new CameraViews(memStore());
    expect(v.id('foot')).toBe('chase');
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { press(v, 'foot', 1); seen.push(v.id('foot')); }
    expect(seen).toEqual(['far', 'first', 'shoulder', 'chase']);
  });
  it('in a vehicle: hood, close, chase, far, cinematic', () => {
    expect(VEHICLE_VIEWS.map((v) => v.id)).toEqual(['hood', 'close', 'chase', 'far', 'cinematic']);
    const v = new CameraViews(memStore());
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) { press(v, 'vehicle', 1); seen.push(v.id('vehicle')); }
    expect(seen).toEqual(['far', 'cinematic', 'hood', 'close', 'chase']);
  });
  it('double-tap swaps between the last two views instead of cycling on', () => {
    const v = new CameraViews(memStore());
    press(v, 'foot', 1); // chase -> far
    expect(v.id('foot')).toBe('far');
    v.tick(DOUBLE_TAP / 2, 'foot'); v.pressView('foot');
    expect(v.id('foot')).toBe('chase');
    v.tick(DOUBLE_TAP / 2, 'foot'); v.pressView('foot');
    expect(v.id('foot')).toBe('far');
    press(v, 'foot', 1, DOUBLE_TAP * 4); // slow tap cycles on
    expect(v.id('foot')).toBe('first');
  });
  it('handleKeys: V cycles the current mode; B swaps the shoulder on foot only', () => {
    const v = new CameraViews(memStore());
    const keys = new Set<string>();
    const input = { consume: (c: string) => keys.delete(c) };
    keys.add('KeyV'); v.handleKeys(input, 'foot');
    expect(v.id('foot')).toBe('far');
    expect(v.id('vehicle')).toBe('chase'); // no leak between modes
    keys.add('KeyB'); v.handleKeys(input, 'foot'); expect(v.side).toBe(-1);
    keys.add('MouseMiddle'); v.handleKeys(input, 'foot'); expect(v.side).toBe(1);
    keys.add('KeyB'); v.handleKeys(input, 'vehicle'); expect(v.side).toBe(1);
  });
});

describe('persistence', () => {
  it('remembers the last view per mode and the shoulder side', () => {
    const store = memStore();
    const a = new CameraViews(store);
    press(a, 'foot', 2); press(a, 'vehicle', 3); a.swapShoulder();
    const b = new CameraViews(store);
    expect(b.id('foot')).toBe('first');
    expect(b.id('vehicle')).toBe('hood');
    expect(b.side).toBe(-1);
  });
  it('survives blocked, corrupt and unknown storage', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    const v = new CameraViews(throwing);
    expect(() => press(v, 'foot', 1)).not.toThrow();
    expect(new CameraViews(memStore({ [STORAGE_KEY]: '{nope' })).id('foot')).toBe('chase');
    expect(new CameraViews(memStore({ [STORAGE_KEY]: JSON.stringify({ foot: 'zzz', vehicle: 'hood' }) })).id('foot')).toBe('chase');
    expect(new CameraViews(null).id('vehicle')).toBe('chase');
  });
});

describe('cinematic director (fake time)', () => {
  it('cuts every CINE_HOLD_MIN..MAX seconds, never repeating a shot, deterministic per seed', () => {
    const run = (seed: number) => {
      const d = new CinematicDirector(seed); const cuts: number[] = []; const shots: string[] = [d.shot.name];
      let t = 0;
      for (let i = 0; i < 60 * 40; i++) { t += 1 / 60; if (d.update(1 / 60)) { cuts.push(t); shots.push(d.shot.name); } }
      return { cuts, shots };
    };
    const a = run(7), b = run(7);
    expect(a).toEqual(b);
    expect(a.cuts.length).toBeGreaterThanOrEqual(6);
    let prev = 0;
    for (const c of a.cuts) { const gap = c - prev; expect(gap).toBeGreaterThanOrEqual(CINE_HOLD_MIN - 0.03); expect(gap).toBeLessThanOrEqual(CINE_HOLD_MAX + 0.03); prev = c; }
    for (let i = 1; i < a.shots.length; i++) expect(a.shots[i]).not.toBe(a.shots[i - 1]);
    expect(new Set(a.shots).size).toBeGreaterThan(2);
    expect(CINE_SHOTS.length).toBeGreaterThanOrEqual(5);
  });
  it('only runs while the cinematic view is showing, and flags the cut frame', () => {
    const v = new CameraViews(memStore());
    for (let i = 0; i < 600; i++) { v.tick(1 / 60, 'vehicle'); expect(v.cutThisFrame).toBe(false); }
    v.setView('vehicle', 'cinematic');
    expect(v.cutThisFrame).toBe(true);
    let cuts = 0;
    for (let i = 0; i < 60 * 20; i++) { v.tick(1 / 60, 'vehicle'); if (v.cutThisFrame) cuts++; }
    expect(cuts).toBeGreaterThanOrEqual(3);
  });
});

describe('camera rigs', () => {
  const settle = (cam: ThirdPersonCamera, mode: 'foot' | 'vehicle', secs = 3, world?: unknown) => {
    for (let i = 0; i < secs * 60; i++) cam.update(1 / 60, { x: 0, z: 0 }, 0, mode, fakeInput(), { speed: 0, world: world as never });
  };
  const dist = (cam: ThirdPersonCamera) => Math.hypot(cam.camera.position.x, cam.camera.position.z);
  it('foot views: distance grows shoulder < chase < far; first person sits at the head; fov per view', () => {
    const d: Record<string, number> = {}, fov: Record<string, number> = {};
    for (const id of ['shoulder', 'chase', 'far', 'first']) {
      const cam = new ThirdPersonCamera(); cam.views.setView('foot', id); settle(cam, 'foot');
      d[id] = dist(cam); fov[id] = cam.camera.fov;
      if (id === 'first') { expect(cam.firstPersonAmount).toBeGreaterThan(0.9); expect(cam.camera.position.y).toBeCloseTo(1.66, 1); }
    }
    expect(d.shoulder).toBeLessThan(d.chase); expect(d.chase).toBeLessThan(d.far); expect(d.first).toBeLessThan(0.3);
    expect(fov.first).toBeGreaterThan(fov.chase); expect(fov.shoulder).toBeLessThan(fov.chase);
  });
  it('chase defaults are unchanged (same pose as the old rig)', () => {
    const cam = new ThirdPersonCamera(); settle(cam, 'foot');
    expect(cam.camera.position.y).toBeCloseTo(1.55, 1);
    expect(cam.camera.fov).toBeCloseTo(64, 0);
  });
  it('vehicle views: hood is ahead of the car at low height, close < chase < far', () => {
    const d: Record<string, number> = {}; let hoodZ = 0;
    for (const id of ['hood', 'close', 'chase', 'far']) {
      const cam = new ThirdPersonCamera(); cam.views.setView('vehicle', id); settle(cam, 'vehicle');
      d[id] = dist(cam); if (id === 'hood') { hoodZ = cam.camera.position.z; expect(cam.camera.position.y).toBeLessThan(1.4); }
    }
    expect(hoodZ).toBeLessThan(0); // north is -z, heading 0: ahead of the car centre
    expect(d.close).toBeLessThan(d.chase); expect(d.chase).toBeLessThan(d.far);
  });
  it('switching views glides: no frame-to-frame jump over 0.6 m on foot', () => {
    const cam = new ThirdPersonCamera(); settle(cam, 'foot');
    cam.views.setView('foot', 'far');
    let prev = cam.camera.position.clone(), maxStep = 0;
    for (let i = 0; i < 180; i++) { cam.update(1 / 60, { x: 0, z: 0 }, 0, 'foot', fakeInput()); maxStep = Math.max(maxStep, cam.camera.position.distanceTo(prev)); prev = cam.camera.position.clone(); }
    expect(maxStep).toBeLessThan(0.6);
  });
  it('third-person views keep out of a wall behind the player', () => {
    // a wall 1.5 m behind (south, +z) of the target
    const world = { raycast: () => null, raycastStatic: (_f: unknown, dir: { z: number }, max: number) => (dir.z > 0 && max > 1.5 ? { dist: 1.5 } : null) };
    for (const id of ['shoulder', 'chase', 'far']) {
      const cam = new ThirdPersonCamera(); cam.views.setView('foot', id); settle(cam, 'foot', 3, world);
      expect(cam.camera.position.z).toBeLessThan(1.5);
    }
    for (const id of ['close', 'chase', 'far']) {
      const cam = new ThirdPersonCamera(); cam.views.setView('vehicle', id); settle(cam, 'vehicle', 3, world);
      expect(cam.camera.position.z).toBeLessThan(1.5);
    }
  });
  it('cinematic cuts snap the rig once; the yaw offset moves the lens off the chase line', () => {
    const cam = new ThirdPersonCamera(); cam.views.setView('vehicle', 'cinematic');
    const positions = new Set<string>();
    for (let i = 0; i < 60 * 25; i++) { cam.update(1 / 60, { x: 0, z: 0 }, 0, 'vehicle', fakeInput(), { speed: 8 }); if (i % 60 === 59) positions.add(cam.camera.position.toArray().map((n) => n.toFixed(0)).join(',')); }
    expect(positions.size).toBeGreaterThan(2);
  });
  it('leaving a mode does not leak the other mode\'s view', () => {
    const cam = new ThirdPersonCamera();
    cam.views.setView('vehicle', 'hood');
    settle(cam, 'foot');
    expect(cam.viewId).toBe('chase');
    expect(cam.firstPersonAmount).toBe(0);
  });
});
