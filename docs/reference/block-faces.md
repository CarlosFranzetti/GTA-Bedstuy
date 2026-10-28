# Block faces: real-street reference for the 10 Bed-Stuy blocks

Status: **partial, text-sourced.** No building footprints, no MapPLUTO floors or year-built data, and no street-direction data were retrieved. The OSM Overpass API and NYC Open Data are both unreachable from this session (see `docs/swarm/tasks/R2.md`). Google Street View was not accessed. Everything below comes from search-result snippets and listing pages. Confidence: **H** = official or multiple sources, **M** = one credible source, **L** = inference or single weak snippet.

Grid under review: `src/world/data/bedstuy.json` (columns Tompkins / Throop / Marcus Garvey; rows Hart, Pulaski, Kosciuszko, Lafayette, Van Buren, Greene).

---

## 1. Corrections and assumptions in bedstuy.json (priority order)

| # | Item | JSON now | Finding | Conf |
|---|---|---|---|---|
| 1 | Kosciuszko sign spelling | `signName: "Kosciusko St"` | Official spelling is **Kosciuszko St** (listings, MTA station name). The JSON `name` is right; the sign text is misspelt. Fix unless the misspelling is a deliberate joke (the laundromat sign already plays on spelling). | H |
| 2 | Avenue order, west to east | Tompkins -250, Throop 0, Marcus Garvey +250 | Consistent with sources. Order is Marcy Ave, Tompkins Ave, Throop Ave, Marcus Garvey Blvd, Lewis Ave (walking-guide snippet for Macon St; Hart St rows described as "between Nostrand and Marcy"). The grid's west edge at Tompkins is fine. | M |
| 3 | Marcus Garvey Blvd history | `Marcus Garvey Blvd` | Renamed from **Sumner Ave** by city vote. Older maps and some 1880s buildings still say Sumner (e.g. Upper Room Baptist, built 1888 as Sumner Avenue Baptist). Current sign name is correct. | M |
| 4 | Street sequence north to south (Hart, Pulaski, Kosciuszko, Lafayette, Van Buren, Greene) | offsets -200 to +300 | **Not verified.** No fetched source gave the cross-street order between Lafayette, Kosciuszko, Van Buren and Greene. Partial anchors only: Lafayette Ave magnolia landmark sits between Tompkins and Marcy; Greene Ave church landmark (828 Greene) sits near Lewis; Upper Room Baptist is at Marcus Garvey and Van Buren. **Check on a map before trusting the ordering.** | L |
| 5 | One-way directions | Hart +1, Pulaski -1, Kosciuszko +1, Van Buren +1 | **Not verified.** Searches returned nothing on traffic direction for any of these streets. Treat as game-only assumptions and label them that way. | L |
| 4b | DeKalb Ave (close-out re-check, 28 Oct) | not in grid | Still **not verified** from this sandbox (openstreetmap.org, wikipedia.org, forgotten-ny.com and NYC Open Data all refused to resolve). Two independent recollections (MGR, Fable) place **DeKalb Ave between Pulaski St and Kosciuszko St**; a station page snippet says the Kosciuszko St station has exits toward both Lafayette Ave and DeKalb Ave, which is consistent with Kosciuszko sitting between those two avenues. Decision left to the user: add DeKalb as a 7th east-west street (grid becomes 3 x 7) or keep the map as drawn. | M |
| 5b | Avenue one-way hints (close-out re-check) | all avenues two-way | Bus-route snippets: B15 runs Marcus Garvey Blvd southbound / Lewis Ave northbound, which is the pattern of a one-way pair. Fable's recollection (unverified): Tompkins Ave northbound and Throop Ave southbound as another pair. No DOT source reached. Game keeps all three avenues two-way until verified. | L |
| 6 | Avenue and street widths | roadWidth 13-14 avenues, 10 streets (JSON units) | **Not verified.** No width source retrieved. Marcus Garvey is a boulevard and may be wider than Throop. | L |
| 7 | Historic district | not modelled | The area is inside the Bedford-Stuyvesant / Expanded Stuyvesant Heights Historic District (LP-2496, designated 16 Apr 2013, about 825 buildings). Dominant fabric is 19th-century brick and brownstone rows. One snippet's boundary description is internally inconsistent (it puts Fulton on the south edge), so do not use its boundaries. | M |
| 8 | ZIP codes (flavour only) | none | Hart, Throop, Pulaski listings use 11206; Greene, Van Buren, Lafayette listings use 11221; Kosciuszko listings use 11216 and 11221. | L |

