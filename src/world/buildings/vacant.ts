/** Vacant lot: chain-link fence on posts along the front; no building, no footprint collider. */
import type { LotCtx, LotOutput } from './facade';

export function buildVacant(c: LotCtx): LotOutput {
  const { b, m, rng, W } = c;
  const z = -0.15;
  const h = 2.1;
  // double-sided chain-link panel so it reads from both directions
  b.rect(m.chain, [0, 0.1, z], [W, 0, 0], [0, h, 0], { ru: W / 1.5, rv: h / 1.5 });
  b.rect(m.chain, [W, 0.1, z], [-W, 0, 0], [0, h, 0], { ru: W / 1.5, rv: h / 1.5 });
  const posts = Math.max(2, Math.ceil(W / 2.4) + 1);
  for (let i = 0; i < posts; i++) {
    const x = 0.05 + ((W - 0.1) * i) / (posts - 1);
    b.box(m.metal, x - 0.04, 0, z - 0.04, x + 0.04, h + 0.15, z + 0.04);
  }
  b.bar(m.metal, [0, h + 0.1, z], [W, h + 0.1, z], 0.05);
  b.bar(m.metal, [0, 0.15, z], [W, 0.15, z], 0.04);
  // a bit of rubble behind the fence
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const x = rng.range(0.5, Math.max(0.6, W - 1.2));
    b.box(m.stoop, x, 0, -rng.range(1.5, 4), x + rng.range(0.4, 0.9), rng.range(0.2, 0.5), -rng.range(0.5, 1.4));
  }
  return { body: [], stoops: [], fence: { x0: 0, x1: W, z } };
}
