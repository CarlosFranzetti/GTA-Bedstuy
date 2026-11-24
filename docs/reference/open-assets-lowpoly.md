# Open low-poly models and textures: research (24 Nov 2026)

Method: each item's own page (or the site's own API record for that item) was opened on 24 Nov 2026. Nothing was downloaded. Licence text is quoted from the page or API field named. "Verified" = licence read on that item's page/API record. Pack-level "CC0" lines were seen, but no pack's licence FILE was opened (not looked at: say so before relying on it). Rule 3: ship only CC0, CC BY, CC BY-SA, with credit recorded in `docs/CREDITS.md`. Where Sketchfab or Poly Pizza says CC BY, credit the named author.

## Best ten finds
1. **PSX Style Cars** (OpenGameArt, GGBotNet), CC0, 6 cars of 304 to 476 tris, 128 px textures, includes a 4-door sedan with police and taxi variants, wagon, hatchback, minivan, burnt-out car. Closest match to the early-2000s look. https://opengameart.org/content/psx-style-cars
2. **Kenney Car Kit** (CC0, 45 files). https://kenney.nl/assets/car-kit (also Kenney Racing Kit, City Kits below).
3. **Quaternius Cars Pack** (CC0 on pack page, 8 models) and **Public Transport Pack** (12 models, buses etc.). See licence conflict note under Quaternius.
4. **Free Urban Textures: Buildings, Apartments, Shop Fronts** (OpenGameArt, Scouser), CC0, zip named "buildings-apartments-shopfronts-shutters". Photo-based facades and shutters. https://opengameart.org/content/free-urban-textures-buildings-apartments-shop-fronts (check the images for visible shop names before use; photo origin not stated on the page).
5. **Poly Haven shutters, brick, asphalt, denim**: all CC0 by site licence. e.g. `painted_metal_shutter`, `rusted_shutter`, `worn_shutter`, `brick_wall_005`, `red_brick_03`, `asphalt_03`, `denim_fabric_03`. Down-res to 256/512.
6. **ambientCG** (CC0): Asphalt, Road, PavingStones, Bricks, CorrugatedSteel, Grate002 (grate), Leather and Fabric sets.
7. **Retro Urban Kit** (Kenney, CC0, 120 files, tagged retro urban building city). https://kenney.nl/assets/retro-urban-kit
8. **Quaternius Downtown City MegaKit** (315 models, glTF/FBX/Blend, "Boston/NYC style city blocks", CC0 on pack page). Heavy, but the nearest to brownstone-style blocks. https://quaternius.com/packs/downtowncitymegakit.html
9. **PS1-style Sketchfab CC BY models** by Wersaus33: White Van (140 faces), Transport Van (180), Toyota Corolla (144, real brand name, rename), plus jonniemadeit PSX Sedan (174), korkskrew2000 PSX Fire Hydrant (157, CC BY-SA).
10. **OpenGameArt Traffic Road Assets** (CC0, MilkAndBanana: cones, barriers, hydrants, street lights). https://opengameart.org/content/traffic-road-assets

## Licence conflicts and cautions (stricter treated as true)
- **Quaternius**: pack pages say "License CC0" (read for Cars, Public Transport, Modular Streets, Buildings, Downtown City MegaKit, Cyberpunk Game Kit, Zombie Apocalypse Kit). But https://quaternius.com/license.html now shows "Quaternius Asset License (QAL) v1.0, last updated 8/28/2026": you may use assets in a Product without credit, but may not "redistribute the Assets themselves ... as a standalone asset, asset pack ... whether alone or bundled". A public repository with raw model files could count. Ask the owner / commit only processed in-game geometry, or prefer the same models via OpenGameArt (older CC0 uploads by quaternius, below) which state CC0 on their own page.
- **Sketchfab / Poly Pizza CC BY** items need the author named in `docs/CREDITS.md`. Sketchfab titles can hide fan models of commercial vehicles or games; each below was labelled CC BY by the API, but provenance of the geometry is only the uploader's word.
- Real brand names in titles (Toyota, Kawasaki, Isuzu, Mazda) are fine as files but the game must use invented names (rule 4).

