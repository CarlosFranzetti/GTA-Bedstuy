# LANDMARKS3: Bed-Stuy places on the grown map, and repairs

Lane: LANDMARKS3, 21 Nov 2026 (night). Notes file for the studio: it names the real places on purpose; the game shows invented names only. Real names live here and in the TEST list of `tests/unit/world/landmarks-names.test.ts`.
Scratch: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/landmarks3/ (ref photos, shots, pairs).

STATUS: built and checked on 21 Nov night: 4 new places and 3 repairs (not eight places: see "Not built"). Name recheck done by web search (see Names). Nothing committed. Tests: `npx vitest run tests/unit/world/landmarks --maxWorkers=1` 225 green; tsc clean in landmark files.

## Repairs (done, seen in the standalone harness)
- Cedarvane Church: tall tower with a taller red pyramid roof at the left, big ROUND window with tracery in the gable, two narrow arched windows under it, brown quoins up the corner, round turret moved to the front at the right (its body was buried in the nave), warmer stone.
- Gablewood Row: the end house is painted pale (`look.pale`, `look.paleAt`: tone.ts bakes the painted-brick layer in its own colour) with dark string courses and dark hoods; the neighbours stay brick.
- Wrenfield Church: buff brick wings added outside the two towers (low, white quoin courses, arched windows), so the white terracotta centre reads between buff wings as in the photo.

## New places (all inside R4; lots from the placed R4 lot data)
| Invented name | Real identity (notes only) | Lots | Builder | Photo looked at (licence) | Features built | Status |
|---|---|---|---|---|---|---|
| Thornbury Academy | Girls' High School, Nostrand Ave, 1885-86, Victorian Gothic | 3018440001 | `buildGothicSchool` (school `plan: gothic`) | Commons Girls_HS_Nostrand_Av_jeh (CC0) | red brick on a brownstone base, central pavilion with columned portico and balcony, tall tower with belfry lantern and slate spire, slate mansard, end pavilions, arch-headed ground windows, stone hoods, iron fence | approximate (massing, tower, portico, colour match; lantern is small, no dormer detail on the wings) |
| The Tamarind Flats | Alhambra Apartments, Nostrand Ave, 1889-90, Moorish Revival | 3018430020 | `buildMoorish` (housing `plan: moorish`) | Commons Alhambra_Apts_Nostrand_Av_jeh (CC0) | tan brick, terracotta pilasters and spandrels, projecting corner bay under a pyramid roof, red tile mansard with dormers, chimneys, top-floor arcade, ground shop arcade with green canopy and a parody-named shop sign | matched (rhythm, colours, roofline); ornament simplified |
| Marrowgate Church | Our Lady of Victory, Throop Ave, 1890s, Gothic Revival | 3018530001 | `buildGothicGable` (church `plan: gothicgable`) | Commons Victory_RCC_Throop_Av_jeh (CC0) | dark stone, street gable with big round window and tracery, lancet groups, pointed porch with dark red door, pale buttresses, steep slate roof, green copper edge, iron fence | approximate (the photo shows no tower, so none is built; the real nave runs the other way on this lot) |
| Juniper Row | Stuyvesant Heights Historic District, Macon St between Lewis and Stuyvesant Aves (lots of 1890-96) | 3016650083 to 3016650072 (12) | `buildRowhouses` brownstone, new `look.arched` | Commons Decatur_Stuyvesant_Heights_HD_1 (CC BY-SA 3.0, Smallbones; a Decatur St row of the same district) | orange-tan brick, high stoops, projecting bays, bracketed cornice, round-headed top windows | approximate (windows are simplified; the real fronts are richer) |

## Not built, and why
- Fulton St plaza and its theatre (Restoration Plaza, Fulton at Brooklyn / New York Aves): by its coordinates it lies at about (-190, 1300), south of the R4 lot coverage (lots end near z = 1240 there). OUTSIDE the map.
- Interfaith Medical Center (Atlantic Ave): outside, further south.
- Elevated junction and Fulton St subway entrances: the Fulton St line enters the map only near Nostrand Ave; no entrance positions were available (the entrance list was not re-fetched); not built. Broadway Junction is outside.
- Concord Baptist (lot 3018240001, 1953, 63 x 30 m, matches by class and size), Tompkins Ave Congregational (lot 3018540025, 1889), Macon Library (3016650001, Carnegie 1907), Renaissance Apartments (3018370053, 1892, 6 floors): sites found in the lot data, but no open-licence photo could be fetched (the Commons API rate-limited this box all night), and without a photo I did not build a guess. These four are the first to add next.
- Weeksville mansion and park, a pool or rec centre, a famous corner shop front as its own site: not found inside the map or no photo. The Tamarind's ground floor carries one parody shop (Pennywhistle Corner Market).

## Names (web recheck, 21 Nov night)
Exact-phrase searches with "Brooklyn" or "New York" (built-in web search; Firecrawl credits were out). Checked, no real place of that name found: Thornbury Academy, The Tamarind Flats, Marrowgate Church, Juniper Row, Wrenfield Church, Alder Theatre, Hobart Brewhouse, Tamsin's Pizza, Marigold Court, Paintbox Row, Dogwood Row, Larkspur Houses, Whitcomb Houses, Caldwell Towers, Ashgrove Medical Center, Thistledown Park, Calle Verde Park, Merrow Pool, Ridgeway Sanitation Garage, Fiddlehead Garden, Ironside Station House, Penhallow High School, Wexcombe Medical Center, Tillery Branch Library, Bellweather Methodist Church, St. Osric's Church, Redmoor Armory, Cedarvane Church. Notes: a "Fenwick Post Office" exists in West Virginia, none in New York (kept); "Alder" is not a theatre in Brooklyn (kept). REPLACED: "Brightwater Houses" (Brightwater is a real street and building name in Brighton Beach) is now "Quillfeather Houses" (not re-searched). NOT searched (not enough search budget): Gablewood Row, Bramwell Playground, Sparrowhawk Elementary School, Linnet Hill Elementary School, Harrowgate Armory, Engine 901 Firehouse, Pennywhistle Corner Market. All names also pass `landmarks-names.test.ts` (real names of this set added there). The engine is weak on exact phrases: treat "not found" as weak evidence.

## Costs (stub library, near build; draws per place)
Thornbury 8.8k triangles, 14 draws; Tamarind 9.0k, 12 draws; Marrowgate 1.4k, 13 draws; Juniper Row 5.6k, 11 draws (phone has fewer). Cedarvane 2.6k, 13 draws (unchanged); Wrenfield 2.2k (was 2.0k), 13 draws; Gablewood 22k. No new texture: phone texture memory unchanged. Landmarks chunk growth not measured in a build (buildCivic3.ts is about 17 kB source). Harness frames: Thornbury street view 125k triangles / 100 calls, Tamarind 60k / 105 (low tier, software, counts only).

## For src/main.ts
Nothing: the layer, blips and HUD label come through the existing hooks.

## Not verified
Not seen in the running game (only the standalone harness, `scripts/landmarks-shots.mjs`); frames in `scratchpad/landmarks3/shots/`; pairs in `scratchpad/landmarks3/pairs/`. Phone memory and the single-file build not re-measured.
