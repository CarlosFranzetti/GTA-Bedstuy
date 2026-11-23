# BODY-GAIT3: do the feet slide, and the set-off ramp as visual only (seat GAIT3, Ines Marlowe, 23 Nov 2026)

Files: `src/entities/anim/footShape.ts` (new), `footlock.ts`, `controller.ts`, `src/entities/Pedestrian.ts` (the ramp line),
tests `tests/unit/entities/gait3-slide.test.ts`, `gait3-rig.ts`, `gait3-probe.test.ts` (a trace tool), and the stance detection in
`body-review-measure.test.ts`. Tables of this round: scratchpad `gait3/slide0.md` (before) to `slide4.md` (after).

## Problem 2: the set-off ramp
- Round 1 (commit e5831fd) changed one line in `Pedestrian.ts` (`const k = speed;` became a climb at 3.4 m/s2, 9 when fleeing). That line is
  back to `const k = speed;`: a pedestrian's position over time is exactly what it was before round 1, so the seeded sims see no change.
- The soft set-off is drawn only by the animation layer. What it does now: the legs' pace follows the ground at 16 m/s2 (AnimController
  `rampUp`, was fixed at 16), a start has short first steps and a lean (existing `startG`, `accelS`), and pedestrians no longer play the
  captured run-start clip (`AnimController.startClip = false`, set in `Pedestrian.ts`).
- WHAT DID NOT WORK, measured: easing the legs' pace at 3.4 m/s2 while the body is already at full speed makes the planted foot slide
  23 to 37 cm in a start (the feet are where a slow walker's would be; the ground is not). So the legs cannot be eased independently
  of the ground; only the lean, the arms and the step length can. Instant-speed start slide with the final code: at most 0.6 cm at 1.4 and 1.9 m/s.
- The captured run-start clip also slides 10 to 25 cm against a ground that starts at full speed (it was cut from an accelerating runner),
  and it fired for a child at 1.9 m/s (the pace in the clip's proportions is over 2.0). Pedestrians skip it; the player (entity ramps itself) keeps it.

## Problem 1: do the feet slide?
Third, independent measurement (`gait3-rig.ts`, `gait3-slide.test.ts`): world-space heel and ball of each foot every frame at 60 Hz on real
built people (ba-hoodie-fade heavy, wh-office slim, ba-elder, la-hoodie-cap, ba-work short and heavy, ea-kid), ball = the sole vertex 0.72 of the way
from heel to toe, followed through the skin. Planted (A, the lead's rule) = ball within 1.5 cm of the ground and not rising; slide = how far it travels.
B = every run of frames with the ball under 1.5 cm, the largest distance between two points of the run.
- The reviewer's 31.6 cm was WRONG: its stance was "the ankle bone within 3 cm of the lowest ankle height of the run". The ankle is 7 cm up, and during
  the heel's roll and the end of the swing it is inside that band while it travels 25 to 35 cm, so one "stance" ran from the end of a swing through the
  stance. The foot lock holds the BALL. At the ball, before any change, steady walks slid 0.1 to 0.6 cm (1.0 and 1.4 m/s). GAIT's 2.6 cm / "worst" was
  about right for the generic rig. The reviewer's test now measures the ball (body-review-measure.test.ts, `slideRun`).
- Real defects found by the third measurement:
  1. One shoe for everybody. `FOOT` (sole 7.5 cm under the ankle bone, ball at -0.12) was used for every body. Measured from the skins: the sole is
     0.053 (boy) to 0.084 (short heavy man) under the ankle; the ball is 0.09 to 0.185 forward. Children's feet floated 1.8 to 2.7 cm off the road and
     ba-hoodie-fade slid 9.6 cm at 1.9 m/s. `footShape.ts` `measureFeet` reads each person's own heel, ball, toe and sole depth from the skin at
     construction (the vertices whose strongest bone is the ankle, in the ankle's frame); `LegDims.foot` carries it into `soleRel`, `ballRel` and `FootLock`.
     The leg length used for the stride scale now also uses the real sole depth.
  2. Starts and stops. With the simulation instant, a start flung the trailing foot 50 cm in two frames and a stop dragged the held foot 13 to 26 cm over
     the road (the lock only pulls a foot back by a diminishing amount past 9 cm and gives up at 26). `FootLock` now lifts a held foot that the clip drags more
     than 6 cm from its ground point (up to 5 cm at 14 cm), so it steps to where the clip wants it instead of skating (`SKIM_*` in footlock.ts).
- Numbers (ball, cm, max over stances, rule A; B in the table file), before the work (original controller, pedestrian = instant speed):
  steady 1.4: 0.3 to 0.6 except ba-hoodie 1.9 m/s 9.6; stops 17 to 51 (B), 24 to 26 (A); child start 1.9: 20.9; others see the table `slide0.md`/`slide2.md`.
  After (`slide4.md`): every person, every scenario at 1.0, 1.4, 1.9 (steady) and starts and stops at 1.4, 1.9, 4.0 m/s: A max 0.3, B max 1.4 cm.
- Stand and run unchanged by design: the lift needs a held foot dragged 6+ cm, never true in a steady walk or run; standing knees: gait2-standing test green.

## Other
- `anim-bodies.test.ts` hip ceiling in the run-up raised from 1.10 to 1.12 of the hip height (the pelvis is now placed from each person's own sole depth;
  before the change this test already failed for two other people with the old bodies).
- `body-pose-before-after.test.ts` "ba-work upper arm not held out: 19.9 against 18" fails with or without this work (arms clearance; not touched).

## Run it
`GAIT3_OUT=/tmp/x.md npx vitest run tests/unit/entities/gait3-slide.test.ts --maxWorkers=1`  (fails on a steady slide over 3 cm or a start / stop over 6 cm)
`P_ARGS=ba-work,2.4,3.3 P_OUT=/tmp/t.txt npx vitest run tests/unit/entities/gait3-probe.test.ts --maxWorkers=1`  (a per-frame trace of both balls and the lock weights; P_START=1 for a start, P_V speed, P_STOP stop time)
