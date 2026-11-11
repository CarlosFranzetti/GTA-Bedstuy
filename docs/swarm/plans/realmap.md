# REALMAP: a real street network for Bed-Stuy, Bushwick, Williamsburg and a corner of Ridgewood

Imani (MAPLEAD), 11 Nov 2026. Status: design + working data pipeline + RoadNet core landed; no consumer migrated.
Debug views: `docs/reference/realmap-r1r2.svg` (names, classes, one-way arrows, signals, stubs; open in a browser),
`docs/reference/realmap-r1r2.png` (quick look), `docs/reference/brooklyn-overview-check.png` (overview layer with R1+R2 lit).

## 0. The decision in one paragraph

Replace the axis-aligned `GridModel` with a **RoadNet**: a planar graph of real NYC street centrelines (nodes = intersections,
edges = polylines with name/class/width/one-way/lanes, blocks = planar faces). The grid survives as one particular RoadNet
(`roadNetFromGrid`), so each consumer migrates **once**, to the RoadNet API, and keeps working on the grid map until the
real map (`?map=real`) reaches parity; then the grid path is deleted. The data comes from NYC Open Data (CSCL centrelines,
MapPLUTO, building footprints, NTAs, borough shoreline), is projected into today's frame (origin Throop x Kosciuszko, +x east
along the Bed-Stuy streets, +z south), and ships as small quantised JSON (R1+R2 core: 30 kB raw, 9 kB gzip).

## 1. Data

| Layer | Source (data.cityofnewyork.us) | Fields used | Where |
|---|---|---|---|
| Street centrelines | **Centerline (CSCL) `inkn-q76z`** (updated 8 Nov 2026; LION is the older equivalent, not needed) | `the_geom` (MultiLineString, WGS84), `full_street_name`, `pre_type`/`post_type`, `rw_type`, `status`, `trafdir`, `streetwidth` (ft, curb to curb), `number_travel_lanes`, `number_park_lanes`, `from_level_code`/`to_level_code`, `truck_route_type`, `carto_display_level`, `posted_speed`, `bike_lane`, `physicalid`, `boroughcode` | `scripts/import-streets.mjs` -> `src/world/data/raw/centerline-r1r2.json` (cache, 444 kB) -> `src/world/data/roadnet-core.json` |
| Lots | MapPLUTO `64uk-42ks` (already used by `scripts/import-pluto.mjs`, `import-north.mjs`) | `bbl`, `xcoord`/`ycoord` (EPSG:2263 ft), `lotfront`, `lotdepth`, `bldgfront`, `bldgdepth`, `numfloors`, `bldgclass`, `landuse`, `yearbuilt`, `address` | WP6 |
| Building footprints | `5zhs-2jue` (already used) | polygon, `heightroof`, `bin`, `base_bbl` | WP6 |
| Neighbourhood labels | 2020 NTAs `9nt8-h7nd` | `ntaname`, `borocode`, `ntatype`, polygon | overview |
| Shoreline / land | Borough Boundaries (clipped to shoreline) `gthc-hcne` | `borocode`, multipolygon | overview |
| Signals (refinement) | VZV Leading Pedestrian Interval signals `mqt5-ctec` (a subset of signalised intersections) | point | WP2b, optional |

CSCL codes as observed in the R1+R2 box (3,054 rows): `rw_type` 1 street (2,720), 6 path (245, NYCHA paths), 10 alley (61),
2 highway (19, BQE), 9 ramp, 3 bridge (Scott Ave footbridge), 8 driveway. `trafdir` TW/FT/TF/NV (FT = with digitising
direction). Level codes: 13 at grade, 9 below (BQE trench), 17 above. CSCL has **no node ids and no signal data**; we node it
ourselves and derive control (section 3).

**Projection.** Local equirectangular around the origin, then rotated (`src/world/roadnet/geom.ts`):
`REAL_FRAME = { lat0: 40.691633, lon0: -73.942663, rotDeg: 8.6 }`. The origin is the shared CSCL vertex of THROOP AVE and
KOSCIUSZKO ST (measured; the old `ORIGIN_LATLON` in `geo.ts` was a guess about 200 m off). The rotation is the length-weighted
median of Kosciuszko/Halsey/Gates/Myrtle (8.5..8.7 deg; avenues 98.6 deg), matching EXPANSION.md's 8.7. Axes as today: +x
east along the streets, +z south along the avenues; grid +x has compass bearing 81.4 deg. Scale error < 0.02 % over 5 km.
Check: Tompkins/Greene and Malcolm X/Greene land on z = 247 +- 1, 1,232 m apart (EXPANSION: 247, 1,232). Unit-tested.

