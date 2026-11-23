# BODY-FIT (FIT seat, round 3)

Seat FIT. Started 23 Nov 2026. Charter: `docs/swarm/teams/BODY-TEAM.md`, "Round 3". Scratch: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/fit/`.
Tools: `scripts/dev/fit-shoot.sh <out> <tag> [lod] [extra query] [people] [views]` (dressed sheets; `&zoom=x,y,h` for close-ups).

## Findings (verified on the dressed sheets)
1. THE NECK LINE WAS ABSOLUTE. `pedPaintBody.ts` put the neckline of every top at y = 1.498 m (1.512 for hoodies, jackets, puffers, tracksuits) for every body. Chin heights run 1.26 (teen) to 1.57 (man): women, elders and children got cloth up to the chin ("bib"), tall men a collar mid-neck. Now measured from the person's own shoulder joint and head size (`K.shY + 0.065 * K.hs`). This is the painter's file (not on my list); the edit is five lines.
2. THE FLAT PALE FLAP ON THE CHEST was `hoodDown` (pedHeadwear.ts, built with `drape` from the chin down to 6 cm under the shoulder: a funnel bridging the collarbone hollow). Now a cowl 5 to 6 cm tall lying on the shoulders (`yBot` shoulder + 4 cm, top chin - 3 cm).
3. The garment ease offset (pedMesh dress block) is smooth at the shoulder (probe: 15 mm at the shoulder top falling to 0 over 8 cm); no tear there.

## Status
| Step | State |
|---|---|
| 1 neckline absolute -> relative | DONE (needs the other necklines of item 2) |
| hood flap | DONE |
| 2 tops: neck styles, collars, sleeves | in progress |
| 3 layers | not started |
| 4 bottoms (seat, fork) | not started |
| 5 shoes | not started |
| 6 NEEDS_SHAPE | not started |
