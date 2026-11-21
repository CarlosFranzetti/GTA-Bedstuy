/**
 * LANDMARKS builders for buildings: church, armoury, school, hospital, library, station house, firehouse, depot.
 * Massing comes from the site rectangle and the footprint roof heights in the open data; the look is the generic family
 * (brick or stone, round or pointed arches, towers) of that kind of building, never a copy of one real facade.
 */
import type { BuildCtx } from './buildPark';
import { localRing } from './buildPark';
import { archPane, archSurround, band, bench, crenellate, fence, flatRoof, hip, lampPost, rectCornice, signBoard, steps, tree, windowBand } from './parts';
import type { V3 } from './kit';

type Pt = [number, number];

function inRing(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i][1] > p[1]) !== (ring[j][1] > p[1]) && p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c;
  }
  return c;
}

/** largest inset rectangle of a site: the bounding box pulled in until all four corners are inside the ring */
export function insetRect(ring: Pt[], W: number, D: number, start: number): { x0: number; z0: number; x1: number; z1: number } {
  let inset = start;
  for (let t = 0; t < 10; t++) {
    const r = { x0: inset, z0: inset, x1: W - inset, z1: D - inset };
    if (([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] as Pt[]).every((p) => inRing(p, ring))) return r;
    inset += 2;
  }
  return { x0: inset, z0: inset, x1: W - inset, z1: D - inset };
}

const faceMat = (k: BuildCtx['k'], fam: string): ReturnType<BuildCtx['k']['m']> => (fam === 'tanBrick' ? k.m('brickRed', 1) : fam === 'limestone' ? k.m('limestone') : fam === 'brownstone' ? k.m('brownstone') : k.m('brickRed', 0));

// ----------------------------------------------------------------------------------------------- church

