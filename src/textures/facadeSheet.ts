/**
 * One shared wall material for a whole cell of buildings (SURFACES2).
 *
 * Before: every wall class (red brick, painted brick, brownstone, limestone, stoops, cornices, roofs) was its own material, so
 * each render cell drew each class in its own call. Now those classes are the layers of two texture arrays (colour; and normal +
 * roughness packed into one), the geometry carries `aLayer`, and `patchLotToneSheet` (lotTone.ts) samples the right layer: a
 * cell draws all of them in one call. Variety stays per lot (aTone / aStyle from the colourway), per window and per wall in the
 * shader, as before. Windows, glass, awnings, signs, ironwork and metal keep their own materials (different shaders or alpha).
 *
 * The layers are read from the library's own materials (so a painted fallback shows until the CC0 photo sets have loaded, and a
 * photo override re-reads its layer): `MaterialLibrary.overrideMaps` calls `schedule()`, `loadTexturePacks` calls `finalize()`.
 * Tinted entries (the painted-brick set is cream or blue-grey through `material.color`) are baked into the layer.
 * Phone tier: colour array only (no relief, as everywhere on that tier), half size through `texSize`.
 */
import * as THREE from 'three';
import { patchLotToneSheet } from './lotTone';
import { releasesCanvases, texSize, wantsReliefMaps } from './texTier';

/** Layer order: the material id (`key:variant`) each layer is read from. Everything else that is "the same look" is already folded onto these by `SHARED_AS`. */
export const SHEET_LAYERS = ['brickRed:0', 'brickRed:2', 'brownstone:0', 'limestone:0', 'stoop:0', 'cornice:0', 'tarRoof:0'] as const;
export const SHEET_LAYER_OF: Readonly<Record<string, number>> = Object.fromEntries(SHEET_LAYERS.map((id, i) => [id, i]));
export const SHEET_NAME = 'brickSheet:0'; // the mesh name becomes `buildings:brickSheet:0`, which the phone streaming class (BuildingStream STREAM_MESH) matches as a wall

/** Side of one array layer in pixels before the tier scale: the hosted and native builds ship 1k photo sets, the single-file build 512. */
const BASE_SIDE = (import.meta as { env?: Record<string, string> }).env?.VITE_HOSTED === '1' ? 1024 : 512;

type Sampler = THREE.Texture | null | undefined;
type LayerMaterial = THREE.MeshStandardMaterial;

export class FacadeSheet {
  readonly material: THREE.MeshStandardMaterial;
  readonly side: number;
  readonly relief: boolean;
  private readonly count = SHEET_LAYERS.length;
  private readonly colour: THREE.DataArrayTexture;
  private readonly nr: THREE.DataArrayTexture | null;
  private readonly rep: THREE.Vector2[];
  private readonly ns: number[];
  private readonly rough: number[];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private released = false;
  private canvas: HTMLCanvasElement | null = null;

