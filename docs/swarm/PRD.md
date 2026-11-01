# GTA Bed-Stuy — Product Requirements (staged)

Owner: Opus manager (MGR), Stage 1 swarm. Direction: Carlos Franzetti. Orchestrator: Fable.
Status: living document, expanded 2026-10-28 from the orchestrator's skeleton. Stage plan and roster:
`docs/swarm/stages.md`. Board: `docs/swarm/board.md`. Design spec of record:
`docs/superpowers/specs/2026-10-24-gta-bedstuy-design.md` (this PRD refines it; where they disagree on
Stage 1+ scope, this PRD wins, on architecture the spec wins).

## 1. Vision

A non-commercial browser tribute to GTA 5 set on ten real blocks around Throop Ave and Kosciuszko St,
Bedford-Stuyvesant, Brooklyn. The goal is the *feel* of GTA 5, not its content: golden-hour and night
lighting, wet-looking asphalt, believable material response (glossy paint and glass, matte sidewalks and
brick), dense streets with stoops, bodegas and parked cars, weighty arcade driving, traffic that obeys
signals, pedestrians who live on the block, a cop pursuit loop and a cinematic third-person camera.

Success test (from the spec, still the north star): someone who knows the neighbourhood opens the page
and says "that's Throop and Kosciusko" within ten seconds, then plays for ten minutes without the
illusion breaking (no blown-out sky, no jittering cars, no gridlocked intersection, no frame hitching).

### Who it is for
- **The neighbourhood player**: knows the blocks, judges the place (grid, brownstones, corner stores,
  signage tone). Cares about recognisability and humour.
- **The GTA fan**: judges feel (handling, camera, lighting, traffic life). Cares about polish.
- **The author**: wants a shareable, private-by-default single link that runs anywhere, and later a
  hosted high-fidelity build.

### Non-goals (all stages unless a stage says otherwise)
Multiplayer, interiors, weapons/gore, real business or real person names, mobile-first design (touch
works but desktop is the target), monetisation of any kind.

## 2. Constraints

### 2.1 Licensing and IP (hard rules; a violation blocks merge)
1. **No Rockstar / Take-Two assets** of any kind: no textures, models, audio, music, fonts, logos, UI art,
   map data, or traced/imitated logos. Style may be *analysed* (docs/reference/gta5-style-notes.md);
   pixels may not be copied. The title screen and README carry the fan-tribute / not-affiliated disclaimer.
2. **No Street View imagery** in the repo, the build, or any texture derivation. Street View (and the
   user's own screenshots of it) are *reference only*: they inform values in `bedstuy.json`, palettes and
   notes, never pixels. Screenshots the user supplies stay outside the repo (or in a git-ignored folder)
   and are never sampled into textures.
3. **Textures are CC0 or own work only**: CC0 photo sets (ambientCG, Poly Haven, cc0textures and
   verified mirrors that preserve the CC0 notice), the author's own photographs (`src/assets/textures/user/`,
   author grants rights), or procedural canvas painters. Every non-procedural file is listed in
   `docs/CREDITS.md` with source asset id and licence before it lands. CC-BY assets require explicit
   orchestrator approval and a credit line; CC-BY-SA, NC, "free for personal use", and unknown-licence
   assets are rejected.
4. **Parody names only**: businesses are parodies of a *type* (spec §8). Real street names are fine.
   No real shop names, owners, phone numbers, or brand logos (no real soda/beer/lottery brands on posters).
5. **Models and audio**: Stage 1 ships none. User-supplied glTF (Stage 3) must come with a licence the
   user confirms (own work, CC0, or CC-BY with credit); `src/assets/models/README.md` documents the hooks.
6. **Data**: OSM data is ODbL (attribution "© OpenStreetMap contributors" in CREDITS if derived values are
   used); NYC Open Data (PLUTO, building footprints) is public; both are used as *values*, not shipped dumps.

### 2.2 Technical
- Vite + TypeScript (strict) + three@0.186; no backend; no runtime network (the game builds and runs offline).
- Procedural and deterministic: everything takes a seed from `Rng`; same seed, same city.
- Flat world with custom 2.5D physics (`src/physics`); no physics engine in Stage 1–2.
- Fixed 60 Hz simulation, render per animation frame (Stage 1 adds interpolation).
- Shared contracts (`src/world/types.ts`, `package.json`, tsconfig/vite/vitest configs) change only via the
  orchestrator (`FOR FABLE:` in the transcript). No new runtime dependencies without orchestrator approval.

