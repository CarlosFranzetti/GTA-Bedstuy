/**
 * Turning what the player dropped (a folder, a few files, a zip is NOT supported) into a mod: find `mod.json`, or sort the
 * files by kind so the Mods panel can ask which slot each is for.
 */
import { MAX_FILES_PER_MOD, MAX_MANIFEST_BYTES, ModError } from './limits';
import { validateManifest, type ModManifest } from './manifest';

export interface ModFile { path: string; data: Uint8Array }

export type FileKind = 'manifest' | 'model' | 'txd' | 'image' | 'archive' | 'other';

export function kindOf(path: string): FileKind {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (base === 'mod.json') return 'manifest';
  if (/\.(glb|gltf|dff)$/.test(base)) return 'model';
  if (base.endsWith('.txd')) return 'txd';
  if (/\.(png|jpe?g|webp)$/.test(base)) return 'image';
  if (base.endsWith('.img')) return 'archive';
  return 'other';
}

/** Normalises path separators and strips the one top folder every file shares (a dropped folder). */
export function normalisePaths(files: ModFile[]): ModFile[] {
  if (files.length > MAX_FILES_PER_MOD) throw new ModError(`That is ${files.length} files; one mod may have at most ${MAX_FILES_PER_MOD}.`, 'oversize');
  const clean = files.map((f) => ({ path: f.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, ''), data: f.data }));
  for (const f of clean) if (f.path.split('/').some((s) => s === '..')) throw new ModError(`"${f.path}" has a ".." in its path.`, 'format');
  const firsts = new Set(clean.map((f) => f.path.split('/')[0]));
  if (clean.length > 0 && firsts.size === 1 && clean.every((f) => f.path.includes('/'))) {
    const top = [...firsts][0] + '/';
    return clean.map((f) => ({ path: f.path.slice(top.length), data: f.data }));
  }
  return clean;
}

/** Looks a manifest path up among the files: exact (case-insensitive), then by file name when that is unique. */
export function findFile(files: ModFile[], path: string): ModFile | null {
  const p = path.toLowerCase();
  const exact = files.find((f) => f.path.toLowerCase() === p);
  if (exact) return exact;
  const base = p.slice(p.lastIndexOf('/') + 1);
  const same = files.filter((f) => f.path.toLowerCase().slice(f.path.lastIndexOf('/') + 1) === base);
  return same.length === 1 ? same[0] : null;
}

export interface DropResult {
  files: ModFile[];
  manifest: ModManifest | null;
  errors: string[];
  warnings: string[];
  /** files that still need a slot (no mod.json) */
  models: ModFile[];
  txds: ModFile[];
  images: ModFile[];
  notes: string[];
}

export function classifyDrop(input: ModFile[]): DropResult {
  const files = normalisePaths(input);
  const res: DropResult = { files, manifest: null, errors: [], warnings: [], models: [], txds: [], images: [], notes: [] };
  const mj = files.find((f) => kindOf(f.path) === 'manifest');
  if (mj) {
    if (mj.data.byteLength > MAX_MANIFEST_BYTES) { res.errors.push('mod.json is too large.'); return res; }
    try {
      const v = validateManifest(JSON.parse(new TextDecoder().decode(mj.data)));
      res.manifest = v.manifest; res.errors.push(...v.errors); res.warnings.push(...v.warnings);
    } catch { res.errors.push('mod.json is not valid JSON.'); }
  }
  for (const f of files) {
    const k = kindOf(f.path);
    if (k === 'model') res.models.push(f);
    else if (k === 'txd') res.txds.push(f);
    else if (k === 'image') res.images.push(f);
    else if (k === 'archive') res.notes.push(`"${f.path}" is an .img archive. Archives are not read yet: unpack the .dff and .txd files from it and drop those.`);
    else if (k === 'other' && !/\.(txt|md|json|ide|ipl|col)$/i.test(f.path)) res.notes.push(`"${f.path}" was ignored (not a model, texture or image).`);
  }
  return res;
}
