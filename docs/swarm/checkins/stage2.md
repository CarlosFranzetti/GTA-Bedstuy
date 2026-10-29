# Stage 2 check-in — block-face accuracy, missions, hosted build

Written by Fable at close-out (29 Oct, ~01:10Z). The Opus manager reviewed and accepted every lane but hit the
account usage limit before writing this file; its per-lane reviews are in `transcript.md` (search `MGR review of`).
A container restart at ~22:45Z killed seven lanes mid-work; all were relaunched in resume mode with their on-disk
edits intact and finished.

## 1. Summary

Eleven workers + manager. All ten original lanes plus the F12 fix lane posted FINAL REPORTs; all reviewed ACCEPT
(D1, B3, P8, L9, F12 "with concerns", R2 "partial", T11 "usage pending" → now used). Global gates on the integrated
tree: `tsc` clean, vitest 69 files / 1169 pass / 2 todo, artifact 6.89 MB (budget 12), smoke errors [], hosted build
36 files / 5.5 MB with a clean headless smoke. Artifact v7 published.

## 2. Per-agent outcomes

| id | lane | result |
|---|---|---|
| D1 | data-schema | Lot schema v2: `src/world/data/schema.ts` (types, validator, defaults, typology generators, `lotsForFace`), `faces.ts`, `bedstuy.json` v2 with 40 faces / 840 lots (confidence-tagged, 821 L / 19 M); 33 tests |
| R2 | research-blocks-2 | `block-faces.md` §5 pass 2 (per street, 22 queries), `world-notes.md` 40-face Street View checklist; corrections: Antioch Baptist is outside the grid, magnolia placement unresolved; LPC report host blocked |
| B3 | buildings | Data-driven facades: storey heights, raised basements + stoops with cast-iron railings and areaway fences, bay rhythm, cornices, fire escapes, church / vacant / scaffold from data, tar roofs, chain-link + corrugated vacant lots; 187 world tests |
| S4 | storefronts | True-aspect awnings/signs (atlas tiles sized from geometry), placement from lot data (11 archetypes, parody names), corner bodegas wrap the corner, window stickers, lit lightboxes after 19:30 within L9's caps, roll gates down 22:00–06:00 by archetype, graffiti decals on closed gates |
| X5 | missions | Mission framework on the event bus (9 objective kinds, timers, fail/retry, rewards, markers, HUD, save) + 3 missions (Bodega Run, Laundromat Getaway, Block Party); 58 tests; wired in main.ts (R retry / X abandon) |
| H7 | hosted-build | `vercel.json`, two-branch `vite.config.ts` (`VITE_HOSTED=1`), `build:hosted` / `build:all` / `smoke:hosted`, `src/textures/hosted.ts` lazy tier swap + `?q=ultra` (hosted only), README "Deploy on Vercel"; 24 tests |
| P8 | performance-2 | PassCounter, CarLod, AoProxy shadow/GTAO proxies, instanced furniture, per-cell merge threshold: medium draw calls 2118–2919 → 273–376 on all seven viewpoints (< 500 target), visual A/B diff < 1.2/255; applied all wiring |
| L9 | lighting-2 | Shadow bias per tier (~1 texel), overcast + `Weather.ts` (dry→rain→wet→drying, puddle mask shader layer on roads/sidewalks), night hemi/exposure retune, light-audit views + `--weather`, `docs/reference/light-baselines/stage2.md`; blown ≤ 0.09 % everywhere |
| Q10 | qa | 5-min full-density sim, vehicle stability/jitter/drift tests, pursuit + enter/exit tests, `tests/e2e/screens.mjs` (7 viewpoints + stats), defects D1–D5 with repros; lane hit the usage limit before writing `qa-stage2.md` |
| T11 | textures-4 | `painters/industrial.ts`: corrugated steel, chain-link + rail, granite curb, cast-iron fence, tar roof, graffiti (22 variants), 134 tests, surfaces doc §8; all keys consumed except graniteCurb |
| F12 | traffic-fixes | Q10-D1..D4 fixed: veh-veh impacts 121/102 → 5/5 per 5 min (hard AI-AI 0), ped knock-downs on WALK 3/1 → 0/0, impact-event spam 544 → ≤ 2, pole wedge back-out; D5 did not reproduce |
| Fable | orchestrator | Shared files: 7 industrial MaterialKeys, mission events on `GameEvents`, `WantedSystem.raiseTo`, `Minimap` blips, hosted vite/package config, `setStorefrontHour` wiring, marker beam shrink, commits + artifact |

