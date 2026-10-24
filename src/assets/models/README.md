# Character and vehicle models (glTF / GLB)

Drop a `.glb` in this folder and the game uses it instead of the procedural model. Vite inlines the files
into the single-file build, so there is nothing to configure. No file (or a file that fails to load) means the
procedural model is used, with one console warning.

## File names

| File | Replaces |
| --- | --- |
| `character*.glb` (e.g. `character.glb`, `character-hoodie.glb`) | every pedestrian and the player (first file by name wins) |
| `vehicle-sedan.glb` | sedan |
| `vehicle-suv.glb` | SUV |
| `vehicle-boxtruck.glb` | box truck |
| `vehicle-cop.glb` | police car |

## Characters

- Skinned humanoid, y-up, units in metres, standing in a neutral pose. The loader measures it and scales it to
  1.75 m, stands it on y = 0 and centres it. It must face glTF forward (+z); the loader turns it to the game's -z.
- Animation clips, matched by name, case-insensitive: `Idle`, `Walk`, `Run` (or `Jog`). A file with exactly one clip
  uses it as the walk cycle. Without an idle clip, characters freeze on the first walk frame when standing.
  Walk plays at about 1.4 m/s, run at about 5.5 m/s; playback speed is scaled to the actual ground speed.
- Cloth variants: the largest mesh gets a colour multiplied onto its material (8 tints), so crowds vary.
  Use a light, desaturated base colour / texture for the clothes you want tinted.

## Vehicles

- y-up, metres, any size (it is scaled to the vehicle length), wheels resting on the ground, facing +z (or tell us by
  naming the lights). The loader turns it to -z; if the long axis is x it rotates 90 degrees first.
- Node names the loader looks for (case-insensitive):
  - wheels: `wheel` in the name; front pair: `front`, `_F`, `_FL`, `_FR` (otherwise the two most forward wheels steer)
  - lights: `headlight` / `headlamp`, `taillight` / `taillamp` / `brake light` (mesh or material name), with a standard (PBR) material;
    they get their own emissive material so the game can light them at night
  - body paint: material name containing `paint` or `body` (recoloured to the vehicle colour if untextured), otherwise the largest mesh
  - cop only: light-bar meshes with `bar` / `siren` and `red` / `blue` in the name or material name
  - `hood` / `bonnet` node (optional): lifts when the car is wrecked

## Licence

Only add models you are allowed to ship in a distributed game: CC0, your own work, or purchased with redistribution
rights. Respect attribution terms (CC-BY needs a credit) and do not use ripped game assets. Keep a note of each
model's source and licence next to it.

## Size

The whole game is one HTML file (artifact limit 16 MB) and every model is base64-inlined (about +33 %).

- Aim for 3 MB or less per GLB, a few thousand triangles per character, textures 1024 px or smaller.
- Compress with meshopt (supported): `npx gltfpack -i in.glb -o character.glb -cc -tc` or
  `npx @gltf-transform/cli optimize in.glb character.glb --compress meshopt --texture-size 1024`.
- Do not use Draco: its decoder is a separate download which the offline build cannot fetch.
- KTX2 / Basis textures are not supported either; use JPEG or PNG (WebP works too).
