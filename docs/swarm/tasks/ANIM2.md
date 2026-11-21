# ANIM2: feet that plant, blends that never pop (Mara Okafor)

Status: 21 Nov 2026. Landed and measured headless; strips looked at (see below). Not verified in the running game.

## What landed
- **Harness** (no browser): `tests/unit/entities/anim-measure.ts` (+ `anim-scenarios.ts`, `anim-measure.test.ts`). Plays a person through AnimController at 60 Hz
  with the entity travelling at its commanded speed and turning, then reports foot slide, sole height, the largest joint jump in one frame
  (quaternion angle, any bone) for 15 scenarios, settle, idle repeat and cost. Run: `ANIM2_OUT=<file> npx vitest run tests/unit/entities/anim-measure.test.ts --maxWorkers=1`
  (the numbers go to the file; vitest hides console output). `ANIM2_CHEAP=1` runs the far-level controller.
- **Strips**: people showcase view `anim`: `SWARM_SMALL=1 scripts/swarm-render.sh node scripts/people-showcase.mjs <out> --views "anim~action=walk~cam=side;anim~action=turn90~cam=3q" --tag a`.
  Actions: walk jog sprint idle start startRun stop stopRun stopSnap walkJogSprint sprintToWalk turn90 corner jump punch punchWalking idleChange. Cams: side, 3q, front, top.
  Tiles show evenly spaced frames; a ground line and a post every 0.5 m. Params: n, id, gait=<seed>, tw, th.
- **Skeleton**: two ankle bones appended: **12 = ankleL, 13 = ankleR** (children of the knees). Indices 0..11 unchanged. Shoes are weighted to them; a small pass
  (`followAnkles` in pedMesh.ts) moves the ankle area of the skin, the trouser cuff and the far level's own feet onto them (up to half the weight 4 to 16 cm above the
  ankle, all of it below). All three levels share the one skeleton. Not added: neck, wrists, second spine, toe (see "Not done").
- **Foot plant** (`src/entities/anim/footlock.ts`): pelvis height from the lowest SOLE point (heel, ball, toe) instead of the ankle, so a shoe stands on the ground; a foot
  lock (ball of the foot held at its ground point while down, two-bone solve, foot tilt kept, pelvis sinks a few mm when a held foot needs reach); the lock lets go gradually
  when the capture drags the foot far (start-up) and is off while sitting, jumping or turning on the spot.
- **Pops fixed** in controller.ts: (1) one-shot fade-in counted from the clip's start, so any shot starting part-way (stop, stand-up, sit-down, walk-turn) began at full weight;
  (2) turn-in-place mirrored by the instantaneous yaw sign: the pose flipped (137 degrees in the head) the frame the turn ended, and the clip wrapped with a pop; direction now latched,
  wrap cross-faded; (3) speed input is slew-limited (16 up, 22 down m/s^2) so a snap cannot snap the pose; (4) action and jump weights are eased, not exponential.
- **Alive layer** (skipped when `controller.cheap`): breathing, slow weight shift while standing (feet stay planted because of the lock), per-person phase from the gait seed,
  head and upper-body look-at (`AnimInput.look = { yaw, pitch }`, eased), per-arm carry (`setCarry(arm, free)`; Pedestrian.ts sets it for bags and totes).

## Measurements (harness, 60 Hz, fake rig with the reference proportions)
Before = the committed controller on a rig with no ankle bones (as the game was). After = new controller on the new skeleton. Speeds: walk 1.8, jog 3.0, sprint 6.5 m/s.
Slide = how far the ball of the foot travels over the ground from touchdown to lift-off, stances with the ball within 2 cm of the ground (a toe-only push-off is not counted;
the lock holds the ball, so this metric favours it: read the sole numbers and the strips with it).

| measure | before | after |
|---|---|---|
| walk slide mean / max (cm) | 0.4 / 0.4 (5 stances found) | 0.1 / 0.4 (12 found) |
| jog slide mean / max (cm) | 0.5 / 0.8 (6 found) | 0.3 / 1.2 (14 found) |
| sprint slide (cm) | no stance found | 0 |
| lowest sole at jog, min (cm) | -1.7 (digs in) | 0 |
| contact height jog mean (cm) | -1.2 | 0 |
| steady-stride max joint change per frame (walk / jog / sprint, deg) | 14.3 / 10.7 / 17.6 | 14.3 / 10.7 / 17.6 (unchanged: no new pops in steady gait) |
| start from standstill, worst frame (deg) | 56.7 | 15.0 |
| turn 90 on the spot, worst frame (deg) | 8.5 in the harness at 3 rad/s (137 deg seen with yaw going to 0 mid-fade, fixed by latch) | 15 |
| worst of all 15 scenarios (deg) | 56.7 | 43.6 (stopRun elbows; punch 42.8) |
| cost per frame, 100 people (ms, this box) | 0.85 | 2.0 (near level; far level: lock and alive layer off) |
The first run of the harness on the old controller with the old (floor-relative) slide metric read 10.7 / 5.5 / 6.4 cm at 1.4 / 2.8 / 5.2 m/s with the shoe fixed to the shin and the toes
digging 7 to 8 cm below ground; that metric was wrong for rolling feet and was replaced, so the table above is the like-for-like pair.

## Looked at
(see strips below; paths in the final report)

## Not done / known
- stopRun (sprint to stop) elbows jump 43 degrees in one frame; punch 43 (arm guard pose entering): unchanged from before, cause not found.
- No neck, wrist, spine or toe bones, so no clip rebuild; pack unchanged (core.bin 15,308 B + street.bin 37,000 B). No new CMU material, so CREDITS unchanged.
- Foot lock holds the ball only; heel strike is unlocked. Kerb steps still rely on Ground.ts easing (the figure is drawn at the eased height; the lock does not know the ground).
- Look-at is not wired to any entity (API only). Blink: FACES has not exposed setBlink. Eyes: nothing.
- Existing tests: pedmesh.test (12 -> 14 bones, assertion updated) and pedround5.test fail on triangle-count and shoe-height assertions I did not cause (other lanes' geometry).
