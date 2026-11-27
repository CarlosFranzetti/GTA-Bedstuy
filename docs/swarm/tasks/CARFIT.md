# CARFIT: making the tree whole after CARENTRY and STUCK, steering in between (27 Nov 2026)

Seat CARFIT (Marlowe). Owner's choices: steering feel IN BETWEEN quick and weighty; nearest door then slide across; exit camera behind the
car's direction. Status: in progress, kept current.

## 1. Red tests where CARENTRY and STUCK meet (cause, and whether code or test changed)

| test | cause | fixed in | why |
|---|---|---|---|
| `tests/unit/sim/enter-exit.test.ts` "enter/exit cycles on one spot 20 times" | The loop put the player back 0.5 m along world +x from the door. For a sedan at heading 1.0 that spot is on the far side of the car's box from the door, so (CARENTRY) the walk goes ROUND the car, 1.45 s, never through it. The test wanted 0.6 s. The first cycle (start beside the door) takes 0.55 s, as built. | TEST | The old test asserted a walk through the car's body, which the owner has replaced. Now each cycle starts where the exit left the player (beside the door, 0.6 s asserted), and one extra round starts at the old far-side spot and asserts the walk round the car ends inside within 1.6 s. |
| `tests/unit/render/camera-smooth.test.ts` "getting in or out glides" | CARENTRY made a mode change ONE CUT; the first frame now jumps 1.75 m. The owner chose a cut. | TEST | Replaced by "getting in or out is ONE CUT": the first frame must move more than 1 m (it cut), then with the pivot still the lens never moves more than 5 cm a frame and ends within 15 cm of where the cut put it. A glide would fail the first check, a drift the others. |
| `tests/unit/entities/vault-pinned.test.ts` (4 "pinned by a car that has stopped against them") | Red earlier because STUCK's rescue moves a body overlapped for 0.5 s, so the player was already out before Jump. It passes now with the rescue switched off in the file. | TEST (added) | Switching it off is fair for the Jump tests (they exist to show Jump), but it hid whether the rescue itself leaves the player clear. New block "pinned, with the STUCK rescue switched on": all scenes, rescue on, wait for the prompt, press Jump once, run 3 s, assert the player is not inside a collider and has 1.5 m of free run. Passes (30 tests in the file). |
| `npx tsc --noEmit`, `yawRate` private in `tests/unit/sim/stuck-controls-lib.ts` | `Vehicle.yawRate` is private; there is a public getter `yawRateRad`. At the time of this lane the file already used the getter and tsc (which covers `src` and `tests`) reported nothing. | nothing to fix | Clean at the start and at every check since. |

## 2. Steering feel, three sets side by side
Shipped: `FEEL` in `src/entities/handling.ts` = key steer rate 4.5, stick follow 9.5, braking yaw 0.72 of the calm cap (constants `STEER_RATE`,
`ANALOG_FOLLOW_STICK`, `BRAKE_YAW_FRAC`). Measured at 60 Hz with no obstacles by `tests/unit/sim/carfit-feel.test.ts` (off unless
`CARFIT_FEEL=<file.json>`), which sets each set and reads STUCK's control functions. Sedan unless stated; "yaw" is the steady yaw rate (the same in all
three sets within 6 percent, so the turn radius barely moves: only the speed of getting there does).

| measure | quick (5.6 / 11 / 0.8) | IN BETWEEN, shipped (4.5 / 9.5 / 0.72) | weighty (3.4 / 8 / 0.65) |
|---|---|---|---|
| key to full lock, 4 / 10 / 18 / 28 m/s (s) | 0.22 / 0.25 / 0.28 / 0.35 | 0.27 / 0.30 / 0.35 / 0.43 | 0.35 / 0.40 / 0.47 / 0.57 |
| key to half lock, same speeds (s) | 0.12 / 0.13 / 0.15 / 0.18 | 0.13 / 0.17 / 0.18 / 0.22 | 0.18 / 0.20 / 0.25 / 0.28 |
| key released to centre, same speeds (s) | 0.17 / 0.17 / 0.17 / 0.17 | 0.22 / 0.20 / 0.20 / 0.20 | 0.28 / 0.27 / 0.27 / 0.25 |
| steady yaw rate at 4 / 10 / 18 / 28 m/s (rad/s) | 0.50 / 0.74 / 0.52 / 0.36 | 0.50 / 0.74 / 0.52 / 0.35 | 0.50 / 0.74 / 0.50 / 0.32 |
| stick step to 90 percent (s) | 0.20 | 0.23 | 0.28 |
| hard brake from 20 m/s, wheel held at full: heading change by the stop (deg), sedan / SUV / pickup / hot hatch | 44 / 43 / 43 / 63 | 42 / 41 / 41 / 60 | 39 / 38 / 38 / 58 |
| same: peak yaw rate above 4 m/s (rad/s), sedan / SUV / pickup / hot hatch | 0.88 / 0.79 / 0.76 / 1.24 | 0.81 / 0.73 / 0.70 / 1.15 | 0.75 / 0.67 / 0.64 / 1.06 |
| same: peak slip angle (deg), sedan / SUV / pickup / hot hatch | 7 / 14 / 18 / 30 | 5 / 10 / 14 / 22 | 6 / 7 / 9 / 15 |
| handbrake turn at 12 m/s, key right, 0.7 s (sedan): heading change / peak slip / straighten | 91 deg / 52 deg / 1.07 s | 89 deg / 49 deg / 1.08 s | 87 deg / 45 deg / 1.13 s |
| left-right every 0.3 s at 15 m/s, yaw swing peak to peak (rad/s) | 0.59 | 0.54 | 0.45 |

