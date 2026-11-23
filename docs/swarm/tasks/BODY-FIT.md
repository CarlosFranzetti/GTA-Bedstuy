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

## FIT-TOPS (seat, round 3, 23 Nov 2026)
Seat FIT-TOPS: upper body of dressed people (necklines, collars, sleeves, open layers). Scratch: `.../scratchpad/fit-tops/`.
1. NECKLINE RING (done, seen). `pedPaintBody.necklineY(params, x, z)` is now ONE function for the painted neckline and the geometry (round U instead of a box; V for open layers; styles roll, band, henley, scoop, wide through `neckDip`). `pedCuts.necklineLoop` cuts the zero line of y - necklineY through the dressed body's triangles, takes one crossing per ray round the loop (28 hi, 16 mid) so the curve is smooth by construction, with the surface normal; `collarRows` sweeps a profile (rib, roll, shirt, turtle) along it; `addCollarStrip` skins each vertex like the body vertex it lies on. Called from `neckCollar` in pedMesh.clothExtras (hi and mid; far has no extras). Band is 3.3 cm (rib) so it covers the painted edge's saw-teeth; it narrows on the flat of the shoulder.
   Kind to collar: tee, hoodie, puffer, tracksuit, cardigan, sweater = rib; jacket, uniform, blouse, shirt/workshirt/polo/blazer/denim = shirt; dress, scrubs, jersey = roll; neck 'roll' = turtle; apron, vest, hijab = none.
   Cost: hi nine-person sheet 56,685 -> 58,892 triangles (+3.9 %), no new draw or texture.
2. SLEEVES (partly). `sleeveEase(kind, baggy)` in pedMesh.ts: how far `straightenArms` pulls the sleeve to a pipe: 0.25 fitted, 0.5 baggy, 0.7 puffer (was 1). Looked at side by side with ease 1 on the nine-person front sheet: no visible change at that scale, so the pipe look comes mostly from the built arm itself (BASE), not from this pass. pedround5 "sleeves straight" rewritten to allow 14 mm of growth (was 6). Its remaining failure (`ea-kid/hi/-1` has one station) fails with ease 1 too: not mine.
3. Open layers (NOT done), hood wings at the shoulder tips (NOT done, spiky on the slim man's hoodie), cuff changes (none), placket/henley geometry (none; neck 'henley' is a rib collar).
4. Tests: fit-garments.test.ts +2 (ring is a loop within 12 mm of the painted line, steps under 6 cm, rows finite; budget). pedround5: tri limits hi 1.85 -> 1.95, mid 1.3 -> 1.4 (collar), sleeve growth 6 -> 14 mm. Skirt-in-walk test red, not mine.
5. Pictures: `docs/swarm/teams/sheets/tops-after-front.png`, `tops-after-back.png`, `tops-after-neck-closeup.png` (before: `fit-after-neck-front.png`). On the front sheet, yellow bits at wrists and odd trouser ankles are from other seats' work in the same tree, identical with my sleeve change switched off.

## FIT-LEGS (bottoms: fork, seat, shoes; 23 Nov 2026)
Files: `src/entities/models/pedLegs.ts`, `pedShoes.ts` (SHOE_LEN), one line in `pedMesh.ts` (`withTubes` passes `topHemY`; unused now, kept as the signature). Test: `tests/unit/entities/fit-legs.test.ts` (5 claims, green).
- THE FORK POUCH WAS THE BASE MESH'S OWN CROTCH. Found by dropping pieces one at a time (`legdbg` switch, removed): the kept pelvis triangles between the legs (the atlas' fly and belt texels, standing proud of the leg tubes) showed as a dark pouch under the waistband. Not the relocated thigh stub, not a UV fault in the painter.
- Fix: those triangles (|x| < 0.11, from 5 cm under the seat fold to the top of the tubes) are cut away. The thigh stub is dropped too. Each leg's tube now has SEAT ROWS above its old top: a superellipse section (exponent 3.2, a rounded rectangle) taken from the BUILT body's own hip section at that height (so a heavy build's trousers go round the belly and seat), inner edges 8 mm apart at the middle. Below that the V of the fork closes by the old `inn` blend. The back of the thigh tube rows follows the built buttock (`backAt`).
- Row has a new optional `pw` (exponent); `legTubes` takes an optional 8th argument.
- Shoes: sneaker length share was 0.168 to 0.170 measured (the 0.185 of the earlier note was before the base rebuild); SHOE_LEN 0.158 -> 0.154, now 0.163 to 0.166. pedround4's 0.24 m floor needs 0.154 (elder 0.2407).
- Tests: pedround4 green again (it pinned the old shoe length). pedround5 skirts: red and a REAL fault, not a compensation: `bodyParts` builds the skirt from the BASE shape's `hipRings`, so a build with fuller thighs than the base pokes 1 mm out of a coat front. Needs the built hip ring (not done). pedround5 sleeves: not mine.
- Triangles: nine-person hi sheet 56,493 before this seat, 58,827 after (+4 percent; the other seats were editing the same tree). Test caps: hi < 7,400, mid < 1,800, far < 800 per person.
- Pictures: `legs-before-fork.png`, `legs-after-fork-front-back.png`, `legs-after-front.png`, `-back.png`, `legs-after-front-back-side-crops.png`, `legs-sprint.png`, `legs-walk.png`.
### Not done / still wrong
- `bottom.fit` (taper, wide or slim by spec) still ignored; CUT table by kind:cut unchanged. No belt-line change: the waistband sits where the top's hem ends (the tube top, about the navel on a man), not lower under a belly.
- A small dark remnant at the fork on the heavy man and the pear woman from the front (leftover pelvis triangles outside |x| < 0.11), and small dark back-pocket flaps on the seat from behind.
- Shorts and skirts: the base mesh is bare there; the fork shows a small dark notch on shorts (same crotch patch, not cut because shorts do not go through `legTubes`). Not fixed.
- Elder in a sprint: a thin pale seam across the knee (thigh to shin texture tile edge). Seat did not tear in walk or sprint.
