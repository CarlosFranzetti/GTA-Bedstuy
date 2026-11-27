# LOWPOLY: the rules for new and converted models and textures

Status: current (INTAKE seat, 27 Nov 2026). Derived from the first open set in `src/assets/open/` (contact sheet:
`docs/swarm/teams/sheets/open-assets-1.png`, numbers: `src/assets/open/build-report.json`). It sits under
`DIRECTION.md` ("Stoop Light"): where they disagree, DIRECTION.md wins. The aim, in the owner's words of 24 Nov: models and
textures in the look of early-2000s open-world city games, and everything new goes that way. STYLE only: nothing from any game.

## What the first set shows (measured)

| Kind | Triangles | Texture | File size |
|---|---|---|---|
| PSX-style car (sedan, police, taxi, hatch, wagon, minivan, step van) | 312 to 476 | one 128 px palette PNG | 38 to 52 kB |
| Toy-style car (Kenney sedan, taxi, police, SUV, van, box truck, garbage truck) | 1,370 to 2,270 | one 128 px colour atlas | 77 to 130 kB |
| Clay vehicle (bus, pickup) | 2,950 to 3,680 | none: flat colour, tint at run time | 137 to 165 kB |
| Street prop (cone, bin, dumpster, traffic signal, mailbox, street lamp, manhole, hydrant) | 22 to 662 | 32 to 128 px, or flat colour | 5 to 28 kB |
| Surface (asphalt, sidewalk, brick, painted brick, brownstone, limestone, shutter, awning) | flat | 512 px and 256 px, 8-bit palette PNG | 235 to 260 kB and 62 to 65 kB |

Honest reading of the sheet: the PSX cars are the look. They have chamfered boxy silhouettes, painted-on windows, lights and
grilles, and nearest-filtered 128 px textures; they read as a 2000-era car at once. The Kenney cars are clean and friendly but
toy-like (wide, short, rounded wheels): closer to a kart game than to a street game, usable for background traffic and for
shape reference, not as the hero look. The two clay vehicles need a texture before they are usable. The photo surfaces are
good and period-right at 512 px but a little too clean and saturated for Stoop Light until graded.

## The rules

1. TRIANGLES. Hero car 400 to 1,500 (the PSX range is the target; 3,000 is the ceiling), traffic car 300 to 700, bus or
   truck up to 1,500, prop 20 to 700, skateboard or bike 400 to 1,000. A wheel is 12 to 16 sides. Windows are paint, not
   holes. Count with `scripts/dev/open-assets-build.mjs` (it reports every file); the test caps are 3,800 per car, 800 per prop.
2. SHAPE FIRST. Chamfered boxes: a roof, a bonnet, a boot, wheel arches as notches. Silhouette at thirty metres decides.
   Real proportions from the vehicle spec in `src/entities/Vehicle.ts`; the loader refits the body to the spec, so toy
   proportions in a source file are fixed at load, but start from real ones.
3. TEXTURES. One texture per model, 64 to 128 px for a car (colour atlas or painted body), 32 to 128 px for a prop, no
   normal, roughness or metal maps. Lights, grille, plates, door lines, trim and window glass are painted in. Models carry
   baked shading in the paint (darker sills and wheel wells, a lighter roof), because that is what makes 128 px read.
4. FILTERING. Model textures use nearest filtering (`THREE.NearestFilter`), as the sheet does. Surfaces stay linear with
   mipmaps and anisotropy 4.
5. SURFACES. Photo-based, seamless, 512 px (256 px on phone), 8-bit palette PNG with 96 to 128 colours and light dither.
   Texel density: 128 to 205 texels per metre for road and wall (512 px per 2.5 to 4 m), 171 for sidewalk slabs, 512 for
   cloth. One tile of brick should hold 8 to 14 courses. Do not go above 256 texels per metre outdoors: the period look is
   soft. The seam check in the build script (ratio near 1 tiles; above about 2 does not) caught one bad candidate (a red
   brick that did not wrap), which was dropped. Surfaces join the existing wall sheet (`brickSheet:0`) as layers; they are
   not new materials.
6. NO LIVE GLOSS. Roughness 1, metalness 0 on imported models; shine comes from paint and from the sun, not from maps.
7. COLOUR. Raw photo and palette colours are brighter than Stoop Light. Before use: lower saturation by about 15 to 25 percent,
   pull the lightest value to about 85 percent, warm the highlights and cool the shadows, so a brick wall and a taxi sit
   in the same haze. Accents stay rationed (taxi yellow, signal, awning); body paint for ordinary cars comes from the existing
   muted palette in `VehicleSource` (untextured paint is tinted to the spec colour; palette atlases are recoloured by cell).
8. FILES. Y up, metres, standing on y = 0, centred on x and z, front toward +Z (glTF convention; `VehicleSource` turns it to
   the game's -Z front). Name wheels `wheel-front-left`, `wheel-front-right`, `wheel-back-*` as separate nodes with the
   origin at the wheel centre, so the loader can spin and steer them. The PSX files have their wheels baked into the body:
   splitting them out is the first piece of conversion work (the pack ships a 28-triangle `Wheel.obj` for reference).
9. HOSTED ONLY. Everything here loads on demand, by dynamic `import()` of `src/assets/open/manifest.ts` behind the hosted check.
   The single-file build stays at 11,920,839 bytes (79 kB under its limit) with and without these files, because nothing
   in the default graph imports them.
10. EVERY ITEM IS RECORDED. A `SOURCE.md` beside the files (page, author, licence line as read, date, what was changed) and a row
    in `docs/CREDITS.md`. CC0, CC BY and CC BY-SA only; a real brand on a third-party asset is allowed (rule 4, 24 Nov), a
    licence that is unclear is not.

## What to do with the existing procedural content

Replace in this order, judging each by the sheet (same camera, same light, nearest filter) and by `renderer.info`:
1. Cars first. The procedural lofted bodies in `carBodies.ts` read as smooth and generic next to the PSX set. Start with the
   classes the PSX pack covers (sedan, taxi, police, hatch, wagon, minivan, step van) as new `gltfVehicle` sources; keep the
   procedural body as the fallback on phone and when the file is not loaded. A replacement matches when: the silhouette is the
   same length and height within 3 percent of the spec, wheels spin and steer, the lights flash, paint tints, and the triangle
   count is lower than the procedural car's.
2. Street surfaces second. Asphalt, sidewalk, brick and shutter are drop-in replacements for painted ones on the facade sheet and
   road material; compare at street level on the low tier for memory (a 512 px palette layer costs the same GPU memory as any
   512 px texture: use 256 px on phone) and grade them to Stoop Light before judging.
3. Props third (hydrant, cone, bin, dumpster, mailbox, traffic signal, street lamp, manhole): small, cheap, and they make a
   block read as a street.
4. Leave people, buildings' mass and trees alone: they are not part of this set.

How to judge a match: render the old and the new next to each other with the contact-sheet tool, at the same size, and ask three
questions. Does it read at thirty metres? Does it sit in the same colour haze as its neighbours? Is it cheaper? Three yes
answers means replace; otherwise keep the old one and say why.

## Known gaps in the first set

No motorbike (the one found, a CC BY Poly by Google model on poly.pizza, could not be downloaded: that host blocks scripted
requests; the CC0 Harley FLH on OpenGameArt is 20,000 triangles and was not decimated). The bus and pickup are untextured. The
manhole and grate are single objects, not tiles. No convincing brownstone: `brownstone` is the nearest open match (warm tan
ashlar). Cars have no interiors.
