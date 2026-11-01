/**
 * Hosted-build texture upgrades (VITE_HOSTED=1; see vite.config.ts and README "Deploy on Vercel").
 *
 * The single-file artifact ships the 1K sets from ./packs.ts and nothing else: every function here is a no-op there
 * (and the 2K glob below is compiled out, so extra files never get inlined into the artifact).
 *
 * In the hosted build, after the first frame is on screen, `startHostedTextures` loads the larger tier for the current
 * quality and swaps it into the MaterialLibrary through `overrideMaps`, the same path ./packs.ts uses. Today only the
 * '1k' tier exists (it is the base, so nothing is downloaded and nothing changes) and `?q=ultra` still raises
 * anisotropy to 16. Adding 2K sets is a file drop, no code change:
 *
 *   src/assets/textures/2k/<key>.<variant>_color.jpg      (required)
 *   src/assets/textures/2k/<key>.<variant>_normal.jpg     (optional, the 1K normal map is kept when missing)
 *   src/assets/textures/2k/<key>.<variant>_rough.jpg      (optional, same)
 *
 * with `<key>` a MaterialKey and `<variant>` the material variant, exactly like the user photo packs
 * (docs/PHOTO-TEXTURES.md), e.g. `asphalt.0_color.jpg`. Repeat, normal strength, roughness and env intensity are inherited from the
 * built-in entry for the same key/variant. A `4k` folder works the same way. Licence first: add the CREDITS entry before landing a set.
 * GPU memory: a 2K colour map with mips is ~22 MB, so give 2K to the big surfaces (asphalt, concrete, brick, brownstone, roof) only.
 */
import * as THREE from 'three';
import type { MaterialKey } from '@/world/types';
import type { MapOverride } from '@/textures/MaterialLibrary';
import type { Quality } from '@/render/Shadows';
import {
  BASE_TIER, TEXTURE_PROFILES, USER_PACKS, effectivePackEntries, packDefaults, setPackAnisotropy, tierRank,
  type PackEntry, type TextureProfile, type TextureTier,
} from '@/textures/packs';

/** True in the hosted (multi-file) build, false in the single-file artifact and in tests. */
export const IS_HOSTED: boolean = import.meta.env.VITE_HOSTED === '1';

/**
 * Larger-tier files (path -> url). Only globbed in the hosted build: in the artifact the ternary is constant-folded
 * away, so nothing dropped into these folders can ever be base64-inlined into the single page.
 */
