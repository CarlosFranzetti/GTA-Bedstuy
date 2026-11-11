/**
 * Pedestrian voice groups: the twelve voices the bark pack is baked for (pre-rendering one set per ped would blow the
 * size budget). A ped picks one group from its seed (and age/gender if known); individual variety on top of the group
 * comes from a small rate multiplier and a pitch shift of at most +/- 2 semitones applied at playback.
 *
 * All presets are Kokoro-82M English voices. There is no accented Caribbean, Latino or South Asian preset in the model
 * (see docs/reference/VOICES.md), so a group is a voice, not a claim about who the ped is.
 */
import type { KokoroVoice } from '../types';

export type Persona =
  | 'auntie' | 'church' | 'stoop' | 'deli' | 'seller' | 'rider' | 'messenger' | 'kid' | 'dev' | 'commuter' | 'young' | 'uncle';

export type AgeBand = 'kid' | 'young' | 'adult' | 'elder';
export type Gender = 'f' | 'm';

export interface PedVoiceGroup {
  /** Stable id, also the bark bank name: `bark-<id>`. */
  id: string;
  voice: KokoroVoice;
  /** Kokoro speed the clips are baked at. */
  speed: number;
  gender: Gender;
  ages: readonly AgeBand[];
  personas: readonly Persona[];
  /** SpeechSynthesis fallback: role slot and the base pitch/rate before the per-ped shift. */
  fallback: { role: 'host' | 'sidekick' | 'caller' | 'announcer'; pitch: number; rate: number };
}

export const PED_GROUPS: readonly PedVoiceGroup[] = [
  { id: 'g00', voice: 'af_bella', speed: 0.96, gender: 'f', ages: ['elder', 'adult'], personas: ['auntie', 'church', 'stoop'], fallback: { role: 'host', pitch: 0.98, rate: 0.96 } },
  { id: 'g01', voice: 'af_river', speed: 0.94, gender: 'f', ages: ['elder'], personas: ['church', 'stoop', 'auntie'], fallback: { role: 'caller', pitch: 1.05, rate: 0.94 } },
  { id: 'g02', voice: 'af_jessica', speed: 1.02, gender: 'f', ages: ['adult'], personas: ['deli', 'seller', 'auntie'], fallback: { role: 'caller', pitch: 1.12, rate: 1.04 } },
  { id: 'g03', voice: 'af_nova', speed: 1.06, gender: 'f', ages: ['young', 'adult'], personas: ['messenger', 'rider', 'young'], fallback: { role: 'sidekick', pitch: 1.1, rate: 1.08 } },
  { id: 'g04', voice: 'af_sarah', speed: 1.0, gender: 'f', ages: ['adult', 'young'], personas: ['dev', 'commuter'], fallback: { role: 'announcer', pitch: 1.0, rate: 1.04 } },
  { id: 'g05', voice: 'af_sky', speed: 1.08, gender: 'f', ages: ['kid'], personas: ['kid'], fallback: { role: 'caller', pitch: 1.35, rate: 1.14 } },
  { id: 'g06', voice: 'am_michael', speed: 0.94, gender: 'm', ages: ['elder', 'adult'], personas: ['stoop', 'deli', 'uncle'], fallback: { role: 'host', pitch: 0.82, rate: 0.94 } },
  { id: 'g07', voice: 'bm_lewis', speed: 0.96, gender: 'm', ages: ['elder', 'adult'], personas: ['church', 'deli'], fallback: { role: 'host', pitch: 0.78, rate: 0.96 } },
  { id: 'g08', voice: 'am_eric', speed: 1.0, gender: 'm', ages: ['adult'], personas: ['dev', 'commuter'], fallback: { role: 'announcer', pitch: 0.95, rate: 1.06 } },
  { id: 'g09', voice: 'am_fenrir', speed: 1.06, gender: 'm', ages: ['young'], personas: ['messenger', 'rider', 'young'], fallback: { role: 'caller', pitch: 1.0, rate: 1.12 } },
  { id: 'g10', voice: 'am_liam', speed: 1.04, gender: 'm', ages: ['young', 'adult'], personas: ['rider', 'seller', 'deli'], fallback: { role: 'sidekick', pitch: 1.1, rate: 1.1 } },
  { id: 'g11', voice: 'am_puck', speed: 1.08, gender: 'm', ages: ['kid', 'young'], personas: ['kid', 'young'], fallback: { role: 'caller', pitch: 1.2, rate: 1.16 } },
];

export const GROUP_BY_ID: ReadonlyMap<string, PedVoiceGroup> = new Map(PED_GROUPS.map((g) => [g.id, g]));
