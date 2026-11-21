/**
 * LANDMARKS2 builders for street-level sets: a row of houses with its real rhythm (high-stoop brownstones, or arch-window brick
 * tenements), an eatery with a yard, and mural walls with ORIGINAL artwork painted in code from flat-coloured shapes (no photo,
 * no real person, no copied mural). Local frame as in kit.ts: x along the frontage, z into the site, the street faces [0, -1].
 */
import type { Rng } from '@/core/Rng';
import type { BuildCtx } from './buildPark';
import type { Kit } from './kit';
import { triangulate } from './kit';
import { archRun } from './buildCivic2';
import { band, bench, lampPost, signBoard, steps, tree, windowBand, type Dir2, type WallPlane, planePoint } from './parts';

type Pt = [number, number];

// ----------------------------------------------------------------------------------------------- rows of houses

/**
 * `look.style` 'brownstone': three storeys over a raised basement, a high stoop with railings to the parlour door, flat-headed
 * windows with stone heads and sills, a heavy bracketed cornice, an areaway at the front. 'tenement': three storeys of brick (some
 * painted), a low stoop, narrow round-arched windows under dark hoods, a deep dark cornice. `look.bay` is the width of one house.
 */
export function* buildRowhouses(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const tenement = look.style === 'tenement';
  const bayW = Number(look.bay ?? (tenement ? 7.4 : 5.9));
  const n = Math.max(2, Math.round(W / bayW));
  const bw = W / n;
  const floors = Number(look.floors ?? 3);
  const base = tenement ? 0.5 : 2.3; // parlour floor height
  const fh = tenement ? 3.2 : 3.5;
  const H = base + floors * fh + (tenement ? 0.3 : 0.1);
  const brick = k.m('brickRed', 0), painted = k.m('brickPainted', 0), brown = k.m('brownstone'), stoop = k.m('stoop'), cornice = k.m('cornice'), trim = k.m('limestone'), dark = k.m('metalDark');
  const depth = Math.min(D - 0.5, 15);
  k.floor(k.m('concrete'), [[0, -3], [W, -3], [W, 0], [0, 0]], 0.05);
  yield;
  for (let i = 0; i < n; i++) {
    const x0 = i * bw, x1 = x0 + bw, cx = (x0 + x1) / 2;
    // LANDMARKS3: `look.pale` (a colour) paints the house at index `look.paleAt` in that colour, with dark string courses; the others stay brick
    const isPale = tenement && typeof look.pale === 'string' && i === Number(look.paleAt ?? 0);
    const wallM = tenement ? (typeof look.pale === 'string' ? (isPale ? painted : brick) : i % 4 === 2 ? painted : brick) : brown;
    k.box(wallM, x0, 0, 0, x1, H, depth, { top: k.m('tarRoof', 1) });
    k.solidRect(x0, 0, x1, depth);
    // party-wall parapet and bracketed cornice
    band(k, cornice, x0, 0, x1, 0, H - (tenement ? 0.9 : 1.0), tenement ? 0.9 : 1.0, tenement ? 0.55 : 0.6, [0, -1]);
    if (detail > 0) for (let b = 0.4; b < bw - 0.2; b += 0.9) k.box(cornice, x0 + b, H - 1.8, -0.15, x0 + b + 0.22, H - 1.0, 0.0);
    if (isPale) for (let f = 0; f <= floors; f++) band(k, cornice, x0, 0, x1, 0, base + 0.2 + f * fh - (f === floors ? 0.0 : 0.0), 0.3, 0.1, [0, -1]);
    if (tenement) {
      // door in the arch at one end of each house, windows spaced between; arched and hooded
      const doorX = x0 + bw * (i % 2 ? 0.8 : 0.2);
      archRun(k, { alongX: true, at: 0, from: x0 + 0.3, to: x1 - 0.3, out: [0, -1], y0: base + 0.7, floors, floorH: fh, pitch: 1.9, w: 1.1, h: 2.2, hood: cornice, detail, skip: (j, f) => f === 0 && Math.abs(x0 + 0.3 + (bw - 0.6 - ((Math.floor((bw - 0.6 - 1.1) / 1.9)) * 1.9 + 1.1)) / 2 + 0.55 + j * 1.9 - doorX) < 1.1 });
      // door
      k.quad(dark, [doorX - 0.6, base, -0.03], [doorX + 0.6, base, -0.03], [doorX + 0.6, base + 2.5, -0.03], [doorX - 0.6, base + 2.5, -0.03], { hint: [0, 0, -1] });
      steps(k, stoop, doorX, 0, 1.6, 3, 0.17, 0.3, [0, -1]);
    } else {
      // parlour door beside a window, windows over, basement windows under the stoop; stone heads and sills
      const doorX = x0 + bw * (i % 2 ? 0.78 : 0.22);
      const arched = look.arched === true; // LANDMARKS3: round-headed top-floor windows under a dark hood (the Stuyvesant Heights houses)
      windowBand(k, { x0, z0: 0, dx: 1, dz: 0, len: bw, out: [0, -1], y0: base + 0.5, floors, floorH: fh, w: 1.15, h: 2.3, pitch: bw / 2, margin: 0.4, trim: detail > 0 ? trim : null, detail, skip: (j, f) => (f === 0 && Math.abs(x0 + (j + 0.5) * (bw / 2) - doorX) < 1.0) || (arched && f === floors - 1), variant: (j, f) => (j + f + i) & 1 });
      if (arched) archRun(k, { alongX: true, at: 0, from: x0 + 0.5, to: x1 - 0.5, out: [0, -1], y0: base + 0.5 + (floors - 1) * fh, floors: 1, floorH: fh, pitch: bw / 2, w: 1.2, h: 2.2, hood: cornice, detail });
      windowBand(k, { x0, z0: 0, dx: 1, dz: 0, len: bw, out: [0, -1], y0: 0.7, floors: 1, floorH: 1, w: 1.0, h: 1.0, pitch: bw / 2, margin: 0.4, trim: null, detail: 0, skip: (j) => Math.abs(x0 + (j + 0.5) * (bw / 2) - doorX) < 1.0 });
      k.quad(dark, [doorX - 0.55, base, -0.04], [doorX + 0.55, base, -0.04], [doorX + 0.55, base + 2.6, -0.04], [doorX - 0.55, base + 2.6, -0.04], { hint: [0, 0, -1] });
      // the high stoop with side walls and an iron railing
      steps(k, stoop, doorX, 0, 1.7, 8, 0.29, 0.3, [0, -1]);
      if (detail > 0) for (const s of [-0.85, 0.85]) k.bar(dark, [doorX + s, base + 0.9, 0.0], [doorX + s, 0.9, -2.4], 0.07);
      // every third house a projecting bay
      if (i % 3 === 1 && detail > 0) {
        const bx = x0 + bw * (i % 2 ? 0.2 : 0.62);
        k.box(brown, bx - 0.9, base, -0.6, bx + 0.9, base + 2 * fh - 0.2, 0.0, { noTop: false });
      }
    }
    if (i % 4 === 3) yield;
  }
  // trees in the pavement and a lamp
  if (detail > 0) for (let i = 1; i < n; i += 3) tree(k, i * bw, -2.4, rng, 0.6, false);
  lampPost(k, 0.8, -2.6, 4.6);
  void bench; void signBoard;
}

