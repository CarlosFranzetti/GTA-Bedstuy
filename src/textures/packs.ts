/**
 * Photo-based PBR texture packs (CC0, derived from ambientCG; see docs/CREDITS.md) that replace the
 * canvas-painted maps for the big surfaces: masonry, sidewalks, asphalt, roofs. Everything else stays procedural.
 * Vite inlines these imports as data URIs in the single-file build.
 */
import * as THREE from 'three';
import type { MaterialKey } from '@/world/types';
import type { MaterialLibrary } from '@/textures/MaterialLibrary';

import brickRed from '@/assets/textures/brick_red_color.jpg';
import brickWhite from '@/assets/textures/brick_white_color.jpg';
import brickGrey from '@/assets/textures/brick_grey_color.jpg';
import brickN from '@/assets/textures/brick_normal.jpg';
import brickR from '@/assets/textures/brick_rough.jpg';
import brickPaintedR from '@/assets/textures/brick_painted_rough.jpg';
import brownstone from '@/assets/textures/brownstone_color.jpg';
import brownstoneN from '@/assets/textures/brownstone_normal.jpg';
import brownstoneR from '@/assets/textures/brownstone_rough.jpg';
import limestone from '@/assets/textures/limestone_color.jpg';
import limestoneN from '@/assets/textures/limestone_normal.jpg';
import limestoneR from '@/assets/textures/limestone_rough.jpg';
import sidewalk from '@/assets/textures/sidewalk_color.jpg';
import sidewalkN from '@/assets/textures/sidewalk_normal.jpg';
import sidewalkR from '@/assets/textures/sidewalk_rough.jpg';
import dirt from '@/assets/textures/dirt_color.jpg';
import dirtN from '@/assets/textures/dirt_normal.jpg';
import dirtR from '@/assets/textures/dirt_rough.jpg';
import brickTan from '@/assets/textures/brick_tan_color.jpg';
import brickTanN from '@/assets/textures/brick_tan_normal.jpg';
import brickTanR from '@/assets/textures/brick_tan_rough.jpg';
import asphalt from '@/assets/textures/asphalt_color.jpg';
import asphaltWorn from '@/assets/textures/asphalt_worn_color.jpg';
import asphaltN from '@/assets/textures/asphalt_normal.jpg';
import asphaltR from '@/assets/textures/asphalt_rough.jpg';
import asphaltWornR from '@/assets/textures/asphalt_worn_rough.jpg';
import roof from '@/assets/textures/roof_color.jpg';
import roofN from '@/assets/textures/roof_normal.jpg';
import roofR from '@/assets/textures/roof_rough.jpg';

export interface PackEntry {
  key: MaterialKey;
  variant: number;
  color: string;
  normal: string;
  rough: string;
  /** texture repeats per 3 m UV tile (facade convention); = 3 / physical tile size in metres */
  repeat: number;
  normalScale: number;
  /** base roughness multiplier for the roughness map (1 = use the map as-is) and reflection strength */
  roughness?: number;
  envMapIntensity?: number;
}

export const TEXTURE_PACKS: PackEntry[] = [
  { key: 'brickRed', variant: 0, color: brickRed, normal: brickN, rough: brickR, repeat: 2, normalScale: 0.9 , roughness: 1, envMapIntensity: 0.1 },
  { key: 'brickRed', variant: 1, color: brickTan, normal: brickTanN, rough: brickTanR, repeat: 2, normalScale: 0.9, roughness: 1, envMapIntensity: 0.1 },
  { key: 'brickRed', variant: 2, color: brickWhite, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 , roughness: 1, envMapIntensity: 0.1 },
  { key: 'brickRed', variant: 3, color: brickGrey, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 , roughness: 1, envMapIntensity: 0.1 },
  { key: 'brickPainted', variant: 0, color: brickWhite, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 , roughness: 1, envMapIntensity: 0.1 },
  { key: 'brickPainted', variant: 1, color: brickGrey, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 , roughness: 1, envMapIntensity: 0.1 },
  { key: 'brownstone', variant: 0, color: brownstone, normal: brownstoneN, rough: brownstoneR, repeat: 1.5, normalScale: 1.0 , roughness: 1, envMapIntensity: 0.1 },
  { key: 'limestone', variant: 0, color: limestone, normal: limestoneN, rough: limestoneR, repeat: 1.5, normalScale: 0.7 , roughness: 1, envMapIntensity: 0.1 },
  { key: 'concrete', variant: 0, color: sidewalk, normal: sidewalkN, rough: sidewalkR, repeat: 1, normalScale: 0.8 , roughness: 1, envMapIntensity: 0.12 },
  { key: 'concrete', variant: 1, color: dirt, normal: dirtN, rough: dirtR, repeat: 1.5, normalScale: 0.8, roughness: 1, envMapIntensity: 0.05 },
  { key: 'asphalt', variant: 0, color: asphalt, normal: asphaltN, rough: asphaltR, repeat: 1, normalScale: 0.5 , roughness: 1, envMapIntensity: 0.2 },
  { key: 'asphalt', variant: 1, color: asphaltWorn, normal: asphaltN, rough: asphaltWornR, repeat: 1, normalScale: 0.5 , roughness: 1, envMapIntensity: 0.2 },
  { key: 'asphaltWorn', variant: 0, color: asphaltWorn, normal: asphaltN, rough: asphaltWornR, repeat: 1, normalScale: 0.5 , roughness: 1, envMapIntensity: 0.2 },
  { key: 'asphaltWorn', variant: 1, color: asphaltWorn, normal: asphaltN, rough: asphaltWornR, repeat: 1, normalScale: 0.5 , roughness: 1, envMapIntensity: 0.2 },
  { key: 'roof', variant: 0, color: roof, normal: roofN, rough: roofR, repeat: 1, normalScale: 0.6 , roughness: 1, envMapIntensity: 0.1 },
];