## 3. Acceptance vs PRD §5.3

| criterion | status |
|---|---|
| draw calls < 500 at medium (all viewpoints) | MET (273–376) |
| artifact ≤ 12 MB | MET (6.89 MB) |
| light-audit blown < 0.5 % | MET (≤ 0.09 %) |
| night street mean ≥ 0.085 | MET on street views; the spawn view reads 0.24 because of lit shop glazing next to spawn (see open issues) |
| schema validator rules + negative tests | MET (33 tests) |
| hosted build gates (vercel.json, manifest, fallback, smoke) | MET |
| missions: success + fail/retry chain per mission | MET (3/3) |
| no gridlock / no red-light runs / no WALK knock-downs in the 5-min sim | MET after F12 |

## 4. Open issues (carry to Stage 3)

1. **Night glazing brightness near spawn** (L9/S4): shop-window glazing emissive should be capped at ~0.35 × texel; S4 capped lightboxes to 0.55 but glazing comes from the shared window emissive in `MaterialLibrary` / `NightLights`. Owner: Fable or a Stage 3 lighting lane.
2. **graniteCurb unused**: `RoadBuilder.ts` curb UV rows do not match T11's painter; needs a UV remap. Deferred.
3. **Avenue faces too commercial** (MGR on D1): Throop faces carry 5–9 mixed lots of 10–11; thin to ~3–5 with residential rows between corners once Street View values arrive.
4. **Areaway iron fences have no colliders** (B3): peds walk through 0.9 m iron.
5. **Pursuit test is timing-chaotic** (F12): green only thanks to the 13 m/s corner cap; Q10 to harden.
6. **QA doc missing**: `docs/swarm/qa-stage2.md` was not written (usage limit). Test matrix is in `tests/unit/sim/*`.
7. **GTAO outline artefacts** on flat test planes, possibly from the AoProxy G-buffer (L9 observation, unverified).
8. **Grid order / one-way directions still unverified**; DeKalb Ave decision left with the user.
9. **Block Party window**: game starts 17:30 so the 20:00 deadline leaves 150 s (doable by car only).

## 5. Risks

Two builds (artifact / hosted) from one config: CI should build both. Data file is now 107 KB of frozen typology; Street View
values will replace it lot by lot. Mission tuning untested on real hardware. Usage limits can kill long swarms: keep
snapshots committed (done every few minutes this stage).

## 6. Stage 3 task list (proposal)

1. Street View pass with the user's screenshots → edit `bedstuy.json` lots directly (values only).
2. Night glazing cap + GTAO artefact check (lighting lane).
3. Rigged characters and cars (CC0/own only), animation retarget, audio polish (PRD Stage 3).
4. More missions (cop escape as its own, block-party variants), mission tuning on hardware.
5. Curb UV remap + areaway colliders + commercial density thinning.
6. QA: harden pursuit test, write `qa-stage2.md`, add screenshot diffs to CI.
7. Hosted: enable the 2K tier once R1 licences are confirmed per asset; Vercel deploy from `master`.

## 7. Process notes

Transcript-based coordination worked again; the `FOR FABLE:` relay carried 9 shared-file decisions. The restart cost
~15 minutes; resume prompts that point agents at their own transcript posts recovered every lane. Two lanes
(MGR, Q10) ended on the account usage limit rather than by choice.
