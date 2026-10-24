/** A brownstone under renovation: scaffold poles, plank decks and a blue plywood shed wall in front. */
import { FLOOR_H, BASEMENT_H } from './facade';
import type { LotCtx, LotOutput } from './facade';
import { buildBrownstone } from './brownstone';

export function buildScaffold(c: LotCtx): LotOutput {
  const { b, m, rng, W } = c;
  const S = 1.9;
  const base = buildBrownstone(c, { style: 'brownstone', stoop: false, setback: S, floors: rng.int(3, 4) });
  const { H } = base;
  const zWall = -0.25; // plywood face, inside the lot
  const poleXs: number[] = [0.15];
  const n = Math.max(1, Math.round(W / 2.4));
  for (let i = 1; i <= n; i++) poleXs.push((W - 0.3) * (i / n) + 0.15);

  for (const x of poleXs) {
    b.bar(m.metal, [x, 0, zWall], [x, H + 1.0, zWall], 0.07);
    b.bar(m.metal, [x, 0, -S + 0.2], [x, H + 1.0, -S + 0.2], 0.07);
  }
  // blue plywood shed wall at street level + plank decks at each floor
  b.rect(m.scaffold, [0, 0, zWall + 0.04], [W, 0, 0], [0, 2.9, 0]);
  b.box(m.scaffold, 0, 2.9, -S + 0.1, W, 3.0, zWall + 0.06, 'rlufb');
  for (let k = 1; k <= base.floors; k++) {
    const y = BASEMENT_H + (k - 1) * FLOOR_H + 2.0;
    if (y > H) break;
    b.box(m.scaffold, 0, y, -S + 0.1, W, y + 0.06, zWall, 'ufrl');
    b.bar(m.metal, [0, y + 1.0, zWall], [W, y + 1.0, zWall], 0.05);
    b.bar(m.metal, [0, y + 0.5, zWall], [W, y + 0.5, zWall], 0.05);
    b.bar(m.metal, [0, y, zWall], [W, y, zWall], 0.06);
  }
  // diagonal bracing
  b.bar(m.metal, [0.15, 0.2, zWall], [W - 0.15, H * 0.6, zWall], 0.05);
  const body = [{ x0: 0, x1: W, z0: -c.D, z1: -0.1 }];
  return { body, stoops: [] };
}
