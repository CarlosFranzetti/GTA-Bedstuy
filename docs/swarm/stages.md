# GTA Bed-Stuy — Stage plan

Owner: MGR. Companion to `docs/swarm/PRD.md` (acceptance criteria in PRD §5). Each stage has goals,
entry/exit criteria, risks and a roster. A stage exits only when its check-in
(`docs/swarm/checkins/stage<N>.md`) is written and the orchestrator has integrated the work.

---

## Stage 0 — Sandbox v1 (DONE, 2026-10-24 → 10-27)

**Goals delivered:** playable sandbox on the ten-block grid; walk, enter/exit and drive cars; traffic,
pedestrians, wanted level and cop pursuit; touch controls; PBR materials with CC0 ambientCG photo packs;
shadows, GTAO, bloom, sky dome, lens flare, LUT; street furniture and props; procedural car and human
models; glTF hooks for rigged models; Web Audio synth engine/horn/radio; single-file artifact (~6.5 MB).

**Exit evidence:** unit tests + Playwright smoke green; artifact published; design spec and v1 plan in
`docs/superpowers/`.

**Known debt carried into Stage 1:** lighting/reflection artefacts (blown highlights, haze, acne,
uniform env reflections), arcade handling without weight, four-way-yield only (no signals), stutter
from un-interpolated fixed-step rendering, no menu/settings/gamepad, generic storefront art, flat car
paint and clothes, block faces from general knowledge rather than data.

---

## Stage 1 — Feel and fidelity pass (DONE, 2026-10-28 01:09Z → 03:33Z; see checkins/stage1.md)

**Goals:** fix how it looks and feels without changing the world layout: lighting & reflections,
driving feel, signals and AI, smoothness, menus/gamepad, storefront art, vehicle/people textures;
plus three research tracks that feed Stage 2 (block faces, CC0 round 3, lighting targets).

**Entry criteria (met):** Stage 0 green; board with ten owned lanes; transcript + swarm-say script;
PRD skeleton.

**Exit criteria:**
- All ten workers posted a FINAL REPORT; MGR review recorded for each.
- PRD §5.1 global gates pass on the integrated tree (typecheck, unit, build, smoke, artifact ≤ 12 MB).
- PRD §5.2 criteria met or explicitly deferred with an owner in the check-in.
- `docs/swarm/checkins/stage1.md` written with Stage 2 task list.

**Risks and mitigations:**
| Risk | Mitigation |
|---|---|
| Ten agents in one working tree: concurrent edits / hidden coupling (e.g. M1 Pipeline vs M4 Game/main, M5 Input vs M2 Player) | strict file ownership; cross-lane needs via `@agent:`; main.ts wiring owned by M4 only, others request hooks |
| `types.ts` / package.json contract changes needed mid-stage | `FOR FABLE:` relay; agents code against a local interface until Fable lands it |
| Network egress blocks research (OSM/PLUTO 403) | fallback sources + explicit gap lists; allowlist request relayed to Fable |
| Lighting tuning is subjective and regresses easily | light-audit harness with numeric thresholds (clipped %, mean luminance) |
| Artifact growth from new textures | procedural painters preferred; per-agent size cost in reports; 12 MB budget |
| Headless SwiftShader cannot prove 60 fps | fps overlay on real hardware by the user; headless used only for regressions |
| Tests that are green but feature not wired (integration gap) | reviewers check the call site in main.ts/Game, not just unit tests |

**Roster:**
| id | lane | model |
|---|---|---|
| R1 | research-cc0 (CC0 texture sets round 3) | haiku |
| R2 | research-blocks (block-face data) | haiku |
| R3 | research-lighting (lighting targets) | haiku |
| R4 | textures-storefront | sonnet |
| R5 | textures-vehicles-people | sonnet |
| M1 | lighting-reflections | sonnet |
| M2 | driving-feel | sonnet |
| M3 | traffic-ai | sonnet |
| M4 | performance (owns entry point) | sonnet |
| M5 | gameplay-ui | sonnet |
| MGR | manager, PRD/stages/board/check-in | opus |
| Fable | orchestrator, shared files, integration, commits | session |

---

