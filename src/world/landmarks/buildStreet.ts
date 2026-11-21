/**
 * LANDMARKS builders on the street itself: subway stair entrances (a railed stairwell with two globe lamps and a station board).
 * Station names are invented; the bullet is a plain coloured disc with no letter or number.
 */
import type { BuildCtx } from './buildPark';
import { signBoard } from './parts';

export function* buildSubway(c: BuildCtx): Generator<void> {
  const { k, row } = c;
  const L = 5.4, Wd = 2.0;
  const x0 = 0.3, z0 = 0.2, x1 = x0 + L, z1 = z0 + Wd;
  const iron = k.flatM;
  const IRON = 0x2c2c2e;
  // the stairwell: a dark opening with the step edges showing
  k.floor(k.flatM, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.03, { color: 0x15171a });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.3 + (i * (L - 0.6)) / n;
    k.quad(k.flatM, [x, 0.04, z0 + 0.05], [x + 0.14, 0.04, z0 + 0.05], [x + 0.14, 0.04, z1 - 0.05], [x, 0.04, z1 - 0.05], { hint: [0, 1, 0], color: 0x4a4f55 - i * 0x040404 });
  }
  // a kerb rim all round, then the railings on both long sides and the far end (open at the entry end, x = x0)
  k.box(k.m('granite'), x0 - 0.15, 0, z0 - 0.15, x1 + 0.15, 0.12, z0);
  k.box(k.m('granite'), x0 - 0.15, 0, z1, x1 + 0.15, 0.12, z1 + 0.15, { noTop: false });
  k.box(k.m('granite'), x1, 0, z0, x1 + 0.15, 0.12, z1, { noTop: false });
  const rail = (ax: number, az: number, bx: number, bz: number): void => {
    k.bar(iron, [ax, 1.05, az], [bx, 1.05, bz], 0.06, { color: IRON });
    k.bar(iron, [ax, 0.55, az], [bx, 0.55, bz], 0.05, { color: IRON });
    const len = Math.hypot(bx - ax, bz - az);
    const m = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= m; i++) k.bar(iron, [ax + ((bx - ax) * i) / m, 0.1, az + ((bz - az) * i) / m], [ax + ((bx - ax) * i) / m, 1.05, az + ((bz - az) * i) / m], 0.05, { color: IRON });
    k.solidSeg(ax, az, bx, bz);
  };
  rail(x0, z0 - 0.1, x1, z0 - 0.1);
  rail(x0, z1 + 0.1, x1, z1 + 0.1);
  rail(x1 + 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
  // two globe lamps at the entry end
  const colour = parseInt(String(row.look.colour ?? '#3fae5c').slice(1), 16);
  for (const z of [z0 - 0.1, z1 + 0.1]) {
    k.cyl(iron, x0, z, 0.07, 0, 2.5, 6, { color: IRON });
    // a globe: two frusta (widening, then narrowing) and a flat cap
    k.cone(k.flatM, x0, z, 0.16, 2.5, 2.78, 10, { color: colour, r1: 0.3, rot: 0 });
    k.cone(k.flatM, x0, z, 0.3, 2.78, 3.06, 10, { color: colour, r1: 0.18, rot: 0 });
    k.floor(k.flatM, Array.from({ length: 10 }, (_, i) => [x0 + Math.cos((i / 10) * Math.PI * 2) * 0.18, z + Math.sin((i / 10) * Math.PI * 2) * 0.18] as [number, number]), 3.06, { color: colour });
    k.solidCircle(x0, z, 0.2);
  }
  // the station board on a pole at the far end, readable from both sides of the pavement
  const zm = (z0 + z1) / 2, name = String(row.look.station ?? row.name).toUpperCase();
  k.cyl(k.flatM, x1 + 0.05, zm, 0.06, 0, 3.5, 6, { color: IRON });
  for (const out of [[0, -1], [0, 1]] as Array<[number, number]>) signBoard(k, name, x1 - 1.6, 3.0, zm, out, 3.2, '#16202c', '#f2efe4', 0.08);
  k.solidCircle(x1 + 0.05, zm, 0.2);
  yield;
}
