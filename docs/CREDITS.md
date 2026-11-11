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

### CC0 PBR sets (src/assets/textures/cc0/)

Fetched by `scripts/fetch-cc0-textures.mjs` (re-runnable). Each set folder has a `LICENSE.txt` with the source URL,
author and licence. All are **CC0 1.0 Universal**. 1K JPEG albedo / OpenGL normal / roughness, plus 512 px re-encodes
(`*_512.jpg`). Not wired into materials yet.

| set | source asset | author | source URL |
|---|---|---|---|
| brick_red_common | Poly Haven `red_brick_03` | Rob Tuytel | https://polyhaven.com/a/red_brick_03 |
| brick_brownstone | Poly Haven `concrete_brick_wall_001` | see LICENSE.txt | https://polyhaven.com/a/concrete_brick_wall_001 |
| brick_painted | Poly Haven `painted_brick` | see LICENSE.txt | https://polyhaven.com/a/painted_brick |
| asphalt | Poly Haven `asphalt_03` | see LICENSE.txt | https://polyhaven.com/a/asphalt_03 |
| concrete_sidewalk | Poly Haven `concrete_pavers_03` | see LICENSE.txt | https://polyhaven.com/a/concrete_pavers_03 |
| concrete_pavement | Poly Haven `concrete_pavement` | see LICENSE.txt | https://polyhaven.com/a/concrete_pavement |
| bluestone_slate | Poly Haven `castle_wall_slates` | see LICENSE.txt | https://polyhaven.com/a/castle_wall_slates |
| corrugated_metal | Poly Haven `corrugated_iron_02` | see LICENSE.txt | https://polyhaven.com/a/corrugated_iron_02 |
| painted_metal | Poly Haven `rusty_painted_metal` | see LICENSE.txt | https://polyhaven.com/a/rusty_painted_metal |
| tar_roof | Poly Haven `bitumen` | see LICENSE.txt | https://polyhaven.com/a/bitumen |
| weathered_wood | Poly Haven `brown_planks_05` | see LICENSE.txt | https://polyhaven.com/a/brown_planks_05 |
| grime_wall | Poly Haven `concrete_wall_006` | see LICENSE.txt | https://polyhaven.com/a/concrete_wall_006 |
| denim | Poly Haven `denim_fabric` | see LICENSE.txt | https://polyhaven.com/a/denim_fabric |
| cotton_knit | Poly Haven `cotton_jersey` | see LICENSE.txt | https://polyhaven.com/a/cotton_jersey |
| leather | Poly Haven `brown_leather` | see LICENSE.txt | https://polyhaven.com/a/brown_leather |
| nylon_puffer | Poly Haven `bi_stretch` (stretch fabric; closest found) | see LICENSE.txt | https://polyhaven.com/a/bi_stretch |
| car_paint_flake | ambientCG `Metal027` (powder-coat metal; closest found) | ambientCG.com | https://ambientcg.com/view?id=Metal027 |
| tyre_rubber | ambientCG `Rubber001` | ambientCG.com | https://ambientcg.com/view?id=Rubber001 |
| brushed_chrome | ambientCG `Metal009` (brushed steel; proxy) | ambientCG.com | https://ambientcg.com/view?id=Metal009 |
| detail_stucco | ambientCG `Plaster007` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=Plaster007 |
| detail_tile | ambientCG `Tiles107` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=Tiles107 |
| detail_cobble | ambientCG `PavingStones046` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=PavingStones046 |
| detail_caststone | ambientCG `Concrete034` | CC0 (see LICENSE.txt) | https://ambientcg.com/view?id=Concrete034 |

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
  shape and rig are unchanged; the near-black `Skin` colour of the pack is replaced by a natural skin tone per person. About 1.2 MB each became about 0.3 MB each. The raw sha256 values are in the MDL2 notes.

## Music (researched, not shipped)

No recorded music is bundled in the repo. Candidate source checked by MUSIC on 2026-11-03 (see docs/swarm/tasks/MUSIC.md):

- **Open Lo-Fi** (upstream `btahir/open-lofi`, mirror `MdShahnawazSheikh/thaxas-lofi`): tracks declared CC0-1.0 by the uploader in the upstream README and LICENSE. Tracks are AI-generated (Suno v5) per the upstream README; chain of title not independently verified. Ten samples were downloaded to the scratchpad only, not into the repo. Status: pending orchestrator approval.

## Map data (GEO2)

