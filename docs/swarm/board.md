# Swarm board (Stage 3 — playtest loop)

Owner: Opus manager. Orchestrator: Fable (session). Status: queued · running · blocked · review · done.
Stage 1/2 boards are in git history; outcomes in `checkins/stage1.md`, `checkins/stage2.md`.

User direction (1 Nov): keep iterating with the same system (Sonnet/Haiku implementers, Opus manager, Fable in charge).
Reported bug: **the player cannot exit cars**. New lane: **blind playtesters on Haiku** play the game through a recorded
harness; their thinking is shown in a subtitle box burned into the recording and reported back.

| id | agent | model | task | owns (files) | status |
|---|---|---|---|---|---|
| V1 | vehicle-exit-bug | sonnet | Reproduce headlessly and fix "can't exit the car" (F key, touch CAR button, gamepad), plus any enter/exit edge cases found; regression tests | `src/entities/Player.ts`, `src/core/Input.ts`, `src/core/Gamepad.ts`, `src/ui/TouchControls.ts`, `src/main.ts` F-handling lines only, `tests/unit/entities/player*.test.ts`, `tests/e2e/enter-exit.mjs` | running |
| PT | playtest-harness | sonnet | Recorded playtest harness: Playwright video + in-page subtitle box for the tester's thoughts, command-file protocol so a Haiku agent can drive it step by step, state export per step, final webm + thoughts transcript | `scripts/playtest/**`, `tests/e2e/playtest*.mjs`, `docs/PLAYTEST.md` | running |
| L10 | lighting-3 | sonnet | Night shop-window glazing too bright near spawn (cap ≈ 0.35 × texel), verify GTAO outline artefacts vs AoProxy, re-audit night views | L9's files (`src/render/*`, `src/game/DayNight.ts`, `src/game/Weather.ts`), `src/textures/MaterialLibrary.ts` window/storefrontGlass emissive values line-locally, `src/render/AoProxy.ts` with P8 gone, `scripts/light-audit.mjs` | running |
| W2 | world-fixes | sonnet | Areaway/stoop iron fence colliders, thin commercial density on avenue faces (3–5 mixed lots per face, corners kept), graniteCurb UV remap in RoadBuilder | `src/world/buildings/{brownstone,facade}.ts` collider export, `src/world/BuildingGen.ts`, `src/world/RoadBuilder.ts`, `src/world/data/bedstuy.json` + `schema.ts` density pass, `tests/unit/world/*` | running |
| H1–H3 | playtesters | haiku | Blind playtests (no code access): 1 on-foot explorer, 1 driver/missions, 1 chaos/cops; each a recorded session via PT's harness with their thoughts as subtitles; written impressions + bugs | playtest session dirs only | queued (after PT) |
| MGR | manager | opus | Stage 3 PRD rows, this board, reviews, routing, playtest findings triage into defects, `checkins/stage3.md` | `docs/swarm/*` | running |

Shared files via `FOR FABLE:` as before. Nobody commits. Ports: V1 4401, PT 4402, L10 4403, W2 4404, H1 4411, H2 4412, H3 4413, MGR 4420.
