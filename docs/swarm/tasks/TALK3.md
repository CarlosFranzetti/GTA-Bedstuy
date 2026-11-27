# TALK3: more skits, the owner's new targets, a host on every station

Lane TALK3 (writer and producer: Nell Barrow). Owner's ask of 26 to 27 Nov (MEMORY.md, top of "What the owner wants").
Status: IN PROGRESS. Nothing here has been HEARD by anyone.

## Plan (written first, kept current)
- Group Chat 99.9 (TalkPlayer, flat JSON script, hosted builds only): the old 400-line script is cut into its own bits by id
  tag; new bits in `src/audio/talk/script-groupchat-bits.json` (loaded on demand like the old script); a shuffle-bag
  rotation (`src/audio/talk/rotation.ts`) builds one pass of every bit once, station idents between bits, and reshuffles
  at the end of each pass. Tune-in mid-way: the existing `midShow` lands on a random line, i.e. inside a bit.
- WBSY Talk (TalkStation and TalkSchedule, cast-based shows): new shows, ads and cast in
  `src/audio/voice/shows/extra-shows.json`, loaded on demand on hosted builds and added to the schedule's shuffle bag
  (`TalkSchedule.addShows`). First tune-in starts part-way into a show.
- Hosts for the live stations (none had one): `src/audio/announcer/liveHosts.ts` (personas, idents, links) and a small
  `LiveHost` speaker; tune-in plus a timer of at least ten minutes.
- Tests: `tests/unit/audio/talk3-content.test.ts`.

## Decisions
(filled in as they are made)