const HOSTED_FILES: Record<string, string> = IS_HOSTED
  ? (import.meta.glob('@/assets/textures/[2-9]k/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
  : {};

// ---------------------------------------------------------------------------------------------------------------- manifest

export type MapKind = 'color' | 'normal' | 'rough';
/** One texture set at one tier, with the material parameters it inherits. */
export interface HostedSet extends PackEntry { tier: TextureTier }
/** `key:variant` -> sets ordered by ascending tier. */
export type HostedManifest = Record<string, HostedSet[]>;

/** Parse ".../2k/brickRed.2_normal.jpg" into tier, key, variant and map kind. Only tiers above the base are meaningful. */
export function parseHostedTextureName(path: string): { tier: TextureTier; key: string; variant: number; kind: MapKind } | null {
  const m = /\/(\d+k)\/([A-Za-z]+)(?:\.(\d+))?_(color|normal|rough)\.(?:jpe?g|png|webp)$/.exec(path);
  if (!m) return null;
  return { tier: m[1] as TextureTier, key: m[2], variant: m[3] ? parseInt(m[3], 10) : 0, kind: m[4] as MapKind };
}

/**
 * Group larger-tier files into sets. A set needs a colour map; material parameters come from the built-in
 * entry with the same key/variant (falling back to the per-key defaults).
 */
export function buildHostedManifest(files: Record<string, string>, base: Map<string, PackEntry> = effectivePackEntries()): HostedManifest {
  const sets = new Map<string, Partial<Record<MapKind, string>> & { tier: TextureTier; key: string; variant: number }>();
  for (const [path, url] of Object.entries(files)) {
    const p = parseHostedTextureName(path);
    if (!p) continue;
    const id = `${p.tier}|${p.key}:${p.variant}`;
    const set = sets.get(id) ?? { tier: p.tier, key: p.key, variant: p.variant };
    set[p.kind] = url;
    sets.set(id, set);
  }
  const out: HostedManifest = {};
  for (const s of sets.values()) {
    if (!s.color) continue;
    const id = `${s.key}:${s.variant}`;
    const b = base.get(id);
    const d = packDefaults(s.key);
    const entry: HostedSet = {
      tier: s.tier, key: s.key as MaterialKey, variant: s.variant,
      color: s.color, normal: s.normal ?? '', rough: s.rough ?? '',
      repeat: b?.repeat ?? d.repeat, normalScale: b?.normalScale ?? d.normalScale,
      roughness: b?.roughness ?? d.roughness, envMapIntensity: b?.envMapIntensity ?? d.envMapIntensity,
    };
    (out[id] ??= []).push(entry);
  }
  for (const list of Object.values(out)) list.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  return out;
}

/** Best set per key/variant that is above the base tier and not above `maxTier`. `skip` holds ids that must stay as they are. */
export function pickUpgrades(manifest: HostedManifest, maxTier: TextureTier, skip: ReadonlySet<string> = new Set()): HostedSet[] {
  const max = tierRank(maxTier);
  const out: HostedSet[] = [];
  for (const [id, list] of Object.entries(manifest)) {
    if (skip.has(id)) continue;
    let best: HostedSet | undefined;
    for (const s of list) if (tierRank(s.tier) > tierRank(BASE_TIER) && tierRank(s.tier) <= max) best = s;
    if (best) out.push(best);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- quality

export interface ResolvedQuality {
  /** the tier the renderer understands (ultra renders as 'high') */
  quality: Quality;
  /** hosted build and `?q=ultra` */
  ultra: boolean;
}

/**
 * Parse the `q` URL parameter. Anything but phone/low/medium/high/ultra falls back to the device default (touch: phone, else medium). `ultra` exists
 * only in the hosted build: there it means quality 'high' plus the ultra texture profile; in the artifact it is plain 'high'.
 */
export function resolveQuality(param: string | null | undefined, isTouch: boolean, hosted: boolean = IS_HOSTED): ResolvedQuality {
  if (param === 'phone' || param === 'low' || param === 'medium' || param === 'high') return { quality: param, ultra: false };
  if (param === 'ultra') return { quality: 'high', ultra: hosted };
  return { quality: isTouch ? 'phone' : 'medium', ultra: false };
}

/** Texture profile for a resolved quality. */
export function textureProfile(ultra: boolean): TextureProfile {
  return ultra ? TEXTURE_PROFILES.ultra : TEXTURE_PROFILES.standard;
}

// ---------------------------------------------------------------------------------------------------------------- loader

/** The slice of THREE.TextureLoader the upgrade needs (so tests can pass a fake). */
export interface TextureLoaderLike { loadAsync(url: string): Promise<THREE.Texture> }
/** The slice of MaterialLibrary the upgrade needs. */
export interface MaterialSink {
  get(key: MaterialKey, variant?: number): THREE.Material;
  overrideMaps(key: MaterialKey, variant: number, maps: MapOverride): void;
}

export interface HostedOptions {
  /** default IS_HOSTED; false makes everything below a no-op */
  hosted?: boolean;
  /** `?q=ultra` in the hosted build */
  ultra?: boolean;
  /** renderer.capabilities.getMaxAnisotropy(); ultra anisotropy is clamped to it */
  maxAnisotropy?: number;
  /** larger-tier files, default: the 2K+ folders globbed at build time */
  files?: Record<string, string>;
  /** default: THREE.TextureLoader */
  loader?: TextureLoaderLike;
  /** resolves when it is fine to start downloading; default: two animation frames, then idle time */
  schedule?: () => Promise<void>;
  /** sets loaded in parallel, default 2 */
  concurrency?: number;
  /** ids ("key:variant") that must keep their current maps; default: every key/variant with a user photo pack */
  skip?: ReadonlySet<string>;
}

export interface HostedResult {
  /** key/variant sets swapped to a larger tier */
  upgraded: number;
  /** pack textures whose anisotropy was raised */
  retuned: number;
  /** tier that was targeted ('1k' when nothing larger was wanted or available) */
  tier: TextureTier;
  /** true when nothing ran at all (artifact build, or cancelled before start) */
  skipped: boolean;
}

export interface HostedHandle {
  done: Promise<HostedResult>;
  cancel(): void;
}

/** Resolves after the first frames are on screen and the main thread is idle (falls back to timers without rAF / idle callbacks). */
export function afterFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    const raf: (cb: () => void) => unknown = typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(() => cb()) : (cb) => setTimeout(cb, 16);
    raf(() => raf(() => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(() => resolve(), { timeout: 2000 }); else setTimeout(resolve, 200);
    }));
  });
}

