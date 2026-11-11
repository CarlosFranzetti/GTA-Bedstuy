/**
 * Rhythm profiles (lane PROSODY): how each cast member paces speech, apart from the voice preset. Keyed by cast id so
 * cast.ts stays untouched. Anyone not listed (a new host, a pedestrian, a story character) gets a profile derived from
 * a hash of the id, so no two of them share a rhythm. Columns:
 *   rate pause energy unsteadiness gravity (expanded to the full Rhythm in P)
 */
import { hash32 } from './script';
import type { Rhythm } from './prosody';

/** rate, pause, energy (rushing, interrupting, leaning on words), unsteadiness (how uneven tempo and pauses are), gravity (dragging, slowing at the end of a sentence). */
const P = ([rate, pause, e, u, g]: readonly number[]): Rhythm => ({
  rate, pause, spread: 0.015 + 0.12 * u, pauseSpread: 0.05 + 0.5 * u, rush: 0.5 * e, drag: 0.4 * g, finalSlow: 0.16 * g,
  emphasis: 0.1 + 0.35 * e, turn: pause * (1.1 - 0.4 * e), pickup: 0.8 * Math.max(0, e - 0.3),
});

export const RHYTHMS: Readonly<Record<string, Rhythm>> = Object.fromEntries(Object.entries({
  // music DJs
  deja: [0.98, 1.25, 0.15, 0.3, 0.5], odell: [0.96, 1.8, 0, 0.4, 0.8], tayo: [1.04, 0.55, 0.8, 0.4, 0.05], lou: [0.96, 1.55, 0.05, 0.3, 0.9],
  wren: [0.96, 1.7, 0.1, 0.7, 0.7], pearl: [1.02, 0.95, 0.35, 0.5, 0.35], tommy: [1.06, 0.5, 0.9, 0.3, 0.05], lucho: [1.05, 0.65, 0.6, 0.4, 0.05],
  cass: [1, 1, 0.1, 0.1, 0.3],
  // talk hosts and guests
  buck: [1.02, 0.75, 0.75, 0.4, 0.3], lorraine: [0.98, 1.35, 0.1, 0.4, 0.7], boards: [1.04, 0.8, 0.5, 0.25, 0.15], candace: [1.04, 0.7, 0.6, 0.35, 0.1],
  garrett: [1, 1.05, 0.2, 0.6, 0.3], odessa: [0.96, 1.2, 0, 0.1, 0.6], abernathy: [0.96, 1.3, 0.1, 0.5, 0.7], delacroix: [1.02, 0.8, 0.6, 0.45, 0.2],
  juniper: [0.96, 1.6, 0, 0.3, 0.8], declan: [1.06, 0.7, 0.7, 0.35, 0.1], hollis: [0.95, 1.4, 0, 0.1, 0.7], winston: [0.94, 1.6, 0, 0.6, 0.9],
  marisol: [1.04, 0.8, 0.6, 0.45, 0.2], dana: [1.02, 0.95, 0.1, 0.1, 0.6],
  // callers
  hakim: [1.02, 0.95, 0.3, 0.5, 0.3], tanya: [1.06, 0.65, 0.7, 0.45, 0.1], kiki: [1.08, 0.7, 0.5, 0.8, 0], gerald: [0.98, 1, 0.4, 0.3, 0.45],
  gus: [1.08, 0.55, 0.9, 0.6, 0.1], tillman: [0.94, 1.5, 0, 0.3, 0.8], rosa: [0.98, 1.3, 0.1, 0.5, 0.6], dev: [1.06, 0.95, 0.4, 1, 0],
  // ads and machines: even, little spread, nobody interrupts
  trent: [1.08, 0.6, 0.3, 0.1, 0.1], noelle: [0.98, 1.15, 0, 0.1, 0.5], smartspeaker: [1, 1, 0, 0, 0],
}).map(([k, v]) => [k, P(v)]));

const cache = new Map<string, Rhythm>();

/** Profile of a speaker id; unlisted ids get a stable one derived from the id (peds, story characters, new hosts). */
export function rhythmFor(id: string): Rhythm {
  const hit = RHYTHMS[id] ?? cache.get(id);
  if (hit) return hit;
  const h = parseInt(hash32(`rhythm|${id}`), 16);
  const u = (k: number) => ((h >>> (k * 5)) & 31) / 31;
  const r = P([0.94 + 0.12 * u(0), 0.7 + 0.8 * u(1), 0.7 * u(2), 0.7 * u(3), 0.7 * u(4)]);
  cache.set(id, r);
  return r;
}
