import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';
import { createCanvas, type Aux, type Painter } from './canvas';
import { heightFromRgba, heightToNormal } from './normalmap';
import { asphaltPainter, concretePainter, crosswalkPainter, roofPainter, bluestonePainter, granitePainter, manholePainter, gratePainter } from './painters/ground';
import { brickPainter, brownstonePainter, cornicePainter, limestonePainter } from './painters/masonry';
import {
  STOREFRONT_VARIANTS, WINDOW_VARIANTS, storefrontEmissivePainter, storefrontPainter,
  windowEmissivePainter, windowPainter,
} from './painters/glass';
import {
  ROLLGATE_VARIANTS, chainlinkPainter, rollGatePainter, scaffoldPainter, tirePainter, waterTankPainter,
} from './painters/metal';
import { awningPainter, copLiveryPainter, signPainter, taxiLiveryPainter } from './painters/signage';
import { CLOTH_COLORS, LEAF_VARIANTS, SKIN_TONES, treeLeavesPainter, treeTrunkPainter } from './painters/organic';
import { gray, wrapVariant } from './painters/util';
import { GROUND_VARIATION, disposeVariationTexture, patchGroundVariation } from './groundVariation';
import { CAR_FLAKE_NORMAL_SCALE, PLATE_VARIANTS, carPaintMaps, platePainter, tireSidewallPainter, type CarPaintMaps } from './painters/vehicle';
import {
  DENIM_VARIANTS, HOODIE_VARIANTS, SNEAKER_VARIANTS, VARSITY_VARIANTS,
  denimPainter, hoodiePainter, sneakerPainter, varsityPainter,
} from './painters/people';
import { CORRUGATED_VARIANTS, CHAINLINK_FENCE_VARIANTS, CHAINLINK_RAIL_VARIANTS, GRANITE_CURB_VARIANTS, CAST_IRON_VARIANTS, TAR_ROOF_VARIANTS, GRAFFITI_VARIANTS, corrugatedSteelPainter, chainlinkFencePainter, chainlinkRailPainter, graniteCurbPainter, castIronFencePainter, tarRoofPainter, graffitiPainter } from './painters/industrial';

export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;

const NIGHT_EMISSIVE = '#ffd27a';
const NIGHT_INTENSITY = 0.9;
/**
 * Night emissive intensity per glass key (x emissive-map texel). Apartment windows keep 0.9 (only variants 0 and 3 glow, so a
 * facade reads as a patchwork of lit and dark rooms). Shop glazing is one large flat lit face, so it is capped at 0.35
 * (L10: at 0.9 a single shop window filled a third of the spawn view at mean luma 0.24); its variants dim a little
 * further so neighbouring shops do not match.
 */
const GLASS_NIGHT_INTENSITY: Record<string, readonly number[]> = {
  window: [NIGHT_INTENSITY],
  storefrontGlass: [0.35, 0.28],
};
const glassNightIntensity = (key: string, variant: number): number => {
  const t = GLASS_NIGHT_INTENSITY[key] ?? [NIGHT_INTENSITY];
  return t[((variant % t.length) + t.length) % t.length];
};
const MAX_ANISOTROPY = 8;

/** envMapIntensity per key for materials that pick up the scene environment (reflections). */
const ENV_INTENSITY: Partial<Record<MaterialKey, number>> = {
  asphalt: 0.25, asphaltWorn: 0.25,
  window: 1.7, storefrontGlass: 1.35, carGlass: 1.5, copLivery: 1.2, taxiLivery: 1.2,
  metalDark: 0.5, metalGreen: 0.5, rollGate: 0.5, hydrant: 0.4,
};
const PAINT_ENV_INTENSITY = 1.2;
/** Keys whose albedo follows the non-repeating world-space ground variation field (ART). */
const GROUND_VARIATION_KEYS: Partial<Record<MaterialKey, 'asphalt' | 'concrete' | 'paint'>> = {
  asphalt: 'asphalt', asphaltWorn: 'asphalt', concrete: 'concrete', bluestone: 'concrete', laneLine: 'paint', crosswalk: 'paint',
};

