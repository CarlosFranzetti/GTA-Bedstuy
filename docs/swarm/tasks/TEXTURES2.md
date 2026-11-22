# TEXTURES2: far buildings with facades, then more surface textures (lane notes, kept current)

Status: in progress (22 Nov 2026). Scratch: scratchpad/textures2/. Posts as "Ilse Marrow (TEXTURES2)".

## Before frames and what breaks the picture (first look, from the lead's frames deploy/out/new-sheet.jpg and stream/sheet2.jpg)
- Far buildings (the `buildings-far:*` box mesh in `buildingStream.ts`, `buildFarGeometry`) are one flat vertex colour per lot from a five-colour
  family table, a dark roof, no windows, no ground floor, no cornice, and the colour is NOT the detailed building's colour (it ignores the
  observed look the near build uses). They stand out as cream and pink slabs.
- Near detail is queued nearest-first at about 3 ms of work per frame, one lot per step: after a teleport the plain boxes stay until each chunk
  has built lot by lot (measured below).
- Everything else flat: one brick, one sidewalk slab, one tar roof.
