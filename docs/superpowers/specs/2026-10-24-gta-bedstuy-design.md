# GTA Bed-Stuy — Design Spec

**Status:** approved 2026-10-24 (Street View reference-only, 10-block area as drawn, sandbox v1, title "GTA Bed-Stuy")
**Date:** 2026-10-24
**Author:** Carlos Franzetti (direction), Claude (draft)

## 1. What we are building

A small, non-commercial, open-world tribute game in the spirit of GTA 5, set on
roughly ten real blocks of Bedford-Stuyvesant, Brooklyn, centred on the corner of
Throop Avenue and Kosciuszko Street. It runs in a desktop browser with no install.
You walk, jack cars, drive, dodge traffic, annoy the cops, and visit parody
versions of the kind of storefronts you actually find on those blocks.

All graphics are procedural: geometry and textures are generated in code from a
small hand-authored data file describing the blocks. Google Street View is used
as a *visual reference* while authoring that data; no Street View imagery is
stored in the repo or shipped in the game (see §9).

### What the user said

- GTA 5 clone, tribute, not commercial.
- Whole section around Throop and Kosciusko, about ten actual blocks.
- Browser 3D with Three.js (chosen in Q&A).
- Procedural graphics.
- Use Google Street View to get textures and parody locations.
- Use sub-agents as I see fit.

### Assumptions (correct me)

- Third-person camera, GTA-style, with both on-foot and driving.
- Single-player, keyboard + mouse, desktop browser (Chrome/Firefox/Safari recent).
- Low-poly, stylised look is fine; realism comes from *layout and signage* being
  recognisably Bed-Stuy, not from photo textures.
- The game is flat (no terrain); Bed-Stuy is flat enough that this is accurate.
- "Kosciusko" is how most people spell it; the official NYC street name is
  **Kosciuszko Street**. The game displays the user's spelling, "Kosciusko", on
  signs; the data file uses the official spelling as the ID.
- No missions in v1. v1 is a sandbox: drive, walk, traffic, pedestrians, wanted
  level. Missions are the first post-v1 feature.

### Success criteria for v1

1. Someone who knows the neighbourhood opens the page and says "that's Throop and
   Kosciusko" within ten seconds: the grid, the brownstone rows, the corner
   bodegas and the parody signage read as the real place.
2. Walk anywhere on the ten blocks, get in any parked or passing car, drive the
   whole grid at 60 fps on an ordinary laptop.
3. Traffic flows and stops at the grid; pedestrians wander; hitting things raises
   a wanted level that brings a cop car.
4. `npm test` passes (unit tests for world generation, collision, AI state
   machines) and a Playwright smoke test renders the scene headlessly.

## 2. The real-world area

Street grid (to be verified against OpenStreetMap; the data file is the single
place to correct it):

```
            Tompkins Ave      Throop Ave      Marcus Garvey Blvd
Hart St     ────────────────┬───────────────┬────────────────
                  block 1   │    block 2    │
Pulaski St  ────────────────┼───────────────┼────────────────
                  block 3   │    block 4    │
Kosciuszko  ────────────────┼───────────────┼────────────────   <- centre
                  block 5   │    block 6    │
Lafayette   ────────────────┼───────────────┼────────────────
                  block 7   │    block 8    │
Van Buren   ────────────────┼───────────────┼────────────────
                  block 9   │    block 10   │
Greene Ave  ────────────────┴───────────────┴────────────────
```

Two columns (Tompkins→Throop, Throop→Marcus Garvey) by five rows gives the
requested ten blocks with the title corner in the middle. Approximate block
dimensions, to be checked: about 250 m avenue-to-avenue and about 100 m
street-to-street. North is up; avenues run north–south.

I am fairly but not fully confident of the street order north of Lafayette
(Hart, Pulaski, Kosciuszko). It is data, so it is cheap to fix.

Character of the blocks (from general knowledge; the Street View pass in §9
refines this per block face):

- Mid-block: continuous rows of 3–4 storey brownstones and brick row houses,
  stoops, cornices, some fire escapes, street trees, parked cars both sides.
