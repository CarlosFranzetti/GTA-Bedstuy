# BLOCKS: what stands on each block face, and where it comes from

Lane GEO2, 9 Nov 2026 (updated for MapPLUTO). Companion to `docs/reference/block-faces.md` (R2 passes 1 and 2), which holds the raw search notes; this file is the per-face reading the game data follows.

## 0. What could and could not be reached

| Source | Result |
|---|---|
| OSM Overpass (`overpass-api.de`, `overpass.kumi.systems`) | **Unreachable** (`ENOTFOUND` in WebFetch; still blocked later). No OSM footprints, no `building:levels` or shop tags. |
| NYC Open Data, MapPLUTO (`64uk-42ks`), by `curl` after the network change | **Reachable.** 1,836 lots on the nine streets inside the grid box, saved trimmed as `src/world/data/raw/pluto-bedstuy.json` (+ `.query.json` with query and date). |
| NYC Building Footprints (`5zhs-2jue`) | **Reachable** by BBL: 1,799 footprints (roof height, construction year, ground elevation) in `src/world/data/raw/footprints-bedstuy.json`. The id `nqwf-w8eh` does not exist. |
| LPC historic districts | Not fetched. PLUTO's own `histdist` column names the Bedford Stuyvesant / Expanded Stuyvesant Heights Historic District on the lots inside it. |
| WebSearch (listing pages, Brownstoner, YIMBY, GrowNYC, MTA Bus Time, Wikipedia snippets) | Reachable; snippets only. Used for the earlier typology notes and the transit items. |
| Google Maps / Street View / Earth | Not used. No photos under `src/assets/photos`. |

**How the lots were built.** `scripts/fetch-pluto.mjs` pulls the rows; `scripts/import-pluto.mjs` places each lot by its own latitude/longitude (PLUTO centroid) in a frame fitted to the street grid (streets run 8.8 degrees off true east), assigns it to the face of the block it sits in, orders it along the face and writes it with: width from `lotfront` (feet to metres), building depth from `bldgdepth`, storeys from `numfloors` (else footprint roof height / 3.1 m), use from `bldgclass` and `landuse` (A/B/C/D residential rows and walk-ups, S/K/C7/D7 and land use 04/05 shop-below, M church, W school, G and land use 10 garage, V and park-owned lots vacant or garden), family and cornice from `yearbuilt` (before 1880 bracketed, to 1925 plain, later none; 1990 and later `newBuild`), stoop from class, age and width. Lots much wider than their building (`lotfront` over twice `bldgfront`) become a building plus set-back lawns. Everything is checked by the schema validators and the 40-face counts below.

**What PLUTO cannot say, and what was done about it.**
- *Business type.* PLUTO has no shop kind, so a shop lot gets a stand-in kind chosen from its BBL (bodega, deli, barber, restaurant and so on; weights favour bodegas) and the 15 game POIs then pin their kind on the nearest shop lot. The kinds are **not** real business types.
- *Material and facade.* Brick or brownstone is chosen by a hash of the BBL weighted by build year: not sourced. Street trees (30% of lots) and the scaffold flags (same count per face as before) are decoration, not data.
- *Year built 1931.* PLUTO uses 1931 for many pre-1931 buildings whose year is unknown; 109 lots carry it. Treat it as "older than the record".
- *Gaps.* Lots addressed on a cross street (corner buildings, DeKalb Ave lots inside block row r1) are not on the face they touch, and big parcels such as the housing-authority superblocks are addressed on one street only. Where a stretch of face has no PLUTO lot, it is filled with generated rows marked `filler` in the lot note (counted in the table). Two faces have no PLUTO lot at all and keep their earlier typology rows: Marcus Garvey Blvd E Hart-Pulaski and Throop Ave E Lafayette-Van Buren.
- *Streets that PLUTO shows and the game grid lacks.* DeKalb Avenue runs between Pulaski and Kosciuszko (the real Pulaski-Kosciuszko block is two rows deep and about 167 m from street to street, against 82 m elsewhere). The game keeps its single 100 m row there.

Confidence: PLUTO-built lots are **H** when width and storeys are in the record, **M** otherwise; filler is **L**. Earlier sourced notes (`[GEO2] ...`) whose house number matches a PLUTO lot are carried onto that lot, joined by `||` to the PLUTO line; the 24 typology-only stand-in notes were superseded by the real lots. The earlier pre-PLUTO version of this file's sourcing is kept in sections 1 to 4.

