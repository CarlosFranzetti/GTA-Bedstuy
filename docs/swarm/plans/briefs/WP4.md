# WP4: road and sidewalk meshing along polylines, and chunk culling by spatial hash

Model: **sonnet**. Suggested worker: **Lena** (PERF/LOD: culling and budgets). Parallel with WP2, WP3, WP5, WP10.
Read first: `_realmap-rules.md` (binding), realmap.md sections 4 (rows "Road + sidewalk meshing", "Chunk culling") and 5 (budget).

## Files owned (new)
- `src/world/roadnet/meshRoads.ts`, `src/world/roadnet/chunksReal.ts`
- `tests/unit/world/roadnet-mesh.test.ts`
- Read-only reference: `src/world/RoadBuilder.ts` (materials, UV scale, markings look), `src/render/Culling.ts`.

## Interfaces
```ts
export interface RoadMeshOptions { tier: Quality; markings?: boolean }
export function buildRoadMeshes(net: RoadNet, d: Derived, mats: WorldMaterials, opts: RoadMeshOptions): THREE.Group;
// group children: 'asphalt' (edge ribbons between cuts + nodePolys / cluster polys), 'sidewalk' (curbRings minus buildingRings,
// triangulated with THREE.ShapeUtils, holes allowed), 'curb' (extruded 0.15 m along curbRings), 'markings' (centre lines,
// stop bars at STOP_LINE, zebra bands at the crosswalk contract), each mesh userData.cell set for splitMeshesIntoCells
export function chunkLayoutFromBounds(b: Bounds, fine?: boolean): ChunkLayout; // cell 64 m (32 fine), chunk 128 m, origin = b.min
```
Rules: ribbon = polyline offset +-width/2 with miter joins (clamp at 2x), UV u in metres across, v in metres along s;
asphalt y 0, sidewalk top 0.15; ribbonless-edge clusters get one unioned polygon (rules section 6); `level != 0` edges are
not meshed (WP for the BQE later). Roads, sidewalks and markings are split into cells and **chunked like buildings** (today
they are never hidden: the real map has 3x the road area). Reuse existing materials; no new textures.

## Tests / done
- Pure-geometry tests (no WebGL): ribbon and node polygon triangles have no overlap > 0.05 m^2 at 10 sample junctions
  including Broadway x Myrtle (5 legs) and a 45-degree Bushwick crossing; sidewalk area = sum(curbRing - buildingRing) +-1 %;
  every road triangle centroid passes `net.isOnRoad` or lies in a node polygon.
- On the grid adapter the asphalt area matches today's RoadBuilder area +-3 %.
- Budget note in FINAL: triangles and draw calls for roads on R1 per tier (count from geometry; one capture via
  swarm-render.sh only if Imani asks). Draws for roads per view <= today's.
- Rules self-check.
