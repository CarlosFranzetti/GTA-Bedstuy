/**
 * The voice pack plan: every fixed sentence that can be pre-rendered offline (scripts/voice/bake-pack.mjs bundles this
 * file and renders the plan in priority order). Pure data, no audio, no DOM.
 *
 * A clip is one sentence in one voice, keyed exactly like the runtime cache (`clipKey(text, voice, speed)`), so the
 * runtime asks the pack with the same key it would give ClipCache. Sentences that contain a slot with an open value set
 * (a real artist name, a time of day, a street) cannot be baked and fall through to live neural / system voices; slots
 * with a finite value set (station name and frequency, a neighbourhood, the weather phrase, a star count) are baked for
 * every value, up to MAX_VARIANTS per sentence.
 */
import { CAST_MAP } from './cast';
import { fillSlots, parseLine, clipKey, slotsIn } from './script';
import { ADS, DJ_COPY, HOODS, TALK_SHOWS } from './shows';
import type { KokoroVoice, ScriptLine, Show } from './types';

/** Which kind of content a clip belongs to; decides the bank file and the bitrate. */
export type PackKind = 'dj' | 'ad' | 'show' | 'story' | 'bark';

export interface PlanClip {
  key: string;
  /** Cast id, story speaker or ped voice-group id. */
  who: string;
  voice: KokoroVoice;
  speed: number;
  text: string;
  kind: PackKind;
  /** Bank (one lazily fetched file) this clip lives in. */
  bank: string;
  /** Lower bakes first: 0 idents, 1 other DJ lines, 2 ads, 3 shows, 4 story, 5 barks, 6 DJ slot expansions. */
  tier: number;
}

export const MAX_VARIANTS = 16;
/** Open-valued slots: never baked. */
const OPEN = '\u0001';

/** Finite slot dimensions: choosing one entry fills all the slots it names. */
export type Dimension = Array<Record<string, string>>;

const WEATHER = ['light rain', 'steady rain', 'heavy rain', 'wet streets', 'drying out', 'a clear night', 'clear skies'];
const DAYPARTS = ['night', 'morning', 'afternoon', 'evening'];

export function baseDimensions(): Dimension[] {
  return [
    HOODS.map((hood) => ({ hood })),
    WEATHER.map((weather) => ({ weather })),
    DAYPARTS.map((daypart) => ({ daypart })),
    [1, 2, 3, 4, 5].map((n) => ({ stars: String(n), starsWord: n === 1 ? 'star' : 'stars' })),
  ];
}

/**
 * Sentences of one script line that the pack can hold: for every combination of the finite slots in the template,
 * fill them (open slots become a sentinel), split like the runtime does, keep the sentences without the sentinel.
 * Returns [] when the combination count exceeds `maxVariants`.
 */
export function bakeableSentences(template: string, dims: readonly Dimension[] = baseDimensions(), maxVariants = MAX_VARIANTS): string[] {
  const used = new Set(slotsIn(template));
  const picked = dims.filter((d) => Object.keys(d[0] ?? {}).some((k) => used.has(k)));
  let combos = 1;
  for (const d of picked) combos *= d.length;
  if (combos > maxVariants) return [];
  const open: Record<string, string> = {};
  for (const s of used) open[s] = OPEN;
  const out: string[] = [];
  const seen = new Set<string>();
  const rec = (i: number, slots: Record<string, string>) => {
    if (i === picked.length) {
      const filled = fillSlots(template, slots);
      if (!filled) return;
      for (const d of parseLine(filled)) {
        if (d.t !== 'say' || d.text.includes(OPEN)) continue;
        if (!seen.has(d.text)) { seen.add(d.text); out.push(d.text); }
      }
      return;
    }
    for (const choice of picked[i]) rec(i + 1, { ...slots, ...choice });
  };
  rec(0, open);
  return out;
}

export interface StationFill { id: string; name: string; freq: string }

/** Station dial entries the idents are filled for (name and spoken frequency come from the radio table). */
export type StationTable = readonly StationFill[];

