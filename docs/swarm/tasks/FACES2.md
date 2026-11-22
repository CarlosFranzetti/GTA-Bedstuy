# FACES2 (character artist-programmer), 22 Nov 2026
Owner, 22 Nov: "have the faces be different and varied and more like GTA 4. I WANT SOME AAA POLISH."
Scratch: scratchpad/faces2/{before,after}. Harness: `scripts/faces2-harness.html` + `scripts/faces2-shots.mjs` (grid of heads, `morph=0` renders the old heads, `stress=1.6` exaggerates the traits).

## What breaks the picture (looked at: faces2/before/grid-front.png)
1. Everybody wears the same face: the shipped base heads differ only by group and sex (23 shapes) and `pedHead.faceMorph`, written by an earlier lane, was NEVER wired into pedMesh (only a preview config used it) and its ranges were a few millimetres anyway.
2. Eyes and the skin around them are paint: a flat almond with a pale ghost patch under it, no lid, no socket; the faces are smooth and young (no folds, no age).
3. Hairlines are rows of torn teeth, so every head has a cut-out paper fringe.

## Status log (newest last)
- Read the head pipeline. Head = 1,659 vertices / 3,100 triangles at hi, 211 vertices at mid, 66 at far (same surface at each level, so one position-only deformer keeps the three levels in agreement).
- Rewrote `faceTraits` / added `morphHead` in `src/entities/models/pedHead.ts` (about 30 independent traits, correlated by sex, age and build, wide ranges) and wired it into `pedMesh.dressLod` (before the normals are made), so the geometry, the texture bake, hair, beards and hats all see the same head.
- Painted features follow the surface: the morph hands its per-vertex displacement to the texture bake (`MhLod.faceDelta`), which paints at the UNMORPHED position of each texel, so nostrils, lips, brows and the eye band stay on the nose, mouth and brows they belong to whatever the shape.
- Skin painter (`pedPaintFace.ts`, `pedPaintShared.ts`): `K.wear` (0 child, about 0.15 to 0.85 adults by id, 1.1 to 1.5 elders) now drives nasolabial and marionette folds, crow's feet, forehead lines (a bit each, no stripes on the young), age spots on cheeks and temples, redder cheeks; per-person eye bags, lid heaviness, brow thickness (0.66 to 1.5), arch and gap; pores at 512 px only (not on phone); more five-o'clock shadow; lips pulled toward the skin (no lipstick); a wide soft hairline band under the hair piece.
- Tests: `tests/unit/entities/pedhead.test.ts` (spread of traits, age in shape, fold check, 9 tests) green.

## What varies now (pedHead.ts, `faceTraits`, about 30 independent draws per person from the id)
Head width, length, height; lower-face length and forehead height; forehead slope; brow ridge; eye spacing, socket depth, tilt; nose forward, length, droop, width, bridge; cheekbone out and height, cheek fullness or hollow; jaw width and angle; chin forward, length, width; jowl; lip fullness, mouth width; ear size and flare; neck thickness; head carried forward on the neck; four asymmetries of 1 to 2 mm (a few percent). Typical spread (1 sd across the civilians): jaw width 6 percent, nose width 10 percent, eye gap 4.7 percent, head width 3 percent, lower-face length 4 percent, neck 8 percent, chin length 5 mm, nose forward 6 mm; extremes about twice that. Correlated: men heavier brow, jaw, neck; women finer; a heavier build fills cheek, jaw, neck and jowl, a light one hollows them; the old get longer ears and noses, thinner lips, jowls, a head carried forward 1 cm. The crowd group is NOT a trait: every group is drawn from the same ranges and only the MakeHuman base shape differs by group (no caricature, no trait tied to ancestry).
Same parameters at hi, mid and far (one position-only deformer inside `dressLod`), so the face does not change shape with distance; hair, hats, beards and glasses are fitted by rays to the morphed head, looked at at 1.7 times the spread (faces2/after/grid-stress.png): all fit.

## Numbers
- Triangles: none added (vertices move, nothing is built). Draw calls: none. Textures: none new; phone tier texture memory unchanged (256 px bake as before).
- Time per head: 1.9 ms hi, 0.3 ms mid, 0.1 ms far plus traits (measured in node, one shape, 120 specs); cached per variant by the existing geometry cache, against several hundred ms for the texture bake of the same person.
- Skin painter: pores add a noise call per face texel at 512 px only.

## Still short of the bar (honest)
- Pale ragged patches on the cheek by the ear (seen before any change too): the cause is not found. A debug paint (front mask red, side blue) shows a sharp horizontal discontinuity at ear-lobe level inside the head tile, so it is the unwrap or the chart edge, not paint. It is the first thing a stranger sees at 1 m in a three-quarter view.
- Phone tier (mid level): a pale visor stripe across the brows on many faces (the eye band painted for the hi triangles lands on squeezed mid triangles). Seen before my change too.
- Eyes are still paint (item 3 not done): a deeper socket now comes from the morph (`eyeDepth`, brow) and the lid shadow is heavier, but no eyeball or lid geometry, no wet highlight beyond the catchlight.
- Hairline teeth: the hair piece border is still ragged; the painted band darkens the skin below it so the teeth read less, but the geometry is unchanged.
- Lips and chin can read as a pout on heavy builds (jowl plus chin pad); lips were reduced once, not tuned further. A handful of triangles under the nose tip or at the nasolabial crease fold in extreme combinations (about 1 in 20,000, no visible tear seen).
- No in-game frame: the hosted build and boot were not run in this lane (harness frames only, software rendering). The three-metre and phone frames are from the harness.

## Checks (22 Nov)
- `npx tsc --noEmit`: no errors under src/ from these files. `npx vitest run tests/unit/entities tests/unit/textures --maxWorkers=1`: 1,407 passed; red only for the known pedround5 shoe-top (la-bomber hi 0.0719 vs 0.074). Assertions changed: pedbodytypes (dressing test now runs with `faceDebug.morph = false`, because dressLod now also shapes the head), ped-skin-paint (256 px eye whites and dark texels: more than 1, was more than 2, a thin-browed person has 2; the test now paints at the unmorphed position like pedMesh does), pedhead (wider ranges, 3 new tests).
- Single-file build: 10.82 MB (budget 12).
- Sheets (scratchpad/faces2): before/ and after/ grid-front.png, grid-3q.png, grid-close.png, grid-phone.png, grid-m3.png (six at 3 m), after/grid-stress.png (1.7 times the spread).
