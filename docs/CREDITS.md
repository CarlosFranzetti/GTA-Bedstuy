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
| PavingStones150 | paving |

The 1K JPG sets were obtained from a public mirror (the `ubyjvovk/asciicity`
repository, which vendored them with the same CC0 notice) because this build
environment cannot reach ambientcg.com directly. Derived variants (painted
brick, brownstone and limestone courses, worn asphalt, sidewalk slabs, tar roof)
were generated with the script in `scripts/derive-textures.py`. Normal and roughness maps
shared between variants are stored once (`brick_normal`, `brick_rough`, `brick_painted_rough`).

Everything else in the game (geometry, signage, awnings, audio) is procedural and
original to this project.
