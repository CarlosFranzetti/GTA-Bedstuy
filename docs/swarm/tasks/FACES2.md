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
