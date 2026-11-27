/**
 * CARCABIN: the inside of every vehicle, a small kit of parts chosen per body style and seeded per car.
 *
 * `cabinKitFor(style, seed)` is pure data (no three.js): dashboard shape, steering wheel (spokes, rim), seat kind and colours, trim colour
 * family, gear lever, a few props. `buildCabin(spec, kit, near)` turns it into ONE vertex-coloured geometry that carModel.ts merges into the
 * details mesh (kind 5: matte), so a cabin costs no draw call and no texture. Everything is an original box / torus / cylinder: no asset, no
 * copied shape, no real logo or lettering. The geometry the body builders hand over (`CabinSpec`) is where the seats and dash sit; the
 * old one-colour interior blocks in carBodies.ts were removed in favour of this.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '@/core/Rng';
import { colored } from './carExtras';

export type CabinFamily = 'car' | 'truck' | 'bus';
export type DashShape = 'flat' | 'cowled' | 'twinpod' | 'slab' | 'screen' | 'strip';
export type RimKind = 'thin' | 'thick' | 'sport' | 'truck';
export type SeatKind = 'bench' | 'buckets' | 'highback' | 'captain' | 'vinylBench' | 'bus';
export type ShiftKind = 'column' | 'floor' | 'none';
export type CabinProp = 'meter' | 'partition' | 'cage' | 'radio' | 'laptop' | 'dice' | 'freshener' | 'cup' | 'tissues' | 'clipboard' | 'cb' | 'jumpbag' | 'fareBox';

export interface CabinKit {
  family: CabinFamily;
  dash: DashShape;
  spokes: 2 | 3 | 4;
  rim: RimKind;
  seat: SeatKind;
  /** seat cushion / back colour, the panel on the seat front, the dash, the trim band and the floor, as hex */
  seatCol: number; seatAlt: number; dashCol: number; trimCol: number;
  shift: ShiftKind;
  props: CabinProp[];
  /** stable key of everything that changes the geometry */
  key: string;
}

/**
 * Where the parts go, in car space (x right, y up, front is -z). Every body builder fills this in from its own numbers.
 * Front seats sit at x = +-seatX and the steering wheel on the left (-x), as the old interior did.
 */
export interface CabinSpec {
  /** half width available between the door cards */
  hw: number;
  /** top of the dash, centre z of the dash, dash depth */
  dashY: number; dashZ: number;
  /** steering wheel centre and the angle it is tipped back by (rad) */
  wheelX: number; wheelY: number; wheelZ: number; wheelTilt: number;
  /** front seats: cushion floor y, cushion centre z, centre x of each, width, cushion depth, back height */
  seatY: number; seatZ: number; seatX: number; seatW: number; seatD: number; seatBackH: number;
  /** rear bench (three-box sedans, pickup cabs): back centre z, cushion centre z, width; optional parcel shelf (y, z, width) */
  rear?: { backZ: number; cushZ: number; w: number; shelf?: { y: number; z: number; w: number } };
  /** tailgate bodies: rows of seats behind the front ones, each a cushion centre z, the seat width and how many across */
  rows?: { z: number; w: number; xs: number[] }[];
  /** bus: seats along the walls (x of each side, cushion y, z of each row), driver and fare-box side */
  bus?: { wallX: number; y: number; rows: number[]; driverX: number; driverZ: number; wheelY: number; wheelZ: number };
}

// ---------------------------------------------------------------- the kit (pure data)

type Pick<T> = readonly T[];
interface Profile {
  family: CabinFamily;
  dash: Pick<DashShape>;
  spokes: Pick<2 | 3 | 4>;
  rim: Pick<RimKind>;
  seat: Pick<SeatKind>;
  seatCols: Pick<[number, number]>;
  dashCols: Pick<number>;
  trimCols: Pick<number>;
  shift: Pick<ShiftKind>;
  /** props that always ride, and props that ride by chance (name, probability) */
  props: Pick<CabinProp>;
  maybe?: Pick<[CabinProp, number]>;
}

// colour families (seat, seat front panel): worn cloth, vinyl and leather in muted, believable colours
const CLOTH: Pick<[number, number]> = [[0x6a5c48, 0x7c6e58], [0x4b505c, 0x5d6370], [0x70403f, 0x85514f], [0x56604f, 0x687260], [0x8a8272, 0x9c9484], [0x3d4452, 0x4e5666]];
const VINYL_BLACK: Pick<[number, number]> = [[0x1d1e21, 0x2b2d31], [0x26272a, 0x35373b]];
const VINYL_GREY: Pick<[number, number]> = [[0x585d63, 0x6a7077], [0x6b6f73, 0x7d8286]];
const LEATHER: Pick<[number, number]> = [[0x85552f, 0x9a6a3f], [0x1e1f22, 0x30323a], [0x8a2a25, 0x9f3b36], [0x9a8a6e, 0xaa9a7e]];
const SPORT: Pick<[number, number]> = [[0x8a2a25, 0x15161a], [0x1e1f22, 0xa02820], [0x24272d, 0x6a7078], [0x85552f, 0x1e1f22]];
const BUS_BLUE: Pick<[number, number]> = [[0x2f4f7a, 0x3d6290], [0x3a5a8a, 0x4a6e9c]];
const BUS_GREEN: Pick<[number, number]> = [[0x4f6a38, 0x5e7a45], [0x8a7a30, 0x9a8a40]];
const BUS_VINYL: Pick<[number, number]> = [[0xb08a2a, 0xc09a3a], [0x7a8088, 0x8a9098]];
const DASH_DARK: Pick<number> = [0x25272b, 0x2c2e33, 0x1f2124];
const DASH_WARM: Pick<number> = [0x3b3228, 0x45392c, 0x4a4036];
const DASH_COOL: Pick<number> = [0x2a323c, 0x303a46, 0x2f3438];
const TRIM_BRIGHT: Pick<number> = [0xc9ccd0, 0xb8bcc2, 0xc7b890, 0x9a9ea5];

