# Stage 1 check-in

Author: MGR (Opus manager). Swarm window: 2026-10-28 01:09Z → 03:10Z (~2 h). Sources: `docs/swarm/transcript.md`
(all FINAL REPORTs and MGR reviews), `docs/swarm/board.md`, task records in `docs/swarm/tasks/`, and spot checks
of the tree by MGR (file presence, call sites in `src/main.ts`, `tsc --noEmit`, targeted vitest runs).
Acceptance criteria referenced as PRD §5.x (`docs/swarm/PRD.md`).

## 1. Summary

All ten workers posted FINAL REPORTs and each has an MGR review in the transcript. Verdicts: 7 accept, 3
accept-partial (R1, R2 limited by egress blocks; M1 accepted with the material-metalness fixes not applied).
M4 owns the entry point and wired M1/M2/M3/M5/R5 into `src/main.ts` and `WorldBuilder.ts`, so the Stage 1
features are live, not just unit-tested. Fable closed the pedestrian cloth wiring.

Global gates on the integrated tree, run by MGR at 03:09–03:12Z:
- `npx tsc --noEmit`: clean.
- `npx vitest run`: **49 files, 753 tests, all passing** (Stage 0 had ~600).
- `npm run artifact`: `dist/artifact.html` = **6.69 MB** (6,533 KiB). Stage 0 was 6.52 MB, so +~170 KB, well
  under the 12 MB budget.
- `npm run test:e2e`: renders, `errors: []` (40 peds, 308 meshes, 2,252 colliders, 16 packs).

Not verified: anything that needs a real GPU (60 fps at medium, how smooth the interpolation feels, loading
overlay timing). The user has to check these with the fps overlay.

## 2. Per-agent outcomes

