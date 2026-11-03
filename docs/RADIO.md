# Radio: your own music, plus WBSY Talk

GTA Bed-Stuy ships **no music**. The car radio plays songs from **your own device**: you point the game at a folder (or pick files), and it plays them on the stations below. Nothing is uploaded and nothing is bundled. Anything you do not load is replaced by that station's built-in synth loop, so a station is never silent.

## Stations (press E / RADIO / Y in a car)

| Dial | Station | Slots | Folder / file name keywords |
|---|---|---|---|
| 1-3 | WBED Boom-Bap, Kosciusko Kompa FM, Throop Talk Radio | - | built-in synth stations (unchanged) |
| 4 | Bed-Stuy Pop FM | 15 | pop |
| 5 | Flashback 80s | 12 | 80s, 1980..1989, eighties |
| 6 | Throop Rap Radio | 13 | rap, hip-hop, hip hop, boom bap |
| 7 | Garvey House & Dub | 22 | house, dub, techno |
| 8 | Marcy Trap & Plug 808 | 25 | trap, drill, 808, plug |
| 9 | Hazy Tompkins Weird Radio | 28 | psych, psychedelic, dream, indie, weird, wired, synthpop, lo-fi |
| 10 | Lewis Ave Echo-Dub Folk | 16 | folk, echo, echo-dub, reverb, shoegaze, post-rock |
| 11 | Nostrand Jazz-Rock Gets Lit | 16 | jazz, fusion, jazz-rock, funk, prog |
| 12 | WBSY Talk | - | 22-minute original talk show (see below) |

147 music slots in total. Keywords are whole words (so "Rapture" is not rap). The nearest folder name wins over parent folders, and the file name is checked last. If a name matches two genres, the more specific wins: trap over rap, 80s over pop, "echo dub" over plain "dub" (a bare "dub" is House & Dub). Artist names (for example the ones in your own folders) only ever act as keywords you put in folder names; the game contains no recordings.

## Loading your music

Open the pause menu (Esc / the pause button), then **Radio library**.

* **Pick folder** (Chrome, Edge and other browsers with the File System Access API): choose the folder where your music lives. Sub-folders are read (six levels deep). The game remembers the folder, and next session asks the browser for read permission again (a tap on **Reconnect folder**, or automatically on your first click). No re-picking needed.
* **Add files** (everywhere, including iPhone and iPad Safari): select several audio files. Browsers do not let a page remember files, so on those devices add them again each session. The slot choices are remembered, so a song you placed on a station goes back to the same slot once its file is added again.
* **Fill from folder**: re-reads the remembered folder and places any song that is not on a station yet (for example after you added music or cleared slots).
* Each station shows its count (for example `7/15`). Open a station to see its slots. Move a song with the **Move to...** dropdown (works on touch), or drag a row onto another station (desktop). The x button clears one slot; the song goes back to "Not on a station yet". Songs that do not match a keyword, or whose station is full, wait there until you place them.
* **Reset library** (tap twice) forgets every assignment, the remembered folder and all temporary file links.

Supported files are whatever your browser can decode: mp3, m4a/aac, ogg/opus, wav, flac (browser dependent).

## How it plays

* Songs play through the game's own audio, so **Radio volume** in the pause menu controls them, and the radio pauses with the game.
* Each station has a **virtual clock** that keeps running while you listen to something else or are out of the car. Tune back in and it resumes mid-song, like GTA.
* Songs cross-fade over 0.5 s. Empty slots play 40 seconds of that genre's synth pattern (pop plucks, 80s gated snare and bass, boom-bap, four-on-the-floor, trap hats and 808, wobbling psych arps, echo-dub guitar, walking bass with ride). Every station has a short synth jingle when you tune in, plus a station ID between songs now and then, and a blip of dial static.
* The HUD shows the station name and, after a dash, the file name without its extension. On WBSY Talk it shows who is speaking and a thin progress line for the loop.
* Audio only starts after your first click, key press or tap (browser autoplay rules, including iOS Safari).

## WBSY Talk

