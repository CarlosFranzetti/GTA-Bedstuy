/**
 * Brownstone / brick rowhouse. Storey model: raised basement (stoop rise) -> 3.3 m parlour floor -> 2.9 m upper floors.
 * Rusticated basement with recessed windows and an areaway entry, stepped stoop with cheek walls and iron railings,
 * tall recessed double-hung parlour windows (stone hoods, or round-headed on some houses), string courses, bracketed /
 * dentil cornice with coping, roof clutter and drain pipes. Side walls are plain party-wall brick and the rear is
 * a bare brick shell (never seen from the street).
 *
 * Driven by `ctx.spec` (floors, family, stoop, cornice, bays, arched); without a spec every choice falls back to
 * the rng, exactly as before the data-driven pass.
 */
import {
  BASEMENT_H, PARLOUR_H, acUnits, bayCentres, bayCount, cornice, corniceOfKind, drainPipe, familyMats, fireEscape,
  revealFaces, roofClutter, roofWithParapet, storeyLevels, wallWithHoles, waterTank, windowAwning, windowBars, windows,
} from './facade';
import type { Hole, LotCtx, LotOutput, MaterialFamily, Storeys, V3 } from './facade';

export interface BrownstoneOpts {
  style: 'brownstone' | 'rowhouse';
  /** build the stoop (scaffolded houses skip it) */
  stoop?: boolean;
  /** distance the facade sits behind the building line (front yard holding the stoop) */
  setback?: number;
  /** force the floor count (otherwise spec.floors, else 3-4) */
  floors?: number;
  /** skip the fine detail (houses hidden behind scaffolding) */
  lite?: boolean;
}

export interface RowResult extends LotOutput { H: number; S: number; floors: number; levels: Storeys; family: MaterialFamily }

/** Pick the masonry family when there is no data: same odds as the original generator. */
function fallbackFamily(style: BrownstoneOpts['style'], r0: number): { family: MaterialFamily; variant: number } {
  if (style === 'brownstone') return r0 < 0.5 ? { family: 'brownstone', variant: 0 } : r0 < 0.85 ? { family: 'brownstone', variant: 1 } : { family: 'limestone', variant: 0 };
  return r0 < 0.3 ? { family: 'paintedBrick', variant: 0 } : r0 < 0.65 ? { family: 'brick', variant: 0 } : { family: 'tanBrick', variant: 0 };
}

