/**
 * Texture size by quality tier: the one place the memory budget of textures is decided (IPHONE lane).
 *
 * Every painter, atlas and loader that sizes a texture asks `texSize(base, kind)` (or `texScale(kind)`), and every
 * canvas that is only a source for a GPU upload goes through `releaseCanvasAfterUpload`. New textures should do the
 * same; `docs/swarm/tasks/IPHONE.md` lists the numbers.
 *
 *  - `phone`: the budget tier (an iPhone tab dies well below a desktop's memory): textures at about half size, no normal
 *    or roughness maps, canvases freed once uploaded.
 *  - `low`: only the canvases are freed once uploaded (same picture as before, less JS memory).
 *  - `medium`, `high`: unchanged.
 *
 * The tier is read from the page URL and the pointer type (the same rule as main.ts: `?q=` or a touch device = phone), and
 * can be set explicitly (`setTextureTier`, tests). Without a browser (node tools, unit tests) it is `high`: full size.
 */
import * as THREE from 'three';
import type { Quality } from '@/render/Shadows';

export type TexKind =
  /** tiling surface textures painted by MaterialLibrary and photo packs (walls, roofs) */
  | 'surface'
  /** ground photo sets seen from above and close (sidewalk, asphalt, concrete, dirt): kept a little larger than walls */
  | 'ground'
  /** storefront sheets (awnings, lightboxes, boards): pixels per metre */
  | 'atlas'
  /** car skins and livery atlases */
  | 'skin'
  /** pedestrian skin / clothes bakes */
  | 'people'
  /** small decal textures (signs, graffiti, party-wall decals) */
  | 'decal';

/** Size factor by tier and kind (1 = the size the painter was written for). */
const SCALE: Record<Quality, Record<TexKind, number>> = {
  phone: { surface: 0.5, ground: 0.75, atlas: 0.5, skin: 0.5, people: 0.5, decal: 0.5 },
  low: { surface: 1, ground: 1, atlas: 1, skin: 1, people: 1, decal: 1 },
  medium: { surface: 1, ground: 1, atlas: 1, skin: 1, people: 1, decal: 1 },
  high: { surface: 1, ground: 1, atlas: 1, skin: 1, people: 1, decal: 1 },
};

/** Smallest side (px) a scaled texture ever gets. */
export const MIN_TEX_SIDE = 16;

let forced: Quality | null = null;
let detected: Quality | null | undefined;

function detect(): Quality {
  if (detected !== undefined) return detected ?? 'high';
  detected = null;
  try {
    if (typeof location === 'undefined') return 'high';
    const q = new URLSearchParams(location.search).get('q');
    if (q === 'phone' || q === 'low' || q === 'medium' || q === 'high') detected = q;
    else if (q === 'ultra') detected = 'high';
    else {
      const touch = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || ((typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) ?? 0) > 0;
      detected = touch ? 'phone' : 'medium';
    }
  } catch { detected = null; }
  return detected ?? 'high';
}

/** The tier textures are sized for. */
export function textureTier(): Quality { return forced ?? detect(); }

/** Forces the tier (tests, tools); `null` goes back to detection. */
export function setTextureTier(q: Quality | null): void { forced = q; if (q === null) detected = undefined; }

/** Size factor of a kind on the current tier (1 off the phone tier). */
export function texScale(kind: TexKind, q: Quality = textureTier()): number { return SCALE[q][kind]; }

/**
 * `base` px (one side) scaled for the tier: a power-of-two base stays a power of two, never below MIN_TEX_SIDE or above `base`.
 * The one function new textures use for their canvas size.
 */
export function texSize(base: number, kind: TexKind = 'surface', q: Quality = textureTier()): number {
  const s = SCALE[q][kind];
  if (s >= 1) return base;
  return Math.max(Math.min(MIN_TEX_SIDE, base), Math.round(base * s));
}

/** Normal and roughness maps are drawn, loaded and kept only where the tier shows them (not on phone). */
export function wantsReliefMaps(q: Quality = textureTier()): boolean { return q !== 'phone'; }

