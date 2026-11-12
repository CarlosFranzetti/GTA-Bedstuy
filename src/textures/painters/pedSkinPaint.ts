/**
 * People textures, the GTA III / IV way: the clothes, face, shoes and soft shading are PAINTED INTO ONE COLOUR MAP of one skinned body.
 * The map is baked by position: every texel of the body's UV tiles (a uniform cylinder unwrap per part, scripts/people-pipeline.mjs) is looked up in 3D and
 * coloured by what is at that spot of the body (a neckline, a hem, a cuff, an eyelid). So lines run straight across chart seams and
 * nothing is cut per triangle. A block at the top right of the map holds swatches for the few extra volumes (hair, hat, bag, hood, skirt).
 * No lettering, no logos, no traced art.
 */
import type { PedSpec } from './ped';
import { createCanvas } from '@/textures/canvas';
import { Px } from './pedPaintShared';
import { makeShader } from './pedPaintShade';
import { paintSwatches } from './pedPaintSwatch';

export { rgb } from './pedPaintShared';

export const SK_ATLAS = 512;
export interface PxRect { x: number; y: number; w: number; h: number }
/** tiles of the body parts (must equal TILES in scripts/people-pipeline.mjs): each is a cylinder unwrap, left and right limbs share a tile, mirrored */
export const SK_TILES: Record<'head' | 'torso' | 'upperArm' | 'foreArm' | 'hand' | 'neck' | 'thigh' | 'shin' | 'pelvis' | 'shoe', PxRect> = {
  head: { x: 0, y: 0, w: 256, h: 256 }, torso: { x: 256, y: 128, w: 256, h: 128 },
  upperArm: { x: 0, y: 256, w: 128, h: 128 }, foreArm: { x: 128, y: 256, w: 128, h: 128 }, hand: { x: 256, y: 256, w: 128, h: 64 }, neck: { x: 384, y: 256, w: 128, h: 64 },
  thigh: { x: 0, y: 384, w: 128, h: 128 }, shin: { x: 128, y: 384, w: 128, h: 128 }, pelvis: { x: 256, y: 384, w: 128, h: 128 }, shoe: { x: 384, y: 384, w: 128, h: 128 },
};
/** swatches for the few extra volumes: hair, hat, a bag, the top's fabric (hood, coat hem) and the bottom's (skirt) */
export const SK_RECTS: Record<'hair' | 'hat' | 'gear' | 'torso' | 'pelvis' | 'shoe', PxRect> = {
  shoe: { x: 384, y: 384, w: 128, h: 128 },
  hair: { x: 256, y: 0, w: 128, h: 64 }, hat: { x: 384, y: 0, w: 128, h: 64 }, torso: { x: 256, y: 64, w: 64, h: 64 }, pelvis: { x: 320, y: 64, w: 64, h: 64 }, gear: { x: 384, y: 64, w: 128, h: 64 },
};

export interface BakeInput {
  position: Float32Array; normal: Float32Array; uv: Float32Array; index: Uint32Array; joints: Uint16Array; weights: Float32Array;
  landmarks: { chinY: number; crownY: number; eyeY: number; eyeX: number; hemY: number; ankleY: number; wristY: number };
  rig: Record<string, number[]>;
  headRings: number[][];
  /** where the top ends (y) */
  topHem: number;
  spec: PedSpec;
}

const N = SK_ATLAS;
const depthMap = new Float32Array(N * N), posMap = new Float32Array(N * N * 3), nrmMap = new Float32Array(N * N * 3), wMap = new Float32Array(N * N * 4), cover = new Uint8Array(N * N);

/** rasterise the chart: for every covered texel the 3D position, normal and the weights of head / torso+hips / arms / legs */
function rasterise(b: BakeInput, size: number): void {
  const n = size * size;
  cover.fill(0, 0, n); wMap.fill(0, 0, n * 4); depthMap.fill(1e9, 0, n);
  const grp = (v: number, out: Float32Array | number[]): void => {
    out[0] = out[1] = out[2] = out[3] = 0;
    for (let k = 0; k < 4; k++) { const j = b.joints[v * 4 + k], w = b.weights[v * 4 + k]; if (j === 3) out[0] += w; else if (j <= 2) out[1] += w; else if (j <= 7) out[2] += w; else out[3] += w; }
  };
  const ga = [0, 0, 0, 0], gb = [0, 0, 0, 0], gc = [0, 0, 0, 0];
  for (let t = 0; t < b.index.length; t += 3) {
    const ia = b.index[t], ib = b.index[t + 1], ic = b.index[t + 2];
    const ax = b.uv[ia * 2] * size, ay = (1 - b.uv[ia * 2 + 1]) * size, bx = b.uv[ib * 2] * size, by = (1 - b.uv[ib * 2 + 1]) * size, cx = b.uv[ic * 2] * size, cy = (1 - b.uv[ic * 2 + 1]) * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) {
      // a pole triangle: its three corners share one point of the pole block, the colour of the triangle's centre goes into that 2 x 2 texel block
      if (Math.abs(ax - bx) < 1e-3 && Math.abs(ay - by) < 1e-3 && Math.abs(ax - cx) < 1e-3) {
        grp(ia, ga); grp(ib, gb); grp(ic, gc);
        const tx = Math.round(ax) - (size > 256 ? 1 : 0), ty = Math.round(ay) - (size > 256 ? 1 : 0), w = size > 256 ? 2 : 1;
        for (let yy = 0; yy < w; yy++) for (let xx = 0; xx < w; xx++) {
          const q = (ty + yy) * size + tx + xx;
          for (let k = 0; k < 3; k++) { posMap[q * 3 + k] = (b.position[ia * 3 + k] + b.position[ib * 3 + k] + b.position[ic * 3 + k]) / 3; nrmMap[q * 3 + k] = (b.normal[ia * 3 + k] + b.normal[ib * 3 + k] + b.normal[ic * 3 + k]) / 3; }
          for (let k = 0; k < 4; k++) wMap[q * 4 + k] = (ga[k] + gb[k] + gc[k]) / 3;
          cover[q] = 1;
        }
      }
      continue;
    }
    grp(ia, ga); grp(ib, gb); grp(ic, gc);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const l1 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den, l2 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den, l3 = 1 - l1 - l2;
      const e = -0.04;
      if (l1 < e || l2 < e || l3 < e) continue;
      const q = py * size + px, c1 = Math.min(1.2, Math.max(-0.2, l1)), c2 = Math.min(1.2, Math.max(-0.2, l2)), c3 = 1 - c1 - c2;
      // where charts fold over each other (lids, nostrils, lips) the surface nearest the front owns the texel
      const zz = b.position[ia * 3 + 2] * c1 + b.position[ib * 3 + 2] * c2 + b.position[ic * 3 + 2] * c3;
      if (cover[q] && zz > depthMap[q] + 0.01) continue;
      depthMap[q] = zz;
      for (let k = 0; k < 3; k++) {
        posMap[q * 3 + k] = b.position[ia * 3 + k] * c1 + b.position[ib * 3 + k] * c2 + b.position[ic * 3 + k] * c3;
        nrmMap[q * 3 + k] = b.normal[ia * 3 + k] * c1 + b.normal[ib * 3 + k] * c2 + b.normal[ic * 3 + k] * c3;
      }
      for (let k = 0; k < 4; k++) wMap[q * 4 + k] = ga[k] * c1 + gb[k] * c2 + gc[k] * c3;
      cover[q] = 1;
    }
  }
}

