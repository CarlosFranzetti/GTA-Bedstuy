# BLOCKS: what stands on each block face, and where it comes from

Lane GEO2, 9 Nov 2026. Companion to `docs/reference/block-faces.md` (R2 passes 1 and 2), which holds the raw search notes; this file is the per-face reading the game data follows.

## 0. What could and could not be reached

| Source | Result in this session |
|---|---|
| OSM Overpass (`overpass-api.de`, `overpass.kumi.systems`) | **Unreachable.** WebFetch: `getaddrinfo ENOTFOUND` (host outside the session's allowed network domains). |
| NYC Open Data / PLUTO (`data.cityofnewyork.us`) | **Unreachable**, same error. |
| WebSearch (listing pages, Brownstoner, YIMBY, GrowNYC, MTA bus-time, Wikipedia snippets) | Reachable, snippets only. |
| Google Maps / Street View / Earth | Not used (licence rule). |
| User photos under `src/assets/photos` | None present. |

Consequences, stated plainly: **no footprints, no `building:levels`, no PLUTO floors or year-built, no lot widths** were obtained. `scripts/import-osm.mjs` was therefore **not run on live data** (nothing to feed it; `src/world/data/raw/` was not created). Every lot width in `bedstuy.json` is still the generator's, and the 40 faces' lot counts are the generator's counts. Only type, storeys, family, cornice, stoop, trees and storefront of individual lots were changed, each time with a `[GEO2]` note (the importer treats any hand note as protected, so a later live import keeps these lots).

Address facts below come from listing pages and news items; where the snippet did not say which side of the street or which block, the fact is placed by typology only and says so. House numbers do not map to game blocks: the game grid is a simplified 2 x 5 layout. Confidence: **M** one credible source, **L** listing-only or inference. Nothing here is **H** because nothing was read from an official dataset.

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

Lot counts are checked by `tests/unit/world/real-blocks.test.ts`: one row per face, `blockId-side` key, count in the third column. The last column counts lots carrying a `[GEO2]` sourced note. Block ids: `r<row>c<col>`; rows run Hart-Pulaski (r0) to Van Buren-Greene (r4); columns Tompkins-Throop (c0) and Throop-Marcus Garvey (c1). Face side is the side of the block (N/S/E/W).

| face id | street segment | lots | composition now | sourced lots |
|---|---|---|---|---|
| r0c0-E | Throop Ave E hart-pulaski | 11 | 3-6 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 0 new; shops 4 | 0 |
| r0c0-N | Hart St N tompkins-throop | 32 | 3-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 2 new; shops 0 | 2 |
| r0c0-S | Pulaski St S tompkins-throop | 32 | 2-5 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 1 new; shops 0 | 0 |
| r0c0-W | Tompkins Ave W hart-pulaski | 10 | 3-6 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 5 | 0 |
| r0c1-E | Marcus Garvey Blvd E hart-pulaski | 10 | 3-5 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 1 new; shops 5 | 0 |
| r0c1-N | Hart St N throop-garvey | 32 | 2-5 fl; 0 church, 1 vacant, 0 school, 1 scaffold, 1 new; shops 0 | 0 |
| r0c1-S | Pulaski St S throop-garvey | 32 | 2-5 fl; 1 church, 2 vacant, 0 school, 0 scaffold, 2 new; shops 1 | 1 |
| r0c1-W | Throop Ave W hart-pulaski | 10 | 3-6 fl; 0 church, 2 vacant, 0 school, 0 scaffold, 0 new; shops 3 | 0 |
| r1c0-E | Throop Ave E pulaski-kosciuszko | 10 | 3-5 fl; 2 church, 1 vacant, 0 school, 0 scaffold, 1 new; shops 5 | 0 |
| r1c0-N | Pulaski St N tompkins-throop | 33 | 3-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 0 | 1 |
| r1c0-S | Kosciuszko St S tompkins-throop | 32 | 2-5 fl; 1 church, 2 vacant, 0 school, 0 scaffold, 2 new; shops 0 | 0 |
| r1c0-W | Tompkins Ave W pulaski-kosciuszko | 10 | 3-6 fl; 1 church, 0 vacant, 0 school, 1 scaffold, 4 new; shops 4 | 0 |
| r1c1-E | Marcus Garvey Blvd E pulaski-kosciuszko | 10 | 3-6 fl; 0 church, 0 vacant, 0 school, 1 scaffold, 0 new; shops 5 | 0 |
| r1c1-N | Pulaski St N throop-garvey | 32 | 2-5 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 0 new; shops 1 | 0 |
| r1c1-S | Kosciuszko St S throop-garvey | 33 | 2-5 fl; 0 church, 2 vacant, 0 school, 3 scaffold, 0 new; shops 1 | 1 |
| r1c1-W | Throop Ave W pulaski-kosciuszko | 11 | 3-5 fl; 1 church, 0 vacant, 0 school, 0 scaffold, 0 new; shops 4 | 1 |
| r2c0-E | Throop Ave E kosciuszko-lafayette | 10 | 4-5 fl; 0 church, 0 vacant, 0 school, 2 scaffold, 2 new; shops 4 | 0 |
| r2c0-N | Kosciuszko St N tompkins-throop | 33 | 3-5 fl; 1 church, 1 vacant, 0 school, 4 scaffold, 3 new; shops 1 | 2 |
| r2c0-S | Lafayette Ave S tompkins-throop | 30 | 3-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 3 | 0 |
| r2c0-W | Tompkins Ave W kosciuszko-lafayette | 11 | 3-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 4 | 0 |
| r2c1-E | Marcus Garvey Blvd E kosciuszko-lafayette | 10 | 3-5 fl; 1 church, 1 vacant, 0 school, 0 scaffold, 1 new; shops 5 | 1 |
| r2c1-N | Kosciuszko St N throop-garvey | 32 | 2-4 fl; 0 church, 2 vacant, 1 school, 0 scaffold, 2 new; shops 1 | 1 |
| r2c1-S | Lafayette Ave S throop-garvey | 30 | 3-5 fl; 0 church, 2 vacant, 0 school, 0 scaffold, 3 new; shops 6 | 0 |
| r2c1-W | Throop Ave W kosciuszko-lafayette | 11 | 3-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 2 new; shops 5 | 0 |
| r3c0-E | Throop Ave E lafayette-vanburen | 11 | 3-6 fl; 1 church, 1 vacant, 0 school, 0 scaffold, 0 new; shops 5 | 2 |
| r3c0-N | Lafayette Ave N tompkins-throop | 30 | 3-5 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 3 new; shops 8 | 1 |
| r3c0-S | Van Buren St S tompkins-throop | 33 | 2-5 fl; 0 church, 3 vacant, 0 school, 0 scaffold, 0 new; shops 0 | 0 |
| r3c0-W | Tompkins Ave W lafayette-vanburen | 11 | 3-6 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 0 new; shops 5 | 0 |
| r3c1-E | Marcus Garvey Blvd E lafayette-vanburen | 10 | 3-6 fl; 0 church, 1 vacant, 0 school, 1 scaffold, 1 new; shops 5 | 1 |
| r3c1-N | Lafayette Ave N throop-garvey | 30 | 3-5 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 2 new; shops 11 | 0 |
| r3c1-S | Van Buren St S throop-garvey | 32 | 3-4 fl; 0 church, 1 vacant, 0 school, 1 scaffold, 1 new; shops 0 | 0 |
| r3c1-W | Throop Ave W lafayette-vanburen | 10 | 3-6 fl; 0 church, 0 vacant, 0 school, 2 scaffold, 1 new; shops 5 | 2 |
| r4c0-E | Throop Ave E vanburen-greene | 10 | 3-6 fl; 0 church, 2 vacant, 0 school, 0 scaffold, 0 new; shops 4 | 0 |
| r4c0-N | Van Buren St N tompkins-throop | 33 | 2-5 fl; 0 church, 3 vacant, 0 school, 1 scaffold, 2 new; shops 1 | 3 |
| r4c0-S | Greene Ave S tompkins-throop | 31 | 3-5 fl; 0 church, 2 vacant, 0 school, 2 scaffold, 3 new; shops 1 | 3 |
| r4c0-W | Tompkins Ave W vanburen-greene | 10 | 4-5 fl; 0 church, 2 vacant, 0 school, 0 scaffold, 1 new; shops 5 | 0 |
| r4c1-E | Marcus Garvey Blvd E vanburen-greene | 10 | 1-6 fl; 0 church, 1 vacant, 0 school, 0 scaffold, 0 new; shops 5 | 0 |
| r4c1-N | Van Buren St N throop-garvey | 32 | 2-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 0 | 1 |
| r4c1-S | Greene Ave S throop-garvey | 30 | 3-5 fl; 1 church, 0 vacant, 0 school, 0 scaffold, 3 new; shops 2 | 1 |
| r4c1-W | Throop Ave W vanburen-greene | 10 | 4-5 fl; 0 church, 0 vacant, 0 school, 0 scaffold, 1 new; shops 4 | 0 |

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
