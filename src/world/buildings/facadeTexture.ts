/**
 * Facade-photo atlases (scripts/photo-to-facade.py): `src/assets/textures/user/facade-<lotId>_{color,normal,rough}.jpg`
 * plus an entry per lot in `facades.json` ({ texture, floors, groundShare, widthM, heightM, atlasPx }).
 *
 * A lot whose spec carries `facadeTexture` (the file stem, "facade-<lotId>") gets one MeshStandardMaterial with the
 * three maps, mapped ONCE across the front face: u = x / lot width, v = y / photo height (the ground floor is the bottom
 * `groundShare` of the atlas, the upper floors the rest). When the files are missing the procedural facade is kept.
 */
import * as THREE from 'three';
import type { BuildingMats, LotSpec, LotBatch } from './facade';

export interface FacadeMeta { texture: string; floors: number; groundShare: number; widthM: number; heightM: number; atlasPx?: number | [number, number]; }
export interface FacadeAtlas { meta: FacadeMeta; color: string; normal?: string; rough?: string; }

const URLS = import.meta.glob('@/assets/textures/user/facade-*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const METAS = import.meta.glob('@/assets/textures/user/facades.json', { eager: true, import: 'default' }) as Record<string, unknown>;

function metaTable(): Map<string, FacadeMeta> {
  const out = new Map<string, FacadeMeta>();
  for (const v of Object.values(METAS)) {
    const list = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Record<string, unknown>) : [];
    for (const e of list as FacadeMeta[]) if (e && typeof e.texture === 'string') out.set(e.texture, e);
  }
  return out;
}

function discover(): Map<string, FacadeAtlas> {
  const metas = metaTable();
  const out = new Map<string, FacadeAtlas>();
  const urlOf = (stem: string, kind: string): string | undefined => {
    for (const [path, url] of Object.entries(URLS)) if (new RegExp(`/${stem}_${kind}\\.[a-z]+$`).test(path)) return url;
    return undefined;
  };
  for (const [stem, meta] of metas) {
    const color = urlOf(stem, 'color');
    if (color) out.set(stem, { meta, color, normal: urlOf(stem, 'normal'), rough: urlOf(stem, 'rough') });
  }
  return out;
}

let atlases: Map<string, FacadeAtlas> | null = null;
const materials = new Map<string, THREE.Material | null>();

export function facadeAtlas(stem: string): FacadeAtlas | undefined {
  atlases ??= discover();
  return atlases.get(stem);
}

/** Tests and tools: register an atlas (and optionally its ready-made material) without any files. */
export function registerFacadeAtlas(atlas: FacadeAtlas, material?: THREE.Material): void {
  atlases ??= discover();
  atlases.set(atlas.meta.texture, atlas);
  if (material) materials.set(atlas.meta.texture, material);
}
export function resetFacadeAtlases(): void { atlases = null; materials.clear(); }

/** The textured material for a stem, or null when the atlas files are absent. Cached. */
export function facadeMaterial(stem: string, loader: THREE.TextureLoader = new THREE.TextureLoader()): THREE.Material | null {
  if (materials.has(stem)) return materials.get(stem)!;
  const a = facadeAtlas(stem);
  if (!a) { materials.set(stem, null); return null; }
  const tex = (url: string, srgb: boolean): THREE.Texture => {
    const t = loader.load(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    return t;
  };
  const m = new THREE.MeshStandardMaterial({ name: `facade:${stem}`, map: tex(a.color, true), roughness: 1, metalness: 0 });
  if (a.normal) m.normalMap = tex(a.normal, false);
  if (a.rough) m.roughnessMap = tex(a.rough, false);
  materials.set(stem, m);
  return m;
}

/** Lot-local (x, y) -> atlas uv for a lot `widthM` wide. Ground floor = bottom `groundShare` of the atlas. */
export function atlasUV(meta: FacadeMeta, lotWidth: number): (x: number, y: number) => [number, number] {
  const h = Math.max(1, meta.heightM);
  return (x, y) => [Math.min(1, Math.max(0, x / lotWidth)), Math.min(1, Math.max(0, y / h))];
}

/**
 * Per-lot building materials: copy of `m` whose front-wall material of the lot's family is the atlas material, and the
 * mapping installed on `batch`. Returns the materials to build the lot with (the same `m` when there is no texture).
 */
export function applyFacadeTexture(m: BuildingMats, spec: LotSpec | undefined, lotWidth: number, batch: LotBatch): BuildingMats {
  if (!spec?.facadeTexture) return m;
  const mat = facadeMaterial(spec.facadeTexture);
  const atlas = facadeAtlas(spec.facadeTexture);
  if (!mat || !atlas) return m;
  const out: BuildingMats = { ...m };
  switch (spec.family) {
    case 'brownstone': out.brownstone = mat; out.brownstoneAlt = mat; break;
    case 'brick': out.brickRed = mat; break;
    case 'tanBrick': out.brickAlt = mat; break;
    case 'paintedBrick': out.brickPainted = mat; break;
    case 'limestone': out.limestone = mat; break;
  }
  batch.mapUV(mat, atlasUV(atlas.meta, lotWidth));
  return out;
}
