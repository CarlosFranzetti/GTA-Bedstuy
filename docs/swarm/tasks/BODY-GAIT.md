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

# Second shift (Tomas Reyes, GAIT, 22 Nov 2026, late evening)
Taking over from Rowan. Order of work: 1 jog and sprint arms, lean and knees; 2 the standing squat; 3 turn in place and reversal; 4 walk cycle (pelvis, heel-toe, shuffle); 5 kerbs; 6 cost; 7 the five sims.
Bone ownership agreed with POSE on the channel (see transcript): arms and elbows below 2.6 m/s are POSE's (bodyLayers.ts); from 2.6 to 4.2 m/s a run style blends in; above 4.2 the run style (new `src/entities/anim/runStyle.ts`, GAIT's) writes arm, elbow, torso and hips pitch and the swing knees. Acceleration lean stays GAIT's.
Notes are written as I go; items below are filled when done.

## Second shift: what landed (Tomas Reyes, headless; strips from the REVIEW harness)
### 1 The run (done)
Cause: the captured jog and run keep the upper arm at -22..+4 degrees (never forward) with the elbow at 90 to 126: praying hands. Fix: `src/entities/anim/runStyle.ts` (GAIT's), called in `controller.write()` after `applyBodyLayers`.
From 1.7 to 2.7 m/s (weight eased over 0.22 s up, 0.3 s down) the arms swing opposite to the legs, the swing read from the same pose's thighs (so phase follows the clips and the stride matching, through blends): jog +-0.55 rad (31 deg),
elbow 1.5 rad (86 deg) folding 0.14 more on the forward arm; sprint +-0.86 (49 deg), elbow 1.56. Sprint adds 0.15 rad (8.6 deg) forward lean, split torso/hips, faded out while the acceleration lean is working (`accelS`);
the swing thigh lifts 0.28 rad (knee fold stays the clip's: adding 0.16 put walkJogSprint at 29 deg in one frame, limit 25). Off while an action, vault, jump, carried bag or keyed idle poses the arms. `ctl.runStyleOn = false` for a before.
Ownership with POSE: arms below about 2 m/s are bodyLayers.ts's; above it runStyle.ts's; torso roll, head, standing, weight shift stay POSE's; acceleration lean GAIT's.
Strips: `scratchpad/bodyteam/gait2/strips/jog-sprint-before.png` / `jog-sprint-after.png` (REVIEW's strips view, one adult, 8 frames a cycle). Tests: `gait2-run.test.ts` (swing, elbows, lean, opposite phase, off at a walk).
Not done: the whole body lean "from the ankles" is a pitch of torso and hips (the rig does not move the pelvis forward over the feet); heel-to-seat is the clip's own (about 97 degrees of knee).
### 2 The standing squat (done, residual 4 to 7 degrees)
Two causes, both in my files. (a) `footlock.ts` limited a held foot's reach to 0.985 of the leg (pelvis sink) and 0.992 (solve): cos(10 deg) = 0.985, so every standing leg was bent 14 to 20 degrees; now `REACH_NEED` 0.9994 and `REACH_SOLVE` 0.9996 (about 4 degrees).
(b) the mesh's rest leg is not straight: knee 4.6 deg forward of the hip, shin 1.5 deg back, 6.2 deg of bend at zero rotation, while the clips are cut for a straight reference leg. `controller.legFix` (hip -4.6, knee +6.1, ankle -1.5 deg on that body; foot pitch unchanged) is added on every pose; `legFixGain = 0` turns it off.
Standing knee bend (angle between the thigh and shin vectors, lock on, 2 s of idle): la-hoodie-cap, ba-hoodie-fade, ba-work, ba-elder, ea-kid: before 20.9, 21.2, 20.9, 20.7, 23.7; after 6.3, 4.1, 6.6, 6.7, 5.0 (mean 5.7). The rest is POSE's weight shift (the pelvis moves over held feet). Test: `gait2-standing.test.ts` (each under 10, mean under 8).
Both feet flat: the foot lock keeps the shoe's pitch; not measured separately.
### Lead's asks passed on: `layers()` data
`i.stoop`, `i.pockets` (group.userData.pockets ?? 1) and `i.splay = max(userData.splay, armClearRad(torsoHalfWidthAt ...))` are set once in the constructor; the stoop-twice bug (`own`, tested `> 0.02` on a negative number) is fixed, so an elder takes 30 percent of the gait lean and head drop.
### 7 Sims
Pedestrian ramp left at Rowan's 3.4 m/s2. The five sims are chaotic against it (cars brake for people), so the red moves: 3.4 = traffic-5min (grid), police, combat, tutorial green; realtraffic-5min red on "cars stay on the roadway and out of buildings" (7 car samples in a building, seed 4242).
4.5 = real green, grid red (AI-vs-AI collision seed 7, strength 3.49); 5 = grid red twice (gridlock window and the same collision); 6 = grid green, real red ("no red-light violations"); ramp removed = all green. Not a gait fault: pick the value with the sims you can afford to keep, or let the sims set a ramp of 1e6 (a `Pedestrian` static knob; not added).

### 6 Cost (microseconds per update, 100 people, 60 Hz, best of five, noisy; `GAIT_COST=1 npx vitest run tests/unit/entities/gait2-cost.test.ts --silent=false`)
| | tree 25450d0 (Rowan's before) | now, all on | GAIT run style and leg fix off | POSE layers off |
|---|---|---|---|---|
| walk 1.4 | 8.6 to 10.6 | 11.7 | 11.5 | 8.3 |
| walk far level | 5.6 to 7.0 | 6.6 | 7.2 | 5.9 |
| stand | 6.5 to 7.9 | 8.8 | 10.0 | 8.6 |
| jog 3 | 7.5 to 8.2 | 8.9 | 9.9 | 8.0 |
| sprint 6.5 | (none) | 8.8 | 7.5 | 8.3 |
My two additions cost under 1 microsecond (runs within noise); POSE's layers are about 3 microseconds on a walker (more than their 1 to 2). A walker is at the top of the 10 percent band (11.7 against 10.6 x 1.1), the far level and the others are inside it. Not reduced further: no skip for people off screen (the controller does not know; the caller would pass a flag).

### Not done
3 turn in place with small steps and the plant-and-push reversal; 4 pelvis rise and side shift, heel-toe roll, the after-stop shuffle; 5 kerbs. 6 cost: see the table below.