const PROFILES: Record<string, Profile> = {
  sedan: { family: 'car', dash: ['flat', 'cowled', 'strip', 'flat'], spokes: [3, 4, 3], rim: ['thin', 'thick'], seat: ['bench', 'buckets', 'buckets'], seatCols: [...CLOTH, ...CLOTH, ...LEATHER], dashCols: [...DASH_DARK, ...DASH_COOL, ...DASH_WARM], trimCols: TRIM_BRIGHT, shift: ['column', 'floor', 'floor'], props: [], maybe: [['dice', 0.1], ['freshener', 0.16], ['cup', 0.2], ['tissues', 0.15]] },
  coupe: { family: 'car', dash: ['cowled', 'twinpod'], spokes: [3, 4], rim: ['sport', 'thick'], seat: ['buckets', 'highback'], seatCols: [...CLOTH, ...LEATHER], dashCols: DASH_DARK, trimCols: TRIM_BRIGHT, shift: ['floor'], props: [], maybe: [['dice', 0.14], ['freshener', 0.2]] },
  suv: { family: 'car', dash: ['cowled', 'flat', 'slab'], spokes: [3, 4], rim: ['thick', 'thin'], seat: ['buckets', 'bench', 'captain'], seatCols: [...CLOTH, ...LEATHER, ...VINYL_GREY], dashCols: [...DASH_DARK, ...DASH_WARM], trimCols: TRIM_BRIGHT, shift: ['column', 'floor'], props: [], maybe: [['cup', 0.3], ['freshener', 0.15], ['tissues', 0.12]] },
  van: { family: 'car', dash: ['slab', 'flat'], spokes: [2, 4], rim: ['truck', 'thick'], seat: ['vinylBench', 'bench'], seatCols: [...VINYL_GREY, ...VINYL_BLACK, ...CLOTH], dashCols: [...DASH_COOL, ...DASH_DARK], trimCols: TRIM_BRIGHT, shift: ['column', 'floor'], props: ['clipboard'], maybe: [['cup', 0.4], ['freshener', 0.2], ['cb', 0.25]] },
  truck: { family: 'truck', dash: ['slab'], spokes: [2, 4], rim: ['truck'], seat: ['vinylBench'], seatCols: [...VINYL_GREY, ...VINYL_BLACK], dashCols: [...DASH_COOL, ...DASH_DARK], trimCols: TRIM_BRIGHT, shift: ['floor'], props: ['clipboard'], maybe: [['cb', 0.45], ['cup', 0.4]] },
};
const P = PROFILES;
const derive = (base: Profile, o: Partial<Profile>): Profile => ({ ...base, ...o });

