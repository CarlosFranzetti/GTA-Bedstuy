# LANDMARKS: real places under invented names on the real map

Lane: Odalys Penrose (LANDMARKS), 21 Nov 2026. Code: `src/world/landmarks/` (new). Tests: `tests/unit/world/landmarks.test.ts`, `tests/unit/world/landmarks-names.test.ts`. Harnesses: `scripts/landmarks-shots.{html,mjs}` (real-map world, one landmark at a time), `scripts/landmarks-game.mjs` (the running hosted game).

This file is a note for the studio. It names the real places on purpose (that is what "real identity" means here). The game never shows those names: signs, the map and the HUD carry the invented names only. The list of real names the invented ones are checked against is in `tests/unit/world/landmarks-names.test.ts` and nowhere else.

## What was built

Twenty rows in `src/world/landmarks/landmarks.ts` (19 places, the 20th row holds 11 subway stairs). Every place is generated in code from its footprint, height and kind, through the shared material library (`materials.get(...)`, so the textures lane's wall work shows on them), with the wall colour baked through the public colourway functions (`tone.ts`). Nothing in `src/textures/**` or `src/world/buildings/**` was edited.

- Builders (`buildPark.ts`, `buildHousing.ts`, `buildCivic.ts`, `buildStreet.ts`, generator functions that yield between pieces) cover: park (lawn, paths, plaza with a fountain or a bandshell, courts with painted lines and hoops, playground, recreation building, ball field, trees, benches, lamps, fence with gates and name boards), pool (basin, lane lines, brick bathhouse), playground (courts, handball wall), community garden (raised beds, shed, mural wall), housing superblock (brick slabs, 6 to 15 floors, lawns, paths, a playground and a court), church (nave, cross roof, rose window, square tower with spire or octagonal tower), armoury (crenellated towers, gate tower with a big arch, drill hall), school (U plan with portico and round tower; post-war slab with ribbon windows and a yard), hospital (tower slab, podium, car park, canopy), library (raised base, portico, tall arched windows, hip roof), station house (round tower, arched entry, blue lamps), firehouse (arched red bay), sanitation depot (bay doors, trucks), subway stairs (railed stairwell, globe lamps, station board).
- The layer (`layer.ts`) builds a site only when the player comes near, as a few milliseconds of generator work per frame, and drops it again when the player leaves. Far away a site is ONE vertex-coloured silhouette draw. Nothing at all is held beyond the far range, so the phone and low budgets do not move when no landmark is in range.
- Hook-up (no `src/main.ts` change needed): `buildRealWorld` creates the layer, skips the generic building on the owned lots (BBL table), adds `rw.landmarks`, calls `landmarks.update` in `rw.update`. `gameReal.ts` adds the landmark blips to `mapPlaces` and makes `streetName` return the invented name on or just outside a site (the HUD place label shows it, so "you are at <name>" appears the same way a street name does). Colliders (buildings, fences, trees, rails) go through the same host as the generic buildings.

## The places

Coordinates are game metres (x east, z south, origin Throop Ave x Kosciuszko St). "Real identity" is from the Parks Properties and Facilities Database open data (and the Wikipedia pages named in Sources) matched by address and size; where the match is by position and size only, it says so. Heights are the Building Footprints roof heights in feet converted to metres.

| Invented name | Kind | Real identity (notes only) | Where (site, lots) | What was built | Sources |
|---|---|---|---|---|---|
| Thistledown Park | park | the large park between Lafayette, Marcy, Greene and Tompkins avenues (7.8 acres) | block 433, centre (-362, 165), 225 x 147 m, no lots (empty block) | lawn, 8 gates, iron fence, cross and diagonal paths, bandshell plaza, recreation building, 2 courts, playground, about 90 trees | Parks Properties; PLUTO; Wikipedia (extent) |
| Calle Verde Park | park | the square park between Knickerbocker, Irving, Starr and Suydam (6.87 acres) | block 131, centre (1760, -1033), no lots | lawn, fountain plaza, loop path, ball field, court, playground, trees | Parks Properties; PLUTO; Wikipedia (extent) |
| Merrow Pool | pool | the public outdoor pool on Marcy Ave between Kosciuszko and Dekalb | lot 3017790027, (-572, -38), 112 x 40 m | brick bathhouse with a stone entrance pavilion, 8-lane basin, deck, fence | Parks Properties; PLUTO; Footprints |
| Bramwell Playground | playground | the Monroe to Madison playground between Patchen and Ralph (2.29 acres) | lot 3016430013, (1351, 619), 144 x 48 m | 2 basketball courts, 3 handball courts and wall, playground, fence | Parks Properties; PLUTO |
| Larkspur Houses | housing | the Marcy public housing superblock (27 six-storey buildings on 28.5 acres; the footprints show 11 buildings of 56 to 70 ft on this lot) | block 235, (-623, -640), 259 x 225 m; lot 3017380150 (its playground lot) | 11 brick slabs of 6 floors in lawns, paths, a court, a playground, trees | PLUTO; Footprints; Wikipedia |
| Whitcomb Houses | housing | the Sumner public housing superblock (13 buildings, 7 and 12 storeys; footprints 70 to 160 ft) | block 237, (-120, -618), 225 x 221 m | 8 tan-brick slabs (3 of 14 floors, 5 of 7) around lawns, play area, trees | PLUTO; Footprints; Wikipedia |
| Caldwell Towers | housing | a slab of the Roosevelt housing complex (15 floors, 1951, roof 134 ft) | lot 3015950024, (672, -207), 61 x 28 m | one 15-floor brick slab (41 m) on a lawn | PLUTO; Footprints |
| St. Osric's Church | church | St. George's Episcopal church, 800 Marcy Ave (1887, red brick with stone trim, cruciform; city landmark 1983) | lot 3018130041, (-514, 525), 44 x 30 m | red brick nave with a cross roof, pointed window, rose window, square tower with spire, steps, railings | PLUTO; Footprints; Wikipedia |
| Bellweather Methodist Church | church | the Methodist church at 1139 Bushwick Ave (1900, large octagonal corner tower from a 1901 addition; sources disagree on its style, so only the massing is used) | lot 3033670004, (2035, 520), 47 x 30 m | tan brick nave, big octagonal tower with a low cone | PLUTO; Footprints; Bushwiki page |
| Harrowgate Armory | armoury | the regimental armoury at 355 Marcy Ave (1883-84; roof 93 ft) | block 35, (-626, -1431), 191 x 64 m; lot 3022330001 | crenellated headhouse, four towers, gate tower with an 8 m arch, a 160 m drill hall | PLUTO; Footprints; Wikipedia list of armouries |
| Penhallow High School | school | the old Boys High School on Madison St (1891, Romanesque Revival, round corner tower; city landmark) | lot 3018230038, (-551, 702), 120 x 36 m | 4-floor U plan, string courses, stone portico, round tower with cone, yard | PLUTO; Footprints; Wikipedia |
| Sparrowhawk Elementary School | school | a public elementary school on Kosciuszko St (1959, 4 floors; match by class and size only) | lot 3017870014, (150, 44), 148 x 32 m | post-war brick slab, ribbon windows, canopy, rear wing, fenced yard | PLUTO; Footprints |
| Linnet Hill Elementary School | school | the public school at 280 Hart St (1950, 3 floors; Facilities Database) | lot 3017730014, (148, -205), 178 x 28 m | same family as above, 3 floors | PLUTO; Footprints; Facilities DB |
| Wexcombe Medical Center | hospital | the public hospital campus at 760 Broadway (1972; tower roof 246 ft, 9 floors in PLUTO) | block 182, (134, -866), 240 x 225 m, no lots placed there | 75 m tower slab, 3-floor podium, low wings, car park, canopy, name and emergency signs | PLUTO; Footprints; Facilities DB |
| Tillery Branch Library | library | the Carnegie branch library at 790 Bushwick Ave (1905, roof 47 ft) | lot 3032410018, (1244, -170), 44 x 23 m | stone base and steps, four-column portico with pediment, tall arched windows, hip roof | PLUTO; Footprints; Facilities DB |
| Ironside Station House | station house | the old police station house and stable at 179 Wilson Ave (1894, Romanesque Revival; city landmark 1977) | lot 3032460005, (1738, -642), 24 x 28 m | 3-floor brick house, arched entry, round tower, blue lamps | PLUTO; Footprints; Wikipedia |
| Engine 901 Firehouse | firehouse | the firehouse at 206 Monroe St (1910, 3 floors, roof 44 ft) | lot 3018170048, (-808, 604), 8 x 30 m | narrow brick firehouse, red arched bay, two arched windows | PLUTO; Footprints; Facilities DB |
| Ridgeway Sanitation Garage | depot | the sanitation garage at 60 Nostrand Ave (rebuilt 2021, 50 ft) | lot 3017180001, (-805, -835), 61 x 28 m | brick garage with six bay doors, three trucks in the yard | PLUTO; Footprints |
| Fiddlehead Garden | garden | a community garden lot on Marcy Ave (class QG, 14,000 sq ft) | lot 3017890047, (-492, 117), 48 x 14 m | raised beds, shed, painted mural wall, trees | PLUTO; Facilities DB (gardens) |
| Subway entrances (Cormorant Square, Ferrier Cross, Tern Yard, Bellrope) | street stairs | 11 stair entrances of the two underground lines on the west and east edges | positions from the MTA entrance list, put on the pavement beside the nearest street | railed stairwell, steps, two globe lamps, a board with the invented station name | MTA Subway Entrances and Exits (positions only) |

Places from the brief that are NOT in the table, and why: the wide tree-lined parkway (none inside the map: it lies south of it), a park with an old mansion (none found in the open data inside the map), a famous-style mural corner and a brownstone row (the generic buildings already are brownstone rows; a landmark would need per-facade data), a bus depot (no bus depot inside the map: the transit yards in the Facilities Database are substations), a plaza (the plazas in the data are triangles of road, not lots), and the elevated stations (they already exist in `elStructureReal.ts`).

## How the names were checked

- Against open data: every park, playground, garden, library, fire, school, hospital, plaza, historic-site and cultural name in the Parks Properties and Facilities Database inside the map (687 names, plus the well-known places and housing developments of the neighbourhood typed in by hand) is in the test `landmarks-names.test.ts`. The test fails if an invented name equals or contains a real one, or if a distinctive word of it (generic words like park, school, hill are ignored) appears in any real name. `landmarks.test.ts` also fails if a distinctive word of an invented name is a street name of the map.
- On the web: exact-phrase searches (Firecrawl) for each name plus Brooklyn. Three names were dropped for real hits elsewhere (a park of that name in Florida, a medical centre of that name in Chicago, an online high school) or for being a real family name tied to the National Guard; the replacements returned no results. This is weaker evidence than the open-data check: an empty search does not prove a name is free.
- The NYCHA development list could not be fetched (the open-data service answered "unavailable"); the housing names are checked only against the hand-typed list and the web.

## Costs (triangles and draw calls)

Measured with the stub material library in vitest (`tests/unit/world/landmarks.test.ts` keeps them inside budgets) and in the browser (`renderer.info`, counts only; no frame rates are reported from this box, which renders in software).

- Near build, low tier: 150 triangles (firehouse) to 16,900 (the housing superblocks and the big park); 7 to 15 draws per site. Phone tier: 150 to 11,300 triangles, 7 to 15 draws (fewer trees, plain window frames). Medium: up to 27,000 for the housing superblocks.
- Far: one draw per site, 40 to 1,300 triangles.
- Away: nothing is built or held beyond the far range (150 m phone, 400 m low), so a frame with no landmark in range is unchanged. With the phone's near range of 90 m a player stands inside at most two sites at once.
- Colliders: 635 in total when everything is built (fence segments, tree circles, building boxes, rails); a site adds its own when built and removes them when dropped.
- Download: the landmarks are one lazy chunk (`layer-*.js`, 70 kB raw, 24 kB gzip) fetched only with `?map=real`; the single-file build does not include it. No new image or data file.

## Frames

In-game frames (hosted build, `?map=real&q=low`, canvas hidden, loop stopped, free camera) are in `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/landmarks/game1/` (street and aerial per landmark, plus `map.png`). Standalone review frames (the same world without the game, tier low) are in `.../landmarks/shots3/`.

## Not done

- The default grid map has no landmarks (item 5 of the brief): its parks, churches and schools are the stylised grid's own; the landmark layer is only attached to the real map.
- The hill and pool of the big west park are not modelled (the physics is flat 2D); the pool is the separate pool site.
- Facades are the family of their kind, not a likeness. No photograph was used, so no window count, ornament or colour is a copy of a real building. Brick colours are picked per site (`look.wall`).
- Interiors: none (doors are painted, not openable).
- Phone: not tried on a real iPhone. The phone tier builds fewer trees and plain windows and uses the 90 m near range; memory was not measured.
- The layer starts building when a site is within its near range; a very fast car can arrive before it is complete (the building shows as the far silhouette until then).
- Colours of lettering on signs come from the shared sign painter (`materials.sign`), not from Anton or Barlow Condensed directly; if the studio wants those fonts on the boards the sign painter has to be asked for them.
