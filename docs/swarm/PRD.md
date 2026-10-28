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
pause menu and by the fps auto-detect (M4: after ~5 s of play, step down a tier if the 2 s average is
< 50 fps; never step up automatically; a manual choice is persisted and disables auto-detect).

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

### 5.2 Stage 1 (this swarm) — measurable
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

### 5.3 Stage 2 (preview; detailed in stages.md)
- Every one of the ~24 block faces matches research + user screenshots on: lot count ±1, floors, material
  family, stoop yes/no, storefront positions and archetypes (≥ 90% of lots correct by checklist).
- At least 3 missions playable start to finish with fail/retry, using the event bus; mission state saves.
- Hosted build deploys from the same codebase with 2K textures and `ultra` tier; artifact still ≤ 16 MB.
- Neighbourhood recognisability test with the user passes.

### 5.4 Stage 3 (preview)
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
1. Network allowlist for overpass-api.de / data.cityofnewyork.us for R2 (Fable / user).
2. Do user Street View screenshots live outside the repo or in a git-ignored `reference/` folder? (user) — default: outside.
3. Hosted build target (static host choice) and whether it is public or private (user, Stage 2).
4. Which rigged models the user will supply and their licences (user, Stage 3).
