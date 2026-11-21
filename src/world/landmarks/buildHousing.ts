/**
 * LANDMARKS builder for public-housing superblocks: brick slabs standing in lawns with paths, benches, a playground and
 * trees. Heights come from the look recipe (taken from the building-footprint roof heights in the open data).
 */
import type { BuildCtx } from './buildPark';
import { localRing, playground, court } from './buildPark';
import { band, bench, flatRoof, lampPost, rectCornice, signBoard, tree, windowBand } from './parts';
import type { Kit } from './kit';

type Pt = [number, number];

function inRing(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i][1] > p[1]) !== (ring[j][1] > p[1]) && p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c;
  }
  return c;
}

/** one brick slab: walls, window bands, cornice, flat roof with a bulkhead, doors with canopies, optional name board */
export function slab(k: Kit, x: number, z: number, sx: number, sz: number, floors: number, floorH: number, brickVariant: number, detail: number, name?: string, nameOut: [number, number] = [0, -1]): void {
  const brick = k.m('brickRed', brickVariant), stone = k.m('limestone'), roof = k.m('tarRoof', (brickVariant + 1) % 3);
  const h = floors * floorH;
  k.box(brick, x, 0, z, x + sx, h, z + sz, { top: roof });
  // long sides carry the windows; both long axes are handled by testing which dimension is longer
  const longX = sx >= sz;
  const pitch = 3.1;
  const sides: Array<{ x0: number; z0: number; dx: number; dz: number; len: number; out: [number, number] }> = longX
    ? [{ x0: x, z0: z, dx: 1, dz: 0, len: sx, out: [0, -1] }, { x0: x, z0: z + sz, dx: 1, dz: 0, len: sx, out: [0, 1] }, { x0: x, z0: z, dx: 0, dz: 1, len: sz, out: [-1, 0] }, { x0: x + sx, z0: z, dx: 0, dz: 1, len: sz, out: [1, 0] }]
    : [{ x0: x, z0: z, dx: 1, dz: 0, len: sx, out: [0, -1] }, { x0: x, z0: z + sz, dx: 1, dz: 0, len: sx, out: [0, 1] }, { x0: x, z0: z, dx: 0, dz: 1, len: sz, out: [-1, 0] }, { x0: x + sx, z0: z, dx: 0, dz: 1, len: sz, out: [1, 0] }];
  sides.forEach((s, i) => {
    const long = (longX && i < 2) || (!longX && i >= 2);
    windowBand(k, {
      ...s, y0: 1.0, floors, floorH, w: 1.35, h: 1.7, pitch: long ? pitch : pitch * 1.6, margin: 1.6,
      trim: detail > 1 ? stone : null, detail, variant: (n, f) => (n * 5 + f * 2 + (x | 0)) & 3,
      skip: (n, f) => f === 0 && long && n % 6 === 3,
    });
  });
  if (detail > 0) {
    rectCornice(k, stone, x, z, x + sx, z + sz, h - 0.4, 0.4, 0.2);
    band(k, stone, x, z, x + sx, z, 0.05, 0.9, 0.06, [0, -1]);
    band(k, stone, x, z + sz, x + sx, z + sz, 0.05, 0.9, 0.06, [0, 1]);
  }
  flatRoof(k, roof, brick, x, z, x + sx, z + sz, h, 0.9);
  // bulkhead and tank
  k.box(k.m('brickRed', 1), x + sx / 2 - 2, h, z + sz / 2 - 2, x + sx / 2 + 2, h + 2.6, z + sz / 2 + 2, { top: roof });
  // doors with canopies on the long sides
  const d0 = longX ? [x + sx * 0.3, x + sx * 0.7] : [z + sz * 0.3, z + sz * 0.7];
  for (const dd of d0) {
    for (const side of [0, 1]) {
      const zz = longX ? (side ? z + sz : z) : 0, xx = longX ? dd : (side ? x + sx : x);
      const out: [number, number] = longX ? (side ? [0, 1] : [0, -1]) : (side ? [1, 0] : [-1, 0]);
      const px = longX ? dd : xx, pz = longX ? zz : dd;
      const rx = out[1], rz = -out[0];
      k.quad(k.m('metalDark'), [px - rx * 1.0 + out[0] * 0.04, 0, pz - rz * 1.0 + out[1] * 0.04], [px + rx * 1.0 + out[0] * 0.04, 0, pz + rz * 1.0 + out[1] * 0.04], [px + rx * 1.0 + out[0] * 0.04, 2.4, pz + rz * 1.0 + out[1] * 0.04], [px - rx * 1.0 + out[0] * 0.04, 2.4, pz - rz * 1.0 + out[1] * 0.04], { hint: [out[0], 0, out[1]] });
      k.box(k.m('cornice'), px - 1.6 + (longX ? 0 : out[0] * 0.0), 2.5, pz - 1.6, px + 1.6, 2.7, pz + 1.6, { noSides: false });
    }
  }
  if (name) {
    const cx = x + sx / 2, cz = nameOut[1] > 0 ? z + sz : z;
    signBoard(k, name, cx, h - 4.4, cz, nameOut, Math.min(10, sx * 0.4), '#2a3a52', '#efe8d4', 0.12);
  }
  k.solidRect(x, z, x + sx, z + sz);
}

