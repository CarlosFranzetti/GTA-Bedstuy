# Voices: HD text-to-speech, cast and shows (lane VOX)

Non-commercial fan tribute. The user asked for "free repo on GitHub" voices for GTA-style hosts, talk radio, interviews and talk shows, and chose the **free in-browser route** (no ElevenLabs, no paid APIs).

## Decision: Kokoro-82M through kokoro-js

Evidence gathered 2026-11-11 from the registries and model cards (fetched in this session, not from memory).

| Candidate | Code licence | Voice / model licence | Voices (English) | Download | Verdict |
|---|---|---|---|---|---|
| **kokoro-js 1.2.1 + Kokoro-82M v1.0 ONNX** | Apache-2.0 (npm metadata; deps transformers.js Apache-2.0, phonemizer Apache-2.0) | Apache-2.0 for the weights and all voice packs (HF metadata `license: apache-2.0` on `hexgrad/Kokoro-82M` and `onnx-community/Kokoro-82M-v1.0-ONNX`). Training data: permissive/public domain/synthetic; CC BY credits listed in `docs/CREDITS.md`. | 28 in one model: 11 US female, 9 US male, 4 UK female, 4 UK male (plus other languages, unused) | q8 `model_quantized.onnx` **92.4 MB** (`content-length` 92,361,116); fp16 163 MB; fp32 326 MB; q4 305 MB; voice packs about 0.5 MB each, fetched on demand | **Chosen** |
| Piper (rhasspy/piper, now OHF-Voice/piper1-gpl) via piper-tts-web / vits-web | Engine is GPL-3.0 (`COPYING` of piper1-gpl); web wrappers are MIT | Voices are one model per voice and each carries its own dataset licence: e.g. `en_US-lessac` points to the Blizzard 2013 licence page, `en_GB-alan` says "See URL" (a Mycroft Mimic3 dataset). The repo metadata says MIT but the cards defer to the datasets, so each voice would need its own check. | Many, but 15 to 75 MB per voice | per voice | Rejected: GPL engine, per-voice licence audit, a download per voice |
| KittenTTS (KittenML) | Apache-2.0 (HF metadata) | Apache-2.0 | 8 voices | very small | Rejected for now: few voices, no mature browser runtime found |
| Supertonic (Supertone) | n/a | OpenRAIL (HF metadata) | few | n/a | Rejected: use restrictions |

Why Kokoro: permissive licence for code and voices, 28 English voices in one 92 MB file, quality that is far above SpeechSynthesis, a self-contained browser bundle on jsDelivr (`dist/kokoro.web.js`, 2.1 MB, no import map needed), model files served from Hugging Face with CORS (`access-control-allow-origin: *` on the voice files; the 302 for model files lands on the CDN, which transformers.js already handles).

Limits, stated plainly: the 28 voices are generic US and UK English. There is **no Caribbean, Latino or South Asian accented English voice** in the model (kokoro-js ships only the `a` and `b` English phonemizers). Variety comes from voice preset (11 female, 9 male US, 8 UK), speed (0.85 to 1.15), characters' writing, and the effect chain (telephone, tinny speaker, ad squash).

## Measured on this container (headless Chromium, WASM, no GPU, 4 vCPU, no cross-origin isolation so one thread)

Real run with the shipped `NeuralTts` class (module worker from a Blob, kokoro-js 1.2.1 from jsDelivr, model `onnx-community/Kokoro-82M-v1.0-ONNX`, q8 92 MB, device `wasm`), headless Chromium through the sandbox proxy:

| Step | Result |
|---|---|
| import of `kokoro.web.js` | 0.7 s |
| model download + session init + first inference (warm-up) | 41 s total in the harness, 14.5 s for the bare load in the first spike |
| `buck` (am_onyx 1.05, studio chain) | 4.47 s of audio in 29.8 s, **6.7 s of compute per second of audio** |
| `hakim` (am_adam 1.02, phone chain) | 8.20 s of audio in 36.2 s, 4.4x |
| `pearl` (af_kore 1.05, studio chain) | 5.83 s of audio in 26.0 s, 4.5x |
| spike, raw kokoro-js: af_heart 7.4x, bm_george 5.4x, am_fenrir 7.7x | |

