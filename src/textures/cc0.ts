/**
 * CC0 PBR sets (src/assets/textures/cc0/<set>/{color,normal,rough}_{512,1k}.jpg, licences in each folder and docs/CREDITS.md)
 * wired onto the world materials. The single-file artifact inlines only the 512 px files (size budget); the hosted build
 * (VITE_HOSTED=1) ships only the 1k files. Both globs are literal and constant-folded, so the other size never reaches a bundle.
 * The procedural painter stays underneath as the fallback: a material keeps its painted maps until the photo set has loaded.
 */
import type { MaterialKey } from '@/world/types';
import type { PackEntry } from '@/textures/packs';
import { CORRUGATED_VARIANTS, CAST_IRON_VARIANTS, TAR_ROOF_VARIANTS } from '@/textures/painters/industrial';
import { ROLLGATE_VARIANTS } from '@/textures/painters/metal';

const HOSTED = import.meta.env.VITE_HOSTED === '1';

const FILES_512 = !HOSTED
  ? (import.meta.glob('@/assets/textures/cc0/{asphalt,bluestone_slate,brick_brownstone,brick_painted,brick_red_common,concrete_sidewalk,corrugated_metal,grime_wall,painted_metal,tar_roof,weathered_wood}/*_512.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
  : {};
const FILES_1K = HOSTED
  ? (import.meta.glob('@/assets/textures/cc0/{asphalt,bluestone_slate,brick_brownstone,brick_painted,brick_red_common,concrete_sidewalk,corrugated_metal,grime_wall,painted_metal,tar_roof,weathered_wood}/*_1k.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
  : {};

export type Cc0Set = 'asphalt' | 'bluestone_slate' | 'brick_brownstone' | 'brick_painted' | 'brick_red_common' | 'concrete_sidewalk'
  | 'corrugated_metal' | 'grime_wall' | 'painted_metal' | 'tar_roof' | 'weathered_wood';

export interface Cc0Urls { color: string; normal: string; rough: string }

/** URLs of a set at the size this build ships (512 in the artifact, 1k hosted); empty strings when the file is missing. */
export function cc0Urls(set: Cc0Set, files: Record<string, string> = HOSTED ? FILES_1K : FILES_512): Cc0Urls {
  const find = (kind: string): string => {
    for (const [p, u] of Object.entries(files)) if (p.includes(`/cc0/${set}/${kind}_`)) return u;
    return '';
  };
  return { color: find('color'), normal: find('normal'), rough: find('rough') };
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/**
 * Pack entries for the cc0 sets. `colorless` entries carry only normal + roughness (the painted colour map, with its slats /
 * alpha cut-outs, stays). `tint` multiplies the albedo (the painted-brick set serves cream and blue-grey variants).
 */
export function cc0Entries(files?: Record<string, string>): PackEntry[] {
  const u = (s: Cc0Set): Cc0Urls => cc0Urls(s, files);
  const e = (key: MaterialKey, variant: number, set: Cc0Set, p: Partial<PackEntry> & { repeat: number; normalScale: number }, colorless = false): PackEntry => {
    const url = u(set);
    return { key, variant, color: colorless ? '' : url.color, normal: url.normal, rough: url.rough, roughness: 1, envMapIntensity: 0.1, ...p };
  };
  const out: PackEntry[] = [
    e('brickRed', 0, 'brick_red_common', { repeat: 2, normalScale: 0.9 }),
    e('brickRed', 1, 'brick_brownstone', { repeat: 2, normalScale: 0.9 }),
    e('brickRed', 2, 'brick_painted', { repeat: 2, normalScale: 0.6, tint: '#f1e7cf' }),
    e('brickRed', 3, 'brick_painted', { repeat: 2, normalScale: 0.6, tint: '#aab4c2' }),
    e('brickPainted', 0, 'brick_painted', { repeat: 2, normalScale: 0.6, tint: '#f1e7cf' }),
    e('brickPainted', 1, 'brick_painted', { repeat: 2, normalScale: 0.6, tint: '#aab4c2' }),
    e('brownstone', 0, 'brick_brownstone', { repeat: 1.5, normalScale: 1.0 }),
    e('brownstone', 1, 'brick_brownstone', { repeat: 1.5, normalScale: 1.0, tint: '#d9c4b4' }),
    e('stoop', 0, 'brick_brownstone', { repeat: 1.5, normalScale: 0.8, tint: '#c9b8a8' }),
    e('asphalt', 0, 'asphalt', { repeat: 1, normalScale: 0.5, envMapIntensity: 0.2 }),
    e('asphalt', 1, 'asphalt', { repeat: 1, normalScale: 0.5, envMapIntensity: 0.2, tint: '#cfcfcf' }),
    e('asphaltWorn', 0, 'asphalt', { repeat: 1, normalScale: 0.5, envMapIntensity: 0.2, tint: '#cfcfcf' }),
    e('asphaltWorn', 1, 'asphalt', { repeat: 1, normalScale: 0.5, envMapIntensity: 0.2, tint: '#bdbdbd' }),
    e('concrete', 0, 'concrete_sidewalk', { repeat: 1, normalScale: 0.8, envMapIntensity: 0.12 }),
    e('bluestone', 0, 'bluestone_slate', { repeat: 1, normalScale: 0.6, envMapIntensity: 0.12 }),
    e('bluestone', 1, 'bluestone_slate', { repeat: 1, normalScale: 0.6, envMapIntensity: 0.12, tint: '#d8d8dc' }),
    e('waterTank', 0, 'weathered_wood', { repeat: 3, normalScale: 0.7 }),
  ];
  for (const v of range(CORRUGATED_VARIANTS)) out.push(e('corrugatedSteel', v, 'corrugated_metal', { repeat: 1, normalScale: 0.8, envMapIntensity: 0.3 }));
  for (const v of range(TAR_ROOF_VARIANTS)) out.push(e('tarRoof', v, 'tar_roof', { repeat: 1.5, normalScale: 0.6 }));
  // painted metal: only the micro relief and roughness, the painted slat / spear maps keep their silhouettes
  for (const v of range(ROLLGATE_VARIANTS)) out.push(e('rollGate', v, 'painted_metal', { repeat: 1, normalScale: 0.6, roughness: 0.9, envMapIntensity: 0.3 }, true));
  for (const v of range(CAST_IRON_VARIANTS)) out.push(e('castIronFence', v, 'painted_metal', { repeat: 1, normalScale: 0.5, roughness: 0.9, envMapIntensity: 0.3 }, true));
  return out.filter((x) => x.normal || x.rough || x.color);
}

/** Grime texture for the multiply overlay on wall bases. */
export function grimeUrl(files?: Record<string, string>): string { return cc0Urls('grime_wall', files).color; }
