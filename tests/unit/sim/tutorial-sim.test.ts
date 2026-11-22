// @vitest-environment jsdom
/**
 * TUTORIAL: a scripted player completes every step with the REAL systems: Player, Input (real key edges), Vehicle, World2D, the
 * binding table, the step engine and the Tutorial class, on the grid map (its real colliders) and on the real-street net (its real
 * start spot). The scripted player only reads what step is on the card and does it, like a person would, so the car, the pickup and the
 * home door are placed from where the player stands: nothing is a fixed coordinate.
 */
import { describe, expect, it } from 'vitest';
import { Bindings } from '@/core/Bindings';
import { EventBus } from '@/core/Events';
import { Input } from '@/core/Input';
import { Player } from '@/entities/Player';
import type { Vehicle } from '@/entities/Vehicle';
import { World2D } from '@/physics/World2D';
import type { IVehicle } from '@/world/types';
import { Tutorial } from '@/ui/tutorial/Tutorial';
import { TutorialStore } from '@/ui/tutorial/store';
import { STEP_IDS } from '@/ui/tutorial/steps';
import type { TutorialHost } from '@/ui/tutorial/context';
import { DT, Sim, makeVehicle, realPhysics, stubMaterials } from './harness';
import { playerSpot } from './realtraffic-run';

const HALF_PI = Math.PI / 2;

// jsdom has no 2D canvas: the world builder paints textures, so give it a context that accepts every call
const ctx2d = (): unknown => new Proxy({}, {
  get: (_t, k) => {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData' || k === 'createImageData') return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
    if (/^create.*Gradient$/.test(String(k))) return () => ({ addColorStop() {} });
    if (k === 'createPattern') return () => ({});
    if (k === 'canvas') return document.createElement('canvas');
    return () => undefined;
  },
  set: () => true,
});
/** Build the grid map's physics with the permissive context, then put the real (absent) one back. */
function gridPhysics(): ReturnType<typeof realPhysics> {
  const proto = HTMLCanvasElement.prototype; const was = proto.getContext;
  proto.getContext = ((): unknown => ctx2d()) as never;
  try { return realPhysics(); } finally { proto.getContext = was; }
}

interface Scene { physics: World2D; start: { x: number; z: number } }

/** A start spot with 45 m of open ground to the west (the scripted player runs along -x) and 8 m either side. */
function clearStart(physics: World2D, from: { x: number; z: number }): { x: number; z: number } {
  for (let r = 0; r <= 120; r += 4) for (let a = 0; a < 16; a++) {
    const p = r === 0 ? from : { x: from.x + Math.cos((a / 16) * 6.283) * r, z: from.z + Math.sin((a / 16) * 6.283) * r };
    let ok = true;
    for (let d = -45; d <= 20 && ok; d += 1.5) for (const dz of [-3, 0, 3]) if (physics.overlapsSolid({ x: p.x + d, z: p.z + dz }, 0.9)) { ok = false; break; }
    if (ok) return p;
  }
  throw new Error('no clear start spot');
}

