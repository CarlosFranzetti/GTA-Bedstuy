# Voice samples, 27 Nov 2026 (lane VOICES, Odalys Rhee)

Samples only. Nothing in `src/` or `public/` was changed and nothing was baked into `public/voice`. Open `index.html` (works from disk) and listen: hosts down, options across.
The owner's ears decide. I cannot hear; everything below that sounds like a judgement is a signal measure.

## What you are hearing

Three talk hosts, three lines each (real lines from `src/audio/voice/shows/`, stage directions removed, so the `[laugh]` cue after line c is not in the audio: laughs are game sound effects, not speech):

| Host | Why this one | Line a | Line b | Line c (long, has questions) |
| --- | --- | --- | --- | --- |
| `buck` Buck Mercer (Mercer in the Morning) | warm, low-voiced host, the loudest voice on the dial (Kokoro `am_onyx`, speed 1.05) | opening of the show | "the system punishes entrepreneurship" | the scaffolding rant with two questions |
| `abernathy` Mr. Abernathy (community board) | dry older man, deadpan (Kokoro `bm_lewis`, 0.95) | "public comment" | "There is a mat" | "point of order" run, a question, a dry finish |
| `candace` Candace Prowse (Flip That Brownstone) | fast young woman (Kokoro `af_alloy`, 1.08) | the show opening | "lightning round" | the intro, a question, two exclamations |

Every clip is trimmed to 30 ms of edge silence, mono, 24 kHz, normalised to about -16 LUFS (BS.1770, pyloudnorm), limited, then MP3 at 48 kbit/s like the pack. Peak is held to -3 dBFS to leave room for MP3 overshoot, so the mean level lands -16.5 to -17.3 LUFS (the pack's own clips measured -16.24 mean, -2.75 dBFS peak: same ballpark). Note: the brief said "about -19 LUFS"; the manifest says -16 and my measure of 25 pack clips says -16.2. I used -16.

Options (file name ends `-<option>.mp3`):

| Option | What it is |
| --- | --- |
| `current` | The pack's voice: Kokoro-82M, same preset and speed as `cast.ts`, dry. Rendered here with kokoro-onnx and the int8 model (92,361,271 bytes; the game's q8 file is 92,361,116 bytes: the same model family, not guaranteed byte-identical). No playback pitch offset (`tune.ts`) applied, to keep options comparable. |
| `studio` | `current` through a copy of the game's own `studio` chain (`fx.ts`: high-pass 75, +3 dB at 3.2 kHz, +2 dB high shelf at 9 kHz, compressor, 6 percent room), made in ffmpeg. This is the nearest I can get to what the game plays today for these hosts. Approximate. |
| `radio` | `current` through the new "radio voice" chain (below). |
| `blend` | Kokoro presets mixed (the voice style vectors averaged): buck = onyx 55 / george 45, abernathy = fable 60 / lewis 40 at speed 0.88, candace = nicole 50 / bella 50. Same model, so the same licence and size; new timbres at no cost. |
| `piper` | Piper `en_US-libritts_r-medium`, speakers 564 (buck), 594 (abernathy), 65 (candace) chosen only by measured pitch (98, 106 and 220 Hz in a scan of 60 speakers), so they may not suit the characters. |
| `parler` | Parler-TTS mini v1, voice set by a written description ("a warm, low-pitched adult male voice...", "an elderly man with a dry, slightly gravelly voice...", "a young woman with a bright, energetic voice..."). No speaker name, no recording. Line a only: it ran 30 to 48 seconds per second of speech here. |
| `chatterbox` | Chatterbox (Resemble AI), its one built-in default voice, no reference recording; only expression and guidance settings differ per host. |

## Why the current voices sound digital (from the code)

1. **WBSY Talk and The Group Chat use only the browser's SpeechSynthesis** (`src/audio/talk/TalkPlayer.ts`, scripts `script.json`, `script-groupchat*.json`): four roles, fixed pitch and rate (`PROFILE`, pitch 0.82 to 1.18). No pack voice, no neural voice, no effect chain. This is the most likely source of "very digital".
2. **The multi-voice talk shows and the ads have no baked clips.** `public/voice/manifest.json` holds 717 clips: DJs, story, pedestrian barks only. The 34-person cast in `cast.ts` is spoken by live Kokoro only when the device renders under 1.6 times real time (it measured 4 to 9 times slower in a browser on this box; on a phone or in the single-file build it is not available), otherwise by SpeechSynthesis with a pitch and rate per host (`fallback` in `cast.ts`). The plan counts 844 talk-show clips (1,833 s of speech) and 201 ad clips (352 s) not baked.
3. **Live-stream station hosts** (`announcer/LiveHost.ts`, `stationHosts.ts`) are SpeechSynthesis too, pitch and rate only.
4. **The pack itself**: mono, 24 kHz, 48 kbit/s (DJ, story) and 32 kbit/s (barks), measured with ffprobe. Nothing above 12 kHz exists, and low bit rate adds MP3 swish. Clips are dry, then `tune.ts` resamples them for a pitch offset (up to 260 cents, tempo moves with it). Several characters share one preset and differ only by that offset.
5. **Flat delivery**: Kokoro reads smoothly; pitch movement (standard deviation of the pitch track) is about 3.0 semitones in `current` against 4.2 to 4.8 for Parler and Chatterbox in my sample. The game's `studio` chain adds a +2 dB shelf at 9 kHz, which on a 24 kHz source boosts codec hiss rather than voice.

