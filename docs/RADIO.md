# Radio: SoundCloud mix stations, synthesized announcers, WBSY Talk

GTA Bed-Stuy ships **no music and no recordings**. The car radio is a dial of **eight SoundCloud-mix stations**, each with its own **synthesized announcer** (the browser's SpeechSynthesis voices, the same machinery as WBSY Talk), then **WBSY Talk** (the AI talk show, also synthesized speech) and, only if you add your own files, a **My Library** station at the very end. Sets play only through SoundCloud's official embedded player. Nothing is downloaded or uploaded.

## The dial (press E / RADIO / Y in a car)

| Dial | Station | Dial text | Plays (keywords matched against set title and DJ name, any case) | Announcer |
|---|---|---|---|---|
| 1 | **BK House** | 90.9 | house, garage, deep, soulful, chicago, jackin, 2-step | Deja Fontaine |
| 2 | **Dub Lab** | 91.7 | dub, techno, dubstep, bass, minimal, industrial | Odell Reverb |
| 3 | **Stoop Radio** | 93.5 | hip hop, rap, trap, boom bap, drill, grime, cypher, r&b | Big Tayo |
| 4 | **Boogie Down** | 95.3 | disco, boogie, funk, soul, italo, groove, nu disco | Velvet Lou |
| 5 | **Weird Hours** | 97.1 | psych, jazz, experimental, ambient, avant, noise, krautrock, leftfield, improv, weird, dream, idm | Wren Calloway |
| 6 | **Yard FM** | 98.9 | reggae, dancehall, afrobeat(s), soca, amapiano, kuduro, bashment, zouk, ragga, calypso, riddim, caribbean | Auntie Pearl |
| 7 | **Flashback 88** | 88.8 | 80s, 198x, eighties, pop, new wave, synthpop, retro, freestyle, hi-nrg | Tommy Tapedeck |
| 8 | **Radio SC** | 100.1 | any set (RA NYC) | Cass Meridian |
| 9 | **WBSY Talk** | - | the 22-minute talk show | its own cast |
| 10 | **My Library** | - | your own files (only on the dial when at least one can play) | none |

Keywords are whole words (so "Rapture" is not rap). The table lives in `src/audio/radio.ts` (`SC_STATIONS`, `stationAccepts`). All station, announcer and DJ names are invented; none belongs to a real station or person, and no voice imitates a real DJ.

## Where each station's sets come from

All eight stations share one pool of **45-minute-plus SoundCloud DJ sets** read from your own ra-nyc app (`https://ra-nyc.vercel.app/api`, see "RA NYC pool" below). A station picks its next set in this order:

1. an **unheard pool set whose title or DJ name matches the station's keywords**;
2. else the station's own **pasted SoundCloud links** (Radio library, per station, in list order, each once per round);
3. else **any unheard pool set**;
4. when everything has been heard, a new round starts (never with the set that just played).

Every station remembers what it played, so a set never repeats on a station until its whole pool has been heard (two stations can still play the same set at different times). When fewer than 3 unheard matching sets are left, the pool is **asked for more** (`RaFeed.topUp`): artists whose event title, venue or name hints at the station's keywords are looked up first. It keeps the feed's rate rules: one lookup at a time, at most 32 extra lookups and 8 event days per session (on top of the first build's 8 lookups), 4 lookups per call, and a 429 stops everything for the `Retry-After` period. Everything is silent on failure.

**Virtual clock per station.** Each station keeps its own clock while you listen to something else or are out of the car. Tune back in and its set resumes where it "would be" (a playlist or set link follows SoundCloud's own track order and is not seeked). A station's clock starts on its first tune-in; nothing loads until then.

If SoundCloud cannot load (offline, a sandbox that blocks third-party iframes such as the artifact preview, or no sets) the station shows "BK House (needs the hosted build / internet)" or the "No sets yet" hint and plays a short procedural synth bed (house, trap, boom-bap, jazz-rock, psych, echo-dub, 80s) so it is never silent. It retries on a later tune-in, at least 30 s apart.

## Announcers

Each station has an announcer (persona: name and 2 to 3 lines of personality in `src/audio/announcer/personas.ts`; scripts in `src/audio/announcer/scripts.ts`; logic in `Announcer.ts`). Voices are the browser's SpeechSynthesis voices, **picked and told apart exactly like WBSY Talk** (`pickVoices` from `src/audio/talk/TalkPlayer.ts`: up to four distinct voices by language and name, plus a pitch and rate per persona, so a device with one voice still gets eight announcers).

Each station script has: 3 station IDs ("You're locked to BK House, ninety point nine Bed-Stuy."), 3 set intros ("Up next, a set from {dj}: {title}."), 2 generic intros, 2-3 outros ("That was {prevDj}, with {prevTitle}."), 3 clock-and-weather lines ("Ten past midnight on Throop, light rain.") and **22 short idents/one-liners**.

**When they speak**

* on tune-in, after the station jingle (a short ID, at most once per 20 s so flipping the dial is quiet);
* **between sets**, always: the outro of the set that ended, then the intro of the next ("Up next, a set from {dj}: {title}");
* otherwise **at most once every 8 minutes**: a one-liner (70 %) or the time and weather (30 %), each line used once before any repeats;
* **never over WBSY Talk**: the announcer is stopped before the talk show can take the speech queue, drops anything pending while talk is on, and never cancels the talk show's speech;
* **ducking**: while the announcer talks the SoundCloud widget is turned down to 22 % and eased back up afterwards;
* **no voices**: with no SpeechSynthesis voices the announcer stays silent and the HUD only shows the text line (`announcerLine`) for as long as it would have taken to read.

The hour comes from the game clock (the same `setGameHour` feed that Radio SC's after-hours rule uses); weather, rain and street come from `audio.setBroadcast({ hour, weather, rain, street })`. Without them the announcer uses the device clock, dry weather and "Throop".

## HUD

* While a set plays: `{station} — {set title} — {dj}` (for pasted links the widget's `Title - user`).
* While the announcer speaks: `{station} — {announcer name}`.
* WBSY Talk: the speaker and a thin progress line; My Library: the file name without extension.

## Radio library (pause menu)

* **SoundCloud stations**: one section per station with the genre and keywords, `Pool for BK House: 7 of 24 sets match, 5 not heard yet.`, the RA status line and a "Random RA sets" checkbox (off = only your links), plus **that station's pasted links** (add, test, reorder, remove, after-hours flag, Next mix). Only `soundcloud.com` links are accepted. Lists are saved per station in `localStorage` under `gta-bedstuy.radio.sc.v1` (Radio SC) and `gta-bedstuy.radio.sc.v1.<station id>` (the others).
* **My Library** (your own files): see the next section.

## My Library (your own music, optional)

The station is **off the dial until you add files**. Open the pause menu, **Radio library**:

* **Pick folder** (Chrome, Edge and other browsers with the File System Access API) or **Add files** (everywhere, including iPhone and iPad Safari; re-add each session there). Sub-folders are read six levels deep. The game remembers the folder and re-asks the browser for permission next session (**Reconnect folder**).
* **Fill from folder** re-reads the remembered folder. **Reset library** (tap twice) forgets everything.
* Files are sorted into the eight slot lists by keywords in their folder or file name (pop, 80s, rap, house, trap, psych, folk/echo, jazz/funk; see `src/audio/library/genres.ts`); move them with **Move to...** or drag. **My Library plays every file you placed, in list order, on a loop** with a 0.5 s cross-fade and its own virtual clock. A file only counts once its URL is loaded this session, so saved-but-unreconnected songs keep the station off the dial.

Supported files are whatever your browser can decode. Audio data is never copied or stored by the game.

## WBSY Talk

Unchanged: an original, fictional 22-minute talk show about AI (script `src/audio/talk/script.json`) read aloud by SpeechSynthesis with up to four voices, procedural stings and a ducked chord bed. It loops, keeps virtual time and pauses with the game. Without SpeechSynthesis it shows **WBSY Talk (voice unavailable on this device)**.

## RA NYC pool

On the first tune-in the pool picks a random New York day from the last 21 days, reads `GET /events?date=YYYY-MM-DD`, collects the distinct artists, shuffles them and looks them up one at a time with `GET /artist?id=<ra id>&name=<name>` until 12 unheard sets or 8 lookups. Only `provider === 'soundcloud'` sets with `duration >= 2700 s` are kept (the client enforces it again). The pool (cap 80, deduped by URL) and the played list are cached in `localStorage` (`gta-bedstuy.radio.ra.v1`); a cache younger than 24 h with at least 6 unplayed sets is reused without a network call.

Where the API is read from: the hosted build uses the same-origin proxy `/ra-api` (a `vercel.json` rewrite to `https://ra-nyc.vercel.app/api/:path*`, so no CORS is involved). Anywhere else (dev, the single-file artifact) it calls `https://ra-nyc.vercel.app/api` directly, **which only works if ra-nyc sends `Access-Control-Allow-Origin` for the page's origin**; otherwise the pool says "unavailable" and stations fall back to pasted links, then the synth bed. For testing set `localStorage['gta-bedstuy.radio.ra.base']`.

## What is stored, and where

Only on your device, never sent anywhere: library metadata (`gta-bedstuy.radio.v1`), the folder handle (IndexedDB `gta-bedstuy-radio`), per-station pasted links (`gta-bedstuy.radio.sc.v1[.<id>]`), the RA pool cache and played list (`gta-bedstuy.radio.ra.v1`), and temporary `blob:` links in memory. **Reset library** removes the library data; delete the SoundCloud keys in your browser's site data to forget the links.

## For developers

* `src/audio/radio.ts` - `SC_STATIONS` table (names, dial text, keyword patterns, synth bed), `stationAccepts`, the synth beds.
* `src/audio/sc/RaFeed.ts` - the shared pool: `pickFor(match, heard)`, `countMatching`, `topUp(match, heard, hint)`, `matcherFor`.
* `src/audio/sc/ScStation.ts` - one SoundCloud widget station (`config` = id, name, match, storage key): source order, per-station heard set, virtual clock, `setDuck`, `onBetweenMixes(prev)`.
* `src/audio/announcer/` - `personas.ts`, `scripts.ts` (+ `spokenTime`, `weatherPhrase`, `fillScript`), `Announcer.ts` (cadence, queue, ducking, talk guard, text-only mode).
* `src/audio/RadioDirector.ts` - the dial (8 `ScStation`s, talk, gated My Library), `stationName`/`trackName`/`announcerLine`, `setBroadcast`, `setScVolume`. `src/audio/library/timeline.ts` `buildLibraryTimeline` for My Library.
* `src/audio/AudioSystem.ts` - `scStations`, `sc` (Radio SC), `setBroadcast`, `announcerLine`; options `feed` and `scEnv` for tests.
* `src/ui/RadioUi.ts` + `radio.css` - the Radio library panel.
* Tests: `tests/unit/audio/{sc-stations,announcer,radio-director,sc-station,ra-feed}.test.ts`, `tests/unit/ui/radioui.test.ts`.
