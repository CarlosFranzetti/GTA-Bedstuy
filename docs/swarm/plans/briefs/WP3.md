# WP3: pedestrian sidewalk graph and crosswalks for the real map

Model: **sonnet**. Suggested worker: **June** (CROWD: ped spawning, crosswalk deadlock). Parallel with WP2, WP4, WP5, WP10.
Read first: `_realmap-rules.md` (binding), realmap.md section 4 (row "Pedestrian graph + crosswalks").

## Files owned (new)
- `src/world/roadnet/contract.ts` (**create first**, constants in rules section 5), `src/world/roadnet/sidewalks.ts`
- `tests/unit/world/roadnet-sidewalks.test.ts`

## Interfaces
```ts
export interface RealCrosswalk extends Crosswalk { edge: number; node: number; /* side kept as nearest compass Side for legacy code */ }
export interface SidewalkNet { graph: Graph; crosswalks: RealCrosswalk[]; /** node id -> block index or -1 for crosswalk ends */ blockOf: Record<string, number> }
export function buildSidewalkGraph(net: RoadNet, d: Derived, opts?: { spacing?: number /* 25 */ }): SidewalkNet;
export function buildPedCrossingsReal(sw: SidewalkNet, net: RoadNet): Map<string, PedCrossing>; // same shape TrafficSystem.buildPedCrossings returns
```
Rules: walking line = midway between `curbRings[b]` and `buildingRings[b]` (for `fallbackBuilding` blocks and blocks with
an empty building ring, kerb ring inset by 1.5 m); nodes at every corner of that line plus every <= 25 m; one crosswalk per
leg of every signal or stop cluster at the contract band, endpoints snapped to the two walking-line corners either side
(skip legs of ribbonless edges, rules section 6; skip stubs and dead ends); mid-block crossings none. Crosswalk edges carry
`streetId` of the crossed edge so TrafficSystem's pairing keeps working by `(node, edge)`.

## Tests / done
- On the grid adapter: same node count within 10 % and the same crosswalk count as `grid.crosswalks`; existing ped-spawn
  logic (copy the scenario) finds spawn nodes.
- On the real core: every non-island block's walking ring present; graph connected within each cluster of blocks joined by
  crosswalks (report components; > 95 % of nodes in the largest); every crosswalk lies inside a node polygon or ribbon
  (`net.isOnRoad` at its midpoint) and its ends are off-road.
- Rules self-check. FINAL with counts and a small PNG of one Broadway junction in scratchpad.