## The "radio voice" chain (no new model, no size cost)

Built in ffmpeg for the samples; every stage has a Web Audio node. Order:

1. High-pass 90 Hz (BiquadFilter `highpass`, Q 0.7).
2. Low shelf +2 dB at 170 Hz (proximity warmth; `lowshelf`).
3. Presence +2.5 dB at 3.2 kHz, Q 1 (`peaking`).
4. De-ess: ffmpeg `deesser` (intensity 0.35). In Web Audio: split a copy through a 5.5 kHz high-pass, a DynamicsCompressor (threshold -32 dB, ratio 6, attack 2 ms, release 40 ms) and subtract the reduction, or approximate with a static high shelf -2 dB at 6.5 kHz. The dynamic version was not built; the sample uses ffmpeg's.
5. Gentle compression: threshold -24 dB, ratio 3, attack 8 ms, release 120 ms, soft knee (DynamicsCompressorNode).
6. Short room: ConvolverNode with an impulse made in code (0.28 s noise, exponential decay time constant 70 ms, low-passed at 4.5 kHz, 4 ms fade-in), wet 10 percent against 90 percent dry. The impulse costs no bytes (the game already builds one in `fx.ts`).
7. Master level and limiter as the game's mixer does.

Difference from the existing `studio` chain: no 9 kHz shelf, a low shelf for body, a de-esser, a darker and slightly longer room. Measured effect (table): 95 percent of the energy sits below 3.5 kHz in `radio` against 4.4 kHz in `studio`, and the share above 6 kHz is 2.3 percent against 3.4 percent: less hiss, more body.

## Options and routes

| Route | Licence as I read it | Ran here? | Where | Compute per second of speech (this box, shared, 4 vCPU) | Browser or pre-bake | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Kokoro-82M (+ blends) | Apache-2.0 (Hugging Face metadata of `hexgrad/Kokoro-82M`; already our rule-3 choice). kokoro-onnx wrapper: not read, a thin library. | yes | Python, onnxruntime CPU | 0.3 to 1.2 s (python, fast); the game measured 4 to 9 s in browser WASM | both: already shipped; pre-bake is faster | Baseline. Blends are free. |
| Piper (libritts_r voice) | Voice: card says "License: CC BY 4.0" (LibriTTS-R dataset); repo tag MIT. Engine `piper-tts` 1.8.0 is GPL-3.0 per `docs/reference/VOICES.md`: use it only offline to bake, never ship it. Credit LibriTTS-R in `docs/CREDITS.md` if used. Other Piper voices checked: `hfc_male`, `hfc_female` CC BY-NC-SA (no), `ryan` CC BY-NC-SA (no), `alan` "See URL" (unclear), `joe` CC0 (usable, not rendered), `northern_english_male` CC BY-SA. | yes | Python | 0.10 to 0.19 s | pre-bake; in-browser would need a WASM port of the GPL engine: not tried | Fast, many voices, but clearly TTS in tone. |
| Parler-TTS mini v1 | Apache-2.0 (Hub metadata). Trained on LibriTTS-R and MLS (card lists them); I did not read the dataset terms beyond the tags. | yes, line a only | PyTorch CPU, 2 threads, box busy | 30.7 to 48.2 s | pre-bake only (878 M parameters, about 3.5 GB in fp32) | Voice designed by description, which fits characters; far too slow to render a full pack here (a pack bank of 2,185 s would take about 25 hours). |
| Chatterbox | MIT (Hub metadata of `ResembleAI/chatterbox`). It can clone a voice from a recording; I used none. I did not verify whether its output is watermarked. | yes | PyTorch CPU, 2 to 4 threads, box busy | 11 to 71 s (load dependent) | pre-bake only | Most expressive in my pitch measure; heavy. |
| F5-TTS | Hub metadata: CC-BY-NC-4.0 (weights; trained on Emilia). Non-commercial; whether outputs may be redistributed in a game was not established. It needs a reference recording to speak, which is the cloning route. | no | | | | Left out: licence doubt plus cloning-only. |
| XTTS-v2 | Hub metadata: "other" (the Coqui Public Model License, non-commercial; Coqui has closed, so no one can license it otherwise). | no | | | | Left out: licence. |
| MeloTTS-English | Hub metadata: MIT. Not run: needs several downloads (language packages, unidic) and I stayed on routes with a clear licence and time budget. | no | | | | Untested; worth a later look, fast on CPU by its description. |
| StyleTTS 2 (LibriTTS) | The Hub repo carries no licence tag; the code is MIT per the project. The Kokoro weights come from this family. Not run (needs espeak, GPL). | no | | | | Untested; licence unclear on the weights repo. |
| KittenTTS mini | Apache-2.0 (Hub metadata). Not run: few voices, quality unknown. | no | | | | Untested. |
| ElevenLabs | Off by owner decision; I called nothing. | no | | | | Not used. |
| Hugging Face Spaces (hosted) | Callable, but a Space would receive the text of every line. I sent nothing outside; all renders are local. | no | | | | Not used. |

