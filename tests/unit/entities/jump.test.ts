import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player } from '@/entities/Player';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import { World2D, isLowCollider, LOW_CLEAR_HEIGHT } from '@/physics/World2D';
import { JumpState, JUMP_TAKEOFF, JUMP_LAND, JUMP_COOLDOWN, JUMP_GRAVITY, JUMP_VY_STAND, JUMP_VY_RUN, AIR_CONTROL } from '@/entities/Jump';
import type { Input } from '@/core/Input';
import type { IMaterialLibrary } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const mats: IMaterialLibrary = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} };
const DT = 1 / 60;

function input(down: string[] = [], space = false): Input {
  const d = new Set(down); let sp = space;
  return {
    isDown: (c: string) => d.has(c), pressed: () => false,
    consume: (c: string) => { if (c === 'Space' && sp) { sp = false; return true; } return false; },
    axis: (neg: string[], pos: string[]) => (pos.some((c) => d.has(c)) ? 1 : 0) - (neg.some((c) => d.has(c)) ? 1 : 0),
    mouseDX: 0, mouseDY: 0, wheel: 0,
  } as unknown as Input;
}
const mk = () => new Player('player', { x: 0, z: 0 }, mats, new EventBus());

describe('JumpState arc', () => {
  it('standing jump: crouch, launch after JUMP_TAKEOFF, apex and airtime follow gravity, then land and recover', () => {
    const j = new JumpState();
    expect(j.tryJump(true, 0)).toBe(true);
    expect(j.phase).toBe('takeoff');
    let t = 0, apex = 0, airStart = -1, landAt = -1;
    while (t < 2 && landAt < 0) {
      j.update(DT); t += DT;
      if (j.phase === 'air' && airStart < 0) airStart = t;
      apex = Math.max(apex, j.y);
      if (j.phase === 'land') landAt = t;
    }
    expect(airStart).toBeCloseTo(JUMP_TAKEOFF, 1);
    expect(apex).toBeCloseTo(JumpState.apex(JUMP_VY_STAND), 1);
    expect(landAt - airStart).toBeCloseTo(JumpState.airtime(JUMP_VY_STAND), 1);
    expect(j.y).toBe(0);
    expect(j.takeLanded()).toBeGreaterThan(0);
    expect(j.takeLanded()).toBe(-1);
    for (let i = 0; i < JUMP_LAND / DT + 2; i++) j.update(DT);
    expect(j.phase).toBe('ground');
  });

  it('a running jump is higher and the carried run speed makes it travel further', () => {
    expect(JumpState.apex(JUMP_VY_RUN)).toBeGreaterThan(JumpState.apex(JUMP_VY_STAND));
    const a = new JumpState(), b = new JumpState();
    a.tryJump(true, 0); b.tryJump(true, 6.5);
    let ta = 0, tb = 0;
    for (let i = 0; i < 200; i++) { a.update(DT); b.update(DT); if (a.phase === 'air' || a.phase === 'takeoff') ta += DT; if (b.phase === 'air' || b.phase === 'takeoff') tb += DT; }
    expect(tb).toBeGreaterThan(ta);
    expect(6.5 * tb).toBeGreaterThan(3 * ta); // metres covered at run speed vs a standing hop at walk speed
  });

  it('cooldown: no second jump during air, landing recovery or the short cooldown after', () => {
    const j = new JumpState();
    j.tryJump(true, 0);
    for (let i = 0; i < 12; i++) j.update(DT);
    expect(j.tryJump(true, 0)).toBe(false); // airborne
    while (j.phase !== 'land') j.update(DT);
    expect(j.tryJump(true, 0)).toBe(false); // recovering
    while (j.phase === 'land') j.update(DT);
    expect(j.tryJump(true, 0)).toBe(false); // cooldown
    for (let i = 0; i < JUMP_COOLDOWN / DT + 2; i++) j.update(DT);
    expect(j.tryJump(true, 0)).toBe(true);
    expect(j.tryJump(false, 0)).toBe(false);
  });

  it('air control is limited and shadow shrinks with height', () => {
    const j = new JumpState();
    expect(j.accelScale).toBe(1);
    j.tryJump(true, 0); while (j.phase !== 'air') j.update(DT);
    expect(j.accelScale).toBe(AIR_CONTROL);
    for (let i = 0; i < 12; i++) j.update(DT);
    expect(j.shadowScale).toBeLessThan(1);
    expect(JUMP_GRAVITY).toBeGreaterThan(0);
  });
});

