# MDL - models research (Stage 3)

Owner: MDL (models-research, Haiku). Scope: CC0 (or explicitly permissive) glTF cars and characters for
`src/assets/models/`, matching the loader contract in `src/assets/models/README.md`. Downloads live in the scratchpad
(`scratchpad/mdl/`, exports in `scratchpad/mdl/out/`); scripts in `scratchpad/mdl-tools/` (outside the downloads).
No repo source was changed; `docs/CREDITS.md` gained a "Models" section.

## Reachability (this sandbox)

Works: `raw.githubusercontent.com`, `registry.npmjs.org` (incl. the npm search API `/-/v1/search`), WebSearch, WebFetch
for a few non-blocked pages.

Blocked or unresolved (not usable from here): `kenney.nl` (DNS: getaddrinfo ENOTFOUND), `quaternius.com` (same),
`poly.pizza` (timeout), `opengameart.org`, `github.com` API (403), `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs` (timeouts).
A `github.com` repo page works only through the search index, not as a raw file. Allow-listing requested via `@fable`
in the transcript (kenney.nl, quaternius.com, poly.pizza) to verify the primary CC0 text.

## Recommendations

Loader names are the `src/assets/models/README.md` file names. Every file below is a straight copy or a clip-rename of
a file in the source pack; no geometry was edited.

| Slot (our file) | Source file | Pack / author | Licence | Tris | Size (out) | Nodes / clips | Action |
|---|---|---|---|---|---|---|---|
| `vehicle-sedan.glb` | `sedan.glb` | Kenney Car Kit (Kenney) | CC0 1.0 (secondary, see below) | 2,032 | 32,048 B | `wheel-front-left/right`, `wheel-back-left/right`, `body`; one `colormap` texture | rename only (copy) |
| `vehicle-suv.glb` | `suv.glb` | Kenney Car Kit | CC0 1.0 (secondary) | 2,474 | 36,232 B | `wheel-*`, `body` | rename only |
| `vehicle-cop.glb` | `police_car.glb` | Kenney Car Kit | CC0 1.0 (secondary) | 2,304 | 35,812 B | `wheel-*`, `body`, `grill` | **no light-bar meshes**; add `bar`/`siren` red/blue meshes before the cop looks right |
| `vehicle-boxtruck.glb` | `delivery_van.glb` (interim) | Kenney Car Kit | CC0 1.0 (secondary) | 2,476 | 35,288 B | `wheel-*`, `body`, `door` | **stand-in only**: 3.25 m long, 1.65 m tall van, not a true box truck |
| `character-hoodie.glb` | `hooded_adventurer.glb` | Quaternius (via netforge) | CC0 1.0 (per NOTICE) | 7,276 | 568,596 B | skinned (4 skins), 24 clips | rename clips: strip `CharacterArmature\|` so `Idle`, `Walk`, `Run` are exact |
| `character.glb` | `worker.glb` | Quaternius (via netforge) | CC0 1.0 (per NOTICE) | 1,852 | 188,600 B | skinned (1 skin), clips `Man_Idle`, `Man_Walk`, `Man_Run` (after prefix strip: `Idle`, `Walk`, `Run`) | rename clips (done in `out/character.glb`) |

Renames applied in `scratchpad/mdl/out/`: `character.glb` and `character-hoodie.glb` were re-exported with
gltf-transform (meshopt kept); clip names reduced to `Idle`, `Walk`, `Run` (plus the other clips, untouched).
Vehicles are plain copies: `vehicle-sedan.glb`, `vehicle-suv.glb`, `vehicle-cop.glb`, `vehicle-boxtruck-interim-delivery_van.glb`.

Orientation and units (checked from node positions): Kenney cars are y-up, ground at y=0, long axis z, front at +z
(police `grill` at z=+1.45 m, firetruck grill at z=+1.57 m). The loader does not need a rotation. Width 1.5 m, height
1.3 to 1.65 m, lengths 2.55 to 3.25 m.

Characters: the rigs have a root armature scale of 100 (Blender cm export), so raw bounding boxes read in cm units. The
loader normalises height to 1.75 m, so this should be fine; verify in game (open risk).

### Held for approval (not in CREDITS)

- `vehicle-boxtruck-munim-APACHE-APPROVAL.glb` (`truck-box.glb` from `munim-maps-vehicles@0.5.0`, scratch copy only):
  the only real box truck found (8.8 m long, 3.63 m tall, 13,456 tris, 349,312 B). Licence is Apache-2.0 at package level
  (`LICENSE` in the tarball), models are generated from code and not separately licensed. Not CC0; PRD §2.1 rule 5 needs
  the user's confirmation, so it is held. Also: all wheels are inside one node (`truck-box`), so the loader cannot find
  wheels until the mesh is split into `wheel-*` nodes. The same pack has `car-sedan`, `car-suv`, `car-police` (15k tris,
  ~0.34 MB each) with `headlight`/`taillight`/`light-red`/`light-blue` materials, also single-node.

## Candidates table (checked)