Note: the weighty set's brake heading here (39 deg sedan, hot hatch 58) differs from STUCK's note (33 sedan); this table is one run of one function over all
three sets, so the columns are comparable with each other.

Tests changed to the shipped numbers (`tests/unit/sim/stuck-regress.test.ts`): brake heading under 46 degrees (sedan, SUV, pickup) and 66 (hot hatch), stick step
between 0.2 and 0.26 s, a new test for key lock (sedan full lock 0.24 to 0.30 s at 4 m/s and 0.40 to 0.47 s at 28 m/s, centre 0.18 to 0.25 s).
SIDE EFFECT, seen and fixed in the tests: the soak is a scripted driver, so the feel changes which trials end stuck. Trial 955 (grid, car) was
the "hard-stuck without the backstops" discriminator and no longer is. A scan of trials 1 to 1599 (grid cars, backstops off) under the shipped feel finds hard-stuck
147, 778, 793, 1458, 1491 and overlapped over 1 s 26, 205, 631, 743, 1303, 1346, 1570; with the backstops on NONE of the 12 is stuck or overlapped 0.75 s.
The discriminating test now uses those. STUCK's before and after table (2,000 cars) was measured under the quick feel and was not re-run here.

## 3. Test folders (one at a time, `--maxWorkers=1 --testTimeout=900000`, after all edits)

core 256 passed; physics 118 passed (1 skipped); entities 1,210 passed (3 skipped); sim 257 passed (7 skipped, 2 todo); render 346; game 622 (7 skipped);
world 924 (5 skipped). All green, including the grid's seeded traffic sims. `npx tsc --noEmit` clean (it covers `src` and `tests`).

## 4. In the running game (`scripts/dev/carentry-shoot.mjs`, hosted build of this tree, real map, `?q=low`, canvas hidden, the real F key)

The parked cars near the start were an SUV and a hatch (no step van or box truck within reach), so the 12 cases are SUV and hatch, Classic and Modern,
driver side, passenger side, from behind. Numbers from `carentry-carfit.json`:

- frames with the lens inside the car box: 0 of 12; frames within the near plane of the car: 0 of 12;
- camera cuts per press, exit and press: 2 in every case (one on each press), `settledAfter` 0.02 s;
- lens speed outside the cuts: 0 in Classic, 3.3 to 3.6 m/s in Modern (driver and passenger approaches), 0 from behind;
- press to driving: 0.50 s at a door, 1.13 s (hatch) and 1.23 s (SUV) from behind (round the car).

Strip `docs/swarm/teams/sheets/carfit-entry.jpg` (strip A on top, strip B below, each 4 rows of every 3rd frame, 0.6 s after the press then after the exit; A is the SUV in Classic from its driver side, B the hatch in Modern from its passenger side; my reading of the tool's header). What I see: a clean cut to the car view
that does not move after the first frame; no lens inside a body. Ugly: on leaving, the hatch's flank (Modern, passenger side) and a police car fill the lower half of the
frame, and the exiting character is small and half hidden by the car's rear: the "cut behind the character" alternative (CARENTRY choice 4) would help. The driver is not seen
inside the car in the entry rows (dark cabin through the glass). A white car swings into the lower left corner in the second half of strip A: traffic, not the lens.

Boot check, desktop, real map, `--noframes`: 408,212 triangles, 229 draw calls, 35 pedestrians (15 within 150 m), 980 vehicles, no page errors, no NaN warnings, clean.

## Not done or not verified
- Nobody has hands on keys: the steering numbers are response times, not feel. The in-between set is the owner's pick by the numbers only.
- STUCK's 2,000-trial soak table was not re-run under the new feel (only 1,599 grid car trials were scanned for stuck or overlapped cases: none with the backstops on).
- Medium and high tiers, a real phone, anything heard.
