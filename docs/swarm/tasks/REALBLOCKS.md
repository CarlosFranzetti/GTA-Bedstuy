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