## Priority 1: vehicles
| Name | URL | Author | Licence as stated | Format / size | Use | Fit to early-2000s look |
|---|---|---|---|---|---|---|
| PSX Style Cars | https://opengameart.org/content/psx-style-cars | GGBotNet | CC0 | blend, obj, png (128 px), 2.6 MB; 304-476 tris | sedan/taxi/police variant, wagon, hatch, minivan | excellent, PS1-era |
| Car Kit | https://kenney.nl/assets/car-kit | Kenney | License Creative Commons CC0 | 45 files (OGA mirror: kenney_car-kit_3.1.zip) | sedan, taxi, police, van, truck, box-truck silhouettes | good, clean toy-low-poly |
| Racing Kit | https://kenney.nl/assets/racing-kit | Kenney | CC0 | 110 files | cars plus track barriers, cones | okay |
| Toy Car Kit | https://kenney.nl/assets/toy-car-kit | Kenney | CC0 | 100 files | chunky cars | too toy-like |
| Cars Pack | https://quaternius.com/packs/cars.html | Quaternius | "License CC0" (see QAL conflict) | FBX OBJ Blend, 8 models | cars | good |
| Public Transport Pack | https://quaternius.com/packs/publictransport.html | Quaternius | "License CC0" (see QAL) | FBX OBJ Blend, 12 models | bus, tram etc. | good |
| LowPoly Public Transport (OGA) | https://opengameart.org/content/lowpoly-public-transport | quaternius | CC0 (item page) | Public Transport.zip 1.4 MB; blend obj fbx | bus | good; use this page, not QAL pack |
| Police Car | https://poly.pizza/m/BwwnUrWGmV | Quaternius | "Public Domain (CC0)" | OBJ/GLTF, 2.4k tris | police car | good |
| Car Hatchback | https://poly.pizza/m/BG0KAhmGDt | Kay Lousberg | "Public Domain (CC0)" | FBX/GLTF | hatchback | good |
| Van | https://poly.pizza/m/aT_24cDaW1a | Poly by Google | Creative Commons Attribution | OBJ/GLTF, 3.25k tris | van | soft, toy-ish; credit needed |
| Low Poly Vehicles Pack | https://opengameart.org/content/low-poly-vehicles-pack | Daniel Quevedo | CC0 | blend 590 KB, FBX zip 74 KB; plain colours | bus, jeep, pickup, sedan, wagon + cone, lamp, stop sign | flat colour, clean |
| Vehicles Assets pt1 | https://opengameart.org/content/vehicles-assets-pt1 | eracoon | CC0 | zip 3.5 MB; 12 cars x 7 colours | cars | simple |
| Semi-Trailer Truck (lowpoly) | https://opengameart.org/content/semi-trailer-truck-lowpoly | Teh_Bucket | CC0 | blend 569 KB; 450 tris | big truck | very low, good |
| Sports Car (lowpoly) | https://opengameart.org/content/sports-car-lowpoly | Teh_Bucket | CC0 | obj | sports car | good |
| Low Poly Car | https://opengameart.org/content/low-poly-car | ITsky | CC0 | blend | sedan | unchecked tri count |
| Low Poly Car | https://opengameart.org/content/low-poly-car-2 | RayB2 | CC0 | blend | car | unchecked tri count |
| 3D Car Low Poly Free | https://opengameart.org/content/3d-car-low-poly-free | Alexander123 | CC0 | FreeCoupeCar zip | coupe | unchecked |
| Free Low Poly Vehicles Pack | https://opengameart.org/content/free-low-poly-vehicles-pack | rgsdev | CC0 | zip | cars | unchecked |
| LOW POLY CAR UPDATE Pack | https://opengameart.org/content/low-poly-car-update-pack | byzmod3d | CC0 | zip | cars | unchecked |
| LOW POLY CAR 3D | https://opengameart.org/content/low-poly-car-3d | byzmod3d | CC0 | zip | car | unchecked |
| Lowpoly pixelart vehicle | https://opengameart.org/content/lowpoly-pixelart-vehicle | glebster51 | CC0 | zips (yellow car) | taxi-coloured car | pixel-art style, fits |
| Toy Car Kit / Car Kit mirrors | https://opengameart.org/content/car-kit , /content/toy-car-kit | Kenney | CC0 | zips | as above | as above |
| Generic Lowpoly Sedan | https://sketchfab.com/3d-models/none-35f6ef7fc08c451eb714c3fc70f6a6e5 | scailman | by (API slug) | 2,160 faces | sedan | good |
| PSX Sedan Car | https://sketchfab.com/3d-models/none-90bbcad62e0d480581bf0a191b2f6bd2 | jonniemadeit | by | 174 faces | sedan | excellent PS1 |
| Low Poly sedan | https://sketchfab.com/3d-models/none-37321ed3e0c74cd8ab06b2fac30ccfef | lev_229 | by | 1,932 faces | sedan | good |
| Blue Sedan, stylized low poly | https://sketchfab.com/3d-models/none-a4c46087374a4a3e979092512f92c057 | R3indeer | by | 5,321 faces | old sedan | ok, upper range |
| Taxi | https://sketchfab.com/3d-models/none-a15e4d49d68d4b1caa2a357685785ad1 | AnnPiskacov | by | 2,204 faces | taxi | good |
| Low Poly Hongkong Taxi | https://sketchfab.com/3d-models/none-52f3e00f0f2a4c4a894c3082639d4431 | Han66st | by | 3,732 faces | taxi (repaint) | ok |
| Low Poly Police Car | https://sketchfab.com/3d-models/none-f4a4c5ad117c49c4a1ffbca899d1b6c4 | Aditya Voxel | by | 600 faces | police | good |
| POLICE CAR - LOW POLY | https://sketchfab.com/3d-models/none-0f5b12ea1f474887b9664fd7a171c17a | Jasmin Daniel | by | 3,942 faces | police | ok |
| White Van - PS1 Low Poly | https://sketchfab.com/3d-models/none-1cac40905d494bae8108a556d870e23e | Wersaus33 | by | 140 faces | van | excellent PS1 |
| Transport Van - PS1 Low Poly | https://sketchfab.com/3d-models/none-83b85323614e4adb9212125e5480c756 | Wersaus33 | by | 180 faces | van | excellent PS1 |
| Low Poly Van | https://sketchfab.com/3d-models/none-9d234835390345a79ccd0db6fd437261 | Giallovero | by | 2,762 faces | van | good |
| Low Poly Box Truck | https://sketchfab.com/3d-models/none-81e2cac848b149c6bde52e8d2eca570c | Designed By Jonathan | by | 2,020 faces | box truck | good |
| Box Truck [Game Asset] | https://sketchfab.com/3d-models/none-959e25ad21014bcf9066d3f6f7e7ecb2 | Jen S Abbott | by | 1,964 faces | box truck | good |
| Low Poly Box Truck | https://sketchfab.com/3d-models/none-d39e9fc697044ffcb1efd447ec64acdf | Squash | by | 2,078 faces | box truck | good |
| Low Poly Cargo Truck | https://sketchfab.com/3d-models/none-34266603acc1418ba0ad8776b6df9269 | Pyber Studio | by | 1,244 faces | delivery truck | good |
| DELIVERY TRUCK | https://sketchfab.com/3d-models/none-1d53f7fa474849db812102dfa5d070d0 | Jasmin Daniel | by | 4,096 faces | delivery truck | ok |
| PS1 styled bus | https://sketchfab.com/3d-models/none-833fa9c0c1f84c449f7ffd92c7a63e34 | Medmamuang | by | 244 faces | bus | excellent PS1 |
| Bus | https://sketchfab.com/3d-models/none-d0255220f8da4e218d0e5da5f4f3a1ca | RodWay | by | 536 faces | bus | blocky |
| Low Poly Bus | https://sketchfab.com/3d-models/none-30cf9f7983db48c9a8450ff34c403414 | Aditya Voxel | by | 764 faces | bus | good |
| Low Poly School Bus | https://sketchfab.com/3d-models/none-e8da09c01d4645e6998cfa69f6dfc88a | Virginia Vidonis | by | 1,463 faces | school bus | good |
| Kawasaki Spectre - PS1 Low Poly | https://sketchfab.com/3d-models/none-9c486accf04f41389b8d5ca01968ec06 | Wersaus33 | by | 481 faces | motorbike | excellent PS1 (real brand name; rename) |
| Motorcycle, Suzuki SV650, low-poly | https://sketchfab.com/3d-models/none-80dd60277d1042dfab14cb352e23c732 | dudecon | by | 684 faces | motorbike | good |
| Low poly motorcycle | https://sketchfab.com/3d-models/none-4fc3500e04b14e73b942d85bc948c5e9 | matisosanimation | by | 3,480 faces | motorbike | ok |
| Skateboard animated - Blockbench | https://sketchfab.com/3d-models/none-919d58adb0884c8895fc140455169ae0 | Artbor | by | 276 faces | skateboard | blocky, fits |
| Skateboard | https://sketchfab.com/3d-models/none-1ead1e6397844de4ad94f3c578255a04 | Erdem Dagdelen | by | 2,280 faces | skateboard | ok |
| skateboard | https://sketchfab.com/3d-models/none-xcix0fdyVU8S45VrCpqVzkZJ4Ne | Chaitanya Krishnan | by | 2,900 faces | skateboard | ok |
| Mini Skate | https://kenney.nl/assets/mini-skate | Kenney | CC0 | 40 files | skateboard, ramps | toy style |
| Low Poly Pickup Truck | https://sketchfab.com/3d-models/none-83829f49d86143e9b2507e2509e5f213 | David Jalbert | by-sa | 2,986 faces | pickup | good; share-alike applies to the model |
| Low Poly Pickup Truck 1 and 2 | https://sketchfab.com/3d-models/none-3ca8990739ca4938902401df806a2f08 , .../none-4d29173e76624021b80630db2cf089df | Aditya Voxel | by | 654 faces each | pickup | good |

