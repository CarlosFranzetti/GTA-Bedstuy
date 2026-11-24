# STORY-CAST (Dana Okonjo), started 24 Nov 2026

Status: in progress. Updated as work lands.

## Plan
1. `src/game/story/cast/types.ts`, `cast.ts` (ten named people as data), `specs.ts` (PedSpec builder: fixed identity, three outfits).
2. `player.ts`: Pedro as the player on a new game; old saves keep the look they had.
3. `placement.ts`: story people placed in the world (never duplicated by the crowd or run over).
4. `switch.ts`: playable registry and a character switch with a save field.
5. Line-up picture `docs/swarm/teams/sheets/cast-lineup.png`.

## Hooks into other people's files (all additive)
- `PedSpec.seed?` (ped.ts): identity seed; faceTraits, bodyBuildOf, eyes and hair pieces read `spec.seed ?? spec.id`.
- `PlayerLook.cast?`, `.outfit?` and a player spec override in `pedRoster.ts`.

## Placeholders
Venue ids are MISSIONS' placeholder strings. Backgrounds and ages of the five fixed names are my guesses until BIBLE.md lands.