So on this container (4 shared vCPU, one WASM thread because the page is not cross-origin isolated) HD voices are 4 to 8 times slower than real time. `NeuralTts` measures this in its warm-up and, above 1.6x, flags itself `slow`: the game then keeps using SpeechSynthesis, with one console warning. Sample WAVs: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/vox/` (`buck_morning_studio.wav`, `hakim_caller_phone.wav`, `pearl_dj_studio.wav` after the per-character effect chain; `af_heart.wav`, `bm_george.wav`, `am_fenrir.wav` raw).

Expect WebGPU on a MacBook to be several times faster than this container; that path (`device: 'webgpu'`, fp32, 326 MB) is implemented in `NeuralTts` but is **off by default and was not run here** (no GPU). The default WASM q8 path was run.

## How it plugs in

```
AudioSystem  --owns-->  VoiceHub (HD toggle, lazy engine, clip cache, SpeechPlayer)
                          |-- NeuralTts  (Web Worker from a Blob; import() kokoro-js from jsDelivr; model cached by transformers.js)
                          |-- ClipCache  (memory LRU 24 MB + IndexedDB 48 MB, 16-bit PCM, key = model:voice:speed:fnv1a(text))
                          '-- SpeechPlayer
                                neural : sentence-by-sentence renders -> AudioBuffers -> per-character fx chain -> musicBus
                                system : SpeechSynthesis, one voice slot + pitch + rate per character (the robot-ish fallback)
                                silent : timer only (captions advance), when nothing can speak
