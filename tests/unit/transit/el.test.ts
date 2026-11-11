/**
 * WBURG: timetable determinism, kinematics and station stops of the elevated line, car triangle budgets, sound falloff,
 * structure sections inside the culling range logic, and the rideable flow.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ACCEL, CAR_COUNT, CAR_LENGTH, DECEL, DWELL, EL_X_EAST, EL_X_WEST, EL_Z, PERIOD, STATIONS, TRAINS, V_CRUISE,
  carCentres, nextStop, schedule, trackZ, trainState,
} from '@/transit/ElLine';
import { buildCarGeometries } from '@/transit/TrainCar';
import { distanceGain, trainSoundParams } from '@/transit/TrainAudio';
import { TransitSystem, TRANSIT_RANGE } from '@/transit/TransitSystem';
import { SECTION_M } from '@/transit/ElStructure';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { IMaterialLibrary } from '@/world/types';

const lib = {
  get: () => new THREE.MeshBasicMaterial(), awning: () => new THREE.MeshBasicMaterial(), sign: () => new THREE.MeshBasicMaterial(),
  carPaint: () => new THREE.MeshBasicMaterial(), setNight: () => {},
} as unknown as IMaterialLibrary;

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;

describe('timetable', () => {
  it('is a pure function of the clock: same time, same state, and one period later the same again', () => {
    for (const spec of TRAINS) {
      for (let t = 0; t < PERIOD; t += 3.7) {
        const a = trainState(spec, t), b = trainState(spec, t), c = trainState(spec, t + PERIOD);
        expect(b).toEqual(a);
        expect(c.x).toBeCloseTo(a.x, 6);
        expect(c.phase).toBe(a.phase);
      }
    }
  });

  it('runs the stations in the real order (Myrtle Av, then Flushing Av) west-bound and the reverse east-bound', () => {
    const order = (dir: 1 | -1): string[] => schedule(dir).phases.filter((p) => p.kind === 'dwell').map((p) => STATIONS[p.station].id);
    expect(order(-1)).toEqual(['myrtle', 'flushing']);
    expect(order(1)).toEqual(['flushing', 'myrtle']);
    expect(nextStop(-1, 0)).toBe(1);
    expect(nextStop(-1, 1)).toBe(-1);
    expect(nextStop(1, 1)).toBe(0);
  });

  it('stops with the train centre on the platform centre, standing still for the dwell time, doors open in the middle of it', () => {
    for (const spec of TRAINS) {
      for (const ph of schedule(spec.dir).phases.filter((p) => p.kind === 'dwell')) {
        const mid = spec.offset + (ph.t0 + ph.t1) / 2;
        const st = trainState(spec, mid);
        expect(st.phase).toBe('dwell');
        expect(st.speed).toBe(0);
        expect(Math.abs(st.x - STATIONS[ph.station].x)).toBeLessThan(0.05);
        expect(st.doors).toBe(1);
        expect(ph.t1 - ph.t0).toBeCloseTo(DWELL, 9);
        // doors are shut while it is moving and at both ends of the dwell
        expect(trainState(spec, spec.offset + ph.t0 + 0.1).doors).toBe(0);
        expect(trainState(spec, spec.offset + ph.t1 - 0.1).doors).toBe(0);
      }
    }
  });

  it('keeps all four cars inside the platform when stopped, and the platform covers the train', () => {
    for (const spec of TRAINS) {
      const ph = schedule(spec.dir).phases.find((p) => p.kind === 'dwell')!;
      const st = trainState(spec, spec.offset + (ph.t0 + ph.t1) / 2);
      const xs = carCentres(st.x, st.dir);
      expect(xs).toHaveLength(CAR_COUNT);
      const station = STATIONS[ph.station];
      for (const x of xs) expect(Math.abs(x - station.x) + CAR_LENGTH / 2).toBeLessThanOrEqual(station.length / 2 + 0.01);
    }
  });

  it('accelerates and brakes at the table rates and never exceeds the cruise speed; position is continuous', () => {
    for (const spec of TRAINS) {
      let prev = trainState(spec, spec.offset);
      for (let t = 0.05; t < PERIOD; t += 0.05) {
        const st = trainState(spec, spec.offset + t);
        expect(st.speed).toBeLessThanOrEqual(V_CRUISE + 1e-9);
        if (st.active && prev.active) {
          expect(Math.abs(st.x - prev.x)).toBeLessThan(V_CRUISE * 0.05 + 1e-6);
          expect((st.x - prev.x) * st.dir).toBeGreaterThanOrEqual(-1e-9); // never backwards
          expect(Math.abs(st.speed - prev.speed)).toBeLessThanOrEqual(Math.max(ACCEL, DECEL) * 0.05 + 1e-6);
        }
        prev = st;
      }
    }
  });

  it('west-bound runs on the north track, east-bound on the south, both over Flushing Ave (z -500)', () => {
    expect(trackZ(-1)).toBeLessThan(EL_Z);
    expect(trackZ(1)).toBeGreaterThan(EL_Z);
    const data = loadBedstuyData();
    const flushing = data.streets.find((s) => s.id === 'flushing')!;
    expect(flushing.offset).toBe(EL_Z);
    expect(flushing.axis).toBe('ew');
  });

  it('the two trains are half a period apart and are off the map for part of each period', () => {
    expect(TRAINS[1].offset - TRAINS[0].offset).toBe(PERIOD / 2);
    const away = [...Array(240).keys()].filter((t) => !trainState(TRAINS[0], t).active).length;
    expect(away).toBeGreaterThan(10);
    expect(EL_X_WEST).toBeLessThan(-250);
    expect(EL_X_EAST).toBeGreaterThan(1000);
  });
});

describe('cars', () => {
  it('stay within the triangle budgets: <= 2500 per near car, <= 300 far', () => {
    const g = buildCarGeometries();
    const near = tris(g.body) + tris(g.glass) + tris(g.doorsA) + tris(g.doorsB) + tris(g.lampsFront) + tris(g.lampsRear);
    expect(near).toBeLessThanOrEqual(2500);
    expect(near).toBeGreaterThan(600);
    expect(tris(g.far)).toBeLessThanOrEqual(300);
  });
});

describe('sound', () => {
  it('falls with distance, is silent beyond range, and chimes on door open/close', () => {
    expect(distanceGain(5)).toBeGreaterThan(distanceGain(100));
    expect(distanceGain(100)).toBeGreaterThan(distanceGain(300));
    expect(distanceGain(400)).toBe(0);
    const spec = TRAINS[0];
    const ph = schedule(spec.dir).phases.find((p) => p.kind === 'dwell')!;
    const before = trainState(spec, spec.offset + ph.t0 + 0.5);
    const opening = trainState(spec, spec.offset + ph.t0 + 1.0);
    expect(trainSoundParams(opening, 30, before).chime).toBe(true);
    expect(trainSoundParams(opening, 30, opening).chime).toBe(false);
    const away = trainState(spec, spec.offset + 235);
    expect(trainSoundParams(away, 10).rumble).toBe(0);
    const cruising = trainState(spec, spec.offset + 5);
    expect(trainSoundParams(cruising, 20).rumble).toBeGreaterThan(trainSoundParams(cruising, 300).rumble);
    const braking = trainState(spec, spec.offset + schedule(spec.dir).phases.find((p) => p.kind === 'brake')!.t0 + 3);
    expect(trainSoundParams(braking, 20).squeal).toBeGreaterThan(0);
  });
});

describe('structure, culling and the ride', () => {
  const transit = new TransitSystem(lib);
  const cam = (x: number, z: number) => ({ x, y: 2, z });

  it('has sections that cover the viaduct, hidden beyond TRANSIT_RANGE of the camera and shown near it', () => {
    expect(transit.el.sections.length).toBe(Math.ceil((EL_X_EAST - EL_X_WEST) / SECTION_M));
    transit.update(0, cam(9, 20), false, true); // the old spawn, 520 m south of the line
    const near0 = transit.el.sections.filter((s) => s.mesh.visible).length;
    transit.update(0, cam(375, -480), false, true);
    const near1 = transit.el.sections.filter((s) => s.mesh.visible);
    expect(near1.length).toBeGreaterThan(near0);
    for (const s of near1) expect(Math.hypot(s.cx - 375, s.cz + 480) - s.r).toBeLessThan(TRANSIT_RANGE);
    expect(transit.el.sections.some((s) => !s.mesh.visible)).toBe(true);
    // far from the line everything is hidden (the old viewpoints draw no el triangles)
    transit.update(0, cam(-200, 300), false, true);
    expect(transit.el.sections.filter((s) => s.mesh.visible).length).toBeLessThan(near1.length);
  });

  it('puts the two columns of each bent on the curb lines of Flushing Ave and keeps them out of the cross streets', () => {
    const grid = buildGrid(loadBedstuyData());
    const cols = transit.colliders.filter((c) => c.id?.startsWith('el-col'));
    expect(cols.length).toBeGreaterThan(100);
    for (const c of cols) {
      expect(Math.abs(Math.abs(c.pos.z - EL_Z) - 8.4)).toBeLessThan(1e-9);
      expect(grid.isOnRoad({ x: c.pos.x, z: c.pos.z + Math.sign(c.pos.z - EL_Z) * 0.45 })).toBe(false); // on the sidewalk, not in a cross street
    }
  });

  it('boards a standing train with F at a stair foot, rides to the next stop and steps out there', () => {
    const t = new TransitSystem(lib);
    const spec = TRAINS[1]; // east-bound: Flushing Av (stop 0 of its run) then Myrtle Av
    const dwell = schedule(spec.dir).phases.find((p) => p.kind === 'dwell' && STATIONS[p.station].id === 'flushing')!;
    t.setTime(spec.offset + dwell.t0 + 10);
    const ent = t.el.entrances.find((e) => STATIONS[e.station].id === 'flushing')!;
    expect(t.tryBoard(0, 0)).toBe(false); // nowhere near a station: F falls through
    expect(t.tryBoard(ent.x, ent.z)).toBe(true);
    expect(t.ride).not.toBeNull();
    expect(t.ride!.to).toBe(STATIONS.findIndex((s) => s.id === 'myrtle'));
    expect(Math.abs(t.ride!.x - STATIONS[1].x)).toBeLessThan(20);
    // ride on: the standing point follows the train east, the camera is inside the car height band
    t.update(25, { x: 0, y: 2, z: 0 }, false);
    expect(t.ride).not.toBeNull();
    expect(t.ride!.x).toBeGreaterThan(STATIONS[1].x + 20);
    expect(t.ride!.cam.py).toBeGreaterThan(9.5);
    // arrive at Myrtle Av with the doors open: the ride ends and the player is put at that stair foot
    const arrive = schedule(spec.dir).phases.find((p) => p.kind === 'dwell' && STATIONS[p.station].id === 'myrtle')!;
    t.setTime(spec.offset + arrive.t0 + 10);
    expect(t.ride).toBeNull();
    const out = t.takeAlight()!;
    expect(Math.hypot(out.x - t.el.entrances.find((e) => STATIONS[e.station].id === 'myrtle')!.x, out.z - t.el.entrances.find((e) => STATIONS[e.station].id === 'myrtle')!.z)).toBeLessThan(0.01);
  });

  it('says when the next train comes if none is standing, and refuses to board a train with no stop ahead', () => {
    const t = new TransitSystem(lib);
    t.setTime(3);
    const ent = t.el.entrances[0];
    expect(t.tryBoard(ent.x, ent.z)).toBe(true);
    expect(t.takeMessage()).toMatch(/next train|stand clear/i);
  });
});

describe('published data', () => {
  it('bedstuy.json carries transit.stations that match the timetable stations', async () => {
    const { default: json } = await import('@/world/data/bedstuy.json');
    const st = (json as unknown as { transit: { stations: Array<{ id: string; x: number; z: number }> } }).transit.stations;
    expect(st.length).toBeGreaterThanOrEqual(2);
    for (const s of STATIONS) expect(st.find((q) => q.id === s.id)).toMatchObject({ x: s.x, z: EL_Z });
  });
});
