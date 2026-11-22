# CAMFIX: the camera screws up getting in and out of a car or changing views (22 Nov 2026)

Status: fixed and measured headless (143 harness tests green, 47 of them red on the old code). One run in the real game: see the end.
Lane CAMFIX. Owner report, 22 Nov (his words): "sometimes the camera screws up getting in and out of car or changing views."

## How it was reproduced
`tests/unit/entities/camfix-harness.ts` runs the real ThirdPersonCamera, Player, Vehicle and World2D the way main.ts does: the game's own
FixedStepper (60 Hz steps, frames clamped to 50 ms like the real loop) and PoseSnapshots, keys edged in the fixed step (`views.handleKeys`, F),
one camera update per rendered frame with the frame dt and the interpolated pose. Frame rate (30, 60, 144) and one 250 ms frame (the loop clamps
it to 50 ms, as in the game) at any time are parameters. Scenarios: `camfix-scenarios.ts` (26 of them). Assertions: `camfix.test.ts`
(`CAMFIX_FULL=1` sweeps the hitch every 0.2 s of every scenario; the default sweep is coarser).

Per-frame checks outside the frames the camera reports as a cut (`snappedThisFrame`), mouse look, shake and the look-back swing: no NaN; lens at
least 0.3 m above the walking surface; never inside the car body (chase-family views); look target within 3 m of the followed body; lens
movement relative to the body (0.3 m + 6 m/s x dt; 0.15 m + 30 m/s x dt in scenarios that change views); view direction under 240 deg/s; field of
view under 60 deg/s; up vector under 8 deg per frame. Then: the same rest pose at 30, 60 and 144 fps (2 cm; 6 cm against a wall, the pull-in has a
5 cm dead band by design), settled 1.5 s after standstill, cuts are clean (first frame already the new rig, nothing drifts afterwards), chase to far is
a blend of about 0.25 s, getting in is one blend of 0.45 to 0.8 s eased at both ends, the view yaw ("walk forward") does not move more than 10
degrees in the 1.8 s after stepping out (stopped, at 6 m/s, rolling).

## Defects reproduced (60 fps, no hitch; numbers measured on the old code)
1. Cycling the car views with V flew the lens through the car. Hood is a first-person rig (distance 0), and the change was a smoothed blend like
   any other, so the lens dived forward through the roof: up to 4.4 m in one frame, view direction 2,800 deg/s, the look vector pointing straight
   down at the roof for a frame (up vector 47 degrees off), inside the body box for 3 to 4 frames (11 frames at 144 fps). Seen on every cycle past the
   hood: slow, while turning, reversing, with look-back held, at top speed.
2. The cinematic view was a half-cut. The shot's yaw (up to 180 degrees) was applied at once while distance, height and lens were blended, so the first
   frames were the new angle at the old distance: 13.7 m in one frame (7,000 deg/s) into it, the same out of it. `views.cutThisFrame` is set by
   `change()` in the fixed step but cleared by `views.tick()` at the start of the next camera update, so the cut flag that was meant to snap the
   smoothing never reached the camera for a key press; only the director's own cuts did.
3. Stepping out turned the camera round. The player is placed beside the door facing the car, the camera's idle timer sits at its "never touched"
   value, so the yaw spring pulled the view 90 degrees round over about a second (peak 102 deg/s), to look at the car side on. The heading that
   "walk forward" is measured against therefore moved 90 degrees under the thumb after every step-out (and the end pose depended on frame rate: the
   exit-while-rolling case differed by more than 2 cm between 30 and 144 fps).
4. First person on foot (V twice) into a car, and the hood out to the street: both were blends, so the lens dragged through the body and the view
   turned 250 to 380 deg/s.
5. Getting in or out was not one blend: the pivot's door-to-centre offset decayed on its own exponential (5 per second), the rig on another (slowed
   for 1.1 s), the yaw on a third. No ease in (it started at full speed), and the finish depended on frame rate.
