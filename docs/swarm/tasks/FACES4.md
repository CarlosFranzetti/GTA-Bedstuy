# FACES4 (character artist-programmer), 22 Nov 2026
Owner: "Let's really aim for AAA in the faces." Scratch: scratchpad/faces4 (sheets.sh makes the before/after sheets: `scratchpad/faces4/sheets.sh <outdir> eyes 3q prof stress mid`).
Order: 1 eyes, 2 lips, 3 hairline, 4 leftovers.

## Plan for the eyes (status log, newest last)
- Finding: the shipped skin mesh has NO eye geometry (helper eye meshes are dropped) and only about 12 vertices across an eye (4 to 5 mm apart), so a lid cannot be made by moving the existing vertices.
- Plan: a small runtime "eye patch" per eye on the hi level only (`src/entities/models/pedEyes.ts`): a polar mesh round the eye opening (rings at fixed fractions of the painted opening), conformed to the morphed skin by a ray cast, then
  displaced: a recessed eyeball under a lid margin with real thickness, a lid ridge falling back to flush with the skin. The skin triangles under it are dropped on the hi level. Its UVs go to a dedicated rectangle of the
  atlas (x 256..512, y 320..384: free space; 128 x 64 per eye at 512, half at 256: no new texture, phone texture memory unchanged) that the face painter fills with the eye in patch coordinates.
  The mid and far levels keep the same eye painted in the head tile (one shared painter function), so the face does not change with distance.
- No blink (a lid that moves needs a per-person uniform or a morph target = a material or draw call per person, or a bone; the skin material is shared per person but its skeleton is the shared rig). Not done, see the end.
- Eyes built: `pedEyeShape.ts` (the opening curve, shared by paint and geometry), `pedEyes.ts` (the patch), painter eye block rewritten (iris smaller and covered a little by the upper lid, limbal ring, off-white sclera darker toward lids and corners, red in the corners, caruncle, wet line, a catchlight toward the key light, thick lash line, moist lid rim), `pedMesh.ts` (patch as a part of the hi geometry, skin triangles under it dropped, patch added to the bake input), `pedSkinPaint.ts` (patch rectangles).
  Per eye: 9 rings of 20, 301 triangles, 161 vertices; about 150 skin triangles are dropped under it. Build time about 30 ms a person at the hi level (cached with the dressed level).
- Lips: new paint (cupid's bow, darker upper lip, fuller lit lower lip, soft vermilion border, thin / medium / full by person (`K.lipFull`), paler and drier with age, redder lip colour). Paint only.
- Hairline: `pedHairline.ts` holds the style rim tables (the hair shells now read them from there); the painter paints solid hair colour under the rim then stubble fading to skin over about 8 mm, irregular, a widow's peak on a few, grey with age. Paint only.

## What was seen (honest)
Sheets in scratchpad/faces4: `before/` (FACES3 state), `a9/` and `b3/` (end state; a9 has front, 3q, stress, mid; b3 has the last eyes and 3q), `a9/grid-front.png` is the 12-face front sheet.
- Eyes: from the front they now read as eyes: an upper lid with thickness and a lash line, the iris partly under the upper lid, a limbal ring, a catchlight toward the key light, an off-white that darkens toward the lids and corners, a pink caruncle, a moist lower lid.
  At three-quarter view the near eye shows its iris (after the last change: bigger iris, thinner inner lash line); the far eye is mostly lid and shaded white, which is right for the angle.
- Cost per person on the hi level: +680 patch triangles, about 350 skin triangles dropped under it (net about +330 on about 5,340), 322 vertices; patch build 50 to 150 ms once per person (cached with the dressed level; 380 ms seen under heavy load); no draw call, no texture, no texture memory (the patch uses a free strip of the existing atlas, x 256..512, y 320..384).
  The mid and far levels have no patch (the same eye is painted into the head tile). The head budget in people-pipeline.mjs is not touched (no base mesh was rebuilt).
- Lips: visible lips on every skin tone, with a bow and a lit lower lip; the pale skins read softly (the lip is a redder version of the skin, not lipstick).
- Hairline: the painted edge is irregular and fades into skin on the fade, crop, short and long styles; the shell's own rim is unchanged (a ruled line is still a little visible on hats, buns and some braids), no temple recession (paint cannot take hair away), no baldness.
- Not done: blink (a moving lid needs a bone or morph target, i.e. per-person skinning data or a draw call; the skin material is shared per person only by texture), per-person view-dependent highlight in the skin shader (one shared material), the leftovers of item 4 beyond the ghost fix below.
- Ghost fix: the old painted eye drew a pale lens with an outline under each eye on triangles that share texels with the lid (the unwrap squeezes the lids). A texel now counts as the eye only when its own position is at the eye (pedPaintFace.ts, `loc`). Many faces are clean now; some (the heavy, wide faces) still show a few thin pale flaps under the eyes: those are old mesh triangles.
- The mid level (phone tier) still has the big dark wedge and torn flaps at the eye corners: the mesh has only about 20 vertices round an eye there. Not fixed.

## Tests
- New `tests/unit/entities/pedeyes.test.ts` (curve closed for every person, expression and wear draws agree with the painter, the patch is finite, faces out, stays in its atlas rectangles, drops skin under it).
- Red and not from this lane: `ped-hitby` (2), `pedround4` (legs, daylight at the knee) and the known `pedround5` shoe-hem check. The skin-paint test "dark pupils and lighter eye whites" went red from my darker first sclera and went green after I made the white brighter (no assertion changed).
