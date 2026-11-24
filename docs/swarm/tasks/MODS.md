# MODS lane (Ines Okafor), 24 Nov 2026

Owner's ask: players load their own model and texture packs (glTF, and RenderWare .dff / .txd from the early-2000s community packs) as mods. Nothing is bundled or uploaded.

## Status (all landed, 24 Nov)
- [x] src/mods/limits.ts, binary.ts, rw/dff.ts, rw/txd.ts (own parsers)
- [x] manifest.ts, convert.ts, glb.ts, files.ts, store.ts (IndexedDB + memory), registry.ts, boot.ts (lazy entry)
- [x] src/ui/ModsPanel.ts + mods.css; Menu.ts row `onMods` (marked `// MODS`, 3 small edits)
- [x] docs/MODS.md, docs/examples/mod-example/mod.json, CREDITS note
- [x] tests/unit/mods (44 tests), harness scripts/dev/mods-harness.html/.mjs + mods-harness-run.mjs
- No edit to VehicleSource.ts or MaterialLibrary.ts was needed.

## Hooks found
- Vehicles: `Vehicle.sources[type]` is a `GltfVehicleSource`; `Vehicle` calls `.instantiate(spec)`; `GltfVehicleSource.fromGltf({scene})` already fits length/width/height, finds wheels by /wheel/i names, paint by /paint|body/ material name, lights by /head.*light/.
- Textures: `MaterialLibrary.overrideMaps(key, variant, {map, normalMap, roughnessMap, repeat})`.
- People: skinned to our skeleton; out of first pass (see docs/MODS.md "Not yet").

## What I read about the formats
Written from memory of the public format descriptions (GTAMods wiki "RenderWare Binary Stream File", "DFF", "TXD"; the `rwanalyze` style chunk tables). No code from any library was read or copied. Details in docs/MODS.md.

## Notes
- Orientation: RenderWare (x right, y forward, z up) -> game (x, z, -y): a rotation, so winding is kept. Winding is checked against the file's own normals per geometry and flipped if they disagree (the test writers cannot prove the real files' convention; the normals check is what protects against it).
- Version gate: geometry structs of library versions below 3.4.0.0 (0x34000) carry 12 bytes of lighting floats. Decoded from the stamp with the usual formula. NOT checked against a real file from any game: none was available.
- Paint marker colours (60,255,0) and (255,0,175) are from memory of the community convention; `paintColors` / `paintMaterial` in mod.json override them.
- Texture-native layout (platform id, filter, name[32], mask[32], raster format, compression field, w, h, depth, mips, type, dxt byte, palette, per-level size + data) is from memory of the public format description. D3D8 vs D3D9 differ only in the compression field; both handled.
- Far-car LOD: a mod car passes `paintCell: null` so `gltfLodFor` stays null and CarLod keeps full models (main.ts already returns null from `buildModel` when `Vehicle.sources[t]` exists). Cost: mod cars are not instanced at distance.
- Size: esbuild of boot.ts (three and game modules external) = 41.6 kB minified, 15.4 kB gzip, plus 3.9 kB CSS. Single-file build now 11,833,950 bytes (was 11,833,751: +199, the Menu row), because nothing imports src/mods from main yet. Wire it behind `import.meta.env.VITE_HOSTED === '1'` so it stays out of the single file.
- Harness evidence (browser, software GL): /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/mods/h2/car.png, panel.png, info.json. A .dff car and a .txd ground go through the real registry; the Kenney sedan example installs from the repo files (1,368 triangles, 4 wheels, 2 steer).

## Not verified
Any real community .dff / .txd file; the running game with the mod wired in; a phone; IndexedDB quota behaviour; wall-sheet layers replaced through overrideMaps in the game.


## Second shift (24 Nov, Ines): verified, nothing left red
- `npx tsc --noEmit` clean; `npx vitest run tests/unit/mods --maxWorkers=1`: 5 files, 44 tests green. Picture copied to `docs/swarm/teams/sheets/mods-harness.png` (a .dff box car built in code beside the Kenney sedan example, on a mod-replaced ground texture).
- Single-file build re-run: index.html 11,833,950 bytes (budget 12,000,000). src/mods is not imported by main.ts yet.

### Exact lines for src/main.ts (lead only; hosted build only, so the single file stays unchanged)
1. After `const panels = new PanelManager(document);` (about line 383) and before `const menu = new Menu(`:
```ts
// MODS: the player's own model and texture files (src/mods, docs/MODS.md). Hosted build only; never in the single file.
let modsApi: { open(): void } | null = null;
if (import.meta.env?.VITE_HOSTED === '1') {
  void import('@/mods/boot').then(async ({ startMods }) => {
    modsApi = await startMods({ tier: quality, overlay, panels, target: { vehicleSources: Vehicle.sources, materials }, safe: params.get('mods') === 'off' });
  });
}
```
   (`safe` covers `?mods=off`. The `ModTarget` field names match `src/mods/registry.ts`; the "wiring types" test pins that `Vehicle.sources` and `MaterialLibrary` fit it.)