export function* buildHousing(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const s = row.site;
  const look = row.look;
  const ring = localRing(row);
  const W = s.w, D = s.d;
  const bv = look.brick === 'tanBrick' ? 1 : 0;
  const floors = Number(look.floors ?? 6);
  const floorH = 3.05;
  k.floor(k.grassM, ring, 0.02, { uvScale: 1 / 4 });
  yield;
  const plan = String(look.plan ?? 'rows');
  const placed: Array<{ x: number; z: number; sx: number; sz: number }> = [];

  if (plan === 'tower') {
    // one tall slab on a lawn podium inside a small lot
    const h = Number(look.height ?? 41);
    const f = Number(look.floors ?? 15);
    const sx = Math.min(W - 8, 46), sz = Math.min(D - 10, 15);
    slab(k, (W - sx) / 2, 5, sx, sz, f, h / f, bv, detail, row.name.toUpperCase());
    for (let i = 0; i < 4; i++) tree(k, 3 + rng.next() * (W - 6), D - 3, rng, 0.7);
    for (let i = 0; i < 3; i++) bench(k, W / 2 - 8 + i * 8, D - 4, [0, -1]);
    return;
  }

  // slab grid inside the ring
  const margin = 16;
  const slabLong = 56, slabShort = 14;
  const horiz = plan !== 'courts';
  const sx = horiz ? slabLong : slabShort, sz = horiz ? slabShort : slabLong;
  const px = sx + (horiz ? 16 : 24), pz = sz + (horiz ? 20 : 12);
  const cols = Math.max(1, Math.floor((W - 2 * margin + (px - sx)) / px)), rows = Math.max(1, Math.floor((D - 2 * margin + (pz - sz)) / pz));
  const gx = (W - ((cols - 1) * px + sx)) / 2, gz = (D - ((rows - 1) * pz + sz)) / 2;
  const slots: Array<{ x: number; z: number }> = [];
  for (let r = 0; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
    const stagger = horiz && r % 2 ? px * 0.35 : 0;
    const x = gx + cI * px + stagger, zz = gz + r * pz;
    if (x + sx > W - 6) continue;
    if (!([[x, zz], [x + sx, zz], [x + sx, zz + sz], [x, zz + sz]] as Pt[]).every((p) => inRing(p, ring))) continue;
    slots.push({ x, z: zz });
  }
  // shuffle deterministically and take what the recipe wants
  for (let i = slots.length - 1; i > 0; i--) { const j = rng.int(0, i); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const want = Math.min(slots.length, Number(look.slabs ?? 10));
  const tall = Number(look.tall ?? 0);
  const tallFloors = Number(look.tallFloors ?? 14);
  let namedOne = false;
  for (let i = 0; i < want; i++) {
    const sl = slots[i];
    const isTall = i < tall;
    const fl = isTall ? tallFloors : floors;
    const tsx = isTall ? (horiz ? 40 : 15) : sx, tsz = isTall ? (horiz ? 15 : 40) : sz;
    const bx = sl.x + (sx - tsx) / 2, bz = sl.z + (sz - tsz) / 2;
    const frontOut: [number, number] = [0, -1];
    slab(k, bx, bz, tsx, tsz, fl, isTall ? 3.1 : floorH, isTall ? (bv + 2) & 3 : (bv + (i % 3 === 0 ? 1 : 0)) & 3, detail, !namedOne && bz < D / 2 ? row.name.toUpperCase() : undefined, frontOut);
    if (!namedOne && bz < D / 2) namedOne = true;
    placed.push({ x: bx, z: bz, sx: tsx, sz: tsz });
    yield;
  }
  void tall;

  // paths: along every row and column gap, plus lawns' edges
  const conc = k.m('concrete');
  const strip = (a: Pt, b: Pt, w: number): void => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const nx = (-dz / L) * w / 2, nz = (dx / L) * w / 2;
    k.quad(conc, [a[0] - nx, 0.06, a[1] - nz], [b[0] - nx, 0.06, b[1] - nz], [b[0] + nx, 0.06, b[1] + nz], [a[0] + nx, 0.06, a[1] + nz], { hint: [0, 1, 0], ru: L / 3, rv: w / 3 });
  };
  const paths: Array<[Pt, Pt]> = [];
  const cxm = W / 2, czm = D / 2;
  for (const p of [[[cxm, 3], [cxm, D - 3]], [[3, czm], [W - 3, czm]]] as Array<[Pt, Pt]>) {
    // clip a path so that it does not pass through a slab: split it at each slab it crosses
    const a = p[0], b = p[1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    let t = 0;
    const hit = (tt: number): boolean => {
      const q: Pt = [a[0] + ux * tt, a[1] + uz * tt];
      return placed.some((s2) => q[0] > s2.x - 2 && q[0] < s2.x + s2.sx + 2 && q[1] > s2.z - 2 && q[1] < s2.z + s2.sz + 2) || !inRing(q, ring);
    };
    let start = -1;
    for (t = 0; t <= L; t += 2) {
      const h = hit(t);
      if (!h && start < 0) start = t;
      if ((h || t + 2 > L) && start >= 0) { const e = h ? t - 2 : t; if (e - start > 4) { const A: Pt = [a[0] + ux * start, a[1] + uz * start], B: Pt = [a[0] + ux * e, a[1] + uz * e]; strip(A, B, 3.2); paths.push([A, B]); } start = -1; }
    }
  }
  yield;
  // lamps, benches, a playground and a court in the lawns, trees everywhere else
  for (const [a, b] of paths) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    for (let t = 6; t < L - 4; t += 22) {
      const q: Pt = [a[0] + ux * t, a[1] + uz * t];
      if (detail > 0) lampPost(k, q[0] - uz * 2.3, q[1] + ux * 2.3);
      bench(k, q[0] + uz * 2.4, q[1] - ux * 2.4, [-uz, ux]);
    }
  }
  const lawnFree = (p: Pt, r: number): boolean =>
    inRing(p, ring) && placed.every((s2) => p[0] < s2.x - r || p[0] > s2.x + s2.sx + r || p[1] < s2.z - r || p[1] > s2.z + s2.sz + r)
    && Math.abs(p[0] - cxm) > 3 + r * 0.2 && Math.abs(p[1] - czm) > 3 + r * 0.2;
  let did = 0;
  for (let t = 0; t < 40 && did < 2; t++) {
    const p: Pt = [rng.range(20, W - 40), rng.range(14, D - 30)];
    if (lawnFree([p[0], p[1]], 16) && lawnFree([p[0] + 22, p[1] + 16], 6)) {
      if (did === 0) playground(k, p[0], p[1], 20, 14, rng); else court(k, p[0] + 12, p[1] + 8, 26, 14, true, 0x9a4a3a, detail);
      placed.push({ x: p[0] - 2, z: p[1] - 2, sx: 26, sz: 20 });
      did++;
    }
  }
  yield;
  const want2 = Math.round(Number(look.trees ?? 60) * (detail === 0 ? 0.5 : 1)) || (detail === 0 ? 20 : 45);
  let n = 0, tries = 0;
  while (n < want2 && tries < want2 * 20) {
    tries++;
    const p: Pt = [rng.range(4, W - 4), rng.range(4, D - 4)];
    if (!lawnFree(p, 3.2)) continue;
    tree(k, p[0], p[1], rng, 0.85 + rng.next() * 0.4);
    n++;
    if (n % 14 === 0) yield;
  }
}
