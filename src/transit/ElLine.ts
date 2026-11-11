/**
 * WBURG: the elevated line ("BKLYN TRANSIT") that runs over Flushing Ave, and its timetable. Pure data and kinematics, no THREE:
 * every train state is a closed-form function of the clock, so the schedule is deterministic (tests/unit/transit).
 *
 * Placement (the compromise): the real J/M/Z el runs on Broadway, a 45 degree diagonal, and the grid is axis-aligned. The line is
 * straightened onto Flushing Ave (the game's north edge of Bed-Stuy, where the real line also meets Flushing Av and Marcy Ave). The
 * order of the real north-west-bound stops is kept (Myrtle Av, then Flushing Av) at about their real spacing (500 m); the viaduct is
 * clipped at both ends of the map and continues into the fog.
 *
 * Coordinates: metres, +x east, +z south (grid frame). `dir` -1 is west-bound (to the Lorimer St side), +1 east-bound.
 */

/** z of the street centreline the el follows (Flushing Ave in bedstuy.json). */
export const EL_Z = -500;
/** Distance of each track centre from the street centreline. */
export const TRACK_OFFSET = 1.9;
/** Height of the rail head above the street (m). Clearance under the girders is about 5.4 m. */
export const RAIL_Y = 8.8;
/** Car floor above the rail head (R160-style: 1.1 m) and platform edge height. */
export const FLOOR_ABOVE_RAIL = 1.0;
/** Where the viaduct stops at both ends (the map edge plus the fog margin). */
export const EL_X_WEST = -430;
export const EL_X_EAST = 1190;

export interface Station {
  id: string;
  /** street name as the signs show it ("Flushing Av" is a street name, so it may stay) */
  name: string;
  /** platform centre x */
  x: number;
  /** platform length (m); a four-car train is 4 x CAR_LENGTH */
  length: number;
  /** the parody operator name on the signs */
  operator: string;
}

export const OPERATOR = 'BKLYN TRANSIT';
export const CAR_LENGTH = 18.4;
export const CAR_COUNT = 4;
export const CAR_GAP = 0.5;
/** Overall length of the four-car train. */
export const TRAIN_LENGTH = CAR_COUNT * CAR_LENGTH + (CAR_COUNT - 1) * CAR_GAP;

export const STATIONS: readonly Station[] = [
  // north-west-bound order is Myrtle Av -> Flushing Av; on the straightened line that is west-bound, from the east edge
  { id: 'myrtle', name: 'Myrtle Av', x: 875, length: 94, operator: OPERATOR },
  { id: 'flushing', name: 'Flushing Av', x: 375, length: 94, operator: OPERATOR },
];

/** z of the track a train of this direction runs on (west-bound on the north track, east-bound on the south). */
export const trackZ = (dir: 1 | -1): number => EL_Z + (dir === -1 ? -TRACK_OFFSET : TRACK_OFFSET);

export const V_CRUISE = 15;
export const ACCEL = 0.9;
export const DECEL = 1.0;
export const DWELL = 24;
/** doors take this long to open or close */
export const DOOR_TIME = 1.8;
/** Loop period (s) of one train; the two directions are half a period apart. */
export const PERIOD = 240;

export interface TrainSpec { id: string; dir: 1 | -1; /** clock offset (s) */ offset: number; }
export const TRAINS: readonly TrainSpec[] = [
  { id: 'wb', dir: -1, offset: 0 },
  { id: 'eb', dir: 1, offset: PERIOD / 2 },
];

interface Phase { t0: number; t1: number; s0: number; v0: number; a: number; kind: 'run' | 'brake' | 'dwell' | 'accel'; station: number; }

/** Where along its path (distance from the entry end) a train stops. */
const entryX = (dir: 1 | -1): number => (dir === -1 ? EL_X_EAST + TRAIN_LENGTH / 2 : EL_X_WEST - TRAIN_LENGTH / 2);
const exitX = (dir: 1 | -1): number => (dir === -1 ? EL_X_WEST - TRAIN_LENGTH / 2 : EL_X_EAST + TRAIN_LENGTH / 2);

const cache = new Map<number, { phases: Phase[]; stops: number[] }>();

