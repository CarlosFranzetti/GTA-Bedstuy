# FACES3 (character artist-programmer), 22 Nov 2026
Owner: "have the faces be different and varied and more like GTA 4. I WANT SOME AAA POLISH."
Scratch: scratchpad/faces3. Order: 1 cheek patch and mid-level visor, 2 resting mouth and pout, 3 hairline teeth, 4 eyes.
Harness: `scripts/faces2-harness.html` + `scripts/faces2-shots.mjs`. New query switches: `tier=phone` (phone tier: mid level, 256 px bake), `tex=checker` (UV checker on every head),
`tex=dump` (the baked head tile, enlarged), `dbg2=1|2` (paint fz / height / normal as colour: for finding what a texel's position is).

## 1. The pale ragged patch (CAUSE PROVED, FIXED)
FACES2 suspected the unwrap or a chart edge and was half right. What I looked at: a UV checker on the heads (tex=checker): the map is smooth at the ear, so no seam there. A dump of the baked
head tile (tex=dump) showed hard-edged pale blocks on both flanks starting at nose-floor height. Dumping the position of each texel (ROWS=1) showed texels in those blocks held positions from the
NOSE FLOOR (x about 0, z -0.058), not the side of the head. Cause: in `unwrapUVs` (scripts/people-pipeline.mjs) the head's cylinder axis stood at the MEAN z of the head's vertices, which the dense face
pulls 4 to 5 cm in front of the ears. The nostril hollows and the columella then lay BEHIND the axis, so their angle jumped to +-pi (u = 0 or 1): a few tiny triangles got UVs stretched across half the
tile (u 0 to 0.5). The bake lets the front-most surface win a texel, so those slivers overwrote the back and sides of the head, in a band at nose-floor height (the hard edge at ear-lobe level) and
partly below it (the ragged edge by the cheek). Paint was innocent.
Fix (pipeline, all 23 base meshes rebuilt, triangle counts identical): the axis now stands at the ear plane (median z of the head's flanks at eye height + 1 cm); the front is weighted by a steeper curve
(`HEAD_U_POWER` 3.5, was 2) so the face keeps its texel density; a vertex inside a hollow (eye socket, nostril: more than 25 mm behind the face's own surface, within 5.6 cm of the midline, above chin + 7 cm)
is unwrapped as if on that surface. The "visor" stripe on the mid level was the same bug (eye-socket slivers); it is gone too.

Beard shells (`faceUV` in pedHead.ts) now use the same map (the shipped landmarks carry `uAxisHead`, `uAxisNeck`, `uPower`), so beards still sit on the skin they are painted from.

## 2. Frowns and the pout (DONE, tuned by eye)
Cause: the shipped MakeHuman mouth rests a few mm downturned, and the painter added to it: `cornerLift` was negative for the 'tired' expression (23 percent of people) and for the frown mouth,
the dark mouth-line ran out to the corners with a heavy corner blob, and marionette folds ran down from the corners. On heavy builds chin forward, jowl and lip fullness all grew with weight and stacked into a pout.
Changes: new trait `mouthUp` (pedHead.ts): corners and the cheek above them rise 5.6 mm on average, sd about 3 mm (about 4 percent of people rest a little down, most neutral to a faint lift, a few
clearly up); the painter no longer droops (`cornerLift` 0.0002 neutral, 0.0014 amused, 0.0032 grin), the mouth line fades out toward the corners and is lighter, the corner blob is a fifth of what it was,
marionette lines are 60 percent. Weight no longer feeds the pout: chinFwd -3.5 mm per unit of heft, jowl growth with weight 0.3 to 0.18, lips -1.5 mm per unit of heft.
Seen: 12 faces front (new/group-front-m4.png): mostly neutral, some faint smiles, a few resting a little down. Lips still read as thin dark lines at close range, not lipstick.

## 3. Hairline teeth (DONE: edge is clean; not soft)
Cause: the hair shell's rim ring stood exactly ON the skull surface (thickness 0, radius = the ray-cast skull). Between two rim columns the shell's straight chord dipped under the faceted, morphed forehead,
so the skin poked through in a row of triangles. Change (pedHairPieces.ts, `shell`): a lift at the rim, 3.2 mm falling to nothing by u = 0.6, only on shells that are not open bands and where the style
does not hang. No new geometry, no new draw call; it applies at every level (the same function builds hi and mid) and every hat/hair combination in the sheets. The edge is now a clean, hard line:
it does not fade into the scalp (that needs transparency, which the one opaque skinned material cannot do, or a painted band that follows each style's rim, which I did not build).
One or two isolated skin triangles still show in some bun and headphone styles.

## 4. Eyes (small: gaze and rim only)
Both eyes now look the same way (exm runs OUTWARD from each eye, so the old shared offset made the pair diverge or cross: the sign now follows the side), a darker limbal rim (0.55 to 0.68) and a thicker
upper lash line (+25 percent). Not built: eyeball and lid geometry, a wet highlight beyond the catchlight, a deeper socket shadow. The white was already 232, 226, 216 (not pure white).

## Tooling
Harness switches: `tier=phone`, `tex=checker`, `tex=dump`, `dbg=1`. `scripts/people-pipeline.mjs` has `HEAD_U_POWER`; rebuild all shapes with `node scripts/people-pipeline.mjs build` (11 s). The glb files changed in all 23 shapes; triangle counts are identical.
