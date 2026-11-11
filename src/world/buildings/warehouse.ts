/**
 * WBURG: brick warehouse / workshop for the Flushing Ave corridor (PLUTO classes E, F, L, G, U and industrial land use).
 * One to three storeys of plain brick on a deep footprint, one or two roll-up bays with a loading canopy, a row of high
 * factory windows, a sign band with a parody trade name (never a real brand) and a flat tar roof with a parapet. Party
 * walls are bare brick, the rear a shell. Entered through the mixed-use builder when the lot's storefront is 'warehouse'.
 */
import { familyMats, roofClutter, sideWallFrame, wallWithHoles, windows } from './facade';
import { lotLook, partyWallDetail } from './partyWall';
import type { Hole, LotCtx, LotOutput } from './facade';

const TRADES = [
  'FLUSHING AV AUTO BODY', 'ACME RESTAURANT SUPPLY', 'BEDFORD & SONS PLUMBING SUPPLY', 'TWO BROTHERS TIRE & WHEEL',
  'METRO PAPER & PACKAGING', 'KINGS COUNTY STEEL', 'GOLDEN APPLE FOOD DISTRIBUTORS', 'LORIMER LUMBER & MILLWORK',
  'DOCK 9 FREIGHT', 'ATLAS GLASS & MIRROR', 'ROYAL KOSHER WHOLESALE', 'NAVY YARD TOOL & DIE',
];
const SIGN_BG = ['#1f3a5c', '#7a1f1f', '#20432f', '#2a2a2a', '#5c4a1f'];

export function buildWarehouse(c: LotCtx): LotOutput {
  const { b, m, rng, W, D, lot, spec } = c;
  const floors = Math.max(1, Math.min(3, Math.round(spec?.floors ?? 2)));
  const storey = 4.2;
  const H = floors * storey + 0.6;
  const mats = spec ? familyMats(m, spec.family, rng.chance(0.5) ? 0 : 1) : null;
  const brick = mats ? mats.front : m.brickRed;
  const cs = c.cornerSide;
  const look = lotLook(m, lot);

  // shell: party walls and rear in plain brick
  b.box(look.party, 0, 0, -D, W, H, 0, cs === 'left' ? 'rb' : cs === 'right' ? 'lb' : 'rlb');
  partyWallDetail(b, m, look, { W, D, y0: 0, topY: H, zFront: 0, cornerSide: cs });

  // roll-up bays on the ground floor (one on narrow lots, two on wide ones)
  const bays = W >= 16 ? 2 : 1;
  const holes: Hole[] = [];
  const bw = Math.min(4.2, (W - 2) / bays - 0.8);
  for (let i = 0; i < bays; i++) {
    const cx = (W * (i + 0.5)) / bays;
    const door: Hole = { x0: cx - bw / 2, x1: cx + bw / 2, y0: 0, y1: 3.4 };
    holes.push(door);
    b.rect(m.rollGate, [door.x0, 0, -0.3], [bw, 0, 0], [0, 3.4, 0], { ru: bw / 1.2, rv: 3.4 / 1.2 });
    b.box(m.metal, door.x0 - 0.12, 0, -0.32, door.x0, 3.5, 0.0, 'f');
    b.box(m.metal, door.x1, 0, -0.32, door.x1 + 0.12, 3.5, 0.0, 'f');
    b.box(m.metal, door.x0 - 0.12, 3.4, -0.32, door.x1 + 0.12, 3.55, 0.0, 'fu');
  }
  // a personnel door beside the bays
  const pd: Hole = { x0: Math.min(W - 1.4, W * 0.5 + bw / 2 + 0.5), x1: Math.min(W - 0.4, W * 0.5 + bw / 2 + 1.5), y0: 0, y1: 2.2 };
  if (bays === 1 && pd.x1 <= W - 0.3) {
    holes.push(pd);
    b.rect(m.metal, [pd.x0, 0, -0.1], [pd.x1 - pd.x0, 0, 0], [0, 2.2, 0], { ru: 0.5, rv: 0.8 });
  }
  // factory windows: a band of tall panes on the upper floors and a clerestory row on the ground floor
  const nWin = Math.max(2, Math.floor(W / 3.2));
  const xs: number[] = [];
  for (let i = 0; i < nWin; i++) xs.push((W * (i + 0.5)) / nWin);
  for (let k = 1; k < floors; k++) {
    windows(b, m, { xs, y: k * storey + 0.9, w: Math.min(1.8, W / nWin - 0.5), h: 2.2, z: 0, holes, wall: brick, sill: true, lintel: 'flat', frame: true, rng });
  }
  windows(b, m, { xs, y: 3.8, w: Math.min(1.8, W / nWin - 0.5), h: 0.9, z: 0, holes: [], wall: brick, sill: false, frame: true, rng });
  wallWithHoles(b, brick, 0, 0, W, H, 0, holes);

  // loading canopy over the bays
  b.box(m.metal, 0.3, 3.75, 0, W - 0.3, 3.9, 1.5, 'frlufd');
  for (let i = 0; i <= 3; i++) { const x = 0.35 + ((W - 0.7) * i) / 3; b.bar(m.metal, [x, 3.75, 1.4], [x, 3.4, 0], 0.05); }

  // sign band with the trade name on the parapet
  const text = lot.poi?.sign ?? TRADES[Math.floor(rng.next() * TRADES.length)];
  const sign = m.lib.sign(text, SIGN_BG[Math.floor(rng.next() * SIGN_BG.length)], '#efe9d6');
  const sy0 = H - 1.5, sy1 = H - 0.45, f = 0.05;
  b.box(m.metal, 0.4, sy0, 0, W - 0.4, sy1, 0.22, 'rludf');
  b.rect(sign, [0.4 + f, sy0 + f, 0.225], [W - 0.8 - 2 * f, 0, 0], [0, sy1 - sy0 - 2 * f, 0], { ru: 1, rv: 1 });
  // parapet and roof
  b.box(look.party, 0, H, -D, W, H + 0.6, 0, 'frlb');
  b.box(m.limestone, -0.05, H + 0.55, -0.05, W + 0.05, H + 0.7, 0.2, 'frlufd');
  b.rect(look.roof, [0, H + 0.02, 0], [W, 0, 0], [0, 0, -D]);
  if (rng.chance(0.8)) roofClutter(b, m, rng, { x0: 0, x1: W, zBack: -D, zFront: 0, y: H, brick: look.party, chimney: 0, skylight: 0.5, bulkhead: 0.8, dishes: 0, ph: 0 });
  if (cs) b.with(sideWallFrame(cs, W, D), () => wallWithHoles(b, brick, 0, 0, D, H, 0, []));

  return { body: [{ x0: 0, x1: W, z0: -D, z1: 0 }], stoops: [] };
}
