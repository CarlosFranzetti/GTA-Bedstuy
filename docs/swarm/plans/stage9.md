# Stage 9 plan: GTA4-fidelity people and cars, and the map toward Bushwick

Written by the Opus manager (MGR) on 9 Nov 2026. It answers the user's two Stage 9 asks recorded in PRD.md ("Stage 9 asks") and on the
board as PLAN9. It is a plan, not a commitment of exact numbers: every figure below is a target that a lane must measure and report.
The street survey that part B depends on (which streets, in what order, at what angles) is being written by GEO2 into
`docs/reference/EXPANSION.md`. Part B is written so that survey can fill in the names without changing the engineering.

The user's words, kept as the yardstick:
- (a) "up the polygons to make them look more like GTA 4, maybe use smarter polygon groupings and textures" for people and cars;
- (b) "expand the blocks to about 12 blocks in the direction of Bushwick; I also want Halsey St and Bushwick Ave".

And the BIBLE's question still applies to both: would someone want to live in this Bed-Stuy for a day? More polygons and more blocks
are worth doing only if the street stays alive, the frame rate stays smooth and the phone still plays.

---

## Part A: GTA4-fidelity people and cars, as a level-of-detail chain

### A.1 Principle

GTA4 did not get its look from triangle counts alone. It got it from **where** the triangles go and from what the textures carry:
- edge loops where bodies bend and where the eye looks (shoulders, elbows, knees, wrists, the jaw and brow, the fingers as a group);
- cars built as real panels with gaps, wheel arches with lips, separate glass with thickness;
- textures that carry the fine detail: a painted albedo, a normal map for folds, seams, stitching and panel lines, and a roughness map
  so leather, denim, chrome, rubber and paint read as different stuff.

So the plan is a three-step level-of-detail (LOD) chain per character and per car. The GTA3 bodies SKINS just built become the middle
step, and the phone keeps them as its nearest step. Nothing is thrown away.

### A.2 The chain

| step | people | cars | used for |
|---|---|---|---|
| **near (new)** | 2,000–3,000 tris; welded hull kept (the user's GTA3 construction rule still holds for silhouette) but with edge loops at shoulders, elbows, knees, wrists, neck, jaw and brow; mitt hands become a 4-finger block plus a thumb; a face with real planes (brow ridge, nose wedge, cheek, jaw), still with the painted eyes and mouth | 6,000–8,000 tris; real panel topology (bonnet, doors, boot as separate shells with 1–2 cm gaps), wheel arches with a lip, rubber tyres with a sidewall and tread band, chrome trim strips, glass with thickness, interior silhouette (seats, wheel) | within ~25 m of the camera (people) and ~35 m (cars), medium and high |
| **mid** | today's GTA3 body from SKINS (600–900 tris, 11 meshes) | today's procedural body from CARS2/SKINS (≈2.5k tris) | 25–60 m people, 35–72 m cars on medium/high; **the nearest step on low and phone** |
| **far** | merged crowd proxy (2 draws per crowd cell, instanced) | CarLod merged far model (one instanced draw per type) | beyond the mid range; unchanged |

**Draw calls are the real limit, not triangles.** Medium is at 489 on the worst view today, so the near step must not add meshes:
- **People, near:** at most 3 meshes per person (body, head with hair, accessory), down from 11, by baking clothes, shoes and skin
  into one atlas. Triangles go up about 3×; draws per person go down.
- **Cars, near:** at most 6 meshes per car: body+trim, glass, lamps (emissive), wheels (all four merged), interior, plate.
  Today it is about 17. **This is the merge Fable already put on the Stage 9 list.** It pays for the extra triangles and gives the
  medium tier back about 60 draws on the golden aerial.

### A.3 Textures

- People: one 512×512 atlas per variant (albedo), plus a shared 512×512 normal and roughness atlas per clothing family (hoodie,
  puffer, suit, dress, uniform, work wear) so 19 variants do not need 19 normal maps. Painted in code (procedural painters), as now.
  Phone: 256×256 albedo only (as SKINS already does for cars).
- Cars: one 1024×512 skin atlas per body type with albedo (paint, decals, grime), normal (panel lines, rivets, rubber seals), and a
  roughness/metal map (chrome, glass, paint, rubber). Baked ambient occlusion in the albedo (wheel wells, door gaps, under bumpers).
  Paint colour stays a uniform so colour variants cost nothing. GFX2's clear coat applies on top (Fable's decision 3, 9 Nov).