Nothing here needs a key or an account. Everything ran locally; the only outbound traffic was downloading model files (GitHub release for Kokoro, Hugging Face for the rest) and Python packages.

## Measured (mean over the clips of each option; decoded MP3, 24 kHz)

`rolloff95` is the frequency under which 95 percent of the energy lies (Hz); `above 6k` is the energy share over 6 kHz in percent; `pitch sd` is the standard deviation of the pitch track in semitones (more means a livelier read); `pauses` are silences of 0.15 s or more inside a clip, per clip; `words/s` is words per second of actual speech; `length x` is the option's total duration against `current` for the same lines, which scales the pack size (the same codec gives the same bytes per second).

| option | clips | LUFS | peak dBFS | rolloff95 Hz | above 6k % | pitch sd (st) | pauses | words/s | length x | compute s per s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current | 9 | -17.3 | -2.9 | 2356.9 | 1.7 | 3.0 | 1.4 | 3.5 | 1.00 | 0.31 to 1.22 |
| studio | 9 | -16.6 | -2.7 | 4382.7 | 3.4 | 3.0 | 1.4 | 3.5 | 1.00 | 0.31 to 1.22 |
| radio | 9 | -16.6 | -2.8 | 3489.7 | 2.3 | 3.1 | 1.2 | 3.5 | 1.00 | 0.31 to 1.22 |
| blend | 9 | -17.0 | -2.3 | 4291.7 | 3.9 | 3.5 | 2.8 | 3.2 | 1.19 | 0.29 to 0.62 |
| piper | 9 | -17.3 | -2.8 | 2427.1 | 1.8 | 3.5 | 0 | 4.1 | 0.83 | 0.10 to 0.19 |
| parler | 3 | -17.2 | -3.2 | 851.7 | 0.2 | 4.2 | 0 | 2.6 | 1.09 | 30.66 to 48.24 |
| chatterbox | 8 | -16.7 | -2.9 | 2595.8 | 1.3 | 4.8 | 1.2 | 3.8 | 0.94 | 11.08 to 70.89 |

Reading it plainly: `studio` and `blend` carry more top end than the dry `current`; `piper` has no inner pauses at all (pause structure comes from the game's gaps instead); `parler` is dull above 1 kHz in this sample (rolloff95 about 850 Hz) and slow; `chatterbox` has the widest pitch movement. These are signal numbers, not quality. A wider pitch range can sound lively or unstable; only listening tells.

## Pack size if a voice were baked

Format and bit rate decide size, not the model: 48 kbit/s mono is 6,000 bytes per second. Today's pack: 663 clips, 5.3 MB. Talk shows plus ads are not in it (2,185 s of speech planned): 13.1 MB at 48 kbit/s, 8.7 MB at 32 kbit/s, before the `length x` factor above (Piper 0.83, blend 1.19, Parler 1.09, Chatterbox 0.94 on these lines). Everything the plan counts (8,197 s) is 49 MB at 48 kbit/s. The single-file build has 60 kB left of its budget and never carries the pack.

## What I recommend listening to first

1. `studio` against `radio` on the same line (is the "digital" sound partly the dry, bright, hissy delivery? If yes, the fix is free).
2. `blend` against `current` (new timbres, same model, same licence, no extra download).
3. `chatterbox` and `piper` as the "different engine" options, and `parler` line a for the idea of designing a voice by description (practical only if baked elsewhere).
4. Separately: whichever you pick, WBSY Talk and The Group Chat still use the browser voice; no option here changes that until their lines are baked into banks.

## Not verified, plainly

Nothing was heard. Voice choices for Piper were made by measured pitch, not by listening. No in-game test, no browser run of any option, no phone. Parler has only line a; Chatterbox line c for Mr. Abernathy may be missing (see index). Compute figures come from a shared 4-core box under load from other work, so they vary by 2 to 5 times. Licences are from Hugging Face metadata and Piper model cards read through the Hub tools; I did not read the full text of any licence.

## Files

`<host>-<line>-<option>.mp3`, `index.html`, `metrics.json` (per clip). Scripts are in the scratch folder only (`/tmp/claude-0/.../scratchpad/voices`) and are not kept.
