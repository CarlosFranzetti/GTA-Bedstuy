/**
 * Advanced graphics settings: individual switches that override the quality tier (phone / low / medium / high).
 *
 *  - `presetFor(tier)` is the typed default of every setting for a tier (what the tier does today).
 *  - `GraphicsStore` holds only what the player changed (`overrides`), persists it (localStorage, wrapped), and
 *    `effective(tier)` = preset merged with the overrides. "Reset to preset" clears the overrides.
 *  - `deriveGraphics(tier, effective, env)` turns the effective settings into the concrete numbers the engine consumes
 *    (pixel ratio, cull ranges, traffic densities, anisotropy, shadow mode, post switches, fov offset, fps cap).
 *    Pure and DOM free: main.ts applies the result (see the FOR FABLE lines on the transcript).
 *
 * A setting is only listed in `supports(tier)` when the engine can really honour it on that tier; the menu hides the rest.
 * Not offered because the engine has no such thing: motion blur (no pass), MSAA / FXAA (the scene renders into the composer's
 * targets, canvas MSAA is fixed at context creation and only multisamples the final quad; SMAA is the real AA pass).
 */
import { tierConfig, pixelRatioFor, type TierTraffic } from '@/render/QualityTier';
import type { Quality } from '@/render/Shadows';

export type ShadowMode = 'off' | 'blob' | 'low' | 'medium' | 'high';
export type AaMode = 'off' | 'smaa';
export type TextureQuality = 'low' | 'medium' | 'high';
export type FpsCap = 0 | 30 | 60;

export interface GraphicsSettings {
  /** render resolution as a share of the tier's pixel ratio, 0.5..1 */
  resolution: number;
  /** ignore the tier's pixel-ratio / buffer-width cap and render at the display's native device pixel ratio (max 3) */
  nativeDpr: boolean;
  shadows: ShadowMode;
  /** multiplier on the cull range of buildings, props, parked cars and pedestrians, 0.5..1.5 */
  drawDistance: number;
  /** multiplier on the range of instanced street trees and furniture, 0.5..2 */
  treeRange: number;
  /** pedestrian density multiplier, 0..1.5 */
  crowd: number;
  /** moving traffic (and patrol cop) density multiplier, 0..1.5 */
  traffic: number;
  aa: AaMode;
  ao: boolean;
  bloom: boolean;
  dof: boolean;
  vignette: boolean;
  grain: boolean;
  textures: TextureQuality;
  fpsCap: FpsCap;
  /** on-foot vertical field of view in degrees (the vehicle fov moves with it) */
  fov: number;
  showFps: boolean;
}

export type GraphicsKey = keyof GraphicsSettings;
export const GRAPHICS_KEYS: readonly GraphicsKey[] = ['resolution', 'nativeDpr', 'shadows', 'drawDistance', 'treeRange', 'crowd', 'traffic', 'aa', 'ao', 'bloom', 'dof', 'vignette', 'grain', 'textures', 'fpsCap', 'fov', 'showFps'];
export const GRAPHICS_KEY = 'gta-bedstuy.graphics.v1';

export const SHADOW_MODES: readonly ShadowMode[] = ['off', 'blob', 'low', 'medium', 'high'];
export const AA_MODES: readonly AaMode[] = ['off', 'smaa'];
export const TEXTURE_LEVELS: readonly TextureQuality[] = ['low', 'medium', 'high'];
export const FPS_CAPS: readonly FpsCap[] = [30, 60, 0];
/** The on-foot fov the game ships with (CAM_FOOT.fov); `fovOffset` is relative to it. */
export const BASE_FOV = 64;

export interface RangeSpec { min: number; max: number; step: number }
export const RANGES = {
  resolution: { min: 0.5, max: 1, step: 0.05 },
  drawDistance: { min: 0.5, max: 1.5, step: 0.25 },
  treeRange: { min: 0.5, max: 2, step: 0.25 },
  crowd: { min: 0, max: 1.5, step: 0.25 },
  traffic: { min: 0, max: 1.5, step: 0.25 },
  fov: { min: 50, max: 90, step: 2 },
} as const satisfies Record<string, RangeSpec>;

