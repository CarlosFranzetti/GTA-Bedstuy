// @vitest-environment jsdom
/**
 * Getting into a parked car through the real Input (F key events), the way main.ts does it: the player stands beside it and
 * must be seated within 1.5 s, also with another car (a double-parked van) right beside, and when the way to the driver door
 * is blocked. He must never stand frozen: the nearest car that can be entered is entered.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Input } from '@/core/Input';
import { Player } from '@/entities/Player';
import type { VehicleType } from '@/world/types';
import { DT, Sim, makeVehicle, stubMaterials } from './harness';

const press = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code })); };
const release = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keyup', { code })); };

interface Setup { sim: Sim; player: Player; cab: ReturnType<typeof makeVehicle>; others: ReturnType<typeof makeVehicle>[]; input: Input }

/** A cab heading `h`, the player `dist` m to its left (heading-relative, as the in-game check did), extra cars at `others` (offset along the car's left axis, along its forward axis). */
function setup(h: number, dist: number, others: Array<{ type: VehicleType; left: number; fwd: number }> = [], playerLeft = dist): Setup {
  const sim = new Sim(); const events = new EventBus();
  const cab = makeVehicle('sedan', 40, -25, h, events, 'cab'); sim.add(cab);
  const f = { x: Math.sin(h), z: -Math.cos(h) }, l = { x: -Math.cos(h), z: -Math.sin(h) };
  const others2 = others.map((o, i) => {
    const v = makeVehicle(o.type, cab.body.pos.x + l.x * o.left + f.x * o.fwd, cab.body.pos.z + l.z * o.left + f.z * o.fwd, h, events, `o${i}`); sim.add(v); return v;
  });
  const player = new Player('player', { x: cab.body.pos.x + l.x * playerLeft, z: cab.body.pos.z + l.z * playerLeft }, stubMaterials, events);
  sim.add(player);
  events.on('enterVehicle', () => sim.world.removeBody(player.body.id));
  const input = new Input(document.body);
  return { sim, player, cab, others: others2, input };
}

/** Frames like main.ts: steps, then F is consumed (tryEnter on the edge), then the frame's edges are cleared. */
function runFrames(s: Setup, frames: number, fDown: [number, number]): number {
  const all = [s.cab, ...s.others];
  for (let i = 0; i < frames; i++) {
    if (i === fDown[0]) press('KeyF');
    if (i === fDown[1]) release('KeyF');
    if (s.input.consume('KeyF')) { if (!s.player.inVehicle) s.player.tryEnter(all); }
    s.sim.step(DT);
    s.input.endFrame();
    if (s.player.inVehicle) return (i + 1) * DT;
  }
  return Infinity;
}

describe('getting into a parked car with the F key', () => {
  for (const h of [0, 0.7, Math.PI / 2, 2.4, Math.PI, -1.2]) {
    it(`alone, heading ${h.toFixed(1)}: seated within 1.5 s`, () => {
      const s = setup(h, 1.8);
      for (let i = 0; i < 10; i++) s.sim.step(DT);
      const t = runFrames(s, 150, [0, 2]);
      expect(t).toBeLessThan(1.5);
      expect(s.cab.driver).toBe('player');
    });
    it(`another car stands beside it on the far side (double-parked van), heading ${h.toFixed(1)}: seated within 1.5 s`, () => {
      const s = setup(h, 1.8, [{ type: 'cargovan' as VehicleType, left: 3.9, fwd: 0 }]);
      for (let i = 0; i < 10; i++) s.sim.step(DT);
      const t = runFrames(s, 150, [0, 2]);
      expect(t).toBeLessThan(1.5);
      expect(s.player.vehicle === s.cab || s.player.vehicle === s.others[0]).toBe(true);
    });
  }
  it('van tight against the player and the cab on both sides: not frozen', () => {
    const s = setup(0, 1.8, [{ type: 'cargovan' as VehicleType, left: 3.3, fwd: 0 }, { type: 'sedan' as VehicleType, left: -2.2, fwd: 0 }]);
    for (let i = 0; i < 10; i++) s.sim.step(DT);
    expect(runFrames(s, 150, [0, 2])).toBeLessThan(1.5);
  });
  it('the way to the driver door is blocked (player on the passenger side, a parked car behind the door side): still seated', () => {
    const s = setup(0.3, 1.8, [{ type: 'cargovan' as VehicleType, left: 2.6, fwd: 0 }, { type: 'sedan' as VehicleType, left: 2.6, fwd: 5.5 }], -1.8);
    for (let i = 0; i < 10; i++) s.sim.step(DT);
    expect(runFrames(s, 150, [0, 2])).toBeLessThan(1.5);
  });
});

describe('sweep of a neighbour car beside the cab', () => {
  it('every placement of a van or a second cab near the player ends with the player seated within 1.5 s', () => {
    const bad: string[] = [];
    for (const type of ['cargovan', 'cab', 'boxtruck'] as VehicleType[]) {
      for (const left of [-3.4, -2.6, 2.2, 2.6, 3.0, 3.4, 3.9, 4.6]) {
        for (const fwd of [-4, -2, 0, 2, 4]) {
          for (const h of [0, 1]) {
            const s = setup(h, 1.8, [{ type, left, fwd }]);
            for (let i = 0; i < 10; i++) s.sim.step(DT);
            const t = runFrames(s, 150, [0, 2]);
            if (!(t < 1.5)) bad.push(`${type} left ${left} fwd ${fwd} h ${h}: ${t}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('a car that cannot be entered does not shadow the one beside it', () => {
  it('the nearest car (reached by its body box, far door) is refused as jammed: the next car is taken, the player does not stand frozen', () => {
    const sim = new Sim(); const events = new EventBus();
    // two cars in a row ahead of and behind the player, who stands beside their ends: both doors are over 3 m away, both bodies within reach
    const a = makeVehicle('sedan', 1.9, -4.4, 0, events, 'A'), b = makeVehicle('sedan', 1.9, 5.0, 0, events, 'B');
    sim.add(a); sim.add(b);
    const player = new Player('p', { x: 0, z: 0 }, stubMaterials, events); sim.add(player);
    events.on('enterVehicle', () => sim.world.removeBody(player.body.id));
    const far = (v: typeof a) => Math.hypot(v.doorPos().x, v.doorPos().z);
    expect(far(a)).toBeGreaterThan(3); expect(far(b)).toBeGreaterThan(3);
    player.blockedAt = (_p, _r, ignore) => ignore === 'A' || ignore === 'p'; // A is jammed in; B is not
    const s: Setup = { sim, player, cab: a, others: [b], input: new Input(document.body) };
    expect(runFrames(s, 150, [0, 2])).toBeLessThan(1.5);
    expect(player.vehicle).toBe(b);
  });
  it('a car whose door is in range is preferred over one reached only by its body box', () => {
    const s = setup(0, 1.8, [{ type: 'cargovan' as VehicleType, left: 2.6, fwd: 2.5 }]);
    for (let i = 0; i < 10; i++) s.sim.step(DT);
    expect(runFrames(s, 150, [0, 2])).toBeLessThan(1.5);
    expect(s.player.vehicle).toBe(s.cab);
  });
});