---

## 2. Per street, by face

Block-to-face mapping was not possible without footprint data, so rows are per street. The "face" is the side of the street. Where a side is not stated, the row describes both sides.

| Street (game segment) | Side(s) | Dominant building type (expected) | Floors (est.) | Real uses found in public listings (for placement only) | Trees | Conf |
|---|---|---|---|---|---|---|
| Hart St (-200 row) | both | Late-19th-century neo-Grec rowhouses, Nostrand to Marcy | 3 to 4 | Bus stop at Throop and Hart (listing) | not checked | M (typology) / L (floors) |
| Pulaski St (-100 row) | both | Rowhouses; ZIP 11206 | 3 to 4 | Grace Baptist Church, 83 Pulaski St (79th Pct church directory, date unclear) | not checked | M for church / L for rows |
| Kosciuszko St (0 row) | both | Rowhouses and small apartment buildings, between Marcy and Tompkins | 3 to 4 | Public School 79 on Kosciuszko near Throop (1907 photo record, historical; current status unknown) | not checked | L |
| Lafayette Ave (+100 row) | both | Avenue rowhouses and walk-ups between Tompkins and Marcy | 3 to 5 | Magnolia grandiflora tree at 677/679 Lafayette, NYC landmark, designated 12 Jul 1977 | Landmark magnolia (the only confirmed tree) | H for tree / L for rows |
| Van Buren St (+200 row) | both | Rowhouses and small walk-ups; near Kosciuszko St J-line station (walk-score pages) | 3 to 4 | Real-estate listings at 63, 108, 212 Van Buren; Upper Room Baptist corner with Marcus Garvey (name also appears as Upper Room Gospel Baptist at 180 Van Buren; the two may be different addresses) | not checked | L |
| Greene Ave (+300 row) | both | Private brownstone and rowhouse blocks, Throop to Marcus Garvey (e.g. 677 Greene, three-family brownstone, 1899); 816-826 Greene rows, 1892-93 | 3 to 4 | Antioch Baptist Church, 828 Greene (individual landmark, designated 20 Nov 1990, architect Lansing C. Holden) and church house at 826 Greene (landmarked) | not checked | M |
| Throop Ave (avenue, column 1 centre) | both | Mixed: church and storefront ground floors over rowhouses or walk-ups | 3 to 6 | Rhea's Laundromat, 442 Throop (listing); churches: Bedford Stuyvesant Assembly of God 299 Throop, Brighter Way Baptist 417 Throop, Our Lady of Victory R.C. 583 Throop (79th Pct directory); Mt. Zion Pentecostal Holy Church about 0.1 mi from 276 Throop; liquor and discount shops within 0.2 mi of 276 Throop | not checked | M (churches, laundromat) / L (other shops) |
| Marcus Garvey Blvd (avenue, column 2 edge) | both | Wider avenue frontage: churches, rows, some newer residential | 3 to 6 | Upper Room Baptist (1888, Sumner Ave Baptist name); 488 Marcus Garvey: 2019 permits for new building (YIMBY) | not checked | M |
| Tompkins Ave (avenue, west edge) | both | Not sampled in these searches | unknown | none retrieved | unknown | - |

Notes:
- "Not checked" means no tree data was retrieved. It does not mean there are no trees.
- Real business names above are for placing or flavouring the parody signs only. The game uses parody names; do not copy real signage.

---

## 3. Dominant types across the grid (summary)

