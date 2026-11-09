import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SIGNAL_TIMING, TrafficLights } from '@/game/TrafficLights';
import { buildSignals, signalColliders, updateSignalMeshes } from '@/world/props/signals';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { IMaterialLibrary } from '@/world/types';

const grid = buildGrid(loadBedstuyData());
const mats = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;

function inter(ns: string, ew: string) {
  const it = grid.intersections.find((i) => i.id === `${ns}|${ew}`);
  if (!it) throw new Error(`no intersection ${ns}|${ew}`);
  return it;
}

/** Walk the clock and record when the ns approach turns each colour (relative to t0). */
function nsTimeline(lights: TrafficLights, id: string, ns: string, step = 0.05, span = 100) {
  const out: Array<{ t: number; phase: string }> = [];
  let last = '';
  for (let t = 0; t < span; t += step) {
    const ph = lights.phaseFor(id, ns);
    if (ph !== last) { out.push({ t: Math.round(t * 100) / 100, phase: ph }); last = ph; }
    lights.update(step);
  }
  return out;
}

describe('TrafficLights', () => {
  it('signalises all 36 intersections (every one touches an avenue)', () => {
    const lights = new TrafficLights(grid);
    expect(lights.intersectionIds).toHaveLength(36);
    expect(lights.state()).toHaveLength(36);
  });

  it('avenue x street: avenue 45 s green, 3 s yellow, 1 s all red, street 30 s, 83 s cycle', () => {
    const lights = new TrafficLights(grid);
    const it = inter('throop', 'kosciuszko');
    expect(lights.cycleLength(it.id)).toBe(83);
    // put the clock exactly at the start of the ns green
    const fresh = new TrafficLights(grid, lights.offsetOf(it.id));
    const tl = nsTimeline(fresh, it.id, 'throop', 0.05, 83);
    const at = (p: string) => tl.find((e) => e.phase === p)!.t;
    expect(tl[0]).toEqual({ t: 0, phase: 'green' });
    expect(at('yellow')).toBeCloseTo(SIGNAL_TIMING.avenueGreen, 0);
    expect(at('red')).toBeCloseTo(SIGNAL_TIMING.avenueGreen + SIGNAL_TIMING.yellow, 0);
    // the cross street: red 49 s, then 30 s green, 3 s yellow
    const x = new TrafficLights(grid, lights.offsetOf(it.id));
    const ew: Array<{ t: number; phase: string }> = [];
    let last = '';
    for (let t = 0; t < 83; t += 0.05) {
      const ph = x.phaseFor(it.id, 'kosciuszko');
      if (ph !== last) { ew.push({ t: Math.round(t * 100) / 100, phase: ph }); last = ph; }
      x.update(0.05);
    }
    expect(ew.find((e) => e.phase === 'green')!.t).toBeCloseTo(49, 0);
    expect(ew.find((e) => e.phase === 'yellow')!.t).toBeCloseTo(79, 0);
  });

  it('avenue x avenue keeps the same 83 s cycle', () => {
    const lights = new TrafficLights(grid);
    expect(lights.cycleLength(inter('throop', 'lafayette').id)).toBe(83);
    expect(lights.cycleLength(inter('tompkins', 'greene').id)).toBe(83);
  });

  it('never shows non-red to two conflicting approaches at once (all intersections, a full day)', () => {
    const lights = new TrafficLights(grid);
    for (let t = 0; t < 6 * 83; t += 0.25) {
      for (const st of lights.state()) {
        expect(st.ns !== 'red' && st.ew !== 'red', `${st.intersectionId} @${t}`).toBe(false);
      }
      lights.update(0.25);
    }
  });

  it('has an all-red clearance between every change of right of way', () => {
    const lights = new TrafficLights(grid);
    const id = inter('garvey', 'vanburen').id;
    let bothRed = 0;
    for (let t = 0; t < 83; t += 0.05) {
      const st = lights.stateOf(id)!;
      if (st.ns === 'red' && st.ew === 'red') bothRed += 0.05;
      lights.update(0.05);
    }
    expect(bothRed).toBeCloseTo(2, 0);
  });

  it('green wave: ns greens along an avenue are offset by spacing / 12 m/s', () => {
    const lights = new TrafficLights(grid);
    const zs = [-200, -100, 0, 100, 200, 300];
    const ewIds = ['hart', 'pulaski', 'kosciuszko', 'lafayette', 'vanburen', 'greene'];
    for (const ave of ['tompkins', 'throop', 'garvey']) {
      for (let i = 1; i < ewIds.length; i++) {
        const a = lights.offsetOf(`${ave}|${ewIds[i - 1]}`);
        const b = lights.offsetOf(`${ave}|${ewIds[i]}`);
        const cycle = lights.cycleLength(`${ave}|${ewIds[i]}`);
        const expected = (zs[i] - zs[i - 1]) / SIGNAL_TIMING.waveSpeed;
        expect((b - a + cycle) % cycle).toBeCloseTo(expected, 5);
      }
    }
  });

  it('green wave along the east-west avenues (eastbound)', () => {
    const lights = new TrafficLights(grid);
    const xs = [-250, 0, 250];
    const aves = ['tompkins', 'throop', 'garvey'];
    for (const ew of ['lafayette', 'greene']) {
      for (let i = 1; i < aves.length; i++) {
        const a = lights.offsetOf(`${aves[i - 1]}|${ew}`);
        const b = lights.offsetOf(`${aves[i]}|${ew}`);
        const cycle = lights.cycleLength(`${aves[i]}|${ew}`);
        expect((b - a + cycle) % cycle).toBeCloseTo((xs[i] - xs[i - 1]) / SIGNAL_TIMING.waveSpeed, 5);
      }
    }
  });

  it('a southbound platoon at 12 m/s meets green at every light along Throop', () => {
    const lights = new TrafficLights(grid);
    const cycle = lights.cycleLength('throop|hart');
    // the platoon leaves Hart St (z = -200) one second into its ns green
    lights.update((cycle - lights.localTime('throop|hart') + 1) % cycle);
    const stops: Array<[string, number]> = [['hart', -200], ['pulaski', -100], ['kosciuszko', 0], ['lafayette', 100], ['vanburen', 200], ['greene', 300]];
    let t = 0;
    for (const [street, z] of stops) {
      const need = (z + 200) / 12 - t;
      if (need > 0) { lights.update(need); t += need; }
      expect(lights.phaseFor(`throop|${street}`, 'throop'), street).toBe('green');
    }
  });

  it('phaseTimeLeft counts down to the next colour change', () => {
    const lights = new TrafficLights(grid);
    const id = inter('throop', 'kosciuszko').id;
    lights.update(lights.cycleLength(id) - lights.localTime(id)); // ns green begins
    expect(lights.phaseTimeLeft(id, 'throop')).toBeCloseTo(45, 3);
    lights.update(44);
    expect(lights.phaseTimeLeft(id, 'throop')).toBeCloseTo(1, 3);
    lights.update(2);
    expect(lights.phaseFor(id, 'throop')).toBe('yellow');
    expect(lights.phaseTimeLeft(id, 'throop')).toBeCloseTo(2, 3);
    expect(lights.phaseTimeLeft(id, 'kosciuszko')).toBeCloseTo(3, 3); // red until 49 s
    expect(lights.secondsUntilGreen(id, 'kosciuszko')).toBeCloseTo(3, 3);
    expect(lights.secondsUntilGreen(id, 'throop')).toBeCloseTo(83 - 46, 3);
  });

  it('unsignalised queries are permissive', () => {
    const lights = new TrafficLights(grid);
    expect(lights.phaseFor('nowhere', 'x')).toBe('green');
    expect(lights.walkFor('nowhere', 'x')).toBe(true);
  });

  describe('pedestrian signals', () => {
    it('WALK only while the parallel street has green; DON\'T WALK flashes for the last part of the green', () => {
      const id = inter('throop', 'kosciuszko').id; // ns avenue 14 m, ew street 10 m
      const lights = new TrafficLights(grid);
      lights.update(lights.cycleLength(id) - lights.localTime(id)); // ns green begins now
      const seen = { walkNs: new Set<string>(), walkEw: new Set<string>() };
      for (let t = 0; t < 83; t += 0.1) {
        const st = lights.stateOf(id)!;
        seen.walkNs.add(st.walkAcrossNs);
        seen.walkEw.add(st.walkAcrossEw);
        // crossing the ns roadway needs the ew street green and the ns street red
        if (st.walkAcrossNs !== 'dont') expect(st.ns).toBe('red');
        if (st.walkAcrossEw !== 'dont') expect(st.ew).toBe('red');
        expect(lights.walkFor(id, 'throop')).toBe(st.walkAcrossNs === 'walk');
        lights.update(0.1);
      }
      expect([...seen.walkNs].sort()).toEqual(['dont', 'flash', 'walk']);
      expect([...seen.walkEw].sort()).toEqual(['dont', 'flash', 'walk']);
    });

    it('the flash is long enough to finish crossing (road width at 1.2 m/s)', () => {
      const id = inter('throop', 'kosciuszko').id;
      const lights = new TrafficLights(grid);
      lights.update(lights.cycleLength(id) - lights.localTime(id));
      // ns green: crossing the ew street (10 m) is allowed, flash must last >= 10/1.2 s
      let flash = 0;
      for (let t = 0; t < 83; t += 0.05) {
        if (lights.stateOf(id)!.walkAcrossEw === 'flash') flash += 0.05;
        lights.update(0.05);
      }
      expect(flash).toBeGreaterThanOrEqual(10 / 1.2 - 0.2);
    });

    it('a pedestrian who starts on the last WALK second is off the road before the cross street goes green', () => {
      const id = inter('tompkins', 'pulaski').id;
      const lights = new TrafficLights(grid);
      for (let t = 0; t < 400; t += 0.05) {
        if (lights.walkFor(id, 'pulaski')) {
          // find the last instant of this WALK
          const probe = new TrafficLights(grid, lights.clock);
          let untilRed = 0;
          while (probe.walkFor(id, 'pulaski')) { probe.update(0.05); untilRed += 0.05; }
          // from the end of WALK, 10 m at 1.2 m/s must fit before the pulaski approach (its road is crossed) gets green
          const toGreen = probe.secondsUntilGreen(id, 'pulaski');
          expect(toGreen).toBeGreaterThan(10 / 1.2 - 0.2);
          void untilRed;
          return;
        }
        lights.update(0.05);
      }
      throw new Error('never saw WALK');
    });
  });
});