export function* buildChurch(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const wallM = faceMat(k, String(look.family ?? 'brick'));
  const stone = k.m('limestone'), roof = k.m('tarRoof', 2), slate = k.m('tarRoof', 0);
  const oct = look.tower === 'octagon';
  const tw = Math.min(9.5, W * 0.22);
  const eave = 9.5, ridge = 15.5;
  const naveX0 = tw + 0.5, naveX1 = W - 1.5;
  const naveZ0 = 3.2, naveZ1 = D - 1;
  yield;
  // lawn and path
  k.floor(k.grassM, [[0, 0], [W, 0], [W, D], [0, D]], 0.02, { uvScale: 1 / 4 });
  k.floor(k.m('concrete'), [[naveX0 + (naveX1 - naveX0) / 2 - 2, 0], [naveX0 + (naveX1 - naveX0) / 2 + 2, 0], [naveX0 + (naveX1 - naveX0) / 2 + 2, naveZ0 + 0.5], [naveX0 + (naveX1 - naveX0) / 2 - 2, naveZ0 + 0.5]], 0.05);
  // nave
  k.box(wallM, naveX0, 0, naveZ0, naveX1, eave, naveZ1, { top: roof, noTop: true });
  k.gable(slate, wallM, naveX0, naveZ0, naveX1, naveZ1, eave, ridge, 'z', 0.3);
  // transepts make the roof a cross
  if (look.cruciform) {
    const tz0 = naveZ0 + (naveZ1 - naveZ0) * 0.5, tz1 = tz0 + 9;
    k.box(wallM, naveX0 - 3, 0, tz0, naveX1 + 0.4, eave, tz1, { noTop: true });
    k.gable(slate, wallM, naveX0 - 3, tz0, naveX1 + 0.4, tz1, eave, ridge - 0.5, 'x', 0.3);
  }
  // front: a big pointed window over the door, door with stone surround and steps
  const mid = (naveX0 + naveX1) / 2;
  archPane(k, k.m('window', 1), mid, naveZ0, 4.2, 3.0, 7.0, [0, -1], true, 0.08);
  archSurround(k, stone, mid, naveZ0, 4.2, 3.0, 7.0, [0, -1], true, 0.4, 0.1);
  archPane(k, k.m('metalDark'), mid, naveZ0, 0, 2.2, 3.6, [0, -1], true, 0.08);
  archSurround(k, stone, mid, naveZ0, 0, 2.2, 3.6, [0, -1], true, 0.4, 0.1);
  steps(k, stone, mid, naveZ0, 5, 3, 0.18, 0.5, [0, -1]);
  band(k, stone, naveX0, naveZ0, naveX1, naveZ0, eave - 0.4, 0.4, 0.3, [0, -1]);
  // side walls: tall narrow windows between buttresses
  for (const side of [0, 1]) {
    const xs = side ? naveX1 : naveX0;
    const o: [number, number] = side ? [1, 0] : [-1, 0];
    windowBand(k, { x0: xs, z0: naveZ0 + 3, dx: 0, dz: 1, len: naveZ1 - naveZ0 - 6, out: o, y0: 3.2, floors: 1, floorH: 4, w: 1.1, h: 4.2, pitch: 3.6, trim: stone, detail });
  }
  if (detail > 1) for (let z = naveZ0 + 3; z < naveZ1 - 2; z += 3.6) for (const xs of [naveX0, naveX1]) k.box(stone, xs - 0.3, 0, z - 0.3, xs + 0.3, eave - 1.2, z + 0.3);
  k.solidRect(naveX0, naveZ0, naveX1, naveZ1);
  yield;

  // tower at the left front corner
  const tx = 0.5, tz = 2.2, tws = tw - 0.5;
  const th = oct ? 19 : 17;
  if (oct) {
    const r = tws * 0.62;
    const cx = tx + tws / 2, cz = tz + tws / 2;
    k.cyl(wallM, cx, cz, r, 0, th, 8, { top: null, rot: Math.PI / 8, noTop: true });
    k.cone(roof, cx, cz, r * 1.05, th, th + 7, 8, { rot: Math.PI / 8 });
    k.cyl(stone, cx, cz, r * 1.04, th - 0.6, th, 8, { rot: Math.PI / 8 });
    // front belfry and lower windows
    archPane(k, k.m('window', 1), cx, cz - r * 0.92, th - 6, 1.4, 4, [0, -1], true, 0.02);
    archPane(k, k.m('window', 1), cx, cz - r * 0.92, 4.5, 1.1, 3, [0, -1], true, 0.02);
    k.solidCircle(cx, cz, r);
  } else {
    k.box(wallM, tx, 0, tz, tx + tws, th, tz + tws, { top: roof, noTop: true });
    band(k, stone, tx, tz, tx + tws, tz, 9, 0.4, 0.25, [0, -1]);
    band(k, stone, tx, tz, tx, tz + tws, 9, 0.4, 0.25, [-1, 0]);
    archPane(k, k.m('window', 1), tx + tws / 2, tz, 11, 1.8, 4.6, [0, -1], true, 0.05);
    archPane(k, k.m('window', 1), tx + tws / 2, tz, 3.5, 1.2, 3.4, [0, -1], true, 0.05);
    archPane(k, k.m('window', 1), tx, tz + tws / 2, 11, 1.8, 4.6, [-1, 0], false, 0.05);
    k.cone(slate, tx + tws / 2, tz + tws / 2, tws * 0.75, th, th + (look.spire ? 11 : 4.5), 4, { rot: Math.PI / 4 });
    for (const [px, pz] of [[tx, tz], [tx + tws, tz], [tx, tz + tws], [tx + tws, tz + tws]] as Pt[]) k.cone(stone, px, pz, 0.45, th, th + 2.2, 4);
    k.solidRect(tx, tz, tx + tws, tz + tws);
  }
  // low hall behind the tower
  k.box(wallM, 0.5, 0, tz + tws, tw, 6, naveZ1, { top: roof });
  k.solidRect(0.5, tz + tws, tw, naveZ1);
  // notice board
  signBoard(k, row.name.toUpperCase(), W - 5, 1.2, 1.2, [0, -1], 3.6, '#1c2b46', '#efe6c8', 0);
  k.bar(k.m('metalDark'), [W - 6.9, 0, 1.2], [W - 6.9, 1.4, 1.2], 0.08); k.bar(k.m('metalDark'), [W - 3.1, 0, 1.2], [W - 3.1, 1.4, 1.2], 0.08);
  for (let i = 0; i < 4; i++) tree(k, 8 + rng.next() * (W - 16), 0.9 + rng.next() * 0.6, rng, 0.6 + rng.next() * 0.2, false);
  fence(k, 0, 0, W, 0, { h: 0.9, gaps: [[mid - 2.8, mid + 2.8]], postEvery: 6 });
  void (null as unknown as V3);
}

// ----------------------------------------------------------------------------------------------- armoury

