/**
 * Mixed-use: storefront bay with a set-back entry door, roll-gate housing, optional security grille, sloped
 * awning with a scalloped valance, lit sign box, recessed brick flats above (stone sills, AC units, awnings),
 * cellar doors in the sidewalk, bracketed cornice, roof clutter and rear fire escapes.
 */
import {
  FLOOR_H, acUnits, airVent, bayCentres, cornice, drainPipe, fireEscape, rearWallFrame, roofClutter,
  roofWithParapet, sideWallFrame, wallWithHoles, waterTank, windowAwning, windows,
} from './facade';
import type { Hole, LotBatch, LotCtx, LotOutput } from './facade';
import type * as THREE from 'three';

const GROUND_H = 4.0;

/** Sloped awning with a valance carrying the sign text and a zigzag (scalloped) lower edge. */
function awningWithScallops(b: LotBatch, mat: THREE.Material, x0: number, x1: number, yAtt: number, out: number): void {
  const aw = x1 - x0, drop = 0.4, val = 0.28;
  const yv = yAtt - drop - val;
  b.rect(mat, [x0, yAtt, 0], [aw, 0, 0], [0, -drop, out], { hint: [0, 1, 0.3], uvRect: [0, 0.28, 1, 1] });
  b.rect(mat, [x0, yAtt - 0.5, 0], [aw, 0, 0], [0, -0.18, out], { hint: [0, -1, 0], uvRect: [0, 0.5, 1, 0.6] });
  b.rect(mat, [x0, yAtt - drop, out], [aw, 0, 0], [0, -val, 0], { hint: [0, 0, 1], uvRect: [0, 0.04, 1, 0.27] });
  for (const [x, s] of [[x0, -1], [x1, 1]] as const) {
    b.polyFacing(mat, [[x, yAtt, 0], [x, yAtt - drop, out], [x, yv, out], [x, yAtt - 0.5, 0]], [s, 0, 0]);
  }
  const n = Math.max(4, Math.round(aw / 0.34));
  for (let i = 0; i < n; i++) {
    const xa = x0 + (aw * i) / n, xb = x0 + (aw * (i + 1)) / n, xm = (xa + xb) / 2;
    b.tri(mat, [xa, yv, out], [xm, yv - 0.13, out], [xb, yv, out], [[i / n, 0.04], [(i + 0.5) / n, 0.01], [(i + 1) / n, 0.04]]);
  }
}

