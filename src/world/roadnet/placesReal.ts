/**
 * REALPLACES (WP9): the game's places on the real map. Real path only: nothing in the default build imports this.
 *
 * The game asks the grid for four kinds of answer, and this module answers each from a RoadNet + its derived faces + the
 * placed lots, with the same numbers the grid gives:
 *   facePoint(blockId, side, t, extra)  sidewalk point in front of a grid block face, t 0..1 along it left -> right
 *   frontage(blockId, side, t)          the same point on the building line plus the outward normal (ambient notices, blips)
 *   poiSpot(poiId, along) / poiDoor     the sidewalk point in front of a shop door, and its door position and facing
 *   streetMid(street, from, to)         the middle of a street between two crossings, on its centreline
 *   corner(ns, ew)                      the crossing of two streets by name
 *   interiorDoor(id)                    the door of HOME, the deli and the club (a `DoorDef`, as interiors/defs.ts)
 * The grid ids (r1c0, 'throop', 'komat') stay the vocabulary of the mission content; `data/places-real.json` says what each of
 * them is on the real map.
 *
 * A grid block is one or more real blocks. The grid has no Dekalb Ave, so "Pulaski to Kosciuszko" is two real blocks end to
 * end: a grid block maps to a CHAIN of real blocks (north to south) and a face to the faces of the chain on that street, joined
 * end to end (t measures their summed length, the cross-street gap excluded, so a spot never lands in a roadway).
 */
import type { Vec2 } from '@/core/Math2';
import type { PoiDef, Side } from '@/world/types';
import { INTERIORS, doorTrigger, type DoorDef, type InteriorId } from '@/world/interiors/defs';
import { NAV_TARGETS } from '@/game/missions/NavTargets';
import type { Derived } from './derive';
import type { RealFace } from './faces';
import { fitFootprint } from './buildingsReal';
import { distance } from './geom';
import type { RealLot } from './lotsReal';
import type { RoadNet } from './RoadNet';

// ---------------------------------------------------------------- the table (src/world/data/places-real.json)

export interface PlacesTable {
  meta: { v: number; core: string; note: string };
  /** grid street id -> real street name */
  streets: Record<string, string>;
  /** grid block id -> its four street names and the real blocks (net.blocks indices, north to south) */
  blocks: Record<string, { n: string; s: string; e: string; w: string; real: number[] }>;
  /** poi id -> the real lot */
  pois: Record<string, PlaceEntry>;
  /** interior id -> the real lot holding its door */
  interiors: Record<string, PlaceEntry>;
  /** every (block, side, t) the mission content, ambient notices and nav use -> nearest real lot */
  anchors: Array<[string, string, number, string, string, string]>;
}

export interface PlaceEntry { bbl: string; ad: string; at: string; /** how far along the matching grid face (0..1) */ t?: number; kind?: string }

export const slug = (n: string): string => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- chains of real faces

export interface ChainPiece { face: RealFace; block: number; index: number; len: number; cum: number }
export interface FaceChain { pieces: ChainPiece[]; total: number; street: string; side: Side }

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

