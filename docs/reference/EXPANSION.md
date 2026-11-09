# EXPANSION: survey of the area between Throop Ave and Bushwick Ave (SURVEY9)

Lane SURVEY9, 9 Nov 2026. Sources: NYC MapPLUTO (`64uk-42ks`) and NYC Building Footprints (`5zhs-2jue`) from `data.cityofnewyork.us`, DOHMH restaurant inspections (`43nn-pn8j`) and DCWP licences (`w7w3-xahh`) from the same portal; Wikipedia/MTA snippets for the stations. No Google data. `bedstuy.json` is untouched. Raw data: `src/world/data/raw/expansion-pluto.json` (6,899 lots, trimmed to the polygon, X/Z in grid metres), `expansion-pluto.query.json`, `venues-current.json`, `venues-expansion.json`. Sketch: `docs/reference/expansion-sketch.svg`.

## 1. Frame and the street table

**Projection.** MapPLUTO `xcoord`/`ycoord` are NY State Plane Long Island (EPSG:2263), US survey feet; converted to metres with 1200/3937 m per ft. The street grid here is rotated **8.7 degrees** counter-clockwise from State Plane north-east (fitted from the E-W streets: they run 8.6 to 9.0 degrees above east; the avenues run 81.2 to 82.4 degrees). Grid metres: rotate by 8.7 degrees, +x = east along the E-W streets, +z = south along the avenues, **origin = the Throop Ave centreline x Kosciuszko St centreline** (each centreline is the midpoint of the median lot centroid on its two sides, so +-5 m). Real compass bearing of a grid direction = grid heading (clockwise from grid north, i.e. 90 degrees = +x) minus 8.7 degrees: grid +x is bearing 81.3 degrees, grid +z (south) 171.3.