Sketchfab licence slug and face count came from api.sketchfab.com model records on 24 Nov. The "by" slug is CC Attribution (API label "CC Attribution"; the API's own licence list shows slug "by" = https://creativecommons.org/licenses/by/4.0/ ). Per-item version (3.0 vs 4.0) not checked.

## Priority 2: surfaces and facade materials
| Name | URL | Author | Licence | Format / size | Use | Fit |
|---|---|---|---|---|---|---|
| Free Urban Textures: Buildings, Apartments, Shop Fronts | https://opengameart.org/content/free-urban-textures-buildings-apartments-shop-fronts | Scouser | CC0 | zip "buildings-apartments-shopfronts-shutters" (about 205 MB per a search snippet, not confirmed) | shopfront, shutter, facade photos | photo-based, good; inspect for brand lettering |
| Seamless Brick Textures | https://opengameart.org/content/seamless-brick-textures-0 | GGBotNet | CC0 | 4 PNG Bricks_001..004 (512 px per search snippet) | red brick | good |
| Seamless Brick/Concrete Textures | https://opengameart.org/content/seamless-brickconcrete-textures | BMacZero | CC0 | Concrete, RealPavement, RoughBrick256, SmoothBrick PNG | sidewalk, concrete, brick | very good, photo-based |
| Asphalt Road Texture Free | https://opengameart.org/content/asphalt-road-texture-free | ForKotLow | CC0 | PNG, 1024 px per snippet | road | down-res |
| faux asphalt texture pack | https://opengameart.org/content/faux-asphalt-texture-pack | para | CC0 | zip 512-2048 px, painted | road | painted, fits |
| brick wall textures | https://opengameart.org/content/brick-wall-textures | Luke.RUSTLTD | CC0 | zip, 512 px with normal/AO per snippet | brick | ok |
| Buildings pack | https://opengameart.org/content/buildings-pack-1 | DREAM_SEARCH_REPEAT | CC0 | blend | buildings | ok |
| Retro Urban Kit | https://kenney.nl/assets/retro-urban-kit | Kenney | CC0 | 120 files | buildings, props | good |
| City Kit (Roads) | https://kenney.nl/assets/city-kit-roads | Kenney | CC0 | 90 files | road pieces | good |
| City Kit (Commercial) | https://kenney.nl/assets/city-kit-commercial | Kenney | CC0 | 50 files | shopfronts, awnings (per OGA snippet) | good |
| City Kit (Suburban / Industrial) | https://kenney.nl/assets/city-kit-suburban , /city-kit-industrial | Kenney | CC0 | 40 files each | houses, warehouses | ok |
| Modular Buildings | https://kenney.nl/assets/modular-buildings | Kenney | CC0 | 100 files | building parts | ok |
| Modular Streets Pack | https://quaternius.com/packs/modularstreets.html | Quaternius | "License CC0" (QAL conflict) | 25 models | roads | good |
| LowPoly Modular Street Pack (OGA) | https://opengameart.org/content/lowpoly-modular-street-pack | quaternius | CC0 | zip | roads | use instead of the site pack |
| LowPoly Buildings Pack (OGA) | https://opengameart.org/content/lowpoly-buildings-pack | quaternius | CC0 | zip | buildings | good |
| Downtown City MegaKit | https://quaternius.com/packs/downtowncitymegakit.html | Quaternius | "License CC0" (QAL conflict) | 315 models, FBX Blend glTF | NYC-style blocks | strong, not PS-era |
| Poly Haven: asphalt_03, worn_asphalt, asphalt_01..07, clean_asphalt | https://polyhaven.com/a/asphalt_03 | Charlotte Baglioni, Dario Barresi (asphalt_03) | "CC0 License" on the page | 2m wide, 40 px/cm; jpg/png/exr | road | down-res to 512 |
| Poly Haven: red_brick_03, red_brick, brick_wall_005, painted_brick, painted_worn_brick, whitewashed_brick, worn_brick_wall, concrete_brick_wall_001, yellow_brick | https://polyhaven.com/a/red_brick_03 | Rob Tuytel (red_brick_03); Dario Barresi + Dimitrios Savva (brick_wall_005) | CC0 (site licence page: "all licensed as CC0") | jpg/png | red, painted brick, brownstone | good |
| Poly Haven shutters: painted_metal_shutter, rusted_shutter, worn_shutter, rusty_metal_shutter, corrugated_iron_02, metal_grate_rusty | https://polyhaven.com/a/rusted_shutter | Dimitrios Savva; Charlotte Baglioni; Dario Barresi, Rico Cilliers | CC0 | jpg/png | roll-down gates, grates | good |
| Poly Haven sidewalks: concrete_pavement, pavement_01..06, concrete_floor_worn_001, concrete_floor_worn_02, concrete_pavers_03, grey_plaster | https://polyhaven.com/a/concrete_pavement | Poly Haven artists | CC0 | jpg/png | sidewalk, stoop, lintel | good |
| ambientCG Asphalt033, Asphalt031, Road007, Road012A | https://ambientcg.com/a/Asphalt033 | ambientCG | site FAQ: "released under the Creative Commons CC0 license" | 1K-8K jpg/png | road | good |
| ambientCG Bricks097, Bricks100, Bricks089, Bricks051 | https://ambientcg.com/a/Bricks097 | ambientCG | CC0 (same) | as above | brick | good |
| ambientCG PavingStones153, TactilePaving001 | https://ambientcg.com/a/PavingStones153 | ambientCG | CC0 | as above | sidewalk, curb ramp | good |
| ambientCG Grate002 | https://ambientcg.com/a/Grate002 | ambientCG | CC0 | as above | manhole/subway grate | good |
| ambientCG CorrugatedSteel009 | https://ambientcg.com/a/CorrugatedSteel009 | ambientCG | CC0 | as above | gates, awnings | good |
| ambientCG MetalPlates006, PaintedPlaster017, Plaster007 | https://ambientcg.com/a/MetalPlates006 | ambientCG | CC0 | as above | street plates, painted walls | good |
| Wikimedia Commons "Roller shutters": 50th St IND 8th Av 02.jpg | https://commons.wikimedia.org/wiki/File:50th_St_IND_8th_Av_02.jpg | Tdorante10 | CC BY-SA 4.0 (API extmetadata) | jpg 5152x3864 | reference or derived shutter/subway photo | photographic; needs credit and share-alike |
Note: `docs/CREDITS.md` already uses Poly Haven red_brick_03, painted_brick, asphalt_03, concrete_pavers_03, corrugated_iron_02, denim_fabric, cotton_jersey, brown_leather, and ambientCG Metal027. The new ones above are additions.

## Priority 3: street furniture
| Name | URL | Author | Licence | Format | Use |
|---|---|---|---|---|---|
| Retro Urban Kit | https://kenney.nl/assets/retro-urban-kit | Kenney | CC0 | 120 files | general street props |
| Traffic Road Assets | https://opengameart.org/content/traffic-road-assets | MilkAndBanana | CC0 | zip | hydrants, cones, barriers, street lights |
| Low Poly Fire Hydrant | https://opengameart.org/content/low-poly-fire-hydrant | _kev_dev | CC0 | blend | hydrant |
| Low Poly Textured Mailbox | https://opengameart.org/content/low-poly-textured-mailbox | Braveo | CC0 | zip, PS1-textured (author notes poly count may be high for PS1) | mailbox |
| PSX Low-poly Fire Hydrant | https://sketchfab.com/3d-models/none-1d2b139c1d1948918bf55d361d1132aa | korkskrew2000 | by-sa, 157 faces | | hydrant |
| Fire hydrant | https://sketchfab.com/3d-models/none-f05b0c2f9bcf41cea188a4b4c848068a | Lora | by, 946 faces | | hydrant |
| Mailbox | https://sketchfab.com/3d-models/none-5da6be4f85134c8ca247e1a453cb85ec | Low-poly Blast | by, 120 faces | | blocky mailbox |
| Low Poly Mailbox | https://sketchfab.com/3d-models/none-32f4c394020c49eca5974c9870dc79bd | ryan007oliver | by, 302 faces | | mailbox |
| Traffic Light [Low Poly] | https://sketchfab.com/3d-models/none-7c59b5b3860141f3ba476868521a737c | Islide | by, 154 faces | | signal |
| Traffic Light | https://sketchfab.com/3d-models/none-268a0c7e9cc7423ca612bdd7a780e1bb | Islide | by, 316 faces | | signal |
| Dumpster | https://sketchfab.com/3d-models/none-337b3a4424b745699cda776545070e04 | txnomod | by, 542 faces | | dumpster |
| Low Poly - Dumpster | https://sketchfab.com/3d-models/none-1299c0c5eeb94886a20bfdc00698d1f5 | Dandushik | by, 1,044 faces | | dumpster |
| Scaffolding | https://sketchfab.com/3d-models/none-3598d4508c8c4568a35e2ed00e4cd193 | Stewart Budd | by, 224 faces | | scaffolding |
| Low Poly Psx Street lamp | https://sketchfab.com/3d-models/none-81a8d1861bbd4cef8ab1aed2986bf873 | SaukrDev | by, 172 faces | | lamp |
| Trash Can. Low Poly | https://sketchfab.com/3d-models/none-6dfba42794e445719010caf0a1ceca7c | katykate | by, 356 faces | | bin |
| Low-Poly Manhole Cover | https://sketchfab.com/3d-models/none-307cd361c2584518a7bb0c81279ef5b0 | PolyDavid | by, 252 faces | | manhole |
| Low-Poly Manhole Cover/Grate | https://sketchfab.com/3d-models/none-7b13d5cac94d467fa01e746d64c2f6c3 | PolyDavid | by, 1,084 faces | | grate |
| Bus Stop [Low Poly] | https://sketchfab.com/3d-models/none-6c129121b1474f24816fa5244394f4a0 | Islide | by, 166 faces | | bus stop |
| Poly Haven models: fire_hydrant, metal_trash_can, street_lamp_01, water_manhole_cover, concrete_road_barrier | https://polyhaven.com/a/fire_hydrant (and same pattern) | Poly Haven artists | CC0 site licence | glb/fbx | realistic PBR, high poly: look-reference or heavy decimation only |
Not found as open low-poly: newsstand, parking meter (Sketchfab search returned no CC0/CC BY hit under 3,000 faces).

## Priority 4: cloth surfaces
| Name | URL | Author | Licence | Use |
|---|---|---|---|---|
| denim_fabric_03 | https://polyhaven.com/a/denim_fabric_03 | colormass (photo), Rico Cilliers | CC0 | denim (2.7 m wide scan) |
| denim_fabric, denim_fabric_04, _05, _06, denmin_fabric_02 | https://polyhaven.com/a/denim_fabric_04 | Poly Haven artists | CC0 | denim variants |
| cotton_jersey, jersey_melange, knitted_fleece, wool_boucle, poly_wool_herringbone | https://polyhaven.com/a/jersey_melange | Poly Haven artists | CC0 | tees, knit, hoodies |
| brown_leather, leather_red_02, leather_red_03, leather_white, fabric_leather_01/02 | https://polyhaven.com/a/leather_red_02 | Poly Haven artists | CC0 | jackets |
| ambientCG Leather037, Leather038, Leather039 (multi-angle scans) | https://ambientcg.com/a/Leather037 | ambientCG | CC0 | leather |
| ambientCG Fabric083, Fabric084, Fabric085, Fabric086 | https://ambientcg.com/a/Fabric085 | ambientCG | CC0 | cloth weaves, canvas-like |
No clean CC0 nylon or canvas photo found; ambientCG has no "denim" or "knitted" asset name (API search returned 0).

## Rejected (do not use)
1. Sketchfab "Low Poly Skateboard" by Levi (https://sketchfab.com/3d-models/none-2ad22ad416e74cc0a2a99567fd9c8f8e): CC BY but tagged "the-simpsons", derivative of another IP.
2. Sketchfab "CARBON MOTORS E7 TAXI (Cities Skylines)" by TSB3DMODELS: made for a commercial game; provenance of geometry unknown.
3. Sketchfab "Fifth Element - Police Hover Car": film IP.
4. Poly Pizza named real-car models (Mazda RX-7, Dodge Charger, Camaro ZL1, Range Rover, Toyota Hilux, Humvee): licences not opened and brand/IP risk; skipped.
5. Poly Pizza "Paid picks" Unity Asset Store rows (Synty, Polyart, etc.): paid ads, not free assets.
6. Quaternius site packs as "CC0": kept in tables but under the QAL conflict above (raw repository redistribution unresolved).
7. OpenGameArt "Trash can" (2D, GPL 2.0 and CC0), "Top-Down Dumpster" (2D): wrong type.
8. OpenGameArt "City Simulation" and "PS Tech": licence not readable by my parser; unverified, excluded.
9. Poly Haven models as low-poly vehicles/props: CC0 but high-poly PBR, wrong look (kept only as reference rows).
10. All of the Sketchfab results with no CC0/CC BY/CC BY-SA label were filtered out by my script and not recorded (NC, ND, store, standard licences). I did not count them.

## What I could not open or verify
- curl refused (HTTP 403): poly.pizza (opened instead through Firecrawl, which loaded it), opengameart.org SEARCH pages (item pages load fine with curl), itch.io (not opened by any route: no itch.io finds). Commons rate-limited (HTTP 429) after a few calls; its category URL guesses 404, only API category names that exist returned files.
- Not opened at all: texture.ninja (loads, no licence text found), 3dtextures.me (tags "cc0"; its licence page URL guess 404), cc0-textures.com (home says "CC0 Public Domain Textures", 3,314 items, per-item source not checked: treat as lead), freepbr.com, sharetextures.com (licence URL guess 404; home says "CC0 Textures & Models"), textures.com (not CC0 as far as known; not read). Treat all as unverified.
- No pack's own licence file/readme was opened. Triangle counts for the OpenGameArt single-car items are not checked. The Scouser texture pack's photo origin and size are unstated on the page. Sketchfab CC BY version (3.0 or 4.0) per item not read. Sketchfab "formats" were not checked beyond downloadable=true.
- Images were not looked at (no previews viewed), so "look" notes come from titles, tags and triangle counts only, except the PSX Style Cars description.
- Candidate count: P1 about 50 rows (some rows are packs), P2 about 30, P3 about 25, P4 about 6 groups. That is under the 60 to 100 individual target for fully verified items only because texture rows are grouped.