/** the real blocks (north to south) that make up a grid block, or null when the real map has no such block */
export function matchGridBlock(net: RoadNet, d: Derived, faces: RealFace[][], names: { n: string; s: string; e: string; w: string }): number[] | null {
  const has = (bi: number, street: string, side: Side): boolean => faces[bi].some((f) => slug(net.edges[f.edge].name) === slug(street) && f.side === side);
  const centre = (bi: number): Vec2 => {
    const r = d.buildingRings[bi];
    return { x: r.reduce((a, p) => a + p.x, 0) / r.length, z: r.reduce((a, p) => a + p.z, 0) / r.length };
  };
  const inCol: number[] = [];
  for (let bi = 0; bi < faces.length; bi++) if (faces[bi].length && has(bi, names.e, 'E') && has(bi, names.w, 'W')) inCol.push(bi);
  const starts = inCol.filter((bi) => has(bi, names.n, 'N'));
  const ends = inCol.filter((bi) => has(bi, names.s, 'S'));
  if (!starts.length || !ends.length) return null;
  let best: number[] | null = null, bestLen = Infinity;
  for (const s of starts) for (const e of ends) {
    const cs = centre(s), ce = centre(e);
    const ax = { x: ce.x - cs.x, z: ce.z - cs.z };
    const al = Math.hypot(ax.x, ax.z);
    if (s !== e && al < 20) continue;
    const u = al ? { x: ax.x / al, z: ax.z / al } : { x: 0, z: 1 };
    if (s !== e && u.z < 0.5) continue; // the chain runs north to south
    const between = inCol
      .filter((bi) => { const c = centre(bi); const p = (c.x - cs.x) * u.x + (c.z - cs.z) * u.z; return p >= -1 && p <= al + 1; })
      .sort((a, b) => { const ca = centre(a), cb = centre(b); return ((ca.x - cs.x) * u.x + (ca.z - cs.z) * u.z) - ((cb.x - cs.x) * u.x + (cb.z - cs.z) * u.z); });
    if (between[0] !== s || between[between.length - 1] !== e) continue;
    if (al < bestLen) { bestLen = al; best = between; }
  }
  return best;
}

// ---------------------------------------------------------------- RealPlaces

export interface RealPlaceOptions {
  net: RoadNet;
  derived: Derived;
  faces: RealFace[][];
  lots: ReadonlyArray<RealLot>;
  table: PlacesTable;
  /** the parody POIs (bedstuy.json): archetype, sign, awning colour; the table only says where they are */
  pois: ReadonlyArray<PoiDef>;
}

export interface MapPlaceLike { id: string; kind: 'home' | 'venue' | 'shop' | 'station'; label: string; x: number; z: number; color?: string }

export class RealPlaces {
  readonly net: RoadNet;
  readonly faces: RealFace[][];
  readonly table: PlacesTable;
  readonly pois: ReadonlyArray<PoiDef>;
  readonly byBbl = new Map<string, RealLot>();
  private readonly chains = new Map<string, FaceChain | null>();
  private readonly edgesByName = new Map<string, number[]>();
  readonly lots: ReadonlyArray<RealLot>;

  constructor(o: RealPlaceOptions) {
    this.net = o.net; this.faces = o.faces; this.table = o.table; this.pois = o.pois; this.lots = o.lots;
    for (const l of o.lots) if (!l.wedge && l.bbl) this.byBbl.set(l.bbl, l);
    o.net.edges.forEach((e, i) => { const k = slug(e.name); const a = this.edgesByName.get(k); if (a) a.push(i); else this.edgesByName.set(k, [i]); });
  }

  // ---- faces

  /** the faces of grid block `blockId` on `side`, joined end to end; null when the block has no real counterpart */
  chain(blockId: string, side: Side): FaceChain | null {
    const key = `${blockId}/${side}`;
    if (this.chains.has(key)) return this.chains.get(key)!;
    const b = this.table.blocks[blockId];
    let out: FaceChain | null = null;
    if (b && b.real.length) {
      const street = { N: b.n, S: b.s, E: b.e, W: b.w }[side];
      const found: Array<{ face: RealFace; block: number; index: number }> = [];
      for (const bi of b.real) this.faces[bi].forEach((f, index) => { if (slug(this.net.edges[f.edge].name) === slug(street) && f.side === side) found.push({ face: f, block: bi, index }); });
      if (found.length) {
        const lead = found.reduce((m, x) => (distance(x.face.a, x.face.b) > distance(m.face.a, m.face.b) ? x : m), found[0]).face;
        const dl = Math.hypot(lead.b.x - lead.a.x, lead.b.z - lead.a.z) || 1;
        const dir = { x: (lead.b.x - lead.a.x) / dl, z: (lead.b.z - lead.a.z) / dl };
        found.sort((p, q) => (p.face.a.x * dir.x + p.face.a.z * dir.z) - (q.face.a.x * dir.x + q.face.a.z * dir.z));
        let cum = 0;
        const pieces = found.map((x) => { const len = distance(x.face.a, x.face.b); const p: ChainPiece = { face: x.face, block: x.block, index: x.index, len, cum }; cum += len; return p; });
        out = { pieces, total: cum, street, side };
      }
    }
    this.chains.set(key, out);
    return out;
  }