/** Typed default of every setting for a tier: what the tier does without any override. */
export function presetFor(tier: Quality): GraphicsSettings {
  const phone = tier === 'phone';
  return {
    resolution: 1,
    nativeDpr: false,
    shadows: phone ? 'blob' : tier,
    drawDistance: 1,
    treeRange: 1,
    crowd: 1,
    traffic: 1,
    aa: tier === 'medium' || tier === 'high' ? 'smaa' : 'off',
    ao: tier === 'medium' || tier === 'high',
    bloom: true,
    dof: tier === 'medium' || tier === 'high',
    vignette: true,
    grain: !phone,
    textures: phone ? 'low' : 'high',
    fpsCap: 0,
    fov: BASE_FOV,
    showFps: false,
  };
}

/** Which settings (and which shadow modes) the engine honours on a tier. Everything else is left out of the menu. */
export interface TierSupport {
  keys: ReadonlySet<GraphicsKey>;
  shadows: readonly ShadowMode[];
}
export function supports(tier: Quality): TierSupport {
  const phone = tier === 'phone';
  const full = tier === 'medium' || tier === 'high';
  const keys = new Set<GraphicsKey>(['resolution', 'shadows', 'drawDistance', 'treeRange', 'crowd', 'traffic', 'bloom', 'vignette', 'textures', 'fpsCap', 'fov', 'showFps']);
  if (!phone) { keys.add('nativeDpr'); keys.add('aa'); keys.add('grain'); }
  if (full) { keys.add('ao'); keys.add('dof'); }
  // The phone shadow map is fed by the blob casters only (no proxy stand-ins), so it can only be blob or off.
  return { keys, shadows: phone ? ['off', 'blob'] : SHADOW_MODES };
}

const num = (min: number, max: number, step = 0) => (v: unknown): number | undefined => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const c = Math.min(max, Math.max(min, v));
  return step > 0 ? Math.round((c - min) / step) * step + min : c;
};
const oneOf = <T>(list: readonly T[]) => (v: unknown): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

const VALIDATE: { [K in GraphicsKey]: (v: unknown) => GraphicsSettings[K] | undefined } = {
  resolution: num(RANGES.resolution.min, RANGES.resolution.max, RANGES.resolution.step),
  nativeDpr: bool,
  shadows: oneOf(SHADOW_MODES),
  drawDistance: num(RANGES.drawDistance.min, RANGES.drawDistance.max, RANGES.drawDistance.step),
  treeRange: num(RANGES.treeRange.min, RANGES.treeRange.max, RANGES.treeRange.step),
  crowd: num(RANGES.crowd.min, RANGES.crowd.max, RANGES.crowd.step),
  traffic: num(RANGES.traffic.min, RANGES.traffic.max, RANGES.traffic.step),
  aa: oneOf(AA_MODES),
  ao: bool, bloom: bool, dof: bool, vignette: bool, grain: bool,
  textures: oneOf(TEXTURE_LEVELS),
  fpsCap: oneOf<FpsCap>([0, 30, 60]),
  fov: num(RANGES.fov.min, RANGES.fov.max, 1),
  showFps: bool,
};

/** Validates one value (clamps numbers, rejects unknown enum values). Undefined = invalid. */
export function sanitize<K extends GraphicsKey>(key: K, v: unknown): GraphicsSettings[K] | undefined {
  return VALIDATE[key](v);
}

/** Preset merged with the player's overrides (invalid override values are ignored; a shadow mode the tier cannot do falls back). */
export function mergeGraphics(tier: Quality, overrides: Partial<GraphicsSettings>): GraphicsSettings {
  const out: GraphicsSettings = presetFor(tier);
  for (const k of GRAPHICS_KEYS) {
    if (!(k in overrides)) continue;
    const v = sanitize(k, overrides[k]);
    if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  }
  if (!supports(tier).shadows.includes(out.shadows)) out.shadows = presetFor(tier).shadows;
  return out;
}