export function* buildArmory(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const ring = localRing(row);
  const W = row.site.w, D = row.site.d;
  const r = insetRect(ring, W, D, 3);
  const brick = k.m('brickRed', 0), stone = k.m('limestone'), roof = k.m('tarRoof', 0), dark = k.m('metalDark');
  const bw = r.x1 - r.x0, hh = 16, hallH = 22;
  k.floor(k.m('concrete'), ring, 0.04);
  yield;
  // headhouse along the front
  const hz1 = r.z0 + 15;
  k.box(brick, r.x0, 0, r.z0, r.x1, hh, hz1, { top: roof });
  rectCornice(k, stone, r.x0, r.z0, r.x1, hz1, hh - 0.5, 0.5, 0.35);
  crenellate(k, brick, r.x0, r.z0, r.x1, r.z0, hh, [0, -1]);
  crenellate(k, brick, r.x1, r.z0, r.x1, hz1, hh, [1, 0]);
  crenellate(k, brick, r.x0, hz1, r.x0, r.z0, hh, [-1, 0]);
  windowBand(k, { x0: r.x0 + 6, z0: r.z0, dx: 1, dz: 0, len: bw - 12, out: [0, -1], y0: 2.3, floors: 3, floorH: 4.2, w: 1.0, h: 2.4, pitch: 3.4, trim: stone, detail, skip: (i, f) => f === 0 && Math.abs(i - ((bw - 12) / 3.4 - 1) / 2) < 3 });
  band(k, stone, r.x0, r.z0, r.x1, r.z0, 3.2, 0.5, 0.25, [0, -1]);
  band(k, stone, r.x0, r.z0, r.x1, r.z0, 11.6, 0.5, 0.25, [0, -1]);
  yield;
  // four corner towers, tall, crenellated, with a corbelled collar
  const towers: Pt[] = [[r.x0 + 4, r.z0 + 4], [r.x1 - 4, r.z0 + 4]];
  for (const [tx, tz] of towers) {
    k.cyl(brick, tx, tz, 5.2, 0, 27, 10, { rot: 0.2 });
    k.cyl(stone, tx, tz, 5.7, 24.5, 25.8, 10, { rot: 0.2 });
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = 0.2 + (i / n) * Math.PI * 2, a1 = 0.2 + ((i + 1) / n) * Math.PI * 2;
      if (i % 2 === 0) continue;
      const P = (a: number, rr: number, y: number): V3 => [tx + Math.cos(a) * rr, y, tz + Math.sin(a) * rr];
      const am = (a0 + a1) / 2;
      k.quad(brick, P(a0, 5.6, 25.8), P(a1, 5.6, 25.8), P(a1, 5.6, 27.6), P(a0, 5.6, 27.6), { hint: [Math.cos(am), 0, Math.sin(am)] });
      k.quad(brick, P(a0, 5.6, 27.6), P(a1, 5.6, 27.6), P(a1, 5.0, 27.6), P(a0, 5.0, 27.6), { hint: [0, 1, 0] });
    }
    for (const a of [-1.2, 0, 1.2]) archPane(k, k.m('window', 3), tx + a * 2.2, tz - 5.1, 14, 0.9, 3.2, [0, -1], true, 0.02);
    k.solidCircle(tx, tz, 5.2);
  }
  // gate tower in the middle: a big arched door
  const gx = (r.x0 + r.x1) / 2;
  k.box(brick, gx - 7, 0, r.z0 - 1.2, gx + 7, 22, r.z0 + 6, { top: roof });
  crenellate(k, brick, gx - 7, r.z0 - 1.2, gx + 7, r.z0 - 1.2, 22, [0, -1]);
  archPane(k, dark, gx, r.z0 - 1.2, 0, 5.4, 8.2, [0, -1], true, 0.05);
  archSurround(k, stone, gx, r.z0 - 1.2, 0, 5.4, 8.2, [0, -1], true, 0.7, 0.08);
  archPane(k, k.m('window', 2), gx, r.z0 - 1.2, 12.5, 2.2, 5, [0, -1], true, 0.05);
  signBoard(k, row.name.toUpperCase(), gx, 9.4, r.z0 - 1.3, [0, -1], 9, '#2a2d33', '#e6dfc7', 0.02);
  k.solidRect(gx - 7, r.z0 - 1.2, gx + 7, r.z0 + 6);
  k.solidRect(r.x0, r.z0, r.x1, hz1);
  yield;
  // the drill hall behind: a long gabled barn with a trussed roof
  const dx0 = r.x0 + 12, dx1 = r.x1 - 12, dz1 = r.z1;
  k.box(brick, dx0, 0, hz1, dx1, hallH - 6, dz1, { noTop: true });
  k.gable(roof, brick, dx0, hz1, dx1, dz1, hallH - 6, hallH + 2, 'x', 0.4);
  windowBand(k, { x0: dx0 + 4, z0: dz1, dx: 1, dz: 0, len: dx1 - dx0 - 8, out: [0, 1], y0: 4, floors: 1, floorH: 5, w: 1.4, h: 6.5, pitch: 4.4, trim: stone, detail });
  k.solidRect(dx0, hz1, dx1, dz1);
  // two rear towers
  for (const [tx, tz] of [[r.x0 + 4, r.z1 - 4], [r.x1 - 4, r.z1 - 4]] as Pt[]) {
    k.cyl(brick, tx, tz, 4.2, 0, 19, 8, { rot: 0.3 });
    k.cone(roof, tx, tz, 4.6, 19, 24, 8);
    k.solidCircle(tx, tz, 4.2);
  }
  void bench; void fence; void tree; void lampPost; void flatRoof; void hip;
}

// ----------------------------------------------------------------------------------------------- school

