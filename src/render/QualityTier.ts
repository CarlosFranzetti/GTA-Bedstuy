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
  /** InstancedMesh furniture (trees, lamps...) is thinned beyond this (m); Infinity = all drawn */
  instanceDistance: number;
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
  /** drop small detail meshes (fire escapes, tanks, wires, fences...), see TierGeometry.ts */
  simpleGeometry: boolean;
  /** star layer of the night sky */
  stars: boolean;
  /** minimap redraws per second (0 = every frame) */
  minimapHz: number;
  /** instanced blob shadows under cars and pedestrians (BlobShadows.ts): the stand-in for a sun shadow map */
  blobShadows: boolean;
  /** night-time quarter-resolution bloom on emissive signs: frame rate (fps) the device must reach to get it; null = this tier has its own bloom / none */
  signBloomFps: number | null;
  traffic: TierTraffic;
}

/** Phone-high: the night sign bloom switches on when the measured frame rate is at or above this, off again below SIGN_BLOOM_OFF_FPS. */
export const SIGN_BLOOM_ON_FPS = 45;
export const SIGN_BLOOM_OFF_FPS = 38;

export const TIER_CONFIG: Record<Quality, TierConfig> = {
  phone: {
    maxPixelRatio: 1, maxBufferWidth: 720, cullDistance: 110, carNearDist: 14, instanceDistance: 100, pedDistance: 55,
    fog: { near: 30, far: 100 }, rainStreaks: 200, anisotropy: 2, normalMaps: false, simpleGeometry: true, stars: false, minimapHz: 30, blobShadows: true, signBloomFps: SIGN_BLOOM_ON_FPS,
    traffic: { maxMoving: 10, peds: 14, parkOccupancy: 0.3, cops: 1 },
  },
  low: {
    maxPixelRatio: 1.25, maxBufferWidth: Infinity, cullDistance: 220, carNearDist: 32, instanceDistance: Infinity, pedDistance: 220,
    fog: null, rainStreaks: 600, anisotropy: 16, normalMaps: true, simpleGeometry: false, stars: true, minimapHz: 0, blobShadows: false, signBloomFps: null,
    traffic: { maxMoving: 30, peds: 40, parkOccupancy: 0.65, cops: 2 },
  },
  medium: {
    maxPixelRatio: 1.75, maxBufferWidth: Infinity, cullDistance: 220, carNearDist: 32, instanceDistance: Infinity, pedDistance: 220,
    fog: null, rainStreaks: 1200, anisotropy: 16, normalMaps: true, simpleGeometry: false, stars: true, minimapHz: 0, blobShadows: false, signBloomFps: null,
    traffic: { maxMoving: 30, peds: 40, parkOccupancy: 0.65, cops: 2 },
  },
  high: {
    maxPixelRatio: 1.75, maxBufferWidth: Infinity, cullDistance: 220, carNearDist: 32, instanceDistance: Infinity, pedDistance: 220,
    fog: null, rainStreaks: 2000, anisotropy: 16, normalMaps: true, simpleGeometry: false, stars: true, minimapHz: 0, blobShadows: false, signBloomFps: null,
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

/**
 * Sign bloom gate for the phone tier with hysteresis: true only at night, only on a tier that has the option, and only
 * while the device keeps up (>= 45 fps to switch on, >= 38 fps to stay on). An unknown / zero rate never turns it on.
 */
export function signBloomGate(q: Quality, night: boolean, fps: number, wasOn: boolean): boolean {
  const need = TIER_CONFIG[q].signBloomFps;
  if (need === null || !night || !Number.isFinite(fps) || fps <= 0) return false;
  return wasOn ? fps >= SIGN_BLOOM_OFF_FPS : fps >= need;
}

/** Fog ramp of a tier: the time-cycle fog (`near`/`far`, m) clamped to the tier override; tiers without one return the input. */
export function fogRampFor(q: Quality, near: number, far: number): { near: number; far: number } {
  const t = TIER_CONFIG[q].fog;
  if (!t) return { near, far };
  return { near: Math.min(near, t.near), far: Math.min(far, t.far) };
}

/** Fog density at distance `d` (0..1) for a linear fog ramp: what the player sees of the world edge. */
export function fogFactorAt(d: number, near: number, far: number): number {
  if (d <= near) return 0;
  if (d >= far) return 1;
  return (d - near) / (far - near);
}

interface FogLike { near: number; far: number; color: { copy(c: unknown): unknown } }
/**
 * Applies the tier fog to the scene fog every frame (DayNight rewrites near/far each step): the ramp is clamped for the
 * tier and, when the tier has an override, the colour is the sky dome's horizon colour so the world edge dissolves into
 * the sky instead of ending in a cut. `horizon` is `sky.horizonColor(sunElevationSine)`.
 */
export function applyTierFog(fog: FogLike | null | undefined, q: Quality, horizon?: unknown): void {
  if (!fog) return;
  const r = fogRampFor(q, fog.near, fog.far);
  fog.near = r.near; fog.far = r.far;
  if (horizon && TIER_CONFIG[q].fog) fog.color.copy(horizon);
}
