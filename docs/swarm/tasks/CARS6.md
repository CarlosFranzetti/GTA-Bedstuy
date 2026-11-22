# CARS6: car body shapes after real vehicles (22 Nov 2026, lane CARS6, Odile Brandt)

Status: sedan family, pickup, both SUVs and the hatch done and looked at; coupe, muscle, wagon, vans NOT reshaped (see the end). Owner, 22 Nov: "the car geometry feels off: let's model them on real world vehicles." CARS5 fixed
sizes and contact shadow; this lane changes only the SHAPES. Specs in `Vehicle.ts` untouched; every type keeps its CARS5 length, width, height.

## How a body is defined (what I found in carBodies.ts)
A passenger body is a loft of rings (`buildLoft`, ring = `carHalf`: roof centre, glass, belt crease at slot 6, flank, sill). Per style:
`secs` [u, yT (centre-line height: hood, roof, deck), belt height, roof half-width share], `plan` (half-width by u), `windshield`,
`doorGlass`, `rearGlass`, `hoodBack`, `axle`, `sill`, ends rounded by `endF`/`endR` with a tip width of 0.6 of the body. So the SIDE SILHOUETTE
is exactly the `yT` curve, and the nose and tail are the same quarter-round wedge on every class. Vault (`vault.ts topProfile`) reads `secs`,
`dims`, `Lref/Href`, `windshield`, `rearGlass`: kept meaningful. Skin layout reads `secs`, `hoodBack`, `rearGlass`. LOD `lite` is the same profile at refine 1
(no pop in silhouette by construction). Look-at tool: `scripts/carlineup.html` gained `q3` (front three-quarter) and `r3` (rear three-quarter) views.

## What the loft could not express (and what I added)
Seven small additions to the style profile / loft (all optional fields, default = old behaviour, so the 20 styles I did not touch are unchanged):
* `endW: [front, rear]`: tip width of nose and tail as a share of the body (was a fixed 0.6, a pointed plan on every class). Trucks and SUVs 0.84 to 0.9, old sedan 0.8, family sedan 0.72.
* `archSq`: squared wheel arch (a superellipse, exponent 2 to 4.4) through `archOf`, `archY`, `archStations`; the SUVs 0.55, the pickup 0.75.
* `bumperBeam: [height, depth]`: a separate beam (rounded, bevelled, `bumperGeo`) 3.5 cm proud of nose and tail, dark with a bright top strip (chrome on `chromeBumper` bodies). The loft stops 4 cm short of L / 2, so the length is unchanged.
* `axleShift`: both axles move toward the nose, the wheelbase stays: real overhangs are not symmetric (rear overhang 1.2 to 1.4 m on pickups and big SUVs, 0.1 on sedans). The skin layout reads it.
* `tuck`: how far the glass base sits inside the body side at the belt (shoulder / tumblehome, was a fixed 0.08).
* `cabGap`: pickup only: body-colour cab back wall above the bed rail (the bed front was an open hole above the rail) and a dark gap line down the flank.
* The pickup bed rail, tailgate top and the cab belt are now three different heights (they were one slab height).
What was NOT a loft limit but a data fault: the silhouette is the `yT` column of `secs`, so most of the work is new `secs`, `plan` and glass ranges written in real metres (`Lref = L`, `Href = H`, kx = ky = 1).

## Reference numbers (estimates from memory of published figures and of open photos; NOT measured from images in this session)
Shares are of overall length L from the front unless said. Heights are shares of overall height H. "WB" wheelbase.
| class (example for the numbers) | L x H (m) | WB / L | hood | cabin (cowl to deck) | deck | front / rear overhang | windscreen / backlight rake from horizontal | belt / H | wheel dia / H |
|---|---|---|---|---|---|---|---|---|---|
| mid-size sedan (2018 mid-size front-drive) | 4.88 x 1.45 | 0.58 | 0.24 | 0.55 | 0.21 | 0.20 / 0.22 | 28 / 23 deg | 0.68 | 0.47 |
| old full-size three-box (2003 body-on-frame) | 5.38 x 1.44 | 0.54 | 0.27 | 0.46 | 0.27 | 0.19 / 0.27 | 34 / 36 deg | 0.69 | 0.47 |
| full-size pickup, crew cab (2021) | 5.9 x 1.96 | 0.63 | 0.25 | cab 0.36, bed 0.29 | | 0.15 / 0.22 | 32 deg, rear glass upright | cab 0.74, bed rail 0.62 | 0.40 |
| mid-size 3-row SUV (2020) | 5.0 x 1.78 | 0.60 | 0.21 | 0.67 | tail upright | 0.20 / 0.20 | 30 deg, tail 80 deg | 0.68 | 0.43 |
| big SUV (2022) | 5.35 x 1.92 | 0.57 | 0.22 | 0.66 | upright | 0.19 / 0.24 | 32 deg, tail 85 deg | 0.66 | 0.42 |
| subcompact hatch (2016) | 4.06 x 1.52 | 0.62 | 0.20 | 0.64 | 0.16 (tailgate) | 0.17 / 0.21 | 30 deg, tailgate 70 deg | 0.65 | 0.40 |

