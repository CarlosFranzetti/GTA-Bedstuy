/**
 * One-shot sound recipes (doors, kerb, impacts, footsteps, jump/land, UI, indicator, brakes) as pure layer
 * data, plus a tiny player. A layer is a noise burst or an oscillator tone with an attack/decay envelope.
 */
import type { VehicleType } from '@/world/types';

export type Layer =
  | { k: 'n'; t: number; d: number; p: number; f: BiquadFilterType; hz: number; to?: number; q?: number }
  | { k: 'o'; t: number; d: number; p: number; w: OscillatorType; hz: number; to?: number; lp?: number };

const n = (t: number, d: number, p: number, f: BiquadFilterType, hz: number, to?: number, q?: number): Layer => ({ k: 'n', t, d, p, f, hz, to, q });
const o = (t: number, d: number, p: number, w: OscillatorType, hz: number, to?: number, lp?: number): Layer => ({ k: 'o', t, d, p, w, hz, to, lp });

export type DoorClass = 'car' | 'van' | 'bus' | 'truck';
export const DOOR_CLASS: Record<VehicleType, DoorClass> = {
  sedan: 'car', suv: 'car', cab: 'car', cop: 'car', hatch: 'car', beater: 'car', crossover: 'car', luxury: 'car', towncar: 'car', pony: 'car', pickup: 'truck',
  coupe911: 'car', exotic: 'car', jdmcoupe: 'car', hothatch: 'car', muscle: 'car', evsedan: 'car', wedgetruck: 'truck',
  boxtruck: 'truck', garbage: 'truck', cargovan: 'van', minivan: 'van', ambulance: 'van', dollarvan: 'van', bus: 'bus',
};

/** Door open (latch click, hinge) or close (clunk) by body class; luxury closes softer, the beater rattles. */
export function doorLayers(type: string, open: boolean): Layer[] {
  const c = (DOOR_CLASS as Record<string, DoorClass | undefined>)[type] ?? 'car';
  const soft = type === 'luxury' ? 0.6 : 1;
  if (c === 'bus') {
    return open
      ? [n(0, 0.55, 0.5, 'highpass', 3500, 1500), o(0.08, 0.25, 0.4, 'sine', 90, 60), n(0.4, 0.12, 0.3, 'lowpass', 400)]
      : [n(0, 0.5, 0.45, 'highpass', 3000, 1200), o(0.35, 0.18, 0.7, 'sine', 80, 45), n(0.35, 0.1, 0.5, 'lowpass', 600)];
  }
  if (c === 'van') {
    return open
      ? [n(0, 0.06, 0.4, 'highpass', 2500), n(0.05, 0.5, 0.25, 'bandpass', 700, 300, 2), o(0.5, 0.1, 0.4, 'sine', 120, 70)]
      : [n(0, 0.35, 0.2, 'bandpass', 800, 400, 2), o(0.3, 0.16, 0.8, 'sine', 100, 50), n(0.3, 0.1, 0.6, 'lowpass', 1200)];
  }
  const w = c === 'truck' ? 0.8 : 0.5;
  const base: Layer[] = open
    ? [n(0, 0.04, 0.35, 'highpass', 3000), n(0.03, 0.2, 0.15, 'bandpass', 500, 300, 3)]
    : [o(0, 0.14, 0.7 * soft, 'sine', 140 - w * 30, 55), n(0, 0.09, 0.55 * soft, 'lowpass', 1600, 300), n(0.04, 0.05, 0.25 * soft, 'highpass', 3500)];
  if (type === 'beater' && !open) base.push(n(0.05, 0.3, 0.2, 'bandpass', 2400, 1800, 6));
  return base;
}

/** Suspension thump on a kerb or pothole, strength 0..1. */
export const kerbLayers = (s: number): Layer[] => [o(0, 0.16, 0.5 * s, 'sine', 95, 40), n(0, 0.1, 0.35 * s, 'lowpass', 700, 150)];
/** Bus air brake hiss. */
export const airBrakeLayers = (): Layer[] => [n(0, 0.7, 0.45, 'highpass', 3800, 2000), n(0, 0.3, 0.2, 'bandpass', 1800, 900, 1)];
/** Worn-pad brake squeal (beater, bus). */
export const brakeSquealLayers = (hz = 2900): Layer[] => [n(0, 0.45, 0.28, 'bandpass', hz * 1.1, hz * 0.85, 16), o(0, 0.45, 0.04, 'sine', hz * 1.1, hz * 0.85)];
/** Indicator relay tick (on) and tock (off). */
export const indicatorLayers = (on: boolean): Layer[] => [n(0, 0.018, 0.5, 'bandpass', on ? 2600 : 1900, undefined, 4), o(0, 0.02, 0.15, 'square', on ? 1400 : 1000)];
/** Reverse beeper pulse (garbage truck, 1 kHz). */
export const beepLayers = (): Layer[] => [o(0, 0.3, 0.3, 'square', 1000, undefined, 2500)];
/** Glass break and metal crunch, scaled by strength 0..1; glass above a threshold. */
export function crashLayers(s: number): Layer[] {
  const L: Layer[] = [n(0, 0.28, 0.18 * s, 'lowpass', 2600, 180), o(0, 0.18, 0.2 * s, 'sine', 110, 40), n(0.01, 0.35, 0.12 * s, 'bandpass', 900, 500, 3)];
  if (s > 0.45) for (let i = 0; i < 6; i++) L.push(n(0.02 + i * 0.045, 0.1, 0.08 * s, 'bandpass', 5200 + i * 600, undefined, 1.5));
  return L;
}

