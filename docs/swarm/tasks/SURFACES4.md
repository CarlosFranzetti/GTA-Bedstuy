# SURFACES4: road, pavement, grass, shopfront frames (lane notes, kept current)

## Inherited state (SURFACES3 "Wren Alder", cut off by the usage limit)
Her edits were already committed (0d2ed21, d057552, a9a7d4c; all "work in progress"); the working tree was clean and tsc clean.
In the committed code: street shader rework (aggregate, wheel tracks, patches, utility cuts, oil, gutter damp and debris, drain
grate, valve cover, bus pad), scored sidewalk joints, worn crosswalk and lane paint, painted-fallback asphalt and concrete albedo
raised, diamond-plate cellar doors (RoadBuilder), picket areaway fence in the dark-metal mesh (one draw fewer per cell), recessed
shop glazing with reveals (mixeduse.ts). Decision: KEEP all of it (frames looked at, nothing broken).

## Why the road stayed black (found)
The CC0 asphalt photo is 0.19 sRGB (0.03 linear). The photo replaces the painted fallback, so Wren's raise of the painted colour
never reached the screen, and every shader feature multiplies a near-black base: invisible. Fix: `gdCol = diffuseColor.rgb * 3.1`
at the top of ASPHALT_GLSL (tarmac about 0.09 linear). Detail now reads (wheel tracks, crack seals, patches).

## Changes
- streetShader.ts: asphalt lift (above); steel covers, grates and valve lids lifted to read as steel on the lighter road; old cobbles
  darkened (they were calibrated to a black road); patches, utility cuts and crack seals more frequent; lane and crosswalk paint chips
  are fewer, larger blobs with an asphalt-coloured (not black) chip.
- landmarks/kit.ts (the lawn lives here, not in tone.ts): olive, under 40 % saturation, with bare-earth cells; far-marker grass colour.
- painters/organic.ts: leaf hues 86, 98, 68 (olive and yellow-green), saturation 24 to 42 %.
- RoadBuilder.ts: the `road-patches` decal is dropped (the shader paints patches): one draw fewer.
