/**
 * Vacant lot: chain-link fence on posts along the front, a dirt-and-gravel bed, weed tufts, rubble and a few
 * odd leftovers; no building and no footprint collider (just the fence segment).
 */
import type { LotCtx, LotOutput } from './facade';

export function buildVacant(c: LotCtx): LotOutput {
  const { b, m, rng, W, D } = c;
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

  // bare ground: dark gravel bed over the front half of the lot (the back stays hidden behind neighbours)
  const gd = Math.min(D, 9);
  b.rect(m.roof, [0.05, 0.03, z - 0.05], [W - 0.1, 0, 0], [0, 0, -gd], { ru: W / 3, rv: gd / 3 });

  // weeds: three-blade tufts (double-sided), thicker along the fence and the side walls
  const tufts = Math.round(W * 3.2) + rng.int(4, 8);
  for (let i = 0; i < tufts; i++) {
    const edge = rng.chance(0.4);
    const x = edge ? (rng.chance(0.5) ? rng.range(0.15, 0.9) : W - rng.range(0.15, 0.9)) : rng.range(0.3, W - 0.3);
    const zz = -rng.range(0.4, edge ? 7 : 5.5);
    const hgt = rng.range(0.35, 1.25), r = rng.range(0.1, 0.22), a0 = rng.range(0, Math.PI);
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * Math.PI) / 3;
      const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
      const lean = rng.range(-0.12, 0.12);
      const apex: [number, number, number] = [x + lean, hgt, zz + lean * 0.5];
      const p0: [number, number, number] = [x - dx, 0.03, zz - dz], p1: [number, number, number] = [x + dx, 0.03, zz + dz];
      b.tri(m.leaves, p0, p1, apex, [[0.2, 0.2], [0.35, 0.2], [0.28, 0.6]]);
      b.tri(m.leaves, p1, p0, apex, [[0.35, 0.2], [0.2, 0.2], [0.28, 0.6]]);
    }
  }

  // rubble, a broken concrete slab and a tipped-over crate behind the fence
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const x = rng.range(0.5, Math.max(0.6, W - 1.2));
    b.box(m.stoop, x, 0, -rng.range(1.5, 4), x + rng.range(0.4, 0.9), rng.range(0.2, 0.5), -rng.range(0.5, 1.4));
  }
  if (W > 4.5 && rng.chance(0.6)) {
    const x = rng.range(1, W - 3);
    b.box(m.stoop, x, 0.02, -5.5, x + 1.9, 0.14, -4.3, 'fru');
  }
  return { body: [], stoops: [], fence: { x0: 0, x1: W, z } };
}
