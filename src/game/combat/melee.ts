/**
 * COMBAT2: timing of a melee weapon's swing, the way `FistCombo` times a jab. A press starts a swing (or queues one that begins as
 * the current swing ends); the blow lands at `impactAt` of the way through; a press inside `comboWindow` after a swing continues the
 * chain (the bat's second swing is the backhand); the chain ends after `def.chain` swings. No world, no three.js.
 */
import type { MeleeDef } from './arsenal';

export interface MeleeImpact { index: number; damage: number; force: MeleeDef['hits'][number]['force']; last: boolean }

export class MeleeCombo {
  /** index of the swing in progress in the chain, or -1 */
  swing = -1;
  t = 0;
  private chain = 0;
  private sinceEnd = 99;
  private queued = false;
  private landed = false;

  constructor(public def: MeleeDef) {}

  get busy(): boolean { return this.swing >= 0; }
  get progress(): number { return this.swing >= 0 ? Math.min(1, this.t / this.def.swing) : 0; }
  get pose(): MeleeDef['poses'][number] { return this.def.poses[Math.max(0, this.swing) % this.def.poses.length]; }

  press(): void { if (this.swing >= 0) this.queued = true; else this.begin(); }
  cancel(): void { this.swing = -1; this.queued = false; this.chain = 0; this.sinceEnd = 99; }

  private begin(): void {
    this.chain = this.sinceEnd <= this.def.comboWindow ? (this.chain + 1) % this.def.chain : 0;
    this.swing = this.chain; this.t = 0; this.landed = false; this.queued = false;
  }

  /** Advance; returns the blow on the frame it lands. */
  update(dt: number): MeleeImpact | null {
    if (this.swing < 0) { this.sinceEnd += dt; return null; }
    this.t += dt;
    let out: MeleeImpact | null = null;
    if (!this.landed && this.t >= this.def.swing * this.def.impactAt) {
      this.landed = true;
      const h = this.def.hits[Math.min(this.swing, this.def.hits.length - 1)];
      out = { index: this.swing, damage: h.damage, force: h.force, last: this.swing === this.def.chain - 1 };
    }
    if (this.t >= this.def.swing) {
      this.swing = -1; this.sinceEnd = 0;
      if (this.queued) this.begin();
    }
    return out;
  }
}
