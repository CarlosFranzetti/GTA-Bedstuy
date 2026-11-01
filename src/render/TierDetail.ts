/**
 * Material detail switches for the phone tier, applied to whatever is under a scene root (the MaterialLibrary has no
 * "detail level" of its own, so this walks the materials and remembers what it changed so a quality switch can undo it).
 *
 *  - `setNormalMaps(root, false)` nulls `normalMap` / `roughnessMap` on plain MeshStandardMaterials (buildings, roads, props).
 *    Physical car paint keeps its flake maps: cars are few and their clearcoat is the one thing that reads on a phone.
 *  - `setAnisotropy(root, cap)` lowers (or restores) texture anisotropy.
 *
 * Both are idempotent and cheap to call again after late loads (user texture packs, hosted tier swaps).
 */
import * as THREE from 'three';

interface Stash { normalMap: THREE.Texture | null; roughnessMap: THREE.Texture | null; roughness: number; }
const stash = new WeakMap<THREE.Material, Stash>();

/** Roughness used in place of a roughness map that carried the absolute value (`roughness` was 1). */
export const FLAT_ROUGHNESS = 0.85;

function materialsUnder(root: THREE.Object3D): Set<THREE.Material> {
  const out = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    if (Array.isArray(m)) for (const x of m) out.add(x); else out.add(m);
  });
  return out;
}

const isPlainStandard = (m: THREE.Material): m is THREE.MeshStandardMaterial =>
  (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true && (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial !== true;

/** Returns the number of materials that changed. */
export function setNormalMaps(root: THREE.Object3D, on: boolean): number {
  let changed = 0;
  for (const m of materialsUnder(root)) {
    if (!isPlainStandard(m)) continue;
    const saved = stash.get(m);
    if (!on) {
      if (!m.normalMap && !m.roughnessMap) continue;
      if (!saved) stash.set(m, { normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: m.roughness });
      else { saved.normalMap = saved.normalMap ?? m.normalMap; saved.roughnessMap = saved.roughnessMap ?? m.roughnessMap; }
      m.normalMap = null;
      if (m.roughnessMap) { m.roughnessMap = null; if (m.roughness >= 0.99) m.roughness = FLAT_ROUGHNESS; }
      m.needsUpdate = true;
      changed++;
    } else if (saved) {
      m.normalMap = saved.normalMap;
      m.roughnessMap = saved.roughnessMap;
      m.roughness = saved.roughness;
      stash.delete(m);
      m.needsUpdate = true;
      changed++;
    }
  }
  return changed;
}

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'aoMap', 'metalnessMap', 'bumpMap'] as const;
const anisoHome = new WeakMap<THREE.Texture, number>();

/** Caps texture anisotropy under `root` at `cap` (restoring each texture's own value, up to `cap`, when `cap` is high). Returns textures changed. */
export function setAnisotropy(root: THREE.Object3D, cap: number): number {
  let changed = 0;
  const seen = new Set<THREE.Texture>();
  for (const m of materialsUnder(root)) {
    for (const slot of MAP_SLOTS) {
      const t = (m as unknown as Record<string, THREE.Texture | null | undefined>)[slot];
      if (!t || seen.has(t)) continue;
      seen.add(t);
      if (!anisoHome.has(t)) anisoHome.set(t, t.anisotropy);
      const want = Math.max(1, Math.min(cap, anisoHome.get(t)!));
      if (t.anisotropy !== want) { t.anisotropy = want; if (t.image) t.needsUpdate = true; changed++; }
    }
  }
  return changed;
}