### 2.3 Distribution: single-file artifact vs hosted build
| | Single-file artifact (Stage 0–2) | Hosted build (from Stage 2) |
|---|---|---|
| Output | `npm run artifact` → `dist/artifact.html`, everything inlined (vite-plugin-singlefile) | `npm run build:hosted` (to be added) → static `dist-hosted/` with separate hashed assets |
| Hard limit | **16 MB** rendered page (platform limit, includes base64 `data:` URIs, which inflate binaries ~33%) | none hard; budget ~60 MB first load, lazy-load beyond |
| Working budget | **≤ 12 MB** (4 MB headroom); warn at 10 MB. Stage 0 artifact ≈ 6.5 MB | — |
| Textures | 1K JPG photo sets + procedural canvas painters | 2K photo sets, optional KTX2/basis, more variants |
| Models / audio | procedural only | user-supplied glTF + Draco/meshopt, CC0/own audio files |
| Quality tiers | low / medium / high | adds `ultra` |

Rules: any asset added in Stage 1 must state its artifact-size cost in the agent's final report.
Procedural painters cost ~0 bytes and are preferred. The two builds share one codebase; the hosted
build differs only by an asset manifest and a build flag (`import.meta.env.VITE_HOSTED`), never by a fork.

## 3. Quality tiers

Picked automatically (desktop → medium, touch → low), overridable with `?q=` and, from Stage 1, from the
pause menu and by the fps auto-detect (M4: after ~8 s of play, step medium -> low if fps stays
< 40 (as built by M4; skipped with `?q=` or `?perf=0`); never step up automatically; a manual choice is persisted and disables auto-detect).

| Setting | low | medium | high | ultra (hosted, Stage 2+) |
|---|---|---|---|---|
| Target device | phone / old iGPU | mid laptop (Iris Xe / M1-class) at 1080p | discrete GPU | desktop dGPU |
| Pixel ratio cap | 1.25 | 1.75 | 2 | 2 |
| Shadow map | 1024, 60 m box | 2048, 80 m box | 4096, 100 m box | 4096 ×2 cascades |
| AO | off | GTAO low | GTAO 16 samples | GTAO full |
| AA | FXAA/MSAA | MSAA | SMAA | SMAA + TAA |
| Bloom / flare / LUT | bloom low, no flare | on | on | on |
| Night lamp light pool | small | medium | large | large |
| Traffic / peds | ~15 / ~20 | ~30 / ~40 | ~30 / ~50 | ~40 / ~70 |
| Target | 30 fps | **60 fps** | 60 fps | 60 fps |

The exact numbers live in code (`LightingConfig.ts`, `Shadows.ts`, `Pipeline.ts`); this table is the intent.
An agent changing a tier's cost must say so in its report.

## 4. Functional requirements by area (Stage 1 scope)

- **Lighting & reflections (M1, R3):** per-hour sun/sky/fog/exposure table driven from
  `docs/reference/lighting-targets.md`; env-map intensity per material class (paint/glass high, masonry
  and sidewalk low); night exposure that keeps streets readable under lamps; shadow bias tuned for stoops
  and cornices; bloom threshold above sky luminance; flare only when the sun is visible. A
  `scripts/light-audit.mjs` harness renders fixed views × hours and reports clipped-pixel and mean
  luminance per shot so regressions are measurable.
- **Driving & on-foot feel (M2):** weight transfer / body roll / pitch visuals, handbrake drift,
  speed-sensitive steering, pushable parked cars, visible damage, camera lag/shake/wall pull-in,
  smoothed on-foot acceleration and turning.
- **Traffic & AI (M3):** signal controller at every intersection (all 18 touch an N-S avenue; the
  original "6 avenue intersections" minimum meant the avenue × avenue crossings, superseded 01:35 when M3
  signalised all 18); agents stop on
  red/amber, go on green, yield to crossing peds; peds cross on walk phase, form small groups, sit on
  stoops; cops pursue through the lane graph without getting stuck.
- **Performance (M4):** render interpolation between fixed steps; frustum culling/instancing/LOD where
  measurable; allocation audit of hot loops; loading screen with real progress; fps-based quality auto-detect.
