# CARS5: vehicle sizes, the hovering look, real-vehicle shapes (22 Nov 2026)

Status: in progress (written early, kept current). Lane CARS5, vehicle artist-programmer.

## Owner's words (22 Nov)
- Large cars, SUVs and trucks feel larger and longer than they should against sedans and sports cars.
- "The car geometry feels off: model them on real world vehicles."
- Car shadows look wonky from some views: the car hovers over the street without wheels.

## Part 1: what I measured (before any change)
Tool: `tests/unit/entities/cars5-measure.test.ts` (writes `scratchpad/cars5/measure-before.csv`), builds every type at the
high and low detail level and takes bounding boxes of the drawn meshes and the instanced wheel set.
Finding 1: the drawn mesh equals the spec to within 0.01 to 0.03 m for every passenger type (loft is scaled to spec / style `dims`),
so the collider (OBB halfW x halfL from the spec) and the picture agree. The sizes are not a model-versus-spec bug.
Finding 2: the specs ARE published figures, but of the biggest common model of each class: sedan = a current mid-size sedan (4.88 m),
pickup = the F-150 crew cab 5.5 ft bed (5.885 x 2.03 x 1.96, matches Edmunds 2022 exactly), bigsuv 5.55 m (a 2022 Tahoe is 5.35),
cargo van = high-roof extended (5.98 x 2.78). Next to a compact or typical sedan these read as a different scale of thing.
Finding 3: truck and van wheels look small: ground clearance of the body is 0.14 to 0.45 m on vans and trucks, wheel diameter 0.74 to 0.81.
Tables: see below. Line-up: `scratchpad/cars5/lineup/before-side.jpg`, `before-front.jpg` (`scripts/carlineup.mjs`).

### Measured table, BEFORE (drawn mesh, high detail; m; spec in brackets)
| type | spec L x W x H | drawn L x W x H | wheel dia | wheelbase | body underside | tyre outer track |
|---|---|---|---|---|---|---|
| sedan | 4.88 x 1.84 x 1.45 | 4.89 x 1.82 x 1.45 | 0.68 | 2.82 | 0.21 | 1.67 |
| suv | 5.05 x 2.00 x 1.78 | 5.06 x 1.98 x 1.79 | 0.76 | 3.03 | 0.27 | 1.83 |
| pickup | 5.885 x 2.03 x 1.96 | 5.90 x 2.01 x 1.96 | 0.78 | 3.68 | 0.30 | 1.85 |
| bigsuv | 5.55 x 2.00 x 1.95 | 5.56 x 1.98 x 1.96 | 0.80 | 3.30 | 0.30 | 1.82 |
| cargovan | 5.98 x 2.06 x 2.78 | 5.99 x 2.10 x 2.80 | 0.74 | 3.75 | 0.36 | 1.90 |
| boxtruck | 7.00 x 2.44 x 3.30 | 7.03 x 2.48 x 3.28 | 0.81 | 3.81 | 0.14 | 1.96 |
| hatch | 4.06 x 1.70 x 1.52 | 4.07 x 1.68 x 1.52 | 0.60 | 2.53 | 0.21 | 1.53 |
| coupe911 | 4.78 x 1.85 x 1.28 | 4.79 x 1.84 x 1.28 | 0.69 | 2.76 | 0.14 | 1.68 |
| cab / cop | 5.39 / 5.04 | 5.40 / 5.06 | 0.68 / 0.70 | 2.91 / 3.05 | 0.21 | 1.83 / 1.75 |
Drawn minus spec is under 0.03 m everywhere (mirrors add 0.02 to the width, the cop lightbar to its height). Bus, garbage and work
trucks also match. Full CSV of all 37 types: `scratchpad/cars5/measure-after.csv` (after) and the first run's printout in this file's history.