**Tolerances.** Node snap 1.5 m (CSCL shares exact vertices; the tolerance only absorbs float noise and digitising gaps).
Polyline simplification Douglas-Peucker 0.3 m (keeps Myrtle's bend and the Broadway kinks; road meshing needs the real
curve). Quantisation 0.1 m. Dead ends < 3 m dropped. Faces < 400 m^2 are traffic islands, not blocks. Overview: 3 m DP /
1 m quantum (hosted), 12 m / 4 m (artifact), land 8 m / 40 m.

**Filter.** Keep `status` 2 (constructed) and `rw_type` 1, 2, 3, 4, 9; drop footbridges (rw 3 + NV), paths (6), alleys (10),
driveways (8), step streets, ferries. `NV` streets (plazas) are kept as class `ped` (sidewalk only, no lanes). NYCHA paths
are a later pedestrian-only layer (not blocks: they would cut superblocks).

## 2. Pipeline (working, `scripts/import-streets.mjs` + `src/world/roadnet/build.ts`)

fetch (Socrata `within_box` of the phase extent, boroughs 3 and 4) -> project -> clip to the extent polygon (cut ends become
`stub` nodes: the street continues into the fog) -> split at same-level crossings and T-junctions (grade-separated crossings
are counted, not split) -> snap endpoints into nodes -> drop duplicates and slivers -> prune short dead ends -> merge degree-2
chains with identical attributes (name, class, width, lanes, level, one-way consistent) -> simplify -> intersection control
-> blocks = bounded planar faces of the at-grade edges. Deterministic (edges sorted by midpoint), so ids are stable across
re-imports of the same data. Run: `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node
scripts/import-streets.mjs [--refresh]`.

Result today (R1+R2 union): 1,094 CSCL rows -> 623 kept -> **369 nodes, 575 edges, 197 blocks + 10 islands, 81 street names**;
classes arterial 64 / avenue 243 / street 267 / ped 1; control signal 270 / stop 26 / stub 62. The SVG matches the real map
(Broadway and Bushwick Ave diagonals, the 45-degree Bushwick grid, Myrtle straight through, superblocks of the Marcy, Tompkins
and Sumner houses, the Malcolm X / Broadway / Lexington offset junctions).

Classification (`build.ts classify`): highway (rw 2), ramp (rw 9), ped (NV), **arterial** (CSCL carto level set, or 3+ lanes,
or truck route >= 50 ft: Broadway, Flushing, Myrtle, Bushwick Ave parts), **avenue** (>= 40 ft, or >= 34 ft named Ave/Blvd),
else street. Width = `streetwidth` ft x 0.3048 (default by class). Sidewalk: not in CSCL; defaults 4.0 / 4.6 / 5.0 m by class,
replaced in WP6 by the measured gap between curb and PLUTO lot fronts per block face.

## 3. Model (`src/world/roadnet/`)

- `types.ts`: `RoadNetData { version, frame, extent, nodes: RNNodeData[], edges: RNEdgeData[], blocks: RNBlockData[] }`;
  node `{ p, control: 'signal'|'stop'|'none'|'stub'|'deadend', ref? }`; edge `{ a, b, pts, name, cls, width, sidewalk, lanes,
  oneway: -1|0|1, level, truck?, speed?, ref?, streetId? }`; block `{ edges: signed refs, area, island, ref? }`.
