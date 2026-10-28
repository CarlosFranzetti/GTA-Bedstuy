# Stage 1 check-in

Author: MGR (Opus manager). Swarm window: 2026-10-28 01:09Z → __END__. Sources: `docs/swarm/transcript.md`
(all FINAL REPORTs and MGR reviews), `docs/swarm/board.md`, task records in `docs/swarm/tasks/`, and spot checks
of the tree by MGR (file presence, call sites in `src/main.ts`, `tsc --noEmit`, targeted vitest runs).
Acceptance criteria referenced as PRD §5.x (`docs/swarm/PRD.md`).

## 1. Summary

__SUMMARY__

## 2. Per-agent outcomes

| id | lane | verdict | delivered | wired / live? | open follow-ups |
|---|---|---|---|---|---|
| R1 | research-cc0 | accept, partial coverage | 11 CC0 sets verified (HTTP 200 + PIL) from google/filament third_party (cgbookcase origin) and npm aframe-enviropacks (ambientCG ids Metal009, Metal035, Fabric026, Wood027, WoodFloor041, plus an untraced "Plastic"); record in `docs/swarm/tasks/R1.md` | n/a (research). Files are 2K, in session scratchpad only (~130 MB) | confirm cgbookcase licence per asset before landing; reject "Plastic" until traced; downscale to 1K for artifact; copy accepted sets out of the scratchpad; corrugated steel, chain-link, granite, cast iron, tar roof still unfound (needs ambientcg.com / polyhaven.com allowlist) |
| R2 | research-blocks | accept, partial | `docs/reference/block-faces.md` (per-street, confidence-tagged), `docs/swarm/tasks/R2.md`. Landmarks: Antioch Baptist 828 Greene, Lafayette magnolia (677 Lafayette), Upper Room Baptist (Marcus Garvey & Van Buren) | n/a | per-face floors / use / material NOT delivered (OSM Overpass and NYC Open Data blocked by egress proxy). Its sign-spelling "correction" rejected (deliberate "Kosciusko" signage). Street order unverified: MGR recollection that DeKalb Ave sits between Pulaski and Kosciuszko, and that Van Buren may not run west of Throop |
| R3 | research-lighting | accept | `docs/reference/lighting-targets.md`: exposure math checked against three r186 ACES, per-hour table (sun/moon/hemi/env/exposure/fog/bloom), per-material r/m/env table, 15 deviations with file:line, wet-road options | consumed by M1 | wet-asphalt variant + wetness state (Stage 2) |
| R4 | textures-storefront | accept | `src/textures/painters/storefront-art.ts` (archetype classifier, awning/sign layouts, 24 pictograms, 7-segment 718-555-01xx phones, stripes, plates), richer `signage.ts`, `tests/unit/textures/signage.test.ts` | yes: MaterialLibrary already uses awningPainter / signPainter | awning/sign UVs stretched ~2x on ~6.5 m frontages (geometry in src/world, fix in Stage 2 so the pre-squeeze can go) |
| R5 | textures-vehicles-people | accept | `src/textures/painters/vehicle.ts`, `people.ts`; keys tireSidewall, plate, clothHoodie/Denim/Varsity/Sneaker; `MaterialLibrary.carPaintDetail()` (shared flake normal / roughness / dirt); tests | yes: tyres + plates by M2 (carModel.ts), paint detail by M4 (main.ts), cloth hoodie/denim/sneaker by Fable (humanModel.ts, 01:39) | varsity jacket unused; car body UVs need v=0 at sill for the dirt band; no `tasks/R5.md` |
| M1 | lighting-reflections | __M1_VERDICT__ | __M1_DELIVERED__ | __M1_WIRED__ | __M1_FOLLOWUPS__ |
| M2 | driving-feel | accept | Vehicle: torque curve (sedan 0–100 km/h 6.1 s, box truck 12.1 s), engine braking + drag, ABS-ramped brakes, rate-limited speed-sensitive steering, slip / power oversteer / handbrake drift, parked cars friction-slow after nudges, wall scrub, roll/pitch/bounce on a child chassis, dents above 0.3 damage. Player: accel/decel, sprint ramp, smoothed facing, 0.4 s walk-to-door. Camera: speed lag, FOV 60→68, shake, wall pull-in (World2D.raycastStatic). carModel uses tireSidewall + plate | yes (M4 passes camCtx; M4 interpolates poses itself) | no explicit test yet for "stable at top speed, steering released 5 s" or "no contact bounce > 2 frames"; drift test should assert slip angle > 15° |
| M3 | traffic-ai | accept, exceeds scope | `TrafficLights.ts`: 2-phase NYC plan at all 18 intersections, 83 s cycle, yellow 3 s, all-red 1 s, green wave at 12 m/s; `world/props/signals.ts` (2 draw calls, 72 pole colliders); TrafficAgent obeys signals, overtakes, yields to peds, horn/back-off when stuck; Pedestrian WALK-gated crossings, groups, stoop sitting; Cops obey lights off-duty, 3-star PIT, patrols | yes (M4 wired WorldBuilder + main.ts) | no explicit full-density 5-minute no-gridlock test (PRD §5.2) |
| M4 | performance | accept | Game.ts FixedStepper + interpolation alpha; id-keyed pose snapshots (alloc-free) for all dynamic entities; real frame dt to camera; LoadingScreen (6 steps, texture timeout, shader warm-up); PerfMonitor (1% low, medium→low after 8 s < 40 fps); true per-frame draw-call stats; 250×200 m culling cells; allocation removal in the render loop; wired M1/M2/M3/M5/R5 | yes (owner of main.ts) | ~790 draw calls/frame (all passes) is high for an Iris Xe-class laptop; not verified on a real GPU |
| M5 | gameplay-ui | accept | `core/Gamepad.ts`, `ui/Menu.ts` + `menu.css` (quality, master/radio volume, invert-Y, controls, reset), HUD polish (input-mode glyphs, toast, location card, star pulse), Minimap polish, Input invertLookY / mode, AudioSystem (gears, slip squeal, handbrake, day/night beds, radio volume, pause), `ui/SaveState.ts` (position + hour, throttled, pagehide) | yes (M4 applied the 8-step wiring + SaveState hook) | per-frame allocations in Hud.ts:135 and Minimap.ts:200 (M5 exited → close-out) |

## 3. What changed (files)

__FILES__

## 4. Acceptance status (PRD §5.2)

__ACCEPT__

## 5. Open issues

__OPEN__

## 6. Risks carried into Stage 2

__RISKS__

## 7. Recommended Stage 2 task list

__TASKS__

## 8. Process notes

__PROCESS__
