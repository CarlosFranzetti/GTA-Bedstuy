/**
 * mod.json: the small manifest that says which file replaces which slot. Pure data checks, no file reading.
 * Unknown keys are ignored (so a newer pack still loads); wrong types and unsafe file names are refused with a message.
 */
import { VEHICLE_SPECS } from '@/entities/Vehicle';

export const MANIFEST_FORMAT = 1;

/** Material keys a texture mod may replace (ground and wall surfaces; the wall classes are layers of one shared sheet). */
export const TEXTURE_SLOTS = [
  'asphalt', 'asphaltWorn', 'concrete', 'curb', 'laneLine', 'crosswalk', 'bluestone', 'granite', 'graniteCurb',
  'brownstone', 'brickRed', 'brickPainted', 'limestone', 'cornice', 'stoop', 'roof', 'tarRoof', 'corrugatedSteel',
] as const;
export type TextureSlotKey = (typeof TEXTURE_SLOTS)[number];

export type Up = 'y' | 'z';

export interface VehicleEntry {
  kind: 'vehicle';
  /** vehicle class, e.g. "sedan" */
  type: string;
  /** .glb / .gltf / .dff, a path inside the mod */
  model: string;
  /** .txd files (and images) the model's textures come from, by path */
  textures: string[];
  /** multiplies the model before it is fitted to the class's size; the fit is automatic, so this only matters for odd files */
  scale: number;
  up: Up;
  /** exact node / frame names that are road wheels (when the file does not name them with "wheel") */
  wheelFrames: string[];
  /** name of the material that is the car's body paint (glTF) or its texture name (dff). Default: "paint" / "body", then the game's own guess */
  paintMaterial: string | null;
  /** dff only: material colours that mean "body paint" (default 60,255,0 and 255,0,175) */
  paintColors: Array<[number, number, number]>;
}

export interface TextureEntry {
  kind: 'texture';
  key: TextureSlotKey;
  /** a number, or 'all' (the default: every variant of that surface) */
  variant: number | 'all';
  /** colour image: .png .jpg .webp, or .txd (with `texture` naming which one) */
  image: string;
  /** the texture's name inside a .txd (default: the first) */
  texture: string | null;
  normal: string | null;
  roughness: string | null;
  /** how many times the image repeats over the surface's own unit (default: the stock repeat) */
  repeat: [number, number] | null;
}

export type ModEntry = VehicleEntry | TextureEntry;

export interface ModManifest {
  format: number;
  name: string;
  author: string;
  licence: string;
  description: string;
  entries: ModEntry[];
}

export interface ManifestResult { manifest: ModManifest | null; errors: string[]; warnings: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A path a player could have dropped: relative, no drive, no scheme, no "..", no control characters. */
export function safePath(p: unknown): string | null {
  if (typeof p !== 'string' || p.length === 0 || p.length > 200) return null;
  if (/[\u0000-\u001f]/.test(p) || /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('/') || p.startsWith('\\') || p.includes('//')) return null;
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.some((s) => s === '..' || s === '.' || s === '')) return null;
  return parts.join('/');
}

const MODEL_EXT = /\.(glb|gltf|dff)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const TXD_EXT = /\.txd$/i;

function str(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : fallback;
}

