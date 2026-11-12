/**
 * World sounds as pure data and maths (SFX2): the walk and run footstep stepper, crosswalk signal ticks, the city bed by hour of day,
 * and the under-the-el reverb mix. VehicleAudio wires them to nodes; tests read the numbers.
 */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: number) => (Number.isFinite(v) ? v : 0);

/** Stride (m) at a speed in m/s: 0.8 m at a stroll (1.6 m/s), 1.4 m at a jog (4), 2.1 m at a sprint (7). */
export const strideAt = (speed: number): number => clamp(0.8 + 0.25 * (Math.max(1.6, fin(speed)) - 1.6), 0.8, 2.3);
/** Steps per second at a speed: about 2 at a stroll, 2.9 at a jog, 3.3 at a sprint. */
export const cadenceAt = (speed: number): number => (fin(speed) < 0.3 ? 0 : Math.abs(fin(speed)) / strideAt(speed));

export interface Step { side: 0 | 1; run: boolean; level: number }

/**
 * Footstep timing from the player's ground speed. Feet alternate; each step lands after a stride of distance, so the cadence follows the
 * walk and run gait of the animation (which is driven by the same speed). No steps in the air, none for a standing player.
 */
export class FootStepper {
  private dist = 0;
  private side: 0 | 1 = 0;
  private air = 0;
  /** `run` 0..1 is the sprint ramp (Player.sprint); speed in m/s. Returns the step to play this frame, or null. */
  update(dt: number, speed: number, run: number, grounded = true): Step | null {
    const sp = Math.abs(fin(speed));
    if (!grounded) { this.air = 0.25; return null; }
    if (this.air > 0) { this.air -= dt; this.dist = 0; return null; }
    if (sp < 0.3) { this.dist = Math.min(this.dist, strideAt(1.6) * 0.5); return null; }
    this.dist += sp * clamp(dt, 0, 0.1);
    const stride = strideAt(sp);
    if (this.dist < stride) return null;
    this.dist -= stride;
    this.side = this.side ? 0 : 1;
    return { side: this.side, run: run > 0.5 || sp > 5, level: clamp(0.45 + sp / 9, 0.45, 1) };
  }
  reset(): void { this.dist = 0; this.air = 0; }
}

export type SignalState = 'walk' | 'flash' | 'dont';
/** Accessible pedestrian signal: a slow locator tick while DON'T WALK, a quick chirp while WALK, a faster tick on the flashing countdown. Seconds between ticks. */
export const SIGNAL_PERIOD: Record<SignalState, number> = { dont: 1, flash: 0.25, walk: 0.125 };
/** Audible only near the crossing: gain 0..1 for a distance in metres (silent past 22 m). */
export const signalGain = (d: number): number => { const x = clamp(fin(d), 0, 22); return x >= 22 ? 0 : (1 - x / 22) ** 2; };

export interface HourBed {
  /** low traffic rumble 0..1 (rush hours peak, 3 am is a trickle) */
  traffic: number;
  /** daytime birds 0..1 (a dawn chorus at 5 to 8) and night insects 0..1 */
  birds: number; crickets: number;
  /** distant siren chance 0..1 and the cabin lowpass for the bed is chosen elsewhere */
  sirens: number;
  /** hum of the city at night: AC units and the far highway, 0..1 */
  hum: number;
}

const bump = (x: number, c: number, w: number) => { let d = Math.abs(x - c); d = Math.min(d, 24 - d); return Math.exp(-((d / w) ** 2)); };

/** The quiet city bed at an hour (0..24): smooth, wraps at midnight, never silent. */
export function hourBed(hour: number): HourBed {
  const h = ((fin(hour) % 24) + 24) % 24;
  const rush = Math.max(bump(h, 8.5, 1.6), bump(h, 17.5, 2.0));
  const day = bump(h, 13, 5.5);
  return {
    traffic: clamp(0.2 + 0.45 * day + 0.5 * rush, 0.15, 1),
    birds: clamp(0.9 * bump(h, 6, 1.6) + 0.5 * bump(h, 11, 3) + 0.3 * bump(h, 16.5, 2), 0, 1),
    crickets: clamp(bump(h, 1, 4.5) * 0.9, 0, 1) * (1 - 0.8 * bump(h, 8, 3)),
    sirens: clamp(0.25 + 0.5 * bump(h, 23, 3) + 0.25 * bump(h, 2, 2), 0, 1),
    hum: clamp(0.35 + 0.5 * bump(h, 2, 4.5), 0, 1),
  };
}

/** Under-the-el mix for a train at a horizontal distance d (m): wet send to the metal-hall reverb, dry gain, and the reverb tail length (s). */
export function underElMix(d: number): { wet: number; dry: number; tail: number } {
  const x = clamp((fin(d) - 6) / 30, 0, 1);
  const under = 1 - x;
  return { wet: 0.15 + 0.85 * under * under, dry: 1 - 0.3 * under, tail: 0.9 + 1.1 * under };
}