## Stage 2 — Block-face accuracy, missions, hosted build (DONE, 2026-10-28T21:48Z → 10-29; see checkins/stage2.md)

**Goals:**
1. **Block-face accuracy:** rebuild the ~24 block faces from R2's data (and, in a later pass, the user's Street View
   screenshots, reference only, PRD §2.1): per-lot floors, width, material family, stoop, cornice,
   storefront archetype and position, trees, scaffolds, vacant lots. Data-first: extend `bedstuy.json`
   (schema change via Fable) and a block-face checklist in `docs/world-notes.md`.
2. **Missions:** a small mission framework on the event bus (trigger, objectives, fail/retry, reward,
   HUD text) and 3–5 missions in the neighbourhood's tone (delivery run for the bodega, laundromat
   getaway, block-party supply run, cop chase escape).
3. **Hosted build:** `build:hosted` target with separate hashed assets, 2K CC0 textures from R1,
   `ultra` tier, lazy loading; the single-file artifact keeps working under 16 MB.
4. Carry-overs from Stage 1 check-in (deferred criteria, follow-ups).

**Entry criteria (met, with decisions by Fable at 21:48Z):**
- Stage 1 check-in written and integrated (commits 5cb3754, 72163d7: metalness fixes, leftover allocations, R1 provenance).
- Grid: the map stays as drawn (no DeKalb Ave between Pulaski and Kosciuszko); street order and one-way questions closed for this stage.
- Block-face data: no network allowlist and no Street View screenshots arrived, so accuracy is built from R2's notes,
  WebSearch snippets and row-house typology knowledge, every value confidence-tagged (high / med / low). The
  screenshot-based ≥ 90% check moves to a later screenshot pass; R2 writes the per-face checklist for it.
- R1 set list licence-verified (docs/reference/r1-sources); 2K sets not in the repo, so the hosted manifest is built
  ready for 2K and ships 1K/procedural until the sets land.
- Hosting decided: Vercel, static Vite build, output `dist`.

**Exit criteria:** PRD §5.3 table met or deferred with an owner; global gates green on both builds (artifact ≤ 12 MB, < 500 draw calls at medium); all ten FINAL REPORTs reviewed by MGR; check-in `stage2.md`.

**Risks:** data gaps where OSM/PLUTO are unreachable (mitigate: user screenshots, mark confidence);
schema churn in `bedstuy.json`/`types.ts` (one owner, Fable, versioned schema); mission scope creep
(cap at 3–5, reuse systems); two-build drift (one codebase + manifest flag, CI builds both); size
regressions in artifact when 2K textures arrive (hosted-only asset set).

**Roster (board.md is the source of truth for owned files):**
| id | lane | model |
|---|---|---|
| D1 | data-schema (bedstuy.json v2, loader, validation) | sonnet |
| R2 | research-blocks-2 (WebSearch block faces, screenshot checklist) | haiku |
| B3 | buildings (facades from schema v2) | sonnet |
| S4 | storefronts (placement, true-aspect awnings, corner wrap, night state) | sonnet |
| X5 | missions (framework + 3 missions) | sonnet |
| H7 | hosted-build (Vercel, manifest, ultra, lazy textures) | sonnet |
| P8 | performance-2 (instancing, < 500 draw calls; owns main.ts/WorldBuilder.ts, applies wiring) | sonnet |
| L9 | lighting-2 (wet state, acne, lamp bloom, baselines) | sonnet |
| Q10 | qa (missing §5.2 tests, screenshot set, regression report) | sonnet |
| T11 | textures-4 (procedural industrial surfaces) | sonnet |
| MGR | manager | opus |
| Fable | orchestrator, shared files, commits | session |

---

## Stage 3 — Playtest loop (DONE, 2026-11-01T15:14Z → 11-03T13:30Z; see checkins/stage3.md)

**Goals:**
1. Fix the user-reported bug: **the player cannot exit cars** (F key, touch CAR button, gamepad), plus enter/exit edge cases.
2. **Recorded playtest harness**: Playwright video + in-page subtitle box burned into the recording showing the tester's
   thoughts, a command-file protocol a Haiku agent can drive step by step, per-step state export, webm + thoughts transcript.