  constructor(private readonly layer: (i: number) => LayerMaterial, aniso: number) {
    this.side = texSize(BASE_SIDE, 'surface');
    this.relief = wantsReliefMaps();
    const px = this.side * this.side * 4;
    const mk = (srgb: boolean, fill: number): THREE.DataArrayTexture => {
      const data = new Uint8Array(px * this.count).fill(fill);
      const t = new THREE.DataArrayTexture(data, this.side, this.side, this.count);
      t.format = THREE.RGBAFormat;
      t.type = THREE.UnsignedByteType;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    this.colour = mk(true, 128);
    this.nr = this.relief ? mk(false, 128) : null;
    if (this.nr) { const d = this.nr.image.data as Uint8Array; for (let i = 0; i < d.length; i += 4) { d[i + 2] = 255; d[i + 3] = 255; } }
    this.rep = SHEET_LAYERS.map(() => new THREE.Vector2(1, 1));
    this.ns = SHEET_LAYERS.map(() => 1);
    this.rough = SHEET_LAYERS.map(() => 0.9);

    // the fake 1 x 1 maps only switch the stock shader's map / normal-map code paths on (vMapUv, the tangent frame): the array supplies the texels
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.colorSpace = THREE.SRGBColorSpace; white.needsUpdate = true;
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    flat.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ map: white, roughness: 1, metalness: 0, envMapIntensity: 0.1 });
    if (this.relief) m.normalMap = flat;
    m.name = SHEET_NAME;
    m.vertexColors = true;
    (m as THREE.Material & { defaultAttributeValues?: Record<string, number[]> }).defaultAttributeValues = { color: [1, 1, 1, 1], aTone: [0, 0, 0, 0], aStyle: [0, 0, 0, 0], aLayer: [0] };
    patchLotToneSheet(m, {
      stoneLayer: SHEET_LAYER_OF['brownstone:0'], corniceLayer: SHEET_LAYER_OF['cornice:0'], layerCount: this.count, relief: this.relief,
      uniforms: { map: this.colour, relief: this.nr, rep: this.rep, normalScale: this.ns, rough: this.rough },
    });
    this.material = m;
  }

  /** Reads every layer from its source material (painted fallback or photo) now. Safe to call repeatedly; a no-op after `finalize` on the tiers that free the pixels. */
  refresh(): void {
    if (this.released) return;
    for (let i = 0; i < this.count; i++) this.readLayer(i);
    this.colour.needsUpdate = true;
    if (this.nr) this.nr.needsUpdate = true;
  }

  /** A layer's source changed (a photo set arrived): re-read everything once, a moment after the last change. */
  schedule(): void {
    if (this.released || this.timer !== null || typeof setTimeout !== 'function') return;
    this.timer = setTimeout(() => { this.timer = null; this.refresh(); }, 40);
  }

  /** All photo sets are in: read once more and, on phone and low, drop the JS copy of the pixels as soon as the GPU has them. */
  finalize(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.refresh();
    if (!releasesCanvases()) return;
    this.released = true;
    // the layers' own canvases are copies now and nothing else draws with them (only the real-map massing mesh uses brickRed:0, so that one stays):
    // empty them like every other uploaded canvas on these tiers, so the sheet does not raise live canvas memory
    for (let i = 1; i < this.count; i++) {
      const t = this.layer(i).map;
      const im = t?.image as { width?: number; height?: number; getContext?: unknown } | undefined;
      if (t && im && typeof im.getContext === 'function' && (im.width ?? 0) * (im.height ?? 0) > 1) { im.width = 1; im.height = 1; t.userData.canvasReleased = true; }
    }
    for (const t of [this.colour, this.nr]) {
      if (!t) continue;
      const prev = t.onUpdate;
      t.onUpdate = function (this: THREE.Texture) {
        (this.image as { data: Uint8Array | null }).data = null;
        this.onUpdate = null;
        prev?.call(this, this);
      };
    }
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.colour.dispose(); this.nr?.dispose(); this.material.dispose();
    if (this.canvas) { this.canvas.width = 1; this.canvas.height = 1; this.canvas = null; }
  }

  // ------------------------------------------------------------------------------------------------ pixels

  private readLayer(i: number): void {
    const lm = this.layer(i);
    const px = this.side * this.side * 4;
    const rep = (lm.map?.repeat ?? lm.normalMap?.repeat);
    if (rep) this.rep[i].set(rep.x || 1, rep.y || 1);
    this.ns[i] = lm.normalScale?.x ?? 1;
    this.rough[i] = lm.roughness;
    const c = this.pixels(lm.map);
    if (c) {
      const tint = lm.color;
      if (tint && (tint.r < 0.999 || tint.g < 0.999 || tint.b < 0.999)) {
        const rgb = { r: 1, g: 1, b: 1 };
        tint.getRGB(rgb, THREE.SRGBColorSpace);
        for (let k = 0; k < c.length; k += 4) { c[k] *= rgb.r; c[k + 1] *= rgb.g; c[k + 2] *= rgb.b; }
      }
      (this.colour.image.data as Uint8Array).set(c, i * px);
    }
    if (this.nr) {
      const out = this.nr.image.data as Uint8Array;
      const n = this.pixels(lm.normalMap);
      const r = this.pixels(lm.roughnessMap);
      const o = i * px;
      for (let k = 0; k < px; k += 4) {
        out[o + k] = n ? n[k] : 128;
        out[o + k + 1] = n ? n[k + 1] : 128;
        out[o + k + 2] = r ? r[k + 1] : 255; // roughness reads channel G, as the stock shader does
        out[o + k + 3] = 255;
      }
    }
  }

  /** The texture's pixels resampled to side x side RGBA, or null when they cannot be read (released canvas, test fake, no DOM). */
  private pixels(t: Sampler): Uint8ClampedArray | null {
    try {
      const im = t?.image as (CanvasImageSource & { width: number; height: number; data?: ArrayLike<number> }) | undefined;
      if (!im || !(im.width > 1) || typeof document === 'undefined') return null;
      const S = this.side;
      if (!this.canvas) { this.canvas = document.createElement('canvas'); this.canvas.width = S; this.canvas.height = S; }
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, S, S);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (im.data) { // a DataTexture (the painted normal maps): wrap its bytes in an ImageData and scale it
        const tmp = document.createElement('canvas'); tmp.width = im.width; tmp.height = im.height;
        const tc = tmp.getContext('2d');
        if (!tc) return null;
        tc.putImageData(new ImageData(new Uint8ClampedArray(im.data as ArrayLike<number> as Uint8ClampedArray), im.width, im.height), 0, 0);
        ctx.drawImage(tmp, 0, 0, S, S);
        tmp.width = 1; tmp.height = 1;
      } else { // canvases and photos are stored top row first; a texture array row 0 is v = 0 (the bottom), so flip on the way in
        ctx.setTransform(1, 0, 0, -1, 0, S);
        ctx.drawImage(im, 0, 0, S, S);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      return ctx.getImageData(0, 0, S, S).data;
    } catch { return null; }
  }
}
