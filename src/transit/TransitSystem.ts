/**
 * WBURG: the whole transit layer in one object. `buildWorld` creates it and adds `group` to the world; main.ts calls
 * `update` once per frame and `attachAudio` once the audio context exists (FOR FABLE lines in the lane report).
 *
 *  - the elevated line over Flushing Ave (ElStructure) in 125 m sections that are hidden beyond a range,
 *  - two four-car trains (west-bound on the north track, east-bound on the south) on the closed-form timetable of ElLine,
 *  - night: lit windows, headlights on the lead car, red tail lamps on the last, a faint beam,
 *  - sound through TrainAudio,
 *  - riding: `tryBoard` (F at a stair foot while a train is standing with its doors open) puts the player in the car; the ride
 *    ends at the next stop and the player steps out at that station's stair foot. Camera and standing point come from `ride`.
 */
import * as THREE from 'three';
import type { IMaterialLibrary, StaticCollider } from '@/world/types';
import { buildEl, type ElBuild, type StationEntrance } from './ElStructure';
import { buildCarGeometries, makeCar, makeCarMaterials, type CarGeometries, type CarMaterials, type TrainCar } from './TrainCar';
import { TrainAudio } from './TrainAudio';
import { CAR_COUNT, FLOOR_ABOVE_RAIL, RAIL_Y, STATIONS, TRAINS, carCentres, nextArrival, nextStop, trackZ, trainState, type TrainSpec, type TrainState } from './ElLine';

/** Distance (m) within which a stair foot counts as "at the station" for boarding. */
export const BOARD_RADIUS = 9;
/** Beyond this distance from the camera (m) a train car switches to its far LOD. */
export const CAR_FAR_DIST = 140;
/** Default draw range (m) of the structure and the trains; grows with camera height like the chunk range. */
export const TRANSIT_RANGE = 520;

export interface RideState {
  train: string;
  from: number;
  to: number;
  /** player standing point in the car (world) */
  x: number; y: number; z: number;
  /** travel heading (clockwise from north, radians) */
  heading: number;
  cam: { px: number; py: number; pz: number; lx: number; ly: number; lz: number };
}

interface TrainRt { spec: TrainSpec; cars: TrainCar[]; state: TrainState; beam: THREE.Mesh; }

export class TransitSystem {
  readonly group = new THREE.Group();
  readonly colliders: StaticCollider[];
  readonly el: ElBuild;
  readonly trains: TrainRt[] = [];
  /** simulated clock (s); `update` advances it, tests and screenshots set it */
  time = 0;
  ride: RideState | null = null;
  /** last message for a HUD toast (cleared by `takeMessage`) */
  private message: string | null = null;
  private pendingAlight: { x: number; z: number } | null = null;
  private audio: TrainAudio | null = null;
  private readonly geo: CarGeometries;
  private readonly mats: CarMaterials;
  private night = false;
  private readonly sectionVisible: boolean[] = [];

  constructor(lib: IMaterialLibrary) {
    this.group.name = 'transit';
    this.el = buildEl(lib);
    this.colliders = this.el.colliders;
    for (const s of this.el.sections) this.group.add(s.mesh);
    for (const p of this.el.props) this.group.add(p);
    this.geo = buildCarGeometries();
    this.mats = makeCarMaterials();
    for (const spec of TRAINS) {
      const cars: TrainCar[] = [];
      for (let i = 0; i < CAR_COUNT; i++) { const c = makeCar(this.geo, this.mats); cars.push(c); this.group.add(c.group); }
      cars[0].lampsFront.visible = true;
      cars[CAR_COUNT - 1].lampsRear.visible = true;
      const beam = this.makeBeam();
      cars[0].group.add(beam);
      this.trains.push({ spec, cars, state: trainState(spec, 0), beam });
    }
    this.update(0, { x: 0, y: 2, z: 0 }, false);
  }