### What was wrong with the sizes
Not a model-versus-spec fault. Every spec was a real published figure, but always the BIGGEST common model of the class:
sedan = current Camry-class mid-size (4.88), SUV = three-row Explorer-class (5.05 x 2.00), pickup = F-150 crew cab (Edmunds 2022:
231.7 in = 5.885 m long, 79.9 in = 2.03 m wide, 77.2 in = 1.96 m high, wheelbase 145.4 in = 3.69 m: our pickup was exactly this),
big SUV 5.55 (a 2022 Tahoe is 210.7 in = 5.35 m by Edmunds), vans = high-roof extended (5.98 x 2.78). A compact sedan (2022 Civic by the
maker: 184.0 in = 4.67 m, 70.9 in = 1.80 m, 55.7 in = 1.415 m, wheelbase 107.7 in = 2.74 m) next to those looked like a different scale.
Fix: class-typical sizes, not top-of-class. Spec, collider (OBB from the spec), camera hint, body loft (`dims` in carBodies STYLES), seats, doors,
lamps and parking slots all read the same numbers, so they follow. The loft scales per axis (kx = L / Lref, ky = H / Href) and the wheelbase scales with
it (axle 0.578 L on the sedan, as the real car), tyres keep their real diameter, so a shorter car has relatively bigger wheels.

### New sizes (m)
| type | before L x W x H | after L x W x H | basis |
|---|---|---|---|
| sedan | 4.88 x 1.84 x 1.45 | 4.82 x 1.83 x 1.44 | between a 2022 compact (Civic, maker) and the Camry XV70 (4.88, the earlier lane's search) |
| suv | 5.05 x 2.00 x 1.78 | 4.85 x 1.93 x 1.74 | mid-size 2-3 row class (estimate from memory: Highlander / Edge class 4.8 to 4.95); the police SUV keeps 5.05 x 2.00 (Explorer-based) |
| crossover | 4.694 x 1.867 x 1.68 | 4.60 x 1.85 x 1.66 | compact crossover class (RAV4-like 4.6 x 1.86 x 1.69, estimate) |
| bigsuv | 5.55 x 2.00 x 1.95 | 5.35 x 2.05 x 1.92 | 2022 Tahoe, Edmunds |
| pickup | 5.885 x 2.03 x 1.96 | 5.60 x 2.00 x 1.90 | short-bed crew / extended cab class (estimate; the F-150 crew cab 5.5 ft bed is 5.885 per Edmunds) |
| wagon | 4.95 x 1.84 x 1.50 | 4.85 x 1.83 x 1.50 | follows the sedan |
| cargovan, ambulance, dollarvan | 5.98 x 2.06 x 2.78 | 5.70 x 2.03 x 2.62 | between a medium-roof Transit / ProMaster and a high roof (estimate); a Transit Connect is 190.0 in = 4.83 m by Edmunds, so this is the full-size van |
Unchanged because already class-typical: hatch 4.06 (Yaris-class 4.07), cab 5.39 (Crown Victoria 5.38), cop 5.04 (Charger 5.09), pony, muscle,
coupe911, exotic, minivan 5.175 (Sienna 5.18), boxtruck 7.0 (16 ft box on a medium-duty chassis), garbage, bus 12.5, limo, classic, trucks.
Camera hints reduced with the length: pickup camDist 0.8 to 0.6 and camHeight 0.4 to 0.35, bigsuv 0.6 to 0.45 and 0.3 to 0.25 (Camera.ts adds length above 4.6 m itself).
Ratios now (length / height against the sedan): suv 1.01 / 1.21, crossover 0.96 / 1.15, bigsuv 1.12 / 1.33, pickup 1.17 / 1.32, cargo van 1.19 / 1.82.

### Reference table of real vehicles (published figures I could open, then estimates)
Opened this session: Honda Civic 2022 sedan (hondanews.com 2022 Civic Sedan Specifications: 184.0 x 70.9 x 55.7 in, wheelbase 107.7 in, tyres
215/55R16 to 235/40R18); Ford F-150 2022 SuperCrew 5.5 ft (edmunds.com/ford/f-150/2022/features-specs: 231.7 x 79.9 x 77.2 in, wb 145.4 in);
Chevrolet Tahoe 2022 (edmunds.com/chevrolet/tahoe/2022/features-specs: 210.7 x 81.0 x 75.8 in, wb 120.9 in); Ford Transit Connect cargo 2022
(edmunds.com: 190.0 in long, 84.1 in wide with mirrors, 72.0 in high, wb 120.6 in); Ford Explorer 2007 (edmunds.com: 193.4 x 73.7 x 72.8 in, wb 113.7 in).
The Edmunds RAV4 page showed only the overview in my excerpt (no dimensions): the RAV4 figure is from memory.
From the earlier lanes' comments in carBodies.ts (their own searches, 9 Nov): Camry XV70 4.88 x 1.84 x 1.45, wb 2.825; Explorer 2020 5.05 x 2.00 x 1.78,
wb 3.03; Crown Victoria 5.39 x 1.99 x 1.44, wb 2.91; Yaris-class hatch 4.06 x 1.70 x 1.52, wb 2.53.
Estimates (from memory, not opened): Tacoma double cab 5.4 x 1.9 x 1.8; Sprinter / ProMaster 5.9 x 2.0 x 2.4 to 2.8; NPR 16 ft box 6.9 x 2.4 (body) x 3.3;
40 ft transit bus 12.2 x 2.6 x 3.3; tyre outer diameters 0.60 (hatch, 195/65R15) to 0.81 (pickup, 275/60R20) and 1.0 (bus, 275/70R22.5).

## Part 2: the hovering look
Reproduced in the running game (hosted build, `?perf=0&q=low`, canvas hidden, `scratchpad/cars5/tools/shot.cjs`): test cars spawned
through `traffic.makeVehicle`, cameras chase 4.5 m behind, side at 1.6 m, three-quarter at 1.5 m, across 9 m, above 15 m, at noon and 17:30.
Before frames: `scratchpad/cars5/game-before/` (noon, 8 types), `game-before2/` (17:30), `game-park-before/` (17:30 in real parked slots).
Causes found, in order of weight:
1. The car blob (the only contact shadow that is not a sun shadow map) was drawn UNDER the body. `CAR_BLOB_SCALE` 1.28 x 1.18 with an
   alpha edge at 0.62 / 0.72 of the unit plane put the whole soft edge at 0.40 of the car's width from the centre, inside the flanks (the body
   edge is at 0.5). So no darkening was ever visible around a car from any view. It also was switched OFF on low, medium and high
   (`blobShadows: false` in QualityTier) because they have a sun shadow map.
