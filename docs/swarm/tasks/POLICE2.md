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

- Heat 0..100. Fades 1.3 per second (a full bar in about 77 s). Minor acts add heat; a warning at 45; a star at 100 (heat then drops
  to 40) or when a minor act is seen within 15 s of a warning. Serious crimes (gunshot, hit a pedestrian with a car, hit an officer,
  carjack) give a star at once when SEEN. Unseen: a quarter of the heat, never a star.
- Ladder stays at three stars (five is not cheap: the cop dispatch, PIT and the HUD are all built for three).
- Holding cell inside the precinct: NOT built (interiors need a room definition, door trigger and a fade path of their own).
- Roadblocks: the code has none; not added.

## Log

- 22 Nov: read WantedSystem, CopSystem, Cop, Combat, interiors, saves, landmarks. The station house is the landmark
  "Ironside Station House" (id `ironside-station-house`, site ax 1733.4 az -625.3). The grid map has no police building.
