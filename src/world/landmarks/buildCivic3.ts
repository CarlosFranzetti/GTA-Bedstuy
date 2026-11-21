/**
 * LANDMARKS3 builders, read off open-licence photographs of Bed-Stuy buildings: a Victorian Gothic school with a central tower
 * (red brick, brownstone base, mansard slate, belfry lantern), a Moorish-revival apartment house (tan brick, terracotta pilasters,
 * corner bay with a pyramid roof, red tile mansard with dormers, a shop arcade) and a Gothic stone church with a street gable
 * (big round window, pointed porch, buttresses). Same kit and rules as buildCivic2.ts. Local frame: x along the frontage,
 * z into the site, y up; the street front faces [0, -1].
 */
import type { BuildCtx } from './buildPark';
import { archRun } from './buildCivic2';
import { archPane, archSurround, band, disc, fence, hip, lampPost, lancetPane, lancetSurround, signBoard, steps, tree, windowBand } from './parts';

type Out = [number, number];

/** a plain cross finial (two bars) */
function finial(k: BuildCtx['k'], x: number, y: number, z: number, h: number, color: number): void {
  k.box(k.flatM, x - 0.06, y, z - 0.06, x + 0.06, y + h, z + 0.06, { color });
  k.box(k.flatM, x - 0.3, y + h * 0.62, z - 0.05, x + 0.3, y + h * 0.62 + 0.12, z + 0.05, { color });
}

// ----------------------------------------------------------------------------------------------- Victorian Gothic school

/**
 * `look.floors` (3), brick body on a brownstone base with arch-headed ground windows, stone-hooded windows above, a bracketed
 * cornice, slate mansard with dormers over the wings, end pavilions, and a central pavilion with a columned portico and balcony
 * under a tall tower (belfry lantern and a steep slate spire).
 */
