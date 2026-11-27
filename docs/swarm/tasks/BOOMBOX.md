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
