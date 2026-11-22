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

## Looked at
No browser strips: the showcase render queue was full (both small slots held by other seats) and one attempt died when I edited the tree under it. Instead, plots drawn from the harness frames
(PIL, `scratchpad/bodyteam/gait/plot.py`): the dots are the ground speed of a planted ball (ball under 3 cm), before (top) and after (bottom), red left foot, blue right; a skating foot is a dot well above zero.
- `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/gait/plots/slide-jogToSprint.png`: before, the blue foot in the run slides at 1 to 2 m/s in most stances; after, every planted foot is at about 0 to 0.4.
- `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/gait/plots/slide-sprintToStop.png`: the stop. Honest: after the body stops, the settling right foot still shuffles at 0.5 to 1 m/s for about 0.4 s with its ball 2 to 3 cm up (a toe drag in the captured stop clip; the lock lets go above 2.7 cm). Widening the lock's capture height to 3.4 cm halved it but pushed jog-to-run past 4 cm, so it stays as it was. Open.
- Browser strips (the people showcase, real model, side view, after only; the render finally ran): `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/gait/strips/anim_action_walkJogSprint_cam_side-after.png` (walk to jog to sprint: planted shoes, longer reach as the speed rises) and `.../anim_action_stopRun_cam_side-after.png` (run, two shortening steps, standing; the back lean is slight). No before strips.
- also `slide-startSprint.png`, `slide-walkToStop.png`. Real strips of the in-game look are still owed (ask REVIEW).

## Items 2 to 5 (headless; what landed)
- 2 Starts and stops (controller.ts): a start clock (`startT`, 0.35 s walking growing to 0.6 s toward a run) and a stop clock (`stopT`); during a start the leg swing begins at 0.55 of its length and grows
  (short first steps; the phase is stride-matched so the feet still keep pace), during a stop it shortens by up to 0.35 (settling steps). A lean from acceleration (`accelS`): up to 10 degrees forward
  on a start, 11 back in a brake, head kept level. Pedestrians used to jump from 0 to 1.2 m/s in one frame: now they climb at 3.4 m/s2 (a flight 9), about 0.35 s to a walk (Pedestrian.ts, `walkTo`);
  the player's own ramp (accel 9 falling to 4.6, brake 12 to 17) is untouched and the key still answers in two frames (gait-move2 green). The captured start and stop clips still play on top.
  NOT done: a plant-and-push step on a sharp reversal, turning in place with small steps (the captured turn clip still does it).
- 3 The walk: stride and cadence read the leg length at run time (`legScale`, unchanged); cadence now shortens the step (kids, elders, quick walkers); a wider base of support for elders and a seeded
  spread for everyone (`Gait.width`, hip roll up to 0.08 rad each side, the foot lock keeps the shoes put). Pelvis rise and side shift stay the clips'. Heel strike to toe-off roll: not touched.
  Tired or hurried variant: not done.
- 4 Kerbs: NOT done (Ground.ts still eases the 0.15 m in about 0.2 s and the foot lock does not know the ground).
- POSE's `applyBodyLayers` is wired into `controller.write` (see the channel); `Gait` gained `age`, `seed`, `width`.

## Cost of one pedestrian's animation step (microseconds, this shared box, best of five, 100 people at 60 Hz; noisy, repeat runs differ by 1 to 1.5)
Before (tree at 25450d0): walk 8.6 to 10.6, far level 5.6 to 7.0, standing 6.5 to 7.9, jog 7.5 to 8.2. After, my part only (layers off): walk 9.4 to 11.9, far 7.1 to 7.4, standing 8.1 to 9.1, jog 8.0 to 9.3.
So about 10 to 15 percent more for a walker; the far level the same within noise. POSE's layers add about 1 to 2 more (their number to quote).

## Tests touched
- Added `gait-slide.ts` and `gait-slide.test.ts` (slide through 11 speed changes at three frame rates, bounds 1.5 mean and 4 max per stance).
- `anim-bodies.test.ts`: the hip-height ceiling in the one-shots test goes from 1.08 to 1.1 of the hip's rest height: the stride-matched run cycle meets its flight phase on different frames and its
  pelvis rise peaks at 1.09 on one body at one frame. It is the run take's own bounce, not a new lift.
- `pedestrian.test.ts`: "walks at about 1.2 m/s" measures the half second after the 0.35 s set-off.