  private chainOrThrow(blockId: string, side: Side): FaceChain {
    const c = this.chain(blockId, side);
    if (!c) throw new Error(`no real face for ${blockId}/${side}`);
    return c;
  }

  /** piece and local parameter at t (0..1) along the chain */
  private at(c: FaceChain, t: number): { piece: ChainPiece; p: Vec2; s: number } {
    const s = Math.min(1, Math.max(0, t)) * c.total;
    let piece = c.pieces[c.pieces.length - 1];
    for (const pc of c.pieces) if (s <= pc.cum + pc.len) { piece = pc; break; }
    const u = piece.len ? Math.min(1, Math.max(0, (s - piece.cum) / piece.len)) : 0;
    return { piece, p: lerp2(piece.face.a, piece.face.b, u), s };
  }

  /** point on the building line of a grid block face (t 0..1 left -> right) and the outward normal */
  frontage(blockId: string, side: Side, t: number): { p: Vec2; n: Vec2 } {
    const a = this.at(this.chainOrThrow(blockId, side), t);
    return { p: a.p, n: { x: a.piece.face.outward.x, z: a.piece.face.outward.z } };
  }

  /** sidewalk point in front of a block face (`places.facePoint`) */
  facePoint(blockId: string, side: Side, t: number, extra = 0): Vec2 {
    const a = this.at(this.chainOrThrow(blockId, side), t);
    const f = a.piece.face;
    const off = f.sidewalk / 2 + extra;
    return { x: a.p.x + f.outward.x * off, z: a.p.z + f.outward.z * off };
  }

  // ---- lots, doors

  lotOfPoi(poiId: string): RealLot {
    const e = this.table.pois[poiId];
    const lot = e && this.byBbl.get(e.bbl);
    if (!lot) throw new Error(`poi ${poiId} has no real lot`);
    return lot;
  }