interface Spec {
  variants: number;
  build(variant: number): THREE.Material;
}

/** How to build relief maps (normal + optional roughness) for a colour painter. */
interface Relief {
  /** slope multiplier handed to heightToNormal */
  strength: number;
  normalScale: number;
  /** roughness map resolution relative to the colour map; null/omitted = no roughness map */
  roughScale?: number | null;
  /** relief is identical for every variant carrying this key, so build it once and share */
  share?: string;
}

interface ReliefMaps { normal: THREE.DataTexture; rough: THREE.CanvasTexture | null; }

export interface MaterialLibraryOptions {
  /** renderer.capabilities.getMaxAnisotropy(); colour/normal maps use min(8, this). Default 8. */
  maxAnisotropy?: number;
}

/** Texture overrides (e.g. photo-based PBR sets) for one material key/variant. */
export interface MapOverride {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  repeat?: { x: number; y: number };
  normalScale?: number;
}

/**
 * Procedural PBR material library. All textures are drawn on 2D canvases (256-1024 px) with painters from
 * ./painters, seeded from the Rng so the city is reproducible. Masonry / asphalt / concrete / roof / roll gate /
 * cornice additionally get a tangent-space normal map (and asphalt/brick/brownstone a roughness map) built from
 * a painted height canvas, but only when the canvas supports pixel read-back (never with the test fake canvas).
 * Everything is cached.
 *
 * Texture world scale (so UV authors can pick repeats): brick 1024px ~ 1.3 m, brownstone/limestone ~ 2 m,
 * concrete 512px = 3 m (2x2 slabs of 1.5 m), others are free-scale.
 */
