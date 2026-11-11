/**
 * On-foot jump: a vertical VISUAL arc (World2D has no height) with take-off / air / land states, a cooldown and a landing
 * recovery. Pure and deterministic: `Player` feeds it dt and reads `y`; tests drive it with fake time.
 */
export const JUMP_GRAVITY = 17;
/** Launch speeds (m/s): standing, and at full run (blended by ground speed). */
export const JUMP_VY_STAND = 4.6;
export const JUMP_VY_RUN = 5.3;
/** Crouch before the feet leave the ground (s). */
export const JUMP_TAKEOFF = 0.07;
/** Landing recovery (s): ground speed is cut and jumping is not allowed. */
export const JUMP_LAND = 0.2;
/** Extra cooldown after landing before the next jump (s), on top of the recovery. */
export const JUMP_COOLDOWN = 0.12;
/** Share of ground acceleration kept while airborne, and of top speed while recovering from a landing. */
export const AIR_CONTROL = 0.25;
export const LAND_SPEED_SCALE = 0.55;
/** Running-speed (m/s) that counts as a full running jump. */
export const JUMP_RUN_SPEED = 6.5;

export type JumpPhase = 'ground' | 'takeoff' | 'air' | 'land';

export class JumpState {
  phase: JumpPhase = 'ground';
  /** Height above the ground (m). */
  y = 0;
  vy = 0;
  /** Seconds in the current phase. */
  t = 0;
  private cooldown = 0;
  private launchVy = JUMP_VY_STAND;
  /** Impact strength 0..1 of the last landing (consumed by `takeLanded`). */
  private landed = -1;
  /** Set on the frame the feet leave the ground. */
  private launched = false;

  get airborne(): boolean { return this.phase === 'air'; }
  get busy(): boolean { return this.phase !== 'ground'; }
  /** Horizontal speed multiplier from the state (landing recovery slows you; the crouch barely). */
  get speedScale(): number { return this.phase === 'land' ? LAND_SPEED_SCALE : this.phase === 'takeoff' ? 0.9 : 1; }
  /** Horizontal acceleration multiplier (air control). */
  get accelScale(): number { return this.phase === 'air' ? AIR_CONTROL : 1; }
  /** 0..1 apex fraction for the pose and the shadow: 1 on the ground, shrinking with height. */
  get shadowScale(): number { return Math.max(0.35, 1 - this.y * 0.75); }

  /** Start a jump if allowed. `groundSpeed` (m/s) picks standing vs running. Returns true when it started. */
  tryJump(allowed: boolean, groundSpeed: number): boolean {
    if (!allowed || this.phase !== 'ground' || this.cooldown > 0) return false;
    const k = Math.min(1, Math.max(0, groundSpeed / JUMP_RUN_SPEED));
    this.launchVy = JUMP_VY_STAND + (JUMP_VY_RUN - JUMP_VY_STAND) * k;
    this.phase = 'takeoff'; this.t = 0;
    return true;
  }

  /** Total airtime of a jump launched at `vy`. */
  static airtime(vy: number): number { return (2 * vy) / JUMP_GRAVITY; }
  static apex(vy: number): number { return (vy * vy) / (2 * JUMP_GRAVITY); }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    this.t += dt;
    if (this.phase === 'takeoff' && this.t >= JUMP_TAKEOFF) {
      this.phase = 'air'; this.t = 0; this.vy = this.launchVy; this.launched = true;
    }
    if (this.phase === 'air') {
      const vy0 = this.vy;
      this.vy -= JUMP_GRAVITY * dt;
      this.y += (vy0 + this.vy) * 0.5 * dt;
      if (this.y <= 0 && this.t > 0) {
        this.landed = Math.min(1, Math.abs(this.vy) / 7);
        this.y = 0; this.vy = 0; this.phase = 'land'; this.t = 0;
      }
    } else if (this.phase === 'land' && this.t >= JUMP_LAND) {
      this.phase = 'ground'; this.t = 0; this.cooldown = JUMP_COOLDOWN;
    }
  }

  /** Edge: true once on the step the feet left the ground. */
  takeLaunched(): boolean { const l = this.launched; this.launched = false; return l; }
  /** Edge: impact strength 0..1 once after a landing, else -1. */
  takeLanded(): number { const l = this.landed; this.landed = -1; return l; }

  /** Cancel (entering a car, teleport, interior): back on the ground, no recovery. */
  reset(): void { this.phase = 'ground'; this.y = 0; this.vy = 0; this.t = 0; this.cooldown = 0; this.landed = -1; this.launched = false; }
}
