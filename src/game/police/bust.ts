/**
 * POLICE2: what a bust costs and does. `applyBust` is the whole consequence in one place so it can be tested without the game:
 * the fine (never below zero cash), the carried weapons, the clock, the wanted level, the bust count and the door of the precinct.
 * The player's car stays where it was; nobody is hurt.
 */
import type { PrecinctSite } from './precincts';

/** Fine by stars at the moment of arrest (0 stars is a plain arrest for a warning ignored), plus a surcharge for resisting. */
export const FINE_BY_STARS = [30, 50, 120, 250] as const;
export const RESIST_SURCHARGE = 25;
/** The hours that pass in the cells: 3 plus the stars. */
export const hoursInCustody = (stars: number): number => 3 + Math.max(0, Math.min(3, stars));

export function fineFor(stars: number, resisted: boolean, cash: number): number {
  const s = Math.max(0, Math.min(3, Math.round(stars)));
  const fine = FINE_BY_STARS[s] + (resisted ? RESIST_SURCHARGE : 0);
  return Math.max(0, Math.min(fine, Math.floor(Math.max(0, cash))));
}

/** What the game has to do for a bust; main.ts builds one from the live objects. */
export interface BustHost {
  cash(): number;
  /** negative to take cash; the wallet clamps at zero */
  addCash(n: number): void;
  /** empty the hands: bottles, bricks, the pistol and its rounds, the held item */
  dropWeapons(): void;
  /** leave any car and any interior, then stand at the precinct door facing the street; the car stays put */
  teleport(site: PrecinctSite): void;
  advanceClock(hours: number): void;
  clearWanted(): void;
  addBust(): void;
}

export interface BustInfo { stars: number; resisted: boolean }
export interface BustResult { fine: number; hours: number; precinct: string }

export function applyBust(host: BustHost, info: BustInfo, site: PrecinctSite): BustResult {
  const fine = fineFor(info.stars, info.resisted, host.cash());
  if (fine > 0) host.addCash(-fine);
  host.dropWeapons();
  host.clearWanted();
  const hours = hoursInCustody(info.stars);
  host.advanceClock(hours);
  host.teleport(site);
  host.addBust();
  return { fine, hours, precinct: site.name };
}
