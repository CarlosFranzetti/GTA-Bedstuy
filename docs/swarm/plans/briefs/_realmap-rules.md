# Rules shared by every REALMAP wave-2 brief (WP2, WP3, WP4, WP5, WP10)

Director: Imani Adeyemi (MAPLEAD). Design: docs/swarm/plans/realmap.md. Read sections 3, 4 and your WP row. Do not read whole files you don't need.

1. **The single-file build must not grow.** New code lives in `src/world/roadnet/` (or a `real/` subfolder you own) and is
   reachable only from tests and from the `?map=real` dynamic import in `MapSource.ts`. **Default-path modules must never import
   a roadnet module statically** (type-only `import type` is fine, it is erased). Real-path code may import default-path
   modules, never the reverse. If you think you need to change a default-path file (TrafficSystem, RoadBuilder, Culling,
   transit, BuildingGen, ...), keep it to a small additive export with no new imports, and say so in your wrap-up.
   Self-check before you hand back: `grep -rn "roadnet/" src --include=*.ts | grep -v "^src/world/roadnet/" | grep -v "import type"`
   must print only the two baseline lines of 11 Nov (`src/ui/map/streetSource.ts` and `src/ui/map/MapView.ts` importing
   `REAL_FRAME` from `geom.ts`, a few hundred bytes, accepted).
2. Inputs you can rely on (committed): `RoadNet` (`RoadNet.ts`), `deriveGeometry(net)` -> `Derived` (`derive.ts`: legs, cuts,
   nodePolys, returns, curbRings, buildingRings, fallbackBuilding), `roadnet-core.json`, `roadnet-controls.json`,
   `raw/lots-real-r1r2a.json`, `roadNetFromGrid(grid)`. Do not change their exported signatures; ask Imani if you must.
3. Every module is tested twice: on `roadNetFromGrid(buildGrid(loadBedstuyData()))` (must agree with today's grid behaviour)
   and on `RoadNet.fromJson(core)` (counts come from the data, never literals beyond ranges).
4. Gates: `npx tsc --noEmit` clean under src; `npx vitest run <your test files> --maxWorkers=2`. Never git stash, never commit,
   never edit src/main.ts (put a FOR FABLE snippet in your wrap-up). One render job at a time through scripts/swarm-render.sh.
5. Shared junction contract (all distances measured along a leg from the node, i.e. from `Derived.legs[i]`):
   crosswalk band from `cut + 0.5` to `cut + 3.5` (3 m wide, centre `cut + 2.0`); vehicle stop line at `cut + 4.5`;
   these live as constants in `src/world/roadnet/contract.ts`, created by WP3 first thing (`CROSSWALK_START = 0.5`,
   `CROSSWALK_WIDTH = 3`, `STOP_LINE = 4.5`); until it exists, use the same literals.
6. Short-edge clusters: an edge with no ribbon (`cuts[e].cutA + cuts[e].cutB >= length`, e.g. the 10 m Myrtle link and the 4 m
   Wyckoff link) joins its two nodes into one **junction cluster**. Everyone treats a cluster as one junction: one paved polygon
   (WP4), one signal controller (WP2), no crosswalk across the ribbonless edge (WP3). WP2 owns `junctionClusters(net, derived):
   number[][]` in `roadnet/clusters.ts`; others import it (until it lands, compute the same rule locally).
7. Talk: start post "@Imani starting WPn", blockers at once, wrap-up to Imani (FINAL, <=150 words + file list). Sign with your name.
