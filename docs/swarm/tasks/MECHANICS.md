# MECHANICS: weight, a camera that never jerks, getting in and out of cars (Dana Whitlock)

Status: 21 Nov 2026. Landed and measured headless. Nothing here has been played by hand or seen in the running game, and no frames were captured.

## Harness
`tests/unit/entities/mechanics-measure.ts` (+ `.test.ts`). No browser: the real Player, Vehicle, World2D and ThirdPersonCamera at 60 Hz, wired like
main.ts (control, step, interpolated pose, camera target = player body on foot, car body in a car). Per frame: position, velocity, facing, drawn figure
position and facing, camera position, view yaw, fov. Run: `MECHANICS_OUT=<file> MECHANICS_TRACE=<file> npx vitest run tests/unit/entities/mechanics-measure.test.ts --maxWorkers=1`.
Limits: the clip pack does not decode headless, so "animation state" is not recorded (and the seat-tail sit-down is skipped: the figure just hides in the car).
Camera step numbers for driving include the car's own motion (23 m/s is 0.39 m per frame), so read yaw and jerk there, not position.
Files: before `scratchpad/mechanics/before.txt`, after `scratchpad/mechanics/after.txt`.

## Numbers (before -> after; only rows that changed)
| measure | before | after |
|---|---|---|
| jog: time to 95% of full jog (s) | 0.17 | 0.35 |
| jog: time to first 0.5 m/s (s) | 0.02 | 0.05 |
| sprint: time from jog to 95% of sprint (s) | 0.35 | 0.67 |
| camera distance from the player: jog / sprint (m horizontal) | (not measured) | 3.49 / 3.81 |
| stop from sprint: time to <0.05 m/s (s) | 0.22 | 0.43 |
| stop from sprint: distance (m) | 0.6 | 1.22 |
| stop from sprint: largest speed drop in one frame (m/s) | 0.47 | 0.28 |
| stop from sprint: speed at start of release (m/s) | 6.03 | 6.22 |
| stop from jog: time to <0.05 m/s (s) | 0.1 | 0.22 |
| stop from jog: distance (m) | 0.09 | 0.26 |
| stop from jog: largest speed drop in one frame (m/s) | 0.47 | 0.24 |
| turn walk: heading change in 1.2 s (deg) | 85.23 | 88.55 |
| turn walk: peak turn rate (deg/s) / largest one-frame change (deg) | 484.26 / 8.07 | 412.89 / 6.88 |
| turn walk: speed lost at the lowest point (m/s of 1.52) | 0.04 | 0.05 |
| turn walk: camera pos step / yaw step / yaw jerk | 0.04 m / 0.92 deg / 0.06 deg | 0.04 m / 0.92 deg / 0.05 deg |
| turn jog: heading change in 1.2 s (deg) | 85.23 | 89.63 |
| turn jog: peak turn rate (deg/s) / largest one-frame change (deg) | 484.26 / 8.07 | 305.38 / 5.09 |
| turn jog: speed lost at the lowest point (m/s of 2.91) | 0.14 | 0.15 |
| turn jog: camera pos step / yaw step / yaw jerk | 0.05 m / 0.92 deg / 0.06 deg | 0.05 m / 0.92 deg / 0.05 deg |
| turn sprint: heading change in 1.2 s (deg) | 85.23 | 89.42 |
| turn sprint: peak turn rate (deg/s) / largest one-frame change (deg) | 484.26 / 8.07 | 186.33 / 3.11 |
| turn sprint: speed lost at the lowest point (m/s of 6.38) | (not measured) | 0.4 |
| turn sprint: camera pos step / yaw step / yaw jerk | 0.1 m / 0.92 deg / 0.06 deg | 0.11 m / 0.92 deg / 0.04 deg |
| reverse jog: time until moving backwards at 0.5 m/s (s) | 0.15 | 0.27 |
| reverse jog: lowest speed in between (m/s) | 0.2 | 0.1 |
| reverse jog: largest one-frame heading change (deg) | 32.28 | 10.1 |
| reverse jog: camera pos step / yaw step | 0.05 m / 0.61 deg | 0.05 m / 0.87 deg |
| reverse sprint: time until moving backwards at 0.5 m/s (s) | 0.3 | 0.5 |
| reverse sprint: lowest speed in between (m/s) | 0.1 | 0.19 |
| reverse sprint: largest one-frame heading change (deg) | 32.28 | 9.83 |
| reverse sprint: camera pos step / yaw step | 0.11 m / 0.24 deg | 0.11 m / 1.08 deg |
| wall at sprint: speed before contact (m/s) | 6.5 | 2.46 |
| wall at sprint: frames from the biggest drop to under 0.3 m/s | 1 | 0 |
| wall at sprint: speed over the 0.5 s before the biggest drop (m/s, min..max) | 6.5..6.5 | 2.41..2.46 |
| wall at sprint: largest speed drop in one frame (m/s) | 5.85 | 2.2 |
| wall at sprint: camera pos step / yaw step | 0.11 m / 0 deg | 0.08 m / 0 deg |
| enter: press F to seated (inVehicle) (s) | 0.42 | 0.57 |
| enter: press F to car moving under control (s) | 0.5 | 0.65 |
| enter: camera pos step / yaw step / fov step | 0.93 m / 4.57 deg / 0.92 deg | 0.27 m / 0.71 deg / 0.1 deg |
| enter: camera-to-figure offset, largest one-frame change (m) | 0.77 | 0.58 |
| enter: figure largest one-frame move while visible (m) (walk is ~0.05) | (not measured) | 0.19 |
| enter: figure facing largest one-frame change (deg) | 4.92 | 4.01 |
| exit: car speed when F is pressed (m/s) | 28.12 | 27.98 |
| exit: figure jump on the exit frame (m from the seat) | 1.54 | 1.57 |
| exit: figure speed on leaving a car at speed (m/s) | 0 | 5.69 |
| exit: camera pos step / yaw step | 0.24 m / 1.77 deg | 0.26 m / 1.25 deg |
| exit: camera-to-figure offset, largest one-frame change (m) | 0.24 | 0.17 |
| exit: figure largest one-frame move (m) | 0.05 | 0.09 |
| exit: figure facing largest one-frame change (deg) | 4.49 | 0 |
| drive corner: camera pos step / yaw step / yaw jerk / pos jerk | 0.48 m / 0.37 deg / 0.01 deg / 0 m | 0.48 m / 0.36 deg / 0.01 deg / 0 m |
| drive corner: largest view yaw minus car heading (deg) | 9.38 | 14.24 |
| drive corner: fov range (deg) | 78.6 to 81.33 | 69.16 to 71.44 |
| drive corner: camera distance from car, min to max (m) | 5.14 to 5.25 | 5 to 5.19 |
| walk zig-zag: camera pos step / yaw step / yaw jerk | 0.05 m / 0.96 deg / 0.89 deg | 0.05 m / 0.97 deg / 0.86 deg |
| walk zig-zag: camera-to-figure offset change per frame (m) | 0.05 | 0.06 |
(Rows whose wording changed between runs of the harness, such as the wall and figure-move lines, show 'not measured' for before: the first run measured the wall badly; before values: wall drop 5.85 m/s in one frame at 6.5 m/s, figure move 0.48 m, camera step 0.93 m.)