/** Canvases are released after upload on the phone and low tiers (JS-side memory; the GPU copy stays). */
export function releasesCanvases(q: Quality = textureTier()): boolean { return q === 'phone' || q === 'low'; }

/** Counters for the ?debug=mem overlay and tests. */
export const canvasStats = { released: 0, releasedPx: 0 };

/**
 * Frees the 2D canvas behind a texture once the GPU has it: after the first upload the canvas is set to 1 x 1 (a canvas keeps
 * a full RGBA backing store alive, and iOS Safari caps the total canvas memory of a page). Use ONLY where nothing paints into
 * the canvas afterwards. No-op off the phone and low tiers, for non-canvas images, and when `force` is not set and the tier
 * keeps canvases. Returns true when the hook was installed.
 */
export function releaseCanvasAfterUpload(tex: THREE.Texture, force = false): boolean {
  if (!force && !releasesCanvases()) return false;
  const prev = tex.onUpdate;
  tex.onUpdate = function (this: THREE.Texture) {
    const img = this.image as { width?: number; height?: number; getContext?: unknown } | undefined;
    if (img && typeof img.getContext === 'function' && (img.width ?? 0) * (img.height ?? 0) > 1) {
      canvasStats.released++;
      canvasStats.releasedPx += (img.width ?? 0) * (img.height ?? 0);
      // the GPU copy exists now; the sampler never reads the canvas again (the texture must not be re-uploaded: needsUpdate stays false)
      this.userData.gpuW = img.width; this.userData.gpuH = img.height; // what the GPU holds (the ?debug=mem estimate)
      img.width = 1; img.height = 1;
      this.userData.canvasReleased = true;
    }
    this.onUpdate = null;
    prev?.call(this, this);
  };
  return true;
}

// ------------------------------------------------------------------------------------------------ scratch canvases

type CanvasMaker = (w: number, h: number) => HTMLCanvasElement;
const scratchPool: HTMLCanvasElement[] = [];
const SCRATCH_KEEP = 2;
let trimTimer: ReturnType<typeof setTimeout> | null = null;

/** A canvas of exactly `w` x `h` (cleared) from a small pool, for a painter that draws full size before a downscale. Give it back with `releaseScratch`. */
export function acquireScratch(make: CanvasMaker, w: number, h: number): HTMLCanvasElement {
  const c = scratchPool.pop() ?? make(w, h);
  c.width = w;
  c.height = h;
  return c;
}

/** Returns a scratch canvas to the pool; the pool shrinks to 1 x 1 canvases a moment after the last use. */
export function releaseScratch(c: HTMLCanvasElement): void {
  if (scratchPool.length >= SCRATCH_KEEP) { c.width = 1; c.height = 1; return; }
  scratchPool.push(c);
  if (trimTimer === null && typeof setTimeout === 'function') trimTimer = setTimeout(trimScratch, 2500);
}

/** Frees the backing store of every pooled scratch canvas now. */
export function trimScratch(): void {
  if (trimTimer !== null) { clearTimeout(trimTimer); trimTimer = null; }
  for (const c of scratchPool) { c.width = 1; c.height = 1; }
  scratchPool.length = 0;
}

/** Number of canvases waiting in the scratch pool (tests). */
export const scratchPoolSize = (): number => scratchPool.length;

/**
 * Draws `src` (any size) into a new canvas of `w` x `h` made by `make`, smoothly. Used where a full-size painter result is
 * kept at a smaller size on the phone tier.
 */
export function downscaleCanvas(src: CanvasImageSource, make: CanvasMaker, w: number, h: number): HTMLCanvasElement {
  const out = make(w, h);
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
  }
  return out;
}

/** True once `releaseCanvasAfterUpload` has emptied the texture's canvas (such a texture must never be re-uploaded). */
export const canvasReleased = (t: THREE.Texture): boolean => t.userData.canvasReleased === true;

// `?debug=mem`: the memory overlay starts itself (no main.ts line needed); it waits for window.__gtaDebug
if (typeof location !== 'undefined' && typeof document !== 'undefined' && /[?&]debug=mem\b/.test(location.search)) {
  const go = (): void => { void import('@/ui/MemOverlay').then((m) => m.startMemOverlay()); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
}
