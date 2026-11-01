# Credits

## Textures

The photo-based PBR texture sets in `src/assets/textures/` are derived from
[ambientCG](https://ambientcg.com) assets, released under
**CC0 1.0 Universal (public domain)**: no attribution is required, but credit is given anyway.

| ambientCG asset | derived files in this repo |
|---|---|
| Bricks097 | brick_red, brick_brown, brick_white, brick_grey |
| Concrete042A | concrete, sidewalk, brownstone, limestone |
| Asphalt026C | asphalt, asphalt_worn, roof |
| Ground111 | dirt |
| Bricks105 | brick_tan |
| Wood027 (via the CC0 `aframe-enviropacks` npm package) | cedar (water tanks) |

The 1K JPG sets were obtained from public mirrors (the `ubyjvovk/asciicity` and
`amazingsammed/mini_textures` repositories, which vendored them with the same CC0 notice) because this build
environment cannot reach ambientcg.com directly. Derived variants (painted
brick, brownstone and limestone courses, worn asphalt, sidewalk slabs, tar roof)
were generated with the script in `scripts/derive-textures.py`. Normal and roughness maps
shared between variants are stored once (`brick_normal`, `brick_rough`, `brick_painted_rough`).

Everything else in the game (geometry, signage, awnings, audio) is procedural and
original to this project.

## Models

glTF car and character files in `src/assets/models/` (MDL found them, MDLI integrated them, Stage 3). Licence status is stated
per pack; "secondary" means the licence text was taken from a repackager's NOTICE rather than the author's own page, which this
build environment cannot reach. The files are copies of the pack files: no geometry or texture was edited (the character files had
their animation clips renamed to `Idle` / `Walk` / `Run`). The game only changes how they are drawn (fitted to the vehicle
dimensions, recoloured, lights and plates added at load time).

- **Kenney Car Kit** (`vehicle-sedan.glb` = sedan, `vehicle-suv.glb` = SUV, `vehicle-cop.glb` = police car, `vehicle-boxtruck.glb` =
  the delivery van, standing in for the box truck). Author: Kenney (https://kenney.nl/assets/car-kit). Licence: **CC0 1.0 Universal**
  (secondary; the repackager NOTICE says each archive's License.txt reads CC0). Obtained via `@netforge/asset-library-files@0.2.0`
  (npm; MIT wrapper, art CC0 per its NOTICE).
- **Quaternius characters** (`character.glb` = worker, the pedestrians and the player; `character-hoodie.glb` = hooded adventurer).
  Author: Quaternius (https://quaternius.com). Licence: **CC0 1.0 Universal**. The Quaternius Ultimate Animated Character Pack
  LICENSE.txt (CC0 1.0) is verified; the exact pack of the two characters is secondary (repackager NOTICE). Obtained via
  `@netforge/asset-library-files@0.2.0`.
- Not included: `truck-box` from `munim-maps-vehicles@0.5.0` (Apache-2.0), held until its wheels are split into nodes.
