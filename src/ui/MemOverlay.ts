/**
 * `?debug=mem`: a small text overlay (top left) with the numbers that decide whether a phone tab survives: tier, canvas size,
 * pixel ratio, texture count and estimated GPU MB, geometry MB held in JS arrays, live 2D canvas MB behind canvas textures, and the
 * JS heap where the browser exposes it (Chrome; Safari does not). Meant to be read off a real iPhone. Costs one scene walk every 2 s.
 *
 * Starts itself (texTier.ts imports this lazily when the URL has `debug=mem`), waiting for `window.__gtaDebug` (main.ts) to appear.
 */
import * as THREE from 'three';
import { canvasStats, textureTier } from '@/textures/texTier';

export interface SceneMemory {
  textures: number;
  /** estimated GPU bytes of the distinct textures reachable from the scene's materials (mipmaps counted) */
  textureBytes: number;
  /** bytes of 2D canvases (larger than 1 x 1) still referenced as texture images */
  canvasBytes: number;
  geometries: number;
  /** bytes of vertex / index arrays still held in JS memory */
  geometryBytes: number;
  triangles: number;
}

const MB = 1048576;
const mb = (n: number): string => (n / MB).toFixed(n < 10 * MB ? 1 : 0);

interface ImgLike { width?: number; height?: number; videoWidth?: number; getContext?: unknown }

/** Walks a scene once and totals its textures and geometry arrays. Pure apart from reading the scene (unit-tested with a plain THREE.Scene). */
export function sceneMemory(scene: THREE.Object3D, extra: THREE.Texture[] = []): SceneMemory {
  const tex = new Set<THREE.Texture>(extra);
  const geos = new Set<THREE.BufferGeometry>();
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) tex.add(v as THREE.Texture);
    }
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && g.isBufferGeometry) geos.add(g);
  });
  let textureBytes = 0, canvasBytes = 0, triangles = 0, geometryBytes = 0;
  for (const t of tex) {
    const im = (Array.isArray(t.image) ? t.image[0] : t.image) as ImgLike | undefined;
    const w = im?.width ?? im?.videoWidth ?? 0, h = im?.height ?? 0;
    if (!(w > 0 && h > 0)) continue;
    const faces = Array.isArray(t.image) ? t.image.length : 1;
    const bpp = t.type === THREE.HalfFloatType ? 8 : t.type === THREE.FloatType ? 16 : 4;
    const mip = t.generateMipmaps && t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter ? 4 / 3 : 1;
    // a texture whose canvas was emptied after upload still occupies its original size on the GPU
    textureBytes += (t.userData.gpuW && t.userData.gpuH ? (t.userData.gpuW as number) * (t.userData.gpuH as number) : w * h) * bpp * mip * faces;
    if (typeof im?.getContext === 'function' && w * h > 1) canvasBytes += w * h * 4;
  }
  for (const g of geos) {
    let b = 0;
    for (const a of Object.values(g.attributes)) b += (a as THREE.BufferAttribute).array?.byteLength ?? 0;
    if (g.index) b += g.index.array?.byteLength ?? 0;
    geometryBytes += b;
    triangles += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
  }
  return { textures: tex.size, textureBytes, canvasBytes, geometries: geos.size, geometryBytes, triangles: Math.round(triangles) };
}

/** The overlay's text lines for one reading (exported for tests). */
export function memLines(o: { tier: string; canvas: string; pixelRatio: number; scene: SceneMemory; rendererTextures?: number; heapMB: number | null; releasedCanvases: number }): string[] {
  const s = o.scene;
  return [
    `tier ${o.tier}  canvas ${o.canvas}  pr ${o.pixelRatio.toFixed(2)}`,
    `tex ${s.textures}${o.rendererTextures !== undefined ? ` (gpu ${o.rendererTextures})` : ''} ~${mb(s.textureBytes)} MB`,
    `geo ${mb(s.geometryBytes)} MB  ${s.geometries} meshes-geo  ${(s.triangles / 1000).toFixed(0)}k tri`,
    `canvas alive ${mb(s.canvasBytes)} MB  freed ${o.releasedCanvases}`,
    `heap ${o.heapMB === null ? 'n/a' : o.heapMB.toFixed(0) + ' MB'}`,
  ];
}

interface DebugHandle { renderer?: THREE.WebGLRenderer; scene?: THREE.Scene }

/** Mounts the overlay and returns a stop function. `getHandle` defaults to `window.__gtaDebug`. */
export function startMemOverlay(getHandle: () => DebugHandle | undefined = () => (window as unknown as { __gtaDebug?: DebugHandle }).__gtaDebug): () => void {
  const el = document.createElement('pre');
  el.setAttribute('data-mem-overlay', '');
  el.style.cssText = 'position:fixed;z-index:99999;left:max(4px,env(safe-area-inset-left,0px));top:max(4px,env(safe-area-inset-top,0px));margin:0;padding:3px 5px;background:rgba(0,0,0,.62);color:#9f9;font:10px/1.25 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre;border-radius:3px';
  el.textContent = 'mem: waiting for the game...';
  document.body.appendChild(el);
  const tick = (): void => {
    const h = getHandle();
    if (!h?.renderer || !h.scene) return;
    const r = h.renderer;
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    el.textContent = memLines({
      tier: textureTier(), canvas: `${r.domElement.width}x${r.domElement.height}`, pixelRatio: r.getPixelRatio(),
      scene: sceneMemory(h.scene), rendererTextures: r.info.memory.textures, heapMB: perf.memory ? perf.memory.usedJSHeapSize / MB : null, releasedCanvases: canvasStats.released,
    }).join('\n');
  };
  const id = setInterval(tick, 2000);
  tick();
  return () => { clearInterval(id); el.remove(); };
}
