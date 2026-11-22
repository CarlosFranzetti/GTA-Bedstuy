# BODY-WARDROBE (Dara Okonkwo, WARDROBE seat, round 2 of the body team, 22 to 23 Nov 2026)

Status: in progress, kept current. Scratch and sheets: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/wardrobe/`.
Data comes from Imani Rhodes' `docs/reference/wardrobe-60.md` (parts tables, rules 2.1 to 2.9).

## What the geometry can already make (read from pedGarments / pedCuts / pedLegs / pedShoes, first fifteen minutes)
- Top kinds (`TopKind`): tee, hoodie, puffer, jersey, vest, jacket, cardigan, blouse, uniform, scrubs, dress, tracksuit, apron.
  Cut flags: `sleeves` long/short/none, `long` (coat/tunic length), `open`, `zip`, `fabric`, `style` (pocket, polo, crew, shirt, trench,
  parka, bomber, track, blazer, boiler, football, wrap, shirtdress, kaftan, overcoat, denim, sweater, workshirt), `tie`, `under`.
- Bottom kinds: jeans, trousers, shorts, skirt, leggings, sweats, cargo; `cut`: straight slim baggy crop flare pleated pencil mini maxi knee
  long short run wrap patch stripe pocket cuffed; `long`, `denim`.
- Shoes (`ShoeKind`): sneakerLow, sneakerHigh, workBoot, dressShoe, flat, sandal, runner, tallBoot, loafer, heel, slide (+ `high`, `sock`).
- Hats (`HatStyle`): none cap beanie headwrap church flat cop durag hardhat fedora hijab helmet kufi kippah snapback bucket hood hoodDown scarf.
- Gear: none backpack bag tote messenger.
- Painters already hold: belts with buckle and loops, back pockets, front pockets and fly, knee patches, cargo flaps, side stripes,
  rib at cuffs and hems, ties, plackets. See `src/textures/painters/pedPaintCloth.ts`.

## What I built
1. `src/textures/painters/pedMix.ts` (new): the PARTS tag table (formality rank F 0 to 4, decade set, accent flag), the rules engine
   (pair scores for top x bottom, layer, shoes, hat guards, decade steering by age) and the colour pass (one accent, value gap,
   neutral shoes). Hooked into `composeSpec` in `pedWardrobe.ts`; the seventeen outfit ids stay; `noOutfit` still gives the old pools.
2. New parts in the `pedWardrobe.ts` tables, each built from existing kinds and listed in `NEEDS_SHAPE` (see below).
3. `pedOutfits.ts`: 60 outfits in all.
4. Tests: `tests/unit/textures/wardrobe-mix.test.ts` (2,000 seeded people: distinct looks, shares, no forbidden combination).
5. Sheet: `scripts/wardrobe-sheet.mjs`.

## Needs from FIT (garments built today from the nearest existing kind, marked `needsShape` in the data)
Filled in below as the parts land.

## Not done / honest notes
Filled in at the end.
