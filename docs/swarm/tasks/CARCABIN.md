# CARCABIN: a different cabin for every vehicle (Marisol Quill, 27 Nov 2026)

Owner's words: "interior of cars should be slightly different for each car."

## What it is
- `src/entities/models/carCabin.ts` (new). `cabinKitFor(style, seed)` is pure data: dash shape (flat, cowled, twin-pod, slab, screen, strip),
  steering wheel (2/3/4 spokes; thin, thick, sport, truck rim), seats (split bench, vinyl bench, buckets, high-back, captain, bus rows),
  seat / panel / dash / trim colours by type and era, gear lever (column, floor, none), props. `buildCabin(spec, kit, near)` makes ONE
  vertex-coloured geometry. ~50 body styles have a profile (`CABIN_STYLES`); the seed picks within the profile.
- Props: taxi meter + partition, police radio + laptop arm + cage, fuzzy dice / air freshener on some private cars (by seed), cup, tissue box,
  clipboard (vans, trucks), CB radio, ambulance jump bag, fare box (bus, dollar van).
- Wiring: the body builders in `carBodies.ts` (passenger, truck, bus) no longer draw their one-colour dash, wheel and seats; they hand a
  `CabinSpec` to `parts.cabin`. `carModel.ts` `detailsGeo` merges the cabin into the existing ONE details mesh as vertex colours (new kind 5:
  matte, roughness 0.85). Same material, same draw call: no new draw call, no texture, no asset.
- Seed: `buildCarModel(..., seed)`, i.e. `Vehicle.seed`. The details cache is keyed by (parts, look, kit key).
- Level of detail: near (full) tier gets every piece; the lite near model (phone, low) keeps the largest `LITE_CABIN_TRIS` (300) triangles. The far
  proxies (split) have no cabin, as before they had no visible one.
- The bus driver was on the right (x +0.55) in the old code while every car has the wheel on the left; the cabin puts the bus wheel left too.

## Not changed
`src/main.ts`, camera files, Vehicle.ts specs.

## Look and numbers
See the end of this file (filled in after measuring).

## Numbers (27 Nov)
- Cabin triangles per car, near (full) tier: 284 to 716, mean about 455 (old one-colour interior about 200). Lite (phone, low): capped at 300 (bus 150), smallest pieces first. Draw calls added: 0 on every tier (same details mesh). Textures added: 0.
- Single-file build index.html, same base commit with and without this change: 11,923,551 -> 11,939,144 bytes (+15,593; 60.8 kB left of 12,000,000).
- Tests: tests/unit/entities/carcabin.test.ts (7). carbodies.test.ts now allows vertex kind 5. carlook and car-lod-tris pass (bus lite cap lowered to stay under 4.5k).
- Sheets: docs/swarm/teams/sheets/carcabin-1.png (vans, trucks, buses, wagon, convertible, beater), carcabin-2.png (sedan, sports, taxi, police, SUV). Columns: driver's seat, behind and above, in front above the windscreen, x-ray (body and glass hidden).
- Not seen: in the running game, on a phone, with real night lighting.
