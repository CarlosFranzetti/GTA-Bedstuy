import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';
import { createCanvas, type Painter } from './canvas';
import { asphaltPainter, concretePainter, crosswalkPainter, roofPainter } from './painters/ground';
import { brickPainter, brownstonePainter, limestonePainter } from './painters/masonry';
import {
  STOREFRONT_VARIANTS, WINDOW_VARIANTS, storefrontEmissivePainter, storefrontPainter,
  windowEmissivePainter, windowPainter,
} from './painters/glass';
import {
  ROLLGATE_VARIANTS, chainlinkPainter, rollGatePainter, scaffoldPainter, tirePainter, waterTankPainter,
} from './painters/metal';
import { awningPainter, copLiveryPainter, signPainter } from './painters/signage';
import { CLOTH_COLORS, LEAF_VARIANTS, SKIN_TONES, treeLeavesPainter, treeTrunkPainter } from './painters/organic';
import { wrapVariant } from './painters/util';

export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;

const NIGHT_EMISSIVE = '#ffd27a';
const NIGHT_INTENSITY = 0.9;

interface Spec {
  variants: number;
  build(variant: number): THREE.Material;
}

/**
 * Procedural material library. All textures are drawn on 2D canvases (sizes 256-512 px) with painters from
 * ./painters, seeded from the Rng so the city is reproducible. Everything is cached.
 *
 * Texture world scale (so UV authors can pick repeats): brick 512px ~ 1.3 m, brownstone/limestone ~ 2 m,
 * concrete 256px = 3 m (2x2 slabs of 1.5 m), others are free-scale.
 */
export class MaterialLibrary implements IMaterialLibrary {
  private readonly seed: number;
  private readonly factory: CanvasFactory;
  private readonly cache = new Map<string, THREE.Material>();
  private readonly awnings = new Map<string, THREE.Material>();
  private readonly signs = new Map<string, THREE.Material>();
  private readonly paints = new Map<string, THREE.Material>();
  private readonly glowing: THREE.MeshStandardMaterial[] = [];
  private readonly textures: THREE.Texture[] = [];
  private night = false;
  private readonly specs: Record<MaterialKey, Spec>;

  constructor(rng: Rng, canvasFactory?: CanvasFactory) {
    this.seed = Math.floor(rng.next() * 0xffffffff) >>> 0;
    this.factory = canvasFactory ?? createCanvas;
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
    }
    return m;
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
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.35, metalness: 0.35 });
      m.name = `carPaint:${color}`;
      this.paints.set(color, m);
    }
    return m;
  }

  setNight(night: boolean): void {
    this.night = night;
    for (const m of this.glowing) m.emissiveIntensity = night ? NIGHT_INTENSITY : 0;
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const m of [...this.cache.values(), ...this.awnings.values(), ...this.signs.values(), ...this.paints.values()]) m.dispose();
    this.cache.clear(); this.awnings.clear(); this.signs.clear(); this.paints.clear();
    this.textures.length = 0;
    this.glowing.length = 0;
  }

  // ------------------------------------------------------------ internals

  private texture(label: string, w: number, h: number, paint: Painter, variant: number): THREE.CanvasTexture {
    const canvas = this.factory(w, h);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MaterialLibrary: 2D context unavailable');
    const rng = new Rng((Rng.hash(label) ^ this.seed) >>> 0);
    paint(ctx, w, h, rng, variant);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    return tex;
  }

  private std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...p });
  }

  private makeSpecs(): Record<MaterialKey, Spec> {
    const tex = (key: string, w: number, h: number, paint: Painter, extra: THREE.MeshStandardMaterialParameters = {}) =>
      (v: number): THREE.Material =>
        this.std({ map: this.texture(`${key}:${v}`, w, h, paint, v), ...extra });
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
          emissiveIntensity: this.night ? NIGHT_INTENSITY : 0,
          roughness: 0.2,
          metalness: 0.1,
          transparent: true,
          opacity: 0.9,
        });
        this.glowing.push(m);
        return m;
      },
    });
    const alias = (key: MaterialKey, variants: number, offset: number, w: number, h: number, paint: Painter, extra: THREE.MeshStandardMaterialParameters = {}): Spec => ({
      variants,
      build: (v) => this.std({ map: this.texture(`${key}:${v}`, w, h, paint, v + offset), ...extra }),
    });

    return {
      asphalt: { variants: 2, build: tex('asphalt', 512, 512, asphaltPainter) },
      asphaltWorn: alias('asphaltWorn', 1, 1, 512, 512, asphaltPainter),
      concrete: { variants: 2, build: tex('concrete', 256, 256, concretePainter) },
      curb: flat(['#9d9b96']),
      laneLine: flat(['#f2f2ee', '#f2c21b'], { roughness: 0.8 }),
      crosswalk: { variants: 1, build: tex('crosswalk', 256, 256, crosswalkPainter) },
      brownstone: { variants: 2, build: tex('brownstone', 512, 512, brownstonePainter) },
      brickRed: { variants: 4, build: tex('brickRed', 512, 512, brickPainter) },
      brickPainted: alias('brickPainted', 2, 2, 512, 512, brickPainter),
      limestone: { variants: 1, build: tex('limestone', 512, 512, limestonePainter) },
      cornice: { variants: 1, build: tex('cornice', 512, 512, limestonePainter) },
      stoop: alias('stoop', 1, 1, 512, 512, brownstonePainter),
      window: glass('window', 256, 256, windowPainter, windowEmissivePainter, WINDOW_VARIANTS),
      storefrontGlass: glass('storefrontGlass', 512, 256, storefrontPainter, storefrontEmissivePainter, STOREFRONT_VARIANTS),
      rollGate: { variants: ROLLGATE_VARIANTS, build: tex('rollGate', 256, 256, rollGatePainter, { roughness: 0.6, metalness: 0.4 }) },
      roof: { variants: 1, build: tex('roof', 512, 512, roofPainter) },
      waterTank: { variants: 1, build: tex('waterTank', 256, 256, waterTankPainter) },
      treeTrunk: { variants: 1, build: tex('treeTrunk', 256, 256, treeTrunkPainter) },
      treeLeaves: { variants: LEAF_VARIANTS, build: tex('treeLeaves', 256, 256, treeLeavesPainter) },
      metalDark: flat(['#26282b'], { roughness: 0.6, metalness: 0.5 }),
      metalGreen: flat(['#1d5a3a'], { roughness: 0.6, metalness: 0.4 }),
      hydrant: flat(['#c8282a', '#e0b81c'], { roughness: 0.55, metalness: 0.2 }),
      trash: flat(['#2e3a34'], { roughness: 0.7, metalness: 0.3 }),
      scaffold: { variants: 2, build: tex('scaffold', 256, 256, scaffoldPainter) },
      chainlink: {
        variants: 1,
        build: (v) => this.std({
          map: this.texture(`chainlink:${v}`, 256, 256, chainlinkPainter, v),
          transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5,
        }),
      },
      carGlass: flat(['#1b2733'], { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 }),
      tire: { variants: 1, build: tex('tire', 256, 256, tirePainter, { roughness: 0.95 }) },
      copLivery: { variants: 1, build: tex('copLivery', 512, 256, copLiveryPainter, { roughness: 0.4, metalness: 0.2 }) },
      skin: flat(SKIN_TONES),
      cloth: flat(CLOTH_COLORS),
    };
  }
}