- Avenue corners and avenue frontage: mixed-use, ground-floor storefronts with
  roll-down gates and vinyl awnings, apartments above.
- Occasional church, school or small apartment building breaking the row.

## 3. Approaches considered

**A. Vite + TypeScript + Three.js, custom lightweight 2.5D physics (recommended).**
The world is flat, so collisions reduce to 2D shapes on the ground plane. Cars use
an arcade kinematic model (speed, steering angle, drift factor) with oriented
bounding boxes; the player and pedestrians are circles. No physics library,
no WASM, deterministic, trivially unit-testable. Risk: no ragdolls, no realistic
crashes; accepted for a tribute.

**B. Vite + Three.js + Rapier (WASM rigid-body physics).** Real vehicle dynamics
and tumbling cars. Costs a 2 MB WASM dependency, harder to test headlessly,
tuning time balloons. Over-engineering for v1.

**C. Babylon.js or PlayCanvas.** Full engines with editors. Heavier, less
ubiquitous knowledge, and the editor-centric workflow fights the "everything
procedural from code" goal.

**Recommendation: A.** Upgrade to B only if driving feel is unsatisfying after
tuning.

## 4. Architecture

Single-page app, no backend. Bundled with Vite; dependencies: `three`,
`vitest`, `@playwright/test` (uses the preinstalled Chromium), TypeScript.

```
src/
  main.ts                 boot, game loop, resize
  core/
    Game.ts               fixed-step update + render loop, pause
    Input.ts              keyboard/mouse state, rebindable keys
    Camera.ts             third-person follow cam (foot + vehicle modes)
    Rng.ts                seeded PRNG; everything procedural takes a seed
  world/
    data/bedstuy.json     streets, blocks, lots, POIs (hand-authored)
    Grid.ts               parses data -> roads, intersections, lane graph, lots
    RoadBuilder.ts        asphalt, lane markings, crosswalks, curbs, sidewalks
    LotSubdivider.ts      block polygon -> lot list (width, depth, type)
    BuildingGen.ts        lot -> brownstone / rowhouse / mixed-use / church mesh
    FurnitureGen.ts       trees, lampposts, hydrants, trash, scaffolding, gates
    Signage.ts            awning + sign text meshes from POI data
    WorldBuilder.ts       orchestrates the above into one static scene group
  textures/
    TextureFactory.ts     cached canvas-generated textures by name+params
    brick.ts, brownstone.ts, asphalt.ts, concrete.ts, awning.ts, glass.ts
  entities/
    Player.ts             on-foot controller (walk, run, enter/exit vehicle)
    Vehicle.ts            arcade car model, damage state, horn
    Pedestrian.ts         wander on sidewalks, flee when scared
    Cop.ts                vehicle + pursuit behaviour driven by wanted level
    TrafficAgent.ts       follows lane graph, stops at intersections, avoids
  physics/
    Collider2D.ts         circle, OBB, segment; overlap + resolution
    World2D.ts            spatial hash of static (buildings, curbs) + dynamic
  game/
    WantedSystem.ts       0–3 stars; crimes raise it, time decays it
    TrafficSystem.ts      spawns/despawns traffic & peds around the player
    SpawnTable.ts         vehicle colours/types, pedestrian looks
  ui/
    Hud.ts                stars, speed, radio station name, prompts
    Minimap.ts            canvas minimap rendered from Grid
tests/
  unit/                   vitest: Grid, LotSubdivider, Collider2D, WantedSystem,
                          TrafficAgent decisions, texture determinism
  e2e/smoke.spec.ts       Playwright: page loads, WebGL ok, 120 frames, no
                          console errors, screenshot saved
tools/
  streetview-reference.md how to do a reference pass (see §9)
docs/
  superpowers/specs/      this file
  world-notes.md          per-block-face notes from the reference pass
```

