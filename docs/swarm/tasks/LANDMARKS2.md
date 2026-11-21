# LANDMARKS2: fifteen more real places, built to match open-licence photographs

Lane: LANDMARKS2, 21 Nov 2026 (night). Code: `src/world/landmarks/` (rows in `landmarks2.ts`, builders in `buildCivic2.ts` and `buildStreet2.ts`, shared parts in `parts.ts`). Tests: `tests/unit/world/landmarks.test.ts`, `landmarks-names.test.ts`. Harnesses: `scripts/landmarks-shots.{html,mjs}`, `scripts/landmarks-game.mjs`. Frames and reference photos: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/landmarks2/`.

This file is a note for the studio. It names the real places on purpose. The game shows the invented names only; the real names live here and in the TEST list of `landmarks-names.test.ts`.

STATUS: built and checked on 21 Nov night: 13 places (14 rows), not fifteen. See "What is missing" for why. Nothing committed or pushed.

## Image rules used

- Photos looked at (Read tool) and measured by eye: only public domain, CC0, CC BY and CC BY-SA files (Wikimedia Commons file pages, US National Archives). The licence of each file was read from its Commons file page before use.
- Nothing else was downloaded: no news photos, listings, Flickr all-rights-reserved, Street View or Maps.
- Written facts (Wikipedia, MapPLUTO, Building Footprints) are used freely.
- No texture was cut from a photo: walls use the shared material library and are coloured by the wall tone (`look.wall`, `look.trim`, `look.cornice`, `look.metal` in `tone.ts`). Nothing here is a derivative of a photo, so the CC BY-SA files impose no share-alike duty; they are credited anyway in `docs/CREDITS.md`.
- Local copies of the photos are in the scratch folder `ref/` only (not in the repository).

## The places

Coordinates: game metres. "Matched" = the game frame was put beside the photo and the recognisable features were checked. Lot ids are BBLs and are stable; the `block` number inside a row moves when the map grows (the test finds the block that holds the site).

| Invented name | Real identity (notes only) | Lot(s) | Kind / builder | Photo looked at (licence) | Recognisable features built | Status |
|---|---|---|---|---|---|---|
| Wrenfield Church | St. Barbara's RC church, 138 Bleecker St, 1910 | 3033060006 | church `plan: twin`, `buildTwinChurch` | Commons "Main entrance of St. Barbara's ..." (CC BY 4.0) | white glazed terracotta front, buff brick wings with white quoin courses, two three-stage bell towers with balconies and green domed caps, columned three-door portico, octagonal window, scrolled attic with cross, granite steps and iron fence | matched (massing, colours, towers); ornament is approximate |
| The Alder Theatre | RKO Bushwick Theatre, 1396 Broadway at Howard Ave, 1911 (now a school) | block of Broadway, Howard Ave, Madison St (no lot placed) | theatre, `buildTheatre` (wedge block) | Commons NARA 555919 (public domain) | white terracotta, round corner tower with porthole and ring cornice on the sharp corner, fluted marquee carrying the name, tall windows with heads on both long walls, red base, the el overhead | matched (corner tower, marquee, colour); the real windows have sculpted figures, not built |
| Hobart Brewhouse | William Ulmer Brewery, 31 Belvidere St, 1872-1890 | 3031350034, 3031350036, 3031350020 | brewery, `buildBrewery` | Commons "Ulmer Brewery Bushwick Av Belvedere St jeh" (CC0) | four-storey red brick block, round-arched windows with lighter hoods, bricked-up ground arches, pilasters, corbelled cornice, roof bulkheads, round chimney | matched |
| Tamsin's Pizza Yard | a well-known pizzeria and garden on Moore St | 3031010022, 3031010025 | eatery, `buildEatery` | none used | dark block building with a corrugated roof, boarded yard fence, picnic tables, string lights, container shed | approximate (no open photo found) |
| Marigold Court North / South | Lindsay Park co-op towers (1965, 21 floors) | 3030770001, 3030780001 | housing `plan: tower` | none used | tall tan-brick tower on a lawn | approximate |
| Brightwater Houses | Bushwick-Hylan Houses, Hylan building (19 floors, 1960) | block 68 (lot 3030980001 not placed) | housing `plan: courts` | Commons HylanHousesBushwickBK (public domain) | dark tan brick slab on green block | approximate (the real slab is cross-shaped) |
| Gablewood Row | Willoughby-Suydam Historic District, brick tenements 1902-04 | 3032110042 to 3032110037 (six) | rowhouses `tenement`, `buildRowhouses` | Commons RIDGEWOOD-GLENDALE-FRESH POND 008 (CC BY-SA 3.0) | three storeys, narrow round-arched windows under dark hoods, deep dark bracketed cornice, low stoop | matched (rhythm and colours) |
| Dogwood Row | a brownstone row on a block of Stuyvesant Ave (the block used for a well-known 1989 film is believed to be Stuyvesant Ave between Quincy St and Lexington Ave: not verified from a fetched page) | 3016260008 to 3016260003 (six) | rowhouses `brownstone` | none used | raised basement, high stoops with railings, stone-headed windows, bracketed cornice, projecting bays | approximate (set piece from the data's two floors and 5 m lots) |
| Paintbox Row | the mural-covered warehouse walls of Troutman St, Bushwick | 3031770045, 3031770035, 3031770030 | mural, `buildMuralWalls` | none; artwork is original | long warehouse wall in four painted panels (sunrise with rainbow, great bird, night skyline, waves), a side panel, gate, benches | approximate in place, original in art |
| Ashgrove Medical Center | Wyckoff Heights Medical Center, 374 Stockholm St | 3032600001 | hospital `style: corner`, `buildClinicCorner` | Commons "Wyckoff Heights Medical Center" (CC BY-SA 3.0) | orange-tan brick podium with ribbon windows, curved glass-block bay over a round-columned door, grey set-back block, slender tower with three window slots | matched (massing and colour) |
| Fenwick Post Office | US Post Office, Metropolitan Station, 47 Debevoise St, 1936 | 3031200016 | library `style: post`, `buildPostOffice` | Commons Brooklyn-9-27-2013 038 (CC BY-SA 3.0) | red brick, tall arched ground-floor windows, plain sashes above, limestone belt course and cornice, roll-up door under a canopy, iron fence | matched |
| Cedarvane Church | Christ Evangelical English Lutheran (now Rugged Cross Baptist), 1084 Lafayette Ave, 1898 | 3016120035 | church `plan: romanesque`, `buildRomanesqueChurch` | Commons Rugged Cross BC Lafayette jeh (CC0) | cream brick, tall tower at the left with steep red pyramid roof, triple-arched porch, big round-headed window with stone surround, round turret at the right | matched (layout seen from the street) |
| Redmoor Armory | 13th Regiment Armory, 357 Marcus Garvey Blvd, 1892-94 | 3016490001 | armory (existing builder) | Commons 13th Regiment Armory, August 2025 (CC0) | two big towers with battlements around a tall arched gate, red brick | approximate (octagonal towers, no machicolations) |

Matched to a photo: 7 (Wrenfield church, Alder theatre, Hobart brewery, Ashgrove medical centre, Fenwick post office, Cedarvane church, Gablewood row). Approximate: the other 6 places.

## What is missing, and why (asked for but not built)

- Fifteen: 13 built. Out of the OLD map outline (MAP4 is growing it; I did not depend on the new area): the Fulton St plaza and theatre, the grand high school with towers (Girls' High), Our Lady of Victory, the Alhambra apartments, the Stuyvesant Heights district. Not in the lot data: Moore Street Market (photo found, builder written and then unused: `buildMarket` stays in the code), the Most Holy Trinity twin-tower church. Burned down in June 2026 (Wikipedia): South Bushwick Reformed Church (dropped). The Bushwick Democratic Club House no longer stands (fire). The Myrtle-Broadway el junction station already has its platforms in `elStructureReal.ts`; not added.
- Hospital, bank with a clock: one hospital done; no bank found in the map with photo.
- Pool or recreation centre, firehouse or precinct of note, mansion row: none.

## Names

- Against the test list (`landmarks-names.test.ts`): 33 real names of this set added to the TEST list only; the test passes (generic words added: cross, theatre, north, south, post, office, pizza, yard, row, brewery, court).
- Web: exact-phrase searches could not be run with Firecrawl (credits out). The built-in web search was used for the names in OR-chains of exact phrases plus "Brooklyn": no result named any of them. That is weak evidence: the engine did not honour the chains well. Do a one-by-one check before release.

## Costs (stub library, per place, near build; draws are per place)

Phone / low triangles and draws: Wrenfield 1.4k/1.6k, 13 draws; Alder 0.4k/0.6k, 9; Hobart 1.0k/3.2k, 8-9; Tamsin's 0.8k/1.0k, 9; Marigold 2.1k each, 11-12; Brightwater 4.4k/7.3k, 12-13; Gablewood 0.8k/2.7k, 9-11; Dogwood 0.7k/1.4k, 8-11; Paintbox 0.6k/1.2k, 7-9; Ashgrove 0.4k, 9; Fenwick 0.2k/0.4k, 9-10; Cedarvane 0.8k/1.3k, 13; Redmoor 0.8k/0.9k, 8. In the browser harness whole frames with one landmark in view were 150k to 440k triangles and 100 to 560 draws (low, software, counts only; the theatre street frame at 499 calls is mostly the el and shops). Each place far away is one silhouette draw. Nothing is built beyond range. Low is at its limit in busy streets: a landmark adds 8 to 13 draws while near. No new texture: phone texture memory is unchanged (the only canvases are the small sign boards, emptied after upload).
- Download: the lazy landmarks chunk grew from about 70 kB to 118 kB raw. The single-file build does not include it.

## For `src/main.ts`

Nothing needed: the layer, blips (labels only when zoomed in) and the HUD place label come through the existing hooks.