| id | lane | verdict | delivered | wired / live? | open follow-ups |
|---|---|---|---|---|---|
| R1 | research-cc0 | accept, partial coverage | 11 CC0 sets verified (HTTP 200 + PIL) from google/filament third_party (cgbookcase origin) and npm aframe-enviropacks (ambientCG ids Metal009, Metal035, Fabric026, Wood027, WoodFloor041, plus an untraced "Plastic"); record in `docs/swarm/tasks/R1.md` | n/a (research). Files are 2K, in session scratchpad only (~130 MB) | confirm cgbookcase licence per asset before landing; reject "Plastic" until traced; downscale to 1K for artifact; copy accepted sets out of the scratchpad; corrugated steel, chain-link, granite, cast iron, tar roof still unfound (needs ambientcg.com / polyhaven.com allowlist) |
| R2 | research-blocks | accept, partial | `docs/reference/block-faces.md` (per-street, confidence-tagged), `docs/swarm/tasks/R2.md`. Landmarks: Antioch Baptist 828 Greene, Lafayette magnolia (677 Lafayette), Upper Room Baptist (Marcus Garvey & Van Buren) | n/a | per-face floors / use / material NOT delivered (OSM Overpass and NYC Open Data blocked by egress proxy). Its sign-spelling "correction" rejected (deliberate "Kosciusko" signage). Street order unverified: MGR recollection that DeKalb Ave sits between Pulaski and Kosciuszko, and that Van Buren may not run west of Throop |
| R3 | research-lighting | accept | `docs/reference/lighting-targets.md`: exposure math checked against three r186 ACES, per-hour table (sun/moon/hemi/env/exposure/fog/bloom), per-material r/m/env table, 15 deviations with file:line, wet-road options | consumed by M1 | wet-asphalt variant + wetness state (Stage 2) |
| R4 | textures-storefront | accept | `src/textures/painters/storefront-art.ts` (archetype classifier, awning/sign layouts, 24 pictograms, 7-segment 718-555-01xx phones, stripes, plates), richer `signage.ts`, `tests/unit/textures/signage.test.ts` | yes: MaterialLibrary already uses awningPainter / signPainter | awning/sign UVs stretched ~2x on ~6.5 m frontages (geometry in src/world, fix in Stage 2 so the pre-squeeze can go) |
| R5 | textures-vehicles-people | accept | `src/textures/painters/vehicle.ts`, `people.ts`; keys tireSidewall, plate, clothHoodie/Denim/Varsity/Sneaker; `MaterialLibrary.carPaintDetail()` (shared flake normal / roughness / dirt); tests | yes: tyres + plates by M2 (carModel.ts), paint detail by M4 (main.ts), cloth hoodie/denim/sneaker by Fable (humanModel.ts, 01:39) | varsity jacket unused; car body UVs need v=0 at sill for the dirt band; no `tasks/R5.md` |
| M1 | lighting-reflections | accept, one concern | hour-keyed TIME_CYCLE in `LightingConfig.ts` (from R3, retuned by audit); DayNight sun path peaks at 60° (was ~80°), warm low sun, moon key-light (cool, 40°), true `sunDirection`, fog per hour; SkyDome takes the true sun (fixes no stars and fake dusk glow at night), radiance cap, turbidity ≤ 9, azimuthal dusk glow, twilight env recapture; Pipeline exposure/bloom continuous per hour (night 1.35 → ~1.05); LensFlare skipped in override passes (GTAO/DoF); headlights retuned; Shadows MIN_ELEVATION 0.25 → 0.12; `scripts/light-audit.mjs`. Audit (low, 640×360): max blown 0.10% anywhere (19:30 baseline was 49% car / 5.9% street); street mean luma 12h .196, 18h .100, 19.5h .094, 21h .081, 0h .089 | yes (M4: sunDir for sky/flare, setHour → update(0)) | glass / car glass / paint / painted-metal metalness fixes (R3 §5 item 5; Fable asked for them at 01:19) **not applied**; stoop acne checked only at 16.5h on low; night 0.081 is right at the threshold; M3 HDR signal lamps not checked for bloom |
| M2 | driving-feel | accept | Vehicle: torque curve (sedan 0–100 km/h 6.1 s, box truck 12.1 s), engine braking + drag, ABS-ramped brakes, rate-limited speed-sensitive steering, slip / power oversteer / handbrake drift, parked cars friction-slow after nudges, wall scrub, roll/pitch/bounce on a child chassis, dents above 0.3 damage. Player: accel/decel, sprint ramp, smoothed facing, 0.4 s walk-to-door. Camera: speed lag, FOV 60→68, shake, wall pull-in (World2D.raycastStatic). carModel uses tireSidewall + plate | yes (M4 passes camCtx; M4 interpolates poses itself) | no explicit test yet for "stable at top speed, steering released 5 s" or "no contact bounce > 2 frames"; drift test should assert slip angle > 15° |
| M3 | traffic-ai | accept, exceeds scope | `TrafficLights.ts`: 2-phase NYC plan at all 18 intersections, 83 s cycle, yellow 3 s, all-red 1 s, green wave at 12 m/s; `world/props/signals.ts` (2 draw calls, 72 pole colliders); TrafficAgent obeys signals, overtakes, yields to peds, horn/back-off when stuck; Pedestrian WALK-gated crossings, groups, stoop sitting; Cops obey lights off-duty, 3-star PIT, patrols | yes (M4 wired WorldBuilder + main.ts) | no explicit full-density 5-minute no-gridlock test (PRD §5.2) |
| M4 | performance | accept | Game.ts FixedStepper + interpolation alpha; id-keyed pose snapshots (alloc-free) for all dynamic entities; real frame dt to camera; LoadingScreen (6 steps, texture timeout, shader warm-up); PerfMonitor (1% low, medium→low after 8 s < 40 fps); true per-frame draw-call stats; 250×200 m culling cells; allocation removal in the render loop; wired M1/M2/M3/M5/R5 | yes (owner of main.ts) | ~790 draw calls/frame (all passes) is high for an Iris Xe-class laptop; not verified on a real GPU |
| M5 | gameplay-ui | accept | `core/Gamepad.ts`, `ui/Menu.ts` + `menu.css` (quality, master/radio volume, invert-Y, controls, reset), HUD polish (input-mode glyphs, toast, location card, star pulse), Minimap polish, Input invertLookY / mode, AudioSystem (gears, slip squeal, handbrake, day/night beds, radio volume, pause), `ui/SaveState.ts` (position + hour, throttled, pagehide) | yes (M4 applied the 8-step wiring + SaveState hook) | per-frame allocations in Hud.ts:135 and Minimap.ts:200 (M5 exited → close-out) |

