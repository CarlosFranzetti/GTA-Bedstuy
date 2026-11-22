# BODY-GAIT: feet that stay planted through speed changes, weighted starts and stops (seat GAIT, Rowan Ashby)

Status: 22 Nov 2026, evening, in progress. Headless numbers only (the ANIM2 fake rig at 30, 60 and 144 steps a second). Nothing here is played by hand.
Owner: "let's start with movement"; "some more realistic character movement". GTA V is the style reference (weight, momentum, feet that stay planted).

## Item 1: feet through speed changes (done, headless)
Cause, found by dumping the run take's planted foot: the shared phase was advanced at a plain weighted rate, but a captured cycle's planted foot does NOT travel
back at a constant speed through its stance (the run take's right foot goes back at about 2.7 m/s while the left goes at 3.7, so at one steady rate one shoe skated 9 to 13 cm
a stance even with the lock on: the lock gave up past 12 cm of offset). Two fixes:
1. `locomotion.ts` `strideTable` / `matchedFrequency`: for each clip a table of how many metres the planted ball travels back per unit of cycle at each phase (forward kinematics on the
   reference skeleton, flight stretches take the mean, smoothed, held to 0.6..1.5 of the mean). The controller advances the shared phase at ground speed over that, at every instant
   (midpoint step), within 0.7..1.45 of the plain rate, so stride length times cadence is the ground speed through the stance, in a blend too (tables blend by the clip weights).
   The person's stride factor (`controller.strideFactor`) now divides by cadence (was cadence^0.5) because the frequency no longer carries it: a quick-cadence person takes shorter steps.
2. `footlock.ts`: the lock keeps its authority up to 26 cm of offset (was fading out from 5 to 12 cm); the reach limit is 0.992 of the leg; the knee side of a nearly straight leg fades to
   forward; the solve is mixed in by how far it moves the foot (no pop when the pull ends); the correction to thigh and shin turns by at most 900 degrees a second (no snap when a near-straight knee picks another side).

Foot slide, ball of the foot, cm per stance, mean / max, lock on, player's own speed curve (`tests/unit/entities/gait-slide.ts`, `gait-slide.test.ts`; table: `GAIT_OUT=<file>`):
| scenario | before 30 fps | before 60 | before 144 | after 30 | after 60 | after 144 |
|---|---|---|---|---|---|---|
| startWalk | 0.6 / 3.7 | 1.1 / 6.0 | 1.4 / 7.8 | 0.2 / 0.5 | 0.2 / 0.5 | 0.3 / 0.4 |
| startJog | 0.4 / 3.7 | 0.8 / 6.0 | 1.2 / 7.8 | 0.2 / 0.3 | 0.2 / 0.3 | 0.4 / 1.1 |
| startSprint | 3.7 / 3.7 | 0.3 / 6.0 | 1.9 / 7.8 | 0.1 / 0.1 | 0.2 / 0.3 | 0.3 / 1.1 |
| walkToJog | 0.4 / 3.7 | 0.7 / 6.3 | 1.0 / 7.9 | 0.3 / 0.5 | 0.2 / 0.5 | 0.3 / 0.6 |
| jogToRun | 1.8 / 17.6 | 1.8 / 19.0 | 2.5 / 20.6 | 0.3 / 0.4 | 0.2 / 1.5 | 0.6 / 4.0 |
| jogToSprint | 3.6 / 17.6 | 1.3 / 19.0 | 2.3 / 20.6 | 0.2 / 0.4 | 0.3 / 1.5 | 0.5 / 4.0 |
| sprintToJog | 0.4 / 3.7 | 0.6 / 6.3 | 1.3 / 7.9 | 0.2 / 0.3 | 0.2 / 0.3 | 0.3 / 1.1 |
| sprintToWalk | 1.2 / 10.3 | 1.1 / 9.4 | 1.9 / 11.8 | 0.2 / 0.5 | 0.2 / 0.5 | 0.3 / 1.1 |
| walkToStop | 1.3 / 3.7 | 2.0 / 6.3 | 2.5 / 7.9 | 0.3 / 0.5 | 0.2 / 0.5 | 0.3 / 0.4 |
| jogToStop | 0.9 / 3.7 | 1.4 / 6.3 | 2.1 / 7.9 | 0.2 / 0.3 | 0.2 / 0.3 | 1.9 / 11.0 |
| sprintToStop | 4.0 / 15.7 | 2.1 / 16.1 | 3.3 / 17.7 | 0.2 / 0.3 | 0.2 / 0.3 | 0.3 / 1.1 |
(The old "before" start rows are the first stance, which in the old code was dragged 4 to 8 cm as the body set off; it depended on the frame rate.)

## Left to do (this file is updated as items land)
- Item 2 starts and stops, item 3 the walk itself, item 4 kerbs, item 5 pedestrian cost.

## Tests touched
- Added `gait-slide.ts` and `gait-slide.test.ts` (slide through 11 speed changes at three frame rates).
- `anim-bodies.test.ts`: the hip-height ceiling in the one-shots test goes from 1.08 to 1.1 of the hip's rest height: the stride-matched run cycle meets its flight phase on different frames and its
  pelvis rise peaks at 1.09 on one body at one frame. It is the run take's own bounce, not a new lift.