  private makeBeam(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    // a flat fan in front of the headlamps (two triangles), lying just above the rails
    const v = new Float32Array([9.3, 1.45, 0, 48, 0.4, -7, 48, 0.4, 7, 9.3, 1.45, 0, 48, 0.4, 7, 48, 0.4, -7]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0.5, 1, 0, 1, 1, 0, 0.5, 1, 1, 1, 0]), 2));
    const m = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, name: 'train:beam' });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'train:beam'; mesh.visible = false; mesh.frustumCulled = false;
    return mesh;
  }

  /** Connects the sound (call once the AudioContext exists; safe to call again with the same context). */
  attachAudio(ctx: AudioContext | null | undefined, dest: AudioNode | null | undefined): void {
    if (!ctx || !dest || this.audio) return;
    this.audio = new TrainAudio(ctx, dest);
  }

  setTime(t: number): void { this.time = t; this.update(0, { x: 1e6, y: 0, z: 1e6 }, this.night, true); }

  stateOf(id: string): TrainState | undefined { return this.trains.find((t) => t.spec.id === id)?.state; }

  takeMessage(): string | null { const m = this.message; this.message = null; return m; }
  /** Where to put the player after a ride ended (stair foot of the stop); null until a ride ends. Cleared on read. */
  takeAlight(): { x: number; z: number } | null { const a = this.pendingAlight; this.pendingAlight = null; return a; }

  /** Entrance (stair foot) of a station nearest to (x, z) within BOARD_RADIUS, if any. */
  entranceNear(x: number, z: number): StationEntrance | null {
    let best: StationEntrance | null = null, bd = BOARD_RADIUS;
    for (const e of this.el.entrances) { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /**
   * F at a stair foot: board the train standing at that station with its doors open and a next stop ahead, otherwise say when the
   * next one comes. Returns false when the player is not at a stair foot (so F can fall through to other actions).
   */
  tryBoard(px: number, pz: number): boolean {
    if (this.ride) { this.message = 'Doors are closed. The next stop is ' + STATIONS[this.ride.to].name + '.'; return true; }
    const ent = this.entranceNear(px, pz);
    if (!ent) return false;
    const want = ent.station;
    for (const t of this.trains) {
      const s = t.state;
      if (s.phase === 'dwell' && s.station === want && s.doors > 0.5 && nextStop(s.dir, want) >= 0) {
        this.ride = { train: t.spec.id, from: want, to: nextStop(s.dir, want), x: s.x, y: RAIL_Y + FLOOR_ABOVE_RAIL, z: trackZ(s.dir), heading: 0, cam: { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 } };
        this.message = `${STATIONS[want].name}: stand clear of the closing doors. Next stop ${STATIONS[nextStop(s.dir, want)].name}.`;
        this.updateRide();
        return true;
      }
    }
    // no train at the platform: announce the earliest arrival that has a stop ahead
    let wait = Infinity;
    for (const t of this.trains) if (nextStop(t.spec.dir, want) >= 0) wait = Math.min(wait, nextArrival(t.spec, want, this.time) - this.time);
    this.message = Number.isFinite(wait) ? `${STATIONS[want].name}: next train in ${Math.max(1, Math.ceil(wait))} s.` : `${STATIONS[want].name}: no service.`;
    return true;
  }

  private updateRide(): void {
    const r = this.ride;
    if (!r) return;
    const t = this.trains.find((q) => q.spec.id === r.train)!;
    const s = t.state;
    // stand at the middle of car 2 (the middle two cars share the centre); the camera looks along the train, a little off the window
    const cx = s.x + s.dir * 0.0;
    r.x = cx; r.z = trackZ(s.dir) + 0.0; r.y = RAIL_Y + FLOOR_ABOVE_RAIL;
    r.heading = s.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    const sway = Math.sin(this.time * 7.3) * 0.015 * Math.min(1, s.speed / 10);
    r.cam = { px: cx - s.dir * 3.0, py: r.y + 1.62 + sway, pz: r.z + 0.35, lx: cx + s.dir * 20, ly: r.y + 1.45, lz: r.z - 0.25 + sway };
    if (s.phase === 'dwell' && s.station === r.to && s.doors > 0.6) {
      const ent = this.el.entrances.find((e) => e.station === r.to);
      this.pendingAlight = ent ? { x: ent.x, z: ent.z } : null;
      this.message = `${STATIONS[r.to].name}. Watch the gap.`;
      this.ride = null;
    }
  }

  /** Per frame. `cam` is the camera position; `night` switches the lamps; `force` updates even when nothing is near. */
  update(dt: number, cam: { x: number; y: number; z: number }, night: boolean, force = false): void {
    this.time += dt;
    const range = TRANSIT_RANGE + Math.max(0, cam.y - 3) * 25;
    this.night = night;
    // structure sections
    this.el.sections.forEach((s, i) => {
      const d = Math.hypot(s.cx - cam.x, s.cz - cam.z) - s.r;
      const vis = d < range;
      if (this.sectionVisible[i] !== vis || force) { this.sectionVisible[i] = vis; s.mesh.visible = vis; }
    });
    // props (stations, canopy, signs, entrances) are one mesh each: hide beyond the range of their nearest section
    const propVisible = this.el.sections.some((s) => Math.hypot(s.cx - cam.x, s.cz - cam.z) - s.r < range);
    for (const p of this.el.props) p.visible = propVisible;
    // night lighting
    this.mats.glass.emissiveIntensity = night ? 1.1 : 0.12;
    this.mats.lampFront.emissiveIntensity = night ? 3.2 : 0.5;
    this.mats.lampRear.emissiveIntensity = night ? 2.4 : 0.4;
    for (const n of this.el.night) n.mat.emissiveIntensity = night ? n.nightV : n.day;
    // trains
    for (const t of this.trains) {
      const st = trainState(t.spec, this.time);
      t.state = st;
      const xs = carCentres(st.x, st.dir);
      const z = trackZ(st.dir);
      const dist = Math.hypot(st.x - cam.x, z - cam.z);
      const show = st.active && dist < range + 60;
      for (let i = 0; i < t.cars.length; i++) {
        const c = t.cars[i];
        c.group.visible = show;
        if (!show) continue;
        c.group.position.set(xs[i], RAIL_Y, z);
        c.group.rotation.y = st.dir === 1 ? 0 : Math.PI;
        const cd = Math.hypot(xs[i] - cam.x, z - cam.z);
        const far = cd > CAR_FAR_DIST;
        c.near.visible = !far; c.far.visible = far;
        c.doorsA.position.x = st.doors * 0.75;
        c.doorsB.position.x = -st.doors * 0.75;
      }
      const lamp = night && show;
      (t.beam.material as THREE.MeshBasicMaterial).opacity = lamp ? 0.16 : 0;
      t.beam.visible = lamp;
      this.audio?.update(t.spec.id, st, Math.hypot(st.x - cam.x, z - cam.z));
    }
    this.updateRide();
  }

  dispose(): void { this.audio?.dispose(); }
}