/** body style -> profile */
const BY_STYLE: Record<string, Profile> = {
  sedan: P.sedan,
  coupe: derive(P.sedan, { dash: ['flat', 'cowled'], seat: ['buckets', 'bench'], rim: ['thin', 'sport'] }),
  hatch: derive(P.sedan, { dash: ['flat', 'twinpod', 'strip'], seat: ['buckets', 'buckets', 'bench'], seatCols: [...CLOTH, ...CLOTH, ...SPORT.slice(2)], spokes: [3, 3, 4], rim: ['thin', 'sport'], shift: ['floor'] }),
  beater: derive(P.sedan, { dash: ['strip', 'flat'], seat: ['bench', 'vinylBench'], seatCols: [...VINYL_GREY, ...CLOTH, ...VINYL_BLACK], dashCols: DASH_WARM, spokes: [2, 3], rim: ['thin', 'thick'], props: [], maybe: [['dice', 0.3], ['freshener', 0.35], ['cup', 0.4], ['tissues', 0.3]] }),
  classic: derive(P.sedan, { dash: ['strip'], seat: ['bench'], seatCols: [[0x6e3b32, 0x82493f], [0x3f5a52, 0x4e6c63], [0x8a7a58, 0x9b8b69], [0x34405a, 0x44516d]], dashCols: DASH_WARM, trimCols: [0xd0d4d8, 0xc7b890], spokes: [2, 2, 3], rim: ['thin', 'thick'], shift: ['column'], maybe: [['dice', 0.35], ['tissues', 0.3]] }),
  donk: derive(P.sedan, { dash: ['strip'], seat: ['bench'], seatCols: [[0x6a2a6a, 0x803c80], [0x2a4f8a, 0x3a609c], [0x8a2a25, 0x9f3b36]], shift: ['column'], maybe: [['dice', 0.7], ['freshener', 0.5]] }),
  towncar: derive(P.sedan, { dash: ['strip'], seat: ['bench'], seatCols: [[0x7a6a50, 0x8c7c62], [0x4a3a38, 0x5d4c49], [0x3d4452, 0x4e5666]], dashCols: DASH_WARM, trimCols: [0xc7b890, 0xd0d4d8], spokes: [2, 3], rim: ['thick'], shift: ['column'], maybe: [['tissues', 0.5], ['freshener', 0.2]] }),
  luxury: derive(P.sedan, { dash: ['cowled', 'twinpod'], seat: ['highback', 'buckets'], seatCols: LEATHER, dashCols: [...DASH_DARK, ...DASH_WARM], trimCols: [0xc7b890, 0xb8bcc2], spokes: [3, 4], rim: ['thick', 'sport'], shift: ['floor'], maybe: [['cup', 0.15]] }),
  limo: derive(P.sedan, { dash: ['cowled', 'flat'], seat: ['bench', 'buckets'], seatCols: [[0x1e1f22, 0x30323a], [0x7a6a50, 0x8c7c62], [0x3d4452, 0x4e5666]], dashCols: DASH_DARK, trimCols: [0xc7b890, 0xd0d4d8], rim: ['thick'], shift: ['column'], maybe: [['tissues', 0.7], ['cup', 0.2]] }),
  livery: derive(P.sedan, { dash: ['flat', 'cowled'], seat: ['bench', 'buckets'], seatCols: [...LEATHER.slice(0, 2), ...VINYL_BLACK], dashCols: DASH_DARK, shift: ['column', 'floor'], props: [], maybe: [['tissues', 0.5]] }),
  evsedan: derive(P.sedan, { dash: ['screen'], seat: ['buckets', 'highback'], seatCols: [[0xd8d6cf, 0xe8e6df], [0x1e1f22, 0x30323a], [0x8a8d92, 0x9da0a5]], dashCols: [0x2a2c30, 0x34363a], trimCols: [0x9a9ea5, 0xb8bcc2], spokes: [2, 3], rim: ['sport'], shift: ['none'], maybe: [['cup', 0.2]] }),
  wagon: derive(P.sedan, { dash: ['flat', 'strip'], seat: ['bench', 'buckets'], seatCols: [...CLOTH, [0x70403f, 0x85514f]], dashCols: DASH_WARM, shift: ['column', 'floor'], maybe: [['cup', 0.3], ['freshener', 0.2], ['tissues', 0.3]] }),
  cab: derive(P.sedan, { dash: ['flat'], seat: ['bench', 'highback'], seatCols: [...VINYL_BLACK, ...VINYL_GREY, [0x3d3a36, 0x4d4a45]], dashCols: DASH_DARK, spokes: [3], rim: ['thick'], shift: ['column'], props: ['meter', 'partition'], maybe: [['freshener', 0.5], ['cup', 0.25]] }),
  cop: derive(P.sedan, { dash: ['cowled', 'flat'], seat: ['buckets'], seatCols: [...VINYL_BLACK, [0x1d2430, 0x2b3544]], dashCols: [0x1f2124, 0x25272b], spokes: [3], rim: ['thick'], shift: ['column'], props: ['radio', 'laptop', 'cage'], maybe: [['cup', 0.5]] }),
  unmarked: derive(P.sedan, { dash: ['cowled'], seat: ['buckets'], seatCols: VINYL_BLACK.concat(CLOTH.slice(1, 2)), dashCols: DASH_DARK, shift: ['column'], props: ['radio'], maybe: [['laptop', 0.5], ['cup', 0.6]] }),
  copsuv: derive(P.suv, { dash: ['cowled'], seat: ['buckets'], seatCols: VINYL_BLACK, dashCols: [0x1f2124], spokes: [3], rim: ['thick'], shift: ['column'], props: ['radio', 'laptop', 'cage'], maybe: [['cup', 0.5]] }),
  suv: P.suv,
  crossover: derive(P.suv, { dash: ['cowled', 'twinpod', 'screen'], seat: ['buckets'], seatCols: [...CLOTH, ...LEATHER], rim: ['thick', 'sport'], shift: ['floor', 'column'] }),
  bigsuv: derive(P.suv, { dash: ['slab', 'cowled'], seat: ['bench', 'captain', 'buckets'], rim: ['thick', 'truck'], seatCols: [...LEATHER, ...CLOTH, ...VINYL_GREY], trimCols: [0xb8bcc2, 0x9a9ea5] }),
  minivan: derive(P.suv, { dash: ['flat', 'twinpod', 'strip'], seat: ['captain', 'bench'], seatCols: [...CLOTH, ...CLOTH, ...VINYL_GREY], rim: ['thin', 'thick'], shift: ['column', 'floor'], maybe: [['cup', 0.5], ['tissues', 0.3], ['freshener', 0.25]] }),
  taxivan: derive(P.suv, { dash: ['flat', 'strip'], seat: ['captain', 'bench'], seatCols: [...VINYL_BLACK, ...VINYL_GREY], dashCols: DASH_DARK, spokes: [3], rim: ['thick'], shift: ['column'], props: ['meter'], maybe: [['freshener', 0.5], ['cup', 0.25]] }),
  hearse: derive(P.sedan, { dash: ['strip', 'cowled'], seat: ['bench', 'buckets'], seatCols: [[0x2a2f3a, 0x3a4150], [0x3a2a2a, 0x4b3a3a], [0x1e1f22, 0x30323a]], dashCols: DASH_DARK, shift: ['column'], maybe: [['tissues', 0.6]] }),
  pickup: derive(P.suv, { dash: ['slab', 'flat'], seat: ['vinylBench', 'bench'], seatCols: [...VINYL_GREY, ...CLOTH, ...VINYL_BLACK], rim: ['thick', 'truck'], shift: ['column', 'floor'], maybe: [['cup', 0.4], ['cb', 0.15], ['dice', 0.15]] }),
  minitruck: derive(P.suv, { dash: ['flat', 'slab'], seat: ['vinylBench'], seatCols: [...VINYL_GREY, ...VINYL_BLACK], spokes: [2, 3], rim: ['thin', 'thick'], shift: ['floor'], maybe: [['dice', 0.25], ['cup', 0.3]] }),
  wedgetruck: derive(P.suv, { dash: ['screen'], seat: ['highback', 'buckets'], seatCols: [[0x8a8d92, 0xa0a3a8], [0x1e1f22, 0x30323a]], dashCols: [0x34363a], trimCols: [0xb8bcc2], spokes: [2], rim: ['sport'], shift: ['none'], maybe: [] }),
  muscle: derive(P.coupe, { dash: ['twinpod', 'cowled'], seat: ['buckets', 'bench'], seatCols: [...VINYL_BLACK, ...SPORT, [0x8a2a25, 0x15161a]], rim: ['thick', 'thin'], spokes: [3, 2], trimCols: [0xd0d4d8, 0xb8bcc2] }),
  pony: derive(P.coupe, { dash: ['twinpod', 'strip'], seat: ['buckets', 'bench'], seatCols: [...VINYL_BLACK, ...SPORT, [0x8a7a58, 0x9b8b69]], spokes: [3, 2], rim: ['thin', 'thick'], maybe: [['dice', 0.3], ['freshener', 0.2]] }),
  convertible: derive(P.coupe, { dash: ['cowled', 'strip', 'flat'], seat: ['buckets', 'highback'], seatCols: [...LEATHER, ...SPORT], rim: ['thin', 'sport'] }),
  coupe911: derive(P.coupe, { dash: ['twinpod'], seat: ['highback'], seatCols: SPORT, spokes: [3], rim: ['sport'], dashCols: [0x1b1c1f, 0x25272b] }),
  exotic: derive(P.coupe, { dash: ['twinpod', 'screen'], seat: ['highback'], seatCols: [...SPORT, [0xb0782a, 0x1e1f22]], spokes: [3, 4], rim: ['sport'], dashCols: [0x15161a, 0x1e1f22], trimCols: [0x9a9ea5, 0xc7b890] }),
  jdmcoupe: derive(P.coupe, { dash: ['cowled', 'twinpod'], seat: ['highback', 'buckets'], seatCols: [...SPORT, ...CLOTH.slice(1, 2)], spokes: [3, 3, 4], rim: ['sport', 'thin'], maybe: [['dice', 0.25], ['freshener', 0.3]] }),
  hothatch: derive(P.coupe, { dash: ['twinpod', 'flat'], seat: ['highback', 'buckets'], seatCols: [...SPORT, ...CLOTH.slice(1, 2)], spokes: [3], rim: ['sport'] }),
  cargo: derive(P.van, { props: ['clipboard'] }),
  panelvan: derive(P.van, { dash: ['slab', 'flat'], props: ['clipboard'] }),
  stepvan: derive(P.van, { dash: ['slab'], seat: ['vinylBench'], rim: ['truck'], spokes: [2], props: ['clipboard'], maybe: [['cb', 0.4], ['cup', 0.4]] }),
  icecream: derive(P.van, { dash: ['slab'], seat: ['vinylBench'], rim: ['truck'], spokes: [2], seatCols: [[0xb8a0c0, 0xc8b0d0], [0xe0b0c0, 0xf0c0d0], ...VINYL_GREY], dashCols: [0x5a4a6a, 0x6a5a7a], props: [], maybe: [['cup', 0.5], ['cb', 0.1]] }),
  foodtruck: derive(P.van, { dash: ['slab'], rim: ['truck'], spokes: [2], props: [], maybe: [['cup', 0.6], ['clipboard', 0.5]] }),
  dollar: derive(P.van, { dash: ['slab', 'flat'], seat: ['vinylBench'], seatCols: [...VINYL_GREY, ...CLOTH], props: ['fareBox'], maybe: [['cup', 0.3], ['dice', 0.3], ['freshener', 0.3]] }),
  ambulance: derive(P.van, { dash: ['slab'], seat: ['vinylBench'], seatCols: [[0x2a3a52, 0x3a4c68], [0x585d63, 0x6a7077]], dashCols: DASH_COOL, props: ['radio', 'jumpbag'], maybe: [] }),
  van: derive(P.truck, { props: ['clipboard'] }),
  garbage: derive(P.truck, { props: [], maybe: [['cb', 0.5], ['cup', 0.5]] }),
  towtruck: derive(P.truck, { props: ['cb'], maybe: [['clipboard', 0.5], ['cup', 0.5]] }),
  flatbed: derive(P.truck, { props: ['clipboard'], maybe: [['cb', 0.5]] }),
  sweeper: derive(P.truck, { props: [], maybe: [['cup', 0.5], ['clipboard', 0.5]] }),
  bucket: derive(P.truck, { props: ['cb'], maybe: [['clipboard', 0.5]] }),
  bus: { family: 'bus', dash: ['slab'], spokes: [2], rim: ['truck'], seat: ['bus'], seatCols: [...BUS_BLUE, ...BUS_VINYL], dashCols: DASH_COOL, trimCols: TRIM_BRIGHT, shift: ['none'], props: ['fareBox'], maybe: [] },
  schoolbus: { family: 'bus', dash: ['slab'], spokes: [2], rim: ['truck'], seat: ['bus'], seatCols: BUS_GREEN, dashCols: DASH_DARK, trimCols: TRIM_BRIGHT, shift: ['none'], props: [], maybe: [] },
};

