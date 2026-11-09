# Character and vehicle models (glTF / GLB)

**Vehicles are procedural by default** (`src/entities/models/carBodies.ts` + `carModel.ts`: lofted GTA3-era bodies, licence ours). The
`vehicle-*.glb` files here are an opt-in alternative: build with `VITE_GLTF_CARS=1` to bundle and use them (without the flag they are not
bundled at all).

**People are procedural by default too** (`src/entities/models/pedBody.ts` + `src/textures/painters/ped.ts`: chunky GTA3-era
bodies of 750 to 900 triangles with a hand-painted 256 px atlas per variant, our own art). The `character*.glb` files here are an
opt-in alternative: build with `VITE_GLTF_PEDS=1` to bundle and use them (without the flag they are not bundled at all, which keeps the
single-file artifact about 2 MB smaller).

Drop a `.glb` in this folder and the game uses it instead of the procedural model. Vite inlines the files
into the single-file build, so there is nothing to configure. No file (or a file that fails to load) means the
procedural model is used, with one console warning.

## File names

| File | Replaces |
| --- | --- |
| `character*.glb` (`character.glb`, `character-casual-male.glb`, ...) | the player is `character.glb` (else the first file by name); pedestrians pick one of ALL character files, deterministically per ped (model x 8 cloth tints) |
| `vehicle-sedan.glb` | sedan |
| `vehicle-suv.glb` | SUV |
| `vehicle-boxtruck.glb` | box truck |
| `vehicle-cop.glb` | police car |

## Characters

- Skinned humanoid, y-up, units in metres, standing in a neutral pose. The loader measures it and scales it to
  1.75 m, stands it on y = 0 and centres it. It must face glTF forward (+z); the loader turns it to the game's -z.
- Animation clips, matched by name, case-insensitive, after dropping an armature prefix (`CharacterArmature|`) and a `Man_` style
  rig prefix: `Idle`, `Walk`, `Run` (or `Jog`, `Sprint`). An exact name wins over look-alikes (`Run` over `Run_Back` / `RunningJump`). A file with exactly one clip
  uses it as the walk cycle. Without an idle clip, characters freeze on the first walk frame when standing.
  Walk plays at about 1.4 m/s, run at about 5.5 m/s; playback speed is scaled to the actual ground speed.
- Cloth variants: materials named like clothes (`shirt`, `top`, `hood`, `jacket`, ...; else everything that is not skin / hair / eyes /
  metal) get one of 8 tints, so crowds vary. A dark cloth colour takes the tint instead of being multiplied by it. Variant 0 keeps the
  authored colours. Weapon / prop nodes (`Sword`, `Pistol`, ...) are removed.
- A root armature scale of 100 (Blender centimetre exports) is fine: the loader measures the posed model and scales it to 1.75 m.

## Vehicles

- y-up, metres, wheels resting on the ground, facing +z (or tell us by naming the lights). The loader turns it to -z; if the
  long axis is x it rotates 90 degrees first.
- The body is fitted to the vehicle spec (`VEHICLE_SPECS` length x width x height) per axis, so toy-proportioned packs (Kenney)
  match the physics box and the lanes. Wheels are not stretched: they get the height factor uniformly, stay round and keep touching
  the ground. Only wheels whose bottom is near the ground are spun / steered (a spare tyre named `wheel` is left on the body).
- Node names the loader looks for (case-insensitive):
  - wheels: `wheel` in the name; front pair: `front`, `_F`, `_FL`, `_FR` (otherwise the two most forward wheels steer)
  - lights: `headlight` / `headlamp`, `taillight` / `taillamp` / `brake light` (mesh or material name), with a standard (PBR) material;
    they get their own emissive material so the game can light them at night.
    **No light nodes (Kenney)? The loader synthesises them**: a lens quad on each front corner and each rear corner, placed on the body
    surface by casting rays, plus a front and a rear licence plate. The cop car also gets a two-halved red / blue light bar on the roof.
  - body paint: material name containing `paint` or `body` (recoloured to the vehicle colour if untextured), otherwise the largest mesh.
    A palette-textured body (one small colour atlas for the whole car, as in the Kenney Car Kit, material `colormap`) is recoloured only
    inside its paint cell of the atlas (`KENNEY_PAINT_CELLS` in `gltf/VehicleSource.ts`, 8 x 4 cells), keeping the atlas shading; the
    police car has no cell and keeps its livery. For another palette model pass `{ paintCell }` to `GltfVehicleSource.load`.
  - cop only: light-bar meshes with `bar` / `siren` and `red` / `blue` in the name or material name
  - `hood` / `bonnet` node (optional): lifts when the car is wrecked
- Far cars: `CarLod` draws every car beyond the near distance as an instance of one merged model per type (body + wheels as 10-gon tyres,
  lit lamps when the lights are on) and the AoProxy hull is built from it. That needs the palette-paint path above; a car without it simply
  keeps its full model at any distance (more draw calls).

## Licence

Only add models you are allowed to ship in a distributed game: CC0, your own work, or purchased with redistribution
rights. Respect attribution terms (CC-BY needs a credit) and do not use ripped game assets. Keep a note of each
model's source and licence next to it.

## Size

The whole game is one HTML file (artifact limit 16 MB) and every model is base64-inlined (about +33 %).

- Aim for 3 MB or less per GLB, a few thousand triangles per character, textures 1024 px or smaller.
- Compress with meshopt (supported, MeshoptDecoder is bundled in gltf/loader.ts): `node scripts/compress-models.mjs in.glb out.glb` (keeps only Idle / Walk / Run, quantizes, meshopt,
  textures to 512 px WebP; `--batch <dir>` does the five Quaternius civilians; needs `@gltf-transform/core|extensions|functions` and
  `meshoptimizer`, plus `sharp` for textured files). The shipped people are about 300 KB each (raw 1.0 to 1.3 MB). Alternatives:
  `npx gltfpack -i in.glb -o character.glb -cc -tc` or `npx @gltf-transform/cli optimize in.glb character.glb --compress meshopt --texture-size 1024`.
- Do not use Draco: its decoder is a separate download which the offline build cannot fetch.
- KTX2 / Basis textures are not supported either; use JPEG or PNG (WebP works too).
