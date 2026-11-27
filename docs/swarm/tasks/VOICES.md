# VOICES lane (Odalys Rhee): voice samples for the owner to pick from, 27 Nov 2026

Status: IN PROGRESS. Samples only: nothing under `src/` or `public/` is changed. Output: `docs/swarm/voice-samples/2026-11-27/`.

## Why the talk voices sound digital (read from the code, 27 Nov)

1. WBSY Talk and The Group Chat (`src/audio/talk/TalkPlayer.ts`, scripts `script.json`, `script-groupchat*.json`) speak ONLY through the browser's
   SpeechSynthesis, four roles (host, sidekick, caller, announcer) with a fixed pitch/rate each (`PROFILE`, pitch 0.82 to 1.18, rate 0.98 to 1.2).
   No pack, no neural voice, no effect. That is the "very digital" sound: the device's stock voice, pitched.
2. The multi-voice shows (`src/audio/voice/shows/*`, 34-person cast in `cast.ts`): the baked pack has NO bank for the talk shows or the ads
   (manifest: 717 clips, only DJs, story and ped barks). So talk-show lines go live-neural (Kokoro in a worker, only if the device renders at
   under 1.6x real time; it measured 4 to 9x slower on CPU) and otherwise to SpeechSynthesis with per-cast pitch/rate (`fallback` in `cast.ts`).
   A phone, the single-file build, or any slow device therefore hears the browser voice for every talk-show host.
3. Live-stream station hosts (`announcer/LiveHost.ts`, `stationHosts.ts`) use SpeechSynthesis with pitch/rate only.
4. The baked pack itself: mono 24 kHz MP3 at 48 kbit/s (DJs, story) and 32 kbit/s (barks): measured below. A 24 kHz source has nothing above 12 kHz,
   and 32 to 48 kbit/s adds MP3 swish. Clips are dry (no room), then a per-clip pitch offset resamples them (`tune.ts`, up to +-260 cents, tempo moves too).
5. Kokoro speech itself is a smooth, fairly flat read (little pitch movement, uniform pauses); the "studio" chain is high-pass, presence, compressor, short room.

## Done (27 Nov)

- Samples, index and README: `docs/swarm/voice-samples/2026-11-27/` (about 2.6 MB). Hosts: Buck Mercer, Mr. Abernathy, Candace Prowse; lines a, b, c.
- Options rendered: current (Kokoro as baked), studio (current through a copy of the game's `studio` chain), radio (new chain), blend (Kokoro blended presets),
  Piper libritts_r (CC BY 4.0 voice card), Parler-TTS mini (Apache-2.0, line a only: 30 to 48 s of compute per second), Chatterbox (MIT).
- Not run: F5-TTS (CC-BY-NC weights, cloning-only), XTTS-v2 (CPML non-commercial), MeloTTS, StyleTTS 2, KittenTTS (untested, reasons in the README).
- Biggest finding: WBSY Talk and The Group Chat speak only through SpeechSynthesis; talk shows and ads have no baked clips at all.
- Nothing in `src/` or `public/` changed; no key used; no text sent to an outside service (all renders local).
