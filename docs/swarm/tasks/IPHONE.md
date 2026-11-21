# IPHONE: phone-tier memory and iPhone Safari issues (Ines Marlowe)

Owner report: "iPhone version keeps crashing at start, probably too memory intensive". Hosted build, headless Chromium emulating an
iPhone 13 (phone tier, pixel ratio 1, canvas 390x664), software GL, so GPU and process numbers are indicative only. Probe:
`scratchpad/iphone2/memprobe2.cjs` (copy of the lane's memprobe with: precise heap through CDP after a GC, peak heap sampled every
250 ms, vertex bytes by group and attribute, triangles, indexed share, live 2D canvases tracked from creation, textures by size with
names, boot download).

## Before and after (same probe, same spots)

| | before (boot) | after boot | after 2 min play | target |
|---|---|---|---|---|
| JS heap used after GC | 81 MB | 81 MB | 89 MB | < 250 MB |
| JS heap peak while booting (sampled, includes garbage) | 722 MB | 255 MB | 495 MB | |
| geometry arrays in JS, all | 398 MB | 92 MB | 121 MB | |
| world static group | 326 MB | 18 MB | 47 MB | < 100 MB |
| triangles in the scene | 3.40 M | 0.83 M | 1.06 M | |
| textures on the GPU (estimate, released canvases counted at GPU size) | 371 MB (249) | 117 MB (182) | 118 MB | < 100 MB (missed) |
| live 2D canvases | 205 MB (198) | 60 MB (115) | 60 MB | < 40 MB (missed) |
| boot download | 16.1 MB | 7.0 MB | | < 8 MB |

Numbers: `scratchpad/iphone2/{before2,e,low}.json`. Remaining canvases: 12 storefront sheets awaiting first view, cargo livery (cars lane), ped bakes at 512 (people lane), car paint maps.

## What was done, lever by lever

1. Textures by tier (`src/textures/texTier.ts`, the one API: `texSize(base, kind)`, `texScale(kind)`, `wantsReliefMaps()`).
   Phone: procedural surfaces half size (painted at full size on a pooled scratch canvas and downscaled: painters are written in
   absolute pixels, so they are not rescaled), no normal or roughness maps drawn, kept or requested (the photo pack loader does not
   fetch the files), photo colour maps shrunk to 512 (ground sets 768) after decoding, storefront sheets 1024x512 with half the pixels
   per metre (painters derive their scale from the tile, so type and icons stay true), car skins 256x128 without the panel-line
   normal map (the page tier is read from the URL: `carPaintConfigured()` is false while the first skins are painted).
2. Canvases released after upload (`releaseCanvasAfterUpload(tex)`: `onUpdate` sets the canvas to 1x1 once the GPU has it; phone and
   low). Used for MaterialLibrary textures, storefront sheets (not on `?map=real`, which streams storefronts after the first frame),
   the skyline atlas, shrunk photo maps. A procedural map replaced by a photo set is disposed and emptied at once. Scratch canvases
   come from a pool of two (`acquireScratch` / `releaseScratch`) that empties itself 2.5 s after the last use.
   A released texture is never uploaded again: TierDetail.setAnisotropy and packs.setPackAnisotropy skip it.
   Consequence: after a WebGL context RESTORE the textures would draw blank, so ContextGuard asks for a reload (below).
3. World geometry on phone (`BuildingStream.ts`, WorldBuilder, Culling.ts ChunkCuller):
   - classes the phone never draws are not baked at all (`facade.setBatchSkip`: fire escapes, tanks, scaffolds, fences) or are
     dropped after the build (`dropPhoneHidden`: props bags and wires, manholes, grates, skid marks, and the clutter buckets rank 1 and 2
     that clutterTier already turned off through their material);
   - walls, windows, stoops, cornices and awnings (`STREAM_MESH`, 85 % of the vertices) are built per render cell on demand.
     Boot builds every cell once (colliders, bounds, attribute layout), keeps an empty shell mesh per cell and material, and throws the
     triangles away; ChunkCuller builds a cell when the camera is within chunk range + 90 m (nearest first, 6 ms per update, a few lots
     per call, swapped in only when whole) and frees it (GPU buffers too, full and far geometry) beyond +160 m. Cells are rebuilt
     from the same lots with the same per-lot seeds (`lotSeeds`), so a freed cell comes back identical (tested).
     A lot belongs to the cell of its centre. Small classes (signs, fences, decals, tar roofs) keep the old eager path.
   - Not done: packing normals / UVs into smaller types, welding vertices, onUpload dropping. Reasons below.