## 1. Transit near the ten blocks

- **Subway:** Kosciuszko St station, BMT Jamaica line (J), station house at Broadway / Kossuth Place / Lafayette Ave, stairs to the western corners; some exits are emergency-only (Wikipedia and Subway Nut snippets). It is **outside** the grid (east, on Broadway), not at Throop. No source places a subway entrance on Throop Ave. (M)
- **Buses:** B38 runs via DeKalb and Lafayette Avs and has a **Lafayette Av / Throop Av** stop (MTA Bus Time page, via search). B43 has a **Throop Av / Jefferson Av** stop (MTA Bus Time), Jefferson being south of the grid. B15 runs Marcus Garvey Blvd southbound and Lewis Ave northbound (route snippet, R2 pass 1). A bus stop at Throop and Hart appears in one listing (R2, L). (M)
- Not confirmed: B44, any stop locations on Tompkins, shelter positions. The game keeps only the B38 stop as a sourced location (Lafayette at Throop); nothing was moved for it.

## 2. Street-level patterns the sources support

1. **Rowhouse streets** (Hart, Pulaski, Kosciuszko, Van Buren, Greene): 3 to 4 storey late-19th-century brick and brownstone rows with stoops. Sources: LP-2496 summary (CityLand), Brownstoner house entries, listings for 1899 to 1910 houses (M). Storefronts on these streets: **none found** in any source (gap), so the data now keeps ground-floor shops on them only at corner lots, plus day cares, funeral homes and braiding salons already tied to the POI list.
2. **Avenues** (Throop, Tompkins, Marcus Garvey, Lafayette): mixed storefront-over-flats and churches. Sourced types on Throop: laundromat (442), day care (268), food pantry (376), churches (299, 417, 470, 583), 1931 six-flat walk-up (370), 1899 townhouses (405). New infill: 766 Lafayette (2016), 277 Throop (2016 filing), 185 Throop (2015 proposal).
3. **Gardens and open lots:** Kosciuszko St gardens at 385-389 (ornamental, since 1998, former vacant lot) and 395-397 (vegetables for the pantry at 376 Throop); Hattie Carthan Herban Farm on Van Buren between Throop and Tompkins; the long-vacant 289 Kosciuszko lot (M).
4. **Churches:** many on Throop, Greene, Marcus Garvey and Tompkins; most named ones fall just outside the grid (R2 corrections C1 to C5). The game keeps 10 church lots as stand-ins and notes that no church address inside the grid is confirmed.
5. **Trees:** only the Lafayette magnolia is confirmed; Greene Throop to Marcus Garvey is described as tree-lined (listing copy, L). **Scaffolding:** no source; the existing scaffold flags are decoration kept from the earlier pass and stay unsourced. **Stoops:** stoop and cornice appear among the district's defining features (LP-2496 keywords, M); per-lot stoops are typology.

## 3. Per-face table

Lot counts are checked by `tests/unit/world/real-blocks.test.ts`: one row per face, `blockId-side` key, count in the third column. The composition column ends with PLUTO lots, filler lots and the build-year range. The last column counts lots carrying a `[GEO2]` sourced note. Block ids: `r<row>c<col>`; rows run Hart-Pulaski (r0) to Van Buren-Greene (r4); columns Tompkins-Throop (c0) and Throop-Marcus Garvey (c1). Face side is the side of the block (N/S/E/W).