describe('Player jump', () => {
  it('Space on foot jumps; in a vehicle it does not (and stays the brake)', () => {
    const p = mk();
    p.control(input([], true), 0);
    p.update(DT);
    expect(p.jump.busy).toBe(true);
    const events = new EventBus();
    const q = new Player('p2', { x: 0, z: 0 }, mats, events);
    const car = new Vehicle('c', VEHICLE_SPECS.sedan, { x: 1.5, z: 0 }, 0, mats, events);
    q.tryEnter([car]);
    for (let i = 0; i < 60; i++) q.update(DT); // glide to the door and sit
    expect(q.inVehicle).toBe(true);
    const inp = input(['Space'], true);
    q.control(inp, 0);
    expect(q.jump.busy).toBe(false);
    expect(q.lastVehicleInput.brake).toBe(true);
  });

  it('cannot jump while entering a car, with jumpLocked (menu / interior), and the press is swallowed', () => {
    const p = mk();
    p.jumpLocked = true;
    p.control(input([], true), 0); p.update(DT);
    expect(p.jump.busy).toBe(false);
    p.jumpLocked = false;
    const car = new Vehicle('c', VEHICLE_SPECS.sedan, { x: 1.5, z: 0 }, 0, mats, new EventBus());
    p.tryEnter([car]);
    expect(p.isEntering).toBe(true);
    p.control(input([], true), 0); p.update(DT);
    expect(p.jump.busy).toBe(false);
  });

  it('take-off and landing callbacks fire once each; the body height tracks the arc', () => {
    const p = mk(); let jumps = 0; const lands: number[] = [];
    p.onJump = () => { jumps++; }; p.onLand = (s) => lands.push(s);
    p.control(input([], true), 0);
    let max = 0;
    for (let i = 0; i < 120; i++) { p.update(DT); max = Math.max(max, p.body.height ?? 0); }
    expect(jumps).toBe(1); expect(lands.length).toBe(1);
    expect(max).toBeGreaterThan(LOW_CLEAR_HEIGHT);
    expect(p.body.height).toBe(0);
  });

  it('landing inside a solid pushes the player to the nearest free spot', () => {
    const p = mk();
    const solid = (q: { x: number; z: number }, r: number) => Math.hypot(q.x - 0.2, q.z) < 0.9 + r; // a fat blocker around (0.2, 0)
    p.blockedAt = (q, r) => solid(q, r);
    p.control(input([], true), 0);
    for (let i = 0; i < 80; i++) p.update(DT);
    for (let i = 0; i < 120; i++) p.update(DT); // glide out
    expect(solid(p.body.pos, 0.4)).toBe(false);
  });
});

describe('vaulting low colliders', () => {
  it('tags: hydrants, planters, bollards, low fences are low; buildings and trees are not', () => {
    for (const id of ['hydrant-3', 'planter-1', 'bollard-9', 'lot12-fence', 'low-wall']) expect(isLowCollider(id)).toBe(true);
    for (const id of ['lot12', 'tree-4', 'soft-bin-1', 'signal:1:0:0']) expect(isLowCollider(id)).toBe(false);
  });

  const walk = (id: string, height: number): number => {
    const w = new World2D(12);
    w.addStatic({ kind: 'circle', r: 0.5 }, { x: 2, z: 0 }, id);
    const b = { id: 'pl', kind: 'player' as const, shape: { kind: 'circle' as const, r: 0.4 }, pos: { x: 0, z: 0 }, vel: { x: 4, z: 0 }, heading: 0, mass: 80, height };
    w.addBody(b);
    for (let i = 0; i < 120; i++) { b.pos.x += b.vel.x * DT; w.step(DT); }
    return b.pos.x;
  };
  it('an airborne player passes a hydrant, a grounded one stops, and nothing tall is passable', () => {
    expect(walk('hydrant-1', 0.6)).toBeGreaterThan(4);
    expect(walk('hydrant-1', 0)).toBeLessThan(2);
    expect(walk('hydrant-1', 0.2)).toBeLessThan(2);  // too low in the arc
    expect(walk('lot7', 0.8)).toBeLessThan(2);       // a building footprint
  });
});
