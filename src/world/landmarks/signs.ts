/**
 * LANDMARKS sign boards in the project's own fonts (Anton for short names, Barlow Condensed for long ones; both are loaded by
 * src/ui/type.css). One small canvas per distinct board, emptied after the GPU upload (iPhone Safari caps 2D canvas memory), cached
 * per material library. Without a document (unit tests) the library's own sign painter is used.
 */
import * as THREE from 'three';
import type { IMaterialLibrary } from '@/world/types';

const cache = new WeakMap<object, Map<string, THREE.Material>>();
const W = 512, H = 128;

function paint(ctx: CanvasRenderingContext2D, text: string, bg: string, fg: string): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.split(' ');
  const oneLine = text.length <= 15 || words.length < 2;
  const fit = (s: string, family: string, weight: string, maxW: number, maxPx: number): number => {
    let px = maxPx;
    ctx.font = `${weight} ${px}px ${family}`;
    while (px > 10 && ctx.measureText(s).width > maxW) { px -= 2; ctx.font = `${weight} ${px}px ${family}`; }
    return px;
  };
  if (oneLine) {
    const family = '"Anton", Impact, "Arial Narrow", sans-serif';
    const px = fit(text, family, '400', W - 56, 84);
    ctx.font = `400 ${px}px ${family}`;
    ctx.fillText(text, W / 2, H / 2 + 3);
  } else {
    // two lines, split at the space that balances them
    let best = 1, bd = 1e9;
    for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } }
    const l1 = words.slice(0, best).join(' '), l2 = words.slice(best).join(' ');
    const family = '"Barlow Condensed", "Arial Narrow", sans-serif';
    const px = Math.min(fit(l1, family, '700', W - 56, 50), fit(l2, family, '700', W - 56, 50));
    ctx.font = `700 ${px}px ${family}`;
    ctx.fillText(l1, W / 2, H / 2 - px * 0.5 + 2);
    ctx.fillText(l2, W / 2, H / 2 + px * 0.5 + 4);
  }
}

export function signMaterial(lib: IMaterialLibrary, text: string, bg: string, fg: string): THREE.Material {
  if (typeof document === 'undefined') return lib.sign(text, bg, fg);
  let m = cache.get(lib);
  if (!m) { m = new Map(); cache.set(lib, m); }
  const key = `${text}|${bg}|${fg}`;
  let mat = m.get(key);
  if (mat) return mat;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return lib.sign(text, bg, fg);
  paint(ctx, text, bg, fg);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  mm.name = `lm:sign:${text}`;
  // the fonts load with the page: repaint once they are there, then free the canvas after the upload
  let repainted = false;
  const free = (): void => { if (repainted) { tex.onUpdate = () => undefined; canvas.width = 1; canvas.height = 1; } };
  const ready = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (ready && typeof ready.load === 'function') {
    void Promise.all([ready.load('84px "Anton"'), ready.load('700 50px "Barlow Condensed"')]).then(() => {
      if (canvas.width !== W) { repainted = true; return; } // already emptied and uploaded: keep what the GPU has
      paint(ctx, text, bg, fg); tex.needsUpdate = true; repainted = true;
    }).catch(() => { repainted = true; });
  } else repainted = true;
  tex.onUpdate = free;
  m.set(key, mat = mm);
  return mat;
}
