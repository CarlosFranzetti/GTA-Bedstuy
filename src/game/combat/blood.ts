/**
 * COMBAT2: blood. Stylised and restrained: a small burst of dark droplets on a hard hit, a short spray on a shot, a few drops and a
 * pool under someone who is out, marks on the pavement that fade over a minute or two. The colour is a dark oxblood (the muted
 * palette of docs/swarm/art/DIRECTION.md), never bright red. No gore beyond this, nothing on a body but what is drawn here.
 *
 * This file is the simulation (positions, ages, caps; no three.js); `bloodView.ts` draws it with two instanced meshes, so a hit never
 * adds a draw call. The "Blood: On / Off" setting (Settings, Game) is read at every call: Off spawns nothing at all.
 */
export type Tier = 'phone' | 'low' | 'medium' | 'high';

/** Hard caps on what lives at once, by quality tier. The phone tier: the burst and a few fading marks, no pools. */
export const BLOOD_CAPS: Record<Tier, { drops: number; marks: number; pools: number; burst: number }> = {
  phone: { drops: 12, marks: 6, pools: 0, burst: 5 },
  low: { drops: 28, marks: 20, pools: 6, burst: 8 },
  medium: { drops: 56, marks: 44, pools: 12, burst: 12 },
  high: { drops: 96, marks: 80, pools: 20, burst: 16 },
};

/** Seconds a mark lives, a pool lives, and the share of life at the end over which it fades. */
export const MARK_LIFE = 80;
export const POOL_LIFE = 130;
export const FADE_SHARE = 0.4;
/** A pool grows to full size over this long (s). */
export const POOL_GROW = 14;

export interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size: number }
export interface Mark { x: number; z: number; r: number; rot: number; age: number; life: number; grow: number; pool: boolean }

export interface BloodFx {
  /** a hit: a small burst of droplets from (x, y, z), thrown along (dx, dz) */
  burst(x: number, y: number, z: number, dx: number, dz: number, strength?: number): void;
  /** a shot: a brief spray along (dx, dz) and a mark behind */
  spray(x: number, y: number, z: number, dx: number, dz: number): void;
  /** someone is out: a pool grows under them */
  pool(x: number, z: number): void;
}

const KEY = 'gta-bedstuy.blood.v1';
let setting = true;
let loaded = false;
const listeners = new Set<(on: boolean) => void>();

/** The Settings, Game, "Blood" switch (default On). Reads and writes localStorage when it is there; works without it. */
export function bloodOn(): boolean {
  if (!loaded) {
    loaded = true;
    try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; if (v === '0') setting = false; } catch { /* storage may be blocked */ }
  }
  return setting;
}
export function setBlood(on: boolean): void {
  loaded = true; setting = on;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  for (const l of listeners) l(on);
}
export function onBloodChange(fn: (on: boolean) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

export class Blood implements BloodFx {
  readonly drops: Drop[] = [];
  readonly marks: Mark[] = [];
  private seed = 20251122;
  private readonly caps: (typeof BLOOD_CAPS)[Tier];

  constructor(readonly tier: Tier = 'medium', private readonly enabled: () => boolean = bloodOn) { this.caps = BLOOD_CAPS[tier]; }

  private rnd(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  get poolCount(): number { let n = 0; for (const m of this.marks) if (m.pool) n++; return n; }
  get live(): number { return this.drops.length + this.marks.length; }

  burst(x: number, y: number, z: number, dx: number, dz: number, strength = 1): void {
    if (!this.enabled()) return;
    const n = Math.min(this.caps.burst, Math.round(5 + 6 * strength));
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let i = 0; i < n; i++) {
      const a = (this.rnd() - 0.5) * 1.5, c = Math.cos(a), s = Math.sin(a);
      const sp = 1.2 + this.rnd() * 2.6 * strength;
      this.addDrop({ x, y, z, vx: (dx * c - dz * s) * sp, vy: 0.8 + this.rnd() * 1.8, vz: (dx * s + dz * c) * sp, life: 0.9, size: 0.035 + this.rnd() * 0.03 });
    }
    // the first drops that land leave a mark (see update); a hit that bleeds also leaves one right under the victim
    if (strength >= 1) this.addMark(x + dx * 0.5, z + dz * 0.5, 0.1 + this.rnd() * 0.08, false);
  }

  spray(x: number, y: number, z: number, dx: number, dz: number): void {
    if (!this.enabled()) return;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const n = Math.min(this.caps.burst, 8);
    for (let i = 0; i < n; i++) {
      const a = (this.rnd() - 0.5) * 0.8, c = Math.cos(a), s = Math.sin(a), sp = 3 + this.rnd() * 3.5;
      this.addDrop({ x, y, z, vx: (dx * c - dz * s) * sp, vy: 0.3 + this.rnd() * 1.2, vz: (dx * s + dz * c) * sp, life: 0.7, size: 0.028 + this.rnd() * 0.02 });
    }
    this.addMark(x + dx * (0.9 + this.rnd() * 0.8), z + dz * (0.9 + this.rnd() * 0.8), 0.14 + this.rnd() * 0.1, false);
  }

  pool(x: number, z: number): void {
    if (!this.enabled()) return;
    if (this.caps.pools <= 0) { this.addMark(x, z, 0.2, false); return; }
    // one pool per spot: a second call near an existing pool does not add another
    for (const m of this.marks) if (m.pool && Math.hypot(m.x - x, m.z - z) < 0.9) return;
    if (this.poolCount >= this.caps.pools) { const i = this.marks.findIndex((m) => m.pool); if (i >= 0) this.marks.splice(i, 1); }
    this.marks.push({ x, z, r: 0.5 + this.rnd() * 0.12, rot: this.rnd() * 6.28, age: 0, life: POOL_LIFE, grow: POOL_GROW, pool: true });
  }

  private addDrop(d: Drop): void {
    if (this.drops.length >= this.caps.drops) this.drops.shift();
    this.drops.push(d);
  }

  private addMark(x: number, z: number, r: number, pool: boolean): void {
    let cap = this.caps.marks;
    if (cap <= 0) return;
    let plain = 0; for (const m of this.marks) if (!m.pool) plain++;
    if (plain >= cap) { const i = this.marks.findIndex((m) => !m.pool); if (i >= 0) this.marks.splice(i, 1); }
    this.marks.push({ x, z, r, rot: this.rnd() * 6.28, age: 0, life: MARK_LIFE * (0.8 + this.rnd() * 0.4), grow: 0, pool });
    cap = 0;
  }

  /** Alpha of a mark 0..1: full, then fading over the last FADE_SHARE of its life. */
  static alpha(m: Mark): number { const k = m.age / m.life; return k < 1 - FADE_SHARE ? 1 : Math.max(0, (1 - k) / FADE_SHARE); }
  /** Radius of a mark now (a pool grows). */
  static radius(m: Mark): number { return m.grow > 0 ? m.r * (0.25 + 0.75 * Math.min(1, m.age / m.grow)) : m.r; }

  update(dt: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt; d.vy -= 9.5 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y <= 0.05 || d.life <= 0) {
        if (d.y <= 0.05 && this.enabled() && this.rnd() < 0.5) this.addMark(d.x, d.z, 0.04 + this.rnd() * 0.05, false);
        this.drops.splice(i, 1);
      }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.age += dt;
      if (m.age >= m.life) this.marks.splice(i, 1);
    }
  }

  clear(): void { this.drops.length = 0; this.marks.length = 0; }
}