function play(scene: Scene): { log: string[]; completed: string[]; outcome: string; deferred: readonly string[]; graceCalls: number[]; seconds: number; carMovedM: number; positions: { carAtStart: number } } {
  const { physics, start } = scene;
  const sim = new Sim(physics);
  const events = new EventBus();
  const bindings = new Bindings(false);
  const input = new Input(document.createElement('div'), bindings);
  const player = new Player('player', { x: start.x, z: start.z }, stubMaterials, events);
  sim.entities.set('player', player); physics.addBody(player.body);
  player.onVaultStart = () => physics.removeBody(player.body.id);
  player.onVaultEnd = () => physics.addBody(player.body);
  events.on('enterVehicle', () => physics.removeBody(player.body.id));
  events.on('exitVehicle', () => physics.addBody(player.body));
  player.vehiclesNear = (p, r) => physics.queryCircle(p, r).map((b) => b.userData as IVehicle).filter((u) => !!u && !!u.spec && u.body.kind !== 'player');
  player.body.heading = -HALF_PI;
  // placed FROM where the player stands: a parked sedan 14 m ahead (to the west), nose toward the player; a pickup 25 m ahead
  const car: Vehicle = makeVehicle('sedan', start.x - 14, start.z, HALF_PI, events, 'parked1');
  sim.add(car);
  // a pickup is put 2.5 m from wherever the player stands when they get out of the car (the world has them on every block)
  let pickup: { x: number; z: number } = { x: start.x + 400, z: start.z + 400 };
  sim.run(0.5);

  const st = { panel: null as string | null, waypoint: false, yaw: 0, handsSig: 'a', homeDist: 400, viewSerial: 0 };
  const views = { get serial() { return st.viewSerial; } };
  const host: TutorialHost = {
    input, player, camera: { get yaw() { return st.yaw; }, views },
    vehicles: () => [car], pickups: () => [pickup], handsSig: () => st.handsSig,
    panelTop: () => st.panel, blocked: () => false, waypoint: () => st.waypoint, homeDist: () => st.homeDist,
    stars: () => 0, heat: () => 0, raining: () => false, prompt: () => '', mission: () => false,
  };
  const root = document.createElement('div'); document.body.appendChild(root);
  const graceCalls: number[] = [];
  const tut = new Tutorial({ host, root, police: { setGrace: (s) => graceCalls.push(s) }, events, loadedSave: false, splashUp: () => false, store: new TutorialStore(null), padSkipEdge: () => false });

  const keys = new Set<string>();
  const hold = (...ks: string[]): void => { for (const k of keys) if (!ks.includes(k)) { keys.delete(k); input.simulatePhysical(k, false); } for (const k of ks) if (!keys.has(k)) { keys.add(k); input.simulatePhysical(k, true); } };
  const tap = (k: string): void => { input.simulatePhysical(k, true); input.simulatePhysical(k, false); };
  const carStart = { x: car.body.pos.x, z: car.body.pos.z };
  let sinceStep = 0, lastId = '', t = 0, enterT = 0, panelT = 0;
  const maxT = 400;
  while (t < maxT && (tut.active || t < 0.5)) {
    const id = tut.engine.current?.id ?? '';
    if (id !== lastId) { lastId = id; sinceStep = 0; }
    sinceStep += DT; t += DT;
    if (tut.engine.completed.includes('out') && pickup.x > start.x + 100) {
      const p0 = player.body.pos;
      const free = (ox: number, oz: number): boolean => [1, 1.5, 2, 2.5].every((f) => !physics.overlapsSolid({ x: p0.x + ox * f / 2.5, z: p0.z + oz * f / 2.5 }, 0.4));
      const away = { x: p0.x - car.body.pos.x, z: p0.z - car.body.pos.z };   // out from the car they just left
      const dirs = ([[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]] as const).slice().sort((a, b) => (b[0] * away.x + b[1] * away.z) - (a[0] * away.x + a[1] * away.z));
      const [ox, oz] = dirs.find(([a, b]) => free(a, b)) ?? dirs[0];
      pickup = { x: p0.x + ox, z: p0.z + oz };
    }
    const cd = Math.hypot(car.body.pos.x - player.body.pos.x, car.body.pos.z - player.body.pos.z);
    // --- what the person on the keyboard does for the step on the card
    st.panel = null;
    const done = tut.engine.completed.includes(id);
    if (done) hold();                                  // the tick is showing: hands off
    else switch (id) {
      case 'look': st.yaw = Math.sin(sinceStep * 3) * 0.7; hold(); break;
      case 'walk': st.yaw = 0; hold('KeyA'); break;
      case 'run': hold('KeyA', 'ShiftLeft'); break;
      case 'jump': hold(); if (sinceStep > 0.3 && sinceStep < 0.35) tap('Space'); break;
      case 'vault': hold('KeyA'); if (cd < 3.6) tap('Space'); break;
      case 'car':
        enterT += DT;
        if (cd > 2.6) hold(player.body.pos.x > car.body.pos.x ? 'KeyA' : 'KeyD'); else hold();   // walk up to it, like a person
        if (cd <= 2.6 && enterT > 0.5 && !player.inVehicle) { enterT = 0; input.simulatePhysical('KeyF', true); input.simulatePhysical('KeyF', false); }
        break;
      case 'drive': hold('KeyW'); break;
      case 'brake': if (sinceStep < 2) hold('KeyW'); else if (sinceStep < 3.2) hold('KeyS'); else if (sinceStep < 4) hold('KeyW'); else hold('Space'); break;
      case 'camera': hold(); if (sinceStep < 0.6) input.simulatePhysical('KeyC', true); else { input.simulatePhysical('KeyC', false); if (sinceStep < 0.7) { tap('KeyV'); st.viewSerial++; } } break;
      case 'radio': hold(); if (sinceStep > 0.2 && sinceStep < 0.25) tap('Period'); if (sinceStep > 0.5 && sinceStep < 0.55) tap('Comma'); break;
      case 'out': hold(); if (sinceStep > 0.3 && sinceStep < 0.35) { tap('KeyF'); } break;
      case 'pickup': {
        const dx = pickup.x - player.body.pos.x, dz = pickup.z - player.body.pos.z;
        st.yaw = 0; hold(Math.abs(dx) > 0.6 ? (dx < 0 ? 'KeyA' : 'KeyD') : dz < 0 ? 'KeyW' : 'KeyS');   // yaw 0: A is west, D east
        if (Math.hypot(dx, dz) < 1) st.handsSig = 'b';
        break;
      }
      case 'action': hold(); if (sinceStep > 0.3 && sinceStep < 0.35) tap('KeyG'); if (sinceStep > 0.6 && sinceStep < 0.65) tap('Tab'); break;
      case 'phone': hold(); st.panel = sinceStep > 0.2 && sinceStep < 0.5 ? 'phone' : null; panelT = sinceStep; break;
      case 'map': hold(); if (sinceStep > 0.2 && sinceStep < 0.8) st.panel = 'map'; if (sinceStep > 0.5) st.waypoint = true; break;
      case 'pause': hold(); if (sinceStep > 0.2 && sinceStep < 0.5) st.panel = 'menu'; break;
      default: hold();
    }
    // main.ts: input.vehicleContext, player.control, F consumed into tryEnter or exit
    input.vehicleContext = player.inVehicle;
    player.control(input, st.yaw);
    if (input.consume('KeyF')) { if (player.inVehicle) player.exit(); else player.tryEnter([car]); }
    sim.step(DT);
    tut.update(DT);
    input.endFrame();
  }
  void panelT;
  (globalThis as { __dbg?: string }).__dbg = `cur=${tut.engine.current?.id} pos=${player.body.pos.x.toFixed(1)},${player.body.pos.z.toFixed(1)} pickup=${pickup.x.toFixed(1)},${pickup.z.toFixed(1)} inV=${player.inVehicle} near=${tut.ctx.nearPickup} hands=${tut.ctx.handsSig} keys=${[...keys]} vel=${player.body.vel.x.toFixed(2)} dist=${(player as unknown as {downT:number}).downT} entering=${player.isEntering} vaulting=${player.isVaulting} view=${(player as unknown as {exitVis:unknown}).exitVis}`;
  return { log: tut.log, completed: [...tut.engine.completed], outcome: tut.store.outcome, deferred: tut.store.deferred, graceCalls, seconds: t, carMovedM: Math.hypot(car.body.pos.x - carStart.x, car.body.pos.z - carStart.z), positions: { carAtStart: 0 } };
}