## Per class (what I built, real metres; numbers are from my own profile data, measured sizes are in `scratchpad/cars5/measure-cars6.csv`)
* Sedan (family "Kamari"): axles shifted 0.05, tip width 0.72, shoulder tuck 0.11 (was 0.08). Kept its fastback-ish notchback: wheelbase 2.79 (0.58 L), overhang 0.96 / 1.07, backlight 31 deg.
* Taxi / "cab" (old full-size three-box, `crown`): wheelbase 2.92 (0.54 L), overhang 1.04 / 1.43, hood 1.44 m (27 percent), windscreen 35 deg, backlight 39 deg, flat roof 1.17 m, level trunk deck 1.49 m at belt height, tip width 0.8, bumper beams. Reads as a different, older, squarer car than the sedan.
* Police ("charger"): wheelbase 3.05, overhang 0.93 / 1.06, hood 1.3, belt 1.02 to 1.07 kicking up over the rear wheel, backlight 25 deg, short deck, tuck 0.11, tip 0.74.
* Pickup: crew cab over the front half (windscreen base 1.35, cab back -0.91, 2.26 m), bed 1.87 m, bed rail and tailgate top 1.30 against cab belt 1.47 and roof 1.90, cab / bed gap line, squared arches, bumper beams, axles shifted +0.12 (wheelbase 3.40 = 0.607 L; overhang 0.98 / 1.22), tip 0.86 / 0.9, tuck 0.06. 4 percent flare at the wheels (plan 1.0 against 0.98).
* Mid-size SUV: tail upright (backlight 43 deg into a 1.5 m tall tailgate face), belt 1.2 (69 percent), shorter higher hood, squared arches 0.55, beam bumpers, wheelbase 2.85 (was 2.97), tip 0.85. Police SUV follows.
* Big SUV: wheelbase 3.07 (was 3.18; the 2022 big-SUV figure), rear overhang 1.35, belt 1.30 (68 percent), roof flat to the tail, tip 0.86, chrome beam bumpers.
* Hatch: roof runs back to 1.96 and drops to a 1.17 m tailgate over 0.34 m (43 deg), short hood, tip 0.8 / 0.84, rear overhang a touch smaller than the front.

## Triangles per car (`measure-cars6.csv` against CARS5's `measure-after.csv`; full / lite)
sedan 6,542 / 3,766 (was 6,998 / 3,926), cab 7,850 / 4,050 (7,302 / 4,090), cop 7,226 / 4,006 (7,174 / 4,006), pickup 5,472 / 3,090 (5,088 / 3,146), suv 5,558 / 3,350 (5,494 / 3,302),
bigsuv 6,360 / 3,470 (5,768 / 3,430; +10.3 percent on the full level, one step from archN 6 to 5 was taken afterwards: not re-measured), hatch 5,770 / 3,374 (5,818 / 3,374). No new draw call (the beams go into the trim mesh), no new texture.
Drawn L x W x H unchanged for every type (within 0.01; the taxi roof sign is the only part above H). The visual wheelbase of five types now follows the real car (pickup 3.50 to 3.40, suv 2.97 to 2.85, bigsuv 3.18 to 3.07, copsuv 3.03 to 2.91, cab 2.91 to 2.92); physics uses 0.6 L from the spec and is untouched.

## Checks
* `npx vitest run tests/unit/entities tests/unit/world tests/unit/physics --maxWorkers=1`: 2,065 passed, 2 failed: pedround5 shoe hem (the known 2 mm check) and `roadnet-stream` "builds incrementally: a zero budget" (not mine: roadnet files are being edited by another lane). Vault tests, `ai-trajectory` fixture (unchanged on disk) and `carbodies`, `cars2`, `cars4`, `car-lod-tris` all green.
* `tests/unit/sim/traffic-5min` and `realtraffic-5min`: 30 passed (224 s).
* `npx tsc --noEmit`: nothing from carBodies.ts or carSkin.ts. Single-file build 10,930,512 bytes (10.42 MiB; was 10.92 MB: +10 kB).
* In game (hosted build, `?perf=0&q=low`, 17:30, parked cars, 640 x 360): `scratchpad/cars6/game/sheet-sedans.jpg`, `sheet-trucks.jpg`. The rear three-quarter frames came out for all seven types; the FRONT three-quarter camera missed the car in four of seven (street furniture or the slot heading), so front views are only from the line-up tool.

## What still reads wrong (honest)
* Not reshaped at all: coupe, coupe911, muscle, pony, wagon, minivan, crossover, cargo van, ambulance, box truck, bus, hearse, limo, classic. They keep CARS5 shapes and the old pointed plan.
* Glass is still a flush band with thin pillars, there is no true hood crown or fender edge, no body-side character line; mirrors and door handles unchanged. The loft has one crease (the belt).
* Pickup: the cab-back wall is a plain box, the bed has no separate tailgate gap, and the frame "rails" line above hatch and SUV roofs is the old roof-rail / look geometry.
* The hatch still reads between hatch and small wagon from the side: its roof is long.
* Door positions for entering are unchanged (door glass u values move with the cab; the walk-to points were not checked).
* Evidence: `scratchpad/cars6/lineup/before-side.jpg` / `after-side.jpg` (16 types, same cameras), `pair-sedans-*.jpg`, `pair-trucks-side.jpg` (top before, bottom after), `p1-all.jpg`, `s1-all.jpg`, `u1-all.jpg` (side, front and rear three-quarter of the new bodies).
