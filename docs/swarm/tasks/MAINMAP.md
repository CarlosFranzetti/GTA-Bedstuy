# MAINMAP task record (real-street map becomes the main map)

Status: in progress (22 Nov 2026). Engineer: Rhea Vance (MAINMAP). Not committed by this lane.

Owner's decision, 22 Nov: "I want the real-street map made the main map." Fable added `src/world/mapChoice.ts` (`chooseMap`) and one line in `src/main.ts`.
This lane did everything that follows from the switch. Scratch: `scratchpad/mainmap/`.

## 1. What broke (boot and first five minutes, hosted build, no map parameter, low tier, scripted: `scratchpad/mainmap/play.cjs`)
- Boots clean (no page errors); spawn at home on Throop Ave, HUD "F Enter HOME", the first offer is Bodega Run (pointer "Offer: Block Party 5 m"), walking to a marker and F
  starts Bodega Run, the WAX DELI door prompt shows "F Enter WAX DELI" at the real door.
- Wrong: the bottom-left line "Real-map preview: ... expect rough edges." (REAL_NOTICE drawn by main.ts). Removed (item 3).
- Wrong: the grid world was still built in full (roads, buildings, furniture, props, signals, skyline, an invisible el) and thrown away. Item 4.
- Wrong (found while reading): the grid's el (`world.transit`) kept updating on the real map: invisible trains rumbling and `tryBoard` live at grid coordinates. The patch gives the real map an inert transit.
- Wrong: the phone sun-shadow casters (`BlobShadows.buildSunCasters`) were ONE mesh of every lot loaded at boot: 123k triangles drawn whole in every shadow pass on the real map. Item 5.
- Wrong: the native Boot smoke test (`native/scripts/smoke.mjs`) failed 18 checks. Item 6.

## 2. Saves
See "Saves" below.

## Files touched
src/world/mapChoice.ts, src/world/WorldBuilder.ts (`buildGridModelOnly`), src/ui/GameSave.ts, src/ui/Menu.ts (Map row), src/world/roadnet/realWorld.ts (REAL_NOTICE empty),
src/render/BlobShadows.ts, native/scripts/smoke.mjs, scripts/*.mjs (add `map=grid`), README.md, docs/NATIVE.md, tests (map-saves, map-switch, phone-caster-cells).