/** ids with a user photo pack: those win over the built-in sets and so over any larger tier. */
function userIds(): Set<string> {
  return new Set(USER_PACKS.map((e) => `${e.key}:${e.variant}`));
}

/**
 * Hosted build only: after first paint, swap larger-tier maps into the library and (ultra) raise anisotropy.
 * Call it once the splash is gone. Never throws; individual failed sets are skipped with a console warning.
 */
export function startHostedTextures(materials: MaterialSink, opts: HostedOptions = {}): HostedHandle {
  const hosted = opts.hosted ?? IS_HOSTED;
  const profile = textureProfile(!!opts.ultra);
  if (!hosted) return { done: Promise.resolve({ upgraded: 0, retuned: 0, tier: BASE_TIER, skipped: true }), cancel() {} };

  let cancelled = false;
  const run = async (): Promise<HostedResult> => {
    await (opts.schedule ?? afterFirstPaint)();
    if (cancelled) return { upgraded: 0, retuned: 0, tier: BASE_TIER, skipped: true };

    const aniso = profile.anisotropy === null ? null : Math.max(1, Math.min(profile.anisotropy, opts.maxAnisotropy ?? profile.anisotropy));
    let retuned = aniso === null ? 0 : setPackAnisotropy(aniso);

    const manifest = buildHostedManifest(opts.files ?? HOSTED_FILES);
    const todo = pickUpgrades(manifest, profile.maxTier, opts.skip ?? userIds());
    const loader: TextureLoaderLike = opts.loader ?? new THREE.TextureLoader();
    const cache = new Map<string, Promise<THREE.Texture>>();
    const load = (url: string, srgb: boolean): Promise<THREE.Texture> => {
      const id = url + (srgb ? '#srgb' : '#data');
      let p = cache.get(id);
      if (!p) {
        p = loader.loadAsync(url).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          if (aniso !== null) t.anisotropy = aniso;
          t.needsUpdate = true;
          return t;
        });
        cache.set(id, p);
      }
      return p;
    };

    let upgraded = 0;
    let top: TextureTier = BASE_TIER;
    const swap = async (s: HostedSet): Promise<void> => {
      const [map, normalMap, roughnessMap] = await Promise.all([load(s.color, true), s.normal ? load(s.normal, false) : undefined, s.rough ? load(s.rough, false) : undefined]);
      if (cancelled) return;
      const m = materials.get(s.key, s.variant) as THREE.MeshStandardMaterial;
      const prev = [m.map, m.normalMap, m.roughnessMap];
      materials.overrideMaps(s.key, s.variant, {
        map,
        normalMap: normalMap ?? m.normalMap ?? undefined,
        roughnessMap: roughnessMap ?? m.roughnessMap ?? undefined,
        repeat: { x: s.repeat, y: s.repeat },
        normalScale: s.normalScale,
      });
      if (aniso !== null) for (const t of [map, normalMap, roughnessMap]) if (t && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; retuned++; }
      m.needsUpdate = true;
      for (const t of prev) if (t && t !== map && t !== normalMap && t !== roughnessMap) t.dispose(); // frees GPU memory; shared maps re-upload on demand
      upgraded++;
      if (tierRank(s.tier) > tierRank(top)) top = s.tier;
    };

    const queue = [...todo];
    const worker = async (): Promise<void> => {
      for (let s = queue.shift(); s && !cancelled; s = queue.shift()) {
        try { await swap(s); } catch (e) { console.warn(`hosted texture ${s.key}:${s.variant} (${s.tier}) failed`, e); }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 2) }, worker));
    return { upgraded, retuned, tier: top, skipped: false };
  };

  const done = run().catch((e) => { console.warn('hosted textures failed', e); return { upgraded: 0, retuned: 0, tier: BASE_TIER, skipped: true } as HostedResult; });
  return { done, cancel() { cancelled = true; } };
}

/** Hosted-only: what a deployed page can say about itself (for the debug hook / bug reports). */
export function describeBuild(): { hosted: boolean; tiers: string[] } {
  const tiers = new Set<string>([BASE_TIER]);
  for (const list of Object.values(buildHostedManifest(HOSTED_FILES))) for (const s of list) tiers.add(s.tier);
  return { hosted: IS_HOSTED, tiers: [...tiers].sort((a, b) => tierRank(a) - tierRank(b)) };
}
