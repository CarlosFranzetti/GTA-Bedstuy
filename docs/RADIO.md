# Radio: SoundCloud sets, live streams, synthesized announcers, WBSY Talk

Status: partly out of date (checked 21 Nov 2026): the dial, the station sources and the "Where each station's sets come from" section were rewritten on 21 Nov against `src/audio/stations.ts`, `radio.ts`, `RadioDirector.ts` and `announcer/personas.ts`. The sections from "Announcers" on describe the 11 Nov design and were not re-read line by line: the script counts, timings and the developer file list may have drifted (the developer list below was only corrected for the station count).

GTA Bed-Stuy ships **no music and no recordings**. The car radio is a dial of **15 stations** (`CATALOG` in `src/audio/stations.ts`): nine SoundCloud stations that play sets through SoundCloud's official embedded player, five live public internet-radio streams, and **WBSY Talk**, an original scripted talk show spoken by synthesized voices. Only if you add your own files, a **My Library** station is added at the very end. Nothing is downloaded or uploaded by the game itself. The radio needs a network connection; without one a station falls back to a short synthesized bed or is skipped.

## The dial (press E / RADIO / Y in a car; order as in the catalog)

| # | Station | Type | Source | Announcer (invented) |
|---|---|---|---|---|
| 1 | Boiler Room | SoundCloud account | soundcloud.com/platform | Deja Fontaine |
| 2 | Dekmantel Podcast | SoundCloud account | soundcloud.com/dkmntl | Odell Reverb |
| 3 | Resident Advisor | RA NYC pool and the RA Podcast | soundcloud.com/resident-advisor, plus the studio's RA NYC service | Cass Meridian |
| 4 | Rinse FM | SoundCloud account | soundcloud.com/rinsefm | Tommy Tapedeck |
| 5 | Soulection | SoundCloud account | soundcloud.com/soulection | Velvet Lou |
| 6 | WFMU Rock'n'Soul | live stream | stream0.wfmu.org/rocknsoul | none (the stream has its own hosts) |
| 7 | Universal Hip Hop Radio | SoundCloud account | soundcloud.com/uhhmradio | Big Tayo |
| 8 | SilverStarSound | SoundCloud account | soundcloud.com/silver-star-sound | Auntie Pearl |
| 9 | DJ RubyTunes Latin | SoundCloud account | soundcloud.com/djrubytunes | Lucho Ventura |
| 10 | The Lot Radio | SoundCloud account | soundcloud.com/thelotradio | Wren Calloway |
| 11 | WFMU 91.1 | live stream | stream0.wfmu.org/freeform-128k | none |
| 12 | KEXP 90.3 | live stream | kexp.streamguys1.com/kexp128.mp3, with a now-playing line from the KEXP API | none |
| 13 | SomaFM Underground 80s | live stream | ice2.somafm.com/u80s-128-mp3 and three fallbacks, with a now-playing line from SomaFM | none |
| 14 | WBSY Talk | scripted talk show | `src/audio/talk/script.json` and `src/audio/voice/shows/` | its own cast |
| 15 | WNYC 93.9 FM | live stream | fm939.wnyc.org/wnycfm, with a fallback | none |
| | My Library | your own files | only on the dial when at least one file can play | none |

Station names are the real names of the broadcasters, shown as the broadcaster publishes them (real station and artist names are allowed here because the audio is the real public stream). The announcers, their names and their station idents are invented fiction: none is a real person. Verified against the code on 21 Nov: the dial order, the sources and the announcer-to-station mapping above. Not verified: that every stream URL plays today. The 11 Nov catalog check found 14 of 15 playing; nobody has re-run it since.

The old eight-station dial (BK House, Dub Lab, Stoop Radio, Boogie Down, Weird Hours, Yard FM, Flashback 88, Radio SC) is gone. Its station ids survive inside the code (`bkhouse`, `dublab`, `stoop`, `boogie`, `weird`, `yard`, `flashback`, `sc`) and now name the SoundCloud stations above; `latin` is new.

## Where each station's sets come from

- **SoundCloud account stations** (Boiler Room, Dekmantel, Rinse FM, Soulection, Universal Hip Hop Radio, SilverStarSound, DJ RubyTunes Latin, The Lot Radio) load their account's tracks through SoundCloud's widget and skip to a random set. Each remembers what it played and keeps its own virtual clock, so tuning away and back resumes where the set "would be".
- **Resident Advisor** is the only station that draws on the **RA NYC pool**: 45-minute-plus SoundCloud DJ sets by artists playing New York events, read from the studio's RA NYC service (see "RA NYC pool" below), mixed with the RA Podcast account. It accepts any set (no keyword filter).
- The keyword lists in `radio.ts` (`SC_HINTS`) are used only to filter the RA pool when a station draws on it. The other stations play their own account.
- **Live streams** play in an HTML audio element (`src/audio/live/LiveStation.ts`), first URL first, then the fallbacks. A station that cannot play shows "off the air" in the Radio panel and the dial skips it.
- If SoundCloud cannot load (offline, a sandbox that blocks third-party iframes such as the artifact preview) the station shows a hint and plays a short procedural synth bed so it is never silent; it retries on a later tune-in.
- You can still paste your own SoundCloud links per station in the Radio library panel (played when the pool has no matching set).

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

* `src/audio/stations.ts` - the 15-station `CATALOG`; `src/audio/radio.ts` - `SC_STATIONS` (derived from it: dial text, keyword hints, synth bed), `stationAccepts`, the synth beds.
* `src/audio/sc/RaFeed.ts` - the shared pool: `pickFor(match, heard)`, `countMatching`, `topUp(match, heard, hint)`, `matcherFor`.
* `src/audio/sc/ScStation.ts` - one SoundCloud widget station (`config` = id, name, match, storage key): source order, per-station heard set, virtual clock, `setDuck`, `onBetweenMixes(prev)`.
* `src/audio/announcer/` - `personas.ts`, `scripts.ts` (+ `spokenTime`, `weatherPhrase`, `fillScript`), `Announcer.ts` (cadence, queue, ducking, talk guard, text-only mode).
* `src/audio/RadioDirector.ts` - the dial (9 `ScStation`s, 5 `LiveStation`s, talk, gated My Library), `stationName`/`trackName`/`announcerLine`, `setBroadcast`, `setScVolume`. `src/audio/library/timeline.ts` `buildLibraryTimeline` for My Library.
* `src/audio/AudioSystem.ts` - `scStations`, `sc` (Radio SC), `setBroadcast`, `announcerLine`; options `feed` and `scEnv` for tests.
* `src/ui/RadioUi.ts` + `radio.css` - the Radio library panel.
* Tests: `tests/unit/audio/{sc-stations,announcer,radio-director,sc-station,ra-feed}.test.ts`, `tests/unit/ui/radioui.test.ts`.
