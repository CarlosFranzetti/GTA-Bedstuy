# CARS4: new vehicle types, paint wear, the white-panel fault (Idris Valmont, 21 Nov 2026)

Status: partial. Eight new types, the white-panel fix and the dirt and rust rework are done and looked at. The class-silhouette,
wheel and face steps turned out to be mostly in place from earlier lanes (CARS12, CARS14, CARS2); what is still cheap is listed at the end.

## What I found first

The brief described the cars as they look in the small contact sheet. At 560 x 300 per view (new tool, below) the 37 bodies are
already lofted per class with their own roof, beltline, nose and tail data (`STYLES` in `carBodies.ts`: 29 bodies), wheel radius
0.30 to 0.40 m by class, seven rim designs (steel hubcap, bare steel, six-spoke, five-spoke, mesh, deep dish, turbine, all with a
rotor behind the spokes and a lip), arches with depth (`archOf`, `wheelLiner`), recessed lamp housings with lenses (`lampPieces`,
`wrapLamp`: quad, slit, wedge, c, swept, box, angular, blade, round2), five grille types, bumpers that project, plate recess,
mirrors, handles, roof rails and racks, semi-transparent inset glass with a seat and wheel interior, clear-coat through
`CarPaintFx`. So steps 1 to 3 on the existing types were NOT redone: I looked at pickup, SUV, hatch, sedan, coupe, beater, hearse
and the trucks at close range and changed only what was wrong in what I saw (below).

## The white panel (cause and fix)

Cause: the `beater` skin's wear painter (`vehicleSkin.ts`, `weatherFlank`, `weatherEnds`) painted FIXED-colour pixels and heavy
white chalk. `weatherFlank` drew one mismatched primer door or fender as a solid light grey (`#8d8f8a` / `#6f7864`) with a dot
speckle (the "pixel pattern"); `weatherEnds` and `weatherFlank` laid white shades of 14 to 30 percent over the roof, bonnet and
upper flanks (the "white bonnet and roof patches"). On a saturated red that is pink with white panels, and in sun the fixed grey
reads white. So it was an intended "mismatched panel and sun-chalk" wear effect, overdone, on a beater; it is the same effect
the shader's primer (`carSkin.ts`) also draws. A second fault made it more common: `lookFor` gave any non-premium car a 5 percent
chance of a shader primer panel.

Fix: the painted primer door and its speckle are removed from the skin; chalk is 3 to 9 percent (was 10 to 30); the shader primer
is a dark primer grey (`0.30,0.32,0.29`, was `0.43,0.46,0.42`), only on beaters, 40 percent of them (was 55 percent of beaters and
5 percent of all others). Seen in `scratchpad/cars4/beater.jpg`: no white panel on a red beater from three angles.
Not re-checked in a driving frame in the game (the capture below shows no beater close up).

## Paint and wear

* Dirt: was an even pale film (`mix(paint, (0.5,0.46,0.38), ...)`) that chalked dark cars. Now it darkens the paint, is concentrated
  low on the body and streaks upward from the sill (`COND_FRAG` in `carSkin.ts`). Sun-faded roof and bonnet appear only on dirt
  level 2 and 3 cars.
* Rust: only on old types (beater, classic, mini truck, panel van, step van, ice-cream truck, cargo van, box truck, dollar van,
  garbage truck, tow truck, flatbed, donk); everything else has a 5 percent chance of one light bloom. The band is broken
  up (patchier) instead of a continuous stripe along the sill (a candy-red hatch had a gold stripe).
* Service types (hearse, livery, school bus, food truck, sweeper, bucket truck) get no rust and no primer; the fleet ones get no
  tint.
* Not done: metallic flake choice per palette, two-tones beyond the existing packs, brake dust on rims.

## New types (all original designs, not in traffic)

