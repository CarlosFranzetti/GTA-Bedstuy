# MAP4 task record (R4: the real map grown again)

Status: landed, partly verified (21 Nov 2026, night). Engineer: Ines Okafor (MAP4). Not committed by this lane.

Ask (owner, 21 Nov night): "grow our blocks by 5 in each direction and 2 streets each in between N, E, W, S."
Reading: the R3 outline pushed out 5 city blocks on the four cardinal sides and 2 streets on the diagonal sides, corners bevelled.

Note: docs/swarm/tasks/R3.md is a lighting-research record, not the growth record. The R3 growth (MAP7) is described in the headers of
scripts/import-streets.mjs, import-signals.mjs, import-lots-real.mjs, build-places-real.mjs and in extents.ts.

## The outline

`R4_RING` / `R4_OFFSETS` / `R4_EXTENT` in src/world/roadnet/extents.ts, beside R3. Picture: docs/reference/realmap-r4.svg (R3 orange, R4 cyan).
Area: R1+R2 3.22 km2, R3 9.80 km2, R4 15.15 km2 (+5.35 km2, +55 %).

A "block" is the spacing of the streets that run parallel to a side. Measured on 18,800 Centerline segments (rays from five points of each
side line, 21 Nov; fetch scripts/_map4-tmp-fetch.mjs, gaps below are metres from the R3 side line outward). Offsets are the distance to the
5th (cardinal) or 2nd (diagonal) parallel street, and the ring was pushed out by that, not snapped to the street (the measured gaps vary by
10 to 20 m along a side).

| R3 side | faces | parallel streets beyond the line (m from it) | spacing | blocks asked | offset used |
|---|---|---|---|---|---|
| 0 | north (Boerum St line) | 171, 254, 333, 412, 492 | 80 | 5 | 490 |
| 1 | north chamfer | (equal to side 0, so no notch) | 80 | 5 | 490 |
| 2 | north-east diagonal | 14, 95, 176 | 80 | 2 | 230 (80..150 m apart there) |
| 3 | north-east diagonal | 158, 313 | 150 | 2 | 230 |
| 4 | north-east tip, north | Flushing Ave at 997 (industrial, no street before) | big | 5 | 490 |
| 5 | east (St Nicholas line, Queens beyond) | 116, 288, 427, 601, 709 | 120..170 | 5 | 710 |
| 6, 7, 8 | south-east diagonal | 22, 101, 180 (Weirfield, Halsey, Eldert) | 80 | 2 | 165 |
| 9 | south (Jefferson Ave line) | 82, 165, 247, 329, 412 (Decatur) | 82 | 5 | 412 |
| 10 | west (Skillman St line) | 79, 191, 264, 341, 439 (Emerson Pl) | 70..110 | 5 | 439 |

The two square west corners (north-west, south-west) are chamfered by 260 m, so the shape is roughly an octagon. Outline vertices: 14.
`R4_EXTENT` is the ring grown by the 45 m margin, WITHOUT the bevel R3 used: the bevel made the one reflex corner (the north-east notch)
self-intersect.

## Counts (R3 -> R4)

| | R3 | R4 |
|---|---|---|
| nodes | 883 | 1,406 |
| edges | 1,456 | 2,360 |
| blocks (islands) | 581 (7+) | 939 (20), the 581 old block numbers kept |
| streets (names) | 152 | 226 |
| signalised nodes (NYC Open Data points) | 429 | 432 matched; the class rule adds the rest |
| lots in tiles | 20,843 | 32,601 |
| lot tiles | 55 | 83 |
| network json | 79.8 kB (23 kB gz) | 129.7 kB (36.9 kB gz) |
| lot tile bytes (public/data/real) | 1,528,895 | 2,408,030 (+0.88 MB; limit 6 MB) |

Phase of an R4-ring lot: 'R4' (lotTiles.ts LOT_PHASES). 11,320 lots are in the R4 ring.

Block numbers: src/world/landmarks/ sites refer to R3 block numbers. import-streets.mjs --r4 keeps them (matched by ring centroid and area
against src/world/data/raw/r3-block-keys.json: 581 of 581 matched) and appends the 358 new blocks. Edge and node numbers did change
(nothing outside the data files refers to them: lot tiles and the places table are rebuilt from the new net).

## What was done to the data