/** Phase table of a direction: run at cruise, brake to each stop, dwell, accelerate, run out. */
export function schedule(dir: 1 | -1): { phases: Phase[]; stops: number[] } {
  const hit = cache.get(dir);
  if (hit) return hit;
  const stations = STATIONS.map((st, i) => ({ st, i })).sort((p, q) => dir * (p.st.x - q.st.x));
  const total = Math.abs(exitX(dir) - entryX(dir));
  const phases: Phase[] = [];
  const stops: number[] = [];
  let t = 0, s = 0;
  const brakeD = (V_CRUISE * V_CRUISE) / (2 * DECEL);
  const accelD = (V_CRUISE * V_CRUISE) / (2 * ACCEL);
  for (const { st, i } of stations) {
    const stopS = Math.abs(st.x - entryX(dir));
    stops.push(stopS);
    const runD = stopS - brakeD - s;
    if (runD > 0) { phases.push({ t0: t, t1: t + runD / V_CRUISE, s0: s, v0: V_CRUISE, a: 0, kind: 'run', station: -1 }); t += runD / V_CRUISE; s += runD; }
    const tb = V_CRUISE / DECEL;
    phases.push({ t0: t, t1: t + tb, s0: s, v0: V_CRUISE, a: -DECEL, kind: 'brake', station: i }); t += tb; s = stopS;
    phases.push({ t0: t, t1: t + DWELL, s0: s, v0: 0, a: 0, kind: 'dwell', station: i }); t += DWELL;
    const ta = V_CRUISE / ACCEL;
    phases.push({ t0: t, t1: t + ta, s0: s, v0: 0, a: ACCEL, kind: 'accel', station: i }); t += ta; s += accelD;
  }
  const rest = total - s;
  phases.push({ t0: t, t1: t + rest / V_CRUISE, s0: s, v0: V_CRUISE, a: 0, kind: 'run', station: -1 });
  const out = { phases, stops };
  cache.set(dir, out);
  return out;
}

export interface TrainState {
  /** false while the train is off the map (waiting out the period) */
  active: boolean;
  /** x of the train centre */
  x: number;
  dir: 1 | -1;
  /** m/s along the direction of travel (>= 0) */
  speed: number;
  /** signed acceleration along the travel direction (negative while braking) */
  accel: number;
  phase: 'run' | 'brake' | 'dwell' | 'accel' | 'away';
  /** index into STATIONS of the stop being made or just left, -1 on the run */
  station: number;
  /** 0 closed .. 1 open */
  doors: number;
  /** seconds since the phase began */
  phaseT: number;
}

/** Closed-form train state at clock time `time` (s). Pure and deterministic. */
export function trainState(spec: TrainSpec, time: number): TrainState {
  const sch = schedule(spec.dir);
  const last = sch.phases[sch.phases.length - 1];
  const t = ((time - spec.offset) % PERIOD + PERIOD) % PERIOD;
  if (t >= last.t1) return { active: false, x: exitX(spec.dir), dir: spec.dir, speed: 0, accel: 0, phase: 'away', station: -1, doors: 0, phaseT: t - last.t1 };
  let ph = sch.phases[0];
  for (const p of sch.phases) if (t >= p.t0 && t < p.t1) { ph = p; break; }
  const dt = t - ph.t0;
  const s = ph.s0 + ph.v0 * dt + 0.5 * ph.a * dt * dt;
  const v = Math.max(0, ph.v0 + ph.a * dt);
  let doors = 0;
  if (ph.kind === 'dwell') {
    const dur = ph.t1 - ph.t0;
    doors = Math.min(1, Math.max(0, Math.min((dt - 0.6) / DOOR_TIME, (dur - 1.0 - dt) / DOOR_TIME)));
  }
  return { active: true, x: entryX(spec.dir) + spec.dir * s, dir: spec.dir, speed: v, accel: ph.kind === 'dwell' ? 0 : ph.a, phase: ph.kind, station: ph.kind === 'run' ? -1 : ph.station, doors, phaseT: dt };
}

/** x of each car centre for a train centred at `x` (car 0 leads in the direction of travel). */
export function carCentres(x: number, dir: 1 | -1): number[] {
  const out: number[] = [];
  for (let i = 0; i < CAR_COUNT; i++) out.push(x + dir * ((CAR_COUNT - 1) / 2 - i) * (CAR_LENGTH + CAR_GAP));
  return out;
}

/** The next station a train of direction `dir` stops at after standing at `from` (index into STATIONS), or -1 when it is the last stop. */
export function nextStop(dir: 1 | -1, from: number): number {
  const order = STATIONS.map((st, i) => ({ st, i })).sort((p, q) => dir * (p.st.x - q.st.x));
  const k = order.findIndex((o) => o.i === from);
  return k >= 0 && k + 1 < order.length ? order[k + 1].i : -1;
}

/** Clock times (within one period, after the train's offset) at which doors are fully open at a station, for `tryBoard` announcements. */
export function nextArrival(spec: TrainSpec, station: number, time: number): number {
  const sch = schedule(spec.dir);
  const ph = sch.phases.find((p) => p.kind === 'dwell' && p.station === station);
  if (!ph) return Infinity;
  const base = Math.floor((time - spec.offset) / PERIOD) * PERIOD + spec.offset;
  for (const k of [0, PERIOD]) { const t = base + k + ph.t0; if (t + (ph.t1 - ph.t0) > time) return t; }
  return base + 2 * PERIOD + ph.t0;
}
