# Mods: your own car models and textures

Status: first pass, 24 Nov 2026. Code: `src/mods/**`, `src/ui/ModsPanel.ts`. Tests: `tests/unit/mods/`.

## What this is

You can replace some of the game's cars and surface textures with files of your own. The game reads them in your browser,
keeps them in your browser's storage on this device, and uses them. **Nothing is uploaded, nothing is hosted, and the game
ships with no third-party pack.** If you made a pack, or have one you may use, it works here. If you share a pack with other
people, you are responsible for having the right to share it: check the licence of every file in it.

Open **Settings > Game > Mods**. Drop files or a folder on the panel (or use "Add files" / "Add folder"). Remove a mod there too;
that deletes its files from this device. On a phone, model mods are not loaded in this version (memory); textures are.

## What can be replaced

| Slot | Written as | What happens |
|---|---|---|
| A car class | `vehicle:sedan`, `vehicle:suv`, `vehicle:cop` ... (every class in the game) | The model replaces that class's body. It is scaled to the class's length, width and height, stands on the ground, its wheels turn and steer, its paint takes the car's colour. Only cars made after the mod loads use it. |
| A surface | `texture:asphalt`, `texture:concrete`, `texture:brickRed` ... | The image replaces that surface's colour map (and optionally its normal and roughness maps). |

Surface slots: `asphalt asphaltWorn concrete curb laneLine crosswalk bluestone granite graniteCurb brownstone brickRed
brickPainted limestone cornice stoop roof tarRoof corrugatedSteel`. Add `:2` for one variant (`texture:asphalt:2`); with no
number every variant gets the image. The image replaces the colour only: lighting, wear and wetness stay the game's own.

Not replaceable yet: people and animals, buildings, props, sounds, handling and physics (a mod model changes how a car looks, never how
it drives), and cars far away (a mod car is drawn as a full model at every distance, so it costs more than a stock car).

## Files that load

| File | What is read |
|---|---|
| `.glb` | glTF 2.0 binary with everything inside it (plain or meshopt-compressed). Not Draco, not Basis/KTX2. |
| `.gltf` | Only when every buffer and image is embedded as a `data:` URI. Outside files are refused. Use `.glb`. |
| `.png` `.jpg` `.webp` | Colour, normal and roughness images, for surfaces and for a model's textures. |
| `.dff` | RenderWare model (a "clump"), PC files of version 3.x. Frames with names, geometry (vertices, normals, first UV set, triangles with material ids), materials with colours and texture names, tri-strip data. Console (PlayStation 2, Xbox) files are refused. Skinned (people), morph and effect data are ignored. |
| `.txd` | RenderWare texture dictionary, PC (Direct3D 8 and 9): 8-bit and 4-bit palettised, 16-bit (1555, 565, 4444, 555), 24 and 32-bit, DXT1, DXT3, DXT5. The largest level is used; the smaller mip levels are skipped and the game makes its own. Console textures are skipped with a note. |
| `mod.json` | The manifest (below). |
| `.img` | Not read in this version. Unpack the `.dff` and `.txd` files from it with any tool and drop those. |

Zip files are not read either: unzip first.

### How a `.dff` car is read

- The model's axes are x right, y forward, z up; the game turns that into y up with the front at -z.
- Parts named `*_dam` (damaged) and `*_vlo` / `*_lo` (low detail) and `*_dummy` are left out.
- Wheels: the one mesh frame named `wheel` is copied to each `wheel_lf_dummy`, `wheel_rf_dummy`, `wheel_lb_dummy`, `wheel_rb_dummy`
  (and `lm`/`rm` for a third axle). A model that has a separate mesh per wheel frame (`wheel_lf` ...) is used as it is. Any other
  frame can be named a wheel in `wheelFrames`.
- Paint: a material whose colour is (60, 255, 0) or (255, 0, 175) is the body paint, the marker colours the community car packs use. It is tinted to each car's colour. Change the marker colours with `paintColors`, or name a texture with `paintMaterial`.
- Textures: the `.txd` with the same name as the `.dff` (`car.dff` + `car.txd`) is used automatically, or list files in `textures`. A material whose texture is missing is drawn as its plain colour and the panel says so.
- Lights: frames named `headlights` and `taillights` glow at night.

### How a glTF car is read

- Y up. The long axis is found on its own; the front is found from meshes named like `headlight` / `taillight`, else from wheel names with `front` or a lone `f`, else glTF's +z is the front.
- Wheels: nodes whose name contains `wheel` and whose bottom is near the ground turn; the two front ones also steer. If your wheels have other names, list them in `wheelFrames`.
- Paint: a material named `paint` or `body` (or set `paintMaterial`) is tinted to the car's colour **if it has no texture**. A textured body keeps its texture (a car painted with an atlas, like the Kenney cars, keeps its colours).
- Z-up files: set `"up": "z"`.

## mod.json

Put it beside the files (or in the folder you drop). Unknown keys are ignored. Paths are relative, use `/`, and may not contain
`..`, a drive letter or a web address.

```json
{
  "format": 1,
  "name": "My pack",
  "author": "me",
  "licence": "CC0-1.0",
  "entries": [
    { "slot": "vehicle:sedan", "model": "cars/sedan.dff", "textures": ["cars/sedan.txd"], "wheelFrames": [], "scale": 1 },
    { "slot": "texture:asphalt", "image": "road.png", "normal": "road_n.png", "roughness": "road_r.png", "repeat": [4, 4] },
    { "slot": "texture:brickRed:1", "image": "walls.txd", "texture": "brick_a" }
  ]
}
```