export interface BakeResult { canvas: HTMLCanvasElement | OffscreenCanvas }

/** bake time of the maps so far (ms, count): the showcase prints it */
export const bakeStats = { ms: 0, count: 0, last: 0 };
/** bake the whole colour map of a person */
export function bakeSkin(b: BakeInput, size = SK_ATLAS): HTMLCanvasElement {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  try { return bakeSkinInner(b, size); } finally { if (t0) { bakeStats.last = performance.now() - t0; bakeStats.ms += bakeStats.last; bakeStats.count++; } }
}
function bakeSkinInner(b: BakeInput, size: number): HTMLCanvasElement {
  rasterise(b, size);
  const { K, shade } = makeShader(b), px = new Px();
  const img = new Uint8ClampedArray(size * size * 4), filled = new Uint8Array(size * size), sk = K.skin;
  for (let q = 0; q < size * size; q++) { img[q * 4] = sk[0]; img[q * 4 + 1] = sk[1]; img[q * 4 + 2] = sk[2]; img[q * 4 + 3] = 255; }
  for (let q = 0; q < size * size; q++) {
    if (!cover[q]) continue;
    shade(posMap[q * 3], posMap[q * 3 + 1], posMap[q * 3 + 2], nrmMap[q * 3], nrmMap[q * 3 + 1], nrmMap[q * 3 + 2], wMap[q * 4], wMap[q * 4 + 1], wMap[q * 4 + 2], wMap[q * 4 + 3], q, px);
    img[q * 4] = px.r; img[q * 4 + 1] = px.g; img[q * 4 + 2] = px.b; img[q * 4 + 3] = 255; filled[q] = 1;
  }
  // pad the charts outward so filtering and mip levels never pull in the background
  for (let pass = 0; pass < 3; pass++) {
    const add: number[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const q = y * size + x;
      if (filled[q]) continue;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const o = yy * size + xx; if (!filled[o]) continue;
        r += img[o * 4]; g += img[o * 4 + 1]; bl += img[o * 4 + 2]; n++;
      }
      if (n) add.push(q, r / n, g / n, bl / n);
    }
    for (let i = 0; i < add.length; i += 4) { const q = add[i]; img[q * 4] = add[i + 1]; img[q * 4 + 1] = add[i + 2]; img[q * 4 + 2] = add[i + 3]; img[q * 4 + 3] = 255; filled[q] = 1; }
  }
  // whatever is still empty (the holes the pole triangles leave, the unused corners) takes the colour of the nearest painted texel along its row, then its column,
  // so a coarser LOD that lands there never samples a stray colour
  const nearest = (n: number, at: (i: number) => number): void => {
    const left = new Int32Array(n).fill(-1), right = new Int32Array(n).fill(-1);
    let last = -1;
    for (let i = 0; i < n; i++) { if (filled[at(i)]) last = i; left[i] = last; }
    last = -1;
    for (let i = n - 1; i >= 0; i--) { if (filled[at(i)]) last = i; right[i] = last; }
    const todo: number[] = [];
    for (let i = 0; i < n; i++) { const q = at(i); if (filled[q]) continue; const l = left[i], r = right[i]; const pick = l < 0 ? r : r < 0 ? l : i - l <= r - i ? l : r; if (pick >= 0) todo.push(q, at(pick)); }
    for (let k = 0; k < todo.length; k += 2) { const q = todo[k], f = todo[k + 1]; img[q * 4] = img[f * 4]; img[q * 4 + 1] = img[f * 4 + 1]; img[q * 4 + 2] = img[f * 4 + 2]; }
    for (let k = 0; k < todo.length; k += 2) filled[todo[k]] = 1;
  };
  for (let y = 0; y < size; y++) nearest(size, (x) => y * size + x);
  for (let x = 0; x < size; x++) nearest(size, (y) => y * size + x);
  paintSwatches(img, size, K, SK_RECTS);
  const canvas = createCanvas(size, size) as HTMLCanvasElement, ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(img, size, size), 0, 0);
  return canvas;
}

