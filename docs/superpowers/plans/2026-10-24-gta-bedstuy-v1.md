# GTA Bed-Stuy v1 Implementation Plan

> **For agentic workers:** Orchestrated by Fable (this session) using superpowers:subagent-driven-development. Tasks 1–10 run in parallel as separate Sonnet/Haiku agents in the SAME working directory on disjoint files. Task 11 (integration) is the orchestrator's.

**Goal:** A playable browser sandbox on ten real Bed-Stuy blocks: walk, jack cars, drive, traffic, pedestrians, cops, day/night, procedural audio, published as a single-file artifact.

**Architecture:** Vite + TypeScript + Three.js. Hand-authored `bedstuy.json` → `Grid` (pure model) → procedural meshes (roads, buildings, furniture) and 2D static colliders. Entities (player, vehicles, peds, cops) move on a flat 2D physics world and are rendered as low-poly meshes. Systems talk through a typed `EventBus`. Everything procedural takes a seeded `Rng`.

**Tech Stack:** three@0.186, vite@8, vitest@5 (jsdom via `// @vitest-environment jsdom` docblock), TypeScript 7, Playwright (preinstalled) for the headless smoke test.

**Spec:** `docs/superpowers/specs/2026-10-24-gta-bedstuy-design.md`

## Global Constraints (every task)

