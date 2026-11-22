# BODY-CLOTHES (Nadia Pell, CLOTHES seat of the body team, 22 Nov 2026 evening)

Status: in progress. Kept current as I go. Scratch and sheets: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/clothes/`.

## How clothes are made today (read from the code, 22 Nov)
- Torso and sleeves are the BODY mesh itself, offset along the normals by `THICK_SKIN[kind]` (`pedMesh.dressLodBody`, BODY's file), painted into the skin atlas (`pedPaintCloth.ts`). They are not separate shells.
- Trousers are lofted tubes that replace the leg triangles (`pedLegs.legTubes`). Hems of tops and sleeve cuffs are polar strips built by `pedCuts.hemRows`/`cuffRows`, placed by `pedMesh.clothExtras`.
- Separate pieces fitted to the dressed skin: hair, hats (`pedHeadwear`), accessories (`pedGear`), shoes (`pedShoes`) through `pedPiecesKit`.

## Findings
1. THE DARK PATCHES ARE NaN IN THE TEXTURE BAKE, not geometry. `pedMesh.skinMaterial` builds the bake positions as `L.position.map((v, i) => v - L.faceDelta[i])`; the leg tubes are appended after the face delta (pedLegs.legTubes), so each tube vertex gets `v - undefined = NaN` (217 vertices on wh-office; 535 to 820 values on the others). In `pedSkinPaint.rasterise` a NaN corner makes `zz > depthMap` false, so it wins every texel it covers and `shade` returns NaN, which the canvas stores as black: jagged black wedges at the top of the thigh tile, drawn under every hem and at the seat. REVIEW's "inverted triangles" were these. Fix (one line, BODY's file, NOT applied by me: the edit was refused): `p0 = L.faceDelta ? L.position.map((v, i) => (i < L.faceDelta!.length ? v - L.faceDelta![i] : v)) : L.position` (pedEyes.ts line 33 already guards the same way). Test: `tests/unit/entities/clothes-defects.test.ts`, "the bake input has no NaN" (mocks `bakeSkin` and builds seven people): red now, green after the line. Geometry check on the merged person: about 20 body triangles per person are inside out in bind pose (cuff undersides and a few at the hip); the other 40 or so are hair and hat pieces (not mine).
2. The 2 mm shoe-hem check: shoes were a fixed 25 cm in front of the ankle with the scale floored at 0.85, so a man's shoe was 31 to 35 cm and a child's a clown's. Now `SHOE_LEN = 0.158` of the person's stature (foot 0.154, ANSUR II), widths and heights scaled 0.8 to 1.15 and 0.92 to 1.15, heel no wider than 1.25 x the shoe's own heel width, and the instep reaches 9 cm forward of the hem's front edge whenever the leg is trousered. pedround5 shoe check and pedround4 "chunky" (now measures the foot width below 9 cm, a boot's calf shaft is not the foot) pass at hi and mid.
3. Hem band gets +1 mm margin (pedCuts.hemRows) so its polygon clears the body's own vertices while BODY reshapes the surface.

## Fit rules (what the garments do)
- The torso and sleeves are the body mesh offset along its normals: thickness is ease at the body's OWN surface (pedFit.ts): tee 5 mm (about 3 cm of chest ease), shirt and blouse 5, jacket 14 (9 cm), hoodie 17 (11 cm), puffer 30 (19 cm), cardigan 13, track jacket 10; sleeves 0.85 of the torso value. Trousers: jeans 8, trousers 9, cargo 16, sweats 14, leggings 2 mm. Bodies that get wider carry more cloth through the same table: nothing is a constant size.
- `clothThickAt(spec, 'chest' | 'armpit' | 'upperArm' | 'forearm' | 'hem' | 'thigh')` in `src/entities/models/pedFit.ts` is the number POSE asked for (armpit = torso cloth plus sleeve; POSE may use 0.7 of it).
- Shoes: length 0.158 of stature, instep under the hem, sole 6 to 22 mm by style.
- NOT done: moving the dress block of dressLodBody into pedDress.ts (BODY agreed; BODY kept changing the same block, so I did not take it); tuning ease for the wider bodies (the lead said wait for BODY's post); collars, plackets, drape folds, ribbing as new geometry; cloth painter work (weave, wear: the painters already hold denim twill, fades, knit and nylon sheen; I added nothing there).

## Looks (src/textures/painters/pedOutfits.ts, hooked into pedWardrobe.composeSpec; test: tests/unit/textures/pedoutfits.test.ts)
About 55 percent of generated people wear one whole outfit (own random stream, so the rest of the draw is unchanged); `composeSpec(seed, base, { outfit: id, way: n })` forces one (showcase); `noOutfit: true` keeps the old pools. 17 outfits, two or three colourways each, one accent at most (tested): churchAuntie, churchDeacon, elderErrand, elderHeadwrap, oldTimerTallTee, leather90s, canvasWorker, hiVisCrew, clinicScrubs, transitUniform, winterTeen, creativeCoat, denimMidSeason, summerSlides, schoolDay, deliveryRider, nightOut. O15 left out on the lead's ruling.

## Numbers
- Triangles per person (hi/mid/far), before and after: wh-office 6286/1512/367 and 6286/1512/367; ba-hoodie-fade 6601/1700/348 both; ba-puffer-braids 6145/1625/358 both; ca-nurse 5988/1583/359 both; wh-elder 6569/1704/358 both. No new draw calls, no new textures, no texture size change.
- Single-file build: see the final report.
