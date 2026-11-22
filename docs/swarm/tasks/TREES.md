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

## Log
- start: baseline build in scratch/trees/dist-before.