An original, fictional 22-minute talk show about AI (script: `src/audio/talk/script.json`), read aloud by your browser's **SpeechSynthesis** voices. Up to four distinct voices are chosen by language and name (host, sidekick, callers, announcer for ads, news and jingles) and each role has its own pitch and rate, so it still sounds like several people on a device with one voice. Procedural stings and jingles mark ads and news, and a quiet chord bed plays under the host. The show loops, keeps virtual time like the music stations, and pauses with the game. If your device has no SpeechSynthesis the station is shown as **WBSY Talk (voice unavailable on this device)** and only the bed and stings play.

## What is stored, and where

Only on your device, never sent anywhere:

| What | Where | Content |
|---|---|---|
| Library metadata | `localStorage` key `gta-bedstuy.radio.v1` | per song: file name, relative path, size, modified date, duration; which slot of which station it is in; the folder name |
| Folder handle | IndexedDB `gta-bedstuy-radio` / `handles` | the browser's permission handle for the folder you picked (no files) |
| Playback links | memory only | temporary `blob:` links to your files, recreated each session |

Audio data is never copied or stored by the game. **Reset library** removes all of the above.

## For developers

* `src/audio/library/genres.ts` - station table, slot counts, keyword matching.
* `src/audio/library/Library.ts` - slots, counts, assignment, persistence. `timeline.ts` - slots to a looping timeline (tracks and synth blocks).
* `src/audio/library/import.ts`, `LibraryController.ts` - folder picker, file input, IndexedDB handle, permission re-request.
* `src/audio/RadioDirector.ts` - the dial, virtual clocks, two-deck cross-fade. `decks.ts` - HTMLAudioElement into the radio gain.
* `src/audio/talk/` - `script.ts` (parser, `{ id, kind, speaker, voice, text, seconds }`), `TalkPlayer.ts`.
* `src/ui/RadioUi.ts` + `radio.css` - the Radio library panel.
* `AudioSystem` exposes `stationName`, `trackName`, `talkProgress`, `library`, `libraryController`.

## Radio SC (SoundCloud mixes)

Radio SC is the last station on the dial, right after WBSY Talk. It streams DJ mixes you choose through SoundCloud's
official embedded player (the HTML5 Widget API: a hidden `w.soundcloud.com/player` iframe plus `api.js`). The game
never downloads audio and never calls any other SoundCloud endpoint, and playback follows SoundCloud's terms and
each artist's own settings (a mix whose owner disabled embedding will not play).

**The list is empty by default. Paste the SoundCloud links you like**: open the pause menu, Radio library, and use
the Radio SC section at the top. Add a track or playlist/set link (`https://soundcloud.com/artist/mix`), reorder
with the arrows, remove with x, press Test to check that a link loads, and Next mix to skip. Only `soundcloud.com`
links are accepted. The list is saved on this device in `localStorage` under `gta-bedstuy.radio.sc.v1`.

How it behaves:

- Nothing loads until you first tune in to Radio SC (lazy). The widget script is requested only in the hosted
  build or when the browser reports it is online.
- If the player is not ready within 8 seconds (offline, or a sandbox that blocks third-party iframes, such as the
  artifact preview), the station shows "Radio SC (needs the hosted build / internet)" and plays its procedural
  synth bed instead. It retries on a later tune-in (at least 30 s apart). With an empty list it plays the bed and
  the HUD says to add links.
- The game's master x radio volume maps to the widget volume (0 to 100); pausing the game, leaving the car or
  muting pauses or silences the widget.
- Like the other stations it keeps a virtual clock: tune away and back and it seeks to where the mix "would be".
  A playlist/set follows SoundCloud's own track order and is not seeked.
- The HUD shows "Title - user" from the widget. A short synth "Radio S C" jingle plays on tune-in and between mixes.
- Dayparting stub: tick the after-hours box on a mix (for example a late-night set). Between 23:00 and 06:00 the
  first mix of a session is the first after-hours one; otherwise the first in the list. The hour comes from the
  device clock.
