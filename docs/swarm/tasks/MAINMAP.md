# MAINMAP task record (real-street map becomes the main map)

Status: done in the working tree, not committed by this lane; `src/main.ts` patch waits for the lead (22 Nov 2026). Engineer: Rhea Vance (MAINMAP).

Owner's decision, 22 Nov: "I want the real-street map made the main map." The lead added `src/world/mapChoice.ts` (`chooseMap`) and one line in `src/main.ts`.
This lane did what follows from it. Scratch: `scratchpad/mainmap/` (scripts `play.cjs`, `mission.cjs`, `boot.cjs`, `probe.mjs`; logs and frames).
All frames were rendered in software; nothing here is a frame rate. Counts are triangles, draw calls and megabytes.

## 1. What broke (hosted build, no map parameter, scripted first five minutes)
Works, seen in the running game (desktop, `?q=low`, 640 x 360): boots with no page errors; spawn at HOME on Throop Ave; HUD prompt "F Enter HOME"; the pointer shows
"Offer: Block Party 5 m"; walking to a giver ring and F starts Bodega Run; the WAX DELI door shows "F Enter WAX DELI" at the real door; save and reload keep the position.
Two missions were finished by a scripted walk-through in the running game (`mission.cjs`): Bodega Run (timer, pick up, three deliveries, +$150) and Block Party
(three pick-ups at real shops, deliver, +$250). The unit test `roadnet-game.test.ts` already plays all 20 story missions on the real places table.
Wrong, and fixed or handed over:
- The line "Real-map preview: ... expect rough edges." drawn bottom-left by main.ts. `REAL_NOTICE` is now empty and the patch removes the line.
- The whole grid world was built (roads, lots, buildings, furniture, props, signals, skyline, an el) and thrown away. Item 4.
- The grid's el stayed live on the real map: invisible trains rumbled (audio) and `tryBoard` ran at grid coordinates. The skip builds an inert transit.
- Phone tier on the real map drew 404,560 triangles at the spawn, 123k of them in the SHADOW pass: `BlobShadows.buildSunCasters` made one mesh of every lot loaded at boot
  (about 12k lots), drawn whole in every shadow pass. Fixed (item 5).
- Native "Boot smoke test" (`native/scripts/smoke.mjs`) failed 18 checks. Ours, fixed (item 6).
- Not fixed, noted: the phone sun-shadow casters cover only the lots loaded at boot (the first rings), so on the phone tier buildings farther out cast no sun shadow.
  The HUD shows an fps readout in the top-left corner in the scripted shots (loop stopped); not checked whether it is the usual setting.
- Also seen in the running game (`play.cjs`, final tree): the WAX DELI door, entering the room, the shop panel opening and closing, the exit back to the street, the phone, the map
  screen (no preview wording; the map shows the grown 15 km2 net and its blips), getting into a car and driving it (77.6 m in 5 s; the script picked a traffic car in a far ring, so
  that frame shows bare far-ring ground, not a street).

## 2. Saves
Before: one set of slots (`gta-bedstuy.save.v2.<slot>`); a save carries `pose.map`; a pose from the other map was sent home on foot (`poseOnMap`) but the rest of the save
(missions, story, wanted, inventory flags) crossed maps.
Now (`src/ui/GameSave.ts`): `SaveStore(storage, map)`. The grid keeps the original key prefix (`gta-bedstuy.save.v2.`), so every old save still loads on `?map=grid`. The real map
uses `gta-bedstuy.save.v2.real.`. The legacy v1 position key is grid only. Slot lists, save, load, delete, export and import work on the map in play.
- First visit to the real map with grid saves only: `bootSave()` returns a carry-over of the newest grid save: cash, records, held items, look and radio station. Pose is a grid pose,
  so `poseOnMap` puts the player at HOME on foot; the clock is 17:30 (`CARRY_OVER_HOUR`); missions, story, phone, wanted, flags and day start fresh. `saves.applyCarryOver()`
  (one main.ts line, after `bind`) applies it and writes the first real autosave, so it happens once. The grid slots are never touched.
