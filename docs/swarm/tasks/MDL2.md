# MDL2 - GTA-4/5-grade cars and people (models research, pass 2)

Owner: MDL2 (models-research-2, Haiku). Scope: higher-fidelity glTF/GLB cars and rigged humans that can be downloaded from
this sandbox, with licence evidence per pack. Downloads: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/mdl2/picks/`
(hashes in `.../scratchpad/mdl2/SHA256SUMS.txt`). Clones (read-only evidence) in `.../scratchpad/mdl2/repos/`. Inspector script
(reads only the GLB JSON chunk, runs nothing from downloads): `.../scratchpad/mdl2-tools/glbinfo.py`. No repo source changed.

## Bottom line

- **People: good options found.** Quaternius Ultimate Animated Character Pack (CC0, verified `LICENSE.txt`) has realistic-proportion
  civilians (Casual, Suit, Worker) with exact `Idle`, `Walk`, `Run` clips and PBR materials. Recommended.
- **Cars: no downloadable CC0 realistic sedan, SUV, taxi, box truck or police car was found.** Best vehicle leads are
  CC-BY 4.0 (Khronos CarConcept, too heavy and needs approval) or licence-unverified (three.js Ferrari, a sports car).
  Our Kenney Car Kit cars (MDL) remain the only CC0 vehicle set. Unlocking kenney.nl or sketchfab.com would matter most here.

## Top picks (ranked by fidelity vs budget)

Fidelity 1 to 5 vs GTA 4/5 (5 = indistinguishable in style and detail class). Triangles and clips from `glbinfo.py`.

| # | File (scratchpad `picks/`) | Author / pack | Licence (evidence) | Tris | Bytes | Textures | Rig / clips | Fidelity | Why |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `quaternius-uac-Casual_Male.glb` | Quaternius, Ultimate Animated Character Pack | CC0 1.0. `LICENSE.txt` fetched: https://raw.githubusercontent.com/wellmota/tutory-personagens/main/quaternius-uac/LICENSE.txt (HTTP 200, sha256 83d8959f...bdd8a), repo https://github.com/wellmota/tutory-personagens (main, 318fec6) | 6,492 | 1,238,360 | PBR materials, no embedded images | 1 skin; clips incl. exact `Idle`, `Walk`, `Run` (17 clips); armature `CharacterArmature` | 3 | Believable civilian proportions; the loader's name rules match with no renames |
| 2 | `quaternius-uac-Suit_Male.glb` | same | CC0 1.0 (same LICENSE.txt) | 6,518 | 1,208,584 | PBR, no images | `Idle`, `Walk`, `Run` present | 3 | Business-suit civilian, the closest GTA-style pedestrian in this set |
| 3 | `quaternius-uac-Suit_Female.glb` | same | CC0 1.0 | 6,810 | 1,258,676 | PBR | `Idle`, `Run`, `Walk` | 3 | Female civilian counterpart |
| 4 | `quaternius-uac-Casual_Female.glb` | same | CC0 1.0 | 6,624 | 1,245,932 | PBR | `Idle`, `Run`, `Walk` | 3 | Female casual |
| 5 | `quaternius-uac-Worker_Male.glb` | same | CC0 1.0 | 2,524 | 1,030,460 | PBR | `Idle`, `Run`, `Walk` | 2 | Lower-poly fallback for crowds |
| 6 | `threejs-ferrari-HELD-licence-unverified.glb` | three.js `examples/models/gltf/ferrari.glb` (mrdoob/three.js) | **Not verified.** three.js is MIT for code; no per-model licence found in the repo (fetched `examples/models/gltf/` listing, no LICENSE beside the model). Do not ship until the author's licence is confirmed | not counted | 1,681,572 | external `ferrari_ao.png` | none (static) | 4 (car look) | Only realistic-proportion car asset found that is downloadable; a sports car, not a sedan, so it is a look reference rather than a taxi or police car |

Verified raw URLs (HTTP 200): `.../quaternius-uac/Casual_Male.glb`, `Suit_Male.glb`, `Suit_Female.glb`, `Casual_Female.glb`,
`Worker_Male.glb` on raw.githubusercontent.com (repo `wellmota/tutory-personagens`, branch `main`); ferrari:
https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb.

Downloaded-file sha256 (also in `SHA256SUMS.txt`):
- Casual_Male `16dadd7ea6f39c8f6d2c8cd60c7c12b585d689afc1e653c893803c0da84bdd8a`
- Suit_Male `d0b4909001e214b4d30399575b68a23f13894d12ad15e5d030beadb88b483c1f`
- Suit_Female `a7cc7532a22a8bc7319d7ec27a601d197cffc785bb55ee867bb039e44bca93ef`
- Casual_Female `534f484714d958fbbe60723b9a34871ce9ff921d7b20851bb5792be0d38c389a`
- Worker_Male `1fa6571d558ef8bd1502ccc59c9949876e85f99744662827cdb6d1d870155498`
- ferrari `cafe3f48da6797aa9bde75ca768bc5b57db366575fd233e90df186ae988a876e`

## Candidates checked (not picked)

| Candidate | Where | Licence evidence | Result |
|---|---|---|---|
| Khronos **CarConcept** (concept car, 213k tris) | `KhronosGroup/glTF-Sample-Assets` `Models/CarConcept` (sparse clone, `LICENSE.md` fetched, raw HTTP 200) | **CC-BY-4.0** (model and textures; Darmstadt Graphics Group / Eric Chadwick), Khronos logo excluded | Fidelity 4, but GLB 11.8 MB, glTF+WEBP 9.1 MB (over the 6 MB cap). Needs orchestrator approval and a credit line (PRD §2.1 rule 3). Held: a decimated copy would be a derivative and must say so |
| Khronos **CesiumMan** (4,672 tris, one clip) | same repo | CC-BY-4.0 (Cesium) | Fidelity 2, one unnamed clip. Not recommended |
| Khronos **CesiumMilkTruck** (2,856 tris) | same repo | CC-BY-4.0 (Cesium); Cesium logo trademark | Toy-like truck, fidelity 2. Not recommended |
| Khronos **ToyCar**, **RiggedFigure** | same repo | CC0 / CC-BY-4.0 respectively | Toy scale or 256 tris. Rejected |
| Babylon.js **HVGirl** (1,872 tris, 2.9 MB) | `BabylonJS/Assets` `meshes/HVGirl.glb` (sparse clone) | Repo LICENSE is CC-BY-4.0, but no per-asset source found | Clips `Idle`, `Samba`, `Walking`, `WalkingBack`: Mixamo-style names, so possibly Mixamo-derived. **Rejected** under the Mixamo rule until its origin is confirmed |
| Babylon.js **car.glb** (474 tris) | same | repo CC-BY-4.0 | Fidelity 2. Not recommended |
| Babylon.js **Dude** (`dude.babylon`) | same | readme only ("found as part of XNA") | Licence not verified. Not used |
| three.js **Xbot**, **Soldier**, **Michelle** | `mrdoob/three.js` `examples/models/gltf` | not verified; Mixamo-derived | Rejected (user rule: no Mixamo rigs) |
| KayKit **Adventurers** (4 characters, stylised fantasy) | `KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0` (repo found via search; `LICENSE.txt` says CC0) | **CC0** (Kay Lousberg; `LICENSE.txt` in repo, read) | Stylised low-poly fantasy, fidelity 1 to 2. Files are `.gltf` + `.bin` under `addons/kaykit_character_pack_adventures/Assets/gltf/`, not GLB. Clip names not verified. Not recommended for GTA-look people; usable as a fallback rig |
| Quaternius **Cars** (`quaternius-lowpoly-cars` BasicCar etc.) | `@jgengine/assets@0.51.0` index (metadata only; the GLBs are not in the package) | CC0 per index | Stylised low-poly (1,868 tris). GLB not downloadable here (quaternius.com / poly.pizza blocked) |
| `@pmndrs/assets@1.7.0` | npm (tarball fetched, sha256 152bd218...) | CC0-1.0 | Only fonts, HDRIs, matcaps, textures and suzi/bunny/pmndrs test models. No vehicles or humans |
| `@jgengine/assets@0.51.0` | npm (tarball fetched, sha256 743fe35f...) | Apache-2.0 package; index entries CC0 | Metadata only. Lists MakeHuman (CC0 base, not GLB), Rocketbox (restricted licence, not checked), Sketchfab CC0 items (mostly museum scans, no vehicles or people) |
| `dramatis@0.1.2` | npm (tarball fetched, sha256 3a29ed02...) | Apache-2.0 | Source maps only; no models |
| Sketchfab CC0 vehicles and people | `jgengine` `sketchfab.json` index (1,915 records) | CC0 per record | Not downloadable (sketchfab.com blocked). Records found are museum scans and animals, not vehicles or people |
| Kenney Car Kit (already in repo via MDL) | `@netforge/asset-library-files@0.2.0` | CC0 (secondary) | Fidelity 2 (toy-proportioned). Still the only CC0 vehicle set |
| `munim-maps-vehicles` truck-box | npm | Apache-2.0 package | Previously held by MDL; not re-evaluated |

## What is NOT obtainable from here (and which host would unlock it)

| Want | Blocked by | Unlock |
|---|---|---|
| Kenney Car Kit primary page and CC0 text (confirmation) | DNS fails for `kenney.nl` | allow `kenney.nl` (also the Racing and Car kits) |
| Quaternius packs as GLB (cars, modular men, Ultimate Vehicles) | `quaternius.com` and `poly.pizza` unreachable | allow `quaternius.com`, `poly.pizza` |
| Sketchfab CC0 vehicles and people (the index exists) | `sketchfab.com` not allowed | allow `sketchfab.com`, `media.sketchfab.com` (check each licence) |
| Realistic CC0 cars on GitHub | not found by search; `codeload.github.com` returns 403 for zip downloads, though `git clone` over github.com works | none needed for git; a zip path would need `codeload.github.com` |
| CARLA vehicle packs, Mixamo-free human sets | not tested (time) | `carla.org` (untested) |
| Opengameart kits | `opengameart.org` blocked | allow `opengameart.org` |

Note: `git clone` from `github.com` works through the proxy (shallow and blobless sparse clones were used). That is the fastest route to
more repos. `raw.githubusercontent.com` and `registry.npmjs.org` also work.

## Recommendations and loader renames (src/assets/models/README.md)

The loader needs `character*.glb` for pedestrians and the player. Clip names match the loader's exact `Idle`, `Walk`, `Run` rule, so no
renames are needed. Suggested names:

| Our file | Source (picks/) | Notes |
|---|---|---|
| `character-casual.glb` | `quaternius-uac-Casual_Male.glb` | Adds a second clothing variant. `character.glb` wins if it exists, so keep the current `character.glb` (MDL) as the player unless the swap is approved |
| `character-suit.glb` | `quaternius-uac-Suit_Male.glb` | Best civilian look |
| `character-suit-female.glb` | `quaternius-uac-Suit_Female.glb` | Female civilian |
| `character-casual-female.glb` | `quaternius-uac-Casual_Female.glb` | Female casual |
| `character-worker.glb` | `quaternius-uac-Worker_Male.glb` | Low-poly crowd fallback |
| `vehicle-*.glb` | none recommended | Keep MDL's Kenney cars until a CC0 realistic set is confirmed |

Budget: the four people files are about 1.2 MB each (about 1.6 MB after base64). Five people files add about 8 MB to the single-file artifact.
Current artifact is about 6.5 MB (Stage 0 baseline), so budget is tight. Use meshopt (`npx gltfpack -cc -tc`) before shipping or ship two.
Test in game: confirm the loader's armature-scale handling and that the cloth tints (`Shirt`, `Pants`) read correctly.

## Licence and credits

- Recommended and appended to `docs/CREDITS.md`: **Quaternius Ultimate Animated Character Pack** (CC0 1.0, LICENSE.txt verified).
- Not appended (held): CarConcept (CC-BY-4.0, needs approval and size work), three.js Ferrari (licence not verified), HVGirl (possible Mixamo origin).
- No Mixamo-derived rigs were used. No Street View or Rockstar material was touched.

## Open items (for the orchestrator)

1. Approve or reject the five Quaternius character files (recommended), and the size plan.
2. Decide whether to approve CarConcept (CC-BY-4.0). Its size would need a meshopt or decimation pass, which makes it a derivative with a note in CREDITS.
3. Confirm the Ferrari licence with its author (or drop it). Even then it is a sports car, not a taxi or cruiser.
4. Allow-list `kenney.nl`, `quaternius.com`, `poly.pizza` and `sketchfab.com` if vehicles matter; the GitHub route for vehicles produced nothing realistic.
5. Read the Quaternius character GLBs in the game build for scale and cloth-tint behaviour (not tested here).
