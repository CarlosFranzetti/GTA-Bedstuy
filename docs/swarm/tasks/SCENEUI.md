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
