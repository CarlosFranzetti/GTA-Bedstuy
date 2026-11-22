/**
 * COMBAT2: the player's health. Until now the game had none: a fight could not hurt you. Now a person who fights back lands punches
 * (7, 7 and a heavier 12): each one staggers the player, two close together (or a heavy one) put him on the ground for a moment,
 * and health at zero knocks him out: he wakes outside the hospital (the "Wexcombe Medical Center" landmark on the real map, home on
 * the grid) a few hours later with a bill. Health comes back slowly when nobody has hit him for a while. Pure state, no three.js.
 */
import type { Vec2 } from '@/core/Math2';
import type { PrecinctRow } from '@/game/police/precincts';

export const PLAYER_HEALTH = 100;
/** Seconds without a hit before health starts to come back, and how fast (per second). */
export const REGEN_DELAY = 10;
export const REGEN_RATE = 2.2;
/** A stagger holds the player this long (movement is cut), a knock-down this long. */
export const STAGGER_SECONDS = 0.35;
export const DOWN_SECONDS = 1.7;
/** A second hit within this many seconds, or one at least this heavy, knocks the player down. */
export const DOWN_WINDOW = 1.6;
export const HEAVY_HIT = 12;
/** The bill for the hospital, never more than the cash in hand, and the hours that pass. */
export const HOSPITAL_BILL = 75;
export const HOSPITAL_HOURS = 7;
export const REAL_HOSPITAL_LANDMARK_ID = 'wexcombe-medical-center';

export type PlayerHit = 'stagger' | 'down' | 'out' | 'ignored';

export class PlayerVitals {
  health = PLAYER_HEALTH;
  /** seconds of staggering / lying left */
  stun = 0;
  downT = 0;
  private since = 99;
  /** set while out, until `wake` */
  out = false;
  /** blows taken since the last reset (tests, stats) */
  hits = 0;

  get fraction(): number { return this.health / PLAYER_HEALTH; }
  get down(): boolean { return this.downT > 0; }
  /** the player cannot move or act */
  get stunned(): boolean { return this.stun > 0 || this.downT > 0 || this.out; }

  hurt(damage: number): PlayerHit {
    if (this.out) return 'ignored';
    const close = this.since < DOWN_WINDOW;
    this.since = 0; this.hits++;
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) { this.out = true; this.stun = 0; this.downT = 3; return 'out'; }
    if (this.downT > 0) return 'down';
    if (close || damage >= HEAVY_HIT) { this.downT = DOWN_SECONDS; this.stun = 0; return 'down'; }
    this.stun = STAGGER_SECONDS;
    return 'stagger';
  }

  update(dt: number): void {
    this.since += dt;
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    if (this.downT > 0 && !this.out) this.downT = Math.max(0, this.downT - dt);
    if (!this.out && this.since > REGEN_DELAY && this.health < PLAYER_HEALTH) this.health = Math.min(PLAYER_HEALTH, this.health + REGEN_RATE * dt);
  }

  /** Back on his feet after the hospital: most of the health, nothing stunned. */
  wake(): void { this.out = false; this.stun = 0; this.downT = 0; this.health = Math.round(PLAYER_HEALTH * 0.7); this.since = 0; }
  reset(): void { this.out = false; this.stun = 0; this.downT = 0; this.health = PLAYER_HEALTH; this.since = 99; this.hits = 0; }
}

// ---------------------------------------------------------------------------------------------------- the hospital

export interface HospitalSite { id: string; name: string; spot: Vec2; heading: number }

/** Where he wakes. Real map: 2.2 m out from the middle of the hospital landmark's frontage (snapped to a pavement); grid: at home. */
export function hospitalFor(map: 'grid' | 'real', home: Vec2, rows: readonly PrecinctRow[] = [], snap?: (p: Vec2) => Vec2): HospitalSite {
  const r = map === 'real' ? rows.find((x) => x.id === REAL_HOSPITAL_LANDMARK_ID) : undefined;
  if (r) {
    const s = r.site;
    const door = { x: s.ax + s.fx * s.w / 2, z: s.az + s.fz * s.w / 2 };
    const out = { x: door.x - s.nx * 2.2, z: door.z - s.nz * 2.2 };
    return { id: r.id, name: r.name, spot: snap ? snap(out) : out, heading: Math.atan2(-s.nx, s.nz) };
  }
  return { id: 'home', name: 'home', spot: { x: home.x, z: home.z }, heading: 0 };
}

export interface WakeHost {
  cash(): number;
  addCash(n: number): void;
  teleport(site: HospitalSite): void;
  advanceClock(hours: number): void;
  say(text: string): void;
}

/** Everything that happens when the player is knocked out, in one place (like `applyBust`). */
export function applyKnockout(host: WakeHost, vitals: PlayerVitals, site: HospitalSite): { bill: number; hours: number } {
  const bill = Math.max(0, Math.min(HOSPITAL_BILL, Math.floor(Math.max(0, host.cash()))));
  if (bill > 0) host.addCash(-bill);
  host.advanceClock(HOSPITAL_HOURS);
  host.teleport(site);
  vitals.wake();
  host.say(site.id === 'home' ? `You come to at home. Bill for the stitches: $${bill}.` : `You come to outside ${site.name}. The bill: $${bill}.`);
  return { bill, hours: HOSPITAL_HOURS };
}
