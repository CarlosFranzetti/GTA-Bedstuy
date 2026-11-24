/**
 * The mod registry: installs a player's mod (validates, parses, builds), remembers it on this device, and hands the game the
 * pieces it can use. A mod entry that fails leaves the stock asset in place; the report says why in plain words.
 *
 * Hooks into the game, both already there (no builder was changed):
 *  - vehicles: `Vehicle.sources[type] = GltfVehicleSource` (the glTF car source fits a model to the class's length, width and
 *    height, finds wheels by node name, tints the `paint` material to the car's colour);
 *  - textures: `MaterialLibrary.overrideMaps(key, variant, maps)`.
 */
import * as THREE from 'three';
import type { MapOverride } from '@/textures/MaterialLibrary';
import { GltfVehicleSource } from '@/entities/models/gltf/VehicleSource';
import type { GLTF } from '@/entities/models/gltf/loader';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import type { VehicleType } from '@/world/types';
import { MAX_MODS, MAX_TOTAL_BYTES, LIMITS, ModError, mb, type ModLimits, type ModTier } from './limits';
import { buildDff, decodeImage as browserDecodeImage, txdTexture } from './convert';
import { classifyDrop, findFile, kindOf, type ModFile } from './files';
import { loadGlbScene } from './glb';
import { referencedFiles, validateManifest, type ModManifest, type TextureEntry, type VehicleEntry } from './manifest';
import { parseDff } from './rw/dff';
import { parseTxd } from './rw/txd';
import { MemoryModStore, type ModStore, type StoredMod } from './store';

export type ImageDecoder = (name: string, data: Uint8Array, limits: ModLimits, flipY: boolean, colour: boolean) => Promise<THREE.Texture>;

export interface RegistryOptions { tier: ModTier; store?: ModStore; decodeImage?: ImageDecoder }

export interface EntryReport { entry: string; ok: boolean; message: string }
export interface InstallReport {
  ok: boolean;
  modId: string | null;
  name: string;
  entries: EntryReport[];
  warnings: string[];
  errors: string[];
  /** set when the drop had no mod.json: the panel should ask which slot each file is for */
  needsSlots?: { models: string[]; txds: string[]; images: string[] };
}

export interface ActiveTexture { key: string; variants: number[]; maps: MapOverride }
export interface ActiveMod {
  id: string;
  manifest: ModManifest;
  enabled: boolean;
  bytes: number;
  installedAt: number;
  vehicles: Map<string, GltfVehicleSource>;
  textures: ActiveTexture[];
  reports: EntryReport[];
}

/** What the game gives the registry to apply mods to (main.ts passes `Vehicle` and the material library). */
export interface ModTarget {
  vehicleSources: Record<string, unknown>;
  materials: { overrideMaps(key: never, variant: number, maps: MapOverride): void; get?(key: never, variant?: number): THREE.Material };
}

export interface ModInfo { id: string; name: string; author: string; licence: string; enabled: boolean; bytes: number; entries: EntryReport[] }

function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
export function modIdOf(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mod'}-${fnv(name)}`;
}

export class ModRegistry {
  readonly tier: ModTier;
  readonly limits: ModLimits;
  readonly store: ModStore;
  private readonly decode: ImageDecoder;
  private mods = new Map<string, ActiveMod>();
  private readonly listeners = new Set<() => void>();
  private applied = new Set<string>();

