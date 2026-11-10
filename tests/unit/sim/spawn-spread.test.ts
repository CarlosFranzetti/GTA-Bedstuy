import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficSystem } from '@/game/TrafficSystem';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import type { IVehicle, VehicleType } from '@/world/types';
import { DT, proxyMaterials, realPhysics, stubMaterials } from './harness';

describe('traffic spawn spreading', () => {
  it('never spawns more than one moving car in a single step, even for the first (warm) budget of 20', () => {
    const { physics, world } = realPhysics();
    const events = new EventBus();
    let seq = 0;
    const make = (type: VehicleType, pos: { x: number; z: number }, heading: number, color: string): IVehicle =>
      new Vehicle(`s${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
    const traffic = new TrafficSystem(world.grid, physics, events, new Rng(3), new THREE.Scene(), proxyMaterials(), make, undefined, undefined, world.lots);
    let prev = traffic.agentCount, worst = 0;
    for (let i = 0; i < 240; i++) {
      traffic.update(DT, { x: 0, z: 50 });
      const now = traffic.agentCount;
      worst = Math.max(worst, now - prev);
      prev = now;
    }
    expect(prev).toBeGreaterThan(5); // traffic did appear
    expect(worst).toBeLessThanOrEqual(1);
  }, 60_000);
});