export function* buildGothicSchool(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const brick = k.m('brickRed', 0), stone = k.m('brownstone'), trim = k.m('limestone'), cornice = k.m('cornice'), slate = k.m('tarRoof', 0), dark = k.m('metalDark'), glass = k.m('window', 1);
  const floors = Number(row.look.floors ?? 3), fh = 4.3, base = 2.6;
  const H = base + floors * fh - 0.6;
  const zf = 2.6, depth = Math.min(D - 1, 16);
  const mx = W / 2, pwHalf = 6.8, ew = Math.min(11, W * 0.15);
  const SLATE = 0x39434d;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  yield;
  // body, with the brownstone base laid in front of the brick
  k.box(brick, 0.2, 0, zf, W - 0.2, H, zf + depth, { top: slate });
  k.solidRect(0.2, zf, W - 0.2, zf + depth);
  k.box(stone, 0.2, 0, zf - 0.15, W - 0.2, base, zf, { top: stone });
  band(k, stone, 0.2, zf, W - 0.2, zf, base + 0.1, 0.3, 0.25, [0, -1]);
  band(k, cornice, 0.2, zf, W - 0.2, zf, H - 0.7, 0.7, 0.55, [0, -1]);
  if (detail > 0) for (let f = 1; f < floors; f++) band(k, stone, 0.2, zf, W - 0.2, zf, base + f * fh - 0.2, 0.22, 0.1, [0, -1]);
  // wings: shallow slate mansard between the pavilions
  hip(k, slate, ew, zf, W - ew, zf + depth, H, H + 3.4, 0.3);
  // end pavilions: project a little, steeper hipped slate roofs, a finial
  for (const [a, b] of [[0.2, ew], [W - ew, W - 0.2]] as Array<[number, number]>) {
    k.box(brick, a, 0, zf - 0.9, b, H + 0.2, zf + depth, { noTop: true });
    band(k, cornice, a, zf - 0.9, b, zf - 0.9, H - 0.7, 0.7, 0.5, [0, -1]);
    hip(k, slate, a, zf - 0.9, b, zf + depth, H + 0.2, H + 6.4, 0.35);
    k.solidRect(a, zf - 0.9, b, zf);
    finial(k, (a + b) / 2, H + 6.3, zf + depth / 2, 1.8, 0x2e2a28);
  }
  yield;
  // windows: arch-headed on the ground floor, stone-hooded above (all three bays of the front)
  const wz = zf - 0.01;
  for (const [x0, x1] of [[0.4, mx - pwHalf - 0.6], [mx + pwHalf + 0.6, W - 0.4]] as Array<[number, number]>) {
    archRun(k, { alongX: true, at: wz, from: x0, to: x1, out: [0, -1], y0: 0.7, floors: 1, floorH: 1, pitch: 3.2, w: 1.5, h: 3.2, hood: trim, detail });
    windowBand(k, { x0, z0: wz, dx: 1, dz: 0, len: x1 - x0, out: [0, -1], y0: base + 0.7, floors: floors - 0 > 0 ? floors : 1, floorH: fh, w: 1.5, h: 2.6, pitch: 3.2, margin: 0.9, trim: detail > 0 ? trim : null, detail });
  }
  // dormers on the mansard
  if (detail > 0) for (let x = ew + 3; x < W - ew - 2; x += 5.6) {
    k.box(brick, x - 0.8, H + 0.2, zf + 0.9, x + 0.8, H + 2.4, zf + 1.9, { noTop: true });
    k.gable(slate, brick, x - 0.95, zf + 0.9, x + 0.95, zf + 1.9, H + 2.4, H + 3.5, 'z', 0.12);
    archPane(k, glass, x, zf + 0.9, H + 0.4, 0.9, 1.7, [0, -1], true, 0.02);
  }
  yield;
  // the central pavilion and its tower
  const ptop = H + 8.2;
  k.box(brick, mx - pwHalf, 0, zf - 1.2, mx + pwHalf, ptop, zf + 7.5, { top: slate });
  k.solidRect(mx - pwHalf, zf - 1.2, mx + pwHalf, zf + 7.5);
  k.box(stone, mx - pwHalf - 0.1, 0, zf - 1.3, mx + pwHalf + 0.1, base, zf - 1.15, { top: stone });
  band(k, cornice, mx - pwHalf, zf - 1.2, mx + pwHalf, zf - 1.2, ptop - 0.9, 0.9, 0.6, [0, -1]);
  band(k, stone, mx - pwHalf, zf - 1.2, mx + pwHalf, zf - 1.2, base + 0.1, 0.3, 0.25, [0, -1]);
  // pavilion windows over the portico, in pairs
  const pz = zf - 1.21;
  for (let f = 0; f < floors; f++) {
    if (f === 0) continue;
    for (const dx of [-1.4, 1.4]) { archPane(k, glass, mx + dx, pz, base + f * fh - 1.0, 1.4, 2.8, [0, -1], true, 0.03); archSurround(k, trim, mx + dx, pz, base + f * fh - 1.0, 1.4, 2.8, [0, -1], true, 0.28, 0.06); }
  }
  archPane(k, glass, mx, pz, ptop - 5.0, 1.8, 3.4, [0, -1], true, 0.03);
  archSurround(k, trim, mx, pz, ptop - 5.0, 1.8, 3.4, [0, -1], true, 0.3, 0.06);
  // portico: two columns, an entablature, a balcony with balusters, a dark pointed-arch door
  steps(k, trim, mx, zf - 1.2, 6.5, 5, 0.14, 0.5, [0, -1]);
  const cz = zf - 3.0;
  for (const dx of [-2.3, 2.3]) { k.cyl(stone, mx + dx, cz, 0.5, 0.7, base + 3.2, 8); k.solidCircle(mx + dx, cz, 0.55); }
  k.box(stone, mx - 3.4, base + 3.2, cz - 0.7, mx + 3.4, base + 3.9, zf - 1.2, { top: stone });
  if (detail > 0) for (let i = 0; i <= 12; i++) { const bx = mx - 3.2 + (i * 6.4) / 12; k.bar(k.m('metalDark'), [bx, base + 3.9, cz - 0.55], [bx, base + 4.7, cz - 0.55], 0.06); }
  k.bar(k.m('metalDark'), [mx - 3.2, base + 4.7, cz - 0.55], [mx + 3.2, base + 4.7, cz - 0.55], 0.08);
  archPane(k, dark, mx, zf - 1.2, 0.8, 2.6, 3.6, [0, -1], true, 0.04);
  signBoard(k, row.name.toUpperCase(), mx, base + 4.9, cz - 0.8, [0, -1], 6, '#2a2d33', '#e8dfc4', 0.04);
  // tower: belfry lantern (eight sides, open arches) and a steep slate spire
  const lr = 2.5, ly0 = ptop + 1.4, ly1 = ly0 + 5.2;
  k.box(stone, mx - 3.6, ptop, zf - 0.3, mx + 3.6, ptop + 1.4, zf + 6.2, { top: stone });
  k.cyl(brick, mx, zf + 3, lr, ly0, ly1, 8, { rot: Math.PI / 8 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const dx = Math.cos(a), dz = Math.sin(a); archPane(k, dark, mx + dx * (lr * 0.93), zf + 3 + dz * (lr * 0.93), ly0 + 0.9, 0.9, 2.4, [dx, dz] as Out, Math.abs(dz) > 0.5, 0.05); }
  k.cone(k.flatM, mx, zf + 3, lr + 0.7, ly1, ly1 + 1.0, 8, { color: 0x2d353d, rot: Math.PI / 8, r1: lr + 0.2 });
  k.cone(k.flatM, mx, zf + 3, lr + 0.4, ly1 + 1.0, ly1 + 11, 8, { color: SLATE, rot: Math.PI / 8 });
  finial(k, mx, ly1 + 10.8, zf + 3, 2.0, 0x2e2a28);
  k.solidCircle(mx, zf + 3, lr);
  yield;
  // iron fence with a gate at the steps, a few young trees
  fence(k, 0, 0.3, W, 0.3, { h: 1.2, gaps: [[mx - 3.6, mx + 3.6]], postEvery: 3 });
  for (let i = 0; i < 3; i++) tree(k, 8 + rng.next() * (W - 16), 1.2, rng, 0.5, false);
  if (detail > 0) { lampPost(k, mx - 5, 0.9, 3.4); lampPost(k, mx + 5, 0.9, 3.4); }
}

// ----------------------------------------------------------------------------------------------- Moorish-revival apartment house

/**
 * A long tan-brick apartment house of four storeys over a shop arcade: terracotta pilasters in pairs, spandrel bands, a top-floor
 * arcade of small arches, a projecting corner bay under a pyramid roof, a red tile mansard with dormers, tall chimneys.
 * `look.floors` (4), `look.bayAt` (0..1, where the pyramid bay stands), `look.shop` (the parody name over the corner shop).
 */
export function* buildMoorish(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const wall = k.m('brickRed', 1), trim = k.m('limestone'), cornice = k.m('cornice'), glass = k.m('window', 1), dark = k.m('metalDark');
  const floors = Number(row.look.floors ?? 3), gh = 4.3, fh = 3.5;
  const H = gh + floors * fh;
  const depth = Math.min(D - 0.5, 18);
  const TILE = 0xa5503a, TERRA = 0xb4623f, AWN = 0x2f5b4a;
  const bayAt = Number(row.look.bayAt ?? 0.5), bw = 9;
  const bx0 = Math.max(2, Math.min(W - bw - 2, W * bayAt - bw / 2)), bx1 = bx0 + bw;
  k.floor(k.m('concrete'), [[0, -3], [W, -3], [W, 0], [0, 0]], 0.05);
  yield;
  k.box(wall, 0, 0, 0, W, H, depth, { top: k.m('tarRoof', 1) });
  k.solidRect(0, 0, W, depth);
  // mansard of red tile over the body (a hip at the ends) and dormers
  hip(k, k.m('tarRoof', 2), 0, 0, W, depth, H, H + 4.2, 0.4);
  band(k, cornice, 0, 0, W, 0, H - 0.8, 0.8, 0.6, [0, -1]);
  // spandrel bands between the floors, terracotta pilasters in pairs
  if (detail > 0) {
    for (let f = 0; f <= floors; f++) band(k, trim, 0, 0, W, 0, gh + f * fh - 0.45, 0.35, 0.14, [0, -1]);
    for (let x = 3.2; x < W - 1; x += 6.4) for (const dx of [0, 0.7]) k.box(trim, x + dx, gh, -0.16, x + dx + 0.4, H - 0.8, 0.0);
  }
  // windows between the pilasters: pairs, flat-headed, with a stone head; the top floor is an arcade of small arches
  windowBand(k, { x0: 0, z0: -0.01, dx: 1, dz: 0, len: W, out: [0, -1], y0: gh + 0.7, floors: floors - 1, floorH: fh, w: 1.3, h: 2.1, pitch: 3.2, margin: 1.6, trim: detail > 0 ? trim : null, detail,  });
  archRun(k, { alongX: true, at: -0.01, from: 1.2, to: W - 1.2, out: [0, -1], y0: gh + (floors - 1) * fh + 0.6, floors: 1, floorH: fh, pitch: 1.6, w: 0.95, h: 2.1, hood: trim, detail });
  // ground floor: a shop arcade (arches and a green canopy) with the corner shop name over it
  archRun(k, { alongX: true, at: -0.01, from: 1.2, to: W - 1.2, out: [0, -1], y0: 0.5, floors: 1, floorH: 1, pitch: 3.2, w: 1.7, h: 3.0, hood: trim, detail });
  k.box(k.flatM, 3.5, 3.1, -1.6, W * 0.6, 3.4, 0, { color: AWN });
  k.box(k.flatM, 3.5, 3.4, -1.6, W * 0.6, 3.7, -1.2, { color: AWN });
  for (const x of [3.6, W * 0.6 - 0.1]) k.bar(dark, [x, 0, -1.5], [x, 3.1, -1.5], 0.07);
  signBoard(k, String(row.look.shop ?? 'CORNER MARKET').toUpperCase(), W * 0.3, 3.9, -0.02, [0, -1], 6.4, '#23402f', '#efe6c8', 0.02);
  yield;
  // the corner bay: it projects, carries a cornice, and ends in a steep pyramid with dormers
  k.box(wall, bx0, 0, -1.3, bx1, H + 1.2, 2.6, { noTop: true });
  band(k, cornice, bx0, -1.3, bx1, -1.3, H - 0.8, 0.8, 0.5, [0, -1]);
  band(k, cornice, bx1, -1.3, bx1, 2.6, H - 0.8, 0.8, 0.5, [1, 0]);
  band(k, cornice, bx0, 2.6, bx0, -1.3, H - 0.8, 0.8, 0.5, [-1, 0]);
  windowBand(k, { x0: bx0, z0: -1.31, dx: 1, dz: 0, len: bw, out: [0, -1], y0: gh + 0.7, floors: floors, floorH: fh, w: 1.4, h: 2.3, pitch: 2.8, margin: 1.2, trim: detail > 0 ? trim : null, detail });
  for (const x of [bx0 + 0.15, bx1 - 0.65]) k.box(trim, x, gh, -1.45, x + 0.5, H - 0.8, -1.2);
  k.cone(k.m('tarRoof', 2), (bx0 + bx1) / 2, 0.65, bw * 0.78, H + 1.2, H + 10, 4, { rot: Math.PI / 4 });
  k.cone(k.flatM, (bx0 + bx1) / 2, 0.65, 0.8, H + 10, H + 12.2, 4, { color: 0x4a3a34, rot: Math.PI / 4 });
  if (detail > 0) for (const dx of [-2.2, 0, 2.2]) {
    const dxx = (bx0 + bx1) / 2 + dx;
    k.box(wall, dxx - 0.7, H + 1.4, -1.0, dxx + 0.7, H + 3.2, -0.2, { noTop: true });
    k.gable(k.m('tarRoof', 2), wall, dxx - 0.85, -1.0, dxx + 0.85, -0.2, H + 3.2, H + 4.4, 'z', 0.1);
    archPane(k, glass, dxx, -1.0, H + 1.5, 0.8, 1.5, [0, -1], true, 0.02);
  }
  k.solidRect(bx0, -1.3, bx1, 2.6);
  // mansard dormers along both wings
  if (detail > 0) for (let x = 3; x < W - 2; x += 6.4) {
    if (x > bx0 - 1.5 && x < bx1 + 1.5) continue;
    k.box(wall, x - 0.7, H, 0.8, x + 0.7, H + 2.0, 1.6, { noTop: true });
    k.gable(k.m('tarRoof', 2), wall, x - 0.85, 0.8, x + 0.85, 1.6, H + 2.0, H + 3.1, 'z', 0.1);
    archPane(k, glass, x, 0.8, H + 0.2, 0.8, 1.5, [0, -1], true, 0.02);
  }
  // tall brick chimneys with stepped caps
  for (const x of [W * 0.1, W * 0.5, W * 0.88]) {
    k.box(wall, x - 0.7, H + 2, depth * 0.55, x + 0.7, H + 7.4, depth * 0.55 + 1.4, { top: trim });
    k.box(trim, x - 0.9, H + 7.4, depth * 0.55 - 0.2, x + 0.9, H + 7.9, depth * 0.55 + 1.6, { top: trim });
  }
  if (detail > 0) { for (let i = 1; i < 4; i++) tree(k, (i * W) / 4, -2.4, rng, 0.6, false); lampPost(k, 1, -2.5, 4.6); }
  void TILE; void TERRA;
  yield;
}

// ----------------------------------------------------------------------------------------------- Gothic stone church with a street gable

/**
 * A dark stone Gothic church: a long nave behind the street wall (lancet windows between buttresses) and a transept gable facing
 * the street with a big round window, a pointed porch, groups of lancets and pale stone dressings; steep slate roofs, an iron fence.
 */
export function* buildGothicGable(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const wallM = k.m('brownstone'), stone = k.m('limestone'), slate = k.m('tarRoof', 0), roofM = k.m('tarRoof', 2), dark = k.m('metalDark'), glass = k.m('window', 1);
  const PALE = 0xcdc6b2, GREENC = 0x4a7a68;
  const zf = 2.4, nave = Math.min(D - zf - 0.8, 15), H = 10.5;
  const tw = Math.min(14, W * 0.3), gx0 = W * 0.55 - tw / 2, gx1 = gx0 + tw;
  const gz = zf - 1.2;
  k.floor(k.grassM, [[0, 0], [W, 0], [W, D], [0, D]], 0.02, { uvScale: 1 / 4 });
  yield;
  // nave along x behind the street wall, ridge along x
  k.box(wallM, 0.3, 0, zf + 2.5, W - 0.3, H, zf + 2.5 + nave - 2.5, { top: roofM });
  k.gable(slate, wallM, 0.3, zf + 2.5, W - 0.3, zf + nave, H, H + 5.5, 'x', 0.3);
  k.solidRect(0.3, zf + 2.5, W - 0.3, zf + nave);
  // street wall of the nave: lancet windows between pale-capped buttresses
  const sz = zf + 2.5;
  for (const [x0, x1] of [[0.6, gx0 - 0.5], [gx1 + 0.5, W - 0.6]] as Array<[number, number]>) {
    if (x1 - x0 < 3) continue;
    archRun(k, { alongX: true, at: sz - 0.01, from: x0, to: x1, out: [0, -1], y0: 3.0, floors: 1, floorH: 6, pitch: 3.6, w: 1.4, h: 5.2, hood: stone, lancet: true, detail });
    if (detail > 0) for (let x = x0 + 1.6; x < x1; x += 3.6) { k.box(wallM, x - 0.35, 0, sz - 0.5, x + 0.35, H - 1.2, sz, { top: k.flatM, color: PALE }); k.box(k.flatM, x - 0.42, H - 1.5, sz - 0.58, x + 0.42, H - 1.2, sz + 0.05, { color: PALE }); }
  }
  yield;
  // the transept gable facing the street
  k.box(wallM, gx0, 0, gz, gx1, H + 1.2, zf + 8, { noTop: true });
  k.gable(slate, wallM, gx0, gz, gx1, zf + 8, H + 1.2, H + 1.2 + tw * 0.62, 'z', 0.35);
  k.solidRect(gx0, gz, gx1, zf + 8);
  const gm = (gx0 + gx1) / 2, apex = H + 1.2 + tw * 0.62;
  // big round window with geometric tracery, a pale ring
  const ry = H + 2.0, rr = Math.min(3.2, tw * 0.23);
  disc(k, k.flatM, gm, ry, gz, rr + 0.45, [0, -1], 20, 0.06, { color: PALE });
  disc(k, glass, gm, ry, gz, rr, [0, -1], 20, 0.1);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; k.bar(k.flatM, [gm + Math.cos(a) * rr, ry + Math.sin(a) * rr, gz - 0.14], [gm - Math.cos(a) * rr, ry - Math.sin(a) * rr, gz - 0.14], 0.12, { color: PALE }); }
  // a lancet triple in the gable peak, two groups of three beside the porch
  for (const dx of [-0.8, 0, 0.8]) { lancetPane(k, glass, gm + dx, gz, apex - 3.3, 0.6, 2.2, [0, -1], true, 0.06); }
  lancetSurround(k, stone, gm, gz, apex - 3.4, 2.6, 2.6, [0, -1], true, 0.2, 0.08);
  for (const side of [-1, 1]) for (const dx of [-0.9, 0, 0.9]) { lancetPane(k, glass, gm + side * (tw * 0.3) + dx, gz, 4.6, 0.7, 4.0, [0, -1], true, 0.06); }
  // pointed porch with a gabled hood and a dark double door
  lancetPane(k, dark, gm, gz, 0.4, 2.4, 4.2, [0, -1], true, 0.06);
  lancetSurround(k, stone, gm, gz, 0.4, 2.4, 4.2, [0, -1], true, 0.5, 0.1);
  k.tri(stone, [gm - 1.9, 4.6, gz - 0.6], [gm + 1.9, 4.6, gz - 0.6], [gm, 7.2, gz - 0.6], { hint: [0, 0, -1] });
  steps(k, k.m('concrete'), gm, gz - 0.1, 3.4, 3, 0.16, 0.45, [0, -1]);
  // corner buttresses with pale caps, a string course under the round window
  if (detail > 0) for (const x of [gx0 - 0.5, gx1 - 0.1]) { k.box(wallM, x, 0, gz - 0.7, x + 0.6, H - 0.4, gz + 0.1, { top: k.flatM, color: PALE }); k.box(k.flatM, x - 0.05, H - 0.7, gz - 0.75, x + 0.65, H - 0.4, gz + 0.15, { color: PALE }); }
  band(k, stone, gx0, gz, gx1, gz, H - 0.2, 0.3, 0.14, [0, -1]);
  finial(k, gm, apex + 0.1, zf + 4, 2.2, 0x6b6a62);
  // a green copper edge along the nave roof, the notice board, an iron fence
  k.bar(k.flatM, [0.1, H + 0.15, zf + 2.4], [W - 0.1, H + 0.15, zf + 2.4], 0.14, { color: GREENC });
  signBoard(k, row.name.toUpperCase(), gx1 + 4, 1.2, 0.8, [0, -1], 3.4, '#1c2b46', '#efe6c8', 0);
  fence(k, 0, 0.2, W, 0.2, { h: 1.3, gaps: [[gm - 2.2, gm + 2.2]], postEvery: 2.5 });
  for (let i = 0; i < 4; i++) tree(k, 2 + rng.next() * (W - 4), 1.0 + rng.next() * 0.8, rng, 0.45, false);
  yield;
}
