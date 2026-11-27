# ASSETS-INTAKE (Mara Quill), 24 to 27 Nov 2026

Status: first set done and filed. Licences were read on each item's own page on 24 Nov 2026. Details per item: `src/assets/open/<source>/<item>/SOURCE.md`; numbers: `src/assets/open/build-report.json`; rules: `docs/swarm/art/LOWPOLY.md`.

| Item | Page | Licence as read | Result |
|---|---|---|---|
| PSX Style Cars (GGBotNet) | opengameart.org/content/psx-style-cars | "License(s): CC0" | TAKEN: 7 cars (sedan, 4-door sedan, police, taxi, hatch, wagon, minivan, step van), 312 to 476 tris; burnt-out and 1920s car and the sound files left out |
| Kenney Car Kit 3.1 | kenney.nl/assets/car-kit | "License Creative Commons CC0"; License.txt CC0 | TAKEN: sedan, taxi, police, SUV, van, delivery truck, hatch, garbage truck |
| Kenney Retro Urban Kit 2.0 | kenney.nl/assets/retro-urban-kit | CC0 | TAKEN: traffic signal, dumpster |
| Kenney Mini Skate | kenney.nl/assets/mini-skate | CC0 | TAKEN: skateboard |
| Kenney Furniture Kit | kenney.nl/assets/furniture-kit | CC0 | TAKEN: litter bin |
| Traffic Road Assets (MilkAndBanana) | opengameart.org/content/traffic-road-assets | CC0 | TAKEN: hydrant, street lamp, manhole cover, cone |
| Low Poly Textured Mailbox (Braveo) | opengameart.org/content/low-poly-textured-mailbox | CC0 | TAKEN (FBX parsed with three FBXLoader) |
| 3D Vehicles Pack | opengameart.org/content/3d-vehicles-pack | CC0, clay models | TAKEN: bus, pickup (no texture) |
| Poly Haven textures | polyhaven.com/license | "all licensed as CC0" | TAKEN: asphalt_02, concrete_pavement, brick_wall_005, painted_brick, old_sandstone_02, sandstone_blocks_05, painted_metal_shutter |
| ambientCG Fabric045, Fabric075, Grate002 | docs.ambientcg.com/license | CC0 | TAKEN (grate is a decal, not tileable) |
| Asphalt Road Texture Free (ForKotLow) | opengameart.org/content/asphalt-road-texture-free | CC0 | TAKEN |
| red_bricks_04 (Poly Haven) | as above | CC0 | SKIPPED: seam ratio 3.1, does not tile |
| BMacZero, GGBot brick textures | OGA pages | CC0 | read, not used (flat or plain) |
| Poly Haven asphalt_03 | as above | CC0 | SKIPPED: a flat brown, no texture |
| Harley FLH 1972 (OGA) | opengameart.org/content/custom-harley-davidson-flh-1972 | CC0 | SKIPPED: 20,066 tris low-poly file, far over budget |
| Motorcycle by Poly by Google (poly.pizza) | poly.pizza/m/dse64pqMKAR | "Creative Commons Attribution" (version not shown) | SKIPPED: download host is behind a Cloudflare challenge |
| Sketchfab CC BY models | list | CC BY | SKIPPED: downloads need an account token |
| Quaternius site packs | n/a | licence conflict | SKIPPED as instructed |

Totals: 18 cars, 9 props (skateboard included), 11 surfaces; 4.86 MB under `src/assets/open`; no file over 600 kB. Tests: `tests/unit/assets/open-assets.test.ts` (117 pass). Single-file build 11,920,839 bytes before and after (identical). Hosted build passes `native/scripts/webcheck.mjs`.
