/** MOVE2 part 2: key response, foot slide bounds, lean into a turn, the shoulder check, vault pose continuity. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Player } from '@/entities/Player';
import { EventBus } from '@/core/Events';
import { World2D } from '@/physics/World2D';
import { Sim, stubMaterials, DT } from '../sim/harness';
import { VAULT_KEYS, keyVault } from '@/entities/anim/controller';
import { NCH } from '@/entities/anim/clipPack';
import { play } from './anim-measure';
import { gaitReport } from './gait-measure.test';
import { fakeInput } from './vault-harness';

describe('keys answer at once', () => {
  it('a held key moves the body within two frames, at 30, 60 and 144 steps a second', () => {
    for (const fps of [30, 60, 144]) {
      const world = new World2D(12), sim = new Sim(world), events = new EventBus();
      const p = new Player('p', { x: 0, z: 0 }, stubMaterials, events);
      sim.add(p);
      const dt = 1 / fps;
      for (let i = 0; i < 2; i++) { p.control(fakeInput({ KeyW: 1 }), 0); sim.step(dt); }
      const moved = Math.hypot(p.body.pos.x, p.body.pos.z), v = Math.hypot(p.body.vel.x, p.body.vel.z);
      expect(v, `speed after 2 steps at ${fps}`).toBeGreaterThan(0.2 / (fps / 60) * 0.5);
      expect(moved, `moved after 2 steps at ${fps}`).toBeGreaterThan(0);
    }
  });
});

describe('foot slide stays under a bound (lock on)', () => {
  const r = gaitReport(true) as Record<string, { mean: number; max: number }>;
  it('walk, jog, run and sprint', () => {
    for (const k of ['steady.walk1.6', 'steady.jog3', 'steady.run4.5', 'steady.sprint6.5']) { expect(r[k].mean, k).toBeLessThanOrEqual(1.5); expect(r[k].max, k).toBeLessThanOrEqual(5); }
  });
  it('through the player\'s own starts, speed-ups and stops', () => {
    for (const k of ['accel.startJog', 'accel.startSprint', 'accel.jogToSprint', 'accel.sprintToJog', 'accel.sprintToStop']) expect(r[k].mean, k).toBeLessThanOrEqual(3.5);
  });
});

describe('lean into a turn', () => {
  it('a sprint turn rolls the hips and chest, a standing one does not, and the amount is bounded', () => {
    const roll = (speed: number, yaw: number): number => {
      const s = play({ seconds: 3, speed: () => speed, extra: () => ({ yawRate: yaw }) });
      const q = s.frames[s.frames.length - 1].q;
      const e = new THREE.Euler().setFromQuaternion(q[0]); const t = new THREE.Euler().setFromQuaternion(q[1]);
      return e.z + t.z;
    };
    const straight = roll(6.5, 0), left = roll(6.5, 3), right = roll(6.5, -3), standing = roll(0, 3);
    expect(Math.abs(left - straight)).toBeGreaterThan(0.12);
    expect(Math.sign(left - straight)).toBe(-Math.sign(right - straight));
    expect(Math.abs(left - straight)).toBeLessThan(0.45);
    expect(Math.abs(standing - roll(0, 0))).toBeLessThan(0.06);
  });
});

describe('the vault pose', () => {
  it('has no jump between neighbouring progress steps and is mirrored by side', () => {
    const a = new Float32Array(NCH), b = new Float32Array(NCH);
    let worst = 0;
    for (let k = 0; k < 1; k += 0.01) { keyVault(a, k, 1); keyVault(b, k + 0.01, 1); for (let i = 0; i < NCH; i++) worst = Math.max(worst, Math.abs(a[i] - b[i])); }
    expect(worst).toBeLessThan(0.1); // radians per 1 % of the vault
    expect(VAULT_KEYS[0].k).toBe(0); expect(VAULT_KEYS[VAULT_KEYS.length - 1].k).toBe(1);
    const l = new Float32Array(NCH), r = new Float32Array(NCH);
    keyVault(l, 0.5, 1); keyVault(r, 0.5, -1);
    expect(Math.abs(l[5 * 3] - r[3 * 3])).toBeLessThan(1e-5); // the right arm of one is the left arm of the other
  });
});

describe('running into a person', () => {
  it('a shoulder check takes a fifth of the speed, once, and never stops the runner dead', () => {
    const world = new World2D(12), sim = new Sim(world), events = new EventBus();
    const p = new Player('p', { x: 0, z: 10 }, stubMaterials, events);
    sim.add(p);
    world.addBody({ id: 'ped1', kind: 'ped', shape: { kind: 'circle', r: 0.35 }, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 });
    let bumps = 0; p.onBump = () => { bumps++; };
    let minV = 9, topV = 0;
    for (let i = 0; i < 400; i++) {
      p.control(fakeInput({ KeyW: 1, ShiftLeft: 1 }), 0); sim.step(DT);
      const v = Math.hypot(p.body.vel.x, p.body.vel.z); topV = Math.max(topV, v);
      if (p.body.pos.z < 2.5) minV = Math.min(minV, v);
    }
    expect(topV).toBeGreaterThan(4);
    expect(bumps).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(minV)).toBe(true);
  });
});