export class MaterialLibrary implements IMaterialLibrary {
  private readonly seed: number;
  private readonly factory: CanvasFactory;
  private readonly aniso: number;
  private readonly cache = new Map<string, THREE.Material>();
  private readonly awnings = new Map<string, THREE.Material>();
  private readonly signs = new Map<string, THREE.Material>();
  private readonly paints = new Map<string, THREE.Material>();
  private readonly glowing: THREE.MeshStandardMaterial[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly envMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly reliefCache = new Map<string, ReliefMaps>();
  private readonly overrides = new Map<string, MapOverride>();
  private env: THREE.Texture | null = null;
  private paintDetail: CarPaintMaps | null = null;
  private night = false;
  private readonly specs: Record<MaterialKey, Spec>;

  constructor(rng: Rng, canvasFactory?: CanvasFactory, opts?: MaterialLibraryOptions) {
    this.seed = Math.floor(rng.next() * 0xffffffff) >>> 0;
    this.factory = canvasFactory ?? createCanvas;
    this.aniso = Math.max(1, Math.min(MAX_ANISOTROPY, opts?.maxAnisotropy ?? MAX_ANISOTROPY));
    this.specs = this.makeSpecs();
  }

  get(key: MaterialKey, variant = 0): THREE.Material {
    const spec = this.specs[key];
    if (!spec) throw new Error(`MaterialLibrary: unknown key ${String(key)}`);
    const v = wrapVariant(variant, spec.variants);
    const id = `${key}:${v}`;
    let m = this.cache.get(id);
    if (!m) {
      m = spec.build(v);
      m.name = id;
      this.cache.set(id, m);
      const ei = ENV_INTENSITY[key];
      if (ei !== undefined && m instanceof THREE.MeshStandardMaterial) this.registerEnv(m, ei);
      const gv = GROUND_VARIATION_KEYS[key];
      if (gv && m instanceof THREE.MeshStandardMaterial) patchGroundVariation(m, GROUND_VARIATION[gv]);
      const ov = this.overrides.get(id);
      if (ov) this.applyOverride(m, ov);
    }
    return m;
  }

  /**
   * Swap in externally loaded maps (e.g. CC0 photo PBR sets) for a key/variant. Applies to the cached material if it
   * exists and is remembered for a material created later. Roughness / metalness / emissive settings are untouched.
   */
  overrideMaps(key: MaterialKey, variant: number, maps: MapOverride): void {
    const spec = this.specs[key];
    if (!spec) throw new Error(`MaterialLibrary: unknown key ${String(key)}`);
    const id = `${key}:${wrapVariant(variant, spec.variants)}`;
    this.overrides.set(id, maps);
    const m = this.cache.get(id);
    if (m) this.applyOverride(m, maps);
  }

  hasOverride(key: MaterialKey, variant: number): boolean {
    const spec = this.specs[key];
    if (!spec) return false;
    return this.overrides.has(`${key}:${wrapVariant(variant, spec.variants)}`);
  }

  awning(color: string, text: string): THREE.Material {
    const id = `${color}|${text}`;
    let m = this.awnings.get(id);
    if (!m) {
      const map = this.texture(`awning:${id}`, 512, 256, awningPainter(color, text), 0);
      m = this.std({ map, roughness: 0.85 });
      m.name = `awning:${id}`;
      this.awnings.set(id, m);
    }
    return m;
  }

  sign(text: string, bg = '#1b1b1b', fg = '#ffffff'): THREE.Material {
    const id = `${text}|${bg}|${fg}`;
    let m = this.signs.get(id);
    if (!m) {
      const map = this.texture(`sign:${id}`, 512, 128, signPainter(text, bg, fg), 0);
      m = this.std({ map, roughness: 0.6 });
      m.name = `sign:${id}`;
      this.signs.set(id, m);
    }
    return m;
  }

  carPaint(color: string): THREE.Material {
    let m = this.paints.get(color);
    if (!m) {
      const p = this.physicalPaint({ color: new THREE.Color(color) });
      p.name = `carPaint:${color}`;
      this.registerEnv(p, PAINT_ENV_INTENSITY);
      if (this.paintDetail) this.applyPaintDetail(p, this.paintDetail);
      m = p;
      this.paints.set(color, m);
    }
    return m;
  }

  /**
   * Builds (once) the shared 512 px car paint detail set and applies it to every carPaint material, existing and
   * future: metallic flake + scratch normal map, roughness map (flake sparkle, dirt raises roughness toward the
   * bottom 25 %) and a white-based dirt map in `map` that darkens the colour slightly near the sill. The clearcoat
   * is kept. The bodywork needs real UVs (v = 0 at the sill) for the dirt band; with degenerate UVs it falls back to
   * the clean top-left texel.
   */
  carPaintDetail(): CarPaintMaps {
    if (!this.paintDetail) {
      const rng = new Rng((Rng.hash('carPaintMaps') ^ this.seed) >>> 0);
      const maps = carPaintMaps(this.factory, rng, this.aniso);
      this.textures.push(maps.normalMap, maps.roughnessMap, maps.dirtMap);
      this.paintDetail = maps;
    }
    for (const m of this.paints.values()) this.applyPaintDetail(m, this.paintDetail);
    return this.paintDetail;
  }

  private applyPaintDetail(m: THREE.Material, d: CarPaintMaps): void {
    const mm = m as THREE.MeshPhysicalMaterial;
    mm.normalMap = d.normalMap;
    mm.normalScale.set(CAR_FLAKE_NORMAL_SCALE, CAR_FLAKE_NORMAL_SCALE);
    mm.roughnessMap = d.roughnessMap; // the map carries the absolute roughness
    mm.roughness = 1;
    mm.map = d.dirtMap;
    mm.needsUpdate = true;
  }

  /** Store the environment map; applies to every cached reflective material and to ones created later. */
  setEnvironment(env: THREE.Texture | null): void {
    this.env = env;
    for (const m of this.envMaterials) {
      m.envMap = env;
      m.needsUpdate = true;
    }
  }

  setNight(night: boolean): void {
    this.night = night;
    for (const m of this.glowing) m.emissiveIntensity = night ? ((m.userData.nightIntensity as number | undefined) ?? NIGHT_INTENSITY) : 0;
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const m of [...this.cache.values(), ...this.awnings.values(), ...this.signs.values(), ...this.paints.values()]) m.dispose();
    this.cache.clear(); this.awnings.clear(); this.signs.clear(); this.paints.clear();
    this.reliefCache.clear();
    this.paintDetail = null;
    disposeVariationTexture();
    this.textures.length = 0;
    this.glowing.length = 0;
    this.envMaterials.length = 0;
  }