- `geom.ts`: projection, clip, DP simplify, snap, `planarFaces` (bounded faces are clockwise in the top-down view, positive area).
- `build.ts`: CSCL -> RoadNetData. `codec.ts`: compact JSON (`{v,f,x,names,n,c,e,b}`, 0.1 m ints, delta-coded interiors).
- `extents.ts`: phase rings (measured intersections) grown by 45 m; `phaseOf(p)`.
- `RoadNet.ts`: runtime class. Queries: `bounds`, `nearestEdge(p, maxDist?, filter?) -> {edge, point, dist, s, dir}`,
  `streetNameAt(p)`, `edgeAt(p)` (inside the roadway), `isOnRoad(p)`, `blockAt(p)`, `blockRing(i)`,
  `blockOutline(i, buildingLine?)` (curb / building-line polygon by offsetting each side by width/2 (+ sidewalk), miter
  joins), `pointAt(edge, s)`, `incident[node]`, `otherEnd`, `streetEdges(streetId)`, `streetIds()`. Spatial hash 64 m.
- **Adapter** `roadNetFromGrid(grid)`: one node per intersection (ref = intersection id), one edge per segment centre to centre
  (ref = segment id, streetId = street id), blocks from the same face code (ref = block id), signals as `signals.ts` does.
  Tested: recovers all 45 grid blocks, curb polygons equal `Block.curb`, same `nearestStreet` and `isOnRoad` answers.

Derived at runtime (WP-owned, not stored): **intersection polygons** (for each node, the union of incoming roadway ends cut at
the point where neighbouring curb lines meet, plus curb-return arcs of radius 4.5 m street / 6 m avenue), **lane graph**,
**sidewalk graph**, **crosswalks**, **lots**. Keep the stored data minimal; everything else is a pure function of it and
unit-testable.

**Why not store lanes/curbs?** They depend on tunables (lane offset, curb radius, stop distance) that gameplay lanes change
weekly; recomputing at boot is cheap (575 edges) and keeps the data file at 9 kB gzip.

## 4. Consumers: exact interface changes

Rule: each consumer takes `net: RoadNet` (plus the derived products below) instead of `grid: GridModel`. On the grid map main.ts
passes `roadNetFromGrid(grid)`; on `?map=real` it passes `RoadNet.fromJson(core)`. Only Fable edits main.ts (one switch in WP0).

