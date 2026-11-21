# LOOK: lighting and look development (Stoop Light)

Lane: LOOK (lighting and look-development lead). Brief: docs/swarm/art/DIRECTION.md. Status: started 21 Nov 2026.

## Plan (in order)
1. Baseline frames of the signature views (before). 2. Afternoon: sun, sky, haze, ambient, shadows; 17:30 is the start hour
(already `LIGHTING.startHour = 17.5` and `DayNight DEFAULT_START_HOUR = 17.5`). 3. One grade for all tiers (the per-hour 3D LUT in
`src/render/lut.ts`, already used by phone too). 4. Night. 5. Overcast and rain. 6. Camera proposal (numbers only).

## Findings from the old frames (surfaces4 baseline at low, 17:30 and 22:00, row view) and the code
- 17:30: deep saturated blue sky gradient, not haze; near-black road; strong blue shadows; saturated red brick. Nothing warm
  reaches the shadows or the distance. The grade LUT BOOSTED saturation (golden 1.26, noon 1.27) where DIRECTION wants it down.
- 22:00: black sky with bright white stars, navy road, no readable sodium pools, bright blue ambient (hemi 4.4, moon 2.7)
  so there is no dark between lamps; sidewalks saturated blue; pink windows.
- Start hour is already 17.5 (`LIGHTING.startHour`, passed by main.ts line 175): nothing to change in main.ts.
- Camera on foot already is fov 64, distance 3.2, height 1.55 (CAM_FOOT); car fov 70 to 82.

## Changes (updated as I go)
- `src/render/lut.ts` (the one grade, baked per hour into a 3D LUT, used by every tier incl. phone): saturation 0.9 to 0.95
  (was 1.15 to 1.27), S-curve 0.26 to 0.34 (was 0.32 to 0.44), blacks lifted 0.02 to 0.036 and TINTED to the haze colour of
  the hour (`liftTint`, new), shadows blue-teal, highlights amber, soft chroma cap (knee 0.42, greens knee 0.16 and pushed to
  olive). Phone grade offsets reduced (saturation x1.02, was x1.07) so phone = same colour result.
- `src/render/SkyDome.ts`: horizon/fog colour keys (night dark blue-grey city glow, golden-hour dust haze, pale blue noon),
  hazier Preetham keys 12:00 to 18:30, wider haze band, stars at 40 percent strength and smaller.
- `src/render/LightingConfig.ts`: night ambient halved (hemi 4.4 to 2.5, moon 2.7 to 1.5, greyer blue), golden hour sun
  stronger and warmer, skylight greyer, fog closer at 17:00 and 18:00.
- `src/render/NightLights.ts`: lamp colour sodium 0xffa44f, 70 cd (was 0xffcf8a, 45 cd).
- test: tests/unit/render/art-grade.test.ts pinned the OLD boosted saturation (>= 1.22) and curve (>= 0.3); changed on purpose
  to the Stoop Light numbers and a chroma-cap test added.

## Before and after frames
Scratch: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/look/{before,after}
Note: other lanes edit textures in the same tree, so before (dist-before) and after (dist-a*) also differ by their work.

## Left to do / still breaks the picture
(to fill)
