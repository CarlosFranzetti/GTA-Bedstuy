# SURFACES2: one facade sheet, wall looks and ageing (Tamsin Orrell)

Scope done: item 1 (facade sheet) in full, items 2 and 3 only where the wall shader needed a change (one change, below). Items 4 to 6
(geometry, openings, streets) were not started: see "Not done".

## 1. One facade sheet

What it is: the seven wall classes that LotBatch emitted as separate materials (red brick, painted brick, brownstone, limestone,
stoop, cornice, tar roof) are now layers of two texture arrays on ONE material (`brickSheet:0`, mesh name `buildings:brickSheet:0`).
- `src/textures/facadeSheet.ts` (new): `FacadeSheet`. Colour array (sRGB) and a second array with normal.xy in R, G and roughness
  in B (non-phone only). Layers are read from the library's own wall materials, so the painted fallback shows until the CC0 photo
  sets arrive and a photo override re-reads its layer (`schedule()`, 40 ms debounce; `finalize()` from `loadTexturePacks`). Tints
  (the cream and blue-grey painted brick) are baked into the layer. Layer side: `texSize(1024)` hosted, `texSize(512)` single file.
- `src/textures/lotTone.ts`: `patchLotToneSheet`. The existing per-lot wall shader (tone, soot, rain runs, carved brownstone,
  siding, stucco, panels, doors, cornice paint, wall signs) unchanged; its two compile flags (`LT_STONE`, `LT_CORNICE`) became
  per-vertex branches (`sheetFragMain`), the photo, its repeat, normal and roughness come from the array by `aLayer`.
- `src/textures/MaterialLibrary.ts`: layer materials carry `userData.sheetLayer` and a lazy `sheetMat` getter (a plain `get()` still
  paints one canvas); `facadeSheetMaterial()`, `finalizeFacadeSheet()`.
- `src/world/buildings/facade.ts` `LotBatch.flush`: geometry of a sheet layer goes to the sheet material with a float `aLayer`
  attribute (float, because the far clusterer keeps only float attributes). Windows, glass, awnings, signs, ironwork, metal and
  the facade-photo lots keep their own materials.
- Phone and low free the sheet's JS pixel copy after upload, and empty the layer canvases that nothing else draws with.
- `src/textures/packs.ts`: one line, `finalizeFacadeSheet?.()` at the end of `loadTexturePacks`.
- Tests: `tests/unit/textures/facade-sheet.test.ts` (5).

Measured with `scripts/perf3-breakdown.cjs` (hosted build, canvas hidden, noon, counts only). Table filled in at the end of this file.

## Notes for the lanes that touch this
- A wall class added to the sheet needs an entry in `SHEET_LAYERS` (and its key in `SHARED_AS` if variants fold onto it); at most 8 layers.
- `STREAM_MESH` (phone streaming) matches the sheet by the name prefix `buildings:brick`. `TRIM_MESH` no longer applies to cornices and
  stoops (they are in the sheet, so they are drawn with the walls and cost no extra call; their triangles are no longer trimmed at distance).
- `scripts/perf3-breakdown.cjs` now sets `ChunkCuller.streamBudget = 1e9` as well, otherwise the phone tier captures show no walls
  (the streamed cells are built on a 6 ms budget per update and the script draws only a few frames).

## Results (hosted build, `perf3-breakdown.cjs`, grid map, noon, 960x540, counts only; triangles / draws, all passes)
| tier / view | before | after | budget |
|---|---|---|---|
| low home | 372k / 269 | 403k / 223 | 500k / 220 |
| low junction | 451k / 254 | 488k / 194 | |
| low el | 372k / 277 | 380k / 228 | |
| low row | 248k / 177 | 248k / 167 | |
| phone home | 199k / 112 | 184k / 100 | 300k / 150 |
| phone row | 161k / 78 | 144k / 69 | |
| phone junction | 210k / 91 | 217k / 77 | |
| phone el | 180k / 91 | 166k / 78 | |