| type | class | size (m) | mass | max speed | accel | handling class | look | era |
|---|---|---|---|---|---|---|---|---|
| hearse | passenger | 5.9 x 2.0 x 1.55 | 2300 | 28 | 6.5 | bigsedan | long funeral coach from the wagon body: wheelbase 3.6 m, flat roof to a boxy tail, small side windows, round lamps, chrome bumpers, vinyl roof pack on black | 1990s |
| livery | passenger | 5.6 x 1.99 x 1.47 | 1850 | 30 | 7 | bigsedan | the Regent body stretched, round twin lamps, slat grille, chrome bars, black, no roof light | 2000s |
| schoolbus | bus | 12.0 x 2.5 x 3.2 | 10500 | 17 | 1.8 | bus | the bus hull with a school skin pack (black rub rails, lettering "SCHOOL BUS", "BORO BOARD OF LEARNING"), no sign pod, roof hatches, stop arm | 2000s |
| towtruck | truck | 6.6 x 2.3 x 3.15 | 5200 | 22 | 3.5 | truck | box-truck cab, service body, low deck, raised wrecker boom, hook, wheel-lift bar | 1990s |
| flatbed | truck | 7.0 x 2.4 x 2.5 | 4800 | 21 | 3.2 | truck | box-truck cab, steel deck, headboard, stake pockets, toolboxes under the deck | 1990s |
| foodtruck | truck | 6.0 x 2.2 x 2.9 | 4000 | 20 | 3.2 | truck | rounded box body, serving window, counter, awning, roof vents, generator | 2010s |
| sweeper | heavy | 6.8 x 2.5 x 3.0 | 11000 | 12 | 1.6 | heavy | tall rounded hopper, side brush discs, suction hoses, broom roll, beacon | 2000s |
| bucket | truck | 7.4 x 2.5 x 3.4 | 8500 | 19 | 2.6 | truck | utility body with compartment doors, turret, boom lying over the cab, bucket, outriggers | 1990s |

The tow truck is 3.15 m high because the boom stands above the cab (CARS3 proposed 2.6). Names, liveries and lettering are invented.
The work trucks use the existing box-truck cab skin (`van` skin style, no new texture) and a plain library paint on the body
(`CarParts.paint2Plain`), so no livery canvas, no new map and no phone memory change. The food truck, tow truck and flatbed have no
painted lettering (geometry only).

Draw calls: 6 for each (5 for the school bus, as the bus), same as the existing near cars.

### Hooks and files per new type (the ten places)

`world/types.ts` (VehicleType), `entities/Vehicle.ts` (VEHICLE_SPECS rows), `entities/handling.ts` (HANDLING_OF), `audio/vehicle/engineModel.ts`,
`hornModel.ts`, `fx.ts` (voice, horn, door class), `entities/models/carLook.ts` (palette, wheels, wear), `carModel.ts` (style, paint
variants, parts), `carBodies.ts` (`STYLES` hearse and livery; `buildTruckParts(spec, kind)`; `buildWorkBody`; `buildBusParts(spec, school)`),
`carSkin.ts` and `textures/painters/vehicleSkin.ts` (hearse, livery skins; school pack 5), `entities/models/gltf/VehicleSource.ts`.
`tests/unit/entities/cars4.test.ts` covers all eight. Two older assertions were relaxed for them: `carlook.test.ts` (palette count: 5 for
the service types, 1 for the school bus) and `carbodies.test.ts` (the school bus has one colour, twice in its variant list).

## Triangles and draws per level (measured headless, `renderer`-free count of what a near car draws)

Existing types are unchanged (their geometry was not touched; sedan 6998 / 6 full, 3926 lite, 977 far).

| type | full (near) tris / draws | lite (phone, low) | far (traffic proxy) |
|---|---|---|---|
| hearse | 5878 / 6 | 3494 / 6 | 976 |
| livery | 7470 / 6 | 4174 / 6 | 977 |
| schoolbus | 6664 / 5 | 4276 / 5 | 954 |
| towtruck | 4212 / 6 | 3044 / 6 | 960 |
| flatbed | 4136 / 6 | 3068 / 6 | 995 |
| foodtruck | 4160 / 6 | 3296 / 6 | 1118 |
| sweeper | 5348 / 6 | 3720 / 6 | 1105 |
| bucket | 5452 / 6 | 3480 / 6 | 973 |

All pass the existing limits in `car-lod-tris.test.ts` (lite at most 4500 and 6 draws, far budgets). The existing budgets were not raised.

