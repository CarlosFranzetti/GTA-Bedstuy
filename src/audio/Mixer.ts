/**
 * Player volume mixer: five 0..100% sliders (Master, Radio and music, Effects, Voices, Ambience), saved between sessions.
 * The slider value is the position (0..1); the gain applied to the audio is the perceptual taper of that position
 * (squared: even steps feel even, and the bottom of the slider is gentle). AudioSystem applies the values to its buses.
 */
export type MixKey = 'master' | 'radio' | 'sfx' | 'voices' | 'ambience';
export const MIX_KEYS: readonly MixKey[] = ['master', 'radio', 'sfx', 'voices', 'ambience'];
export const MIX_LABELS: Record<MixKey, string> = { master: 'Master Volume', radio: 'Radio and Music', sfx: 'Sound Effects', voices: 'Voices', ambience: 'Ambience' };
export const MIX_DESC: Record<MixKey, string> = {
  master: 'Volume of everything in the game.',
  radio: 'Radio stations, SoundCloud, live streams, your tracks and the title and loading music.',
  sfx: 'Engines, horns, tyres, doors, impacts, footsteps and trains.',
  voices: 'Radio hosts, talk radio, pedestrians and story lines.',
  ambience: 'The city bed, birds, crickets and rain.',
};
export const MIX_KEY = 'wbsy.mixer';

/** Slider position 0..1 to linear gain. */
export const taper = (v: number): number => { const x = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0; return x * x; };

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

/** Saved slider positions (null when nothing is stored or storage is blocked). Lets the loading and title music follow Radio and music. */
export function storedMix(store: Store | null = defaultStore()): Partial<Record<MixKey, number>> {
  const out: Partial<Record<MixKey, number>> = {};
  try {
    const o = JSON.parse(store?.getItem(MIX_KEY) ?? 'null') as Record<string, unknown> | null;
    if (o && typeof o === 'object') for (const k of MIX_KEYS) { const v = o[k]; if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(1, Math.max(0, v)); }
  } catch { /* corrupt or blocked: defaults */ }
  return out;
}

/** Linear gain of master x radio from storage (1 when nothing is saved). */
export const storedMusicGain = (store?: Store | null): number => { const m = storedMix(store); return taper(m.master ?? 1) * taper(m.radio ?? 1); };

export class Mixer {
  private v: Record<MixKey, number> = { master: 1, radio: 1, sfx: 1, voices: 1, ambience: 1 };
  private readonly subs = new Set<(k: MixKey) => void>();

  constructor(private readonly store: Store | null = defaultStore()) { Object.assign(this.v, storedMix(store)); }

  /** Slider position 0..1. */
  get(k: MixKey): number { return this.v[k]; }
  /** Linear gain for the audio graph (tapered). */
  gain(k: MixKey): number { return taper(this.v[k]); }
  /** Utterance and element volume for sounds outside the graph: master x group. */
  level(k: MixKey): number { return taper(this.v.master) * (k === 'master' ? 1 : taper(this.v[k])); }

  set(k: MixKey, pos: number): void {
    const x = Number.isFinite(pos) ? Math.min(1, Math.max(0, pos)) : 0;
    if (x === this.v[k]) return;
    this.v[k] = x;
    try { this.store?.setItem(MIX_KEY, JSON.stringify(this.v)); } catch { /* private mode: keep in memory */ }
    this.subs.forEach((f) => f(k));
  }

  reset(): void { for (const k of MIX_KEYS) this.set(k, 1); }
  onChange(fn: (k: MixKey) => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
}
