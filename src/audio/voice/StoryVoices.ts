/**
 * Story cast -> voice map. Every speaker name that can appear on a mission subtitle (src/game/story/cast.ts and its
 * EXTRA_SPEAKERS) gets a hand-picked Kokoro preset, speed and effect. Keys are the speaker tags exactly as they appear in
 * `mission:subtitle` events. Presets are chosen from the sixteen the twelve pedestrian voice groups do not use; where a
 * walk-on has to share one, the director reserves the preset against nearby peds while that character speaks.
 * `null` entries never speak (the player, the crowd): subtitle only.
 */
import { planSpeech } from './prosody';
import { rhythmFor } from './rhythm';
import type { FxPreset, KokoroVoice } from './types';
import { clipKey } from './script';
import type { PlanClip } from './packPlan';

export interface StoryVoice {
  voice: KokoroVoice;
  speed: number;
  fx: FxPreset;
  /** SpeechSynthesis fallback shaping. */
  fallback: { role: 'host' | 'sidekick' | 'caller' | 'announcer'; pitch: number; rate: number };
}

const v = (voice: KokoroVoice, speed: number, fx: FxPreset, role: StoryVoice['fallback']['role'], pitch: number, rate: number): StoryVoice =>
  ({ voice, speed, fx, fallback: { role, pitch, rate } });

export const STORY_VOICES: Readonly<Record<string, StoryVoice | null>> = {
  /* recurring cast, hand-picked */
  'Ms. Odette': v('af_kore', 0.88, 'dry', 'caller', 0.9, 0.9),
  'DJ Sloth': v('bm_fable', 0.86, 'dry', 'host', 0.7, 0.85),
  'Auntie G': v('af_alloy', 1.04, 'dry', 'caller', 1.1, 1.05),
  'Mr. Alvin': v('bm_george', 0.92, 'dry', 'host', 0.8, 0.95),
  'Tay': v('am_echo', 1.1, 'dry', 'caller', 0.95, 1.15),
  'Dee': v('af_aoede', 1.14, 'dry', 'caller', 1.35, 1.2),
  'Mohammed': v('am_adam', 0.98, 'dry', 'caller', 0.95, 1.0),
  'Doña Marisol': v('af_heart', 1.0, 'dry', 'caller', 1.05, 1.05),
  'Yossi': v('bm_daniel', 1.02, 'dry', 'host', 0.9, 1.0),
  'Sgt. Kowalski': v('bf_emma', 0.96, 'dry', 'announcer', 0.9, 0.98),
  'Hallie': v('af_nicole', 1.06, 'dry', 'sidekick', 1.2, 1.0),
  'Bryce': v('am_onyx', 1.0, 'dry', 'sidekick', 0.85, 1.05),
  'Hobbs': v('bm_lewis', 0.94, 'dry', 'host', 0.8, 0.96),
  'Pryce': v('am_eric', 1.2, 'ad', 'announcer', 1.0, 1.3),
  /* walk-ons and mission givers */
  'Mrs. Okafor': v('bf_isabella', 0.98, 'dry', 'caller', 1.05, 0.98),
  'Lorraine': v('af_bella', 0.98, 'dry', 'host', 0.95, 0.98),
  'Big Lou': v('am_michael', 0.9, 'dry', 'host', 0.85, 0.92),
  'Ms. Pearl': v('af_kore', 1.05, 'dry', 'sidekick', 1.0, 1.06),
  'Tiana': v('af_nova', 1.12, 'dry', 'caller', 1.2, 1.15),
  'Kyle': v('am_liam', 1.08, 'dry', 'caller', 1.0, 1.1),
  'Paramedic': v('bf_alice', 1.04, 'dry', 'announcer', 1.0, 1.1),
  'Clerk': v('bf_lily', 1.0, 'dry', 'sidekick', 1.1, 1.0),
  'Marshal': v('bm_george', 0.88, 'dry', 'host', 0.75, 0.9),
  'Announcer': v('bm_lewis', 1.08, 'ad', 'announcer', 1.05, 1.2),
  'Hearing Officer': v('bf_isabella', 0.9, 'dry', 'announcer', 0.95, 0.92),
  'Train': v('bf_emma', 0.92, 'tinny', 'announcer', 0.9, 0.95),
  'Doorman': v('am_adam', 0.9, 'dry', 'host', 0.85, 0.92),
  'Neighbour': v('af_heart', 1.1, 'dry', 'caller', 1.1, 1.1),
  'Passenger': v('am_eric', 1.0, 'dry', 'caller', 1.0, 1.05),
  'Fare': v('af_nova', 1.0, 'dry', 'caller', 1.1, 1.05),
  'Dispatch': v('af_alloy', 0.98, 'phone', 'announcer', 1.0, 1.05),
  'Phone': v('bf_lily', 1.04, 'phone', 'caller', 1.1, 1.05),
  'Radio': v('bm_lewis', 1.06, 'tinny', 'announcer', 1.0, 1.15),
  /* never spoken */
  'You': null,
  'Crowd': null,
};

export function storyVoice(name: string): StoryVoice | null | undefined { return STORY_VOICES[name]; }

/** Presets used by story characters (the director keeps nearby peds off these while the character speaks). */
export function storyPresets(): Set<KokoroVoice> {
  const s = new Set<KokoroVoice>();
  for (const x of Object.values(STORY_VOICES)) if (x) s.add(x.voice);
  return s;
}

export interface StoryLine { who: string; text: string }

/** Plan clips for the pack (tier 4): every sentence of every story line with the speaker's voice. */
export function planStory(lines: readonly StoryLine[]): PlanClip[] {
  const out: PlanClip[] = [];
  for (const l of lines) {
    const sv = STORY_VOICES[l.who];
    if (!sv) continue;
    for (const p of planSpeech(l.text.replace(/\[[^\]]*\]/g, ' '), l.who, sv.speed, rhythmFor(l.who))) {
      out.push({ key: clipKey(p.text, sv.voice, p.speed), who: l.who, voice: sv.voice, speed: p.speed, text: p.text, kind: 'story', bank: 'story', tier: 4 });
    }
  }
  return out;
}
