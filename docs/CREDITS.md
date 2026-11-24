# Credits

Status: current (checked 21 Nov 2026). Completeness was checked on 21 Nov against every third-party source in the repository (`src/assets`, `public`, `tests/fixtures`, `package.json`, the data-import scripts under `scripts/`) and every dataset the real map uses; the entries added that day are marked "added 21 Nov".

## Studio

**Created and directed by Carlos Franzetti**, the owner and the only human on the project.
Studio lead: **Fable Hart**.

Fable Hart and the studio team are AI agents working under Carlos Franzetti's direction.

Directors: **Imani Adeyemi** (Streetscape: world), **Tomas Inkwell** (Inkwell: art), **Nia** (Airwaves: sound), **Greta Voss** (Foundry: engine).
The same list is rolled in the game (Credits on the title screen and in Settings > Game); the data is `src/ui/creditsData.ts`.

| Team | People |
|---|---|
| Streetscape (map, streets, buildings, environment) | Rafael Stoop, Chidi Okafor, Gus Calloway, Noor, Bea |
| Inkwell (characters, cars, interface, controls) | Leila Seamstress, Priya Ink, Kenji Okafor-Lyle, Dmitri Volkov, Sam, Zadie Okafor, Ines, Rocco |
| Airwaves (radio, voices, effects, music) | Jules Okonkwo-Reyes, Andre, Mei Vance, Cal, Otis "Crate" Digger |
| Foundry (stability, performance, platforms, QA) | Omar Quill, Lena "Hashmark", Hana, Viktor, Ash, Theo Greenwave, June Crosswalk, Wren |

A fan tribute, not affiliated with Rockstar Games or Take-Two. Third-party sources are listed below.

## Fonts (UI14)

Hosted and native builds load subset woff2 files from `public/fonts/` (Latin only). All three families are
**SIL Open Font License 1.1**; licence texts are in the same folder. The single-file artifact does not embed them.

| Family | Use | Source | Licence text |
|---|---|---|---|
| Anton (Anton Project Authors) | display: banners, logo-level text | https://fonts.google.com/specimen/Anton | `public/fonts/OFL-Anton.txt` |
| Barlow Condensed (Jeremy Tribby / Barlow Project Authors) | HUD labels and numbers | https://fonts.google.com/specimen/Barlow+Condensed | `public/fonts/OFL-Barlow.txt` |
| Barlow (Jeremy Tribby / Barlow Project Authors) | body text, prompts | https://fonts.google.com/specimen/Barlow | `public/fonts/OFL-Barlow.txt` |

## Textures