2. The sun shadow map is the only shadow on those tiers, and cars never receive shadow (`receiveShadow = false` in `CarLod.applyCarShadowFlags`);
   the shadow caster of a car that has a far hull is `coarseCarHull`, two boxes (`AoProxy.ts`), and wheels never cast. With the low sun the
   shadow falls away from the car and the strip of road beside the wheels stays fully lit: tyre contact has no dark, from the three-quarter
   and chase views the body floats on lit asphalt (seen in `game-before2` taxi, van and box truck).
3. Tyre rubber was `#161616` with an unlit sidewall: black against black shaded asphalt and dark arches, so the wheel vanishes in shade
   (dark side of the street) and in the long shadow of buildings.
Not the cause (checked): drawn size equals spec; wheels are present at every detail level (the near, lite and far models all have four wheels:
`car-lod-tris.test.ts` builds them); the tyre outer face sits 0.03 to 0.08 m inside the body flank on cars (sedan track outer 1.67 against body 1.82)
and 0.10 on vans; the arch lip is 0.05 m over the tyre top (`archOf`), arches have liners (`wheelLiner`); ride height and wheel contact y = 0 are right
(body underside 0.14 to 0.45 m by class, tyre radius = pivot height).
Fixes:
* `BlobShadows.ts`: the car decal now reaches about 0.4 m past the flanks and 0.45 m past the bumpers (`CAR_BLOB_SCALE_W/L` 1.5 / 1.22, new
  `carBlobAlpha` with a dark core over the whole footprint and a soft edge); `setEnabled(false)` (tiers with a sun shadow map) keeps the CAR blob on
  at 0.6 of its weight as a contact / ambient shadow and drops the pedestrian blob. One instanced draw call for all cars, no triangles per car beyond 2,
  no texture memory change (the same 64 px alpha texture). No main.ts edit needed: `setEnabled` keeps its signature.
