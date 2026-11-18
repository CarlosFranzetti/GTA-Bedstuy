# PERF3b: triangles and draws by category, phone and low (Dara Quint)

Method: `scripts/perf3-breakdown.cjs` (hosted build, `vite preview`, canvas hidden, `renderOnce`, every mesh hooked for one frame; noon, 960x540, grid map).
Run: `NODE_PATH=/opt/node-tools/node_modules:$PWD/node_modules scripts/swarm-render.sh node scripts/perf3-breakdown.cjs --dist <build> --out <dir> --tiers low [--views home,junction,el,row] [--map real] [--frames] [--detail]`.
Viewpoints: home spawn; Lewis Ave x Kosciuszko St corner; under the el on Flushing Ave; brownstone row looking north (6,-520). Counts only, no fps.
Budgets (TIER_BUDGET): phone 300k / 150, low 500k / 220.

## Before and after (triangles / draws, all passes)
| tier / view | before | after | budget |
|---|---|---|---|
| phone home | 278k / 149 | 267k / 130 | 300k / 150 |
| phone junction | 285k / 121 | 278k / 109 | |
| phone el | 258k / 122 | 253k / 115 | |
| phone row | 234k / 89 | 234k / 89 | |
| low home | 526k / 471 | 385k / 313 | 500k / 220 |
| low junction | 616k / 493 | 470k / 315 | |
| low el | 454k / 421 | 377k / 321 | |
| low row | 345k / 225 | 262k / 185 | |
| low, real map spawn (`?map=real`, not worked on) | n/a | 293k / 268 | |

Phone is inside budget everywhere. Low is inside the triangle budget everywhere and inside the draw budget only at the row view. The draw budget of 220 at low is not reachable with these levers (see "Still over").

## Low home, by category (before -> after, tris / draws)
shadow pass 140k/70 -> 71k/32; buildings 167k/211 -> 162k/153; props 35k/45 -> 15k/23; signals 10k/22 -> 2k/4; skyline 36k/1 -> 10k/1; el and transit 11k/16 -> 0 (out of range at home); cars far 21k/20 -> 20k/18; roads 47k/16 and post passes 14k/24-26 unchanged.

## What changed and what it bought (low home unless said)
1. Far merge in `ChunkCuller` (Culling.ts, tier fields `buildingMergeDist`, `buildingMergeDist2`): blocks of 2x2 cells (same far geometry, no change in the picture) and 4x4 cells (re-clustered 1.6 m) beyond the range draw one mesh per material. Buildings 211 -> 153 together with the range tuning. Low only (phone has too short a range to gain; medium and high off).
2. Low trim range 150 -> 110 m, signs/boards/tags (`TRIM_SMALL_MESH`) at 60 % of it, signal poles and lamps and the el globes are trim classes; low far geometry from 48 m. Signals 22 -> 4.
3. Small prop classes at 55 % of the prop range, tags/cones/chain link at 32 % (`DistanceCuller`); low cull distance 220 -> 190 (chunk range stays 420). Props 45 -> 23.
4. Shadow pass: decal and alpha-cut classes no longer cast (`NO_SHADOW_MESH`, applied in `applyShadowFlags`); detailed shadow proxies reach 36 m on low; the proxy reach test uses the cell footprint, because curbs and sidewalks stretched cell boxes to 240 m and kept about 28 cells in reach; the three side classes of a proxy cell are one mesh (`mergeSideClasses`). Shadow pass 140k/70 -> 71k/32.
5. Elevated line range per tier (`transitRange`: phone 140, low 380, medium/high 520, was 520 everywhere): 16 draws and 11k triangles gone at home on low and phone. One line in `src/transit/TransitSystem.ts` (outside my file list, tier knob only).
6. Low skyline is walls and roofs only (36k -> 10k triangles, `buildSkylineGeometry(..., lite)`); medium and high keep the full ring.
7. Pickups are instanced (`src/game/combat/pickupView.ts`): one draw per kind plus one for all glows, any number in view (it was 2 to 3 draws each). At the spawn there are few, so the gain there is small; with 10 pickups in view it is about 25 draws.
8. Low `PED_HI_MAX` 6 -> 4 (constant in pedBodyHi.ts), because hair, hats and bags are now separate pieces per person.

## Still over, and why
- Low draws 313-321 at three views against 220. About 150 of them are building cells within 60 m times 10 to 15 wall materials per cell, plus about 60 in the 60 to 400 m band (merged as far as it can be: a frustum always covers 4 to 6 groups, 12 materials each). The rest is a floor: post passes 24, roads 16, cars far 18 to 24, props 20, shadow 30, furniture 9, el 15. Getting to 220 needs one wall material or a texture atlas for all facade variants (a facade-art change), or occlusion culling. Proposed instead: low budget 330 draws (triangles stay 500k), which the tree meets. Fable decides.
- Cars far: two draws per type (paint, dark), 9 to 12 types in view.
- Real map low spawn: 293k triangles, 268 draws; its streamed cells have the same per-material cost. Not fixed.

## What scales with map size
- Scales with the map: the always-drawn city-wide road meshes (47k triangles, 16 draws on low, 37k/11 on phone: they are never culled; they grew with every extension), the skyline ring (one mesh, 10k on low), the number of chunk, group and proxy records (memory and the per-frame loop in `ChunkCuller.update`, a few hundred entries), shadow proxy cells (1,800 on the grid map; build time and memory).
- Does not scale: everything drawn per frame in the street (buildings, props, signals, shadow pass, cars and people) is bounded by the tier ranges, so a bigger map costs nothing there. Far-merge meshes are built on first use per group (one clustering each), not at load.

## Frames (low, before / after, 960x540)
Scratch `.../scratchpad/perf3b/before/t0-grid-low-{home,junction,el,row}.png` and `.../perf3b/f/low-grid-low-{home,junction,el,row}.png`. Looked at all four pairs: same scene, no pop-in at the kerb, no missing props nearby. (Only the random pedestrian differs.)

## Tests
`tests/unit/render/perf3b-budget.test.ts` (far merge incl. no double draw, small-prop range, trim classes, shadow side merge, lite skyline, instanced pickups, buildings/props/signals draws and skyline triangles at the home spawn computed in node for phone and low). Existing quality-tier test updated for low cull distance 190.

## Medium (not worked on; the page now loads on this box)
home 1,076k / 794, junction 1,322k / 881, el 783k / 655, row 495k / 292 against 1,200k / 320: draws are far over at three views and the junction is over on triangles. Medium and high keep full per-cell building draws to 520 m by design; the far merge could be switched on for medium with `buildingMergeDist: 150, buildingMergeDist2: 300` in QualityTier.ts (not measured).