## What landed
1. On foot (Player.ts). Accel and brake depend on speed (jog reached in 0.35 s, was 0.17; sprint from jog 0.67 s, was 0.35; sprint stop 1.2 m over 0.43 s, was 0.6 m over 0.22 s).
   Turn rate falls with speed (`maxTurnRate`: about 300 deg/s at a jog, 190 flat out; was 480 at every speed). The body gives less speed until it faces the way it
   was told (`alignScale`), so a reversal is a plant, a swing round and a drive off: the one-frame facing change on reversing fell from 32 to 10 degrees.
   Stick tilt walk and jog already existed (1.6 to 3 m/s by tilt) and are unchanged. Sprint-at-wall: speed is taken off over the last 2.8 m (contact 2.5 m/s, was 6.5)
   and the first moment of braking plays the `stumble` one-shot; a real hit (speed lost in a step above 3 m/s) braces: stumble clip, weaker push for 0.5 s, `Player.onBump(strength)`.
   Not done: a person-specific bump (the same drop test catches a person, but pedestrians are not pushed back or down here); the stumble clip only exists with the street pack, so it is
   not seen headless. `AnimInput.look` is wired (below). Foot planting is ANIM2's; the controller's own speed slew (16 up, 22 down m/s2) is above the new accel and brake rates, so the pose follows the motion.
