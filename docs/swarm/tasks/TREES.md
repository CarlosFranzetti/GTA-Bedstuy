# TREES task record (bushier trees, parks first)

Status: in progress (22 Nov 2026). Engineer: Marta Quill (TREES). Not committed by this lane.

Owner, 22 Nov: "can we also make the trees bushier, especially in the park."

## Findings (how trees are built today)
- Street trees: `src/world/data/streetTrees.ts` (`treeStyleFor`, `treePartsFor`) pick species form and cloud placements; `FurnitureGen.ts` (grid map)
  and `roadnet/propsReal.ts` (real map) instance one trunk mesh + one 48-triangle leaf cloud (`props/treeCloud.ts`) 2 to 3 times per tree.
  Colour per species: `textures/treeTint.ts` (instance-matrix squash). Leaf sprite: `textures/painters/organic.ts`, material `treeLeaves` (alpha test .45).
- Park trees: `landmarks/parts.ts` `tree()` merges the same cloud into the landmark's static leaf bucket (no instancing, no tint).
- Why thin: clouds are 1.5 m radius (crown 4 to 5 m), 48 equilateral cards in a ball with an open sprite, trunk 0.19 to 0.37 radius.

## Plan
1. New cloud (24 quads on a shell, larger cards, per-card brightness colour: dark interior, light rim), denser sprite.
2. 4 to 5 clouds per tree: dome, lobes, skirt; absolute crown widths 8 to 12 m for mature trees; species silhouettes differ.
3. Trunk with root flare and thicker; limbs visible at the crown base.
4. Park: big trees in groups and along paths, shrubs, hedges on fences and paths, small ornamental trees.

## Done in code (22 Nov, not yet seen in the running game)
- `props/treeCloud.ts`: new cloud = 16 square cards (32 triangles, was 48) on a ball shell plus 3 inside, each with a per-vertex grey (dark core, light rim,
  `color` attribute; material `treeLeaves` now `vertexColors`); `buildCloudGeometry(8)` = 16-triangle shrub cloud; `buildTreeTrunkGeometry()` = lathe with root flare + 4 limbs (60 triangles, was 36).
- `data/streetTrees.ts`: forms now 4 or 5 clouds in metres (plane crown about 11 m, honey locust wide and flat, pin oak/linden tall oval, pear small); `treePartsFor(..., free)`.
- `textures/painters/organic.ts`: leaf sprite with a solid dark core, 14 to 17 lobes (no pinholes).
- `landmarks/parts.ts`: `tree()` rebuilt (flared trunk, limbs, 4 or 5 clouds, h=1 is an 11 m crown), new `shrub()` and `hedge()`; `kit.ts` writes the colour attribute for vertex-coloured materials.
- `landmarks/buildPark.ts`: trees along paths, groves, small ornamentals, shrubs at tree feet, hedges inside the fence; playground, pool and garden use fewer, bigger trees plus hedges.
- `FurnitureGen.ts`, `roadnet/propsReal.ts`: use the shared trunk (the old limb helpers are gone). Test `street-surfaces.test.ts`: cloud count now 3 to 5 (was at most 3).
- Per tree (triangles, trunk + clouds): plane 36+125 -> 60+150, oak 36+144 -> 60+160, pear 36+96 -> 60+128, locust like plane.

## Log
- start: baseline build in scratch/trees/dist-before (hosted build before any change); captures queue behind other lanes (render lock).