export function buildBrownstone(c: LotCtx, opts: BrownstoneOpts): RowResult {
  const { b, m, rng, W, D, spec } = c;
  const lite = !!opts.lite;
  const r0 = rng.next();
  const fam = spec ? { family: spec.family, variant: r0 < 0.5 ? 0 : 1 } : fallbackFamily(opts.style, r0);
  const { front: frontMat, trim } = familyMats(m, fam.family, fam.variant);

  // ---- storeys
  const bh = spec ? (spec.stoop.present ? Math.max(0.6, Math.min(2.2, spec.stoop.heightM)) : 0) : BASEMENT_H;
  const floors = Math.max(2, Math.min(6, Math.round(opts.floors ?? spec?.floors ?? (opts.style === 'rowhouse' ? (rng.chance(0.25) ? 4 : 3) : rng.int(3, 4)))));
  const levels = storeyLevels(bh, floors);
  const { H, floorY } = levels;
  const S = opts.setback ?? (bh > 0 ? 3.0 : 0.35);
  const wantStoop = opts.stoop !== false && bh > 0;

  // shell: brick back/sides (plain party walls); the front wall is built below with its openings cut out
  b.box(m.brickRed, 0, 0, -D, W, H, -S, 'rlb');

  const bays = bayCount(W, spec);
  const xs = bayCentres(W, bays);
  const doorBay = rng.chance(0.5) ? 0 : bays - 1;
  const entryBay = doorBay === 0 ? bays - 1 : 0;
  const doorX = xs[doorBay], entryX = xs[entryBay];
  const stoopW = 1.5;
  const stoops: LotOutput['stoops'] = [];
  const baseHoles: Hole[] = [];
  const upHoles: Hole[] = [];
  const parlourY = floorY[0];

  // ---- raised basement: rusticated dark stone band, recessed windows (barred or grilled), areaway entry beside the stoop
  if (bh > 0) {
    const bwH = Math.min(0.8, bh - 0.55);
    const bsX = xs.filter((x) => x !== doorX && x !== entryX);
    if (bwH > 0.3) {
      windows(b, m, { xs: bsX, y: 0.3, w: 0.9, h: bwH, z: -S, holes: baseHoles, wall: m.stoop, depth: 0.2, sill: true, trim, rng });
      const barred = rng.chance(0.55);
      for (const x of bsX) {
        if (barred) windowBars(b, m, x, 0.3, 0.9, bwH, -S);
        else b.rect(m.chain, [x - 0.45, 0.3, -S + 0.05], [0.9, 0, 0], [0, bwH, 0], { ru: 0.9 / 0.6, rv: bwH / 0.6 });
      }
    }
    const eh = Math.max(0.7, bh - 0.3);
    const entry: Hole = { x0: entryX - 0.45, x1: entryX + 0.45, y0: 0, y1: eh };
    baseHoles.push(entry);
    revealFaces(b, m.stoop, entry, -S, 0.25, false);
    b.rect(m.metal, [entry.x0, 0, -S - 0.25], [0.9, 0, 0], [0, eh, 0], { ru: 0.4, rv: 0.4 });
    b.box(trim, entry.x0 - 0.1, entry.y1, -S, entry.x1 + 0.1, entry.y1 + 0.12, -S + 0.08, 'fd');
    if (rng.chance(0.4)) b.rect(m.rollGate, [entry.x0, 0, -S + 0.06], [0.9, 0, 0], [0, eh - 0.17, 0], { ru: 0.9 / 1.5, rv: 0.85 / 1.5 });
    else b.rect(m.chain, [entry.x0, 0, -S + 0.06], [0.9, 0, 0], [0, eh, 0], { ru: 0.9 / 0.6, rv: eh / 0.6 });
    wallWithHoles(b, m.stoop, 0, 0, W, bh, -S, baseHoles);
  }

  // ---- parlour floor: tall recessed double-hung windows, stone hoods and pale frames; round-headed on some houses
  const arched = spec?.arched ?? (fam.family === 'brownstone' && rng.chance(0.18));
  const parlourXs = xs.filter((_, i) => i !== doorBay);
  const pw = Math.min(1.1, W / bays - 0.7);
  const pH = arched ? PARLOUR_H - 0.5 - pw / 2 - 0.55 : 2.35;
  windows(b, m, {
    xs: parlourXs, y: parlourY + 0.5, w: pw, h: pH, z: -S, holes: upHoles, wall: frontMat, sill: true,
    lintel: 'hood', frame: !lite, arch: arched, trim, rng,
  });

  // ---- upper floors: double-hung windows with flat stone lintels and sills
  const acSpots: { x: number; y: number }[] = [];
  const awningFloor = !lite && rng.chance(0.22) ? rng.int(1, floors - 1) : -1;
  const uw = Math.min(1.0, W / bays - 0.7);
  for (let k = 1; k < floors; k++) {
    const top = k === floors - 1;
    const wy = floorY[k] + 0.55, wh = top ? 1.65 : 1.8;
    windows(b, m, {
      xs, y: wy, w: uw, h: wh, z: -S, holes: upHoles, wall: frontMat, sill: true,
      lintel: k === 1 && fam.family === 'brownstone' ? 'hood' : 'flat',
      frame: !lite && top, noLedge: k >= 2, trim, rng,
    });
    if (k === awningFloor) {
      windowAwning(b, m.darkAwning, xs[rng.int(0, bays - 1)], wy + wh + 0.12, uw, -S);
    } else {
      for (const x of xs) acSpots.push({ x, y: wy });
    }
  }

  // ---- entrance: recessed door, pilasters, hood
  const dh = 2.35;
  const door: Hole = { x0: doorX - 0.55, x1: doorX + 0.55, y0: parlourY, y1: parlourY + dh };
  upHoles.push(door);
  revealFaces(b, frontMat, door, -S, 0.3, false);
  b.rect(m.metal, [door.x0, door.y0, -S - 0.28], [1.1, 0, 0], [0, dh, 0], { ru: 0.4, rv: 0.8 });
  b.rect(m.window, [door.x0 + 0.2, door.y0 + 1.25, -S - 0.26], [0.7, 0, 0], [0, 0.85, 0], { ru: 1, rv: 1, uvRect: [0.1, 0.55, 0.9, 0.9] });
  b.box(trim, doorX - 0.75, parlourY, -S, doorX - 0.55, parlourY + dh, -S + 0.12, 'fl');
  b.box(trim, doorX + 0.55, parlourY, -S, doorX + 0.75, parlourY + dh, -S + 0.12, 'fr');
  b.box(trim, doorX - 0.85, parlourY + dh, -S, doorX + 0.85, parlourY + dh + 0.32, -S + 0.28, 'frlud');
  wallWithHoles(b, frontMat, 0, parlourY, W, H, -S, upHoles);
  if (bh === 0) b.box(m.stoop, doorX - 0.75, 0, -S, doorX + 0.75, 0.17, -S + 0.4, 'fru'); // flush row: one stone step

  // ---- string courses, water table and quoins
  if (!lite) {
    if (bh > 0) {
      b.box(trim, 0, bh - 0.1, -S, Math.max(0.01, doorX - 0.75), bh + 0.05, -S + 0.07, 'fu');
      b.box(trim, doorX + 0.75, bh - 0.1, -S, W, bh + 0.05, -S + 0.07, 'fu');
    }
    if (fam.family === 'brownstone' || fam.family === 'limestone' || rng.chance(0.5)) {
      for (let k = 1; k < floors; k++) b.box(trim, 0, floorY[k] - 0.12, -S, W, floorY[k] + 0.04, -S + 0.07, 'fud');
    }
    if (rng.chance(opts.style === 'rowhouse' ? 0.6 : 0.25)) {
      b.box(trim, 0, parlourY, -S, 0.34, H - 0.55, -S + 0.05, 'fr');
      b.box(trim, W - 0.34, parlourY, -S, W, H - 0.55, -S + 0.05, 'fl');
    }
  }

  // ---- stoop: stone treads, sloped cheek walls, iron railings
  if (wantStoop) {
    const x0 = doorX - stoopW / 2, x1 = doorX + stoopW / 2, cw = 0.15;
    const xt0 = x0 + cw, xt1 = x1 - cw;
    const landing = 0.9;
    const steps = Math.max(3, Math.min(7, Math.round(bh / 0.21) - 1));
    const run = Math.min(0.32, (S - landing - 0.1) / steps), rise = bh / (steps + 1);
    const zLand = -S + landing, zEnd = zLand + run * steps;
    b.box(m.stoop, xt0, 0, -S, xt1, bh, zLand, 'fu');
    for (let i = 0; i < steps; i++) {
      const zf = zLand + run * (steps - i);
      b.box(m.stoop, xt0, 0, zf - run, xt1, rise * (i + 1), zf, 'fu');
    }
    const yF = rise + 0.4, yL = bh + 0.4;
    for (const s of [-1, 1]) {
      const xo = s < 0 ? x0 : x1, xi = s < 0 ? xt0 : xt1;
      const xa = Math.min(xo, xi);
      const prof: [number, number][] = [[zEnd, 0], [zEnd, yF], [zLand, yL], [-S, yL], [-S, 0]];
      b.polyFacing(m.stoop, prof.map(([z, y]): V3 => [xo, y, z]), [s, 0, 0]);
      b.polyFacing(m.stoop, prof.map(([z, y]): V3 => [xi, y, z]), [-s, 0, 0]);
      b.rect(m.stoop, [xa, yF, zEnd], [cw, 0, 0], [0, yL - yF, zLand - zEnd], { hint: [0, 1, 0] });
      b.rect(m.stoop, [xa, yL, zLand], [cw, 0, 0], [0, 0, -landing], { hint: [0, 1, 0] });
      b.rect(m.stoop, [xa, 0, zEnd], [cw, 0, 0], [0, yF, 0], { hint: [0, 0, 1] });
      // railing on the cheek: newel posts, sloped + landing handrail, mid rail, pickets
      const rx = (xo + xi) / 2, rh = 0.95;
      b.bar(m.metal, [rx, yF, zEnd - 0.05], [rx, yF + rh, zEnd - 0.05], 0.06);
      b.bar(m.metal, [rx, yL, -S + 0.08], [rx, yL + rh, -S + 0.08], 0.06);
      for (const [off, t] of [[rh, 0.05], [rh * 0.45, 0.035]] as const) {
        b.bar(m.metal, [rx, yF + off, zEnd - 0.05], [rx, yL + off, zLand], t);
        b.bar(m.metal, [rx, yL + off, zLand], [rx, yL + off, -S + 0.08], t);
      }
      const np = Math.max(3, Math.round((zLand - zEnd) / 0.28));
      for (let i = 1; i <= np; i++) {
        const t = i / (np + 1);
        const pz = zEnd + (zLand - zEnd) * t, py = yF + (yL - yF) * t;
        b.bar(m.metal, [rx, py, pz], [rx, py + rh - 0.04, pz], 0.03);
      }
      for (const dz of [0.3, 0.6]) b.bar(m.metal, [rx, yL, zLand - dz], [rx, yL + rh - 0.04, zLand - dz], 0.03);
    }
    stoops.push({ x0, x1, z0: -S, z1: zEnd });
  }

  // ---- yard dressing: trash cans and a planter beside the entry, cellar doors set into the ground
  if (!lite && bh > 0) {
    const inward = entryBay === 0 ? 1 : -1;
    const cans = rng.int(1, 2);
    for (let i = 0; i < cans; i++) {
      const cx = entryX + inward * (0.85 + i * 0.5);
      b.box(m.metal, cx - 0.22, 0, -S + 0.12, cx + 0.22, 0.75, -S + 0.56, 'frlu');
    }
    if (rng.chance(0.5)) {
      const px = doorX + (doorBay === 0 ? 1 : -1) * 1.35;
      if (px > 0.6 && px < W - 0.6) {
        b.box(m.stoop, px - 0.4, 0, -S + 0.1, px + 0.4, 0.42, -S + 0.5, 'frlu');
        b.rect(m.roof, [px - 0.34, 0.43, -S + 0.46], [0.68, 0, 0], [0, 0, -0.32], { ru: 0.2, rv: 0.1 });
      }
    }
    if (rng.chance(0.22)) {
      for (const dx of [-0.46, 0.46]) b.box(m.metal, entryX + dx - 0.42, 0, -S + 0.9, entryX + dx + 0.42, 0.07, -S + 1.9, 'fu');
    }
  }

  // ---- cornice, parapet, roof
  const kind = lite ? 'plain' : spec ? spec.cornice : rng.chance(0.55) ? 'dentil' : 'bracket';
  corniceOfKind(b, m, 0, W, H, -S, kind, 0.6);
  roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: -S, y: H, frontMat, sideMat: m.brickRed, coping: m.limestone });
  if (!lite) roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: -S, y: H, brick: m.brickRed, chimney: 0.45, skylight: 0.25, bulkhead: floors >= 4 ? 0.3 : 0.12, dishes: 0.3 });
  if (floors >= 4 && rng.chance(0.6)) waterTank(b, m, W * 0.5, H, -D + 2.4);
  const feChance = spec ? (floors >= 4 && bays >= 3 ? 0.3 : 0.08) : 0.25;
  if (floors >= 3 && bays >= 2 && rng.chance(feChance)) {
    const ys = floorY.slice(1).map((y) => y + 0.55);
    const bx = [xs[0] - 0.7, xs[1] + 0.7];
    fireEscape(b, m, Math.max(0.15, bx[0]), Math.min(W - 0.15, bx[1]), -S, ys);
  } else {
    acUnits(b, m, rng, acSpots, -S);
  }
  if (!lite && rng.chance(0.4)) drainPipe(b, m, rng.chance(0.5) ? 0.14 : W - 0.14, 0.2, H - 0.4, -S);

  return { body: [{ x0: 0, x1: W, z0: -D, z1: -S }], stoops, H, S, floors, levels, family: fam.family };
}

