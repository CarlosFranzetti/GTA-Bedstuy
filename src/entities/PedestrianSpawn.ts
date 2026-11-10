/**
 * Pedestrian spawn scheduler: decides, a tick at a time, whether the crowd should gain, lose or relocate one pedestrian.
 * Pure (no scene, no world), so the pacing is unit-tested. TrafficSystem executes the verdicts.
 *
 * Goals (scripts/crowd-audit.mjs measures them):
 *  - the crowd tracks the hour curve smoothly: changes are paced one at a time, spread so any gap closes in about CLOSE_IN seconds,
 *    never in a clump;
 *  - steady replacement: pedestrians who have wandered beyond RECYCLE_DIST of the player are moved to the spawn ring around the
 *    player (out of the near view), at a steady trickle, so the pavement near the player never drains;
 *  - changes happen out of sight (the executor picks nodes outside SPAWN_RING_MIN / removes beyond REMOVE_CLEAR).
 */
export type PedAction = 'none' | 'add' | 'remove' | 'recycle';

/** pacing constant (s): the interval between changes is this over the remaining gap (clamped), so a 30-person gap closes in ~2.5x this */
export const CLOSE_IN = 18;
/** shortest / longest wait between two crowd changes (s) */
export const MIN_INTERVAL = 0.4;
export const MAX_INTERVAL = 2.5;
/** steady-state relocation: one far pedestrian moved to the ring every this many seconds (while any is beyond RECYCLE_DIST) */
export const RECYCLE_INTERVAL = 1.8;
/** the same while the player's surroundings (within LOCAL_RADIUS) hold fewer pedestrians than NEAR_SHARE of the crowd */
export const RECYCLE_INTERVAL_DEFICIT = 2.4;
export const LOCAL_RADIUS = 60;
export const NEAR_SHARE = 0.14;
/** with a local deficit, loners beyond this (m) are fetched, not only those beyond RECYCLE_DIST */
export const RECYCLE_DIST_DEFICIT = 100;
/** a pedestrian farther than this from the player is a recycle candidate (m) */
export const RECYCLE_DIST = 125;
/** new / relocated pedestrians appear in this ring around the player (m): beyond the near view, within walking-in reach */
export const SPAWN_RING_MIN = 62;
export const SPAWN_RING_MAX = 115;
/** removals only happen beyond this distance (m) */
export const REMOVE_CLEAR = 45;

export interface PedSchedulerInput {
  dt: number;
  /** pedestrians now */
  count: number;
  /** wanted pedestrians (real; the scheduler rounds with hysteresis) */
  target: number;
  /** is there a loner farther than RECYCLE_DIST to relocate */
  hasFar: boolean;
  /** fewer pedestrians near the player than NEAR_SHARE of the target: relocate faster and from closer in */
  deficit?: boolean;
  /** uniform random in 0..1, for interval jitter */
  rand: number;
}

export class PedSpawnScheduler {
  private wait = 0;
  private recycleWait = 0;

  /** The crowd size to hold: round with a half-person hysteresis around the current count so the curve's noise does not flip-flop. */
  static goal(count: number, target: number): number {
    if (Math.abs(target - count) <= 0.5) return count;
    return Math.round(target);
  }

  /** Seconds to wait after a change when `gap` pedestrians are still missing / surplus. */
  static interval(gap: number, rand = 0.5): number {
    const base = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, CLOSE_IN / Math.max(1, Math.abs(gap))));
    return base * (0.75 + 0.5 * rand);
  }

  /** Forget pacing (after a snap or a teleport). */
  reset(): void { this.wait = 0; this.recycleWait = 0; }

  tick(i: PedSchedulerInput): PedAction {
    this.wait -= i.dt;
    this.recycleWait -= i.dt;
    const goal = PedSpawnScheduler.goal(i.count, i.target);
    const gap = goal - i.count;
    if (gap !== 0) {
      if (this.wait > 0) return 'none';
      this.wait = PedSpawnScheduler.interval(gap, i.rand);
      return gap > 0 ? 'add' : 'remove';
    }
    if (i.hasFar && this.recycleWait <= 0) {
      this.recycleWait = (i.deficit ? RECYCLE_INTERVAL_DEFICIT : RECYCLE_INTERVAL) * (0.75 + 0.5 * i.rand);
      return 'recycle';
    }
    return 'none';
  }
}

/** Closest a new / relocated pedestrian may appear when the spot is out of the camera's sight (behind the player, round a corner) (m). */
export const HIDDEN_RING_MIN = 54;
/** Half-width of the sight cone (rad): the on-foot camera is 64 deg tall; with a wide aspect and the chase swing, 60 deg each side is safe. */
export const VIEW_HALF_ANGLE = (60 * Math.PI) / 180;

export interface Vec2Like { x: number; z: number }

/** Is `p` inside the camera's sight cone from `player` looking along the unit vector `facing`? Unknown facing counts as in view. */
export function inViewCone(player: Vec2Like, facing: Vec2Like | null, p: Vec2Like): boolean {
  if (!facing) return true;
  const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  return (dx * facing.x + dz * facing.z) / d >= Math.cos(VIEW_HALF_ANGLE);
}

/**
 * May a pedestrian appear at `p`? From SPAWN_RING_MIN out always (to SPAWN_RING_MAX); from HIDDEN_RING_MIN when the spot is outside
 * the sight cone or a building blocks the line to it (`occluded`, from a ray test the caller makes only for the close candidates).
 */
export function spawnAllowed(player: Vec2Like, facing: Vec2Like | null, p: Vec2Like, occluded: () => boolean): boolean {
  const d = Math.hypot(p.x - player.x, p.z - player.z);
  if (d > SPAWN_RING_MAX || d < HIDDEN_RING_MIN) return false;
  if (d >= SPAWN_RING_MIN) return true;
  return !inViewCone(player, facing, p) || occluded();
}
