# MECHANICS: weight, a camera that never jerks, getting in and out of cars (Dana Whitlock)

Status: 21 Nov 2026, in progress. Nothing here has been played by hand or seen in the running game.

## Harness
`tests/unit/entities/mechanics-measure.ts` (+ `.test.ts`). No browser: the real Player, Vehicle, World2D and ThirdPersonCamera at 60 Hz,
wired like main.ts. Run: `MECHANICS_OUT=<file> MECHANICS_TRACE=<file> npx vitest run tests/unit/entities/mechanics-measure.test.ts --maxWorkers=1`.
Animation state is not recorded (the clip pack does not decode headless).
Before numbers: `scratchpad/mechanics/before.txt`.

## Done so far
- On foot: speed-dependent accel and brake, turn rate limited by speed, align scale (plant, swing round, drive off), sprint ramp 0.8 s,
  sprint-at-wall pre-braking, bump brace (stumble clip, `Player.onBump`).
- Car entry: Hermite walk to the door that carries the player's own velocity; time 0.4 to 0.62 s by distance.
- Car exit while moving: carry speed, step out; above 9 m/s a roll and a get-up (no vehicle pass, no blood).
- LOOK lane's proposal for the car camera: see below once decided.
