/**
 * Brick walk-up / apartment block (4-6 storeys: 3.3 m ground floor, 2.9 m above) with recessed double-hung windows,
 * a canopied lobby door, bracketed cornice with dentils and front fire escapes on the 4-5 storey fronts. The material
 * family comes from the lot data (red / tan / painted brick or limestone). The condo POI gets a glass curtain wall
 * with limestone floor slabs, glass-railed balconies and a roof deck. Party walls are plain brick; only an exposed
 * corner side wall carries windows, and the rear is a bare shell.
 */
import {
  FLOOR_H, PARLOUR_H, bayCentres, buildUpperFloors, familyMats, pickWindow, revealFaces,
  roofClutter, sideWallFrame, storeyLevels, wallWithHoles, windows,
} from './facade';
import { lotLook, partyWallDetail } from './partyWall';
import type { Hole, LotCtx, LotOutput } from './facade';

export function buildApartment(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot, spec } = c;
  const condo = lot.poi?.archetype === 'condo';
  const floors = condo ? 7 : Math.max(3, Math.min(7, Math.round(spec?.floors ?? rng.int(4, 6))));
  const GROUND = condo ? 3.6 : PARLOUR_H;
  const levels = storeyLevels(0, floors);
  const H = condo ? GROUND + (floors - 1) * FLOOR_H : levels.H;
  const r0 = rng.next();
  const brick = spec ? familyMats(m, spec.family, r0 < 0.5 ? 0 : 1).front : r0 < 0.3 ? m.brickPainted : r0 < 0.65 ? m.brickRed : m.brickAlt;
  const cs = c.cornerSide;

  // plain red-brick party walls and back; an exposed corner side wall is built separately below in the facade brick
  const look = lotLook(m, lot);
  b.box(look.party, 0, 0, -D, W, condo ? H : GROUND, 0, cs === 'left' ? 'rb' : cs === 'right' ? 'lb' : 'rlb');
  if (condo) partyWallDetail(b, m, look, { W, D, y0: GROUND, topY: H, zFront: 0, cornerSide: cs });

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
    b.rect(look.roof, [0, H + 0.01, 0], [W, 0, 0], [0, 0, -D]);
    b.bar(m.metal, [0.1, H + 1.1, -0.1], [W - 0.1, H + 1.1, -0.1], 0.05);
    b.bar(m.metal, [0.1, H + 1.1, -D + 0.1], [W - 0.1, H + 1.1, -D + 0.1], 0.05);
    b.bar(m.metal, [0.1, H + 1.1, -0.1], [0.1, H + 1.1, -D + 0.1], 0.05);
    b.bar(m.metal, [W - 0.1, H + 1.1, -0.1], [W - 0.1, H + 1.1, -D + 0.1], 0.05);
    for (let i = 0; i <= 6; i++) {
      const x = 0.1 + ((W - 0.2) * i) / 6;
      b.bar(m.metal, [x, H, -0.1], [x, H + 1.1, -0.1], 0.04);
    }
    b.box(m.stoop, W * 0.2, H, -D * 0.5, W * 0.8, H + 0.35, -D * 0.5 + 0.6, 'frlu');
    if (rng.chance(0.7)) roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, brick: look.party, chimney: 0, skylight: 0.4, bulkhead: 0.8, dishes: 0.3, ph: 0 });
  } else {
    // ground floor: recessed lobby door under a stone canopy, recessed windows; everything above is shared upper-floor code
    const bays = Math.max(2, spec?.bays ?? Math.floor(W / 2.2));
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
    const ww = Math.min(1.1, W / bays - 0.6);
    windows(b, m, { xs: xs.filter((x) => Math.abs(x - doorX) > 0.9), y: 0.9, w: ww, h: 1.7, z: 0, holes, wall: brick, sill: true, lintel: 'flat', frame: true, rng });
    wallWithHoles(b, brick, 0, 0, W, GROUND, 0, holes);
    if (cs) {
      b.with(sideWallFrame(cs, W, D), () => wallWithHoles(b, brick, 0, 0, D, GROUND, 0, []));
    }
    // fire escapes are the signature of the 4-5 storey fronts
    const fe = spec ? (floors >= 4 && floors <= 5 ? rng.chance(0.9) : floors >= 6 ? rng.chance(0.5) : rng.chance(0.1)) : floors <= 5 ? rng.chance(0.75) : rng.chance(0.3);
    // WBURG: the South Williamsburg row (r-4) is walk-up apartment houses with a small balcony on most upper floors
    const balconies = lot.blockId.startsWith('r-4') && floors >= 3 && W >= 7;
    buildUpperFloors(c, { y0: GROUND, floors: floors - 1, wall: brick, bays, fireEscape: balconies ? false : fe, cornice: spec ? spec.cornice : 'bracket' });
    if (balconies) {
      for (let k = 1; k < floors; k++) {
        if (rng.chance(0.25)) continue;
        const y = GROUND + (k - 1) * 2.9 + 0.55;
        const bx = xs[Math.min(xs.length - 1, Math.max(0, Math.floor(rng.next() * xs.length)))];
        const x0 = Math.max(0.2, bx - 0.9), x1 = Math.min(W - 0.2, bx + 0.9), z1 = 1.1;
        b.box(m.limestone, x0, y, 0, x1, y + 0.14, z1, 'frlufd');
        b.bar(m.metal, [x0, y + 1.05, z1 - 0.03], [x1, y + 1.05, z1 - 0.03], 0.04);
        b.bar(m.metal, [x0 + 0.03, y + 1.05, z1 - 0.03], [x0 + 0.03, y + 1.05, 0], 0.04);
        b.bar(m.metal, [x1 - 0.03, y + 1.05, z1 - 0.03], [x1 - 0.03, y + 1.05, 0], 0.04);
        for (let i = 0; i <= 4; i++) { const x = x0 + ((x1 - x0) * i) / 4; b.bar(m.metal, [x, y + 0.14, z1 - 0.03], [x, y + 1.05, z1 - 0.03], 0.03); }
      }
    }
  }

  if (cs && condo) {
    const nb = Math.max(2, Math.floor((D - 1) / 3));
    b.with(sideWallFrame(cs, W, D), () => {
      const holes: Hole[] = [];
      for (let k = 1; k < floors; k++) windows(b, m, { xs: bayCentres(D, nb), y: GROUND + (k - 1) * FLOOR_H + 0.9, w: 1.1, h: 1.9, z: 0, holes, wall: brick, sill: true, noLedge: k >= 3, rng });
      wallWithHoles(b, brick, 0, 0, D, H, 0, holes);
    });
  }

  return { body: [{ x0: 0, x1: W, z0: -D, z1: 0 }], stoops: [] };
}