export function* buildSchool(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const brick = k.m('brickRed', 0), stone = k.m('limestone'), cornice = k.m('cornice'), roof = k.m('tarRoof', 1);
  const floors = Number(row.look.floors ?? 4), fh = 4.3;
  const H = floors * fh;
  const front = 15, wing = 16;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  yield;
  // U plan: front block along the street, two wings running back
  const parts: Array<[number, number, number, number]> = [[0, 0, W, front], [0, front, wing, D], [W - wing, front, W, D]];
  for (const [x0, z0, x1, z1] of parts) {
    k.box(brick, x0, 0, z0, x1, H, z1, { top: roof });
    rectCornice(k, cornice, x0, z0, x1, z1, H - 0.6, 0.6, 0.5);
    flatRoof(k, roof, brick, x0, z0, x1, z1, H, 0.6);
    k.solidRect(x0, z0, x1, z1);
  }
  // windows: front facade in groups of two, stone string courses between floors
  for (let f = 0; f < floors; f++) band(k, stone, 0, 0, W, 0, f * fh + 0.2, 0.3, 0.15, [0, -1]);
  windowBand(k, { x0: 0, z0: 0, dx: 1, dz: 0, len: W, out: [0, -1], y0: 1.4, floors, floorH: fh, w: 1.5, h: 2.6, pitch: 2.5, margin: 2, trim: stone, detail, skip: (i, f) => f === 0 && Math.abs(i - ((W - 4) / 2.5) / 2) < 2 });
  windowBand(k, { x0: wing, z0: front, dx: 0, dz: 1, len: D - front, out: [1, 0], y0: 1.4, floors, floorH: fh, w: 1.5, h: 2.6, pitch: 2.6, trim: stone, detail });
  windowBand(k, { x0: W - wing, z0: front, dx: 0, dz: 1, len: D - front, out: [-1, 0], y0: 1.4, floors, floorH: fh, w: 1.5, h: 2.6, pitch: 2.6, trim: stone, detail });
  windowBand(k, { x0: 0, z0: D, dx: 1, dz: 0, len: wing, out: [0, 1], y0: 1.4, floors, floorH: fh, w: 1.5, h: 2.6, pitch: 2.6, trim: null, detail });
  windowBand(k, { x0: W - wing, z0: D, dx: 1, dz: 0, len: wing, out: [0, 1], y0: 1.4, floors, floorH: fh, w: 1.5, h: 2.6, pitch: 2.6, trim: null, detail });
  yield;
  // entrance portico: four columns and a pediment
  const mx = W / 2, pw = 14;
  k.box(stone, mx - pw / 2, 0, -2.6, mx + pw / 2, 0.45, 0.1, { top: stone });
  steps(k, stone, mx, -2.6, 8, 4, 0.12, 0.45, [0, -1]);
  for (let i = 0; i < 4; i++) { const x = mx - pw / 2 + 1.2 + (i * (pw - 2.4)) / 3; k.cyl(stone, x, -2.0, 0.55, 0.45, 8.2, 8); k.solidCircle(x, -2.0, 0.6); }
  k.box(stone, mx - pw / 2, 8.2, -2.6, mx + pw / 2, 9.2, 0.1, { top: stone });
  k.tri(stone, [mx - pw / 2, 9.2, -2.6], [mx + pw / 2, 9.2, -2.6], [mx, 11.4, -2.6], { hint: [0, 0, -1] });
  k.tri(stone, [mx + pw / 2, 9.2, 0.1], [mx - pw / 2, 9.2, 0.1], [mx, 11.4, 0.1], { hint: [0, 0, 1] });
  k.quad(stone, [mx - pw / 2, 9.2, -2.6], [mx, 11.4, -2.6], [mx, 11.4, 0.1], [mx - pw / 2, 9.2, 0.1], { hint: [-1, 1, 0] });
  k.quad(stone, [mx + pw / 2, 9.2, 0.1], [mx, 11.4, 0.1], [mx, 11.4, -2.6], [mx + pw / 2, 9.2, -2.6], { hint: [1, 1, 0] });
  archPane(k, k.m('metalDark'), mx, 0, 0.45, 3.0, 4.2, [0, -1], true, 0.06);
  signBoard(k, row.name.toUpperCase(), mx, 9.6, -2.7, [0, -1], 7, '#2a2d33', '#e8dfc4', 0.05);
  // round corner tower with a conical roof, at the left end
  const tr = 3.6, tx = tr + 0.4, tz = tr + 0.2;
  k.cyl(brick, tx, tz, tr, 0, H + 6, 10, { rot: 0.2 });
  k.cyl(stone, tx, tz, tr + 0.3, H + 5.4, H + 6.6, 10, { rot: 0.2 });
  k.cone(roof, tx, tz, tr + 0.5, H + 6.6, H + 15, 10, { rot: 0.2 });
  for (let f = 0; f < 4; f++) archPane(k, k.m('window', 0), tx, tz - tr * 0.93, 1.4 + f * 4.6, 1.0, 2.4, [0, -1], true, 0.02);
  // the yard: play-court paint and a few trees
  k.floor(k.flatM, [[wing + 3, front + 3], [W - wing - 3, front + 3], [W - wing - 3, D - 2], [wing + 3, D - 2]], 0.06, { color: 0x575b5e });
  fence(k, wing, D, W - wing, D, { h: 2.4, mat: k.m('chainlinkFence'), postEvery: 6 });
  for (let i = 0; i < 6; i++) tree(k, 4 + rng.next() * (W - 8), -4 - rng.next() * 0.5, rng, 0.7, false);
  yield;
}