- Building data pipeline (`scripts/import-osm.mjs`, `docs/REAL-BLOCKS.md`): (c) OpenStreetMap contributors, Open Database License (ODbL) 1.0, https://www.openstreetmap.org/copyright. No OSM data is in `bedstuy.json` yet (the Overpass hosts were unreachable); the credit applies as soon as an import is written.
- NYC MapPLUTO, NYC Department of City Planning, via NYC Open Data, and NYC Building Footprints (DoITT/OTI), via NYC Open Data: the lots in `src/world/data/bedstuy.json` (width, storeys, class, year built, roof height) come from them via `scripts/fetch-pluto.mjs` and `scripts/import-pluto.mjs`; raw rows in `src/world/data/raw/`. Public data; credit kept.
- Block descriptions in `docs/reference/BLOCKS.md` come from the public web pages named inline there (Brownstoner, New York YIMBY, GrowNYC, MTA Bus Time, Wikipedia, CityLand, listing sites). Facts only; no text or images copied. No Google Maps, Street View or Earth data is used anywhere.

## People base mesh (HUMAN)

| Asset | Source | Licence | Where |
|---|---|---|---|
| MakeHuman base mesh, default rig + weights, macro targets (data files only; the AGPL application code is not used) | https://github.com/makehumancommunity/makehuman (`makehuman/data/3dobjs/base.obj`, `rigs/default.*`, `targets/macrodetails/*`), (c) Data Collection AB, Joel Palmius, Jonas Hauquier, original Manuel Bastioni | CC0 1.0 (released September 2020) | `src/assets/models/people/src/` (+ LICENSE.txt); derived `people/*.glb` via `scripts/people-pipeline.mjs` |

## HD voices (VOX): on-device neural text-to-speech

Opt-in "HD voices" for the music-station DJs and WBSY Talk. Nothing below is bundled in the game: the library is loaded from a public CDN and the model from Hugging Face at run time, and cached by the browser. Full decision record: `docs/reference/VOICES.md`.

| Component | Used as | Licence | Source |
|---|---|---|---|
| kokoro-js 1.2.1 (hexgrad, contributor Xenova) | TTS runtime, `dist/kokoro.web.js` loaded from jsDelivr | Apache-2.0 | https://github.com/hexgrad/kokoro (npm `kokoro-js`) |
| Kokoro-82M v1.0 (ONNX export `onnx-community/Kokoro-82M-v1.0-ONNX`, from `hexgrad/Kokoro-82M`) | model weights and the 28 English voice style packs (`af_*`, `am_*`, `bf_*`, `bm_*`) | Apache-2.0 (HF model card metadata of both repos). Trained on permissive or public-domain audio and synthetic audio from closed TTS providers; no voice clones. | https://huggingface.co/hexgrad/Kokoro-82M |
| Kokoro training data, attribution requested by the model card | CC BY audio used in training: Koniwa `tnc` (CC BY 3.0) and SIWIS (CC BY 4.0). Neither is an English voice we ship, but the card asks for this credit. | CC BY 3.0 / CC BY 4.0 | model card, "Creative Commons Attribution" |
| StyleTTS 2 (architecture) | Kokoro is built on it | MIT | https://github.com/yl4579/StyleTTS2 |
| transformers.js (`@huggingface/transformers` 3.x) and onnxruntime-web | inference, pulled in by kokoro-js | Apache-2.0 and MIT | https://github.com/huggingface/transformers.js |
| phonemizer.js (Xenova) wrapping eSpeak NG | text to phonemes inside kokoro-js | wrapper Apache-2.0; eSpeak NG is GPL-3.0 (its `COPYING`) | https://github.com/xenova/phonemizer.js |

eSpeak NG is GPL-3.0. We do not copy or redistribute it: the user's browser downloads it from the CDN as part of kokoro-js. If this project is ever repackaged with the library vendored into the build, re-check the GPL implications first.

Candidates not used, with the reason, are in `docs/reference/VOICES.md` (Piper: GPL-3.0 engine and per-voice dataset licences; Supertonic: OpenRAIL; KittenTTS: Apache-2.0 but fewer voices).

All DJs, hosts, callers, shows and commercials (`src/audio/voice/**`) are original fiction written for this fan tribute. No real person, station or brand is named or imitated; a lint test (`tests/unit/audio/voice-content.test.ts`) enforces a deny-list of real brands, outlets and public figures.
