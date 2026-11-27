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
