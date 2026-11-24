# STORY-VENUES (seat VENUES, 24 Nov 2026)

Status: in progress. Owner: Marta Quill (VENUES seat). Files: `src/world/venues/**`, `tests/unit/world/venues/**`.

## What exists

- `src/world/venues/venues.ts`: ONE table of seven places (working names, rename there only): `bar-dive` Lucky Nickel,
  `bar-lounge` The Velvet Pigeon, `bar-sports` Dugout 49, `afterhours` Sunrise Annex, `club` Neon Paloma, `dispensary`
  Fernwell, `gym` Iron Stoop Gym. API: `venueById`, `venueDoor(map, id)`, `venuePosition(map, id)`, `isOpen(id, hour, flag?)`,
  `hoursText`, `venuePlaces(map, seen)` (map markers), `venueNear` (discovery), `VENUE_ROOM` (room size and parking spot).
- Positions are frozen numbers (grid: the seeded lot's building line; real: `doorOfLot` of a named tax lot). Tests recompute
  them from the grid and the real map data and fail if a lot moved.
- The existing hidden club AFTERSLOTH (`interiors/defs.ts`, `club`) is untouched and still the story's secret door.

## Design

- Venues join the existing interior system (same fade, same F prompt, same `interiors.inside`), so main.ts needs no new
  state. Hooks are additive and listed in the report. Rooms are built on first entry (not at boot).
- Exteriors are small groups at the door (door leaf, frame, awning or gate or rope, a lit sign board, a blade sign), 2 to 4
  draw calls each, built at boot like the HOME door. No new materials except one sign material per venue.

(Filled in as work lands: see the end of this file for costs, lines for main.ts, pictures, what is not done.)