- Saves the real map made before it had its own slots (pose.map 'real' in the shared slots) are COPIED whole into the real slots on first boot (the originals stay).
- Corrupt grid slots are ignored; a real save always beats a carry-over.
Tests: `tests/unit/ui/map-saves.test.ts` (8), plus the existing `game-save`, `story-save` suites unchanged.
Checked in the running game: real map saves to `gta-bedstuy.save.v2.real.slot1` and reloads to the saved spot.

## 3. The notice and the Settings row
`REAL_NOTICE` is `''`; no preview wording remains in `src/`. Pause menu, Settings, Game group: "Map" row (action, press twice) showing "Real streets" or "Classic grid",
reloading with `?map=grid` or without (with `?map=real` on a phone). Hidden in the single-file build (`hostedBuild()` false) and in tests. It reads the map in play from
`window.__gtaMap` (set by the main.ts patch) and autosaves before the reload. Tests: `tests/unit/ui/map-switch.test.ts` (10: `chooseMap`, `currentMap`, `mapSwitchUrl`, the row).

## 4. Start-up cost of building the grid world and dropping it
`buildGridModelOnly(data)` (WorldBuilder.ts) returns the grid MODEL (graphs and crosswalks that missions, the minimap, pedestrians, signals and the pointer are built on) and
empty groups. What the real path still reads from the grid world: `grid`, `lots` (replaced by the real lots), `group`, `colliders`, `furnitureGroup`, `lamps` (all replaced by `Object.assign`),
`signalsGroup` and `transit` (stand-ins: empty group, inert el). Interiors, doors and lamps are not built by `buildWorld` (the real path calls `applyDoors()` and builds the interiors itself).
Measured, hosted build, desktop `?q=low`, same box, scratch worktree, only the skip differs (the box was loaded by other lanes' jobs, so times are an upper bound):
| | grid world built (as now) | grid built as a model only (patch) |
| grid stage of boot | 28,419 ms | 23 to 83 ms |
| JS heap after boot and GC | 241 MB | 220 MB |
| JS heap peak while booting | 1,251 MB | 874 MB |
The real-map spawn view moved by a few draws (232 to 215) between the two builds; traffic is random, not attributed to the patch.
The patch is `scratchpad/mainmap/main-patch.diff` (unified diff against HEAD `8d861be`, applies with `patch -p1`). It also: passes `quality === 'phone'` to `chooseMap`
(item 5), sets `window.__gtaMap`, removes the notice line, builds `SaveStore(undefined, mapName)` and calls `saves.applyCarryOver()`.

## 5. Phones (emulated iPhone 13, `?q=phone`, memory probe `memprobe3.cjs` and `boot.cjs`; no real device was available)
| | grid | real, before the fix | real, after the fix |
| JS heap after boot and GC | 72 to 83 MB | 152 MB | 144 MB |
| JS heap peak while booting | 260 to 297 MB | 507 MB | 410 MB |
| textures on the GPU (estimate) | 84 MB | 80 MB | 80 MB |
| live 2D canvases | 24 MB | 34 MB | 34 MB |
| triangles in the scene (all meshes, all resident) | 0.88 M | 1.25 M | 1.25 M |
| spawn view: draw calls | 90 to 108 | 86 | 61 |
| spawn view: triangles (scene + shadow pass) | 125 k | 404 k (scene 282 k + shadow 123 k) | 282 k (scene 280 k + shadow 1.7 k) |
| process memory, renderer / gpu | 660 / 529 MB | 754 / 471 MB | not taken |
PHONE2 targets: heap after GC under 250 MB (met), textures under 100 MB (met), live canvases under 40 MB (met), budget 300 k triangles and 150 draws (met after the fix).
The fix: `BlobShadows.buildSunCasters` keeps one mesh while the building prisms are under 60 k triangles (the grid map, 31 k) and above that cuts them into 200 m cells like the
other tiers, so a shadow pass draws only the cells inside the sun box (`tests/unit/render/phone-caster-cells.test.ts`).
Verdict: even inside its budgets the real map on the phone tier holds about twice the grid's heap, 1.6 times its boot peak and 2.3 times its spawn triangles, and none of it has been
tried on a real iPhone, whose tab was killed for memory before. So phones default to the grid: `chooseMap(hosted, param, handheld)` returns the grid for `quality === 'phone'` unless `?map=real`;
the Settings row switches either way. Reverse the default after a real-iPhone test (`?debug=mem`): drop the `handheld` argument in main.ts.

## 6. Everything that assumed the grid was the default
- Title backdrops and loading tips: pictures and generic tips only, nothing grid-specific (Throop Ave exists on both maps).
- HUD pointer targets: `placesReal.ts` updates `NAV_TARGETS` in place; HOME and WAX DELI doors resolve to the real lots (checked: prompt at the door).
- Tutorial: none exists in the code.
- Native smoke test (`native/scripts/smoke.mjs`), why it failed: (1) it clicked in the middle of the title screen, but the title only starts on Space, Enter, a tap or a click on its prompt;
  (2) it counted its own deliberate probes as errors (the inline-script CSP probe, the `art/` directory probe) and the optional loading posters (`art/loading/poster-*.webp`, not yet made;
  `backdrops.ts` falls back to the in-engine shots); (3) it looked for the game's fetches in the page's resource-timing buffer (250 entries, lost them) and for a `ba_` people glb only.
  Fixed: presses Space; ignores those two probes and the optional posters; reads the debugger's request log taken before its own probes; any `xx_yy-hash.glb`. Result on the final tree: SMOKE OK
  (real map, frame 960 x 540 with 213 draws / 387 k triangles in software). `--query "map=grid&perf=0"` runs the grid. Workflow unchanged: it already builds with `VITE_HOSTED=1`.
- Scripts that boot the game and use grid coordinates now say `map=grid`: anim-game, crowd-audit, flicker-check, light-audit, perf-breakdown, popin-check, shots-plan, skins-closeups,
  title-art-shots, anim-peds-smoke, perf3-breakdown (its grid run). `map4-probe.mjs` has `--grid` which now means the default; use `--q` and pass `map=grid` in a copy (scratch `probe.mjs` has the fix).
- README.md, docs/README.md, docs/NATIVE.md reworded; MEMORY.md updated.

## 7. A way back
`?map=grid` (or `?map=classic`) opens the grid exactly as before: `buildWorld` is unchanged, grid saves unchanged. `npx vitest run tests/unit/sim/traffic-5min.test.ts --maxWorkers=1 --testTimeout=900000`: 14 of 14 pass (109 s). `?map=grid` boots with no page errors on desktop (`?q=low`: 220 draws / 494 k
triangles in software at the spawn), and its save and reload work under the old key (`gta-bedstuy.save.v2.slot1`).

## Checks run
- `npx tsc --noEmit`: no errors from files touched by this lane (errors in `pedPaintFace.ts` and a few `tests/unit/{audio,entities}` files belong to the FACES2, AUDIOFIX and CAMFIX lanes).
- `npx vitest run tests/unit/ui tests/unit/game tests/unit/world tests/unit/render --maxWorkers=1`: 157 files, 2,062 pass, 2 fail, both TREES lane work in progress
  (`furniture.test.ts` tree triangle budget, `culling-buckets.test.ts` tree height). Run before the last doc edits; no source changed after it.
- Single-file build: index.html 10.3 MB (budget 12 MB), no `buildRealGame`, `roadnet-r4`, `RoadNet`, `realWorld` or preview wording in it.

## Not verified
- Anything on a real iPhone. All phone numbers are emulation on a software renderer.
- A driving frame on a real street (the one taken is of a far ring), and the phone screen and shop panel by eye beyond the one frame each.
- The carry-over and the Map row in the running game: unit-tested only.
- The grid default for phones is a decision on numbers, not on a crash seen.

## Files touched
src/world/mapChoice.ts, src/world/WorldBuilder.ts (`buildGridModelOnly`), src/ui/GameSave.ts, src/ui/Menu.ts (Map row), src/world/roadnet/realWorld.ts (REAL_NOTICE),
src/render/BlobShadows.ts, native/scripts/smoke.mjs, scripts/*.mjs and anim-peds-smoke.cjs, perf3-breakdown.cjs (`map=grid`), README.md, docs/README.md, docs/NATIVE.md, MEMORY.md,
tests/unit/ui/map-saves.test.ts, tests/unit/ui/map-switch.test.ts, tests/unit/render/phone-caster-cells.test.ts.
