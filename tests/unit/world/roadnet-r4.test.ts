/**
 * MAP7 + MAP4: the whole real map (R1 + R2 + the seven-block ring R3 + the five-block ring R4): extents, the network file,
 * derived geometry, signals, lot tiles.
 * Counts come from the data files (ranges, never literals), as in the other roadnet tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Vec2 } from '@/core/Math2';
import { R1R2_EXTENT, R3_EXTENT, R3_RING, R1R2_RING, R3_OFFSETS, R4_EXTENT, R4_RING, R4_OFFSETS, offsetRing, inR3Ring, inR4Ring, phaseOf } from '@/world/roadnet/extents';
import { closestOnSegment, pointInPolygon, signedArea } from '@/world/roadnet/geom';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { encodeRoadNet, decodeRoadNet, type RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry, isSimpleRing } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { badBlocks } from '@/world/roadnet/realWorld';
import { junctionClusters } from '@/world/roadnet/clusters';
import { nodeControl } from '@/world/roadnet/signalPhases';
import { placeLotsDetailed, type RealLot } from '@/world/roadnet/lotsReal';
import { blockTiles, decodeLotTile, encodeLotTile, tileBounds, tileKeyOf, type LotTileIndex, type LotTileJson } from '@/world/roadnet/lotTiles';
import { RealLotTiles, type LotSource } from '@/world/roadnet/lotStreamReal';

const ROOT = join(import.meta.dirname, '../../..');
const netJson = JSON.parse(readFileSync(join(ROOT, 'src/world/data/roadnet-r4.json'), 'utf8')) as RoadNetJson;
const controls = JSON.parse(readFileSync(join(ROOT, 'src/world/data/roadnet-controls-r4.json'), 'utf8')) as { nodes: Record<string, { control: string }> };
const lotIndex = JSON.parse(readFileSync(join(ROOT, 'public/data/real/lots-index.json'), 'utf8')) as LotTileIndex;
const tileFile = (k: string): LotTileJson => JSON.parse(readFileSync(join(ROOT, `public/data/real/lots-${k}.json`), 'utf8')) as LotTileJson;
const core = JSON.parse(readFileSync(join(ROOT, 'src/world/data/roadnet-core.json'), 'utf8')) as RoadNetJson;

const distToRing = (p: Vec2, ring: ReadonlyArray<Vec2>): number => Math.min(...ring.map((a, i) => Math.sqrt(closestOnSegment(p, a, ring[(i + 1) % ring.length]).d2)));
const net = RoadNet.fromJson(netJson);
const d = deriveGeometry(net);
const faces = blockFaces(net, d);
const bad = badBlocks(net, d);
const fileSource: LotSource = { index: async () => lotIndex, tile: async (k) => tileFile(k) };

describe('R4 extent', () => {
  it('contains the whole R3 extent, is a simple ring, and grew by about five blocks on the cardinal sides', () => {
    expect(R4_OFFSETS).toHaveLength(R3_RING.length);
    for (const p of R3_EXTENT) expect(pointInPolygon(p, R4_EXTENT), `${p.x},${p.z}`).toBe(true);
    expect(isSimpleRing(R4_RING)).toBe(true);
    expect(isSimpleRing(R4_EXTENT)).toBe(true);
    const a3 = Math.abs(signedArea(R3_RING)) / 1e6, a4 = Math.abs(signedArea(R4_RING)) / 1e6;
    expect(a3).toBeGreaterThan(9.5);
    expect(a4).toBeGreaterThan(14);
    expect(a4).toBeLessThan(17);
    // north, west, south sides: the R3 side line is 410..500 m (five blocks of 80..100 m) inside the R4 outline
    const mid = (i: number): Vec2 => ({ x: (R3_RING[i].x + R3_RING[(i + 1) % R3_RING.length].x) / 2, z: (R3_RING[i].z + R3_RING[(i + 1) % R3_RING.length].z) / 2 });
    for (const i of [0, 9, 10]) { const dd = distToRing(mid(i), R4_RING); expect(dd, `side ${i}`).toBeGreaterThan(380); expect(dd, `side ${i}`).toBeLessThan(520); }
  });
  it('inR4Ring and inR3Ring do not overlap', () => {
    const pt: Vec2 = { x: -1400, z: -300 }; // west of Skillman St: R4 only
    expect(pointInPolygon(pt, R4_EXTENT)).toBe(true);
    expect(inR3Ring(pt) || phaseOf(pt) !== null).toBe(false);
    expect(inR4Ring(pt)).toBe(true);
    expect(inR4Ring({ x: 400, z: -300 })).toBe(false);
    expect(inR4Ring({ x: -900, z: -300 })).toBe(false);
  });
});

describe('R3 extent', () => {
  it('contains the whole R1+R2 extent and is about seven blocks wider on every side', () => {
    for (const p of R1R2_EXTENT) expect(pointInPolygon(p, R3_EXTENT)).toBe(true);
    expect(R3_OFFSETS).toHaveLength(R1R2_RING.length);
    for (const o of R3_OFFSETS) expect(o).toBeGreaterThan(500);
    expect(Math.abs(signedArea(R3_RING))).toBeGreaterThan(2.5 * Math.abs(signedArea(R1R2_RING)));
  });
  it('R3_RING is a simple ring and every R1R2 corner is well inside it (the concave notch at Broadway x Greene Ave is filled in, so only 200 m there)', () => {
    expect(isSimpleRing(R3_RING)).toBe(true);
    expect(isSimpleRing(R3_EXTENT)).toBe(true);
    for (const v of R1R2_RING) {
      let best = Infinity;
      for (let i = 0; i < R3_RING.length; i++) best = Math.min(best, Math.sqrt(closestOnSegment(v, R3_RING[i], R3_RING[(i + 1) % R3_RING.length]).d2));
      expect(best).toBeGreaterThan(150);
    }
  });
  it('phaseOf and inR3Ring partition the plane around the first two rings', () => {
    const far: Vec2 = { x: -900, z: -300 };
    expect(inR3Ring(far)).toBe(true);
    expect(phaseOf(far)).toBeNull();
    expect(inR3Ring({ x: 400, z: -300 })).toBe(false);
    expect(phaseOf({ x: 400, z: -300 })).toBe('R1');
  });
  it('the default offsetRing (single distance, no bevel) is unchanged', () => {
    const a = offsetRing(R1R2_RING, 45), b = offsetRing(R1R2_RING, Array(R1R2_RING.length).fill(45));
    expect(a).toEqual(b);
  });
});

describe('roadnet-r4.json', () => {
  it('is a bigger network than the first two rings and survives the codec', () => {
    const small = RoadNet.fromJson(core);
    expect(net.edges.length).toBeGreaterThan(2 * small.edges.length);
    expect(net.blocks.length).toBeGreaterThan(2 * small.blocks.length);
    const again = decodeRoadNet(encodeRoadNet(net.data));
    expect(again.edges.length).toBe(net.edges.length);
  });
  it('lies inside R4_EXTENT (plus the margin) and still has the R3 and R4 boundary streets', () => {
    for (const n of net.nodes) expect(pointInPolygon(n.p, R4_EXTENT) || distToRing(n.p, R4_EXTENT) < 1.5, `${n.p.x},${n.p.z} ${n.control}`).toBe(true);
    const names = new Set(net.edges.map((e) => e.name));
    for (const s of ['Jefferson Ave', 'Skillman St', 'Boerum St', 'St Nicholas Ave', 'Broadway', 'Myrtle Ave', 'Tompkins Ave', 'Flushing Ave']) expect(names.has(s), s).toBe(true);
  });
  it('keeps the data the game needs: one-way streets, lane counts, widths, diagonals', () => {
    expect(net.edges.filter((e) => e.oneway !== 0).length).toBeGreaterThan(100);
    expect(net.edges.every((e) => e.width > 0 && e.lanes >= 0)).toBe(true);
    expect(net.edges.some((e) => e.lanes >= 3)).toBe(true);
    const diag = net.edges.filter((e) => { const a = e.pts[0], b = e.pts[e.pts.length - 1]; const ang = Math.abs(((Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI) % 90); return Math.abs(ang - 45) < 12 && Math.hypot(b.x - a.x, b.z - a.z) > 100; });
    expect(diag.length).toBeGreaterThan(50);
  });
  it('is small: under 200 kB raw', () => { expect(JSON.stringify(netJson).length).toBeLessThan(200_000); });
});

describe('derived geometry on R4', () => {
  it('every kerb and building ring is simple', () => {
    d.curbRings.forEach((r, i) => { if (r.length) expect(isSimpleRing(r), `curb ${i}`).toBe(true); });
    d.buildingRings.forEach((r, i) => { if (r.length) expect(isSimpleRing(r), `building ${i}`).toBe(true); });
  });
  it('bad blocks are few (under 4 %), almost all Broadway wedges and slivers', () => {
    const real = net.blocks.filter((b) => !b.island).length;
    expect(bad.size / real).toBeLessThan(0.04);
    const big = [...bad].filter((i) => net.blocks[i].area >= 1200);
    expect(big.length).toBeLessThanOrEqual(8); // R4: 142, 399, 56, 308, 163 beside the Broadway wedges 470 and 670: one vertex of the building line outside the kerb (see repairRings, MAP4.md)
  });
  it('repairRings (opt-in) turns all but one of the big bad blocks into buildable ones', () => {
    const d2 = deriveGeometry(net, { repairRings: true });
    const bad2 = badBlocks(net, d2);
    expect(bad2.size).toBeLessThan(bad.size - 3);
    expect([...bad2].filter((i) => net.blocks[i].area >= 1200).length).toBeLessThanOrEqual(1); // block 142 (13,000 m2, west of Williamsburg St) stays bad
  });
  it('junction clusters cover every node once', () => {
    const cl = junctionClusters(net, d);
    expect(cl.flat().length).toBe(net.nodes.length);
    expect(new Set(cl.flat()).size).toBe(net.nodes.length);
  });
});

describe('signals', () => {
  it('names only real nodes and signalises a plausible share of the junctions', () => {
    const ids = Object.keys(controls.nodes).map(Number);
    expect(ids.every((i) => i >= 0 && i < net.nodes.length)).toBe(true);
    const ctl = nodeControl(net, controls);
    const signals = ctl.filter((c) => c === 'signal').length;
    expect(signals).toBeGreaterThan(ids.length);
    expect(signals).toBeLessThan(net.nodes.length);
  });
});

describe('lot tiles', () => {
  it('encode and decode round-trip a tile', () => {
    const k = Object.keys(lotIndex.tiles)[0];
    const j = tileFile(k);
    const dec = decodeLotTile(j);
    expect(dec.lots.length).toBe(j.rows.length);
    const back = encodeLotTile(k, dec.lots.map((l) => ({ ...l, nb: l.bins?.length ?? 0 })));
    expect(back.rows).toEqual(j.rows);
  });
  it('the index matches the files and the net; every file is small', () => {
    const files = readdirSync(join(ROOT, 'public/data/real')).filter((f) => /^lots-.+_.+\.json$/.test(f));
    expect(files.length).toBe(Object.keys(lotIndex.tiles).length);
    let total = 0;
    for (const f of files) { const j = JSON.parse(readFileSync(join(ROOT, 'public/data/real', f), 'utf8')) as LotTileJson; total += j.rows.length; expect(JSON.stringify(j).length, f).toBeLessThan(120_000); }
    expect(total).toBe(lotIndex.total);
    expect(lotIndex.total).toBeGreaterThan(15000);
  });
  it('every lot sits in the tile its block (or itself) belongs to', () => {
    const bt = blockTiles(net.blocks.map((_, i) => net.blockRing(i)));
    const owner = new Map<number, string>();
    for (const [k, l] of bt) for (const b of l) owner.set(b, k);
    for (const k of Object.keys(lotIndex.tiles)) {
      for (const l of decodeLotTile(tileFile(k)).lots) {
        const want = l.blk >= 0 ? owner.get(l.blk) : tileKeyOf(l.x, l.z);
        expect(want).toBe(k);
        expect(l.e).toBeGreaterThanOrEqual(0);
        expect(l.e).toBeLessThan(net.edges.length);
      }
    }
    const b = tileBounds('0_0');
    expect(b[2] - b[0]).toBe(lotIndex.tile);
  });
  it('places at least 85 % of the lots tile by tile, and placing a tile does not depend on the others', async () => {
    const tiles = new RealLotTiles({ net, derived: d, faces, bad, source: fileSource });
    await tiles.init();
    let input = 0;
    const all: RealLot[] = [];
    for (const k of tiles.keys) { input += lotIndex.tiles[k].n; all.push(...(await tiles.load(k))); }
    const placed = all.filter((l) => !l.wedge).length;
    expect(placed / input).toBeGreaterThan(0.85);
    // one tile alone gives the same lots as in the full run
    const k = tiles.keys.find((q) => lotIndex.tiles[q].n > 200)!;
    const alone = new RealLotTiles({ net, derived: d, faces, bad, source: fileSource });
    await alone.init();
    const a = await alone.load(k);
    const ids = new Set(all.map((l) => l.id));
    for (const l of a) expect(ids.has(l.id)).toBe(true);
  });
  it('lots face their street: outward within 10 degrees of the frontage normal, on every face', async () => {
    const tiles = new RealLotTiles({ net, derived: d, faces, bad, source: fileSource });
    await tiles.init();
    const lots = await tiles.loadWhere((_, k) => Number(k.split('_')[0]) === 0);
    expect(lots.length).toBeGreaterThan(200);
    for (const l of lots) {
      if (l.wedge) continue;
      const e = { x: l.frontB.x - l.frontA.x, z: l.frontB.z - l.frontA.z };
      const len = Math.hypot(e.x, e.z) || 1;
      const nrm = { x: e.z / len, z: -e.x / len };
      const dot = Math.abs(nrm.x * l.outward.x + nrm.z * l.outward.z);
      expect(dot, l.id).toBeGreaterThan(Math.cos((10 * Math.PI) / 180));
    }
  });
  it('lotsReal.placeLotsDetailed with a block set places only those blocks', () => {
    const k = Object.keys(lotIndex.tiles)[3];
    const bt = blockTiles(net.blocks.map((_, i) => net.blockRing(i)));
    const set = new Set((bt.get(k) ?? []).filter((b) => !bad.has(b)));
    const { lots } = placeLotsDetailed(net, d, faces, decodeLotTile(tileFile(k)), set);
    for (const l of lots) expect(set.has(l.block)).toBe(true);
  });
});