  /** the door of a lot: centre of the building footprint on the lot front, facing the street */
  doorOfLot(lot: RealLot): { x: number; z: number; outX: number; outZ: number; sidewalk: number; along: Vec2 } {
    const fp = fitFootprint(lot);
    const dx = lot.frontB.x - lot.frontA.x, dz = lot.frontB.z - lot.frontA.z;
    const w = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / w, z: dz / w };
    const c = fp ? (fp.xl + fp.xr) / 2 : w / 2;
    const face = this.faces[lot.block][lot.face];
    return { x: lot.frontA.x + dir.x * c, z: lot.frontA.z + dir.z * c, outX: lot.outward.x, outZ: lot.outward.z, sidewalk: face.sidewalk, along: dir };
  }

  /** sidewalk point in front of a POI's door; `along` metres toward the face's b end (`places.poiSpot`) */
  poiSpot(poiId: string, along = 0): Vec2 {
    const d = this.doorOfLot(this.lotOfPoi(poiId));
    const off = d.sidewalk / 2;
    return { x: d.x + d.along.x * along + d.outX * off, z: d.z + d.along.z * along + d.outZ * off };
  }

  /** a POI's lot, with the POI attached so the building generator draws its storefront sign */
  lotsWithPois(): RealLot[] {
    const byPoi = new Map<string, PoiDef>(this.pois.map((p) => [p.id, p]));
    const own = new Map<string, PoiDef>();
    for (const [id, e] of Object.entries(this.table.pois)) { const p = byPoi.get(id); if (p) own.set(e.bbl, p); }
    return this.lots.map((l) => (own.has(l.bbl) ? { ...l, poi: own.get(l.bbl) } : l));
  }

  /** door of HOME, the deli or the club, in the shape of interiors/defs.ts (radius and depthIn kept from the grid's) */
  interiorDoor(id: InteriorId): DoorDef {
    const e = this.table.interiors[id];
    const lot = e && this.byBbl.get(e.bbl);
    if (!lot) throw new Error(`interior ${id} has no real lot`);
    const d = this.doorOfLot(lot);
    const base = INTERIORS[id].door;
    return { x: d.x, z: d.z, outX: d.outX, outZ: d.outZ, radius: base.radius, depthIn: base.depthIn };
  }

  /** where a new player appears: just outside HOME's door */
  homeSpawn(): { x: number; z: number; heading: number } {
    const d = this.interiorDoor('home');
    const sw = this.faces[this.byBbl.get(this.table.interiors.home.bbl)!.block][this.byBbl.get(this.table.interiors.home.bbl)!.face].sidewalk;
    const x = d.x + d.outX * sw * 0.5, z = d.z + d.outZ * sw * 0.5;
    // heading: 0 = north (-z), clockwise; face along the street, away from the door's wall
    return { x, z, heading: Math.atan2(d.outX, -d.outZ) };
  }

  /** the map blips the grid draws from POIs: one per shop, at the door */
  mapPlaces(): MapPlaceLike[] {
    const out: MapPlaceLike[] = [];
    for (const p of this.pois) {
      if (!this.table.pois[p.id]) continue;
      const s = this.poiSpot(p.id);
      out.push({ id: p.id, kind: 'shop', label: p.sign.split('·')[0].trim(), x: s.x, z: s.z, color: p.awningColor });
    }
    return out;
  }

  // ---- streets

  private nodeAt(a: string, b: string): number[] {
    const ea = new Set(this.edgesByName.get(slug(a)) ?? []);
    const out: number[] = [];
    for (const e of this.edgesByName.get(slug(b)) ?? []) {
      const ed = this.net.edges[e];
      for (const v of [ed.a, ed.b]) if (!out.includes(v) && this.net.incident[v].some((i) => ea.has(i))) out.push(v);
    }
    return out;
  }

  /** centreline crossing of two streets by grid street id (`places.corner`) */
  corner(nsId: string, ewId: string): Vec2 {
    const a = this.table.streets[nsId], b = this.table.streets[ewId];
    if (!a || !b) throw new Error(`unknown street ${nsId}/${ewId}`);
    const nodes = this.nodeAt(a, b);
    if (!nodes.length) throw new Error(`${a} and ${b} do not cross on the real map`);
    let x = 0, z = 0;
    for (const v of nodes) { x += this.net.nodes[v].p.x; z += this.net.nodes[v].p.z; }
    return { x: x / nodes.length, z: z / nodes.length };
  }

  /** middle of a street between two crossing streets, on its centreline (`places.streetMid`) */
  streetMid(streetId: string, fromCrossId: string, toCrossId: string): Vec2 {
    const name = this.table.streets[streetId];
    const from = this.nodeAt(name, this.table.streets[fromCrossId]);
    const to = this.nodeAt(name, this.table.streets[toCrossId]);
    if (!from.length || !to.length) throw new Error(`${name} does not meet ${fromCrossId}/${toCrossId}`);
    const mine = new Set(this.edgesByName.get(slug(name)) ?? []);
    // shortest path along the street's own edges (Dijkstra over the few nodes involved)
    const dist = new Map<number, number>(), prev = new Map<number, { v: number; e: number }>();
    const open: number[] = [];
    for (const v of from) { dist.set(v, 0); open.push(v); }
    const goal = new Set(to);
    let reached = -1;
    while (open.length) {
      open.sort((p, q) => dist.get(p)! - dist.get(q)!);
      const v = open.shift()!;
      if (goal.has(v)) { reached = v; break; }
      for (const e of this.net.incident[v]) {
        if (!mine.has(e)) continue;
        const w = this.net.otherEnd(e, v);
        const nd = dist.get(v)! + this.net.lengths[e];
        if (nd < (dist.get(w) ?? Infinity)) { dist.set(w, nd); prev.set(w, { v, e }); if (!open.includes(w)) open.push(w); }
      }
    }
    if (reached < 0) throw new Error(`${name} is not connected between ${fromCrossId} and ${toCrossId}`);
    const legs: Array<{ e: number; from: number }> = [];
    for (let v = reached; prev.has(v); v = prev.get(v)!.v) legs.unshift({ e: prev.get(v)!.e, from: prev.get(v)!.v });
    const total = dist.get(reached)!;
    let s = total / 2;
    for (const l of legs) {
      const len = this.net.lengths[l.e];
      if (s <= len) {
        const fwd = this.net.edges[l.e].a === l.from;
        return this.net.pointAt(l.e, fwd ? s : len - s).p;
      }
      s -= len;
    }
    return this.net.nodes[reached].p;
  }

  /** the centreline point of a street (grid street id) nearest `near`: replaces the grid's literal `{ x: contractor.x, z: -100 }` style route ends */
  onStreet(streetId: string, near: Vec2): Vec2 {
    const name = slug(this.table.streets[streetId] ?? '');
    const h = this.net.nearestEdge(near, 600, (e) => slug(this.net.edges[e].name) === name);
    if (!h) throw new Error(`street ${streetId} is not on the real map near the point`);
    return h.point;
  }

  // ---- words for humans

  /** "836 Dekalb Ave; fronts Throop Ave (east side), 14 m from Pulaski St" for a lot, from its own face */
  describeLot(lot: RealLot, address = ''): string {
    const f = this.faces[lot.block][lot.face];
    const street = this.net.edges[f.edge].name;
    const mid = { x: (lot.frontA.x + lot.frontB.x) / 2, z: (lot.frontA.z + lot.frontB.z) / 2 };
    const sideWord = { N: 'south', S: 'north', E: 'west', W: 'east' }[f.side];
    let best = { d: Infinity, cross: '' };
    this.net.nodes.forEach((n, v) => {
      if (this.net.incident[v].length < 3) return;
      const names = this.net.incident[v].map((e) => this.net.edges[e].name);
      if (!names.includes(street)) return;
      const cross = names.find((x) => x !== street && x !== '');
      const dd = Math.hypot(n.p.x - mid.x, n.p.z - mid.z);
      if (cross && dd < best.d) best = { d: dd, cross };
    });
    const where = Number.isFinite(best.d) ? `, ${Math.round(best.d)} m from ${best.cross}` : '';
    return `${address ? `${address.replace(/\b(\w)(\w*)/g, (_m, a: string, b: string) => a + b.toLowerCase())}; ` : ''}fronts ${street} (${sideWord} side)${where}`;
  }

  /** "Throop Ave, west side, between Pulaski St and Kosciuszko St, 31 m from Kosciuszko St" for a point t along a grid face */
  describe(blockId: string, side: Side, t: number): string {
    const b = this.table.blocks[blockId];
    const c = this.chain(blockId, side);
    if (!b || !c) return `${blockId}/${side} (no real counterpart)`;
    const sideWord = { N: 'south', S: 'north', E: 'west', W: 'east' }[side]; // the block lies on this side of its street
    // t runs a -> b: N face east -> west, S face west -> east, W face north -> south, E face south -> north
    const [c1, c2] = { N: [b.e, b.w], S: [b.w, b.e], W: [b.n, b.s], E: [b.s, b.n] }[side];
    const m = Math.round(Math.min(1, Math.max(0, t)) * c.total);
    const near = t <= 0.5 ? c1 : c2;
    const dist = t <= 0.5 ? m : Math.round(c.total - m);
    return `${c.street}, ${sideWord} side, between ${c1} and ${c2}, about ${dist} m from ${near}`;
  }
}