6. Smaller: after a cut (a director cut, a view cut) the pivot spring restarted from rest, so the lens lagged in over the next 4 to 6 frames (0.4 to
   0.7 m a frame while driving). Stepping out beside a car pulled the lens in at the full 16 m/s wall limit for two frames (a 0.5 m pop as the
   lens slid past the car's corner).

## Root causes
- No notion of a cut in the camera: every change of the rig went through `k = 1 - exp(-rate dt)`. A cut flag existed only for the cinematic
  director and was cleared before it was read.
- `yaw` follows `targetHeading` at full pace whenever `idle` is large, and a step-out changes `targetHeading` by 90 degrees.
- Three separate smoothers (rig, pivot offset, yaw) with different time constants and no common clock.

Ruled out (tested, not a cause): spring velocity carried across a rig change (the spring is on the pivot, which does not change with the rig); the
yaw wrap at plus or minus pi (every enter and exit scenario, including entering facing the car's front, stays under 3 deg a frame in yaw outside mouse look);
`ignoreId` dropped early (the id is held to the last frame of the walk, and the mode flips in that same update); the wall pull-in using the old rig's
reach (`reach` is capped to the lens distance each frame; the pull-in only popped while stepping past the car's corner, item 6); look-back or
snap-back firing during a transition (look-back is a separate spring and does not touch `yaw`; the snap-back timer is untouched by a transition,
except now on stepping out, on purpose); the view index pointing at a view the mode lacks (indexes are per mode); the director's shot applied for a
frame after leaving the view (not seen: `cineShotYaw` is zero from the first frame, and the leave is now a cut anyway); the car "removed while
inside" (main.ts never removes the player's car: its only exits are `player.exit()` and `setPose`, which is a teleport and a snap).

## What changed (src/core/Camera.ts, src/core/CameraViews.ts)
- `CameraViews.serial` counts view changes. The camera compares it with the last value it saw, so a change reaches it however the fixed step and
  the render frame interleave (at 144 Hz most frames run no fixed step).
- Cuts: a change of view or mode to or from first person, hood or cinematic is a clean cut: every rig value, the lens, the pivot offset and the
  pivot spring go to the new rig in that frame (the spring is placed where it would be in steady motion, so no lag follows), the wall reach is
  reset. `snappedThisFrame` reports it.
- Blends: any other mode or view change is one blend from the values it started with to the goal on one smoothstep: `MODE_BLEND` 0.6 s for getting
  in or out (the pivot's door-to-centre offset rides the same smoothstep), `VIEW_BLEND` 0.25 s between chase-family views. Eased at both ends and
  independent of frame rate. When no blend runs the old exponential smoothing follows speed changes as before.
- Stepping out holds the view where it was (idle timer reset): it returns behind the player by the usual two-second rule. The walk-forward heading no
  longer swings when you get out.
- While a blend runs the wall pull-in is limited to 7 m/s (was 16) so it does not add a pop to the blend.
- Not touched: the car rig (4.6 m back, 1.7 m up), the foot rig, every distance, height and field of view number, the look rule, the spring.

## Chosen conventions
- Which view: the car remembers the car view, on foot remembers the on-foot view (unchanged: `CameraViews` keeps one index per mode). Getting in
  with the hood or cinematic view remembered cuts to it when the player sits down, and leaving it cuts to the foot view.
- Cuts are: to or from first person on foot, to or from hood, to or from cinematic, the director's own shot changes, a teleport (over 6 m).
  Everything else is a blend.

## Not covered
- The elevated line is approximated by a row of 0.6 m pillars; there is no deck overhead in the 2D world.
- Pause and resume: `Game.paused = false` resets the stepper and the clock, so no long frame reaches the camera; tested only as a 0.5 s frame through
  `frameDt` (clamped to 50 ms like the loop). A raw 250 ms camera dt is not reachable in the game (MAX_FRAME).
- A resize or phone rotation: `setAspect` only changes the projection; tested that nothing else moves.
- Real clips: the headless player has no motion-capture clips, so the sit-down and stand-up animations are not in the figure.

## Tests changed
No existing test changed. New: `tests/unit/entities/camfix.test.ts`, `camfix-harness.ts`, `camfix-scenarios.ts`.