- Scripts extended, not forked: `import-streets.mjs --r4`, `import-signals.mjs --r4`, `import-lots-real.mjs --r4`, `build-places-real.mjs --r4`.
  Raw downloads in cache/real-r4/ (git-ignored); queries and dates in src/world/data/raw/*-r4.query.json. MapPLUTO is read for BK and QN
  (the east edge reaches Ridgewood and Glendale in Queens). Datasets and dates are in docs/CREDITS.md.
- New files: roadnet-r4.json, roadnet-controls-r4.json, places-real-r4.json. The three *-r123.json files are removed (git history has them);
  MapSource.ts and realWorld.ts load the r4 files.
- Dead-end stubs at the boundary: kept, they are the design (a street leaving the built extent becomes a `stub` node, traffic lanes run to
  it and despawn, and spawn there): 152 stubs, 24 true dead ends. Nothing to close.
- Bad blocks (building ring leaves the kerb ring): 27 of 939 now (3.0 %; R3 had 18 listed). Seven are over 1,200 m2, as are the two Broadway wedges:
  470 (25,000 m2 at 1047,-542), 670 (19,700 at 1143,36), 142 (13,400 at -1318,-1402), 399 (8,100 at -1536,-822), 56 (6,200 at -673,-1792),
  308 (3,400 at 175,-1054), 163 (1,700 at -266,-1462). They get no buildings in the game. `deriveGeometry(net, { repairRings: true })` fixes all but 142,
  but derive.ts says the five-minute traffic sim then drives cars into the new building colliders, so it stays off. NOT changed.
- One-ways, levels: carried by the Centerline import as before (trafdir, level codes). Elevated and tunnel pieces are level != 0 edges and are
  not driven. Expressways and the BQE/Interstate pieces at the edge: class `highway` or `ramp` edges are drawn but have no lane graph
  (lanes.ts skips them); none was modelled.
- Elevated railway: the el kept its R3 length. Before, `northEnd` took any Broadway end and chainEdges took the first branch at a fork, which on
  the bigger net picked a Williamsburg piece and a Hooper St spur (489 m of el). Now the chain is the one joined to Myrtle Ave, goes straight at
  forks, and is cut where it leaves R3_EXTENT (elReal.ts). The result equals the R3 paths (3,605 m and 3,916 m).

## Speed-ups found while measuring (boot would have grown with the map)

Profiled in node on the R4 net (`scripts/_map4-tmp-prof.mjs`, removed): `sidewalks.snap` scanned every ring segment for every crosswalk end (4.6 s)
and `trafficReal.walkableGraph.inBuilding` scanned every building ring for every sample point (2.1 s). Both now use a grid:
buildSidewalkGraph 2,090 ms -> 200 ms (R3 net: 985 ms), makeRealTraffic 4,145 ms -> 2,230 ms (R3 net: 2,160 ms). Same results (ties visit in
the same order).

## Street furniture

`buildRealProps` was told `region` = first two rings + 150 m, but the corner lamps and street-name blades ignored it (they stood on the whole
map). Now corners follow the region too. The outer rings get furniture from `propsStream.ts` (`RingPropsStreamer`): the same generator per 512 m
tile (edge by midpoint, junction by node), built as the player comes within the tier chunk range, dropped beyond range + 500 m, meshes hidden beyond the
tier's chunk range. Whole R4 at once would be 9,127 meshes and 4.1 M triangles; a tile is 70..110 ms, about 200 meshes, 75 k triangles.
Not done (needs main.ts or NightLights): the pooled night lights are sized once at start, so lamps of streamed tiles are lit posts only.

## Roads

All roads are still built at boot (one mesh set for the whole net, split into cells). meshRoads.ts used 256 m cells above 150 k road triangles,
which gave 40 more draws per street view; the R4 net is over the threshold, so big nets now use 1,024 m cells (`BIG_NET_CELL_M`). Road meshes are
NOT streamed: that is the one thing in the brief left undone (see "What is rough").

## Elevated railway speed-up

`elReal.blockedAt` scanned every node polygon and every leg for every column (2.6 s on R3, 4.6 s on R4); now grids: allColumnSpots 2,636 -> 68 ms.

## Costs, before (commit 636100f, the R3 map) and after (this tree)

Hosted build, `?map=real`, headless SwiftShader Chromium 640x360, canvas hidden, `scripts/map4-probe.mjs`. Counts and heap only; the wall times
are software-rendered and are not reported. Stage times are `rw.stats.ms` (ms, JS on this box, other lanes were running, so +-30 %).

| | R3 low | R4 low | R3 phone | R4 phone |
|---|---|---|---|---|
| JS heap after boot (MB) | 1,049 | 1,087 to 1,207 (4 runs) | 339 | 394 |
| world meshes / triangles | 4,405 / 1.98 M | 3,537 / 2.00 M | 3,762 / 1.40 M | 2,897 / 1.42 M |
| spawn draw calls (total / scene) | 204 / 159 | 229 to 265 / 184 to 220 | 88 / 83 | 94 / 89 |
| spawn triangles | 399,751 | 315,000 to 333,000 | 389,633 | 283,293 |
| net+derive ms | 89 | 140 to 290 | 164 | 113 |
| sidewalks ms | 890 | 180 to 430 | 1,384 | 174 |
| roads ms | 239 | 380 to 560 | 313 | 349 |
| buildings ms | 2,007 | 2,000 to 2,700 | 1,349 | 1,314 |
| el ms | 2,404 | 100 to 170 | 2,485 | 114 |
| props ms | 527 | 510 to 990 | 677 | 657 |
| traffic ms | 2,409 | 2,800 to 3,300 | 2,388 | 2,226 |
| boot download (bytes, all responses) | 22,776,690 | 22,934,586 (+157,896) | | |

Reading: boot JS time is about the same or lower (the two quadratic scans and the el column scan were fixed), but the heap is 4 to 16 % higher and the road
draws at the spawn are higher (37 draws for roads against about 9), because the roads, the lane graph and the derived rings are all whole-map.
Deep in the new ring (low, 640x360, same run): north (Hooper St) 294 calls / 364 k triangles; south (Mac Donough St) 303 / 456 k; east (Woodbine St,
Ridgewood) 190 / 201 k; west (Classon Ave) 243 / 312 k; south-east diagonal (Weirfield St) 377 / 611 k (a shopfront close-up with a police car:
over the low budget on that one view, a dense block, not map size); north-east diagonal (Scott Ave) 173 / 109 k. Resident ring furniture
there: 5 to 6 tiles, 600 to 860 meshes, 190 k to 305 k triangles (most hidden beyond the range). Each spot had 16 to 41 cars within 200 m, 3 to 15 parked.

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run tests/unit/world --maxWorkers=1`: 45 files, 850 passed, 1 skipped. Changed: `roadnet-r123.test.ts` is now `roadnet-r4.test.ts` (reads the
  r4 files; adds the R4 extent tests; bad-block bounds 5 -> 8 big blocks and "all but one repaired", file size bound 120 -> 200 kB), `derive.test.ts` loads r4.
  landmarks.test.ts passes only because the 581 R3 block numbers are kept.
- `npx vitest run tests/unit/sim/realtraffic-5min.test.ts realtraffic-turns.test.ts realtraffic-cops.test.ts --maxWorkers=1 --testTimeout=900000`: 24 of 24 pass.
  These run on the CORE net (R1+R2), not the grown map, so they say nothing about R3 or R4 streets. `REAL_NET=r4` (new, in realtraffic-run.ts; `REAL_PLAYER="x,z"`
  moves the player) runs them on the whole R4 net: 16 pass, 8 fail:
  5 min x 2 seeds: one to three cars cross Broadway x Malcolm X Blvd (986,-200) 5 to 18 s into red (lanes of edges 1558 and 1563), three or four car samples on the kerb and inside a
  building on Willoughby Ave at (1040,-485) (the Broadway wedge, bad block 470), seed 4242 has 49 moving cars against a limit of 48;
  turns: 4 connectors deviate more than 6 m (limit 2, which pins the core net);
  cops: one patrol spawns (needs 2) and the closest cop is 100 m from the player (limit 25) with the player in the middle of the bounds.
  The 5-minute failures are in the old core area, and MEMORY.md already lists the kinds (a red-light run, cars off road) as known red on the grown map; I did not check
  that they also fail on the R3 net, and I did not fix them.
- Single-file build: `npx vite build` index.html 10,805 kB (unchanged), no `RingPropsStreamer`, `lots-index`, `Hooper St` or `furniture-real` strings in it;
  the import rule (`grep "roadnet/" src`) prints only the known lines.

## What is rough or missing

- Roads, the lane graph, the sidewalk graph and the derived rings are built for the whole net at boot: heap +4 % (low) and +16 % (phone), spawn road draws up.
  Chunked road building (per 1,024 m cell, as the furniture is) is the next step; the 1,024 m cell split in meshRoads.ts already gives the seams.
- Night lights of the streamed furniture: NightLights sizes its lamp arrays once; ring-tile lamps are lit posts without a pooled light. Needs `NightLights` to take a lamp list that grows
  (`RingPropsStreamer.lamps` is the live list) and one line in main.ts.
- 27 bad blocks (7 big) have no buildings, see above; only 5 of the 27 are new blocks (670, 686, 698, 726, 865); the rest were already bad on R3.
- R4 furniture is procedural like R3's (the street tree census and hydrant files are not used by propsReal.ts at all).
- Big roads at the edge: highway and ramp edges are drawn, not driven, nothing modelled. Queens (Ridgewood, Glendale) is in the east: its lots are MapPLUTO QN.
- The R4 sims on the grown net are red in the places above.