**Data flow.** `bedstuy.json` → `Grid` (pure, tested) → `WorldBuilder` (Three.js
meshes, static) and `World2D` (collision shapes). Entities read the lane graph
and sidewalk graph from `Grid`, move via `World2D`, and are rendered as simple
meshes. `Game` runs a fixed 60 Hz update and renders each animation frame.

**Determinism.** All procedural generation takes a seed from `Rng`. Same seed,
same city. Unit tests assert on structure (lot counts, graph connectivity) and
on texture pixel hashes.

## 5. World generation detail

- **Roads.** Each street is a centreline with a width class (avenue vs street).
  Intersections are computed, not authored. Lane graph: two lanes per street, one
  per direction, with stop nodes at intersections. Avenues get painted centre
  lines; streets get parking lanes. Crosswalks at every intersection.
- **Sidewalks and curbs.** Sidewalk strip around each block with curb cuts at
  corners; tree pits every ~12 m on street-facing sides.
- **Lots.** Block perimeter minus sidewalk is subdivided along each face into
  lots 5–7.5 m wide (brownstone module). Corner lots and avenue lots are typed
  `mixed-use`; a few random mid-block lots are typed `church`, `apartment`,
  `vacant` (fenced lot), `scaffold` (brownstone under renovation).
- **Buildings.** Generated as merged BufferGeometry per block for draw-call
  economy. Brownstone module: stoop (left/right/none), parlour-floor tall windows,
  2–3 window rows, cornice from a small set of profiles, colour from a palette
  (brownstone, red brick, painted brick, limestone), optional fire escape, roof
  parapet and water tank on taller ones. Mixed-use module: storefront bay with
  glass, roll-down gate (closed at night), vinyl awning with sign text, AC units
  and apartment windows above.
- **Signage.** Awning text and sign boards come from POIs in the data file.
  Parody names only; see §8.

## 6. Entities and gameplay

- **Player.** WASD/arrows, Shift run, F enter/exit car, mouse orbit camera, Space
  horn/jump. Capsule-as-circle collider.
- **Vehicles.** Three body types in v1: sedan, SUV, box truck; plus `cop` livery.
  Arcade model: throttle, brake, steering with speed-dependent limit, lateral
  grip, light drift. Collisions with buildings stop you and add damage;
  collisions with peds knock them down and raise wanted level.
- **Traffic.** Agents spawn at lane nodes out of view, follow lanes, keep
  distance from the car ahead, stop briefly at intersections (four-way yield,
  no traffic-light simulation in v1), despawn far from player. Target: ~30
  active vehicles.
- **Pedestrians.** Wander on sidewalk graph, cross at crosswalks, react to horn
  and to the player getting close (step aside), flee if hit or if gunfire — no
  weapons in v1, so flee only on collision.
- **Wanted.** 0–3 stars. Hitting a ped: +1. Hitting a cop car: +1. Stars decay
  after 20 s without new crimes. At ≥1 star a cop car spawns and pursues the
  player's vehicle; at 3 stars two cop cars. Pursuit is simple: steer toward the
  player along the lane graph, ram.
- **HUD.** Stars, speedometer in a car, minimap with street names, parody radio
  station name that cycles (no audio in v1 beyond simple engine/horn synth).
- **Day/night.** Simple time-of-day cycle (sun angle, sky colour, windows and
  storefront gates change state). Low cost, big atmosphere win.

## 7. Error handling

- No WebGL2 → full-page message, no crash.
- Bad or inconsistent `bedstuy.json` (dangling street reference, non-closed
  block) → `Grid` throws a descriptive error at build time; a unit test loads
  the real file so the error surfaces in `npm test`, not in the browser.
- Entities that leave the map are despawned; player is clamped to the map.
- Procedural generation failures for a single lot fall back to a plain box so
  one bad input never blanks a block.

## 8. Parody locations

The data file carries a `pois` list, each with a lot reference, archetype, sign
text and awning colour. Archetypes planned for v1: bodega/deli, laundromat,
barbershop, braiding salon, Caribbean/soul-food takeout, Chinese takeout,
pizzeria, church (storefront and brick), liquor store, 99-cent store, pharmacy,
daycare, funeral home, auto repair, new-build "luxury" condo lobby (the
gentrification gag).