/** Defaults for user photo packs (docs/PHOTO-TEXTURES.md), keyed by material. Unknown keys get repeat 1.5. */
const USER_DEFAULTS: Partial<Record<MaterialKey, { repeat: number; normalScale: number; roughness: number; envMapIntensity: number }>> = {
  brickRed: { repeat: 2, normalScale: 0.9, roughness: 1, envMapIntensity: 0.1 },
  brickPainted: { repeat: 2, normalScale: 0.6, roughness: 1, envMapIntensity: 0.1 },
  brownstone: { repeat: 1.5, normalScale: 1, roughness: 1, envMapIntensity: 0.1 },
  limestone: { repeat: 1.5, normalScale: 0.7, roughness: 1, envMapIntensity: 0.1 },
  concrete: { repeat: 1, normalScale: 0.8, roughness: 1, envMapIntensity: 0.12 },
  asphalt: { repeat: 1, normalScale: 0.5, roughness: 1, envMapIntensity: 0.2 },
  asphaltWorn: { repeat: 1, normalScale: 0.5, roughness: 1, envMapIntensity: 0.2 },
  roof: { repeat: 1, normalScale: 0.6, roughness: 1, envMapIntensity: 0.1 },
  rollGate: { repeat: 1, normalScale: 0.8, roughness: 0.9, envMapIntensity: 0.3 },
  cornice: { repeat: 1, normalScale: 0.8, roughness: 1, envMapIntensity: 0.1 },
};

/** Parse a user texture file path like ".../brownstone.0_color.jpg" into its key, variant and map kind. */
export function parseUserTextureName(path: string): { key: string; variant: number; kind: 'color' | 'normal' | 'rough' } | null {
  const m = /([A-Za-z]+)(?:\.(\d+))?_(color|normal|rough)\.(?:jpe?g|png|webp)$/.exec(path);
  if (!m) return null;
  return { key: m[1], variant: m[2] ? parseInt(m[2], 10) : 0, kind: m[3] as 'color' | 'normal' | 'rough' };
}

/** Group user texture files (path -> url) into pack entries; a set needs at least a colour map. */
export function userPackEntries(files: Record<string, string>): PackEntry[] {
  const sets = new Map<string, Partial<Record<'color' | 'normal' | 'rough', string>> & { key: string; variant: number }>();
  for (const [path, url] of Object.entries(files)) {
    const p = parseUserTextureName(path);
    if (!p) continue;
    const id = `${p.key}:${p.variant}`;
    const set = sets.get(id) ?? { key: p.key, variant: p.variant };
    set[p.kind] = url;
    sets.set(id, set);
  }
  const out: PackEntry[] = [];
  for (const s of sets.values()) {
    if (!s.color) continue;
    const d = USER_DEFAULTS[s.key as MaterialKey] ?? { repeat: 1.5, normalScale: 0.8, roughness: 1, envMapIntensity: 0.1 };
    out.push({ key: s.key as MaterialKey, variant: s.variant, color: s.color, normal: s.normal ?? '', rough: s.rough ?? '', ...d });
  }
  return out;
}

/** Photos you converted with scripts/photo-to-pbr.py (src/assets/textures/user/). Override the built-in packs. */
const USER_FILES = import.meta.glob('@/assets/textures/user/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const USER_PACKS: PackEntry[] = userPackEntries(USER_FILES);

/** Load every pack and hand the maps to the material library. Resolves to the number of entries applied. */
export async function loadTexturePacks(materials: MaterialLibrary, maxAnisotropy = 8, loader = new THREE.TextureLoader()): Promise<number> {
  const cache = new Map<string, Promise<THREE.Texture>>();
  const load = (url: string, srgb: boolean) => {
    let p = cache.get(url + srgb);
    if (!p) {
      p = loader.loadAsync(url).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = maxAnisotropy;
        t.needsUpdate = true;
        return t;
      });
      cache.set(url + srgb, p);
    }
    return p;
  };
  const byId = new Map<string, PackEntry>();
  for (const e of [...TEXTURE_PACKS, ...USER_PACKS]) byId.set(`${e.key}:${e.variant}`, e); // user photos win
  let n = 0;
  await Promise.all([...byId.values()].map(async (e) => {
    const [map, normalMap, roughnessMap] = await Promise.all([load(e.color, true), e.normal ? load(e.normal, false) : undefined, e.rough ? load(e.rough, false) : undefined]);
    materials.overrideMaps(e.key, e.variant, { map, normalMap, roughnessMap, repeat: { x: e.repeat, y: e.repeat }, normalScale: e.normalScale });
    const m = materials.get(e.key, e.variant) as THREE.MeshStandardMaterial;
    if (e.roughness !== undefined) m.roughness = e.roughness;
    if (e.envMapIntensity !== undefined) m.envMapIntensity = e.envMapIntensity;
    m.needsUpdate = true;
    n++;
  }));
  return n;
}
