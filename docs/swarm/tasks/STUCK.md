# STUCK lane (Ines), 27 Nov 2026

Owner, 27 Nov: "there are collision issues, the car and player get stuck sometimes, and controls aren't as smooth as gta yet."

Status: in progress. This file is kept current; the last section is the result.

## Result in one table (same trials before and after; 2,000 cars and 600 walkers per map)

Before = `World2D.rescueEnabled = false` (the code as it was). After = the code in the tree. Seeds are per trial, so any case can be replayed
alone: `replayTrial(world, 'car' | 'walker', 1, index, trace)` in `tests/unit/sim/stuck-soak-lib.ts`.

| map and actor | pinned (held 2 s into something, normal) | HARD stuck before -> after | overlapped 0.75 s or more before -> after | longest overlap before -> after |
|---|---|---|---|---|
| grid, cars | 1,586 -> 1,587 | **21 -> 0** | **23 -> 0** | 12.5 s -> 0.55 s |
| grid, walkers | 256 -> 261 | 0 -> 0 | **13 -> 0** | 4.9 s -> 0.5 s |
| real, cars | 1,153 -> 1,073 | **16 -> 0** | **15 -> 0** | 5.5 s -> 0.63 s |
| real, walkers | 189 -> 210 | 0 -> 0 | **14 -> 0** | 4.9 s -> 0.5 s |

"Pinned" is not a bug (the soak holds the throttle against walls on purpose); it is the pool the hard cases come from. Kinds before:
cars hard or overlapped: wall 38 of 44 on the grid, wall 22 / prop 13 / corner 7 on the real map (all of: held lock, forward, weaving,
reverse). Walkers: every overlap is the `pushed` trial (a traffic car driven at a person standing at a wall): person left inside the car.
The real map is not deterministic between runs (its building colliders stream in on a timer): an earlier run of the same code left 1 hard-stuck car and 1 overlap (a bus and a sedan against a thin signal pole or a building edge, seen in the snapshots, not diagnosed), so read the real-map "after" as 0 to 2 in 2,000, not as a proof of zero.
Backstop use in the after run: rescue 27 + 13 (grid cars + walkers), 20 + 17 (real); wedge relief 137 (grid) and 72 (real) of 2,000 cars each.

Picture: `docs/swarm/teams/sheets/stuck-map-before-after.png` (every trial start in grey, hard-stuck red, overlapped orange; the real map
is drawn only around the 36 streamed sites).

## Root causes

1. **Nothing backstopped the solver.** World2D resolves a pair at a time. A person pressed between a moving car and a wall, or a car in a
   notch narrower than itself (a lamp post against an areaway fence, a stoop against a wall), is pushed by two constraints that fight: the
   overlap stays (0.2 to 1.4 m deep for seconds, up to 12 s) and the body chatters at plus or minus 1.5 m/s with no net movement.
2. **The wedge assist only looked at speed.** `Vehicle.updateWedge` wants speed under 0.5 m/s; a wedged car chattering at 1.5 m/s never
   counted as wedged, so the push-out never ran. (The assist stays; it frees boxed-in cars by shoving neighbours.)
3. **Braking with the wheel held spun the car.** (found by the controls pass, not the soak) with the calm yaw cap only on the steer angle,
   a hard stop at 20 m/s with the key held ended 71 degrees round in a sedan and 91 in a hot hatch (yaw 1.9 and 2.5 rad/s, above the cap).
4. **On foot, a sprint along a wall braked for the wall.** The wall-ahead probe braked the sprint at any angle: along a wall at 70
   degrees the runner kept 52 percent of his speed.

## What changed (all small, switchable)

