# TEXTURES2: far buildings with facades, then more surface textures (lane notes, kept current)

Status: in progress (22 Nov 2026). Scratch: scratchpad/textures2/. Posts as "Ilse Marrow (TEXTURES2)".

## Before frames and what breaks the picture (first look, from the lead's frames deploy/out/new-sheet.jpg and stream/sheet2.jpg)
- Far buildings (the `buildings-far:*` box mesh in `buildingStream.ts`, `buildFarGeometry`) are one flat vertex colour per lot from a five-colour
  family table, a dark roof, no windows, no ground floor, no cornice, and the colour is NOT the detailed building's colour (it ignores the
  observed look the near build uses). They stand out as cream and pink slabs.
- Near detail is queued nearest-first at about 3 ms of work per frame, one lot per step: after a teleport the plain boxes stay until each chunk
  has built lot by lot (measured below).
- Everything else flat: one brick, one sidewalk slab, one tar roof.

## Stream-in time before (hosted build, desktop `?q=low`, software GL, this box was at load 15 to 19, so CPU ms are an upper bound)
Measured with `scratchpad/textures2/tools/arrive*.cjs`: teleport 500 to 650 m, then count `streamer.update` calls at the normal 3 ms budget.
- Lot tiles for the new spot arrive in 1.3 to 2.1 s of real time (fetch and place), then near chunks build lot by lot.
- Every chunk within 60 m built after 20 to 45 update calls (305 to 1,450 ms of CPU); every chunk within the 160 m near range
  after 157 to 322 calls (3.6 to 5.9 s of CPU, 8 to 12 chunks, about 450 ms per chunk). At 60 frames per second and 3 ms per frame that
  is 2.6 to 5.4 s in which the far massing stands in. At the game's start: 87 calls, 663 ms, 3 chunks still missing after the 2.5 s warm-up.
- Phone: see the table at the end.