- **Gameplay UI (M5):** pause/settings menu (quality, master/radio volume, controls reference,
  invert-y, sensitivity), gamepad (standard mapping), enter/exit polish, radio UI, position/time save in
  `localStorage` (try/catch, game works without it), HUD polish.
- **Storefront art (R4):** awning layouts per archetype (bodega, laundromat, barber, …) with procedural
  pictograms and lightbox typography; parody posters. Procedural only.
- **Vehicle & people textures (R5):** paint flake/dirt/scratch maps, licence plates (fictional formats,
  no real plate numbers needed beyond random), tyres; cloth for people (hoodie, denim, varsity, sneakers).
  Procedural; new MaterialLibrary keys only.
- **Research (R1, R2, R3):** CC0 set inventory with verified licences and reachable URLs (R1); per-block-face
  data for the 10 blocks with sources and confidence (R2); lighting targets with citations and an audit of
  current values (R3). Research changes no source code.

## 5. Acceptance criteria

### 5.1 Global gates (every stage, every agent)
- `npm run typecheck` clean; `npm test` green (no skipped tests added without a reason in the report).
- `npm run build` succeeds; the e2e smoke (`npm run test:e2e`) renders with no console errors.
- `npm run artifact` output ≤ 12 MB (Stage 1); never > 16 MB.
- No file outside the agent's ownership changed (board.md); shared-file changes went through Fable.
- CREDITS.md updated for every non-procedural asset; licence rules in §2.1 hold.
- Final report posted in the transcript: what changed (files), how verified (commands + numbers),
  size impact, open issues, follow-ups.

### 5.2 Stage 1 (closed 2026-10-28; status in checkins/stage1.md) — measurable
| Area | Criterion | How measured |
|---|---|---|
| Light | No blown highlights at any hour at exposure 1.0: < 0.5% clipped pixels (any channel ≥ 254) per audit view, sky included | light-audit at hours 6, 8, 12, 17, 19, 21, 0, 3 |
| Light | Glass and car paint visibly reflect the sky (env contribution present); sidewalks/brick matte (no specular sheen at grazing angles by day) | audit screenshots, reviewer eyeball |
| Light | Night streets readable: mean luminance of street-level view ≥ 0.08 (linear-ish 0–1 sRGB mean ≥ ~20/255) with lamps; HUD legible | light-audit night views |
| Light | No shadow acne on stoops/cornices; no peter-panning > ~10 cm at medium | close-up audit views |
| Light | No bloom haze on the daytime sky; flare hidden when sun occluded or below horizon | audit views |
| Driving | Sedan 0–100 km/h in 6 s ± 1 s; top speed ~ 25–30 m/s | unit test on Vehicle with full throttle |
| Driving | Stable at speed: no oscillation/yaw wobble with steering released at top speed for 5 s | unit test |
| Driving | Handbrake at > 40 km/h produces a controllable drift (slip angle > 15°), recoverable | unit test + manual |
| Driving | Parked cars can be nudged (displaced, not wall-like); collisions damp without jitter (no contact bounce > 2 frames) | physics tests |
| Traffic | Signals at all 18 intersections (minimum: the 6 avenue × avenue crossings) with visible heads; vehicles stop on red, go on green; peds cross on walk | TrafficLights tests + screenshot |
| Traffic | No gridlock in 5 simulated minutes (every agent moves ≥ 10 m in any 60 s window) at medium density | headless sim test |
| Perf | 60 fps at medium on a mid laptop (fps overlay); in headless SwiftShader, no regression vs Stage 0 frame time | fps overlay + smoke stats |
| Perf | No per-frame allocations in hot loops (update/render of entities, systems, pipeline) | code review + allocation audit notes |
| Perf | Loading screen with real progress; render interpolation removes 30/60 Hz stutter | manual + test of interpolation math |
| UI | Pause menu (Esc / Start) with quality, volume, controls; gamepad drives on-foot and car; position + time persist across reload | Menu/Gamepad tests + manual |
| Textures | Storefront art and vehicle/people maps land; deterministic (pixel hash tests); artifact ≤ 12 MB | texture tests + artifact size |
| Research | block-faces.md, lighting-targets.md, R1 inventory each cite sources and mark confidence/gaps | MGR review |

### 5.3 Stage 2 (closed 2026-10-29; status in checkins/stage2.md) — measurable

