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

## Stream-in time after (same script, same box and load class; frames = `update` calls)
| spot | tier | chunks within 60 m built: before | after | all chunks inside the near range: before | after |
|---|---|---|---|---|---|
| +500, -100 | low | 20 frames | 12 | 234 | 192 |
| -500, +100 | low | 25 | 4 | 157 | 129 |
| +100, +650 | low | 45 | 20 | 322 | 329 |
| +500, -100 | phone | 29 | 2 | 74 | 38 |
| +100, +650 | phone | 61 | 11 | 61 | 11 |
(phone -500, +100: nothing to build in the near range at that moment on the "after" run, so the pair is void.) At 60 frames a second the
nearest blocks (within 60 m) now arrive in about 0.1 to 0.3 s instead of 0.3 to 1 s; the whole 160 m ring (low) takes the same 2 to 5 s
because beyond 90 m the budget is still 3 ms a frame, but those blocks now stand there as buildings, not slabs. A hurried frame spends up to
12 ms on building on top of the frame's own work: a short hitch only while arriving, never while walking (chunks at walking pace start at
the 160 m edge). CPU ms are not comparable between runs on this box (load 15 to 19). Lot tiles for a new spot arrive in 0.5 to 2 s (low) and,
under load, up to 10 s on the emulated phone; that wait is not changed here (the tile loader is nearest first, two at a time).

## Phone memory (memprobe3, emulated iPhone 13, hosted build, scratch `mem-*-phone-*.log`)
| | JS heap after boot and GC | texture GPU MB | live canvas MB | geometry MB |
|---|---|---|---|---|
| real map, before | 149.3 | 66.8 | 28.1 | 127.2 |
| real map, after | 150.4 | 66.8 | 28.1 | 128.3 |
| grid, before | 84.1 | 84.6 | 24.6 | 100.0 |
| grid, after | 84.2 | 84.6 | 24.6 | 101.2 |
No texture or canvas memory added; the +1.1 MB is the larger far geometry plus run-to-run noise. Phone draws at the spawn view are unchanged
(far-only frames 69 / 68 / 93 draws, 211k to 216k triangles incl. everything else in view).

## Frames (all looked at; software GL, 640 x 360 low, 591 x 1007 phone; scratch `scratchpad/textures2/f/`)
Same camera, same hour, three states: old massing (b0), new massing (a6 far), detailed buildings (a6 near, the target the massing must match).
- Best pair 1, day, the avenue corner: `b0/v0-low-17.5-far.jpg` (cream and pink slabs) against `a6/v0-low-17.5-far.jpg`; target `a6/v0-low-17.5-near.jpg`.
- Best pair 2, day, the DeKalb corner: `b0/v2-low-17.5-far.jpg` against `a6/v2-low-17.5-far.jpg`; target `a6/v2-low-17.5-near.jpg`.
- Best pair 3, the phone tier: `b0/v2-phone-17.5-far.jpg` (a grey slab) against `a6/v2-phone-17.5-far.jpg`; target `a6/v2-phone-17.5-near.jpg`;
  the three side by side: `f/phone-v2.jpg`.
- Night, the massing against the detailed windows: `a6/v0-low-22-far.jpg` and `a6/v0-low-22-near.jpg`, `a6/v2-low-22-far.jpg` and `-near.jpg`
  (the first night run speckled the lit windows; fixed by snapping the interpolated lot bytes, `a6` is after the fix).
- Roofs, a roofscape from 38 m: `a5/roof-low-17.5-near.jpg` (per-lot roof colours; no before frame was taken, the old roofs were one tar texture).
- Close views, low: `a5/walk-low-17.5-near.jpg` (sidewalk), `a5/road-low-17.5-near.jpg`, `a5/wall-low-17.5-near.jpg`.
How the massing compares to the detailed building: heights agree to about a metre on the lots looked at, wall colour and cornice colour agree,
the massing has no stoops, bays, fire escapes or shop signs, its windows are a little bigger and lower in contrast, and its lit windows at night
are slightly larger and brighter. It also casts no shadow (the detailed buildings do).

## Part 2, what was looked at and what was done
Capture of the signature views on the real map (low, 17:30 and 22:00) showed that most of the list in the brief already exists in the wall,
street and sidewalk shaders: stucco, vinyl and panel kinds, glazed brick, repointed patches, soot, rain runs and rust runs, painted lower
storeys with peeling, painted-over graffiti, flaking cornice paint, roll gates with rust and tags, awning fade and mildew; sidewalks with heaved
slabs, cracks, gum, tree pits, kerb silt; asphalt with wheel tracks, patches, utility cuts, cobbles, bus pads, steel covers. The sameness that
broke the frame was the far massing (Part 1) and the roofs. Done:
1. The far massing, above.
2. Flat roofs: one colour and tar photo for every roof before; now six surfaces by lot (tar, old tar, silver coat, gravel, membrane, mineral
   cap) with 1 m strips, seams, fresh tar and coat patches, ponding with a dried rim and gravel speckle, on the sheet's roof layer (no new
   material, no memory) and the same roof colour on the far massing. Seen from the roofscape frame and from the el.
Not done (the budget went to part 1 and its verification; each is still a real gap): brick bonds (needs the header courses aligned to the
photo's rows: a painted course atlas or a bonded photo), cast-iron and terracotta fronts on the avenues, frame-house siding by era on the
real map (the kind exists, the real-map rule that picks it does not), tile bulkheads on the flat shop-front material (`sf:flat`), bus-lane red and
bike-lane green, junction cobble by street type, skylights and bulkheads as geometry on roofs (the roof shader paints patches only).

## Tests and builds
- `npx vitest run tests/unit/world tests/unit/textures tests/unit/render --maxWorkers=1`: 99 files, 1,637 tests green, 1 skipped (before the last
  shader-text edits, which no test reads). One assertion changed: `tests/unit/textures/facades.test.ts` "keeps every kind byte inside 0..255"
  assumed every kind has room for the 0..21 storey phase; the roof kind (11) has none, LotBatch clamps the byte at 255 and 242..255 still decodes
  to 11, so the test now checks that. Three new tests in `tests/unit/world/roadnet-stream.test.ts` (finite far geometry and its attributes; the
  wall colour is the colourway's; the per-BBL look is honoured).
- `npx tsc --noEmit`: clean in my files (two errors in other lanes' tests: `cars5-measure.test.ts`, `police-system.test.ts`).
- Hosted build builds; single file 10,935,269 bytes, no far-massing code in it.