// ----------------------------------------------------------------------------------------------- mural art

const PALETTES: number[][] = [
  [0x2c4f73, 0x3d7a8c, 0xe0a33b, 0xd25b3a, 0xf0e2bd, 0x8c3b4a, 0x4f7f4a],
  [0x1f3a4d, 0xd9803a, 0xf2d27a, 0xb53d3a, 0x6aa39a, 0xefe6cf, 0x5a3a63],
  [0x3a2a52, 0xe0694a, 0xf4c15d, 0x4aa392, 0xf3ecd6, 0x2a6f8a, 0xb8447a],
  [0x264653, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0xe76f51, 0xf1ebd8, 0x6d4c7d],
];

/** one painted panel: a flat coloured shape builder on a wall plane (layered a hair apart so they do not fight) */
class Panel {
  private layer = 0;
  constructor(private readonly k: Kit, private readonly p: WallPlane, private readonly y0: number) {}
  private pt(u: number, v: number): [number, number, number] { return planePoint(this.p, u, this.y0 + v, 0.03 + this.layer * 0.012); }
  next(): void { this.layer++; }
  poly(pts: ReadonlyArray<Pt>, color: number): void {
    const hint: [number, number, number] = [this.p.out[0], 0, this.p.out[1]];
    const idx = pts.length === 3 ? [[0, 1, 2]] : triangulate(pts);
    for (const [a, b, c] of idx) this.k.tri(this.k.flatM, this.pt(pts[a][0], pts[a][1]), this.pt(pts[b][0], pts[b][1]), this.pt(pts[c][0], pts[c][1]), { hint, color });
  }
  rect(u0: number, v0: number, u1: number, v1: number, color: number): void { this.poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], color); }
  circle(cu: number, cv: number, r: number, color: number, n = 14): void {
    const hint: [number, number, number] = [this.p.out[0], 0, this.p.out[1]];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      this.k.tri(this.k.flatM, this.pt(cu, cv), this.pt(cu + Math.cos(a0) * r, cv + Math.sin(a0) * r), this.pt(cu + Math.cos(a1) * r, cv + Math.sin(a1) * r), { hint, color });
    }
  }
  /** a half ring (rainbow arc) from radius r0 to r1 around (cu, cv), above the horizon */
  arc(cu: number, cv: number, r0: number, r1: number, color: number, n = 12): void {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI;
      this.poly([[cu + Math.cos(a0) * r0, cv + Math.sin(a0) * r0], [cu + Math.cos(a0) * r1, cv + Math.sin(a0) * r1], [cu + Math.cos(a1) * r1, cv + Math.sin(a1) * r1], [cu + Math.cos(a1) * r0, cv + Math.sin(a1) * r0]], color);
    }
  }
}