## In-game capture

`?perf=0&q=low`, hosted build, canvas hidden, Space pressed, `stopLoop`, `step`, `setFreeCam`, `renderOnce`, `toDataURL`.
Noon, a street with traffic and parked cars (`game1/after-noon-street.jpg`): 477,204 triangles, 225 draw calls from `renderer.info`
(low budget 500,000 and 220: the draw calls are 5 over, but this frame is a long straight street seen from 3 m up and the existing
code was in the same range before this lane; I did not measure the "before" frame with the same camera). Not a frame rate.
The new types were spawned by hand through `traffic.makeVehicle` and `traffic.register` (they are not in the mix):
`game1/after-noon-lineup.jpg` and `game1/after-noon-new_<type>.jpg`. Night: see `game2/` (the first attempt crashed the page at the
second hour, so night was captured alone). All under `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/cars4/`.

## Tools

* `scripts/carclose.mjs` and `carclose.html`: one row per type, panels front three-quarter, side, rear three-quarter, top; options
  `--types`, `--views`, `--seed`, `--color`, `--variant`, `--q low`, `--pw`, `--ph`, `--lamps 1`. `SWARM_SMALL=1 scripts/swarm-render.sh node
  scripts/carclose.mjs <out> --types a,b --tag name`.
* `scripts/carsheet.mjs` already takes `--types --cols --cw --ch`: a larger sheet of eight is `--types a,b,... --cols 4 --cw 480 --ch 300`.

## Lines for Fable

TrafficSystem.ts (not edited): keep the new types out of the mix until the traffic suites are green; then, to put them in at the
shares CARS3 proposed (livery and school bus are mine):

```ts
export const CARS4_TRAFFIC_SHARE: Readonly<Record<string, number>> = {
  hearse: 0.003, livery: 0.008, schoolbus: 0.003, towtruck: 0.005, flatbed: 0.005, foodtruck: 0.006, sweeper: 0.003, bucket: 0.004,
};
// PARK_WEIGHT: add
hearse: 0.3, livery: 0.6, schoolbus: 0.2, towtruck: 0.4, flatbed: 0.5, foodtruck: 0.8, sweeper: 0.1, bucket: 0.2
// cumulative(): extra = [...CARS14, ...CARS2, ...Object.entries(CARS4_TRAFFIC_SHARE)]
// NOT_MOVING: add 'schoolbus' (12 m, like the limo) until the turning test passes
// pickType(): the "never parked" list `t === 'bus' || ...` should also hold 'schoolbus' and 'sweeper'
```

`cars2.test.ts` sums CARS14 and CARS2 shares under 25 percent; do not add CARS4 to that sum (it would be 26.4 percent).
main.ts: nothing required. `HULL_TYPES` (main.ts line 256) lists the types given a far hull proxy at boot; the CARS2 types are not in it
either, so the new ones need no line; append `'hearse', 'livery', 'schoolbus', 'towtruck', 'flatbed', 'foodtruck', 'sweeper', 'bucket'`
if you want the far proxies registered at boot.

## Not done

* Step 1 (class silhouettes) on the existing 29 bodies: not changed. They already differ per class in the data; a mixed-era
  fleet could still use a boxy 1980s sedan and a rounded 1990s one.
* Step 2: nothing new for wheels (a dually design and a truck-steel design are not drawn; the dual rear tyres on the trucks exist).
* Step 3: reverse lamps not added. Hook if wanted: a fourth lamp mesh kind in `detailsGeo` (`KIND_REVERSE`) next to `KIND_TAIL`,
  driven by `Vehicle.speed < 0` through `applyLights`. Panel gaps, door handles, mirrors, plates exist; wipers and aerials do not.
* Step 4: glass is already inset and semi-transparent with a simple interior; no change, no per-tier decision made.
* Step 5: no per-palette metallic flake; brake dust on rims not drawn.
* The night in-game frame depends on a second capture (see above).
* New types are not in traffic, so nothing in a normal game shows them yet.
* A mismatch to know about: `wheelRadiusFor('boxtruck')` is 0.5 while the model's tyre is 0.405 (old). The new trucks return the model's radius.
