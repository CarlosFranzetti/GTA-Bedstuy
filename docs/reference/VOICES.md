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

See the "Verified end to end" section below for the numbers from the real run.

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

Filled in by the lane report; see the bottom of this file.
