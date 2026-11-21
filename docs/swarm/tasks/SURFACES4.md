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

## Seen (frames in /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/surfaces4)
- Road: before `base/b-low-road45-17.5.png` (black), after `a3/a3-low-road45-17.5.png` and `a3-low-road45-12.png`. Wheel tracks, crack seals,
  worn lane line now read. Wet: `a3/a3-low-road-17.5w.png` (the weather hook is untouched and still works). Phone: `a3/a3-phone-road-17.5.png`.
- Junction and crosswalk: before `base/b-low-junction-17.5.png`, after `a3/a3-low-junction-17.5.png` and `-12.png` (tarmac visible, bars no longer speckle).
- Park lawn (real map): before landmarks/game3/thistledown-park-street.png, after `park/thistledown-park-street.png` (olive; leaves less emerald).
- Sidewalk and kerb were already acceptable (flags, joints, tone); not changed.
## Not done
Item 2 extras (gum, tree-pit soil, tactile strips, steel kerb noses), item 4 (SURFACES3 recess and reveals kept; no new awning shapes, gates
or lintel shadows), merging the stoop-rail strip (castIronFence:1, alpha-tested; picket geometry is edge-on to the street there) into the sheet.
Patches and utility cuts are still rare per 40 to 70 m of road; oil stains faint. Night: no lamp pools on the road (LOOK lane's light).
## Cost (perf3-breakdown, low and phone, grid, noon; tris / draws)
before (a2 build): low home 391k/220, junction 480k/194, el 366k/227, row n/a; phone home 183k/103, junction 216k/81, el 167k/84, row 140k/69.
after: low home 403k/231, junction 490k/205, el 351k/212, row 241k/179; phone home 176k/96, junction 213k/80, el 165k/79, row 140k/65.
My share is one draw fewer (road-patches); the rest is other lanes in the same tree (storefront and shop work): low home is 11 over its 220.
Single-file build 10.75 MB (was 10.29; other lanes). Tests: textures 406 green, world 775 green.