1. **Brick and brownstone rowhouses, 3 to 4 storeys** (dominant, M). Supported by the historic-district character, the 1890s rows (816-826 Greene, Hart St neo-Grec) and the three-family brownstone at 677 Greene. Italianate and Romanesque Revival houses are both present.
2. **Churches, high density on Throop, Greene and Marcus Garvey** (M). At least seven named churches or church houses found in this area, several in landmarked or historic buildings.
3. **Storefront ground floors on Throop and Greene** (L): laundromats, liquor and discount shops, pharmacies. Bodega placement is not confirmed by any source.
4. **Newer infill** (L): three-storey residential approved by LPC in the district; 488 Marcus Garvey permits (2019). Taller new builds (7 storeys) exist on Gates Ave, outside this grid.
5. **Trees**: only the Lafayette magnolia landmark is confirmed (H). Street tree density is unverified.

Floors are estimates for the game's massing: 3 to 4 for rows, 5 to 6 for walk-ups and avenue apartments. They are **not** from PLUTO.

---

## 4. Blocked or not retrieved

| Need | Source | Status |
|---|---|---|
| Building footprints, tags, floors | OSM Overpass (overpass-api.de) | Blocked: egress proxy 403 (CONNECT refused); WebFetch: name does not resolve |
| Lot-level floors, year built, land use | MapPLUTO (data.cityofnewyork.us) | Blocked: egress proxy 403; WebFetch: name does not resolve |
| Designation report LP-2496 | s-media.nyc.gov | Not read; snippet only |
| Street traffic direction | NYC DOT | No reachable source |
| Wikipedia | en.wikipedia.org | Blocked (egress 403) |
| Street View | Google | Not accessed (not permitted) |

To finish this document, allow overpass-api.de and data.cityofnewyork.us in the session network settings and rerun. Then fill the Floors and Trees columns from OSM `building:levels` and PLUTO `NumFloors`, and check the sequence in section 1, row 4, on a map.

---

## 5. Pass 2 (R2, 28 Oct, WebSearch snippets only)

Scope: the nine street segments inside the grid (six east-west rows, three avenues). Block ids follow the grid scheme used in the POIs: `rRcC`, where r0..r4 lie between Hart / Pulaski / Kosciuszko / Lafayette / Van Buren / Greene (row r sits between streets[r] and streets[r+1]), and c0 = Tompkins to Throop, c1 = Throop to Marcus Garvey. This row/column mapping is assumed (L) until D1 confirms it against the Grid block ids. Query numbers (Q1 to Q22) are listed in `docs/swarm/tasks/R2b.md`.

Not reached this pass: LPC designation report LP-2496 (s-media.nyc.gov refused, DNS not in the session allowlist), NYC Open Data, PLUTO, OSM, Street View. Every value below is a search snippet or listing text. Confidence: H = official or multiple sources; M = one credible source (Brownstoner, LPC summary, HDC, a listing with a year built); L = listing-only, marketing copy, undated, or inference.

### 5.0 Corrections to Pass 1 (read before 5.1)

| # | Pass 1 said | Pass 2 finds | Conf |
|---|---|---|---|
| C1 | Antioch Baptist, 828 Greene, and the 816-826 Greene rows, sit on the Greene row between Throop and Marcus Garvey | 828 Greene's cross streets are Lewis and Stuyvesant Avenues (HDC and Brownstoner snippets). Lewis is east of Marcus Garvey, so the church is **outside the grid**. The 816-826 rows probably share that end (not re-checked). | M |
| C2 | Upper Room Baptist (1888) at Marcus Garvey and Van Buren | Only address found: 180 Van Buren St, ZIP 11221 (food-pantry page and a 2023 directory). No Marcus Garvey cross street was found. Pass 1 placement is unverified. | L |
| C3 | Magnolia at 677/679 Lafayette sits between Tompkins and Marcy | Marcy is west of Tompkins, so that block would lie outside the grid. Not resolved (needs a map). | L |
| C4 | Grace Baptist at 83 Pulaski | Confirmed as a 79th Precinct church list entry (undated; the layout is jumbled and shows "1200 Bedford Avenue" above it). Block membership not confirmed. | M |
| C5 | Throop churches and Rhea's Laundromat | Addresses confirmed in listings and the 79th Pct list (299, 417 Throop; 442 Throop). Block membership not confirmed. | M |