Rules:
- Names are parodies of the *type* of business, never of a specific real
  business or person. Example tone: "Troop Deli — Open 25 Hours", "Kosciusz-
  K-O-Mat Laundry", "Garvey Cutz Barbershop (Walk-Ins Welcome, Patience Required)", "The Brownstone
  Residences at Hart (Now Leasing, Starting at Too Much)".
- Real street names are used as-is; they are public.
- The Street View reference pass (§9) decides *where* each archetype sits so the
  distribution is faithful (bodega on the corner that actually has one), while
  the names stay invented.

## 9. Using Google Street View (the honest version)

Google Maps Platform terms prohibit storing, caching, scraping or redistributing
Street View imagery, and the Static API needs the user's own key and billing. So:

- **We do not download Street View images into the repo, and no Google pixels
  ship in the game.** Textures are generated in code.
- **Reference pass.** The user (or Claude, transiently, with the user's API key
  supplied as an environment variable and never committed) looks at each of the
  ~24 block faces in Street View and records in `docs/world-notes.md`: facade
  type per lot, colours, stoop/no stoop, cornice style, where the storefronts
  are and what kind, trees, scaffolding, notable oddities. Those notes become
  values in `bedstuy.json` and palette entries in `textures/`.
- The reference pass is a one-time authoring step, not a build step. The game
  builds with no network access.

If you would rather actually ship Street View-derived textures, that is a
different legal posture and I would want you to decide that knowingly; I am not
a lawyer and this is not legal advice.

## 10. Name and IP

"Grand Theft Auto"/"GTA" is a Rockstar/Take-Two trademark. Non-commercial does
not by itself make trademark use safe. Mitigations in v1: the title screen says
"a fan tribute, not affiliated with Rockstar Games or Take-Two"; no Rockstar
logos, fonts, music, characters or assets are used or imitated; the README
carries the same disclaimer. Decision: the title stays "GTA Bed-Stuy" with these
disclaimers; the user chose this knowingly.

## 11. Testing strategy

- **Unit (vitest).** `Grid` produces 10 blocks, 18 intersections, connected lane
  and sidewalk graphs; `LotSubdivider` lot widths within range and lots tile the
  face; `Collider2D` overlap/resolution cases; `WantedSystem` transitions and
  decay; `TrafficAgent` yields and spacing; `TextureFactory` is deterministic
  per seed.
- **E2E (Playwright, preinstalled Chromium).** Load the dev build headless with
  SwiftShader, assert a WebGL2 context, run 120 frames, assert no console
  errors, save a screenshot to `tests/e2e/__screenshots__/` for eyeballing.
- **Manual.** Driving feel and camera are tuned by hand; the spec sets targets
  (top speed ~ 25 m/s, 0–top in ~6 s, turning circle fits an avenue U-turn).

## 12. Delivery plan (high level; detailed plan comes from writing-plans)

Work is split so sub-agents can build in parallel after the shared skeleton
exists:

1. **Skeleton** (sequential, me): Vite + TS + Three.js, `Game` loop, `Rng`,
   `Input`, `Camera`, test harnesses, CI-style `npm test`. Flat ground plane
   and a cube you can walk around.
2. **Parallel wave**: (a) `Grid` + data file + `RoadBuilder`; (b)
   `TextureFactory` + material set; (c) `Collider2D` + `World2D` + `Player` +
   `Vehicle`; (d) HUD + minimap stubs.
3. **Parallel wave**: (a) `LotSubdivider` + `BuildingGen` + `FurnitureGen` +
   `Signage`; (b) `TrafficAgent` + `TrafficSystem` + `Pedestrian`; (c)
   `WantedSystem` + `Cop`; (d) day/night.
4. **Integration + reference pass + tuning** (me): wire everything, do the
   Street View notes with the user, tune driving, screenshot review.

Out of scope for v1: missions, weapons, audio beyond synth engine/horn, saving,
mobile/touch controls, multiplayer, interiors.
