# GTA Bed-Stuy — Product Requirements (staged)

Skeleton written by the orchestrator; the Opus manager expands each section during Stage 1.

## Vision
A non-commercial browser tribute to GTA 5 set on ten real blocks around Throop Ave and Kosciuszko St,
Brooklyn, aiming for the *feel* of GTA 5: lighting, material response, street density, driving feel,
living traffic, and a cinematic camera. No Rockstar assets, no Street View imagery; CC0 photo
textures, your own photos, and procedural generation only.

## Stages
- **Stage 0 (done):** sandbox v1, touch controls, PBR + photo packs, shadows/AO/bloom/sky, props, post effects, models, rigged-model hooks.
- **Stage 1 (this swarm):** lighting & reflection fixes, driving feel, traffic lights and AI, performance smoothing, menus/gamepad, storefront art, vehicle/people textures, block-face research, CC0 round 3, lighting targets.
- **Stage 2:** block-face-accurate buildings (from research + your Street View screenshots), missions, hosted high-fidelity build.
- **Stage 3:** characters and cars from rigged models you supply, audio pass, polish.

## Acceptance for Stage 1
- Light/reflection: no blown highlights at any hour at exposure 1.0; glass and paint reflect the sky plausibly; sidewalks matte; night streets readable; no shadow acne on stoops; no bloom haze on the sky.
- Driving: 0–100 km/h ≈ 6 s sedan; stable at speed; drift on handbrake; parked cars can be nudged; collisions damp without jitter.
- Traffic: signals at the 6 avenue intersections; vehicles stop on red, go on green; peds cross on walk; no gridlock in 5 minutes of simulation.
- Performance: 60 fps on a mid laptop at medium (measured by the fps overlay); no per-frame allocations in hot loops; loading screen with progress; render interpolation.
- UI: pause menu with quality/volume/controls; gamepad works; position persists.
- Textures: storefront art and vehicle/people maps land without raising the artifact above 12 MB.
