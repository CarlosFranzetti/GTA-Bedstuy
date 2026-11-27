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

## Names and ids (BIBLE.md section 5, 27 Nov)

`bar-dive` Glenda's Long Room (14-02), `bar-lounge` Tincture & Ledger (17-02), `bar-dance` Sabor a Lunes (18-03; was
`bar-sports`), `afterhours` The Milk Run (04-11), `club` Mothhouse (22-04; the BIBLE says Thu to Sat: not enforced, hours
only), `dispensary` Mellowdrama (10-22), `gym` Second Wind Boxing Club (06-22). Names live only in `venues.ts`.
Interior ids are `venue:<id>`. Spots (event `venue:spot` {id, spot}): bars `bar`, `bartender`, `table`, `backroom`,
`bar-dive`: `booth-back`, `jukebox`; `bar-lounge`/`bar-dance`: `booth` (DJ, needs flag `venue.<id>.booth`); `bar-dance`:
`floor`; `afterhours`: `bar`, `floor`, `booth`, `couch`, `backroom`; `club`: `booth`, `bar`, `floor`, `vip`, `backroom`,
`door`, `sidedoor`; `dispensary`: `counter`, `menu`, `bench`, `backroom`; `gym`: `desk`, `bench`, `treadmill`, `bags`, `ring`, `lockers`.

## Switch

`VENUES_ON` in `src/world/interiors/defs.ts` is now `import.meta.env.VITE_VENUES === '1'` (default OFF, committed off).
Run with `VITE_VENUES=1 npx vitest run ...` to test it on. Off: no venue ids in the door list, nothing built, no door moves.
Real doors are frozen per venue (tax lot `bbl`, tests recompute them from the core lots and net); `applyRealDoors` skips
venue ids and calls `applyVenueDoorsFor('real')`. NightBounce skips venue doors. roadnet-places tests skip venue ids.

## Costs (measured in a headless page, software render)

Exterior: 3 draws and 102 to 138 triangles per venue (the after-hours: 4 draws, 210 with its gate), 7 sign materials,
no other new material. Rooms (static pieces only): bar 540, club 582 (+ 25 floor tiles and beams), after-hours 276,
dispensary 192, gym 552 triangles; 11 draws each (club 36); people extra (3 to 13 per room). Rooms are built on first entry.
Bytes in the single-file build: not measured (code is about 35 kB of source, a guess of 15 to 20 kB minified; the room
builders only load code, no data).

## Pictures

`docs/swarm/teams/sheets/venue-ext-*.png` (night fronts; after-hours open and shut), `venue-room-*.png` (bar-dive, club,
afterhours, dispensary, gym). Tool: `scripts/dev/venues-sheet.mjs` (+ .html), run with SWARM_SMALL=1. Frames were taken
before the rename to the BIBLE names, so signs in them show the old working names.

## Not done

Interiors for `bar-lounge`, `bar-dance` reuse the bar builder with other colours and one prop (not a vault door or
mirror ball); the club has no mezzanine or coat check; no per-venue ambient music (ambient.ts has no entry); the
`afterhours` DJ and `club` booth use DJ venue 'aftersloth' for the crowd; map markers and discovery need the main.ts lines below.
Real map coordinates were checked on the core lots only (the outer-ring tiles are not used by any venue).

## main.ts lines (lead)

Doors, exteriors, prompts, hours and spots need NO main.ts change (the Interiors class does it). For markers and discovery:
```ts
import { venuePlaces, venueNear, venueById, seenFlag, type VenueId } from '@/world/venues/venues';
import { VENUES_ON } from '@/world/interiors/defs';
const venueMap = realWorld ? 'real' : 'grid';
const venueSeen = (id: VenueId): boolean => inventory.hasFlag(seenFlag(id));
// after `const map = new MapScreen(...)`, keep the base list in a const `basePlaces` and add:
const refreshVenuePlaces = (): void => { if (VENUES_ON) map.setPlaces([...basePlaces, ...venuePlaces(venueMap, venueSeen)]); };
// in the frame loop, outside a room, about once a second (player position `pos`):
if (VENUES_ON && !interiors.inside) { const nv = venueNear(venueMap, pos.x, pos.z, venueSeen); if (nv) { inventory.setFlag(seenFlag(nv)); hud.showToast(`${venueById(nv).name}: ${venueById(nv).blurb}`); refreshVenuePlaces(); } }
```
Also call `refreshVenuePlaces()` once after loading a save.