/** original compositions: a sunrise over hills with a rainbow, a great bird, a night skyline under a moon, a field of waves */
function paintMural(k: Kit, p: WallPlane, y0: number, W: number, H: number, motif: string, rng: Rng, pal: number[]): void {
  const P = new Panel(k, p, y0);
  const bands = 5;
  const sky = [pal[0], pal[5] ?? pal[0], pal[1], pal[3], pal[2]];
  // background bands, darkest at the top
  for (let i = 0; i < bands; i++) P.rect(0, (H * i) / bands, W, (H * (i + 1)) / bands + 0.01, sky[bands - 1 - i]);
  P.next();
  if (motif === 'sunrise') {
    const cu = W * 0.5, cv = H * 0.36, R = Math.min(W * 0.28, H * 0.5);
    for (let i = 0; i < 5; i++) { P.arc(cu, cv, R * (1.05 + i * 0.16), R * (1.05 + (i + 1) * 0.16 - 0.03), pal[(i + 2) % pal.length], 14); P.next(); }
    P.circle(cu, cv, R, pal[4], 18); P.next();
    P.poly([[0, 0], [W, 0], [W, H * 0.28], [W * 0.7, H * 0.2], [W * 0.45, H * 0.3], [W * 0.2, H * 0.18], [0, H * 0.26]], pal[6] ?? pal[0]); P.next();
    P.poly([[0, 0], [W, 0], [W, H * 0.12], [W * 0.6, H * 0.18], [W * 0.3, H * 0.1], [0, H * 0.16]], pal[0]); P.next();
    for (let i = 0; i < 7; i++) { const u = W * (0.08 + i * 0.14) + rng.next() * 0.6; P.rect(u - 0.05, H * 0.1, u + 0.05, H * 0.1 + H * (0.12 + rng.next() * 0.1), pal[6] ?? pal[1]); P.circle(u, H * 0.1 + H * 0.2, 0.34 + rng.next() * 0.2, pal[(i + 3) % pal.length], 8); }
  } else if (motif === 'bird') {
    const cu = W * 0.5, cv = H * 0.5;
    P.circle(cu + W * 0.18, cv + H * 0.2, H * 0.22, pal[4], 16); P.next();
    // wings: a fan of feathers in turn, then a diamond body and a beak
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + i * 0.13), L = H * (0.42 - i * 0.025);
      P.poly([[cu, cv], [cu - Math.cos(a) * L - 0.5, cv + Math.sin(a) * L], [cu - Math.cos(a + 0.18) * L, cv + Math.sin(a + 0.18) * L]], pal[(i + 1) % pal.length]);
      P.poly([[cu, cv], [cu + Math.cos(a) * L + 0.5, cv + Math.sin(a) * L], [cu + Math.cos(a + 0.18) * L, cv + Math.sin(a + 0.18) * L]], pal[(i + 2) % pal.length]);
    }
    P.next();
    P.poly([[cu, cv + H * 0.26], [cu + H * 0.1, cv], [cu, cv - H * 0.3], [cu - H * 0.1, cv]], pal[3]); P.next();
    P.poly([[cu - 0.2, cv + H * 0.26], [cu + 0.2, cv + H * 0.26], [cu, cv + H * 0.38]], pal[2]);
    P.circle(cu, cv + H * 0.18, 0.18, pal[0], 8);
  } else if (motif === 'skyline') {
    P.circle(W * 0.72, H * 0.72, H * 0.17, pal[4], 18); P.next();
    let u = 0;
    while (u < W - 0.4) {
      const w = 0.9 + rng.next() * 1.8, h = H * (0.25 + rng.next() * 0.42);
      P.rect(u, 0, Math.min(W, u + w), h, pal[(Math.floor(u * 3) + 1) % 2 ? 0 : 6] ?? pal[0]);
      for (let wy = 0.6; wy < h - 0.4; wy += 0.8) for (let wx = u + 0.25; wx < u + w - 0.3; wx += 0.5) if (rng.chance(0.55)) P.rect(wx, wy, wx + 0.22, wy + 0.34, pal[2]);
      u += w + 0.08;
    }
    P.next();
    for (let i = 0; i < 16; i++) { const su = rng.next() * W, sv = H * (0.62 + rng.next() * 0.35); P.poly([[su - 0.12, sv], [su + 0.12, sv], [su, sv + 0.3]], pal[4]); }
  } else {
    // waves
    for (let r = 0; r < 6; r++) {
      const v = H * (0.08 + r * 0.15);
      const pts: Pt[] = [[0, v - 0.3]];
      const seg = 14;
      for (let i = 0; i <= seg; i++) pts.push([(W * i) / seg, v + Math.sin(i * 0.9 + r) * H * 0.07]);
      pts.push([W, v - 0.3]);
      P.poly(pts, pal[(r + 1) % pal.length]);
      P.next();
    }
    P.circle(W * 0.2, H * 0.78, H * 0.13, pal[4], 14);
  }
}

