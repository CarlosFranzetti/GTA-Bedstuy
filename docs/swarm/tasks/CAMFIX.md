# CAMFIX: the camera screws up getting in and out of a car or changing views (22 Nov 2026)

Status: started. Lane CAMFIX. Owner report, 22 Nov (his words): "sometimes the camera screws up getting in and out of car or changing views."

## Plan
1. Deterministic harness (tests/unit/entities/camfix-harness.ts, camfix.test.ts): real ThirdPersonCamera, Player, Vehicle, World2D,
   the game's own FixedStepper and PoseSnapshots, at 30/60/144 fps and a 250 ms hitch at each phase.
2. Reproduce, prove each cause with a failing test, then fix in src/core/Camera.ts / CameraViews.ts (main.ts lines go to the lead).

## Findings so far (reading the code, before measuring)
- Every view change in Camera.update is a smoothed blend (k = 1 - exp(-10 dt)), including to and from hood / first person; the
  camera flies through the car body on the way to the hood. The "cut" flag (`views.cutThisFrame`) is set by `change()` in the fixed
  step and then cleared by `views.tick()` at the start of the next camera update, so the cinematic cut never reaches `snap`.
- The cinematic shot yaw is added to the view yaw at once while distance/height/fov are blended: a half-blended frame.
- Stepping out turns the player to face the car, and with `idle` at its 99 default the yaw spring then swings the camera round.
(to be confirmed by tests)