### 5.1 Hart St (row r0 north edge; Tompkins to Throop)

- Dominant type: 3 to 4 storey rows and a few infill buildings (M). A 2004 building at 173 Hart St is listed as between Tompkins and Throop, with 3 floors (listing, Q1). Read as `newBuild`, 3 floors, M.
- 226 Hart St, cross street Tompkins: pre-war, listed as 4 floors (listing, Q1). Block side unverified (L).
- Pre-war houses: 196 Hart St, listed as a 3-storey brownstone built 1910 (listing, Q1). Its block is not confirmed. Treat as `brownstone`, 3 floors, L.
- Landmark context: the Willoughby-Hart Historic District was designated by LPC (press release dated 25 Jun 2024, Q1). Its rows are on Hart and Willoughby between Nostrand and Marcy, which is west of the grid. The district's rows are described as largely neo-Grec in brownstone (Q18, M). Applying that to Tompkins to Throop is an extrapolation (L).
- Stoop, cornice, storefront, trees, scaffolding: no source (gap). Bus stop at Throop and Hart is from pass 1 (listing, unverified).

### 5.2 Pulaski St (row r0 to r1; Tompkins to Throop)

- Dominant type: 3 to 4 storey rows and walk-ups (M typology; L per block).
- 185 Pulaski and 195A Pulaski are listed between Tompkins and Throop (listings, Q2). Typology not given (L).
- 197 Pulaski: DOB filing on 30 Mar 2023 for a 4-storey, 7-unit new building, filed by BH Success Group (YIMBY/Marketproof, Q16). Read as `newBuild`, 4 floors, M for filing. Vacancy of the site not stated (L). Block membership not confirmed (likely Tompkins to Throop; L).
- 156 Pulaski: 9-unit condo in a 3-storey building, built 1931 (listing, Q2). Read as a 1931 walk-up, `residential`, 3 floors, M. Block not confirmed.
- 88 Pulaski: townhouse, 3 floors, cross street Marcy (listing). Outside the grid (west of Tompkins).
- Corner, Throop and Pulaski: 330 Throop Ave, Brownstoner "Building of the Day" (Q22). Second Empire private house, built before 1873, architect unknown, not landmarked. A 1980s tax photo shows asphalt siding. Read as `frame` or `brickPainted` (cladding unknown), 3 floors (L), possibly `residential`, M for the house's existence and date. Which of the four corners it occupies is not stated (L).
- Church: Grace Baptist Church, 83 Pulaski St (79th Pct list; see C4). Use as `use: church`, M for existence, L for block.
- Storefront archetype on Pulaski: none found.

### 5.3 Kosciuszko St (row r1 to r2; Tompkins to Throop; Throop-side corners)

- Dominant type: rows and small apartment buildings, 3 to 4 storeys (M typology). The nearest dated listings are 184 Kosciuszko (1899, 3 apartments) and 175 Kosciuszko (1910, 2 units, 3 storeys). Both are between Marcy and Tompkins, so **outside the grid** (Q3, M).
- 289 Kosciuszko: YIMBY (undated) describes a vacant lot left empty for over a decade, with Premier Equities as developer. A 2018 YIMBY permit notice for a 4-storey residential building with a penthouse at the same address. Read as `vacant` (the lot) then `newBuild`, M for the vacancy story, L for block membership (Q16).
- Institutions: P.S. 79 on Kosciuszko near Throop (1907 Brooklyn Eagle photo caption, Q3). Current status unknown (L). Crossover Baptist Church at 358 Kosciuszko (directory listing, Q9). Block not confirmed (L). A former St. Ambrose parish house at the Tompkins corner (Forgotten NY walking piece, via a search snippet, L).
- Subway: the Kosciuszko St station's active stairs sit at the Broadway, Kossuth Place and Lafayette Ave junction; closed emergency exits open near DeKalb and Broadway (Wikipedia and Subway Nut snippets, Q13). This is not a grid anchor, because Broadway is not a grid street.
- Storefront archetype: no source for the grid stretch (gap). Tompkins-corner storefront archetypes are on the Tompkins section (5.9).

