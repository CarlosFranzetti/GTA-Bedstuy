# AUDIOFIX (22 Nov 2026): stuck engine, silent radio, engine level, Engine sound setting

Status: code and tests done (22 Nov); browser boot check below. Nothing here was HEARD: nobody on this team can listen.

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

## What changed
Engine, parked cars (cause 1)
- `src/audio/vehicle/nodes.ts` `TrafficEngines`: a car slower than 0.5 m/s gets no voice (`TRAFFIC_MIN_SPEED`); a voice outlives its car's stop by
  3 s (`TRAFFIC_STILL_GRACE`); each voice hears a throttle smoothed over 0.35 s (the 0.5/0.1 flip at 1 m/s made a creeping car hunt: rpm swung 1088 to 2111,
  now under 700); `setEnabled(false)` creates and keeps none.
- `EngineNodes.apply`: `lim.gain` goes through `aim` (it was written every frame); `acc.gain` is re-aimed so accessories return after `retire()`.
Pause, suspend (causes 2 and 3)
- `AudioSystem.resume()` always calls `ctx.resume()` (unless closed) instead of trusting `state`; `pause()` freezes the vehicle layer, `resume()` thaws it.
- `VehicleAudio.setFrozen`: while the clock is stopped `update`, `setTraffic`, one-shots, honks (player and AI) and the bed one-shots are dropped; `AudioSystem.setEngine`
  skips its parameter writes and the untyped-engine horn/impact events are ignored while paused.
Engine level and setting
- New engine bus (`engineBus`, into `sfxBus`): the player's engine, its ghosts, the AI engines and the old untyped engine all connect to it.
  Level: `ENGINE_BUS_DEFAULT = 0.55` (src/audio/Mixer.ts) times the taper of the new `engine` slider position.
  OLD: engines connected straight to the effects bus at 1.0 (engine body trim `ENGINE_TRIM` 0.15, unchanged). NEW: x 0.55 = -5.2 dB at the default; the other buses are untouched.
  SOUND-BAR.md (21 Nov numbers, not re-measured): own engine cruise / full throttle with the radio on -24 / -19 LUFS, so about -29 / -24 now; the radio stays at about
  -14 and voices above it (SOUNDCHECK: cruise was already 9 to 10 dB under a stream). The radio and voices therefore sit about 15 dB / 10 dB above the engine in a car. Not re-measured by an offline render.
- Settings row `Engine Sound` (menu id `enginevol`, Audio group, after Sound Effects): 0 to 100 in steps of 5, shows `Off` at 0, live, saved with the mixer (`wbsy.mixer`, key `engine`).
  At 0 `VehicleAudio.setEngineEnabled(false)` disposes the player's engine, its ghosts and the AI voices and nothing is created (tested: no oscillator beyond the beds).
  Tyres, wind, horns, crashes, doors, footsteps are not engine and stay.
Radio (see "Radio causes")
- `LiveStation`: "blocked" only when the browser really refused (element paused); the error event that clearing the source raises no longer re-fails; late events ignored;
  retry once for single-URL streams (mirror stations try each mirror); connect timeout 20 s to 12 s; notices "Connecting to the stream..." and "Stream interrupted. Trying again...";
  `restart()`; no media element = fail, not a crash.
- `ScStation`: stale boots ignored (generation counter), `restart()`, a load that finishes after tune-away is paused, notice "Connecting to SoundCloud..." while loading.
- `RadioDirector.checkStart`: a SoundCloud or live station silent for 20 game seconds (not counting pauses, not counting a tap prompt) is retried once with a toast
  ("X is slow to start. Trying again."), at 40 s it is skipped like a failed one ("X is off the air. Tuning to Y.").
- `AudioSystem`: pause reasons were already a Set and balanced (ShopUi.close -> stopPost -> onListen(false) on Escape, Close, X, backdrop, dispose); covered by a test now.
## Radio causes (found in code, each with a test in tests/unit/audio/radio-start.test.ts)
1. A live stream that accepts play() but never answers was labelled "blocked" after 4 s; the watchdog skips blocked streams, so it sat behind "Tap to start radio" with no timeout.
2. After a failure the source is cleared, browsers raise an error event for that, the handler re-ran `fail()` and `onFail` fired again (and again with no other station to go to).
3. Up to four reconnects of 20 s each before a dead stream gave way: over a minute of silence.
4. A SoundCloud player that never reported ready sat 45 s in "loading" with no message and no way to start over; a boot that answered late could build a second player.
5. A SoundCloud `load` with auto_play that completes after the listener tuned away starts the old mix under the new station.
6. Not found: unbalanced pause counts, stale callbacks stopping a new station (the director already guards on the current id; tested), CORS or mixed content (all stream URLs are https, no crossOrigin).
## Streams NOT checked (this box cannot reach them; the tests use mocked elements)
wfmu rocknsoul `https://stream0.wfmu.org/rocknsoul`, wfmu freeform `https://stream0.wfmu.org/freeform-128k`, KEXP `https://kexp.streamguys1.com/kexp128.mp3`, SomaFM u80s
(`ice2` / `ice6` mp3, `ice2` aac) and 181.FM, WNYC (`fm939.wnyc.org/wnycfm`, `stream.wnyc.org/wnycfm`), the SoundCloud player API and every SoundCloud account. Whether any is dead today is unknown.

## Boot check (hosted build, `?map=grid&q=low`, canvas hidden, Space pressed; script `scratchpad/audiofix/boot.cjs`, raw `boot.json`)
Network blocked, so every real stream failed and the radio fell back as designed (toasts such as "Rinse FM is off the air. Tuning to Soulection." ending on WBSY Talk).
On foot: 0 engine voices. In a car: player 1, AI 2 to 4 (moving cars only). Exit: player 0 straight away, 0 ghosts. Re-enter: player 1.
Menu open: context suspended; closed: running; two Escapes at once: running. `audio.pause('listening-post')` then resume: suspended then running.
Eight station changes: no errors. `mixer.set('engine', 0)`: 0 player and 0 AI voices, context still running; back to 1: player 1, AI 4.
Page errors: none from the game. Console: blocked outside requests, one 502 for `/ra-api` (no proxy rewrite in `vite preview`). The script's last step (reading the menu row text) lost the page; the row is covered by tests/unit/ui/menu-audio.test.ts.
Checks: `npx vitest run tests/unit/audio tests/unit/ui --maxWorkers=1` 69 files, 916 tests green; `npx tsc --noEmit` clean for src (only the CAMFIX test files report).
## Lines for the lead (src/main.ts)
In the loop that fills `NEAR_AUDIO_CARS` (about line 847), after `if (v === player.vehicle) continue;` add:
`if (Math.abs(v.speed) < 0.5) continue; // parked and waiting cars have no engine voice; they also filled the 12 slots before a moving car was reached (AUDIOFIX)`
Without it the audio layer still ignores parked cars, but on the real map the first 12 cars within 45 m in list order can all be parked, so moving cars never reach it.
## Not verified
Nothing was heard. Not measured: the new engine loudness against the radio in an offline render (only -5.2 dB by arithmetic). Real streams and SoundCloud untested. Whether the parked-car drone is what the owner heard is an inference from the code and the measured voice counts, not a recording.
