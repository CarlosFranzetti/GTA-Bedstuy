/**
 * LANDMARKS2 builders for buildings read off open-licence photographs (Wikimedia Commons, US National Archives): a twin-tower
 * church (baroque terracotta or gothic brownstone), a movie palace with a round corner tower, a round-arch brewery, a low market
 * hall, a brick hospital. Same kit and rules as buildCivic.ts: merged geometry through the shared material library, the wall
 * colour from the row's `look.wall` / `look.trim` (tone.ts), signs in Anton and Barlow Condensed, nothing built beyond range.
 * Local frame: x along the frontage, z into the site, y up; the street front faces [0, -1].
 */
import type { BuildCtx } from './buildPark';
import type { Kit, V3 } from './kit';
import { archPane, archSurround, band, bench, disc, fence, flatRoof, lampPost, lancetPane, lancetSurround, rectCornice, signBoard, steps, tree } from './parts';

type Mat = ReturnType<Kit['m']>;
type Out = [number, number];

/** arch-headed (or lancet) windows along a wall: `alongX` walls run along local x at depth `at`, others along z at x = `at` */
export interface ArchRun {
  alongX: boolean; at: number; from: number; to: number; out: Out;
  y0: number; floors: number; floorH: number; pitch: number; w: number; h: number;
  hood?: Mat | null; pane?: (i: number, f: number) => Mat; skip?: (i: number, f: number) => boolean; lancet?: boolean; detail: number;
  /** a closed (bricked-up) opening is drawn in this material instead of glass */
  closed?: (i: number, f: number) => boolean; closedMat?: Mat;
}
export function archRun(k: Kit, o: ArchRun): number {
  if (k.far) return 0;
  const len = o.to - o.from;
  const n = Math.max(0, Math.floor((len - o.pitch + o.w) / o.pitch));
  if (!n) return 0;
  const start = o.from + (len - ((n - 1) * o.pitch + o.w)) / 2 + o.w / 2;
  let count = 0;
  for (let f = 0; f < o.floors; f++) for (let i = 0; i < n; i++) {
    if (o.skip?.(i, f)) continue;
    const cx = start + i * o.pitch, y = o.y0 + f * o.floorH;
    const closed = o.closed?.(i, f) ?? false;
    const mat = closed && o.closedMat ? o.closedMat : (o.pane ? o.pane(i, f) : k.m('window', (i * 7 + f * 3) & 1));
    if (o.lancet) lancetPane(k, mat, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.05); else archPane(k, mat, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.05);
    if (o.hood && o.detail > 0) {
      if (o.lancet) lancetSurround(k, o.hood, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.22, 0.08);
      else archSurround(k, o.hood, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.22, 0.08);
    }
    count++;
  }
  return count;
}

/** a thin cross made of two bars (flat colour) */
function cross(k: Kit, x: number, y: number, z: number, h: number, color: number): void {
  k.bar(k.flatM, [x, y, z], [x, y + h, z], 0.16, { color });
  k.bar(k.flatM, [x - h * 0.28, y + h * 0.68, z], [x + h * 0.28, y + h * 0.68, z], 0.16, { color });
}

// ----------------------------------------------------------------------------------------------- twin-tower church

/**
 * A church with a pedimented front between two bell towers. `look.style` 'baroque': terracotta white trim over buff brick, towers
 * in three stages with balconies and domed caps (the Bushwick parish of 1910). 'gothic': brownstone, pointed openings, two tall
 * towers with spires, a gabled nave (the Williamsburg parish of 1885).
 */