| Candidate | Where | Licence evidence | Result |
|---|---|---|---|
| Kenney Car Kit (sedan, suv, truck, police, van, delivery_van, taxi, firetruck, garbage_truck, race, sedan/suv luxury) | `@netforge/asset-library-files@0.2.0` `library/lowpoly/*.glb` (npm tarball, 18.7 MB) | Package MIT (`LICENSE`); the art is CC0 per its `NOTICE`, naming "Car Kit https://kenney.nl/assets/car-kit" and "License.txt reads CC0". Secondary: WebSearch lists the Kenney Car Kit as CC0 with GLB. | Recommended (cars) |
| Quaternius characters (adventurer, hooded_adventurer, worker, blocky, wolf) | same npm package | `NOTICE`: Quaternius, CC0 1.0, poly.pizza pages state CC0 | Recommended (hooded_adventurer, worker). `adventurer.glb` (10k tris, 0.62 MB) is the fallback |
| Quaternius Ultimate Animated Character Pack (2019) | GitHub `wellmota/tutory-personagens` (`quaternius-uac/LICENSE.txt`, raw 200) | Primary-form CC0 1.0 LICENSE.txt, fetched | Licence verified for the pack. No GLB downloaded from this repo |
| Quaternius Ultimate Modular Men Pack (Adventurer, Hoodie Character) | poly.pizza (per WebSearch) | CC0 per WebSearch summary | Not downloadable from here (poly.pizza blocked) |
| munim-maps-vehicles 0.5.0 (57 vehicles) | npm (`LICENSE` Apache-2.0; README says generated from code, no logos) | Apache-2.0 package | Held (see above). Only truck-box and car-* judged |
| Khronos glTF-Sample-Assets: ToyCar | raw README | CC0 1.0 (Odendahl, Chadwick) | Toy-scale car with 8 cameras and clearcoat; not evaluated further (not a car set) |
| Khronos CesiumMilkTruck, CesiumMan, RiggedFigure | raw README | CC-BY 4.0 (Cesium), with a Cesium logo marked as a trademark | Not recommended: credit needed, and PRD §2.1 rule 3 needs approval; logo needs removing |
| Khronos Fox | raw README | CC0 (model) + CC-BY 4.0 (rigging) | Animal, not used |
| three.js `examples/models/gltf/` (ferrari, Horse, Parrot, Stork, Flamingo, RobotExpressive, Xbot, Michelle, Soldier) | raw, mrdoob/three.js dev (200 for each) | three.js repo LICENSE is MIT (code); per-model licence not verified (no README fetched) | Not used. Xbot, Michelle, Soldier are Mixamo-derived: excluded by the user's rule |
| Kenney Blocky Characters (`blocky_a` to `blocky_r`) | netforge package | CC0 per NOTICE | Rejected: 72 tris, unlit, no skin, clips lowercase (`idle`, `walk`, `sprint`) |
| NoLimitNexus/game-models | raw README (no root LICENSE; `licenses/` not fetched) | own body kit (licence not verified); animation clips from KayKit Rig_Medium (CC0, Kay Lousberg, per README) | Not used: own meshes unlicensed |
| tilakpatell/tilakverse-assets | raw README | CC0 Quaternius packs (UAL, city, etc.) | Not used this pass (no car/character set beyond UAL clips); UAL1 has run/walk clips if needed later |
| nrknithin/html-anime, OxyHQ/GoWay | raw README/LICENSE | MIT / Breathe licence (code); PR pages mention Kenney and Quaternius GLBs | Not used. Their PRs point to the same packs |
| codels-cli, anima3d, @adatechnology/game-vehicles-*, @anabis/kenney-space-kit-mirror, @jgengine/assets | npm search | procedural or space kit or index-only | Not used |

## Dead ends and caveats

- The npm search surfaced mostly unrelated packages; only `@netforge/asset-library-files` and `munim-maps-vehicles` carried
  real car or character GLBs.
- Kenney's own page is unreachable, so Kenney CC0 rests on the netforge `NOTICE` and secondary mentions (WebSearch,
  nrknithin PR #54 title "Kenney Car Kit (CC0)"). Mark: secondary, pending primary check. Pinned tarballs: netforge asset-library-files 0.2.0 sha256 a6413e6d8b5322718a097384d275b9d720927bc159e2d48871d56520b5379eca (18,740,155 B); munim-maps-vehicles 0.5.0 sha256 712e5cab4b1c2b96fb9c1853832fc0332c8632abda06ba5cf253f41b0de0c063 (12,265,705 B).
- The Quaternius adventurer origin is contested: nrknithin PR #55 says `adventurer` is in the UAC pack, another PR says
  none of the UAC's 50 characters is an adventurer. The netforge NOTICE attributes the set to Quaternius (CC0); the
  Modular Men pack (where an "Adventurer" and "Hoodie" are listed) is the likely source. Not verified at source.
- No light nodes in Kenney (`headlight`/`taillight` absent): night lights will not be emissive; cop bars absent.
- Kenney cars: the loader's wheel detection works (`wheel` in name, `front` for the front pair).

## Open items (for orchestrator)

1. Allow-list `kenney.nl`, `quaternius.com`, `poly.pizza` so the CC0 text can be read from the primary pages (@fable asked).
2. Decide the box truck: CC0 `delivery_van` stand-in now, or approve munim `truck-box` (Apache-2.0, needs wheel split).
3. Cop light bars (add `bar`/`siren` meshes) and headlight/taillight nodes for night lights.
4. Verify the character scale in game (armature scale 100).

## Recommended CREDITS lines

See the "Models" section appended to `docs/CREDITS.md`.