function clip(who: string, text: string, kind: PackKind, bank: string, tier: number, voiceOverride?: { voice: KokoroVoice; speed: number }): PlanClip | null {
  const m = CAST_MAP.get(who);
  const voice = voiceOverride?.voice ?? m?.voice;
  const speed = voiceOverride?.speed ?? m?.speed;
  if (!voice || speed === undefined) return null;
  return { key: clipKey(text, voice, speed), who, voice, speed, text, kind, bank, tier };
}

function showClips(show: Show, kind: PackKind, bank: string, tier: number): PlanClip[] {
  const out: PlanClip[] = [];
  for (const l of show.lines as readonly ScriptLine[]) {
    for (const text of bakeableSentences(l.text)) {
      const c = clip(l.who, text, kind, bank, tier);
      if (c) out.push(c);
    }
  }
  return out;
}

/** DJ idents (tier 0) and the other bakeable DJ sentences (tier 1), for the given station table. */
export function planDjs(stations: StationTable): PlanClip[] {
  const out: PlanClip[] = [];
  for (const st of stations) {
    const copy = (DJ_COPY as Record<string, (typeof DJ_COPY)[keyof typeof DJ_COPY] | undefined>)[st.id];
    if (!copy) continue;
    const dims: Dimension[] = [...baseDimensions(), [{ station: st.name, freq: st.freq }]];
    const bank = `dj-${copy.who}`;
    for (const t of copy.idents) for (const s of bakeableSentences(t, dims)) { const c = clip(copy.who, s, 'dj', bank, 0); if (c) out.push(c); }
    // Sentences without any slot first (tier 1); the finite-slot expansions (a neighbourhood shout-out for each of the
    // twelve hoods) are many clips and come last (tier 6).
    for (const cat of ['blind', 'intros', 'outros', 'shouts', 'hours', 'traffic'] as const) {
      for (const t of copy[cat]) {
        const expands = /\{(hood|weather|daypart|stars)\}/.test(t);
        for (const s of bakeableSentences(t, dims)) { const c = clip(copy.who, s, 'dj', bank, expands && /[{]/.test(t) ? 6 : 1); if (c) out.push(c); }
      }
    }
  }
  // The DJs' lead-in to a commercial.
  for (const who of new Set(Object.values(DJ_COPY).map((c) => c.who))) {
    const c = clip(who, 'A word from our sponsors.', 'dj', `dj-${who}`, 1);
    if (c) out.push(c);
  }
  return out;
}

export function planAds(): PlanClip[] { return ADS.flatMap((a) => showClips(a, 'ad', 'ads', 2)); }
export function planShows(): PlanClip[] { return TALK_SHOWS.flatMap((s) => showClips(s, 'show', `show-${s.id}`, 3)); }

export interface PlanOptions {
  stations: StationTable;
  /** Extra clips from other modules (story lines, ped barks), already tiered. */
  extra?: readonly PlanClip[];
}

/** The whole plan, deduplicated by key (first occurrence wins), stable order: tier, then declaration order. */
export function planPack(opts: PlanOptions): PlanClip[] {
  const all = [...planDjs(opts.stations), ...planAds(), ...planShows(), ...(opts.extra ?? [])];
  const seen = new Set<string>();
  const out: PlanClip[] = [];
  for (const c of all) { if (!seen.has(c.key)) { seen.add(c.key); out.push(c); } }
  return out.map((c, i) => ({ c, i })).sort((a, b) => a.c.tier - b.c.tier || a.i - b.i).map((x) => x.c);
}

/** Rough speech seconds and characters of a plan (for budgets before rendering). */
export function planStats(plan: readonly PlanClip[]): { clips: number; chars: number; approxSec: number; byTier: Record<number, { clips: number; approxSec: number }> } {
  const byTier: Record<number, { clips: number; approxSec: number }> = {};
  let chars = 0; let approxSec = 0;
  for (const c of plan) {
    const sec = Math.max(0.6, c.text.split(/\s+/).length / (2.6 * c.speed) + 0.25);
    chars += c.text.length; approxSec += sec;
    const t = (byTier[c.tier] ??= { clips: 0, approxSec: 0 });
    t.clips++; t.approxSec += sec;
  }
  return { clips: plan.length, chars, approxSec, byTier };
}