// ---------------------------------------------------------------- choosing lots (used by scripts/build-places-real.mjs and the tests)

export type LotFit = 'shop' | 'church' | 'condo' | 'service' | 'home' | 'club';

/** how well a lot suits a kind: 0 best, null unusable */
export function fitTier(lot: RealLot, kind: LotFit): number | null {
  if (lot.wedge || lot.type === 'vacant' || lot.width < 4.5 || !fitFootprint(lot)) return null;
  const t = lot.type, w = lot.width;
  let tier: number | null = null;
  switch (kind) {
    case 'shop': case 'service': tier = t === 'mixeduse' ? 0 : t === 'apartment' ? 1 : t === 'church' ? null : 2; break;
    case 'church': tier = t === 'church' ? 0 : null; break;
    case 'condo': tier = t === 'apartment' && w >= 8 ? 0 : t === 'mixeduse' && w >= 8 ? 1 : t === 'apartment' ? 2 : null; break;
    case 'home': tier = t === 'brownstone' ? 0 : t === 'rowhouse' ? 1 : null; break;
    case 'club': tier = t === 'mixeduse' && w >= 8 ? 0 : t === 'apartment' && w >= 8 ? 1 : t === 'mixeduse' ? 2 : null; break;
  }
  if (tier === null) return null;
  return tier + (lot.ph === 'R1' ? 0 : 5);
}

