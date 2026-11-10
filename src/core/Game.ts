/** Fixed-step simulation (60 Hz) + per-frame render with interpolation alpha. */
import type { Body2D } from '@/world/types';

export interface Updatable { update(dt: number): void; }

export const FIXED_STEP = 1 / 60;
/** At most this many catch-up steps per rendered frame; the rest of the backlog is dropped (slow motion beats a death spiral on phones). */
export const MAX_STEPS_PER_FRAME = 3;
/** Wall-clock budget (ms) for the steps of one frame: once spent, the remaining steps and backlog are dropped. */
export const STEP_BUDGET_MS = 20;
/** Longest frame (s) fed to the accumulator; longer stalls (tab switch, GC) are clamped. */
export const MAX_FRAME = 0.05;

/** Render interpolation factor for an accumulator value: acc / step clamped to [0, 1]. */
export function interpAlpha(acc: number, step: number): number {
  if (!(step > 0)) return 1;
  const a = acc / step;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Interpolate between two angles (radians) along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/**
 * Fixed-timestep accumulator. `advance(frameDt)` returns how many fixed steps to run (capped); when the cap is
 * hit the remaining backlog is dropped (slow-motion instead of a spiral of death) so alpha stays within [0, 1].
 */
export class FixedStepper {
  acc = 0;
  constructor(readonly step = FIXED_STEP, readonly maxSteps = MAX_STEPS_PER_FRAME, readonly maxFrame = MAX_FRAME) {}
  advance(frameDt: number): number {
    this.acc += Math.min(this.maxFrame, Math.max(0, frameDt));
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) { this.acc -= this.step; n++; }
    if (this.acc >= this.step) this.acc %= this.step;
    return n;
  }
  get alpha(): number { return interpAlpha(this.acc, this.step); }
  reset(): void { this.acc = 0; }
}

interface Pose { px: number; pz: number; ph: number; gen: number; }
/** Teleports/respawns farther than this (m) between two steps are not interpolated. */
export const SNAP_DISTANCE = 8;

export interface BlendedPose { x: number; z: number; h: number; }

/**
 * Previous-step pose snapshots for dynamic bodies, used to interpolate meshes between fixed steps.
 * Call `beginCapture()`, `capture(body)` for every dynamic body, `endCapture()` at the START of each fixed step.
 * Physics/body state is never modified.
 */
export class PoseSnapshots {
  private readonly poses = new Map<string, Pose>();
  private gen = 0;
  beginCapture(): void { this.gen++; }
  capture(body: Body2D): void {
    let p = this.poses.get(body.id);
    if (!p) { p = { px: 0, pz: 0, ph: 0, gen: 0 }; this.poses.set(body.id, p); }
    p.px = body.pos.x; p.pz = body.pos.z; p.ph = body.heading; p.gen = this.gen;
  }
  /** Drops snapshots of bodies that were not captured this step (removed entities). */
  endCapture(): void {
    for (const [id, p] of this.poses) if (p.gen !== this.gen) this.poses.delete(id);
  }
  get size(): number { return this.poses.size; }
  /** Writes the interpolated pose of `body` into `out` (current pose when no snapshot exists or after a teleport). */
  blend(body: Body2D, alpha: number, out: BlendedPose): BlendedPose {
    const p = this.poses.get(body.id);
    const cx = body.pos.x, cz = body.pos.z, ch = body.heading;
    if (!p || (cx - p.px) ** 2 + (cz - p.pz) ** 2 > SNAP_DISTANCE * SNAP_DISTANCE) { out.x = cx; out.z = cz; out.h = ch; return out; }
    out.x = lerp(p.px, cx, alpha);
    out.z = lerp(p.pz, cz, alpha);
    out.h = lerpAngle(p.ph, ch, alpha);
    return out;
  }
}

export class Game {
  readonly step = FIXED_STEP;
  private readonly stepper = new FixedStepper(FIXED_STEP);
  private last = 0;
  private raf = 0;
  private _paused = false;
  /** Interpolation factor of the frame being rendered (0..1). */
  alpha = 0;
  /** Real (clamped) duration of the frame being rendered, seconds. */
  frameDt = 1 / 60;
  readonly systems: Updatable[] = [];
  constructor(private render: (alpha: number, frameDt: number) => void, private endFrame: () => void = () => {}) {}
  get paused(): boolean { return this._paused; }
  set paused(v: boolean) {
    if (this._paused && !v) { this.stepper.reset(); this.last = performance.now(); }
    this._paused = v;
  }
  add(s: Updatable): this { this.systems.push(s); return this; }
  start(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const frame = Math.min(MAX_FRAME, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      let n = 0;
      if (!this._paused) {
        n = this.stepper.advance(frame);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < this.systems.length; j++) this.systems[j].update(this.step);
          if (i + 1 < n && performance.now() - t0 > STEP_BUDGET_MS) { this.stepper.reset(); break; } // steps are costing more than real time: drop the backlog
        }
      }
      this.alpha = this.stepper.alpha;
      this.frameDt = frame;
      this.render(this.alpha, frame);
      // Only reset edge-triggered input once a simulation step has had the chance to consume it
      // (at >60 Hz display rates some frames run zero steps).
      if (n > 0) this.endFrame();
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop(): void { cancelAnimationFrame(this.raf); }
}
