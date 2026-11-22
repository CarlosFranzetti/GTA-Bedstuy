# POLICE2 task record (heat, arrest, busted, the jail)

Status: in progress (22 Nov 2026). Gameplay programmer: Wren Aldous (POLICE2). Not committed by this lane.

Owner's ask (22 Nov): "the police don't actually grab you. Where's the jail? It should take a few more actions before they
start chasing and eventually arrest you."

## Plan

New code lives in `src/game/police/` (heat.ts, precincts.ts, bust.ts, PoliceSystem.ts) and `src/entities/Officer.ts` (a policeman
on foot). Small edits: Events.ts (two minor crime kinds), WantedSystem.ts (opt-in "police drives the stars" mode), CopSystem.ts and
Cop.ts (opt-in gentle one-star cars, accessors), anim/controller.ts (two hand-keyed poses: `grab`, `held`), Hud.ts + hud.css
(heat bar under the stars, state line), GameSave.ts (bust count), `src/ui/BustCard.ts` (the card). Everything is opt-in, so the old
pursuit and traffic sims, which build WantedSystem and CopSystem without a PoliceSystem, behave exactly as before.

## Decisions

- Heat 0..100. Fades 1.3 per second (a full bar in about 77 s). Minor acts add heat; a warning at 40; a star at 100 (heat then drops
  to 40) or when a minor act is seen within 15 s of a warning. Serious crimes (gunshot, hit a pedestrian with a car, hit an officer,
  carjack) give a star at once when SEEN. Unseen: a quarter of the heat, never a star.
- Ladder stays at three stars (five is not cheap: the cop dispatch, PIT and the HUD are all built for three).
- Holding cell inside the precinct: NOT built (interiors need a room definition, door trigger and a fade path of their own).
- Roadblocks: the code has none; not added.

## The ladder (what is built)

| | |
|---|---|
| Minor, seen (heat only) | landed punch 30, put down in view +20, bump or fender-bender 22, ramming a parked car 22, driving on the pavement 25, thrown bottle or brick 50. Red light in front of a cop: type `redLight` is reserved, detection NOT built |
| Heat | 0..100, fades 1.3 per second. Warning at 40: "Police are watching", an officer or patrol car barks and chirps. A star at 100, or when a minor act is seen within 15 s of the warning. Minor acts alone stop at 2 stars |
| Serious, seen | gunshot (also when only heard within 70 m): 1 star (cap 2). Car hits a pedestrian: 1 star (cap 2). Hits an officer: 1 star (cap 3). Carjack: 1 star (cap 2). Each kind gives a star at most once per 4 s |
| Unseen | a quarter of the heat, never a star. Seen = a pedestrian (26 m day, 16 m night) or an officer or patrol car (55 m day, 32 m night) with a clear static line to the crime |
| Self defence | `police.noteAttacked()`: for 8 s punches count as unseen (heat only) |
| Grace | `police.setGrace(s)`: minor acts add no heat; serious still count. main.ts sets 120 s on a new game |
| Star 1 | one patrol car follows at a 9 m gap and does not ram (`CopSystem.gentleAtOneStar`); an officer gets out within 12 m and walks up (2 m/s) |
| Star 2 | two cars chase and ram as before, officers run (4.4 m/s), up to 3 on foot |
| Star 3 | three cars, PIT as before, up to 4 officers. No roadblocks (the code has none). Ladder stays at 3 stars |
| Losing them | out of every officer's sight 5 s: "Searching", officers walk to the last seen spot. Stars are held while seen and cool 20 s per star once unseen. Getting into another car after 2 s unseen takes one star |

## Arrest

An officer within 1.2 m (clear line, no wall) of a player on foot slower than 3.2 m/s starts a hold: 1.5 s, the player cannot move, hand-keyed
`held` pose (arms behind) for the player and `grab` pose for the officer (both in `src/entities/anim/controller.ts`, no new animation system).
Sprinting (intent above 3.5 m/s) or a hit on the officer breaks free ONCE per chase: +1 star "Resisting arrest", the officer is shoved and cannot
grab for 3 s, the fine gets a surcharge. A stopped car (2 s) with an officer within 3.6 m at 1 star or more: the player is put out of the car and held.
Nothing is arrested inside a room, during a mission beat, with the menu open or paused. Cops never fire in this game, so an unarmed player is never shot.