/** Overrides as stored: only valid keys with valid values. */
export function parseOverrides(raw: unknown): Partial<GraphicsSettings> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return out;
  const o = (raw as { overrides?: unknown }).overrides;
  if (!o || typeof o !== 'object') return out;
  for (const k of GRAPHICS_KEYS) {
    const v = sanitize(k, (o as Record<string, unknown>)[k]);
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<GraphicsSettings>;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function defaultStorage(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The player's overrides, their persistence and change notification. */
export class GraphicsStore {
  private overrides: Partial<GraphicsSettings> = {};
  private readonly listeners = new Set<(changed: readonly GraphicsKey[]) => void>();
  private readonly storage: Store | null;

  constructor(storage: Store | null | undefined = undefined) {
    this.storage = storage === undefined ? defaultStorage() : storage;
    if (this.storage) {
      try {
        const raw = this.storage.getItem(GRAPHICS_KEY);
        if (raw) this.overrides = parseOverrides(JSON.parse(raw));
      } catch { /* corrupt or blocked: start from the presets */ }
    }
  }

  /** True when at least one setting differs from "follow the tier". */
  get hasOverrides(): boolean { return Object.keys(this.overrides).length > 0; }
  isOverridden(key: GraphicsKey): boolean { return key in this.overrides; }
  get raw(): Readonly<Partial<GraphicsSettings>> { return this.overrides; }

  effective(tier: Quality): GraphicsSettings { return mergeGraphics(tier, this.overrides); }

  set<K extends GraphicsKey>(key: K, value: GraphicsSettings[K]): boolean {
    const v = sanitize(key, value);
    if (v === undefined || this.overrides[key] === v) return false;
    (this.overrides as Record<string, unknown>)[key] = v;
    this.persist();
    this.emit([key]);
    return true;
  }

  /** "Reset to preset": drop every override. */
  reset(): void {
    const keys = Object.keys(this.overrides) as GraphicsKey[];
    if (!keys.length) return;
    this.overrides = {};
    this.persist();
    this.emit(keys);
  }

  onChange(fn: (changed: readonly GraphicsKey[]) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(keys: readonly GraphicsKey[]): void { for (const fn of [...this.listeners]) fn(keys); }

  private persist(): void {
    try { this.storage?.setItem(GRAPHICS_KEY, JSON.stringify({ v: 1, overrides: this.overrides })); } catch { /* quota / blocked: not persisted */ }
  }
}

/** Environment the pixel ratio depends on. */
export interface GfxEnv { devicePixelRatio: number; cssWidth: number }

/** Concrete numbers for the engine (everything main.ts needs to call a setter with). */
export interface DerivedGraphics {
  pixelRatio: number;
  /** DistanceCuller range for props / parked cars / peds (m) */
  cullDistance: number;
  /** multiplier for chunkRangeFor(tier) */
  chunkScale: number;
  pedDistance: number;
  /** InstanceCuller range (m) */
  instanceDistance: number;
  traffic: TierTraffic;
  anisotropy: number;
  normalMaps: boolean;
  /** shadow-map quality to hand setupShadows (phone + blob keeps the phone caster map), or null for no shadow map */
  shadowMap: Quality | null;
  /** instanced soft decals under cars and pedestrians */
  blobs: boolean;
  /** degrees added to the camera fov */
  fovOffset: number;
  /** frames per second limit, 0 = none */
  maxFps: number;
  post: { ao: boolean; bloom: boolean; dof: boolean; aa: boolean; vignette: boolean; grain: boolean };
  showFps: boolean;
}

const ANISO: Record<TextureQuality, number> = { low: 2, medium: 4, high: 16 };

export function deriveGraphics(tier: Quality, g: GraphicsSettings, env: GfxEnv): DerivedGraphics {
  const t = tierConfig(tier);
  const sup = supports(tier).keys;
  const dpr = Number.isFinite(env.devicePixelRatio) && env.devicePixelRatio > 0 ? env.devicePixelRatio : 1;
  const base = sup.has('nativeDpr') && g.nativeDpr ? Math.min(3, dpr) : pixelRatioFor(tier, dpr, env.cssWidth);
  const tr = t.traffic;
  const shadowOn = g.shadows !== 'off' && g.shadows !== 'blob';
  return {
    pixelRatio: Math.max(0.25, base * g.resolution),
    cullDistance: t.cullDistance * g.drawDistance,
    chunkScale: g.drawDistance,
    pedDistance: t.pedDistance * g.drawDistance,
    instanceDistance: t.instanceDistance * g.treeRange,
    traffic: {
      maxMoving: Math.round(tr.maxMoving * g.traffic),
      peds: Math.round(tr.peds * g.crowd),
      parkOccupancy: tr.parkOccupancy * Math.min(1, g.traffic), // parked kerbs are generated once, so they can only thin out
      cops: Math.round(tr.cops * Math.min(1.5, g.traffic)),
    },
    anisotropy: Math.min(t.anisotropy, ANISO[g.textures]),
    normalMaps: g.textures !== 'low',
    shadowMap: tier === 'phone' ? (g.shadows === 'blob' ? 'phone' : null) : shadowOn ? (g.shadows as Quality) : null,
    blobs: g.shadows === 'blob',
    fovOffset: g.fov - BASE_FOV,
    maxFps: g.fpsCap,
    post: { ao: g.ao, bloom: g.bloom, dof: g.dof, aa: g.aa === 'smaa', vignette: g.vignette, grain: g.grain },
    showFps: g.showFps,
  };
}

/** Pixel ratio the renderer should use: replaces main.ts `pixelRatioFor(quality, devicePixelRatio, innerWidth)`. */
export function effectivePixelRatio(tier: Quality, g: GraphicsSettings, env: GfxEnv): number {
  return deriveGraphics(tier, g, env).pixelRatio;
}

/** Label for a multiplier / percentage value. */
export const pct = (v: number): string => `${Math.round(v * 100)}%`;

/* ---------- rough GPU cost, for the menu's "GPU load" bar ---------- */

/** Weight of each setting in the total, and its own 0..1 cost for a value. Rough: it ranks settings, it is not a profiler. */
const LOAD_TERMS: { [K in GraphicsKey]: { w: number; f: (g: GraphicsSettings) => number } } = {
  resolution: { w: 30, f: (g) => g.resolution * g.resolution },
  nativeDpr: { w: 5, f: (g) => (g.nativeDpr ? 1 : 0) },
  shadows: { w: 14, f: (g) => ({ off: 0, blob: 0.07, low: 0.35, medium: 0.65, high: 1 })[g.shadows] },
  drawDistance: { w: 10, f: (g) => (g.drawDistance - RANGES.drawDistance.min) / (RANGES.drawDistance.max - RANGES.drawDistance.min) },
  treeRange: { w: 4, f: (g) => (g.treeRange - RANGES.treeRange.min) / (RANGES.treeRange.max - RANGES.treeRange.min) },
  crowd: { w: 3, f: (g) => g.crowd / RANGES.crowd.max },
  traffic: { w: 3, f: (g) => g.traffic / RANGES.traffic.max },
  aa: { w: 4, f: (g) => (g.aa === 'smaa' ? 1 : 0) },
  ao: { w: 8, f: (g) => (g.ao ? 1 : 0) },
  bloom: { w: 4, f: (g) => (g.bloom ? 1 : 0) },
  dof: { w: 5, f: (g) => (g.dof ? 1 : 0) },
  vignette: { w: 0.5, f: (g) => (g.vignette ? 1 : 0) },
  grain: { w: 1, f: (g) => (g.grain ? 1 : 0) },
  textures: { w: 4, f: (g) => ({ low: 0.15, medium: 0.5, high: 1 })[g.textures] },
  fpsCap: { w: 0, f: () => 0 },
  fov: { w: 1, f: (g) => (g.fov - RANGES.fov.min) / (RANGES.fov.max - RANGES.fov.min) },
  showFps: { w: 0, f: () => 0 },
};

/** How heavy one setting is at its current value, 0..1 of its own range (the per-option bar). */
export function optionLoad(key: GraphicsKey, g: GraphicsSettings): number {
  return Math.min(1, Math.max(0, LOAD_TERMS[key].f(g)));
}

/** Rough share of the GPU budget the whole set of settings asks for, 0..1. Only settings the tier honours count. */
export function gpuLoad(g: GraphicsSettings, tier: Quality): number {
  const sup = supports(tier).keys;
  let sum = 0, max = 0;
  for (const k of GRAPHICS_KEYS) {
    if (!sup.has(k)) continue;
    const t = LOAD_TERMS[k];
    sum += t.w * optionLoad(k, g);
    max += t.w;
  }
  return max > 0 ? sum / max : 0;
}

export type LoadLabel = 'Light' | 'Moderate' | 'Heavy' | 'Very heavy';
export function loadLabel(load: number): LoadLabel {
  return load < 0.3 ? 'Light' : load < 0.55 ? 'Moderate' : load < 0.8 ? 'Heavy' : 'Very heavy';
}
