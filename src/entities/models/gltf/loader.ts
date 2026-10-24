/**
 * Shared glTF loading helpers. Everything is bundled (no CDN, no separate decoder files): plain and
 * meshopt-compressed GLBs work; Draco does not (its decoder is a separate download), so compress with meshopt.
 */
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export type { GLTF };

export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

const warned = new Set<string>();
/** console.warn at most once per key. */
export function warnOnce(key: string, message: string, err?: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  if (err !== undefined) console.warn(message, err);
  else console.warn(message);
}

/** First value of an `import.meta.glob(..., { query: '?url', import: 'default' })` result (sorted by path). */
export function firstUrl(files: Record<string, string>): string | null {
  const keys = Object.keys(files).sort();
  return keys.length ? files[keys[0]] : null;
}