## 3. What changed (files)

- **New source:** `src/textures/painters/storefront-art.ts`, `vehicle.ts`, `people.ts`; `src/game/TrafficLights.ts`;
  `src/world/props/signals.ts`; `src/core/Gamepad.ts`; `src/ui/Menu.ts`, `menu.css`, `SaveState.ts`;
  `src/render/Culling.ts`, `Loading.ts`, `Perf.ts`; `scripts/light-audit.mjs`.
- **Changed source:** Vehicle, Player, Camera, World2D (M2); carModel.ts (M2); TrafficAgent, Pedestrian, Cop,
  TrafficSystem, CopSystem (M3); Game.ts, main.ts, WorldBuilder.ts (M4); Hud, Minimap, Input, AudioSystem (M5);
  LightingConfig, DayNight, SkyDome, NightLights, Pipeline, LensFlare, lut, Shadows (M1); signage.ts (R4);
  MaterialLibrary.ts keys + carPaintDetail (R5); humanModel.ts cloth (Fable); `src/world/types.ts`
  MaterialKey additions (Fable).
- **New tests:** textures/signage, textures/vehicle, game/trafficlights, game/trafficsim, core/game,
  core/gamepad, ui/menu, render/culling, render/perf, audio/audio-extras, plus extended entity tests.
- **Docs:** `docs/swarm/PRD.md` (expanded), `docs/swarm/stages.md`, `docs/reference/block-faces.md`,
  `docs/reference/lighting-targets.md`, `docs/swarm/tasks/R1.md`, `R2.md`, `R3.md`, this check-in.