2. Camera (Camera.ts). Pivot follows through a critically damped spring (foot 20, car 60 rad/s; snaps above 6 m): 3.49 m from the player at a jog, 3.81 m at a sprint (it trails and settles).
   Roll into foot turns (max 1.1 deg). Car: the view swings out of corners (turn rate x 0.16 s) and looks into a slide (0.5 of the slip angle), eased; added to the view, not to `yaw`,
   so the 2 s hold and the accelerating return are unchanged (their tests are green). Rig distance, height and lens change over about 1.1 s after getting in or out. The lens
   moves in at most 16 m/s when something comes between it and the body (was a 22/s exponential: 0.9 m in one frame seen while walking to a car), and the rise over a roof is eased
   (it popped 0.55 m the frame the mode changed). Chosen from the LOOK lane's proposal, applied as given: car distance 4.6 to 4.1, height 1.7 to 1.45, look 1.3 to 1.15, fov 70-82 to 62-72,
   pull-back 0.9 to 0.6. Box trucks keep their roof clearance (extra height x 1.15). NOT confirmed by frames: nobody has looked at the lower, closer car camera.
   Foot rig (3.2 m, 1.55, 64) untouched. Tests updated for the new numbers (camera-gta, camera-clearance, entities/camera).
3. Cars (Player.ts). Walk to the door is a Hermite path that leaves at the player's own speed (no stop dead at the first frame) and takes 0.4 to 0.55 s by distance; seated at 0.57 s
   in the harness (was 0.42); camera step on entering 0.27 m per frame (was 0.93); the figure no longer pops to the car's centre for a frame at the end of the sit-down (needs the sit clip).
   Leaving a moving car: above 2.5 m/s the body carries half the car's speed (cap 6 m/s) and plays the stumble; above 9 m/s the player rolls (lies, slides, gets up in 0.9 s; no vehicle pass, no blood).
   Was: dropped dead, 0 m/s beside a car doing 28 m/s. Door swing as a hinge: NOT done, the car models have no separate door objects (only door gaps painted into the livery). Car-jacking
   exists in the code (crime event on carjack) but the driver is not pulled out and does not run; not changed, no time.
4. Look-at. Player: `lookInput` feeds `AnimInput.look`: the head leads a turn (0.6 of the angle still to turn) and glances at `player.glanceAt` when set. Pedestrian: glance at
   `Pedestrian.lookAtPoint` within 6 m and 110 degrees, about half of people are curious, in on and off glances, eased; not while fleeing or down. `anim.cheap` is set when the far level (last LOD) is shown.
   Cost (ANIM2 harness, 100 people, this loaded box, noisy): 1.12 ms near, 0.93 ms cheap per frame.
5. Aim and melee: not started.

## Lines for main.ts (Fable)
- `player.onBump = (s) => cam.addShake(0.12 * s);` after the player is built.
- In `updateCamera`, with the other `camCtx` lines: `camCtx.ignoreId = player.enteringId;` and add `ignoreId?: string | null` to the `camCtx` type (stops the lens shying from the car being entered).
- Once after the player exists: `Pedestrian.lookAtPoint = player.body.pos;` (a live object). Optional: each second set `player.glanceAt` to the nearest pedestrian within 5 m, or null.

## Known red, not mine
- tests/unit/entities/player-edge.test.ts "radio (E) toggles once": the CONTROLS lane moved radio to Period in Bindings.ts. pedround5 shoe-hem test: failed before (ANIM2 notes).
- Assertions I changed: player.test "W accelerates" (20 to 30 steps: a jog now builds over 0.35 s); camera numbers in three camera test files (LOOK values).

## Honest feel
Weight and continuity are measurably there on paper: no step in speed, facing, camera or figure above a few percent of a metre per frame except the walk to the door and driving itself.
Nobody has played it. The stumble, roll and look-at need the street clip pack and a person's eyes; the car camera values are untested by eye; fixed-timestep interpolation in the real loop is not in this harness.