Method for each street: lots addressed on the street inside the polygon (x > -40 m, z -340..1060 m, west of the Bushwick Ave centreline); axis-aligned streets take the two-sided median of lot centroids (the street's centreline, +-10 m because the two sides rarely carry equal numbers of lots); the two diagonals use a total-least-squares line.

| Street | Kind | Centreline (grid m) | Gap to previous (m) | Bearing | Extent in survey | Lots |
|---|---|---|---|---|---|---|
| Hart Street | E-W, axis-aligned | z = -247 |  | 0.0 (grid +x); real 72.6 deg | -35 to 1076 | 174 |
| Pulaski Street | E-W, axis-aligned | z = -165 | 82 | 0.0 (grid +x); real 72.6 deg | -39 to 957 | 98 |
| Dekalb Avenue | E-W, axis-aligned | z = -82 | 83 | 0.0 (grid +x); real 72.6 deg | -38 to 1233 | 158 |
| Kosciuszko Street | E-W, axis-aligned | z = 0 | 82 | 0.0 (grid +x); real 72.6 deg | 39 to 1320 | 228 |
| Lafayette Avenue | E-W, axis-aligned | z = 82 | 82 | 0.0 (grid +x); real 72.6 deg | -38 to 1435 | 269 |
| Van Buren Street | E-W, axis-aligned | z = 165 | 83 | 0.0 (grid +x); real 72.6 deg | -38 to 1486 | 286 |
| Greene Avenue | E-W, axis-aligned | z = 247 | 82 | 0.0 (grid +x); real 72.6 deg | -38 to 1543 | 378 |
| Lexington Avenue | E-W, axis-aligned | z = 329 | 82 | 0.0 (grid +x); real 72.6 deg | -36 to 1467 | 253 |
| Quincy Street | E-W, axis-aligned | z = 411 | 82 | 0.0 (grid +x); real 72.6 deg | -38 to 1587 | 306 |
| Gates Avenue | E-W, axis-aligned | z = 495 | 84 | 0.0 (grid +x); real 72.6 deg | -38 to 1802 | 116 |
| Monroe Street | E-W, axis-aligned | z = 576 | 81 | 0.0 (grid +x); real 72.6 deg | -39 to 1706 | 334 |
| Madison Street | E-W, axis-aligned | z = 659 | 83 | 0.0 (grid +x); real 72.6 deg | -40 to 1980 | 371 |
| Putnam Avenue | E-W, axis-aligned | z = 741 | 82 | 0.0 (grid +x); real 72.6 deg | -38 to 2029 | 439 |
| Jefferson Avenue | E-W, axis-aligned | z = 823 | 82 | 0.0 (grid +x); real 72.6 deg | -36 to 2148 | 475 |
| Hancock Street | E-W, axis-aligned | z = 905 | 82 | 0.0 (grid +x); real 72.6 deg | -39 to 2202 | 538 |
| Halsey Street | E-W, axis-aligned | z = 988 | 83 | 0.0 (grid +x); real 72.6 deg | -37 to 2340 | 463 |
| Throop Avenue | N-S, axis-aligned | x = 1 |  | grid z; real 162.6 deg | z -285 to 948 | 89 |
| Marcus Garvey Blvd | N-S, axis-aligned | x = 242 |  | grid z; real 162.6 deg | z -316 to 1001 | 83 |
| Lewis Avenue | N-S, axis-aligned | x = 493 |  | grid z; real 162.6 deg | z -303 to 1044 | 104 |
| Stuyvesant Avenue | N-S, axis-aligned | x = 742 |  | grid z; real 162.6 deg | z -315 to 1056 | 200 |
| Malcolm X Boulevard | N-S, axis-aligned | x = 991 |  | grid z; real 162.6 deg | z -150 to 1056 | 164 |
| Patchen Avenue | N-S, axis-aligned | x = 1241 |  | grid z; real 162.6 deg | z 108 to 1031 | 105 |
| Ralph Avenue | N-S, axis-aligned | x = 1520 |  | grid z; real 162.6 deg | z 346 to 1033 | 71 |
| Howard Avenue | N-S, axis-aligned | x = 1728 |  | grid z; real 162.6 deg | z 626 to 1046 | 34 |
| Broadway | **diagonal** | x = 1202 + 0.99 z | | 45.3 deg from +x toward +z; real bearing 126.6 deg | z -324 to 1055 | 211 |
| Bushwick Avenue | **diagonal** | x = 1440 + 1.01 z | | 44.6 deg from +x toward +z; real bearing 125.9 deg | z -338 to 1059 | 259 |

Findings that matter for the game:
- The **real E-W spacing is a constant 82.4 m** (Hart to Halsey: 16 streets, 15 rows, 1,235 m) and the avenue spacing 250 m (Throop 1, Marcus Garvey 242, Lewis 493, Stuyvesant 742, Malcolm X 991, Patchen 1,241; then 1,520 Ralph and 1,728 Howard where the grid is squeezed by Broadway). The game uses 100 m rows and omits **DeKalb Ave** (between Pulaski and Kosciuszko); its offsets Hart -200, Pulaski -100, Kosciuszko 0, Lafayette 100, Van Buren 200, Greene 300 are real -247, -165 (DeKalb -82), 0, 82, 165, 247.
- Between Greene and Halsey the real streets are Lexington (329), Quincy (411), Gates (495), Monroe (576), Madison (659), Putnam (741), Jefferson (823), Hancock (905), Halsey (988), then Macon (1,071).
- **Broadway** (with the J/M elevated line above it) and **Bushwick Ave** are the only diagonals in the area. Both run 45 degrees from the grid (real bearing about 126 degrees, south-east), 240 m apart in x at the same z (about 170 m perpendicular). East of Broadway the neighbourhood is on a second grid rotated 90 degrees (Cornelia, Woodbine, Linden, Palmetto, Menahan, Stanhope, Himrod streets at 53.5 degrees from State Plane east), so streets east of Broadway are short diagonal stubs, not extensions of the west grid. Gates, Madison, Putnam, Jefferson, Hancock and Halsey bend or end at Broadway: their bin medians drift after x > 1,700 m.
- The block between Broadway and Bushwick Ave is a parallelogram strip about 170 m wide cut by the E-W streets into triangles and trapezoids.

## 2. Blocks, lots, floors, classes, years, shops

**Block grid.** Rows r0..r14 (Hart to Halsey, 15 rows), columns c0..c5 (Throop to Patchen, 250 m each), c6 (Ralph to Broadway, a partial block cut by the diagonal) and c7 (Broadway to Bushwick Ave strip). Lot = PLUTO tax lot whose centroid lies in the cell (`row`/`col` by the centreline table above). Housing-authority and school superblocks hold a single lot, so the cell counts dip (for example r1-c1, r4-c3, r10-c5).

| row (between) | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 | row total |
|---|---|---|---|---|---|---|---|---|---|
| r0 Hart Street to Pulaski Street | 16 | 75 | 4 | 68 | 42 | 6 | 0 | 0 | 211 |
| r1 Pulaski Street to Dekalb Avenue | 31 | 1 | 2 | 62 | 42 | 19 | 0 | 0 | 157 |
| r2 Dekalb Avenue to Kosciuszko Street | 40 | 39 | 25 | 69 | 60 | 44 | 0 | 0 | 277 |
| r3 Kosciuszko Street to Lafayette Avenue | 11 | 68 | 75 | 70 | 50 | 65 | 0 | 0 | 339 |
| r4 Lafayette Avenue to Van Buren Street | 52 | 68 | 69 | 1 | 62 | 63 | 0 | 13 | 328 |
| r5 Van Buren Street to Greene Avenue | 57 | 62 | 79 | 38 | 75 | 44 | 0 | 31 | 386 |
| r6 Greene Avenue to Lexington Avenue | 71 | 79 | 53 | 70 | 57 | 43 | 0 | 36 | 409 |
| r7 Lexington Avenue to Quincy Street | 71 | 76 | 52 | 76 | 64 | 58 | 7 | 32 | 436 |
| r8 Quincy Street to Gates Avenue | 22 | 32 | 23 | 20 | 74 | 31 | 11 | 59 | 272 |
| r9 Gates Avenue to Monroe Street | 42 | 33 | 29 | 2 | 66 | 62 | 21 | 64 | 319 |
| r10 Monroe Street to Madison Street | 2 | 78 | 80 | 58 | 80 | 3 | 57 | 60 | 418 |
| r11 Madison Street to Putnam Avenue | 53 | 77 | 67 | 58 | 75 | 56 | 77 | 69 | 532 |
| r12 Putnam Avenue to Jefferson Avenue | 72 | 19 | 76 | 75 | 70 | 75 | 112 | 78 | 577 |
| r13 Jefferson Avenue to Hancock Street | 80 | 70 | 80 | 59 | 72 | 77 | 137 | 70 | 645 |
| r14 Hancock Street to Halsey Street | 78 | 65 | 84 | 81 | 72 | 82 | 96 | 79 | 637 |
| column total | 698 | 842 | 798 | 807 | 961 | 728 | 518 | 591 | 5943 |

- **Lots in the survey: 5,943** in the cells (6,120 counting lots along the edges), 6,899 kept in the raw file with a 45 m margin.
- **Lots per face:** a face is one side of one street between two avenues. Over the first four columns, lots addressed on an E-W street average 25 per face (median 27, range 1 to 41); a face is about 200 m of frontage at 6 m mean lot front, so 25 to 40 is typical, matching the current game rows (30 to 33).
- **Floors** (PLUTO `numfloors`): mean 2.76; histogram {'1': 86, '2': 2470, '3': 2361, '4': 801, '5': 47, '6': 46, '7': 19, '8': 3, '9': 1, '14': 2, '15': 4, '16': 1, '20': 1}. Two and three storeys dominate (79%), four storeys 13%, five or more under 3%; a handful of 14 to 20 storey housing-authority and senior towers.
- **Building classes** (first letter, lots): {'B': 2473, 'C': 2401, 'S': 331, 'A': 211, 'V': 137, 'R': 136, 'D': 83, 'M': 75, 'K': 72, 'G': 56, 'Q': 43, 'W': 20} (B two-family, C walk-up apartments, S residence with store, A one-family, V vacant, R condo, D elevator, M church, K store building, G garage, Q recreation/open, W education).
- **Years built:** median 1901, from 1800 to 2025; 806 lots carry **1931**, PLUTO's placeholder for "older than the record". The Broadway to Bushwick strip is slightly younger (median 1915).
- **Lot fronts:** mean 7.6 m, median 6.1 m (current ten blocks: 8.2 mean).
- **Storefront density** (land use 04/05, retail area > 0, classes S/K, C7/D7): 547 lots = **8.9%** of the survey, 8.1% in the current ten blocks, 9.8% on the Broadway-Bushwick strip, 9.5% in the new columns c2 to c6. Vacant lots 137, churches 75, schools 20.
- Historic district: PLUTO `histdist` is set on 290 lots in the survey ([('Bedford Stuyvesant / Expanded Stuyvesant Heights Historic District', 259), ('Linden Street Historic District', 31)]).

## 3. Notable items (sources: PLUTO building class and owner; MTA/Wikipedia for the stations)

- **J/M el on Broadway.** The BMT Jamaica line runs on the el above Broadway diagonal. Stations on it inside the survey: Kosciuszko St (station house at Broadway / Kossuth Place / Lafayette Ave per Wikipedia and Subway Nut snippets; Broadway x about 1283 at Lafayette, z 82), Gates Ave (Broadway x Gates: x about 1692, z 495) and Halsey St (Broadway x Halsey: x about 2180, z 988). Station positions are the Broadway centreline crossing each cross street (+-25 m); no station dataset was reachable on the portal. The Broadway PLUTO frontage is mostly 2 to 4 storey mixed-use under the el (class S and K lots, retail frontage on 9.8% of the strip).
- **Churches (PLUTO class M, 75 lots, 71 are M1):** largest fronts: 333 Hart Street (M1, 72 m front, X 600 Z -288), 656 Monroe Street (M1, 53 m front, X 958 Z 607), 897 Putnam Avenue (M1, 51 m front, X 1394 Z 710), 869 Lexington Avenue (M1, 43 m front, X 1381 Z 305), 8 Ralph Avenue (M1, 38 m front, X 1496 Z 383), 562 Madison Street (M1, 37 m front, X 520 Z 684), 279 Stuyvesant Avenue (M1, 37 m front, X 766 Z 852), Halsey Street (M1, 37 m front, X 280 Z 958), 351 Throop Avenue (M1, 37 m front, X 29 Z 53), 180 Van Buren Street (M1, 30 m front, X 268 Z 190), 828 Greene Avenue (M1, 30 m front, X 618 Z 273), 789 Jefferson Avenue (M1, 30 m front, X 1259 Z 798), 1338 Broadway (M9, 24 m front, X 1583 Z 462), 8 Howard Avenue (M9, 24 m front, X 1723 Z 626), 997 Greene Avenue (M1, 24 m front, X 1296 Z 222), 12 Weirfield Street (M1, 24 m front, X 2187 Z 927), 953 Putnam Avenue (M1, 23 m front, X 1575 Z 716), 778 Lexington Avenue (M1, 23 m front, X 1190 Z 355).
- **Schools and education (class W):** 1155 Dekalb Avenue (W9, 4.0 fl, 1931, 1155 Dhs L.L.C.); 125 Stuyvesant Avenue (W1, 3.0 fl, 1955, Nyc Department Of Parks And ); 1396 Broadway (W1, 6.0 fl, 1911, Bushwick Theatres Llc); 145 Ralph Avenue (W1, 3.0 fl, 1965, Nyc Department Of Education); 209 Stuyvesant Avenue (W1, 3.0 fl, 1974, Nyc Department Of Education); 233 Lewis Avenue (W1, 2.0 fl, 1972, Nyc Department Of Education); 280 Hart Street (W1, 3.0 fl, 1950, Nyc Department Of Education); 322 Kosciuszko Street (W1, 4.0 fl, 1959, Nyc Department Of Education); 432 Monroe Street (W1, 3.0 fl, 1950, Nyc Department Of Education); 644 Gates Avenue (W9, 4.0 fl, 2000, Cheyenne Realty No. 2 Llc); 784 Monroe Street (W1, 3.0 fl, 1962, Nyc Department Of Education); 800 Bushwick Avenue (W1, 3.0 fl, 1960, Nyc Department Of Parks And ); 813 Hancock Street (W9, 3.0 fl, 1905, Beford Stuyvesant Early Chil); 82 Lewis Avenue (W2, 5.0 fl, 1926, St Johns Prep School); 848 Quincy Street (W8, 3.0 fl, 1900, Charter Development Company); 982 Dekalb Avenue (W1, 4.0 fl, 1960, Nyc Department Of Education).
- **Parks and open space (class Q; QG lots are listed in the raw file):** 1063 Lafayette Avenue (Q2, 1.0 fl, 1954, Nyc Department Of Parks And ); 308 Marcus Garvey Blvd (Q1, 1.0 fl, 1910, Nyc Department Of Parks And ); 742 Monroe Street (QG, - fl, 0, Nyc Department Of Parks And ); 750 Monroe Street (Q2, 1.0 fl, 1920, Nyc Department Of Parks And ); 842 Halsey Street (Q1, 1.0 fl, 1967, Nyc Department Of Parks And ). Community-garden lots (class QG) number 33 in the survey.
- **Civic and care:** 1015 Putnam Avenue (N9, 4.0 fl, 1920, 61-36 Woodbine Street, Llc); 1064 Bushwick Avenue (U4, - fl, 0, N Y Telephone Co); 1154 Dekalb Avenue (I9, 4.0 fl, 1992, Damon House Ny Inc); 1156 Dekalb Avenue (I9, 4.0 fl, 1931, Damon House Ny Inc); 1240 Broadway (I9, 2.0 fl, 1910, 1240 Broadway Partners Llc); 1245 Broadway (N9, 4.0 fl, 1919, 1245 Broadway Realty, Llc); 18 Ralph Avenue (Y2, 3.0 fl, 1973, Nyc Police Department); 25 Lawton Street (N9, 3.0 fl, 1994, Icl Real Property Holding Co); 365 Lewis Avenue (P8, 1.0 fl, 1907, Brooklyn Public Library); 367 Marcus Garvey Blvd (P9, 2.0 fl, 1930, Nyc Department Of Homeless S); 376 Throop Avenue (P5, 6.0 fl, 1931, Northeast Brooklyn Housing D); 38 Ralph Avenue (I9, 2.0 fl, 1931, 38-40 Dnh Realty Llc); 40 Ralph Ave (I9, 2.0 fl, 1931, 38-40 Dnh Realty Llc); 41 Howard Avenue (I5, 5.0 fl, 1922, Nys Off Child Fam Svcs); 485 Throop Avenue (I5, 4.0 fl, 1954, Nyc Department Of Health And); 495 Hancock Street (Y1, 2.0 fl, 1957, Fire Department Of New York); 559 Van Buren Street (I9, 2.0 fl, 2007, 1204 Broadway Capital Llc); 602 Quincy Street (I9, 3.0 fl, 1931, Sus - Developmental Disabili); 691 Madison Street (N9, 4.0 fl, 1931, Sky 691, Llc); 703 Lexington Avenue (I9, 2.0 fl, 1920, Providence House Inc); 754 Lexington Avenue (I9, - fl, 1993, Nys Office Of Alcoholism); 758 Greene Avenue (I9, 3.0 fl, 1930, 758 Greene Associate); 790 Bushwick Avenue (P8, 2.0 fl, 1905, Brooklyn Public Library); 800 Madison Street (I7, 4.0 fl, 1945, Caring Supported Housing Dev); 803 Lexington Avenue (P5, 2.0 fl, 1918, St. John'S Bread & Life Prog).
- **Libraries (P8)** at 790 Bushwick Ave and 365 Lewis Ave; **fire stations (Y1)** at 940 DeKalb Ave and 495 Hancock St; **police (Y2)** at 18 Ralph Ave.
- **Bus routes:** B15 on Marcus Garvey Blvd; B38 on DeKalb/Lafayette (stop Lafayette / Throop); B43 on Throop at Jefferson; B46/B47/Q24 meet at the Kosciuszko St station (Wikipedia snippet). Other routes in the new area were not verified.

## 4. Totals and the '12 blocks' estimate

- Whole survey (Throop to Bushwick Ave, Hart to Halsey): **about 5,943 lots**, 15 rows x 8 columns, 120 cells; mean 50 lots per cell, 60 to 85 on ordinary interior blocks.
- Current game: 794 lots on 10 blocks = **79 per block** (31% of them filler, so the real density behind them is about 68).
- Therefore **12 more blocks = about 800 lots at the real interior density (12 x 67) or about 950 at the game's current density (12 x 79)**; with edge blocks and superblocks mixed in, plan on 700 to 950.
- Distances for scale: from the current east edge (Garvey face, x about 242) to Bushwick Ave is 1,200 m at Kosciuszko (z 0), 1,560 m at Greene and 2,000 m at Halsey, that is 5 to 8 avenue-blocks wide. Hart to Halsey is 15 rows against the current 5.
- Triangle/trapezoid blocks along the two diagonals (columns c6 and c7, 15 rows) hold 1,109 lots, about 19% of the survey.

## 5. Sketch

SVG: `docs/reference/expansion-sketch.svg` (grid metres, +x east, +z south; red = Broadway with the J/M el and its three stations, blue = Bushwick Ave, dashed = the current game's ten blocks). ASCII, not to scale:

```
 N (grid north is 8.7 deg west of true north)
 Hart        ---+------+------+------+------+------+------+---/\---------- z -247
 Pulaski     ---+------+------+------+------+------+------+--/  \--------- z -165
 DeKalb      ---+------+------+------+------+------+------+-/    \ -------- z  -82
 Kosciuszko  ---+------+------+------+------+------+------+/ Brdwy\Bushwk-- z    0   (Kosciuszko St stn at Broadway x Lafayette)
 Lafayette   ---+------+------+------+------+------+------/+       \ -----   z   82
 Van Buren   ---+------+------+------+------+------+-----/ +        \ ----   z  165
 Greene      ---+------+------+------+------+------+----/  +         \ ---   z  247
 Lexington   ...
 Quincy      ...
 Gates       ---+------+------+------+------+------+--/   +(Gates stn)       z  495
 Monroe..Hancock                                                              z 576..905
 Halsey      ---+------+------+------+------+------+/     +(Halsey stn)      z  988
             Throop Garvey Lewis Stuyv. MalcolmX Patchen Ralph  | Broadway   Bushwick Ave
             x=1    242    493   742    991      1241    1520
 current game = Tompkins(-250)..Garvey(242) x Hart..Greene (first two columns, rows Hart to Greene)
```

## 6. Real venues (addendum): current ten blocks and the expansion

**Sources and limits.** DOHMH restaurant inspections (distinct establishments with a street address, joined to MapPLUTO by address) and DCWP business licences (active premises, joined by BBL). The portal has no SLA liquor-licence set, and the DCWP set carries no laundromat, barber, braiding, daycare, pharmacy, liquor or funeral-home category in this area, so those types are **not** covered: churches, schools and civic buildings come from PLUTO class instead (section 3). Counts: 154 matched venues (16 in the current ten blocks, 138 in the expansion). Storefront kinds: {'restaurant': 72, 'chinese': 9, 'liquor': 7, 'caribbean': 7, 'pizza': 6, 'dollar': 22, 'generic': 25, 'pharmacy': 2, 'cellphone': 3, 'autorepair': 1}.

**Parody convention.** Same type, same rhythm, no real brand (no token of the real name is reused except the street name used as a place word): "Crown Fried Wing", "Throop Night Deli & Grocery", "Golden Dragon No. 3 Kitchen". `storefront` is a `StorefrontKind` from `src/world/data/schema.ts` (restaurant maps to the caribbean archetype; there is no chicken kind, so chicken spots use `restaurant`). The full lists with grid X/Z, BBL and source are in `venues-current.json` and `venues-expansion.json`.

Current ten blocks (all 16):

| Address | Type | Real name (as the source gives it) | Parody name | Storefront | Source |
|---|---|---|---|---|---|
| 833 Dekalb Avenue | brazilian | Petisco Brazuca | DeKalb Block Brazilian | restaurant | DOHMH restaurant inspections 43nn-pn8j |
| 835 Dekalb Avenue | restaurant | New Hardee | DeKalb Stoop Restaurant | restaurant | DOHMH restaurant inspections 43nn-pn8j |
| 886 Dekalb Avenue | pizza | Domino'S | Sorta-Sal's Pizza  ·  $1 Slice ($4) | pizza | DOHMH restaurant inspections 43nn-pn8j |
| 892 Dekalb Avenue | tobacco retail dealer | Liam Deli Grocery Ny Corp | DeKalb Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 901 Dekalb Avenue | secondhand dealer - general | Electronica Diaz Corp | DeKalb Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 905 Dekalb Avenue | Latin takeout | Mary'S Coffee Shop | DeKalb Sol Grill | restaurant | DOHMH restaurant inspections 43nn-pn8j |
| 909 Dekalb Avenue | Latin takeout | Sajoma | DeKalb Fuego Grill | restaurant | DOHMH restaurant inspections 43nn-pn8j |
| 911 Dekalb Avenue | Caribbean / soul takeout | Blossom’S Soul Food Fusion | Mama Dot's Patty Corner | caribbean | DOHMH restaurant inspections 43nn-pn8j |
| 207 Hart St | tobacco retail dealer | Naf Fresh Deli & Grill Inc. | Hart Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 358 Kosciuszko Street | Caribbean / soul takeout | Jamaican Flavors | Auntie Verna's Jerk Kitchen | caribbean | DOHMH restaurant inspections 43nn-pn8j |
| 426 Kosciuszko St | secondhand dealer - general | Standard Value Metals Llc | Kosciuszko Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 148 Lewis Ave | secondhand dealer - general | Gonzalez Appliance Services | Lafayette Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 86 Lewis Ave | tobacco retail dealer | Classic Deli & Organic I Corp. | Lewis Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 98 Lewis Ave | tobacco retail dealer | Ethan'S Grocery Corp. | Lewis Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 176 Marcus Garvey Blvd | Chinese takeout | Good Friend | Lucky Panda No. 6 Kitchen | chinese | DOHMH restaurant inspections 43nn-pn8j |
| 305 Throop Ave | tobacco retail dealer | 305 Throop Grill Inc. | Throop Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |

Expansion area (first 60 of 138; the rest in the JSON):

| Address | Type | Real name (as the source gives it) | Parody name | Storefront | Source |
|---|---|---|---|---|---|
| 75 Lewis Ave | garage & parking lot | 75 Lewis Avenue Parking Llc | Lewis Park-It Garage | autorepair | DCWP licences w7w3-xahh |
| 1127 Broadway | dealer in products for the disabled | Mishkin Pharmacy | Broadway Care Corner Supply | pharmacy | DCWP licences w7w3-xahh |
| 1367 Broadway | dealer in products for the disabled | Sam'S Drugs | Broadway Care Corner Supply | pharmacy | DCWP licences w7w3-xahh |
| 1033 Broadway | electronics | Broadway Home Appliances | Broadway Plug-In Phone Repair | cellphone | DCWP licences w7w3-xahh |
| 1367 Broadway | electronics | Sams Drugs | Broadway Plug-In Phone Repair | cellphone | DCWP licences w7w3-xahh |
| 862 Bushwick Ave | electronics | Nexora Home Systems Inc | Bushwick Plug-In Phone Repair | cellphone | DCWP licences w7w3-xahh |
| 1064 Broadway | tobacco retail dealer | 1064 Sam Deli Inc | Broadway Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 107 Ralph Ave | tobacco retail dealer | Yoemy Bridge Food Corp | Ralph Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 1185 Dekalb Avenue | tobacco retail dealer | Mr. Deli & Grill Llc | Bushwick Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 1220 Broadway | self-storage facility | Cubesmart, L.P. | Van Buren Stash Space Storage | generic | DCWP licences w7w3-xahh |
| 1334 Broadway | tobacco retail dealer | Triangle Deli Corp | Quincy Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 1440 Broadway | stoop line stand | Organic Fresh Market Corp | Broadway Stoop Line Snacks | generic | DCWP licences w7w3-xahh |
| 1461 Broadway | hotel | Broadway 1460 Llc | Broadway Stopover Inn | generic | DCWP licences w7w3-xahh |
| 1569 Broadway | stoop line stand | Cathy'S Greengold | Broadway Stoop Line Snacks | generic | DCWP licences w7w3-xahh |
| 186 Stuyvesant Ave | tobacco retail dealer | Taj Organic Mini Mkt & Deli Corp. | Stuyvesant Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 2 Ralph Ave | tobacco retail dealer | Ralph Avenue Fresh Farm Corp. | Ralph Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 228 Lewis Ave | tobacco retail dealer | Novatos Grocery Corp. | Lewis Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 362 Marcus Garvey Blvd | tobacco retail dealer | Prestige Gourmet Deli Corp | Garvey Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 416 Monroe Street | electronic cigarette dealer | 416 Inlet Market Corp. | Monroe Vape Cloud Annex | generic | DCWP licences w7w3-xahh |
| 418 Jefferson Ave | tobacco retail dealer | Jessica Deli Grocery Corp. | Jefferson Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 46 Ralph Ave | tobacco retail dealer | Golden Island Convenience Corp. | Ralph Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 72 Ralph Ave | electronic cigarette dealer | Sunrise Express Deli Inc | Madison Vape Cloud Annex | generic | DCWP licences w7w3-xahh |
| 865 Hancock Street | tobacco retail dealer | K Star Deli Corp | Howard Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 895 Gates Ave | tobacco retail dealer | New Gates Grocery One Corp. | Gates Corner Smoke & Candy | generic | DCWP licences w7w3-xahh |
| 951 Madison St | self-storage facility | Stuf New York Llc | Madison Stash Space Storage | generic | DCWP licences w7w3-xahh |
| 960 Halsey St | stoop line stand | 960 Halsey Food Corp. | Halsey Stoop Line Snacks | generic | DCWP licences w7w3-xahh |
| 103 Stuyvesant Ave | secondhand dealer - general | Ctrl Vintage Llc | Stuyvesant Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1065 Broadway | secondhand dealer - general | Town Of Bargains Furniture & Bedding | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1075 Broadway | secondhand dealer - general | Ecoatm | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1086 Dekalb Ave | secondhand dealer - general | Rg Tire Repairs Shop Llc | DeKalb Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1104 Broadway | secondhand dealer - general | Gimmy Antonio Palacios Canizales | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1124 Broadway | secondhand dealer - general | Martin'S Appliances | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1181 Broadway | secondhand dealer - general | Rafy'S Home Appliances, Corp. | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1258 Broadway | secondhand dealer - general | Super Pawn Llc | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1263 Broadway | secondhand dealer - general | King Of Broadway Furniture Inc | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1308 Broadway | secondhand dealer - general | Shorty Jewelry Corp. | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1308 Broadway | secondhand dealer - general | Shorty Wireless Inc | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1325 Broadway | secondhand dealer - general | L Train Vintage | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1354 Broadway | secondhand dealer - general | Ifix Nyc | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1367 Broadway | secondhand dealer - general | T-Mobile | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1431 Broadway | secondhand dealer - general | Ecoatm, Llc | Madison Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1457 Broadway | secondhand dealer - general | Rgr Family Thrift Store, Inc. | Broadway Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 335 Marcus Garvey Blvd | secondhand dealer - general | Ssr Gold Buyers | Madison Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 4 Ralph Ave | secondhand dealer - general | People'S Bargain | Lexington Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 934 Madison St | secondhand dealer - general | Second Stroke Mopeds | Madison Second Hand Rose Exchange | dollar | DCWP licences w7w3-xahh |
| 1099 Broadway | bar | Mr. Bells Cuisine And Bar | The Quiet Nail Bar | liquor | DOHMH restaurant inspections 43nn-pn8j |
| 1178 Bushwick Avenue | bar | House Party Cafe & Lounge | The Last Porch Bar | liquor | DOHMH restaurant inspections 43nn-pn8j |
| 1336 Bushwick Avenue | bar | Andalucia Bar & Lounge | The Loose Stool Bar | liquor | DOHMH restaurant inspections 43nn-pn8j |
| 1595 Broadway | bar | Gems Bar Lounge | The Loose Porch Bar | liquor | DOHMH restaurant inspections 43nn-pn8j |
| 260 Malcolm X Boulevard | bar | Therapy Wine Bar 2.0 | The Loose Stool Bar | liquor | DOHMH restaurant inspections 43nn-pn8j |
| 334 Marcus Garvey Blvd | bar | Lucky'S Cocktail Lounge | The Quiet Stool Bar | liquor | DOHMH restaurant inspections 43nn-pn8j |
| 358 Marcus Garvey Blvd | bar | Frog Wine Bar | The Loose Round Bar | liquor | DOHMH restaurant inspections 43nn-pn8j |
| 1142 Broadway | pizza | Broadway Pizza | Broadway Corner Pizza | pizza | DOHMH restaurant inspections 43nn-pn8j |
| 1491 Broadway | pizza | Bk Pizza 1 | Broadway Corner Pizza | pizza | DOHMH restaurant inspections 43nn-pn8j |
| 1544 Broadway | pizza | Domino'S | Sorta-Tony's Pizza  ·  $1 Slice ($4) | pizza | DOHMH restaurant inspections 43nn-pn8j |
| 234 Malcolm X Boulevard | pizza | Pizza Crew | Malcolm Corner Pizza | pizza | DOHMH restaurant inspections 43nn-pn8j |
| 36 Ralph Avenue | pizza | Bklyn Pizza | Ralph Stoop Pizza | pizza | DOHMH restaurant inspections 43nn-pn8j |
| 1072 Dekalb Avenue | Chinese takeout | Linda'S Asian Kitchen | DeKalb Block Chinese | chinese | DOHMH restaurant inspections 43nn-pn8j |
| 1126 Broadway | Chinese takeout | Dragon King | Jade Panda No. 8 Kitchen | chinese | DOHMH restaurant inspections 43nn-pn8j |
| 1157 Broadway | Chinese takeout | China Garden | Happy Dragon No. 4 Kitchen | chinese | DOHMH restaurant inspections 43nn-pn8j |