### 5.4 Lafayette Ave (row r2 to r3; Tompkins to Marcus Garvey)

- Tree: magnolia grandiflora at 677/679 Lafayette, NYC landmark, designated 12 Jul 1977 (HDC, pass 1, H for the tree; location conflict C3, L).
- 664 Lafayette: four-storey, three-family Neo-Grec brownstone overlooking Von King Park (Brownstoner "House of the Day", undated; Q12). Read as `brownstone`, 4 floors, `cornice: plain` (L). Block not confirmed.
- Landmark: LPC report (snippet, Q12) on a neo-Grec residence built in the early 1880s, facing the north side of Tompkins Park from Lafayette Ave. Read as `brownstone` (L). Exact lot not given.
- 672 Lafayette: gutted five-storey brownstone near Tompkins Park (Brownstoner, Q12). Use as `brownstone`, 5 floors, L.
- 725 Lafayette and 766 Lafayette: listing pages only (cityrealty, Q12). No typology.
- Church at Lafayette: Christ Evangelical English Lutheran, 1084 Lafayette (Wikipedia snippet, Q4). Its number is far east, so it is likely **outside the grid** (L).
- Storefront archetype and church inside the grid: none found (gap).

### 5.5 Van Buren St (row r3 to r4; Tompkins to Marcus Garvey)

- 127 Van Buren: Queen Anne row house, cross streets Throop and Marcus Garvey, built after 1888 and before 1908 by Brownstoner's map dates (Q5). Read as `brownstone`, 3 floors (L), `cornice: plain` (L). Block is inside the grid (c1, Throop to Marcus Garvey), M.
- 64 Van Buren: two-unit brownstone built 1901, between Tompkins and Throop (Corcoran sold listing, Q5). Read as `brownstone`, `residential`, M.
- 211 Van Buren: four-storey triplex brownstone, year built 1899 (listing, ZIP 11221, Q5). Block not confirmed (L).
- 25 Van Buren: built 2014, between Tompkins and Throop (cityrealty, Q5). Read as `newBuild`, 4 floors (L; floor count not in the snippet), M for 2014.
- Hattie Carthan Herban Farm: on Van Buren between Throop and Tompkins (Forgotten NY, via snippet, Q21). A community farm, not a built frontage. Treat as open space rather than a building lot (L on its exact footprint).
- Upper Room Gospel Baptist at 180 Van Buren, ZIP 11221 (Q14, M for address; C2).
- Corner parcel: a commercial listing describes a 10,000 sq ft lot at Van Buren and Marcus Garvey, offered for redevelopment (CommercialSearch, Q10). Possibly `vacant` (L).
- Permits (undated, Q16): 490 Van Buren (4 storeys, 8 units), 499 Van Buren (4 storeys, 7 units), 299 Van Buren (4 storeys, 10 apartments). Read as `newBuild` candidates, L for block and for vacancy.

### 5.6 Greene Ave (row r4 south edge; Tompkins to Marcus Garvey)