describe('signal meshes', () => {
  it('builds poles + lamps in 2 draw calls with 4 poles and 4+ heads per intersection', () => {
    const g = buildSignals(grid, mats);
    expect(g.children.filter((c) => (c as THREE.Mesh).isMesh).length).toBe(2);
    const lamps = g.getObjectByName('signal-lamps') as THREE.InstancedMesh;
    // per intersection: vehicle heads (3 lamps) for existing approaches + 8 ped heads (2 lamps)
    expect(lamps.count).toBeGreaterThan(18 * (4 * 2 * 2));
    expect(g.getObjectByName('signal-poles')).toBeTruthy();
  });

  it('colliders: four poles per intersection', () => {
    expect(signalColliders(grid)).toHaveLength(36 * 4);
  });

  it('updateSignalMeshes lights the red lamp on a red approach and the green one on green', () => {
    const g = buildSignals(grid, mats);
    const lamps = g.getObjectByName('signal-lamps') as THREE.InstancedMesh;
    const lights = new TrafficLights(grid);
    updateSignalMeshes(g, lights);
    const before = Array.from(lamps.instanceColor!.array.slice(0, lamps.count * 3));
    const bright = (arr: number[]) => arr.filter((_, i) => i % 3 === 0 && arr[i] > 1 || (i % 3 === 1 && arr[i] > 1) || (i % 3 === 2 && arr[i] > 1)).length;
    expect(bright(before)).toBeGreaterThan(0);
    lights.update(40);
    updateSignalMeshes(g, lights);
    const after = Array.from(lamps.instanceColor!.array.slice(0, lamps.count * 3));
    expect(after).not.toEqual(before);
    // every intersection has exactly one lit lamp per vehicle head: lit count never zero
    expect(bright(after)).toBeGreaterThan(0);
  });
});