- Size: all procedural, so the artifact grows only by code (~50–100 KB). No downloaded models; the licensing rules in PRD §2.1 hold.

### A.4 Budgets per tier (to measure, not assume)

| tier | people near / mid range | cars near / mid range | per-frame target on the 7 viewpoints |
|---|---|---|---|
| high | 25 m / 60 m | 35 m / 72 m | < 600 draws, < 4.5 M tris |
| medium | 20 m / 60 m | 30 m / 72 m | **< 500 draws**, < 3.5 M tris |
| low | — / 60 m (mid is nearest) | — / 72 m | < 400 draws, < 2.0 M tris |
| phone | — / 40 m (mid is nearest) | — / 50 m | **≤ 140 draws, ≤ 500 k tris** (unchanged) |

Cap on simultaneous near models (medium): 12 people and 8 cars, the nearest by distance. Anything beyond falls back to mid even
if it is inside the near range, so a crowded corner cannot blow the budget.

### A.5 Lanes for part A

| lane | owns | delivers |
|---|---|---|
| **PEDHI** | `src/entities/models/pedBody*.ts` (a new `pedBodyHi.ts`), `src/textures/painters/ped*.ts`, `tests/unit/entities/ped*.test.ts` | near bodies for all 19 variants within the triangle and mesh targets; normal/roughness atlases per clothing family; a group close-up and a 4 m in-game frame judged against the user's GTA3 construction rule (silhouette) and against GTA4 (detail) |
| **CARHI** | `src/entities/models/carModel*.ts` (a new `carModelHi.ts`), `src/entities/models/carSkin.ts`, `src/textures/painters/vehicleSkin.ts`, `VEHICLE_SPECS` in `src/entities/Vehicle.ts` (sizes only), `tests/unit/entities/car*.test.ts` | **first** the mesh merge on the existing mid cars (≤ 6 meshes per near car), measured on the medium viewpoints; then the real-car roster of A.6 at near, mid and far quality |
| **LOD9** | `src/render/CarLod.ts`, a new `src/render/PedLod.ts`, `src/render/QualityTier.ts` ranges, `tests/unit/render/lod*.test.ts` | the near/mid/far switching with hysteresis (no flicker at the boundary), the near caps, and the pop-in check (`scripts/popin-check.mjs`) extended to people |

Order: CARHI's mesh merge first (it frees the budget), then PEDHI and CARHI in parallel, then LOD9 switches them on per tier.

### A.6 Cars modelled after actual cars (user ask, 9 Nov): the CARHI roster

The user asked for "cars modelled after actual cars". CARHI builds its near bodies (and matching mid and far versions) as a roster of
the vehicle types that are really common on Bed-Stuy streets. Each one is built to the **public spec-sheet proportions** of the real
type (overall length, wheelbase, width, height, front and rear overhang, greenhouse height and the angle of the A and C pillars), so
a New Yorker recognises the shape at a glance. Each one carries a **parody name and a generic badge**, never a real maker's name,
logo, grille emblem or trademarked livery (PRD §2.1).