| Consumer (files) | Uses today | Change |
|---|---|---|
| Road + sidewalk meshing (`RoadBuilder.ts`) | `segments` as axis rects, `intersections` as boxes (`halfX/halfZ`), `blocks.curb` quads, runs with `axis: 'x'/'z'` | New `roadnet/meshRoads.ts`: per edge a ribbon along the polyline (miter, UV in metres along s), per node an intersection polygon with curb returns, per block the sidewalk ring = `blockOutline(i)` minus `blockOutline(i, true)` with rounded corners; curbs as extruded ring. Markings (centre lines, stop bars, crosswalk zebras) along s. Signature `buildRoadMeshes(net, derived: Derived, mats, tier): THREE.Group`. Tree pits / manholes / grates move to s-parameterised placement. |
| Lane graph (`Grid.ts` lanes; `TrafficSystem`, `TrafficAgent`, `Cop`, `CopSystem`) | `LaneGraph` nodes with `heading`, `stopLine`, `intersectionId`; turns built per Side N/E/S/W | New `roadnet/lanes.ts`: `buildLaneGraph(net, opts): LaneGraph` (same `LaneGraph` type, so TrafficAgent/Cop/TrafficSystem keep their code). Per edge and direction, lanes offset by `LANE_OFFSET` (two-way) or spread across `lanes` (one-way); stop-line node at the intersection polygon edge; turn connectors as cubic Beziers sampled every 3 m between any entering and exiting lane at the node (angle arbitrary), no U-turns, right-turn-on-red off. `intersectionId` = `n{node}`. TrafficAgent's heading math is already vector based; check its corner speed uses the curve, not Side. |
| Signals (`TrafficLights.ts`, `props/signals.ts`) | `nsStreetId`/`ewStreetId` two-phase per intersection | Phases become **groups of approaches**: approaches (incoming edges) clustered by direction into two (or three for 5-leg nodes like Broadway/Myrtle) groups by opposing angle; `phaseOf(approachEdge)`. Poles at each corner where two curb lines meet. Signature `TrafficLights.fromRoadNet(net)`; `isGreen(node, approachEdge)`. Stop-controlled nodes: all-way stop behaviour. |
| Pedestrian graph + crosswalks (`Grid.ts sidewalks`, `TrafficSystem` 23-40, 535-545, `Pedestrian`, `PointerRoute`) | `Graph` of corners + mid-face points; `Crosswalk {intersectionId, side, a, b}` | `roadnet/sidewalks.ts`: nodes at block-outline corners (building-line ring offset by sidewalk/2) and every 25 m along each face; crosswalks across each incoming edge at the node, `Crosswalk.side` replaced by `edge: number` (approach). Same `Graph` type. TrafficSystem's crosswalk pairing (by intersection + street) switches to `(node, edge)`. |
| Blocks / faces / lots (`LotSubdivider`, `data/faces.ts`, `schema.ts`, `BuildingGen`, `FurnitureGen`, `props/*`) | `Block {row, col, curb[4], faces[4] with Side}`; `BlockFace` keyed by Side N/E/S/W | `BlockFace` generalises to `{ blockId, edge, streetId, a, b, curbA, curbB, outward }` one per block side (any count, any angle; `side` kept only as the nearest compass Side for legacy art choices). Lot is already vector based (`frontA`, `frontB`, `outward`) and BuildingGen already models each building in a lot-local frame, so **rotated lots need no generator change**; what does: (1) wedge lots on diagonals (Broadway triangles): place a rectangular building of the lot's inscribed depth and fill the wedge with a party-wall prism or vacant lot; (2) corner lots where faces meet at non-90 degrees: corner building takes the bisector as its side wall; (3) anything indexing `row/col` (RoadBuilder bluestone rows, curb variants, schema row lookups) hashes `blockId` instead. Lots come from PLUTO (WP6), keyed by BBL (Rafael's ENV14 data keys on BBL already). |
| Street signs (`signBlades.ts`, `props/poles.ts`) | one blade pair per ns x ew intersection, axis-based | Per node, one blade per distinct street name among incident edges, oriented along that edge's direction at the node; poles at corners from the intersection polygon. |
| Chunk culling (`render/Culling.ts chunkLayout`, `WorldBuilder.ts`) | cells/chunks from the street pitch (`axis/offset`) | `chunkLayout` becomes a fixed spatial hash: `cell 64 m, chunk 128 m`, origin = net.bounds min (signature `chunkLayoutFromBounds(bounds, fine)`); `splitMeshesIntoCells` unchanged. **Also chunk roads, sidewalks and markings** (today never hidden): R1+R2 has 3x today's road area. |
| Minimap, MapScreen (`ui/Minimap.ts`, `ui/MapScreen.ts`) | draws segments as rects, intersections as boxes, avenues by axis; labels by axis | Draw edge polylines with width by class, blocks as `blockRing` polygons; labels along the longest edge of each street (rotate text to edge angle, flip > 90 deg). MapScreen adds the Brooklyn overview layer (section 6). `view.fit(net.bounds)`. |
| Missions, places, NavTargets, pointer router (`missions/content/places.ts`, `PointerRoute.ts`, `NavTargets.ts`, `story/AmbientNotices.ts`) | `blockById(id).faces.find(side)`, `streetById(id).offset`, corner = `(ns.offset, ew.offset)` | Places resolve by **real address or BBL** -> lot -> frontage point (`net.pointAt(edge, s)` + outward x sidewalk/2). Corners resolve by two street names -> the node incident to both (`cornerOf(net, 'Throop Ave', 'Kosciuszko St')`). PointerRoute already routes on the sidewalk Graph and boxes blocks: use `blockRing` polygons. A migration table (old block/face/t -> BBL) is WP9 grunt work. |
| Save game (`GameSave.ts`, main.ts 242 and 701) | pose clamped to `grid.bounds` | Clamp to `net.bounds`; save carries `map: 'grid'|'real'` and a pose saved on one map is **reset to home** on the other (positions do not translate: rows are 100 m in the grid, 82 m real). |
| The el (`transit/ElLine.ts`, `ElStructure.ts`, `TransitSystem.ts`) | straight viaduct at `EL_Z = -500`, x from -430 to 1190 | Path = the Broadway edges' polyline (J/Z) from the R1 stub at Flushing to the R2 stub at Gates, plus the **M el turning east onto Myrtle Ave** to Knickerbocker (Myrtle Av / Central Av / Knickerbocker Av stations; R2+ adds Myrtle-Wyckoff). Columns at 18 m along s on both curb lines; stations by name: Flushing Av, Myrtle Av, Kosciuszko St, Gates Av. Train kinematics become arc-length along the path (`pointAt`), timetable unchanged. |
| Skyline (`Skyline.ts`), curbside/props bounds | `grid.bounds` rect | `net.bounds` or the extent polygon (better: ring outside the extent polygon). |
| Tests that hard-code counts | `grid.test.ts`/`grid-east.test.ts` (45 blocks, 60 intersections, 180 faces), `real-blocks.test.ts` (40), `trafficlights.test.ts` (60), `grid-chunks.test.ts` | Keep as-is for the grid path; add parallel `*-real.test.ts` with counts read from `roadnet-core.json` at test time (no literals beyond ranges). |