// ----------------------------------------------------------------------------------------------- hospital

export function* buildHospital(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const ring = localRing(row);
  const W = row.site.w, D = row.site.d;
  const wall = k.m('brickPainted', 0), concrete = k.m('concrete'), roof = k.m('tarRoof', 1), stone = k.m('limestone');
  k.floor(concrete, ring, 0.04);
  const r = insetRect(ring, W, D, 10);
  const cx = (r.x0 + r.x1) / 2;
  yield;
  // car park in front with painted bays
  const pz0 = r.z0 + 2, pz1 = r.z0 + 34;
  k.floor(k.m('asphalt'), [[r.x0, pz0], [r.x1, pz0], [r.x1, pz1], [r.x0, pz1]], 0.05);
  for (let x = r.x0 + 6; x < r.x1 - 4; x += 2.8) { k.quad(k.flatM, [x, 0.07, pz0 + 1], [x + 0.12, 0.07, pz0 + 1], [x + 0.12, 0.07, pz0 + 6], [x, 0.07, pz0 + 6], { hint: [0, 1, 0], color: 0xe8e4d6 }); }
  for (let i = 0; i < 9; i++) tree(k, r.x0 + 10 + i * ((r.x1 - r.x0 - 20) / 8), pz1 + 2, rng, 0.8, false);
  // podium: three storeys, long, with strip windows
  const bz0 = pz1 + 6, podH = 13;
  k.box(wall, r.x0 + 20, 0, bz0, r.x1 - 20, podH, bz0 + 40, { top: roof });
  flatRoof(k, roof, wall, r.x0 + 20, bz0, r.x1 - 20, bz0 + 40, podH, 0.8);
  windowBand(k, { x0: r.x0 + 20, z0: bz0, dx: 1, dz: 0, len: r.x1 - r.x0 - 40, out: [0, -1], y0: 1.2, floors: 3, floorH: 4, w: 2.2, h: 2, pitch: 3.2, trim: null, detail, skip: (i, f) => f === 0 && Math.abs(i - ((r.x1 - r.x0 - 40) / 3.2) / 2) < 3 });
  k.solidRect(r.x0 + 20, bz0, r.x1 - 20, bz0 + 40);
  // the tower slab on top and behind
  const TH = Number(row.look.height ?? 75);
  const tx0 = cx - 50, tx1 = cx + 50, tz0 = bz0 + 6, tz1 = tz0 + 28;
  k.box(wall, tx0, podH, tz0, tx1, TH, tz1, { top: roof });
  flatRoof(k, roof, wall, tx0, tz0, tx1, tz1, TH, 1.0);
  const fl = Math.round((TH - podH) / 3.8);
  for (const [zz, out] of [[tz0, [0, -1]], [tz1, [0, 1]]] as Array<[number, [number, number]]>) {
    windowBand(k, { x0: tx0, z0: zz, dx: 1, dz: 0, len: tx1 - tx0, out, y0: podH + 1.1, floors: fl, floorH: 3.8, w: 2.0, h: 1.6, pitch: 2.8, trim: null, detail });
  }
  for (const [xx, out] of [[tx0, [-1, 0]], [tx1, [1, 0]]] as Array<[number, [number, number]]>) windowBand(k, { x0: xx, z0: tz0, dx: 0, dz: 1, len: tz1 - tz0, out, y0: podH + 1.1, floors: fl, floorH: 3.8, w: 1.6, h: 1.6, pitch: 3, trim: null, detail });
  band(k, stone, tx0, tz0, tx1, tz0, TH - 1.2, 1.2, 0.3, [0, -1]);
  k.box(k.m('brickPainted', 2), cx - 6, TH + 1, tz0 + 8, cx + 6, TH + 5, tz0 + 20, { top: roof });
  k.solidRect(tx0, podH * 0 + tz0, tx1, tz1);
  yield;
  // entrance canopy and the emergency sign
  k.box(k.m('metalDark'), cx - 8, 4.3, bz0 - 8, cx + 8, 4.6, bz0 + 0.2, { top: k.m('metalDark') });
  for (const x of [cx - 7.5, cx + 7.5]) { k.cyl(k.m('metalDark'), x, bz0 - 7.5, 0.18, 0, 4.3, 6); k.solidCircle(x, bz0 - 7.5, 0.3); }
  signBoard(k, row.name.toUpperCase(), cx, podH - 3.2, bz0 - 0.15, [0, -1], 14, '#1d4a73', '#f1f1ee', 0);
  signBoard(k, 'EMERGENCY', r.x0 + 36, 5.5, bz0 - 0.15, [0, -1], 6, '#a82020', '#ffffff', 0);
  // low wings
  k.box(wall, r.x0 + 4, 0, bz0 + 8, r.x0 + 20, 8, bz0 + 56, { top: roof });
  k.box(wall, r.x1 - 20, 0, bz0 + 8, r.x1 - 4, 8, bz0 + 56, { top: roof });
  k.solidRect(r.x0 + 4, bz0 + 8, r.x0 + 20, bz0 + 56); k.solidRect(r.x1 - 20, bz0 + 8, r.x1 - 4, bz0 + 56);
  windowBand(k, { x0: r.x0 + 20, z0: bz0 + 8, dx: 0, dz: 1, len: 48, out: [1, 0], y0: 1.2, floors: 2, floorH: 3.6, w: 2, h: 1.8, pitch: 3.2, trim: null, detail });
  fence(k, r.x0 - 4, 0, r.x1 + 4, 0, { h: 1.0, gaps: [[cx - 6, cx + 6]], postEvery: 6 });
}

