# WP5: block faces and lots on real frontages (rotated, wedge and acute-corner lots)

Model: **sonnet**. Suggested worker: **Gus Calloway** (built the lots file; knows PLUTO). Parallel with WP2, WP3, WP4, WP10.
Coordinate with Rafael (ENV14) who keys building looks on BBL. Read first: `_realmap-rules.md`, realmap.md section 4 (row "Blocks / faces / lots").

## Files owned (new)
- `src/world/roadnet/faces.ts`, `src/world/roadnet/lotsReal.ts`
- `tests/unit/world/roadnet-lots.test.ts`
- Read-only: `src/world/LotSubdivider.ts`, `src/world/BuildingGen.ts` (its lot-local frame: x along frontA->frontB, z = outward; already works for any angle), `src/world/types.ts` (Lot, BlockFace).

## Interfaces
```ts
export interface RealFace extends BlockFace { edge: number; /** arc length range along the edge covered by this face */ s0: number; s1: number; corner0: boolean; corner1: boolean }
export function blockFaces(net: RoadNet, d: Derived): RealFace[][];             // per block, one face per side of buildingRings[b]
export function placeLots(net: RoadNet, d: Derived, faces: RealFace[][], lotsJson: unknown): Lot[]; // Lot.id = bbl
```
Rules: a face is a run of the building line along one edge (sides along a curb return belong to the corner, not a face).
Lots from `lots-real-r1r2a.json` by `blk`, `e`, `s`, `sd`; order by `s`; width = `lf` scaled per face so a face's lots fill
it exactly (report the scale; flag faces outside 0.85..1.15); depth = `ld` clipped to the block's opposite building line
(half depth on through-lots). **Corner lots**: a lot within 8 m of a face end is a corner lot; at non-90-degree corners its
side wall follows the bisector. **Wedge lots** (Broadway/Bushwick triangles, face angle < 70 deg): place a rectangle of the
inscribed depth and mark the leftover triangle `vacant` (fence + paving), never a skewed building. Blocks in
`fallbackBuilding` or with building-line width < 6 m get no lots (sidewalk/plaza). Lots with `e = -1` or zero frontage are
dropped and counted. `Lot.type` from PLUTO class (`cls`, `lu`, `fl`, `yr`) with the mapping used by `import-pluto.mjs`.
Footprint rings stay in the git-ignored cache (ruling); use `bf`/`bd`; if a wedge really needs the ring, emit only those
rings, quantised, into a tracked file and report its size first.

## Tests / done
- Every lot's `outward` within 10 deg of the normal of its frontage edge; no two lots on a block overlap (polygon test in
  lot frame, tolerance 0.2 m); >= 95 % of R1 PLUTO lots placed; wedge count and vacant count reported.
- On the grid adapter, `blockFaces` gives 4 faces per block matching `grid.blocks[i].faces` (a, b, outward) within 0.1 m.
- Rules self-check. FINAL with placed / dropped / scaled counts per phase.
