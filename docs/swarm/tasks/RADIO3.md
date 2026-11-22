# RADIO3 (22 Nov 2026): seven mixes per SoundCloud station, hip hop, live pools, second talk station

Status: code and tests done (22 Nov); both builds made. Not heard, not played in a browser. Nothing here was HEARD: nobody on this team can listen, and the SoundCloud widget is mocked in tests.

## Owner report (22 Nov, after playing the live game)
"each SoundCloud radio station should have more than one DJ mix ... 7 DJs per radio station"; "the other streaming stations (rock, etc.) can it be more random??";
"as far as the hip hop station I heard zero hip hop. Please add hip hop station."; a humorous talk station is written by TALK2.

## Why a station felt like one mix (read from the code, not heard)
- Every SoundCloud station was ONE account URL (`.../<account>/tracks`) loaded into the widget. A station = one brand's feed.
- The random pick (`ScStation.randomStart`) ran once per source per session. After it the widget walked the account in feed order
  (FINISH does nothing while the account has more sounds), so after the first mix it is "next track of the same account".
- Tuning away and back resumed the same mix (virtual clock), and a mix was never entered mid-way (`applyPlayback` seeks only for single tracks, and
  an account counts as a set), so every tune-in began at 0:00 of a feed-ordered sound.
- Only the first pick preferred 45 minute sets; short sounds, trailers and interviews of the account were fair game later.
## Why hip hop played none
- `stoop` = the `uhhmradio` account feed. It is a radio-show brand; its feed holds shows, interviews and promos, and the random pick has no genre test
  (the keyword filter exists only for the RA pool). The owner's single tune-in landed on talk. Not proven by listening; the account page could not be opened from here.
- Correction to the brief: WBSY Talk in the running game is NOT `script.json`. `AudioSystem` uses `TalkStation` (the cast and shows in `src/audio/voice/`) unless a script is passed in;
  `script.json` (Lorraine Static) is only used by tests. The Group Chat is the first station on `TalkPlayer` plus a script file, and it speaks with the browser's SpeechSynthesis, not the HD voice hub.

## What changed
- `src/audio/sc/mixes.json` (SCMIXES and the lead) is read by `src/audio/sc/mixes.ts`: https, soundcloud.com, a track or set URL, no duplicates, extra fields ignored, a bad entry or key dropped, never throws.
  The old `stoop` key is folded into `hiphop` (13 mixes). Fewer than two usable entries: the station plays its account as before.
- `ScStation` curated mode: the pool is a shuffled bag (Fisher-Yates on the station's random), no repeat until all are played, a new round never opens with the last mix,
  a mix the widget cannot load is skipped and remembered for the session, the account is the last resort when every mix is bad. Coming back after 60 game seconds away picks a new mix
  (a quick flip past the station resumes the same one). The first PLAY of a mix seeks to a random point, never in its last ten minutes (mixes under 15 minutes start at the top).
  Now playing = what the widget's page reports (title, uploader), the researched title and DJ until then; `mixUrl` is the credit link, shown in the Radio panel as "On now: ...".
  Resident Advisor keeps alternating a RA NYC pool set with a curated mix.
- Hip hop: `stoop` is retired from the dial. Its account (`uhhmradio`) holds two tracks from July 2017. New `hiphop` "Stoop Hip Hop Radio" (Big Tayo, same persona, copy and slot as before) plays the pool of 13;
  second on the dial. `beat` "181.FM The Beat" is a live hip hop and R&B stream right after it.
- Live pools (`CatalogEntry.pool`, `LiveStation`): a random stream per tune-in, never the one that played last; a dead stream moves to the next of the pool (toast "Now on X.") and the station fails only when all are dead;
  every 35 minutes of playing it rotates; the HUD line shows which stream is on (and the song where the broadcaster publishes it). Dial names: Soul & Funk Live (3), WFMU Live (3), Indie & Rock Live (4), SomaFM Underground 80s (2).
  Checks and credits: `docs/CREDITS.md`, "Radio, 22 Nov (RADIO3)".
- Dial start: `RadioDirector` option `shuffleStart` (on in the game): a random music or live station each session, never a talk station; the remembered station is ignored while it is on. There is no per-car memory: within a session the dial keeps what you last tuned.
- Group Chat: `groupchat` "The Group Chat 99.9" next to WBSY Talk, `TalkPlayer` with its own name, its own place in its script, a random first tune-in mid-show. `script-groupchat.json` (TALK2, 97 kB) loads as its own chunk on hosted and native builds only, so the single file is unchanged in logic (10.86 MB, limit 12; the script text is not in it and the station is not on its dial).

## Checked
`npx vitest run tests/unit/audio tests/unit/ui --maxWorkers=1`: all but the MENU2 lane's menu tests (`pendingCount`), which are not mine. New: `sc-pool.test.ts`, `live-pool.test.ts`. `npx tsc --noEmit`: no errors in `src/`.
Hosted and single-file builds made (scratch `radio3/dist`, `dist-single`). Live streams were requested with curl on 22 Nov (200, audio type, icy-name; one first byte). SomaFM answered 403 to this box (known), so its three streams are unverified here.
## Not verified
Nothing was heard. The widget is mocked in tests: that every mix plays for a signed-out listener (some uploaders block embedding), that `seekTo` after PLAY behaves in the real widget, that a /sets/ URL or a very long mix plays,
that Radio Paradise's AAC rock stream plays in every browser, and the pool rotation timing in a real session are all untested. No browser run.