2. In the `new Menu(overlay, { ... })` callbacks add: `onMods: () => modsApi?.open(),` (the Settings row only shows when `onMods` is given).
- Cars spawned before the restore finishes stay stock until they respawn; nothing else needs a reload.

## First real files (the lead, 24 Nov)

The owner's reference pack holds one clearly fan-made item: a 2002 car mod (its readme names four modders as authors;
no licence text). The lead downloaded its model and texture files into the session's tool-results folder (never the
repository) and ran the parsers on them in a scratch test:

- `parseDff` on the 1.2 MB model: OK. 57 frames, 30 geometries, about 25,700 triangles, materials with texture names.
- `parseTxd` on the 4.4 MB texture dictionary: FAILED with "A chunk in the file claims to be larger than the file."
  The file is complete (size matches Drive's). So the texture parser mis-reads at least one real PC dictionary of that
  era (the readme lists 1024, 512, 256 and 128 pixel textures, one with alpha). To fix: lane MODS3.
- Not shippable: it is other people's work without a licence, and far over a car's triangle budget. It is a mod-loader
  test case only.

## MODS3 (24 Nov): the first real dictionary decodes
Cause (found by dumping the chunk tree; the parser's own layout was right): the 2002 file was written by an old community
tool that leaves its sizes stale. (1) The outer dictionary size is 24 bytes past the end of the file. (2) Every texture
chunk states the size of the texture it replaced (5,236 bytes for what are 1,049,000-byte 1024 px textures; 17,524 for
256 and 512 px), so the second chunk is not where the sizes say. The fields inside each texture are right (platform 8,
raster 0x2600 / 0x2500, a 4-byte size before the level, library stamp 0x0c02ffff). (3) The last texture ends 4 bytes
(plus its empty extension chunk) before its data should. (4) Name fields hold stack leftovers after the NUL: the first
NUL-terminated string is the name; any "smarter" choice picked wrong names ("side2" for "1").
Fix (`src/mods/rw/txd.ts`): the dictionary is walked by what each record holds, not by its sizes; the lower mip levels are
stepped over by their own sizes; the extension chunk after each texture is honoured by size when it fits; a last level
short by at most 64 bytes (single level) is padded with zeros and reported in the new `TxdResult.warnings`; anything else
still stops with "The texture "name" is cut short." (`truncated`). 7 new tests in `tests/unit/mods/real-layout.test.ts`
(layout rebuilt from the measurements with invented pixels and names; no real file in the repository). 51 mods tests green.
Decoded texture list (names and sizes only): 1 (1024x1024), 2 (1024x1024), 3 (1024x1024), 6 (256x256), crashed
(1024x1024), 4 (512x256, alpha), white64 (128x128, alpha). All 8-bit palette. The model's materials also name "5", which
is not in this dictionary (its pixels are elsewhere or missing: that material draws untextured).
Model (frames, 57): the converter's reading, after two fixes. Paint: the body materials are a plain dark red (144,4,4),
not the community green marker, so the default paint match does not find them; a mod.json `paintColors: [[144,4,4]]` is
needed for this file (not changed: automatic guessing was judged out of scope). Wheels: the file has a merged 4,608
triangle `wheel` atomic spanning the whole car AND four single wheel meshes (`wheel_rf`, `wheel_lb`, `wheel_rb`, `wheel_lf`,
1,144 each) under the four dummies. Before: eight wheel groups (the merged copy repeated at every dummy). Now: the four own
meshes only (`convert.ts`, `hasExplicitWheels`). Seat markers: `ped_rearseat` is an 8 triangle box; `ped_*` frames are now
skipped. Damaged copies (`*_hi_dam`, 12 atomics) and the low-detail body (`chassis_vlo`) were already dropped. Parts kept:
chassis_hi (8,058 triangles), bumper front and rear, bonnet, boot, windscreen, four doors, two wings (all `_hi_ok`), four
wheels: 16,596 triangles built (was 35,036). No `wheel_*` light frames carry atomics; headlights, taillights, brakelights,
reverselights, indicators and exhaust are frames only (nothing to draw).
Still open: 16.6k triangles is over a normal car's budget; "5" texture; automatic paint-colour guess; Xbox / PS2 files;
the model with its textures was not looked at in the running game.