| face id | street segment | lots | composition now | sourced lots |
|---|---|---|---|---|
| r0c0-E | Throop Ave E hart-pulaski | 8 | 3-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 2 new; shops 1; PLUTO 8, filler 0, built 1899-2007 | 0 |
| r0c0-N | Hart St N tompkins-throop | 38 | 2-4 fl; 1 church, 3 vacant, 0 school, 0 scaffold, 0 new; shops 0; PLUTO 38, filler 8, built 1899-1931 | 1 |
| r0c0-S | Pulaski St S tompkins-throop | 35 | 2-4 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 6 new; shops 0; PLUTO 35, filler 8, built 1905-2024 | 1 |
| r0c0-W | Tompkins Ave W hart-pulaski | 8 | 2-6 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 2 new; shops 3; PLUTO 8, filler 0, built 1931-2025 | 0 |
| r0c1-E | Marcus Garvey Blvd E hart-pulaski | 10 | 3-5 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 1 new; shops 5; PLUTO 0, filler 0, built - | 0 |
| r0c1-N | Hart St N throop-garvey | 14 | 2-3 fl; 0 church, 4 vacant, 1 school, 1 scaffold, 1 new; shops 1; PLUTO 14, filler 5, built 1910-2006 | 0 |
| r0c1-S | Pulaski St S throop-garvey | 31 | 3-4 fl; 1 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 0; PLUTO 31, filler 28, built 1931-2015 | 0 |
| r0c1-W | Throop Ave W hart-pulaski | 9 | 3-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 1; PLUTO 9, filler 2, built 1931-2005 | 0 |
| r1c0-E | Throop Ave E pulaski-kosciuszko | 14 | 3-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 1; PLUTO 14, filler 11, built 1899-1931 | 0 |
| r1c0-N | Pulaski St N tompkins-throop | 30 | 2-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 5 new; shops 0; PLUTO 30, filler 1, built 1899-2019 | 0 |
| r1c0-S | Kosciuszko St S tompkins-throop | 32 | 2-6 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 4 new; shops 0; PLUTO 32, filler 9, built 1899-2020 | 1 |
| r1c0-W | Tompkins Ave W pulaski-kosciuszko | 19 | 2-4 fl; 0 church, 0 vacant, 0 school, 1 scaffold, 15 new; shops 0; PLUTO 19, filler 4, built 1991-1992 | 0 |
| r1c1-E | Marcus Garvey Blvd E pulaski-kosciuszko | 11 | 2-4 fl; 0 church, 0 vacant, 0 school, 1 scaffold, 0 new; shops 2; PLUTO 11, filler 9, built 1931-1931 | 0 |
| r1c1-N | Pulaski St N throop-garvey | 18 | 3-6 fl; 1 church, 5 vacant, 0 school, 0 scaffold, 3 new; shops 1; PLUTO 18, filler 4, built 1906-2017 | 0 |
| r1c1-S | Kosciuszko St S throop-garvey | 27 | 1-4 fl; 0 church, 0 vacant, 0 school, 3 scaffold, 15 new; shops 0; PLUTO 27, filler 4, built 1899-2007 | 0 |
| r1c1-W | Throop Ave W pulaski-kosciuszko | 11 | 3-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 2 new; shops 2; PLUTO 11, filler 8, built 1931-2005 | 0 |
| r2c0-E | Throop Ave E kosciuszko-lafayette | 6 | 3-6 fl; 0 church, 2 vacant, 0 school, 2 scaffold, 0 new; shops 2; PLUTO 6, filler 0, built 1931-1931 | 1 |
| r2c0-N | Kosciuszko St N tompkins-throop | 34 | 2-4 fl; 0 church, 0 vacant, 0 school, 4 scaffold, 8 new; shops 0; PLUTO 34, filler 7, built 1899-2007 | 0 |
| r2c0-S | Lafayette Ave S tompkins-throop | 25 | 2-5 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 11 new; shops 0; PLUTO 25, filler 6, built 1899-2020 | 0 |
| r2c0-W | Tompkins Ave W kosciuszko-lafayette | 6 | 2-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 2 new; shops 1; PLUTO 6, filler 0, built 1899-2006 | 0 |
| r2c1-E | Marcus Garvey Blvd E kosciuszko-lafayette | 10 | 4-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 1; PLUTO 10, filler 8, built 1931-1931 | 0 |
| r2c1-N | Kosciuszko St N throop-garvey | 15 | 3-4 fl; 0 church, 0 vacant, 3 school, 0 scaffold, 0 new; shops 4; PLUTO 15, filler 10, built 1931-1959 | 0 |
| r2c1-S | Lafayette Ave S throop-garvey | 27 | 4-8 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 1; PLUTO 27, filler 26, built 2008-2008 | 0 |
| r2c1-W | Throop Ave W kosciuszko-lafayette | 6 | 2-3 fl; 3 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 0; PLUTO 6, filler 0, built 1899-1997 | 0 |
| r3c0-E | Throop Ave E lafayette-vanburen | 11 | 3-6 fl; 1 church, 1 vacant, 0 school, 0 scaffold, 0 new; shops 5; PLUTO 0, filler 0, built - | 2 |
| r3c0-N | Lafayette Ave N tompkins-throop | 35 | 2-4 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 8 new; shops 0; PLUTO 35, filler 4, built 1899-2018 | 0 |
| r3c0-S | Van Buren St S tompkins-throop | 35 | 2-5 fl; 0 church, 3 vacant, 0 school, 0 scaffold, 9 new; shops 1; PLUTO 35, filler 7, built 1899-2015 | 1 |
| r3c0-W | Tompkins Ave W lafayette-vanburen | 10 | 3-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 2; PLUTO 10, filler 4, built 1931-1931 | 0 |
| r3c1-E | Marcus Garvey Blvd E lafayette-vanburen | 11 | 3-4 fl; 0 church, 0 vacant, 0 school, 1 scaffold, 2 new; shops 0; PLUTO 11, filler 9, built 2003-2004 | 0 |
| r3c1-N | Lafayette Ave N throop-garvey | 29 | 1-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 4 new; shops 3; PLUTO 29, filler 0, built 1899-2015 | 1 |
| r3c1-S | Van Buren St S throop-garvey | 26 | 2-4 fl; 0 church, 0 vacant, 0 school, 1 scaffold, 2 new; shops 1; PLUTO 26, filler 7, built 1899-2017 | 1 |
| r3c1-W | Throop Ave W lafayette-vanburen | 10 | 2-4 fl; 1 church, 2 vacant, 0 school, 2 scaffold, 0 new; shops 1; PLUTO 10, filler 6, built 1931-1931 | 0 |
| r4c0-E | Throop Ave E vanburen-greene | 13 | 2-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 1; PLUTO 13, filler 12, built 1899-1899 | 0 |
| r4c0-N | Van Buren St N tompkins-throop | 38 | 2-4 fl; 0 church, 1 vacant, 0 school, 1 scaffold, 3 new; shops 1; PLUTO 38, filler 4, built 1899-2019 | 1 |
| r4c0-S | Greene Ave S tompkins-throop | 35 | 1-4 fl; 0 church, 1 vacant, 0 school, 2 scaffold, 0 new; shops 0; PLUTO 35, filler 9, built 1899-1931 | 0 |
| r4c0-W | Tompkins Ave W vanburen-greene | 11 | 3-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 3 new; shops 0; PLUTO 11, filler 4, built 1899-2012 | 0 |
| r4c1-E | Marcus Garvey Blvd E vanburen-greene | 12 | 3-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 3; PLUTO 12, filler 10, built 1899-1899 | 0 |
| r4c1-N | Van Buren St N throop-garvey | 36 | 2-3 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 0 new; shops 1; PLUTO 36, filler 9, built 1899-1931 | 0 |
| r4c1-S | Greene Ave S throop-garvey | 35 | 2-3 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 0; PLUTO 35, filler 8, built 1899-2008 | 1 |
| r4c1-W | Throop Ave W vanburen-greene | 3 | 4-4 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 3 new; shops 1; PLUTO 3, filler 0, built 1997-1997 | 0 |

