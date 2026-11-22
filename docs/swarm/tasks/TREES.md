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

## What changed (22 Nov; seen in the running game on ?map=real, low and phone, and in the standalone harness scripts/trees-harness.html)
- Cloud (`props/treeCloud.ts`): 16 square leaf cards (32 triangles, was 48 equilateral cards) on a ball shell, tilted up toward the sky, plus 3 inside;
  per-vertex grey (`color`, material `treeLeaves` is now `vertexColors`) = dark core, lit rim. `LITE_CARDS` = 12 cards (24 triangles) on phone and low
  (real-map props and park trees). Shrub clouds reuse the same builder. Sprite (`painters/organic.ts`): solid dark core, 14 to 17 lobes, no pinholes.
- Trunk (`buildTreeTrunkGeometry`): lathe with a root flare (0.54 m at the ground) plus four limbs, 60 triangles (`lite`: 48, three limbs, six sides).
- Forms (`data/streetTrees.ts`): 4 or 5 clouds in metres: plane about 11 m wide, honey locust wide and flat, pin oak / linden tall oval, pear small
  (5 m); a very big census tree gets a slightly narrower crown (no street tree wider than about 14 m). Species tint detection unchanged (squash and trunk ratios kept).
- Parks (`landmarks/parts.ts`, `buildPark.ts`): `tree()` rebuilt (flared trunk, three limbs, 4 or 5 clouds, h = 1 is an 11 m crown, h 0.45 a small ornamental);
  new `shrub()` (one flattened cloud) and `hedge()` (olive body plus leaf clouds every 1.6 m). Thistledown-style parks: trees in rows along the paths (4.4 to 6.2 m off the
  path), groves of 3 to 5 big trees 6 to 9 m apart, small ornamentals, shrubs at 40 percent of the trees, hedges inside the fence in runs (half left open, none at gates;
  not on phone). Playground, pool and garden: fewer and bigger trees plus hedges and shrubs. `kit.ts` writes the colour attribute for vertex-coloured materials.
- Tests: `street-surfaces` cloud count now 3 to 5 (was at most 3); `furniture` trunk at most 64 triangles (was 40); `culling-buckets` canopy height under 20 m (was 12).

## Numbers (low tier = lite cloud and trunk; full = medium and high)
- Per street tree, triangles trunk + clouds. Before: plane 36+125, oak 36+144, pear 36+96 (about 160). After, low and phone: plane 48+113, oak 48+120, pear 48+96 (about the same, 144 to 168).
  After, medium and high: plane 60+150, oak 60+160, pear 60+128 (210 to 220, +30 percent).
- Park trees, triangles: before about 150 (2 or 3 clouds of 48 + trunk 30). After: 5 clouds x 32 + 55 = 215 on medium and high, 5 x 24 + 55 = 175 on low (phone same as low, half as many trees).
- Real map, low, thistledown (same build otherwise, clean A/B): landmark meshes in view 16.4k -> 22.8k triangles, whole frame 544,261 -> 557,600 at the fence view (+2.5 percent), draws 275 -> 277.
  Phone (300k budget): park-from-fence 305,699 / 110 draws -> 304,885 / 109; park inside 304,350 / 117 -> 303,788 / 114; row 319,586 / 98 -> 318,389 / 93. No new draw calls (same two tree materials).
- Single-file build 10,823,813 bytes (+3 kB). Textures: same 256 px leaf sprite and tier scaling; no new textures.
- Whole-frame numbers of the avenue views move by tens of thousands between runs (traffic and spawn), so they are not quoted.

## Not verified / still thin
- No frames per second (software GL). Shimmer: a still pair 0.5 m apart in the park shows the same edge pattern; not watched moving in a real GPU.
- Hedges still read as a dark olive band with leaf blobs on top. Park crowns show layered plates from some angles (cards tipped up); street crowns are fuller than before but a few thin card slivers stick out at the rim.
- A dark flat quad in the sky above the park at the inside view is the elevated line's canopy mesh (`el:canopy`, not trees).
- Longer grass patches in parks were not done. Night frame: A5/after-real-low-park-night.png. Grid map: frames fine, trees full.
