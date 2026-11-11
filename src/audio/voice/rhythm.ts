/**
 * Rhythm profiles (lane PROSODY): how each cast member paces speech, apart from the voice preset. Keyed by cast id so
 * cast.ts stays untouched. Anyone not listed (a new host, a pedestrian, a story character) gets a profile derived from
 * a hash of the id, so no two of them share a rhythm. Columns:
 *   rate spread pause pauseSpread rush drag finalSlow emphasis turn pickup
 */
import { hash32 } from './script';
import type { Rhythm } from './prosody';

const P = (a: readonly number[]): Rhythm => ({ rate: a[0], spread: a[1], pause: a[2], pauseSpread: a[3], rush: a[4], drag: a[5], finalSlow: a[6], emphasis: a[7], turn: a[8], pickup: a[9] });

export const RHYTHMS: Readonly<Record<string, Rhythm>> = {
  // music DJs
  deja: P([0.98, 0.06, 1.25, 0.3, 0.05, 0.25, 0.1, 0.25, 1.1, 0.1]),
  odell: P([0.96, 0.05, 1.8, 0.35, 0, 0.4, 0.14, 0.3, 1.5, 0]),
  tayo: P([1.04, 0.1, 0.55, 0.3, 0.4, 0.05, 0.02, 0.3, 0.5, 0.45]),
  lou: P([0.96, 0.05, 1.55, 0.3, 0, 0.35, 0.16, 0.3, 1.3, 0.05]),
  wren: P([0.96, 0.09, 1.7, 0.55, 0.05, 0.4, 0.12, 0.2, 1.4, 0]),
  pearl: P([1.02, 0.08, 0.95, 0.4, 0.15, 0.15, 0.06, 0.4, 0.8, 0.3]),
  tommy: P([1.06, 0.11, 0.5, 0.25, 0.45, 0.04, 0.01, 0.35, 0.45, 0.5]),
  lucho: P([1.04, 0.09, 0.7, 0.3, 0.3, 0.08, 0.03, 0.3, 0.6, 0.35]),
  cass: P([1.0, 0.04, 1.0, 0.15, 0.05, 0.1, 0.05, 0.2, 1, 0.05]),
  // talk hosts
  buck: P([1.02, 0.07, 0.75, 0.3, 0.2, 0.2, 0.08, 0.45, 0.55, 0.5]),
  lorraine: P([0.98, 0.06, 1.35, 0.35, 0.05, 0.25, 0.12, 0.25, 1.15, 0.1]),
  boards: P([1.04, 0.08, 0.8, 0.25, 0.25, 0.05, 0.03, 0.15, 0.7, 0.3]),
  candace: P([1.04, 0.1, 0.7, 0.3, 0.3, 0.05, 0.02, 0.5, 0.6, 0.35]),
  garrett: P([1.0, 0.07, 1.05, 0.45, 0.1, 0.3, 0.05, 0.4, 0.95, 0.15]),
  odessa: P([0.96, 0.03, 1.2, 0.12, 0, 0.1, 0.1, 0.2, 1.2, 0]),
  abernathy: P([0.96, 0.06, 1.3, 0.4, 0.05, 0.3, 0.12, 0.35, 1.2, 0.25]),
  delacroix: P([1.02, 0.09, 0.8, 0.35, 0.3, 0.1, 0.04, 0.45, 0.6, 0.45]),
  juniper: P([0.96, 0.04, 1.6, 0.25, 0, 0.3, 0.14, 0.15, 1.4, 0]),
  declan: P([1.06, 0.1, 0.7, 0.3, 0.35, 0.05, 0.02, 0.3, 0.6, 0.35]),
  hollis: P([0.95, 0.03, 1.4, 0.15, 0, 0.2, 0.13, 0.2, 1.25, 0.05]),
  winston: P([0.94, 0.06, 1.6, 0.45, 0, 0.45, 0.15, 0.35, 1.3, 0.05]),
  marisol: P([1.04, 0.1, 0.8, 0.35, 0.3, 0.1, 0.04, 0.45, 0.55, 0.45]),
  dana: P([1.02, 0.03, 0.95, 0.12, 0.05, 0.05, 0.1, 0.15, 0.9, 0]),
  // callers
  hakim: P([1.02, 0.08, 0.95, 0.4, 0.15, 0.15, 0.05, 0.3, 0.8, 0.2]),
  tanya: P([1.06, 0.1, 0.65, 0.35, 0.35, 0.08, 0.02, 0.45, 0.5, 0.5]),
  kiki: P([1.08, 0.12, 0.7, 0.5, 0.3, 0.15, 0, 0.2, 0.7, 0.3]),
  gerald: P([0.98, 0.05, 1.0, 0.25, 0.1, 0.2, 0.08, 0.4, 0.85, 0.35]),
  gus: P([1.08, 0.13, 0.55, 0.45, 0.45, 0.1, 0.02, 0.5, 0.45, 0.5]),
  tillman: P([0.94, 0.04, 1.5, 0.25, 0, 0.3, 0.14, 0.3, 1.3, 0]),
  rosa: P([0.98, 0.07, 1.3, 0.4, 0.05, 0.3, 0.1, 0.25, 1.1, 0.05]),
  dev: P([1.06, 0.15, 0.95, 0.6, 0.3, 0.2, 0, 0.1, 0.75, 0.15]),
  // ads and machines: even, little spread
  trent: P([1.08, 0.04, 0.6, 0.12, 0.45, 0, 0.02, 0.2, 0.6, 0]),
  noelle: P([0.98, 0.03, 1.15, 0.1, 0, 0.05, 0.07, 0.15, 1, 0]),
  smartspeaker: P([1, 0.01, 1, 0.05, 0, 0, 0, 0, 1, 0]),
};

const cache = new Map<string, Rhythm>();

/** Profile of a speaker id; unlisted ids get a stable one derived from the id (peds, story characters, new hosts). */
export function rhythmFor(id: string): Rhythm {
  const hit = RHYTHMS[id] ?? cache.get(id);
  if (hit) return hit;
  const h = parseInt(hash32(`rhythm|${id}`), 16);
  const u = (k: number) => ((h >>> (k * 5)) & 31) / 31;
  const r = P([0.94 + 0.12 * u(0), 0.04 + 0.08 * u(1), 0.7 + 0.8 * u(2), 0.15 + 0.35 * u(3), 0.35 * u(4), 0.3 * u(5), 0.1 * u(0), 0.1 + 0.3 * u(1), 0.6 + 0.8 * u(2), 0.4 * u(3)]);
  cache.set(id, r);
  return r;
}
