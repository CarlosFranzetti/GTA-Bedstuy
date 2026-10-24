/**
 * Six-floor brick apartment block with recessed windows, a canopied lobby door and bracketed cornice; the condo POI
 * gets a glass curtain wall with limestone floor slabs, glass-railed balconies and a roof deck.
 */
import {
  FLOOR_H, acUnits, airVent, bayCentres, cornice, drainPipe, fireEscape, pickWindow, rearWallFrame, revealFaces,
  roofClutter, roofWithParapet, sideWallFrame, wallWithHoles, waterTank, windows,
} from './facade';
import type { Hole, LotCtx, LotOutput } from './facade';

export function buildApartment(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot } = c;
  const condo = lot.poi?.archetype === 'condo';
  const GROUND = 3.6;
  const floors = condo ? 7 : 6;
  const H = GROUND + (floors - 1) * FLOOR_H;
  const r0 = rng.next();
  const brick = r0 < 0.3 ? m.brickPainted : r0 < 0.65 ? m.brickRed : m.brickAlt;
  const cs = c.cornerSide;

  b.box(brick, 0, 0, -D, W, H, 0, cs === 'left' ? 'rb' : cs === 'right' ? 'lb' : 'rlb');

  if (condo) {
    // dark backing behind the curtain wall, then storey-high glass bands between limestone floor slabs
    b.rect(m.metal, [0, 0, -0.1], [W, 0, 0], [0, H, 0], { ru: 1, rv: 1 });
    const mull = Math.max(2, Math.round(W / 2.2));
    b.rect(m.glass, [0, 0.5, 0], [W, 0, 0], [0, GROUND - 0.5, 0], { ru: Math.max(2, Math.round(W / 2.2)), rv: 1 });
    for (let k = 1; k < floors; k++) {
      const y0 = GROUND + (k - 1) * FLOOR_H;
      b.rect(pickWindow(m, rng), [0, y0 + 0.35, 0.02], [W, 0, 0], [0, FLOOR_H - 0.35, 0], { ru: Math.max(2, Math.round(W / 1.7)), rv: 1 });
    }
    // floor slabs (spandrels) with a projecting edge
    b.box(m.limestone, 0, 0, 0, W, 0.5, 0.14, 'fu');
    for (let k = 1; k < floors; k++) b.box(m.limestone, 0, GROUND + (k - 1) * FLOOR_H, 0, W, GROUND + (k - 1) * FLOOR_H + 0.35, 0.16, 'fud');
    b.box(m.limestone, 0, H - 0.4, 0, W, H, 0.3, 'frlud');
    for (let i = 0; i <= mull; i++) b.box(m.metal, (W * i) / mull - 0.04, GROUND, 0.02, (W * i) / mull + 0.04, H - 0.4, 0.1, 'frl');
    // balconies: slab + glass rail on some floors
    for (let k = 2; k < floors; k++) {
      if (!rng.chance(0.4)) continue;
      const bx = (W * (rng.int(0, mull - 1) + 0.5)) / mull;
      const y = GROUND + (k - 1) * FLOOR_H;
      const x0 = bx - 1.0, x1 = bx + 1.0, z1 = 1.3;
      b.box(m.limestone, x0, y, 0, x1, y + 0.18, z1, 'frlufd');
      b.rect(m.glass, [x0, y + 0.18, z1 - 0.03], [x1 - x0, 0, 0], [0, 1.0, 0], { ru: 1, rv: 1 });
      b.rect(m.glass, [x0 + 0.03, y + 0.18, 0], [0, 0, z1], [0, 1.0, 0], { ru: 1, rv: 1, hint: [1, 0, 0] });
      b.rect(m.glass, [x1 - 0.03, y + 0.18, 0], [0, 0, z1], [0, 1.0, 0], { ru: 1, rv: 1, hint: [-1, 0, 0] });
      b.bar(m.metal, [x0, y + 1.2, z1 - 0.03], [x1, y + 1.2, z1 - 0.03], 0.05);
      b.bar(m.metal, [x0 + 0.03, y + 1.2, z1 - 0.03], [x0 + 0.03, y + 1.2, 0], 0.05);
      b.bar(m.metal, [x1 - 0.03, y + 1.2, z1 - 0.03], [x1 - 0.03, y + 1.2, 0], 0.05);
    }
    if (lot.poi) {
      const sign = m.lib.sign(lot.poi.sign, '#222a30', '#e9e4d8');
      const sy0 = 2.9, sy1 = 3.8, f = 0.06;
      b.box(m.metal, 0.4, sy0, 0, W - 0.4, sy1, 0.3, 'rlud');
      b.rect(sign, [0.4 + f, sy0 + f, 0.305], [W - 0.8 - 2 * f, 0, 0], [0, sy1 - sy0 - 2 * f, 0], { ru: 1, rv: 1 });
      const uvr: [number, number, number, number] = [0.2, 0.6, 0.8, 0.85];
      b.rect(m.window, [0.4, sy1 - f, 0.31], [W - 0.8, 0, 0], [0, f, 0], { uvRect: uvr });
      b.rect(m.window, [0.4, sy0, 0.31], [W - 0.8, 0, 0], [0, f, 0], { uvRect: uvr });
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
    b.box(m.stoop, W * 0.2, H, -D * 0.5, W * 0.8, H + 0.35, -D * 0.5 + 0.6, 'frlu');
    if (rng.chance(0.7)) roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, brick, chimney: 0, skylight: 0.4, bulkhead: 0.8, dishes: 0.3, ph: 0 });
  } else {
    // front wall with recessed windows and a recessed lobby door under a stone canopy
    const bays = Math.max(2, Math.floor(W / 2.2));
    const xs = bayCentres(W, bays);
    const doorX = W / 2;
    const holes: Hole[] = [];
    const door: Hole = { x0: doorX - 0.6, x1: doorX + 0.6, y0: 0, y1: 2.4 };
    holes.push(door);
    revealFaces(b, brick, door, 0, 0.3, false);
    b.rect(m.metal, [door.x0, 0, -0.28], [1.2, 0, 0], [0, 2.4, 0], { ru: 0.4, rv: 0.8 });
    b.rect(m.window, [door.x0 + 0.15, 0.5, -0.26], [0.9, 0, 0], [0, 1.6, 0], { ru: 1, rv: 1, uvRect: [0.1, 0.55, 0.9, 0.9] });
    b.box(m.limestone, doorX - 1.2, 2.55, 0, doorX + 1.2, 2.75, 1.3, 'frlufd');
    b.box(m.limestone, doorX - 0.8, 0, 0, doorX - 0.6, 2.4, 0.1, 'fl');
    b.box(m.limestone, doorX + 0.6, 0, 0, doorX + 0.8, 2.4, 0.1, 'fr');
    windows(b, m, { xs: xs.filter((x) => Math.abs(x - doorX) > 0.9), y: 1.0, w: 1.1, h: 1.7, z: 0, holes, wall: brick, sill: true, lintel: 'flat', rng });
    const acSpots: { x: number; y: number }[] = [];
    const fe: number[] = [];
    for (let k = 1; k < floors; k++) {
      const fy = GROUND + (k - 1) * FLOOR_H;
      windows(b, m, { xs, y: fy + 0.9, w: 1.1, h: 1.9, z: 0, holes, wall: brick, sill: true, lintel: 'flat', noLedge: k >= 3, rng });
      for (const x of xs) acSpots.push({ x, y: fy + 0.9 });
      fe.push(fy + 0.85);
    }
    wallWithHoles(b, brick, 0, 0, W, H, 0, holes);
    b.box(m.limestone, 0, GROUND - 0.15, 0, W, GROUND + 0.02, 0.07, 'fud');
    cornice(b, m, 0, W, H, 0, 0.6, 'bracket');
    roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, frontMat: brick, sideMat: m.brickRed, coping: m.limestone, exposeL: cs === 'left', exposeR: cs === 'right' });
    roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, brick: m.brickRed, chimney: 0.1, skylight: 0.3, bulkhead: 0.8, dishes: 0.5 });
    if (rng.chance(0.5)) waterTank(b, m, W * 0.5, H, -D + 2.8);
    if (rng.chance(0.25) && xs.length >= 2) fireEscape(b, m, Math.max(0.2, xs[0] - 0.7), Math.min(W - 0.2, xs[1] + 0.7), 0, fe);
    else acUnits(b, m, rng, acSpots, 0);
    if (rng.chance(0.4)) drainPipe(b, m, rng.chance(0.5) ? 0.14 : W - 0.14, 0.2, H - 0.4, 0);
  }

  if (cs) {
    const nb = Math.max(2, Math.floor((D - 1) / 3));
    b.with(sideWallFrame(cs, W, D), () => {
      const holes: Hole[] = [];
      for (let k = 1; k < floors; k++) windows(b, m, { xs: bayCentres(D, nb), y: GROUND + (k - 1) * FLOOR_H + 0.9, w: 1.1, h: 1.9, z: 0, holes, wall: brick, sill: true, noLedge: k >= 3, rng });
      wallWithHoles(b, brick, 0, 0, D, H, 0, holes);
    });
  }

  b.with(rearWallFrame(W, D), () => {
    if (!condo && rng.chance(0.35)) {
      const ys: number[] = [];
      for (let k = 1; k < floors; k++) ys.push(GROUND + (k - 1) * FLOOR_H + 0.85);
      fireEscape(b, m, W * 0.25, W * 0.7, 0, ys);
    }
    if (rng.chance(0.5)) { airVent(b, m, W * 0.3, 1.2, 0); airVent(b, m, W * 0.7, 2.2, 0); }
  });

  return { body: [{ x0: 0, x1: W, z0: -D, z1: 0 }], stoops: [] };
}
