/**
 * Church: gable-front nave with pitched roof, arched double door, a round (rose) window in the gable, recessed
 * round-headed windows and railed entrance steps. Lots >= 12 m wide also get a square bell tower with steeple, cross
 * and corner pinnacles; narrower (storefront-chapel) lots are a plain gabled front with a cross on the apex. The front
 * masonry follows the lot's material family (limestone by default); nave height follows the data floors.
 */
import { bayCentres, cornice, familyMats, sideWallFrame, wallWithHoles, windows } from './facade';
import type { Hole, LotCtx, LotOutput, V3 } from './facade';

export function buildChurch(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot, spec } = c;
  const S = 2.4; // front steps live in the yard in front of the facade
  const tower = W >= 12;
  const tw = tower ? Math.min(3.4, W * 0.3) : 0; // tower width
  const nx0 = tw, nx1 = W;
  const nw = nx1 - nx0;
  const eave = spec ? Math.max(8.5, Math.min(11, spec.floors * 3.1)) : 9.0;
  const front = spec && spec.family !== 'limestone' ? familyMats(m, spec.family, 0).front : m.limestone;
  const rise = Math.min(3.4, nw * 0.35);
  const mid = (nx0 + nx1) / 2;
  const towerDepth = 3.6;
  const towerH = 16;

  // nave walls (brick sides/back; limestone front built below with its openings; right side wall has arched windows)
  b.box(m.brickRed, nx0, 0, -D, nx1, eave, -S, 'lb');
  // low wing behind the tower fills the footprint
  if (tower) {
    b.box(m.brickRed, 0, 0, -D, tw, 5.5, -S - towerDepth, 'rlb');
    b.box(m.brickRed, 0, 0, -D, tw, 5.5, -S - towerDepth, 'f');
    b.rect(m.roof, [0, 5.51, -S - towerDepth], [tw, 0, 0], [0, 0, -(D - S - towerDepth)]);
  }

  // pitched roof (ridge runs front-to-back) + gables
  const lenZ = D - S;
  b.rect(m.roof, [nx0 - 0.15, eave, -D], [0, 0, lenZ + 0.15], [nw / 2 + 0.15, rise, 0]);
  b.rect(m.roof, [nx1 + 0.15, eave, -S], [0, 0, -(lenZ + 0.15)], [-(nw / 2 + 0.15), rise, 0]);
  b.tri(front, [nx0, eave, -S + 0.01], [nx1, eave, -S + 0.01], [mid, eave + rise, -S + 0.01]);
  b.tri(m.brickRed, [nx1, eave, -D - 0.01], [nx0, eave, -D - 0.01], [mid, eave + rise, -D - 0.01]);
  cornice(b, m, nx0, nx1, eave, -S, 0.45, 'dentil');

  // ---- front of the nave: arched double door, flanking arched windows, rose window
  const doorX = mid;
  const nave: Hole[] = [];
  const doorY = 0.6; // top of the steps
  windows(b, m, { xs: [doorX], y: doorY, w: 1.8, h: 2.6, z: -S, holes: nave, wall: front, depth: 0.35, arch: true, sill: false });
  b.rect(m.metal, [doorX - 0.9, doorY, -S - 0.12], [1.8, 0, 0], [0, 2.5, 0], { ru: 0.6, rv: 0.8 });
  b.rect(m.cornice, [doorX - 0.03, doorY, -S - 0.11], [0.06, 0, 0], [0, 2.5, 0], { ru: 0.05, rv: 0.8 });
  windows(b, m, { xs: [nx0 + nw * 0.15, nx1 - nw * 0.15], y: 2.2, w: 1.3, h: Math.min(3.6, eave - 4.6), z: -S, holes: nave, wall: front, arch: true, rng });
  wallWithHoles(b, front, nx0, 0, nx1, eave, -S, nave);
  b.box(m.limestone, doorX - 1.2, doorY, -S, doorX - 0.9, doorY + 3.1, -S + 0.2, 'fl');
  b.box(m.limestone, doorX + 0.9, doorY, -S, doorX + 1.2, doorY + 3.1, -S + 0.2, 'fr');
  // rose window: stone ring around a lit disc, proud of the wall
  {
    const cy = eave - 1.8, r0 = 1.0, r1 = 1.28, n = 12, z = -S + 0.03;
    const pt = (r: number, k: number, zz: number): V3 => [doorX + Math.cos((k * 2 * Math.PI) / n) * r, cy + Math.sin((k * 2 * Math.PI) / n) * r, zz];
    for (let k = 0; k < n; k++) {
      b.poly(m.limestone, [pt(r0, k, z + 0.05), pt(r1, k, z + 0.05), pt(r1, k + 1, z + 0.05), pt(r0, k + 1, z + 0.05)]);
      b.tri(m.window, [doorX, cy, z], pt(r0, k, z), pt(r0, k + 1, z), [[0.5, 0.7], [0.5 + Math.cos((k * 2 * Math.PI) / n) * 0.3, 0.7 + Math.sin((k * 2 * Math.PI) / n) * 0.15], [0.5 + Math.cos(((k + 1) * 2 * Math.PI) / n) * 0.3, 0.7 + Math.sin(((k + 1) * 2 * Math.PI) / n) * 0.15]]);
    }
    for (const k of [0, 3, 6, 9]) b.bar(m.limestone, pt(r0, k, z + 0.04), pt(r0, k + 6, z + 0.04), 0.06);
  }

  // ---- tower (wide lots) or a plain apex cross (narrow ones)
  if (tower) {
  b.box(m.brickRed, 0, 0, -S - towerDepth, tw, towerH, -S, 'rlb');
  const tHoles: Hole[] = [];
  windows(b, m, { xs: [tw / 2], y: 11.5, w: 1.0, h: 2.6, z: -S, holes: tHoles, wall: m.limestone, depth: 0.3, arch: true });
  windows(b, m, { xs: [tw / 2], y: 3.2, w: 0.8, h: 1.6, z: -S, holes: tHoles, wall: m.limestone, arch: true, sill: false });
  wallWithHoles(b, m.limestone, 0, 0, tw, towerH, -S, tHoles);
  b.box(m.limestone, -0.05, 8.9, -S, tw + 0.05, 9.1, -S + 0.12, 'fud');
  b.box(m.limestone, -0.05, 14.4, -S, tw + 0.05, 14.6, -S + 0.12, 'fud');
  b.box(m.cornice, -0.1, towerH - 0.4, -S - towerDepth - 0.1, tw + 0.1, towerH + 0.1, -S + 0.4, 'frlud');
  for (const [px, pz] of [[0.05, -S + 0.05], [tw - 0.35, -S + 0.05], [0.05, -S - towerDepth + 0.05], [tw - 0.35, -S - towerDepth + 0.05]] as const) {
    b.box(m.cornice, px, towerH + 0.1, pz - 0.0, px + 0.3, towerH + 1.1, pz + 0.3, 'frlb');
  }
  // steeple: four triangles
  const apexY = towerH + 4.2;
  const ax = tw / 2, az = -S - towerDepth / 2;
  const base: V3[] = [
    [0, towerH + 0.1, -S], [tw, towerH + 0.1, -S], [tw, towerH + 0.1, -S - towerDepth], [0, towerH + 0.1, -S - towerDepth],
  ];
  for (let i = 0; i < 4; i++) b.tri(m.roof, base[i], base[(i + 1) % 4], [ax, apexY, az]);
  // cross on the steeple
  b.bar(m.metal, [ax, apexY, az], [ax, apexY + 1.9, az], 0.12);
  b.bar(m.metal, [ax - 0.5, apexY + 1.4, az], [ax + 0.5, apexY + 1.4, az], 0.1);
  } else {
    const ay = eave + rise;
    b.bar(m.metal, [mid, ay, -S - 0.1], [mid, ay + 1.4, -S - 0.1], 0.1);
    b.bar(m.metal, [mid - 0.4, ay + 1.0, -S - 0.1], [mid + 0.4, ay + 1.0, -S - 0.1], 0.08);
    // buttress pilasters at the front corners
    b.box(m.limestone, nx0, 0, -S, nx0 + 0.45, eave, -S + 0.14, 'frlu');
    b.box(m.limestone, nx1 - 0.45, 0, -S, nx1, eave, -S + 0.14, 'frlu');
  }

  // ---- entrance steps with cheek walls and iron rails
  const stepW = 3.6;
  const sx0 = doorX - stepW / 2, sx1 = doorX + stepW / 2;
  const steps = 3, run = 0.5, rs = 0.2;
  b.box(m.stoop, sx0, 0, -S, sx1, rs * steps, -S + 0.9, 'fu');
  for (let i = 0; i < steps - 1; i++) {
    const zf = -S + 0.9 + run * (steps - 1 - i);
    b.box(m.stoop, sx0, 0, zf, sx1, rs * (i + 1), zf + run, 'fu');
  }
  const stoopDepth = 0.9 + run * (steps - 1);
  for (const s of [-1, 1]) {
    const xo = s < 0 ? sx0 - 0.2 : sx1, xi = xo + 0.2, rx = xo + 0.1;
    b.box(m.stoop, xo, 0, -S, xi, 0.95, -S + stoopDepth, 'frlu');
    b.bar(m.metal, [rx, 0.95 + 0.9, -S + stoopDepth], [rx, 0.95 + 0.9, -S + 0.05], 0.05);
    b.bar(m.metal, [rx, 0.95, -S + stoopDepth - 0.05], [rx, 0.95 + 0.9, -S + stoopDepth - 0.05], 0.06);
    b.bar(m.metal, [rx, 0.95, -S + 0.1], [rx, 0.95 + 0.9, -S + 0.1], 0.06);
    for (const t of [0.3, 0.55, 0.8]) b.bar(m.metal, [rx, 0.95, -S + stoopDepth * t], [rx, 0.95 + 0.85, -S + stoopDepth * t], 0.03);
  }

  // ---- exposed right side wall: arched windows set into the brick
  b.with(sideWallFrame('right', W, D), () => {
    const xs = bayCentres(D - S - 2.5, 3).map((x) => x + S + 1.2);
    const holes: Hole[] = [];
    windows(b, m, { xs, y: 2.4, w: 1.2, h: 3.8, z: 0, holes, wall: m.brickRed, arch: true, rng });
    wallWithHoles(b, m.brickRed, S, 0, D, eave, 0, holes);
    b.box(m.limestone, S, 1.9, 0, D, 2.05, 0.06, 'fu');
  });

  if (lot.poi) {
    const sign = m.lib.sign(lot.poi.sign, '#2d1747', '#f2e6c9');
    const sw = Math.min(nw * 0.45, 4.6);
    const sy0 = eave - 4.1, sy1 = sy0 + 0.9, f = 0.06, z0 = -S + 0.15;
    b.box(m.metal, doorX - sw / 2, sy0, -S, doorX + sw / 2, sy1, z0, 'rlud');
    b.rect(sign, [doorX - sw / 2 + f, sy0 + f, z0 + 0.005], [sw - 2 * f, 0, 0], [0, sy1 - sy0 - 2 * f, 0], { ru: 1, rv: 1 });
    const uvr: [number, number, number, number] = [0.2, 0.6, 0.8, 0.85];
    b.rect(m.window, [doorX - sw / 2, sy1 - f, z0 + 0.01], [sw, 0, 0], [0, f, 0], { uvRect: uvr });
    b.rect(m.window, [doorX - sw / 2, sy0, z0 + 0.01], [sw, 0, 0], [0, f, 0], { uvRect: uvr });
  } else if (rng.chance(0.5)) {
    b.box(m.cornice, doorX - 1.4, eave - 4.1, -S, doorX + 1.4, eave - 3.4, -S + 0.12, 'frlud');
  }

  return {
    body: [{ x0: 0, x1: W, z0: -D, z1: -S }],
    stoops: [{ x0: sx0, x1: sx1, z0: -S, z1: -S + stoopDepth }],
  };
}