/** Every body style the kit knows (the test compares this with the game's list). */
export const CABIN_STYLES: readonly string[] = Object.keys(BY_STYLE);

/** The cabin of one car: the same style and seed always give the same kit, other seeds of a private type usually differ. */
export function cabinKitFor(style: string, seed: number): CabinKit {
  const pr = BY_STYLE[style] ?? P.sedan;
  const r = new Rng(`cabin:${style}:${seed >>> 0}`);
  const dash = r.pick(pr.dash);
  const spokes = r.pick(pr.spokes);
  const rim = r.pick(pr.rim);
  const seat = r.pick(pr.seat);
  const [seatCol, seatAlt] = r.pick(pr.seatCols);
  const dashCol = r.pick(pr.dashCols);
  const trimCol = r.pick(pr.trimCols);
  const shift = r.pick(pr.shift);
  const props: CabinProp[] = [...pr.props];
  for (const [p, c] of pr.maybe ?? []) if (r.chance(c) && !props.includes(p)) props.push(p);
  const key = [style, dash, spokes, rim, seat, seatCol.toString(16), dashCol.toString(16), trimCol.toString(16), shift, props.join('.')].join('|');
  return { family: pr.family, dash, spokes, rim, seat, seatCol, seatAlt, dashCol, trimCol, shift, props, key };
}

