# AMBIENT (27 Nov 2026): loading music, environment stutter, desktop app

Status: in progress. Nothing here was HEARD: everything is measured by offline renders (Chromium OfflineAudioContext) and tests.

Owner (27 Nov): "the audio stutter glitch is heard on the native versions and sometimes the web one and I believe it's the
environment audio"; "don't have the theme song playing while loading cuz the buffering stops it."

## Found by reading (before any change)
- Loading theme: `src/render/LoadingMusic.ts` makes its own AudioContext on the first gesture and runs `createLoadingTheme`
  (`src/audio/loadingTheme.ts`): a MAIN-THREAD sequencer, `setInterval` every 25 ms, 0.6 s lookahead, and a step whose time has
  already passed is DROPPED (`t >= now - 0.005`). Any main-thread stall longer than 0.6 s (world build, texture upload, shader
  compile) starves it: the beat stops, notes are skipped, and it resumes off the grid. That is the "buffering stops it".
- City hum (AudioSystem.build): 2 s pink noise, `loop = true`, no crossfade, always on, feeds three filter paths (hum, day, night).
- `noise` (AudioSystem.build): 1 s white noise, no crossfade, shared by the wash, road roll, cabin wind, wet hiss, squeal, rain
  hiss, the engine's intake roar and every noise one-shot. All persistent sources start at offset 0 (phase locked).
- Weather loops (rain 4 s, roof 4 s, wind 6 s) ARE crossfaded already (`makeLoop`).