4. Heap: JS heap used after GC is 80 to 90 MB before and after (typed arrays are outside it), so nothing large was hiding there.
   Not found: tax-lot or real-map data on the default map (the real-map files load only with `?map=real`).
5. Boot peak: heap peak 736 -> about 280 MB because the city is no longer built, merged and split as a whole (cells are built one at a
   time and discarded), canvases are half size, relief canvases are not made.

## iPhone Safari, beyond memory

* Canvas limit. iOS Safari has a limit on the TOTAL memory of 2D canvases per page: "Total canvas memory use exceeds the maximum limit
  (384 MB)" on iOS 15 (224 MB and 576 MB are quoted for other devices and versions); once it is exceeded `getContext('2d')` returns
  null or canvases draw transparent, and Safari keeps unreferenced canvases for a while; the documented workaround is to set the
  canvas to 1x1 when done, which is what lever 2 does. A single canvas is capped at 4096 x 4096 (16.7 M px). Sources: WebKit bug
  195325 (bugs.webkit.org/show_bug.cgi?id=195325), https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/ (Jan 2022),
  Stack Overflow 52532614. I did not read the WebKit source; the figure is a quoted limit, device specific. Before this lane the
  page held 205 MB of live canvases after boot and more while painting, so on a 224 MB device the next `getContext` returned null
  and `MaterialLibrary` threw ("2D context unavailable"): a boot that stops half way.
* Context loss: ContextGuard now shows a full-screen "Tap to reload" notice when no restore arrives within 8 s, and at once on a
  restore when canvases were freed (the restored context cannot rebuild those textures). Before, `onGiveUp` was not wired in main.ts.
* Viewport: `viewport-fit=cover`, `100dvh`, `overscroll-behavior: none`, `touch-action: manipulation` (no double-tap zoom),
  `-webkit-touch-callout: none`, theme colour and the web-app meta tags (index.html, touch.css). The HUD already used `env(safe-area-inset-*)`.
  `installMobileViewportFixes` (src/render/MobileViewport.ts, needs one line in main.ts) re-applies the size after rotation,
  return from the background, bfcache restore and toolbar changes.
* Fullscreen button: already hidden where the API is missing (Menu: `fullscreen.supported`); iPhone Safari has no Fullscreen API on
  the document and no pointer lock; the game does not use pointer lock on touch.
* Audio: the context is created and resumed in the title tap (a gesture); the mute switch silences Web Audio and nothing can
  change that. Pause and resume on `visibilitychange` exist (AudioSystem), and `Game.paused` resets the stepper on return.
* `?debug=mem`: overlay top left (tier, canvas size, pixel ratio, texture count and MB, geometry MB, live canvas MB, JS heap where
  exposed: Chrome only, Safari shows n/a). Starts itself from texTier.ts, no main.ts line.

## What only a real iPhone can show (for the owner)

1. Whether the page boots at all now: `https://.../?debug=mem` and read the lines to Fable.
2. Cell streaming hitches: drive fast along a street, watch for buildings popping in at the fog edge or a stutter every few seconds.
3. Backgrounding for a minute and returning: sound, picture, no "Tap to reload".
4. Lock and unlock the phone while playing: if the reload notice appears, that is the freed-canvas path working as designed.
5. Rotating mid-game: sizes (needs the main.ts line), HUD and ACT button reach with both thumbs, notch and home bar clearance.
6. Double-tap on the controls: no zoom; long-press on the buttons: no callout or text selection.
7. Memory over a long session (10 minutes of driving): the overlay's geometry and texture lines must stay flat.

## Not verified

Real Safari, real GPU memory, JavaScriptCore memory, jetsam limits; frame times. Phone and low canvases freed after upload is a
JS-side saving only on the GPU-resident copy. The phone-tier look was compared on 4 frames before and after (see the report).