Announcer    (music-station DJs)  uses DjScheduler + hub, ducks the SoundCloud widgets via setDuck
TalkStation  (WBSY Talk)           uses TalkSchedule + hub, bed ducking via setBed
```

* Opt-in: `RadioUi` has an "HD voices" row with the download size. Default **on** only for the hosted desktop build (`VITE_HOSTED=1`, not a phone), **off** on phones and in the single-file artifact. The choice is stored in `localStorage` (`wbsy.hdVoices`). Nothing downloads before the first user gesture.
* Not in the bundle: the worker source is a string started from a Blob, kokoro-js is `import()`ed at run time.
* Failure policy: a failed import, download, timeout, render stall, or a device slower than 1.6x real time marks the engine unusable, logs **one** `console.warn`, and the rest of the segment plus every later one is spoken by SpeechSynthesis.
* Cancel: tuning away from WBSY Talk cancels playback, drops queued renders and keeps the schedule position; coming back replays the line that was interrupted. Tuning away from a music station cancels the DJ.
* Pre-render: the next talk block is decided at 60 percent of the current one and rendered in the background at low priority (`prefetch`), repeat lines come from the cache.
* Character effects (`src/audio/voice/fx.ts`): `studio` (high-pass, presence EQ, compressor, short room reverb), `phone` (320 to 3300 Hz band-pass, soft clip, compression) for callers, `tinny` for machines, `ad` (bright, squashed) for commercials.

## Cast (35 voices, 28 distinct Kokoro presets)

Music-station DJs: Deja Fontaine (BK House, `af_nicole`), Odell Reverb (Dub Lab, `bm_george`, 0.85), Big Tayo (Stoop Radio, `am_puck`, 1.12), Velvet Lou (Boogie Down, `am_michael`), Wren Calloway (Weird Hours, `af_aoede`, 0.9), Auntie Pearl (Yard FM, `af_kore`), Tommy Tapedeck (Flashback 88, `am_fenrir`, 1.14), Cass Meridian (Radio SC, `bf_emma`).
WBSY Talk: Buck Mercer, Lorraine Static, Boards, Candace Prowse, Garrett Lyle-Voss, Chair Odessa Whitlock, Mr. Abernathy, Mrs. Delacroix, Juniper Vale, Declan Frye, Hollis Crane, Mr. Winston Pruitt, Marisol Quiñones, Dana Okafor; callers Hakim, Tanya, Kiki, Gerald, Gus, Reverend Tillman, Rosa, Dev; ad voices Trent and Noelle; a smart speaker. Full table with persona, catchphrases, speed, effect and fallback pitch/rate: `src/audio/voice/cast.ts`.

## Content (all data, no code)

* `src/audio/voice/shows/djs.ts`: per station 7 categories (idents, intros, outros, blind, hours, traffic, shouts), slots `{dj} {title} {prevDj} {prevTitle} {station} {freq} {time} {weather} {street} {hood}`. Intros and outros use the real DJ name and set title from the now-playing data; `{time}` `{weather}` `{street}` come from `audio.setBroadcast`.
* `src/audio/voice/shows/*.ts`: seven WBSY Talk shows (morning call-in, "Flip That Brownstone", community board, "Breathe & Build", "Dead Air", "Block Talk", "News at the Top") and `ads.ts` with 23 parody commercials.
* Line syntax: `{ who: castId, text: 'words [pause 0.6] more [laugh] [sfx airhorn] [beat]' }`, `[over]` at the start of a line = interruption (starts 0.45 s before the previous sentence ends), optional `when: 'wanted' | 'calm' | 'mission' | 'bulletin' | 'rain' | 'night'` so the news can react to the wanted level, finished missions, STORY bulletins, rain and the hour. Directions are never spoken.
* Scheduler (`Scheduler.ts`): shuffle-bag `Rotation` (no repeats until the pool is exhausted, also never opens a refill with the last item), talk = show, then 2 and 1 commercials alternately, DJs: tune-in ident, set changes (outro of the last set + intro of the next), and every 8 minutes an idle fill rotating time/weather, traffic, neighbourhood shout-out, ident, with a commercial every fourth fill.
* Tests: `tests/unit/audio/voice-content.test.ts` (lint: speakers exist, real-brand deny-list, blocked words, line and sentence length, 2+ voices per show, 3 to 6 minutes per show, 20+ ads, one DJ per station), `voice-scheduler.test.ts` (rotation, slot filling with real artist names, news reactions, cache-key stability), `voice-engine.test.ts` (fake worker, fallback, cancel, cache, hub defaults), `voice-integration.test.ts`.

## Verified end to end versus mocked

Verified for real (headless Chromium, WASM, jsDelivr and Hugging Face reachable from the container): the library import from the CDN, model download and caching path, the worker protocol, rendering with three different cast voices, the WebAudio effect chains (`studio`, `phone`) on a real `OfflineAudioContext`, and `SpeechPlayer` playing two lines (sentences, pause, interruption) through the real engine and a real `AudioContext` to `onEnd` (the harness lifted the slow-device threshold for that step because this machine is slower than real time).

Mocked (unit tests with a fake worker, fake engine and fake AudioContext): engine fallback, timeouts and the single warning, cancel on station change, queue priority, cache, scheduling order, hub defaults, Announcer and TalkStation behaviour.

Not verified: WebGPU (no GPU here), audible quality through speakers and real-time music ducking in a running game, the `RadioUi` row in a browser, Windows, and whether a MacBook on WASM is above or below the 1.6x threshold. To try the GPU path in a browser: `localStorage['wbsy.hdGpu']='1'` and reload (downloads about 326 MB).

# VOICE14: pre-rendered voice pack, pedestrians, story voices (Mei Vance)

## The pack (hosted and native builds only)
Live Kokoro runs 4 to 9x slower than real time on CPU here (measured again under load: rtf 5 to 11), so fixed speech is rendered once, offline, with the same free Kokoro voices.

* Format: MP3, mono, 24 kHz, 48 kbit/s (talk, DJ, ads, story), 32 kbit/s (ped barks). MP3 because every target decodes it (Chrome, Firefox, Safari, Electron) and `decodeAudioData` handles it. Each clip is trimmed to 30 ms of silence at both ends, normalised to -16 LUFS (BS.1770, gated) with a soft limiter at -3 dBFS before encoding, then encoded, decoded again and measured: the manifest holds what the player gets (target: LUFS within -16 +/- 0.4, sample peak at most -1.6 dBFS; true peak can be about 1.5 dB higher at 24 kHz, the master limiter catches it).
* Files: `public/voice/manifest.json` (`{ version, engine, sampleRate, entries: { [clipKey]: { file, off, len, dur, lufs, peak, who, text } } }`) and `public/voice/banks/<bank>.mp3` (one bank per DJ, the ads, each talk show, story, each ped voice group; every entry is a standalone MP3 at `[off, off+len)`). `clipKey` is the ClipCache key (`k1:<voice>:<speed>:<fnv1a of the sentence>`), so a baked sentence is found with the key the cache would use.
* Runtime (`src/audio/voice/pack.ts`): manifest fetched after the first gesture, a bank fetched when one of its clips is first needed, decoded per clip. Order for any sentence: pack, ClipCache, live neural (only if the engine measured at or below 1.6x), SpeechSynthesis, silent with subtitles. A talk or DJ segment plays from the pack only if every sentence of it is covered; otherwise the whole segment is spoken by one system voice (no voice switch mid-line). A 404 on the manifest is the normal artifact state: one quiet console message, no retries.
* Never in the single-file artifact: `VoiceHub` gets `packBase` only when the build is hosted (`VITE_HOSTED=1`, which the native builds also use). `public/voice/` is copied to `dist/voice` by Vite but `make-artifact.mjs` only reads `dist/index.html`, so the artifact does not grow (measured, see the report).
* Slots: sentences with open slots (`{dj}`, `{title}`, `{time}`, `{street}`) are not baked; sentences with finite ones are (station name and frequency for idents; `{hood}` x12, `{weather}` x7, `{stars}` x5 only for sentences with at most 16 variants). The DJ shout-outs per neighbourhood are the last tier. Idents depend on the dial: when RADIO15 renames stations, re-run the bake (only the new idents render).

### Producing it
```
npm --prefix scripts/voice install                      # once: kokoro-js 1.2.1 + onnxruntime-node (separate package, the game lockfile is untouched)
node scripts/voice/bake-pack.mjs --plan                 # clips and speech minutes per tier
nohup node scripts/voice/bake-pack.mjs --shard 0/2 --tiers 0,1,2,3,4,5,6 > cache/voice-bake/bake-0.log 2>&1 &
nohup node scripts/voice/bake-pack.mjs --shard 1/2 --tiers 0,1,2,3,4,5,6 > cache/voice-bake/bake-1.log 2>&1 &
node scripts/voice/bake-pack.mjs --status               # progress, rtf, eta, pack MB, coverage per tier (re-assembles public/voice)
node scripts/voice/bake-pack.mjs --assemble             # rebuild public/voice from the finished clips
```
Kokoro runs under Node (onnxruntime-node); the model downloads through the sandbox proxy (the script re-launches itself with `NODE_USE_ENV_PROXY=1` and the CA bundle). Needs `ffmpeg` with libmp3lame. Work files live in `cache/voice-bake/` (git-ignored): one mp3 per clip plus `index-<shard>.jsonl`, so a killed or finished run resumes by key; the pack is re-assembled every 25 clips (single shard) so a partial pack is always valid. Priority order: 0 station idents, 1 other DJ sentences, 2 ads, 3 talk shows, 4 story/mission lines, 5 ped barks, 6 neighbourhood shout-out expansions. `--budget-mb 25` drops the lowest-priority clips that do not fit. Whether to commit `public/voice/`: Vercel builds from the repo, so the hosted site needs the files committed (or restored in CI from a build cache); that is Fable's call, the pack is under 25 MB.

### ElevenLabs: a switch, off
`VoicePackSource` has two ids: `kokoro-baked` (default, the only one ever constructed) and `elevenlabs-baked`, a stub that reads the same manifest but only accepts one whose `engine` starts with `elevenlabs:`; the Kokoro source refuses such a manifest. `engine` in the manifest picks the debug label (`Kokoro-82M (baked)` / `ElevenLabs <model> (baked)`; `audio.voicePackLabel`). No generator exists and no paid API is called. A future generator would read `scripts/voice/elevenlabs-voices.example.json` (cast id -> voice_id, all null now; copy to `elevenlabs-voices.json`). Cost, counted by `node scripts/voice/bake-pack.mjs --count-chars` (no network): talk + DJ + ads 30,206 characters (tiers 0 to 3), plus story 2,860 and ped barks 44,452 (voice groups x lines), 92,166 with the neighbourhood expansions. Barks for 12 groups are what makes it expensive; per cast voice it would be about 31k.

## Pedestrian and story voices
* `src/audio/voice/peds/`: `groups.ts` (12 voice groups = Kokoro preset + base speed, each tagged with gender, ages and personas), `assign.ts` (voice from the ped seed: group, rate x0.92 to 1.08, pitch within +/- 200 cents; the registry gives nobody within 30 m the same preset and speed; SpeechSynthesis gets the same seed's role, pitch, rate), `barks.ts` (13 categories x 40+ lines plus 50 chat pairs, 3 to 9 words), `lines.ts` (which line is baked for which group: 2 groups per line, 3 for chat halves), `BarkDirector.ts` (rules and priority), `PedVoicePlayer.ts` (WebAudio: pack, then cache, then SpeechSynthesis, then silent; street fx, inverse-distance gain from 2 m, distance low-pass; AnalyserNode visemes at 30 Hz or syllable timing).
* Rules: priority mission (4) > story (3) > reaction (2) > ambient (1); at most 2 ped voices at once; 1 bark per ped per 20 s; 1 per 4 s inside 25 m; the same line never twice in 5 minutes; nothing beyond 25 m; ambient chatter waits while mission/story speech or in-car talk radio speaks; a line whose audio is not there in 400 ms becomes a subtitle only. Live renders happen only in idle time for lines predicted within 30 s (`BarkDirector.predict`).
* Events (no imports across teams): in `pedBark` (PedSocial's shape `{ id, text, kind, pos {x,z}, sex, age, loud }` or `{ pedId, kind, pos {x,y}, seed, age, gender, with, toPlayer, dist }`), out `speech:start { speakerId, durSec, lineId }`, `speech:viseme { speakerId, t, open }`, `speech:end { speakerId }`, `speech:subtitle { who, text, durSec, pos?, kind: 'ped' | 'story' | 'mission' }` (UI14: mission lines already show through `mission:subtitle`; draw `kind` 'mission' only if you do not). `AudioSystem.speakAt(who, text, opts)` and `AudioSystem.onSpeech(fn)`. Subtitle setting read from `localStorage['wbsy.subtitles']` = `all | story | off` (default all).
* `StoryVoices.ts`: every speaker tag of `src/game/story/cast.ts` and its extras has a hand-picked preset, speed and fx (`You` and `Crowd` never speak). Story presets avoid the ped presets; Hobbs shares one with a ped group, so peds are kept off it while he speaks. `AudioSystem` speaks each `mission:subtitle` line with it.
