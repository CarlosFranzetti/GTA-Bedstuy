# REALFIX task record (making the grown real map releasable)

Status: in progress (21 Nov 2026). Engineer: Marta Quill (REALFIX). Not committed by this lane.

## Findings so far

- Baseline of the sim files on the R3 net (commit 636100f data, scratch copy, same test files, `REAL_NET=r4` pointed at the r123 data):
  7 of 24 FAIL on R3 as well: red-light running on one lane (ln:917, a Broadway junction), cars on the kerb / in a building (12 and 2 samples),
  a pedestrian knocked down, turn connectors (4 over 6 m, limit 2), cops (closest 95 m, limit 25). So most of MAP4's red predates the growth.
  Log: scratchpad/realfix/r3-sim.log.
- Heap by stage on the R4 net (node, after gc, MB): net +4, derive +10, sidewalk graph +40, road meshes (CPU side) small, lane graph + walking graph +67.
  Counts: 48,209 sidewalk nodes / 103,680 edges, 84,156 lane nodes / 87,405 edges. These are string-keyed object graphs that TrafficSystem and
  Pedestrian read as `Graph` records, so the heap grows with the map area. (scratch test tests/unit/world/zz-realfix-mem.test.ts, removed at the end)