export function validateManifest(raw: unknown): ManifestResult {
  const errors: string[] = [], warnings: string[] = [];
  const fail = (m: string): ManifestResult => ({ manifest: null, errors: [...errors, m], warnings });
  if (!isObj(raw)) return fail('mod.json must be a JSON object.');
  if (raw.format !== undefined && raw.format !== MANIFEST_FORMAT) return fail(`mod.json says format ${String(raw.format)}; this game reads format ${MANIFEST_FORMAT}.`);
  const name = str(raw.name, 80);
  if (!name) return fail('mod.json needs a "name".');
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) return fail('mod.json needs a non-empty "entries" list.');
  if (raw.entries.length > 64) return fail('mod.json has too many entries (the most is 64).');
  const licence = str(raw.licence ?? raw.license, 120);
  if (!licence) warnings.push('No "licence" given: say what the files are licensed under so others can reuse the pack.');
  const entries: ModEntry[] = [];
  raw.entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    if (!isObj(e)) { errors.push(`${at} must be an object.`); return; }
    const slot = typeof e.slot === 'string' ? e.slot : '';
    const [kind, rest = ''] = [slot.split(':')[0], slot.slice(slot.indexOf(':') + 1)];
    if (kind === 'vehicle') {
      if (!Object.prototype.hasOwnProperty.call(VEHICLE_SPECS, rest)) { errors.push(`${at}: "${slot}" is not a vehicle class of this game.`); return; }
      const model = safePath(e.model);
      if (!model || !MODEL_EXT.test(model)) { errors.push(`${at}: "model" must be a relative path to a .glb, .gltf or .dff file.`); return; }
      const textures: string[] = [];
      for (const t of Array.isArray(e.textures) ? e.textures.slice(0, 32) : []) {
        const p = safePath(t);
        if (!p || !(TXD_EXT.test(p) || IMAGE_EXT.test(p))) { errors.push(`${at}: texture "${String(t)}" must be a relative .txd, .png, .jpg or .webp path.`); return; }
        textures.push(p);
      }
      const scale = e.scale === undefined ? 1 : Number(e.scale);
      if (!(scale > 0.001 && scale < 1000)) { errors.push(`${at}: "scale" must be between 0.001 and 1000.`); return; }
      const up = e.up === undefined ? (/\.dff$/i.test(model) ? 'z' : 'y') : e.up;
      if (up !== 'y' && up !== 'z') { errors.push(`${at}: "up" must be "y" or "z".`); return; }
      const wheelFrames = (Array.isArray(e.wheelFrames) ? e.wheelFrames : []).slice(0, 16).filter((w): w is string => typeof w === 'string' && w.length < 80);
      const paintColors: Array<[number, number, number]> = [];
      for (const c of Array.isArray(e.paintColors) ? e.paintColors.slice(0, 4) : []) {
        if (Array.isArray(c) && c.length === 3 && c.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) paintColors.push([c[0], c[1], c[2]]);
        else { errors.push(`${at}: each of "paintColors" must be [r, g, b] with whole numbers 0 to 255.`); return; }
      }
      entries.push({ kind: 'vehicle', type: rest, model, textures, scale, up, wheelFrames, paintMaterial: typeof e.paintMaterial === 'string' ? e.paintMaterial.slice(0, 80) : null, paintColors });
    } else if (kind === 'texture') {
      const [key, variantRaw] = rest.split(':');
      if (!(TEXTURE_SLOTS as readonly string[]).includes(key)) { errors.push(`${at}: "${slot}" is not a texture slot (try ${TEXTURE_SLOTS.slice(0, 5).join(', ')} ...).`); return; }
      const image = safePath(e.image);
      if (!image || !(IMAGE_EXT.test(image) || TXD_EXT.test(image))) { errors.push(`${at}: "image" must be a relative .png, .jpg, .webp or .txd path.`); return; }
      let variant: number | 'all' = 'all';
      if (variantRaw !== undefined) variant = variantRaw === 'all' ? 'all' : Number(variantRaw);
      else if (typeof e.variant === 'number') variant = e.variant;
      else if (e.variant !== undefined && e.variant !== 'all') variant = Number.NaN;
      if (variant !== 'all' && !(Number.isInteger(variant) && variant >= 0 && variant < 16)) { errors.push(`${at}: "variant" must be a whole number 0 to 15, or "all".`); return; }
      const opt = (v: unknown): string | null => { if (v === undefined || v === null) return null; const p = safePath(v); if (!p || !IMAGE_EXT.test(p)) { errors.push(`${at}: "${String(v)}" must be a relative .png, .jpg or .webp path.`); return null; } return p; };
      const normal = opt(e.normal), roughness = opt(e.roughness);
      let repeat: [number, number] | null = null;
      if (e.repeat !== undefined) {
        if (Array.isArray(e.repeat) && e.repeat.length === 2 && e.repeat.every((n) => typeof n === 'number' && n > 0.01 && n < 256)) repeat = [e.repeat[0], e.repeat[1]];
        else { errors.push(`${at}: "repeat" must be [x, y] with numbers between 0.01 and 256.`); return; }
      }
      entries.push({ kind: 'texture', key: key as TextureSlotKey, variant, image, texture: typeof e.texture === 'string' ? e.texture.slice(0, 64).toLowerCase() : null, normal, roughness, repeat });
    } else {
      errors.push(`${at}: "slot" must look like "vehicle:sedan" or "texture:asphalt".`);
    }
  });
  if (errors.length) return { manifest: null, errors, warnings };
  return { manifest: { format: MANIFEST_FORMAT, name, author: str(raw.author, 80), licence, description: str(raw.description, 400), entries }, errors, warnings };
}

/** Every file path a manifest refers to. */
export function referencedFiles(m: ModManifest): string[] {
  const out = new Set<string>();
  for (const e of m.entries) {
    if (e.kind === 'vehicle') { out.add(e.model); e.textures.forEach((t) => out.add(t)); }
    else { out.add(e.image); if (e.normal) out.add(e.normal); if (e.roughness) out.add(e.roughness); }
  }
  return [...out];
}

/** A manifest for one dropped file, built by the Mods panel after it asked the player which slot the file is for. */
export function manifestForDrop(name: string, slot: string, file: string, extraTextures: string[] = []): ModManifest {
  const [kind, rest] = [slot.split(':')[0], slot.split(':')[1]];
  const entry: ModEntry = kind === 'vehicle'
    ? { kind: 'vehicle', type: rest, model: file, textures: extraTextures, scale: 1, up: /\.dff$/i.test(file) ? 'z' : 'y', wheelFrames: [], paintMaterial: null, paintColors: [] }
    : { kind: 'texture', key: rest as TextureSlotKey, variant: 'all', image: file, texture: null, normal: null, roughness: null, repeat: null };
  return { format: MANIFEST_FORMAT, name, author: '', licence: '', description: '', entries: [entry] };
}