Low buildings alone, home: 104 draws before, 54 after (about 50 fewer). Low is 3 (home) and 8 (el) over its draw budget of 220, and the
junction is 12k triangles under the 500k budget (cornices and stoops are no longer trimmed at distance, they ride with the walls: about
+30k triangles at home and +37k at the junction). What is left per cell: windows, shop glass, shop-front sheets (`sf:*`), awnings,
signs, metal (doors, fire escapes), iron fences. Merging metalDark and the iron fences into the sheet is the next 20 to 30 draws.
The phone numbers before and after are from the same script after fixing it (`streamBudget`), phone before-numbers in an earlier run
were invalid (a second preview server on the same port served the new build).

Frames (all looked at; the sheet is a no-op to the eye, as intended: same walls, same relief, same staining, no seams between layers,
no stretched or flipped layer, night windows and wet street unchanged):
- before: `scratchpad/surfaces2/before/before-low-{row,junction,home,wall,pave}-12.png`
- after: `scratchpad/surfaces2/a2/a2-low-{row,junction,home,wall,pave}-{12,22}.png`, wet `a2-low-{row,pave}-12w.png`, phone `a2-phone-{row,junction}-12.png`
- phone perf frames `a2/a2p-grid-phone-*.png`, `before/bp2-grid-phone-*.png`.
My `wall` and `pave` camera positions were poorly aimed (the wall view looks into a shop window, the pavement view at the road): the 2 m
wall and standing-height pavement frames of the brief are NOT captured.

## Builds
Hosted: download +16 KB (code only; dist 38,515,031 -> 38,531,514 bytes on disk). Single-file: `index.html` 10.29 MB (budget 12 MB).
No new image assets, so no CC0 additions.

## Other changes
- Wall shader (`lotTone.ts`): on about a third of the lots the rain runs below the sills are rust-brown (iron anchors, window units).
  Soot, runs, efflorescence, damp base, repointed patches, painted-over graffiti, faded wall signs (invented wording), carved
  brownstone with a rusticated base and spalling, siding, stucco, panels and glazed brick already existed (earlier textures lane).
- Tests: `tests/unit/textures` 406 green. `tests/unit/world` + `render`: green except `realworld-draws` low (under-el 240 > cap 200) and
  medium (584 > 320), which were red before this lane (real-map caps) and are not fixed, and three stray probe tests another lane
  left (`_lmprobe`, `_lmdbg`, `_lment`). `tsc`: src clean; `tests/unit/world/landmarks.test.ts` has two type errors from another lane.
- The two "window emissive" checks in `materials.test.ts` (`setNight toggles...`, `shop glazing night emissive...`) pass in the current tree:
  their assertions already match the window shader's per-window lamp tone (emissive colour white, shop cap 0.35). Nothing was needed.
  (The two reds I saw and fixed were my own: `get()` must not build the sheet, hence the lazy getter.)

## Not verified
Real iPhone, real GPU memory, texture-array mip upload cost on a real device (one 4 to 30 MB upload at boot when photos land after the
first upload), the real map's draw numbers with the sheet (the map is on the same code path; its test is still over the cap), medium
and high tiers (not measured).

## Not done (scope)
Items 4 to 6 of the brief: cornice, lintel and stoop geometry, fire-escape landings, awning frames, window types by age, security gates
and shutters, curtained and TV-lit night windows, asphalt patches and oil, sidewalk joints and slab replacement. Items 2 and 3 got only the
rust-streak change above: no new brick bonds (header and soldier courses would clash with the stretcher-bond photo; needs a bonded
photo or a painted course atlas), no anchored rust streaks or AC stains (the shader does not know where fire escapes and units sit;
needs a per-vertex stain channel, `aStyle` is full).
Also: the study `docs/reference/gta4-5-study.md` was read; its façade rules (grime 0 to 60 cm and under sills, tint per lot, shared sheet,
10 to 15 % brick colour variance) match what the wall shader already does.
