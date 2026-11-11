# PERF2: bring phone and low back to budget (brief for Lena, from Greta Voss, ENGDIR)

You report to Greta. Measure before you cut, as always. No edits to src/main.ts (send Fable the exact lines). Never git stash, never commit.

## Numbers (11 Nov, current tree, `scripts/perf-breakdown.mjs`, 960x540, views 1 / 4 / 10)
| tier | view | triangles | draws | budget | vehicles in world |
|---|---|---|---|---|---|
| phone | 1 | 487 k | 172 | 300 k / 150 | 408 |
| phone | 4 | 503 k | 180 | | |
| phone | 10 | 489 k | 226 | | |
| low | 1 | 1.01 M | 396 | 500 k / 220 | 916 |
| low | 4 | 1.04 M | 416 | | |
| low | 10 | 1.05 M | 466 | | |
| medium | all | page OOMs on this box | | 1.2 M / 320 | |

Reference: 10 Nov low was 641 to 682 k and 282 to 325 draws. At 85acf0a (this morning), phone at the start view drew 270 k triangles and 120 draws with 192 vehicles and 2,426 meshes. Today that view draws 497 k and 183 draws with 408 vehicles and 4,641 meshes.

Raw data: perf JSON in the ENGINE scratchpad (`engdir/perf-now.json`, `engdir/perf-base.json` once it lands). World geometry by group, built in node at tiers low and high: buildings 1.44 M -> 2.20 M triangles (+53 %), and 108 -> 131 bytes per triangle, because the TEXVAR aTone/aStyle attributes add bytes to every vertex. Tree leaves 150 k -> 244 k, clutter bags 135 k -> 182 k, el sections 20 k, train cars 9 k.

## Same view, 85acf0a (this morning) vs now (view 1, scene pass, triangles/draws)
| category | phone before -> now | low before -> now |
|---|---|---|
| total | 257 k / 113 -> 487 k / 172 | 638 k / 278 -> 1.01 M / 396 |
| buildings | 154 k / 40 -> 323 k / 68 | 224 k / 93 -> 422 k / 161 |
| ground/roads | 19 k / 11 -> 36 k / 11 (same draws: city-wide merged meshes grew with the map) | 52 k / 18 -> 72 k / 18 |
| other (signals, el, train) | 19 k / 20 -> 42 k / 36 | 19 k / 20 -> 42 k / 36 |
| props | 0 k / 7 -> 2 k / 7 | 53 k / 29 -> 127 k / 30 |
| instanced-other | 13 k / 6 -> 22 k / 5 | 17 k / 9 -> 26 k / 9 |
| cars (near + far) | 7 k / 8 -> 2 k / 23 | 14 k / 26 -> 23 k / 54 |
| shadow: blob/casters | 21 k -> 31 k | 21 k -> 31 k |
| vehicles in world | 192 -> 408 | 415 -> 916 |

So buildings draw 28 more cells (phone) and 68 more (low) at a viewpoint that did not move, and every whole-city mesh (roads, markings, signals, casters) grew with the map, because nothing culls it. The cars stay cheap in triangles, but draws went from 8 to 23 on phone and from 26 to 54 on low, which probably reflects per-car look variants breaking the instanced far batches. Check it.

## What grew (by category, scene pass, phone view 1)
- **buildings 323 k / 68 draws**, about two thirds of the frame. The top entries are sums over every cell mesh of one material (TriBreakdown keys by path): `buildings:brownstone:1` 46 k, `cornice:0` 45 k, `awning` 34 k, `window:0` 33 k, `limestone:0` 28 k. In node, world building geometry grew 53 %. Find out how much of the drawn 323 k comes from cells that were not there yesterday (the northern rows, about 600 m away) and how much from the heavier facades. Unproven guess: the far and near cell distances for phone and low let northern cells and their far geometry into view from the old spots. This is the main regression.
- **signals: signal-poles 31 k, signal-lamps 22 k**, which is every one of the 60 intersections in one InstancedMesh, so nothing is ever culled.
- **phone sun casters: caster:buildings 31 k** in the shadow pass.
- **low:** props:bags 53 k, props:wires 32 k, skyline 35 k, shadow-proxies 92 k / 28 draws in the shadow pass, and 916 vehicles in the world. Vehicle population roughly doubled with the map; Omar's spawn-budget fix touched this, so check the count with him.

## Asks, in order
1. Split the drawn building triangles at view 1 by cell (TriBreakdown `top` with the cell path), and by whether each cell is near or far. Then cut whatever is new: cell distances per tier, the facade detail added to the far geometry, or the northern cells. Done when phone view 1 buildings fall below 200 k with no visible pop-in at the old viewpoints.
2. Signals: split poles and lamps into per-chunk InstancedMeshes, or cull them by distance like furniture (instanced thinning beyond the tier distance).
3. Low: check the shadow-proxy count (28 draws) and the props:bags / wires reach at the old viewpoints.
4. Only if 1 to 3 are not enough: the phone caster set.
5. Re-run `scripts/perf-breakdown.mjs --q phone,low,medium` (it now hides the canvas so the page survives). Done when every view is within `TIER_BUDGET` (`src/render/QualityTier.ts`) and `scripts/gate.sh` shows perf PASS.

Also yours, already decided: STREAM_RANGES for the real map, phone { detail 0, near 80, far 120 } and low { detail 80, near 160, far 380 }. Tune by up to 10 m so that buildings use at most 50 draws on phone and 110 on low.
