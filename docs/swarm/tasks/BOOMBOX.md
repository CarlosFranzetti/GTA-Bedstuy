# BOOMBOX (27 Nov 2026): a new interface for /radio/

Lane BOOMBOX (Marisol Vega). Owner: "I want a better interface for the standalone radio." He chose: a vintage boombox on a Brooklyn
stoop, with station artwork, a sound visualiser, announcer captions and a log. Status: in progress. NOTHING HERE WAS HEARD.

## Plan
- `src/radio/engine.ts` stays the adapter. Additive: `Line`, `LogEntry`, `View.caption`, `noteLine()` (the one path every spoken line takes,
  also used by the screenshot script for a fake line), `clearLog()`, `analyser` (tap on the page's own master gain, never in series),
  `runningContext`.
- `src/audio` additive: `TalkStation.lineText / lineParodyOf`, `TalkPlayer.lineText / lineParodyOf`, `ResolvedLine.parodyOf` (+ `resolveShow`
  passes it), so talk lines can be captioned with PARODY. No behaviour change.
- New: `emblems.ts` (17 SVG emblems from a kit), `dial.ts` (frequency strip and needle maths), `viz.ts` (levels: real or simulated),
  `boombox.ts` (the drawing and controls), `static.ts` (optional dial static). `ui.ts` is replaced; `radio.css` is replaced.
- Visualiser honesty: only WBSY Talk's voice pack (and stings) go through the page's own graph, so only they can be analysed. SoundCloud
  is a cross-origin frame, live streams are plain media elements without CORS (routing them through an analyser would mute them), the Group
  Chat uses the browser's speech synthesis (not capturable). Everything else is simulated from play state and a tempo guess and is labelled SIMULATED.

## Done (27 Nov)
- Files: `src/radio/{emblems,dial,viz,static,boombox,ui}.ts`, `radio.css`, `engine.ts` (additive), `radio/index.html`, tests in `tests/unit/radio/radiopage.test.ts` (+13),
  `scripts/dev/radiopage-shoot.mjs` (1280x800 and 390x844, a fake line through `RadioPage.noteLine`; `--out`, `--prefix`).
- Audio edits (additive): `TalkStation.lineText/lineParodyOf` (+ fields reset), `TalkPlayer.lineText/lineParodyOf`, `ResolvedLine.parodyOf`, `resolveShow` passes it.
- Interface: boombox (handle, aerial, two cones that pulse, tuning strip with needle and overshoot, 17 emblem marks on 3 rows, volume and tuning knobs, LEDs,
  five piano keys, invented maker STOOPTONE, stickers: WAX DELI, block party flyer, our 93.5 sticker, Troop Deli cat), caption window in the body, log with clear
  button and DJ-mention marks, station list with emblems, SoundCloud player card, timeline, per-station panels. Arrows tune, Space plays or stops.
- Visualiser: REAL only for WBSY Talk (voice pack and stings go through the page's master gain, which has an AnalyserNode tap). Everything else SIMULATED
  (tempo guess from genre). Reduced motion: static bars, no pulse, needle without overshoot.
- Sizes: page JS 17,758 -> 43,315 bytes (+ shared TalkStation chunk 248,529 -> 249,051); CSS 6,966 -> 18,858. Single-file index.html 11,920,890 -> 11,923,354 (+2,464, from the audio getters; no radio code in it).
- Not done / not verified: nothing heard (static, voice pack analysis, cones in time with sound); SoundCloud widget untested; real phone untested; the pointer drag of the knob only checked by reading, not by a pointer test.