  // ------------------------------------------------------------ internals

  private prepColour(tex: THREE.Texture): void {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.aniso;
    this.textures.push(tex);
  }

  private texture(label: string, w: number, h: number, paint: Painter, variant: number): THREE.CanvasTexture {
    return this.textureSet(label, w, h, paint, variant).map;
  }

  /** True when the 2D context can read pixels back (real canvas), false for recording fakes. */
  private canReadPixels(ctx: CanvasRenderingContext2D): boolean {
    try {
      if (typeof ctx.getImageData !== 'function') return false;
      const d = ctx.getImageData(0, 0, 1, 1);
      return !!d && !!d.data && d.data.length > 0;
    } catch {
      return false;
    }
  }

  private textureSet(
    label: string, w: number, h: number, paint: Painter, variant: number, relief?: Relief,
  ): { map: THREE.CanvasTexture; relief: ReliefMaps | null } {
    const canvas = this.factory(w, h);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MaterialLibrary: 2D context unavailable');
    const rng = new Rng((Rng.hash(label) ^ this.seed) >>> 0);

    let maps: ReliefMaps | null = relief?.share ? this.reliefCache.get(relief.share) ?? null : null;
    let aux: Aux | undefined;
    let hCtx: CanvasRenderingContext2D | null = null;
    let hCanvas: HTMLCanvasElement | null = null;
    let rCanvas: HTMLCanvasElement | null = null;
    if (relief && !maps && this.canReadPixels(ctx)) {
      hCanvas = this.factory(w, h);
      hCanvas.width = w;
      hCanvas.height = h;
      hCtx = hCanvas.getContext('2d');
      let rCtx: CanvasRenderingContext2D | null = null;
      if (hCtx && relief.roughScale) {
        const rw = Math.max(64, Math.round(w * relief.roughScale));
        const rh = Math.max(64, Math.round(h * relief.roughScale));
        rCanvas = this.factory(rw, rh);
        rCanvas.width = rw;
        rCanvas.height = rh;
        rCtx = rCanvas.getContext('2d');
        rCtx?.scale(rw / w, rh / h);
      }
      if (hCtx) {
        hCtx.fillStyle = gray(128);
        hCtx.fillRect(0, 0, w, h);
        const auxSeed = relief.share ? `relief:${relief.share}` : `relief:${label}`;
        aux = { height: hCtx, rough: rCtx, rng: new Rng((Rng.hash(auxSeed) ^ this.seed) >>> 0) };
      }
    }

    paint(ctx, w, h, rng, variant, aux);
    const map = new THREE.CanvasTexture(canvas);
    this.prepColour(map);

    if (aux && hCtx && hCanvas && relief) {
      const normal = this.normalFromHeight(hCtx, w, h, relief.strength);
      if (normal) {
        let rough: THREE.CanvasTexture | null = null;
        if (rCanvas && aux.rough) {
          rough = new THREE.CanvasTexture(rCanvas);
          rough.wrapS = THREE.RepeatWrapping;
          rough.wrapT = THREE.RepeatWrapping;
          rough.colorSpace = THREE.NoColorSpace;
          this.textures.push(rough);
        }
        maps = { normal, rough };
        if (relief.share) this.reliefCache.set(relief.share, maps);
      }
      hCanvas.width = 0;
      hCanvas.height = 0;
    }
    return { map, relief: maps };
  }

