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
- **Quaternius characters** (`character.glb` = the player and one of the six pedestrian models; the hooded adventurer `character-hoodie.glb` was removed, nothing used it).
  Author: Quaternius (https://quaternius.com). Licence: **CC0 1.0 Universal**. The Quaternius Ultimate Animated Character Pack
  LICENSE.txt (CC0 1.0) is verified; the exact pack of the two characters is secondary (repackager NOTICE). Obtained via
  `@netforge/asset-library-files@0.2.0`.
- Not included: `truck-box` from `munim-maps-vehicles@0.5.0` (Apache-2.0), held until its wheels are split into nodes.

### Quaternius Ultimate Animated Character Pack (five civilians, MDL2 research, MDLI2 integration)

- **Quaternius Ultimate Animated Character Pack**: `character-casual-male.glb`, `character-casual-female.glb`, `character-suit-male.glb`,
  `character-suit-female.glb`, `character-worker.glb` (pedestrians pick one of these or `character.glb`, deterministically per ped).
  Author: Quaternius (https://quaternius.com, https://www.patreon.com/quaternius). Licence: **CC0 1.0 Universal**, verified from
  the pack's own `LICENSE.txt` (https://raw.githubusercontent.com/wellmota/tutory-personagens/main/quaternius-uac/LICENSE.txt,
  sha256 83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c). Obtained via the public GitHub repository
  `wellmota/tutory-personagens` (branch `main`, commit 318fec6), folder `quaternius-uac/`.
- **Modified**: these five files are compressed derivatives, made with `scripts/compress-models.mjs` (glTF-Transform): every animation
  clip except `Idle`, `Walk` and `Run` is dropped, vertex data is quantized and meshopt-compressed (EXT_meshopt_compression). Geometry
  shape, rig and materials are unchanged. About 1.2 MB each became about 0.3 MB each. The raw sha256 values are in the MDL2 notes.

## Music (researched, not shipped)

No recorded music is bundled in the repo. Candidate source checked by MUSIC on 2026-11-03 (see docs/swarm/tasks/MUSIC.md):

- **Open Lo-Fi** (upstream `btahir/open-lofi`, mirror `MdShahnawazSheikh/thaxas-lofi`): tracks declared CC0-1.0 by the uploader in the upstream README and LICENSE. Tracks are AI-generated (Suno v5) per the upstream README; chain of title not independently verified. Ten samples were downloaded to the scratchpad only, not into the repo. Status: pending orchestrator approval.
