/** Six-floor brick apartment block; the condo POI gets a glass curtain wall with grey panels and a roof deck. */
import {
  FLOOR_H, acUnits, bayCentres, cornice, fireEscape, roofWithParapet, sideWallFrame, waterTank, windows,
} from './facade';
import type { LotCtx, LotOutput } from './facade';

export function buildApartment(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot } = c;
  const condo = lot.poi?.archetype === 'condo';
  const GROUND = 3.6;
  const floors = condo ? 7 : 6;
  const H = GROUND + (floors - 1) * FLOOR_H;
  const brick = rng.chance(0.3) ? m.brickPainted : m.brickRed;

  b.box(brick, 0, 0, -D, W, H, 0, 'rlb');

  if (condo) {
    // glass curtain wall with grey spandrel panels and mullions
    b.rect(m.glass, [0, 0, 0], [W, 0, 0], [0, H, 0], { ru: Math.max(2, Math.round(W / 2.2)), rv: floors });
    for (let k = 0; k <= floors - 1; k++) {
      const y = k === 0 ? 0 : GROUND + (k - 1) * FLOOR_H;
      b.box(m.limestone, 0, y, 0, W, y + (k === 0 ? 0.5 : 0.35), 0.12, 'rlufb');
    }
    const mull = Math.max(2, Math.round(W / 2.2));
    for (let i = 0; i <= mull; i++) b.box(m.metal, (W * i) / mull - 0.04, 0, 0, (W * i) / mull + 0.04, H, 0.1, 'rlf');
    b.box(m.limestone, 0, H - 0.4, 0, W, H, 0.3);
    if (lot.poi) {
      const sign = m.lib.sign(lot.poi.sign, '#222a30', '#e9e4d8');
      b.box(sign, 0.4, 3.0, 0, W - 0.4, 3.9, 0.15, 'rlufb', true);
    }
    // roof deck rail + planters
    b.rect(m.roof, [0, H + 0.01, 0], [W, 0, 0], [0, 0, -D]);
    b.bar(m.metal, [0.1, H + 1.1, -0.1], [W - 0.1, H + 1.1, -0.1], 0.05);
    b.bar(m.metal, [0.1, H + 1.1, -D + 0.1], [W - 0.1, H + 1.1, -D + 0.1], 0.05);
    b.bar(m.metal, [0.1, H + 1.1, -0.1], [0.1, H + 1.1, -D + 0.1], 0.05);
    b.bar(m.metal, [W - 0.1, H + 1.1, -0.1], [W - 0.1, H + 1.1, -D + 0.1], 0.05);
    for (let i = 0; i <= 6; i++) {
      const x = 0.1 + ((W - 0.2) * i) / 6;
      b.bar(m.metal, [x, H, -0.1], [x, H + 1.1, -0.1], 0.04);
    }
    b.box(m.stoop, W * 0.2, H, -D * 0.5, W * 0.8, H + 0.35, -D * 0.5 + 0.6);
  } else {
    // front wall + entrance + windows
    b.rect(brick, [0, 0, 0], [W, 0, 0], [0, H, 0]);
    const bays = Math.max(2, Math.floor(W / 2.2));
    const xs = bayCentres(W, bays);
    const doorX = W / 2;
    b.rect(m.metal, [doorX - 0.6, 0, 0.03], [1.2, 0, 0], [0, 2.4, 0], { ru: 0.4, rv: 0.8 });
    b.box(m.limestone, doorX - 1.2, 2.55, 0, doorX + 1.2, 2.75, 1.3);
    windows(b, m, { xs: xs.filter((x) => Math.abs(x - doorX) > 0.9), y: 1.0, w: 1.1, h: 1.7, z: 0, sill: true, lintel: true });
    const acSpots: { x: number; y: number }[] = [];
    const fe: number[] = [];
    for (let k = 1; k < floors; k++) {
      const fy = GROUND + (k - 1) * FLOOR_H;
      windows(b, m, { xs, y: fy + 0.9, w: 1.1, h: 1.9, z: 0, sill: true, lintel: true });
      for (const x of xs) acSpots.push({ x, y: fy + 0.9 });
      fe.push(fy + 0.85);
    }
    cornice(b, m, 0, W, H, 0, 0.6);
    roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, frontMat: brick, sideMat: m.brickRed });
    if (rng.chance(0.5)) waterTank(b, m, W * 0.5, H, -D + 2.8);
    if (rng.chance(0.25) && xs.length >= 2) fireEscape(b, m, Math.max(0.2, xs[0] - 0.7), Math.min(W - 0.2, xs[1] + 0.7), 0, fe);
    else acUnits(b, m, rng, acSpots, 0);
  }

  if (c.cornerSide) {
    const nb = Math.max(2, Math.floor((D - 1) / 3));
    b.with(sideWallFrame(c.cornerSide, W, D), () => {
      for (let k = 1; k < floors; k++) windows(b, m, { xs: bayCentres(D, nb), y: GROUND + (k - 1) * FLOOR_H + 0.9, w: 1.1, h: 1.9, z: 0, sill: true });
    });
  }

  return { body: [{ x0: 0, x1: W, z0: -D, z1: 0 }], stoops: [] };
}