// ----------------------------------------------------------------------------------------------- library

export function* buildLibrary(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const W = row.site.w, D = row.site.d;
  const wall = k.m('limestone'), brick = k.m('brickRed', 1), roof = k.m('tarRoof', 0);
  k.floor(k.grassM, [[0, 0], [W, 0], [W, D], [0, D]], 0.02, { uvScale: 1 / 4 });
  const bx0 = 3, bx1 = W - 3, bz0 = 7, bz1 = D - 1, base = 1.7, eave = 8.6;
  // raised base, brick walls above it
  k.box(wall, bx0, 0, bz0, bx1, base, bz1, { top: wall });
  k.box(brick, bx0 + 0.3, base, bz0 + 0.3, bx1 - 0.3, eave, bz1 - 0.3, { noTop: true });
  hip(k, roof, bx0, bz0, bx1, bz1, eave, eave + 3.6, 0.5);
  rectCornice(k, wall, bx0, bz0, bx1, bz1, eave - 0.5, 0.5, 0.45);
  const mid = W / 2;
  // portico: four columns and a pediment over the doors
  const pw = 11;
  k.box(wall, mid - pw / 2 - 1, 0, 0.5, mid + pw / 2 + 1, 0.4, bz0 + 0.3, { top: wall });
  steps(k, wall, mid, 0.5, 9, 6, 0.28, 0.5, [0, -1]);
  for (let i = 0; i < 4; i++) { const x = mid - pw / 2 + 0.8 + (i * (pw - 1.6)) / 3; k.cyl(wall, x, 2.2, 0.5, base, eave - 1.4, 8); k.solidCircle(x, 2.2, 0.55); }
  k.box(wall, mid - pw / 2, eave - 1.4, 1.4, mid + pw / 2, eave - 0.2, bz0 + 0.2, { top: wall });
  k.tri(wall, [mid - pw / 2, eave - 0.2, 1.4], [mid + pw / 2, eave - 0.2, 1.4], [mid, eave + 1.9, 1.4], { hint: [0, 0, -1] });
  k.quad(roof, [mid - pw / 2 - 0.3, eave - 0.2, 1.2], [mid, eave + 1.95, 1.2], [mid, eave + 1.95, bz0 + 0.3], [mid - pw / 2 - 0.3, eave - 0.2, bz0 + 0.3], { hint: [-1, 1, 0] });
  k.quad(roof, [mid + pw / 2 + 0.3, eave - 0.2, bz0 + 0.3], [mid, eave + 1.95, bz0 + 0.3], [mid, eave + 1.95, 1.2], [mid + pw / 2 + 0.3, eave - 0.2, 1.2], { hint: [1, 1, 0] });
  archPane(k, k.m('metalDark'), mid, bz0, base, 2.4, 4.4, [0, -1], true, 0.1);
  signBoard(k, row.name.toUpperCase(), mid, eave - 1.2, 1.3, [0, -1], 7.5, '#1c2b46', '#efe6c8', 0);
  // tall arched windows each side
  for (const [x0, len] of [[bx0 + 0.3, mid - pw / 2 - 1 - bx0 - 0.3], [mid + pw / 2 + 1, bx1 - 0.3 - mid - pw / 2 - 1]] as Array<[number, number]>) {
    const n = Math.max(1, Math.floor(len / 3.2));
    for (let i = 0; i < n; i++) {
      const cx = x0 + (len * (i + 0.5)) / n;
      archPane(k, k.m('window', i % 4), cx, bz0 + 0.3, base + 0.9, 1.7, 5, [0, -1], true, 0.05);
      archSurround(k, wall, cx, bz0 + 0.3, base + 0.9, 1.7, 5, [0, -1], true, 0.25, 0.08);
    }
  }
  windowBand(k, { x0: bx0 + 0.3, z0: bz1 - 0.3, dx: 1, dz: 0, len: bx1 - bx0 - 0.6, out: [0, 1], y0: base + 1, floors: 1, floorH: 4, w: 1.5, h: 4.2, pitch: 3.6, trim: wall, detail });
  k.solidRect(bx0, bz0, bx1, bz1);
  k.solidRect(mid - pw / 2, 0.5, mid + pw / 2, 4);
  fence(k, 0, 0.2, W, 0.2, { h: 0.9, gaps: [[mid - 5, mid + 5]], postEvery: 6 });
  yield;
}