export type Surface = 'asphalt' | 'concrete' | 'grass' | 'gravel' | 'wood' | 'metal' | 'puddle' | 'cobble';
export const SURFACES: Surface[] = ['asphalt', 'concrete', 'grass', 'gravel', 'wood', 'metal', 'puddle', 'cobble'];
const STEP: Record<Surface, [BiquadFilterType, number, number, number]> = {
  asphalt: ['lowpass', 1500, 0.05, 0.3], concrete: ['bandpass', 1900, 0.04, 0.35], grass: ['lowpass', 650, 0.09, 0.2], gravel: ['highpass', 2600, 0.09, 0.3],
  wood: ['bandpass', 750, 0.06, 0.4], metal: ['bandpass', 2300, 0.07, 0.35], puddle: ['bandpass', 1200, 0.14, 0.35], cobble: ['bandpass', 1300, 0.05, 0.4],
};
/** Footstep on a surface; `run` is louder and shorter. */
export function footstepLayers(s: Surface, run = false): Layer[] {
  const [f, hz, d, p] = STEP[s] ?? STEP.asphalt;
  const k = run ? 1.3 : 1;
  const L: Layer[] = [n(0, d, p * k, f, hz, hz * 0.5, 1.2), o(0, 0.07, 0.25 * k, 'sine', 120, 60)];
  if (s === 'metal') L.push(o(0, 0.2, 0.06, 'sine', 780));
  if (s === 'gravel') for (let i = 1; i < 4; i++) L.push(n(i * 0.02, 0.03, 0.12, 'highpass', 4000));
  return L;
}
/** Jump: a short cloth whoosh with a push-off thud. */
export const jumpLayers = (): Layer[] => [n(0, 0.22, 0.2, 'bandpass', 700, 1800, 1), o(0, 0.1, 0.3, 'sine', 130, 70)];
/** Landing, strength 0..1. */
export const landLayers = (s: number): Layer[] => [o(0, 0.18, 0.7 * s, 'sine', 110, 45), n(0, 0.12, 0.5 * s, 'lowpass', 1300, 250), n(0.02, 0.2, 0.15 * s, 'bandpass', 500, 300)];
/** UI: tick (cursor), ok (confirm), back. */
export function uiLayers(kind: 'tick' | 'ok' | 'back'): Layer[] {
  if (kind === 'tick') return [o(0, 0.03, 0.2, 'square', 1800, undefined, 4000)];
  if (kind === 'ok') return [o(0, 0.08, 0.2, 'triangle', 880), o(0.07, 0.14, 0.2, 'triangle', 1320)];
  return [o(0, 0.1, 0.2, 'triangle', 660, 440)];
}

/** Per-district background mix: traffic wash, kids, leaking music, distant sirens (all 0..1). */
export interface DistrictBed { traffic: number; kids: number; music: number; sirens: number }
export const DISTRICTS: Record<string, DistrictBed> = {
  default: { traffic: 0.5, kids: 0.2, music: 0.2, sirens: 0.4 },
  bedstuy: { traffic: 0.55, kids: 0.5, music: 0.6, sirens: 0.5 },
  bushwick: { traffic: 0.45, kids: 0.2, music: 0.8, sirens: 0.5 },
  williamsburg: { traffic: 0.65, kids: 0.15, music: 0.5, sirens: 0.3 },
  ridgewood: { traffic: 0.4, kids: 0.35, music: 0.3, sirens: 0.3 },
};
export const districtBed = (id: string | null | undefined): DistrictBed => DISTRICTS[(id ?? '').toLowerCase()] ?? DISTRICTS.default;

/** Tyre roll: band centre (Hz) and level (0..1) by speed in m/s and surface; cobbles are lower and louder, wet is hissier. */
export function tyreRoll(speed: number, surface: Surface | 'wet'): { hz: number; level: number; bump: number } {
  const s = Math.min(1, Math.abs(Number.isFinite(speed) ? speed : 0) / 30);
  const base = { hz: 500 + 900 * s, level: s ** 1.2 * 0.5, bump: 0 };
  if (surface === 'cobble') return { hz: base.hz * 0.6, level: Math.min(1, base.level * 1.8), bump: 1 };
  if (surface === 'wet' || surface === 'puddle') return { hz: base.hz * 1.9, level: Math.min(1, base.level * 1.4), bump: 0 };
  if (surface === 'gravel') return { hz: base.hz * 1.5, level: Math.min(1, base.level * 1.5), bump: 0.3 };
  if (surface === 'grass') return { hz: base.hz * 0.7, level: base.level * 0.7, bump: 0 };
  return base;
}

/** Plays layers at time t0. Nodes are created per one-shot (rare), never per frame. */
export function playLayers(ctx: BaseAudioContext, noise: AudioBuffer, dest: AudioNode, layers: Layer[], t0: number, gain = 1, rate = 1, rnd: () => number = Math.random): void {
  for (const l of layers) {
    const t = t0 + l.t / rate, d = l.d / rate, pk = Math.max(0.0001, l.p * gain);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(pk, t + Math.min(0.006, d / 4));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + d);
    amp.connect(dest);
    if (l.k === 'n') {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = l.f;
      f.frequency.setValueAtTime(l.hz * rate, t);
      if (l.q) f.Q.value = l.q;
      if (l.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, l.to * rate), t + d);
      src.connect(f); f.connect(amp);
      src.start(t, rnd() * 0.8, d + 0.02);
      src.stop(t + d + 0.02);
    } else {
      const osc = ctx.createOscillator();
      osc.type = l.w;
      osc.frequency.setValueAtTime(l.hz * rate, t);
      if (l.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, l.to * rate), t + d);
      if (l.lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = l.lp;
        osc.connect(f); f.connect(amp);
      } else osc.connect(amp);
      osc.start(t);
      osc.stop(t + d + 0.02);
    }
  }
}