// ---------------------------------------------------------------- geometry

const shade = (hex: number, f: number): number => {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(f).getHex();
};

/** Cabin triangles kept on the lite near model (the smallest go first). */
export const LITE_CABIN_TRIS = 300;

/** One vertex-coloured geometry (position, normal, uv, color; non-indexed) for the inside of a car, or null when empty. */
export function buildCabin(s: CabinSpec, kit: CabinKit, near: boolean): THREE.BufferGeometry | null {
  const out: THREE.BufferGeometry[] = [];
  const box = (col: number, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    out.push(colored(g.translate(x, y, z), col));
  };
  const cylY = (col: number, r: number, h: number, x: number, y: number, z: number, seg = 6): void => {
    out.push(colored(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z), col));
  };
  const dark = 0x14161a;
  const bus = kit.family === 'bus' && s.bus;

  // ---- dash: shape by kit
  const hw = s.hw, dY = s.dashY, dZ = s.dashZ;
  const dc = kit.dashCol;
  const dashSlab = (h: number, d: number): void => box(dc, 2 * hw, h, d, 0, dY - h / 2 - 0.02, dZ);
  const ws0 = kit.family === 'bus' ? 0 : 1;
  if (ws0) {
    switch (kit.dash) {
      case 'flat':
        dashSlab(0.16, 0.3);
        box(dark, 0.34, 0.05, 0.02, s.wheelX, dY - 0.1, dZ + 0.155);
        box(kit.trimCol, 2 * hw * 0.94, 0.018, 0.012, 0, dY - 0.045, dZ + 0.153);
        break;
      case 'cowled':
        dashSlab(0.16, 0.3);
        box(shade(dc, 1.15), 0.42, 0.075, 0.18, s.wheelX, dY + 0.015, dZ + 0.02); // hood over the instruments
        box(shade(dc, 0.85), 0.2, 0.2, 0.22, 0, dY - 0.1, dZ + 0.1); // centre stack
        if (near) box(kit.trimCol, 0.16, 0.012, 0.012, 0, dY - 0.03, dZ + 0.212);
        break;
      case 'twinpod':
        dashSlab(0.12, 0.3);
        for (const px of [s.wheelX, -s.wheelX * 0.9]) box(shade(dc, 1.2), 0.34, 0.1, 0.16, px, dY + 0.0, dZ + 0.03);
        box(shade(dc, 0.85), 0.16, 0.22, 0.2, 0, dY - 0.1, dZ + 0.1);
        break;
      case 'slab':
        box(dc, 2 * hw, 0.22, 0.4, 0, dY - 0.13, dZ);
        box(shade(dc, 1.2), 0.5, 0.09, 0.2, s.wheelX, dY - 0.0, dZ + 0.05); // binnacle
        box(shade(dc, 0.8), 0.5, 0.12, 0.02, 0.4, dY - 0.14, dZ + 0.21); // glove box door
        break;
      case 'screen':
        dashSlab(0.1, 0.28);
        box(0x16222e, 0.34, 0.2, 0.025, 0, dY + 0.07, dZ + 0.04, -0.15); // the tablet
        if (near) box(0x2c5878, 0.3, 0.16, 0.004, 0, dY + 0.07, dZ + 0.055, -0.15);
        box(dark, 0.24, 0.06, 0.02, s.wheelX, dY - 0.03, dZ + 0.1);
        break;
      case 'strip':
        dashSlab(0.17, 0.28);
        box(kit.trimCol, 2 * hw * 0.9, 0.028, 0.01, 0, dY - 0.075, dZ + 0.144); // chrome band
        box(dark, 0.5, 0.045, 0.02, s.wheelX + 0.1, dY - 0.03, dZ + 0.146); // long speedometer
        break;
    }
  } else if (s.bus) {
    box(dc, 0.95, 0.24, 0.3, s.bus.driverX, dY - 0.12, dZ);
    box(dark, 0.3, 0.05, 0.02, s.bus.driverX, dY - 0.02, dZ + 0.155);
  }

  // ---- steering wheel
  const R = kit.rim === 'truck' ? 0.22 : kit.rim === 'sport' ? 0.145 : 0.17;
  const tube = kit.rim === 'thick' ? 0.026 : kit.rim === 'sport' ? 0.022 : kit.rim === 'truck' ? 0.02 : 0.011;
  const wx = bus ? s.bus!.driverX : s.wheelX, wy = bus ? s.bus!.wheelY : s.wheelY, wz = bus ? s.bus!.wheelZ : s.wheelZ;
  {
    const parts: THREE.BufferGeometry[] = [];
    parts.push(new THREE.TorusGeometry(R, tube, near ? 5 : 4, near ? 12 : 8));
    const bar = (a: number): void => { parts.push(new THREE.BoxGeometry(R * 1.9, 0.02, 0.016).rotateZ(a)); };
    if (kit.spokes === 2) bar(0);
    else if (kit.spokes === 3) { bar(0); parts.push(new THREE.BoxGeometry(0.02, R * 0.95, 0.016).translate(0, -R * 0.47, 0)); }
    else { bar(0); bar(Math.PI / 2); }
    parts.push(new THREE.BoxGeometry(0.075, 0.075, 0.03));
    const wheel = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    for (const g of parts) g.dispose();
    if (wheel) {
      wheel.rotateX(-s.wheelTilt).translate(wx, wy, wz);
      out.push(colored(wheel, shade(kit.rim === 'truck' ? 0x2a2c30 : 0x1a1b1e, 1)));
    }
    out.push(colored(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5).rotateX(Math.PI / 2).translate(wx, wy - 0.06, wz - 0.1), 0x15161a)); // column
    if (kit.shift === 'column') box(0x1a1b1e, 0.11, 0.014, 0.014, wx + 0.1, wy - 0.07, wz - 0.07, 0, 0, 0.1); // the lever on the column
  }

  if (!bus) {
    // ---- mirror, and what hangs from it
    const mY = dY + 0.27, mZ = dZ + 0.07;
    box(dark, 0.17, 0.05, 0.03, 0, mY, mZ);
    box(dark, 0.02, 0.1, 0.02, 0, mY + 0.07, mZ - 0.03);
    if (kit.props.includes('dice')) {
      box(0xf2f2ec, 0.04, 0.04, 0.04, -0.04, mY - 0.18, mZ + 0.01, 0.4, 0.5, 0.3);
      box(0xe9e9e2, 0.04, 0.04, 0.04, 0.03, mY - 0.2, mZ + 0.02, 0.2, 0.9, 0.5);
      cylY(0xcfcfc8, 0.003, 0.13, -0.03, mY - 0.08, mZ + 0.01, 3);
    }
    if (kit.props.includes('freshener')) {
      const c = [0x3f8a45, 0xd8d070, 0xe86aa0, 0x4aa6c8][(kit.seatCol >> 3) & 3];
      box(c, 0.045, 0.085, 0.006, 0.07, mY - 0.1, mZ + 0.012, 0, 0.3, 0.2);
      cylY(0xcfcfc8, 0.003, 0.06, 0.07, mY - 0.03, mZ + 0.012, 3);
    }

    // ---- gear lever, console
    const floorShift = kit.shift === 'floor';
    const bucketsLike = kit.seat === 'buckets' || kit.seat === 'highback' || kit.seat === 'captain';
    if (floorShift) {
      cylY(0x1a1b1e, 0.013, 0.2, 0.0, s.seatY + 0.2, s.seatZ - 0.22, 4);
      box(0x1a1b1e, 0.045, 0.045, 0.045, 0.0, s.seatY + 0.32, s.seatZ - 0.22);
    }
    if (bucketsLike && kit.family === 'car') box(shade(kit.dashCol, 1.1), 0.17, 0.14, 0.6, 0, s.seatY + 0.05, s.seatZ - 0.1);
    else if (kit.family === 'truck' || kit.seat === 'vinylBench') box(shade(kit.seatCol, 0.8), 0.14, 0.1, 0.4, 0, s.seatY + 0.02, s.seatZ - 0.05);

    // ---- front seats
    const sy = s.seatY, sz = s.seatZ, backZ = sz + 0.24, bh = s.seatBackH;
    const backY = sy + 0.03 + bh / 2;
    const seatCol = kit.seatCol, alt = kit.seatAlt;
    const single = (x0: number, w: number, high: boolean): void => {
      box(seatCol, w, 0.1, s.seatD, x0, sy + 0.03, sz); // cushion
      box(seatCol, w, bh, 0.12, x0, backY, backZ); // back
      box(alt, w * 0.62, bh * 0.7, 0.012, x0, backY - bh * 0.05, backZ - 0.066); // the panel on the seat front
      if (high) {
        box(seatCol, w * 0.7, 0.2, 0.1, x0, sy + 0.03 + bh + 0.08, backZ + 0.01); // one-piece head restraint
      } else {
        box(seatCol, w * 0.44, 0.13, 0.08, x0, sy + 0.03 + bh + 0.06, backZ); // headrest
      }
      if (near && (kit.seat === 'highback' || kit.seat === 'captain' || kit.seat === 'buckets')) {
        for (const q of [-1, 1]) box(shade(seatCol, 0.85), 0.06, bh * 0.6, 0.15, x0 + q * (w / 2 - 0.02), backY - 0.05, backZ - 0.03); // bolsters
      }
    };
    if (kit.seat === 'bench' || kit.seat === 'vinylBench') {
      const w = Math.min(2 * s.hw * 0.94, s.seatW * 2.4);
      const split = kit.seat === 'bench';
      box(seatCol, w, 0.1, s.seatD, 0, sy + 0.03, sz);
      if (split) {
        box(seatCol, w * 0.58, bh, 0.12, -w * 0.21, backY, backZ);
        box(seatCol, w * 0.38, bh * 0.94, 0.12, w * 0.3, backY - bh * 0.03, backZ);
        box(alt, w * 0.46, bh * 0.7, 0.012, -w * 0.21, backY - bh * 0.05, backZ - 0.066);
        box(alt, w * 0.28, bh * 0.66, 0.012, w * 0.3, backY - bh * 0.05, backZ - 0.066);
        if (near) for (const q of [-0.3, 0.3]) box(seatCol, 0.16, 0.12, 0.08, q * w * 0.75 - 0.0, sy + 0.03 + bh + 0.06, backZ);
      } else {
        box(seatCol, w, bh, 0.12, 0, backY, backZ);
        box(alt, w * 0.8, bh * 0.7, 0.012, 0, backY - bh * 0.05, backZ - 0.066);
      }
    } else {
      const w = s.seatW;
      for (const q of [-1, 1]) single(q * s.seatX, w, kit.seat === 'highback');
      if (kit.seat === 'captain' && near) for (const q of [-1, 1]) box(shade(seatCol, 0.9), 0.05, 0.05, 0.3, q * (s.seatX + w / 2 + 0.03) * 0.98, sy + 0.22, sz); // arm rests
    }

    // ---- rear bench, shelf, tailgate rows
    if (s.rear) {
      const r = s.rear;
      box(seatCol, r.w, 0.1, 0.5, 0, sy + 0.0, r.cushZ);
      box(seatCol, r.w, 0.5, 0.12, 0, sy + 0.26, r.backZ);
      if (near) for (const q of [-1, 0, 1]) box(seatCol, 0.16, 0.1, 0.07, q * 0.4, sy + 0.58, r.backZ);
      if (r.shelf) {
        box(shade(dc, 0.9), r.shelf.w, 0.03, 0.34, 0, r.shelf.y, r.shelf.z);
        if (kit.props.includes('tissues')) box([0xd0d8e0, 0xe0d0d8, 0xd8e0c8][(kit.seatCol >> 4) % 3], 0.24, 0.07, 0.12, 0.2, r.shelf.y + 0.05, r.shelf.z);
      }
    }
    if (s.rows) for (const row of s.rows) for (const x0 of row.xs) {
      box(seatCol, row.w, 0.5, 0.12, x0, sy + 0.26, row.z + 0.24);
      box(seatCol, row.w, 0.1, 0.46, x0, sy, row.z);
    }

    // ---- props by type
    const has = (p: CabinProp): boolean => kit.props.includes(p);
    if (has('cup')) {
      cylY(0xe8e0cf, 0.032, 0.09, 0.42, dY + 0.03, dZ + 0.06, 6);
      cylY(0x4a3020, 0.034, 0.014, 0.42, dY + 0.085, dZ + 0.06, 6);
    }
    if (has('meter')) {
      box(0x1a1b1d, 0.13, 0.085, 0.07, 0.14, dY + 0.06, dZ + 0.02);
      box(0x4ad060, 0.09, 0.03, 0.005, 0.14, dY + 0.07, dZ + 0.058);
      box(0xe8a010, 0.03, 0.015, 0.005, 0.18, dY + 0.03, dZ + 0.058);
    }
    if (has('clipboard')) {
      box(0xa8844e, 0.2, 0.27, 0.012, 0.42, dY + 0.05, dZ + 0.0, -0.9);
      box(0xf0f0e8, 0.17, 0.22, 0.004, 0.42, dY + 0.056, dZ + 0.004, -0.9);
    }
    if (has('cb')) {
      box(0x1a1b1d, 0.16, 0.06, 0.1, 0.02, dY - 0.27, dZ + 0.14);
      box(0x2a2c30, 0.05, 0.08, 0.035, 0.12, dY - 0.31, dZ + 0.16);
    }
    if (has('radio')) {
      box(0x1a1b1d, 0.2, 0.06, 0.14, 0.0, sy + 0.15, sz - 0.36);
      box(0xe0a020, 0.04, 0.012, 0.03, -0.05, sy + 0.185, sz - 0.36);
      box(0xc02a2a, 0.03, 0.012, 0.03, 0.04, sy + 0.185, sz - 0.36);
    }
    if (has('laptop')) {
      box(0x2a2c30, 0.025, 0.34, 0.025, 0.12, sy + 0.22, sz - 0.1);
      box(0x23364a, 0.32, 0.21, 0.02, 0.12, sy + 0.44, sz - 0.12, -0.22, -0.45);
      if (near) box(0x5fa0d0, 0.27, 0.16, 0.004, 0.12 - 0.002, sy + 0.44, sz - 0.108, -0.22, -0.45);
    }
    if (has('jumpbag')) box(0xd9561c, 0.36, 0.22, 0.24, s.seatX, sy + 0.2, sz);
    if (has('fareBox')) box(0x6a7078, 0.22, 0.3, 0.2, s.seatX * 1.1, dY - 0.3, dZ + 0.12);
    if (has('partition') || has('cage')) {
      const pz = backZ + 0.18, py = sy + 0.03 + bh * 0.55;
      const cage = has('cage');
      box(0x1d1f23, 2 * hw * 0.92, 0.035, 0.035, 0, sy + 0.03 + bh + 0.08, pz);
      box(0x1d1f23, 2 * hw * 0.92, 0.03, 0.03, 0, sy + 0.06, pz);
      for (const q of [-1, 1]) box(0x1d1f23, 0.035, bh * 1.0 + 0.1, 0.035, q * hw * 0.46, py, pz);
      if (cage) {
        for (let k = -2; k <= 2; k++) if (k !== 0 || near) box(0x2a2c30, 0.014, bh * 1.0, 0.014, k * hw * 0.2, py, pz);
      } else {
        box(0x2a2c30, 2 * hw * 0.9, bh * 0.52, 0.02, 0, sy + 0.03 + bh * 0.26, pz); // solid lower panel
        box(0x6a7078, 0.3, 0.05, 0.022, 0.0, sy + 0.03 + bh * 0.55, pz); // cash slot
      }
    }
  } else {
    // ---- bus: seats along the walls, driver's seat, fare box
    const b = s.bus!;
    const bc = kit.seatCol, ba = kit.seatAlt;
    for (const u of near ? b.rows : b.rows.filter((_, i) => i % 2 === 0)) for (const q of [-1, 1]) { // the lite bus keeps every other row
      box(bc, 0.8, 0.14, 0.45, q * b.wallX, b.y, u);
      box(ba, 0.8, 0.5, 0.1, q * b.wallX, b.y + 0.35, u + 0.2);
    }
    box(shade(bc, 0.85), 0.6, 0.14, 0.5, b.driverX, b.y + 0.08, b.driverZ);
    box(shade(bc, 0.85), 0.55, 0.55, 0.1, b.driverX, b.y + 0.42, b.driverZ + 0.22);
    if (kit.props.includes('fareBox')) { box(0x6a7078, 0.3, 0.5, 0.35, -b.driverX + 0.05, b.y + 0.25, b.driverZ - 0.1); box(0x2a6a8a, 0.18, 0.1, 0.01, -b.driverX + 0.05, b.y + 0.4, b.driverZ + 0.08); }
    if (kit.shift === 'floor') box(0x1a1b1e, 0.04, 0.04, 0.04, b.driverX + 0.4, b.y + 0.3, b.driverZ - 0.2);
  }

  if (out.length === 0) return null;
  const merged = mergeGeometries(out, false);
  for (const g of out) g.dispose();
  return merged;
}