The dimensions below are my approximate starting values from general knowledge, in metres. **CARHI must check each one against a
public spec sheet** (the maker's published specifications or an encyclopedia entry), record the source in its report, and correct
the table. Proportions matter more than the last centimetre.

| real type it is modelled on | parody name (proposal) | role in the game | length | wheelbase | width | height | notes |
|---|---|---|---|---|---|---|---|
| Ford Crown Victoria (yellow cab) | Crown Regent Cab | older yellow cab | ≈ 5.39 | ≈ 2.91 | ≈ 1.99 | ≈ 1.47 | long boxy 3-box sedan; roof sign; chequer stripe; T&LC-style number on the door (invented numbers) |
| Ford Crown Victoria (old cruiser) | Crown Regent Interceptor | older patrol car | same | same | same | same | push bar, roof light bar; parody "NYPD-style" livery with an invented department name |
| Dodge Charger | Charge-R Pursuit | current patrol car | ≈ 5.04 | ≈ 3.05 | ≈ 1.91 | ≈ 1.48 | long bonnet, short boot, high beltline; light bar; same parody livery |
| Toyota Camry | Kamari | mid-size sedan (common) | ≈ 4.88 | ≈ 2.83 | ≈ 1.84 | ≈ 1.45 | |
| Honda Accord | Akkord | mid-size sedan | ≈ 4.88 | ≈ 2.83 | ≈ 1.86 | ≈ 1.45 | fastback roofline |
| Nissan Altima | Altimo | mid-size sedan; also the livery-car sedan | ≈ 4.90 | ≈ 2.83 | ≈ 1.85 | ≈ 1.45 | |
| Honda Civic | Civitas | compact | ≈ 4.63 | ≈ 2.70 | ≈ 1.80 | ≈ 1.42 | |
| Ford Explorer | Expedio | mid-size SUV | ≈ 5.05 | ≈ 3.03 | ≈ 2.00 | ≈ 1.78 | |
| Chevrolet Tahoe | Tahoma | full-size SUV (also unmarked/black-car use) | ≈ 5.35 | ≈ 3.07 | ≈ 2.06 | ≈ 1.93 | |
| Dodge Grand Caravan | Grand Caravel | livery cab / family minivan | ≈ 5.15 | ≈ 3.08 | ≈ 2.00 | ≈ 1.75 | sliding door line; livery plate style (invented) |
| Mercedes-Benz Sprinter (144 in., high roof) | Sprinta | delivery / work van | ≈ 5.93 | ≈ 3.66 | ≈ 2.02 | ≈ 2.7 | tall boxy body; parody courier liveries |
| Isuzu NPR with a 16 ft box | Izu N-Series | box truck (replaces today's) | ≈ 7.0–7.6 | ≈ 3.8 | cab ≈ 2.0, box ≈ 2.4 | ≈ 3.3 | cab-over; the three cargo liveries from GTA4A carry over |
| 40 ft low-floor city bus (New Flyer / Nova type) | Metro Low-Floor 40 | city bus on B38/B43-style routes (invented route signs) | ≈ 12.2 | ≈ 6.2 | ≈ 2.59 | ≈ 3.2 | needs traffic support for a 12 m vehicle (turning radius, stop behaviour): a separate traffic task |
| Ford E-350 / Transit 15-passenger | Dollar Van (Econo 15) | Brooklyn dollar van | ≈ 5.9–6.0 | ≈ 3.5–3.75 | ≈ 2.0–2.1 | ≈ 2.1–2.8 | tinted rear glass, roof rack or ladder; ties into the "Dollar Van Last Run" mission |

Rules for the roster:
- **No real logos or names.** Grilles get generic shapes; badges are invented marks; liveries for taxi, police and transit use
  invented department names and numbers, styled after the real look but not copying any mark.
- **Same LOD chain** as A.2: each type gets near (6–8k tris, ≤ 6 meshes), mid and far versions, and its own skin atlas.
- **Spawn mix** follows the street: yellow cabs and livery cars on the avenues, sedans and SUVs parked on the rowhouse streets,
  vans and box trucks double-parked by shops in the morning, the bus on Lafayette, dollar vans on the avenues. TrafficSystem's spawn
  table (a FOR FABLE or CROWD/traffic owner change) gets per-street weights.
- **Physics** keeps using the spec box per type (`VEHICLE_SPECS`), so handling, collisions and the camera rig (which already scales
  with length and height) pick up the new sizes. The bus and the box truck need a turning-radius check in the traffic sim.
- **Gate:** a lineup frame of all 14 types side by side at the same scale, plus each next to a measured silhouette outline from its
  spec dimensions, so the proportions can be judged by eye; the 5-minute city sim stays green with the new sizes.

CARHI therefore owns, in this order: (1) the mesh merge on today's cars; (2) the roster at near quality, with the spec table
corrected and sourced; (3) mid and far versions; (4) the spawn-mix proposal for the traffic owner.

---

## Part B: the map toward Bushwick

### B.1 What changes geographically

Today the map is ten blocks: three north–south avenues (Tompkins, Throop, Marcus Garvey) and six east–west streets (Hart to Greene),
all axis-aligned in game space. The user wants about twelve more blocks toward Bushwick, with Halsey St and Bushwick Ave.

In the real city, Halsey St is several streets south of Greene, and the Bed-Stuy grid meets Broadway (with the J/M elevated train
above it) at an angle. Bushwick Ave lies beyond Broadway in Bushwick and also runs at an angle to the Bed-Stuy grid. GEO2's
`EXPANSION.md` will give the exact street list, order and angles from open sources. Two facts already shape the engineering:
1. **Halsey St is orthogonal** to our grid, so reaching it is ordinary expansion.
2. **Broadway and Bushwick Ave are diagonal** to our grid, and the streets on the far side of Broadway follow a different grid.

One honest note for the user: reaching Halsey from Greene passes several real streets we do not model today (and the earlier
decision left DeKalb out between Pulaski and Kosciuszko). EXPANSION.md must say whether we insert the real streets between Greene and
Halsey or compress them, because "about twelve blocks" and "Halsey St" may not both fit unless we compress. That is a decision for
Fable and the user, not for a lane; I recommend inserting the real streets and letting the block count fall where it falls.

### B.2 The core engineering choice: how to support diagonal streets

The code assumes axis-aligned streets in about 20 places across 17 files (`axis === 'ns' | 'ew'`, `offset`, `isOnRoad`,
`streetById`): Grid, RoadBuilder, WorldBuilder, FurnitureGen, the props (signals, curbside, clutter, poles, billboards), signBlades,
TrafficLights, TrafficSystem, Minimap, missions' places, and the data schema and geo importer.

**Option 1: generalise to polyline streets.** Every street becomes a centreline polyline with a width. Intersections are computed
geometrically; blocks become arbitrary polygons; lots are laid along polygon edges; lanes and sidewalks are offsets of polylines.
- For: one model for everything; real angles everywhere; future-proof.
- Against: touches all 17 files at once, including the most-tested ones (Grid, RoadBuilder, TrafficAgent behaviour at
  intersections). Every lot, prop and mission position would move or need re-validation. High risk of breaking the GTA3-level
  viewpoints we just reached.

**Option 2: a second, rotated grid stitched at Broadway.** Keep today's axis-aligned grid model unchanged for Bed-Stuy and its
orthogonal expansion. Model the Bushwick side as a second instance of the same grid model in its own local frame (rotated by the real
angle). Broadway itself is the one special street: a straight diagonal boulevard that both grids end against, with triangular and
trapezoidal "seam" blocks along it, built by a dedicated seam builder.
- For: all existing code keeps working inside each grid (the axis-aligned assumptions hold in each grid's local frame); the risky
  work is confined to the seam and to the few systems that cross it (traffic lanes, the sidewalk graph, the minimap).
- Against: two frames to keep consistent; the seam blocks need their own lot layout; traffic must hand off between grids.

**Decision: Option 2**, a rotated second grid stitched at Broadway, with these rules:
- `GridModel` gains a `frame` (origin + angle). Every existing function keeps working in local coordinates; a thin world↔local
  transform is applied at the edges (building placement, physics colliders, lane and sidewalk node positions, the minimap).
- Broadway becomes a `seam` street type: one straight centreline, its own road and sidewalk builder, and the el above it.
- The lane graph and the sidewalk graph are **one graph** in world space; each grid contributes its nodes transformed to world, and
  the seam builder adds the connecting edges at each crossing street. TrafficAgent never needs to know which grid it is in.
- If a later stage needs truly curved or multi-angle streets, Option 1 can still be done then, from a working two-grid baseline.

### B.3 Keeping the frame budget: chunks

Doubling the world must not double the draws. The world is already merged per cell and culled by distance, so:
- **Chunks of 2×2 blocks.** Each chunk builds its buildings, roads, props and parked cars into its own merged cells. Chunks beyond
  ~180 m (medium; 110 m on phone, where fog ends the view) are hidden as a unit. Build everything at load (it is procedural and
  deterministic); a later step can build chunks lazily if load time grows past ~1.5× today's.
- **Skyline ring moved out** to start beyond the new outer edge (and re-centred), so it never overlaps real blocks.
- **Traffic and pedestrians** keep their current counts per tier and spawn in a ring around the player (CROWD's scheduler already
  recycles far pedestrians into a 62–115 m ring; traffic gets the same). Density stays the same per block; the city does not get
  emptier because it got bigger.
- **Colliders:** the 2D physics world already uses a spatial hash; check the static-collider count (about 4,000 today) at double size
  and the frame time of `overlapsStatic`.

### B.4 Data: real lots for every new block

- GEO2's importer extended to the new bounding box: MapPLUTO lots (reachable now) for widths, floors, building class and land use,
  and NYC building footprints where they help. OpenStreetMap stays optional (Overpass is still blocked).
- Every new lot carries a source and confidence, as today; filler lots say so in their note.
- **Mission POIs and the three interior doors do not move.** A test asserts their world positions are identical before and after.
- The ODbL/PLUTO attribution lines are updated for the new area.

### B.5 Landmark: the J/M el on Broadway

A procedural elevated structure along Broadway: steel columns every ~12 m, the girder deck, the track bed, and at least one station
house (Kosciuszko St or Gates Av, whichever falls inside the expansion per EXPANSION.md), with stairs to the corners. Instanced
columns (one draw for all columns, one for the deck per chunk). A train every few minutes is a nice-to-have, not a requirement. Night:
the deck casts the striped light-and-shadow pattern on the street below that people remember from Broadway.

### B.6 Phases

**Phase B1 — orthogonal expansion (no diagonal streets yet).**
1. GEO2 finishes `EXPANSION.md`: the exact streets south to Halsey and east to the line where Broadway begins, with angles and order.
2. Fable and the user decide insert-versus-compress for the streets between Greene and Halsey.
3. **GRID9** extends `bedstuy.json` streets and the axis-aligned grid south and east; chunked building and culling; skyline moved out.
4. **GEO3** imports PLUTO lots for the new blocks.
5. CROWD-style audits re-run for density per block; the seven viewpoints keep their numbers; three new viewpoints are added in the new
   area (a Halsey St view, a corner near Broadway, an aerial over the new blocks).

**Phase B2 — the diagonal streets and the el.**
1. **GRID9** adds the grid `frame` and the Broadway seam street; the Bushwick-side grid in its rotated frame, including Bushwick Ave
   per EXPANSION.md.
2. **ROADS9** builds the seam: Broadway road, sidewalks and crossings, the triangular seam blocks, the traffic and sidewalk
   connections across the seam.
3. **EL9** builds the J/M el and a station house.
4. **GEO3** imports PLUTO lots for the Bushwick side.
5. A blind playtest walks and drives from the spawn to Bushwick Ave and back, day and night.

### B.7 Lanes for part B, with file ownership

| lane | owns | phase |
|---|---|---|
| **GEO2** (continuing) | `docs/reference/EXPANSION.md`, `scripts/import-osm.mjs`, `src/world/data/geo.ts`, `src/world/data/raw/**` | survey before B1 |
| **GRID9** | `src/world/Grid.ts`, `src/world/types.ts` (frame, seam street type, via FOR FABLE), `src/world/data/bedstuy.json` streets block, `src/world/data/schema.ts`, `src/world/WorldBuilder.ts`, chunking in `src/render/Culling.ts`, `src/world/Skyline.ts` ring placement, `tests/unit/world/grid*.test.ts` | B1, B2 |
| **GEO3** | lot data in `src/world/data/bedstuy.json` for the new blocks (faces/lots only), `tests/unit/world/real-blocks*.test.ts` | B1, B2 |
| **ROADS9** | `src/world/RoadBuilder.ts`, a new `src/world/SeamBuilder.ts`, `src/world/FurnitureGen.ts` and `src/world/props/*` where they assume axes, `src/game/TrafficLights.ts`, lane/sidewalk stitching in `src/game/TrafficSystem.ts`, `tests/unit/world/roads*.test.ts`, `tests/unit/sim/*` | B2 |
| **EL9** | a new `src/world/landmarks/el.ts` and its painters, `tests/unit/world/el.test.ts` | B2 |
| **MAP9** | `src/ui/Minimap.ts` (world-space drawing for the second grid, new street names), `src/game/missions/content/places.ts` only if a place helper assumes axes | B2 |
| playtester | `playtests/h9*` | after B1 and after B2 |

`src/main.ts` changes go through Fable, as always.

### B.8 Order across both parts

1. CARHI mesh merge (frees draw budget) and GEO2's EXPANSION.md, in parallel.
2. Fable and the user decide insert-versus-compress; GRID9 phase B1 with GEO3; PEDHI and CARHI near bodies in parallel (different files).
3. LOD9 switches on the near bodies per tier; budgets measured on the 7 + 3 viewpoints.
4. Blind playtest of the expanded orthogonal map and the new people and cars.
5. GRID9 and ROADS9 phase B2, EL9 and MAP9 in parallel; GEO3 for the Bushwick side.
6. Blind playtest across the seam; Stage 9 check-in.

---

## Risks

| risk | mitigation |
|---|---|
| The medium tier passes 500 draws with more city and more detailed models | CARHI's mesh merge first; near caps (12 people, 8 cars); chunk culling; measure all 10 viewpoints after every lane |
| Phone gets heavier | phone keeps mid bodies as nearest, shorter chunk range (110 m), fog; ≤ 140 draws and ≤ 500 k tris gate on all viewpoints |
| Diagonal seam breaks traffic (deadlocks, cars leaving the road at the seam) | one world-space lane graph; the 5-minute city sim must stay green on both seeds plus a new seam seed; a seam-only traffic test |
| Existing lots, props or missions move | a test that the existing ten blocks' geometry hash and all POI and door positions are unchanged after B1 and B2 |
| Load time grows | measure time to `__gtaReady`; if over 1.5× today's, build distant chunks lazily |
| The street list is wrong or compressed without saying so | EXPANSION.md cites open sources per street; the insert-versus-compress decision is recorded in PRD §5 |
| Pop-in at chunk edges and LOD boundaries | the pop-in check runs on the new routes and for people; hysteresis on every switch |
| The near bodies lose the GTA3 charm the user asked for in Stage 8 | silhouettes stay welded and chunky; detail goes into edge loops and textures, not into realism; MGR judges near and mid side by side |
| Licensing | procedural only; no downloaded models; open data only for lots (PLUTO, NYC footprints, OSM if allowed); no Google data |

## Gates (every lane, plus these)

- `npx tsc --noEmit` clean; `npx vitest run` all green with no new skipped tests; build ok; artifact ≤ 12 MB.
- Smoke `errors: []` at low, medium and phone.
- **Draw and triangle budgets** (A.4) on all seven current viewpoints plus three new ones in the expansion.
- Walkable sweep (`tests/unit/sim/walkable.test.ts`) over every new sidewalk, including the seam; parked cars never on a sidewalk.
- Five-minute traffic sim green on seeds 7 and 21 and on a seam seed.
- Night band (dry, from 22h) on the new viewpoints.
- Pop-in check finds nothing within 60 m on the Throop walk, an east–west walk, an avenue drive and a drive along Broadway.
- Unchanged positions of all mission POIs and the three interior doors.
- A blind playtest after each phase.
