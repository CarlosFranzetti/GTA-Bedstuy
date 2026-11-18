/**
 * Per-speaker voice tuning at playback (SOUNDCHECK). The baked clips come from a handful of neural voices, and several cast
 * members share one (three speakers use am_eric, two use af_river, ...). Each speaker gets a small fixed pitch offset applied
 * to the baked audio when it plays, so two people on the same preset still sound like two people, and nothing is re-baked.
 * A buffer source cannot change pitch and tempo apart (it resamples), so the offset moves tempo with it: +100 cents is a
 * semitone higher and 5.9 % faster, which also fits the way people sound (a higher voice talks a little quicker).
 * Pedestrians have their own offsets (peds/assign.ts).
 */
import { hash32 } from './script';

export interface Tune { cents: number }

/** Offsets chosen by hand for speakers that share a Kokoro preset: the pair (or trio) is spread apart. */
const SHARED: Readonly<Record<string, Tune>> = {
  // am_eric: Lucho (DJ), Garrett (guest), Dev (caller)
  lucho: { cents: 70 }, garrett: { cents: -90 }, dev: { cents: 150 },
  // am_michael: Velvet Lou (DJ), Gus (caller)
  lou: { cents: -60 }, gus: { cents: 90 },
  // af_river: Rosa, Mrs. Delacroix
  rosa: { cents: 60 }, delacroix: { cents: -110 },
  // af_alloy: Candace, the smart speaker
  candace: { cents: 40 }, smartspeaker: { cents: -50 },
  // af_heart: Juniper, Noelle
  juniper: { cents: -40 }, noelle: { cents: 70 },
  // bm_daniel: Reverend Tillman, Hollis
  tillman: { cents: -100 }, hollis: { cents: 60 },
  // bm_lewis: Abernathy, Gerald, Trent
  abernathy: { cents: -90 }, gerald: { cents: 20 }, trent: { cents: 110 },
};

const cache = new Map<string, Tune>();

/** Tuning of a speaker id: the hand-set offsets above, or a stable small offset derived from the id (about +/- 35 cents). */
export function tuneFor(id: string): Tune {
  const hit = SHARED[id] ?? cache.get(id);
  if (hit) return hit;
  const h = parseInt(hash32(`tune|${id}`), 16);
  const t: Tune = { cents: Math.round((((h >>> 0) & 63) / 63 * 2 - 1) * 35) };
  cache.set(id, t);
  return t;
}

/** Buffer-source numbers for a tuning: the rate that gives the pitch (tempo follows it; use it for the length of the clip on the timeline). */
export const playbackRateFor = (t: Tune): number => 2 ** (t.cents / 1200);
