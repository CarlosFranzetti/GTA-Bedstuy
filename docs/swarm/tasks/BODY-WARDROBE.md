# BODY-WARDROBE (WARDROBE seat, rounds 2 and 3; rebuilt 23 Nov 2026 by Jonah Reyes after a restart lost Dara Okonkwo's first build)

Status: built, tested, sheets rendered. Scratch: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/wardrobe/`. Final sheets: `docs/swarm/teams/sheets/wardrobe-*.png`.
Data: `docs/reference/wardrobe-60.md` (parts, mix rules 2.1 to 2.9, sixty looks, details).

## Files
- `src/textures/painters/pedMix.ts` (new): TAGS (formality rank 0 to 4, decades per part), decade steering by age, pair scores (topBottom F1 + table 2.2, layerScore F3, shoeScore F2 + 2.3), hat guards (hatScore) and hair that fits each hat (HAT_HAIR), colour helpers (lstar, isAccent, colourFamily), the colour pass, NEEDS_SHAPE, hat and bag colourway data.
- `pedWardrobe.ts`: tables grown to 26 tops, 28 layers, 31 bottoms, 18 shoes, 6 one-pieces; composeSpec uses the mix scores, outfits with per-way alternatives and one-pieces, colour pass on the random mix. Spec id now carries the shoe id (`g-<grp>-<sex><age>-top+layer|_+bottom+shoe-hash`).
- `pedOutfits.ts`: 61 looks in a compact text form (17 old ids kept, 43 from wardrobe-60 Part 3, one extra school look), 2 to 3 colourways each.
- `ped.ts` (additive, optional): `top.fit`, `top.neck`, `bottom.fit` (already there), `shoes.chunky`.
- Painter: belts take the shoe colour for leather shoes; jeans get a stitched back yoke.
- Tests: `tests/unit/textures/wardrobe-mix.test.ts`. Sheet: `scripts/wardrobe-sheet.html` + `.mjs`.

## Rules in one place
F1 top and bottom within one rank (shirt, sweater, blouse, polo with jeans excepted; tee or hoodie with chinos for the non-old); F2 shoes within one rank of the bottom (clean sneakers with chinos, a suit or a skirt allowed for non-elders); F3 layer within one rank of the top, no blazer, coat over a jersey, tank or hoodie, no open shoes under a heavy coat, no heels with sweats or shorts. Hats: church hat only church, smart or elder looks and not on men; hard hat only at work; no cap, snapback or bucket with a formal coat; no beanie in warm weather (also in whole outfits). Colour pass on the random mix: one accent colour, L* gap 18 top to bottom (8 tonal), 12 layer to top, leather shoes echo the bag one time in four.

## For FIT (geometry needed; today drawn from the nearest kind, flagged in the spec)
See `NEEDS_SHAPE` in pedMix.ts: tallTee (oversized), ribTank (skin fit, scoop), turtleneck (roll neck), henley (placket), bandShirt (band collar), dashiki (wide sleeve, wide V), cropJacket (waist hem), jeansWide and trousersWide (bottom.fit wide), chunkySneaker (shoes.chunky), chefJacket (double breast), barberSmock; HEAD: bonnet, strawHat, headphones; GEAR: sling, duffel, groceryBag, deliveryBag.

## Honest notes
Pale chest bib and a high stand-up collar: see the final report for which looks showed it; layers drawn `open` over a pale tee (denimJacket, bomber, cropJacket, cardiganOpen) are the suspects; the opening width is geometry (FIT).