export function* buildTwinChurch(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const gothic = look.style === 'gothic';
  const wallM = gothic ? k.m('brownstone') : k.m('brickRed', 1);
  const trim = gothic ? k.m('brownstone') : k.m('limestone');
  const slate = k.m('tarRoof', 0), roofM = k.m('tarRoof', 2), dark = k.m('metalDark'), glass = k.m('window', 1);
  const F = Math.min(W - 1, Number(look.facade ?? 26));
  const x0 = (W - F) / 2, x1 = x0 + F, cx = W / 2;
  const zf = Math.min(3.4, D * 0.13);
  const Tw = Number(look.towerW ?? 6.4);
  const H = Number(look.bodyH ?? 17);
  const zEnd = D - 1;
  const GREEN = 0x6f917f, COPPER = 0x5e7e6c;
  k.floor(k.grassM, [[0, 0], [W, 0], [W, D], [0, D]], 0.02, { uvScale: 1 / 4 });
  yield;

  // body: the nave and aisles in brick, a flat roof over everything and a gable over the nave
  k.box(wallM, x0, 0, zf, x1, H, zEnd, { top: roofM });
  const nx0 = x0 + Tw, nx1 = x1 - Tw;
  k.gable(slate, wallM, nx0, zf, nx1, zEnd, H, H + (gothic ? 8 : 4.8), 'z', 0.3);
  k.solidRect(x0, zf, x1, zEnd);
  // side windows
  for (const [at, out] of [[x0, [-1, 0]], [x1, [1, 0]]] as Array<[number, Out]>) {
    archRun(k, { alongX: false, at, from: zf + Tw + 1, to: zEnd - 1, out, y0: 4.2, floors: 1, floorH: 5, pitch: 3.8, w: 1.5, h: 5.4, hood: trim, lancet: gothic, detail });
  }
  yield;

  // front: the portal
  const pw = gothic ? 14 : 14;
  const pz = zf - (gothic ? 0.1 : 0.5);
  if (!gothic) k.box(trim, cx - pw / 2, 0, pz, cx + pw / 2, H + 2.4, zf, { noTop: false });
  // doors
  const doorH = gothic ? 6.6 : 5.4;
  const pane = (n: number): Mat => k.m('window', n);
  void pane;
  if (gothic) {
    for (const [dx, w, h] of [[0, 3.2, 7.4], [-4.6, 2.4, 5.8], [4.6, 2.4, 5.8]] as Array<[number, number, number]>) {
      lancetPane(k, dark, cx + dx, pz, 0.9, w, h, [0, -1], true, 0.05);
      lancetSurround(k, trim, cx + dx, pz, 0.9, w, h, [0, -1], true, 0.5, 0.08);
    }
    // big pointed window over the portal and a rose in the gable
    lancetPane(k, glass, cx, pz, 9.4, 4.4, 11, [0, -1], true, 0.05);
    lancetSurround(k, trim, cx, pz, 9.4, 4.4, 11, [0, -1], true, 0.6, 0.08);
    disc(k, glass, cx, H + 4.2, pz, 1.9, [0, -1], 12, 0.06);
    disc(k, trim, cx, H + 4.2, pz, 2.5, [0, -1], 12, 0.03);
    // the front gable
    k.tri(wallM, [x0 + Tw, H, pz], [x1 - Tw, H, pz], [cx, H + 8, pz], { hint: [0, 0, -1] });
  } else {
    archPane(k, dark, cx, pz, 0.9, 3.0, doorH, [0, -1], true, 0.05);
    archSurround(k, trim, cx, pz, 0.9, 3.0, doorH, [0, -1], true, 0.45, 0.08);
    for (const dx of [-4.9, 4.9]) { archPane(k, dark, cx + dx, pz, 0.9, 2.1, 4.2, [0, -1], true, 0.05); archSurround(k, trim, cx + dx, pz, 0.9, 2.1, 4.2, [0, -1], true, 0.35, 0.08); }
    // four tall columns across the doors
    for (const dx of [-6, -3.1, 3.1, 6]) { k.cyl(trim, cx + dx, pz - 0.35, 0.42, 0.9, 8.6, 8); }
    band(k, trim, cx - pw / 2 - 0.3, pz, cx + pw / 2 + 0.3, pz, 8.6, 1.0, 0.85, [0, -1]);
    // upper storey: an octagonal window between niches, a second entablature, a scrolled attic with an arched window
    disc(k, trim, cx, 12.1, pz, 2.3, [0, -1], 8, 0.04);
    disc(k, glass, cx, 12.1, pz, 1.65, [0, -1], 8, 0.08);
    for (const dx of [-4.6, 4.6]) { archPane(k, k.m('window', 0), cx + dx, pz, 10.4, 1.3, 3.2, [0, -1], true, 0.05); archSurround(k, trim, cx + dx, pz, 10.4, 1.3, 3.2, [0, -1], true, 0.2, 0.08); }
    band(k, trim, cx - pw / 2 - 0.3, pz, cx + pw / 2 + 0.3, pz, 14.6, 0.9, 0.6, [0, -1]);
    archPane(k, k.m('window', 0), cx, pz, 15.8, 2.2, 3.6, [0, -1], true, 0.05);
    archSurround(k, trim, cx, pz, 15.8, 2.2, 3.6, [0, -1], true, 0.4, 0.08);
    disc(k, trim, cx, H + 2.4, pz, 4.6, [0, -1], 14, 0.03);
    cross(k, cx, H + 6.6, pz - 0.1, 2.6, COPPER);
    // white quoin courses stepping down the buff wings
    if (detail > 0) for (const [a, b] of [[x0 + Tw, cx - pw / 2], [cx + pw / 2, x1 - Tw]] as Array<[number, number]>) for (let y = 2.4; y < H - 1; y += 3.2) band(k, trim, a, zf, b, zf, y, 0.5, 0.18, [0, -1]);
  }
  // wings: tall narrow windows
  if (detail > 0) for (const [a, b] of [[x0 + Tw, cx - pw / 2], [cx + pw / 2, x1 - Tw]] as Array<[number, number]>) {
    if (b - a > 1.8) archRun(k, { alongX: true, at: zf, from: a, to: b, out: [0, -1], y0: 5.2, floors: 1, floorH: 5, pitch: 2.6, w: 1.1, h: 3.4, hood: trim, lancet: gothic, detail });
  }
  steps(k, k.m('concrete'), cx, zf - 0.1, pw + 1, 5, 0.17, 0.55, [0, -1]);
  yield;

  // towers
  for (const side of [0, 1]) {
    const tx0 = side ? x1 - Tw : x0, tx1 = tx0 + Tw;
    const tz0 = zf - (gothic ? 0.4 : 0.2), tz1 = tz0 + Tw;
    const tcx = (tx0 + tx1) / 2, tcz = (tz0 + tz1) / 2;
    if (gothic) {
      const shaft = Number(look.towerShaft ?? 38);
      k.box(trim, tx0, 0, tz0, tx1, shaft, tz1, { noTop: true });
      // corner buttresses and stage courses
      for (const bx of [tx0 - 0.5, tx1 - 0.2]) for (const bz of [tz0 - 0.5, tz1 - 0.2]) k.box(trim, bx, 0, bz, bx + 0.7, shaft - 6, bz + 0.7);
      for (const y of [8, 17, 26, shaft - 7]) band(k, trim, tx0, tz0, tx1, tz0, y, 0.5, 0.3, [0, -1]);
      lancetPane(k, dark, tcx, tz0, 1.2, 2.2, 5.2, [0, -1], true, 0.05);
      lancetPane(k, glass, tcx, tz0, 11, 1.4, 4.6, [0, -1], true, 0.05);
      lancetPane(k, glass, tcx, tz0, 21, 1.4, 4.6, [0, -1], true, 0.05);
      for (const out of [[0, -1], [-1, 0], [1, 0]] as Out[]) {
        const alongX = out[1] !== 0;
        const at = alongX ? tz0 : out[0] < 0 ? tx0 : tx1;
        const mid = alongX ? tcx : tcz;
        lancetPane(k, dark, mid, at, shaft - 6.4, 1.8, 5.2, out, alongX, 0.05);
        lancetSurround(k, trim, mid, at, shaft - 6.4, 1.8, 5.2, out, alongX, 0.3, 0.08);
      }
      // the spire: an eight-sided cone with small corner pinnacles
      const top = Number(look.spireTop ?? 62);
      k.cone(slate, tcx, tcz, Tw * 0.62, shaft, top, 8, { rot: Math.PI / 8 });
      for (const [px, pz2] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]] as Array<[number, number]>) k.cone(trim, px + (px < tcx ? 0.35 : -0.35), pz2 + (pz2 < tcz ? 0.35 : -0.35), 0.5, shaft - 1, shaft + 3.4, 4);
      cross(k, tcx, top, tcz, 2.4, COPPER);
    } else {
      const lower = 21;
      k.box(trim, tx0, 0, tz0, tx1, lower, tz1, { top: trim });
      for (const y of [6, 12, 17]) band(k, trim, tx0, tz0, tx1, tz0, y, 0.45, 0.3, [0, -1]);
      archPane(k, glass, tcx, tz0, 8.5, 1.3, 3.4, [0, -1], true, 0.05);
      disc(k, trim, tcx, 15, tz0, 1.0, [0, -1], 10, 0.05);
      disc(k, glass, tcx, 15, tz0, 0.6, [0, -1], 10, 0.09);
      // balcony on a scrolled bracket, then the belfry stage
      k.box(trim, tx0 - 0.4, lower, tz0 - 0.4, tx1 + 0.4, lower + 0.5, tz1 + 0.4, { top: trim });
      const bx0 = tx0 + 0.6, bx1 = tx1 - 0.6, bz0 = tz0 + 0.6, bz1 = tz1 - 0.6;
      k.box(trim, bx0, lower + 0.5, bz0, bx1, lower + 9, bz1, { top: trim });
      for (const out of [[0, -1], [-1, 0], [1, 0]] as Out[]) {
        const alongX = out[1] !== 0;
        const at = alongX ? bz0 : out[0] < 0 ? bx0 : bx1;
        const mid = alongX ? (bx0 + bx1) / 2 : (bz0 + bz1) / 2;
        archPane(k, dark, mid, at, lower + 2.4, 2.0, 4.8, out, alongX, 0.05);
        archSurround(k, trim, mid, at, lower + 2.4, 2.0, 4.8, out, alongX, 0.3, 0.08);
      }
      band(k, trim, bx0, bz0, bx1, bz0, lower + 8.2, 0.9, 0.45, [0, -1]);
      band(k, trim, bx0, bz0, bx0, bz1, lower + 8.2, 0.9, 0.45, [-1, 0]);
      band(k, trim, bx1, bz0, bx1, bz1, lower + 8.2, 0.9, 0.45, [1, 0]);
      // the dome: a drum with a flat green cap, a lantern and a cross
      k.cone(k.flatM, tcx, tcz, (bx1 - bx0) * 0.62, lower + 9.4, lower + 13.2, 10, { color: GREEN, rot: 0.3, r1: 0.7 });
      k.cyl(trim, tcx, tcz, 0.7, lower + 13.2, lower + 15, 8);
      k.cone(k.flatM, tcx, tcz, 0.85, lower + 15, lower + 16.6, 8, { color: GREEN });
      cross(k, tcx, lower + 16.4, tcz, 2.6, COPPER);
    }
    k.solidRect(tx0, tz0, tx1, tz1);
    yield;
  }
  // notice board, fence with a gate at the steps, a few trees
  signBoard(k, row.name.toUpperCase(), W - 3.5, 1.2, 0.6, [0, -1], 3.6, '#1c2b46', '#efe6c8', 0);
  k.bar(k.m('metalDark'), [W - 5.3, 0, 0.6], [W - 5.3, 1.4, 0.6], 0.08); k.bar(k.m('metalDark'), [W - 1.7, 0, 0.6], [W - 1.7, 1.4, 0.6], 0.08);
  fence(k, 0, 0.15, W, 0.15, { h: 1.1, gaps: [[cx - 7.5, cx + 7.5]], postEvery: 4 });
  for (let i = 0; i < 3; i++) tree(k, 2 + rng.next() * (W - 4), D - 1.2 - rng.next() * 1.5, rng, 0.6, false);
  if (detail > 0) { lampPost(k, cx - 8.5, 1.2, 3.4); lampPost(k, cx + 8.5, 1.2, 3.4); }
}

