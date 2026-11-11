/**
 * Voice lane (VOX) types: the cast, the show data and the engine contract.
 * Everything here is plain data or an interface; no browser APIs.
 */
import type { VoiceRole } from '../talk/script';

/** Kokoro-82M English voice ids that the cast may use (all shipped in onnx-community/Kokoro-82M-v1.0-ONNX). */
export type KokoroVoice =
  | 'af_heart' | 'af_alloy' | 'af_aoede' | 'af_bella' | 'af_jessica' | 'af_kore' | 'af_nicole' | 'af_nova' | 'af_river' | 'af_sarah' | 'af_sky'
  | 'am_adam' | 'am_echo' | 'am_eric' | 'am_fenrir' | 'am_liam' | 'am_michael' | 'am_onyx' | 'am_puck'
  | 'bf_alice' | 'bf_emma' | 'bf_isabella' | 'bf_lily' | 'bm_daniel' | 'bm_fable' | 'bm_george' | 'bm_lewis';

/** Post-processing preset (WebAudio chain, see fx.ts). */
export type FxPreset = 'studio' | 'phone' | 'tinny' | 'ad' | 'booth' | 'dry';

export type CastKind = 'dj' | 'host' | 'caller' | 'guest' | 'announcer';

export interface CastMember {
  id: string;
  name: string;
  kind: CastKind;
  /** Neural voice and speed. */
  voice: KokoroVoice;
  speed: number;
  fx: FxPreset;
  /** SpeechSynthesis fallback: which system voice slot and the pitch/rate that tell this character apart. */
  fallback: { role: VoiceRole; pitch: number; rate: number };
  persona: string;
  catchphrases: readonly string[];
}

/**
 * One line of a script: `who` is a cast id. `text` holds the words plus inline stage directions in square brackets:
 *   [pause 0.6]  silence       [beat]   short pause (0.35 s)      [laugh]  laugh track burst (not spoken)
 *   [over]       (first token) starts before the previous line ends (interruption)
 *   [sfx name]   a procedural effect: airhorn, gavel, phone, static, cash, buzz, sting
 * Slots like {street} are filled at air time.
 */
export interface ScriptLine {
  who: string;
  text: string;
  /** Only airs when the live state matches: 'wanted' (stars >= 1), 'calm' (no stars), 'mission' (a mission was completed), 'bulletin' (STORY bulletins available), 'rain', 'night'. */
  when?: 'wanted' | 'calm' | 'mission' | 'bulletin' | 'rain' | 'night';
}

export type ShowKind = 'callin' | 'realestate' | 'board' | 'wellness' | 'latenight' | 'interview' | 'news' | 'ad';

export interface Show {
  id: string;
  title: string;
  kind: ShowKind;
  /** Host id: shown in the HUD. */
  host: string;
  lines: readonly ScriptLine[];
}

export type Direction =
  | { t: 'say'; text: string }
  | { t: 'pause'; s: number }
  | { t: 'laugh' }
  | { t: 'over' }
  | { t: 'sfx'; name: string };

/** What the live game tells the broadcasts (all optional). */
export interface VoiceContext {
  hour: number;
  weather: string;
  rain: number;
  street: string;
  stars?: number;
  missionsDone?: number;
  lastMission?: string;
  /** From the STORY lane: bulletins and ads unlocked by the story. */
  bulletins?: readonly string[];
  ads?: readonly string[];
}

/* ---------- engine contract ---------- */

/** Rendered speech: mono float samples. */
export interface Clip { samples: Float32Array; sampleRate: number }

export interface TtsRequest { text: string; voice: KokoroVoice; speed: number }

/** A neural (or fake) engine. `synth` rejects on failure or when cancelled. */
export interface TtsEngine {
  readonly kind: 'neural' | 'fake';
  /** True once the model is loaded and requests are served. */
  readonly ready: boolean;
  /** Ready and fast enough for live speech (false while loading, after a failure, or on a device that renders slower than real time). */
  readonly usable: boolean;
  /** Seconds of compute per second of audio measured so far (0 = unknown). */
  readonly rtf: number;
  load(): Promise<void>;
  synth(req: TtsRequest, priority?: 0 | 1): Promise<Clip>;
  /** Drops queued requests (the one in flight finishes and is discarded). */
  cancelAll(): void;
  /** Marks the engine unusable for live speech after a stall (kept loaded; the voice layer uses system voices). */
  demote?(): void;
  dispose(): void;
}

/** Size and facts shown next to the HD voices toggle. */
export const HD_VOICES = {
  label: 'HD voices (Kokoro, on-device)',
  downloadMb: 92,
  model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  dtype: 'q8',
  library: 'kokoro-js@1.2.1',
} as const;