Context (Fable's Stage 2 decisions, not re-opened here): the map stays as drawn (no DeKalb Ave); no network
allowlist and no Street View screenshots, so block-face values come from R2's notes, WebSearch snippets and
row-house typology knowledge, each value confidence-tagged (`high` = cited source, `med` = typology inference
from a cited neighbour, `low` = general knowledge). Hosting target is Vercel, static Vite build, output `dist`.
The original "≥ 90% of lots correct against screenshots" and "recognisability test with the user" criteria
move to the screenshot pass (Stage 2b / Stage 3 entry) because their evidence does not exist yet.

**Global gates on the integrated tree (both builds):** `npx tsc --noEmit` clean; `npx vitest run` all green
with test count ≥ 753 (Stage 1 end) and no new skipped tests; `npm run build` succeeds; `node
scripts/make-artifact.mjs` → `dist/artifact.html` **≤ 12 MB** (warn at 10 MB; hard 16 MB); `node
tests/e2e/smoke.mjs` prints `errors: []`.

| Lane | Criterion | How measured |
|---|---|---|
| D1 data-schema | `bedstuy.json` carries `schemaVersion: 2` with per-face/per-lot fields (floors, widthM, material family, stoop, cornice, use, storefront archetype, trees, scaffold, vacant, `confidence`); v1 files still load (migration path) | loader unit test on the real file + a v1 fixture |
| D1 | Validator rejects bad data with a path-qualified message: floors outside 1–8, widthM outside 3–40, unknown enum (material/use/archetype), lot widths per face summing to > face length + 1 m, missing `confidence` | ≥ 1 negative test per rule; real file validates with 0 errors |
| D1 | Coverage: every block face on the drawn grid (40 = 10 blocks × 4 sides) has an entry; every lot has floors + material + use (fallback values allowed but tagged `low`) | test counts faces and lots with no missing required field |
| D1 | `Grid.ts` behaviour unchanged unless stated: existing grid tests green, same street order, same seed output | grid tests |
| R2 research | `docs/reference/block-faces.md` has a row per face with lot count, typical floors, material mix, stoops, storefront corners, churches/vacant, source (URL or "typology") and confidence; ≥ 1 cited source per street | MGR review |
| R2 | A per-face screenshot checklist (what to photograph, which fields it settles) exists for the user's future Street View pass | MGR review of `docs/world-notes.md` / `tasks/R2b.md` |
| B3 buildings | Facade generator reads schema v2: per-lot floors, stoop, cornice, material family and bay rhythm come from data when present; falls back to the Stage 1 seeded generator when absent | unit tests: data lot → matching floor count/stoop/material; missing data → old output |
| B3 | Deterministic: same seed + data → identical geometry hash; church and vacant lots render from data | hash test |
| B3 | No draw-call regression from new facade variants: new parts merged per material per cell (B3 states the count, P8 confirms) | `__gtaStats.drawCalls` in smoke before/after |
| S4 storefronts | Awning/sign geometry UVs at true aspect (texture aspect within ±5% of world-space aspect); R4's ~2x pre-squeeze removed | unit test on UV/size ratio |
| S4 | Storefront archetype and position from schema v2; corner bodegas wrap the corner (two faces); roll gates down / lightboxes lit at night (state tied to `dayNight.isNight`) | storefront tests + one day/night screenshot by Q10 |
| X5 missions | Mission framework on the event bus: trigger zones, objectives, timer, fail, retry, reward, HUD text; no per-frame allocations in `update` | unit tests per state transition (start → objective → complete; start → fail → retry) |
| X5 | 3 missions (bodega delivery, laundromat getaway, cop escape) each completable start-to-finish and failable in a headless sim test | one passing test per mission for success and for fail+retry |
| X5 | Mission progress persists via `localStorage` (try/catch; game works without it); completed missions stay completed across reload | save/load test with storage throwing and working |
| X5 | Live: wiring request posted to P8 and applied in `main.ts` (call site named in X5's or P8's report) | MGR checks `main.ts` |
| H7 hosted | `vercel.json` with `outputDirectory: dist`, a `build:hosted` path (via FOR FABLE for package.json) producing hashed assets, a texture manifest that can point at 2K sets, and the `ultra` tier flag (`VITE_HOSTED`) | build:hosted run; manifest unit test |
| H7 | Same codebase: the artifact build and the hosted build differ only by flag + manifest; `dist/artifact.html` stays ≤ 12 MB and smoke passes on both outputs | both builds + smoke |
| H7 | Lazy texture loading does not break offline play: missing hosted assets fall back to the 1K/procedural set without console errors | unit test + smoke |
| H7 | README has a deploy section (Vercel steps, private/public note) | MGR review |
| P8 perf | **< 500 draw calls per frame (all passes) at medium** from the 4 Stage 1 camera spots (Stage 1: ~790); triangles not up by > 20% | `__gtaStats.drawCalls` / triangles via smoke or a P8 probe, before/after table |
| P8 | Props and parked cars instanced; shadow pass culls cells outside the shadow box (shadow-pass draw calls reported separately) | culling tests + numbers in report |
| P8 | All other lanes' wiring requests applied or explicitly declined in the transcript | MGR checks call sites |
| L9 lighting | light-audit at hours 6, 7, 12, 18, 19.5, 21, 0 (street, car, aerial; low + medium at 7/18/0): **< 0.5% blown pixels** per frame; night street mean luma **≥ 0.085** (Stage 1: 0.081–0.094) | `scripts/light-audit.mjs` |
| L9 | Baselines committed under `docs/reference/light-baselines/` (numbers per hour × view × tier; images only if small) so later stages diff against them | file exists, MGR review |
| L9 | Wet state: `Weather.ts` with a wetness 0–1 that lowers asphalt roughness and adds puddle reflections; dry default unchanged (audit numbers within ±0.01 mean luma at wetness 0) | unit test + audit at wetness 0 and 1 |
| L9 | No stoop shadow acne at 7h and 18h on medium/high; signal lamps at night bloom without sky haze | close-up audit views, reviewer eyeball |
| Q10 qa | Missing §5.2 tests exist and pass: top-speed 5 s steering-released yaw rate < 0.02 rad/s; contact bounce ≤ 2 frames; handbrake drift slip angle > 15°; 5-minute full-density (~30 vehicles, ~40 peds) sim where every agent moves ≥ 10 m in every 60 s window | `npx vitest run` on Q10's files |
| Q10 | `tests/e2e/screens.mjs` renders a fixed screenshot set (day/night × street/bodega corner/aerial) to a git-ignored folder; `docs/swarm/qa-stage2.md` lists regressions with severity | MGR review |
| T11 textures | Painters for corrugated steel, chain-link, granite curb, cast-iron railing, tar roof, graffiti layer; deterministic (pixel hash tests); procedural only (0 bytes of assets); new MaterialKeys landed via FOR FABLE | `tests/unit/textures/industrial.test.ts` |
| T11 | Each new key used somewhere (call site named, or a wiring request to B3/P8/S4) | MGR checks call sites |
| All | FINAL REPORT names files, commands + numbers, size impact, call site or wiring request, open issues | MGR review |

**Deferred to the screenshot pass:** ≥ 90% of lots correct by checklist against user screenshots;
neighbourhood recognisability test with the user; real-GPU 60 fps at medium (user, fps overlay).

### 5.4 Stage 3 — playtest loop (swarm started 2026-11-01T15:14Z) — measurable

Context (Fable's Stage 3 decisions): the rigged-models / audio plan moves to Stage 4+ (no models delivered yet).
Stage 3 is a fix-and-playtest loop: the user's bug (cannot exit cars), Stage 2 open issues 1–4 and 7, a recorded
playtest harness, then three blind Haiku playtesters (H1 on-foot explorer, H2 driver/missions, H3 chaos/cops)
whose findings MGR triages into a defects table. Ports: V1 4401, PT 4402, L10 4403, W2 4404, H1–H3 4411–4413, MGR 4420.

**Global gates on the integrated tree:** `npx tsc --noEmit` clean; `npx vitest run` all green with test count
≥ 1169 (Stage 2 end) and no new skipped tests; `npm run build` succeeds; `node scripts/make-artifact.mjs` →
`dist/artifact.html` **≤ 12 MB**; `node tests/e2e/smoke.mjs` prints `errors: []`; medium draw calls stay < 500.

| Lane | Criterion | How measured |
|---|---|---|
| V1 vehicle-exit | Root cause of "cannot exit the car" named (file:line) and fixed; exit works from **F key, touch CAR button and gamepad** | V1 report + unit tests per input path |
| V1 | **100 % of 50 headless exit attempts** succeed (player on foot, out of the car, control back on foot within 1 s), including parked **next to a wall**, **next to another car** on either side, at speed ≤ 2 m/s, and right after entering | `tests/e2e/enter-exit.mjs` prints attempts/successes per scenario |
| V1 | Exit never places the player inside a collider or under the map; if both doors are blocked, a fallback spot (roof/rear) or a clear refusal message, never a silent no-op | unit tests on the exit-spot search |
| V1 | Enter still works (F near a car, touch, gamepad); no regression in player/vehicle tests | `npx vitest run tests/unit/entities` |
| PT harness | `scripts/playtest/**` runs a Playwright session against a local preview, records **one webm** per session and writes a **thoughts transcript** (step, time, command, thought, state) | one demo session (scripted brain) with files listed in PT's report |
| PT | In-page **subtitle box** shows the tester's current thought, burned into the video; **≥ 95 % of steps** carry a non-empty subtitle on screen when their frame is captured | harness counts subtitled steps / total steps and prints it |
| PT | Command-file protocol a Haiku agent can drive step by step (write a command, wait for the step result + screenshot + state JSON), documented in `docs/PLAYTEST.md` with a worked example; harness survives a bad command without crashing | MGR review + demo log |
| PT | Per-step state export: mode (foot/car), position, speed, wanted level, mission state, HUD text, console errors | state JSON per step |
| L10 lighting | **Night spawn view mean luma within 0.085–0.13** (Stage 2: 0.24) via a glazing emissive cap ≈ 0.35 × texel; other night views ≥ 0.085; blown < 0.5 % at every audited hour | `scripts/light-audit.mjs` night views, before/after table |
| L10 | GTAO outline artefacts vs AoProxy: verified present or absent with an A/B frame; fixed or ticketed with cause | L10 report + frames |
| L10 | Stage 3 baselines written (`docs/reference/light-baselines/stage3.md`), incl. the hour-7 and car/aerial rows missing from Stage 2 | file exists, MGR review |
| W2 world | Areaway/stoop iron **fences block peds and the player** (colliders exported from facade data); no ped spawns inside a fenced areaway | unit test: walker into a fence stops/deflects; ped sim shows 0 fence penetrations |
| W2 | Avenue faces thinned: **3–5 mixed (commercial) lots per avenue face**, corner lots kept; residential rows between; validator still 0 errors | test counts mixed lots per avenue face |
| W2 | **graniteCurb texture applied** to curbs (RoadBuilder UV remap matches T11's painter rows); key now consumed | test on curb UVs/material key + screenshot |
| H1–H3 | Each playtester produces a recorded session (webm + subtitled thoughts transcript) and a FINAL REPORT with impressions, bugs and confusions (what they tried, what they expected, what happened) | session dirs + transcript posts |
| MGR | Every playtest bug/confusion lands in a defects table (id, severity, owner lane, repro) posted as `MGR: playtest triage` and carried into `checkins/stage3.md` | MGR post |
| All | FINAL REPORT names files, commands + numbers, size impact, call site or wiring request, open issues | MGR review |

### 5.5 Stage 4+ (preview; was the Stage 3 plan)
- User-supplied rigged characters and cars load through the existing glTF hooks with animations
  (idle/walk/run, wheel/steer, lights), fall back cleanly to procedural.
- Audio pass: CC0/own engine, ambience, radio content; mix ducking; volume settings respected.
- Polish: no known P1 bugs; 60 fps medium; first-play onboarding; accessibility basics (remap keys, subtitles for radio/mission text).

## 6. Process requirements (swarm)
- Ownership per board.md; cross-agent asks via `@agent:` in `docs/swarm/transcript.md`; manager decides
  `@mgr:` questions; shared-file edits relayed as `FOR FABLE:`.
- Agents do not run git or `npm install`; the orchestrator integrates and commits.
- Each agent writes `docs/swarm/tasks/<id>.md` (plan, decisions, results).
- MGR reviews each final report against §5 and records accept/concerns/follow-ups; the stage closes with
  `docs/swarm/checkins/stage<N>.md`.

## 7. Open questions (owner)
1. Network allowlist for overpass-api.de / data.cityofnewyork.us for R2 (Fable / user). Stage 2: none granted; WebSearch only.
2. Do user Street View screenshots live outside the repo or in a git-ignored `reference/` folder? (user) — default: outside.
3. Hosted build target: **decided, Vercel static (output `dist`)**. Public or private still open (user).
4. Which rigged models the user will supply and their licences (user, Stage 3).