Author: Maren Ostrow (AMBIENT seat). Tools: `scripts/ambient-render.mjs` + `scripts/ambient-harness.ts` (one source at a time through the real
classes in Chromium's OfflineAudioContext, main thread simulated at 60, 30, 15 updates a second and with 150 ms and 500 ms stalls),
`scripts/ambient-table.mjs` (before/after table). Run:
`NODE_PATH=/opt/node-tools/node_modules:/home/user/GTA-Bedstuy/node_modules SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/ambient-render.mjs --tag after --secs 60`
(`--src <dir>` bundles an older tree from `git archive`, for the before; `--cost` times the render). Every number below is that tool, 60 s per run.

## 1. The theme while loading
- What played: `LoadingMusic` (own AudioContext on the first gesture) running `createLoadingTheme`, a main-thread sequencer: `setInterval` 25 ms,
  0.6 s of notes scheduled ahead, any step already past is dropped (`t >= now - 0.005`). Nothing is pre-rendered; every note is a fresh node graph.
- Why loading stops it: the world build blocks the main thread for longer than the lookahead, so the timer does not run and the notes in that
  window are never scheduled. Measured with a fake clock (`tests/unit/audio/ambient-stall.test.ts`): biggest hole in the music with a 2 s stall:
  lookahead 0.1 s: 1.94 s; 0.6 s (what it had): 1.51 s; 1.2 s: 0.83 s; 2.5 s: 0.16 s (no stall: 0.16 s, the song's own gaps).
- Options and costs: (A) no music while loading, theme on the title screen; cost nothing, the loading screen is silent. (B) pre-render the loop
  into one AudioBuffer before the heavy work: 71 s x 44.1 kHz x 2 channels x 4 bytes = about 25 MB of memory (half as mono) and the render
  itself is real CPU work on a thread that is about to be busy; immune to stalls once rendered, but there is nothing to play until it is done.
  (C) an AudioWorklet sequencer: immune, but the whole synth (Karplus-Strong guitar, drums, bass, keys) would be rewritten as worklet code and
  the single-file build cannot afford it (60 kB of room). DONE: (A). `LoadingMusic.enabled` defaults to false; `?loadmusic=1` brings the old
  behaviour back for comparison. The lazy `loadingTheme` chunk is not fetched any more while loading (less work in the busiest seconds).
- The title theme has the same sequencer (0.4 s lookahead, same drop rule) and runs when the splash shows, which is also busy (streaming, shader
  compiles). Lookahead 0.4 -> 2.5 s (`TITLE_LOOKAHEAD`): 2 s stall hole 2.00 s -> 0.33 s (= its own no-stall gap). Test pins both.
- On the desktop app the title context is created at once (the app sets `autoplay-policy no-user-gesture-required`), so the title music
  runs through the whole start-up stall; on the web it waits for a first gesture, usually after loading. HYPOTHESIS for "worse in the app"; consistent with the code.
- Title and loading contexts now ask for `latencyHint: 'playback'` (a larger output buffer; `ambient/context.ts`).

## 2. Environment sources (60 s each, alone)
Detectors: click = a sample step over 6x the rms step of its own 100 ms block; gap = 10 ms level more than 12 dB under the local median for
20 to 300 ms; repeat = normalised autocorrelation of the signal at the loop length (1.00 = an exact repeat); one-shot timing from start times.
| source | kind | before | after |
| --- | --- | --- | --- |
| city hum, day path and night path | one 2 s pink loop, NOT crossfaded, three filters | no clicks, no gaps; repeats 2 s 0.98, 4 s 0.96, 6 s 0.94, 8 s 0.92 (an obvious 2 s loop) | 8 s loop, crossfaded: no clicks, no gaps, repeat at 8 s only (0.92); starts at a random point |
| night crickets | 4.3 kHz sine, square chop at 11 Hz, about -80 dB under the bed | inaudible; unchanged | unchanged, own mute |
| traffic wash (always on, on foot too) | shared 1 s white loop, low-pass 520 Hz | repeat at 1 s 0.99, 2 s 0.98, 6 s 0.94 | 6 s crossfaded loop; repeat only at 6 s (0.94) |
| tyre roll, cabin wind, wet hiss, squeal, rain hiss (in a car) | the same 1 s loop through five filters, all in phase | all five repeat at 1 s (0.99); 191 / 110 / 58 parameter writes a second at 60 / 30 / 15 updates | 6 s loop, each bed at its own point; same writes (the `aim` check already skips quiet ones) |
| engine intake, pops, clatter | the same shared buffer (engine file untouched) | 1 s loop | 6 s loop for free |
| weather: rain, roof, wind | 4 s, 4 s, 6 s loops, ALREADY crossfaded | no seam clicks (drops count as clicks by design); eleven parameters written EVERY frame: 660 / 330 / 165 writes a second | same loops; writes at most 20 a second and only for parameters that moved: 9 a second in a steady storm |
| footsteps | one-shot nodes per step, 17 nodes a second | on time; a 500 ms stall freezes them for 0.84 s (expected) | same |
| crosswalk WALK chirp | one-shot per tick, 125 ms period | mean gap 0.131 to 0.134 s (a 5 to 7 percent slow tick: the timer reset to the full period) | 0.124 s |
| distant sirens (night, every 20 to 60 s) | one oscillator, 2.7 s | one-shot, no loop, no per-frame writes | unchanged, own mute |
| birds, kids, far music | one-shots from timers inside `update`, a few nodes each | no loop | unchanged, own mutes |
| trains (`src/transit/TrainAudio.ts`) | 2 s sin-hash noise loop, NOT crossfaded, all voices in phase, about 8 writes per train per frame | read only, not rendered | 5 s crossfaded, voices offset; writes through `aim` (test: a still train writes nothing) |
| pedestrian chatter | clips on the audio clock, mouth movement on a main-thread timer | fixed on 22 Nov (SOUNDCHECK section 3) | unchanged; own mute |
| audio-thread cost, everything above at once (engine off) | | 39 times real time (this box) | 36 times real time: not a load problem |
Not implemented as sounds: air conditioners and distant highway (`hourBed().hum`), distant sirens by hour (`.sirens`), crickets by hour are DATA only in
`world.ts`; nothing reads them. No train bed on the grid map.

### What is proven and what is not
- PROVEN (offline, real classes): every loop above was short and repeated at 1 s or 2 s (autocorrelation 0.98 to 0.99), now 5 to 8 s; the weather bed wrote 660
  parameters a second and now 9; the signal tick was slow; the title/loading sequencers drop notes under a 2 s stall and now do not (title) or do not play (loading).
- NOT FOUND: a click at the loop seam of the old buffers. The old cut seams sit under low-pass filters (220 to 1100 Hz) that smooth the step into
  about a millisecond; no detector fired. The old repetition, a "swoosh" every 1 to 2 s, is the faint-but-audible fault, not a tick. Nothing here was HEARD.
- No gaps (drops over 12 dB for 20 to 300 ms) in any continuous bed at any update rate or stall: a stall does not touch a bed, because beds are buffers and parameter ramps.
- HYPOTHESES: that the repeating beds are what the owner hears; that the title theme starving at start-up is the "native" stutter. The debug panel is there to settle it.

## 3. Why worse in the desktop app (code, native/src/main.ts)
- Same Chromium audio stack and the same context factory (`latencyHint: 'balanced'`; the AudioSystem path does not differ). Not different: sample rate (the
  device's), buffers (all in memory), file loading (`app://` through `net.fetch` of files: not on the audio path, decoding is the same).
- Different, provable from the code: `autoplay-policy: no-user-gesture-required`, so the title context and its main-thread sequencer start the moment the splash
  shows, in the middle of the start-up stalls; the web waits for a gesture. `disable-renderer-backgrounding`, `disable-background-timer-throttling`,
  `backgroundThrottling: false` mean the sequencer timers are NOT throttled, so Electron's timers are not the cause (they help). GPU switches
  (`force_high_performance_gpu`, `enable-gpu-rasterization`) can load the machine more; hypothesis, not tested.
- The title context was created with the default `interactive` hint (smallest buffer); now `playback`.
- No change to `native/` was needed or made; `checkWeb` untouched.

## 4. What changed (files)
New: `src/audio/ambient/{noise,CityBed,mutes,AudioDebug,context}.ts`, tests `tests/unit/audio/{ambient-env,ambient-stall}.test.ts`, scripts above.
Edited: `AudioSystem.ts` (hum moved to CityBed, 6 s shared noise, debug hook, siren and bark mutes), `vehicle/VehicleAudio.ts` (own offsets, mutes, signal rate),
`weather/WeatherAudio.ts` (20 Hz, change check, mute), `transit/TrainAudio.ts`, `render/LoadingMusic.ts`, `render/TitleMusic.ts`, `tests/unit/render/loading-music.test.ts`.
Not touched: `vehicle/nodes.ts`, `engineModel.ts`, radio, `src/main.ts` (no edit is needed: the panel and mutes read the address themselves).

## 5. For the owner (if it is still there)
- `?debug=audio`: a panel (bottom left) with context state, sample rate, base and output latency, nodes made a second, live sources, parameter writes a second,
  main-thread callbacks over 100 ms late (last 10 s), how far the audio clock fell behind the wall clock, and a button per environment source to mute it.
- `?mute=hum,wash,road,weather,sirens,birds,kids,steps,signals,peds,crickets` (or `all`, `none`): same switch from the address; remembered in localStorage.
  Ask him: with `?mute=all` does it still stutter? Then unmute one at a time. The engine and the radio are not on the list (the engine pitch fix of 27 Nov is separate).