## 4. Per-segment evidence

### Hart St (north edge of r0c0 and r0c1)
- 173 Hart St, built 2004, 3 floors, between Tompkins and Throop: set as `newBuild` (listing, M). 196 Hart St, 3-storey brownstone, 1910: noted on a brownstone lot (listing, L; block unconfirmed).
- Rows described as neo-Grec brownstone (Willoughby-Hart district context, west of the grid: an extrapolation, L).
- Shops: none sourced. Mid-block storefronts removed.

### Pulaski St (S of r0, N of r1)
- 197 Pulaski: DOB filing Mar 2023, 4 storeys, 7 units: `newBuild` (YIMBY, M for the filing). 185 and 195A Pulaski listed between Tompkins and Throop, typology unknown.
- Grace Baptist (83 Pulaski) lies west of Tompkins (88 Pulaski has cross street Marcy). The one church lot on the Throop-Marcus Garvey face is therefore a stand-in; the POI keeps its parody name.
- 330 Throop, a Second Empire house built before 1873, is at the Throop and Pulaski corner area (Brownstoner, M); which corner is unknown, so no lot was changed.

### Kosciuszko St (S of r1, N of r2)
- Gardens at 385-389 and 395-397 Kosciuszko (GrowNYC, M): two vacant lots with trees on the Throop-Marcus Garvey faces; side unverified. Food pantry at 376 Throop is supplied by one of them.
- 289 Kosciuszko: long-vacant lot, then a 2018 permit for a 4-storey building with penthouse (YIMBY, M): a vacant lot and a `newBuild` on the Tompkins-Throop north face.
- PS 79 (1907 caption, historic) and PS 256 at 118 Kosciuszko / PS 274 at 675 Kosciuszko (both far outside the grid): the one `school` lot stays as a stand-in (L).
- Neighbouring dated houses: 446 Kosciuszko 2-family 1899; 490 Kosciuszko 4-storey 1931, 8 units (listings, M); both numbers lie outside the grid and are typology only.
- Subway: J at Kosciuszko St is on Broadway, outside the grid.

