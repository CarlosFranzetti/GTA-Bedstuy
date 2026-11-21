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
