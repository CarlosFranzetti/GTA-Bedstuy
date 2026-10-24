/** Mixed-use: storefront with awning + sign board + partly pulled roll gate, brick flats above, AC units. */
import {
  FLOOR_H, acUnits, bayCentres, cornice, fireEscape, roofWithParapet, sideWallFrame, waterTank, windows,
} from './facade';
import type { LotCtx, LotOutput } from './facade';

const GROUND_H = 4.0;

export function buildMixedUse(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot } = c;
  const poi = lot.poi;
  const nUp = rng.int(2, 3);
  const H = GROUND_H + nUp * FLOOR_H;
  const brick = rng.chance(0.35) ? m.brickPainted : m.brickRed;

  // shell without the front face
  b.box(brick, 0, 0, -D, W, H, 0, 'rlb');

  // upper front wall, piers, bulkhead, glass, gate, awning, sign
  const topOfShop = 3.0;
  const pier = 0.45;
  const inner = W - 2 * pier;
  b.rect(brick, [0, topOfShop, 0], [W, 0, 0], [0, H - topOfShop, 0]);
  b.rect(brick, [0, 0, 0], [pier, 0, 0], [0, topOfShop, 0]);
  b.rect(brick, [W - pier, 0, 0], [pier, 0, 0], [0, topOfShop, 0]);
  b.rect(m.metal, [pier, 0, 0.01], [inner, 0, 0], [0, 0.6, 0], { ru: inner / 3, rv: 0.2 });
  b.rect(m.glass, [pier, 0.6, 0.01], [inner, 0, 0], [0, topOfShop - 0.6, 0], { ru: Math.max(1, Math.round(inner / 1.6)), rv: 1 });
  // entrance door on one side
  const doorX = rng.chance(0.5) ? pier + 0.1 : W - pier - 1.1;
  b.rect(m.metal, [doorX, 0, 0.03], [1.0, 0, 0], [0, 2.3, 0], { ru: 0.4, rv: 0.8 });
  // roll gate pulled down 30% from the top
  const gateH = 0.3 * (topOfShop - 0.6);
  b.rect(m.rollGate, [pier, topOfShop - gateH, 0.14], [inner, 0, 0], [0, gateH, 0]);
  b.box(m.metal, pier, topOfShop - 0.06, 0, W - pier, topOfShop + 0.1, 0.25);

  // awning (full texture on every face so the valance text reads) and sign board above it
  const awning = poi ? m.lib.awning(poi.awningColor, poi.sign) : rng.pick(m.plainAwnings);
  b.box(awning, 0.15, topOfShop + 0.1, 0, W - 0.15, topOfShop + 0.7, 1.5, 'rluf', true);
  if (poi) {
    const sign = m.lib.sign(poi.sign, '#161616', '#f5f0e0');
    b.box(sign, 0.3, topOfShop + 0.8, 0, W - 0.3, topOfShop + 1.6, 0.18, 'rlufb', true);
  } else {
    b.box(m.metal, 0.3, topOfShop + 0.8, 0, W - 0.3, topOfShop + 1.5, 0.15);
  }

  // upper floors
  const bays = Math.max(2, Math.round(W / 2.4));
  const xs = bayCentres(W, bays);
  const acSpots: { x: number; y: number }[] = [];
  const fePlatforms: number[] = [];
  for (let k = 0; k < nUp; k++) {
    const fy = GROUND_H + k * FLOOR_H;
    windows(b, m, { xs, y: fy + 0.95, w: 1.05, h: 1.8, z: 0, sill: true, lintel: true });
    for (const x of xs) acSpots.push({ x, y: fy + 0.95 });
    fePlatforms.push(fy + 0.9);
  }
  cornice(b, m, 0, W, H, 0, 0.6);
  roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, frontMat: brick, sideMat: m.brickRed });
  if (nUp === 3 && rng.chance(0.6)) waterTank(b, m, W * 0.5, H, -D + 2.6);

  if (rng.chance(0.25)) {
    fireEscape(b, m, Math.max(0.2, xs[0] - 0.7), Math.min(W - 0.2, xs[Math.min(1, xs.length - 1)] + 0.7), 0, fePlatforms);
  } else {
    acUnits(b, m, rng, acSpots, 0);
  }

  // exposed side wall of a corner lot: windows all the way down
  if (c.cornerSide) {
    const nb = Math.max(2, Math.floor((D - 1) / 3));
    const sx = bayCentres(D, nb);
    b.with(sideWallFrame(c.cornerSide, W, D), () => {
      windows(b, m, { xs: sx, y: 0.9, w: 1.5, h: 2.2, z: 0, sill: true });
      for (let k = 0; k < nUp; k++) {
        windows(b, m, { xs: sx, y: GROUND_H + k * FLOOR_H + 0.95, w: 1.05, h: 1.8, z: 0, sill: true, lintel: true });
      }
      cornice(b, m, 0, D, H, 0, 0.5);
    });
  }

  return { body: [{ x0: 0, x1: W, z0: -D, z1: 0 }], stoops: [] };
}