- 620 Greene: private house, cross streets Tompkins and Throop, built about 1872, Second Empire, architect unknown, not landmarked (Brownstoner "Building of the Day", Q6). Read as `frame` or `brickPainted` (L) with a mansard roof; `floors: 3` (L). Inside the grid, M for the house.
- 626 Greene: Tompkins-side property, four floors, six homes, 421-a abatement to 2031 (NestSeekers listing, Q6). Not described as a brownstone. Read as `residential`, 4 floors, M.
- 650 Greene: 2022 YIMBY notice for a four-storey residential building on a lot between Throop and Tompkins (Dido Properties, Q6). Read as `newBuild` or `vacant` lot (L).
- 677 Greene: three-family brownstone built 1899, on the "lush, tree-lined" block between Throop and Marcus Garvey (Corcoran sold; listing copy, Q6, Q21). Read as `brownstone`, `residential`, 3 floors, M for the build year, L for the tree wording.
- 762 Greene, cross street Marcus Garvey: listing copy says the block is mostly brownstone townhouses (Q6). Its block side is not confirmed, and it may be outside the grid (L).
- 446 Greene: Bedford and Nostrand; Queen Anne row, c. 1885, architect possibly Amzi Hill (Brownstoner, Q20). **Outside the grid**. Useful only as a typology reference (M).
- Antioch Baptist, 828 Greene: outside the grid (C1).
- Storefront archetype: none found on the grid stretch (gap).

### 5.7 Throop Ave (avenue, c0/c1 boundary; full length of the grid)

- Corner storefronts:
  - Laundromat: Rhea's Laundromat, 442 Throop Ave (listing directory, Q7; reviews). Read as `storefront: laundromat`, M for the address, L for the grid block.
  - Daycare: Brooklyn Community Day Care Center, 268 Throop (listing, Q7, L). A family day care at 220 Throop Apt 7-B appears in the state registry with an enforcement note (Q7, L). Do not use without a status check.
  - Pharmacy, liquor and discount shops within 0.2 mi of 276 Throop: pass 1 only (L).
  - Barbershop: none on Throop (Q7). The only barber result, DIMENSION, has no address (do not use).
  - Bodega: a shooting at Throop and Quincy, undated (Q7). Quincy is not a grid street.
- Churches (all M for existence and address, from the 79th Pct list, Q7 and pass 1):
  - Bedford Stuyvesant Assembly of God, 299 Throop.
  - Brighter Way Baptist, 417 Throop.
  - Ebenezer Gospel Tabernacle, 470 Throop: Queen Anne, 1891, built for the Association for Improving the Conditions of the Poor; cross streets Gates and Quincy (Brownstoner, Q7). **Outside the grid** (Gates and Quincy are not row streets).
  - Our Lady of Victory R.C., 583 Throop (pass 1, not re-checked, L).
  - Mt. Zion Pentecostal, about 0.1 mi from 276 Throop (pass 1, L).
- Residential stock:
  - 320 Throop: built 1910, 3 storeys, 3 units (listing, Q7). `residential`, 3 floors, M-L.
  - 322 Throop: brownstone built 1899 (PropertyShark, Q5). `brownstone`, L for block.
  - 277 Throop: 2016 YIMBY filing, five-storey, eight-unit residential (Q16). `newBuild`, 5 floors, M for filing.
  - 185 Throop: 2015 YIMBY proposal for a six-storey, 89-unit supportive building (Q16). `newBuild`, 6 floors, L for built.
  - 482 Throop: six-storey residential, with demolition permits filed December 2019 (YIMBY, Q16). Possibly `vacant` after demolition, L.
  - 171 Throop (2020) and 190 Throop (undated): permit notices only (Q16, L).
  - 632 Throop: no source found (Q19, dead end).
- Corner, Throop and Pulaski: 330 Throop (see 5.2).
- Corner, Throop and Van Buren: no source for a Throop corner there (see 5.5 for the Van Buren farm).

### 5.8 Marcus Garvey Blvd (avenue, c1 east edge; formerly Sumner Ave)

- Church: Bethany Baptist Church, 460 Marcus Garvey Blvd (directory/Benevity listing, Q14, M for the address, L for block).
- Residential and infill: 106 Marcus Garvey (2025 YIMBY permit notice, undated day; Q16, L). 488 Marcus Garvey (2019 permits, pass 1, L).
- Queen Anne flats: 469 Marcus Garvey, 1888, corner Decatur (Brownstoner, Q10). Decatur is not a grid street, so it is outside or on the edge (L). Useful as the avenue's Queen Anne reference (M).
- Public housing: Marcus Garvey Houses (Wikipedia snippet, Q10). Location in the grid not confirmed (L). If it is on this block, `use: residential` with large massing (needs a check).
- Storefront archetype: none found (gap).

