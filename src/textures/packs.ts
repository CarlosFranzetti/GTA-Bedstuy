/**
 * Photo-based PBR texture packs (CC0, derived from ambientCG; see docs/CREDITS.md) that replace the
 * canvas-painted maps for the big surfaces: masonry, sidewalks, asphalt, roofs. Everything else stays procedural.
 * Vite inlines these imports as data URIs in the single-file build.
 */
import * as THREE from 'three';
import type { MaterialKey } from '@/world/types';
import type { MaterialLibrary } from '@/textures/MaterialLibrary';

import brickRed from '@/assets/textures/brick_red_color.jpg';
import brickBrown from '@/assets/textures/brick_brown_color.jpg';
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
import paving from '@/assets/textures/paving_color.jpg';
import pavingN from '@/assets/textures/paving_normal.jpg';
import pavingR from '@/assets/textures/paving_rough.jpg';
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
}

export const TEXTURE_PACKS: PackEntry[] = [
  { key: 'brickRed', variant: 0, color: brickRed, normal: brickN, rough: brickR, repeat: 2, normalScale: 0.9 },
  { key: 'brickRed', variant: 1, color: brickBrown, normal: brickN, rough: brickR, repeat: 2, normalScale: 0.9 },
  { key: 'brickRed', variant: 2, color: brickWhite, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 },
  { key: 'brickRed', variant: 3, color: brickGrey, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 },
  { key: 'brickPainted', variant: 0, color: brickWhite, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 },
  { key: 'brickPainted', variant: 1, color: brickGrey, normal: brickN, rough: brickPaintedR, repeat: 2, normalScale: 0.6 },
  { key: 'brownstone', variant: 0, color: brownstone, normal: brownstoneN, rough: brownstoneR, repeat: 1.5, normalScale: 1.0 },
  { key: 'limestone', variant: 0, color: limestone, normal: limestoneN, rough: limestoneR, repeat: 1.5, normalScale: 0.7 },
  { key: 'concrete', variant: 0, color: sidewalk, normal: sidewalkN, rough: sidewalkR, repeat: 1, normalScale: 0.8 },
  { key: 'concrete', variant: 1, color: paving, normal: pavingN, rough: pavingR, repeat: 1.5, normalScale: 0.8 },
  { key: 'asphalt', variant: 0, color: asphalt, normal: asphaltN, rough: asphaltR, repeat: 1, normalScale: 0.5 },
  { key: 'asphalt', variant: 1, color: asphaltWorn, normal: asphaltN, rough: asphaltWornR, repeat: 1, normalScale: 0.5 },
  { key: 'asphaltWorn', variant: 0, color: asphaltWorn, normal: asphaltN, rough: asphaltWornR, repeat: 1, normalScale: 0.5 },
  { key: 'asphaltWorn', variant: 1, color: asphaltWorn, normal: asphaltN, rough: asphaltWornR, repeat: 1, normalScale: 0.5 },
  { key: 'roof', variant: 0, color: roof, normal: roofN, rough: roofR, repeat: 1, normalScale: 0.6 },
];

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
  let n = 0;
  await Promise.all(TEXTURE_PACKS.map(async (e) => {
    const [map, normalMap, roughnessMap] = await Promise.all([load(e.color, true), load(e.normal, false), load(e.rough, false)]);
    materials.overrideMaps(e.key, e.variant, { map, normalMap, roughnessMap, repeat: { x: e.repeat, y: e.repeat }, normalScale: e.normalScale });
    n++;
  }));
  return n;
}
