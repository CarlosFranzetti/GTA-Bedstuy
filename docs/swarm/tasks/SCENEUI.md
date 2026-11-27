# SCENEUI (Priya Raman, 27 Nov 2026)

Status: started. The Pedro story's missing UI as self-contained modules; only the lead edits `src/main.ts`.

## Plan
1. `src/ui/story/SceneCard.ts` + `story.css`: draws `bridge.scene.frame()`, keys 1 to 4, click and tap, pad face buttons, timer bar, mood meter; PanelManager panel `scene`.
2. `src/ui/story/FlyerPrompt.ts`: nearest ADULT pedestrian in reach while a night is open; F calls `bridge.handFlyer`. Minors never offered.
3. `src/ui/story/RackPanel.ts`: thrift rack (buy, bag, resale guess by place) over `Nightlife.racks`, `bag`, `MARKETS`.
4. `src/ui/story/storySettings.ts`: "Intimate scenes: On / Off" (default On, localStorage), a getter and a `gameRows` row for the lead.
5. CAST renames: augie to clem, dom to kyle, noor to margo, julian to remy, winston to hollis (BIBLE section 9) and the three role notes.
6. `src/game/story/wire.ts`: `wireStory(host)` builds Nightlife, StoryBridge, hooks, the three panels; one `update` per step.
7. The exact numbered main.ts lines (end of this file).

## Facts found
- The MISSIONS notes file has no numbered main.ts list; the lines below are derived from `StoryBridge`'s own doc comment and the code.
- The SceneCard is a PanelManager panel while a scene is in its 'talk' or 'ended' phase; during 'brawl' it hides so the fight is playable.

## Done (27 Nov)
- `src/ui/story/`: `SceneCard.ts`, `FlyerPrompt.ts`, `RackPanel.ts`, `storySettings.ts` (Intimate scenes: `intimateOn()`, `setIntimate()`, `intimateRows()`), `panelClass.ts`, `storyStyle.ts`, `story.css`.
  The stylesheet is imported as a string (`?inline`) and injected once: a plain CSS import is inlined into the single-file build even while the story switch is off (+7.7 kB).
- `src/game/story/wire.ts`: `wireStory(host)` returns `{ nightlife, bridge, card, flyer, rack, update(dt, blocked), interact(), onSetFinished(e), reload(), fighterDown(), playerDown(), anyOpen, dispose() }`.
- Additive hooks in others' files: `SceneFrame.meters?` and `.cut?` (`scenes.ts`, filled by FightScene and DateScene); `StoryBridge.openRack?` (StoryBridge.ts, one field); `hooks.ts` line for `pico-size-medium` objective 4 now opens the rack panel when the host set `openRack`, else the old `buyBest`.
- CAST: ids `augie dom noor julian winston` are now `clem kyle margo remy hollis` (names, full names, notes, venue ids `corner-clem`, `home-margo`, `home-remy`, `home-hollis`, looks nudged to BIBLE section 9: Clem darker skin and group `ba`; Kyle athletic in a quarter-zip look; Margo in a work shirt; Remy in a black tee; Akira body `athletic` and a henley instead of a turtleneck). The three role notes (Adele ER nurse, Lana stylist and flipper, Akira boxing gym owner) plus Stavros are corrected. Faces change for the five (the identity seed is `cast-<id>`).
  Clem keeps age `adult` (not `old`): BIBLE says 61 and "stoop-slim"; the elder body type would change him much more.
- Scene card behaviour: keys 1 to 9, W/S or arrows with Enter, Space or F, click or tap, pad A B X Y for replies 1 to 4 (fresh presses only). Esc does nothing mid-scene (silence is an answer; the 10 s timer ends it) and dismisses the closing line. A brawl hides the card and closes the panel so the fight can be played. The closing line (the bridge ends a scene in the step it is decided) is shown by `showEnding`, called by wire.ts. A warm date is a dark cut with the line, never a picture, for On and Off alike.
- The flyer prompt is offered only while mission `pico-paper-the-walls` is active (night `pico-friday`), for adults within 2.6 m who are not down, fleeing, seated or already asked. Minors: no prompt, no call.