### Lafayette Ave (S of r2, N of r3)
- 766 Lafayette at Throop: 2016 rental, 4 floors, 12 apartments, built on a former vacant lot (CityRealty, M): corner `newBuild`, 4 floors, no stoop.
- Magnolia grandiflora (677/679 Lafayette, landmark 1977) and 664/672 Lafayette brownstones overlook Von King (Tompkins) Park; their numbers put them west of the grid, so only typology (4-5 storey brownstones, neo-Grec, plain cornice) is used (M for the facts, L for any placement).
- B38 stop at Lafayette / Throop (MTA Bus Time, M).
- Storefront archetype inside the grid: none sourced; the avenue keeps its generated mix (L).

### Van Buren St (S of r3, N of r4)
- 25 Van Buren (2014, `newBuild`), 64 Van Buren (two-unit brownstone, 1901), 127 Van Buren (Queen Anne row, 1888-1908), all with notes (listings and Brownstoner, M/L).
- Hattie Carthan Herban Farm between Throop and Tompkins: the 22 m open lot on the Tompkins-Throop north face, with trees (Forgotten NY snippet, L).
- Corner parcel at Marcus Garvey, about 10,000 sq ft, offered for redevelopment: the vacant corner lot on Marcus Garvey's Lafayette-Van Buren face (CommercialSearch, L).

### Greene Ave (S of r4)
- 620 Greene (Second Empire, c.1872, mansard), 626 Greene (4 floors, 6 homes), 650 Greene (2022 four-storey filing), 677 Greene (three-family brownstone, 1899, tree-lined block): set with notes (Brownstoner, NestSeekers, YIMBY, Corcoran; M/L).
- 828 Greene (Antioch Baptist) and 816-826 Greene are at Lewis/Stuyvesant, outside the grid.
- Described as private brownstone and rowhouse blocks, so mid-block storefronts were removed; corner shops stay.

### Throop Ave (E face of c0, W face of c1)
- Laundromat 442, day care 268, pantry 376, churches 299 / 417 / 583, six-flat 370 (1931), townhouse 405 (1899), infill 277 and 185. House numbers rise south from about Pulaski (330) to Lafayette (about 363-371 per 766 Lafayette listings), so 376 to 442 lie south of Lafayette; the game puts the pantry and the laundromat on the Lafayette-Van Buren faces accordingly (M for the numbers, L for the order of cross streets).
- Existing mission frontages are untouched: WAX DELI (Throop west face, Kosciuszko-Lafayette), the club door (Throop east face, Pulaski-Kosciuszko) and HOME (Kosciuszko south face, Throop-Marcus Garvey) keep their coordinates; their faces got only trees or note edits, never width changes.

### Marcus Garvey Blvd (E face of c1)
- Bethany Baptist at 460 Marcus Garvey (directory, M for address, L for block): the church lot on the Kosciuszko-Lafayette face is noted as a stand-in.
- 488 Marcus Garvey (2019 permits) and 106 Marcus Garvey (2025 notice) are infill flags only. Formerly Sumner Ave; Marcus Garvey Houses exist but their position in the grid is unconfirmed.

### Tompkins Ave (W face of c0)
- Not sampled beyond: 435 Tompkins crumbling corner store replaced by condos (Brownstoner, L), permit flags at 173, 185, 423, 467 Tompkins (YIMBY, L). The Tompkins faces keep their generated mix; the `newBuild` density there agrees with the permit flags (L).

## 5. What the user could supply

- Allow `overpass-api.de` (or `overpass.kumi.systems`) and `data.cityofnewyork.us` for WebFetch: then `scripts/import-osm.mjs` produces real footprints, widths, storeys and years; the notes written here protect these lots.
- Your own photos of the Throop/Kosciuszko corners and the facade rows, shot as described in `docs/REAL-BLOCKS.md` section 3, under `src/assets/photos`.
- The exact lat/lon of the Throop and Kosciuszko corner for `--origin`, and the true north-south sequence of the six streets (R2 open item).

Credits: OpenStreetMap contributors (ODbL) and NYC Open Data are named in `docs/CREDITS.md` for the importer pipeline; this file's facts come from the web pages named inline, not from OSM or PLUTO downloads.