3. **Blind playtests** by three Haiku agents with no code access (on-foot explorer, driver/missions, chaos/cops);
   MGR triages their bugs and confusions into a defects table that seeds Stage 4.
4. User additions (15:17–15:19Z): phone tier, CC0 model research, own-library radio + original talk show, GTA 5 design bible.
5. Stage 2 carry-overs: night glazing cap near spawn + GTAO artefact check (L10); areaway fence colliders, avenue
   commercial density thinning, graniteCurb UV remap (W2).

**Entry criteria (met):** Stage 2 check-in written and integrated (commit 7de34af); board rewritten by Fable (50e067c);
bug report from the user. The rigged-model / audio plan moves to Stage 4+ because no models or licences have arrived.

**Exit criteria:** PRD §5.4 table met or deferred with an owner; global gates green; every FINAL REPORT (V1, PT, L10, W2,
H1–H3) reviewed by MGR; playtest triage posted; check-in `checkins/stage3.md` with the Stage 4 list.

**Risks and mitigations:**
| Risk | Mitigation |
|---|---|
| Exit bug is input-path specific (works with one input, not another) or position specific (walls, adjacent cars) | 50-attempt headless matrix across inputs and placements; exit-spot search unit tests |
| Haiku testers get stuck on the harness protocol instead of the game | PT ships a worked example + scripted demo; protocol tolerant of bad commands; MGR answers `@MGR` fast |
| Testers' reports are vague | report template: tried / expected / happened / where; subtitle transcript as evidence |
| Headless load (several Chromium sessions) crashes night renders (seen in Stage 2) | fixed per-lane ports; stagger H1–H3; low tier for playtests |
| Lighting cap regresses other views | full light-audit before/after table, Stage 3 baselines |
| Density thinning breaks the validator or storefront placement | validator + storefront tests in W2's gate |

**Roster (board.md is the source of truth for owned files):**
| id | lane | model |
|---|---|---|
| V1 | vehicle-exit-bug | sonnet |
| PT | playtest-harness | sonnet |
| L10 | lighting-3 | sonnet |
| W2 | world-fixes | sonnet |
| H1–H3 | blind playtesters (after `PT READY`) | haiku |
| MOB | phone-tier (added 15:17Z) | sonnet |
| MDL | models-research, CC0 glTF (added 15:17Z) | haiku |
| RADIO | radio-library, user's own files, 8 stations + talk (added 15:17Z) | sonnet |
| WRITE | talk-show-writer, 22-min original script (added 15:17Z) | sonnet |
| BIBLE | design-bible, GTA 5 as design targets (added 15:18Z) | sonnet |
| MGR | manager | opus |
| Fable | orchestrator, shared files, commits, launches H1–H3 | session |

---

## Stage 4+ — Rigged characters and cars, audio, polish (was the Stage 3 plan)

**Goals:**
1. **Characters and cars from rigged models the user supplies** through the existing glTF hooks
   (`src/assets/models/README.md`): animation retargeting (idle/walk/run, sit for stoops, enter/exit
   car), wheel/steer/suspension nodes, lights, damage states; procedural fallbacks retained.
2. **Audio pass:** CC0/own recorded or synthesised engine layers per vehicle, tyre squeal, city
   ambience by hour, parody radio content (original), sirens, footsteps; mixer with ducking; respects
   menu volumes.
3. **Polish:** onboarding, controls remapping, subtitles, photo mode, bug bash, performance pass on
   real hardware, accessibility basics, final credits screen.

**Entry criteria:** Stage 2 exit; models delivered with confirmed licences; audio sourcing rules agreed.

**Exit criteria:** PRD §5.5 met; no open P1 bugs (incl. Stage 3 playtest defects); both builds green; final check-in.

**Risks:** model licences and sizes (hosted-only for heavy models; Draco/meshopt; licence confirmation
before import); animation retargeting across rigs (constrain to one humanoid skeleton convention);
audio licensing (CC0/own only, no sampled commercial music); polish never ends (time-box, P1-only rule).

**Proposed roster:** model integration (characters) · model integration (vehicles) · animation/state
machines · audio design · audio systems/mixer · UX polish/accessibility · perf on hardware · QA · MGR · Fable.