## 5. Phases

Counts measured with the pipeline (R3/R4 from the cached Brooklyn download, highways excluded, so approximate). "Area" is the
sum of block centreline areas. Today's world for comparison: 45 blocks, 60 intersections, about 1.1 km^2.

| Phase | Extent (lat,lon ring, before the 45 m margin) | Edges / km | Blocks (+islands) | Signals | Area | Data |
|---|---|---|---|---|---|---|
| **R1** Bed-Stuy core, real | Tompkins/Flushing 40.70011,-73.94725; Broadway/Flushing 40.70073,-73.94193; Broadway/Malcolm X 40.6947,-73.9312; Malcolm X/Greene 40.69077,-73.93062; Tompkins/Greene 40.68911,-73.94506 | 172 / 21.3 | 58 (+3) | 85 | 1.23 km^2 | in core file |
| **R2** across Broadway to Knickerbocker, Myrtle to Gates | Broadway/Malcolm X; Broadway/Myrtle 40.69699,-73.93522; Knickerbocker/Myrtle 40.69882,-73.91837; Knickerbocker/Gates 40.69685,-73.91489 (computed); Gates/Broadway 40.6895,-73.92207; Broadway/Greene 40.6915,-73.92556; Malcolm X/Greene | 207 / 21.2 | 78 (+4) | 108 | 1.06 km^2 | in core file |
| R2+ (optional) north triangle to Flushing + Myrtle-Wyckoff tail | Broadway/Flushing; Bushwick Ave/Flushing 40.70192,-73.93698; Knickerbocker/Flushing 40.70473,-73.92874; Myrtle/Wyckoff 40.69957,-73.91107 | 196 / 19.9 | 61 (+3) | 77 | 0.93 km^2 | in core file |
| R3 Williamsburg south side | Tompkins/Flushing; Kent/Flushing 40.69847,-73.9602; Kent/Grand 40.71621,-73.9661; Union/Grand 40.71096,-73.95113; Union/Broadway 40.70548,-73.95024; Broadway/Flushing | 540 / 45.3 | 179 | 231 | 1.76 km^2 | +29 kB |
| R4 Ridgewood corner | Myrtle/Wyckoff; Wyckoff/DeKalb 40.70432,-73.91923; Seneca/DeKalb 40.70764,-73.91584; Myrtle/Seneca 40.70042,-73.90368 | 150 / 13.4 | 43 | 66 | 0.50 km^2 | +7 kB |

**Scale warning.** "+20 blocks" in the user's words is about 0.5 km^2 of the old 250 x 100 m cells. R2 as drawn (Broadway to
Knickerbocker, Myrtle to Gates) is 1.06 km^2: it doubles the world. The natural smaller cut is Broadway to **Central Ave**
(about half R2, keeps the Myrtle M el to Central Av station). I recommend building R2 as drawn but in two steps (R2a to Central,
R2b to Knickerbocker) and gating R2b on the perf numbers below.

**Render budget** (`TIER_BUDGET`: phone 300k/150, low 500k/220, medium 1.2M/320, high 2.0M/450 triangles/draws). Frame cost
depends on what is in range, not on world size, *if* culling covers everything. Density per km^2 in R1 is close to today
(58 vs 45 blocks over a similar area, real 82 m rows instead of 100 m: about +25 % frontage per km^2, hence about +15..25 %
building triangles in view). Expected: R1 phone/low +10..20 % triangles in view, draws flat once roads are chunked (WP4);
R2 adds the same density again, frame cost about flat, **memory and build time about 2x** (world build is eager today).
Low tier is already over its draw budget (308..322 draws vs 220, PERF2 open): R1 must not ship before PERF2 closes and WP4
chunks roads. Gate per phase: one capture per tier at 7 standard views, triangles and draws within `TIER_BUDGET` (phone
excepted only where PERF2 already excepts it), world build time on low <= 1.3x today (R1) and <= 2x (R2) or lazy chunk build.

