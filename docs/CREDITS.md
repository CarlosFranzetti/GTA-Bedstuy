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

Recommended car and character glTF files for `src/assets/models/` (MDL, Stage 3). Licence status is stated per pack;
"secondary" means the licence text was taken from a repackager's NOTICE rather than the author's own page, which this
build environment cannot reach.

- **Kenney Car Kit** (sedan, SUV, police car, delivery van used as a box-truck stand-in). Author: Kenney
  (https://kenney.nl/assets/car-kit). Licence: **CC0 1.0 Universal** (secondary; the repackager NOTICE says each archive's
  License.txt reads CC0). Obtained via `@netforge/asset-library-files@0.2.0` (npm; MIT wrapper, art CC0 per its NOTICE).
- **Quaternius characters** (hooded adventurer, worker). Author: Quaternius (https://quaternius.com). Licence: **CC0 1.0
  Universal**. The Quaternius Ultimate Animated Character Pack LICENSE.txt (CC0 1.0) is verified; the exact pack of the
  two characters is secondary (repackager NOTICE). Obtained via `@netforge/asset-library-files@0.2.0`.
- Not included: `truck-box` from `munim-maps-vehicles@0.5.0` (Apache-2.0), held for approval.