// ----------------------------------------------------------------------------------------------- station house

export function* buildStationHouse(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const W = row.site.w, D = row.site.d;
  const wall = k.m('brickRed', 1), stone = k.m('brownstone'), roof = k.m('tarRoof', 0);
  const H = 17, fh = 5;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  const x0 = 1, x1 = W - 1, z0 = 2.2, z1 = D - 1;
  k.box(wall, x0, 0, z0, x1, H, z1, { top: roof });
  // stone base and string courses
  band(k, stone, x0, z0, x1, z0, 0, 1.1, 0.12, [0, -1]);
  for (let f = 1; f < 3; f++) band(k, stone, x0, z0, x1, z0, f * fh - 0.4, 0.4, 0.15, [0, -1]);
  rectCornice(k, stone, x0, z0, x1, z1, H - 0.7, 0.7, 0.5);
  hip(k, roof, x0, z0, x1, z1, H, H + 3.2, 0.5);
  // the arched entry, a pair of lamps and steps
  const ex = x0 + (x1 - x0) * 0.62;
  archPane(k, k.m('metalDark'), ex, z0, 0.5, 2.6, 4.2, [0, -1], true, 0.06);
  archSurround(k, stone, ex, z0, 0.5, 2.6, 4.2, [0, -1], true, 0.55, 0.12);
  steps(k, stone, ex, z0, 4, 3, 0.17, 0.5, [0, -1]);
  for (const s of [-1, 1]) { const lx = ex + s * 2.8; k.cyl(k.m('metalDark'), lx, z0 - 0.9, 0.07, 0, 2.6, 5); k.cyl(k.flatM, lx, z0 - 0.9, 0.24, 2.6, 3.1, 6, { color: 0x4a86d8 }); }
  // paired arched windows up the front, the left part
  for (let f = 0; f < 3; f++) {
    for (const wx of [x0 + 2.6, x0 + 6.3]) {
      if (f === 0 && wx > ex - 3) continue;
      archPane(k, k.m('window', (f + 1) % 4), wx, z0, f * fh + 1.4, 1.4, 2.8, [0, -1], true, 0.05);
      archSurround(k, stone, wx, z0, f * fh + 1.4, 1.4, 2.8, [0, -1], true, 0.22, 0.08);
    }
    if (f > 0) { archPane(k, k.m('window', (f + 2) % 4), ex, z0, f * fh + 1.4, 1.6, 2.8, [0, -1], true, 0.05); archSurround(k, stone, ex, z0, f * fh + 1.4, 1.6, 2.8, [0, -1], true, 0.22, 0.08); }
  }
  // round tower on the left corner with a cone
  const tr = 3.2, tcx = x0 + 0.4, tcz = z0 + 0.4;
  k.cyl(wall, tcx, tcz, tr, 0, H + 1.5, 9, { rot: 0.3 });
  k.cyl(stone, tcx, tcz, tr + 0.3, H + 0.8, H + 1.8, 9, { rot: 0.3 });
  k.cone(roof, tcx, tcz, tr + 0.5, H + 1.8, H + 9, 9, { rot: 0.3 });
  signBoard(k, row.name.toUpperCase(), ex + 1, 4.4, z0 - 0.25, [0, -1], 5.2, '#0f2f6b', '#f2f2f2', 0);
  windowBand(k, { x0: x1, z0, dx: 0, dz: 1, len: z1 - z0, out: [1, 0], y0: 1.6, floors: 3, floorH: fh, w: 1.4, h: 2.6, pitch: 3.4, trim: stone, detail });
  k.solidRect(x0, z0, x1, z1);
  void lampPost; void bench; void tree; void flatRoof;
  yield;
}

// ----------------------------------------------------------------------------------------------- firehouse

