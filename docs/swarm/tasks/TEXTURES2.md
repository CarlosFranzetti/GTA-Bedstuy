# TEXTURES2: far buildings with facades, then more surface textures (lane notes, kept current)

Status: part 1 done and looked at, part 2 partly done (22 Nov 2026). Scratch: scratchpad/textures2/. Posts as "Ilse Marrow (TEXTURES2)".

## Before frames and what breaks the picture (first look, from the lead's frames deploy/out/new-sheet.jpg and stream/sheet2.jpg)
- Far buildings (the `buildings-far:*` box mesh in `buildingStream.ts`, `buildFarGeometry`) are one flat vertex colour per lot from a five-colour
  family table, a dark roof, no windows, no ground floor, no cornice, and the colour is NOT the detailed building's colour (it ignores the
  observed look the near build uses). They stand out as cream and pink slabs.
- Near detail is queued nearest-first at about 3 ms of work per frame, one lot per step: after a teleport the plain boxes stay until each chunk
  has built lot by lot (measured below).
- Everything else flat: one brick, one sidewalk slab, one tar roof.

## What was wrong (found)
1. Far massing: `buildFarGeometry` drew a box per lot in one vertex colour from a five-colour family table (it ignored the observed look and the
   colourway the detailed building uses), a dark roof, no windows. At 60 m and closer it shows whenever the near chunk has not built yet.
2. Near chunks arrive slowly: `RealBuildingStreamer.update` does 3 ms of work per frame, one lot per step, nearest chunk first by distance
   only. After a teleport or a fast drive that is seconds of plain boxes (numbers below).

## Part 1, what changed
- `src/world/roadnet/farFacade.ts` (new): the facade of the far massing, drawn in the fragment shader from per-vertex data of the lot. No
  texture, no new draw call, no new triangle (still 10 per building, one mesh per chunk). Wall colour = the colourway colour the detailed
  building gets (`lotColourway` on the same spec: PLUTO spec, per-BBL observed look, shop re-purposing) times `FAR_WALL_GAIN` 0.92;
  window rows by floors (parlour 3.3 m, 2.9 m above, the generators' numbers), bays by width, a door on a house, a stoop plinth, a shop band
  (glass, bulkhead, awning colour from the colourway) on lots with a shop, cornice line in the colourway cornice colour, roof in the
  colourway roof colour with strips, patches and bulkheads. Brick joints and window frames fade with the pixel footprint. At night each
  window is lit by the same rule as the detailed windows (about 40 percent, amber to pale, TV blue) and the strength follows the window
  material's own night intensity (`streamer.update` copies it). Interpolated lot bytes are snapped before hashing (else the windows speckle).
- `buildingStream.ts`: `buildFarGeometry(lots, looks?)` now writes `aWin`, `aLot`, `aTrim`, `aAwn` and quantised normals and colours
  (about 48 bytes a vertex instead of 36; 1.44 KB a building instead of 1.08 KB); `farHeight` mirrors the generators' storey rules so the box
  is as tall as the building that replaces it; non-finite lots are skipped (a NaN position makes the bounding sphere NaN and the whole chunk
  is culled). `looks` is the same hook the detailed build uses.
- `buildingsReal.ts`: `specForBuild(lot, looks)` (the spec a lot is built from), used by both.
- `colourway.ts`: `WallKind.roof` (11) and `Colourway.roof` (tar, old tar, silver coat, gravel, membrane, mineral cap; drawn after every
  other colour, so no existing colour changes). `toneFor` gives `tarRoof:*` a tone and kind.
- `lotTone.ts`: roof kind in the wall shader (the sheet's roof layer): colour per lot, 1 m strips and seams, fresh tar patches, ponding
  stains with a dried rim, gravel speckle that fades with distance. Zero memory.
- Stream priority: the streamer now takes the camera position (`realWorld.update` passes `cam.x, cam.z`, no main.ts change) and builds the
  chunks in front of the lens first (`FRONT_BONUS_M` 45 m); and, only for the per-frame call without an explicit budget, hurries while a
  chunk is missing within 90 m of the player: 6 ms a frame inside 90 m, 12 ms inside 45 m (`HURRY_*`), back to 3 ms once the near ring is in.
- Review hook: `scene.getObjectByName('buildings-stream').userData.streamer` (stats, ranges).

## Cost
- Triangles and draw calls: none added. Far-only frames at the same cameras, low, hosted build: before 283,385 / 183 draws, after 284,110 / 185
  (traffic differs between runs; the far geometry is the same 10 triangles a building, one mesh a chunk).
- Memory: no new texture, on any tier. Far geometry +0.36 KB a building (about +1.4 MB for the 4,000 buildings the low tier holds at 380 m,
  about +2 MB on medium and high at 520 m, under 0.1 MB on phone at 120 m). Phone texture memory unchanged.
- Fragment cost of the far shader: about 120 ALU on far pixels only; not measured here (software GL).
- Single-file build: 10,935,269 bytes (10.94 MB; budget 12 MB), no far-massing code in it.

## Stream-in time before (hosted build, desktop `?q=low`, software GL, this box was at load 15 to 19, so CPU ms are an upper bound)
Measured with `scratchpad/textures2/tools/arrive*.cjs`: teleport 500 to 650 m, then count `streamer.update` calls at the normal 3 ms budget.
- Lot tiles for the new spot arrive in 1.3 to 2.1 s of real time (fetch and place), then near chunks build lot by lot.
- Every chunk within 60 m built after 20 to 45 update calls (305 to 1,450 ms of CPU); every chunk within the 160 m near range
  after 157 to 322 calls (3.6 to 5.9 s of CPU, 8 to 12 chunks, about 450 ms per chunk). At 60 frames per second and 3 ms per frame that
  is 2.6 to 5.4 s in which the far massing stands in. At the game's start: 87 calls, 663 ms, 3 chunks still missing after the 2.5 s warm-up.
- Phone: see the table at the end.
