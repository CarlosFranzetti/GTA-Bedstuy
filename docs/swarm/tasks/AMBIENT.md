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