export function* buildFirehouse(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const W = row.site.w, D = row.site.d;
  const wall = k.m('brickRed', 0), stone = k.m('limestone'), roof = k.m('tarRoof', 1);
  const H = 13;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  k.box(wall, 0, 0, 1.2, W, H, D, { top: roof });
  flatRoof(k, roof, wall, 0, 1.2, W, D, H, 0.9);
  rectCornice(k, stone, 0, 1.2, W, D, H - 0.5, 0.5, 0.4);
  // apron
  k.floor(k.flatM, [[0, 0], [W, 0], [W, 1.2], [0, 1.2]], 0.05, { color: 0x8c8a86 });
  // the bay: big arched door, red, with a stone surround
  const cx = W / 2;
  archPane(k, k.flatM, cx, 1.2, 0.2, Math.min(W - 1.6, 5.4), 5.4, [0, -1], true, 0.05);
  archSurround(k, stone, cx, 1.2, 0.2, Math.min(W - 1.6, 5.4), 5.4, [0, -1], true, 0.5, 0.1);
  // paint the arch pane red by laying a coloured quad in front (the flat material is vertex coloured)
  k.quad(k.flatM, [cx - 2.6, 0.2, 1.12], [cx + 2.6, 0.2, 1.12], [cx + 2.6, 4.3, 1.12], [cx - 2.6, 4.3, 1.12], { hint: [0, 0, -1], color: 0xa3261f });
  for (let f = 0; f < 2; f++) {
    archPane(k, k.m('window', f), cx, 1.2, 6.6 + f * 3.1, 1.5, 2.3, [0, -1], true, 0.05);
    archSurround(k, stone, cx, 1.2, 6.6 + f * 3.1, 1.5, 2.3, [0, -1], true, 0.2, 0.08);
  }
  signBoard(k, row.name.toUpperCase(), cx, 5.9, 1.05, [0, -1], Math.min(W - 0.4, 4.4), '#8c1c14', '#f2e9d0', 0);
  windowBand(k, { x0: 0, z0: D, dx: 1, dz: 0, len: W, out: [0, 1], y0: 2, floors: 3, floorH: 3.4, w: 1.3, h: 1.8, pitch: 3, trim: null, detail });
  k.solidRect(0, 1.2, W, D);
  yield;
}

// ----------------------------------------------------------------------------------------------- depot

export function* buildDepot(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const wall = k.m('corrugatedSteel', 0), brick = k.m('brickRed', 1), roof = k.m('tarRoof', 1), gate = k.m('rollGate', 0);
  k.floor(k.m('asphalt'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  const bd = 12, H = 12;
  // garage block along the street with a row of bay doors
  k.box(brick, 0.5, 0, 1, W - 0.5, H, 1 + bd, { top: roof });
  flatRoof(k, roof, brick, 0.5, 1, W - 0.5, 1 + bd, H, 0.9);
  const bays = Math.max(3, Math.floor((W - 6) / 8));
  for (let i = 0; i < bays; i++) {
    const cx = 3 + (i + 0.5) * ((W - 6) / bays);
    k.quad(gate, [cx - 3, 0.04, 0.94], [cx + 3, 0.04, 0.94], [cx + 3, 5.4, 0.94], [cx - 3, 5.4, 0.94], { hint: [0, 0, -1], ru: 2, rv: 1.8 });
    k.box(k.m('cornice'), cx - 3.3, 5.4, 0.9, cx + 3.3, 5.9, 1.1);
  }
  windowBand(k, { x0: 0.5, z0: 1, dx: 1, dz: 0, len: W - 1, out: [0, -1], y0: 7.4, floors: 1, floorH: 3, w: 2.2, h: 1.6, pitch: 3.4, trim: null, detail });
  signBoard(k, row.name.toUpperCase(), W / 2, H - 3.6, 0.9, [0, -1], Math.min(14, W * 0.6), '#2a4d3a', '#f1ecd8', 0);
  k.solidRect(0.5, 1, W - 0.5, 1 + bd);
  yield;
  // trucks in the yard: boxy, green and white
  const truckX = [4, 15, 27, 39, 50];
  for (let i = 0; i < Math.min(truckX.length, Math.floor((W - 8) / 11)); i++) {
    const tx = truckX[i], tz = bd + 4 + (i % 2) * 0.8;
    k.box(k.flatM, tx, 0.7, tz, tx + 2.4, 3.4, tz + 7, { color: 0x3b7a52 });
    k.box(k.flatM, tx, 0.7, tz + 7.2, tx + 2.4, 2.8, tz + 9, { color: 0xe6e8e2 });
    for (const [a, b] of [[0.2, 0.7], [0.2, 7.9], [2.2, 0.7], [2.2, 7.9]]) k.cyl(k.m('tire'), tx + a, tz + b, 0.5, 0, 1, 6);
    k.solidRect(tx, tz, tx + 2.4, tz + 9);
  }
  fence(k, 0, 0, W, 0, { h: 2.4, mat: k.m('chainlinkFence'), postEvery: 6, gaps: [[W / 2 - 4, W / 2 + 4]] });
  void rng;
}
