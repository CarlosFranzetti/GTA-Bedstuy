/** Horn and siren specs per vehicle type (pure data; nodes.ts plays them). */
import type { VehicleType } from '@/world/types';

export type HornKind = 'car' | 'cab' | 'air' | 'beep' | 'siren' | 'weak';
export interface HornSpec {
  kind: HornKind;
  /** root Hz and the other tones as ratios to the root: minor third 1.189, major third 1.26, fourth 1.335 */
  root: number; ratios: number[];
  wave: OscillatorType; lp: number; atk: number; rel: number; gain: number;
  /** siren modes this vehicle cycles through with each press */
  modes?: SirenMode[];
  /** backup beeper while reversing */
  beeper?: boolean;
}
export type SirenMode = 'wail' | 'yelp' | 'whoop' | 'hilo' | 'parody';

const m3 = 1.189, M3 = 1.26, P4 = 1.335;

export const HORNS: Record<VehicleType, HornSpec> = {
  sedan:     { kind: 'car',   root: 415, ratios: [1, M3],        wave: 'square',   lp: 2600, atk: 0.012, rel: 0.09, gain: 1 },
  suv:       { kind: 'car',   root: 349, ratios: [1, m3],        wave: 'square',   lp: 2200, atk: 0.015, rel: 0.1,  gain: 1 },
  cab:       { kind: 'cab',   root: 440, ratios: [1, P4],        wave: 'sawtooth', lp: 3000, atk: 0.008, rel: 0.06, gain: 1.1 },
  cop:       { kind: 'siren', root: 400, ratios: [1, M3],        wave: 'square',   lp: 2600, atk: 0.01,  rel: 0.1,  gain: 1, modes: ['wail', 'whoop', 'yelp'] },
  boxtruck:  { kind: 'air',   root: 140, ratios: [1, 1.26, 1.5], wave: 'sawtooth', lp: 1100, atk: 0.11,  rel: 0.28, gain: 1.1 },
  cargovan:  { kind: 'car',   root: 370, ratios: [1, P4],        wave: 'sawtooth', lp: 2000, atk: 0.02,  rel: 0.12, gain: 1 },
  hatch:     { kind: 'beep',  root: 880, ratios: [1],            wave: 'square',   lp: 4200, atk: 0.005, rel: 0.04, gain: 0.8 },
  beater:    { kind: 'weak',  root: 330, ratios: [1, m3],        wave: 'sawtooth', lp: 1400, atk: 0.03,  rel: 0.2,  gain: 0.75 },
  bus:       { kind: 'air',   root: 165, ratios: [1, 1.19, 1.5], wave: 'sawtooth', lp: 1300, atk: 0.14,  rel: 0.35, gain: 1.2 },
  pickup:    { kind: 'car',   root: 294, ratios: [1, M3],        wave: 'square',   lp: 1800, atk: 0.02,  rel: 0.12, gain: 1.1 },
  crossover: { kind: 'car',   root: 466, ratios: [1, m3],        wave: 'square',   lp: 3000, atk: 0.01,  rel: 0.08, gain: 0.95 },
  minivan:   { kind: 'car',   root: 523, ratios: [1, P4],        wave: 'triangle', lp: 3400, atk: 0.015, rel: 0.08, gain: 1.1 },
  luxury:    { kind: 'car',   root: 349, ratios: [1, P4],        wave: 'triangle', lp: 1500, atk: 0.04,  rel: 0.2,  gain: 1 },
  towncar:   { kind: 'car',   root: 330, ratios: [1, P4, 1.68],  wave: 'sawtooth', lp: 1700, atk: 0.03,  rel: 0.18, gain: 1 },
  pony:      { kind: 'car',   root: 370, ratios: [1, M3],        wave: 'sawtooth', lp: 4200, atk: 0.006, rel: 0.07, gain: 1.15 },
  garbage:   { kind: 'air',   root: 120, ratios: [1, 1.19, 1.5], wave: 'sawtooth', lp: 900,  atk: 0.16,  rel: 0.4,  gain: 1.2, beeper: true },
  ambulance: { kind: 'siren', root: 660, ratios: [1],            wave: 'square',   lp: 2800, atk: 0.02,  rel: 0.12, gain: 1, modes: ['wail', 'yelp', 'hilo', 'parody'] },
  dollarvan: { kind: 'car',   root: 392, ratios: [1, 1.13],      wave: 'square',   lp: 2400, atk: 0.01,  rel: 0.07, gain: 1 },
};

export function hornFor(type: string | null | undefined): HornSpec {
  return (HORNS as Record<string, HornSpec | undefined>)[type ?? ''] ?? HORNS.sedan;
}

/** Tone frequencies (Hz) of a horn; the rare novelty variant is handled by nodes.ts. */
export const hornTones = (h: HornSpec): number[] => h.ratios.map((r) => h.root * r);

/** Instantaneous siren pitch in Hz at time t seconds since the siren started. */
export function sirenHz(mode: SirenMode, t: number): number {
  const ph = (p: number) => ((t / p) % 1 + 1) % 1;
  switch (mode) {
    case 'wail': { const x = ph(3.4); return 620 * 2 ** (1.15 * (x < 0.5 ? x * 2 : 2 - x * 2)); }
    case 'yelp': { const x = ph(0.26); return 620 * 2 ** (1.15 * (x < 0.5 ? x * 2 : 2 - x * 2)); }
    case 'whoop': { const x = ph(0.7); return x < 0.45 ? 380 * 2 ** (2 * (x / 0.45)) : 0; }
    case 'hilo': return ph(0.9) < 0.5 ? 660 : 880;
    case 'parody': return ph(1.2) < 0.34 ? 523 : ph(1.2) < 0.67 ? 659 : 784;
  }
}

/** Mode used on the nth press of a siren vehicle's horn. */
export const sirenModeFor = (h: HornSpec, press: number): SirenMode => {
  const m = h.modes ?? ['wail'];
  return m[((press % m.length) + m.length) % m.length];
};

/** Rate limit for AI honks: min gap per car, and a cap on honks in a rolling window across the street. */
export class HonkLimiter {
  private last = new Map<string, number>();
  private recent: number[] = [];
  constructor(private readonly gap = 2.5, private readonly cap = 3, private readonly window = 2) {}
  allow(id: string, now: number): boolean {
    this.recent = this.recent.filter((t) => now - t < this.window);
    if (this.recent.length >= this.cap) return false;
    if (now - (this.last.get(id) ?? -1e9) < this.gap) return false;
    this.last.set(id, now);
    this.recent.push(now);
    if (this.last.size > 64) for (const [k, t] of this.last) if (now - t > 30) this.last.delete(k);
    return true;
  }
}