// ----------------------------------------------------------------------------------------------- movie palace

/**
 * A corner movie palace of 1911 in white glazed terracotta: a round corner tower with a porthole and a heavy cornice, a fluted
 * marquee carrying the name, tall windows with figures over them along the street side, a red base, a taller fly tower behind.
 * The tower stands at the left (x = 0) end of the frontage.
 */
export function* buildTheatre(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const white = k.m('brickPainted', 0), trim = k.m('limestone'), roof = k.m('tarRoof', 1), dark = k.m('metalDark'), brick = k.m('brickRed', 0);
  const H = Number(look.height ?? 21);
  const R = Number(look.towerR ?? 5.2);
  const sideD = Math.min(D - 2, 40);
  const RED = 0x7a2f26, BULB = 0xf4dca0, CREAM = 0xe6dccb;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, 2.2], [0, 2.2]], 0.05);
  yield;
  // street block: the front wall along x, the long side wall along z
  k.box(white, R, 0, 2.2, W, H, 2.2 + sideD, { top: roof });
  flatRoof(k, roof, white, R, 2.2, W, 2.2 + sideD, H, 0.9);
  // the red base band
  k.box(k.flatM, R, 0, 2.15, W, 1.3, 2.25, { color: RED, noTop: true });
  // tall windows with heads on the front wall
  const wins = Math.max(2, Math.floor((W - R - 3) / 5));
  const pitch = (W - R - 3) / wins;
  for (let i = 0; i < wins; i++) {
    const cx = R + 1.5 + pitch * (i + 0.5);
    archPane(k, k.m('window', 1), cx, 2.2, 8.2, 2.0, 6.4, [0, -1], true, 0.05);
    archSurround(k, trim, cx, 2.2, 8.2, 2.0, 6.4, [0, -1], true, 0.45, 0.08);
    if (detail > 0) { k.box(trim, cx - 0.5, 15.6, 2.0, cx + 0.5, 17.4, 2.25); }
    archPane(k, dark, cx, 2.2, 0.9, 1.8, 3.4, [0, -1], true, 0.05);
  }
  band(k, trim, R, 2.2, W, 2.2, H - 1.7, 1.7, 0.7, [0, -1]);
  band(k, trim, R, 2.2, W, 2.2, 6.9, 0.5, 0.3, [0, -1]);
  // the side wall (long, toward +z): tall windows with the same heads
  const sc = Math.floor((sideD - 3) / 4.6);
  for (let i = 0; i < sc; i++) {
    const cz = 4 + (sideD - 3) * (i + 0.5) / sc;
    archPane(k, k.m('window', 1), cz, W, 8.2, 1.8, 6.2, [1, 0], false, 0.05);
    archSurround(k, trim, cz, W, 8.2, 1.8, 6.2, [1, 0], false, 0.4, 0.08);
  }
  band(k, trim, W, 2.2, W, 2.2 + sideD, H - 1.7, 1.7, 0.7, [1, 0]);
  // the round corner tower: a drum with a porthole under a heavy ring cornice, and a flat roof
  const tcx = R, tcz = 2.2 + R;
  k.cyl(white, tcx, tcz, R, 0, H + 3.4, 18, { top: roof });
  k.cyl(trim, tcx, tcz, R + 0.55, H + 1.4, H + 3.4, 18, { top: trim });
  k.cyl(trim, tcx, tcz, R + 0.35, H - 2.6, H - 1.6, 18, { noTop: true });
  disc(k, trim, tcx, H - 6.4, 2.2 + 0.0, 1.5, [0, -1], 12, 0.02);
  // the porthole sits on the tower's front face (toward the street at z = 2.2 - R * 0.0)
  disc(k, k.m('window', 1), tcx, H - 6.4, tcz - R, 1.2, [0, -1], 12, 0.06);
  disc(k, trim, tcx, H - 6.4, tcz - R, 1.7, [0, -1], 12, 0.03);
  k.solidCircle(tcx, tcz, R);
  k.solidRect(R, 2.2, W, 2.2 + sideD);
  yield;
  // the marquee: a deep fluted box over the doors that wraps the corner, the name on its front
  const mw = Math.min(W - 2, 20);
  k.box(k.flatM, 0.4, 5.1, 0.2, mw, 6.4, 2.2, { color: CREAM });
  for (let x = 0.8; x < mw - 0.2; x += 0.55) k.box(k.flatM, x, 5.2, 0.12, x + 0.12, 6.3, 0.2, { color: BULB, noTop: false });
  k.box(k.flatM, 0.4, 6.4, 0.3, mw, 6.7, 2.2, { color: RED });
  signBoard(k, row.name.toUpperCase(), mw / 2, 6.8, 0.25, [0, -1], Math.min(14, mw - 2), '#7a2f26', '#f4e6c0', 0.04);
  // doors under it and the ticket booth
  for (let i = 0; i < 3; i++) { const dx = 4 + i * 2.6; k.quad(dark, [dx, 0, 2.18], [dx + 2.0, 0, 2.18], [dx + 2.0, 3.6, 2.18], [dx, 3.6, 2.18], { hint: [0, 0, -1] }); }
  k.box(k.flatM, mw * 0.5 - 1.2, 0, 0.6, mw * 0.5 + 1.2, 2.2, 1.9, { color: 0x6a3c2a });
  // the fly tower behind
  k.box(brick, R + 4, H, 2.2 + sideD - 14, W - 3, H + 7, 2.2 + sideD, { top: roof });
  // a vertical blade sign on the tower
  k.box(k.flatM, 0.1, H - 12, 0.1, 0.7, H - 2, 0.7, { color: 0xb02a22 });
  void bench;
  yield;
}

