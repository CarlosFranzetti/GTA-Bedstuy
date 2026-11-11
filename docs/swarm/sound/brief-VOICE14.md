# Brief: VOICE14, pedestrian and character voices (SOUND team, director Nia)

Model: sonnet. Reports to Nia (SOUNDDIR). Read first: docs/swarm/ORG.md, docs/swarm/sound/SOUND-BAR.md (sections 2, 4, 5, 6),
docs/reference/VOICES.md. Owner's words: "various human sounding voices"; pedestrians should "interact" and have voices.
Rules: never git stash, never commit, keep src/ compiling, do not edit src/main.ts (post the wiring lines for Fable).

## Goal
Pedestrians, story characters and mission givers speak with their own voice: barks, greetings, reactions, and mission
dialogue, through the existing voice path (VoiceHub -> SpeechPlayer -> per-character fx), with subtitles, ready in time.

## Files you own
- New: src/audio/voice/peds/ (bark tables, voice assignment, BarkDirector), src/audio/voice/StoryVoices.ts (story cast ->
  voice map), scripts/voice/bake-pack.mjs (offline pre-render), tests/unit/audio/voice-peds.test.ts.
- Small edits allowed: src/audio/voice/{VoiceHub,SpeechPlayer,cast,types}.ts, src/audio/AudioSystem.ts (one public method
  `speakAt` and one `onSpeech` hook). Anything else: ask Nia first.
- Not yours: src/game/** social scheduler (Leila, CHAR14), src/ui/** (subtitle drawing belongs to the HUD owner; you emit).

## What to build
1. Voice assignment. A ped gets a stable voice from its seed: Kokoro preset (from the 28, weighted by the ped's
   age/gender fields if present) + speed 0.88 to 1.12 + a pitch shift of at most +/- 2 semitones + a light fx (`street`:
   distance low-pass and a little room). No two peds within 30 m share preset and speed. SpeechSynthesis fallback uses the
   same seed for role slot, pitch and rate. Story characters (src/game/story/cast.ts) get fixed hand-picked presets in
   StoryVoices.ts, never reused by peds within earshot.
2. Bark tables (data only, like shows/*.ts): greetings, small talk pairs (two peds answer each other: A line, B reply),
   reactions (car too close, horn at them, near miss, knocked down, gunshot/wanted nearby, rain, player running, player
   dancing near the radio), complaints at the player, sellers and stoop talk. 40 or more lines per category, short (3 to 9
   words), no names of real people or brands, humour rules from SOUND-BAR section 5. Weight toward the neighbourhood:
   stoop aunties, deli regulars, delivery riders, kids, church ladies on the way home, bike messengers, developers on phones
   (punch up).
3. Pre-render queue (the core). Live Kokoro is 4 to 7x slower than real time on CPU, so speech must be ready before it is
   needed. (a) Offline: bake-pack.mjs renders every fixed bark per voice-group and every story/mission line with the
   assigned voice into the voice pack (SOUND-BAR section 4 format and manifest, MP3 48 kbit/s mono, -16 LUFS). Barks are
   baked for a pool of 12 ped voice-groups, not per ped (size budget). (b) Runtime: a priority queue (mission dialogue >
   story barks > reactions > ambient chatter) that looks up pack -> ClipCache -> live engine; live renders only during
   idle time and only for lines predicted in the next 30 s (mission objective text, the next scripted beat). A line not
   ready in 400 ms of being due plays through SpeechSynthesis or as subtitle only; it is never late by more than 400 ms.
4. Rate limits. At most 2 ped voices at once, at most 1 bark per ped per 20 s, at most 1 bark per 4 s in a 25 m radius, no
   ambient chatter while mission dialogue or talk-radio speech is playing in the car (radio speech wins inside the car, peds
   wait), the same line never twice within 5 minutes for the player. Spatial: inverse distance to 25 m, cut beyond.
5. Lip-flap and gesture hook for CHAR14 (Leila). Emit on the event bus, feature-detected, nothing imported across teams:
   `speech:start { speakerId, durSec, lineId }`, `speech:viseme { speakerId, t, open 0..1 }` at 30 Hz from an AnalyserNode
   envelope on that voice (or from text syllable timing when the line is SpeechSynthesis), `speech:end { speakerId }`. Leila
   maps `open` to jaw and the start/end to a talk gesture. Accept her `pedBark { pedId, kind, pitch, rate }` event as the
   request to speak (her post at 11:08: she emits pedBark; you consume it).
6. Subtitles. Every spoken line emits `mission:subtitle`-shaped data on a new `speech:subtitle { who, text, durSec, pos? }`;
   ped barks only when within 12 m or addressed at the player; mission and story lines always. Directions in [brackets] are
   never shown. A settings flag `subtitles: all | story | off` is read, not built (UI14 builds the toggle).
7. Optional ElevenLabs path, as a switch only (do not build the generator or spend credits): `VoicePackSource` interface
   with one implementation (`kokoro-baked`) and a stub `elevenlabs-baked` that reads the same manifest; `engine` in the
   manifest picks the label in the debug panel. Document in VOICES.md the cast -> voice_id map file the generator would read
   and the character count it would cost (count it with a script). Default and only active source: Kokoro.

## Done when (report these numbers to @Nia)
- tsc clean for your files, unit tests green: assignment is stable per seed, no two nearby peds share a voice, rate limits
  hold over a 10-minute simulated walk (count barks per minute, max concurrency), priority order respected.
- Voice pack: number of clips, total MB (budget: whole pack at most 25 MB with the talk content), per-clip LUFS spread within
  -16 +/- 1, peak at most -1.5 dBFS.
- Real Chromium probe: time to first audio for a mission line (pack hit, cache hit, live), the viseme event rate, subtitle
  sync error under 150 ms, and the fallback to SpeechSynthesis when the pack is missing (artifact build).
- Artifact still at most 12 MB (the pack is hosted/native only).
- FOR FABLE lines with the exact main.ts wiring (event subscriptions, AudioSystem calls).