describe('the tutorial, scripted, with the real systems', () => {
  it('on the grid map: a scripted player completes every step, in the order of what is near, and the tutorial finishes', () => {
    const { physics } = gridPhysics();
    const start = clearStart(physics, { x: 9, z: 20 });
    const r = play({ physics, start });
    const missing = STEP_IDS.filter((id) => !r.completed.includes(id));
    expect(missing, r.log.join(' ') + ` t=${r.seconds.toFixed(1)} carMoved=${r.carMovedM.toFixed(1)} ${(globalThis as { __dbg?: string }).__dbg}`).toEqual([]);
    expect(r.outcome).toBe('done');
    expect(r.deferred).toEqual([]);
    expect(r.log[0]).toBe('start');
    expect(r.log[r.log.length - 1]).toMatch(/^finish:done/);
    expect(r.seconds).toBeLessThan(200);
    // the order: foot basics first, the car steps in sequence, the info steps last, home after everything else
    const order = r.log.filter((l) => l.startsWith('done:')).map((l) => l.slice(5));
    for (const [a, b] of [['look', 'car'], ['car', 'drive'], ['drive', 'brake'], ['brake', 'camera'], ['camera', 'radio'], ['radio', 'out'], ['out', 'action'], ['action', 'police'], ['police', 'phone'], ['phone', 'map'], ['map', 'pause']] as const) {
      expect(order.indexOf(a), `${a} before ${b}`).toBeLessThan(order.indexOf(b));
    }
    expect(order[order.length - 1]).toBe('home');
    expect(r.graceCalls.length).toBeGreaterThan(3);
    expect(r.graceCalls.every((g) => g > 0)).toBe(true);
  }, 300_000);

  it('on the real-street net: the same script completes every step from the real start spot', () => {
    const physics = new World2D(12);
    const r = play({ physics, start: playerSpot() });
    const missing = STEP_IDS.filter((id) => !r.completed.includes(id));
    expect(missing, r.log.join(' ') + ` t=${r.seconds.toFixed(1)} carMoved=${r.carMovedM.toFixed(1)} ${(globalThis as { __dbg?: string }).__dbg}`).toEqual([]);
    expect(r.outcome).toBe('done');
    expect(r.deferred).toEqual([]);
    expect(r.seconds).toBeLessThan(200);
  }, 300_000);
});
