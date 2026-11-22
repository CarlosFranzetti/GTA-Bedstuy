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