  /** Read the painted height canvas, build a (tileable) tangent-space normal map as a DataTexture. */
  private normalFromHeight(hCtx: CanvasRenderingContext2D, w: number, h: number, strength: number): THREE.DataTexture | null {
    let data: ArrayLike<number> | undefined;
    try {
      data = hCtx.getImageData(0, 0, w, h)?.data;
    } catch {
      return null;
    }
    if (!data || data.length < w * h * 4) return null;
    const n = heightToNormal(heightFromRgba(data, w, h), w, h, strength);
    // canvas row 0 is the top (v = 1); DataTexture row 0 is v = 0, so flip rows
    const out = new Uint8Array(w * h * 4);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) out.set(n.subarray(y * rowBytes, (y + 1) * rowBytes), (h - 1 - y) * rowBytes);
    const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.aniso;
    tex.needsUpdate = true;
    this.textures.push(tex);
    return tex;
  }

  private registerEnv(m: THREE.MeshStandardMaterial, intensity: number): void {
    m.envMapIntensity = intensity;
    if (this.env) {
      m.envMap = this.env;
      m.needsUpdate = true;
    }
    this.envMaterials.push(m);
  }

  private physicalPaint(p: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.15, roughness: 0.35, ...p,
    });
  }

  private applyOverride(m: THREE.Material, o: MapOverride): void {
    const mm = m as THREE.MeshStandardMaterial;
    const prep = (t: THREE.Texture, colour: boolean): void => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.aniso;
      if (colour) t.colorSpace = THREE.SRGBColorSpace;
      if (o.repeat) t.repeat.set(o.repeat.x, o.repeat.y);
      if (t.image) t.needsUpdate = true;
    };
    if (o.map) { prep(o.map, true); mm.map = o.map; }
    if (o.normalMap) {
      prep(o.normalMap, false);
      mm.normalMap = o.normalMap;
      if (o.normalScale !== undefined) mm.normalScale.set(o.normalScale, o.normalScale);
    }
    if (o.roughnessMap) { prep(o.roughnessMap, false); mm.roughnessMap = o.roughnessMap; }
    mm.needsUpdate = true;
  }

  private std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...p });
  }

  private makeSpecs(): Record<MaterialKey, Spec> {
    const tex = (key: string, w: number, h: number, paint: Painter, extra: THREE.MeshStandardMaterialParameters = {}, relief?: Relief, offset = 0) =>
      (v: number): THREE.Material => {
        const set = this.textureSet(`${key}:${v}`, w, h, paint, v + offset, relief);
        const m = this.std({ map: set.map, ...extra });
        if (set.relief && relief) {
          m.normalMap = set.relief.normal;
          m.normalScale.set(relief.normalScale, relief.normalScale);
          if (set.relief.rough) {
            m.roughnessMap = set.relief.rough;
            m.roughness = 1; // the map carries the absolute roughness
          }
        }
        return m;
      };
    const flat = (colors: readonly string[], extra: THREE.MeshStandardMaterialParameters = {}): Spec => ({
      variants: colors.length,
      build: (v) => this.std({ color: new THREE.Color(colors[v]), ...extra }),
    });
    const glass = (key: string, w: number, h: number, paint: Painter, emissive: Painter, variants: number): Spec => ({
      variants,
      build: (v) => {
        const m = this.std({
          map: this.texture(`${key}:${v}`, w, h, paint, v),
          emissive: new THREE.Color(NIGHT_EMISSIVE),
          emissiveMap: this.texture(`${key}:em:${v}`, w, h, emissive, v),
          emissiveIntensity: this.night ? glassNightIntensity(key, v) : 0,
          roughness: 0.08,
          metalness: 0,
          transparent: true,
          opacity: 0.9,
        });
        m.userData.nightIntensity = glassNightIntensity(key, v);
        this.glowing.push(m);
        return m;
      },
    });
    const alias = (key: MaterialKey, variants: number, offset: number, w: number, h: number, paint: Painter, extra: THREE.MeshStandardMaterialParameters = {}, relief?: Relief): Spec => ({
      variants,
      build: tex(key, w, h, paint, extra, relief, offset),
    });

    const masonry: Relief = { strength: 2.5, normalScale: 0.6, roughScale: 0.5 };
    const brickRelief: Relief = { ...masonry, strength: 3.6, normalScale: 0.85, share: 'brick' };
    const stone: Relief = { strength: 2.2, normalScale: 0.6, roughScale: null };
    const asphaltRelief: Relief = { strength: 3, normalScale: 0.35, roughScale: 0.5 };
    const concreteRelief: Relief = { strength: 3, normalScale: 0.5, roughScale: null };

    return {
      asphalt: { variants: 2, build: tex('asphalt', 512, 512, asphaltPainter, {}, asphaltRelief) },
      asphaltWorn: alias('asphaltWorn', 1, 1, 512, 512, asphaltPainter, {}, asphaltRelief),
      concrete: { variants: 2, build: tex('concrete', 512, 512, concretePainter, {}, concreteRelief) },
      curb: flat(['#9d9b96']),
      bluestone: { variants: 2, build: tex('bluestone', 512, 512, bluestonePainter, {}, concreteRelief) },
      granite: { variants: 1, build: tex('granite', 256, 256, granitePainter, { roughness: 0.75 }, { ...stone, normalScale: 0.8 }) },
      manhole: { variants: 2, build: tex('manhole', 256, 256, manholePainter, { roughness: 0.55, metalness: 0.6 }, { strength: 3, normalScale: 0.8, roughScale: 0.5 }) },
      grate: { variants: 1, build: tex('grate', 256, 256, gratePainter, { roughness: 0.6, metalness: 0.6 }, { strength: 3, normalScale: 0.8, roughScale: 0.5 }) },
      laneLine: flat(['#f2f2ee', '#f2c21b'], { roughness: 0.8 }),
      crosswalk: { variants: 1, build: tex('crosswalk', 256, 256, crosswalkPainter) },
      brownstone: { variants: 2, build: tex('brownstone', 1024, 1024, brownstonePainter, {}, masonry) },
      brickRed: { variants: 4, build: tex('brickRed', 1024, 1024, brickPainter, {}, brickRelief) },
      brickPainted: alias('brickPainted', 2, 2, 1024, 1024, brickPainter, {}, brickRelief),
      limestone: { variants: 1, build: tex('limestone', 512, 512, limestonePainter, {}, stone) },
      cornice: { variants: 2, build: tex('cornice', 512, 512, cornicePainter, {}, { strength: 3, normalScale: 0.7, roughScale: 0.5 }) },
      stoop: alias('stoop', 1, 1, 512, 512, brownstonePainter, {}, { ...masonry, roughScale: 1 }),
      window: glass('window', 256, 256, windowPainter, windowEmissivePainter, WINDOW_VARIANTS),
      storefrontGlass: glass('storefrontGlass', 512, 256, storefrontPainter, storefrontEmissivePainter, STOREFRONT_VARIANTS),
      corrugatedSteel: { variants: CORRUGATED_VARIANTS, build: tex('corrugatedSteel', 512, 512, corrugatedSteelPainter, { roughness: 0.55, metalness: 0.3 }, { strength: 3, normalScale: 0.8, roughScale: null }) },
      chainlinkFence: { variants: CHAINLINK_FENCE_VARIANTS, build: (v) => this.std({ map: this.texture('chainlinkFence:' + v, 256, 256, chainlinkFencePainter, v), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.35 }) },
      chainlinkRail: { variants: CHAINLINK_RAIL_VARIANTS, build: tex('chainlinkRail', 256, 64, chainlinkRailPainter, { roughness: 0.45, metalness: 0.4, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }) },
      graniteCurb: { variants: GRANITE_CURB_VARIANTS, build: tex('graniteCurb', 512, 128, graniteCurbPainter, { roughness: 0.8 }, { strength: 2.4, normalScale: 0.8, roughScale: null }) },
      castIronFence: { variants: CAST_IRON_VARIANTS, build: (v) => this.std({ map: this.texture('castIronFence:' + v, 256, 256, castIronFencePainter, v), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0 }) },
      tarRoof: { variants: TAR_ROOF_VARIANTS, build: tex('tarRoof', 512, 512, tarRoofPainter, { roughness: 0.92, color: new THREE.Color(0.78, 0.77, 0.76) }, { strength: 3, normalScale: 0.6, roughScale: null }) },
      graffiti: { variants: GRAFFITI_VARIANTS, build: (v) => this.std({ map: this.texture('graffiti:' + v, 512, 256, graffitiPainter, v), transparent: true, alphaTest: 0.06, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.8 }) },
      rollGate: {
        variants: ROLLGATE_VARIANTS,
        build: tex('rollGate', 256, 256, rollGatePainter, { roughness: 0.6, metalness: 0.4 },
          { strength: 3, normalScale: 0.7, roughScale: null, share: 'rollGate' }),
      },
      roof: { variants: 1, build: tex('roof', 512, 512, roofPainter, {}, { strength: 3, normalScale: 0.5, roughScale: null }) },
      waterTank: { variants: 1, build: tex('waterTank', 256, 256, waterTankPainter) },
      treeTrunk: { variants: 1, build: tex('treeTrunk', 256, 256, treeTrunkPainter) },
      treeLeaves: { variants: LEAF_VARIANTS, build: tex('treeLeaves', 256, 256, treeLeavesPainter, { roughness: 0.8, alphaTest: 0.45 }) },
      metalDark: flat(['#26282b'], { roughness: 0.6, metalness: 0 }),
      metalGreen: flat(['#1d5a3a'], { roughness: 0.6, metalness: 0 }),
      hydrant: flat(['#c8282a', '#e0b81c'], { roughness: 0.55, metalness: 0 }),
      trash: flat(['#2e3a34'], { roughness: 0.7, metalness: 0 }),
      scaffold: { variants: 2, build: tex('scaffold', 256, 256, scaffoldPainter) },
      chainlink: {
        variants: 1,
        build: (v) => this.std({
          map: this.texture(`chainlink:${v}`, 256, 256, chainlinkPainter, v),
          transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5,
        }),
      },
      carGlass: {
        variants: 1,
        build: () => new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#1b2733'), roughness: 0.05, metalness: 0, transmission: 0,
          transparent: true, opacity: 0.85,
        }),
      },
      tire: { variants: 1, build: tex('tire', 256, 256, tirePainter, { roughness: 0.95 }) },
      copLivery: {
        variants: 1,
        build: (v) => this.physicalPaint({ map: this.texture(`copLivery:${v}`, 512, 256, copLiveryPainter, v) }),
      },
      taxiLivery: {
        variants: 1,
        build: (v) => this.physicalPaint({ map: this.texture(`taxiLivery:${v}`, 512, 256, taxiLiveryPainter, v) }),
      },
      skin: flat(SKIN_TONES),
      cloth: flat(CLOTH_COLORS),
      tireSidewall: {
        variants: 1,
        build: tex('tireSidewall', 1024, 256, tireSidewallPainter, { roughness: 0.95 }, { strength: 3, normalScale: 0.8, roughScale: null }),
      },
      plate: {
        variants: PLATE_VARIANTS,
        build: tex('plate', 256, 128, platePainter, { roughness: 0.5, metalness: 0.25 }, { strength: 3, normalScale: 0.7, roughScale: null }),
      },
      clothHoodie: {
        variants: HOODIE_VARIANTS,
        build: tex('clothHoodie', 256, 256, hoodiePainter, { roughness: 0.95 }, { strength: 2, normalScale: 0.45, roughScale: null, share: 'clothHoodie' }),
      },
      clothDenim: {
        variants: DENIM_VARIANTS,
        build: tex('clothDenim', 256, 256, denimPainter, { roughness: 0.9 }, { strength: 2.2, normalScale: 0.5, roughScale: null }),
      },
      clothVarsity: {
        variants: VARSITY_VARIANTS,
        build: tex('clothVarsity', 256, 256, varsityPainter, { roughness: 0.8 }, { strength: 2, normalScale: 0.45, roughScale: null, share: 'clothVarsity' }),
      },
      clothSneaker: {
        variants: SNEAKER_VARIANTS,
        build: tex('clothSneaker', 256, 256, sneakerPainter, { roughness: 0.6 }, { strength: 2, normalScale: 0.4, roughScale: null, share: 'clothSneaker' }),
      },
    };
  }
}