The photo-based PBR texture sets in `src/assets/textures/` are derived from
[ambientCG](https://ambientcg.com) assets, released under
**CC0 1.0 Universal (public domain)**: no attribution is required, but credit is given anyway.

| ambientCG asset | derived files in this repo |
|---|---|
| Bricks097 | brick_red, brick_brown, brick_white, brick_grey |
| Concrete042A | concrete, sidewalk, brownstone, limestone |
| Asphalt026C | asphalt, asphalt_worn, roof |
| Ground111 | dirt |
| Bricks105 | brick_tan |
| Wood027 (via the CC0 `aframe-enviropacks` npm package) | cedar (water tanks) |

The 1K JPG sets were obtained from public mirrors (the `ubyjvovk/asciicity` and
`amazingsammed/mini_textures` repositories, which vendored them with the same CC0 notice) because this build
environment cannot reach ambientcg.com directly. Derived variants (painted
brick, brownstone and limestone courses, worn asphalt, sidewalk slabs, tar roof)
were generated with the script in `scripts/derive-textures.py`. Normal and roughness maps
shared between variants are stored once (`brick_normal`, `brick_rough`, `brick_painted_rough`).

### CC0 PBR sets (src/assets/textures/cc0/)

Fetched by `scripts/fetch-cc0-textures.mjs` (re-runnable). Each set folder has a `LICENSE.txt` with the source URL,
author and licence. All are **CC0 1.0 Universal**. 1K JPEG albedo / OpenGL normal / roughness, plus 512 px re-encodes
(`*_512.jpg`). In use: the material library (`src/textures/cc0.ts`, `packs.ts`), the clothing tiles of the people textures (`src/entities/models/pedBodyHi.ts`) and the detail atlas (`src/textures/detailAtlas.ts`, built by `scripts/fetch-detail-atlas.mjs`).

| set | source asset | author | source URL |
|---|---|---|---|
| brick_red_common | Poly Haven `red_brick_03` | Rob Tuytel | https://polyhaven.com/a/red_brick_03 |
| brick_brownstone | Poly Haven `concrete_brick_wall_001` | see LICENSE.txt | https://polyhaven.com/a/concrete_brick_wall_001 |
| brick_painted | Poly Haven `painted_brick` | see LICENSE.txt | https://polyhaven.com/a/painted_brick |
| asphalt | Poly Haven `asphalt_03` | see LICENSE.txt | https://polyhaven.com/a/asphalt_03 |
| concrete_sidewalk | Poly Haven `concrete_pavers_03` | see LICENSE.txt | https://polyhaven.com/a/concrete_pavers_03 |
| concrete_pavement | Poly Haven `concrete_pavement` | see LICENSE.txt | https://polyhaven.com/a/concrete_pavement |
| bluestone_slate | Poly Haven `castle_wall_slates` | see LICENSE.txt | https://polyhaven.com/a/castle_wall_slates |
| corrugated_metal | Poly Haven `corrugated_iron_02` | see LICENSE.txt | https://polyhaven.com/a/corrugated_iron_02 |
| painted_metal | Poly Haven `rusty_painted_metal` | see LICENSE.txt | https://polyhaven.com/a/rusty_painted_metal |
| tar_roof | Poly Haven `bitumen` | see LICENSE.txt | https://polyhaven.com/a/bitumen |
| weathered_wood | Poly Haven `brown_planks_05` | see LICENSE.txt | https://polyhaven.com/a/brown_planks_05 |
| grime_wall | Poly Haven `concrete_wall_006` | see LICENSE.txt | https://polyhaven.com/a/concrete_wall_006 |
| denim | Poly Haven `denim_fabric` | see LICENSE.txt | https://polyhaven.com/a/denim_fabric |
| cotton_knit | Poly Haven `cotton_jersey` | see LICENSE.txt | https://polyhaven.com/a/cotton_jersey |
| leather | Poly Haven `brown_leather` | see LICENSE.txt | https://polyhaven.com/a/brown_leather |
| nylon_puffer | Poly Haven `bi_stretch` (stretch fabric; closest found) | see LICENSE.txt | https://polyhaven.com/a/bi_stretch |
| car_paint_flake | ambientCG `Metal027` (powder-coat metal; closest found) | ambientCG.com | https://ambientcg.com/view?id=Metal027 |
| tyre_rubber | ambientCG `Rubber001` | ambientCG.com | https://ambientcg.com/view?id=Rubber001 |
| brushed_chrome | ambientCG `Metal009` (brushed steel; proxy) | ambientCG.com | https://ambientcg.com/view?id=Metal009 |
| detail_stucco | ambientCG `Plaster007` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=Plaster007 |
| detail_tile | ambientCG `Tiles107` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=Tiles107 |
| detail_cobble | ambientCG `PavingStones046` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=PavingStones046 |
| detail_caststone | ambientCG `Concrete034` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=Concrete034 |

Everything else in the game (geometry, signage, awnings, audio) is procedural and
original to this project.

## Models

glTF car and character files in `src/assets/models/` (MDL found them, MDLI integrated them, Stage 3). Licence status is stated
per pack; "secondary" means the licence text was taken from a repackager's NOTICE rather than the author's own page, which this
build environment cannot reach. The files are copies of the pack files: no geometry or texture was edited (the character files had
their animation clips renamed to `Idle` / `Walk` / `Run`). The game only changes how they are drawn (fitted to the vehicle
dimensions, recoloured, lights and plates added at load time).

- **Kenney Car Kit** (`vehicle-sedan.glb` = sedan, `vehicle-suv.glb` = SUV, `vehicle-cop.glb` = police car, `vehicle-boxtruck.glb` =
  the delivery van, standing in for the box truck). Author: Kenney (https://kenney.nl/assets/car-kit). Licence: **CC0 1.0 Universal**
  (secondary; the repackager NOTICE says each archive's License.txt reads CC0). Obtained via `@netforge/asset-library-files@0.2.0`
  (npm; MIT wrapper, art CC0 per its NOTICE).
- **Quaternius characters** (`character.glb` = the player and one of the six pedestrian models; the hooded adventurer `character-hoodie.glb` was removed, nothing used it).
  Author: Quaternius (https://quaternius.com). Licence: **CC0 1.0 Universal**. The Quaternius Ultimate Animated Character Pack
  LICENSE.txt (CC0 1.0) is verified; the exact pack of the two characters is secondary (repackager NOTICE). Obtained via
  `@netforge/asset-library-files@0.2.0`.
- Not included: `truck-box` from `munim-maps-vehicles@0.5.0` (Apache-2.0), held until its wheels are split into nodes.

### Quaternius Ultimate Animated Character Pack (five civilians, MDL2 research, MDLI2 integration)

- **Quaternius Ultimate Animated Character Pack**: `character-casual-male.glb`, `character-casual-female.glb`, `character-suit-male.glb`,
  `character-suit-female.glb`, `character-worker.glb` (pedestrians pick one of these or `character.glb`, deterministically per ped).
  Author: Quaternius (https://quaternius.com, https://www.patreon.com/quaternius). Licence: **CC0 1.0 Universal**, verified from
  the pack's own `LICENSE.txt` (https://raw.githubusercontent.com/wellmota/tutory-personagens/main/quaternius-uac/LICENSE.txt,
  sha256 83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c). Obtained via the public GitHub repository
  `wellmota/tutory-personagens` (branch `main`, commit 318fec6), folder `quaternius-uac/`.
- **Modified**: these five files are compressed derivatives, made with `scripts/compress-models.mjs` (glTF-Transform): every animation
  clip except `Idle`, `Walk` and `Run` is dropped, vertex data is quantized and meshopt-compressed (EXT_meshopt_compression). Geometry
  shape and rig are unchanged; the near-black `Skin` colour of the pack is replaced by a natural skin tone per person. About 1.2 MB each became about 0.3 MB each. The raw sha256 values are in the MDL2 notes.

## Records at WAX DELI: real recordings under parody sleeves (RECORDS 21 Nov 2026, reworked by RECORDS2 the same day; hosted build only)

Two crates of real recordings, clipped, re-encoded and served from `public/records/` (loaded only when a record is previewed or put on a deck; 28 clips, about 12 MB). The sleeve (artist, title, label, catalogue number) is an invention of this project; the real credit is in the liner note in the shop and on the decks and in the tables below. Sleeve art is painted in code (`src/ui/sleeve.ts`, Anton and Barlow Condensed only); no real cover, label or logo is copied. Built by `scripts/records/crate.py`; evidence for every track: `docs/swarm/tasks/RECORDS2.md`.

**Withdrawn on the owner's request on 21 Nov 2026:** 18 of the original 28 public-domain 78s (1909 to 1925: ragtime, blues, gospel, island strings, the Rhapsody in Blue and Fats Waller sides) and the synthesised jazz, dub and trap loops. Old saves holding them get the price paid back in cash.

### Dance crate (18 clips, 2005 to 2018): CC BY and CC BY-SA, 60 s stereo clips, 56 kbit/s MP3

Rules: only CC0, CC BY or CC BY-SA (any version), never NC or ND. "Tier A": a second statement (the release notes or the audio file's own tag) agrees with the item's licence field. "Tier B": the item's licence field, set by the label's own upload to the Internet Archive, is the only statement reachable from the build box (the label sites do not answer). Changes made to every clip: clipped to 60 seconds, faded in and out, re-encoded. Every CC BY-SA clip is itself shared under the same licence. Years are the ones the source shows; none is relabelled. No 1980s or 1990s track could be cleared (see the task file).

| Sleeve (invented) | Really (performer, title, label, year) | Source | Licence | Check |
|---|---|---|---|---|
| Stoop Surgeon: Bodega Python (Basement Mix) (Throop Basement Sound TBS 017) | Beat Doctor: Anaconda (original mix); Toucan Music (tou269, "Anaconda E.P."). 2010 | https://archive.org/details/tou269 | CC BY 3.0 | A |
| Scratch Card Syndicate: Lotto Fever (Dub Cut) (Throop Basement Sound TBS 018) | Beat Doctor: Itchy And Scratchy; Toucan Music (tou269, "Anaconda E.P."). 2010 | https://archive.org/details/tou269 | CC BY 3.0 | A |
| Antenna Mary: Rooftop Aerial (Antenna Mix) (Halsey Heights Recordings HHR 04) | Marc Burt & Beat Doctor: Aerial Photograph (Marc Burt mix); Toucan Music (tou220). 2006 | https://archive.org/details/tou220 | CC BY-SA 2.5 | B |
| Penny Pickle & the Stoop Kids: H.O.M.E. (Hip House Mix) (Corner Store Discs CSD 301) | Pasquale: H.O.U.S.E; TekTek Music (tek07, "H.O.U.S.E EP"). 2006 | https://archive.org/details/tek07 | CC BY-SA 2.5 | B |
| Pennyroyal Pete: Sunday Rent Come Back (Corner Store Discs CSD 302) | Pasquale: Sunshine Come Back; TekTek Music (tek07, "H.O.U.S.E EP"). 2006 | https://archive.org/details/tek07 | CC BY-SA 2.5 | B |
| Lenox Lola: Who's At The Door (Corner Store Discs CSD 303) | Pasquale: I Like To Know; TekTek Music (tek07, "H.O.U.S.E EP"). 2006 | https://archive.org/details/tek07 | CC BY-SA 2.5 | B |
| Kings Highway Collective: Carnival Vibes on Utica (Utica Avenue Tech UAT 03) | Das Boogie: Caribbean Vibes; TekTek (tek03, "Caribbean Vibes EP"). 2005 | https://archive.org/details/tek03 | CC BY-SA 2.5 | B |
| Kings Highway Collective: Rum and Coke at the Corner (Utica Avenue Tech UAT 04) | Das Boogie: Cuba Libre; TekTek (tek03, "Caribbean Vibes EP"). 2005 | https://archive.org/details/tek03 | CC BY-SA 2.5 | B |
| Pigeon Control Unit: Flight Path (Rooftop Coop) (Dollar Van Dispatch Records DVD 10) | Battle Breaks: Line of Fly; Blue Oranges netlabel (bo010, "Line of Flight"). 2009 | https://archive.org/details/Bo010-BattleBreaks-LineOfFlight | CC BY-SA 3.0 | B |
| Pigeon Control Unit: Flight Path (Dub Techno) (Dollar Van Dispatch Records DVD 11) | Battle Breaks: Line of Flight; Blue Oranges netlabel (bo010, "Line of Flight"). 2009 | https://archive.org/details/Bo010-BattleBreaks-LineOfFlight | CC BY-SA 3.0 | B |
| The Blackout Brothers: Third Rail Breaks (Marcy Mixtapes MM 12) | Psychadelik Pedestrian: Power Line (original mix); Toucan Music (tou227). 2006 | https://archive.org/details/tou227 | CC BY 2.5 | B |
| Lemon Ice Lenny: Cry Over Cold Ice (Marcy Mixtapes MM 13) | Psychadelik Pedestrian: Cry Over You (original mix); Toucan Music (tou258). 2009 | https://archive.org/details/tou258 | CC BY 2.0 | B |
| Sodium Vapor Kid: Streetlight Plasma (Afterhours Cut-Outs AHC 05) | Redmann: Plasma (original mix); Toucan Music (tou252, "God In The Detail E.P."). 2008 | https://archive.org/details/tou252 | CC BY 3.0 | B |
| Fire Hydrant Orchestra: Hydrant Disco (Italo Mix) (Gowanus Gold Records GGR 11) | Aquatone: Magic AquaDisco; United Studios Cloud, USC-WR-1706.0364 ("Alpha Song"). 2018 | https://archive.org/details/aquatone-alpha-song | CC BY-SA 4.0 | A |
| Fire Hydrant Orchestra: Alternate Side Song (Gowanus Gold Records GGR 12) | Aquatone: Alpha Song; United Studios Cloud, USC-WR-1706.0364. 2018 | https://archive.org/details/aquatone-alpha-song | CC BY-SA 4.0 | A |
| Rosalind Rooftop: Run 4 Da Shade (Gold Stoop Boogie GSB 49) | Disco Romancin': Run 4 Da Sun; Get Some! Records / The Daft Club (TDCDV003, "Disco Romance"). 2011 | https://archive.org/details/TDCDV003 | CC BY-SA 3.0 | B |
| Rosalind Rooftop: Streetlampz (Gold Stoop Boogie GSB 50) | Disco Romancin': Starburstz; Get Some! Records / The Daft Club (TDCDV003, "Disco Romance"). 2011 | https://archive.org/details/TDCDV003 | CC BY-SA 3.0 | B |
| Mirrorball Marcy: Disco Downstairs (Gold Stoop Boogie GSB 43) | Disco Romancin': Disco Down; Get Some! Records / The Daft Club (TDC043, "DiscoTech D'Amour"). 2011 | https://archive.org/details/TDC043 | CC BY-SA 3.0 | B |

The attribution line the licence requires for each clip is printed in its liner note (`Credit:`) and is built from the table above (`src/game/danceRecords.ts`). Allowed licences for any later addition: public domain (with its basis written down), CC0, CC BY, CC BY-SA. Never NC or ND. A licence stated on a release page that contradicts the label's own site is left out (see RECORDS2.md: the Monofonicos netlabel).

### Listening post (stream only)

Four real Kompakt tracks (Kölsch "Liath" 2017, WhoMadeWho & Mano Le Tough "Oblivion" 2020, T.Raumschmiere "Wacker" 2017, Kollmorgen "Taciturn" 2022) are listed under parody sleeves, played ONLY through SoundCloud's official embedded player from the label's own verified account (https://soundcloud.com/kompakt, linked from https://kompakt.fm). Nothing is downloaded, cached, re-hosted or put on the decks. No licence from the rights holders is claimed: the stream is SoundCloud's, under SoundCloud's terms.

### Pre-war dance floor (10 clips, 80 s mono, 40 kbit/s): public domain in the United States

Every record is a US sound recording first published in 1925 or earlier. Under 17 U.S.C. 1401(a)(2) (Music Modernization Act, Title II; text checked at https://www.law.cornell.edu/uscode/text/17/1401 on 21 Nov 2026) the federal protection of a recording first published 1923 to 1946 ends 100 years after the year of first publication, so 1925 recordings left protection on 1 Jan 2026 and earlier ones before that; the compositions (US works published 1930 or earlier) are also free. This is a statement about United States law only, written without legal counsel; the first-publication year is the year the Internet Archive item shows (the owner of the page, not an authority). Modern transfers of a public-domain recording add no US copyright. A takedown request from any rights holder would be honoured by removing the file. Ten were kept: the dance-band, fox trot, Charleston, stomp and rag sides with the best-documented years; six have a steady measured beat.

| Sleeve (invented) | Really (performer, title, year) | Source item | Item licence field | Basis |
|---|---|---|---|---|
| The Brownstone Society Orchestra: Stoop Step Rag (Stuyvesant Talking Machine Co. STM 3511) | Europe's Society Orchestra (James Reese Europe): Castle House Rag (one-step), 1914 | https://archive.org/details/Europes_Society_Orch-Castle_Rag | No licence statement on the item page | PD-US: first published 1914; 17 U.S.C. 1401(a)(2) |
| The Original Pigeon Jass Band: Bodega Barnyard Blues (Fort Greene Phonograph Co. FGP 7001) | Original Dixieland Jass Band: Livery Stable Blues, 1917 | https://archive.org/details/OriginalDixielandJassBand | No licence statement on the item page | PD-US: first published 1917; 17 U.S.C. 1401(a)(2) |
| The Original Throop Six: Fire Escape Fox Trot (Halsey Hi-Fi HHF 4107) | Original Memphis Five (Hanley): Africa (fox trot), 1924 | https://archive.org/details/78_africa_original-memphis-five-hanley_gbia0101463a | No licence statement on the item page | PD-US: first published 1924; 17 U.S.C. 1401(a)(2) |
| The Street Cleaning Five: Alternate Side Blues (Nostrand Novelty NN 1450) | Original Memphis Five: Four O'Clock Blues, 1923 | https://archive.org/details/Original_Memphis_Five-Four_O_Clock_Blues | No licence statement on the item page | PD-US: first published 1923; 17 U.S.C. 1401(a)(2) |
| Gates Avenue Blue Five: Stoop Walking Babies (Gates Avenue Gramophone GAG 1425) | Clarence Williams' Blue Five: Cake Walking Babies from Home, 1925 | https://archive.org/details/ClarenceWilliamsBlueFive | No licence statement on the item page | PD-US: first published 1925; 17 U.S.C. 1401(a)(2) |
| King Throop's Dance Band: Nostrand Stomp (Shimmy One-Step) (Tompkins Tone TT 1300) | King Oliver's Jazz Band: New Orleans Stomp (Shimmy One Step), 1923 | https://archive.org/details/king-olivers-jazz-band-new-orleans-stomp-shimmy-one-step-columbia-13003-d-81304- | No licence statement on the item page | PD-US: first published 1923; 17 U.S.C. 1401(a)(2) |
| Halsey Street Dixie Steppers: Shake Your Stoop (Marcy Disc Co. MD 2310) | Fletcher Henderson: Shake Your Feet, 1923 | https://archive.org/details/FletcherHenderson | No licence statement on the item page | PD-US: first published 1923; 17 U.S.C. 1401(a)(2) |
| The Golden Stoop Orchestra: Charleston Place Fox Trot (Throop Records TR 2504) | Golden Gate Orchestra: Charleston (fox trot), 1925 | https://archive.org/details/charleston1925 | "Public Domain" CC licence field on the item | PD-US: first published 1925; 17 U.S.C. 1401(a)(2) |
| The Tompkins Ten: Waitin' on the Mail Truck (Lewis Lane Records LL 1923) | Tennessee Ten: Waitin' for the Evenin' Mail, 1923 | https://archive.org/details/Tennessee_Ten-Three_Jazz_Sides_From_1923 | No licence statement on the item page | PD-US: first published 1923; 17 U.S.C. 1401(a)(2) |
| The Throop Avenue Shiverers: Shimmy Like My Cousin Kate (Marcy Disc Co. MD 1925) | The Virginians: I Wish I Could Shimmy Like My Sister Kate, 1923 | https://archive.org/details/Virginians | No licence statement on the item page | PD-US: first published 1923; 17 U.S.C. 1401(a)(2) |

## Music (researched, not shipped)

No recorded music is bundled in the repo. Candidate source checked by MUSIC on 2026-11-03 (see docs/swarm/tasks/MUSIC.md):

- **Open Lo-Fi** (upstream `btahir/open-lofi`, mirror `MdShahnawazSheikh/thaxas-lofi`): tracks declared CC0-1.0 by the uploader in the upstream README and LICENSE. Tracks are AI-generated (Suno v5) per the upstream README; chain of title not independently verified. Ten samples were downloaded to the scratchpad only, not into the repo. Status: pending orchestrator approval.

## Map data (GEO2)

- Building data pipeline (`scripts/import-osm.mjs`, `docs/REAL-BLOCKS.md`): (c) OpenStreetMap contributors, Open Database License (ODbL) 1.0, https://www.openstreetmap.org/copyright. No OSM data is in `bedstuy.json` yet (the Overpass hosts were unreachable); the credit applies as soon as an import is written.
- NYC MapPLUTO, NYC Department of City Planning, via NYC Open Data, and NYC Building Footprints (DoITT/OTI), via NYC Open Data: the lots in `src/world/data/bedstuy.json` (width, storeys, class, year built, roof height) come from them via `scripts/fetch-pluto.mjs` and `scripts/import-pluto.mjs`; raw rows in `src/world/data/raw/`. Public data; credit kept.
- Venue positions for the grid map (added 21 Nov): NYC DOHMH Restaurant Inspection Results (`43nn-pn8j`) and NYC DCWP business licences (`w7w3-xahh`), both from NYC Open Data, joined to MapPLUTO by address or BBL. The raw rows are `src/world/data/raw/venues-current.json` and `venues-expansion.json` (fetched 9 Nov 2026). They decide where a shop of a given kind stands; every shop name in the game is a generated parody (`parody_name`), and no real venue name is shown. Public data; credit kept.
- Block descriptions in `docs/reference/BLOCKS.md` come from the public web pages named inline there (Brownstoner, New York YIMBY, GrowNYC, MTA Bus Time, Wikipedia, CityLand, listing sites). Facts only; no text or images copied. No Google Maps, Street View or Earth data is used anywhere.

## Real map, R1 + R2 + R3 (`?map=real`, hosted and native builds only; MAP7, fetched 18 Nov 2026)

All of it is NYC Open Data (City of New York), public datasets, fetched over the open Socrata endpoints without a token, a few pages of 2,500 to 5,000 rows 1.5 s apart, cached on disk under `cache/real-r3/` (git-ignored). No Google Maps or Street View data, and no OpenStreetMap data: `scripts/import-osm.mjs` and its ODbL credit above belong to the stylised grid map and are not used by the real map. Queries and row counts are in `src/world/data/raw/*-r3.query.json`.

| Data | Dataset (data.cityofnewyork.us) | Query (what the import scripts send) | Used for |
|---|---|---|---|
| Street centrelines | NYC Centerline (CSCL) `inkn-q76z` | `within_box(the_geom, <R3 extent box>) AND boroughcode in ('3','4')`, fields physicalid, full_street_name, rw_type, status, trafdir, streetwidth, number_travel_lanes, level codes, truck route, carto level, posted_speed (`scripts/import-streets.mjs --r3`; first two rings fetched 11 Nov 2026 by the same script) | `src/world/data/roadnet-r123.json` (streets, widths, one-way, lanes, diagonals, blocks) |
| Tax lots | NYC DCP MapPLUTO `64uk-42ks` | `borough='BK' AND latitude/longitude between <R3 extent box>` (`scripts/import-lots-real.mjs --r3`): address, bbl, bldgclass, landuse, lotarea, lotfront, lotdepth, bldgfront, bldgdepth, numfloors, yearbuilt, ownername, unitsres | `public/data/real/lots-*.json` (lot frontage, depth, floors, class, year; PLUTO has no polygons, so a lot is its centroid) |
| Building footprints | NYC Building Footprints `5zhs-2jue` | `within_box(the_geom, <R3 extent box>)`, fields base_bbl, bin, height_roof, construction_year, shape_area (no polygons) | roof height and building count per lot |
| Pedestrian signal points | VZV Leading Pedestrian Interval Signals `xc4v-ntf4`, Accessible Pedestrian Signal Locations `de3m-c5p4`, Exclusive Pedestrian Signal (Barnes Dance) `8kuj-2n3u` | `within_box(the_geom, <R3 extent box>)` (`scripts/import-signals.mjs --r3`) | `src/world/data/roadnet-controls-r123.json` (which junctions are signalised; the city publishes no full signal inventory) |

R3 is the R1+R2 area pushed out seven city blocks on every side (`src/world/roadnet/extents.ts`; the outline encloses about 9.8 km2).

R4 growth (MAP4, fetched 21 Nov 2026, `scripts/import-streets.mjs --r4`, `import-signals.mjs --r4`, `import-lots-real.mjs --r4`, `build-places-real.mjs --r4`): the same four NYC Open Data datasets again over the bigger extent (R3 plus five blocks north, east, south and west and two streets on the diagonals, about 15.2 km2): Centerline `inkn-q76z` (`within_box` over the R4 extent box, boroughcode 3 and 4), MapPLUTO `64uk-42ks` (`borough in ('BK','QN')` because the east edge reaches Ridgewood, Queens; fields as above), Building Footprints `5zhs-2jue` (as above), and the three pedestrian signal point layers `xc4v-ntf4`, `de3m-c5p4`, `8kuj-2n3u` (as above). Raw rows stay in `cache/real-r4/` (git-ignored); the queries, row counts and dates are in `src/world/data/raw/*-r4.query.json`. NYC Open Data terms of use (public data, credit: City of New York). No Google data.

Brooklyn overview layer (added 21 Nov; `public/data/brooklyn-overview.json`, `src/world/data/brooklyn-overview-lite.json`, built by `scripts/build-brooklyn-overview.mjs`): NYC Open Data again, with no Google data: street centrelines CSCL `inkn-q76z`, Borough Boundaries clipped to the shoreline `gthc-hcne`, and 2020 Neighborhood Tabulation Areas `9nt8-h7nd` (label points).

The tax-lot rows in `src/world/data/raw/*pluto*.json` carry whatever MapPLUTO publishes for a lot, including an owner-name column. The game does not show it.

## Landmarks under invented names (LANDMARKS, added 21 Nov; `src/world/landmarks/`, `?map=real` only)

Each landmark is a real kind of place in the neighbourhood built under an invented name: the massing, height, materials and function are kept, every name, sign and detail is made up, and everything is generated in code (no photograph, drawing or model is used or traced). Facts about a place came only from the open sources below. The per-place list (what each place really is, where, what was built, which source) is in `docs/swarm/tasks/LANDMARKS.md`; the same URLs sit in each row of `src/world/landmarks/landmarks.ts`. The list of real names that the invented names are checked against lives in the test `tests/unit/world/landmarks-names.test.ts` only.

| Source | What was read | Licence |
|---|---|---|
| NYC Parks Properties `enfh-gkve`, NYC Open Data | acreage, kind and bounding streets of parks and playgrounds (fetched 21 Nov 2026, Socrata, no token) | NYC Open Data terms of use (public data) |
| NYC Facilities Database `ji82-xba5`, NYC Open Data | kind and position of libraries, firehouses, schools, hospitals, gardens, plazas, historic sites; also the list of real names to avoid | NYC Open Data terms of use (public data) |
| NYC MapPLUTO `64uk-42ks` and NYC Building Footprints `5zhs-2jue`, NYC Open Data | lot class, storeys, year built and roof height of every landmark lot (already in the real-map import above) | NYC Open Data terms of use (public data) |
| Wikipedia articles on Boys High School (Brooklyn), 83rd Precinct Police Station, St. George's Protestant Episcopal Church (Brooklyn), Marcy Houses, Sumner Houses, Herbert Von King Park, Maria Hernandez Park and the list of armories in New York City | year, style, materials, storey counts and boundaries only; paraphrased, no sentence, image or table copied | CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) |
| Bushwiki (bushwiki.nyc), page on the Bushwick Avenue church at Madison Street | that the corner tower is octagonal and part of a 1901 addition | facts only; no text or image used |

No Google Maps or Street View data or imagery, no OpenStreetMap data, no Wikimedia Commons image and no Mapillary or KartaView image was used for the landmarks. Where a place could not be sourced beyond its footprint, height and building class, the row in `landmarks.ts` says so and the building is a generic one of its kind.

## Landmarks, second set (LANDMARKS2, added 21 Nov night; `src/world/landmarks/landmarks2.ts`)

Fourteen more real places under invented names (13 places, the housing pair counts as one). This set was built looking at open-licence photographs. The photographs were looked at and measured by eye only: nothing was cut, traced or sampled from them, no texture or image from them is in the game or the repository (walls use the shared material library, coloured in code), so nothing in the game is a derivative of them. They are credited here because the look follows them. Written facts (Wikipedia, designation reports) and NYC Open Data (MapPLUTO, Building Footprints) are listed in each row of `landmarks2.ts`.

| Photograph (Wikimedia Commons file page) | Author | Licence | Used for |
|---|---|---|---|
| File:Main_entrance_of_St._Barbara%E2%80%99s_Roman_Catholic_Church_in_New_York_City.jpg | Wiktoriapopek | CC BY 4.0 | proportions and colours of the twin-tower church front |
| File:RKO_BUSHWICK_THEATER_IN_BROOKLYN,_NEW_YORK_CITY..._-_NARA_-_555919.jpg | Danny Lyon, US National Archives (Documerica) | public domain | the round corner tower, marquee and white terracotta of the movie palace |
| File:Ulmer_Brewery_Bushwick_Av_Belvedere_St_jeh.jpg | Jim Henderson | CC0 | window rhythm, hoods, cornice and colour of the brewery |
| File:Wyckoff_Heights_Medical_Center.jpg | Jim Henderson | CC BY-SA 3.0 (and GFDL) | podium, glass-block bay, tower, brick colour of the medical centre |
| File:Brooklyn-9-27-2013_038_-_US_Post_Office_-_Metropolitan_Station,_47_Debevoise_Street.JPG | photographer credited on the file page | CC BY-SA 3.0 | arched windows, belt course and colour of the post office |
| File:Rugged_Cross_BC_Lafayette_jeh.JPG | Jim Henderson | CC0 | tower, porch and window layout of the Romanesque church |
| File:13th_Regiment_Armory,_August_2025.jpg | on the file page | CC0 | towers and gate of the armoury |
| File:RIDGEWOOD-GLENDALE-FRESH_POND_008.JPG | ALT55 - Victor M | CC BY-SA 3.0 | arched windows and dark hoods of the tenement row |
| File:HylanHousesBushwickBK.JPG | on the file page | public domain (PD-self) | brick colour and proportions of the towers (looked at) |

The mural walls carry ORIGINAL artwork painted in code from flat-coloured shapes (a sunrise, a bird, a skyline, waves): no real person, no copied mural. No Google Maps or Street View, news, listing or Flickr image was looked at or saved.

## Landmarks, third set (LANDMARKS3, added 21 Nov night; `src/world/landmarks/landmarks3.ts`, `buildCivic3.ts`)

Photos were looked at (and measured by eye) only; nothing is cut from them. No texture is derived from any photo, so the CC BY-SA files impose no share-alike duty here; they are credited anyway. Licence read from each file's Commons page listing.

| Source | Author | Licence | Used for |
|---|---|---|---|
| File:Girls_HS_Nostrand_Av_jeh.jpg | Jim Henderson | CC0 | massing, tower, portico and colours of the Victorian school |
| File:Alhambra_Apts_Nostrand_Av_jeh.jpg | Jim Henderson | CC0 | pilasters, corner bay, tile mansard, shop arcade of the Moorish apartment house |
| File:Victory_RCC_Throop_Av_jeh.jpg | Jim Henderson | CC0 | gable front, round window, porch, buttresses of the Gothic stone church |
| File:Decatur_Stuyvesant_Heights_HD_1.JPG | Smallbones | CC BY-SA 3.0 | colour, arches and bay of the Stuyvesant Heights house row |
| MapPLUTO, Building Footprints | NYC Open Data | NYC Open Data terms of use | lot sites, floors, years |

## People base mesh (HUMAN)

| Asset | Source | Licence | Where |
|---|---|---|---|
| MakeHuman base mesh, default rig + weights, macro targets (data files only; the AGPL application code is not used) | https://github.com/makehumancommunity/makehuman (`makehuman/data/3dobjs/base.obj`, `rigs/default.*`, `targets/macrodetails/*`), (c) Data Collection AB, Joel Palmius, Jonas Hauquier, original Manuel Bastioni | CC0 1.0 (released September 2020) | `src/assets/models/people/src/` (+ LICENSE.txt); derived `people/*.glb` via `scripts/people-pipeline.mjs` |

What is used since 23 Nov 2026 (round 3 of the body team), all from the same CC0 data and all kept in
`src/assets/models/people/src/`: the base mesh (`base.obj.gz`); the default skeleton (`default.mhskel`, 163 bones) and its
vertex weights (`default_weights.mhw.gz`), now also used to hang the arms; and 66 macro targets from `targets/macrodetails/`:
the 18 group targets (`african-`, `asian-`, `caucasian-` x `male`/`female` x `child`/`young`/`old`) and the 48 `universal-`
targets, the full grid of min, average and max muscle by min, average and max weight for both sexes at child, young and old
(the average-muscle, average-weight point has no file). The two child figures `kid_a.glb` and `kid_b.glb` are derived from the
child targets. The derived `.glb` files carry the grid as extra vertex attributes. `LICENSE.txt` quotes the files' own
headers: "This asset was explicitly released as CC0 in september 2020", and says: "Only these DATA files are used. The
MakeHuman application code is AGPL and is neither copied nor used." Licence text:
https://creativecommons.org/publicdomain/zero/1.0/

## HD voices (VOX): on-device neural text-to-speech

Opt-in "HD voices" for the music-station DJs and WBSY Talk. Nothing below is bundled in the game: the library is loaded from a public CDN and the model from Hugging Face at run time, and cached by the browser. Full decision record: `docs/reference/VOICES.md`.

| Component | Used as | Licence | Source |
|---|---|---|---|
| kokoro-js 1.2.1 (hexgrad, contributor Xenova) | TTS runtime, `dist/kokoro.web.js` loaded from jsDelivr | Apache-2.0 | https://github.com/hexgrad/kokoro (npm `kokoro-js`) |
| Kokoro-82M v1.0 (ONNX export `onnx-community/Kokoro-82M-v1.0-ONNX`, from `hexgrad/Kokoro-82M`) | model weights and the 28 English voice style packs (`af_*`, `am_*`, `bf_*`, `bm_*`) | Apache-2.0 (HF model card metadata of both repos). Trained on permissive or public-domain audio and synthetic audio from closed TTS providers; no voice clones. | https://huggingface.co/hexgrad/Kokoro-82M |
| Kokoro training data, attribution requested by the model card | CC BY audio used in training: Koniwa `tnc` (CC BY 3.0) and SIWIS (CC BY 4.0). Neither is an English voice we ship, but the card asks for this credit. | CC BY 3.0 / CC BY 4.0 | model card, "Creative Commons Attribution" |
| StyleTTS 2 (architecture) | Kokoro is built on it | MIT | https://github.com/yl4579/StyleTTS2 |
| transformers.js (`@huggingface/transformers` 3.x) and onnxruntime-web | inference, pulled in by kokoro-js | Apache-2.0 and MIT | https://github.com/huggingface/transformers.js |
| phonemizer.js (Xenova) wrapping eSpeak NG | text to phonemes inside kokoro-js | wrapper Apache-2.0; eSpeak NG is GPL-3.0 (its `COPYING`) | https://github.com/xenova/phonemizer.js |

eSpeak NG is GPL-3.0. We do not copy or redistribute it: the user's browser downloads it from the CDN as part of kokoro-js. If this project is ever repackaged with the library vendored into the build, re-check the GPL implications first.

Candidates not used, with the reason, are in `docs/reference/VOICES.md` (Piper: GPL-3.0 engine and per-voice dataset licences; Supertonic: OpenRAIL; KittenTTS: Apache-2.0 but fewer voices).

All DJs, hosts, callers, shows and commercials (`src/audio/voice/**`) are original fiction written for this fan tribute. No real person, station or brand is named or imitated; a lint test (`tests/unit/audio/voice-content.test.ts`) enforces a deny-list of real brands, outlets and public figures.

## Radio stations (RADIO15, as rebalanced on 11 Nov; table corrected 21 Nov from `src/audio/stations.ts`)
Nothing is bundled. SoundCloud sets play only through SoundCloud's official widget (`https://w.soundcloud.com/player/api.js`); internet radio plays as each station's own public stream. Real set and artist names come from SoundCloud or the station and are shown as published. The dial has 15 stations; the "My Library" station appears only when the player adds their own files.

| Station | Type | Source | Site |
|---|---|---|---|
| Boiler Room | SoundCloud account | soundcloud.com/platform | https://boilerroom.tv |
| Dekmantel Podcast | SoundCloud account | soundcloud.com/dkmntl | https://www.dekmantel.com |
| Resident Advisor (RA NYC pool and RA Podcast) | RA pool, SoundCloud account | soundcloud.com/resident-advisor and the studio's own RA NYC proxy | https://ra.co |
| Rinse FM | SoundCloud account | soundcloud.com/rinsefm | https://rinse.fm |
| Soulection | SoundCloud account | soundcloud.com/soulection | https://soulection.com |
| Universal Hip Hop Radio | SoundCloud account | soundcloud.com/uhhmradio | https://soundcloud.com/uhhmradio |
| SilverStarSound | SoundCloud account | soundcloud.com/silver-star-sound | https://soundcloud.com/silver-star-sound |
| DJ RubyTunes Latin | SoundCloud account | soundcloud.com/djrubytunes | https://soundcloud.com/djrubytunes |
| The Lot Radio | SoundCloud account | soundcloud.com/thelotradio | https://www.thelotradio.com |
| WFMU Rock'n'Soul | live public stream | stream0.wfmu.org/rocknsoul | https://wfmu.org/ |
| WFMU 91.1 | live public stream | stream0.wfmu.org/freeform-128k | https://wfmu.org |
| KEXP 90.3 | live public stream | kexp.streamguys1.com/kexp128.mp3 | https://www.kexp.org |
| SomaFM Underground 80s | live public stream | ice2.somafm.com/u80s-128-mp3 (with fallbacks) | https://somafm.com/u80s/ |
| WNYC 93.9 FM | live public stream | fm939.wnyc.org/wnycfm (with a fallback) | https://www.wnyc.org |
| WBSY Talk | scripted, synthesized voices | original fiction | n/a |

KEXP's current-song line uses its open API (`api.kexp.org`); SomaFM's uses `channels.json`. Credit and link are shown in the Radio panel. Earlier versions of this table also listed Mixmag, FACT Mixes, dublab and Radio Paradise; they are no longer on the dial.

## Radio, 22 Nov (RADIO3): pools of live streams, SoundCloud mix pools, hip hop
Same rules as above: nothing bundled, nothing downloaded. Live streams play as each broadcaster's own public stream in an audio element; mixes play only through SoundCloud's official widget, each with the mix's own page linked in the Radio panel.
Each live stream below was requested from this box on 22 Nov 2026 and answered `200` with an audio content type and the station's own `icy-name` (a request for the first byte only; nothing was listened to). SomaFM refuses requests from this box for most of its streams (HTTP 403), one answered once; its streams are the broadcaster's published player URLs and are NOT verified from here.

| Dial station | Stream (what plays) | Source | Site |
|---|---|---|---|
| Soul & Funk Live | WFMU Rock'n'Soul | stream0.wfmu.org/rocknsoul | https://wfmu.org/ |
| Soul & Funk Live | 181.FM Soul | listen.181fm.com/181-soul_128k.mp3 | https://www.181.fm |
| Soul & Funk Live | SomaFM Seven Inch Soul | ice2.somafm.com/7soul-128-mp3 (not verified from this box) | https://somafm.com/7soul/ |
| WFMU Live | WFMU 91.1 Freeform | stream0.wfmu.org/freeform-128k | https://wfmu.org |
| WFMU Live | WFMU Give the Drummer Radio | stream0.wfmu.org/drummer | https://wfmu.org |
| WFMU Live | WFMU Sheena's Jungle Room | stream0.wfmu.org/sheena | https://wfmu.org |
| Indie & Rock Live | KEXP 90.3 | kexp.streamguys1.com/kexp128.mp3 | https://www.kexp.org |
| Indie & Rock Live | 181.FM Rock 181 | listen.181fm.com/181-rock_128k.mp3 | https://www.181.fm |
| Indie & Rock Live | Radio Paradise Rock Mix | stream.radioparadise.com/rock-128 (AAC) | https://radioparadise.com |
| Indie & Rock Live | KCRW Eclectic24 | streams.kcrw.com/e24_mp3 | https://www.kcrw.com |
| SomaFM Underground 80s | SomaFM Underground 80s (not verified from this box) | ice2.somafm.com/u80s-128-mp3 (with mirrors) | https://somafm.com/u80s/ |
| SomaFM Underground 80s | 181.FM Awesome 80s | listen.181fm.com/181-awesome80s_128k.mp3 | https://www.181.fm |
| 181.FM The Beat | 181.FM The Beat (hip hop and R&B) | listen.181fm.com/181-beat_128k.mp3 | https://www.181.fm |

The Group Chat 99.9 is original fiction (script by the TALK2 lane), spoken by the browser's own synthesized voices.

SoundCloud mixes (`src/audio/sc/mixes.json`, researched and each page opened by the SCMIXES lane and the lead on 22 Nov 2026; these are other people's DJ mixes, played through SoundCloud's own player with credit and a link; the pools go stale as uploaders remove tracks). Uploader accounts by station:
- weird: thelotradio (10 mixes)
- sc: resident-advisor (7 mixes)
- bkhouse: platform (9 mixes)
- dublab: dkmntl (5 mixes)
- flashback: rinsefm (10 mixes)
- boogie: soulection (10 mixes)
- yard: silver-star-sound (9 mixes)
- latin: djrubytunes (8 mixes)
- Stoop Hip Hop Radio (two shows of the old Universal Hip Hop Radio account): uhhmradio (2 mixes)
- Stoop Hip Hop Radio: back-to-the-classics, dj-xclusive-g2b, djchiefone, djwashburn, illsound, mrchriswaters, pfcuttin, ruboxmusic, uncledoobie (11 mixes)

## Street photos and observed facades (ENV14)

Facts only (a wall colour, material class and shop-awning colour per lot) derived from the photos below; no photo pixels are in the game, the atlas or the artifact. Method and licence reasoning: `docs/STREET-PHOTOS.md`. Per-lot photo, author, licence and URL: `src/world/data/facade-observed.provenance.json`.

| Source | Author | Licence | Photos used |
|---|---|---|---|
| Wikimedia Commons | Jim.henderson | 3 public domain, 2 CC0 | 5 |
| KartaView (OpenStreetCam) | 15 contributors (names in the sidecar) | CC BY-SA 4.0 | 215 |

NYC Parks 2015 Street Tree Census (`uvpi-gqnh`) and NYC DCP MapPLUTO / Building Footprints via NYC Open Data: public data, no restriction.

## Real-map street furniture positions (ENV14, hosted and native only)

`public/data/realmap-furniture.json`, built by `scripts/fetch-real-furniture.mjs`; fetched at run time on the real-map path, never inside the single-file artifact.

| Data | Source | Licence / terms |
|---|---|---|
| Hydrants | NYC DEP Hydrants (`5bgh-vtsn`), NYC Open Data | public data |
| Litter baskets | DSNY Litter Basket Inventory (`8znf-7b2c`), NYC Open Data | public data |
| LinkNYC kiosks | NYC OTI LinkNYC Kiosk Locations (`s4kf-3yrf`), NYC Open Data | public data |
| Street trees (positions, trunk size, species) | NYC Parks 2015 Street Tree Census (`uvpi-gqnh`) | public data |
| Bus stops | MTA New York City Transit Brooklyn bus GTFS `stops.txt` | MTA developer data terms (free use; credit MTA) |
| Bike docks | Citi Bike GBFS `station_information` (NYC Bike Share / Lyft) | published open data under the NYC Bike Share data licence (attribution; no endorsement implied) |

## Body motion (ANIM): captured walk, jog, run, idles, turn, jump, stumble, sit

`src/entities/anim/corePack.ts` (bundled, generated) and `public/anim/core.bin`, `public/anim/street.bin` (the larger pack, fetched on the hosted and native builds only),
built by `scripts/anim/build-clips.mjs` from the trials listed in `scripts/anim/catalog.mjs`. The source files are parsed as text and never executed.

- **Source: Carnegie Mellon University Graphics Lab Motion Capture Database** (http://mocap.cs.cmu.edu), subjects 1, 5, 7, 8, 13, 16, 17, 18, 19, 22, 40, 77, 79, 80, 105 (trial numbers below and in `scripts/anim/catalog.mjs`).
  The BVH versions are the conversion by Bruce Hahne (cgspeed, 2010 release), fetched from the public mirror
  https://github.com/una-dinosauria/cmu-mocap (`data/<subject>/<subject>_<trial>.bvh`, master at commit 09a07f54f3bbb58797325f009282d0b2048a2871).
- **Licence, verified on 12 Nov 2026 from the database's own home page** (https://mocap.cs.cmu.edu/): "This dataset of motions is free for all uses." and
  "This data is free for use in research projects. You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form."
  We ship a few kilobytes of derived joint angles inside a game, we do not sell or redistribute the data as data. Requested acknowledgement:
  *The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.* The credits roll should carry that line.
- **Trials used** (subject_trial; CMU's own descriptions): walk 07_01, brisk walk 07_12, fast walk 08_01, slow walk 08_04, heavyset walk 17_08, angry walk 17_01, jaunty walk 17_06, hobble 17_05, sad walk 105_13, drunk walk 105_09, limp 105_16, scared walk 105_32;
  jog 16_36, run 16_46, run start 16_55, stops 16_33 and 16_57, 180-degree turn 01_01, walking 90-degree turn 16_17, forward jump 16_05, stumble 22_12, sit down and stand up 13_01,
  waiting idles 40_10 and 40_11, answering a phone 80_25, getting up from lying on the back 77_18, ducking a flying object (flinch) 77_09, conversation with hand gestures 18_08 and 19_08, eating dinner 79_12.
  Not in CMU's data, so not captured: smoking, a real sprint (the fastest run is about 4 m/s), a child's run, strafing for a game that turns to face its direction of travel; arms crossed and leaning are hand-keyed.
- **Modified**: retargeted from the CMU skeleton to our 12-bone person (angles re-derived from bone directions, rest pose and proportions replaced), one gait cycle cut and
  loop-closed per walk or run, resampled to 15 to 24 frames per second, 8-bit quantised. Nothing is ripped from any game.
- **Checked and not used**: Quaternius Universal Animation Library (CC0 per https://quaternius.com/packs/universalanimationlibrary.html, "License CC0"; the download is behind an itch.io page, not fetched, its rig is also not ours);
  Kenney animated characters (CC0 as far as known; kenney.nl returned 403 from this machine, not verified);
  Ubisoft LaFAN1 (CC BY-NC-ND 4.0 per the README at https://github.com/ubisoft/ubisoft-laforge-animation-dataset: non-commercial and no derivatives, ruled out);
  Bandai Namco Research Motion Dataset (CC BY-NC 4.0 per its README https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset, ND on part of it per press coverage: non-commercial, ruled out);
  100STYLE (CC BY 4.0 per its Zenodo record https://zenodo.org/records/8127870; not needed, CMU covered the list). Mixamo is excluded (its licence does not allow passing the files on).

## Title and loading pictures (SHOTS2; added 21 Nov)

`public/art/shot-*.webp` (five files) are screenshots taken from the game's own renderer with a free camera, then graded. They contain nothing from outside the project. The six illustrated loading posters described in `docs/swarm/art/loading-prompts.md` were never made, so no generated image is in the repository.

## Build and test tooling (added 21 Nov)

Run-time dependencies of the game: three.js 0.186 (MIT), and on the live site only `@vercel/analytics` 2.0.1 (MIT), which
loads Vercel's page-view script (`src/core/Analytics.ts`). Development tools, none shipped in the game: Vite, vite-plugin-singlefile, Vitest and jsdom (MIT), TypeScript (Apache-2.0), glTF-Transform and meshoptimizer (MIT; used by `scripts/compress-models.mjs` and `scripts/people-pipeline.mjs`). The desktop shell adds Electron and electron-builder (see the table below). The browser tests use Playwright and Chromium, installed outside the project.

Test fixture, not shipped (`tests/fixtures/`): `CesiumMan.glb`, a skinned walking man from the Khronos glTF Sample Assets (https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMan), (c) Cesium (Analytical Graphics, Inc.), **CC BY 4.0**: attribution required if redistributed. `osm-sample.geojson` is synthetic (made by `tests/fixtures/make-osm-sample.mjs`), not OpenStreetMap data.

## Desktop apps (NATIVE2): what the installers contain

The macOS (Apple Silicon) and Windows (x64) apps are the hosted web build inside Electron. Full list with the run-time downloads: `docs/NATIVE.md`.

| Component | Where it is in the installer | Licence | Source |
|---|---|---|---|
| Electron 45 (shell, Node.js, V8) | the app itself | MIT (`LICENSE` in the app folder) | https://github.com/electron/electron |
| Chromium and its third-party libraries, including FFmpeg (LGPL-2.1 build, a separate `ffmpeg` library file) | the app itself | BSD-3-Clause and many others, listed in `LICENSES.chromium.html` shipped inside the app | https://www.chromium.org/ |
| three.js (bundled in the game code) | `resources/web/assets/three-*.js` | MIT | https://github.com/mrdoob/three.js |
| The game code, procedural audio, title theme, credits | `resources/web/assets/index-*.js` | original to this project | n/a |
| Fonts Anton, Barlow, Barlow Condensed | `resources/web/fonts/` | SIL OFL 1.1 (texts beside the fonts) | see Fonts above |
| Textures, car and character models, MakeHuman base mesh | inside the game files | CC0 1.0 | see Textures, Models, People above |
| Captured body motion (CMU) | `resources/web/anim/*.bin` | CMU mocap terms (free for all uses) | see Body motion above |
| Baked DJ and talk-show voice clips (Kokoro-82M output, 8 MP3 banks plus `manifest.json`) | `resources/web/voice/` | the model is Apache-2.0; the clips are audio rendered by it. eSpeak NG ran only on the machine that rendered them; its code is not in the clips or the installer. | see HD voices above |
| Brooklyn overview map layer (street centrelines `inkn-q76z`, borough boundaries `gthc-hcne`, neighbourhood label points `9nt8-h7nd`) and real-map street furniture | `resources/web/data/*.json` | NYC Open Data public datasets (credit: City of New York). The terms page was not re-read by NATIVE2; the rows above treat these datasets the same way. | https://opendata.cityofnewyork.us |

Not in the installer, fetched by the player's machine at run time (never bundled): the SoundCloud player, the live radio streams, the radio schedule API, and (opt-in "HD voices") kokoro-js with its eSpeak NG phonemizer from jsDelivr and the Kokoro model from Hugging Face. Where each comes from is listed in `docs/NATIVE.md`.

## Mods (24 Nov 2026)

The game ships NO third-party mod pack. Players load their own `.glb`, image, RenderWare `.dff` and `.txd` files from their own disk;
the files are parsed in the browser and kept only on that device (`docs/MODS.md`). The `.dff` and `.txd` readers (`src/mods/rw/`) were
written from the publicly documented chunk layouts; no third-party code is included. The worked example in `docs/examples/mod-example/`
refers to two CC0 assets already credited above (the Kenney sedan and the Poly Haven asphalt set).
