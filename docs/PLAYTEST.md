# Blind playtest protocol

You are a **tester**. You play GTA Bed-Stuy through a harness, one step at a time, seeing only a screenshot and a small
state file. You have no code access. Your thoughts are shown as a subtitle in the recorded video, so think out loud in
one or two plain sentences per step: what you see, what you want, what surprised you.

## Starting a session (the person running the test does this)

```
npm run build                                             # once; the harness builds nothing itself
scripts/swarm-render.sh node scripts/playtest/session.mjs <sessionDir> --port 4402   # --q low  --width 960  --height 540  --max-steps 80  --idle-timeout 600
```

In the swarm, always wrap the run in `scripts/swarm-render.sh` (shared lock, one headless Chromium at a time).
If you start the harness from an agent's background shell, give that shell its maximum timeout (7,200,000 ms): a session
of 30+ steps takes well over the default 30-minute background limit, and a killed harness writes no video or transcript.
The game takes 1 to 3 minutes to load on a software renderer. When `<sessionDir>/ready-0` exists the session is live.
Scripted self-test without a model: `scripts/swarm-render.sh node scripts/playtest/brain-scripted.mjs <sessionDir>`.

## The loop

1. Look at `<sessionDir>/frames/step-<n>.jpg` (start with `step-0.jpg`) and read `<sessionDir>/state/step-<n>.json`.
2. Append ONE line (valid JSON, newline at the end) to `<sessionDir>/cmd.jsonl`:
   ```
   {"step":1,"thought":"A green SUV is ahead. I'll walk up to it.","actions":[{"look":{"dx":200,"dy":0}},{"key":"KeyW","ms":1500},{"key":"KeyF","tap":true},{"wait":800}]}
   ```
3. Wait until `<sessionDir>/ready-<n>` exists (it can take 10 s to 3 minutes: the renderer is slow). Then go to 1 with `n+1`.
   Number steps 1, 2, 3 ... in order. If you repeat a number the harness uses the next free one (see `log.jsonl`).
4. To finish, append `{"end":true,"summary":"what you did, what was fun, what was broken, bugs in plain words"}`. The harness
   then writes `playtest.webm`, `playtest.mp4` (only the action windows, tVideoActions to tVideoEnd with a 0.3 s margin, cut in one ffmpeg pass by `scripts/playtest/cut.mjs`; re-cut with `node scripts/playtest/cut.mjs <sessionDir>`; never written if the cut fails) and `transcript.md`. It also ends by itself
   after `--max-steps` steps or `--idle-timeout` seconds without a command. A bad JSON line produces `error-line<N>.json`.

## Actions (run in order, at most 24 per step; one step is at most 25 game seconds)

| action | meaning |
|---|---|
| `{"key":"KeyW","ms":1500}` | hold a key for 1500 game milliseconds |
| `{"keys":["KeyW","ShiftLeft"],"ms":2000}` | hold several keys together (run forward) |
| `{"key":"KeyF","tap":true}` | press and release once (use for F, E, R, X, H) |
| `{"look":{"dx":200,"dy":0}}` | turn the camera: `dx` > 0 turns right, about 7 pixels per degree (`dx` 630 is a quarter turn, 1260 a half turn); `dy` > 0 looks down |
| `{"key":"KeyW","ms":2000,"look":{"dx":-150,"dy":0}}` | hold and turn the camera smoothly during the hold (steer round a corner) |
| `{"wait":800}` | let the game run for 800 ms with no input |

Time is **game time**: the world is frozen while you think and only runs while actions execute. Walking is about 3 m/s,
running about 6.5 m/s.

## Keys that really work

| key | on foot | in a car |
|---|---|---|
| `KeyW` / `KeyS` (also `ArrowUp`/`ArrowDown`) | walk forward / back, relative to where the CAMERA looks | accelerate / reverse |
| `KeyA` / `KeyD` (also `ArrowLeft`/`ArrowRight`) | step left / right | steer left / right |
| `ShiftLeft` | run | handbrake |
| `Space` | nothing (no jump) | brake |
| `KeyF` | get into the nearest car whose door is within about 3 m (a short walk to the door, then you are seated) | get out |
| `KeyE` | nothing | next radio station |
| `KeyH` | nothing | horn |
| `KeyR` | retry a failed mission | same |
| `KeyX` | abandon the current mission | same |

Mouse look is the `look` action; the camera orbits the player and WASD follows it. In a car the camera slowly swings back
behind the car by itself. There is no jump, no weapon and no menu key; Escape is blocked. To start a mission walk into
its gold marker (see the minimap and the 3D beam).

## Reading the state JSON

- `gameHour` is the clock (17.5 = 17:30); `player` has `x`, `z` in metres (x east, z south), `headingCompass` (which way
  the body points) and `cameraFacing` (which way the camera looks, so which way W walks).
- `inVehicle`, `enteringCar` (walking to the door), `vehicle` (`type`, `speedKmh`), `walkSpeedKmh`, `wantedStars` (0 to 5).
- `prompt` is the on-screen hint ("F  Enter car"); `street` is the street name on screen; `mission` (`title`, `objective`, `step`,
  `timer`, `carrying`) is null when no mission runs; `missionToast`, `hudToast`, `locationCard`, `cash`, `radio` are other HUD text.
- `nearby` lists the 5 closest things within 25 m: `type` (`vehicle`, `cop`, `ped`, `obstacle`), `distance_m`, `direction`
  relative to the camera (`ahead`, `ahead-left`, `left`, `behind-right`, ...), `bearing_deg` (negative = left of the camera
  centre, positive = right; turn by `dx = bearing_deg * 7`) and for cars `vehicle` and `occupied` (a car with `occupied: true` has a driver).
- `consoleErrorsSinceLastStep` is for the bug report; `notes` (rare) says which of your actions the harness ignored or capped;
  `menuOpen` is closed for you automatically.

The screenshot has no subtitle on it. Trust the picture first and the JSON second; report any case where they disagree.

## Report

In your final summary list: what you tried, what worked, what confused you, anything that looked wrong (floating objects,
cars that do not respond, being unable to get out of a car, flicker, dark or blown-out lighting), and anything fun.
Describe bugs as: what you did, what you expected, what happened, step number.

## Known limits

The renderer is software (swiftshader): about 3 to 10 frames per second, so video looks choppy while the simulation itself is
exact (60 Hz fixed steps). A session of 80 steps takes tens of minutes. If the browser runs out of memory the session ends
early and keeps the partial video and transcript. To convert by hand:
`ffmpeg -i playtest.webm -c:v libx264 -pix_fmt yuv420p playtest.mp4`.