// ----------------------------------------------------------------------------------------------- brewery

/**
 * A round-arch brewery of the 1870s to 1890s in red brick: a four-storey brew house with arched windows under brick hoods, pilasters,
 * a corbelled cornice and roof bulkheads, an office wing with a mansard, a low engine house and a tall round chimney.
 */
export function* buildBrewery(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const brick = k.m('brickRed', 0), hood = k.m('brownstone'), roof = k.m('tarRoof', 1), dark = k.m('metalDark'), stone = k.m('limestone');
  const floors = Number(look.floors ?? 4), fh = Number(look.floorH ?? 3.7);
  const H = floors * fh + 0.6;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  yield;
  // main block: front along x, left side along z
  const mx1 = Math.min(W - 2, Number(look.mainW ?? 46)), mz1 = Math.min(D - 1, Number(look.mainD ?? 26));
  k.box(brick, 0.5, 0, 0.8, mx1, H, mz1, { top: roof });
  flatRoof(k, roof, brick, 0.5, 0.8, mx1, mz1, H, 0.6);
  const brickClosed = k.m('brickPainted', 1);
  for (const [alongX, at, from, to, out] of [[true, 0.8, 0.5, mx1, [0, -1]], [false, 0.5, 0.8, mz1, [-1, 0]], [false, mx1, 0.8, mz1, [1, 0]]] as Array<[boolean, number, number, number, Out]>) {
    // ground floor: bricked-up arches; upper floors: open arched windows with brick hoods
    archRun(k, { alongX, at, from, to, out, y0: 0.7, floors: 1, floorH: fh, pitch: 3.6, w: 1.5, h: fh - 0.9, hood, detail, closed: () => true, closedMat: brickClosed });
    archRun(k, { alongX, at, from, to, out, y0: fh + 0.7, floors: floors - 1, floorH: fh, pitch: 3.6, w: 1.5, h: fh - 0.8, hood, detail });
    // pilasters between the bays
    if (detail > 0) {
      const len = to - from;
      const n = Math.max(1, Math.floor(len / 3.6));
      for (let i = 0; i <= n; i++) {
        const s = from + (len * i) / n;
        if (alongX) k.box(brick, s - 0.18, 0, at - 0.14, s + 0.18, H - 0.5, at);
        else k.box(brick, at - (out[0] > 0 ? 0 : 0.14), 0, s - 0.18, at + (out[0] > 0 ? 0.14 : 0), H - 0.5, s + 0.18);
      }
    }
  }
  // corbelled cornice: a deep band with a row of small arches under it
  band(k, hood, 0.5, 0.8, mx1, 0.8, H - 1.0, 1.0, 0.5, [0, -1]);
  band(k, hood, 0.5, 0.8, 0.5, mz1, H - 1.0, 1.0, 0.5, [-1, 0]);
  band(k, hood, mx1, 0.8, mx1, mz1, H - 1.0, 1.0, 0.5, [1, 0]);
  for (let s = 0.5; s < mx1 - 0.6 && detail > 0; s += 1.3) archPane(k, dark, s + 0.5, 0.8, H - 2.2, 0.8, 1.1, [0, -1], true, 0.04);
  // roof bulkheads
  k.box(brick, 6, H, 6, 12, H + 3.6, 12, { top: roof });
  k.box(brick, mx1 - 14, H, mz1 - 12, mx1 - 6, H + 2.6, mz1 - 5, { top: roof });
  k.solidRect(0.5, 0.8, mx1, mz1);
  yield;
  // office wing (three storeys with a mansard roof) beside the main block, and a low engine house behind it
  const ox0 = mx1 + 1.0, ox1 = Math.min(W - 0.5, ox0 + 12);
  if (ox1 - ox0 > 6) {
    const oh = 3 * 3.5;
    k.box(brick, ox0, 0, 2, ox1, oh, 14, { top: roof });
    archRun(k, { alongX: true, at: 2, from: ox0, to: ox1, out: [0, -1], y0: 1.0, floors: 3, floorH: 3.5, pitch: 3.0, w: 1.3, h: 2.4, hood, detail });
    k.gable(roof, brick, ox0, 2, ox1, 14, oh, oh + 3.4, 'x', 0.4);
    k.solidRect(ox0, 2, ox1, 14);
  }
  // the chimney: a tall round brick stack with a flared cap
  const chx = Number(look.chimneyX ?? mx1 - 5), chz = Number(look.chimneyZ ?? mz1 + 0.6);
  if (chz < D - 1) {
    k.cyl(brick, chx, chz, 1.3, 0, Number(look.chimney ?? 34), 12, { noTop: true });
    k.cyl(hood, chx, chz, 1.6, Number(look.chimney ?? 34) - 1.4, Number(look.chimney ?? 34), 12, { top: hood });
    k.solidCircle(chx, chz, 1.3);
  }
  // a fire escape on the long side (a few bars: red-painted metal), name board over the corner door
  if (detail > 0) {
    for (let f = 1; f < floors; f++) k.box(k.m('metalDark'), 8, f * fh, 0.2, 14, f * fh + 0.1, 0.8, { top: k.m('metalDark') });
    k.bar(k.m('metalDark'), [8, 0.5, 0.5], [8, floors * fh, 0.5], 0.08);
  }
  signBoard(k, row.name.toUpperCase(), 7, 2.6, 0.78, [0, -1], 5.6, '#3a2a22', '#e6d8b4', 0.0);
  yield;
}

