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
      this.recycleWait = RECYCLE_INTERVAL * (0.75 + 0.5 * i.rand);
      return 'recycle';
    }
    return 'none';
  }
}