**Artifact size.** The single file is at 11.72 MB of 12 MB. RoadNet core R1+R2 adds 30 kB raw (it is inlined raw, not gzipped).
The artifact overview layer must ship as base64 gzip (47 kB gzip -> about 63 kB base64, decoded with `DecompressionStream`),
not raw JSON (131 kB). PLUTO lot data for R1+R2 is the real risk: the current per-lot JSON is the biggest data item; WP6 must
emit a quantised lot table (BBL, edge, s0, width, depth, floors, class, year: about 12 bytes per lot, ~7,000 lots ~ 90 kB raw)
and the grid-map lot data must be deleted when `?map=real` becomes the default. Hosted/native: load `roadnet-core.json` and
lots as lazy fetches. R3/R4 are hosted/native only.

**Acceptance per phase.**
- R1 (`?map=real`): every CSCL street in the extent present by name (test against the raw cache); every R1 block has
  buildings on every non-stub side; cars drive every edge both legal directions without leaving the road for 10 minutes of
  sim (headless sim test: off-road time 0, stuck agents < 1 %); peds cross only at crosswalks; signals cycle at every
  `signal` node; minimap/map labels match the SVG; missions that exist in R1 complete (story missions bound by address);
  budget gate above; artifact <= 12 MB.
- R2: the same plus the el on Broadway (J/Z) and Myrtle (M) with stations at real positions (+- 20 m), Bushwick 45-degree
  blocks with correctly oriented buildings (no building facing a side street by mistake: test that every lot's outward
  normal points to its frontage edge within 10 deg), Broadway wedge lots handled.
- R3: BQE in its trench (level -1) with streets crossing above it (grade separation already detected by the pipeline);
  waterfront at Kent Ave from the shoreline layer.
- R4: Queens street names and the Brooklyn/Queens line at Wyckoff Ave (borough code 4 rows already fetched).

## 6. The Brooklyn overview map

Built by `scripts/build-brooklyn-overview.mjs` from all 26,042 Brooklyn CSCL rows (+ Queens near Ridgewood), the shoreline
(Brooklyn, Queens, Manhattan land) and 54 NTA label points, in the RoadNet frame, chains merged per street name:

| File | For | Size |
|---|---|---|
| `public/data/brooklyn-overview.json` | hosted + native, lazy `fetch` when the map screen first opens | 236 kB raw, **93 kB gzip**, 81 kB brotli; 5,202 chains, 1,978 names |
| `src/world/data/brooklyn-overview-lite.json` | artifact (dynamic import; ship as base64 gzip, see section 5) | 131 kB raw, **47 kB gzip**; 4,246 chains, names for arterials/highways only |

Format v1 `{ v, f, q, names, land: [[boro, x0, z0, dx, dz, ...]], st: [[name|-1, cls, x0, z0, dx, dz, ...]], nta: [[name, x, z]] }`.
Drawing (WP8): water `#0a121e`, Brooklyn land `#1c1e22`, other boroughs darker; overview streets at 25 % luminance by class
(street < avenue < arterial < highway); **built streets bright** = the live RoadNet drawn on top in the game's map style;
pan (drag), zoom (wheel/pinch, 0.05..4 px/m), labels by zoom: NTA names below 0.15 px/m, arterial names from 0.15, all street
names from 0.6 (from the hosted file; the lite file shows arterials only); the player arrow, mission blips and the built-area
outline. The map is in the grid frame (Brooklyn appears rotated 8.6 deg); an option rotates the view by -8.6 deg to true north.

## 7. Work packages

Model column: haiku = grunt work (data, conversion, fixtures, mechanical edits), sonnet = behaviour-changing code.
"Done" always includes `npx tsc --noEmit` clean and the package's tests green; no edits to src/main.ts (WP0 hands Fable a
snippet).