export function buildMixedUse(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot } = c;
  const poi = lot.poi;
  const nUp = rng.int(2, 3);
  const H = GROUND_H + nUp * FLOOR_H;
  const r0 = rng.next();
  const brick = r0 < 0.3 ? m.brickPainted : r0 < 0.65 ? m.brickRed : m.brickAlt;
  const trim = m.limestone;
  const cs = c.cornerSide;

  // shell: back and the party-wall sides (an exposed corner side is built below with its own windows)
  b.box(brick, 0, 0, -D, W, H, 0, cs === 'left' ? 'rb' : cs === 'right' ? 'lb' : 'rlb');

  // ---- storefront: piers, bulkhead, glass either side of a set-back entry, gate housing, optional grille
  const topOfShop = 3.0;
  const pier = 0.45;
  const inner = W - 2 * pier;
  const aw = 1.3, backBy = 0.6;
  const ax0 = rng.chance(0.5) ? pier + 0.05 : W - pier - aw - 0.05;
  const ax1 = ax0 + aw;
  b.rect(brick, [0, 0, 0], [pier, 0, 0], [0, topOfShop, 0], { u0: 0, v0: 0 });
  b.rect(brick, [W - pier, 0, 0], [pier, 0, 0], [0, topOfShop, 0], { u0: (W - pier) / 3, v0: 0 });
  for (const [xa, xb] of [[pier, ax0], [ax1, W - pier]] as const) {
    if (xb - xa < 0.2) continue;
    b.rect(m.metal, [xa, 0, 0.01], [xb - xa, 0, 0], [0, 0.6, 0], { ru: (xb - xa) / 3, rv: 0.2 });
    b.rect(m.glass, [xa, 0.6, 0.01], [xb - xa, 0, 0], [0, topOfShop - 0.6, 0], { ru: Math.max(1, Math.round((xb - xa) / 1.6)), rv: 1 });
  }
  // recessed entry alcove: side walls, ceiling, floor, transom and door at z = -0.6
  b.rect(m.metal, [ax0, 0, -backBy], [0, 0, backBy], [0, topOfShop, 0], { hint: [1, 0, 0], ru: 0.2, rv: 1 });
  b.rect(m.metal, [ax1, 0, -backBy], [0, 0, backBy], [0, topOfShop, 0], { hint: [-1, 0, 0], ru: 0.2, rv: 1 });
  b.rect(m.metal, [ax0, topOfShop, -backBy], [aw, 0, 0], [0, 0, backBy], { hint: [0, -1, 0], ru: 0.4, rv: 0.2 });
  b.rect(m.stoop, [ax0, 0.02, -backBy], [aw, 0, 0], [0, 0, backBy], { hint: [0, 1, 0] });
  b.rect(m.glass, [ax0, 2.3, -backBy + 0.01], [aw, 0, 0], [0, topOfShop - 2.3, 0], { ru: 1, rv: 0.4 });
  b.rect(m.metal, [ax0 + 0.15, 0, -backBy + 0.02], [aw - 0.3, 0, 0], [0, 2.3, 0], { ru: 0.4, rv: 0.8 });
  b.rect(m.glass, [ax0 + 0.25, 0.9, -backBy + 0.03], [aw - 0.5, 0, 0], [0, 1.2, 0], { ru: 1, rv: 1 });
  // roll-gate housing over the whole bay and a partly pulled gate
  b.box(m.metal, pier, topOfShop - 0.4, 0, W - pier, topOfShop, 0.28, 'frld');
  const gateH = rng.range(0.25, 0.5) * (topOfShop - 0.4 - 0.6);
  b.rect(m.rollGate, [pier, topOfShop - 0.4 - gateH, 0.12], [inner, 0, 0], [0, gateH, 0]);
  // security grille on some shops
  if (rng.chance(0.3)) {
    b.rect(m.chain, [pier, 0.6, 0.07], [inner, 0, 0], [0, topOfShop - 1.0, 0], { ru: inner / 0.6, rv: (topOfShop - 1.0) / 0.6 });
  }

  // ---- awning with scalloped valance and a lit sign box above it
  const awning = poi ? m.lib.awning(poi.awningColor, poi.sign) : rng.pick(m.plainAwnings);
  const yAtt = topOfShop + 0.75;
  awningWithScallops(b, awning, 0.15, W - 0.15, yAtt, 1.5);
  const sy0 = yAtt + 0.15, sy1 = sy0 + 0.8;
  if (poi) {
    const sign = m.lib.sign(poi.sign, '#161616', '#f5f0e0');
    const sx0 = 0.3, sx1 = W - 0.3, sz = 0.3, f = 0.07;
    b.box(m.metal, sx0, sy0, 0, sx1, sy1, sz, 'rlud');
    b.rect(sign, [sx0 + f, sy0 + f, sz + 0.005], [sx1 - sx0 - 2 * f, 0, 0], [0, sy1 - sy0 - 2 * f, 0], { ru: 1, rv: 1 });
    // thin glowing frame (window material: lit panes at night)
    const glow = m.window, fz = sz + 0.01, uvr: [number, number, number, number] = [0.2, 0.6, 0.8, 0.85];
    b.rect(glow, [sx0, sy1 - f, fz], [sx1 - sx0, 0, 0], [0, f, 0], { uvRect: uvr });
    b.rect(glow, [sx0, sy0, fz], [sx1 - sx0, 0, 0], [0, f, 0], { uvRect: uvr });
    b.rect(glow, [sx0, sy0 + f, fz], [f, 0, 0], [0, sy1 - sy0 - 2 * f, 0], { uvRect: uvr });
    b.rect(glow, [sx1 - f, sy0 + f, fz], [f, 0, 0], [0, sy1 - sy0 - 2 * f, 0], { uvRect: uvr });
  } else {
    b.box(m.metal, 0.3, sy0, 0, W - 0.3, sy1 - 0.1, 0.15, 'frud');
  }

  // ---- upper floors: recessed windows, sills, flat lintels
  const bays = Math.max(2, Math.round(W / 2.4));
  const xs = bayCentres(W, bays);
  const upHoles: Hole[] = [];
  const acSpots: { x: number; y: number }[] = [];
  const fePlatforms: number[] = [];
  const awningFloor = rng.chance(0.15) ? rng.int(0, nUp - 1) : -1;
  for (let k = 0; k < nUp; k++) {
    const fy = GROUND_H + k * FLOOR_H;
    windows(b, m, { xs, y: fy + 0.95, w: 1.05, h: 1.8, z: 0, holes: upHoles, wall: brick, sill: true, lintel: 'flat', noLedge: k >= 1, trim, rng });
    if (k === awningFloor) windowAwning(b, m.darkAwning, xs[rng.int(0, bays - 1)], fy + 0.95 + 1.8 + 0.12, 1.05, 0);
    else for (const x of xs) acSpots.push({ x, y: fy + 0.95 });
    fePlatforms.push(fy + 0.9);
  }
  wallWithHoles(b, brick, 0, topOfShop, W, H, 0, upHoles);

  // ---- cornice, parapet, roof
  cornice(b, m, 0, W, H, 0, 0.6, rng.chance(0.5) ? 'bracket' : 'dentil');
  roofWithParapet(b, m, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, frontMat: brick, sideMat: m.brickRed, coping: trim, exposeL: cs === 'left', exposeR: cs === 'right' });
  roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, brick: m.brickRed, chimney: 0.15, skylight: 0.25, bulkhead: 0.3, dishes: 0.35 });
  if (nUp === 3 && rng.chance(0.6)) waterTank(b, m, W * 0.5, H, -D + 2.6);

  if (rng.chance(0.25)) {
    fireEscape(b, m, Math.max(0.2, xs[0] - 0.7), Math.min(W - 0.2, xs[Math.min(1, xs.length - 1)] + 0.7), 0, fePlatforms);
  } else {
    acUnits(b, m, rng, acSpots, 0);
  }

  // ---- sidewalk cellar doors (two flat steel leaves, no collider) beside the awning line
  if (rng.chance(0.4)) {
    const cx = ax0 > W / 2 ? W * 0.3 : W * 0.7;
    for (const dx of [-0.46, 0.46]) b.box(m.metal, cx + dx - 0.43, 0, 0.35, cx + dx + 0.43, 0.07, 1.4, 'ufrl');
  }

  // ---- exposed side wall of a corner lot: windows all the way down
  if (cs) {
    const nb = Math.max(2, Math.floor((D - 1) / 3));
    const sx = bayCentres(D, nb);
    b.with(sideWallFrame(cs, W, D), () => {
      const holes: Hole[] = [];
      windows(b, m, { xs: sx, y: 0.9, w: 1.5, h: 2.2, z: 0, holes, wall: brick, sill: true, trim, rng });
      for (let k = 0; k < nUp; k++) {
        windows(b, m, { xs: sx, y: GROUND_H + k * FLOOR_H + 0.95, w: 1.05, h: 1.8, z: 0, holes, wall: brick, sill: true, lintel: 'flat', noLedge: k >= 1, trim, rng });
      }
      wallWithHoles(b, brick, 0, 0, D, H, 0, holes);
      cornice(b, m, 0, D, H, 0, 0.4, 'dentil');
      drainPipe(b, m, cs === 'left' ? D - 0.12 : 0.12, 0.2, H - 0.4, 0);
    });
  }

  // ---- rear: fire escape, vents, drain pipe
  b.with(rearWallFrame(W, D), () => {
    if (rng.chance(0.3)) {
      const ys: number[] = [];
      for (let k = 0; k < nUp; k++) ys.push(GROUND_H + k * FLOOR_H + 0.9);
      fireEscape(b, m, W * 0.25, W * 0.7, 0, ys);
    }
    if (rng.chance(0.5)) { airVent(b, m, W * 0.3, 1.2, 0); airVent(b, m, W * 0.7, 2.2, 0); }
    if (rng.chance(0.4)) drainPipe(b, m, 0.12, 0.2, H - 0.4, 0);
  });

  return { body: [{ x0: 0, x1: W, z0: -D, z1: 0 }], stoops: [] };
}