| Key | Meaning |
|---|---|
| `format` | `1`. |
| `name` | Required, up to 80 characters. Installing a pack with the same name replaces the old one. |
| `author`, `licence`, `description` | Shown in the panel. Please fill `licence` in. |
| `entries` | 1 to 64 entries. |
| `slot` | `vehicle:<class>` or `texture:<surface>[:<variant>]`. |
| `model` | (vehicle) `.glb`, `.gltf` or `.dff`. |
| `textures` | (vehicle) extra `.txd` or image files the model's textures come from. |
| `scale` | (vehicle) multiplies the model first. The size is fitted to the class anyway, so this rarely matters. 0.001 to 1000. |
| `up` | (vehicle) `"y"` (default for glTF) or `"z"` (default for `.dff`). |
| `wheelFrames` | (vehicle) exact node or frame names that are road wheels. |
| `paintMaterial` | (vehicle) the material name (glTF) or texture name (`.dff`) of the body paint. |
| `paintColors` | (vehicle, `.dff`) marker colours `[[r, g, b], ...]` (up to 4) meaning "body paint". |
| `image` | (texture) `.png`, `.jpg`, `.webp` or `.txd`. |
| `texture` | (texture, `.txd`) which texture in the dictionary (default: the first). Case does not matter. |
| `normal`, `roughness` | (texture) optional images. |
| `repeat` | (texture) `[x, y]` repeats. Default: the surface's own. |

An entry that cannot load (a missing file, a bad model, over budget) is reported in the panel and the stock car or texture stays;
the other entries of the pack still load. If nothing in a pack loads, nothing is installed.

### No mod.json?

Drop plain files. The panel lists them and asks which slot each is for (a car class for a model, a surface for an image), then
builds the manifest for you.

## Worked example, from files already in this repository

`docs/examples/mod-example/mod.json` uses two CC0 assets the game already carries (credited in `docs/CREDITS.md`):
the Kenney sedan (`src/assets/models/vehicle-sedan.glb`) and the Poly Haven asphalt set (`src/assets/textures/cc0/asphalt/`).
Make a folder with the `mod.json` and these copies beside it:

```
car.glb          <- src/assets/models/vehicle-sedan.glb
road_color.jpg   <- src/assets/textures/cc0/asphalt/color_1k.jpg
road_normal.jpg  <- src/assets/textures/cc0/asphalt/normal_1k.jpg
road_rough.jpg   <- src/assets/textures/cc0/asphalt/rough_1k.jpg
```

Drop the folder on the Mods panel. The harness (`scripts/dev/mods-harness.html`) does exactly this and reports 1,368 triangles, four
turning wheels, two steering. This particular car's paint is a texture atlas, so it keeps the Kenney red rather than taking the car's colour.

## Budgets (what a device accepts)

Everything is checked before memory is allocated; over the limit, the file is refused with a message that says the number.

| | phone | low | medium | high |
|---|---|---|---|---|
| Model mods | refused | yes | yes | yes |
| Model file | - | 8 MB | 16 MB | 32 MB |
| Vertices / triangles in one model | - | 40k / 60k | 80k / 120k | 150k / 250k |
| Materials, frames per model | - | 32, 256 | 48, 384 | 64, 512 |
| Texture file / size in pixels | 4 MB / 512 | 8 MB / 1024 | 16 MB / 2048 | 32 MB / 2048 |
| Decoded texture memory per mod | 8 MB | 32 MB | 96 MB | 192 MB |
| Bytes of files per mod | 16 MB | 48 MB | 96 MB | 128 MB |

All tiers: at most 24 mods, 200 files in one drop, 256 MB of mods on a device.

A fast way to keep a car inside the budget: under about 20k triangles and one 1024-pixel texture.

## Safety

Every file is treated as untrusted. Nothing in a mod is ever run (no scripts, no code). The game never fetches a web address named
inside a mod file (a `.gltf` that points outside itself is refused). Truncated, damaged and oversize files produce a message, not
a crash. If a mod ever breaks the game, open it with `?mods=off` at the end of the address: nothing is loaded, and the Mods panel then offers "Remove every mod from this device".

## Not yet (and what it would take)

- **People.** Our people are skinned to our own skeleton (MakeHuman's, with motion-capture animation clips, a layered body and clothes
  system and three detail levels). A mod person would need: a `ped:<type>` slot; a bone map in `mod.json` from the model's skeleton to
  ours (the community `.dff` people carry a skin and a bone hierarchy that can be mapped by bone id or name); the skin weights
  re-targeted to our 163-bone rig; our animation retargeted for different proportions; a triangle budget (about 5,000 for the close
  level); and an atlas for the face and clothes. None of that is built. The hook point is `src/entities/models/pedMesh.ts`, which the
  mods lane did not touch.
- `.img` archives and zip files; collision, handling and sound files; damage parts and doors that open; mod buildings and props.
- Texture slots for the shared "wall sheet" are replaced layer by layer through the material library: unverified in the running game.

## How it is built

Parsers written from the publicly documented chunk layout of the two RenderWare formats (a chunk is a type, a size and a library
stamp, then its body; children follow in the parent's body). No third-party code was copied or read. Details and what was used are in
`docs/swarm/tasks/MODS.md`. The hooks into the game: `Vehicle.sources[type]` (the existing glTF car source) and
`MaterialLibrary.overrideMaps`. Wiring: `src/mods/boot.ts`, loaded lazily on hosted builds only.