| WP | Model | Owns (files) | Input -> output, interface | Done when | Depends / parallel |
|---|---|---|---|---|---|
| WP0 map switch | sonnet (small) | `src/world/roadnet/MapSource.ts`, snippet for Fable | `?map=real` -> `{ kind, net: RoadNet, grid?: GridModel }`; `loadRoadNet(): Promise<RoadNet>` (inline core in artifact, fetch in hosted) | flag read, both paths boot, test for the selector | none; first |
| WP1 derived geometry | sonnet | `roadnet/derive.ts` | `deriveGeometry(net, opts): Derived { nodePolys: Vec2[][], curbRings: Vec2[][], buildingRings: Vec2[][], returns }` with curb returns (r 4.5/6 m), handles 3..6-leg nodes and acute (Broadway) angles | fixture tests: 4-leg square equals grid boxes; 45 deg wye has no self-intersection; all R1+R2 rings simple (no self-crossing) | after RoadNet (done); parallel with WP2, WP3 |
| WP2 lane graph + signals | sonnet | `roadnet/lanes.ts`, `roadnet/signalPhases.ts`, TrafficLights `fromRoadNet` | `buildLaneGraph(net, derived): LaneGraph`; `signalGroups(net, node): number[][]` (approach edges per phase) | on the grid adapter: lane graph node count within 5 % of Grid.ts and traffic tests pass with it; on real: every directed edge reachable, no dead lane except stubs; 5-leg Broadway nodes get 3 phases | WP1; parallel with WP3 |
| WP2b signal data | haiku | `scripts/import-signals.mjs`, `data/raw/lpi.json` | `mqt5-ctec` points -> mark nodes within 15 m as `signal` | report of changed nodes | parallel |
| WP3 sidewalks + crosswalks | sonnet | `roadnet/sidewalks.ts` | `buildSidewalkGraph(net, derived): { graph: Graph, crosswalks: Crosswalk[] }` (Crosswalk gets `edge`) | connected per block cluster; every signal node has a crosswalk per approach; ped-spawn tests pass on both maps | WP1; parallel with WP2 |
| WP4 road meshing + chunking | sonnet | `roadnet/meshRoads.ts`, `render/Culling.ts` (`chunkLayoutFromBounds`), WorldBuilder hook behind the flag | `buildRoadMeshes(net, derived, mats, tier): THREE.Group`, roads/sidewalks/markings chunked | R1 renders with no z-fighting at intersections, curbs continuous, markings stop at stop bars; draw calls for roads <= today's per view | WP1 |
| WP5 faces + lots frame | sonnet | `roadnet/faces.ts`, `LotSubdivider` real path | `blockFaces(net, derived): BlockFace[]` (general), lot placement in the face frame; wedge and acute-corner rules | every lot's outward within 10 deg of its frontage normal; no building overlaps another (AABB in lot frame) | WP1; parallel WP2/3 |
| WP6 PLUTO lots + footprints | haiku (fetch) then sonnet (assign) | `scripts/import-lots-real.mjs`, `src/world/data/lots-r1r2.json` | PLUTO + footprints for R1+R2 -> `{bbl, block, edge, s0, width, depth, floors, cls, year, front?}` quantised; sidewalk width per face from the curb-to-front gap | >= 95 % of PLUTO lots in R1 assigned to a block and edge; corner lots flagged; size <= 100 kB raw | data part now; assignment after WP5 |
| WP7 signs, props, furniture | sonnet | `signBlades.ts`, `props/*` real paths | per-node blades along edges; poles at derived corners; s-parameterised placement | one blade per street per corner; no prop on a roadway (`net.isOnRoad` test) | WP1, WP5 |
| WP8 map + minimap + overview | sonnet | `ui/MapScreen.ts`, `ui/Minimap.ts`, `ui/overviewLayer.ts`; haiku: lite base64 build step | draws RoadNet + overview (section 6), labels by zoom, pan/zoom | screenshots at 3 zooms; label test (no label off its street); artifact uses the lite blob | parallel from now (needs only RoadNet + overview files) |
| WP9 missions + saves | sonnet; haiku for the migration table | `missions/content/places.ts`, `PointerRoute.ts`, `NavTargets.ts`, `GameSave.ts`; `data/places-real.json` | places by BBL/address, corners by two street names; save `map` field | every mission place resolves on the real map; save across maps resets pose | WP5, WP6 |
| WP10 the el on Broadway + Myrtle | sonnet | `transit/*` real path | path from Broadway/Myrtle edges, stations by name, columns along s | train runs Flushing Av -> Gates Av and Myrtle Av -> Knickerbocker Av; transit tests on both maps | WP1 |
| WP11 tests and fixtures | haiku | `tests/unit/world/*-real.test.ts`, fixture updates | counts from data, not literals; grid tests unchanged | suite green on both maps | rolling |
| WP12 perf gate | haiku (captures) + sonnet (fixes) | capture scripts only | 7 views x 4 tiers, triangles/draws, build time | within budget (section 5) | after WP4, WP5 |