// ----------------------------------------------------------------------------------------------- market hall

/**
 * A city market hall of 1941: a low red-brown brick box with a flat roof and a parapet, the name in big capitals along the
 * parapet, a band of tall shutters over a canopy, double doors, flagpoles with banners down the long side.
 */
export function* buildMarket(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const brick = k.m('brickRed', 1), roof = k.m('tarRoof', 1), dark = k.m('metalDark');
  const H = Number(look.height ?? 8.2);
  const TEAL = Number(look.teal ?? 0x2e9a8c), AWN = 0x2c8a7c;
  const bx0 = 1.5, bx1 = W - 1.5, bz0 = 3.2, bz1 = D - 1;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, bz0], [0, bz0]], 0.05);
  k.box(brick, bx0, 0, bz0, bx1, H, bz1, { top: roof });
  flatRoof(k, roof, brick, bx0, bz0, bx1, bz1, H, 0.8);
  k.solidRect(bx0, bz0, bx1, bz1);
  yield;
  // name in big capitals along the front parapet
  signBoard(k, row.name.toUpperCase(), (bx0 + bx1) / 2, H - 2.9, bz0, [0, -1], Math.min(22, bx1 - bx0 - 2), '#6b2f26', '#efe6d6', 0.03);
  // the band of shutters over the canopy: big teal panels with a few coloured picture panes
  const bw = (bx1 - bx0) * 0.78, sx0 = (bx0 + bx1) / 2 - bw / 2;
  const n = Math.max(4, Math.round(bw / 2.2));
  const cols = [TEAL, TEAL, 0xe3b43a, 0x3b6a9a, 0xc4442f, 0xd8d2c0, TEAL, TEAL];
  for (let i = 0; i < n; i++) {
    const x = sx0 + (bw * i) / n;
    k.quad(k.flatM, [x + 0.08, 3.9, bz0 - 0.02], [x + bw / n - 0.08, 3.9, bz0 - 0.02], [x + bw / n - 0.08, 6.4, bz0 - 0.02], [x + 0.08, 6.4, bz0 - 0.02], { hint: [0, 0, -1], color: cols[(i + (rng.int(0, 2))) % cols.length] });
  }
  // the canopy over the doors and the doors (double leaves in the same teal)
  k.box(k.flatM, bx0 + 2, 3.3, bz0 - 1.0, bx1 - 2, 3.6, bz0, { color: AWN });
  for (let i = 0; i < 3; i++) {
    const dx = bx0 + 4 + i * ((bx1 - bx0 - 8) / 2.5);
    k.quad(k.flatM, [dx, 0, bz0 - 0.03], [dx + 2.6, 0, bz0 - 0.03], [dx + 2.6, 3.2, bz0 - 0.03], [dx, 3.2, bz0 - 0.03], { hint: [0, 0, -1], color: TEAL });
    k.quad(dark, [dx + 0.3, 0.8, bz0 - 0.05], [dx + 1.2, 0.8, bz0 - 0.05], [dx + 1.2, 2.6, bz0 - 0.05], [dx + 0.3, 2.6, bz0 - 0.05], { hint: [0, 0, -1] });
    k.quad(dark, [dx + 1.4, 0.8, bz0 - 0.05], [dx + 2.3, 0.8, bz0 - 0.05], [dx + 2.3, 2.6, bz0 - 0.05], [dx + 1.4, 2.6, bz0 - 0.05], { hint: [0, 0, -1] });
  }
  // flagpoles with banners down the front and the long side
  if (detail > 0) {
    const flags = [0x2e9a8c, 0xe3b43a, 0xc4442f, 0x2c3a5c, 0xd8d2c0, 0x2e9a8c];
    for (let i = 0; i < 6; i++) {
      const fx = bx0 + 3 + i * ((bx1 - bx0 - 6) / 5);
      k.bar(dark, [fx, H, bz0 + 0.2], [fx + 0.2, H + 3.4, bz0 - 1.4], 0.07);
      k.quad(k.flatM, [fx + 0.1, H + 3.3, bz0 - 1.3], [fx + 1.7, H + 3.3, bz0 - 1.3], [fx + 1.7, H + 1.9, bz0 - 1.3], [fx + 0.1, H + 1.9, bz0 - 1.3], { hint: [0, 0, -1], color: flags[i % flags.length] });
    }
  }
  // brick pavement and benches
  for (let i = 0; i < 3; i++) bench(k, 4 + i * 5, 1.4, [0, 1]);
  tree(k, 2.2, 1.3, rng, 0.6, false);
  rectCornice(k, k.m('cornice'), bx0, bz0, bx1, bz1, H - 0.2, 0.3, 0.2);
  yield;
}
