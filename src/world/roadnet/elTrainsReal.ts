/**
 * WP10: the trains of the real el. Real-path only. Four trains: J/Z and M, each one train per direction half a period apart
 * (the ElLine layout), riding the arc-length timetable of elReal.ts. Car meshes, doors, lamps and night glow are the
 * default-path TrainCar ones; each car takes the position and yaw of its own arc length, so the cars follow the 60 m bends.
 * No boarding yet (the real stations have no stair entrances): trains run and can be seen and heard from the street.
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import { CAR_COUNT, RAIL_Y, TRACK_OFFSET } from '@/transit/ElLine';
import { buildCarGeometries, makeCar, makeCarMaterials, type CarGeometries, type CarMaterials, type TrainCar } from '@/transit/TrainCar';
import { carArcLengths, pointOnPath, trainStateReal, type ElPath, type ElStationReal, type ElTrainStateReal } from './elReal';

/** beyond this distance from the camera a car switches to its far LOD (m), as TransitSystem */
export const REAL_CAR_FAR_DIST = 140;
/** trains are hidden beyond this distance (m, grows with camera height) */
export const REAL_TRAIN_RANGE = 520;

interface Rt { path: ElPath; stations: ElStationReal[]; dir: 1 | -1; offsetFrac: number; cars: TrainCar[]; state: ElTrainStateReal; id: string }

export class RealTrains {
  readonly group = new THREE.Group();
  readonly trains: Rt[] = [];
  /** simulated clock (s) */
  time = 0;
  private readonly geo: CarGeometries;
  private readonly mats: CarMaterials;

  constructor(paths: readonly ElPath[], stations: readonly ElStationReal[]) {
    this.group.name = 'trains-real';
    this.geo = buildCarGeometries();
    this.mats = makeCarMaterials();
    for (const path of paths) {
      const sts = stations.filter((s) => s.path === path.id);
      for (const [dir, offsetFrac] of [[-1, 0], [1, 0.5]] as const) {
        const cars: TrainCar[] = [];
        for (let i = 0; i < CAR_COUNT; i++) { const c = makeCar(this.geo, this.mats); cars.push(c); this.group.add(c.group); }
        cars[0].lampsFront.visible = true;
        cars[CAR_COUNT - 1].lampsRear.visible = true;
        this.trains.push({ path, stations: sts, dir, offsetFrac, cars, state: trainStateReal(path, sts, dir, offsetFrac, 0), id: `${path.id}${dir === 1 ? '+' : '-'}` });
      }
    }
  }

  update(dt: number, cam: Vec2 & { y?: number }, night: boolean): void {
    this.time += dt;
    const range = REAL_TRAIN_RANGE + Math.max(0, (cam.y ?? 0) - 3) * 25;
    this.mats.glass.emissiveIntensity = night ? 1.1 : 0.12;
    this.mats.lampFront.emissiveIntensity = night ? 3.2 : 0.5;
    this.mats.lampRear.emissiveIntensity = night ? 2.4 : 0.4;
    for (const t of this.trains) {
      const st = trainStateReal(t.path, t.stations, t.dir, t.offsetFrac, this.time);
      t.state = st;
      const mid = pointOnPath(t.path, Math.max(0, Math.min(t.path.length, st.s))).p;
      const show = st.active && Math.hypot(mid.x - cam.x, mid.z - cam.z) < range + 60;
      const ss = carArcLengths(st.s, st.dir);
      for (let i = 0; i < t.cars.length; i++) {
        const c = t.cars[i];
        c.group.visible = show;
        if (!show) continue;
        const q = pointOnPath(t.path, ss[i]);
        // the car's own tangent; lateral offset to its side of the double track (path normal n = (-dz, dx))
        const lat = TRACK_OFFSET * t.dir;
        c.group.position.set(q.p.x - q.dir.z * lat, RAIL_Y, q.p.z + q.dir.x * lat);
        c.group.rotation.y = Math.atan2(-q.dir.z * t.dir, q.dir.x * t.dir);
        const far = Math.hypot(q.p.x - cam.x, q.p.z - cam.z) > REAL_CAR_FAR_DIST;
        c.near.visible = !far; c.far.visible = far;
        c.doorsA.position.x = st.doors * 0.75;
        c.doorsB.position.x = -st.doors * 0.75;
      }
    }
  }
}