### 5.9 Tompkins Ave (avenue, c0 west edge)

- Corner storefront: 435 Tompkins, a long-crumbling storefront corner to be replaced by condos (Brownstoner, Q9). Read as `storefront: generic` or `mixed`, L for block and corner.
- Churches: Tompkins Avenue Congregational Church started in a schoolhouse near McDonough Street in 1875. Its chapel at Tompkins and McDonough dates from 1888. A BPL caption dates a campanile at Tompkins and McDonough to about 1910, and names First AME Zion as the current occupant (Q9, M). McDonough is not a grid street, so this is **outside the grid**, on the Tompkins edge (L).
- Former St. Ambrose parish house at the Tompkins and Kosciuszko corner (Forgotten NY via snippet, L).
- Permits filed on Tompkins (YIMBY, Q16; block membership unknown): 173 Tompkins (2020), 185 Tompkins (2024), 423 Tompkins (2022), 467 Tompkins. Use only as "new build filed" flags, `newBuild`, L.
- Mixed use: 343A Tompkins (StreetEasy, Q9, no detail).

### 5.10 Cross-grid typology (summary for D1)

Sources used: LP-2496 summary (CityLand, Q8, M): about 825 buildings, mostly speculative rows of the 1880s and 1890s; the 1890s also added 4 to 5 storey "French flats" in Romanesque and Renaissance Revival styles. Stuyvesant Heights designation keywords include stoop, bay window and cornice (Q18, M).

Recommended defaults for D1 (these are typology defaults, not measured values; confidence L unless noted):

| Field (D1 enum) | Suggested default | Basis | Conf |
|---|---|---|---|
| `floors` | rows 3 to 4; walk-ups and French flats 4 to 5; avenue infill 4 to 6 | listings and permits above | M (rows), L (infill) |
| `family` | `brownstone` for pre-1900 rows on Hart, Kosciuszko, Lafayette, Van Buren, Greene; `brickRed` or `brickTan` for 1900s to 1930s walk-ups; `newBuild` for post-2000 infill; `church` for church lots; `vacant` for lots with a vacancy note | Q1, Q5, Q6, Q8, Q16 | M / L |
| `cornice` | `bracketed` for Italianate and Second Empire (e.g. 620 Greene, 330 Throop); `plain` for Neo-Grec and Queen Anne (e.g. 127 Van Buren, 664 Lafayette); `none` for flush parapets on infill | Q8, Q18 (style-to-cornice mapping is mine) | L |
| `stoop` | `true` on row houses; `false` on avenue storefronts and new infill (only where no stoop is evidenced) | Q8 stoop keyword, Q18 | M (rows), L (per block) |
| `use` / `storefront` | `mixed` with storefront on Throop and Tompkins corners; `church` on the Throop, Pulaski, Marcus Garvey and Tompkins churches above | Q7, Q9, Q14 | M |
| `trees` | unknown everywhere except the Lafayette magnolia; Greene Throop to Marcus Garvey described as tree-lined (listing copy) | Q6, Q21 | L |
| `scaffold` | `false` everywhere (no source found) | none | - |

### 5.11 Open items (pass 2)

1. LP-2496 PDF (s-media.nyc.gov): allow it in the session network settings, then read the building-type inventory. It is the best source for cornice and material splits.
2. Resolve C1 to C3 on a map: the 828 Greene and 816-826 Greene placement, the Upper Room corner, and the magnolia block.
3. Lafayette, Kosciuszko, Van Buren and Greene north-south sequence is still unverified (Pass 1 item 4).
4. Trees and scaffolding: no source reached. Street View checklist in `docs/world-notes.md` covers both.
5. Street-level storefront archetypes: only Throop (laundromat, day care) and Tompkins (condo-replacement corner) have sources. Everything else is a gap.
