/** Brownstone / brick rowhouse: raised basement, stoop with iron rails, tall parlour windows, cornice, parapet. */
import type * as THREE from 'three';
import {
  BASEMENT_H, FLOOR_H, acUnits, bayCentres, cornice, fireEscape, roofWithParapet, waterTank, windows,
} from './facade';
import type { LotCtx, LotOutput } from './facade';

export interface BrownstoneOpts {
  style: 'brownstone' | 'rowhouse';
  /** build the stoop (scaffolded houses skip it) */
  stoop?: boolean;
  /** distance the facade sits behind the building line (front yard holding the stoop) */
  setback?: number;
  /** force the floor count (otherwise 3-4) */
  floors?: number;
}

export function buildBrownstone(c: LotCtx, opts: BrownstoneOpts): LotOutput & { H: number; S: number; floors: number } {
  const { b, m, rng, W, D } = c;
  const S = opts.setback ?? 2.8;
  const floors = opts.floors ?? (opts.style === 'rowhouse' ? (rng.chance(0.25) ? 4 : 3) : rng.int(3, 4));
  const H = BASEMENT_H + floors * FLOOR_H;
  const frontMat: THREE.Material = opts.style === 'brownstone' ? m.brownstone : (rng.chance(0.3) ? m.brickPainted : m.brickRed);

  // shell: brick back/sides, stone or brick front
  b.box(m.brickRed, 0, 0, -D, W, H, -S, 'rlb');
  b.box(frontMat, 0, 0, -D, W, H, -S, 'f');

  const bays = W >= 6 ? 3 : 2;
  const xs = bayCentres(W, bays);
  const doorBay = rng.chance(0.5) ? 0 : bays - 1;
  const doorX = xs[doorBay];
  const stoopW = 1.5;
  const stoops: LotOutput['stoops'] = [];

  // basement windows (not under the stoop)
  windows(b, m, { xs: xs.filter((_, i) => i !== doorBay), y: 0.3, w: 0.9, h: 0.65, z: -S, sill: true });

  // parlour floor: tall windows, door bay gets the entrance
  const parlourY = BASEMENT_H;
  windows(b, m, { xs: xs.filter((_, i) => i !== doorBay), y: parlourY + 0.45, w: 1.1, h: 2.5, z: -S, sill: true, lintel: true });
  const acSpots: { x: number; y: number }[] = [];
  for (let k = 1; k < floors; k++) {
    const fy = BASEMENT_H + k * FLOOR_H;
    const top = k === floors - 1;
    windows(b, m, { xs, y: fy + 0.7, w: 1.0, h: top ? 1.9 : 2.0, z: -S, sill: true, lintel: true });
    for (const x of xs) acSpots.push({ x, y: fy + 0.7 });
  }

  // entrance
  b.rect(m.metal, [doorX - 0.55, parlourY, -S + 0.02], [1.1, 0, 0], [0, 2.3, 0], { ru: 0.4, rv: 0.8 });
  b.box(m.limestone, doorX - 0.75, parlourY + 2.3, -S, doorX + 0.75, parlourY + 2.65, -S + 0.25);
  b.box(m.limestone, doorX - 0.75, parlourY, -S, doorX - 0.55, parlourY + 2.3, -S + 0.12);
  b.box(m.limestone, doorX + 0.55, parlourY, -S, doorX + 0.75, parlourY + 2.3, -S + 0.12);

  if (opts.stoop !== false) {
    const x0 = doorX - stoopW / 2, x1 = doorX + stoopW / 2;
    const landing = 0.9, steps = 5, run = 0.32, rise = BASEMENT_H / (steps + 1);
    b.box(m.stoop, x0, 0, -S, x1, BASEMENT_H, -S + landing);
    for (let i = 0; i < steps; i++) {
      const zf = -S + landing + run * (steps - i);
      b.box(m.stoop, x0, 0, zf - run, x1, rise * (i + 1), zf, i === 0 ? 'rlufb' : 'rluf');
    }
    // iron rails: sloped handrail, landing rail, posts
    const zEnd = -S + landing + run * steps;
    const zLand = -S + landing;
    const yStart = rise + 0.9, yEnd = BASEMENT_H + 0.9;
    for (const x of [x0 + 0.03, x1 - 0.03]) {
      b.bar(m.metal, [x, yStart, zEnd], [x, yEnd, zLand], 0.05);
      b.bar(m.metal, [x, yEnd, zLand], [x, yEnd, -S + 0.05], 0.05);
      b.bar(m.metal, [x, yEnd - 0.4, zLand], [x, yEnd - 0.4, -S + 0.05], 0.035);
      for (let i = 0; i < steps; i += 2) {
        const zm = -S + landing + run * (steps - i) - run / 2;
        const t = (zEnd - zm) / (zEnd - zLand);
        b.bar(m.metal, [x, rise * (i + 1), zm], [x, yStart + (yEnd - yStart) * t, zm], 0.035);
      }
      b.bar(m.metal, [x, BASEMENT_H, zLand], [x, yEnd, zLand], 0.05);
    }
    stoops.push({ x0, x1, z0: -S, z1: -S + landing + run * steps });
  }

  // cornice, parapet, roof
  cornice(b, m, 0, W, H, -S, 0.6);
  roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: -S, y: H, frontMat, sideMat: m.brickRed });

  if (floors === 4 && rng.chance(0.6)) waterTank(b, m, W * 0.5, H, -D + 2.4);
  if (floors >= 3 && rng.chance(0.25)) {
    const ys: number[] = [];
    for (let k = 1; k < floors; k++) ys.push(BASEMENT_H + k * FLOOR_H + 0.62);
    const bx = bays >= 3 ? [xs[0] - 0.7, xs[1] + 0.7] : [xs[0] - 0.7, xs[1] + 0.7];
    fireEscape(b, m, Math.max(0.15, bx[0]), Math.min(W - 0.15, bx[1]), -S, ys);
  } else {
    acUnits(b, m, rng, acSpots, -S);
  }

  return { body: [{ x0: 0, x1: W, z0: -D, z1: -S }], stoops, H, S, floors };
}
