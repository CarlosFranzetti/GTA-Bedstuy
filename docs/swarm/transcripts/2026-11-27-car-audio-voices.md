# Car entry, collisions, audio and voices: the 27 November team, in plain English

Status: historical record (not maintained)

*A plain-language retelling of what six seats posted and measured on 27 November 2026. Sources: the channel posts of that day in `docs/swarm/transcript.md` and each seat's task note.*

## What the owner asked for

On 27 November he asked for getting in and out of cars to be smooth: "make sure enter exit car is smooth and no glitching camera showing in between the models; for the car should be instant like gta; there are collision issues, the car and player get stuck sometimes, and controls aren't as smooth as gta yet". He also said the talk radio hosts "sound very digital", that the audio stutter "I believe it's the environment audio", and that the theme should not play while loading.

The channel shows these seats posting in turn. They do not reply to each other there. Their task notes do show where their work touched. Nobody on the team can hear sound or play with their hands, so every audio result below comes from scripts. The sources do not say whether any of this is deployed.

## Mira (CARENTRY): getting in and out of cars

Mira measured the camera across 96 runs of entering and leaving cars. At 14:32 she posted that 44 of them had a frame where the lens was inside the car, a wall or the character. Her fix made the camera cut at the press of the key instead of gliding. At 15:29 she posted the same result twice, a minute apart, from the running game.

- Measured: 44 of 96 runs had a bad frame before, 0 of 96 after. In 12 game cases, 9 had the lens inside the near plane (the closest the camera can see) before and 0 after.
- Measured: getting in at a door takes 0.50 s. From behind a car it takes 1.2 s for a sedan and 1.5 s for a bus.
- Changed: a cut to the car view and back, not a 0.6 s blend. Walking round a car to a far door, not through its body.
- Changed: a six-line hand-back for the lead in `docs/swarm/tasks/CARENTRY-main.diff`. Without it the old blend stays.
- Not checked: a real phone, the medium and high tiers, and any sound (the door sound is unchanged). Still seen after the fix: leaving the passenger side of a long van in the Modern camera.

## Ines (STUCK): cars and people getting stuck

Ines ran long automated tests (2,000 cars and 600 walkers per map, before and after). Her early post at 14:33 counted 2,500 cars and 24 stuck. Her final table uses 2,000 cars and 21. The cause: cars wedged diagonally in tight gaps, where two pushes fought each other. She added a backstop that moves a body stuck for half a second to the nearest free spot.

- Measured, grid map cars: hard stuck 21 to 0; overlapping for 0.75 s or more 23 to 0; longest overlap 12.5 s to 0.55 s.
- Measured: a sedan braking hard with the wheel held turned 71 degrees before and 44 after. A sprint along a wall at 70 degrees kept 52 percent of its speed before and all of it after.
- Changed: the backstops in `src/physics/World2D.ts`, which can be switched off for comparison. Steering responds faster.
- Not checked: nobody has driven it, so "smooth" means response times only. On the real map the count can move by 0 to 2 cars in 2,000.

Ines's note says a red entry test comes from CARENTRY's work. CARENTRY's note says a red vault test comes from Ines's physics edits. Neither was settled in the channel.

## Maren Ostrow (AMBIENT): loading music and the stutter

At 14:20 Maren read the audio code and posted two findings. The loading theme is played by the main thread, so any stall drops its notes. The city hum is a 2-second sound that repeats without a crossfade (a blend of the loop's end into its start). At 14:36 she posted that the work was done.

- Measured, offline renders of 60 s each: the city hum no longer repeats every 2 s. Its loop is now 8 s. The traffic wash loop went from 1 s to 6 s.
- Measured: the weather sound wrote 660 settings a second; in a steady storm it now writes 9.
- Measured: in a 2 s stall, the title theme's silent gap went from 2.00 s to 0.33 s.
- Changed: the loading screen is silent (`?loadmusic=1` brings the old music back). Loops are longer and blended. A `?debug=audio` panel and `?mute=` switches were added.
- Not checked: nothing heard. No click was found at any loop seam. Why the desktop app is worse is a hypothesis from the code.

## Odalys Rhee (VOICES): talk radio voices

At 14:31 Odalys said the talk shows speak only through the browser's built-in voice. At 15:05 she posted the samples and the main finding. Nothing in `src/` or `public/` changed. All rendering was local: no key was used and no text left the box.

- Found: WBSY Talk and The Group Chat speak only through the browser voice, which is pitched up or down by role. Talk shows and ads have no recorded clips in the voice pack.
- Measured: the live Kokoro voice (an open speech model) ran at 4 to 9 times the time the audio lasts on this box's CPU. The game's limit is 1.6.
- Changed: seven options, three hosts and three lines each, in `docs/swarm/voice-samples/2026-11-27/` (about 2.6 MB). Options: current, studio, radio, blend, Piper (CC BY 4.0), Parler-TTS mini (one line only, 30 to 48 s of compute per second), Chatterbox (MIT).
- Not checked: nobody has heard the samples. Five other engines were not run, for licence or untested reasons.

## Marco Heath (REF34): notes on GTA III and IV

At 14:22 a post was signed "Ines Calloway", the name of another study's author. At 14:25 Marco said he is Marco Heath, and set out what he had opened and checked. The guide he wrote is `docs/reference/gta3-4-conventions.md`, with a checklist of twenty yes or no items.

- Measured: nothing in the game. From sources he read: GTA III's car entry is a door opening and the character sitting in, with no timing given. In GTA IV, entering from the passenger side pulls the driver out first. GTA IV's camera complaints were about lag on turns, not the look.
- Changed: the guide only. No game files.
- Not checked: no entry times, follow distances, grip curves or stuck-handling rules were found for either game. GTA III has no motorbikes.

## PACKMEASURE: the owner's reference folder

This seat has no channel posts; its task note is the source. Drive's connector refuses files over 10 MB, so the unzipped folder was used.

- Measured: the folder holds two model files (a large sedan, and a 2002 fan car), about 35 texture sets, and no pedestrian or building meshes. People and buildings were measured as textures only.
- Changed: `docs/reference/pack-measurements.md`. Nothing from the pack is in the repository.
- Not checked: the owner's complaint that SUVs and trucks feel too big cannot be settled, because the folder has no SUV, truck, van or person model.

## Waiting on the owner's choice

- Entry: the nearest door (used) or always the driver's side, about 1.3 s for a sedan? Time at the door: 0.5 s (used), 0.35 s or 0.7 s?
- Exit: the camera cuts beside the character (used) or behind it? The behind option breaks three tests by design.
- Should a door swing open? None is built, since each car type would need a new part.
- Steering: keep the shipped feel, or try the "weighty" setting, where the wheel visibly leads the car?
- Is a person popping out on the street side of a car right? Someone needs to look.
- Audio: with `?mute=all`, does the stutter stop? Should the loading screen stay silent? Its option B would cost about 25 MB of memory.
- Voices: which of the seven samples does he prefer? The heavy engines are too slow for a phone.
- Models: does he have SUV, truck, van or person model files to send?
- Should a player be allowed to leave a car moving at speed? This is open in REF34's checklist.
