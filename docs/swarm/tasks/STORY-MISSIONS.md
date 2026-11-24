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