## Busted and the jail

- Card: `src/ui/BustCard.ts` ("BUSTED" in Anton on a dimmed street, black, then "RELEASED" and one line: fine and the precinct), fade-out.
- Cost: fine 30 / 50 / 120 / 250 by stars at the moment (0 to 3) plus 25 for resisting, never more than the cash in hand. Weapons gone (hands reset). 3 + stars
  hours pass. Stars cleared, heat cleared, officers removed, bust count +1 (saved as `busts`, old saves load with 0). The car stays where it was.
- Real map: "Ironside Station House" (landmark `ironside-station-house`, already a venue blip on the map). Released 2.2 m out from the middle of the frontage,
  snapped to the nearest sidewalk node. Grid map: "Cardinal Row Precinct": a marked door on the south face of block r1c1 at (60, -8.4), a map blip
  (`precinctPlace`); there is NO building (the grid has no police lot): the door is a map pin only.
- Holding cell: NOT built. The interiors need their own room definition, door trigger, fade path and save handling; not cheap.

## Entry points for COMBAT2 and others

- `police.reportCrime(type, pos, seen?)`: report any crime. `seen` omitted: decided from witnesses. The `crime` event on the bus does the same.
- `police.isBeingArrested()`: held by an officer or the bust is playing. `police.state` is 'calm' | 'watching' | 'wanted' | 'searching' | 'arrest' | 'busted'.
- `police.noteAttacked()`: the player was hit first. `police.setGrace(s)`. `police.officers`: foot officers; `Officer.hitBy(from, force)` has Pedestrian's
  signature (staggers, reports `hitCop`, breaks a hold), so Combat can hit them if `deps.peds()` also lists `police.officers`.
- Combat's `pedHit` event (by 'fist') is turned into a `punch` crime by PoliceSystem; nothing in Combat.ts changed.

## Log

- 22 Nov: read WantedSystem, CopSystem, Cop, Combat, interiors, saves, landmarks. The station house is the landmark "Ironside Station House".
- 22 Nov: built heat.ts, precincts.ts, bust.ts, PoliceSystem.ts, Officer.ts, BustCard, HUD heat bar, saves. Tests: tests/unit/game/police-heat.test.ts (8),
  police-system.test.ts (23), tests/unit/sim/police-scenario.test.ts (4: grid and real net, stand and run). Found while testing: `World2D` does not integrate
  'ped' bodies (Pedestrian moves itself), so Officer moves its own body.
- 22 Nov, in the running game (hosted build of the lane's own main.ts copy, grid map, `?q=low`, 640 x 360, software rendering; frames in
  scratchpad/police2/frames): three punches near a pedestrian: heat 29.8, 59.6 ("watching"), then star 1. HUD shows the heat bar and "Police are watching"
  (the line first wrapped over the phone icon: fixed in hud.css, not re-shot). A patrol car is dispatched at about 120 m. In two runs it was still 120 to 190 m
  away after 30 s of sim time and the star cooled (seen before the run, not diagnosed: the old dispatch on a traffic-filled grid); in the shot run the car was
  moved to 15 m by the script, the officer walked up (about 10 s), grabbed (frame 03: navy uniform and cap, reaching pose), held 1.5 s, BUSTED card (05), "RELEASED,
  Fined $50, Released at Cardinal Row Precinct, 7:12pm" (06), player standing at (60, -6.2) facing the street at 19:12 (it was 15:00: 4 h custody + 12 min of play),
  stars 0, cash 120 -> 70, 1 bust, 0 officers (07). Draws 220 and 526k triangles at the grid start with one officer out (budget for low: 220 and 500k; the grid start
  was already over: 230 draws and 542k before). Not run in the game: the real-street map, a phone-sized page, sound, a car arrest, break-free.
- Open: the real-map door spot is snapped by `nearestSidewalkNode` of `rt.grid` (main.ts line in the diff): not looked at in the game. Combat cannot hit an officer until
  `deps.peds()` includes `police.officers`. Red-light detection not built. No holding cell.