## The numbered lines for src/main.ts (the lead)
`docs/swarm/tasks/SCENEUI-main.diff` is the whole edit as a patch (`git apply -p1 docs/swarm/tasks/SCENEUI-main.diff`; checked with `--check` on the 27 Nov tree); the same edit compiled and booted clean in a scratch copy with `VITE_PEDRO=1`. In order, by where each goes:
1. Imports (line 86): `buildMissions, PEDRO_STORY_ON` from content; `intimateRows` from `@/ui/story/storySettings`; `import type { StoryWire }`.
2. After `const bootLook`'s sibling at line 302: `let castPlayer` and an `if (PEDRO_STORY_ON)` block: dynamic import of `cast/player`, `castBootLook(saved?.playerLook, !!saved)`, `setPlayerLook`, `installCastLook`. (CAST: Pedro on a new game, old saves keep their look.)
3. Before `const uiOpen` (line 352): `let storyWire`, `let storyPeople`; `uiOpen` also true while `storyWire?.anyOpen`.
4. `dj:setFinished` forward (line 433): also `storyWire?.onSetFinished({ venue, score, minutes, crowd })`.
5. After `storyNotices` (line 493): `if (PEDRO_STORY_ON) { ... wireStory({...}); StoryPeople + makePlacementHost ... }` (MISSIONS: bridge, hooks, scenes, rack, flyer, packs, dates; CAST: placement and schedule).
6. `onReset` (line 799), `newGame` (line 832) and `afterApply` (line 839): `storyWire?.reload()`; `newGame` uses `castPlayer.PEDRO_LOOK` when the story is on.
7. `gameRows` (line 808): `...(PEDRO_STORY_ON ? intimateRows() : [])`.
8. F chain (line 877): after `missions.interact(fpos)`: `storyWire?.interact()` then `storyPeople?.talk(fpos)`.
9. After `storyNotices.sync` (line 895): `storyWire?.update(dt, blocked)` and the `storyPeople.setClock/update` line.
VENUES lines (from STORY-VENUES.md, guarded by `VENUES_ON`, NOT compiled here): markers, discovery and `refreshVenuePlaces()` after a save load, as written at the end of `docs/swarm/tasks/STORY-VENUES.md`.
The MISSIONS notes file has no numbered list of main.ts lines (it ends at "Not done"); items 1 to 5 above cover what its "Not done" paragraph names (scene UI, flyer F key, rack UI, set-end crowd feed).

## Bytes (single-file build, scratch copy of the 27 Nov tree; budget 12,000,000)
- Before any edit: 11,939,092. With the main.ts edit and the story OFF: 11,940,544 (+1,452). With `VITE_PEDRO=1`: 12,011,852 (over the budget by 11,852: keep the single-file build on the switch's OFF side, or gate `PEDRO_STORY_ON` on `VITE_HOSTED`, when the switch is turned on).
- Before the `?inline` change the OFF build was 11,946,831 (the CSS leaked in).

## Not done
- The brawl itself: `wire.update` calls `host.onBrawl(sceneId, who)` once; spawning the fighter and calling `wire.fighterDown()` / `playerDown()` is the host's (not wired in the lines above).
- Nothing was seen in the running game with a scene open (the boot check with the story on was clean, 0 errors; no scene was played there). Not heard, not tried on a real phone or a real pad.
- The "Intimate scenes" row exists only when the story switch is on (it is in `gameRows` behind `PEDRO_STORY_ON`).
- Only `pico-paper-the-walls` offers flyers; `PROMO_NIGHT_OF_MISSION` in wire.ts lists missions and nights.
- The rack is opened by the mission hook at objective 4 of `pico-size-medium`; there is no walk-up rack in the world.
- The CAST line-up picture (`docs/swarm/teams/sheets/cast-lineup.png`) was not re-shot for the renamed five.
