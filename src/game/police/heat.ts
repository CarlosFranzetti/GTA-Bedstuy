/**
 * POLICE2: the heat model. Pure numbers, no world: PoliceSystem feeds it crimes (with whether anyone saw them) and reads back
 * what to do. Minor acts build HEAT; heat that crosses a line, or a minor act after a warning, is a star; a serious crime that
 * was seen is a star at once. Heat fades on its own in about a minute.
 */
import type { CrimeType } from '@/core/Events';

export const HEAT_MAX = 100;
/** Heat at which the police warn you ("Police are watching"). */
export const HEAT_WARN = 40;
/** Heat at which a star is added; heat then drops to HEAT_AFTER_STAR. */
export const HEAT_STAR = 100;
export const HEAT_AFTER_STAR = 40;
/** Heat lost per second: a full bar is gone in about 77 s, one punch (30) in 23 s. */
export const HEAT_FADE = 1.3;
/** After a warning, one more seen minor act inside this many seconds is a star (you ignored it). */
export const WARN_WINDOW = 15;
/** A minor act on its own never takes the level past this many stars. */
export const MINOR_STAR_CAP = 2;
/** Unseen crimes count for this share of their heat and never reach the star line. */
export const UNSEEN_SHARE = 0.25;
export const UNSEEN_CEILING = HEAT_STAR - 1;
/** The same serious crime gives a star at most once in this many seconds (a volley is one crime). */
export const SERIOUS_COOLDOWN = 4;

/** Heat added by each minor kind. Serious kinds also add heat (so a second incident is closer to the next star). */
export const MINOR_HEAT: Partial<Record<CrimeType, number>> = {
  punch: 30, assault: 20, hitVehicle: 22, hitParked: 22, sidewalkDriving: 25, redLight: 20, thrownHit: 50,
};
/** Serious kinds: `stars` added when seen, up to `cap` stars. */
export const SERIOUS: Partial<Record<CrimeType, { stars: number; cap: number; heat: number }>> = {
  hitPed: { stars: 1, cap: 2, heat: 60 },
  hitCop: { stars: 1, cap: 3, heat: 60 },
  carjack: { stars: 1, cap: 2, heat: 50 },
  gunshot: { stars: 1, cap: 2, heat: 40 },
};
export const isSerious = (t: CrimeType): boolean => t in SERIOUS;

export interface HeatResult {
  /** stars the police should now be at (never lower than `stars` passed in) */
  stars: number;
  /** why a star was added, for the toast; null when none */
  reason: 'heat' | 'ignored-warning' | 'serious' | null;
  /** true the first time heat reaches the warning line (and again after it has fully faded) */
  warned: boolean;
}

export class HeatModel {
  heat = 0;
  /** seconds since the last warning, Infinity when none is active */
  sinceWarn = Infinity;
  private warnArmed = true;
  private grace = 0;
  private readonly seriousAt = new Map<CrimeType, number>();
  private clock = 0;

  /** No minor heat for the next `seconds` of play time (the first minutes of a new game, the tutorial). */
  setGrace(seconds: number): void { this.grace = Math.max(0, seconds); }
  get graceLeft(): number { return this.grace; }
  get warning(): boolean { return this.sinceWarn <= WARN_WINDOW; }

  update(dt: number): void {
    this.clock += dt;
    if (this.grace > 0) this.grace = Math.max(0, this.grace - dt);
    if (this.heat > 0) this.heat = Math.max(0, this.heat - HEAT_FADE * dt);
    if (this.sinceWarn !== Infinity) { this.sinceWarn += dt; if (this.sinceWarn > WARN_WINDOW) this.sinceWarn = Infinity; }
    if (this.heat < HEAT_WARN * 0.5) this.warnArmed = true;
  }

  /** Clear everything (a bust, a new game). The grace period is kept. */
  reset(): void { this.heat = 0; this.sinceWarn = Infinity; this.warnArmed = true; this.seriousAt.clear(); }

  /** A crime happened. `seen`: someone could see (or, for a gunshot, hear) it. `stars`: the current level. */
  crime(type: CrimeType, seen: boolean, stars: number): HeatResult {
    const out: HeatResult = { stars, reason: null, warned: false };
    const sr = SERIOUS[type];
    const minor = MINOR_HEAT[type];
    if (sr === undefined && minor === undefined) return out; // hitVehicle-like nothing: not a heat crime
    if (sr === undefined && this.grace > 0) return out;       // grace: minor acts are free
    const base = sr ? sr.heat : (minor as number);
    if (!seen) {
      this.heat = Math.min(UNSEEN_CEILING, Math.max(this.heat, 0) + base * UNSEEN_SHARE);
      return out;
    }
    const ignored = !sr && this.warning;
    this.heat = Math.min(HEAT_MAX, this.heat + base);
    if (sr) {
      const last = this.seriousAt.get(type);
      if (last === undefined || this.clock - last >= SERIOUS_COOLDOWN) {
        this.seriousAt.set(type, this.clock);
        const next = Math.min(sr.cap, Math.max(stars, 0) + sr.stars);
        if (next > out.stars) { out.stars = next; out.reason = 'serious'; }
      }
    } else if (ignored && stars < MINOR_STAR_CAP) {
      out.stars = stars + 1; out.reason = 'ignored-warning'; this.sinceWarn = Infinity;
    }
    if (out.reason === null && this.heat >= HEAT_STAR && stars < (sr ? 3 : MINOR_STAR_CAP)) {
      out.stars = stars + 1; out.reason = 'heat';
    }
    if (out.reason !== null) { this.heat = Math.min(this.heat, HEAT_AFTER_STAR); this.sinceWarn = Infinity; }
    else if (this.heat >= HEAT_WARN && this.warnArmed && stars === 0) { this.warnArmed = false; this.sinceWarn = 0; out.warned = true; }
    return out;
  }
}