- Read `src/world/types.ts` and `src/core/Math2.ts` first. **Do not edit** `src/world/types.ts`, `src/core/*`, `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, or `src/world/data/bedstuy.json`. If a contract is missing or wrong, say so in your final report; do not work around it by editing shared files.
- Coordinates: metres; +x east, +z south, +y up; heading 0 = north (−z), clockwise; `object.rotation.y = -heading` (use `applyPose`).
- Import only from `three`, `three/addons/*`, `@/core/*`, `@/world/types`, and your own files. Never import another task's implementation; depend on the interfaces in `types.ts` and use stubs in tests.
- Procedural everything: no image files, no fetches, no CDN. Canvas textures only. Deterministic from `Rng`.
- Parody only: no real business names, no real people, no Rockstar assets or logos.
- Do not run `git` (the orchestrator commits). Do not `npm install` anything.
- Done means: `npx vitest run tests/unit/<your files>` passes, `npm run typecheck` reports no errors in **your** files (errors in other agents' in-progress files are not yours), and your final report lists exported symbols and anything the orchestrator must wire.
- Performance budget: the whole static city must be under ~300 draw calls. Merge geometry per material (`BufferGeometryUtils.mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`).

## Review Focus (orchestrator verifies at integration)

1. Player walks into a building wall → stops, no jitter, no tunnelling (physics + building colliders).
2. Car hits a pedestrian at speed → ped knocked down, `crime:hitPed` emitted once, wanted star appears.
3. One-way streets: traffic never drives against the arrow; lane graph respects `oneWay`.
4. Night falls → windows light, storefront gates close, audio ambience changes, minimap still readable.
5. Leaving the map edge → player/vehicle clamped, traffic despawns, no NaNs.

---

### Task 1: Grid (Sonnet) — `src/world/Grid.ts`

**Produces:** `loadBedstuyData(): BedstuyData` (imports the JSON), `buildGrid(data: BedstuyData): GridModel`.

Rules:
- Intersections at every ns×ew pair: `id = \`${ns.id}|${ew.id}\``, `halfX = ns.roadWidth/2`, `halfZ = ew.roadWidth/2`.
- Segments between consecutive intersections along each street; `a`/`b` trimmed to intersection edges; 27 total (15 ns + 12 ew).
- Blocks `r{row}c{col}` for row 0..4 (between consecutive ew streets north→south) and col 0..1 (between consecutive ns streets west→east). `curb` = rectangle between road edges, points NW, NE, SE, SW. `buildingLine` = curb inset by the adjacent street's `sidewalkWidth` per side. Four `faces` (N,S,E,W) with `a→b` left→right as seen from the street, `outward` unit normal.
- Crosswalks: one per intersection approach, 3 m wide, spanning the roadway at the intersection edge.
- Lanes: two-way streets get one lane per direction offset 2.0 m from centre (right-hand traffic); one-way streets get one lane at centre offset 0. Nodes every ≤15 m; the last node before an intersection is `stopLine: true` with `intersectionId`. Inside intersections, connect each entering lane to each exiting lane (straight, left, right) with direct edges, honouring `oneWay`. Graph must be strongly connected.
- Sidewalks: nodes at each block corner (mid-sidewalk), mid-face nodes every ~25 m, and crosswalk endpoints; edges along faces and across crosswalks. Connected (undirected semantics: add both directions).
- `isOnRoad(p)`: inside any segment rectangle or intersection box.

**Tests** `tests/unit/world/grid.test.ts`: 10 blocks, 18 intersections, 27 segments; `isOnRoad({x:0,z:0})` true; `isOnRoad(center of r2c0)` false; lanes strongly connected (BFS from any node reaches all); sidewalks connected; one-way street `hart` (oneWay +1 = eastbound) has lane headings ≈ +π/2 only; `nearestLaneNode` returns a node within 10 m of a point on Throop; block `r2c0` curb x-range is (−250+7, 0−7) and z-range (+5, 100−6.5).

### Task 2: RoadBuilder (Sonnet) — `src/world/RoadBuilder.ts`

**Consumes:** `GridModel`, `IMaterialLibrary`.
**Produces:** `buildRoads(grid: GridModel, materials: IMaterialLibrary): { group: THREE.Group; colliders: StaticCollider[] }`.

- Ground: one big plane (`concrete` variant 1, darker) covering bounds ± 60 m at y = −0.01.
- Roadway: asphalt quads for segments and intersections at y = 0 (`asphalt`, worn variant on streets).
- Sidewalks: slabs between curb and buildingLine at y = 0..0.15 (`concrete`); curbs: 0.15 m lip strip along curb lines (`curb`) and **a `Segment` collider per curb edge is NOT added** (vehicles may mount curbs); instead return no colliders except map-edge walls: four `Segment` colliders along bounds ± 30 m so nothing leaves the map.
- Markings: dashed yellow centre line on two-way streets, solid white edge lines, zebra crosswalks (`crosswalk`), white stop lines; all as thin quads at y = 0.01 (`laneLine`).
- Merge by material. Target ≤ 12 meshes total.

**Tests** `tests/unit/world/roads.test.ts` with a stub `IMaterialLibrary` (returns `MeshBasicMaterial` per key, records keys requested): group has ≤ 12 meshes; bounding box spans ≥ grid bounds; requested keys include `asphalt`, `concrete`, `laneLine`, `crosswalk`; 4 edge colliders.

### Task 3: MaterialLibrary (Sonnet) — `src/textures/MaterialLibrary.ts`, `src/textures/canvas.ts`, `src/textures/painters/*.ts`

**Produces:** `class MaterialLibrary implements IMaterialLibrary` with `constructor(rng: Rng, canvasFactory?: (w: number, h: number) => HTMLCanvasElement)`; `src/textures/canvas.ts` exports `createCanvas(w, h)` (document-based) and the `Painter` type `(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, variant: number) => void`.

- Painters: `brick` (running bond, mortar lines, per-brick colour jitter; variants red/brown/painted-white/painted-grey), `brownstone` (ashlar courses, warm brown, subtle grime), `limestone`, `asphalt` (noise, cracks, patches), `concrete` (slab joints 1.5 m), `rollGate` (corrugated horizontal ribs), `window` (dark glass + pale frame, emissive at night), `storefrontGlass`, `roof` (tar + gravel), `awning(color,text)` (vinyl colour, scalloped valance, white text along the valance), `sign(text,bg,fg)`, `copLivery` (white with blue stripe + "NYPD"-free parody text "BPD"), `chainlink`, `scaffold` (blue plywood + plank), `tire`, `treeLeaves`, flat colours for the rest.
- Textures: `THREE.CanvasTexture`, `RepeatWrapping`, `colorSpace = SRGBColorSpace`, sizes 256–512. Materials: `MeshStandardMaterial` (roughness 0.9 default; glass 0.2 with `metalness 0.1`).
- `setNight(night)`: `window` + `storefrontGlass` emissive warm (`#ffd27a`, intensity 0.9) when night, 0 otherwise; awnings unaffected.
- Cache by `${key}:${variant}` and by colour/text.

**Tests** `tests/unit/textures/materials.test.ts` with a **fake canvas** (object with `getContext('2d')` returning a recorder of fill/stroke/text calls; width/height; no node-canvas): same seed → identical recorded op list for `brick` variant 0; different variants differ; `get('brick', 0) === get('brick', 0)` (cached); `awning('#d62828','X') !== awning('#d62828','Y')`; `setNight(true)` sets emissive intensity 0.9 on `window`.

### Task 4: Lots + Buildings (Sonnet) — `src/world/LotSubdivider.ts`, `src/world/BuildingGen.ts`, `src/world/buildings/*.ts`

**Produces:** `subdivideLots(grid: GridModel, pois: PoiDef[], rng: Rng): Lot[]`; `buildBuildings(lots: Lot[], materials: IMaterialLibrary, rng: Rng): { group: THREE.Group; colliders: StaticCollider[] }`.

Lots:
- Corner lots: 9–12 m wide on the avenue face (E/W faces), `corner: true`, type `mixeduse`; the adjacent street face starts after the corner lot's depth.
- Avenue faces (E/W): lots 6–9 m, `mixeduse` 70% / `apartment` 15% / `brownstone` 15%.
- Street faces (N/S): lots 5–7.5 m, `brownstone` 65% / `rowhouse` 25% / `church` 3% / `scaffold` 4% / `vacant` 3%.
- Depth: 12–16 m (street faces), 14–18 m (avenue faces). N and S faces of a block both get lots; backyards between are left empty.
- Lots tile each face exactly: adjust the last lot's width to close the gap (clamp ≥ 4 m).
- POIs: the lot containing `t` on that face takes `poi` and type `mixeduse` (`church` → `church`, `condo` → `apartment` with glass variant).

Buildings (one merged mesh per material across all lots; `colliders` = one `Polygon` per non-vacant lot footprint, plus a `Polygon` per stoop):
- Floor height 3.3 m; brownstone/rowhouse 3–4 floors + 1.2 m raised basement; stoop 2.5 m deep with steps; 2–3 window bays, tall parlour windows; cornice box 0.6 m proud; parapet; 25% fire escapes (thin boxes/rails on the facade); roof `roof`, water tank on 4-floor ones (cylinder).
- Mixed-use: 4 m storefront (storefrontGlass + rollGate pulled 30%), awning box (materials.awning(color,text) when `poi`, else a plain variant), sign board above the awning (materials.sign), 3–4 floors brick above with windows, 2–4 AC box units.
- Church: 9 m wide nave, 9 m tall, pitched roof, small square tower, arched-look tall windows (just taller quads), sign board with the POI text.
- Apartment: 6 floors brick, flat roof; condo variant: glass + grey panels, roof deck rail.
- Vacant: chainlink fence posts along the front, nothing else (no collider polygon, but a `Segment` collider on the fence line).
- Scaffold: a brownstone with scaffold frame (poles + planks + blue plywood wall) in front; collider includes the scaffold strip.
- Interior faces: back walls plain brick.

**Tests** `tests/unit/world/lots.test.ts`, `tests/unit/world/buildings.test.ts` (use a tiny fake `GridModel` with one block built by hand, and a stub `IMaterialLibrary`): lot widths sum to face length ± 0.01; no lot < 4 m; every POI assigned exactly once and its lot type matches the archetype rule; corner lots are on E/W faces; `buildBuildings` returns ≥ 1 mesh and one `Polygon` collider per non-vacant lot; all colliders lie inside the block's buildingLine bounding box.

### Task 5: Furniture + Signage (Haiku) — `src/world/FurnitureGen.ts`

**Consumes:** `GridModel`, `Lot[]`, `IMaterialLibrary`, `Rng`.
**Produces:** `buildFurniture(grid: GridModel, lots: Lot[], materials: IMaterialLibrary, rng: Rng): { group: THREE.Group; colliders: StaticCollider[] }`.

- Street trees in tree pits every ~12 m along every face (skip in front of storefront lots and within 6 m of corners): trunk cylinder 0.3 r × 3 m (`treeTrunk`), canopy of 2–3 overlapping spheres (`treeLeaves`), slight random lean. Circle collider r 0.35.
- Lampposts at every block corner and mid-face (cobra-head: pole 8 m + arm + lamp box, `metalDark`); street-name sign on the corner poles: two crossed boards with `materials.sign(signName, '#0a5a2f', '#ffffff')` (green NYC-style) for the two streets at that corner. Circle collider r 0.2.
- Hydrants (`hydrant`, 0.8 m, one per face), trash cans (`trash`, wire-basket cylinder, 2 per face), mailbox box occasionally, bodega ice-box in front of `bodega` lots. Circle colliders r 0.3.
- Merge by material. Use `InstancedMesh` for trees if simpler.

**Tests** `tests/unit/world/furniture.test.ts` (fake one-block grid): ≥ 4 lampposts (corners), trees spaced ≥ 10 m apart along a face, every collider is a Circle with 0.15 ≤ r ≤ 0.5 and lies within the block's curb polygon.

### Task 6: Physics (Sonnet) — `src/physics/Collider2D.ts`, `src/physics/World2D.ts`

**Produces:** `Collider2D.ts`: `obbCorners(pos, heading, obb): Vec2[]`, `overlap(a: Body2D, b: Body2D): { normal: Vec2; depth: number; point: Vec2 } | null` handling circle/obb/polygon/segment in any pairing (SAT for convex shapes; segment as degenerate polygon with 0.05 m thickness), `pointInPolygon(p, pts)`, `rayShape(from, dir, maxDist, body): { dist; point } | null`. `World2D.ts`: `class World2D implements IWorld2D` (constructor `(cellSize = 12)`; spatial hash; static bodies hashed once, dynamic re-hashed each step).

`step(dt)`: for each dynamic body, broadphase via hash, narrowphase `overlap`, resolve: positional correction split by inverse mass (static = ∞), relative-velocity response along the normal with restitution 0.1, contact `impulse` = closing speed along normal before response (≥ 0). Each unordered pair once per step. Static-vs-static never tested.

**Tests** `tests/unit/physics/collider2d.test.ts`, `tests/unit/physics/world2d.test.ts`: circle-circle MTV; circle vs OBB rotated 45°; OBB vs OBB separated/overlapping; circle vs polygon edge and corner; raycast hits a polygon at the right distance and misses when ignored; `step` pushes a circle out of a static polygon fully (depth 0 afterwards); vehicle-vs-ped contact carries `impulse ≈ 8` when closing at 8 m/s; a body moving 50 m/s does not tunnel through a 0.3 m thick segment in one 1/60 step (substep or swept test inside `step`).

### Task 7: Player, Vehicle, Camera (Sonnet) — `src/entities/Vehicle.ts`, `src/entities/Player.ts`, `src/core/Camera.ts` *(exception: Camera.ts is yours to create)*

**Produces:**
- `VEHICLE_SPECS: Record<VehicleType, VehicleSpec>` (sedan 4.6×1.8×1.4 m, 30 m/s, accel 8; suv 4.9×2.0×1.8, 27, 7; boxtruck 7×2.4×3.2, 20, 4; cop = sedan 33 m/s, accel 9; `maxSteer` 0.6 rad; `brakeDecel` 14).
- `class Vehicle implements IVehicle`: `constructor(id, spec, pos, heading, materials: IMaterialLibrary, events: EventBus)`. Body: `obb` `{halfW: width/2, halfL: length/2}`, mass 1400 (truck 3500), `kind: 'vehicle'` (`'cop'` for cop type), `userData = this`. Arcade model: `speed += throttle*accel*dt` (reverse max 8 m/s), drag `0.4*speed*|speed|/maxSpeed`, brake `brakeDecel`, steer effective = `steer*maxSteer*(1 - 0.7*|speed|/maxSpeed)`, yaw rate = `speed/wheelbase * tan(steerEff)`, wheelbase `0.6*length`. Velocity blends toward forward each step with grip 0.92 (handbrake 0.6) so drifts are possible. Mesh: body box + cabin box + 4 wheel cylinders (rotate with speed) + headlight/taillight boxes; cop: `copLivery` body + lightbar that alternates red/blue emissive at 4 Hz while `siren`. `damage` rises by `impulse/40` per contact; `onContact` emits `impact`. `doorPos()` = 1.2 m left of centre. `update` applies pose.
- `class Player implements Entity`: circle r 0.4, mass 80, walk 3 m/s, run 6.5 m/s, heading faces movement; `vehicle: IVehicle | null`; `control(input: Input, cameraYaw: number)` → on foot: move relative to camera yaw (W = away from camera); in car: `VehicleInput` from W/S throttle, A/D steer, Space brake, Shift handbrake, H horn, E radio (`events.emit('radioNext')`); F enter/exit: `tryEnter(vehicles: IVehicle[])` nearest with `doorPos` within 3 m (parked or traffic: becomes `driver: 'player'`; emit `carjack` crime if it had a driver) — hide player mesh, follow the car; exit places the player at `doorPos`. Mesh: capsule body + sphere head + two leg boxes with walk swing; `cloth` colour.
- `class ThirdPersonCamera`: `camera: THREE.PerspectiveCamera (60°, near 0.1, far 900)`; `yaw`, `pitch` (clamp −0.1..0.9 rad); mouse orbit (0.0025 rad/px); on foot: distance 5 m, height 2.2; in vehicle: distance 8 m, height 3, auto-recentres behind the vehicle heading at 2 rad/s when the mouse is idle > 1.5 s; smoothed with exponential lerp 8/s; look-at target + 1.2 m up. `update(dt, targetPos: Vec2, targetHeading: number, mode: 'foot' | 'vehicle', input: Input)`.

**Tests** `tests/unit/entities/vehicle.test.ts`, `player.test.ts`, `camera.test.ts` (stub materials; a fake `Input` object `{isDown, pressed, axis, mouseDX, mouseDY, wheel}`): full throttle for 6 s reaches ≥ 0.8·maxSpeed and never exceeds maxSpeed; brake from 20 m/s stops within 3 s; steer right at 10 m/s increases heading; player `tryEnter` picks the nearest vehicle within 3 m and ignores one at 5 m; camera yaw converges behind a vehicle heading π/2 within 3 s of no mouse input.

### Task 8: Traffic, Pedestrians, Cops, Wanted (Sonnet) — `src/entities/TrafficAgent.ts`, `src/entities/Pedestrian.ts`, `src/entities/Cop.ts`, `src/game/TrafficSystem.ts`, `src/game/WantedSystem.ts`, `src/game/CopSystem.ts`

**Consumes:** `GridModel`, `IWorld2D`, `IVehicle` (via a factory you are given, never by importing `Vehicle`), `EventBus`, `Rng`.
**Produces:**
- `class TrafficAgent { constructor(vehicle: IVehicle, lanes: LaneGraph, world: IWorld2D, rng: Rng); update(dt): void; }` — follows lane nodes (advance when within 3 m), steers by `angleDiff` to the target (P-controller gain 2.5, clamped), desired speed 12 m/s on avenues / 8 m/s on streets, brakes to 0 if `raycast` ahead (length `6 + speed`, ignoring self) hits anything; at a `stopLine` node waits 0.8 s then proceeds if no vehicle body is within the intersection circle (`queryCircle(center, 9)`), otherwise waits up to 4 s more and then goes. Picks a random outgoing edge at intersections (honours graph).
- `class Pedestrian implements Entity { constructor(id, start: GraphNode, sidewalks: Graph, world: IWorld2D, materials, events, rng) }` — circle r 0.3, mass 70, 1.2 m/s (flee 4 m/s), walks node to node, avoids reversing, pauses at crosswalk nodes when `queryCircle(node, 12)` contains a vehicle moving > 2 m/s; state `walking | waiting | down | fleeing`; `onContact`: if other is a vehicle/cop moving > 2 m/s → `down` 6 s, emit `pedKnockedDown`, and if `(other.userData as IVehicle)?.driver === 'player'` emit `crime {type:'hitPed'}` once per knock-down. Mesh: capsule + head + legs, random `cloth` variant, walk swing.
- `class WantedSystem { constructor(events); stars: number; update(dt); }` — `hitPed` +1, `hitCop` +1, `carjack` +1, `hitVehicle` +0; max 3; 20 s without crimes → −1 star (repeat); emits `wantedChanged` on change.
- `class CopAgent { constructor(vehicle: IVehicle, grid: GridModel, world: IWorld2D); update(dt, target: Vec2): void; }` — when > 35 m from target follows lanes toward `nearestLaneNode(target)` like traffic but desired speed 20 m/s and no stop-line waits; within 35 m steers directly at the target and rams (throttle 1). `vehicle.siren = true`.
- `class TrafficSystem { constructor(grid, world, events, rng, scene: THREE.Scene, materials, makeVehicle: (type: VehicleType, pos: Vec2, heading: number, color: string) => IVehicle, makePed: (...)?: optional); vehicles: IVehicle[]; peds: Pedestrian[]; update(dt, playerPos: Vec2): void; }` — at init: parked cars along parking lanes of two-way streets (every ~11 m, 65% occupancy, `driver: null`, offset 1.7 m... use lane offset + 2.6 m toward the curb) and 40 peds at random sidewalk nodes. Live traffic: keep ≤ 30 moving vehicles within 160 m of the player, spawn at lane nodes 90–150 m away out of the player's view direction is not required, despawn > 190 m. Vehicle colours from a palette of 12 CSS colours; types 70% sedan / 20% suv / 10% boxtruck. Owns `TrafficAgent`s; the player stealing a car removes its agent (check `driver !== 'traffic'`).
- `class CopSystem { constructor(grid, world, events, rng, scene, makeVehicle, wanted: WantedSystem); cops: IVehicle[]; update(dt, playerPos): void; }` — stars 1 → 1 cop, 2 → 2, 3 → 3; spawn at a lane node 100–140 m away; when stars drop to 0 cops drive off (traffic behaviour) and despawn > 150 m. Ramming the player's car is the cop's job; the player's vehicle hitting a cop with impulse > 3 emits `crime {type:'hitCop'}` (listen to `impact` events and check kinds).

**Tests** `tests/unit/game/wanted.test.ts`, `tests/unit/entities/traffic.test.ts`, `pedestrian.test.ts`, `cops.test.ts` (fake `IVehicle`, fake `IWorld2D`, hand-built 4-node lane graph): wanted +1 per hitPed, caps at 3, decays after 20 s; traffic agent steers positive toward a node to the right; brakes when raycast reports a hit at 4 m; pedestrian never picks the node it came from when another exists; cop count follows stars.

### Task 9: HUD, Minimap, Day/Night (Haiku) — `src/ui/Hud.ts`, `src/ui/Minimap.ts`, `src/game/DayNight.ts`, `src/ui/hud.css` (imported from Hud.ts)

**Produces:**
- `class Hud { constructor(root: HTMLElement); update(state: HudState): void; showSplash(): void; hideSplash(): void; }` — DOM overlay: stars top-right (★ filled/outline), speed bottom-right (km/h, only in vehicle), location label bottom-left (street name, GTA-style small caps), radio station name next to it (only in vehicle), centre-bottom prompt, tiny FPS top-left. Splash: title "GTA BED-STUY", subtitle "a fan tribute · not affiliated with Rockstar Games or Take-Two", controls list (WASD move · Shift run · F enter/exit car · Space brake · H horn · E radio · mouse look · click to start), hidden on `hideSplash()`.
- `class Minimap { constructor(root: HTMLElement, grid: GridModel); update(playerPos: Vec2, heading: number, cops: Vec2[]): void; }` — 220×220 canvas bottom-left above the location label, rotates with heading (up = forward), roads light grey on dark, player white triangle, cops blue dots, street labels along avenues. Export pure `worldToMinimap(p: Vec2, player: Vec2, heading: number, scale: number, size: number): {x: number; y: number}`.
- `class DayNight implements Clock { constructor(scene: THREE.Scene, materials: IMaterialLibrary, opts?: { startHour?: number; hoursPerRealMinute?: number }); timeOfDay; isNight; update(dt): void; }` — `DirectionalLight` sun (intensity/colour by elevation), `HemisphereLight`, `scene.background` colour and `scene.fog` colour interpolated across dawn/day/dusk/night keyframes, start 17:30, 1 game hour per real minute; calls `materials.setNight` on transitions (night = 19:30 → 06:00). Export pure `skyColorAt(hour: number): THREE.Color` and `isNightAt(hour): boolean`.

**Tests** `tests/unit/ui/hud.test.ts` (`// @vitest-environment jsdom`), `tests/unit/ui/minimap.test.ts`, `tests/unit/game/daynight.test.ts`: hud shows 2 filled stars for `stars: 2`; speed hidden when not in vehicle; `worldToMinimap` puts a point 10 m ahead of the player above centre regardless of heading; `isNightAt(23)` true, `isNightAt(12)` false; `skyColorAt(12)` brighter than `skyColorAt(0)`.

### Task 10: Audio (Haiku) — `src/audio/AudioSystem.ts`, `src/audio/synth.ts`, `src/audio/radio.ts`

**Produces:**
- `src/audio/synth.ts` pure helpers: `engineFrequency(speed: number, throttle: number): number` (idle 55 Hz, up to ~220 Hz, rises with throttle), `hornFrequencies(): [number, number]` (two detuned tones ≈ 400/500 Hz), `impactGain(strength: number): number` (0..1, saturates at 15 m/s).
- `src/audio/radio.ts`: `STATIONS: { name: string; bpm: number; pattern: Pattern }[]` with three parody stations: "WBED 88.9 — Brownstone Boom-Bap" (kick/snare/hat 90 bpm + bass line), "Kosciusko Kompa FM" (120 bpm bright arpeggio + shaker), "Throop Talk Radio" (no beat; low-pass filtered noise 'mumble' bursts); `patternAt(station, step): Note[]` pure.
- `class AudioSystem { constructor(events: EventBus); start(): Promise<void>; update(dt): void; setEngine(speed: number, throttle: number, inVehicle: boolean): void; setNight(night: boolean): void; nextStation(): void; readonly stationName: string; setMasterVolume(v: number): void; }` — creates `AudioContext` lazily in `start()` (call on `userGesture`); engine: sawtooth + square through a lowpass, gain ramps; horn on `horn` event (0.4 s); impact on `impact` event (noise burst, gain by `impactGain`); ambient: filtered pink-ish noise hum + at night a sparse random distant siren sweep every 20–60 s; radio plays only while in a vehicle (`enterVehicle`/`exitVehicle`), step sequencer scheduled with lookahead 0.1 s; `radioNext` → next station. Everything via Web Audio nodes; no audio files.

**Tests** `tests/unit/audio/synth.test.ts`, `radio.test.ts`, `audiosystem.test.ts` (inject a fake `AudioContext` via `new AudioSystem(events, () => fakeCtx)`): engine frequency monotonic in speed; three stations; `patternAt` deterministic and cycles; `nextStation` wraps; `start()` creates the context once.

### Task 11: Integration (orchestrator) — `src/world/WorldBuilder.ts`, `src/main.ts`, README, smoke test stats, artifact publish

- `buildWorld(data, materials, rng) → { grid, lots, group, colliders }`; wire `World2D`, `Player`, `TrafficSystem`, `CopSystem`, `WantedSystem`, `DayNight`, `Hud`, `Minimap`, `AudioSystem`, camera; route contacts to `onContact`; `window.__gtaStats = { drawCalls, fps, vehicles, peds }`; splash → first click starts audio + pointer lock.
- `npm run build` → `dist/index.html` → publish as the Artifact.