* `textures/painters/vehicle.ts`: tyre rubber `#222223` (was `#161616`), ribs a step lighter. Same canvas size, so no texture memory change.
Not done for part 2: a per-tyre contact patch and an ambient shadow that follows the body outline (the decal is a rounded box), a car-receives-shadow
change (kept off: it would double the sun shadow and cost shadow-sampling on every car material), and a wheel arch painted lighter.

### Evidence (frames at 640 x 360, software rendering; no frame rates)
* `scratchpad/cars5/lineup/before-side.jpg`, `before-front.jpg`: all 45 types at one scale (`scripts/carlineup.mjs`, orthographic, 1.75 m figure, 5 m ruler).
  `after-side.jpg`, `after-front.jpg`: 16 main types after the change (sedan has since moved from 4.78 to 4.82 m; the picture shows 4.78).
* Hover, before: `game-park-before/before-17.5-sedan-q3.jpg` (a parked sedan at the kerb at 17:30 seen from 3.5 m: smooth grey body, dark wheel stubs, no
  contact shadow, the car floats; it is the far proxy, 8-gon wheels); `game-before2/sheet-q3.jpg` (taxi, van, box truck lit and unshadowed).
  After: `game-park-after/` and `game-after/` (same cameras; the traffic of the two runs differs, so a car is not the same pair in every frame).
* In-game numbers from `renderer.info` at 17:30, low tier, same camera family: 400 to 430 k triangles and 190 to 238 draw calls before, 380 to 437 k
  and 199 to 232 after (the traffic differed between the two runs, so the +/- is traffic, not the change; the blob is by design +1 draw call).

## Part 3: shapes after real vehicles: NOT redone
I looked at the line-up and at the style data first. The 29 loft styles in `carBodies.ts` were already built from published figures by CARS12, CARS14 and
CARS2: each has its real wheelbase (axle position), hood / cabin / deck breakpoints (`secs`), windshield and rear-glass rake, belt height, tumblehome (`plan`), era
lamp and grille type, and the van and truck boxes. The sedan's wheelbase is 0.578 of its length (the real car 0.579). Re-proportioning them again by eye without a
side-by-side with open photos would have risked making them worse, and my budget went into parts 1 and 2. What the line-up shows that could still be improved
(not done): the cab, cop and wagon read alike in side view; the hatch reads as a wagon; the pickup bed side is a flat slab; the 1990s three-box
flat hood versus the current high-beltline SUV is subtle (belt heights 0.98 against 1.17 are right, the hood lengths could differ more).

## Triangles and draws per car (unchanged: sizes scale the same meshes)
sedan 6,998 full / 3,926 lite, suv 5,374 / 3,262, pickup 5,088 / 3,146, bigsuv 5,768 / 3,430, cargovan 4,526 / 2,914, boxtruck 4,128 / 3,296 (all
before and after; `measure-after.csv` has all types). Far proxies untouched (under 1.2 k). Draw calls per car unchanged (6 near). Phone: the car blob
was already on and stays one draw call; texture memory unchanged (tyre painter same size; blob texture same 64 px).

## Tests
* `tests/unit/entities/ai-trajectory.test.ts` fixture re-recorded on purpose (`UPDATE_AI_TRAJ=1`): the sedan, SUV and pickup are shorter now, so the
  recorded AI trajectories of those three changed. The test's rule (AI cars keep their pre-CARS3 handling) still holds: the handling code is unchanged.
* `tests/unit/render/phone-gfx.test.ts`: one assertion changed (setEnabled(false) now keeps one car-blob draw call; pedestrians off).
* `tests/unit/entities/cars5-measure.test.ts`: the measuring tool; writes a CSV only when `CARS5_TAG` is set.
* Sim sensitivity: with a 4.78 m sedan the real-map cop test "the pursuit ends when the stars decay" failed (stars climbed to 3 in that seeded run and
  did not decay in 230 s); with the old 4.88 and with 4.82 it passes. This is a chaotic seeded run, not a logic fault; I took 4.82 m (still between the Civic 4.67
  and the Camry 4.88).
* Other red in `tests/unit/entities`: vault-pinned-strip (camfix, other lane's vault.ts work in the tree), pedround5 shoe hem (known 2 mm check).
