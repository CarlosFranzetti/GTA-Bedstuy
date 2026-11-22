# AUDIOFIX (22 Nov 2026): stuck engine, silent radio, engine level, Engine sound setting

Status: in progress. Notes kept current as the work goes.

## Owner report
"some radio station issues (sometimes it wont play) and the car engine sound gets stuck, starts to loop and stutters; engine
should be 45% lower by default and an option in settings to turn engine off."

## Found so far (reading, not yet proven)
- Player engine voice = `EngineNodes` in `src/audio/vehicle/nodes.ts`, owned by `VehicleAudio`. It is created when a type is set
  and keeps ~20 oscillators running even on foot. `main.ts` passes `type = player.vehicle?.spec.type ?? null` every frame.
- `EngineNodes.apply` writes `lim.gain.setTargetAtTime` every frame with no change check (others use `aim`).
- `retire()` zeroes `acc.gain`, nothing ever raises it again.
(to be confirmed by the harness below)

## Evidence so far (tests written first, all failing before the fix)
Harness: `tests/unit/audio/fakeWebAudio.ts` (recording fake: per-parameter timelines pruned only while the clock runs, NaN rejected,
suspend()/resume() settle later like a browser), `engine-lifecycle.test.ts`, `audio-pause.test.ts`.
1. **Parked cars idle.** `main.ts` hands `TrafficEngines` the nearest cars within 45 m from `traffic.vehicles`, which holds PARKED kerb
   cars too (speed 0, throttle 0.1). `TrafficEngines` picks by distance only and calls `startNow()` (engine running). Measured: with 12
   parked cars 4 engines idle for ever (`active` = 4), and a moving car gets no slot because the parked ones are nearer. On the real map
   (the hosted default since fdaa3e6, kerbs 65% full) you are never out of earshot of four idle drones with wobble, lope and beater
   misfires: "stuck, loops, stutters". This is the main cause of the engine complaint.
2. **suspend()/resume() race.** `AudioSystem.resume()` only calls `ctx.resume()` when `ctx.state !== 'running'`; but `suspend()` settles
   later, so Esc-Esc (or hidden/shown, or the listening post closing at once) leaves the context suspended for good. Test fails: state
   'suspended' after pause+resume.
3. **Writes at a frozen clock.** While suspended (listening post, or the race above) the game keeps calling `setTraffic`, honks and
   one-shots. The clock stands still, so every write lands at the same instant and a browser cannot prune them (the audio thread that
   prunes is not running). Measured: 3,601 events on one parameter and 834 nodes after one minute, all released in one burst on resume.
4. Smaller: `EngineNodes.apply` wrote `lim.gain` every frame without a change check; `retire()` zeroes `acc.gain` and nothing raises it
   again (starter, turbo, clatter, whine silent after a re-enter on the same car); main's traffic throttle flips 0.5/0.1 at 1 m/s so a
   car creeping in a queue hunts between two revs.
Not a cause (measured, all green): player engine voices (never more than 1, none 2.5 s after exit at 60/30/15 fps), ghosts, node growth per
frame, NaN, event pile-up while running.
