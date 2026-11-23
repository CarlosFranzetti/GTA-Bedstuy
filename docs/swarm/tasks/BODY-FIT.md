# BODY-FIT (FIT seat, round 3)

Seat FIT. Started 23 Nov 2026. Charter: `docs/swarm/teams/BODY-TEAM.md`, "Round 3". Scratch: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/fit/`.
Tools: `scripts/dev/fit-shoot.sh <out> <tag> [lod] [extra query] [people] [views]` (dressed sheets; `&zoom=x,y,h` for close-ups).

## Findings (verified on the dressed sheets)
1. THE NECK LINE WAS ABSOLUTE. `pedPaintBody.ts` put the neckline of every top at y = 1.498 m (1.512 for hoodies, jackets, puffers, tracksuits) for every body. Chin heights run 1.26 (teen) to 1.57 (man): women, elders and children got cloth up to the chin ("bib"), tall men a collar mid-neck. Now measured from the person's own shoulder joint and head size (`K.shY + 0.065 * K.hs`). This is the painter's file (not on my list); the edit is five lines.
2. THE FLAT PALE FLAP ON THE CHEST was `hoodDown` (pedHeadwear.ts, built with `drape` from the chin down to 6 cm under the shoulder: a funnel bridging the collarbone hollow). Now a cowl 5 to 6 cm tall lying on the shoulders (`yBot` shoulder + 4 cm, top chin - 3 cm).
3. The garment ease offset (pedMesh dress block) is smooth at the shoulder (probe: 15 mm at the shoulder top falling to 0 over 8 cm); no tear there.

## Status (FIT stopped early on budget; honest list)
| Step | State |
|---|---|
| 1 neckline absolute -> relative (`neckBaseY` in pedPaintBody.ts) | DONE, seen on nine people; the painted edge is still stair-stepped at texel size |
| 1 hood flap (hoodDown) | DONE (cowl 5 to 6 cm; wings of the cowl at the shoulder tips still ragged) |
| 2 neck styles (crew, V, band, roll, henley, scoop), collar geometry | NOT DONE (spec fields `top.neck`, `top.fit` still ignored) |
| 3 layers: open front width, jacket seams | NOT DONE |
| 4 bottoms: seat, fork notch | NOT DONE. A dark red pouch shows at the front fork of trousers on the elder (see fit-after-neck-front.png, 7th person). Not the relocated-stub UV (tried: no change). Next lead: print kept triangles at the fork with |x| < 0.04 and look at their atlas texel |
| 5 shoes | measured only: sneakerLow is 0.158 to 0.185 of stature on slim, average, heavy, woman, elder, teen, child (test); nothing changed |
| 6 NEEDS_SHAPE | none built |

## Numbers
Dressed hi triangles of the nine-person sheet: 56,503 before, 56,685 after (+0.3 %, the new cowl). No new draws or textures.
Existing tests: pedpieces (athletic, broad: fail with and without my change), pedround4 (leg taper), pedround5 (sleeves, skirts in walk): red in the run after the base rebuild; I did not touch legs, sleeves or skirts, not bisected. Tests: `tests/unit/entities/fit-garments.test.ts` (3: neck base between shoulder joint and chin on all 21 shapes and it moves with the person; hood cowl stays between shoulder joint and chin, under 400 tris, on seven builds; shoe length share and sole on the ground on seven builds). No existing test was changed.

## Sheets
`docs/swarm/teams/sheets/fit-hood-flap-before.png`, `fit-hood-cowl-after.png`, `fit-after-neck-front.png`, `fit-after-hood-side.png`.
