/** Church: 9 m wide nave with pitched roof, square bell tower with steeple, pointed-arch windows, entrance steps. */
import { bayCentres, sideWallFrame, windows } from './facade';
import type { LotCtx, LotOutput } from './facade';

export function buildChurch(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot } = c;
  const S = 2.4; // front steps live in the yard in front of the facade
  const tw = Math.min(3.4, W * 0.3); // tower width
  const nx0 = tw, nx1 = W;
  const nw = nx1 - nx0;
  const eave = 9.0;
  const rise = Math.min(3.4, nw * 0.35);
  const mid = (nx0 + nx1) / 2;
  const towerDepth = 3.6;
  const towerH = 16;

  // nave walls (limestone front, brick sides/back)
  b.box(m.brickRed, nx0, 0, -D, nx1, eave, -S, 'rlb');
  b.box(m.limestone, nx0, 0, -D, nx1, eave, -S, 'f');
  // low wing behind the tower fills the footprint
  b.box(m.brickRed, 0, 0, -D, tw, 5.5, -S - towerDepth, 'rlb');
  b.box(m.brickRed, 0, 0, -D, tw, 5.5, -S - towerDepth, 'f');
  b.rect(m.roof, [0, 5.51, -S - towerDepth], [tw, 0, 0], [0, 0, -(D - S - towerDepth)]);

  // pitched roof (ridge runs front-to-back) + gables
  const lenZ = D - S;
  b.rect(m.roof, [nx0 - 0.15, eave, -D], [0, 0, lenZ + 0.15], [nw / 2 + 0.15, rise, 0]);
  b.rect(m.roof, [nx1 + 0.15, eave, -S], [0, 0, -(lenZ + 0.15)], [-(nw / 2 + 0.15), rise, 0]);
  b.tri(m.limestone, [nx0, eave, -S + 0.01], [nx1, eave, -S + 0.01], [mid, eave + rise, -S + 0.01]);
  b.tri(m.brickRed, [nx1, eave, -D - 0.01], [nx0, eave, -D - 0.01], [mid, eave + rise, -D - 0.01]);
  b.box(m.cornice, nx0 - 0.1, eave - 0.35, -S, nx1 + 0.1, eave + 0.1, -S + 0.45);

  // tower
  b.box(m.brickRed, 0, 0, -S - towerDepth, tw, towerH, -S, 'rlb');
  b.box(m.limestone, 0, 0, -S - towerDepth, tw, towerH, -S, 'f');
  b.box(m.cornice, -0.1, towerH - 0.4, -S - towerDepth - 0.1, tw + 0.1, towerH + 0.1, -S + 0.4);
  windows(b, m, { xs: [tw / 2], y: 11.5, w: 1.0, h: 2.6, z: -S, arch: true });
  windows(b, m, { xs: [tw / 2], y: 3.2, w: 0.8, h: 1.6, z: -S, arch: true });
  // steeple: four triangles
  const apexY = towerH + 4.2;
  const ax = tw / 2, az = -S - towerDepth / 2;
  const base: [number, number, number][] = [
    [0, towerH + 0.1, -S], [tw, towerH + 0.1, -S], [tw, towerH + 0.1, -S - towerDepth], [0, towerH + 0.1, -S - towerDepth],
  ];
  for (let i = 0; i < 4; i++) b.tri(m.roof, base[i], base[(i + 1) % 4], [ax, apexY, az]);
  b.bar(m.metal, [ax, apexY, az], [ax, apexY + 1.4, az], 0.1);
  b.bar(m.metal, [ax - 0.4, apexY + 1.0, az], [ax + 0.4, apexY + 1.0, az], 0.08);

  // front: door, flanking pointed windows, steps
  const doorX = mid;
  b.rect(m.metal, [doorX - 0.9, 0.6, -S + 0.02], [1.8, 0, 0], [0, 3.1, 0], { ru: 0.6, rv: 1 });
  b.tri(m.metal, [doorX - 0.9, 3.7, -S + 0.02], [doorX + 0.9, 3.7, -S + 0.02], [doorX, 4.7, -S + 0.02]);
  b.box(m.limestone, doorX - 1.1, 0.6, -S, doorX - 0.9, 3.8, -S + 0.2);
  b.box(m.limestone, doorX + 0.9, 0.6, -S, doorX + 1.1, 3.8, -S + 0.2);
  windows(b, m, { xs: [nx0 + nw * 0.15, nx1 - nw * 0.15], y: 2.2, w: 1.3, h: 3.6, z: -S, arch: true, sill: true });
  windows(b, m, { xs: [mid], y: 6.0, w: 1.2, h: 1.6, z: -S, arch: true });
  const stepW = 3.6;
  const sx0 = doorX - stepW / 2, sx1 = doorX + stepW / 2;
  const steps = 3, run = 0.5, rs = 0.2;
  b.box(m.stoop, sx0, 0, -S, sx1, rs * (steps), -S + 0.9);
  for (let i = 0; i < steps - 1; i++) {
    const zf = -S + 0.9 + run * (steps - 1 - i);
    b.box(m.stoop, sx0, 0, zf, sx1, rs * (i + 1), zf + run, 'rluf');
  }
  const stoopDepth = 0.9 + run * (steps - 1);

  // side-wall windows on the exposed right side (wall frame: local x runs front -> back)
  b.with(sideWallFrame('right', W, D), () => {
    const xs = bayCentres(D - S - 2.5, 3).map((x) => x + S + 1.2);
    windows(b, m, { xs, y: 2.4, w: 1.2, h: 3.8, z: 0, arch: true });
  });

  if (lot.poi) {
    const sign = m.lib.sign(lot.poi.sign, '#2d1747', '#f2e6c9');
    const sw = Math.min(nw * 0.45, 4.6);
    b.box(sign, doorX - sw / 2, 5.0, -S, doorX + sw / 2, 5.9, -S + 0.15, 'rlufb', true);
  } else if (rng.chance(0.5)) {
    b.box(m.cornice, doorX - 1.4, 5.0, -S, doorX + 1.4, 5.7, -S + 0.12);
  }

  return {
    body: [{ x0: 0, x1: W, z0: -D, z1: -S }],
    stoops: [{ x0: sx0, x1: sx1, z0: -S, z1: -S + stoopDepth }],
  };
}
