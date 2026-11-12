/**
 * Fists: a quick alternating left-right jab (0.35 s each); a third press inside a short window is a heavier, slower hit.
 * `FistCombo` is the timing (no world, no three.js); `inFistArc` is the reach test.
 */
import { angleDiff, forwardFromHeading, headingFromVec, type Vec2 } from '@/core/Math2';

export const FIST = {
  /** reach from the body centre to the target centre, metres */
  range: 1.2,
  /** total width of the cone in front of the body, degrees */
  arcDeg: 70,
  /** seconds per jab, and for the heavy hit */
  swing: 0.35,
  heavySwing: 0.5,
  /** the blow lands this far (fraction) into the swing */
  impactAt: 0.4,
  /** a press this soon after the previous swing ended continues the chain; the third in the chain is heavy */
  comboWindow: 0.55,
  /** inside this distance a target is hit whatever the angle (they are against the player's body) */
  closeRange: 0.45,
} as const;

export type Swing = 'L' | 'R' | 'H';

/** True when `target` is within reach and inside the cone in front of a body at `origin` facing `heading`. */
export function inFistArc(origin: Vec2, heading: number, target: Vec2, range: number = FIST.range, arcDeg: number = FIST.arcDeg): boolean {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d <= FIST.closeRange) return true;
  const off = Math.abs(angleDiff(heading, headingFromVec({ x: dx, z: dz })));
  return off <= (arcDeg * Math.PI) / 360;
}

/** The point a swing reaches (for the ray test against cars and walls). */
export function fistTip(origin: Vec2, heading: number, range: number = FIST.range): Vec2 {
  const f = forwardFromHeading(heading);
  return { x: origin.x + f.x * range, z: origin.z + f.z * range };
}

export interface FistImpact { swing: Swing; heavy: boolean }

export class FistCombo {
  /** The swing in progress, or null. */
  swing: Swing | null = null;
  /** seconds into the swing */
  t = 0;
  private hand: 'L' | 'R' = 'L';
  private chain = 0;
  private sinceEnd = 99;
  private queued = false;
  private landed = false;

  get duration(): number { return this.swing === 'H' ? FIST.heavySwing : FIST.swing; }
  /** 0..1 through the swing (0 when idle). */
  get progress(): number { return this.swing ? Math.min(1, this.t / this.duration) : 0; }
  get busy(): boolean { return this.swing !== null; }

  /** The action button went down. Starts a swing, or queues one that begins as the current swing ends. */
  press(): void {
    if (this.swing) { this.queued = true; return; }
    this.begin();
  }

  cancel(): void { this.swing = null; this.queued = false; this.chain = 0; this.sinceEnd = 99; this.hand = 'L'; }

  private begin(): void {
    this.chain = this.sinceEnd <= FIST.comboWindow ? this.chain + 1 : 1;
    if (this.chain >= 3) { this.swing = 'H'; this.chain = 0; this.hand = 'L'; }
    else { this.swing = this.hand; this.hand = this.hand === 'L' ? 'R' : 'L'; }
    this.t = 0;
    this.landed = false;
    this.queued = false;
  }

  /** Advance. Returns the impact on the frame the blow lands. */
  update(dt: number): FistImpact | null {
    if (!this.swing) { this.sinceEnd += dt; return null; }
    this.t += dt;
    let out: FistImpact | null = null;
    if (!this.landed && this.t >= this.duration * FIST.impactAt) { this.landed = true; out = { swing: this.swing, heavy: this.swing === 'H' }; }
    if (this.t >= this.duration) {
      this.swing = null; this.sinceEnd = 0;
      if (this.queued) this.begin();
    }
    return out;
  }
}