/** the best lot on a chain near t (tier first, then metres along the chain); `used` lots are skipped */
export function pickLotOnChain(places: RealPlaces, chain: FaceChain, t: number, kind: LotFit, used: ReadonlySet<string>): { lot: RealLot; tier: number; offsetM: number } | null {
  let best: { lot: RealLot; tier: number; offsetM: number; score: number } | null = null;
  const target = Math.min(1, Math.max(0, t)) * chain.total;
  for (const pc of chain.pieces) {
    const f = pc.face;
    const dl = pc.len || 1;
    const dir = { x: (f.b.x - f.a.x) / dl, z: (f.b.z - f.a.z) / dl };
    for (const lot of places.lots) {
      if (lot.block !== pc.block || lot.face !== pc.index || used.has(lot.bbl)) continue;
      const tier = fitTier(lot, kind);
      if (tier === null) continue;
      const mid = { x: (lot.frontA.x + lot.frontB.x) / 2, z: (lot.frontA.z + lot.frontB.z) / 2 };
      const along = pc.cum + (mid.x - f.a.x) * dir.x + (mid.z - f.a.z) * dir.z;
      const off = Math.abs(along - target);
      const score = tier * 10000 + off;
      if (!best || score < best.score) best = { lot, tier, offsetM: off, score };
    }
  }
  return best;
}

/** fallback: the best-fitting lot within `radius` m of a point (tier first, then distance), on any face */
export function pickLotNear(places: RealPlaces, p: Vec2, kind: LotFit, used: ReadonlySet<string>, radius: number, blocks?: ReadonlySet<number>, street?: string, maxTier = 99): { lot: RealLot; tier: number; offsetM: number } | null {
  let best: { lot: RealLot; tier: number; offsetM: number; score: number } | null = null;
  for (const lot of places.lots) {
    if (used.has(lot.bbl) || (blocks && !blocks.has(lot.block))) continue;
    if (street && places.faces[lot.block][lot.face].streetId !== street) continue;
    const mid = { x: (lot.frontA.x + lot.frontB.x) / 2, z: (lot.frontA.z + lot.frontB.z) / 2 };
    const off = Math.hypot(mid.x - p.x, mid.z - p.z);
    if (off > radius) continue;
    const tier = fitTier(lot, kind);
    if (tier === null || tier > maxTier) continue;
    const score = tier * 10000 + off;
    if (!best || score < best.score) best = { lot, tier, offsetM: off, score };
  }
  return best;
}

/**
 * Moves the shared door table onto the real map: INTERIORS[id].door (read by Interiors, the door gaps, the night bounce and the
 * DJ ids at call time) and the NAV_TARGETS entries (computed once at module load) are updated in place. Call once, before the
 * interiors are built. No default-path file changes.
 */
export function applyRealDoors(places: RealPlaces): void {
  for (const id of Object.keys(INTERIORS) as InteriorId[]) Object.assign(INTERIORS[id].door, places.interiorDoor(id));
  for (const t of NAV_TARGETS) { const p = doorTrigger(INTERIORS[t.id]); t.x = p.x; t.z = p.z; }
}
