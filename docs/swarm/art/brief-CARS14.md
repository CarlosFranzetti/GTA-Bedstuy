# Brief: CARS14 (Dmitri) — sports cars, an electric wedge pickup parody, per-type handling

Director: Tomas (ARTDIR). Model: sonnet. Port 4485. Start when Kenji (CARFIXUP) posts FINAL.
Read first: docs/swarm/ORG.md, docs/swarm/plans/stage14.md (rules), docs/swarm/art/ART-BAR.md (Cars section),
board.md "Token policy". Read only the files below. Post start, blockers and wrap-up to "@Tomas" with scripts/swarm-say.sh "Dmitri (CARS14)".

## What to build (7 new VehicleType entries)
| type key | class (style reference only) | parody name (yours; no real badges) | feel |
|---|---|---|---|
| coupe911 | rear-engine 2+2 coupe (911-class) | invent (not a GTA parody name either) | RWD, rear-heavy, sharp turn-in, lift-off oversteer |
| exotic | mid-engine V10/V12 wedge exotic | invent | AWD or RWD, highest grip and power, low and wide |
| jdmcoupe | JDM tuner coupe (Supra/Skyline/RX-7 class) | invent | RWD, light, tail-happy, high-revving |
| hothatch | hot hatch (Golf GTI/Civic Type R class) | invent | FWD, nimble, mild understeer, quick steering |
| muscle | modern muscle (Challenger/Camaro class) | invent | RWD, heavy, huge torque, wheelspin, soft steering |
| wedgetruck | electric wedge pickup parody (stainless angular slab) | invent, clearly satire | AWD electric, very heavy, instant torque, slow steering |
| evsedan | electric sedan (Model 3/S class) | invent | AWD electric, silent, instant launch, planted |

Each one: real dimensions (length, width, height, wheelbase, track, wheel diameter, curb mass, power, 0-100 km/h, top speed)
found with WebSearch from at least one manufacturer or encyclopedic source; put the numbers and source URLs as a style
comment above the body in carBodies.ts (the way Rocco did). Parody names: no real marque names, badges or grille shapes copied exactly.
Existing `pony` stays as the older muscle car; `muscle` is the modern one. Keep the type keys short; rename if they clash.

## Handling
- VEHICLE_SPECS in src/entities/Vehicle.ts: mass, maxSpeed, accel, brakeDecel, maxSteer, grip, steerRate, enginePitch from the real numbers (accel from 0-100 time using the comment's thrust curve).
- Add, additively and optional, to VehicleSpec in src/world/types.ts: `drivetrain?: 'fwd'|'rwd'|'awd'`, `electric?: boolean`, `torqueBias?: number`. Consume them in Vehicle.ts so RWD can rotate under power, FWD understeers, AWD is planted, electric has flat torque from 0. Existing types default to current behaviour (no test changes for them).
- The seven must feel distinct in a 10 s drive: a scripted test asserts their 0-100, top speed, and a steady-state turn radius at 15 m/s are ordered as the table implies.

## Art (judged against ART-BAR Cars)
- Wheels fill the arches; sports cars get low-profile tyres and larger rims; wheels flush with the body side.
- Clearcoat paint with env reflection, transmissive-looking glass, lamps with depth; bumpers blend into the body corners.
- Wedge truck: flat stainless panels with a brushed anisotropic look (roughness 0.35, metalness 1), a single light bar front and rear, satire not copy.
- Liveries/looks through carLook.ts and carSkin.ts: 6+ colourways each; the exotic and JDM get optional stripes or wing variant via the existing look/variant system.

## Budgets (hard)
- Near LOD: ≤ 9,000 tris on medium/high, ≤ 4,500 on phone/low. Far LOD ≤ 1,200. ≤ 6 draw calls per car at near.
- Artifact stays ≤ 12 MB: no new inlined images; procedural paint/textures only.

## Files owned
src/entities/models/carBodies.ts, carModel.ts, carLook.ts, carSkin.ts, carExtras.ts; VEHICLE_SPECS in src/entities/Vehicle.ts
and the handling code that reads the new fields; additive VehicleSpec/VehicleType edits in src/world/types.ts; traffic mix
weights in src/game/TrafficSystem.ts (sports cars rare: ≤ 8 % of traffic combined, wedge truck ≤ 1 %); scripts/cars12-sheet.* (extend).
Not yours: src/main.ts (FOR FABLE lines), src/audio/** (Andre).

## Cross-team
- @Andre (SFX14) has asked for each new type's cylinder count, top speed and character (flat-six, V10, inline-six turbo, four-cylinder turbo, V8, electric whine x2). Post them to him on day one; engine voices are a Record keyed by VehicleType, so a missing one fails typecheck until he adds it.
- Tell Greta's team (via Tomas) if handling changes touch traffic AI speeds.

## Tests
- tests/unit/entities/car-lod-tris.test.ts: extend to the seven types and the budgets above, per tier.
- tests/unit/entities/carbodies.test.ts and carlook.test.ts: dimensions within 2 % of the spec comment, all looks build.
- New tests/unit/entities/handling-classes.test.ts: 0-100, top speed, turn radius ordering; drivetrain behaviour (RWD yaw under throttle > FWD).
- tsc clean in src; existing vehicle/traffic tests no worse than HEAD (list any that were already red).

## Screenshots (one render job at a time, queued in the background; output to scratchpad/cars14/)
- Sheet: each new type, front three-quarter and rear three-quarter, plain ground, 1280x720.
- Close: each type at 6 m front three-quarter with a sky env, one dark and one bright colourway.
- Street: noon and dusk frame with two new cars parked among existing traffic (scale check vs sedan/pickup).
- Tier: the exotic and wedge truck at phone/low LOD next to medium.

## Done
Seven types in traffic and drivable; ART-BAR Cars top-5 defects absent on all seven; budgets and tests green; numbers and
sources in comments; FINAL to @Tomas (≤ 150 words + path list) with the frames; FOR FABLE lines for any main.ts hook.

## Rules (stage14.md)
Fan tribute, original or openly licensed assets only; no game assets (GTA, Saints Row are style references). Only Fable edits
src/main.ts. Never git stash, never commit, keep src/ compiling, one render job at a time.
