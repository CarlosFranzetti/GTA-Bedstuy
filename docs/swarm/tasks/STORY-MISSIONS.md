# STORY-MISSIONS (Dario Quintero, MISSIONS seat, 24 Nov 2026)

Status: started. Notes kept current; see the end for what is done.

Goal: the first act of the Pedro Martinez story playable on the existing mission system.

## Design
- Small systems are plain pure modules in `src/game/story/` (no three.js, no DOM), each with `serialize()` / `restore()`:
  `gigs.ts` (bookings, crowd meter, fee), `promo.ts` (flyers, posters, guest list, turnout), `thrift.ts` (rack, bag, markets, haggle),
  `pack.ts` (selling: abstract), `dates.ts` (liking meter, fade to morning), `fights.ts` (two encounters with a talk-down path).
- `nightlife.ts` holds them all for the host and rides the existing save: `StoryState` got an optional `ext` block (save v2; v1 saves load).
- `venueTable.ts`: PLACEHOLDER venue ids and stand-in POIs until VENUES lands; `setVenueResolver()` swaps it.
- Missions are ordinary `MissionDef` content in `src/game/missions/content/pedro/`; the systems are driven by mission events
  through `story/StoryBridge.ts`, so no new objective kinds and no edits to MissionSystem.

## Done / not done
(updated below)

## State, 27 Nov (after the limit reset)

Done and tested (`tests/unit/game/story/systems.test.ts` 25 tests, `act1.test.ts` 12):
gigs (bookings, crowd meter, fee by score, crowd and turnout, rebook and ban), promotion (flyers by temperament, never minors, posters,
guest list, turnout and door money), thrift and flip (seeded rack, bag of four, five markets, haggle), selling (abstract pack, witness heat
callback, bust loses the pack, minors refused), dates (liking meter, ending, intimate cut-away or plain fade by setting), fights (Clem and Kyle
scripts with talk-down), reply-picker scenes (`scenes.ts`: ChoiceScene, FightScene, DateScene, HaggleScene), `StoryBridge`, `Nightlife`
(rides `StoryState.ext`, save v2, v1 loads). New objective kind `scene` (types.ts, MissionSystem.ts: `sceneRequest`, signal `scene:done`).
Act 1: eight missions in `src/game/missions/content/pedro/act1.ts`, hooks in `hooks.ts`. SWITCH: `PEDRO_STORY_ON` (index.ts) is false by default;
`VITE_PEDRO=1` turns it on for tests. With it on: story, story_director, story_lint and roadnet-game tests are green (206 pass).

Not done / placeholder: no scene UI (the host draws `bridge.scene.frame()` and sends keys); the flyer F key, rack UI and set-end crowd feed are
not wired; records for the rent mission use wax-03 and wax-04 (the writer's parody records do not exist); Act 1 missions 6 to 8 follow ARC.md rows,
not pages (no ACT1-06..08 pages existed); Wexcombe, Second Act Thrift, the sound yard and Clem's wall are stand-in positions; the crowd-meter
floor and "do not peak" rule of the DJ sets are not enforced (only DjGame's score); Clem's talk-down is one list of replies, not six rounds.
Giver rings are nudged clear of existing ones at build time (`picoAct1(ctx, others)`).
