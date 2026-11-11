/**
 * Stable voice assignment for pedestrians. A ped's voice is a pure function of its seed (and age/gender when the body
 * has them): a voice group (preset + base speed), a small rate multiplier and a pitch shift of at most +/- 2 semitones.
 * `taken` lets the caller keep two peds within earshot (30 m) from sharing preset and speed: the first free
 * (group, rate) combination in the ped's own seeded order wins, so with nobody nearby the answer depends on the seed alone.
 */
import { PED_GROUPS, type AgeBand, type Gender, type PedVoiceGroup } from './groups';

export interface PedTraits { seed: number; age?: AgeBand; gender?: Gender }

export interface PedVoice {
  group: PedVoiceGroup;
  /** Multiplies the baked speed (playbackRate at play time; Kokoro speed when rendered live). */
  rateMul: number;
  /** Net pitch shift in cents, -200..200. */
  cents: number;
  /** Final speech speed = group.speed * rateMul. */
  speed: number;
  /** Identity for the "no two peds nearby share a voice" rule: preset + speed. */
  key: string;
}

export const RATE_STEPS: readonly number[] = [1, 0.96, 1.04, 0.92, 1.08];
export const MAX_CENTS = 200;

/** mulberry32: small, fast, deterministic. */
export function seededRandom(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function voiceKey(group: PedVoiceGroup, rateMul: number): string {
  return `${group.voice}@${(group.speed * rateMul).toFixed(2)}`;
}

/** Groups that fit the ped's gender and age; falls back to all twelve when nothing is known or nothing fits. */
export function candidateGroups(t: PedTraits): PedVoiceGroup[] {
  let c = PED_GROUPS.filter((g) => (!t.gender || g.gender === t.gender) && (!t.age || g.ages.includes(t.age)));
  if (c.length === 0) c = PED_GROUPS.filter((g) => !t.gender || g.gender === t.gender);
  return c.length ? [...c] : [...PED_GROUPS];
}

export function assignVoice(t: PedTraits, taken: ReadonlySet<string> = new Set()): PedVoice {
  const rnd = seededRandom(t.seed * 2654435761 + 12345);
  const cands = candidateGroups(t);
  // seeded shuffle of the candidates
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  const steps = RATE_STEPS.slice(1);
  for (let i = steps.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [steps[i], steps[j]] = [steps[j], steps[i]]; }
  const order = [RATE_STEPS[0], ...steps];
  const cents = Math.round((rnd() * 2 - 1) * MAX_CENTS);
  const mk = (group: PedVoiceGroup, rateMul: number): PedVoice => ({ group, rateMul, cents, speed: +(group.speed * rateMul).toFixed(3), key: voiceKey(group, rateMul) });
  for (const rateMul of order) for (const g of cands) { const v = mk(g, rateMul); if (!taken.has(v.key)) return v; }
  return mk(cands[0], order[0]);
}

/** Remembers each ped's voice and hands out new ones that do not clash within `radius` metres. */
export class PedVoiceRegistry {
  private readonly voices = new Map<string, { voice: PedVoice; x: number; y: number }>();
  constructor(private readonly radius = 30, private readonly cap = 400) {}

  get(pedId: string): PedVoice | undefined { return this.voices.get(pedId)?.voice; }

  /** The ped's voice (assigned on first use) avoiding every voice already used by a registered ped within the radius. */
  voiceFor(pedId: string, traits: PedTraits, pos: { x: number; y: number }): PedVoice {
    const known = this.voices.get(pedId);
    if (known) { known.x = pos.x; known.y = pos.y; return known.voice; }
    const taken = new Set<string>();
    for (const o of this.voices.values()) if (Math.hypot(o.x - pos.x, o.y - pos.y) <= this.radius) taken.add(o.voice.key);
    const voice = assignVoice(traits, taken);
    this.voices.set(pedId, { voice, x: pos.x, y: pos.y });
    if (this.voices.size > this.cap) { const first = this.voices.keys().next().value; if (first !== undefined) this.voices.delete(first); }
    return voice;
  }

  forget(pedId: string): void { this.voices.delete(pedId); }
  clear(): void { this.voices.clear(); }
  get size(): number { return this.voices.size; }
}

/** Playback numbers for a baked clip: playbackRate and detune (cents) that give rate `rateMul` and net pitch `cents`. */
export function playbackFor(v: PedVoice): { playbackRate: number; detune: number } {
  return { playbackRate: v.rateMul, detune: v.cents - 1200 * Math.log2(v.rateMul) };
}

/** SpeechSynthesis numbers for the same ped: slot, pitch (0.1..2) and rate (0.1..10) derived from the same seed. */
export function systemFor(v: PedVoice): { role: PedVoiceGroup['fallback']['role']; pitch: number; rate: number } {
  const f = v.group.fallback;
  return { role: f.role, pitch: Math.min(2, Math.max(0.1, f.pitch * 2 ** (v.cents / 1200))), rate: Math.min(10, Math.max(0.1, f.rate * v.rateMul)) };
}