Parallel plan: wave 1 = WP0, WP1, WP2b, WP6-data, WP8; wave 2 = WP2, WP3, WP4, WP5, WP10; wave 3 = WP6-assign, WP7, WP9, WP11;
then WP12 and PLAYTEST. R2 is the same packages re-run on more data plus R2-specific acceptance (wedges, el on Myrtle).

## 8. Risks

1. **Intersection geometry at acute angles** (Broadway meets the grid at 45 deg; 5- and 6-leg nodes at Broadway/Myrtle,
   Broadway/Malcolm X/Lexington). Curb returns and stop lines can overlap. Mitigation: WP1 fixture tests on these exact nodes;
   fallback to a convex-hull intersection patch.
2. **Traffic AI on arbitrary turns**: agents assume 90-degree turns in places (corner speed, stop-line yielding). WP2 must run the
   existing traffic tests on the adapter first, then the real net.
3. **Perf/memory**: world 2-3x bigger; eager build and unchunked roads. WP4 chunking is a precondition for R2.
4. **Artifact 12 MB**: 280 kB headroom. Only quantised data in the artifact; delete grid lot data at switch-over.
5. **Missions and story bound to grid ids** (blocks r/c, faces N/E/S/W): WP9 migration table; until then real map runs
   missions in free-roam only.
6. **Data drift**: CSCL is updated weekly; the raw cache is committed and `--refresh` is explicit, so builds are reproducible.
7. **Signals are inferred** (no city signal inventory in Open Data); LPI points refine; mistakes are cosmetic.

## 9. Decision list for Fable

Approve:
- RoadNet as the single street model, the grid as an adapter, migration consumer by consumer behind `?map=real` (no branch).
- `REAL_FRAME` (origin Throop x Kosciuszko measured, 8.6 deg) as the world frame for all new data; existing grid coordinates
  stay valid only on the grid map; saves reset pose when switching maps.
- R1 as defined (Tompkins..Malcolm X, Flushing..Greene, cut by Broadway), then R2 in two steps (R2a Broadway..Central,
  R2b ..Knickerbocker) gated by the perf numbers; R2+ (north industrial triangle, Myrtle-Wyckoff tail), R3 and R4
  hosted/native only and later.
- The overview layer files as produced (93 kB gzip hosted, 47 kB gzip lite as base64 gzip in the artifact).
- Wave 1 now: WP0, WP1, WP2b, WP6-data, WP8 (WP8 delivers the visible "real Brooklyn map" early, independent of 3D work).

Recommend against:
- Faking Broadway on the grid any longer (the el over Flushing): it blocks Bushwick entirely.
- Storing lanes, curbs or intersection polygons in the data file (tunables change; derive them).
- Keeping the old 100 m row spacing anywhere on the real map (stretching real data to the grid loses the point).
- Putting R3/R4 data or the full overview into the artifact.
- Shipping R1 before PERF2 closes and WP4 chunks the roads.

Effort and risk (worker-days at sonnet speed, honest):

| Phase | Effort | Risk | Notes |
|---|---|---|---|
| R1 | 8-12 lane-days (WP0-WP9, WP11-12) | high (first time: intersections, traffic, lots, missions) | most cost is one-off generalisation |
| R2 | 3-5 lane-days | medium | wedges, el on Myrtle, perf gate; data already imported |
| R3 | 3-4 lane-days | medium-high | BQE grade separation, waterfront, Hasidic-area art direction care |
| R4 | 1-2 lane-days | low | Queens names, small area |
| Overview map | 1-2 lane-days (WP8) | low | can ship before R1 |
