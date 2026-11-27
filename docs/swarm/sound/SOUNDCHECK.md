# SOUNDCHECK: engine levels, the street mix, stutter, speech rhythm

Status: historical record (not maintained)

Lane SOUNDCHECK (Echo), 18 Nov. Nothing here was heard: this machine has no audio output and I cannot listen. Every number
comes from offline renders of the real code (Web Audio `OfflineAudioContext` in headless Chromium) measured with ffmpeg
`ebur128` (BS.1770, K-weighted) or with sample-level analysis. Each "what to listen for" line says what a person should check.

Scratch output: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/soundcheck/` (demos in `demos/` and `speech/`).

## Tools (new or fixed)

| file | what it does |
| --- | --- |
| `scripts/sfx2-render.mjs`, `scripts/sfx2-harness.ts` | `steady` (engine-only table), `drive <types>` (scripted two-minute drive), `demos`. `steady` never returned before: it awaited `suspend()` promises before `startRendering()`. Fixed, and `--types a,b` and several types per `drive` call added. `--root <dir>` measures older code. |
| `scripts/soundcheck-render.mjs`, `soundcheck-harness.ts` | `street`: 60 s street scene through the real `AudioSystem` (real buses, limiter, vehicle layer, traffic voices, city bed, footsteps), 7 tapped stems out of one render. `--src <dir>` bundles an older checkout, `--stall` simulates a frame hitch. |
| `scripts/soundcheck-stutter.ts` (mode `stutter`) | offline reproductions of the suspected stutter causes with sample-step metrics. |
| `scripts/soundcheck-lufs.py`, `soundcheck-drive-lufs.py` | ffmpeg `ebur128` over windows of the street stems and of the drive WAVs. |
| `scripts/voice/audit-text.mjs`, `measure-baked.py`, `soundcheck-speech.mjs`, `soundcheck-entry.ts` | text audit of the voice plan, speaking rate and silences of the baked clips, and the before/after conversation renderer. |
| `scripts/voice/bake-pack.mjs` | new `--match 'regex'` (sample bake of chosen lines; refuses to run against `public/voice`). |

## 1. Engines

Loudness is LUFS (K-weighted, ungated mean over the window) of the vehicle layer only (engine, tyres, wind) before the sound-effects bus,
mono. Windows of the scripted drive: idle 6 to 9 s, full throttle 12 to 16 s (first pull-away), cruise 20 to 26 s. "orig" is the code
before the SFX2 lane (commit 2172db4), "SFX2" the code I started from (trim 0.16, HEAD at the time), "final" is what is in the tree now.
S = loudest 3 s short-term value inside the window; peak = true peak of the window (dBFS).

Integrated LUFS, short-term max in brackets, peak at the end:

| type | idle orig / SFX2 / final | cruise orig / SFX2 / final | full throttle orig / SFX2 / final |
| --- | --- | --- | --- |
| sedan | -26.0 / -35.1 / **-40.3** | -15.9 / -24.8 / **-28.9** (S -28.6, pk -19.4) | -13.9 / -22.3 / **-24.2** (S -24.1, pk -14.8) |
| bus | -28.4 / -36.5 / **-38.3** | -24.6 / -32.6 / **-33.6** (S -33.2, pk -18.8) | -20.5 / -28.2 / **-27.3** (S -27.1, pk -12.8) |
| box truck | -27.6 / -31.6 / **-36.3** | -21.8 / -25.2 / **-28.6** (S -28.4, pk -18.0) | -18.2 / -20.9 / **-22.4** (S -22.3, pk -12.0) |
| sports coupe (911) | -25.4 / -34.4 / **-38.3** | -19.2 / -28.0 / **-30.0** (S -29.9, pk -18.4) | -17.1 / -25.1 / **-25.2** (S -25.1, pk -13.8) |
| taxi (hybrid) | engine off at idle by design | -17.1 / -26.0 / **-30.1** (S -29.8, pk -19.6) | -14.7 / -23.0 / **-25.0** (S -24.8, pk -14.8) |

Idle and full-throttle peaks (final): sedan -26.5 / -14.8, bus -22.8 / -12.8, box truck -22.1 / -12.0, coupe -23.8 / -13.8, taxi -42.0 / -14.8. Whole-drive peak
(horn and tyres included) stays at or under -1.3 dBFS for every type.

Engine only (the `steady` table, held speed, EngineNodes alone), cruise / full throttle:

| type | orig | SFX2 | final |
| --- | --- | --- | --- |
| sedan | -18.0 / -14.5 | -27.2 / -22.9 | **-32.2 / -24.8** |
| bus | -25.8 / -22.1 | -34.1 / -29.4 | **-35.7 / -28.8** |
| box truck | -24.5 / -19.4 | -27.9 / -22.1 | **-32.4 / -23.5** |
| coupe 911 | -19.7 / -17.1 | -29.0 / -25.2 | **-32.3 / -25.4** |
| taxi | -18.4 / -14.8 | -27.7 / -23.1 | **-32.7 / -25.2** |

All 23 combustion types now sit between -23.2 and -28.8 LUFS at full throttle (`steady`, all 25 types; before, beater, pickup, dollar van and pony
were 5 to 9 dB louder than the sedan, the bus and hatch 5 to 6 dB quieter). The two electric cars are the quiet end (-30.2, -32.5) on purpose.

### Gear-change dips (target: none over 6 dB)

Two measures. (a) The dips the old lane reported: any 25 ms-hop drop of more than 6 dB under the previous 0.5 s inside the drive, counted while
driving (9 to 111 s), count / worst dB:

| type | orig | SFX2 | final |
| --- | --- | --- | --- |
| sedan | 46 / 10.4 | 39 / 10.1 | **4 / 6.9** |
| bus | 3 / 7.1 | 1 / 6.9 | **0** |
| box truck | 22 / 10.5 | 7 / 9.3 | **1 / 6.3** |
| coupe | 4 / 7.3 | 0 | **0** |
| taxi | 6 / 24.8 | 4 / 22.8 | 2 / 22.0 (hybrid engine switching off at a stop, by design) |

(b) The dip at the shift itself (50 ms level just before vs the lowest in the next 0.3 s, full-throttle pull-away): before sedan 4.6, bus 6.3, box truck 2.7,
coupe 5.5, taxi 5.5 dB; **after sedan 2.0, bus 5.0, box truck 1.7, coupe 4.0, taxi 3.9 dB**.

The big finding behind (a): the SFX2 lane's "gear-change dropout" was mostly something else. The two detuned sawtooth oscillators of the
player's engine (gains 0.55 and 0.40, detune 7 to 26 cents) beat against each other at detune x pitch, a slow level swell of 7 to 10 dB about every
1.3 s in every gear, at a held cruise too. That is the periodic "flutter" of the old engines. Offline at a held cruise (sedan, 20 s): level
standard deviation 2.24 dB and a 5.4 dB worst dip with chorus gain 0.4, 1.1 dB and 2.9 dB with 0.15, 0.05 dB with no detune. I set the chorus
gain to 0.20 (`ENGINE_TUNING.chorus`, about 1.4 dB spread). The remaining 4 sedan dips (6.1 to 6.9 dB at 9.8, 17.5, 64.5, 74.5 s) are
throttle changes, not shifts.

### Trims (what changed in `engineModel.ts`)

* `ENGINE_TRIM` 0.16 to **0.15**; load curve: `out ~ TRIM x g x (0.3 + 0.7 x (0.8 L + 0.2 rn)^1.4)` (before `0.45 + 0.55 x (...)`): cruise drops, full throttle stays, idle stays a presence.
  Idle -40 LUFS, cruise -29, full throttle -24 for the sedan (street scene: cruise -30.3, full throttle -24.2).
* `v.g` per type (equalises full throttle across types): beater 1 to 0.45, pickup 1 to 0.5, dollar van 1 to 0.5, pony 0.9 to 0.5, cop 1 to 0.7, muscle 0.9 to 0.7,
  jdm coupe 1.15 to 0.85, hot hatch 1.2 to 1.0, ambulance 1 to 0.85, town car 1.1 to 0.95; up for the quiet ones: bus 1 to 1.4, cargo van 1 to 1.3, hatch 0.95 to 1.35,
  exotic 1.35 to 1.6, coupe 911 1.2 to 1.45, SUV 1 to 1.15. LUFS under-reads low-frequency rumble, so I raised the bus less than the meter asks.
* `SHIFT_LOAD` 0.8 to 0.9 and `SHIFT_LIM` 0.9 to 0.95 (shallower shift dip). Traffic voices follow `v.g` too, so the loud old traffic cars are quieter.

## 2. The engine in the street mix

Scene (60 s, through the real `AudioSystem`, defaults: all five sliders at 100 %): 0 to 6 s on foot (walk, then run), car entered at 6 s, idle to 9 s,
full-throttle pull-away to 14 s, cruise at 13 m/s, a full-throttle burst 34 to 38 s, braking, out of the car at 48 s, walking again to 60 s.
Three traffic cars pass (oncoming sedan at 18 s, an overtaken bus at 28 s, an oncoming 911 at 42 s), city bed (Bed-Stuy, noon), a radio host line at 15 s,
a pedestrian bark in the car (8 m) at 25 s and one on foot (3 m) at 52 s. Voices are real baked clips of the voice pack (a DJ line and two barks, -16 LUFS).
Radio: the default radio is the SoundCloud widget, which has its own output and is not in the Web Audio graph at all, so I could not render it. Stand-in: a
synthesised kick, snare, hat, bass and chord loop at **-14 LUFS** (a typical stream) through the music bus (gain 0.7).

LUFS per window (ffmpeg `ebur128`, stems are the buses before the master; master is after the limiter):

| window | master | radio | voices | sfx (all) | **player engine** | traffic engines | ambience |
| --- | --- | --- | --- | --- | --- | --- | --- |
| idle (6.5 to 9 s) | -16.5 | -18.2 | - | -40.5 | **-40.5** | - | -45.2 |
| cruise (20 to 26 s) | -14.5 | -16.3 | - | -30.3 | **-30.3** | -51.2 | -45.5 |
| host line only (15.05 to 18.4 s) | -14.0 | -17.2 | **-19.5** | -29.1 | **-29.2** | -42.4 | -45.7 |
| full throttle (34.5 to 38 s) | -14.2 | -16.6 | - | -24.1 | **-24.2** | -66.3 | -45.7 |
| bark in the car, 8 m | -14.1 | -15.8 | -32.2 | -30.4 | -30.6 | -42.9 | -45.5 |
| bark on foot, 3 m | -21.8 | off | -23.6 | -50.3 | off | off | -43.5 |
| car pass A / B / C | -15.0 / -15.7 / -15.9 | -17.8 / -17.5 / -17.8 | | | -29.0 / -30.4 / -29.1 | **-43.1 / -36.9 / -38.8** | -45.7 |
| walking, before / after the drive | -40.7 / -39.1 | off | | -45.9 / -43.6 | off | off | -44.4 / -43.8 |

Before (same scene, code of the SFX2 lane, trim 0.16): cruise engine -25.7 (radio -16.3: 9.4 dB under), engine under the host line **5.7 dB only** (-25.2 vs -19.5),
full throttle -22.2. Before the SFX2 lane (orig engines) the cruise engine was about -16 LUFS: level with the stream, which is the owner's complaint.

**After:** cruise engine is **14.0 dB under the radio** and **9.7 dB under a radio host's speech**; full throttle is 7.6 dB under the radio and 4.7 dB under
the host, 6.1 dB above cruise; traffic engines are 21 dB under the player's engine at cruise and 6.5 to 14 dB under it at a pass (-51 LUFS at cruise, -37 to -43 at a pass: a wash, the
closest pass, the overtaken bus at about 5 m, is the loudest).
The "8 dB under speech" target holds for a radio host (9.7 dB) and for a bark at 3 m (-23.6 LUFS, the engine is 6.7 dB under it, 1.3 dB short of 8); it does not hold for a bark at 8 m
inside the car (-32.2 LUFS, 1.6 dB under the engine): that is the ped player's own distance gain (0.63 x 2/d), and making the engine 8 dB under it would put the engine at -40. I did not change it. Peaks: master -0.3 dBFS (the stand-in track has full-scale peaks), engine stem -15.6.

Observation, not changed: on foot the whole mix is about -40 LUFS (footsteps -44 to -46, city bed -44) while in a car with the radio it is -14.5. The radio is the loudest
thing in the game by 20+ dB and the world beds are very quiet next to it.

## 3. Stutter hunt

Metric: largest sample-to-sample step (`maxStep`) at the event against the largest natural step of the same sound.

| # | suspect | reproduced offline? | evidence | fix |
| --- | --- | --- | --- | --- |
| 1 | the engine's chorus pair beating (slow level swell, "audio flicker") | yes, the main one | held cruise, sedan: swell sd 2.24 dB, worst dip 5.4 dB; in the 2-minute drive 39 dips over 6 dB (max 10.1) in SFX2 code | chorus gain 0.4 to 0.2: sd 1.4 dB, drive 4 dips (max 6.9); test `chorus swell < 7 dB` |
| 2 | siren released while the whoop gate is closed: `release()` wrote the open level at once | yes | worst of 6 release times: step 0.142 (a 2.6x full-level click out of silence); natural square-wave step 0.055 | `sirenGateOpen()`: release keeps a closed gate closed; step 0.057 after; test fails on old code |
| 3 | speech cancelled mid-phrase: `src.stop(); disconnect()` cuts at a non-zero sample (SpeechPlayer.cancel, PedVoicePlayer cleanup on every walk-away, retune, interruption) | yes (the same call pattern rendered) | hard stop step 0.0565 = 3.3x a normal step; with the 25 ms fade 0.0152 (0.9x) | `voice/fade.ts`: every clip goes through a gate gain, cancel ramps it to 0 in 25 ms, stop 5 ms after; test `speech cancel does not click` |
| 4 | per-frame parameter flood (about 31 `setTargetAtTime` per frame) | counted, not audible offline | vehicle layer: **1869 events/s** at 60 fps (player + road + 4 traffic voices), 525 after | `aim()` skips a write that would not move the target (exact for equal targets; under 2.6 cents / 0.09 dB otherwise); the retired engine of a car the player left no longer writes and cancels 30 parameters every frame. Event writes take the timeline lock the audio thread also wants; I cannot show a dropout from it offline |
| 5 | ped speech timeline: `buf.duration / playbackRate` ignores the detune that the peds' cents are carried in, so a clip really plays at `rate x 2^(detune/1200)` | by arithmetic and a test | with +200 cents the clip is 11 % shorter than scheduled (a dead gap), with -200 cents 12 % longer (the next phrase starts over the end) | `real = playbackRate x 2^(detune/1200)` for the timeline; gaps are plain seconds; test |
| 6 | master limiter (-3 dB, knee 0, ratio 20, attack 3 ms, release 120 ms) | measured, fine | burst at full scale: peak -0.7 dBFS; a quiet bed under it recovers to within 0.5 dB in 100 ms (no pumping); the Web Audio compressor's automatic makeup adds **+1.7 dB** to everything; street master peak -0.3 dBFS | none |
| 7 | traffic voice stolen by a closer car | no | step ratio 1.6 (natural), nothing above the level change | none |
| 8 | player swaps cars (old engine plays out its shutdown, then is disposed) | no | step 1.9x natural, no click | none |
| 9 | voices starting at non-zero crossings, scheduling in the past | no | one-shots start from gain 0.0001 with a 2 to 6 ms ramp, engine nodes from gain 0, clips get a 6 ms fade; all start at `currentTime` or later | none |
| 10 | radio sequencer lookahead 0.1 s | not applicable | the synth sequencer plays only on synth stations; the default dial is SoundCloud (own output) and the test "never sequences synthesized music on a SoundCloud station" pins that | none |
| 11 | AudioContext latency | not measurable here | default `interactive` buffer on a main thread that is busy rendering | `latencyHint: 'balanced'` in the default context factory, unverified |

Gear changes: `SHIFT_LOAD`, `SHIFT_LIM` as above.

## 4. Speech rhythm

What exists (before me): a prosody layer (`prosody.ts`, `rhythm.ts`): phrases split at commas, dashes, ellipses and long runs, a pause per break kind scaled by a speaker's
profile, seeded jitter, turn gaps and quick pickups, `[breath] [punch] [em] [over]`, and ped voices with per-ped pitch/rate steps. The audio is baked per phrase
with Kokoro-82M (`public/voice`, 663 clips, 5.3 MB; 4130 planned, 717 unique baked); the silences are laid by the player, so they can change without a bake.

Measured on the baked clips (`scripts/voice/measure-baked.py`, 36 speakers): articulation rate (words per second of actual speech) from **1.51 (Odell) to 4.01 (Tayo, Tommy)**, median 2.79, sd 0.61.
Inside a clip, most speakers have no silence of 0.08 s or more (the clips are phrases); the exceptions are Deja 1.23 per clip (0.30 s long) and Odell 1.17 (0.22 s). So the
pauses people hear are the planned gaps. Across 534 show, ad and DJ lines: 2.85 phrases per line, mean planned gap 0.26 s, sd 0.21, per-speaker mean 0.13 to 0.43 s.

Problems found:

* The scripts contain **no em dashes and no ellipses at all**; the prosody layer's dash and ellipsis breaks never fired. 73 phrases of 10 or more words had no comma (12 words in one breath).
* **"Mrs. Delacroix, you have ninety seconds."** was split at the full stop of the title into an orphan clip "Mrs." (spoken as a sentence end, falling) and the rest. 7 such orphans in the plan
  ("Mr.", "Mrs."), and two baked story clips "Clean, Mr." / "Hobbs." (Doña Marisol).
* After a question the old turn gap was *shorter*; a line cut off with a dash got no overlap; the street chat reply was a fixed 0.4 s.
* Several cast members share one neural preset (am_eric: Lucho, Garrett, Dev; bm_lewis: Abernathy, Gerald, Trent; am_michael: Lou, Gus; af_river: Rosa, Delacroix; af_heart:
  Juniper, Noelle; af_alloy: Candace, Sheldon; bm_daniel: Tillman, Hollis) and sounded alike.
* Fourteen story and walk-on speakers (Miss Cordy, Chair Tate, Garrett, Rivka, Priya, Tito, Technician, Funeral Director, Receptionist, Facilitator, Mourner, Pencil, Pemberton, CB3 Neighbors) had no
  voice entry in `StoryVoices.ts`: silent. The test `story voices` was red since the STORY2 wave.

What changed:

* `voice/tune.ts` and `SpeechPlayer`: per-speaker pitch offset on the baked audio (hand-set for speakers that share a preset, 60 to 260 cents apart; everyone else a stable hash offset within 35 cents).
  A buffer source cannot change pitch and tempo apart, so tempo follows pitch (+100 cents is 5.9 % faster); the timeline uses the real clip length.
* `prosody.turnGap`: after a question 1.25x gap + 0.1 s + up to 0.12 s for a long question (a beat to think), after an exclamation 0.8x, a short reply (3 words or fewer) 0.85x, a laugh is let land
  (unchanged), a line that ends in a dash or an ellipsis is talked over (the next voice starts 0.08 to 0.22 s early), pickups up to 0.22 s. The street chat partner now answers after the same
  rule (0.2 s at least, instead of a fixed 0.4 s).
* `script.splitSentences`: titles (Mr, Mrs, Ms, Dr, St, Sgt, Jr, Sr, Rev, Mt, Lt, Capt, Prof, Fr, vs) do not end a sentence.
* Text: 38 comma, ellipsis and sentence-break edits in `shows/ads.ts, callin.ts, realestate.ts, board.ts, wellness.ts, latenight.ts, interview.ts, news.ts, djs.ts`, plus two cut-off
  lines that the next speaker interrupts ("...pigeons land on—", "...We move to the—"). Only lines with no baked clip were edited (the unique baked phrases stayed 717 until the title fix, which
  retires the two defective "Mr." story clips: **one story clip, "Clean, Mr. Hobbs.", is left to bake: `node scripts/voice/bake-pack.mjs --tiers 4 --limit 5`; I did not touch `public/voice`**).
  Phrases of 10+ words without a comma: 73 to 26 (60 to 13 unbaked); planned clips 4130 to 4211.
* `StoryVoices.ts`: entries for the 14 missing speakers (distinct voice and speed per recurring character). The story-voices tests pass again.
* `fade.ts` and the playback timeline fixes (section 3).

Sample re-bake (the real tool): `node scripts/voice/bake-pack.mjs --work <scratch> --out <scratch> --match '<10 edited lines>' --limit 10`: **10 clips, 27 s of speech, 2 min 39 s wall on this busy machine
(55 s CPU), all at -16 LUFS**, e.g. "Every sip comes with a lecture," / "four of our desks." / "Our next guest drove a train..." / "He plays the late set,". The whole plan is 8197 s (2.3 h) of speech (`--plan`): at the idle rate (about 1.2x real time) that is hours of rendering, and 5x that under today's load; not run.

### Before and after: two conversations

Same Kokoro-82M voices and engine, same layout code as the player (`SpeechPlayer.expand`, `[over]` overlaps, turn gaps), no effect chain, each file normalised to -16 LUFS.
Before = commit 4e1eda7 (code and text), after = the tree. 55 + 12 clips rendered (the 12 are the edited phrases; compute 471 s + 65 s, about 4x real time on this loaded machine).
Files (mp3 and wav): `demos/conv-deadair-before|after` (late-night call-in: Lorraine, Gus, Boards, Rosa; 58.4 s and 59.0 s) and `demos/conv-board-before|after`
(community board: the chair, Mr. Abernathy, Mrs. Delacroix, Garrett; 61.3 s and 61.4 s).

| | call-in before | call-in after | board before | board after |
| --- | --- | --- | --- | --- |
| phrases (clips) | 29 | 32 | 27 | 27 |
| gaps between speakers, s | 0.09 0.14 0.21 0.11 0.40 0.47 0.85 0.14 | 0.66 **-0.17** 0.21 0.11 0.54 0.35 1.10 0.14 | 0.24 0.12 0.25 0.79 0.30 -0.14 0.33 1.48 0.63 | **-0.15** 0.12 0.25 0.79 0.30 -0.14 0.33 1.61 0.35 |

The negative gaps are overlaps: the two interruptions ("...pigeons land on-" cut by Gus, "...We move to the-" cut by Mr. Abernathy). The board's second-last gap (1.61 s) is a
`[pause]` written into the script. Pauses inside a line (silences of 0.12 s or more read back from the audio), per line / mean s: Rosa 4.5 / 0.51 to 5.5 / 0.50 (the new commas),
Lorraine 3 / 0.37 to 3 / 0.36, Odessa 2 / 0.44 to 1.75 / 0.45 (the orphan "Mrs." and its pause gone from her line).
Speaking rate while talking (words per second): spread across the eight speakers 2.45 to 3.83 before, 2.50 to 4.05 after.
Median pitch of each speaker (rough autocorrelation, Hz) before / after: Gus 112 / 117 (+90 cents), Rosa 178 / 185 (+60), Delacroix 178 / 167 (-110), Garrett 160 / 152 (-90),
Abernathy 103 / 102 (-90 on a bm_lewis voice shared with Gerald and Trent), Lorraine 188 / 189, Boards 125 / 126, Odessa 171 / 175: the offsets arrive at the intended size.

Listen for: a breath at each added comma and a longer one at each ellipsis ("Your landlord turned your apartment into... four of our desks" style); a short think before an answer to a
question; the two cut-off lines being talked over; "Mrs. Delacroix" in one piece; Rosa and Delacroix (same neural preset) no longer sounding like one person.
What I cannot judge: whether the overlap and the longer pause after questions sound natural rather than staged; the offsets are small, so a +/-100 cent spread reads as a different
speaker, not a different voice.

## 5. What a person should listen for

* `demos/engine_sedan_1_original.wav` (before the SFX2 lane), `_2_before_soundcheck.wav`, `_3_after.wav` (17 s: key on, idle, pull-away through the gears, lift off, brake, horn tap). Listen for:
  level (1 to 3 is about 9 dB lower), no slow swelling in the held notes, no gap at each shift, the idle still audible. `engine_bus_*` the same for the bus.
* `demos/street_mix_before_soundcheck_master.wav` and `street_mix_after_master.wav` (60 s): can you follow the radio and the host line over the engine at cruise; is full throttle
  clearly there; do passing cars read as a background wash; are footsteps audible on foot. The stems are in `demos/street_mix_after_stem_*.wav`. The radio is a synthetic track.
* `speech/conv-*-before|after.mp3|wav`: pauses at commas and ellipses, a beat before an answer to a question, overlap where a line is cut off, two speakers on one preset no longer alike.

## 6. Not verified

* Nothing heard. All loudness is K-weighted LUFS; the bus and bloom of low frequencies is under-read by it.
* The SoundCloud widget (the default radio), the browser's real-time audio thread (underruns, the timeline lock) and device output cannot be rendered here.
* Dropouts caused by a busy main thread (items 4 and 11) are mitigations, not proven fixes.
* The street scene uses a synthetic radio track and three baked speech clips; the ped speech did not go through the `street` fx bank.
* Tests: `npx vitest run tests/unit/audio` and `npx tsc --noEmit` (see the final report).

## 5. Stutter, again (27 Nov, the lead)

The owner still hears the engine stutter after the 22 Nov fixes. Checked and ruled out on 27 Nov: the engine simulation in a straight
full-throttle run and a tapped-throttle cruise for all 46 car types (no limiter bounce, no gear hunting; only `beater` and `dollarvan`
misfire, by design). New suspect, fixed: the game writes engine state once per DRAWN frame (several fixed steps in one frame all land
on the same audio time), and pitch was smoothed with a 30 ms time constant. Slow or uneven frames turn a rising note into a staircase,
and a 150 ms hitch into a hold and a jump. The earlier offline checks stepped at a steady 57 updates a second and could not see it.

Fix: `glide()` in `src/audio/vehicle/nodes.ts` draws a straight line from where the pitch is to the new value over a little more
than the measured gap between frames, aimed slightly ahead along the trend. It keeps its own account of the line (a first version
used `cancelAndHoldAtTime`, which returned half the value now and then in Chromium when the hold fell on a ramp's end).

Measured with `scripts/dev/engine-glide-check.mjs` (real classes, offline render in Chromium, sedan, full throttle; flutter = cents
away from the note's own 60 ms average, by autocorrelation; gear changes are in the number, so it is not zero when perfect):

| frames | old peak / rms cents | new peak / rms cents |
| --- | --- | --- |
| 60 a second | 17.9 / 4.07 | 32.8 / 5.38 |
| 30 a second | 16.0 / 4.21 | 26.1 / 5.69 |
| 20 a second | 16.0 / 4.38 | 26.0 / 5.34 |
| 45 with 150 ms hitches | 284.1 / 13.81 | 42.1 / 6.02 |

Reading: across hitches the note is far steadier. At steady rates this metric is slightly HIGHER with the fix; the lead believes that
is the gear changes being followed more sharply (less lag), but has not separated the two. Largest sample step unchanged (no clicks).
NOT HEARD by anyone here. If the owner still hears it, the next things to try are listed by cost: record 20 seconds of the game's
output on his machine; lower the number of engine partials on slow frames; move the engine to an AudioWorklet that runs the
simulation on the audio thread.