/**
 * A street with painted walls: a long low warehouse whose front wall carries two or three panels of original artwork, a side wall with
 * another, a roll gate, a fence, a bench and trees. The artwork is vertex-coloured shapes (no texture memory).
 */
export function* buildMuralWalls(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const painted = k.m('brickPainted', 1), roof = k.m('tarRoof', 1), gate = k.m('rollGate'), dark = k.m('metalDark');
  const H = Number(look.height ?? 8);
  const bz1 = Math.min(D - 1, 22);
  k.floor(k.m('concrete'), [[0, -2.5], [W, -2.5], [W, 0], [0, 0]], 0.05);
  k.box(painted, 0, 0, 0, W, H, bz1, { top: roof });
  k.solidRect(0, 0, W, bz1);
  yield;
  const motifs = String(look.motifs ?? 'sunrise,bird,skyline,waves').split(',');
  const panels = Math.max(1, Math.round(W / 16));
  const pw = (W - 1.0) / panels;
  for (let i = 0; i < panels; i++) {
    const pal = PALETTES[(i + Number(look.pal ?? 0)) % PALETTES.length];
    paintMural(k, { x0: 0.5 + i * pw, z0: 0, ux: 1, uz: 0, out: [0, -1] as Dir2 }, 0.6, pw - 0.3, H - 1.2, motifs[i % motifs.length], rng, pal);
    yield;
  }
  // a roll gate, a small door, a bench and the lettering board
  k.quad(gate, [W - 6.5, 0, -0.04], [W - 1.5, 0, -0.04], [W - 1.5, 3.4, -0.04], [W - 6.5, 3.4, -0.04], { hint: [0, 0, -1], ru: 2, rv: 1.2 });
  k.quad(dark, [0.15, 0, -0.04], [1.2, 0, -0.04], [1.2, 2.3, -0.04], [0.15, 2.3, -0.04], { hint: [0, 0, -1] });
  signBoard(k, row.name.toUpperCase(), W * 0.5, H + 0.2, 0.05, [0, -1], Math.min(9, W * 0.35), '#1d2a35', '#f0e2bd', 0.0);
  if (detail > 0) { for (let i = 0; i < Math.floor(W / 14); i++) bench(k, 6 + i * 12, -1.6, [0, -1]); for (let i = 0; i < 4; i++) tree(k, 3 + i * (W / 4), -2.2, rng, 0.6, false); }
  // the side wall: one more panel facing +x when the site is deep enough
  if (bz1 > 12) {
    paintMural(k, { x0: W, z0: 1, ux: 0, uz: 1, out: [1, 0] as Dir2 }, 0.6, bz1 - 2, H - 1.2, motifs[(panels + 1) % motifs.length], rng, PALETTES[(panels + 2) % PALETTES.length]);
  }
  yield;
}

// ----------------------------------------------------------------------------------------------- eatery with a yard