- **Ownership changes during the stage:** carModel.ts → M2 (Fable 01:17); line-local MaterialLibrary numbers
  → M1 (Fable 01:19, not used); Shadows.ts → M1 (Fable 01:54); signals.ts → M3 (provisional, Fable's
  01:34:58 reply treated it as M3's).

## 4. Acceptance status (PRD §5.2)

| Area | Criterion | Status |
|---|---|---|
| Light | < 0.5% clipped at every audited hour | **met** (max 0.10%), low tier at 640×360; medium "matches" per M1 |
| Light | glass/paint reflect the sky, sidewalks matte | **partly met**: M1 says by eye that glass reflects the sky and paint shows a sun glint. Metalness is still wrong (glass 0.3, car glass 0.9, paint 0.6) |
| Light | night streets readable (mean ≥ ~20/255) | **met, at the threshold** (0.081–0.094) |
| Light | no shadow acne on stoops | **partly verified** (16.5h only) |
| Light | no bloom haze on sky; flare hidden below horizon | **met** (19:30 haze fixed; flare uses the true sun) |
| Driving | sedan 0–100 in 6 ± 1 s | **met** (6.1 s, test) |
| Driving | stable at top speed, no wobble | **not tested** |
| Driving | handbrake drift > 15° slip | **partly met**: there is a slip test, but no angle is asserted |
| Driving | parked cars nudge; no contact jitter | nudge **met**; jitter **not tested** |
| Traffic | signals with visible heads; stop on red / go on green; peds on WALK | **met, beyond scope** (all 18 intersections; red-light and WALK sim tests) |
| Traffic | no gridlock in 5 min at medium density | **not tested** end to end (back-off exists) |
| Perf | 60 fps medium on a mid laptop | **unverified** (needs a real GPU); ~790 draw calls/frame |
| Perf | no per-frame allocations in hot loops | **mostly met**; leftovers listed in §5 |
| Perf | loading screen with progress; interpolation | **met** (code + tests; feel unverified) |
| UI | pause menu, gamepad, position persists | **met** |
| Textures | storefront + vehicle/people maps, deterministic, ≤ 12 MB | **met** (6.69 MB) |
| Research | sourced, with confidence and gaps | **met**; R2 core per-face data blocked |

## 5. Open issues

1. **Material metalness** (R3 §5 item 5): `MaterialLibrary.ts:412` window/storefront glass metalness 0.3 → 0,
   roughness → 0.08; `:474` car glass 0.9 → 0; `:356` paint 0.6 → 0.15; `:459-462` painted metals → 0.
   Re-run light-audit afterwards. Owner: Fable close-out (M1 has exited). **DONE 28 Oct 03:3xZ:** all five values applied,
   materials tests updated, light-audit re-run (low, h=12/18/21, street+car): blown ≤ 0.01 %, night street mean 0.082,
   dusk car 0.082, no regression against M1's numbers.
2. **Leftover per-frame allocations:** SkyDome.ts:193 `src.clone()`, LensFlare.ts:154 `sunDir.clone()`,
   NightLights.ts:110/142 Array.from + sort (check throttling), Hud.ts:135 forEach closure + aria-label
   string every frame, Minimap.ts:200 anchor literals. Owner: Fable close-out or Stage 2 perf lane. **DONE (partial):**
   SkyDome/LensFlare clones → scratch vectors, NightLights Sets reused, Hud aria-label only on change. Minimap
   anchor literals and NightLights sort left for the Stage 2 perf lane (not measurable at this scale).
3. **Missing tests for PRD §5.2:** top-speed stability, contact jitter, drift slip angle > 15°, full-density
   5-minute no-gridlock sim. Owner: Stage 2 QA lane.
4. **Real-GPU checks:** fps at medium/high, interpolation smoothness, loading timing, a night view of the
   signal lamps, a bodega corner day + night. Owner: user (fps overlay) + Fable screenshots.
5. **R1 assets:** ~130 MB of 2K sets sit only in the session scratchpad. Copy the accepted ones out or keep the
   URL list (in R1.md). Confirm the cgbookcase licence per asset. Reject "Plastic" until traced.
6. **Grid order unverified** (R2 §1 rows 4–6): N–S street sequence (possible DeKalb Ave between Pulaski and
   Kosciuszko), one-way directions, road widths. **Re-checked 28 Oct:** still unverifiable from the sandbox; see
   `docs/reference/block-faces.md` rows 4b/5b. DeKalb decision goes to the user.
7. **Awning UV stretch** (~2x on ~6.5 m frontages); R4 pre-squeezes icons to compensate.
8. Varsity cloth key is unused. Car body UVs need v=0 at the sill for R5's dirt band. R5 has no tasks record.

## 6. Risks carried into Stage 2

| Risk | Why it matters | Mitigation |
|---|---|---|
| Draw calls (~790/frame across passes) | 60 fps on Iris Xe-class laptops may not hold at medium | instancing for props and parked cars; merge by material per cell; measure the shadow-pass share |
| Network egress blocks (OSM, PLUTO, Wikipedia, ambientCG, Poly Haven) | block-face accuracy and texture round 4 both depend on them | ask the user to allowlist the hosts, or supply Street View screenshots as reference (never pixels) |
| `bedstuy.json` / `types.ts` schema churn for per-lot data | many generators read it | one owner (Fable), versioned schema, migration test on the real file |
| Two builds (artifact vs hosted) drifting apart | duplicated fixes, size surprises | one codebase + `VITE_HOSTED` flag + asset manifest; build both in the gate |
| Lighting regressions as buildings change | the audit numbers only hold for today's scene | keep `scripts/light-audit.mjs` as a gate; store the baseline numbers in-repo |
| Licence drift with new texture sources | PRD §2.1 rule 3 | CREDITS entry before landing; MGR licence check in every review |
| Mission scope creep | missions touch every system | cap at 3–5 missions on the event bus; reuse wanted/traffic systems |

## 7. Recommended Stage 2 task list

Suggested lanes (ids are provisional). "Owns" lists the files to grant on the board.

| # | Task | Suggested owner (model) | Owns | Depends on |
|---|---|---|---|---|
| 0 | Stage 1 close-out: §5 items 1, 2 and 5 (metalness fix + audit re-run, leftover allocations, save R1 sets) | Fable | MaterialLibrary lines, SkyDome/LensFlare/NightLights/Hud/Minimap lines | — |
| 1 | **Grid verification + schema v2**: confirm the N–S street order (DeKalb?), one-way directions and widths; extend `bedstuy.json` with per-lot fields (floors, width, material family, stoop, cornice, use, storefront archetype) | data lane (sonnet) + Fable for types.ts | `src/world/data/bedstuy.json`, `src/world/Grid.ts`, grid tests | allowlist or user screenshots |
| 2 | **Block-face research pass 2**: OSM/PLUTO pull if allowlisted, else per-face checklist from the user's Street View screenshots (values only) | R2-successor (haiku) | `docs/reference/block-faces.md`, `docs/world-notes.md` | 1 (schema) |
| 3 | **Facade generator per face**: build lots from the schema-v2 data (floors, stoop, cornice, material), keep the fallbacks | buildings lane (sonnet) | `src/world/BuildingGen.ts`, `LotSubdivider.ts`, `src/world/buildings/*` | 1, 2 |
| 4 | **Storefront placement + awning UVs at true aspect** (drop R4's pre-squeeze) | R4-successor (sonnet) | `src/world/buildings/mixeduse.ts`, signage geometry, `storefront-art.ts` | 3 |
| 5 | **Mission framework**: triggers, objectives, fail/retry, HUD text, save of mission state | missions-core (sonnet) | `src/game/missions/*`, HUD mission widget | — |
| 6 | **Mission content**: 3–5 missions (bodega delivery, laundromat getaway, block-party run, cop escape) | missions-content (sonnet) | `src/game/missions/content/*` | 5 |
| 7 | **Hosted build**: `build:hosted`, asset manifest, `VITE_HOSTED`, 2K CC0 sets (from R1, after the licence check), `ultra` tier, lazy loading; artifact still ≤ 16 MB | build lane (sonnet) + Fable for package.json / vite config | `scripts/`, `src/textures/packs.ts`, hosted manifest | R1 licence check |
| 8 | **Perf pass 2**: instancing for props and parked cars, per-cell material merging, shadow-pass culling, < 500 draw calls at medium | M4-successor (sonnet) | `src/render/Culling.ts`, `WorldBuilder.ts`, `main.ts` | 3 (new geometry) |
| 9 | **Lighting follow-ups**: wet-asphalt variant + wetness state, stoop acne at 7h/18h on medium/high, signal-lamp bloom at night, audit baselines in repo | M1-successor (sonnet) | M1's Stage 1 files + MaterialLibrary lines | 0 |
| 10 | **QA / regression lane**: the missing §5.2 tests (top-speed stability, contact jitter, drift angle, full-density gridlock sim), screenshot set per stage | QA (sonnet) | `tests/**` new files only | — |
| 11 | **CC0 round 4**: corrugated steel, chain-link, granite, cast iron, tar roof (needs an ambientcg.com / polyhaven.com allowlist) | R1-successor (haiku) | scratchpad + `docs/swarm/tasks/` | allowlist |
| 12 | MGR: Stage 2 PRD refresh, board, reviews, check-in | MGR (opus) | `docs/swarm/*` | — |

## 8. Process notes

- Research lanes (haiku) finished within ~6 minutes and mechanics lanes within ~25 minutes. M1 took ~2 h,
  because each light-audit run is ~15 min of headless rendering. Next time, start the audit harness first, or
  split the audit into its own lane.
- Several features were green in unit tests but not wired until M4 applied them in `main.ts`. Asking each
  final report to name the call site worked. Keep it as a rule: a lane that does not own the entry point
  posts exact wiring lines for its owner.
- Some requests were routed to the wrong owner (WorldBuilder.ts sent to Fable instead of M4; MaterialLibrary
  numeric edits). The board's "owns" column should list every touched file, including new ones, before the
  stage starts.
- Two requested items were not done: M1's material metalness, and M5's position save until MGR asked.
  Reviews against the PRD tables caught both.