  constructor(opts: RegistryOptions) {
    this.tier = opts.tier;
    this.limits = LIMITS[opts.tier];
    this.store = opts.store ?? new MemoryModStore();
    this.decode = opts.decodeImage ?? browserDecodeImage;
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(): void { for (const fn of this.listeners) { try { fn(); } catch { /* a listener must not break the registry */ } } }

  list(): ModInfo[] {
    return [...this.mods.values()].map((m) => ({ id: m.id, name: m.manifest.name, author: m.manifest.author, licence: m.manifest.licence, enabled: m.enabled, bytes: m.bytes, entries: m.reports }));
  }
  totalBytes(): number { let n = 0; for (const m of this.mods.values()) n += m.bytes; return n; }

  /** Newest enabled mod's car for this class, or null (the stock car stays). */
  vehicleSource(type: string): GltfVehicleSource | null {
    let found: GltfVehicleSource | null = null;
    for (const m of this.mods.values()) if (m.enabled) { const s = m.vehicles.get(type); if (s) found = s; }
    return found;
  }
  textureOverrides(): ActiveTexture[] {
    const out = new Map<string, ActiveTexture>();
    for (const m of this.mods.values()) if (m.enabled) for (const t of m.textures) out.set(t.key, t);
    return [...out.values()];
  }

  /** Loads what was kept on this device. Never throws: a mod that no longer loads is reported and skipped. */
  async restore(): Promise<InstallReport[]> {
    const reports: InstallReport[] = [];
    let stored: StoredMod[] = [];
    try { stored = await this.store.list(); } catch { return reports; }
    for (const s of stored.slice(0, MAX_MODS)) {
      const files = s.files.map((f) => ({ path: f.path, data: new Uint8Array(f.data) }));
      const { active, report } = await this.build(files, s.manifest, s.id, s.installedAt);
      if (active) { active.enabled = s.enabled; this.mods.set(active.id, active); }
      reports.push(report);
    }
    this.emit();
    return reports;
  }

  /** Installs a drop. With no mod.json (and no `manifest` given) it answers `needsSlots` and changes nothing. */
  async install(input: ModFile[], manifest?: ModManifest): Promise<InstallReport> {
    let drop;
    try { drop = classifyDrop(input); } catch (e) { return fail('', msg(e)); }
    const m = manifest ?? drop.manifest;
    if (!m) {
      if (drop.errors.length) return fail('', drop.errors.join(' '), drop.warnings);
      const r = fail('', 'There is no mod.json in this drop. Say which game slot each file is for.', [], drop.notes);
      r.needsSlots = { models: drop.models.map((f) => f.path), txds: drop.txds.map((f) => f.path), images: drop.images.map((f) => f.path) };
      return r;
    }
    const id = modIdOf(m.name);
    const bytes = drop.files.reduce((n, f) => n + f.data.byteLength, 0);
    if (bytes > this.limits.maxModBytes) return fail(m.name, `This mod is ${mb(bytes)}; this device allows ${mb(this.limits.maxModBytes)} per mod.`);
    const others = [...this.mods.values()].filter((x) => x.id !== id);
    if (others.length >= MAX_MODS) return fail(m.name, `At most ${MAX_MODS} mods can be installed. Remove one first.`);
    if (others.reduce((n, x) => n + x.bytes, 0) + bytes > MAX_TOTAL_BYTES) return fail(m.name, `That would take mods past ${mb(MAX_TOTAL_BYTES)} in total. Remove one first.`);
    const missing = referencedFiles(m).filter((p) => !findFile(drop.files, p));
    const { active, report } = await this.build(drop.files, m, id, Date.now());
    report.warnings.push(...drop.warnings, ...drop.notes, ...missing.map((p) => `The manifest names "${p}" but it was not in the drop.`));
    if (!active) return report;
    // keep only the files the manifest uses, plus the manifest-less pairs; everything else is dropped to save room
    const used = new Set(referencedFiles(m).map((p) => findFile(drop.files, p)?.path).filter((p): p is string => !!p));
    for (const f of drop.files) if (kindOf(f.path) === 'txd' && active.manifest.entries.some((e) => e.kind === 'vehicle' && e.model.replace(/\.[^.]+$/, '').toLowerCase() === f.path.replace(/\.[^.]+$/, '').toLowerCase())) used.add(f.path);
    const keep = drop.files.filter((f) => used.has(f.path));
    active.bytes = keep.reduce((n, f) => n + f.data.byteLength, 0);
    try {
      await this.store.put({ id, name: m.name, manifest: m, enabled: true, installedAt: active.installedAt, bytes: active.bytes, files: keep.map((f) => ({ path: f.path, data: f.data.slice().buffer as ArrayBuffer })) });
    } catch (e) {
      report.warnings.push(`The mod works for this visit but could not be saved on this device (${msg(e)}).`);
    }
    this.mods.set(id, active);
    this.emit();
    return report;
  }

  async remove(id: string): Promise<boolean> {
    const had = this.mods.delete(id);
    try { await this.store.remove(id); } catch { /* memory copy is gone either way */ }
    this.emit();
    return had;
  }

  async setEnabled(id: string, on: boolean): Promise<void> {
    const m = this.mods.get(id);
    if (!m) return;
    m.enabled = on;
    try {
      const all = await this.store.list();
      const s = all.find((x) => x.id === id);
      if (s) await this.store.put({ ...s, enabled: on });
    } catch { /* kept for this visit */ }
    this.emit();
  }

  /**
   * Gives the game what the enabled mods provide. Safe to call again after an install: it only adds. Returns true when something
   * the game cannot take back at run time was replaced (textures, or a car class that already has a source): the panel then says
   * "reload to see your last change fully".
   */
  applyTo(target: ModTarget): void {
    for (const type of Object.keys(VEHICLE_SPECS)) {
      const s = this.vehicleSource(type);
      if (s) { target.vehicleSources[type] = s; this.applied.add(type); }
      else if (this.applied.has(type)) { delete target.vehicleSources[type]; this.applied.delete(type); }
    }
    for (const t of this.textureOverrides()) {
      for (const v of t.variants) {
        let maps = t.maps;
        if (!maps.repeat && target.materials.get) {
          const cur = target.materials.get(t.key as never, v) as THREE.MeshStandardMaterial;
          if (cur?.map?.repeat) maps = { ...maps, repeat: { x: cur.map.repeat.x, y: cur.map.repeat.y } };
        }
        target.materials.overrideMaps(t.key as never, v, maps);
      }
    }
  }

  /* ---------- building ---------- */

  private async build(files: ModFile[], manifest: ModManifest, id: string, installedAt: number): Promise<{ active: ActiveMod | null; report: InstallReport & { warnings: string[] } }> {
    const report: InstallReport = { ok: false, modId: null, name: manifest.name, entries: [], warnings: [], errors: [] };
    const active: ActiveMod = { id, manifest, enabled: true, bytes: files.reduce((n, f) => n + f.data.byteLength, 0), installedAt, vehicles: new Map(), textures: [], reports: report.entries };
    let decodedBytes = 0;
    for (const e of manifest.entries) {
      const label = e.kind === 'vehicle' ? `vehicle:${e.type}` : `texture:${e.key}`;
      try {
        if (e.kind === 'vehicle') {
          const { source, note } = await this.buildVehicle(e, files, () => decodedBytes, (n) => { decodedBytes += n; });
          active.vehicles.set(e.type, source);
          report.entries.push({ entry: label, ok: true, message: note });
        } else {
          const t = await this.buildTexture(e, files, (n) => { decodedBytes += n; }, () => decodedBytes);
          active.textures.push(t);
          report.entries.push({ entry: label, ok: true, message: 'Texture loaded.' });
        }
      } catch (err) {
        report.entries.push({ entry: label, ok: false, message: msg(err) });
      }
    }
    const okCount = report.entries.filter((x) => x.ok).length;
    if (okCount === 0) { report.errors.push('Nothing in this mod could be loaded; the stock game is unchanged.'); return { active: null, report }; }
    report.ok = true; report.modId = id;
    return { active, report };
  }

  private need(files: ModFile[], path: string): ModFile {
    const f = findFile(files, path);
    if (!f) throw new ModError(`The file "${path}" is not in the mod.`, 'missing');
    return f;
  }

  private async buildVehicle(e: VehicleEntry, files: ModFile[], used: () => number, add: (n: number) => void): Promise<{ source: GltfVehicleSource; note: string }> {
    if (!this.limits.allowModels) throw new ModError('Model mods are not loaded on phones in this version (memory). Texture mods work.', 'phone');
    const spec = VEHICLE_SPECS[e.type as VehicleType];
    if (!spec) throw new ModError(`"${e.type}" is not a vehicle class.`, 'slot');
    const file = this.need(files, e.model);
    const notes: string[] = [];
    let scene: THREE.Object3D;
    let tris = 0;
    if (/\.dff$/i.test(file.path)) {
      const clump = parseDff(file.data, this.limits);
      const textures = new Map<string, THREE.Texture>();
      const sources = [...e.textures];
      const pair = files.find((f) => /\.txd$/i.test(f.path) && f.path.replace(/\.[^.]+$/, '').toLowerCase() === file.path.replace(/\.[^.]+$/, '').toLowerCase());
      if (pair && !sources.some((s) => findFile(files, s) === pair)) sources.push(pair.path);
      for (const s of sources) {
        const f = this.need(files, s);
        if (/\.txd$/i.test(f.path)) {
          const r = parseTxd(f.data, this.limits);
          for (const t of r.textures) { add(t.rgba.byteLength); if (used() > this.limits.maxDecodedTextureBytes) throw new ModError('The textures of this car are over this device\'s memory budget for one mod.', 'oversize'); textures.set(t.name, txdTexture(t, false)); }
          notes.push(...r.skipped.map((x) => `texture skipped: ${x}`));
        } else {
          const tex = await this.decode(f.path, f.data, this.limits, false, true);
          textures.set(f.path.replace(/^.*\//, '').replace(/\.[^.]+$/, '').toLowerCase(), tex);
        }
      }
      const built = buildDff(clump, textures, { scale: e.scale, paintColors: e.paintColors, paintMaterial: e.paintMaterial, wheelFrames: e.wheelFrames });
      scene = built.root; tris = built.triangles; notes.push(...built.notes);
      const missing = [...new Set(clump.geometries.flatMap((g) => g.materials.map((m) => m.texture).filter((t): t is string => !!t && !textures.has(t))))];
      if (missing.length) notes.push(`${missing.length} texture name(s) are not in the mod and show as plain colour: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ' ...' : ''}.`);
    } else {
      const g = await loadGlbScene(file.data, this.limits, { scale: e.scale, up: e.up, wheelFrames: e.wheelFrames, paintMaterial: e.paintMaterial });
      scene = g.scene; tris = g.triangles; notes.push(...g.notes);
    }
    const source = GltfVehicleSource.fromGltf({ scene } as unknown as GLTF, spec.type, { paintCell: null });
    try { source.instantiate(spec); } catch (err) { source.dispose(); throw new ModError(`The model loaded but could not be fitted as a ${spec.type}: ${msg(err)}`, 'fit'); }
    return { source, note: `${tris} triangles.${notes.length ? ' ' + notes.join(' ') : ''}` };
  }

  private async buildTexture(e: TextureEntry, files: ModFile[], add: (n: number) => void, used: () => number): Promise<ActiveTexture> {
    const maps: MapOverride = {};
    const one = async (path: string, colour: boolean): Promise<THREE.Texture> => {
      const f = this.need(files, path);
      let tex: THREE.Texture;
      if (/\.txd$/i.test(f.path)) {
        const r = parseTxd(f.data, this.limits);
        const t = (e.texture ? r.textures.find((x) => x.name === e.texture) : r.textures[0]);
        if (!t) throw new ModError(e.texture ? `The dictionary has no texture named "${e.texture}" (it has: ${r.textures.slice(0, 8).map((x) => x.name).join(', ') || 'nothing readable'}).` : 'The dictionary has no readable texture.', 'missing');
        tex = txdTexture(t, true);
        add(t.rgba.byteLength);
      } else {
        tex = await this.decode(f.path, f.data, this.limits, true, colour);
        const im = tex.image as { width?: number; height?: number } | undefined;
        add((im?.width ?? 0) * (im?.height ?? 0) * 4);
      }
      if (used() > this.limits.maxDecodedTextureBytes) { tex.dispose(); throw new ModError('The textures of this mod are over this device\'s memory budget for one mod.', 'oversize'); }
      return tex;
    };
    maps.map = await one(e.image, true);
    if (e.normal) maps.normalMap = await one(e.normal, false);
    if (e.roughness) maps.roughnessMap = await one(e.roughness, false);
    if (e.repeat) maps.repeat = { x: e.repeat[0], y: e.repeat[1] };
    return { key: e.key, variants: e.variant === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7] : [e.variant], maps };
  }
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

function fail(name: string, message: string, warnings: string[] = [], more: string[] = []): InstallReport {
  return { ok: false, modId: null, name, entries: [], warnings: [...warnings, ...more], errors: [message] };
}

/** Parses mod.json text on its own (for the panel's "check my manifest" and for tests). */
export function checkManifestText(text: string): { manifest: ModManifest | null; errors: string[]; warnings: string[] } {
  try { return validateManifest(JSON.parse(text)); } catch { return { manifest: null, errors: ['mod.json is not valid JSON.'], warnings: [] }; }
}
