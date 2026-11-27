# RADIOPAGE (27 Nov 2026): a /radio page that plays every station without the game

Owner: "an individual player like the artifact on the vercel repo and maybe a link in the readme". Lane RADIOPAGE (Mara Quill).
Status: in progress. Nothing here was HEARD: nobody in this box can listen. Updated as the lane goes; see "Done" at the end.

## Design
- Second HTML entry of the HOSTED build only: `radio/index.html` -> `src/radio/main.ts`. URL `/radio/` (`/radio` redirects to it, vercel.json).
  `vite.config.ts`: hosted build gets `rolldownOptions.input = { main: index.html, radio: radio/index.html }`; the single-file build is untouched
  (one input, and `radio/` is never read by it). The web-app tags plugin skips the radio page (its relative hrefs are written for the root page).
- It builds the game's own `RadioDirector` (catalog, ScStation + official SoundCloud widget, LiveStation, Announcer, DjMentionRunner, WBSY Talk via
  VoiceHub + TalkStation, The Group Chat via TalkPlayer) with a small adapter (`src/radio/engine.ts`): its own AudioContext for the voice hub, real
  clock for `update(dt)`, `autoSkip: false` (a tester wants to see a station fail, not be moved on), no game, world or three.js.
- Additive hooks in `src/audio`: `SC_FREQ` exported (radio.ts); `ScEnv.widgetHost` (ScStation.ts): where the real player frame is put and how it looks
  (the game leaves it unset: hidden frame in document.body, unchanged).
- UI (`src/radio/ui.ts`, `radio.css`): head unit (dial, display, announcer line, volume, prev / next, next set, retry), SoundCloud player visible, set
  timeline with DJ mention marks (the runner's own plan), "what is on" panel per station, status line with the reason a station is silent.

## Not the game
- No station jingles or dial static (synth in AudioSystem), no talk bed under WBSY Talk, no ducking of the music by the voice hub, no story bulletins,
  hour from the real clock, weather dry.
- Frequencies: only the nine SoundCloud stations have dial text in the game (`SC_FREQ`), WNYC is 93.9 by name, the Group Chat 99.9 by name. Others show a badge only.

## Done (27 Nov)
- Files: `radio/index.html`, `src/radio/{main,engine,ui,stationInfo}.ts`, `src/radio/radio.css`, `tests/unit/radio/radiopage.test.ts` (17 tests), `scripts/dev/radiopage-shoot.mjs`,
  README row, `vercel.json` (`/radio` -> `/radio/` redirect), `vite.config.ts` (hosted second input; web-app tags skip /radio/).
- Edits in `src/audio`: `radio.ts` `SC_FREQ` exported (one word); `sc/ScStation.ts` `ScEnv.widgetHost` (new optional field), `makeFrame(doc, src, host?)`, and `exposeWidget` / `hideWidget` do nothing when a host is set. The game never sets it: its behaviour is unchanged.
- Built page: `radio/index.html` + `assets/radio-*.js` 17.7 kB + shared `TalkStation-*.js` 232.6 kB + `preload-helper` 1.5 kB = about 252 kB of JS before gzip (no three.js, no world code), plus the Group Chat script chunk (69 kB) fetched lazily, plus the voice pack files when WBSY Talk speaks. The shared chunk is also used by the game now (the bundler moved the voice code into it).
- Single-file build: 11,904,399 -> 11,904,641 bytes on the same tree (+242 bytes: the `widgetHost` hook in ScStation). No radio page code or markup in it (grep 0).
- Tests: `tests/unit/radio` 17 green, `tests/unit/audio` 634 green, `npx tsc --noEmit` clean.
- Headless check (`scripts/dev/radiopage-shoot.mjs`, outside hosts blocked): page boots, 17 buttons, every station tunes and shows a plain status. SoundCloud, live streams and WNYC show "No stream" with the reason (blocked hosts); WBSY Talk and The Group Chat show "On air" (this box has speech voices or the pack path answers; nothing heard). Only console errors: the blocked requests. No horizontal scroll at 390 px. Screens: `docs/swarm/teams/sheets/radiopage-desktop.png`, `-phone.png`, `-phone-start.png`.
- NOT checked: any sound; the real SoundCloud widget (frame, PLAY events, position, mid-mix seek, the iOS tap); live streams; the RA pool through `/ra-api`; the voice pack from `/voice/` at `../voice/`; a real phone; `/radio` redirect on Vercel (read from the docs, not tried); the DJ-mention timeline against a really playing set.
- For the lead (src/main.ts is yours): a "Radio" link in the title or pause menu pointing at `./radio/` (hosted build only; the single-file build and the desktop apps have no such page, hide it there).