/**
 * A low block-built eatery painted dark with a corrugated roof, a boarded yard fence along the street, string-light posts over picnic
 * tables, trees, a shed in a steel container and a name board over the door. `look.wall` carries the paint colour.
 */
export function* buildEatery(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const wallM = k.m('brickPainted', 2), roof = k.m('corrugatedSteel'), dark = k.m('metalDark'), wood = k.m('stoop');
  const bw = Math.min(W * 0.55, 16), bd = Math.min(D - 8, 12);
  const bx0 = W - bw - 1, bz0 = 1.2;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  k.box(wallM, bx0, 0, bz0, bx0 + bw, 4.4, bz0 + bd, { top: roof });
  k.solidRect(bx0, bz0, bx0 + bw, bz0 + bd);
  // a slanted corrugated roof and a few windows and the door
  k.quad(roof, [bx0 - 0.3, 4.4, bz0 - 0.3], [bx0 + bw + 0.3, 4.4, bz0 - 0.3], [bx0 + bw + 0.3, 5.0, bz0 + bd + 0.3], [bx0 - 0.3, 5.0, bz0 + bd + 0.3], { hint: [0, 1, 0], ru: 5, rv: 3 });
  windowBand(k, { x0: bx0, z0: bz0, dx: 1, dz: 0, len: bw, out: [0, -1], y0: 1.2, floors: 1, floorH: 3, w: 1.8, h: 1.9, pitch: 4.2, margin: 1.2, trim: null, detail, skip: (i) => i === 1 });
  k.quad(dark, [bx0 + bw * 0.45, 0, bz0 - 0.04], [bx0 + bw * 0.45 + 1.5, 0, bz0 - 0.04], [bx0 + bw * 0.45 + 1.5, 2.6, bz0 - 0.04], [bx0 + bw * 0.45, 2.6, bz0 - 0.04], { hint: [0, 0, -1] });
  signBoard(k, row.name.toUpperCase(), bx0 + bw * 0.45 + 0.75, 3.0, bz0 - 0.05, [0, -1], 5.6, '#1b1816', '#e8dcc0', 0);
  yield;
  // yard fence (plain boards) along the street with a gate, a steel container shed, tables
  const yardZ = 0.4;
  k.quad(wood, [0, 0, yardZ], [bx0 - 0.2, 0, yardZ], [bx0 - 0.2, 2.4, yardZ], [0, 2.4, yardZ], { hint: [0, 0, -1], ru: 6, rv: 1 });
  k.solidSeg(0, yardZ, bx0 - 0.2, yardZ);
  k.box(k.m('corrugatedSteel'), 1.5, 0, D - 6.5, 7.5, 2.6, D - 1.5, { top: k.m('corrugatedSteel') });
  k.solidRect(1.5, D - 6.5, 7.5, D - 1.5);
  const tableZ = [4, 7.5, 11];
  for (const [i, tz] of tableZ.entries()) {
    for (let j = 0; j < 2; j++) {
      const tx = 3 + j * 5 + (i % 2) * 1.5;
      if (tz > D - 8) continue;
      k.box(wood, tx - 1, 0.7, tz - 0.4, tx + 1, 0.78, tz + 0.4, { top: wood });
      k.box(wood, tx - 1, 0.42, tz - 0.9, tx + 1, 0.48, tz - 0.55, { top: wood });
      k.box(wood, tx - 1, 0.42, tz + 0.55, tx + 1, 0.48, tz + 0.9, { top: wood });
      k.solidRect(tx - 1, tz - 0.9, tx + 1, tz + 0.9);
    }
  }
  // posts with warm string lights between them (small flat lamps)
  if (detail > 0) {
    const posts: Pt[] = [[1, 2], [bx0 - 1, 2], [1, D - 8], [bx0 - 1, D - 8]];
    for (const [px, pz] of posts) lampPost(k, px, pz, 3.4);
    for (let t = 0; t < 8; t++) { const px = 1 + ((bx0 - 2) * t) / 7; k.box(k.flatM, px - 0.07, 3.1 - Math.sin((t / 7) * Math.PI) * 0.35, 2 - 0.07, px + 0.07, 3.25 - Math.sin((t / 7) * Math.PI) * 0.35, 2 + 0.07, { color: 0xf7dd9a }); }
  }
  for (let i = 0; i < 4; i++) tree(k, 2 + rng.next() * (bx0 - 4), 2 + rng.next() * (D - 8), rng, 0.55, false);
  yield;
}
