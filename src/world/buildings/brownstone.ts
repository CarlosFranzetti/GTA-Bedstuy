/**
 * Brownstone / brick rowhouse: rusticated raised basement with recessed windows and an areaway entry, stepped
 * stoop with cheek walls and iron railings, tall recessed parlour windows with stone hoods, string courses,
 * bracketed or dentil cornice with coping, roof clutter, rear fire escapes and drain pipes.
 */
import type * as THREE from 'three';
import {
  BASEMENT_H, FLOOR_H, acUnits, airVent, bayCentres, cornice, drainPipe, fireEscape, rearWallFrame, revealFaces,
  roofClutter, roofWithParapet, wallWithHoles, waterTank, windowAwning, windowBars, windows,
} from './facade';
import type { Hole, LotCtx, LotOutput, V3 } from './facade';

export interface BrownstoneOpts {
  style: 'brownstone' | 'rowhouse';
  /** build the stoop (scaffolded houses skip it) */
  stoop?: boolean;
  /** distance the facade sits behind the building line (front yard holding the stoop) */
  setback?: number;
  /** force the floor count (otherwise 3-4) */
  floors?: number;
  /** skip the fine detail (houses hidden behind scaffolding) */
  lite?: boolean;
}

export function buildBrownstone(c: LotCtx, opts: BrownstoneOpts): LotOutput & { H: number; S: number; floors: number } {
  const { b, m, rng, W, D } = c;
  const S = opts.setback ?? 2.8;
  const lite = !!opts.lite;
  const floors = opts.floors ?? (opts.style === 'rowhouse' ? (rng.chance(0.25) ? 4 : 3) : rng.int(3, 4));
  const H = BASEMENT_H + floors * FLOOR_H;

  // masonry variation per lot: brownstone / lighter brownstone / limestone, or red brick / lighter brick / painted
  let frontMat: THREE.Material;
  const r0 = rng.next();
  if (opts.style === 'brownstone') frontMat = r0 < 0.5 ? m.brownstone : r0 < 0.85 ? m.brownstoneAlt : m.limestone;
  else frontMat = r0 < 0.3 ? m.brickPainted : r0 < 0.65 ? m.brickRed : m.brickAlt;
  const trim = frontMat === m.limestone ? m.stoop : m.limestone;

  // shell: brick back/sides; the front wall is built below with its openings cut out
  b.box(m.brickRed, 0, 0, -D, W, H, -S, 'rlb');

  const bays = W >= 6 ? 3 : 2;
  const xs = bayCentres(W, bays);
  const doorBay = rng.chance(0.5) ? 0 : bays - 1;
  const entryBay = doorBay === 0 ? bays - 1 : 0;
  const doorX = xs[doorBay], entryX = xs[entryBay];
  const stoopW = 1.5;
  const stoops: LotOutput['stoops'] = [];
  const baseHoles: Hole[] = [];
  const upHoles: Hole[] = [];

  // ---- basement: rusticated dark stone band, recessed windows (barred or grilled), areaway entry beside the stoop
  const bsX = xs.filter((x) => x !== doorX && x !== entryX);
  windows(b, m, { xs: bsX, y: 0.3, w: 0.9, h: 0.65, z: -S, holes: baseHoles, wall: m.stoop, depth: 0.2, sill: true, trim, rng });
  const barred = rng.chance(0.55);
  for (const x of bsX) {
    if (barred) windowBars(b, m, x, 0.3, 0.9, 0.65, -S);
    else b.rect(m.chain, [x - 0.45, 0.3, -S + 0.05], [0.9, 0, 0], [0, 0.65, 0], { ru: 0.9 / 0.6, rv: 0.65 / 0.6 });
  }
  const entry: Hole = { x0: entryX - 0.45, x1: entryX + 0.45, y0: 0, y1: 1.02 };
  baseHoles.push(entry);
  revealFaces(b, m.stoop, entry, -S, 0.25, false);
  b.rect(m.metal, [entry.x0, 0, -S - 0.25], [0.9, 0, 0], [0, 1.02, 0], { ru: 0.4, rv: 0.4 });
  b.box(trim, entry.x0 - 0.1, entry.y1, -S, entry.x1 + 0.1, entry.y1 + 0.12, -S + 0.08, 'fd');
  if (rng.chance(0.4)) b.rect(m.rollGate, [entry.x0, 0, -S + 0.06], [0.9, 0, 0], [0, 0.85, 0], { ru: 0.9 / 1.5, rv: 0.85 / 1.5 });
  else b.rect(m.chain, [entry.x0, 0, -S + 0.06], [0.9, 0, 0], [0, 1.02, 0], { ru: 0.9 / 0.6, rv: 1.02 / 0.6 });
  wallWithHoles(b, m.stoop, 0, 0, W, BASEMENT_H, -S, baseHoles);

  // ---- parlour floor: tall recessed windows with stone hoods and pale frames
  const parlourY = BASEMENT_H;
  const parlourXs = xs.filter((_, i) => i !== doorBay);
  windows(b, m, { xs: parlourXs, y: parlourY + 0.45, w: 1.1, h: 2.5, z: -S, holes: upHoles, wall: frontMat, sill: true, lintel: 'hood', frame: !lite, trim, rng });

  // ---- upper floors
  const acSpots: { x: number; y: number }[] = [];
  const awningFloor = !lite && rng.chance(0.22) ? rng.int(1, floors - 1) : -1;
  for (let k = 1; k < floors; k++) {
    const fy = BASEMENT_H + k * FLOOR_H;
    const top = k === floors - 1;
    const wy = fy + 0.7, wh = top ? 1.9 : 2.0;
    windows(b, m, {
      xs, y: wy, w: 1.0, h: wh, z: -S, holes: upHoles, wall: frontMat, sill: true, lintel: 'flat',
      frame: !lite && top, noLedge: k >= 2, trim, rng,
    });
    if (k === awningFloor) {
      windowAwning(b, m.darkAwning, xs[rng.int(0, bays - 1)], wy + wh + 0.12, 1.0, -S);
    } else {
      for (const x of xs) acSpots.push({ x, y: wy });
    }
  }

  // ---- entrance: recessed door, pilasters, hood
  const door: Hole = { x0: doorX - 0.55, x1: doorX + 0.55, y0: parlourY, y1: parlourY + 2.3 };
  upHoles.push(door);
  revealFaces(b, frontMat, door, -S, 0.3, false);
  b.rect(m.metal, [door.x0, door.y0, -S - 0.28], [1.1, 0, 0], [0, 2.3, 0], { ru: 0.4, rv: 0.8 });
  b.rect(m.window, [door.x0 + 0.2, door.y0 + 1.25, -S - 0.26], [0.7, 0, 0], [0, 0.85, 0], { ru: 1, rv: 1, uvRect: [0.1, 0.55, 0.9, 0.9] });
  b.box(trim, doorX - 0.75, parlourY, -S, doorX - 0.55, parlourY + 2.3, -S + 0.12, 'fl');
  b.box(trim, doorX + 0.55, parlourY, -S, doorX + 0.75, parlourY + 2.3, -S + 0.12, 'fr');
  b.box(trim, doorX - 0.85, parlourY + 2.3, -S, doorX + 0.85, parlourY + 2.62, -S + 0.28, 'frlud');
  wallWithHoles(b, frontMat, 0, BASEMENT_H, W, H, -S, upHoles);

  // ---- string courses, water table and quoins
  if (!lite) {
    b.box(trim, 0, BASEMENT_H - 0.1, -S, Math.max(0.01, doorX - 0.75), BASEMENT_H + 0.05, -S + 0.07, 'fu');
    b.box(trim, doorX + 0.75, BASEMENT_H - 0.1, -S, W, BASEMENT_H + 0.05, -S + 0.07, 'fu');
    if (opts.style === 'brownstone' || rng.chance(0.5)) {
      for (let k = 1; k < floors; k++) {
        const fy = BASEMENT_H + k * FLOOR_H;
        b.box(trim, 0, fy - 0.12, -S, W, fy + 0.04, -S + 0.07, 'fud');
      }
    }
    if (rng.chance(opts.style === 'rowhouse' ? 0.6 : 0.25)) {
      b.box(trim, 0, BASEMENT_H, -S, 0.34, H - 0.55, -S + 0.05, 'fr');
      b.box(trim, W - 0.34, BASEMENT_H, -S, W, H - 0.55, -S + 0.05, 'fl');
    }
  }

  // ---- stoop: stone treads, sloped cheek walls, iron railings
  if (opts.stoop !== false) {
    const x0 = doorX - stoopW / 2, x1 = doorX + stoopW / 2, cw = 0.15;
    const xt0 = x0 + cw, xt1 = x1 - cw;
    const landing = 0.9, steps = 5, run = 0.32, rise = BASEMENT_H / (steps + 1);
    const zLand = -S + landing, zEnd = zLand + run * steps;
    b.box(m.stoop, xt0, 0, -S, xt1, BASEMENT_H, zLand, 'fu');
    for (let i = 0; i < steps; i++) {
      const zf = zLand + run * (steps - i);
      b.box(m.stoop, xt0, 0, zf - run, xt1, rise * (i + 1), zf, 'fu');
    }
    const yF = rise + 0.4, yL = BASEMENT_H + 0.4;
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
      for (const t of [0.25, 0.5, 0.75]) {
        const pz = zEnd + (zLand - zEnd) * t, py = yF + (yL - yF) * t;
        b.bar(m.metal, [rx, py, pz], [rx, py + rh - 0.04, pz], 0.03);
      }
      for (const dz of [0.45]) b.bar(m.metal, [rx, yL, zLand - dz], [rx, yL + rh - 0.04, zLand - dz], 0.03);
    }
    stoops.push({ x0, x1, z0: -S, z1: zEnd });
  }

  // ---- yard dressing: trash cans and a planter beside the entry, cellar doors set into the ground
  if (!lite) {
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
  cornice(b, m, 0, W, H, -S, 0.6, lite ? 'plain' : rng.chance(0.55) ? 'dentil' : 'bracket');
  roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: -S, y: H, frontMat, sideMat: m.brickRed, coping: m.limestone });
  if (!lite) roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: -S, y: H, brick: m.brickRed, chimney: 0.45, skylight: 0.25, bulkhead: floors === 4 ? 0.3 : 0.12, dishes: 0.3 });
  if (floors === 4 && rng.chance(0.6)) waterTank(b, m, W * 0.5, H, -D + 2.4);
  if (floors >= 3 && rng.chance(0.25)) {
    const ys: number[] = [];
    for (let k = 1; k < floors; k++) ys.push(BASEMENT_H + k * FLOOR_H + 0.62);
    const bx = [xs[0] - 0.7, xs[1] + 0.7];
    fireEscape(b, m, Math.max(0.15, bx[0]), Math.min(W - 0.15, bx[1]), -S, ys);
  } else {
    acUnits(b, m, rng, acSpots, -S);
  }

  // ---- drain pipe on a party-wall edge; rear fire escape and vents
  if (!lite) {
    if (rng.chance(0.4)) drainPipe(b, m, rng.chance(0.5) ? 0.14 : W - 0.14, 0.2, H - 0.4, -S);
    b.with(rearWallFrame(W, D), () => {
      if (rng.chance(0.15)) {
        const ys: number[] = [];
        for (let k = 1; k < floors; k++) ys.push(BASEMENT_H + k * FLOOR_H + 0.62);
        fireEscape(b, m, W * 0.25, W * 0.75, 0, ys);
      }
      if (rng.chance(0.4)) { airVent(b, m, W * 0.3, 1.0, 0); airVent(b, m, W * 0.7, 4.4, 0); }
      if (rng.chance(0.4)) drainPipe(b, m, 0.12, 0.2, H - 0.4, 0);
    });
  }

  return { body: [{ x0: 0, x1: W, z0: -D, z1: -S }], stoops, H, S, floors };
}
