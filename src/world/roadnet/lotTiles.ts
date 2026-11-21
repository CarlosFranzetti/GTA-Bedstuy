/**
 * MAP7: the real map's tax lots as small area files (hosted and native builds only; the files live in public/data/real/).
 *
 *   lots-index.json            { v: 2, tile, net, tiles: { "tx_tz": { n, b: [minX, minZ, maxX, maxZ] } }, total }
 *   lots-<tx>_<tz>.json        { v: 2, t, cls: [PLUTO building classes], rows: [[bbl, x, z, lf, ld, bf, bd, fl, yr, cls, lu, e, s, sd, blk, nb, rf, ph], ...] }
 *
 * Lengths are 0.1 m integers (x, z in the RoadNet grid frame), -1 = missing. A lot belongs to the tile of its block's centre
 * (so a block is never split between two files); a lot outside every block belongs to the tile it stands in. `placeLots`
 * works block by block, so a tile is placed on its own (`placeLotsDetailed(..., blocks)`) as the player comes near it.
 * Produced by scripts/import-lots-real.mjs --r3 from MapPLUTO (64uk-42ks) and Building Footprints (5zhs-2jue), NYC Open Data.
 */
export const LOT_TILE_M = 512;
export const LOT_PHASES = ['R1', 'R2', 'R2+', 'R3'] as const;

export interface LotTileIndex {
  v: 2;
  tile: number;
  /** sha1 prefix of roadnet-r123.json the edge / block numbers refer to */
  net: string;
  tiles: Record<string, { n: number; b: [number, number, number, number] }>;
  total: number;
}

export interface LotTileJson {
  v: 2;
  t: string;
  cls: string[];
  rows: number[][];
}

/** the input record placeLots reads (lotsReal.ts PlutoLot) */
export interface TileLot {
  bbl: string; ph: string; x: number; z: number; lf: number | null; ld: number | null; bf: number | null; bd: number | null;
  fl: number | null; yr: number | null; cls: string; lu: string; e: number; s: number | null; sd: number; blk: number; bins?: string[]; rf: number | null;
  ad: string;
}

export const tileKeyOf = (x: number, z: number): string => `${Math.floor(x / LOT_TILE_M)}_${Math.floor(z / LOT_TILE_M)}`;
export const tileBounds = (key: string): [number, number, number, number] => {
  const [tx, tz] = key.split('_').map(Number);
  return [tx * LOT_TILE_M, tz * LOT_TILE_M, (tx + 1) * LOT_TILE_M, (tz + 1) * LOT_TILE_M];
};

const dm = (v: number | null | undefined): number => (v === null || v === undefined || !Number.isFinite(v) ? -1 : Math.round(v * 10));
const un = (v: number): number | null => (v < 0 ? null : v / 10);

export function encodeLotTile(key: string, lots: ReadonlyArray<TileLot & { nb: number }>): LotTileJson {
  const cls: string[] = [];
  const ix = new Map<string, number>();
  const rows = lots.map((l) => {
    let c = ix.get(l.cls);
    if (c === undefined) { c = cls.length; cls.push(l.cls); ix.set(l.cls, c); }
    return [
      Number(l.bbl), dm(l.x), dm(l.z), dm(l.lf), dm(l.ld), dm(l.bf), dm(l.bd), l.fl ?? -1, l.yr ?? -1, c, Number.parseInt(l.lu, 10) || 0,
      l.e, dm(l.s), l.sd, l.blk, l.nb, dm(l.rf), Math.max(0, (['R1', 'R2', 'R2+', 'R3'] as string[]).indexOf(l.ph)),
    ];
  });
  return { v: 2, t: key, cls, rows };
}

export function decodeLotTile(j: LotTileJson): { lots: TileLot[] } {
  if (j.v !== 2) throw new Error(`lot tile: unsupported version ${String(j.v)}`);
  return {
    lots: j.rows.map((r) => ({
      bbl: String(r[0]), ph: LOT_PHASES[r[17]] ?? 'R3', x: r[1] / 10, z: r[2] / 10, lf: un(r[3]), ld: un(r[4]), bf: un(r[5]), bd: un(r[6]),
      fl: r[7] < 0 ? null : r[7], yr: r[8] < 0 ? null : r[8], cls: j.cls[r[9]] ?? '', lu: r[10] ? String(r[10]) : '', e: r[11], s: un(r[12]),
      sd: r[13], blk: r[14], bins: r[15] > 0 ? new Array<string>(r[15]).fill('') : undefined, rf: un(r[16]), ad: '',
    })),
  };
}

/** Blocks of a net grouped by tile: the tile of a block is the tile of the centre of its ring. */
export function blockTiles(rings: ReadonlyArray<ReadonlyArray<{ x: number; z: number }>>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  rings.forEach((r, i) => {
    if (!r.length) return;
    let cx = 0, cz = 0;
    for (const p of r) { cx += p.x; cz += p.z; }
    const k = tileKeyOf(cx / r.length, cz / r.length);
    const l = out.get(k);
    if (l) l.push(i); else out.set(k, [i]);
  });
  return out;
}
