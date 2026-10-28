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
