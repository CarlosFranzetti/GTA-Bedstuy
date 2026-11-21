# REALBLOCKS: blocks that look like their real blocks (Ines Calloway)

Status: in progress (started 21 Nov 2026). Kept current as work lands.

## Findings so far
- The KartaView photos are NOT in the repository: only facts derived from them (wall colour, material class, awning colour per
  lot, `facade-observed.json`, 215 CC BY-SA photos). So no texture can be derived from those pixels without downloading them again.
- Already used from data: floors (PLUTO, footprint roof height, `floors-check.json`), year built (family odds and cornice),
  class (use), lot frontage (width, stoop on lots up to 12 m), observed wall colour and material class (both maps).
- Not used: stoop height and direction, bay count, arched parlour windows, Romanesque / Queen Anne / mansard style, per-lot
  deterministic style by era beyond brownstone/brick/limestone odds.

## The three faces (real map, `?map=real`, lots from the R1 file; BBLs are NYC tax lots, Brooklyn = 3)
Chosen near the home door (WAX DELI's block, about 100 m from the spawn). Facts are MapPLUTO class / year / floors / frontage and
building-footprint roof height (NYC Open Data, in `src/world/data/raw/lots-real-r1r2a.json`), plus `facade-observed.json`.
1. BROWNSTONE ROW: Pulaski Street, 200 to 240 range, block 1776 lots 21 to 37 (BBL 3017760021..37). 17 lots, 5.8 to 6.3 m frontage
   (about 19 to 20 ft), almost all class B1 or C0 "two- and three-family", built 1899, 2 floors above a raised basement (footprint
   roof 10 to 11 m), rows of identical houses with a plain cornice and a high stoop. Two infill buildings (2004 and 2019, 3 and 4
   floors, class C0 / C2, panel cladding) and one 12.7 m double lot at the east end. Observed: lots 27 and 28 tan brick, 30 red brick.
2. AVENUE WITH SHOPS: DeKalb Avenue 856 to 886 (block 1777?, face 169/0): 13 lots, 10 of them shops. Mix of pre-war 3-storey
   walk-ups with a shop below (class S2 / S4, 5.6 m), a 1-storey store (K1, 41.7 m and 18 m), a 2015 7-storey rental (D1, 20.9 m).
3. MIXED BLOCK: DeKalb Avenue 777 to 785 range, block 1775 face 154/2: 5.5 m two-storey infill (1991 to 2003), a 48 m 6-storey
   2015 block, a 5-storey 1931 walk-up (20.7 m, observed tan brick), a one-storey E9 warehouse (observed painted brick), a bodega
   under a 4-storey (S5, 1935), and a 7-storey 2021 day-care building.
(Exact lots, widths and classes per face are in the tables below, filled in as the captures are read.)

## What landed
- `src/world/buildings/eraStyle.ts` (new): style from year, class, tax lot, floors, roof height. Italianate to 1875 (bracket cornice,
  arched parlour windows, 1.95 m stoop), neo-Grec to 1887 (bracket, 1.8 m), Romanesque / Queen Anne to 1900 (dentil, half arched,
  1.65 m), walk-ups to 1930 (plain cornice, 1.3 m), post-war (none), class A = frame. Rows of one block and one year share a family.
  Doors pair by odd/even tax lot (`LotSpec.doorLeft`, honoured in brownstone.ts; the random draw is still made). Bays from frontage.
  Floors: roof height wins when PLUTO says two or more floors more on a house or walk-up (843 DeKalb: 6 floors, 11 m roof).
- Real map: cornice, arches and bays apply. Family, stoop height, door side and floors are held back there (`keep*` options):
  tests/unit/sim/traffic-5min.test.ts is chaotic in the lot geometry and goes red (gridlock, sidewalk, collisions) with them on.
- Grid map: `GRID_ERA_STYLE = false` in LotSubdivider.ts (also red with it on; the lead restored the old guard first). Frames
  `after-grid/pulaski-across` were captured with it ON (arched windows, higher stoops, dentil cornices, paired doors); the shipped
  tree has it off. Flip the constant when the traffic sim is robust.
- Shop windows per trade: `shopTradeCode` (shopTypes.ts) into `aStyle.w` of the shop glass (LotBatch.shopTrade), read by
  windowShader.ts SHOP_MAIN: bodega, deli (case and menu), kitchen/pizza (menu board, oven), barber, hair and nails, laundromat, phone
  cases, bottle wall, cafe, pharmacy aisles. Frame: `after-grid/shopwin-a-17_5.jpg` vs `before-grid/shopwin-a-17_5.jpg`.
- Draw calls: shop flat tile colours share one white material with the colour in the vertex colour (`sf:flat`), stoop railing uses the
  spear fence material (`castIronFence:1` folded onto 0). perf3-breakdown, grid, noon (tris/draws) before to after: low home 392k/219
  to 396k/217, junction 483k/194 to 484k/191, el 364k/226 to 367k/228, row 234k/169 to 234k/166; phone after 102, 81, 83, 69 (no
  before for phone: run cut off). Gain is 2 to 3 draws; low el is still 8 over 220 (cars 26, el signs 6, awnings 6, boards 5, graffiti 5).
- Sizes: single file 10,787,024 bytes; hosted dist +12 kB.
- Tests: tests/unit/textures 406 pass; tests/unit/world 775 pass (1 skipped); traffic-5min 14 pass; tsc clean in my files.

## Not done
Wall textures: the KartaView photos are not in the repo (facts only), no Commons photo was downloaded, so NO photo-derived texture was
made; observed wall colours and shader kinds (siding, stucco, panel, glazed) already cover these walls. No new sheet layer, no
phone texture memory change. Bay windows (projecting), awning frames, gates and lintel shadows were not touched (awnings, gates and
graffiti already exist). Real-map captures crashed the page (target crashed) three times; the grid map was used. Mixed block frames
and the real-map before/after pair are missing. Reference photos were not fetched: the references are the PLUTO rows above.