- `src/physics/World2D.ts`
  - `deepestOverlap(body, staticsOnly?)`: read-only, the deepest overlap and what it is with.
  - Rescue: a body (person or car) overlapped more than `RESCUE_DEPTH` 0.04 m for `RESCUE_AFTER` 0.5 s after resolution is moved to the nearest
    free spot (rings out to 4 m, 8 m for cars, starting on the side away from what it overlaps; a flung body with `vehiclePass` is exempt).
  - Wedge relief: `Body2D.driveIn` (new optional field, `src/world/types.ts`; `Vehicle` writes the player's throttle there, 0 otherwise).
    A driven car with the throttle held, touching something, under 0.35 m of progress in 1 s and unable to back off 0.35 m, glides in 0.35 s to the
    nearest free pose (rings out to 3.2 m, three headings, a hand of clearance, no wall crossed on the way).
  - `World2D.rescueEnabled` (static) switches both off for before and after runs. Counters `rescues`, `reliefs` for debug.
- `src/entities/Vehicle.ts`: one line writing `driveIn` (and zeroing it when the car is not driven).
- `src/entities/handling.ts`: `FEEL` knobs; stick follow 7 -> 11 per second; yaw rate held to 0.8 of the calm cap while the brake is on.
- `src/entities/Player.ts` (sprint wall probe only): a wall that is grazed (one of two flank probes blocked) is slid along, not braked for.
- `tests/unit/entities/vault-pinned.test.ts`: the scenes test Jump as the way out, so the backstop is switched off inside that file.

## Controls, measured (60 Hz, no obstacles; keyboard steering is exactly -1, 0, 1)

| | before | after |
|---|---|---|
| key to half / full lock, sedan at 4, 10, 18, 28 m/s | 0.12 0.22 / 0.13 0.25 / 0.15 0.28 / 0.18 0.35 s | unchanged (0.12-0.18 half, 0.22-0.35 full) |
| key released to centre | 0.17 s at every speed | unchanged |
| steady yaw rate, sedan 4, 10, 18, 28 m/s (turn radius) | 0.50 (9.5 m), 0.74 (14 m), 0.52 (35 m), 0.36 (76 m) rad/s | unchanged |
| stick step to 90 percent of its value | 0.33 s | **0.20 s** |
| hard brake from 20 m/s with the wheel held at 1.0: heading change by the stop, sedan / SUV / pickup / hot hatch / bus | 71 / 63 / 59 / 91 / 24 deg | **44 / 43 / 43 / 63 / 23 deg** |
| same, peak yaw rate above 4 m/s (sedan, hot hatch) | 1.90, 2.54 rad/s | 0.88, 1.24 rad/s |
| same, wheel at 0.5 (sedan, hot hatch) | 49, 89 deg | 37, 56 deg |
| handbrake turn at 12 m/s, key right, 0.7 s: heading change, peak slip, time to straighten (sedan) | 91 deg, 52 deg, 1.07 s | unchanged |
| alternating left and right every 0.3 s at 15 m/s: yaw swing peak to peak (sedan, hot hatch) | 0.59, 1.21 rad/s | unchanged (no wobble) |
| throttle: speed at 0.25 s as a share of speed at 1 s (0.25 = linear) | 0.28 to 0.30, no delay | unchanged |
| 0-50 / 0-100 km/h (sedan, hot hatch) | 2.0 / 6.2 s, 1.7 / 4.1 s | unchanged |
| stop from 15 m/s on Space (sedan) | 1.28 s, 9.7 m | unchanged |
| on foot: start to 50 / 90 percent of walk speed | 0.18 / 0.35 s | unchanged |
| on foot: sprint to 90 percent, release to stop, reverse, turn 90 degrees on the spot, turn 180 walking | 0.87 s, 0.23 s (0.31 m), 0.28 s, 0.18 s, 0.40 s | unchanged |
| sprint along a wall at 45 / 70 degrees: share of the speed kept along it | 0.79 / 0.52 | **1.00 / 1.00** |

Honest reading: the existing feel numbers were already quick (0.18 s to lock, 0.2 s to stop on foot). I found nothing on foot that
"fights the player" except the sprint along a wall. Whether the keys feel smooth in the hands is not something these numbers settle:
nobody here has driven it.

**Alternative for the owner (not shipped): "weighty".** Key steering rate 5.6 -> 3.4, stick follow 11 -> 8, braking yaw 0.8 -> 0.65 of the cap:
sedan full lock 0.35 / 0.40 / 0.47 / 0.57 s at 4 / 10 / 18 / 28 m/s (shipped 0.22 / 0.25 / 0.28 / 0.35), return to centre 0.27 s (shipped 0.17),
stick to 90 percent 0.28 s (0.20), brake-with-wheel heading 33 / 39 deg (37 / 44), hot hatch 58 deg (63). Heavier and more deliberate, the
wheel visibly leads the car. Switch it live by setting `FEEL` in `src/entities/handling.ts` (numbers in `tests/unit/sim/stuck-alt.test.ts`).

## Tests

- `tests/unit/sim/stuck-regress.test.ts` (18): seven grid car trials that were hard-stuck, three that sat overlapped for seconds, three walker
  trials crushed between a car and a wall, a discriminating check that the same trial IS stuck with the backstops off, a unit test of the rescue,
  and the control numbers above.
- Soak and reports (off unless an env var is set): `stuck-soak.test.ts` (`STUCK_SOAK=<dir>`), `stuck-controls.test.ts` (`STUCK_CONTROLS=<file>`),
  `stuck-misc.test.ts` (`STUCK_MISC=<dir>`: tunnelling, resting jitter, exit overlaps), `stuck-alt.test.ts`. Chart: `scripts/dev/stuck-chart.py`.

## Other things looked for (200 trials per map each, before = backstops off)

| check | grid before -> after | real before -> after |
|---|---|---|
| tunnelling: flat out at 20, 28, 36 m/s into walls at up to 40 degrees (body more than 1 m inside a static) | 0 -> 0 | 0-2 -> 1 (a car that embeds is now freed by the rescue; one still gets deep before it is) |
| jitter at rest: three parked cars in a row beside a wall, a person leaning on them 4 s (largest movement of any car) | 0.09 mm -> 0.09 mm | 5 mm -> 0.07 mm |
| exit overlap: get in and out of a parked car 5 to 140 cm off a wall, with neighbours (player left inside something more than 2 cm) | 0 of 200 -> 0 of 200 | 0 of 200 -> 0 of 200 |
| a car climbing another | not possible: World2D is flat, no height | |

Walker "hard stuck" never occurred (0 of 1,200 in either state): the existing pin glide and the vault already free a held walker. What the
walkers did hit was being left INSIDE a car: a traffic car driven at a person standing at a wall (13 + 14 of 1,200 before, 0 after).
A person spawned inside a building is now moved to the nearest free ground after half a second (before: stayed inside).

## Known, not fixed, not verified

- Nobody felt any of this with hands on keys. The soak is a scripted agent; "smooth" is measured as response times and rates only.
- The rescue moves a body instantly (up to 4 m for a person, 8 m for a car, nearest free spot, no wall crossed unless it is wholly inside one);
  the wedge relief glides 0.35 s. In the running game a person pressed under a car will pop out on the street side after half a second: look at it.
- Relief and rescue were tested on the grid and on the real map's building colliders around 36 sites; not on moving AI cars pushing the player
  car, nor with the traffic simulation running at the same time except through the green sim suites (`tests/unit/sim`).
- `tests/unit/sim/enter-exit.test.ts` "enter/exit cycles on one spot 20 times" is RED. It is red with the backstops switched off
  (`STUCK_NORESCUE=1`) too: the player is not in the car after 0.6 s, so it comes from another lane's work on entering (CARENTRY, "instant like
  GTA"), not from this one. The rest of `tests/unit/sim` (20 files) and `tests/unit/physics` (118) and the entities movement and handling files pass.
- `tests/unit/entities/vault-pinned.test.ts` now switches the rescue off, because it exists to show Jump as the way out of a pin; with the
  rescue on the player is moved clear before Jump is needed.
- Main.ts: no change needed. `World2D.rescues` / `reliefs` are counters a debug overlay could show.
