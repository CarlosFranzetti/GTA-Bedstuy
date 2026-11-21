# PHYSICS lane (Rowan Hale), 18 Nov

Status: historical record (not maintained)

Owner brief: "fixing physics", GTA III feel (arcade, weighty, forgiving, never glitchy). Method: headless scenarios in
`tests/unit/physics/scenarios.ts` (real World2D + Vehicle + Player + Pedestrian stepped like main.ts), numbers below measured
BEFORE any fix. "After" numbers are in the last section.

## Defects found (before)

| # | Defect | Measured |
|---|--------|----------|
| 1 | Collisions never spin a car. Only a heading nudge toward the wall exists. Offset car-car hits and corner hits leave both cars pointing exactly as before. | peak yaw rate in sedan/sedan 15 m/s, sedan->bus, bus->sedan, sedan<->boxtruck: 0.00 rad/s on both cars, every case |
| 2 | Thin props pin a car dead. Poles r 0.15 to 0.25, hydrant, bollard, tree: a sedan with the throttle held stops at the prop for the whole 8 s run at 8 and 15 m/s (centred hit) and at any speed for AI drivers. Player assist only slides it off below 7 m/s. | pole/bollard/hydrant, traffic driver, 3, 8, 15 m/s, centred or 0.5 m off: end z = -17.4 (prop at -20), never passed, 8 s |
| 3 | Holding the throttle against anything wrecks the car: the wedge push-out hits again every 3 s and each hit costs damage. | sedan pressed into a wall, 10 s: damage 0 -> 0.13 -> 0.34 -> 0.51, steps every 3 s; 3 m/s into a prop: 0.44 |
| 4 | Pin recovery pulls the player along walls. Leaning on a wall for 0.6 s counts as "trapped" and glides the player 0.4 m sideways, repeating. | walking NE into a corner at (5,-5): player ends (4.57,-4.20), 0.4 m short of the corner, then holding N moves him SOUTH 0.43 m |
| 5 | The player run down by a car is carried on the bumper and never knocked down. Cars shove him at their own speed. | player speed 14.1 to 14.8 m/s for 4 s after an 8 m/s hit, 16.8 m/s after 15, 22 to 19 after 25; end 2.8 m ahead of the car centre |
| 6 | Pedestrians hit by a car are ploughed along the same way (state 'down' but the body still collides with the car). | 5 / 10 / 15 / 25 m/s: ped ends 2.7 to 3.0 m ahead of the car centre after 4 s, 11 to 49 m carried |
| 7 | No person-to-person room: only the 0.6 m body circles. Walking pairs rub shoulders and legs cross. | 10 peds started in 1.2 x 0.3 m: min spacing 0.60 after 1 s; reported in p17 (ped_shoes1, ped_side1) |
| 8 | A body spawned inside another is popped out in one step (a teleport of the full depth). | two parked sedans 0.4 m apart: separated 2.55 m in one step, velocity 0 |
| 9 | Fists: a jab only tests where the target is at impact (0.14 s after the press) against 1.2 m reach, so a pedestrian walking away from 1.1 m is already at 1.28 m. | walking away at 1.3 m/s from 1.1 m: miss (p17 item 3) |
| 10 | Shallow wall scrape loses speed fast. | 20 m/s at 60 degrees off the wall normal, no throttle: 11.8 m/s after 0.5 s, 5.4 after 1.5 s, 7 impacts |
| 11 | Hard hits give the body a pitch/bounce kick but no roll, and no weight to the spin. | roll kick absent in reactToImpact |
| 12 | No road-grip hook for weather. | `Vehicle.grip` exists per instance only |

## Checked and fine (no change)

* Walls: no tunnelling at 5, 15, 30 m/s at 0, 30, 60 degrees (max corner penetration -0.03 m = the SLOP), 50 ms hitch at 30 m/s: nose stops 0.03 m short; rebound 5 to 10 percent of the impact speed; pressed against a wall the jitter is 0.0 to 0.1 cm (8.5 cm in one 30 m/s case).
* Car into parked car: momentum shared by mass (sedan into a parked bus: sedan stops, bus gets ~1.1 m/s and stops by friction; bus into sedan carries it at 7.3 m/s); nothing overlaps 0.5 s after; no peak above the impact speed.
* 200 overlapped parked cars: no velocity, 3.6 ms per step.
* Squeezing between two parked cars: gap 0.7 m blocks the 0.8 m player, 0.85 m passes, cars do not move.
* Handling (see the table in the final report / the test): nothing spins at 0.2 steering input at speed (max slip 0.8 deg), lift-off slip under 8 deg, bus and garbage truck barely slide.

## Fix list

World2D: yielding props (hydrant-, bollard-: a car drives through, one contact, small speed loss), `vehiclePass` for flung bodies, soft personal space between people (0.85 m, head-on pairs lean to their right), gentle depenetration. Vehicle: `Vehicle.roadGrip`, collision spin (`impactYaw`), roll kick, damage free below 2 m/s closing, slide-off for every driver and up to 12 m/s, lower wall friction. Player: run-down knock (1.3 s, thrown, up again), pin recovery only when truly trapped. Pedestrian: thrown clear of the bumper. Combat: jab judged at impact or at swing start.

## After (19 Nov)

Changes made while fixing the regressions the first version caused: spin and roll kick only on a fresh hit (never on the scrape re-contacts of a car held against something); no spin from flat walls (segments, polygons); spin lever for car-vs-car is half the centre offset across the contact normal; AI drivers (traffic, cop) get no collision spin; prop slide-off is player-only again; wall friction and align restored to 0.35 / 0.18; personal space softened to 0.75 m, 0.45 m/s, lean only inside 1.6 m; deep-overlap easing starts at 0.3 m; hydrants/bollards are driven through with no wall scrub; the player lies flat while knocked down.

Wall (sedan, no throttle), impact -> rebound m/s: 5 -> 0.5, 15 -> 1.5, 30 -> 2.9; max penetration -0.03 m; jitter at rest 0 to 0.1 cm (8.5 cm in the 30 m/s head-on). Glancing 60 degrees at 20 m/s keeps its speed longer than before only in the AI-free case; the wall friction is the old 0.35.

Handling (radius m at full lock, stop time s / distance m, handbrake peak slip deg, 0.2-steer slip deg), sedan 10 m/s: 13.3, 0.9/4.4, 55, 0.6; sedan 20: 37.9, 1.5/14.4, 29, 0.8; hatch 20: 36.4, 1.5/14.5; coupe911 20: 32.2, 1.4/13.2; coupe911 30: 73, 1.8/25.7; exotic 20: 29.5, 1.1/11.3; exotic 30: 66.6, 1.5/21.6; suv 20: 39.9, 1.6/14.9; pickup 20: 40.7, 1.7/16.4; cargovan 10: 13.3, 1.1/5.5; boxtruck 10: 13.3, 1.1/5.5; bus 10: 24.6, 1.5/7.2 (no handbrake slide, slip 4); garbage 10: 22.4, 1.4/6.9; cop 20: 36.5, 1.5/14.5; muscle 30: 87.4, 1.9/26.6 (lift-off slip 7.7). Full table: `PHYSICS_REPORT=<file> npx vitest run tests/unit/physics/report.test.ts`.

Traffic 5-minute sim: with the 19 new car types (CARS14 + CARS2 shares) remapped to sedan inside the test, seed 21 is fully green (gridlock, AI collisions) with all of this physics on; remapping only CARS14 still fails, only CARS2 still fails the gridlock test. The mix, not the physics, is the difference.
