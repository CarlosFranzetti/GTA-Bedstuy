/**
 * Per-tier knobs that are not already in a tier-keyed table elsewhere (Shadows.ts: map size / box / bias, LightingConfig:
 * lamp pool, Pipeline.ts: pass chain). One table so tests and main.ts read the same numbers.
 *
 * `phone` is the tier below `low` (touch devices): one cheap pass chain at <= 720 px wide, short view distance hidden by fog,
 * a fraction of the traffic. See docs/swarm/transcript.md (MOB) for the measured numbers.
 */
import type { Quality } from './Shadows';

export const QUALITY_ORDER: readonly Quality[] = ['phone', 'low', 'medium', 'high'];

export interface TierTraffic {
  /** moving cars alive near the player (TrafficSystem MAX_TRAFFIC) */
  maxMoving: number;
  /** pedestrians */
  peds: number;
  /** share of kerb slots that hold a parked car */
  parkOccupancy: number;
  /** patrol cops while nobody is wanted */
  cops: number;
}

export interface TierConfig {
  /** device pixel ratio cap */
  maxPixelRatio: number;
  /** cap on the drawing-buffer width in px (the pixel ratio is lowered to fit); Infinity = no cap */
  maxBufferWidth: number;
  /** DistanceCuller range (m) for prop cells, parked cars and peds */
  cullDistance: number;
  /** CarLod: cars farther than this from the camera use the instanced model */
  carNearDist: number;
  /** pedestrians are hidden beyond this (m); props use cullDistance */
  pedDistance: number;
  /** fog override (m): the day/night time cycle fog is clamped to these, so the cull edge is hidden. null = time cycle only */
  fog: { near: number; far: number } | null;
  /** rain streak count */
  rainStreaks: number;
  /** texture anisotropy cap */
  anisotropy: number;
  /** buildings, roads etc. keep their normal / roughness maps */
  normalMaps: boolean;
  /** star layer of the night sky */
  stars: boolean;
  /** minimap redraws per second (0 = every frame) */
  minimapHz: number;
  traffic: TierTraffic;
}

export const TIER_CONFIG: Record<Quality, TierConfig> = {
  phone: {
    maxPixelRatio: 1, maxBufferWidth: 720, cullDistance: 110, carNearDist: 14, pedDistance: 55,
    fog: { near: 35, far: 105 }, rainStreaks: 200, anisotropy: 2, normalMaps: false, stars: false, minimapHz: 30,
    traffic: { maxMoving: 10, peds: 14, parkOccupancy: 0.3, cops: 1 },
  },
  low: {
    maxPixelRatio: 1.25, maxBufferWidth: Infinity, cullDistance: 220, carNearDist: 32, pedDistance: 220,
    fog: null, rainStreaks: 600, anisotropy: 16, normalMaps: true, stars: true, minimapHz: 0,
    traffic: { maxMoving: 30, peds: 40, parkOccupancy: 0.65, cops: 2 },
  },
  medium: {
    maxPixelRatio: 1.75, maxBufferWidth: Infinity, cullDistance: 220, carNearDist: 32, pedDistance: 220,
    fog: null, rainStreaks: 1200, anisotropy: 16, normalMaps: true, stars: true, minimapHz: 0,
    traffic: { maxMoving: 30, peds: 40, parkOccupancy: 0.65, cops: 2 },
  },
  high: {
    maxPixelRatio: 1.75, maxBufferWidth: Infinity, cullDistance: 220, carNearDist: 32, pedDistance: 220,
    fog: null, rainStreaks: 2000, anisotropy: 16, normalMaps: true, stars: true, minimapHz: 0,
    traffic: { maxMoving: 30, peds: 40, parkOccupancy: 0.65, cops: 2 },
  },
};

export const tierConfig = (q: Quality): TierConfig => TIER_CONFIG[q];

/** Renderer pixel ratio for a tier on a screen of `cssWidth` CSS px with the given `devicePixelRatio`. */
export function pixelRatioFor(q: Quality, devicePixelRatio: number, cssWidth: number): number {
  const t = TIER_CONFIG[q];
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const byWidth = cssWidth > 0 && Number.isFinite(t.maxBufferWidth) ? t.maxBufferWidth / cssWidth : Infinity;
  return Math.max(0.25, Math.min(t.maxPixelRatio, dpr, byWidth));
}

/** One tier lower (undefined at `phone`). */
export function tierBelow(q: Quality): Quality | undefined {
  const i = QUALITY_ORDER.indexOf(q);
  return i > 0 ? QUALITY_ORDER[i - 1] : undefined;
}
